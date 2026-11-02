/**
 * Socket.IO event contract. Sockets only announce changes; clients refetch or
 * patch their cache from the payload. REST stays the source of truth.
 */
export const RealtimeEvent = {
  SERVICE_CREATED: 'service.created',
  SERVICE_ACCEPTED: 'service.accepted',
  SERVICE_STARTED: 'service.started',
  SERVICE_COMPLETED: 'service.completed',
  SERVICE_CANCELLED: 'service.cancelled',
  SERVICE_ESCALATED: 'service.escalated',
  SERVICE_MESSAGE_CREATED: 'service.message.created',
  RESERVATION_UPDATED: 'reservation.updated',
  ORDER_CREATED: 'order.created',
  ORDER_UPDATED: 'order.updated',
  LAYOUT_UPDATED: 'restaurant.layout.updated',
  MENU_UPDATED: 'menu.updated',
  NOTIFICATION_CREATED: 'notification.created',
} as const;
export type RealtimeEvent = (typeof RealtimeEvent)[keyof typeof RealtimeEvent];

/** Client -> server commands (acknowledged). */
export const RealtimeCommand = {
  JOIN_RESTAURANT: 'room.join.restaurant',
  JOIN_SERVICE: 'room.join.service',
  LEAVE_SERVICE: 'room.leave.service',
} as const;

export const rooms = {
  restaurantStaff: (restaurantId: string) => `restaurant:${restaurantId}:staff`,
  restaurantPublic: (restaurantId: string) => `restaurant:${restaurantId}:public`,
  service: (serviceRequestId: string) => `service:${serviceRequestId}`,
  user: (userId: string) => `user:${userId}`,
};

export interface RealtimeEnvelope<T = unknown> {
  event: RealtimeEvent;
  restaurantId: string;
  /** Monotonic server time (ISO, UTC) to let clients discard stale updates. */
  emittedAt: string;
  data: T;
}
