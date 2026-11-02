import type { Request } from 'express';
import type { PlatformRole, RestaurantRole } from '@servebell/shared';
import type { AuthIdentity } from '../auth/token-verifier.js';

/** Local user resolved from the verified Supabase Auth user id. */
export interface AuthUser {
  id: string;
  platformRole: PlatformRole;
  /** Mirrors Supabase Auth `email_confirmed_at`, refreshed on every /auth/sync. */
  emailVerified: boolean;
}

export interface RestaurantMembershipContext {
  memberId: string;
  restaurantId: string;
  role: RestaurantRole;
}

export interface AppRequest extends Request {
  identity?: AuthIdentity;
  /** Raw bearer token, needed by /auth/sync to read the account from Supabase Auth. */
  accessToken?: string;
  user?: AuthUser;
  membership?: RestaurantMembershipContext;
}
