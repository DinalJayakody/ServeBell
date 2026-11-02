import { z } from 'zod';

export const idSchema = z.uuid();
export const idParamSchema = z.object({ id: idSchema });

export const paginationQuerySchema = z.object({
  cursor: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

export const dateRangeQuerySchema = z.object({
  from: z.iso.datetime({ offset: true }).optional(),
  to: z.iso.datetime({ offset: true }).optional(),
});

/** Every error response from the API has this shape. */
export interface ApiErrorBody {
  statusCode: number;
  code: string;
  message: string;
  details?: { path: string; message: string }[];
  requestId?: string;
}

export const ErrorCode = {
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  UNAUTHENTICATED: 'UNAUTHENTICATED',
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',
  /** Valid access token, but POST /auth/sync hasn't created the local profile yet. */
  PROFILE_REQUIRED: 'PROFILE_REQUIRED',
  /** Action requires a confirmed email address (Supabase Auth email_confirmed_at). */
  EMAIL_NOT_VERIFIED: 'EMAIL_NOT_VERIFIED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  ALREADY_ACCEPTED: 'ALREADY_ACCEPTED',
  INVALID_TRANSITION: 'INVALID_TRANSITION',
  RATE_LIMITED: 'RATE_LIMITED',
  QR_INVALID: 'QR_INVALID',
  VISIT_REQUIRED: 'VISIT_REQUIRED',
  TABLE_UNAVAILABLE: 'TABLE_UNAVAILABLE',
  STALE_VERSION: 'STALE_VERSION',
  /** An optional server feature (e.g. photo detection) is not configured or temporarily down. */
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
  INTERNAL: 'INTERNAL',
} as const;
export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

/** Sri Lankan phone numbers in E.164 or local 0XXXXXXXXX form; normalised server-side. */
export const phoneSchema = z.string().trim().regex(/^(\+94\d{9}|0\d{9})$/, 'Enter a valid Sri Lankan phone number');
