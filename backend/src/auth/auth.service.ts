import { HttpStatus, Injectable } from '@nestjs/common';
import { ErrorCode, type SessionUser, type SyncProfileInput, type UpdateProfileInput } from '@servebell/shared';
import { PrismaService } from '../common/prisma/prisma.service.js';
import { AppError, Errors } from '../common/errors.js';
import { AuditService } from '../audit/audit.service.js';
import { IdTokenVerifier, type AuthIdentity } from './token-verifier.js';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly verifier: IdTokenVerifier,
  ) {}

  /**
   * Idempotent: creates the local profile on first sign-in, afterwards keeps the
   * email/verification mirror in step with Supabase Auth. Profile fields from the
   * client are only used to fill blanks, never to change identity.
   *
   * A profile that predates Supabase Auth (created under Firebase) is linked to
   * the Supabase user with the same email, but only once Supabase has confirmed
   * that the address belongs to them.
   */
  async sync(identity: AuthIdentity, accessToken: string, input: SyncProfileInput, ip?: string): Promise<SessionUser> {
    const account = await this.verifier.account(accessToken);
    const email = account.email ?? identity.email;
    if (!email) {
      throw new AppError(ErrorCode.VALIDATION_FAILED, 'Your sign-in method did not share an email address', HttpStatus.BAD_REQUEST);
    }
    const verifiedNow = account.emailVerified ? new Date() : null;
    const fullName = input.fullName ?? identity.metadata.fullName ?? identity.name;
    const phone = normalisePhone(input.phone ?? identity.metadata.phone);
    const existing = await this.prisma.user.findUnique({ where: { authUserId: identity.uid } });

    if (existing) {
      if (existing.deletedAt) throw Errors.forbidden('This account has been disabled');
      await this.prisma.user.update({
        where: { id: existing.id },
        data: {
          email,
          // Mirror Supabase Auth: set once confirmed (an address is never un-confirmed).
          emailVerifiedAt: existing.emailVerifiedAt ?? verifiedNow,
          phone: existing.phone ?? phone,
          lastLoginAt: new Date(),
          customerProfile: input.app === 'CUSTOMER' ? { upsert: { create: {}, update: {} } } : undefined,
        },
      });
      return this.me(existing.id);
    }

    const sameEmail = await this.prisma.user.findUnique({ where: { email } });
    if (sameEmail) {
      // Linked to a different Supabase user: never let a second account take it over.
      if (sameEmail.authUserId) throw Errors.conflict('This email is linked to another account. Contact support.');
      if (sameEmail.deletedAt) throw Errors.forbidden('This account has been disabled');
      if (!account.emailVerified) throw Errors.emailNotVerified();
      await this.prisma.user.update({
        where: { id: sameEmail.id },
        data: {
          authUserId: identity.uid,
          emailVerifiedAt: sameEmail.emailVerifiedAt ?? verifiedNow,
          phone: sameEmail.phone ?? phone,
          lastLoginAt: new Date(),
          customerProfile: input.app === 'CUSTOMER' ? { upsert: { create: {}, update: {} } } : undefined,
        },
      });
      await this.audit.record({
        action: 'auth.account_linked',
        entityType: 'User',
        entityId: sameEmail.id,
        actorUserId: sameEmail.id,
        ip,
        meta: { provider: identity.provider, app: input.app, legacyFirebase: Boolean(sameEmail.firebaseUid) },
      });
      return this.me(sameEmail.id);
    }

    const user = await this.prisma.user.create({
      data: {
        authUserId: identity.uid,
        email,
        emailVerifiedAt: verifiedNow,
        fullName: fullName ?? email.split('@')[0]!,
        phone,
        lastLoginAt: new Date(),
        customerProfile: input.app === 'CUSTOMER' ? { create: {} } : undefined,
      },
    });
    await this.audit.record({
      action: 'auth.profile_created',
      entityType: 'User',
      entityId: user.id,
      actorUserId: user.id,
      ip,
      meta: { provider: identity.provider, app: input.app },
    });
    return this.me(user.id);
  }

  async updateProfile(userId: string, input: UpdateProfileInput): Promise<SessionUser> {
    if (input.avatarFileId) {
      const file = await this.prisma.fileObject.findFirst({
        where: { id: input.avatarFileId, uploaderId: userId, purpose: 'AVATAR', status: 'READY' },
        select: { id: true },
      });
      if (!file) throw Errors.badRequest('Avatar upload not found');
    }
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        fullName: input.fullName,
        phone: input.phone === null ? null : normalisePhone(input.phone) ?? undefined,
        avatarFileId: input.avatarFileId,
      },
    });
    return this.me(userId);
  }

  async me(userId: string): Promise<SessionUser> {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      include: {
        memberships: {
          where: { status: 'ACTIVE', restaurant: { deletedAt: null } },
          include: { restaurant: { select: { name: true } } },
          orderBy: { joinedAt: 'asc' },
        },
        avatar: { select: { storageKey: true } },
      },
    });
    if (!user) throw Errors.unauthenticated();
    return {
      id: user.id,
      email: user.email,
      emailVerified: user.emailVerifiedAt !== null,
      fullName: user.fullName,
      phone: user.phone,
      avatarUrl: user.avatar ? `/api/v1/uploads/files/${user.avatar.storageKey}` : null,
      platformRole: user.platformRole,
      memberships: user.memberships.map((m) => ({
        memberId: m.id,
        restaurantId: m.restaurantId,
        restaurantName: m.restaurant.name,
        role: m.role,
        employeeCode: m.employeeCode,
      })),
    };
  }
}

/** Stores Sri Lankan numbers in E.164. */
export function normalisePhone(phone?: string | null) {
  if (!phone) return null;
  return phone.startsWith('0') ? `+94${phone.slice(1)}` : phone;
}
