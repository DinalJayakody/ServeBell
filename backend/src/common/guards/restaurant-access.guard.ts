import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { hasPermission, type Permission } from '@servebell/shared';
import { z } from 'zod';
import { PrismaService } from '../prisma/prisma.service.js';
import { PERMISSION } from '../decorators/auth.decorators.js';
import { Errors } from '../errors.js';
import type { AppRequest } from '../request-context.js';

const uuid = z.uuid();

@Injectable()
export class RestaurantAccessGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<AppRequest>();
    const permission = this.reflector.getAllAndOverride<Permission>(PERMISSION, [ctx.getHandler(), ctx.getClass()]);
    const restaurantId = req.params['restaurantId'];
    if (!req.user) throw Errors.unauthenticated();
    if (!permission || typeof restaurantId !== 'string' || !uuid.safeParse(restaurantId).success) {
      throw Errors.forbidden();
    }
    const member = await this.prisma.restaurantMember.findUnique({
      where: { restaurantId_userId: { restaurantId, userId: req.user.id } },
      select: { id: true, role: true, status: true, restaurant: { select: { deletedAt: true } } },
    });
    // Same response for "not a member" and "lacks permission" to avoid leaking which restaurants exist.
    if (!member || member.status !== 'ACTIVE' || member.restaurant.deletedAt || !hasPermission(member.role, permission)) {
      throw Errors.forbidden();
    }
    req.membership = { memberId: member.id, restaurantId, role: member.role };
    return true;
  }
}
