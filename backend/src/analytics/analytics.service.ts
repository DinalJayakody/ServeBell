import { Injectable } from '@nestjs/common';
import type { AnalyticsQuery, AnalyticsSummary, EmployeeCard, EmployeeMetrics, MemberStatus, RestaurantRole } from '@servebell/shared';
import { PrismaService } from '../common/prisma/prisma.service.js';
import { Errors } from '../common/errors.js';
import { fileUrl } from '../common/files.js';
import { AuditService } from '../audit/audit.service.js';
import { localDayStart } from '../restaurants/opening-hours.js';
import { Prisma } from '../generated/prisma/client.js';

const ms = (v: unknown) => (v === null || v === undefined ? null : Math.round(Number(v)));

/** Metrics are always aggregated from stored server timestamps — nothing is hard-coded. */
@Injectable()
export class AnalyticsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private async range(restaurantId: string, q: { from?: string; to?: string }) {
    const r = await this.prisma.restaurant.findUniqueOrThrow({ where: { id: restaurantId }, select: { timezone: true, currency: true } });
    const from = q.from ? new Date(q.from) : localDayStart(r.timezone);
    const to = q.to ? new Date(q.to) : new Date(from.getTime() + 86_400_000);
    return { from, to, currency: r.currency, timezone: r.timezone };
  }

  async summary(restaurantId: string, q: AnalyticsQuery): Promise<AnalyticsSummary> {
    const { from, to, currency } = await this.range(restaurantId, q);
    const member = q.memberId ? Prisma.sql`AND sr."acceptedById" = ${q.memberId}::uuid` : Prisma.empty;
    const type = q.serviceTypeId ? Prisma.sql`AND sr."serviceTypeId" = ${q.serviceTypeId}::uuid` : Prisma.empty;
    const [svc] = await this.prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT count(*) AS total,
        count(*) FILTER (WHERE status = 'PENDING') AS pending, count(*) FILTER (WHERE status = 'ACCEPTED') AS accepted,
        count(*) FILTER (WHERE status = 'IN_PROGRESS') AS in_progress, count(*) FILTER (WHERE status = 'COMPLETED') AS completed,
        count(*) FILTER (WHERE status = 'CANCELLED') AS cancelled, count(*) FILTER (WHERE "escalationLevel" > 0) AS escalated,
        avg(EXTRACT(EPOCH FROM ("acceptedAt" - "createdAt")) * 1000) AS avg_accept,
        avg(EXTRACT(EPOCH FROM ("completedAt" - "createdAt")) * 1000) FILTER (WHERE status = 'COMPLETED') AS avg_complete
      FROM service_requests sr WHERE sr."restaurantId" = ${restaurantId}::uuid AND sr."createdAt" >= ${from} AND sr."createdAt" < ${to} ${member} ${type}`;
    const byType = await this.prisma.$queryRaw<{ id: string; name: string; count: bigint }[]>`
      SELECT st.id, st.name, count(*) AS count FROM service_requests sr JOIN service_types st ON st.id = sr."serviceTypeId"
      WHERE sr."restaurantId" = ${restaurantId}::uuid AND sr."createdAt" >= ${from} AND sr."createdAt" < ${to} ${member} ${type}
      GROUP BY st.id, st.name ORDER BY count DESC`;
    const [ord] = await this.prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT count(*) AS total, count(*) FILTER (WHERE status IN ('PENDING','ACCEPTED','PREPARING','READY')) AS pending,
        count(*) FILTER (WHERE status = 'DELIVERED') AS delivered, count(*) FILTER (WHERE status = 'CANCELLED') AS cancelled,
        coalesce(sum("totalCents") FILTER (WHERE status = 'DELIVERED'), 0) AS revenue
      FROM orders WHERE "restaurantId" = ${restaurantId}::uuid AND "createdAt" >= ${from} AND "createdAt" < ${to}`;
    const [res] = await this.prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT count(*) AS total, count(*) FILTER (WHERE status = 'PENDING') AS pending, count(*) FILTER (WHERE status = 'CONFIRMED') AS confirmed
      FROM reservations WHERE "restaurantId" = ${restaurantId}::uuid AND "startsAt" >= ${from} AND "startsAt" < ${to}`;
    const [emp] = await this.prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT count(*) FILTER (WHERE status <> 'REMOVED') AS total, count(*) FILTER (WHERE status = 'ACTIVE') AS active FROM restaurant_members WHERE "restaurantId" = ${restaurantId}::uuid`;
    const board = await this.metricsByMember(restaurantId, from, to, q.serviceTypeId);
    const members = await this.prisma.restaurantMember.findMany({ where: { restaurantId, status: { not: 'REMOVED' } }, include: { user: { select: { fullName: true } } } });
    return {
      range: { from: from.toISOString(), to: to.toISOString() },
      services: {
        total: Number(svc!.total), pending: Number(svc!.pending), accepted: Number(svc!.accepted), inProgress: Number(svc!.in_progress), completed: Number(svc!.completed),
        cancelled: Number(svc!.cancelled), escalated: Number(svc!.escalated), avgAcceptMs: ms(svc!.avg_accept), avgCompleteMs: ms(svc!.avg_complete),
      },
      byType: byType.map((b) => ({ serviceTypeId: b.id, name: b.name, count: Number(b.count) })),
      orders: { total: Number(ord!.total), pending: Number(ord!.pending), delivered: Number(ord!.delivered), cancelled: Number(ord!.cancelled), revenueCents: Number(ord!.revenue), currency },
      reservations: { total: Number(res!.total), pending: Number(res!.pending), confirmed: Number(res!.confirmed) },
      employees: { total: Number(emp!.total), active: Number(emp!.active) },
      leaderboard: members
        .filter((m) => !q.memberId || m.id === q.memberId)
        .map((m) => ({ memberId: m.id, fullName: m.user.fullName, employeeCode: m.employeeCode, ...(board.get(m.id) ?? EMPTY) }))
        .sort((a, b) => b.completed - a.completed || b.handled - a.handled),
    };
  }

  private async metricsByMember(restaurantId: string, from?: Date, to?: Date, serviceTypeId?: string) {
    const window = from && to ? Prisma.sql`AND sr."createdAt" >= ${from} AND sr."createdAt" < ${to}` : Prisma.empty;
    const type = serviceTypeId ? Prisma.sql`AND sr."serviceTypeId" = ${serviceTypeId}::uuid` : Prisma.empty;
    const rows = await this.prisma.$queryRaw<{ member: string; handled: bigint; completed: bigint; avg_accept: unknown; avg_complete: unknown }[]>`
      SELECT sr."acceptedById" AS member, count(*) AS handled, count(*) FILTER (WHERE sr.status = 'COMPLETED') AS completed,
        avg(EXTRACT(EPOCH FROM (sr."acceptedAt" - sr."createdAt")) * 1000) AS avg_accept,
        avg(EXTRACT(EPOCH FROM (sr."completedAt" - sr."createdAt")) * 1000) FILTER (WHERE sr.status = 'COMPLETED') AS avg_complete
      FROM service_requests sr WHERE sr."restaurantId" = ${restaurantId}::uuid AND sr."acceptedById" IS NOT NULL ${window} ${type}
      GROUP BY sr."acceptedById"`;
    return new Map<string, EmployeeMetrics>(rows.map((r) => [r.member, { handled: Number(r.handled), completed: Number(r.completed), avgAcceptMs: ms(r.avg_accept), avgCompleteMs: ms(r.avg_complete) }]));
  }

  async employees(restaurantId: string): Promise<EmployeeCard[]> {
    const { from, to } = await this.range(restaurantId, {});
    const [today, all, members] = await Promise.all([
      this.metricsByMember(restaurantId, from, to),
      this.metricsByMember(restaurantId),
      this.prisma.restaurantMember.findMany({ where: { restaurantId, status: { not: 'REMOVED' } }, include: { user: { include: { avatar: true } } }, orderBy: [{ role: 'asc' }, { joinedAt: 'asc' }] }),
    ]);
    return members.map((m) => ({
      memberId: m.id, userId: m.userId, fullName: m.user.fullName, email: m.user.email, phone: m.user.phone, avatarUrl: m.user.avatar ? fileUrl(m.user.avatar.storageKey) : null,
      role: m.role, status: m.status, employeeCode: m.employeeCode, joinedAt: m.joinedAt.toISOString(), today: today.get(m.id) ?? EMPTY, allTime: all.get(m.id) ?? EMPTY,
    }));
  }

  async employee(restaurantId: string, memberId: string, q: AnalyticsQuery) {
    const card = (await this.employees(restaurantId)).find((e) => e.memberId === memberId);
    if (!card) throw Errors.notFound('Employee');
    const { from, to } = await this.range(restaurantId, q);
    const ranged = (await this.metricsByMember(restaurantId, from, to, q.serviceTypeId)).get(memberId) ?? EMPTY;
    const requests = await this.prisma.serviceRequest.findMany({
      where: { restaurantId, OR: [{ acceptedById: memberId }, { completedById: memberId }], createdAt: { gte: from, lt: to }, ...(q.serviceTypeId ? { serviceTypeId: q.serviceTypeId } : {}) },
      include: { table: { select: { label: true } }, serviceType: { select: { name: true, kind: true, icon: true } }, customer: { select: { fullName: true } }, _count: { select: { messages: true } } },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return {
      employee: card,
      range: { from: from.toISOString(), to: to.toISOString(), metrics: ranged },
      requests: requests.map((r) => ({
        id: r.id, number: r.number, status: r.status, table: r.table.label, service: r.serviceType.name, kind: r.serviceType.kind, icon: r.serviceType.icon, customer: r.customer.fullName,
        messages: r._count.messages, createdAt: r.createdAt.toISOString(), acceptedAt: r.acceptedAt?.toISOString() ?? null, completedAt: r.completedAt?.toISOString() ?? null,
      })),
    };
  }

  /** Owners manage everyone; admins manage waiters only. The owner can't be changed here. */
  async updateEmployee(actor: { userId: string; restaurantId: string; role: RestaurantRole }, memberId: string, input: { status?: MemberStatus; role?: 'ADMIN' | 'WAITER' }) {
    const target = await this.prisma.restaurantMember.findFirst({ where: { id: memberId, restaurantId: actor.restaurantId } });
    if (!target) throw Errors.notFound('Employee');
    if (target.role === 'OWNER') throw Errors.forbidden('The owner cannot be changed here');
    if (actor.role !== 'OWNER' && (target.role === 'ADMIN' || input.role === 'ADMIN')) throw Errors.forbidden('Only the owner can manage administrators');
    if (target.userId === actor.userId) throw Errors.forbidden('You cannot change your own access');
    await this.prisma.restaurantMember.update({ where: { id: memberId }, data: input });
    await this.audit.record({ action: 'employee.updated', entityType: 'RestaurantMember', entityId: memberId, actorUserId: actor.userId, restaurantId: actor.restaurantId, meta: input });
    return (await this.employees(actor.restaurantId)).find((e) => e.memberId === memberId) ?? { memberId, status: 'REMOVED' };
  }
}

const EMPTY: EmployeeMetrics = { handled: 0, completed: 0, avgAcceptMs: null, avgCompleteMs: null };
