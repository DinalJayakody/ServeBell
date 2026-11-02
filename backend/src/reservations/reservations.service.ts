import { HttpStatus, Injectable } from '@nestjs/common';
import {
  canTransition, ErrorCode, hasPermission, Permission, RESERVATION_MINUTES, RESERVATION_TRANSITIONS, RealtimeEvent,
  type AvailabilitySlot, type CreateReservationInput, type ReservationStatus, type ReservationView,
} from '@servebell/shared';
import { PrismaService } from '../common/prisma/prisma.service.js';
import { AppError, Errors, isDbConstraint } from '../common/errors.js';
import { RealtimeService } from '../realtime/realtime.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import type { Prisma } from '../generated/prisma/client.js';

const SLOT_MINUTES = 30;
const MIN_LEAD_MINUTES = 30;
const MAX_DAYS_AHEAD = 60;
const include = {
  restaurant: { select: { id: true, slug: true, name: true, timezone: true } },
  table: { select: { id: true, label: true, zone: true } },
  customer: { select: { id: true, fullName: true, phone: true } },
} satisfies Prisma.ReservationInclude;
type Row = Prisma.ReservationGetPayload<{ include: typeof include }>;

/** Offset (ms) of a timezone from UTC at a given instant, via Intl (no tz database dependency). */
function tzOffsetMs(timeZone: string, at: Date) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(at).map((x) => [x.type, x.value]));
  return Date.UTC(+p.year!, +p.month! - 1, +p.day!, +p.hour!, +p.minute!, +p.second!) - at.getTime();
}
/** UTC instant for a local wall-clock date + minute-of-day in the restaurant's timezone. */
export function localToUtc(date: string, minute: number, timeZone: string) {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  const guess = Date.UTC(y, m - 1, d, 0, minute);
  return new Date(guess - tzOffsetMs(timeZone, new Date(guess)));
}

@Injectable()
export class ReservationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeService,
    private readonly notifications: NotificationsService,
  ) {}

  private toView(r: Row): ReservationView {
    return { id: r.id, status: r.status, startsAt: r.startsAt.toISOString(), endsAt: r.endsAt.toISOString(), partySize: r.partySize, note: r.note, cancelReason: r.cancelReason, restaurant: r.restaurant, table: r.table, customer: r.customer, createdAt: r.createdAt.toISOString() };
  }

  private async table(tableId: string) {
    const t = await this.prisma.restaurantTable.findFirst({ where: { id: tableId, deletedAt: null, isActive: true, restaurant: { status: 'ACTIVE', deletedAt: null } }, include: { restaurant: { include: { openingHours: true } } } });
    if (!t) throw Errors.notFound('Table');
    return t;
  }

  /** Candidate slots inside opening hours (restaurant-local) that fit a full reservation before closing. */
  private slots(r: { timezone: string; openingHours: { dayOfWeek: number; opensMinute: number; closesMinute: number }[] }, date: string) {
    const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
    const now = Date.now();
    const out: { startsAt: Date; endsAt: Date }[] = [];
    for (const w of r.openingHours.filter((h) => h.dayOfWeek === weekday)) {
      for (let m = Math.ceil(w.opensMinute / SLOT_MINUTES) * SLOT_MINUTES; m + RESERVATION_MINUTES <= w.closesMinute; m += SLOT_MINUTES) {
        const startsAt = localToUtc(date, m, r.timezone);
        if (startsAt.getTime() < now + MIN_LEAD_MINUTES * 60_000) continue;
        out.push({ startsAt, endsAt: new Date(startsAt.getTime() + RESERVATION_MINUTES * 60_000) });
      }
    }
    return out;
  }

  async availability(tableId: string, date: string, partySize: number): Promise<AvailabilitySlot[]> {
    const t = await this.table(tableId);
    if (!t.isReservable || partySize > t.capacity) return [];
    const candidates = this.slots(t.restaurant, date);
    if (!candidates.length) return [];
    const taken = await this.prisma.reservation.findMany({
      where: { tableId, status: { in: ['PENDING', 'CONFIRMED'] }, startsAt: { lt: candidates.at(-1)!.endsAt }, endsAt: { gt: candidates[0]!.startsAt } },
      select: { startsAt: true, endsAt: true },
    });
    return candidates.map((c) => ({
      startsAt: c.startsAt.toISOString(),
      endsAt: c.endsAt.toISOString(),
      available: !taken.some((r) => r.startsAt < c.endsAt && r.endsAt > c.startsAt),
    }));
  }

  private async restaurant(idOrSlug: string) {
    const isUuid = /^[0-9a-f-]{36}$/i.test(idOrSlug);
    const r = await this.prisma.restaurant.findFirst({ where: { ...(isUuid ? { id: idOrSlug } : { slug: idOrSlug }), status: 'ACTIVE', deletedAt: null }, include: { openingHours: true } });
    if (!r) throw Errors.notFound('Restaurant');
    return r;
  }

  /**
   * "Any table" slots. With suitable tables, a slot is open while fewer bookings overlap it than
   * there are tables for the party; with no tables set up, staff decide when confirming.
   */
  async restaurantAvailability(idOrSlug: string, date: string, partySize: number): Promise<AvailabilitySlot[]> {
    const r = await this.restaurant(idOrSlug);
    const candidates = this.slots(r, date);
    if (!candidates.length) return [];
    const tables = await this.prisma.restaurantTable.findMany({ where: { restaurantId: r.id, deletedAt: null, isActive: true, isReservable: true }, select: { id: true, capacity: true } });
    const fitting = tables.filter((t) => t.capacity >= partySize);
    if (tables.length && !fitting.length) return [];
    const fittingIds = new Set(fitting.map((t) => t.id));
    const taken = tables.length
      ? await this.prisma.reservation.findMany({
          where: { restaurantId: r.id, status: { in: ['PENDING', 'CONFIRMED'] }, startsAt: { lt: candidates.at(-1)!.endsAt }, endsAt: { gt: candidates[0]!.startsAt } },
          select: { tableId: true, startsAt: true, endsAt: true },
        })
      : [];
    return candidates.map((c) => {
      const overlapping = taken.filter((b) => b.startsAt < c.endsAt && b.endsAt > c.startsAt && (b.tableId === null || fittingIds.has(b.tableId)));
      return { startsAt: c.startsAt.toISOString(), endsAt: c.endsAt.toISOString(), available: !tables.length || overlapping.length < fitting.length };
    });
  }

  async create(customerId: string, input: CreateReservationInput): Promise<ReservationView> {
    const startsAt = new Date(input.startsAt);
    if (startsAt.getTime() < Date.now() + MIN_LEAD_MINUTES * 60_000) throw Errors.badRequest('Reservations must be at least 30 minutes ahead');
    if (startsAt.getTime() > Date.now() + MAX_DAYS_AHEAD * 86_400_000) throw Errors.badRequest('Reservations can be made up to 60 days ahead');
    let restaurantId: string;
    let tableId: string | null = null;
    let slot: AvailabilitySlot | undefined;
    if (input.tableId) {
      const t = await this.table(input.tableId);
      if (!t.isReservable) throw Errors.badRequest('This table cannot be reserved');
      if (input.partySize > t.capacity) throw Errors.badRequest(`Table ${t.label} seats up to ${t.capacity}`);
      const localDate = new Intl.DateTimeFormat('en-CA', { timeZone: t.restaurant.timezone }).format(startsAt);
      slot = (await this.availability(t.id, localDate, input.partySize)).find((s) => s.startsAt === startsAt.toISOString());
      restaurantId = t.restaurantId;
      tableId = t.id;
    } else {
      const r = await this.restaurant(input.restaurantId!);
      const localDate = new Intl.DateTimeFormat('en-CA', { timeZone: r.timezone }).format(startsAt);
      slot = (await this.restaurantAvailability(r.id, localDate, input.partySize)).find((s) => s.startsAt === startsAt.toISOString() && s.available);
      restaurantId = r.id;
    }
    if (!slot?.available) throw Errors.badRequest('Choose one of the available times');

    const data = { restaurantId, tableId, customerId, partySize: input.partySize, startsAt, endsAt: new Date(slot.endsAt), note: input.note ?? null };
    let row: Row | null = null;
    // Concurrent inserts on the exclusion constraint can surface as a deadlock (P2034);
    // retrying resolves to either success or a clean exclusion violation (23P01).
    for (let attempt = 0; !row; attempt++) {
      try {
        row = await this.prisma.reservation.create({ data, include });
      } catch (e) {
        if (isDbConstraint(e, '23P01', 'reservations_no_overlap')) {
          throw new AppError(ErrorCode.TABLE_UNAVAILABLE, 'That time was just booked. Please pick another slot.', HttpStatus.CONFLICT);
        }
        if (attempt < 3 && isDbConstraint(e, 'P2034', '40P01', '40001')) continue;
        throw e;
      }
    }
    const view = this.toView(row);
    this.realtime.toStaffAndCustomer(row.restaurantId, customerId, RealtimeEvent.RESERVATION_UPDATED, view);
    const staff = await this.prisma.restaurantMember.findMany({ where: { restaurantId: row.restaurantId, status: 'ACTIVE' }, select: { userId: true, role: true } });
    await this.notifications.notify(staff.filter((m) => hasPermission(m.role, Permission.RESERVATIONS_MANAGE)).map((m) => m.userId), {
      type: 'reservation.created', title: row.table ? `New reservation · Table ${row.table.label}` : 'New reservation · any table', body: `${row.customer.fullName}, ${row.partySize} guests`, app: 'RESTAURANT', restaurantId: row.restaurantId, dedupeKey: `reservation.created:${row.id}`, data: { reservationId: row.id },
    });
    return view;
  }

  async mine(customerId: string) {
    const rows = await this.prisma.reservation.findMany({ where: { customerId }, include, orderBy: { startsAt: 'desc' }, take: 50 });
    return rows.map((r) => this.toView(r));
  }

  async cancelByCustomer(customerId: string, id: string) {
    return this.transition({ id, customerId }, 'CANCELLED', 'customer', 'Cancelled by guest');
  }

  async listForStaff(restaurantId: string, q: { date?: string; status?: ReservationStatus }) {
    const r = await this.prisma.restaurant.findUniqueOrThrow({ where: { id: restaurantId }, select: { timezone: true } });
    const range = q.date ? { gte: localToUtc(q.date, 0, r.timezone), lt: localToUtc(q.date, 1440, r.timezone) } : { gte: new Date(Date.now() - 6 * 3_600_000) };
    const rows = await this.prisma.reservation.findMany({ where: { restaurantId, startsAt: range, ...(q.status ? { status: q.status } : {}) }, include, orderBy: { startsAt: 'asc' }, take: 200 });
    return rows.map((x) => this.toView(x));
  }

  async updateByStaff(restaurantId: string, id: string, status: Exclude<ReservationStatus, 'PENDING'>, reason?: string | null, tableId?: string) {
    if (tableId) {
      if (status !== 'CONFIRMED') throw Errors.badRequest('A table can only be assigned when confirming');
      const [t, res] = await Promise.all([
        this.prisma.restaurantTable.findFirst({ where: { id: tableId, restaurantId, deletedAt: null, isActive: true } }),
        this.prisma.reservation.findFirst({ where: { id, restaurantId }, select: { partySize: true } }),
      ]);
      if (!t) throw Errors.notFound('Table');
      if (res && res.partySize > t.capacity) throw Errors.badRequest(`Table ${t.label} seats up to ${t.capacity}`);
    }
    return this.transition({ id, restaurantId }, status, 'staff', reason ?? undefined, tableId);
  }

  private async transition(scope: { id: string; restaurantId?: string; customerId?: string }, to: ReservationStatus, actor: 'staff' | 'customer', reason?: string, tableId?: string) {
    const from = (Object.keys(RESERVATION_TRANSITIONS) as ReservationStatus[]).filter((s) => canTransition(RESERVATION_TRANSITIONS, s, to));
    let res: { count: number };
    try {
      res = await this.prisma.reservation.updateMany({
        where: { ...scope, status: { in: from } },
        data: { status: to, ...(tableId ? { tableId } : {}), ...(to === 'CANCELLED' || to === 'REJECTED' ? { cancelReason: reason ?? null } : {}), ...(actor === 'staff' ? { decidedAt: new Date() } : {}) },
      });
    } catch (e) {
      if (isDbConstraint(e, '23P01', 'reservations_no_overlap')) throw new AppError(ErrorCode.TABLE_UNAVAILABLE, 'That table is already booked at this time. Choose another table.', HttpStatus.CONFLICT);
      throw e;
    }
    if (res.count !== 1) {
      const cur = await this.prisma.reservation.findFirst({ where: scope, select: { status: true } });
      if (!cur) throw Errors.notFound('Reservation');
      throw new AppError(ErrorCode.INVALID_TRANSITION, `This reservation is already ${cur.status.toLowerCase().replace('_', ' ')}.`, HttpStatus.CONFLICT);
    }
    const row = await this.prisma.reservation.findUniqueOrThrow({ where: { id: scope.id }, include });
    const view = this.toView(row);
    this.realtime.toStaffAndCustomer(row.restaurantId, row.customerId, RealtimeEvent.RESERVATION_UPDATED, view);
    if (actor === 'staff' && (to === 'CONFIRMED' || to === 'REJECTED' || to === 'CANCELLED')) {
      const when = new Intl.DateTimeFormat('en-GB', { timeZone: row.restaurant.timezone, weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }).format(row.startsAt);
      await this.notifications.notify([row.customerId], {
        type: `reservation.${to.toLowerCase()}`, title: `Reservation ${to === 'CONFIRMED' ? 'confirmed' : to === 'REJECTED' ? 'declined' : 'cancelled'}`,
        body: `${row.restaurant.name}${row.table ? ` · Table ${row.table.label}` : ''} · ${when}${reason ? ` — ${reason}` : ''}`, app: 'CUSTOMER', restaurantId: row.restaurantId, dedupeKey: `reservation.${to}:${row.id}`, data: { reservationId: row.id },
      });
    }
    return view;
  }
}
