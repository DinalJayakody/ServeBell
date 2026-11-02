import type { Request } from 'express';
import type { PlatformRole, RestaurantRole } from '@servebell/shared';
import type { FirebaseIdentity } from '../auth/firebase-token.verifier.js';

/** Local user resolved from the verified Firebase UID. */
export interface AuthUser {
  id: string;
  platformRole: PlatformRole;
}

export interface RestaurantMembershipContext {
  memberId: string;
  restaurantId: string;
  role: RestaurantRole;
}

export interface AppRequest extends Request {
  firebase?: FirebaseIdentity;
  user?: AuthUser;
  membership?: RestaurantMembershipContext;
}
