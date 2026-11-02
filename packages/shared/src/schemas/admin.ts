import { z } from 'zod';
import type { FloorPlanDraft } from '../floor-plan.js';
import type { FloorObjectKind, FloorPlanStatus, MemberStatus, MenuKind, ReservationStatus, RestaurantRole, RestaurantStatus, ServiceKind, TableShape } from '../enums.js';
import { phoneSchema } from './common.js';
import type { FloorObject, FloorTable } from '../floor-plan.js';

const name = z.string().trim().min(1).max(80);
const optText = (max: number) => z.string().trim().max(max).nullish();

// ── Restaurant profile ──
export const updateRestaurantSchema = z.object({
  name: z.string().trim().min(2).max(100).optional(),
  description: optText(1000),
  phone: phoneSchema.nullish(),
  email: z.email().nullish(),
  addressLine: z.string().trim().min(3).max(200).optional(),
  city: z.string().trim().min(2).max(80).optional(),
  district: optText(80),
  latitude: z.number().min(-90).max(90).nullish(),
  longitude: z.number().min(-180).max(180).nullish(),
  escalationMinutes: z.int().min(1).max(240).optional(),
  coverFileId: z.uuid().nullish(),
});
export type UpdateRestaurantInput = z.infer<typeof updateRestaurantSchema>;

export const openingHoursSchema = z.object({
  hours: z
    .array(z.object({ dayOfWeek: z.int().min(0).max(6), opensMinute: z.int().min(0).max(1439), closesMinute: z.int().min(1).max(2880) }).refine((h) => h.closesMinute > h.opensMinute, 'Closing must be after opening'))
    .max(21),
});
export const restaurantStatusSchema = z.object({ status: z.enum(['ACTIVE', 'DRAFT']) });

export interface ManagedRestaurant {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  phone: string | null;
  email: string | null;
  addressLine: string;
  city: string;
  district: string | null;
  latitude: number | null;
  longitude: number | null;
  status: RestaurantStatus;
  escalationMinutes: number;
  coverUrl: string | null;
  openingHours: { dayOfWeek: number; opensMinute: number; closesMinute: number }[];
}

// ── Menu admin ──
export const menuCategoryInputSchema = z.object({ name, kind: z.enum(['FOOD', 'DRINK']), sortOrder: z.int().min(0).max(999).optional(), isActive: z.boolean().optional() });
export const menuItemInputSchema = z.object({
  categoryId: z.uuid(),
  name,
  description: optText(300),
  priceCents: z.int().min(0).max(100_000_000),
  isAvailable: z.boolean().optional(),
  tags: z.array(z.string().trim().min(1).max(30)).max(10).optional(),
  prepMinutes: z.int().min(0).max(240).nullish(),
  sortOrder: z.int().min(0).max(999).optional(),
  imageFileId: z.uuid().nullish(),
});
export const menuItemPatchSchema = menuItemInputSchema.partial();
export type MenuItemInput = z.infer<typeof menuItemInputSchema>;

// ── Catalog ──
export const utensilInputSchema = z.object({ name, description: optText(200), icon: optText(40), isAvailable: z.boolean().optional(), isActive: z.boolean().optional(), sortOrder: z.int().min(0).max(999).optional() });
export const amenityInputSchema = z.object({ key: z.string().trim().min(2).max(40).regex(/^[a-z0-9-]+$/), name, description: optText(200), icon: optText(40), isActive: z.boolean().optional(), sortOrder: z.int().min(0).max(999).optional() });
export const serviceTypeInputSchema = z.object({
  kind: z.enum(['WAITER', 'UTENSIL', 'WATER', 'BILL', 'CLEANING', 'ASSISTANCE', 'CUSTOM']),
  name,
  description: optText(200),
  icon: optText(40),
  utensilId: z.uuid().nullish(),
  isPrimary: z.boolean().optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.int().min(0).max(999).optional(),
});

export interface UtensilView { id: string; name: string; description: string | null; icon: string | null; isAvailable: boolean; isActive: boolean; sortOrder: number }
export interface AmenityView { id: string; key: string; name: string; description: string | null; icon: string | null; isActive: boolean; sortOrder: number }
export interface ServiceTypeAdminView { id: string; kind: ServiceKind; name: string; description: string | null; icon: string | null; utensilId: string | null; isPrimary: boolean; isActive: boolean; sortOrder: number }
export interface MenuCategoryAdminView { id: string; name: string; kind: MenuKind; sortOrder: number; isActive: boolean; itemCount: number }

// ── Floor plans ──
export type TableStatus = 'AVAILABLE' | 'OCCUPIED' | 'RESERVED' | 'UNAVAILABLE';

export interface FloorPlanTableView extends Required<Pick<FloorTable, 'label' | 'shape' | 'capacity' | 'x' | 'y' | 'width' | 'depth' | 'rotation' | 'isReservable' | 'isActive'>> {
  id: string;
  zone: string | null;
  status: TableStatus;
  imageUrls: string[];
  /** Same order as imageUrls; lets editors keep or remove existing photos. */
  imageFileIds: string[];
  description: string | null;
  features: string[];
}
export interface FloorPlanObjectView extends Required<Pick<FloorObject, 'kind' | 'x' | 'y' | 'width' | 'depth' | 'rotation'>> {
  id: string;
  label: string | null;
  height: number | null;
}
export interface FloorPlanView {
  id: string;
  restaurantId: string;
  name: string;
  widthCm: number;
  depthCm: number;
  status: FloorPlanStatus;
  version: number;
  publishedAt: string | null;
  /** Optional photo/video still traced in the editor (never shown to customers). */
  referenceUrl: string | null;
  tables: FloorPlanTableView[];
  objects: FloorPlanObjectView[];
  /** Staff only: saved draft (not live yet), with when it was saved. */
  draft?: FloorPlanDraft | null;
  draftSavedAt?: string | null;
}
export const floorReferenceSchema = z.object({ fileId: z.uuid().nullable() });
export const createFloorPlanSchema = z.object({ name: z.string().trim().min(1).max(60), widthCm: z.number().min(200).max(100_000), depthCm: z.number().min(200).max(100_000) });

export interface TableDetailView {
  id: string;
  label: string;
  shape: TableShape;
  capacity: number;
  zone: string | null;
  description: string | null;
  features: string[];
  isReservable: boolean;
  status: TableStatus;
  imageUrls: string[];
  floorPlanName: string | null;
  restaurant: { id: string; slug: string; name: string; timezone: string };
  nearby: { kind: FloorObjectKind; label: string | null; distanceM: number }[];
}
export const tableDetailsSchema = z.object({ description: optText(300), features: z.array(z.string().trim().min(1).max(40)).max(10).optional(), imageFileIds: z.array(z.uuid()).max(6).optional() });

// ── QR ──
export interface QrCodeView { tableId: string; tableLabel: string; zone: string | null; qrId: string | null; version: number | null; url: string | null; svg: string | null; status: 'ACTIVE' | 'NONE' }

// ── Reservations ──
export const RESERVATION_MINUTES = 90;
export const availabilityQuerySchema = z.object({ date: z.iso.date(), partySize: z.coerce.number().int().min(1).max(50).default(2) });
/** Book a specific table, or (restaurants without a floor plan) any table: the restaurant assigns one when confirming. */
export const createReservationSchema = z
  .object({ tableId: z.uuid().optional(), restaurantId: z.uuid().optional(), startsAt: z.iso.datetime({ offset: true }), partySize: z.int().min(1).max(50), note: optText(300) })
  .refine((v) => v.tableId || v.restaurantId, { message: 'Choose a table or a restaurant', path: ['tableId'] });
export type CreateReservationInput = z.infer<typeof createReservationSchema>;
export const reservationStatusSchema = z.object({ status: z.enum(['CONFIRMED', 'REJECTED', 'CANCELLED', 'COMPLETED', 'NO_SHOW']), reason: optText(200), /** Assign (or change) the table when confirming. */ tableId: z.uuid().optional() });
export const staffReservationQuerySchema = z.object({ date: z.iso.date().optional(), status: z.enum(['PENDING', 'CONFIRMED', 'REJECTED', 'CANCELLED', 'COMPLETED', 'NO_SHOW']).optional() });

export interface AvailabilitySlot { startsAt: string; endsAt: string; available: boolean }
export interface ReservationView {
  id: string;
  status: ReservationStatus;
  startsAt: string;
  endsAt: string;
  partySize: number;
  note: string | null;
  cancelReason: string | null;
  restaurant: { id: string; slug: string; name: string; timezone: string };
  /** null = "any table" request not yet assigned by the restaurant. */
  table: { id: string; label: string; zone: string | null } | null;
  customer: { id: string; fullName: string; phone: string | null };
  createdAt: string;
}

// ── Simple tables (no floor plan needed) ──
export const tableInputSchema = z.object({
  label: z.string().trim().min(1).max(40),
  capacity: z.int().min(1).max(50),
  shape: z.enum(['ROUND', 'SQUARE', 'RECTANGLE']).default('SQUARE'),
  zone: optText(60),
  isReservable: z.boolean().default(true),
  isActive: z.boolean().default(true),
});
export type TableInput = z.infer<typeof tableInputSchema>;
export interface TableListItem { id: string; label: string; capacity: number; shape: TableShape; zone: string | null; isReservable: boolean; isActive: boolean; floorPlanId: string | null; floorPlanName: string | null; status: 'AVAILABLE' | 'OCCUPIED' | 'RESERVED' | 'UNAVAILABLE' }

// ── Photo → layout suggestion ──
export const detectLayoutSchema = z.object({ fileId: z.uuid() });
export interface DetectedLayout {
  tables: { shape: TableShape; capacity: number; x: number; y: number; width: number; depth: number; rotation: number }[];
  landmarks: { kind: FloorObjectKind; x: number; y: number; width: number; depth: number; rotation: number }[];
  notes: string;
  suggestedRoom: { widthCm: number; depthCm: number };
}

// ── Favourites ──
export interface FavouriteView { restaurantId: string; slug: string; name: string; city: string; coverUrl: string | null; createdAt: string }

// ── Analytics & employees ──
export const analyticsQuerySchema = z.object({
  from: z.iso.datetime({ offset: true }).optional(),
  to: z.iso.datetime({ offset: true }).optional(),
  memberId: z.uuid().optional(),
  serviceTypeId: z.uuid().optional(),
});
export type AnalyticsQuery = z.infer<typeof analyticsQuerySchema>;

export interface EmployeeMetrics { handled: number; completed: number; avgAcceptMs: number | null; avgCompleteMs: number | null }
export interface AnalyticsSummary {
  range: { from: string; to: string };
  services: { total: number; pending: number; accepted: number; inProgress: number; completed: number; cancelled: number; escalated: number; avgAcceptMs: number | null; avgCompleteMs: number | null };
  byType: { serviceTypeId: string; name: string; count: number }[];
  orders: { total: number; pending: number; delivered: number; cancelled: number; revenueCents: number; currency: string };
  reservations: { total: number; pending: number; confirmed: number };
  employees: { total: number; active: number };
  leaderboard: ({ memberId: string; fullName: string; employeeCode: string } & EmployeeMetrics)[];
}

export interface EmployeeCard {
  memberId: string;
  userId: string;
  fullName: string;
  email: string;
  phone: string | null;
  avatarUrl: string | null;
  role: RestaurantRole;
  status: MemberStatus;
  employeeCode: string;
  joinedAt: string;
  today: EmployeeMetrics;
  allTime: EmployeeMetrics;
}
export const updateEmployeeSchema = z.object({ status: z.enum(['ACTIVE', 'SUSPENDED', 'REMOVED']).optional(), role: z.enum(['ADMIN', 'WAITER']).optional() });
