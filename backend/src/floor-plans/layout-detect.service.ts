import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { z } from 'zod/v4';
import { ErrorCode, type DetectedLayout } from '@servebell/shared';
import { PrismaService } from '../common/prisma/prisma.service.js';
import { AppError, Errors } from '../common/errors.js';
import { fileUrl } from '../common/files.js';
import { AppConfig } from '../config/config.module.js';
import { UploadsService } from '../uploads/uploads.service.js';

/** What the model returns. Positions are % of the photographed room so they map onto any plan size. */
const visionSchema = z.object({
  roomWidthM: z.number().describe('Estimated room width in metres (left to right in the photo)'),
  roomDepthM: z.number().describe('Estimated room depth in metres (front to back)'),
  tables: z.array(z.object({
    shape: z.enum(['ROUND', 'SQUARE', 'RECTANGLE']),
    seats: z.number().int(),
    centerXPct: z.number().describe('Table centre, 0 = left wall, 100 = right wall'),
    centerYPct: z.number().describe('Table centre, 0 = far wall (top of plan), 100 = near wall'),
    widthCm: z.number(),
    depthCm: z.number(),
    rotationDeg: z.number().describe('Clockwise rotation, 0 or 90 for most tables'),
  })),
  landmarks: z.array(z.object({
    kind: z.enum(['ENTRANCE', 'BAR', 'KITCHEN', 'RESTROOM', 'WINDOW', 'DOOR', 'STAGE', 'PILLAR', 'PLANT']),
    centerXPct: z.number(),
    centerYPct: z.number(),
    widthPct: z.number(),
    depthPct: z.number(),
  })),
  notes: z.string().describe('One short sentence for the owner about anything uncertain'),
});

const PROMPT = `You are helping a restaurant owner draw a top-down floor plan from a photo of their dining room.
Identify every dining table you can see (estimate hidden ones only if clearly implied) and the landmarks: entrance, bar counter, kitchen or pass, restrooms, windows, doors, stage, pillars, large plants.
Map the photo onto a top-down plan: x runs left to right across the room, y runs from the far wall (0) to the camera (100). Correct for perspective - tables further away look smaller and closer together.
Use realistic sizes: a 2-seat table is about 70 cm, a 4-seat square about 90 cm, a 4-seat round about 100 cm across, a 6-seat rectangle about 180 x 90 cm.
Seats: count chairs around each table; if unclear, infer from table size.`;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Suggests a layout from a photo with Claude vision. The owner always reviews and saves it themselves. */
@Injectable()
export class LayoutDetectService {
  private readonly log = new Logger(LayoutDetectService.name);
  private readonly client: Anthropic | null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly uploads: UploadsService,
    config: AppConfig,
  ) {
    this.client = config.env.ANTHROPIC_API_KEY ? new Anthropic({ apiKey: config.env.ANTHROPIC_API_KEY, timeout: 90_000 }) : null;
    this.model = config.env.ANTHROPIC_MODEL;
  }
  private readonly model: string;

  get enabled() {
    return this.client !== null;
  }

  private async imageBytes(storageKey: string) {
    if (this.uploads.storage.read) return this.uploads.storage.read(storageKey);
    const res = await fetch(fileUrl(storageKey));
    if (!res.ok) throw Errors.badRequest('Could not read the photo');
    return Buffer.from(await res.arrayBuffer());
  }

  async detect(restaurantId: string, planId: string, fileId: string): Promise<DetectedLayout> {
    if (!this.client) throw new AppError(ErrorCode.SERVICE_UNAVAILABLE, 'Photo detection is not set up on this server yet. Use "Trace over a photo" or the table presets instead.', HttpStatus.SERVICE_UNAVAILABLE);
    const [plan, file] = await Promise.all([
      this.prisma.floorPlan.findFirst({ where: { id: planId, restaurantId }, select: { widthCm: true, depthCm: true } }),
      this.prisma.fileObject.findFirst({ where: { id: fileId, restaurantId, status: 'READY' }, select: { storageKey: true, mimeType: true } }),
    ]);
    if (!plan) throw Errors.notFound('Floor plan');
    if (!file) throw Errors.badRequest('Photo not found for this restaurant');
    const data = (await this.imageBytes(file.storageKey)).toString('base64');
    const media = (['image/jpeg', 'image/png', 'image/webp'] as const).find((m) => m === file.mimeType) ?? 'image/webp';

    let parsed: z.infer<typeof visionSchema> | null;
    try {
      const res = await this.client.beta.messages.parse({
        model: this.model,
        max_tokens: 16_000,
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        output_config: { effort: 'medium', format: betaZodOutputFormat(visionSchema) },
        messages: [{ role: 'user', content: [{ type: 'image', source: { type: 'base64', media_type: media, data } }, { type: 'text', text: PROMPT }] }],
      });
      if (res.stop_reason === 'refusal' || res.stop_reason === 'max_tokens') parsed = null;
      else parsed = res.parsed_output;
    } catch (e) {
      if (e instanceof Anthropic.RateLimitError) throw new AppError(ErrorCode.SERVICE_UNAVAILABLE, 'Photo detection is busy. Try again in a minute.', HttpStatus.SERVICE_UNAVAILABLE);
      if (e instanceof Anthropic.APIError) {
        this.log.error({ status: e.status, msg: e.message }, 'layout detection failed');
        throw new AppError(ErrorCode.SERVICE_UNAVAILABLE, 'Photo detection is unavailable right now.', HttpStatus.SERVICE_UNAVAILABLE);
      }
      throw e;
    }
    if (!parsed || !parsed.tables.length) throw Errors.badRequest('No tables were recognised. Try a wider photo taken from a corner, in good light.');

    // Keep the owner's room size; the model's estimate is offered as a suggestion.
    const W = plan.widthCm;
    const D = plan.depthCm;
    const tables = parsed.tables.slice(0, 120).map((t) => {
      const width = clamp(Math.round(t.widthCm / 5) * 5, 50, 400);
      const depth = t.shape === 'RECTANGLE' ? clamp(Math.round(t.depthCm / 5) * 5, 50, 300) : width;
      const cx = (clamp(t.centerXPct, 0, 100) / 100) * W;
      const cy = (clamp(t.centerYPct, 0, 100) / 100) * D;
      return {
        shape: t.shape, capacity: clamp(Math.round(t.seats), 1, 20), width, depth,
        rotation: Math.round(clamp(t.rotationDeg, -180, 180) / 15) * 15,
        x: Math.round(clamp(cx - width / 2, 0, W - width)), y: Math.round(clamp(cy - depth / 2, 0, D - depth)),
      };
    });
    const landmarks = parsed.landmarks.slice(0, 40).map((l) => {
      const width = clamp(Math.round(((l.widthPct / 100) * W) / 5) * 5, 30, W);
      const depth = clamp(Math.round(((l.depthPct / 100) * D) / 5) * 5, 15, D);
      return {
        kind: l.kind, width, depth, rotation: 0,
        x: Math.round(clamp((l.centerXPct / 100) * W - width / 2, 0, W - width)),
        y: Math.round(clamp((l.centerYPct / 100) * D - depth / 2, 0, D - depth)),
      };
    });
    return {
      tables, landmarks, notes: parsed.notes.slice(0, 300),
      suggestedRoom: { widthCm: clamp(Math.round(parsed.roomWidthM * 20) * 5, 300, 10_000), depthCm: clamp(Math.round(parsed.roomDepthM * 20) * 5, 300, 10_000) },
    };
  }
}
