import { Injectable } from '@nestjs/common';
import type { OwnerOnboardingInput, ReviewOnboardingInput } from '@servebell/shared';
import { PrismaService } from '../common/prisma/prisma.service.js';
import { Errors } from '../common/errors.js';
import { humanCode } from '../common/crypto.js';
import { AuditService } from '../audit/audit.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { normalisePhone } from '../auth/auth.service.js';
import { nextEmployeeCode } from '../employees/invitations.service.js';
import { DEFAULT_SERVICE_TYPES, slugify } from './default-services.js';

@Injectable()
export class OnboardingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  async apply(userId: string, input: OwnerOnboardingInput) {
    const pending = await this.prisma.ownerOnboardingRequest.findFirst({ where: { applicantId: userId, status: 'PENDING' }, select: { id: true } });
    if (pending) throw Errors.conflict('You already have an application under review');
    const req = await this.prisma.ownerOnboardingRequest.create({
      data: { ...input, phone: normalisePhone(input.phone)!, applicantId: userId },
    });
    await this.audit.record({ action: 'onboarding.applied', entityType: 'OwnerOnboardingRequest', entityId: req.id, actorUserId: userId });
    // Tell every platform administrator there is something to review.
    const admins = await this.prisma.user.findMany({ where: { platformRole: 'PLATFORM_ADMIN', deletedAt: null }, select: { id: true } });
    await this.notifications.notify(admins.map((a) => a.id), {
      type: 'onboarding.applied', title: 'New restaurant application', body: `${req.restaurantName} · ${req.city}`,
      app: 'RESTAURANT', dedupeKey: `onboarding.applied:${req.id}`, data: { applicationId: req.id },
    });
    return req;
  }

  listMine(userId: string) {
    return this.prisma.ownerOnboardingRequest.findMany({ where: { applicantId: userId }, orderBy: { createdAt: 'desc' } });
  }

  listForReview(status: 'PENDING' | 'APPROVED' | 'REJECTED' = 'PENDING') {
    return this.prisma.ownerOnboardingRequest.findMany({
      where: { status },
      include: { applicant: { select: { id: true, fullName: true, email: true, phone: true } } },
      orderBy: { createdAt: 'asc' },
      take: 100,
    });
  }

  /** Approval creates the restaurant, the OWNER membership and default services atomically. */
  async review(requestId: string, reviewerId: string, input: ReviewOnboardingInput) {
    const result = await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.ownerOnboardingRequest.updateMany({
        where: { id: requestId, status: 'PENDING' },
        data: { status: input.decision, reviewedById: reviewerId, reviewedAt: new Date(), reviewNote: input.reviewNote },
      });
      if (claimed.count !== 1) throw Errors.conflict('This application has already been reviewed');
      const req = await tx.ownerOnboardingRequest.findUniqueOrThrow({ where: { id: requestId } });

      if (input.decision === 'APPROVED') {
        const base = slugify(req.restaurantName);
        const taken = await tx.restaurant.findUnique({ where: { slug: base }, select: { id: true } });
        const restaurant = await tx.restaurant.create({
          data: {
            name: req.restaurantName,
            slug: taken ? `${base}-${humanCode(4).toLowerCase()}` : base,
            addressLine: req.addressLine,
            city: req.city,
            phone: req.phone,
            status: 'DRAFT',
            serviceTypes: { create: DEFAULT_SERVICE_TYPES.map((s, i) => ({ ...s, sortOrder: i })) },
          },
        });
        await tx.restaurantMember.create({
          data: { restaurantId: restaurant.id, userId: req.applicantId, role: 'OWNER', employeeCode: await nextEmployeeCode(tx, restaurant.id) },
        });
        await tx.ownerOnboardingRequest.update({ where: { id: req.id }, data: { restaurantId: restaurant.id } });
      }
      await this.audit.record(
        { action: `onboarding.${input.decision.toLowerCase()}`, entityType: 'OwnerOnboardingRequest', entityId: req.id, actorUserId: reviewerId },
        tx,
      );
      return tx.ownerOnboardingRequest.findUniqueOrThrow({ where: { id: req.id } });
    });
    const approved = result.status === 'APPROVED';
    await this.notifications.notify([result.applicantId], {
      type: approved ? 'onboarding.approved' : 'onboarding.rejected',
      title: approved ? 'Your restaurant is approved 🎉' : 'Restaurant application update',
      body: approved ? `${result.restaurantName} is ready. Open Manage to add your menu, floor plan and go live.` : `${result.restaurantName} was not approved${result.reviewNote ? `: ${result.reviewNote}` : '.'}`,
      app: 'RESTAURANT', restaurantId: result.restaurantId, dedupeKey: `onboarding.${result.status}:${result.id}`, data: { applicationId: result.id },
    });
    return result;
  }
}
