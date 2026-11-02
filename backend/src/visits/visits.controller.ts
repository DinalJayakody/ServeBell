import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { startVisitSchema, type StartVisitInput } from '@servebell/shared';
import { VisitsService } from './visits.service.js';
import { ZodPipe } from '../common/pipes/zod-validation.pipe.js';
import { CurrentUser } from '../common/decorators/auth.decorators.js';
import type { AuthUser } from '../common/request-context.js';

@ApiTags('visits')
@ApiBearerAuth()
@Controller({ path: 'visits', version: '1' })
export class VisitsController {
  constructor(private readonly visits: VisitsService) {}

  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post()
  @ApiOperation({ summary: 'Start (or refresh) a table session from a scanned QR (authenticated customer)' })
  start(@CurrentUser() user: AuthUser, @Body(new ZodPipe(startVisitSchema)) body: StartVisitInput) {
    return this.visits.start(user.id, body.qr, body.guestCount);
  }

  @Get('active')
  @ApiOperation({ summary: 'My active table session, or null (authenticated)' })
  async active(@CurrentUser() user: AuthUser) {
    return { visit: await this.visits.active(user.id) };
  }

  @HttpCode(204)
  @Post(':id/leave')
  @ApiOperation({ summary: 'Leave the restaurant / end the table session (authenticated, own visit)' })
  async leave(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    await this.visits.leave(user.id, id);
  }
}
