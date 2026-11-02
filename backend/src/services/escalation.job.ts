import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { RealtimeEvent } from '@servebell/shared';
import { PrismaService } from '../common/prisma/prisma.service.js';
import { RealtimeService } from '../realtime/realtime.service.js';
import { ServiceRequestsService } from './service-requests.service.js';
import { serviceInclude, toServiceView } from './service-request.mapper.js';

const MAX_LEVEL = 4;

/**
 * Escalates requests left PENDING for the restaurant's threshold (default 15 min),
 * then again at each further multiple. One SQL statement both selects and bumps
 * the level, so each threshold fires exactly once even with several API instances.
 */
@Injectable()
export class EscalationJob {
  private readonly logger = new Logger(EscalationJob.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeService,
    private readonly services: ServiceRequestsService,
  ) {}

  @Interval(30_000)
  async tick() {
    if (process.env['NODE_ENV'] === 'test') return;
    await this.run().catch((e) => this.logger.error({ err: e }, 'escalation failed'));
  }

  async run() {
    const bumped = await this.prisma.$queryRaw<{ id: string; level: number }[]>`
      UPDATE service_requests sr
      SET "escalationLevel" = sr."escalationLevel" + 1, "lastEscalatedAt" = now()
      FROM restaurants r
      WHERE r.id = sr."restaurantId" AND sr.status = 'PENDING' AND sr."escalationLevel" < ${MAX_LEVEL}
        AND sr."createdAt" + make_interval(mins => r."escalationMinutes" * (sr."escalationLevel" + 1)) <= now()
      RETURNING sr.id, sr."escalationLevel" AS level`;

    for (const b of bumped) {
      const r = await this.prisma.serviceRequest.findUniqueOrThrow({ where: { id: b.id }, include: { ...serviceInclude, restaurant: { select: { id: true, name: true, escalationMinutes: true } } } });
      const minutes = r.restaurant.escalationMinutes * b.level;
      await this.prisma.serviceRequestEvent.create({ data: { requestId: r.id, type: 'ESCALATED', meta: { level: b.level, minutes } } });
      this.realtime.toStaff(r.restaurantId, RealtimeEvent.SERVICE_ESCALATED, toServiceView(r));
      await this.services.notifyStaff(r.restaurantId, {
        type: 'service.escalated',
        title: `Overdue: Table ${r.table.label} waiting ${minutes} min`,
        body: `${r.serviceType.name} has not been accepted yet.`,
        dedupeKey: `service.escalated:${r.id}:${b.level}`,
        data: { serviceRequestId: r.id, restaurantId: r.restaurantId },
      });
    }
    return bumped.length;
  }
}
