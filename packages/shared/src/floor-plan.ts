import { z } from 'zod';
import { FloorObjectKind, TableShape } from './enums.js';

/**
 * Canonical floor-plan geometry. The 2D blueprint and the 3D scene are both pure
 * functions of this structure; neither view stores its own copy of positions.
 *
 * Units: centimetres. Origin: top-left corner of the floor, +x right, +y "down"
 * on the blueprint (maps to +z in 3D). Rotation: degrees clockwise around the
 * element's centre.
 */
const geometry = {
  x: z.number().min(0).max(100_000),
  y: z.number().min(0).max(100_000),
  width: z.number().positive().max(10_000),
  depth: z.number().positive().max(10_000),
  rotation: z.number().min(-360).max(360).default(0),
};

export const floorTableSchema = z.object({
  id: z.uuid().optional(),
  clientKey: z.string().max(64).optional(),
  label: z.string().trim().min(1).max(40),
  shape: z.enum(Object.values(TableShape) as [TableShape, ...TableShape[]]),
  capacity: z.int().min(1).max(50),
  zone: z.string().trim().max(60).nullish(),
  isReservable: z.boolean().default(true),
  isActive: z.boolean().default(true),
  ...geometry,
});
export type FloorTable = z.infer<typeof floorTableSchema>;

export const floorObjectSchema = z.object({
  id: z.uuid().optional(),
  kind: z.enum(Object.values(FloorObjectKind) as [FloorObjectKind, ...FloorObjectKind[]]),
  label: z.string().trim().max(60).nullish(),
  height: z.number().positive().max(2_000).nullish(),
  ...geometry,
});
export type FloorObject = z.infer<typeof floorObjectSchema>;

export const saveLayoutSchema = z.object({
  /** Optimistic concurrency: must equal the stored version. */
  expectedVersion: z.int().min(0),
  name: z.string().trim().min(1).max(60),
  widthCm: z.number().positive().max(100_000),
  depthCm: z.number().positive().max(100_000),
  tables: z.array(floorTableSchema).max(500),
  objects: z.array(floorObjectSchema).max(2_000),
});
export type SaveLayoutInput = z.infer<typeof saveLayoutSchema>;

/** Work-in-progress layout kept on the server; never shown to guests until saved for real. */
export const saveDraftSchema = saveLayoutSchema.omit({ expectedVersion: true }).extend({ baseVersion: z.int().min(0) });
export type FloorPlanDraft = z.infer<typeof saveDraftSchema>;

export const DEFAULT_OBJECT_HEIGHT_CM: Record<FloorObjectKind, number> = {
  WALL: 300, DOOR: 210, WINDOW: 140, PILLAR: 300, BAR: 110, KITCHEN: 300,
  RESTROOM: 300, STAGE: 40, PLANT: 120, ENTRANCE: 230, SCREEN: 260, TV: 160, OTHER: 100,
};
export const TABLE_HEIGHT_CM = 75;

/** Axis-aligned bounding box after rotation; shared by editor hit-testing and validation. */
export function rotatedBounds(g: { x: number; y: number; width: number; depth: number; rotation?: number }) {
  const r = ((g.rotation ?? 0) * Math.PI) / 180;
  const cos = Math.abs(Math.cos(r));
  const sin = Math.abs(Math.sin(r));
  const w = g.width * cos + g.depth * sin;
  const d = g.width * sin + g.depth * cos;
  const cx = g.x + g.width / 2;
  const cy = g.y + g.depth / 2;
  return { minX: cx - w / 2, minY: cy - d / 2, maxX: cx + w / 2, maxY: cy + d / 2 };
}
