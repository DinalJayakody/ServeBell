import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { z } from 'zod';
import { createOrderSchema, paginationQuerySchema, Permission, staffOrderQuerySchema, updateOrderStatusSchema, type CreateOrderInput, type UpdateOrderStatusInput } from '@servebell/shared';
import { OrdersService } from './orders.service.js';
import { ZodPipe } from '../common/pipes/zod-validation.pipe.js';
import { CurrentMembership, CurrentUser, RequirePermission } from '../common/decorators/auth.decorators.js';
import type { AuthUser, RestaurantMembershipContext } from '../common/request-context.js';

const mineQuery = paginationQuerySchema.extend({ active: z.stringbool().default(false) });

@ApiTags('orders')
@ApiBearerAuth()
@Controller({ path: 'orders', version: '1' })
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post()
  @ApiOperation({ summary: 'Place an order for my table (active visit; server-priced; idempotent)' })
  create(@CurrentUser() u: AuthUser, @Body(new ZodPipe(createOrderSchema)) body: CreateOrderInput) {
    return this.orders.create(u.id, body);
  }

  @Get('mine')
  @ApiOperation({ summary: 'My orders' })
  mine(@CurrentUser() u: AuthUser, @Query(new ZodPipe(mineQuery)) q: z.infer<typeof mineQuery>) {
    return this.orders.mine(u.id, q.active, q.cursor, q.limit);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Order detail (owning customer or restaurant staff)' })
  detail(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.orders.detail(u.id, id);
  }

  @Post(':id/cancel')
  @ApiOperation({ summary: 'Cancel my order while it is still pending' })
  cancel(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.orders.cancelByCustomer(u.id, id);
  }
}

@ApiTags('orders')
@Controller({ path: 'restaurants/:restaurantId/orders', version: '1' })
export class StaffOrdersController {
  constructor(private readonly orders: OrdersService) {}

  @RequirePermission(Permission.ORDERS_HANDLE)
  @Get()
  @ApiOperation({ summary: 'Open or completed orders for the restaurant' })
  list(@Param('restaurantId') rid: string, @Query(new ZodPipe(staffOrderQuerySchema)) q: z.infer<typeof staffOrderQuerySchema>) {
    return this.orders.listForStaff(rid, q.view, q.cursor, q.limit);
  }

  @RequirePermission(Permission.ORDERS_HANDLE)
  @Post(':id/status')
  @ApiOperation({ summary: 'Advance an order: ACCEPTED → PREPARING → READY → DELIVERED, or CANCELLED' })
  status(@CurrentMembership() m: RestaurantMembershipContext, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(updateOrderStatusSchema)) body: UpdateOrderStatusInput) {
    return this.orders.updateByStaff(m, id, body.status, body.reason);
  }
}
