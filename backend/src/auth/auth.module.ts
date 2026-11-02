import { Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { IdTokenVerifier, SupabaseJwtVerifier } from './token-verifier.js';
import { AuthGuard } from '../common/guards/auth.guard.js';
import { RestaurantAccessGuard } from '../common/guards/restaurant-access.guard.js';
import { PlatformAdminGuard } from '../common/guards/platform-admin.guard.js';

@Global()
@Module({
  controllers: [AuthController],
  providers: [
    AuthService,
    { provide: IdTokenVerifier, useClass: SupabaseJwtVerifier },
    { provide: APP_GUARD, useClass: AuthGuard },
    RestaurantAccessGuard,
    PlatformAdminGuard,
  ],
  exports: [AuthService, IdTokenVerifier, RestaurantAccessGuard, PlatformAdminGuard],
})
export class AuthModule {}
