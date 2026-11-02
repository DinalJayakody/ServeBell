/**
 * Domain enums shared by every app. Values must stay identical to the Prisma
 * enums in backend/prisma/schema.prisma (verified by backend/test/contracts.spec.ts).
 */
const values = <T extends string>(...v: T[]) => Object.freeze(Object.fromEntries(v.map((k) => [k, k])) as { [K in T]: K });

export const PlatformRole = values('USER', 'PLATFORM_ADMIN');
export type PlatformRole = keyof typeof PlatformRole;

export const RestaurantRole = values('OWNER', 'ADMIN', 'WAITER');
export type RestaurantRole = keyof typeof RestaurantRole;

export const MemberStatus = values('ACTIVE', 'SUSPENDED', 'REMOVED');
export type MemberStatus = keyof typeof MemberStatus;

export const RestaurantStatus = values('DRAFT', 'ACTIVE', 'SUSPENDED');
export type RestaurantStatus = keyof typeof RestaurantStatus;

export const OnboardingStatus = values('PENDING', 'APPROVED', 'REJECTED');
export type OnboardingStatus = keyof typeof OnboardingStatus;

export const ClientApp = values('CUSTOMER', 'RESTAURANT', 'WEB');
export type ClientApp = keyof typeof ClientApp;

export const ServiceKind = values('WAITER', 'UTENSIL', 'WATER', 'BILL', 'CLEANING', 'ASSISTANCE', 'CUSTOM');
export type ServiceKind = keyof typeof ServiceKind;

export const ServiceStatus = values('PENDING', 'ACCEPTED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');
export type ServiceStatus = keyof typeof ServiceStatus;

export const ServiceEventType = values('CREATED', 'ACCEPTED', 'STARTED', 'COMPLETED', 'CANCELLED', 'ESCALATED', 'REASSIGNED');
export type ServiceEventType = keyof typeof ServiceEventType;

export const MessageSenderRole = values('CUSTOMER', 'STAFF', 'SYSTEM');
export type MessageSenderRole = keyof typeof MessageSenderRole;

export const OrderStatus = values('PENDING', 'ACCEPTED', 'PREPARING', 'READY', 'DELIVERED', 'CANCELLED');
export type OrderStatus = keyof typeof OrderStatus;

export const ReservationStatus = values('PENDING', 'CONFIRMED', 'REJECTED', 'CANCELLED', 'COMPLETED', 'NO_SHOW');
export type ReservationStatus = keyof typeof ReservationStatus;

export const VisitStatus = values('ACTIVE', 'ENDED', 'EXPIRED');
export type VisitStatus = keyof typeof VisitStatus;

export const QrStatus = values('ACTIVE', 'REVOKED');
export type QrStatus = keyof typeof QrStatus;

export const FloorPlanStatus = values('DRAFT', 'PUBLISHED', 'ARCHIVED');
export type FloorPlanStatus = keyof typeof FloorPlanStatus;

export const TableShape = values('ROUND', 'SQUARE', 'RECTANGLE');
export type TableShape = keyof typeof TableShape;

export const FloorObjectKind = values('WALL', 'DOOR', 'WINDOW', 'PILLAR', 'BAR', 'KITCHEN', 'RESTROOM', 'STAGE', 'PLANT', 'ENTRANCE', 'SCREEN', 'TV', 'OTHER');
export type FloorObjectKind = keyof typeof FloorObjectKind;

export const MenuKind = values('FOOD', 'DRINK');
export type MenuKind = keyof typeof MenuKind;

export const FilePurpose = values('RESTAURANT_IMAGE', 'AVATAR', 'MENU_ITEM', 'TABLE_IMAGE', 'UTENSIL', 'FLOOR_REFERENCE');
export type FilePurpose = keyof typeof FilePurpose;

export const PushDeliveryStatus = values('QUEUED', 'SENT', 'DELIVERED', 'FAILED');
export type PushDeliveryStatus = keyof typeof PushDeliveryStatus;

export const DevicePlatform = values('IOS', 'ANDROID', 'WEB');
export type DevicePlatform = keyof typeof DevicePlatform;
