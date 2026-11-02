import { HttpStatus, Injectable } from '@nestjs/common';
import { ErrorCode, type SessionUser, type SyncProfileInput, type UpdateProfileInput } from '@servebell/shared';
import { PrismaService } from '../common/prisma/prisma.service.js';
import { AppError, Errors } from '../common/errors.js';
import { AuditService } from '../audit/audit.service.js';
import type { FirebaseIdentity } from './firebase-token.verifier.js';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Idempotent: creates the local profile on first sign-in, afterwards keeps the
   * email/verification mirror in step with Firebase. Profile fields from the
   * client are only used to fill blanks, never to change identity.
   */
  async sync(identity: FirebaseIdentity, input: SyncProfileInput, ip?: string): Promise<SessionUser> {
    if (!identity.email) {
      throw new AppError(ErrorCode.VALIDATION_FAILED, 'Your sign-in method did not share an email address', HttpStatus.BAD_REQUEST);
    }
    const emailVerifiedAt = identity.emailVerified ? new Date() : null;
    const existing = await this.prisma.user.findUnique({ where: { firebaseUid: identity.uid } });

    if (existing) {
      if (existing.deletedAt) throw Errors.forbidden('This account has been disabled');
      await this.prisma.user.update({
        where: { id: existing.id },
        data: {
          email: identity.email,
          // Mirror Firebase: set once verified (Firebase never un-verifies an address).
          emailVerifiedAt: existing.emailVerifiedAt ?? emailVerifiedAt,
          phone: existing.phone ?? normalisePhone(input.phone),
          lastLoginAt: new Date(),
          customerProfile: input.app === 'CUSTOMER' ? { upsert: { create: {}, update: {} } } : undefined,
        },
      });
      return this.me(existing.id);
    }

    // An email can only belong to one Firebase account, but guard against a
    // stale row (e.g. a Firebase user deleted and re-created) hijacking data.
    const clash = await this.prisma.user.findUnique({ where: { email: identity.email }, select: { id: true } });
    if (clash) throw Errors.conflict('This email is linked to another account. Contact support.');

    const user = await this.prisma.user.create({
      data: {
        firebaseUid: identity.uid,
        email: identity.email,
        emailVerifiedAt,
        fullName: input.fullName ?? identity.name ?? identity.email.split('@')[0]!,
        phone: normalisePhone(input.phone),
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
      meta: { provider: identity.signInProvider, app: input.app },
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
