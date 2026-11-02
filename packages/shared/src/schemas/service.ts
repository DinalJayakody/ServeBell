import { z } from 'zod';
import type { MessageSenderRole, ServiceEventType, ServiceKind, ServiceStatus, VisitStatus } from '../enums.js';

// ── Visits ──

export const startVisitSchema = z.object({
  /** Raw token or a full scanned URL (https://…/t/<token>, servebell://t/<token>, exp://…/--/t/<token>). */
  qr: z.string().trim().min(16).max(300),
  guestCount: z.int().min(1).max(50).optional(),
});
export type StartVisitInput = z.infer<typeof startVisitSchema>;

/** Extracts the table token from anything a QR scanner or user might paste. */
export function extractQrToken(input: string): string | null {
  const s = input.trim();
  const m = s.match(/\/t\/([A-Za-z0-9_-]{16,64})(?:[/?#]|$)/) ?? s.match(/^([A-Za-z0-9_-]{16,64})$/);
  return m?.[1] ?? null;
}

export interface ServiceTypeView {
  id: string;
  kind: ServiceKind;
  name: string;
  icon: string | null;
  isPrimary: boolean;
}

export interface VisitView {
  id: string;
  status: VisitStatus;
  startedAt: string;
  expiresAt: string;
  restaurant: { id: string; slug: string; name: string; coverUrl: string | null; currency: string };
  table: { id: string; label: string; capacity: number; zone: string | null };
  guestCount: number | null;
  services: ServiceTypeView[];
}

// ── Service requests ──

export const createServiceRequestSchema = z.object({
  serviceTypeId: z.uuid(),
  quantity: z.int().min(1).max(20).default(1),
  note: z.string().trim().max(280).optional(),
  /** Client-generated; retries with the same key never create a second request. */
  idempotencyKey: z.string().min(8).max(64),
});
export type CreateServiceRequestInput = z.infer<typeof createServiceRequestSchema>;

export const cancelServiceSchema = z.object({ reason: z.string().trim().max(280).optional() });
export const staffCancelServiceSchema = z.object({ reason: z.string().trim().min(2).max(280) });

export const ServiceView = { PENDING: 'pending', MINE: 'mine', OTHERS: 'others', DONE: 'done', ALL: 'all' } as const;
export type ServiceView = (typeof ServiceView)[keyof typeof ServiceView];

export const staffServiceQuerySchema = z.object({
  view: z.enum(['pending', 'mine', 'others', 'done', 'all']).default('pending'),
  status: z.enum(['PENDING', 'ACCEPTED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED']).optional(),
  tableId: z.uuid().optional(),
  serviceTypeId: z.uuid().optional(),
  assigneeId: z.uuid().optional(),
  from: z.iso.datetime({ offset: true }).optional(),
  to: z.iso.datetime({ offset: true }).optional(),
  cursor: z.string().max(12).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});
export type StaffServiceQuery = z.infer<typeof staffServiceQuerySchema>;

export interface StaffRef {
  memberId: string;
  fullName: string;
  avatarUrl: string | null;
  employeeCode: string;
}

export interface ServiceRequestView {
  id: string;
  number: number;
  status: ServiceStatus;
  restaurant: { id: string; name: string };
  table: { id: string; label: string };
  serviceType: ServiceTypeView;
  quantity: number;
  note: string | null;
  customer: { id: string; fullName: string };
  acceptedBy: StaffRef | null;
  completedBy: StaffRef | null;
  createdAt: string;
  acceptedAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  escalationLevel: number;
  lastEscalatedAt: string | null;
  /** Staff only: the caller chose "Wait" on this request. */
  dismissedByMe?: boolean;
  /** Present in list endpoints: the latest message in the conversation. */
  lastMessage?: { body: string; senderRole: MessageSenderRole; senderName: string | null; createdAt: string } | null;
}

export interface ServiceEventView {
  id: string;
  type: ServiceEventType;
  createdAt: string;
  actorName: string | null;
}

export interface ServiceRequestDetail extends ServiceRequestView {
  events: ServiceEventView[];
}

export interface StaffServiceStats {
  pending: number;
  mineOpen: number;
  othersOpen: number;
  completedToday: number;
  avgAcceptMs: number | null;
  avgCompleteMs: number | null;
}

// ── Messages ──

export const sendMessageSchema = z.object({
  body: z.string().trim().min(1).max(1000),
  clientMessageId: z.string().min(8).max(64),
});
export type SendMessageInput = z.infer<typeof sendMessageSchema>;

export interface ServiceMessageView {
  id: string;
  requestId: string;
  senderRole: MessageSenderRole;
  senderName: string | null;
  senderUserId: string | null;
  body: string;
  clientMessageId: string | null;
  createdAt: string;
}

// ── Notifications ──

export interface NotificationView {
  id: string;
  type: string;
  title: string;
  body: string;
  data: Record<string, unknown> | null;
  restaurantId: string | null;
  readAt: string | null;
  createdAt: string;
}
