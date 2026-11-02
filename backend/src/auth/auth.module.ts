import { Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { FirebaseIdTokenVerifier, IdTokenVerifier } from './firebase-token.verifier.js';
import { FirebaseAuthGuard } from '../common/guards/firebase-auth.guard.js';
import { RestaurantAccessGuard } from '../common/guards/restaurant-access.guard.js';
import { PlatformAdminGuard } from '../common/guards/platform-admin.guard.js';

@Global()
@Module({
  controllers: [AuthController],
  providers: [
    AuthService,
    { provide: IdTokenVerifier, useClass: FirebaseIdTokenVerifier },
    { provide: APP_GUARD, useClass: FirebaseAuthGuard },
    RestaurantAccessGuard,
    PlatformAdminGuard,
  ],
  exports: [AuthService, IdTokenVerifier, RestaurantAccessGuard, PlatformAdminGuard],
})
export class AuthModule {}
