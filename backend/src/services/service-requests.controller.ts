import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { z } from 'zod';
import {
  cancelServiceSchema,
  createServiceRequestSchema,
  paginationQuerySchema,
  Permission,
  sendMessageSchema,
  staffCancelServiceSchema,
  staffServiceQuerySchema,
  type CreateServiceRequestInput,
  type SendMessageInput,
  type StaffServiceQuery,
} from '@servebell/shared';
import { ServiceRequestsService, type StaffActor } from './service-requests.service.js';
import { ServiceMessagesService } from './service-messages.service.js';
import { ZodPipe } from '../common/pipes/zod-validation.pipe.js';
import { CurrentMembership, CurrentUser, RequirePermission } from '../common/decorators/auth.decorators.js';
import type { AuthUser, RestaurantMembershipContext } from '../common/request-context.js';

const mineQuery = paginationQuerySchema.extend({ active: z.stringbool().default(false) });
const actor = (u: AuthUser, m: RestaurantMembershipContext): StaffActor => ({ userId: u.id, memberId: m.memberId, restaurantId: m.restaurantId, role: m.role });

/** Customer-facing and shared (customer or staff) endpoints. */
@ApiTags('services')
@ApiBearerAuth()
@Controller({ path: 'services', version: '1' })
export class ServicesController {
  constructor(
    private readonly services: ServiceRequestsService,
    private readonly messages: ServiceMessagesService,
  ) {}

  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post()
  @ApiOperation({ summary: 'Request a service at my table (customer with an active visit; idempotent)' })
  create(@CurrentUser() user: AuthUser, @Body(new ZodPipe(createServiceRequestSchema)) body: CreateServiceRequestInput) {
    return this.services.create(user.id, body);
  }

  @Get('mine')
  @ApiOperation({ summary: 'My service requests (customer)' })
  mine(@CurrentUser() user: AuthUser, @Query(new ZodPipe(mineQuery)) q: z.infer<typeof mineQuery>) {
    return this.services.listMine(user.id, q.active, q.cursor, q.limit);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Request detail with timeline (owning customer or restaurant staff)' })
  detail(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.services.detail(user.id, id);
  }

  @Post(':id/cancel')
  @ApiOperation({ summary: 'Cancel my pending/accepted request (owning customer)' })
  cancel(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(cancelServiceSchema)) body: z.infer<typeof cancelServiceSchema>) {
    return this.services.cancelByCustomer(user.id, id, body.reason);
  }

  @Get(':id/messages')
  @ApiOperation({ summary: 'Conversation history (customer, involved staff, or auditing admin)' })
  listMessages(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.messages.list(user.id, id);
  }

  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post(':id/messages')
  @ApiOperation({ summary: 'Send a message (customer or involved staff; idempotent by clientMessageId)' })
  send(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(sendMessageSchema)) body: SendMessageInput) {
    return this.messages.send(user.id, id, body);
  }

  @HttpCode(204)
  @Post(':id/read')
  @ApiOperation({ summary: 'Mark conversation read' })
  async read(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    await this.messages.markRead(user.id, id);
  }
}

/** Staff endpoints, scoped to the restaurant in the path and checked per request. */
@ApiTags('services')
@Controller({ path: 'restaurants/:restaurantId/services', version: '1' })
export class StaffServicesController {
  constructor(private readonly services: ServiceRequestsService) {}

  @RequirePermission(Permission.SERVICES_HANDLE)
  @Get()
  @ApiOperation({ summary: 'Queue and history: view=pending|mine|others|done|all (all = OWNER/ADMIN)' })
  list(@CurrentUser() u: AuthUser, @CurrentMembership() m: RestaurantMembershipContext, @Query(new ZodPipe(staffServiceQuerySchema)) q: StaffServiceQuery) {
    return this.services.listForStaff(actor(u, m), q);
  }

  @RequirePermission(Permission.SERVICES_HANDLE)
  @Get('stats/me')
  @ApiOperation({ summary: 'My counts and average acceptance/completion times today' })
  stats(@CurrentUser() u: AuthUser, @CurrentMembership() m: RestaurantMembershipContext) {
    return this.services.stats(actor(u, m));
  }

  @RequirePermission(Permission.SERVICES_HANDLE)
  @Post(':id/accept')
  @ApiOperation({ summary: 'Accept (atomic; 409 ALREADY_ACCEPTED if someone was faster)' })
  accept(@CurrentUser() u: AuthUser, @CurrentMembership() m: RestaurantMembershipContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.services.accept(actor(u, m), id);
  }

  @RequirePermission(Permission.SERVICES_HANDLE)
  @Post(':id/wait')
  @ApiOperation({ summary: 'Wait: hide from my queue, leave it for other staff (does not cancel)' })
  wait(@CurrentUser() u: AuthUser, @CurrentMembership() m: RestaurantMembershipContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.services.wait(actor(u, m), id);
  }

  @RequirePermission(Permission.SERVICES_HANDLE)
  @Post(':id/start')
  @ApiOperation({ summary: 'Mark in progress (assignee, or OWNER/ADMIN)' })
  start(@CurrentUser() u: AuthUser, @CurrentMembership() m: RestaurantMembershipContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.services.start(actor(u, m), id);
  }

  @RequirePermission(Permission.SERVICES_HANDLE)
  @Post(':id/complete')
  @ApiOperation({ summary: 'Complete (assignee, or OWNER/ADMIN)' })
  complete(@CurrentUser() u: AuthUser, @CurrentMembership() m: RestaurantMembershipContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.services.complete(actor(u, m), id);
  }

  @RequirePermission(Permission.SERVICES_HANDLE)
  @Post(':id/cancel')
  @ApiOperation({ summary: 'Cancel with a reason (assignee, or OWNER/ADMIN)' })
  cancel(@CurrentUser() u: AuthUser, @CurrentMembership() m: RestaurantMembershipContext, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(staffCancelServiceSchema)) body: z.infer<typeof staffCancelServiceSchema>) {
    return this.services.cancelByStaff(actor(u, m), id, body.reason);
  }
}
