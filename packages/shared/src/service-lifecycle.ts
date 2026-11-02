import type { ServiceStatus, OrderStatus, ReservationStatus } from './enums.js';

/** Allowed service-request transitions. Enforced server-side with conditional updates. */
export const SERVICE_TRANSITIONS: Readonly<Record<ServiceStatus, readonly ServiceStatus[]>> = {
  PENDING: ['ACCEPTED', 'CANCELLED'],
  ACCEPTED: ['IN_PROGRESS', 'COMPLETED', 'CANCELLED'],
  IN_PROGRESS: ['COMPLETED', 'CANCELLED'],
  COMPLETED: [],
  CANCELLED: [],
};

export const ORDER_TRANSITIONS: Readonly<Record<OrderStatus, readonly OrderStatus[]>> = {
  PENDING: ['ACCEPTED', 'CANCELLED'],
  ACCEPTED: ['PREPARING', 'CANCELLED'],
  PREPARING: ['READY', 'CANCELLED'],
  READY: ['DELIVERED'],
  DELIVERED: [],
  CANCELLED: [],
};

export const RESERVATION_TRANSITIONS: Readonly<Record<ReservationStatus, readonly ReservationStatus[]>> = {
  PENDING: ['CONFIRMED', 'REJECTED', 'CANCELLED'],
  CONFIRMED: ['CANCELLED', 'COMPLETED', 'NO_SHOW'],
  REJECTED: [],
  CANCELLED: [],
  COMPLETED: [],
  NO_SHOW: [],
};

export const canTransition = <S extends string>(map: Readonly<Record<S, readonly S[]>>, from: S, to: S) =>
  map[from].includes(to);

export const OPEN_SERVICE_STATUSES: readonly ServiceStatus[] = ['PENDING', 'ACCEPTED', 'IN_PROGRESS'];
export const BLOCKING_RESERVATION_STATUSES: readonly ReservationStatus[] = ['PENDING', 'CONFIRMED'];

/** Durations are always computed from server timestamps. */
export function durationMs(from: string | Date | null | undefined, to: string | Date | null | undefined): number | null {
  if (!from || !to) return null;
  return new Date(to).getTime() - new Date(from).getTime();
}
