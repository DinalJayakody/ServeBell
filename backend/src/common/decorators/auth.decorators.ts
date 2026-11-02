import { createParamDecorator, type ExecutionContext, SetMetadata, applyDecorators, UseGuards } from '@nestjs/common';
import { ApiBearerAuth } from '@nestjs/swagger';
import type { Permission } from '@servebell/shared';
import type { AppRequest } from '../request-context.js';
import { RestaurantAccessGuard } from '../guards/restaurant-access.guard.js';
import { PlatformAdminGuard } from '../guards/platform-admin.guard.js';

export const OPTIONAL_AUTH = 'optionalAuth';
/** Route works for guests, but attaches the user when a valid token is present. */
export const OptionalAuth = () => SetMetadata(OPTIONAL_AUTH, true);

export const ALLOW_UNSYNCED = 'allowUnsynced';
/** Route accepts a verified Supabase Auth user that has no local profile yet. */
export const AllowUnsynced = () => SetMetadata(ALLOW_UNSYNCED, true);

export const AuthIdentityParam = createParamDecorator((_: unknown, ctx: ExecutionContext) => {
  return ctx.switchToHttp().getRequest<AppRequest>().identity;
});

export const PERMISSION = 'restaurantPermission';
/**
 * Requires an ACTIVE membership in the restaurant named by the `:restaurantId`
 * route param and the given permission. Loaded from the database per request,
 * so role changes and removals apply immediately.
 */
export const RequirePermission = (permission: Permission) =>
  applyDecorators(SetMetadata(PERMISSION, permission), UseGuards(RestaurantAccessGuard), ApiBearerAuth());

export const RequirePlatformAdmin = () => applyDecorators(UseGuards(PlatformAdminGuard), ApiBearerAuth());

export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext) => {
  return ctx.switchToHttp().getRequest<AppRequest>().user;
});

export const CurrentMembership = createParamDecorator((_: unknown, ctx: ExecutionContext) => {
  return ctx.switchToHttp().getRequest<AppRequest>().membership;
});
