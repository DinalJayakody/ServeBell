import { Controller, Get, Param } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { QrResolution } from '@servebell/shared';
import { PrismaService } from '../common/prisma/prisma.service.js';
import { Public } from '../common/decorators/public.decorator.js';
import { AppError } from '../common/errors.js';
import { fileUrl } from '../common/files.js';
import { isOpenNow } from '../restaurants/opening-hours.js';

const QR_TOKEN = /^[A-Za-z0-9_-]{16,64}$/;

@ApiTags('qr')
@Controller({ path: 'qr', version: '1' })
export class QrController {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Resolves a printed table QR. Knowing a token only identifies a table; it
   * grants nothing. Starting a visit/requesting service is authorised separately.
   */
  @Public()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Get(':token')
  @ApiOperation({ summary: 'Resolve a table QR token to its restaurant and table (public)' })
  async resolve(@Param('token') token: string): Promise<QrResolution> {
    const invalid = () => new AppError('QR_INVALID', 'This QR code is not valid. Please ask a staff member for help.', 404);
    if (!QR_TOKEN.test(token)) throw invalid();
    const qr = await this.prisma.tableQrCode.findUnique({
      where: { token },
      include: {
        table: { select: { id: true, label: true, capacity: true, zone: true, isActive: true, deletedAt: true } },
        restaurant: { include: { cover: { select: { storageKey: true } }, openingHours: true } },
      },
    });
    if (!qr || qr.status !== 'ACTIVE' || !qr.table.isActive || qr.table.deletedAt || qr.restaurant.status !== 'ACTIVE' || qr.restaurant.deletedAt) throw invalid();
    const r = qr.restaurant;
    return {
      token,
      restaurant: { id: r.id, slug: r.slug, name: r.name, addressLine: r.addressLine, city: r.city, coverUrl: r.cover ? fileUrl(r.cover.storageKey) : null, openNow: isOpenNow(r.openingHours, r.timezone) },
      table: { id: qr.table.id, label: qr.table.label, capacity: qr.table.capacity, zone: qr.table.zone },
    };
  }
}
