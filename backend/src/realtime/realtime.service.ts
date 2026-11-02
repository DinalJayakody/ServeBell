import { Injectable, Logger } from '@nestjs/common';
import type { Server } from 'socket.io';
import { rooms, type RealtimeEnvelope, type RealtimeEvent } from '@servebell/shared';

/**
 * Fire-and-forget change notifications. Called after the database commit, so a
 * client that refetches on receipt always sees the new state.
 */
@Injectable()
export class RealtimeService {
  private readonly logger = new Logger(RealtimeService.name);
  private server: Server | null = null;

  attach(server: Server) {
    this.server = server;
  }

  private emit(room: string, event: RealtimeEvent, restaurantId: string, data: unknown) {
    if (!this.server) return;
    const envelope: RealtimeEnvelope = { event, restaurantId, emittedAt: new Date().toISOString(), data };
    this.server.to(room).emit(event, envelope);
  }

  toStaff(restaurantId: string, event: RealtimeEvent, data: unknown) {
    this.emit(rooms.restaurantStaff(restaurantId), event, restaurantId, data);
  }

  toUser(userId: string, restaurantId: string, event: RealtimeEvent, data: unknown) {
    this.emit(rooms.user(userId), event, restaurantId, data);
  }

  toService(serviceRequestId: string, restaurantId: string, event: RealtimeEvent, data: unknown) {
    this.emit(rooms.service(serviceRequestId), event, restaurantId, data);
  }

  /** Staff room + the customer's personal room, in one call. */
  toStaffAndCustomer(restaurantId: string, customerId: string, event: RealtimeEvent, data: unknown) {
    if (!this.server) return;
    const envelope: RealtimeEnvelope = { event, restaurantId, emittedAt: new Date().toISOString(), data };
    this.server.to([rooms.restaurantStaff(restaurantId), rooms.user(customerId)]).emit(event, envelope);
  }
}
