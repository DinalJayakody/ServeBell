import { z } from 'zod';
import { ClientApp, RestaurantRole, PlatformRole, DevicePlatform } from '../enums.js';
import { phoneSchema } from './common.js';

/**
 * Authentication is handled by Firebase Auth on the client (email/password,
 * Google, Apple, password reset, token refresh). The API receives a Firebase ID
 * token as `Authorization: Bearer <token>` and only manages profile + roles.
 */

// Normalise first: Zod 4 runs format checks before chained transforms.
const email = z.string().trim().toLowerCase().max(254).pipe(z.email('Enter a valid email address'));
export const passwordSchema = z
  .string()
  .min(8, 'Use at least 8 characters')
  .max(128)
  .regex(/[A-Za-z]/, 'Include a letter')
  .regex(/\d/, 'Include a number');

const app = z.enum(Object.values(ClientApp) as [ClientApp, ...ClientApp[]]);
const fullName = z.string().trim().min(2, 'Enter your name').max(80);

// ── Client-side forms (React Hook Form) ──
export const signUpFormSchema = z
  .object({ fullName, email, password: passwordSchema, confirmPassword: z.string(), phone: phoneSchema.optional().or(z.literal('')) })
  .refine((v) => v.password === v.confirmPassword, { path: ['confirmPassword'], message: 'Passwords do not match' });
export type SignUpForm = z.infer<typeof signUpFormSchema>;

export const signInFormSchema = z.object({ email, password: z.string().min(1, 'Enter your password').max(128) });
export type SignInForm = z.infer<typeof signInFormSchema>;

export const forgotPasswordFormSchema = z.object({ email });

// ── API contracts ──

/** Called after every Firebase sign-in/sign-up; creates or updates the local profile. */
export const syncProfileSchema = z.object({
  fullName: fullName.optional(),
  phone: phoneSchema.optional(),
  app,
});
export type SyncProfileInput = z.infer<typeof syncProfileSchema>;

export const updateProfileSchema = z.object({
  fullName: fullName.optional(),
  phone: phoneSchema.nullable().optional(),
  avatarFileId: z.uuid().nullable().optional(),
});
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

/** Signed-in Firebase user joins a restaurant with an invitation code. */
export const redeemInvitationSchema = z.object({
  invitationCode: z.string().trim().min(6).max(64),
  phone: phoneSchema.optional(),
});
export type RedeemInvitationInput = z.infer<typeof redeemInvitationSchema>;

export const createInvitationSchema = z.object({
  email,
  role: z.enum(['ADMIN', 'WAITER'] as const),
});
export type CreateInvitationInput = z.infer<typeof createInvitationSchema>;

export const ownerOnboardingSchema = z.object({
  restaurantName: z.string().trim().min(2).max(100),
  addressLine: z.string().trim().min(3).max(200),
  city: z.string().trim().min(2).max(80),
  phone: phoneSchema,
  businessRegistrationNo: z.string().trim().max(60).optional(),
  note: z.string().trim().max(1000).optional(),
});
export type OwnerOnboardingInput = z.infer<typeof ownerOnboardingSchema>;

export const reviewOnboardingSchema = z.object({
  decision: z.enum(['APPROVED', 'REJECTED']),
  reviewNote: z.string().trim().max(1000).optional(),
});
export type ReviewOnboardingInput = z.infer<typeof reviewOnboardingSchema>;

export const registerDeviceSchema = z.object({
  expoPushToken: z.string().regex(/^(ExponentPushToken|ExpoPushToken)\[[^\]]+\]$/),
  platform: z.enum(Object.values(DevicePlatform) as [DevicePlatform, ...DevicePlatform[]]),
  app,
});
export type RegisterDeviceInput = z.infer<typeof registerDeviceSchema>;

export interface MembershipSummary {
  memberId: string;
  restaurantId: string;
  restaurantName: string;
  role: RestaurantRole;
  employeeCode: string;
}

export interface SessionUser {
  id: string;
  email: string;
  emailVerified: boolean;
  fullName: string;
  phone: string | null;
  avatarUrl: string | null;
  platformRole: PlatformRole;
  memberships: MembershipSummary[];
}
