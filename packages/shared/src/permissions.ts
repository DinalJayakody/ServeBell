import type { RestaurantRole } from './enums.js';

/**
 * Restaurant-scoped permissions. The backend's RestaurantAccessGuard is the only
 * enforcement point; apps use this matrix purely to decide what to render.
 */
export const Permission = {
  RESTAURANT_READ: 'restaurant:read',
  RESTAURANT_MANAGE: 'restaurant:manage',
  EMPLOYEES_READ: 'employees:read',
  EMPLOYEES_MANAGE: 'employees:manage',
  OWNERSHIP_TRANSFER: 'ownership:transfer',
  SERVICES_HANDLE: 'services:handle',
  SERVICES_MONITOR: 'services:monitor',
  SERVICE_TYPES_MANAGE: 'service-types:manage',
  MESSAGES_PARTICIPATE: 'messages:participate',
  MESSAGES_AUDIT: 'messages:audit',
  FLOORPLAN_MANAGE: 'floorplan:manage',
  QR_MANAGE: 'qr:manage',
  MENU_MANAGE: 'menu:manage',
  ORDERS_HANDLE: 'orders:handle',
  RESERVATIONS_READ: 'reservations:read',
  RESERVATIONS_MANAGE: 'reservations:manage',
  CATALOG_MANAGE: 'catalog:manage',
  ANALYTICS_READ: 'analytics:read',
  ANALYTICS_SELF: 'analytics:self',
  AUDIT_READ: 'audit:read',
} as const;
export type Permission = (typeof Permission)[keyof typeof Permission];

const ALL = Object.values(Permission);

const WAITER: Permission[] = [
  Permission.RESTAURANT_READ,
  Permission.SERVICES_HANDLE,
  Permission.MESSAGES_PARTICIPATE,
  Permission.ORDERS_HANDLE,
  Permission.RESERVATIONS_READ,
  Permission.ANALYTICS_SELF,
];

export const ROLE_PERMISSIONS: Readonly<Record<RestaurantRole, readonly Permission[]>> = {
  OWNER: ALL,
  ADMIN: ALL.filter((p) => p !== Permission.OWNERSHIP_TRANSFER),
  WAITER,
};

export function hasPermission(role: RestaurantRole | null | undefined, permission: Permission): boolean {
  return role ? ROLE_PERMISSIONS[role].includes(permission) : false;
}
