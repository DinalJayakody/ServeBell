import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ownerOnboardingSchema, reviewOnboardingSchema, type OwnerOnboardingInput, type ReviewOnboardingInput } from '@servebell/shared';
import { z } from 'zod';
import { OnboardingService } from './onboarding.service.js';
import { ZodPipe } from '../common/pipes/zod-validation.pipe.js';
import { CurrentUser, RequirePlatformAdmin } from '../common/decorators/auth.decorators.js';
import { Errors } from '../common/errors.js';
import type { AuthUser } from '../common/request-context.js';

const statusQuery = z.object({ status: z.enum(['PENDING', 'APPROVED', 'REJECTED']).default('PENDING') });

@ApiTags('onboarding')
@ApiBearerAuth()
@Controller({ path: 'onboarding', version: '1' })
export class OnboardingController {
  constructor(private readonly onboarding: OnboardingService) {}

  @Post('owner-applications')
  @ApiOperation({ summary: 'Apply to register a restaurant as its owner (authenticated)' })
  apply(@CurrentUser() user: AuthUser, @Body(new ZodPipe(ownerOnboardingSchema)) body: OwnerOnboardingInput) {
    if (!user.emailVerified) throw Errors.emailNotVerified();
    return this.onboarding.apply(user.id, body);
  }

  @Get('owner-applications/mine')
  @ApiOperation({ summary: 'My applications and their status (authenticated)' })
  mine(@CurrentUser() user: AuthUser) {
    return this.onboarding.listMine(user.id);
  }

  @RequirePlatformAdmin()
  @Get('owner-applications')
  @ApiOperation({ summary: 'Applications awaiting review (PLATFORM_ADMIN)' })
  list(@Query(new ZodPipe(statusQuery)) q: z.infer<typeof statusQuery>) {
    return this.onboarding.listForReview(q.status);
  }

  @RequirePlatformAdmin()
  @Post('owner-applications/:id/review')
  @ApiOperation({ summary: 'Approve or reject an application (PLATFORM_ADMIN)' })
  review(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser, @Body(new ZodPipe(reviewOnboardingSchema)) body: ReviewOnboardingInput) {
    return this.onboarding.review(id, user.id, body);
  }
}
