import { Injectable } from '@nestjs/common';
import { RealtimeEvent, type ClientApp, type NotificationView } from '@servebell/shared';
import { PrismaService } from '../common/prisma/prisma.service.js';
import { RealtimeService } from '../realtime/realtime.service.js';
import type { Prisma } from '../generated/prisma/client.js';

export interface NotifyInput {
  type: string;
  title: string;
  body: string;
  restaurantId?: string | null;
  data?: Record<string, string | number | boolean | null>;
  /** Makes notify() idempotent per user: the same key is never delivered twice. */
  dedupeKey: string;
  /** Which app's devices receive the push. */
  app: ClientApp;
}

@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeService,
  ) {}

  /**
   * Writes in-app notifications (always) and queues one push delivery per active
   * device. Delivery happens in PushWorker; failures never affect the caller.
   */
  async notify(userIds: string[], input: NotifyInput) {
    const unique = [...new Set(userIds)];
    if (unique.length === 0) return;
    await this.prisma.notification.createMany({
      data: unique.map((userId) => ({
        userId,
        restaurantId: input.restaurantId ?? null,
        type: input.type,
        title: input.title,
        body: input.body,
        data: (input.data ?? null) as Prisma.InputJsonValue,
        dedupeKey: input.dedupeKey,
      })),
      skipDuplicates: true,
    });
    const created = await this.prisma.notification.findMany({
      where: { userId: { in: unique }, dedupeKey: input.dedupeKey, deliveries: { none: {} } },
      select: { id: true, userId: true, restaurantId: true, type: true, title: true, body: true, data: true, readAt: true, createdAt: true },
    });
    if (created.length === 0) return;
    const devices = await this.prisma.pushDevice.findMany({
      where: { userId: { in: created.map((n) => n.userId) }, app: input.app, disabledAt: null },
      select: { id: true, userId: true },
    });
    const byUser = new Map(created.map((n) => [n.userId, n.id]));
    if (devices.length) {
      await this.prisma.pushDelivery.createMany({
        data: devices.map((d) => ({ notificationId: byUser.get(d.userId)!, deviceId: d.id })),
        skipDuplicates: true,
      });
    }
    for (const n of created) {
      this.realtime.toUser(n.userId, n.restaurantId ?? '', RealtimeEvent.NOTIFICATION_CREATED, toView(n));
    }
  }

  async list(userId: string, cursor?: string, limit = 30) {
    const offset = cursor ? Number.parseInt(cursor, 10) || 0 : 0;
    const rows = await this.prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      skip: offset,
      take: limit + 1,
    });
    return { items: rows.slice(0, limit).map(toView), nextCursor: rows.length > limit ? String(offset + limit) : null };
  }

  unreadCount(userId: string) {
    return this.prisma.notification.count({ where: { userId, readAt: null } });
  }

  async markAllRead(userId: string) {
    await this.prisma.notification.updateMany({ where: { userId, readAt: null }, data: { readAt: new Date() } });
  }
}

function toView(n: { id: string; type: string; title: string; body: string; data: unknown; restaurantId: string | null; readAt: Date | null; createdAt: Date }): NotificationView {
  return {
    id: n.id,
    type: n.type,
    title: n.title,
    body: n.body,
    data: (n.data as Record<string, unknown>) ?? null,
    restaurantId: n.restaurantId,
    readAt: n.readAt?.toISOString() ?? null,
    createdAt: n.createdAt.toISOString(),
  };
}
