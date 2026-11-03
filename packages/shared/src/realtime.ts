/**
 * Realtime event contract (Supabase Realtime Broadcast). Events only announce
 * changes; clients refetch or patch their cache from the payload. REST stays the source of truth.
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

/**
 * Private Supabase Realtime Broadcast topics. Who may receive each one is decided
 * in Postgres (supabase/migrations/…_realtime_authorization.sql, servebell.can_receive).
 */
export const topics = {
  /** Active staff of a restaurant. */
  restaurantStaff: (restaurantId: string) => `restaurant:${restaurantId}`,
  /** The customer and the restaurant's active staff, while a chat is open. */
  service: (serviceRequestId: string) => `service:${serviceRequestId}`,
  /** One person: their requests, orders, reservations and notifications. */
  user: (userId: string) => `user:${userId}`,
};

export interface RealtimeEnvelope<T = unknown> {
  event: RealtimeEvent;
  restaurantId: string;
  /** Monotonic server time (ISO, UTC) to let clients discard stale updates. */
  emittedAt: string;
  data: T;
}
