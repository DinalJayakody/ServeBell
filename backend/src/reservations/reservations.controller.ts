import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { z } from 'zod';
import { availabilityQuerySchema, createReservationSchema, Permission, reservationStatusSchema, staffReservationQuerySchema, type CreateReservationInput } from '@servebell/shared';
import { ReservationsService } from './reservations.service.js';
import { ZodPipe } from '../common/pipes/zod-validation.pipe.js';
import { CurrentUser, RequirePermission } from '../common/decorators/auth.decorators.js';
import { Public } from '../common/decorators/public.decorator.js';
import type { AuthUser } from '../common/request-context.js';

@ApiTags('reservations')
@Controller({ version: '1' })
export class ReservationsController {
  constructor(private readonly r: ReservationsService) {}

  @Public() @Get('tables/:tableId/availability')
  @ApiOperation({ summary: 'Reservation slots for a table on a date (public)' })
  availability(@Param('tableId', ParseUUIDPipe) tableId: string, @Query(new ZodPipe(availabilityQuerySchema)) q: z.infer<typeof availabilityQuerySchema>) { return this.r.availability(tableId, q.date, q.partySize); }

  @Public() @Get('restaurants/:idOrSlug/availability')
  @ApiOperation({ summary: 'Any-table reservation slots for a restaurant on a date (public)' })
  restaurantAvailability(@Param('idOrSlug') idOrSlug: string, @Query(new ZodPipe(availabilityQuerySchema)) q: z.infer<typeof availabilityQuerySchema>) { return this.r.restaurantAvailability(idOrSlug, q.date, q.partySize); }

  @ApiBearerAuth() @Throttle({ default: { limit: 10, ttl: 60_000 } }) @Post('reservations')
  @ApiOperation({ summary: 'Reserve a table (authenticated; double booking impossible)' })
  create(@CurrentUser() u: AuthUser, @Body(new ZodPipe(createReservationSchema)) b: CreateReservationInput) { return this.r.create(u.id, b); }

  @ApiBearerAuth() @Get('reservations/mine')
  @ApiOperation({ summary: 'My reservations' })
  mine(@CurrentUser() u: AuthUser) { return this.r.mine(u.id); }

  @ApiBearerAuth() @Post('reservations/:id/cancel')
  @ApiOperation({ summary: 'Cancel my reservation' })
  cancel(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.r.cancelByCustomer(u.id, id); }

  @RequirePermission(Permission.RESERVATIONS_READ) @Get('restaurants/:restaurantId/reservations')
  @ApiOperation({ summary: 'Reservations by local date and status (staff)' })
  list(@Param('restaurantId') rid: string, @Query(new ZodPipe(staffReservationQuerySchema)) q: z.infer<typeof staffReservationQuerySchema>) { return this.r.listForStaff(rid, q); }

  @RequirePermission(Permission.RESERVATIONS_MANAGE) @Post('restaurants/:restaurantId/reservations/:id/status')
  @ApiOperation({ summary: 'Confirm / reject / cancel / complete / no-show (OWNER/ADMIN)' })
  status(@Param('restaurantId') rid: string, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(reservationStatusSchema)) b: z.infer<typeof reservationStatusSchema>) { return this.r.updateByStaff(rid, id, b.status, b.reason, b.tableId); }
}
