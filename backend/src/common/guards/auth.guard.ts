import { type CanActivate, type ExecutionContext, HttpStatus, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ErrorCode } from '@servebell/shared';
import { IS_PUBLIC } from '../decorators/public.decorator.js';
import { ALLOW_UNSYNCED, OPTIONAL_AUTH } from '../decorators/auth.decorators.js';
import { AppError } from '../errors.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { AppRequest } from '../request-context.js';
import { IdTokenVerifier } from '../../auth/token-verifier.js';

/**
 * Global guard. Verifies the Supabase access token, then resolves the local user.
 * Routes need a synced profile unless marked @AllowUnsynced (i.e. /auth/sync).
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly verifier: IdTokenVerifier,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    if (ctx.getType() !== 'http') return true;
    const targets = [ctx.getHandler(), ctx.getClass()];
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, targets);
    const optional = this.reflector.getAllAndOverride<boolean>(OPTIONAL_AUTH, targets);
    const allowUnsynced = this.reflector.getAllAndOverride<boolean>(ALLOW_UNSYNCED, targets);
    const req = ctx.switchToHttp().getRequest<AppRequest>();
    const header = req.headers.authorization;
    const token = header?.startsWith('Bearer ') ? header.slice(7) : undefined;

    if (!token) {
      if (isPublic || optional) return true;
      throw new AppError(ErrorCode.UNAUTHENTICATED, 'Authentication required', HttpStatus.UNAUTHORIZED);
    }

    try {
      req.identity = await this.verifier.verify(token);
      req.accessToken = token;
    } catch (e) {
      if (isPublic) return true;
      throw e;
    }

    const user = await this.prisma.user.findUnique({
      where: { authUserId: req.identity.uid },
      select: { id: true, platformRole: true, deletedAt: true, emailVerifiedAt: true },
    });
    if (user?.deletedAt) throw new AppError(ErrorCode.FORBIDDEN, 'This account has been disabled', HttpStatus.FORBIDDEN);
    if (user) req.user = { id: user.id, platformRole: user.platformRole, emailVerified: user.emailVerifiedAt !== null };
    else if (!allowUnsynced && !isPublic && !optional) {
      throw new AppError(ErrorCode.PROFILE_REQUIRED, 'Complete your profile to continue', HttpStatus.FORBIDDEN);
    }
    return true;
  }
}
