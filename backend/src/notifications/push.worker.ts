import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { Expo, type ExpoPushMessage } from 'expo-server-sdk';
import { PrismaService } from '../common/prisma/prisma.service.js';
import { AppConfig } from '../config/config.module.js';

const MAX_ATTEMPTS = 5;
const BATCH = 100;

/**
 * Drains the push outbox. Rows are claimed with FOR UPDATE SKIP LOCKED so
 * several API instances never send the same push twice.
 * SENT = Expo accepted the ticket; DELIVERED = the receipt confirmed hand-off to APNs/FCM.
 */
@Injectable()
export class PushWorker {
  private readonly logger = new Logger(PushWorker.name);
  private readonly expo: Expo;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    config: AppConfig,
  ) {
    this.expo = new Expo({ accessToken: config.env.EXPO_ACCESS_TOKEN || undefined });
  }

  @Interval(5_000)
  async tick() {
    if (this.running || process.env['NODE_ENV'] === 'test') return;
    this.running = true;
    try {
      await this.sendQueued();
      await this.checkReceipts();
    } catch (e) {
      this.logger.error({ err: e }, 'push worker tick failed');
    } finally {
      this.running = false;
    }
  }

  async sendQueued() {
    const claimed = await this.prisma.$queryRaw<{ id: string; token: string; title: string; body: string; data: unknown; attempts: number }[]>`
      UPDATE push_deliveries d SET attempts = d.attempts + 1, "nextAttemptAt" = now() + interval '5 minutes'
      FROM (
        SELECT pd.id FROM push_deliveries pd
        WHERE pd.status = 'QUEUED' AND pd."nextAttemptAt" <= now()
        ORDER BY pd."createdAt" LIMIT ${BATCH} FOR UPDATE SKIP LOCKED
      ) c, push_devices dev, notifications n
      WHERE d.id = c.id AND dev.id = d."deviceId" AND n.id = d."notificationId"
      RETURNING d.id, dev."expoPushToken" AS token, n.title, n.body, n.data, d.attempts`;
    if (claimed.length === 0) return;

    const valid = claimed.filter((c) => Expo.isExpoPushToken(c.token));
    const invalid = claimed.filter((c) => !Expo.isExpoPushToken(c.token));
    if (invalid.length) {
      await this.prisma.pushDelivery.updateMany({ where: { id: { in: invalid.map((c) => c.id) } }, data: { status: 'FAILED', lastError: 'Invalid Expo push token' } });
    }
    const messages: ExpoPushMessage[] = valid.map((c) => ({ to: c.token, title: c.title, body: c.body, data: (c.data as Record<string, unknown>) ?? {}, sound: 'default', priority: 'high' }));
    let offset = 0;
    for (const chunk of this.expo.chunkPushNotifications(messages)) {
      const rows = valid.slice(offset, offset + chunk.length);
      offset += chunk.length;
      try {
        const tickets = await this.expo.sendPushNotificationsAsync(chunk);
        await Promise.all(
          tickets.map((t, i) =>
            t.status === 'ok'
              ? this.prisma.pushDelivery.update({ where: { id: rows[i]!.id }, data: { status: 'SENT', ticketId: t.id, sentAt: new Date(), lastError: null } })
              : this.fail(rows[i]!.id, rows[i]!.attempts, t.message, t.details?.error === 'DeviceNotRegistered'),
          ),
        );
      } catch (e) {
        // Network/Expo outage: leave QUEUED; nextAttemptAt already pushed back.
        await this.prisma.pushDelivery.updateMany({
          where: { id: { in: rows.filter((r) => r.attempts >= MAX_ATTEMPTS).map((r) => r.id) } },
          data: { status: 'FAILED', lastError: String(e) },
        });
      }
    }
  }

  private async fail(id: string, attempts: number, message: string, deviceGone: boolean) {
    const row = await this.prisma.pushDelivery.update({
      where: { id },
      data: { status: deviceGone || attempts >= MAX_ATTEMPTS ? 'FAILED' : 'QUEUED', lastError: message },
      select: { deviceId: true },
    });
    if (deviceGone) await this.prisma.pushDevice.update({ where: { id: row.deviceId }, data: { disabledAt: new Date() } });
  }

  /** Expo recommends checking receipts some minutes after sending. */
  async checkReceipts() {
    const pending = await this.prisma.pushDelivery.findMany({
      where: { status: 'SENT', receiptAt: null, ticketId: { not: null }, sentAt: { lt: new Date(Date.now() - 2 * 60_000) } },
      select: { id: true, ticketId: true, deviceId: true },
      take: 300,
    });
    if (pending.length === 0) return;
    for (const chunk of this.expo.chunkPushNotificationReceiptIds(pending.map((p) => p.ticketId!))) {
      const receipts = await this.expo.getPushNotificationReceiptsAsync(chunk);
      for (const p of pending.filter((x) => chunk.includes(x.ticketId!))) {
        const r = receipts[p.ticketId!];
        if (!r) continue;
        if (r.status === 'ok') {
          await this.prisma.pushDelivery.update({ where: { id: p.id }, data: { status: 'DELIVERED', receiptAt: new Date() } });
        } else {
          await this.prisma.pushDelivery.update({ where: { id: p.id }, data: { status: 'FAILED', receiptAt: new Date(), lastError: r.message } });
          if (r.details?.error === 'DeviceNotRegistered') await this.prisma.pushDevice.update({ where: { id: p.deviceId }, data: { disabledAt: new Date() } });
        }
      }
    }
  }
}
