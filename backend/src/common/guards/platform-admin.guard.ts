import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { Errors } from '../errors.js';
import type { AppRequest } from '../request-context.js';

/** Re-checks the platform role in the database rather than trusting the token claim. */
@Injectable()
export class PlatformAdminGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<AppRequest>();
    if (!req.user) throw Errors.unauthenticated();
    const user = await this.prisma.user.findUnique({ where: { id: req.user.id }, select: { platformRole: true, deletedAt: true } });
    if (!user || user.deletedAt || user.platformRole !== 'PLATFORM_ADMIN') throw Errors.forbidden();
    return true;
  }
}
