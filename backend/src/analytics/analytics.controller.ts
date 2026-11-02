import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { z } from 'zod';
import { analyticsQuerySchema, Permission, updateEmployeeSchema, type AnalyticsQuery } from '@servebell/shared';
import { AnalyticsService } from './analytics.service.js';
import { ZodPipe } from '../common/pipes/zod-validation.pipe.js';
import { CurrentMembership, CurrentUser, RequirePermission } from '../common/decorators/auth.decorators.js';
import type { AuthUser, RestaurantMembershipContext } from '../common/request-context.js';

@ApiTags('analytics')
@Controller({ path: 'restaurants/:restaurantId', version: '1' })
export class AnalyticsController {
  constructor(private readonly a: AnalyticsService) {}

  @RequirePermission(Permission.ANALYTICS_READ) @Get('analytics/summary')
  @ApiOperation({ summary: 'Dashboard metrics with date / employee / service-type filters (OWNER/ADMIN)' })
  summary(@Param('restaurantId') rid: string, @Query(new ZodPipe(analyticsQuerySchema)) q: AnalyticsQuery) { return this.a.summary(rid, q); }

  @RequirePermission(Permission.EMPLOYEES_READ) @Get('employees')
  @ApiOperation({ summary: 'Employee cards with today/all-time performance (OWNER/ADMIN)' })
  employees(@Param('restaurantId') rid: string) { return this.a.employees(rid); }

  @RequirePermission(Permission.EMPLOYEES_READ) @Get('employees/:memberId')
  @ApiOperation({ summary: 'Employee profile, filtered metrics and service history (OWNER/ADMIN)' })
  employee(@Param('restaurantId') rid: string, @Param('memberId', ParseUUIDPipe) mid: string, @Query(new ZodPipe(analyticsQuerySchema)) q: AnalyticsQuery) { return this.a.employee(rid, mid, q); }

  @RequirePermission(Permission.EMPLOYEES_MANAGE) @Patch('employees/:memberId')
  @ApiOperation({ summary: 'Suspend / reactivate / remove / change role (owner rules apply)' })
  update(@CurrentUser() u: AuthUser, @CurrentMembership() m: RestaurantMembershipContext, @Param('memberId', ParseUUIDPipe) mid: string, @Body(new ZodPipe(updateEmployeeSchema)) b: z.infer<typeof updateEmployeeSchema>) {
    return this.a.updateEmployee({ userId: u.id, restaurantId: m.restaurantId, role: m.role }, mid, b);
  }
}
