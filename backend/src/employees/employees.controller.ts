import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { createInvitationSchema, Permission, redeemInvitationSchema, type CreateInvitationInput, type RedeemInvitationInput } from '@servebell/shared';
import { InvitationsService } from './invitations.service.js';
import { ZodPipe } from '../common/pipes/zod-validation.pipe.js';
import { CurrentMembership, CurrentUser, RequirePermission } from '../common/decorators/auth.decorators.js';
import { Errors } from '../common/errors.js';
import type { AuthUser, RestaurantMembershipContext } from '../common/request-context.js';
import { PrismaService } from '../common/prisma/prisma.service.js';
import { AuthService } from '../auth/auth.service.js';

@ApiTags('employees')
@Controller({ version: '1' })
export class EmployeesController {
  constructor(
    private readonly invitations: InvitationsService,
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
  ) {}

  @RequirePermission(Permission.EMPLOYEES_MANAGE)
  @Post('restaurants/:restaurantId/invitations')
  @ApiOperation({ summary: 'Invite an employee (OWNER/ADMIN; only OWNER can invite ADMIN)' })
  create(
    @Param('restaurantId') restaurantId: string,
    @CurrentMembership() m: RestaurantMembershipContext,
    @CurrentUser() user: AuthUser,
    @Body(new ZodPipe(createInvitationSchema)) body: CreateInvitationInput,
  ) {
    return this.invitations.create(restaurantId, { userId: user.id, role: m.role }, body);
  }

  @RequirePermission(Permission.EMPLOYEES_MANAGE)
  @Get('restaurants/:restaurantId/invitations')
  @ApiOperation({ summary: 'List open invitations (OWNER/ADMIN)' })
  list(@Param('restaurantId') restaurantId: string) {
    return this.invitations.list(restaurantId);
  }

  @RequirePermission(Permission.EMPLOYEES_MANAGE)
  @HttpCode(204)
  @Delete('restaurants/:restaurantId/invitations/:id')
  @ApiOperation({ summary: 'Revoke an invitation (OWNER/ADMIN)' })
  async revoke(@Param('restaurantId') restaurantId: string, @Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    await this.invitations.revoke(restaurantId, id, user.id);
  }

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('invitations/redeem')
  @ApiOperation({ summary: 'Join a restaurant with an invitation code (authenticated; code bound to email)' })
  async redeem(@CurrentUser() user: AuthUser, @Body(new ZodPipe(redeemInvitationSchema)) body: RedeemInvitationInput) {
    // The code is bound to an email, so the email must be proven to belong to this person.
    if (!user.emailVerified) throw Errors.emailNotVerified();
    const { email } = await this.prisma.user.findUniqueOrThrow({ where: { id: user.id }, select: { email: true } });
    if (body.phone) await this.auth.updateProfile(user.id, { phone: body.phone });
    const result = await this.invitations.redeem({ id: user.id, email }, body.invitationCode);
    return { ...result, user: await this.auth.me(user.id) };
  }
}
