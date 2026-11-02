import { HttpStatus, Injectable } from '@nestjs/common';
import QRCode from 'qrcode';
import {
  ErrorCode, RealtimeEvent, rotatedBounds,
  type FloorPlanDraft, type FloorPlanView, type QrCodeView, type SaveLayoutInput, type TableDetailView, type TableInput, type TableListItem, type TableStatus,
} from '@servebell/shared';
import { PrismaService } from '../common/prisma/prisma.service.js';
import { AppError, Errors } from '../common/errors.js';
import { fileUrl } from '../common/files.js';
import { randomToken } from '../common/crypto.js';
import { AppConfig } from '../config/config.module.js';
import { AuditService } from '../audit/audit.service.js';
import { RealtimeService } from '../realtime/realtime.service.js';
import { Prisma } from '../generated/prisma/client.js';

type Actor = { userId: string; restaurantId: string };
const planInclude = {
  tables: { where: { deletedAt: null }, orderBy: { label: 'asc' }, include: { images: { orderBy: { sortOrder: 'asc' }, include: { file: true } } } },
  objects: true,
  reference: { select: { storageKey: true } },
} satisfies Prisma.FloorPlanInclude;
type PlanRow = Prisma.FloorPlanGetPayload<{ include: typeof planInclude }>;

/**
 * Single source of truth for restaurant geometry. The 2D blueprint and the 3D
 * scene in the apps are both rendered from FloorPlanView — never stored twice.
 */
@Injectable()
export class FloorPlansService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfig,
    private readonly audit: AuditService,
    private readonly realtime: RealtimeService,
  ) {}

  /** Live table status: occupied (active visit) > reserved (booking overlapping the next hour) > available. */
  async tableStatuses(restaurantId: string, tableIds: string[], at = new Date()): Promise<Map<string, TableStatus>> {
    const soon = new Date(at.getTime() + 60 * 60_000);
    const [visits, bookings] = await Promise.all([
      this.prisma.restaurantVisit.findMany({ where: { restaurantId, tableId: { in: tableIds }, status: 'ACTIVE', expiresAt: { gt: at } }, select: { tableId: true } }),
      this.prisma.reservation.findMany({ where: { restaurantId, tableId: { in: tableIds }, status: { in: ['PENDING', 'CONFIRMED'] }, startsAt: { lt: soon }, endsAt: { gt: at } }, select: { tableId: true } }),
    ]);
    const occupied = new Set(visits.map((v) => v.tableId));
    const reserved = new Set(bookings.map((b) => b.tableId));
    return new Map(tableIds.map((id) => [id, occupied.has(id) ? 'OCCUPIED' : reserved.has(id) ? 'RESERVED' : 'AVAILABLE']));
  }

  private async toView(p: PlanRow, staff = false): Promise<FloorPlanView> {
    const statuses = await this.tableStatuses(p.restaurantId, p.tables.map((t) => t.id));
    return {
      id: p.id, restaurantId: p.restaurantId, name: p.name, widthCm: p.widthCm, depthCm: p.depthCm, status: p.status, version: p.version, publishedAt: p.publishedAt?.toISOString() ?? null,
      referenceUrl: p.reference ? fileUrl(p.reference.storageKey) : null,
      tables: p.tables.map((t) => ({
        id: t.id, label: t.label, shape: t.shape, capacity: t.capacity, zone: t.zone, x: t.x, y: t.y, width: t.width, depth: t.depth, rotation: t.rotation, isReservable: t.isReservable, isActive: t.isActive,
        status: t.isActive ? (statuses.get(t.id) ?? 'AVAILABLE') : 'UNAVAILABLE',
        imageUrls: t.images.map((i) => fileUrl(i.file.storageKey)),
        imageFileIds: t.images.map((i) => i.fileId),
        description: t.description,
        features: t.features,
      })),
      objects: p.objects.map((o) => ({ id: o.id, kind: o.kind, label: o.label, x: o.x, y: o.y, width: o.width, depth: o.depth, height: o.height, rotation: o.rotation })),
      ...(staff ? { draft: (p.draft as FloorPlanDraft | null) ?? null, draftSavedAt: p.draftSavedAt?.toISOString() ?? null } : {}),
    };
  }

  private async restaurantId(idOrSlug: string) {
    const isUuid = /^[0-9a-f-]{36}$/i.test(idOrSlug);
    const r = await this.prisma.restaurant.findFirst({ where: { ...(isUuid ? { id: idOrSlug } : { slug: idOrSlug }), status: 'ACTIVE', deletedAt: null }, select: { id: true } });
    if (!r) throw Errors.notFound('Restaurant');
    return r.id;
  }

  async publicPlans(idOrSlug: string) {
    const rid = await this.restaurantId(idOrSlug);
    const plans = await this.prisma.floorPlan.findMany({ where: { restaurantId: rid, status: 'PUBLISHED' }, include: planInclude, orderBy: { sortOrder: 'asc' } });
    return Promise.all(plans.map((p) => this.toView(p)));
  }

  async managePlans(restaurantId: string) {
    const plans = await this.prisma.floorPlan.findMany({ where: { restaurantId, status: { not: 'ARCHIVED' } }, include: planInclude, orderBy: { sortOrder: 'asc' } });
    return Promise.all(plans.map((p) => this.toView(p, true)));
  }

  async create(a: Actor, input: { name: string; widthCm: number; depthCm: number }) {
    const count = await this.prisma.floorPlan.count({ where: { restaurantId: a.restaurantId } });
    const p = await this.prisma.floorPlan.create({ data: { ...input, restaurantId: a.restaurantId, sortOrder: count }, include: planInclude });
    await this.audit.record({ action: 'floorplan.created', entityType: 'FloorPlan', entityId: p.id, actorUserId: a.userId, restaurantId: a.restaurantId });
    return this.toView(p);
  }

  /** Saves the whole layout atomically with optimistic concurrency on `version`. */
  async save(a: Actor, planId: string, input: SaveLayoutInput) {
    const plan = await this.prisma.floorPlan.findFirst({ where: { id: planId, restaurantId: a.restaurantId }, include: { tables: { where: { deletedAt: null }, select: { id: true } } } });
    if (!plan) throw Errors.notFound('Floor plan');

    const labels = new Set<string>();
    for (const el of [...input.tables, ...input.objects]) {
      const b = rotatedBounds(el);
      if (b.minX < -1 || b.minY < -1 || b.maxX > input.widthCm + 1 || b.maxY > input.depthCm + 1) {
        throw Errors.badRequest(`${'label' in el && el.label ? el.label : 'An element'} is outside the room`);
      }
    }
    for (const t of input.tables) {
      const key = t.label.toLowerCase();
      if (labels.has(key)) throw Errors.badRequest(`Table name "${t.label}" is used twice`);
      labels.add(key);
    }
    const existingIds = new Set(plan.tables.map((t) => t.id));
    // Tables created from the simple list (no plan yet) can be placed on this plan.
    const candidates = input.tables.filter((t) => t.id && !existingIds.has(t.id)).map((t) => t.id!);
    const adoptable = new Set(
      candidates.length ? (await this.prisma.restaurantTable.findMany({ where: { id: { in: candidates }, restaurantId: a.restaurantId, floorPlanId: null, deletedAt: null }, select: { id: true } })).map((t) => t.id) : [],
    );
    const unknown = input.tables.find((t) => t.id && !existingIds.has(t.id) && !adoptable.has(t.id));
    if (unknown) throw Errors.badRequest(`Table ${unknown.label} does not belong to this floor plan`);
    const keep = new Set(input.tables.filter((t) => t.id).map((t) => t.id!));
    const removed = [...existingIds].filter((id) => !keep.has(id));

    await this.prisma.$transaction(async (tx) => {
      const others = await tx.restaurantTable.findMany({ where: { restaurantId: a.restaurantId, deletedAt: null, id: { notIn: [...existingIds, ...adoptable] } }, select: { label: true } });
      const clash = input.tables.find((t) => others.some((o) => o.label.toLowerCase() === t.label.toLowerCase()));
      if (clash) throw Errors.conflict(`Table name "${clash.label}" is already used on another floor or in your table list`);
      const bumped = await tx.floorPlan.updateMany({
        where: { id: planId, version: input.expectedVersion },
        // Saving for real supersedes any draft.
        data: { version: { increment: 1 }, name: input.name, widthCm: input.widthCm, depthCm: input.depthCm, draft: Prisma.DbNull, draftSavedAt: null },
      });
      if (bumped.count !== 1) throw new AppError(ErrorCode.STALE_VERSION, 'This layout was changed by someone else. Reload and try again.', HttpStatus.CONFLICT);

      if (removed.length) {
        // Free labels first so a removed table's name can be reused in the same save.
        await tx.restaurantTable.updateMany({ where: { id: { in: removed } }, data: { deletedAt: new Date(), isActive: false, label: `deleted-${Date.now()}` } });
        await tx.tableQrCode.updateMany({ where: { tableId: { in: removed }, status: 'ACTIVE' }, data: { status: 'REVOKED', revokedAt: new Date() } });
      }
      // Two-phase rename avoids transient unique-label clashes when tables swap names.
      for (const t of input.tables.filter((x) => x.id)) await tx.restaurantTable.update({ where: { id: t.id! }, data: { label: `tmp-${t.id}` } });
      for (const t of input.tables) {
        const data = { label: t.label, shape: t.shape, capacity: t.capacity, zone: t.zone ?? null, x: t.x, y: t.y, width: t.width, depth: t.depth, rotation: t.rotation, isReservable: t.isReservable, isActive: t.isActive };
        if (t.id) await tx.restaurantTable.update({ where: { id: t.id }, data: { ...data, floorPlanId: planId } });
        else {
          const created = await tx.restaurantTable.create({ data: { ...data, restaurantId: a.restaurantId, floorPlanId: planId } });
          await tx.tableQrCode.create({ data: { restaurantId: a.restaurantId, tableId: created.id, version: 1, token: randomToken() } });
        }
      }
      await tx.floorPlanObject.deleteMany({ where: { floorPlanId: planId } });
      if (input.objects.length) {
        await tx.floorPlanObject.createMany({ data: input.objects.map((o) => ({ ...(o.id ? { id: o.id } : {}), floorPlanId: planId, kind: o.kind, label: o.label ?? null, x: o.x, y: o.y, width: o.width, depth: o.depth, height: o.height ?? null, rotation: o.rotation })) });
      }
    });
    await this.audit.record({ action: 'floorplan.saved', entityType: 'FloorPlan', entityId: planId, actorUserId: a.userId, restaurantId: a.restaurantId, meta: { tables: input.tables.length, objects: input.objects.length, removed: removed.length } });
    const view = await this.toView(await this.prisma.floorPlan.findUniqueOrThrow({ where: { id: planId }, include: planInclude }), true);
    this.realtime.toStaff(a.restaurantId, RealtimeEvent.LAYOUT_UPDATED, { floorPlanId: planId, version: view.version });
    return view;
  }

  /** Stores work in progress without touching the live layout (guests never see it). */
  async saveDraft(a: Actor, planId: string, draft: FloorPlanDraft) {
    const res = await this.prisma.floorPlan.updateMany({ where: { id: planId, restaurantId: a.restaurantId }, data: { draft: draft as unknown as Prisma.InputJsonValue, draftSavedAt: new Date() } });
    if (res.count !== 1) throw Errors.notFound('Floor plan');
    return { draftSavedAt: new Date().toISOString() };
  }

  async discardDraft(a: Actor, planId: string) {
    const res = await this.prisma.floorPlan.updateMany({ where: { id: planId, restaurantId: a.restaurantId }, data: { draft: Prisma.DbNull, draftSavedAt: null } });
    if (res.count !== 1) throw Errors.notFound('Floor plan');
  }

  async setPublished(a: Actor, planId: string, publish: boolean) {
    const plan = await this.prisma.floorPlan.findFirst({ where: { id: planId, restaurantId: a.restaurantId }, include: { _count: { select: { tables: { where: { deletedAt: null } } } } } });
    if (!plan) throw Errors.notFound('Floor plan');
    if (publish && plan._count.tables === 0) throw Errors.badRequest('Add at least one table before publishing');
    await this.prisma.floorPlan.update({ where: { id: planId }, data: { status: publish ? 'PUBLISHED' : 'DRAFT', publishedAt: publish ? new Date() : plan.publishedAt } });
    await this.audit.record({ action: publish ? 'floorplan.published' : 'floorplan.unpublished', entityType: 'FloorPlan', entityId: planId, actorUserId: a.userId, restaurantId: a.restaurantId });
    return this.toView(await this.prisma.floorPlan.findUniqueOrThrow({ where: { id: planId }, include: planInclude }));
  }

  async setReference(a: Actor, planId: string, fileId: string | null) {
    const plan = await this.prisma.floorPlan.findFirst({ where: { id: planId, restaurantId: a.restaurantId }, select: { id: true } });
    if (!plan) throw Errors.notFound('Floor plan');
    if (fileId) {
      const f = await this.prisma.fileObject.findFirst({ where: { id: fileId, restaurantId: a.restaurantId, status: 'READY' }, select: { id: true } });
      if (!f) throw Errors.badRequest('Image not found for this restaurant');
    }
    const p = await this.prisma.floorPlan.update({ where: { id: planId }, data: { referenceFileId: fileId }, include: planInclude });
    return this.toView(p);
  }

  async tableDetail(idOrSlug: string, tableId: string): Promise<TableDetailView> {
    const rid = await this.restaurantId(idOrSlug);
    const t = await this.prisma.restaurantTable.findFirst({
      where: { id: tableId, restaurantId: rid, deletedAt: null },
      include: { images: { orderBy: { sortOrder: 'asc' }, include: { file: true } }, floorPlan: { include: { objects: true } }, restaurant: { select: { id: true, slug: true, name: true, timezone: true } } },
    });
    if (!t) throw Errors.notFound('Table');
    const status = t.isActive ? ((await this.tableStatuses(rid, [t.id])).get(t.id) ?? 'AVAILABLE') : 'UNAVAILABLE';
    const cx = t.x + t.width / 2;
    const cy = t.y + t.depth / 2;
    const nearby = (t.floorPlan?.objects ?? [])
      .filter((o) => o.kind !== 'WALL')
      .map((o) => ({ kind: o.kind, label: o.label, distanceM: Math.round(Math.hypot(o.x + o.width / 2 - cx, o.y + o.depth / 2 - cy) / 10) / 10 }))
      .filter((o) => o.distanceM <= 5)
      .sort((a, b) => a.distanceM - b.distanceM)
      .slice(0, 4);
    return {
      id: t.id, label: t.label, shape: t.shape, capacity: t.capacity, zone: t.zone, description: t.description, features: t.features, isReservable: t.isReservable,
      status, imageUrls: t.images.map((i) => fileUrl(i.file.storageKey)), floorPlanName: t.floorPlan?.name ?? null, restaurant: t.restaurant, nearby,
    };
  }

  async updateTableDetails(a: Actor, tableId: string, input: { description?: string | null; features?: string[]; imageFileIds?: string[] }) {
    const t = await this.prisma.restaurantTable.findFirst({ where: { id: tableId, restaurantId: a.restaurantId, deletedAt: null } });
    if (!t) throw Errors.notFound('Table');
    if (input.imageFileIds?.length) {
      const ok = await this.prisma.fileObject.count({ where: { id: { in: input.imageFileIds }, restaurantId: a.restaurantId, status: 'READY' } });
      if (ok !== input.imageFileIds.length) throw Errors.badRequest('Image not found for this restaurant');
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.restaurantTable.update({ where: { id: tableId }, data: { description: input.description, features: input.features } });
      if (input.imageFileIds) {
        await tx.tableImage.deleteMany({ where: { tableId } });
        await tx.tableImage.createMany({ data: input.imageFileIds.map((fileId, sortOrder) => ({ tableId, fileId, sortOrder })) });
      }
    });
    const r = await this.prisma.restaurant.findUniqueOrThrow({ where: { id: a.restaurantId }, select: { slug: true, status: true } });
    return r.status === 'ACTIVE' ? this.tableDetail(r.slug, tableId) : { id: tableId };
  }

  // ── Simple tables: work without drawing a floor plan ──
  async listTables(restaurantId: string): Promise<TableListItem[]> {
    const rows = await this.prisma.restaurantTable.findMany({ where: { restaurantId, deletedAt: null }, orderBy: { label: 'asc' }, include: { floorPlan: { select: { name: true } } } });
    const statuses = await this.tableStatuses(restaurantId, rows.map((t) => t.id));
    return rows.map((t) => ({
      id: t.id, label: t.label, capacity: t.capacity, shape: t.shape, zone: t.zone, isReservable: t.isReservable, isActive: t.isActive,
      floorPlanId: t.floorPlanId, floorPlanName: t.floorPlan?.name ?? null, status: t.isActive ? (statuses.get(t.id) ?? 'AVAILABLE') : 'UNAVAILABLE',
    }));
  }

  private async assertLabelFree(restaurantId: string, label: string, exceptId?: string) {
    const clash = await this.prisma.restaurantTable.findFirst({ where: { restaurantId, deletedAt: null, label: { equals: label, mode: 'insensitive' }, ...(exceptId ? { id: { not: exceptId } } : {}) }, select: { id: true } });
    if (clash) throw Errors.conflict(`A table named "${label}" already exists`);
  }

  /** Tables created here have no position; they get a QR code straight away. */
  async createTable(a: Actor, input: TableInput) {
    await this.assertLabelFree(a.restaurantId, input.label);
    const t = await this.prisma.$transaction(async (tx) => {
      const size = input.shape === 'RECTANGLE' ? { width: 180, depth: 90 } : { width: 90, depth: 90 };
      const created = await tx.restaurantTable.create({ data: { ...input, zone: input.zone ?? null, ...size, restaurantId: a.restaurantId } });
      await tx.tableQrCode.create({ data: { restaurantId: a.restaurantId, tableId: created.id, version: 1, token: randomToken() } });
      return created;
    });
    await this.audit.record({ action: 'table.created', entityType: 'RestaurantTable', entityId: t.id, actorUserId: a.userId, restaurantId: a.restaurantId });
    return (await this.listTables(a.restaurantId)).find((x) => x.id === t.id)!;
  }

  async updateTable(a: Actor, tableId: string, input: TableInput) {
    const t = await this.prisma.restaurantTable.findFirst({ where: { id: tableId, restaurantId: a.restaurantId, deletedAt: null }, select: { id: true } });
    if (!t) throw Errors.notFound('Table');
    await this.assertLabelFree(a.restaurantId, input.label, tableId);
    await this.prisma.restaurantTable.update({ where: { id: tableId }, data: { ...input, zone: input.zone ?? null } });
    return (await this.listTables(a.restaurantId)).find((x) => x.id === tableId)!;
  }

  async deleteTable(a: Actor, tableId: string) {
    const res = await this.prisma.restaurantTable.updateMany({ where: { id: tableId, restaurantId: a.restaurantId, deletedAt: null }, data: { deletedAt: new Date(), isActive: false, label: `deleted-${Date.now()}` } });
    if (res.count !== 1) throw Errors.notFound('Table');
    await this.prisma.tableQrCode.updateMany({ where: { tableId, status: 'ACTIVE' }, data: { status: 'REVOKED', revokedAt: new Date() } });
    await this.audit.record({ action: 'table.deleted', entityType: 'RestaurantTable', entityId: tableId, actorUserId: a.userId, restaurantId: a.restaurantId });
  }

  // ── QR codes ──
  qrUrl(token: string) {
    return `${this.config.env.PUBLIC_WEB_URL.replace(/\/$/, '')}/t/${token}`;
  }

  async listQr(restaurantId: string): Promise<QrCodeView[]> {
    const tables = await this.prisma.restaurantTable.findMany({ where: { restaurantId, deletedAt: null }, orderBy: { label: 'asc' }, include: { qrCodes: { where: { status: 'ACTIVE' }, take: 1 } } });
    return Promise.all(
      tables.map(async (t) => {
        const q = t.qrCodes[0];
        const url = q ? this.qrUrl(q.token) : null;
        return { tableId: t.id, tableLabel: t.label, zone: t.zone, qrId: q?.id ?? null, version: q?.version ?? null, url, svg: url ? await QRCode.toString(url, { type: 'svg', margin: 1 }) : null, status: q ? 'ACTIVE' : 'NONE' };
      }),
    );
  }

  /** Printing a new code invalidates the old sticker immediately. */
  async regenerateQr(a: Actor, tableId: string) {
    const t = await this.prisma.restaurantTable.findFirst({ where: { id: tableId, restaurantId: a.restaurantId, deletedAt: null } });
    if (!t) throw Errors.notFound('Table');
    await this.prisma.$transaction(async (tx) => {
      const last = await tx.tableQrCode.findFirst({ where: { tableId }, orderBy: { version: 'desc' }, select: { version: true } });
      await tx.tableQrCode.updateMany({ where: { tableId, status: 'ACTIVE' }, data: { status: 'REVOKED', revokedAt: new Date() } });
      await tx.tableQrCode.create({ data: { restaurantId: a.restaurantId, tableId, version: (last?.version ?? 0) + 1, token: randomToken() } });
    });
    await this.audit.record({ action: 'qr.regenerated', entityType: 'RestaurantTable', entityId: tableId, actorUserId: a.userId, restaurantId: a.restaurantId });
    return (await this.listQr(a.restaurantId)).find((q) => q.tableId === tableId)!;
  }

  async deactivateQr(a: Actor, tableId: string) {
    const res = await this.prisma.tableQrCode.updateMany({ where: { tableId, restaurantId: a.restaurantId, status: 'ACTIVE' }, data: { status: 'REVOKED', revokedAt: new Date() } });
    if (res.count === 0) throw Errors.notFound('Active QR code');
    await this.audit.record({ action: 'qr.deactivated', entityType: 'RestaurantTable', entityId: tableId, actorUserId: a.userId, restaurantId: a.restaurantId });
  }

  async printSheet(restaurantId: string, tableIds?: string[]) {
    const r = await this.prisma.restaurant.findUniqueOrThrow({ where: { id: restaurantId }, select: { name: true } });
    const codes = (await this.listQr(restaurantId)).filter((q) => q.svg && (!tableIds?.length || tableIds.includes(q.tableId)));
    const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
    const cards = codes
      .map((q) => `<div class="card"><div class="brand">🛎 ServeBell</div>${q.svg}<div class="table">Table ${esc(q.tableLabel)}</div><div class="hint">Scan to call your waiter, order &amp; pay</div><div class="r">${esc(r.name)}</div></div>`)
      .join('');
    return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(r.name)} — table QR codes</title><style>
      @page{margin:12mm}body{font-family:-apple-system,Helvetica,Arial,sans-serif;margin:0}
      .grid{display:grid;grid-template-columns:repeat(2,1fr);gap:10mm}
      .card{border:1.5px solid #1F5FF2;border-radius:6mm;padding:6mm;text-align:center;page-break-inside:avoid}
      .card svg{width:60mm;height:60mm}.brand{font-weight:700;color:#1F5FF2;margin-bottom:2mm}
      .table{font-size:20pt;font-weight:800;margin-top:2mm}.hint{font-size:9pt;color:#55627D}.r{font-size:9pt;margin-top:1mm}
    </style></head><body><div class="grid">${cards}</div></body></html>`;
  }
}
