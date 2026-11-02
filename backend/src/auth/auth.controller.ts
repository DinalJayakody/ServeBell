import { Body, Controller, Get, HttpCode, Patch, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { syncProfileSchema, updateProfileSchema, type SyncProfileInput, type UpdateProfileInput } from '@servebell/shared';
import { AuthService } from './auth.service.js';
import { ZodPipe } from '../common/pipes/zod-validation.pipe.js';
import { AllowUnsynced, AuthIdentityParam, CurrentUser } from '../common/decorators/auth.decorators.js';
import type { AppRequest, AuthUser } from '../common/request-context.js';
import type { AuthIdentity } from './token-verifier.js';

/**
 * Credentials (sign-up, sign-in, email confirmation, password reset, refresh)
 * are handled by Supabase Auth on the client. These endpoints manage the local profile.
 */
@ApiTags('auth')
@ApiBearerAuth()
@Controller({ path: 'auth', version: '1' })
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @AllowUnsynced()
  @HttpCode(200)
  @Post('sync')
  @ApiOperation({ summary: 'Create/refresh the local profile after a Supabase sign-in (Supabase access token required)' })
  sync(@AuthIdentityParam() identity: AuthIdentity, @Body(new ZodPipe(syncProfileSchema)) body: SyncProfileInput, @Req() req: AppRequest) {
    return this.auth.sync(identity, req.accessToken!, body, req.ip);
  }

  @Get('me')
  @ApiOperation({ summary: 'Current user with restaurant memberships (authenticated)' })
  me(@CurrentUser() user: AuthUser) {
    return this.auth.me(user.id);
  }

  @Patch('me')
  @ApiOperation({ summary: 'Update name, phone or avatar (authenticated)' })
  update(@CurrentUser() user: AuthUser, @Body(new ZodPipe(updateProfileSchema)) body: UpdateProfileInput) {
    return this.auth.updateProfile(user.id, body);
  }
}
