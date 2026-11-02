import { Injectable } from '@nestjs/common';
import type { CreateInvitationInput, RestaurantRole } from '@servebell/shared';
import { PrismaService } from '../common/prisma/prisma.service.js';
import { Errors } from '../common/errors.js';
import { humanCode, hmac } from '../common/crypto.js';
import { AppConfig } from '../config/config.module.js';
import { AuditService } from '../audit/audit.service.js';
import { MailService } from '../mail/mail.service.js';
import type { Prisma } from '../generated/prisma/client.js';

const INVITE_TTL_MS = 7 * 86_400_000;

@Injectable()
export class InvitationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfig,
    private readonly audit: AuditService,
    private readonly mail: MailService,
  ) {}

  private hash(code: string) {
    return hmac(this.config.env.TOKEN_HASH_SECRET, code.trim().toUpperCase());
  }

  /** Only owners may invite admins; admins may invite waiters. */
  async create(restaurantId: string, inviter: { userId: string; role: RestaurantRole }, input: CreateInvitationInput) {
    if (input.role === 'ADMIN' && inviter.role !== 'OWNER') throw Errors.forbidden('Only the owner can invite administrators');
    const existingMember = await this.prisma.restaurantMember.findFirst({
      where: { restaurantId, status: 'ACTIVE', user: { email: input.email } },
      select: { id: true },
    });
    if (existingMember) throw Errors.conflict('This person is already a member of the restaurant');

    const code = humanCode(8);
    const restaurant = await this.prisma.restaurant.findUniqueOrThrow({ where: { id: restaurantId }, select: { name: true } });
    const invitation = await this.prisma.$transaction(async (tx) => {
      // A newer invitation for the same email supersedes older open ones.
      await tx.employeeInvitation.updateMany({
        where: { restaurantId, email: input.email, acceptedAt: null, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      const inv = await tx.employeeInvitation.create({
        data: {
          restaurantId,
          email: input.email,
          role: input.role,
          codeHash: this.hash(code),
          invitedById: inviter.userId,
          expiresAt: new Date(Date.now() + INVITE_TTL_MS),
        },
        select: { id: true, email: true, role: true, expiresAt: true, createdAt: true },
      });
      await this.audit.record(
        { action: 'invitation.created', entityType: 'EmployeeInvitation', entityId: inv.id, actorUserId: inviter.userId, restaurantId, meta: { role: input.role } },
        tx,
      );
      return inv;
    });
    await this.mail.send(
      input.email,
      `You're invited to join ${restaurant.name} on ServeBell`,
      `Install the ServeBell Restaurant app, sign in with ${input.email}, and enter this invitation code:\n\n${code}\n\nThe code expires in 7 days.`,
    );
    // The plain code is returned once so the inviter can share it directly (e.g. in person).
    return { ...invitation, code };
  }

  list(restaurantId: string) {
    return this.prisma.employeeInvitation.findMany({
      where: { restaurantId, acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } },
      select: { id: true, email: true, role: true, expiresAt: true, createdAt: true, invitedBy: { select: { fullName: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async revoke(restaurantId: string, invitationId: string, actorUserId: string) {
    const res = await this.prisma.employeeInvitation.updateMany({
      where: { id: invitationId, restaurantId, acceptedAt: null, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (res.count === 0) throw Errors.notFound('Invitation');
    await this.audit.record({ action: 'invitation.revoked', entityType: 'EmployeeInvitation', entityId: invitationId, actorUserId, restaurantId });
  }

  /**
   * Redeems a code for the signed-in user. The code is bound to the invited
   * email, so a leaked code is useless to anyone else.
   */
  async redeem(user: { id: string; email: string }, code: string) {
    return this.prisma.$transaction(async (tx) => {
      const inv = await tx.employeeInvitation.findUnique({ where: { codeHash: this.hash(code) } });
      if (!inv || inv.revokedAt || inv.acceptedAt || inv.expiresAt < new Date() || inv.email !== user.email) {
        throw Errors.badRequest('This invitation code is invalid or has expired');
      }
      const claimed = await tx.employeeInvitation.updateMany({ where: { id: inv.id, acceptedAt: null }, data: { acceptedAt: new Date() } });
      if (claimed.count !== 1) throw Errors.badRequest('This invitation code has already been used');

      const member = await this.upsertMember(tx, inv.restaurantId, user.id, inv.role);
      await this.audit.record(
        { action: 'invitation.accepted', entityType: 'RestaurantMember', entityId: member.id, actorUserId: user.id, restaurantId: inv.restaurantId, meta: { role: inv.role } },
        tx,
      );
      return { restaurantId: inv.restaurantId, role: inv.role, memberId: member.id };
    });
  }

  private async upsertMember(tx: Prisma.TransactionClient, restaurantId: string, userId: string, role: RestaurantRole) {
    const existing = await tx.restaurantMember.findUnique({ where: { restaurantId_userId: { restaurantId, userId } } });
    if (existing?.status === 'ACTIVE') throw Errors.conflict('You are already a member of this restaurant');
    if (existing) return tx.restaurantMember.update({ where: { id: existing.id }, data: { role, status: 'ACTIVE' } });
    return tx.restaurantMember.create({ data: { restaurantId, userId, role, employeeCode: await nextEmployeeCode(tx, restaurantId) } });
  }
}

/** Sequential, human-friendly employee IDs per restaurant: EMP-0001, EMP-0002, ... */
export async function nextEmployeeCode(tx: Prisma.TransactionClient, restaurantId: string) {
  const count = await tx.restaurantMember.count({ where: { restaurantId } });
  return `EMP-${String(count + 1).padStart(4, '0')}`;
}
