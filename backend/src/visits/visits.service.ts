import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { ErrorCode, extractQrToken, type VisitView } from '@servebell/shared';
import { PrismaService } from '../common/prisma/prisma.service.js';
import { AppError, Errors } from '../common/errors.js';
import { fileUrl } from '../common/files.js';
import type { Prisma } from '../generated/prisma/client.js';

const visitInclude = {
  restaurant: {
    select: {
      id: true, slug: true, name: true, currency: true, cover: { select: { storageKey: true } },
      serviceTypes: { where: { isActive: true }, orderBy: { sortOrder: 'asc' }, select: { id: true, kind: true, name: true, icon: true, isPrimary: true } },
    },
  },
  table: { select: { id: true, label: true, capacity: true, zone: true } },
} satisfies Prisma.RestaurantVisitInclude;

type VisitRow = Prisma.RestaurantVisitGetPayload<{ include: typeof visitInclude }>;

/**
 * A visit binds a signed-in customer to a restaurant table after a QR scan.
 * It expires after inactivity; every customer action requires an active visit.
 */
@Injectable()
export class VisitsService {
  private readonly logger = new Logger(VisitsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async start(customerId: string, qr: string, guestCount?: number): Promise<VisitView> {
    const token = extractQrToken(qr);
    const invalid = () => new AppError(ErrorCode.QR_INVALID, 'This QR code is not valid. Please ask a staff member for help.', HttpStatus.NOT_FOUND);
    if (!token) throw invalid();
    const code = await this.prisma.tableQrCode.findUnique({
      where: { token },
      include: { table: true, restaurant: { select: { status: true, deletedAt: true, visitTtlMinutes: true } } },
    });
    if (!code || code.status !== 'ACTIVE' || !code.table.isActive || code.table.deletedAt || code.restaurant.status !== 'ACTIVE' || code.restaurant.deletedAt) throw invalid();

    const expiresAt = new Date(Date.now() + code.restaurant.visitTtlMinutes * 60_000);
    const visit = await this.prisma.$transaction(async (tx) => {
      const current = await tx.restaurantVisit.findFirst({ where: { customerId, status: 'ACTIVE' } });
      // Re-scanning the same table just refreshes the session.
      if (current && current.tableId === code.tableId && current.expiresAt > new Date()) {
        return tx.restaurantVisit.update({ where: { id: current.id }, data: { expiresAt, lastSeenAt: new Date(), ...(guestCount ? { guestCount } : {}) }, include: visitInclude });
      }
      // Moving to another table/restaurant ends the previous visit.
      if (current) await tx.restaurantVisit.update({ where: { id: current.id }, data: { status: current.expiresAt > new Date() ? 'ENDED' : 'EXPIRED', endedAt: new Date() } });
      return tx.restaurantVisit.create({
        data: { customerId, restaurantId: code.restaurantId, tableId: code.tableId, qrCodeId: code.id, expiresAt, guestCount: guestCount ?? null },
        include: visitInclude,
      });
    });
    return toVisitView(visit);
  }

  async active(customerId: string): Promise<VisitView | null> {
    const visit = await this.prisma.restaurantVisit.findFirst({ where: { customerId, status: 'ACTIVE' }, include: visitInclude });
    if (!visit) return null;
    if (visit.expiresAt <= new Date()) {
      await this.prisma.restaurantVisit.updateMany({ where: { id: visit.id, status: 'ACTIVE' }, data: { status: 'EXPIRED', endedAt: new Date() } });
      return null;
    }
    return toVisitView(visit);
  }

  async leave(customerId: string, visitId: string) {
    const res = await this.prisma.restaurantVisit.updateMany({ where: { id: visitId, customerId, status: 'ACTIVE' }, data: { status: 'ENDED', endedAt: new Date() } });
    if (res.count === 0) throw Errors.notFound('Active visit');
  }

  /** Returns the caller's active visit or throws VISIT_REQUIRED; slides the expiry forward. */
  async requireActive(customerId: string) {
    const visit = await this.prisma.restaurantVisit.findFirst({ where: { customerId, status: 'ACTIVE', expiresAt: { gt: new Date() } }, include: { restaurant: { select: { visitTtlMinutes: true } } } });
    if (!visit) throw new AppError(ErrorCode.VISIT_REQUIRED, 'Scan the QR code on your table to request service.', HttpStatus.FORBIDDEN);
    await this.prisma.restaurantVisit.update({
      where: { id: visit.id },
      data: { lastSeenAt: new Date(), expiresAt: new Date(Date.now() + visit.restaurant.visitTtlMinutes * 60_000) },
    });
    return visit;
  }

  /** Abandoned sessions are closed server-side; clients never decide expiry. */
  @Interval(60_000)
  async expireStale() {
    const res = await this.prisma.restaurantVisit.updateMany({ where: { status: 'ACTIVE', expiresAt: { lte: new Date() } }, data: { status: 'EXPIRED', endedAt: new Date() } });
    if (res.count) this.logger.log(`Expired ${res.count} visit(s)`);
  }
}

function toVisitView(v: VisitRow): VisitView {
  return {
    id: v.id,
    status: v.status,
    startedAt: v.startedAt.toISOString(),
    expiresAt: v.expiresAt.toISOString(),
    restaurant: { id: v.restaurant.id, slug: v.restaurant.slug, name: v.restaurant.name, currency: v.restaurant.currency, coverUrl: v.restaurant.cover ? fileUrl(v.restaurant.cover.storageKey) : null },
    table: v.table,
    guestCount: v.guestCount,
    services: v.restaurant.serviceTypes,
  };
}
