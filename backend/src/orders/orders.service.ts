import { HttpStatus, Injectable } from '@nestjs/common';
import {
  canTransition,
  ErrorCode,
  hasPermission,
  ORDER_TRANSITIONS,
  Permission,
  RealtimeEvent,
  type CreateOrderInput,
  type OrderStatus,
  type OrderView,
  type Page,
  type RestaurantRole,
} from '@servebell/shared';
import { PrismaService } from '../common/prisma/prisma.service.js';
import { AppError, Errors } from '../common/errors.js';
import { fileUrl } from '../common/files.js';
import { RealtimeService } from '../realtime/realtime.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { VisitsService } from '../visits/visits.service.js';
import { Prisma } from '../generated/prisma/client.js';

const orderInclude = {
  restaurant: { select: { id: true, name: true } },
  table: { select: { id: true, label: true } },
  customer: { select: { id: true, fullName: true } },
  visit: { select: { guestCount: true } },
  items: { include: { menuItem: { select: { images: { take: 1, orderBy: { sortOrder: 'asc' }, select: { file: { select: { storageKey: true } } } } } } } },
} satisfies Prisma.OrderInclude;
type OrderRow = Prisma.OrderGetPayload<{ include: typeof orderInclude }>;

const OPEN: OrderStatus[] = ['PENDING', 'ACCEPTED', 'PREPARING', 'READY'];
const STAMP: Partial<Record<OrderStatus, keyof Prisma.OrderUncheckedUpdateManyInput>> = {
  ACCEPTED: 'acceptedAt', PREPARING: 'preparingAt', READY: 'readyAt', DELIVERED: 'deliveredAt', CANCELLED: 'cancelledAt',
};
const CUSTOMER_COPY: Partial<Record<OrderStatus, string>> = {
  ACCEPTED: 'The restaurant accepted your order.',
  PREPARING: 'Your order is being prepared.',
  READY: 'Your order is ready and on its way.',
  DELIVERED: 'Your order has been served. Enjoy!',
  CANCELLED: 'The restaurant cancelled your order.',
};

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly visits: VisitsService,
    private readonly realtime: RealtimeService,
    private readonly notifications: NotificationsService,
  ) {}

  /** Prices come from the database, never from the client. Submitting ≠ accepted. */
  async create(customerId: string, input: CreateOrderInput): Promise<OrderView> {
    const prior = await this.prisma.order.findUnique({ where: { customerId_idempotencyKey: { customerId, idempotencyKey: input.idempotencyKey } }, include: orderInclude });
    if (prior) return toView(prior);

    const visit = await this.visits.requireActive(customerId);
    const restaurant = await this.prisma.restaurant.findUniqueOrThrow({ where: { id: visit.restaurantId }, select: { currency: true } });
    const ids = [...new Set(input.items.map((i) => i.menuItemId))];
    const menuItems = await this.prisma.menuItem.findMany({
      where: { id: { in: ids }, restaurantId: visit.restaurantId, isActive: true, deletedAt: null },
      include: { optionGroups: { include: { options: true } } },
    });
    const byId = new Map(menuItems.map((m) => [m.id, m]));

    const lines = input.items.map((line) => {
      const item = byId.get(line.menuItemId);
      if (!item) throw Errors.notFound('Menu item');
      if (!item.isAvailable) throw new AppError(ErrorCode.CONFLICT, `${item.name} is not available right now`, HttpStatus.CONFLICT);
      const options = item.optionGroups.flatMap((g) => g.options.map((o) => ({ ...o, group: g })));
      const chosen = line.optionIds.map((id) => {
        const o = options.find((x) => x.id === id);
        if (!o || !o.isAvailable) throw Errors.badRequest(`An option for ${item.name} is not available`);
        return o;
      });
      for (const g of item.optionGroups) {
        const n = chosen.filter((c) => c.groupId === g.id).length;
        if (n < g.minSelect || n > g.maxSelect) throw Errors.badRequest(`Choose ${g.minSelect === g.maxSelect ? g.minSelect : `${g.minSelect}–${g.maxSelect}`} for “${g.name}” on ${item.name}`);
      }
      const unit = item.priceCents + chosen.reduce((s, o) => s + o.priceDeltaCents, 0);
      return { item, chosen, unit, quantity: line.quantity, note: line.note };
    });
    const subtotal = lines.reduce((s, l) => s + l.unit * l.quantity, 0);

    let row: OrderRow;
    try {
      row = await this.prisma.order.create({
        data: {
          restaurantId: visit.restaurantId,
          tableId: visit.tableId,
          visitId: visit.id,
          customerId,
          currency: restaurant.currency,
          subtotalCents: subtotal,
          totalCents: subtotal,
          note: input.note,
          idempotencyKey: input.idempotencyKey,
          items: {
            create: lines.map((l) => ({
              menuItemId: l.item.id,
              nameSnapshot: l.item.name,
              unitPriceCents: l.unit,
              quantity: l.quantity,
              lineTotalCents: l.unit * l.quantity,
              optionsSnapshot: l.chosen.map((c) => c.name),
              note: l.note,
            })),
          },
        },
        include: orderInclude,
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        return toView(await this.prisma.order.findUniqueOrThrow({ where: { customerId_idempotencyKey: { customerId, idempotencyKey: input.idempotencyKey } }, include: orderInclude }));
      }
      throw e;
    }
    const view = toView(row);
    this.realtime.toStaffAndCustomer(row.restaurantId, customerId, RealtimeEvent.ORDER_CREATED, view);
    const members = await this.prisma.restaurantMember.findMany({ where: { restaurantId: row.restaurantId, status: 'ACTIVE' }, select: { userId: true, role: true } });
    await this.notifications.notify(
      members.filter((m) => hasPermission(m.role, Permission.ORDERS_HANDLE)).map((m) => m.userId),
      { type: 'order.created', title: `New order · Table ${row.table.label}`, body: `${lines.reduce((s, l) => s + l.quantity, 0)} item(s)`, app: 'RESTAURANT', restaurantId: row.restaurantId, dedupeKey: `order.created:${row.id}`, data: { orderId: row.id, restaurantId: row.restaurantId } },
    );
    return view;
  }

  async mine(customerId: string, active: boolean, cursor?: string, limit = 20): Promise<Page<OrderView>> {
    const offset = cursor ? Number.parseInt(cursor, 10) || 0 : 0;
    const rows = await this.prisma.order.findMany({ where: { customerId, ...(active ? { status: { in: OPEN } } : {}) }, include: orderInclude, orderBy: { createdAt: 'desc' }, skip: offset, take: limit + 1 });
    return { items: rows.slice(0, limit).map(toView), nextCursor: rows.length > limit ? String(offset + limit) : null };
  }

  async detail(userId: string, id: string) {
    const row = await this.prisma.order.findUnique({ where: { id }, include: orderInclude });
    if (!row) throw Errors.notFound('Order');
    if (row.customerId === userId) return toView(row);
    const member = await this.prisma.restaurantMember.findFirst({ where: { restaurantId: row.restaurantId, userId, status: 'ACTIVE' }, select: { role: true } });
    if (!member || !hasPermission(member.role, Permission.ORDERS_HANDLE)) throw Errors.notFound('Order');
    return toView(row);
  }

  async cancelByCustomer(customerId: string, id: string) {
    return this.transition({ id, customerId }, 'CANCELLED', { actor: 'customer', reason: 'Cancelled by customer' });
  }

  async listForStaff(restaurantId: string, view: 'open' | 'done', cursor?: string, limit = 30): Promise<Page<OrderView>> {
    const offset = cursor ? Number.parseInt(cursor, 10) || 0 : 0;
    const rows = await this.prisma.order.findMany({
      where: { restaurantId, status: view === 'open' ? { in: OPEN } : { in: ['DELIVERED', 'CANCELLED'] } },
      include: orderInclude,
      orderBy: { createdAt: view === 'open' ? 'asc' : 'desc' },
      skip: offset,
      take: limit + 1,
    });
    return { items: rows.slice(0, limit).map(toView), nextCursor: rows.length > limit ? String(offset + limit) : null };
  }

  async updateByStaff(staff: { restaurantId: string; memberId: string; role: RestaurantRole }, id: string, to: Exclude<OrderStatus, 'PENDING'>, reason?: string) {
    return this.transition({ id, restaurantId: staff.restaurantId }, to, { actor: 'staff', memberId: staff.memberId, reason });
  }

  /** One conditional UPDATE per step; the allowed "from" states come from ORDER_TRANSITIONS. */
  private async transition(scope: { id: string; restaurantId?: string; customerId?: string }, to: OrderStatus, ctx: { actor: 'staff' | 'customer'; memberId?: string; reason?: string }) {
    const from = (Object.keys(ORDER_TRANSITIONS) as OrderStatus[]).filter((s) => canTransition(ORDER_TRANSITIONS, s, to) && (ctx.actor === 'staff' || s === 'PENDING'));
    const stamp = STAMP[to];
    const res = await this.prisma.order.updateMany({
      where: { ...scope, status: { in: from } },
      data: { status: to, ...(stamp ? { [stamp]: new Date() } : {}), ...(to === 'ACCEPTED' ? { acceptedById: ctx.memberId } : {}), ...(to === 'CANCELLED' ? { cancelReason: ctx.reason ?? null } : {}) },
    });
    if (res.count !== 1) {
      const exists = await this.prisma.order.findFirst({ where: scope, select: { status: true } });
      if (!exists) throw Errors.notFound('Order');
      throw new AppError(ErrorCode.INVALID_TRANSITION, `This order is already ${exists.status.toLowerCase()}.`, HttpStatus.CONFLICT);
    }
    const row = await this.prisma.order.findUniqueOrThrow({ where: { id: scope.id }, include: orderInclude });
    const view = toView(row);
    this.realtime.toStaffAndCustomer(row.restaurantId, row.customerId, RealtimeEvent.ORDER_UPDATED, view);
    if (ctx.actor === 'staff' && CUSTOMER_COPY[to]) {
      await this.notifications.notify([row.customerId], { type: `order.${to.toLowerCase()}`, title: `Order #${row.number} · Table ${row.table.label}`, body: CUSTOMER_COPY[to]!, app: 'CUSTOMER', restaurantId: row.restaurantId, dedupeKey: `order.${to}:${row.id}`, data: { orderId: row.id } });
    }
    return view;
  }
}

function toView(o: OrderRow): OrderView {
  const iso = (d: Date | null) => d?.toISOString() ?? null;
  return {
    id: o.id,
    number: o.number,
    status: o.status,
    restaurant: o.restaurant,
    table: o.table,
    customer: o.customer,
    guestCount: o.visit.guestCount,
    currency: o.currency,
    subtotalCents: o.subtotalCents,
    totalCents: o.totalCents,
    note: o.note,
    items: o.items.map((i) => ({
      id: i.id,
      menuItemId: i.menuItemId,
      name: i.nameSnapshot,
      imageUrl: i.menuItem?.images[0] ? fileUrl(i.menuItem.images[0].file.storageKey) : null,
      quantity: i.quantity,
      unitPriceCents: i.unitPriceCents,
      lineTotalCents: i.lineTotalCents,
      options: Array.isArray(i.optionsSnapshot) ? (i.optionsSnapshot as string[]) : [],
      note: i.note,
    })),
    createdAt: o.createdAt.toISOString(),
    acceptedAt: iso(o.acceptedAt),
    preparingAt: iso(o.preparingAt),
    readyAt: iso(o.readyAt),
    deliveredAt: iso(o.deliveredAt),
    cancelledAt: iso(o.cancelledAt),
    cancelReason: o.cancelReason,
  };
}
