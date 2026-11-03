import { Injectable, Logger } from '@nestjs/common';
import { waitUntil } from '@vercel/functions';
import { topics, type RealtimeEnvelope, type RealtimeEvent } from '@servebell/shared';
import { RealtimePublisher, type BroadcastMessage } from './realtime.publisher.js';

/**
 * Fire-and-forget change notifications. Called after the database commit, so a
 * client that refetches on receipt always sees the new state. Delivery is best
 * effort: apps refetch over REST whenever they (re)subscribe.
 */
@Injectable()
export class RealtimeService {
  private readonly logger = new Logger(RealtimeService.name);

  constructor(private readonly publisher: RealtimePublisher) {}

  private emit(targets: string[], event: RealtimeEvent, restaurantId: string, data: unknown) {
    const payload: RealtimeEnvelope = { event, restaurantId, emittedAt: new Date().toISOString(), data };
    const messages: BroadcastMessage[] = targets.map((topic) => ({ topic, event, payload }));
    const sent = this.publisher.publish(messages).catch((e: unknown) => this.logger.warn({ err: e, event }, 'realtime broadcast failed'));
    // Serverless: keep the instance alive until the broadcast is out (no-op elsewhere).
    waitUntil(sent);
  }

  toStaff(restaurantId: string, event: RealtimeEvent, data: unknown) {
    this.emit([topics.restaurantStaff(restaurantId)], event, restaurantId, data);
  }

  toUser(userId: string, restaurantId: string, event: RealtimeEvent, data: unknown) {
    this.emit([topics.user(userId)], event, restaurantId, data);
  }

  toService(serviceRequestId: string, restaurantId: string, event: RealtimeEvent, data: unknown) {
    this.emit([topics.service(serviceRequestId)], event, restaurantId, data);
  }

  /** Staff topic + the customer's personal topic, in one request. */
  toStaffAndCustomer(restaurantId: string, customerId: string, event: RealtimeEvent, data: unknown) {
    this.emit([topics.restaurantStaff(restaurantId), topics.user(customerId)], event, restaurantId, data);
  }
}
