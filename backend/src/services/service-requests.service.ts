import { HttpStatus, Injectable } from '@nestjs/common';
import {
  ErrorCode,
  hasPermission,
  OPEN_SERVICE_STATUSES,
  Permission,
  RealtimeEvent,
  type CreateServiceRequestInput,
  type Page,
  type RestaurantRole,
  type ServiceRequestView,
  type StaffServiceQuery,
  type StaffServiceStats,
} from '@servebell/shared';
import { PrismaService } from '../common/prisma/prisma.service.js';
import { AppError, Errors } from '../common/errors.js';
import { RealtimeService } from '../realtime/realtime.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { VisitsService } from '../visits/visits.service.js';
import { localDayStart } from '../restaurants/opening-hours.js';
import { Prisma } from '../generated/prisma/client.js';
import { serviceInclude, toServiceDetail, toServiceView, type ServiceRow } from './service-request.mapper.js';

const MAX_OPEN_PER_VISIT = 10;

export interface StaffActor {
  userId: string;
  memberId: string;
  restaurantId: string;
  role: RestaurantRole;
}

const EVENT_FOR: Record<'ACCEPTED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED', { event: RealtimeEvent; type: 'ACCEPTED' | 'STARTED' | 'COMPLETED' | 'CANCELLED' }> = {
  ACCEPTED: { event: RealtimeEvent.SERVICE_ACCEPTED, type: 'ACCEPTED' },
  IN_PROGRESS: { event: RealtimeEvent.SERVICE_STARTED, type: 'STARTED' },
  COMPLETED: { event: RealtimeEvent.SERVICE_COMPLETED, type: 'COMPLETED' },
  CANCELLED: { event: RealtimeEvent.SERVICE_CANCELLED, type: 'CANCELLED' },
};

/**
 * The central service lifecycle. Every state change is one conditional UPDATE
 * (WHERE status = expected), so concurrent actors can never both succeed; the
 * audit event and system message are written in the same transaction, and
 * realtime/notifications are sent only after commit.
 */
@Injectable()
export class ServiceRequestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly visits: VisitsService,
    private readonly realtime: RealtimeService,
    private readonly notifications: NotificationsService,
  ) {}

  // ───────────── Customer ─────────────

  async create(customerId: string, input: CreateServiceRequestInput): Promise<ServiceRequestView & { duplicate: boolean }> {
    const prior = await this.prisma.serviceRequest.findUnique({
      where: { customerId_idempotencyKey: { customerId, idempotencyKey: input.idempotencyKey } },
      include: serviceInclude,
    });
    if (prior) return { ...toServiceView(prior), duplicate: true };

    const visit = await this.visits.requireActive(customerId);
    const type = await this.prisma.serviceType.findFirst({ where: { id: input.serviceTypeId, restaurantId: visit.restaurantId, isActive: true } });
    if (!type) throw Errors.notFound('Service');

    // Asking again for something already on its way returns the open request instead of spamming staff.
    const open = await this.prisma.serviceRequest.findFirst({
      where: { visitId: visit.id, serviceTypeId: type.id, status: { in: [...OPEN_SERVICE_STATUSES] } },
      include: serviceInclude,
    });
    if (open) return { ...toServiceView(open), duplicate: true };
    const openCount = await this.prisma.serviceRequest.count({ where: { visitId: visit.id, status: { in: [...OPEN_SERVICE_STATUSES] } } });
    if (openCount >= MAX_OPEN_PER_VISIT) throw Errors.conflict('You have several open requests. Please wait for the team to respond.');

    let row: ServiceRow;
    try {
      row = await this.prisma.$transaction(async (tx) => {
        const created = await tx.serviceRequest.create({
          data: {
            restaurantId: visit.restaurantId,
            tableId: visit.tableId,
            visitId: visit.id,
            customerId,
            serviceTypeId: type.id,
            quantity: input.quantity,
            note: input.note,
            idempotencyKey: input.idempotencyKey,
          },
          include: serviceInclude,
        });
        await tx.serviceRequestEvent.create({ data: { requestId: created.id, type: 'CREATED', toStatus: 'PENDING', actorUserId: customerId } });
        await tx.serviceMessage.create({
          data: { requestId: created.id, restaurantId: created.restaurantId, senderRole: 'SYSTEM', body: `${type.name} requested for table ${created.table.label}.` },
        });
        return created;
      });
    } catch (e) {
      // Two concurrent retries with the same idempotency key: return the winner.
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        const winner = await this.prisma.serviceRequest.findUniqueOrThrow({
          where: { customerId_idempotencyKey: { customerId, idempotencyKey: input.idempotencyKey } },
          include: serviceInclude,
        });
        return { ...toServiceView(winner), duplicate: true };
      }
      throw e;
    }

    const view = toServiceView(row);
    this.realtime.toStaffAndCustomer(row.restaurantId, customerId, RealtimeEvent.SERVICE_CREATED, view);
    await this.notifyStaff(row.restaurantId, {
      type: 'service.created',
      title: `Table ${row.table.label}: ${type.name}`,
      body: input.note ? `“${input.note}”` : `${row.customer.fullName} needs ${type.kind === 'WAITER' ? 'a waiter' : type.name.toLowerCase()}.`,
      dedupeKey: `service.created:${row.id}`,
      data: { serviceRequestId: row.id, restaurantId: row.restaurantId },
    });
    return { ...view, duplicate: false };
  }

  async listMine(customerId: string, active: boolean, cursor?: string, limit = 30): Promise<Page<ServiceRequestView>> {
    const offset = cursor ? Number.parseInt(cursor, 10) || 0 : 0;
    const rows = await this.prisma.serviceRequest.findMany({
      where: { customerId, ...(active ? { status: { in: [...OPEN_SERVICE_STATUSES] } } : {}) },
      include: { ...serviceInclude, messages: { orderBy: { createdAt: 'desc' }, take: 1, include: { sender: { select: { fullName: true } } } } },
      orderBy: { createdAt: 'desc' },
      skip: offset,
      take: limit + 1,
    });
    return {
      items: rows.slice(0, limit).map((r) => {
        const m = r.messages[0];
        return { ...toServiceView(r), lastMessage: m ? { body: m.body, senderRole: m.senderRole, senderName: m.sender?.fullName ?? null, createdAt: m.createdAt.toISOString() } : null };
      }),
      nextCursor: rows.length > limit ? String(offset + limit) : null,
    };
  }

  /** Customer (own request) or staff of the restaurant. */
  async detail(userId: string, id: string) {
    const r = await this.prisma.serviceRequest.findUnique({
      where: { id },
      include: { ...serviceInclude, events: { orderBy: { createdAt: 'asc' }, include: { actor: { select: { fullName: true } } } } },
    });
    if (!r) throw Errors.notFound('Request');
    if (r.customerId === userId) return toServiceDetail(r);
    const member = await this.activeMember(r.restaurantId, userId);
    if (!member || !hasPermission(member.role, Permission.SERVICES_HANDLE)) throw Errors.notFound('Request');
    const dismissed = await this.prisma.serviceDismissal.findUnique({ where: { requestId_memberId: { requestId: id, memberId: member.id } } });
    return toServiceDetail(r, { dismissedByMe: Boolean(dismissed) });
  }

  async cancelByCustomer(customerId: string, id: string, reason?: string) {
    return this.transition({
      where: { id, customerId, status: { in: ['PENDING', 'ACCEPTED'] } },
      to: 'CANCELLED',
      data: { cancelledAt: new Date(), cancelledByUserId: customerId, cancelReason: reason ?? 'Cancelled by customer' },
      actorUserId: customerId,
      message: 'The customer cancelled this request.',
      notify: 'staff',
    });
  }

  // ───────────── Staff ─────────────

  async listForStaff(actor: StaffActor, q: StaffServiceQuery): Promise<Page<ServiceRequestView>> {
    if (q.view === 'all' && !hasPermission(actor.role, Permission.SERVICES_MONITOR)) throw Errors.forbidden();
    const offset = q.cursor ? Number.parseInt(q.cursor, 10) || 0 : 0;
    const notDismissed = { dismissals: { none: { memberId: actor.memberId } } };
    const byView: Record<StaffServiceQuery['view'], Prisma.ServiceRequestWhereInput> = {
      pending: { status: 'PENDING', ...notDismissed },
      mine: { acceptedById: actor.memberId, status: { in: ['ACCEPTED', 'IN_PROGRESS'] } },
      // Waiting on someone else: accepted by colleagues, or pending ones I chose to wait on.
      others: { OR: [{ status: { in: ['ACCEPTED', 'IN_PROGRESS'] }, acceptedById: { not: actor.memberId } }, { status: 'PENDING', dismissals: { some: { memberId: actor.memberId } } }] },
      done: { status: { in: ['COMPLETED', 'CANCELLED'] }, ...(hasPermission(actor.role, Permission.SERVICES_MONITOR) ? {} : { OR: [{ acceptedById: actor.memberId }, { completedById: actor.memberId }] }) },
      all: {},
    };
    const where: Prisma.ServiceRequestWhereInput = {
      restaurantId: actor.restaurantId,
      AND: [
        byView[q.view],
        q.status ? { status: q.status } : {},
        q.tableId ? { tableId: q.tableId } : {},
        q.serviceTypeId ? { serviceTypeId: q.serviceTypeId } : {},
        q.assigneeId ? { acceptedById: q.assigneeId } : {},
        q.from || q.to ? { createdAt: { ...(q.from ? { gte: new Date(q.from) } : {}), ...(q.to ? { lt: new Date(q.to) } : {}) } } : {},
      ],
    };
    const rows = await this.prisma.serviceRequest.findMany({
      where,
      include: { ...serviceInclude, dismissals: { where: { memberId: actor.memberId }, select: { memberId: true } } },
      // The queue is first-come-first-served; history is newest first.
      orderBy: q.view === 'pending' ? [{ escalationLevel: 'desc' }, { createdAt: 'asc' }] : { createdAt: 'desc' },
      skip: offset,
      take: q.limit + 1,
    });
    return {
      items: rows.slice(0, q.limit).map((r) => toServiceView(r, { dismissedByMe: r.dismissals.length > 0 })),
      nextCursor: rows.length > q.limit ? String(offset + q.limit) : null,
    };
  }

  /** Atomic: exactly one staff member can accept a pending request. */
  async accept(actor: StaffActor, id: string) {
    const result = await this.transition({
      where: { id, restaurantId: actor.restaurantId, status: 'PENDING' },
      to: 'ACCEPTED',
      data: { acceptedAt: new Date(), acceptedById: actor.memberId },
      actorUserId: actor.userId,
      message: (r) => `${r.acceptedBy?.user.fullName ?? 'A team member'} is on the way.`,
      notify: 'customer',
      onMiss: async () => {
        const current = await this.prisma.serviceRequest.findFirst({ where: { id, restaurantId: actor.restaurantId }, include: serviceInclude });
        if (!current) return Errors.notFound('Request');
        if (current.status === 'ACCEPTED' || current.status === 'IN_PROGRESS') {
          return new AppError(ErrorCode.ALREADY_ACCEPTED, `${current.acceptedBy?.user.fullName ?? 'Another team member'} already accepted this request.`, HttpStatus.CONFLICT);
        }
        return new AppError(ErrorCode.INVALID_TRANSITION, `This request is already ${current.status.toLowerCase().replace('_', ' ')}.`, HttpStatus.CONFLICT);
      },
    });
    await this.prisma.serviceDismissal.deleteMany({ where: { requestId: id } });
    return result;
  }

  /** "Wait": hide from my queue only. The request stays PENDING for everyone else. */
  async wait(actor: StaffActor, id: string) {
    const r = await this.prisma.serviceRequest.findFirst({ where: { id, restaurantId: actor.restaurantId }, select: { status: true } });
    if (!r) throw Errors.notFound('Request');
    if (r.status !== 'PENDING') throw new AppError(ErrorCode.INVALID_TRANSITION, 'Only pending requests can be left for others.', HttpStatus.CONFLICT);
    await this.prisma.serviceDismissal.upsert({
      where: { requestId_memberId: { requestId: id, memberId: actor.memberId } },
      create: { requestId: id, memberId: actor.memberId },
      update: {},
    });
    return this.detail(actor.userId, id);
  }

  async start(actor: StaffActor, id: string) {
    return this.transition({
      where: { id, restaurantId: actor.restaurantId, status: 'ACCEPTED', ...this.assigneeScope(actor) },
      to: 'IN_PROGRESS',
      data: { startedAt: new Date() },
      actorUserId: actor.userId,
      notify: 'customer',
    });
  }

  async complete(actor: StaffActor, id: string) {
    return this.transition({
      where: { id, restaurantId: actor.restaurantId, status: { in: ['ACCEPTED', 'IN_PROGRESS'] }, ...this.assigneeScope(actor) },
      to: 'COMPLETED',
      data: { completedAt: new Date(), completedById: actor.memberId },
      actorUserId: actor.userId,
      message: 'Request completed. Enjoy your meal!',
      notify: 'customer',
    });
  }

  async cancelByStaff(actor: StaffActor, id: string, reason: string) {
    return this.transition({
      where: { id, restaurantId: actor.restaurantId, status: { in: [...OPEN_SERVICE_STATUSES] }, ...this.assigneeScope(actor, true) },
      to: 'CANCELLED',
      data: { cancelledAt: new Date(), cancelledByUserId: actor.userId, cancelReason: reason },
      actorUserId: actor.userId,
      message: `Cancelled by the restaurant: ${reason}`,
      notify: 'customer',
    });
  }

  async stats(actor: StaffActor): Promise<StaffServiceStats> {
    const tz = (await this.prisma.restaurant.findUniqueOrThrow({ where: { id: actor.restaurantId }, select: { timezone: true } })).timezone;
    const since = localDayStart(tz);
    const [pending, mineOpen, othersOpen, agg] = await Promise.all([
      this.prisma.serviceRequest.count({ where: { restaurantId: actor.restaurantId, status: 'PENDING', dismissals: { none: { memberId: actor.memberId } } } }),
      this.prisma.serviceRequest.count({ where: { restaurantId: actor.restaurantId, acceptedById: actor.memberId, status: { in: ['ACCEPTED', 'IN_PROGRESS'] } } }),
      this.prisma.serviceRequest.count({ where: { restaurantId: actor.restaurantId, status: { in: ['ACCEPTED', 'IN_PROGRESS'] }, acceptedById: { not: actor.memberId } } }),
      this.prisma.$queryRaw<{ completed: bigint; avg_accept: number | null; avg_complete: number | null }[]>`
        SELECT count(*) FILTER (WHERE "completedById" = ${actor.memberId}::uuid AND status = 'COMPLETED') AS completed,
               avg(EXTRACT(EPOCH FROM ("acceptedAt" - "createdAt")) * 1000) FILTER (WHERE "acceptedById" = ${actor.memberId}::uuid) AS avg_accept,
               avg(EXTRACT(EPOCH FROM ("completedAt" - "createdAt")) * 1000) FILTER (WHERE "completedById" = ${actor.memberId}::uuid AND status = 'COMPLETED') AS avg_complete
        FROM service_requests WHERE "restaurantId" = ${actor.restaurantId}::uuid AND "createdAt" >= ${since}`,
    ]);
    const a = agg[0]!;
    return {
      pending,
      mineOpen,
      othersOpen,
      completedToday: Number(a.completed),
      avgAcceptMs: a.avg_accept === null ? null : Math.round(Number(a.avg_accept)),
      avgCompleteMs: a.avg_complete === null ? null : Math.round(Number(a.avg_complete)),
    };
  }

  // ───────────── Internals ─────────────

  /** Waiters act only on their own requests; owners/admins may act on any. */
  private assigneeScope(actor: StaffActor, allowMonitor = true): { acceptedById?: string } {
    return allowMonitor && hasPermission(actor.role, Permission.SERVICES_MONITOR) ? {} : { acceptedById: actor.memberId };
  }

  private activeMember(restaurantId: string, userId: string) {
    return this.prisma.restaurantMember.findFirst({ where: { restaurantId, userId, status: 'ACTIVE' }, select: { id: true, role: true } });
  }

  private async transition(opts: {
    where: Prisma.ServiceRequestWhereInput & { id: string };
    to: 'ACCEPTED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
    data: Prisma.ServiceRequestUncheckedUpdateManyInput;
    actorUserId: string;
    message?: string | ((r: ServiceRow) => string);
    notify: 'customer' | 'staff';
    onMiss?: () => Promise<Error>;
  }) {
    const before = await this.prisma.serviceRequest.findUnique({ where: { id: opts.where.id }, select: { status: true } });
    const row = await this.prisma.$transaction(async (tx) => {
      const res = await tx.serviceRequest.updateMany({ where: opts.where, data: { ...opts.data, status: opts.to } });
      if (res.count !== 1) return null;
      const r = await tx.serviceRequest.findUniqueOrThrow({ where: { id: opts.where.id }, include: serviceInclude });
      await tx.serviceRequestEvent.create({
        data: { requestId: r.id, type: EVENT_FOR[opts.to].type, fromStatus: before?.status, toStatus: opts.to, actorUserId: opts.actorUserId },
      });
      if (opts.message) {
        await tx.serviceMessage.create({
          data: { requestId: r.id, restaurantId: r.restaurantId, senderRole: 'SYSTEM', body: typeof opts.message === 'function' ? opts.message(r) : opts.message },
        });
      }
      return r;
    });
    if (!row) {
      if (opts.onMiss) throw await opts.onMiss();
      const exists = await this.prisma.serviceRequest.findFirst({ where: { id: opts.where.id, ...('restaurantId' in opts.where ? { restaurantId: opts.where.restaurantId } : {}), ...('customerId' in opts.where ? { customerId: opts.where.customerId } : {}) }, select: { status: true } });
      if (!exists) throw Errors.notFound('Request');
      throw new AppError(ErrorCode.INVALID_TRANSITION, 'This action is no longer available for this request.', HttpStatus.CONFLICT);
    }

    const view = toServiceView(row);
    this.realtime.toStaffAndCustomer(row.restaurantId, row.customerId, EVENT_FOR[opts.to].event, view);
    const title = `${row.serviceType.name} · Table ${row.table.label}`;
    if (opts.notify === 'customer') {
      const body = {
        ACCEPTED: `${row.acceptedBy?.user.fullName ?? 'Your waiter'} accepted your request and is on the way.`,
        IN_PROGRESS: 'Your request is being taken care of.',
        COMPLETED: 'Your request has been completed.',
        CANCELLED: `The restaurant cancelled this request${row.cancelReason ? `: ${row.cancelReason}` : '.'}`,
      }[opts.to];
      await this.notifications.notify([row.customerId], { type: `service.${opts.to.toLowerCase()}`, title, body, app: 'CUSTOMER', restaurantId: row.restaurantId, dedupeKey: `service.${opts.to}:${row.id}`, data: { serviceRequestId: row.id } });
    } else {
      await this.notifyStaff(row.restaurantId, { type: 'service.cancelled', title, body: 'The customer cancelled this request.', dedupeKey: `service.CANCELLED:${row.id}`, data: { serviceRequestId: row.id, restaurantId: row.restaurantId } });
    }
    return view;
  }

  async notifyStaff(restaurantId: string, n: { type: string; title: string; body: string; dedupeKey: string; data: Record<string, string> }) {
    const members = await this.prisma.restaurantMember.findMany({ where: { restaurantId, status: 'ACTIVE' }, select: { userId: true, role: true } });
    const recipients = members.filter((m) => hasPermission(m.role, Permission.SERVICES_HANDLE)).map((m) => m.userId);
    await this.notifications.notify(recipients, { ...n, app: 'RESTAURANT', restaurantId });
  }
}
