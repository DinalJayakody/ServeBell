import { Controller, Get, HttpCode, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { paginationQuerySchema, type PaginationQuery } from '@servebell/shared';
import { NotificationsService } from './notifications.service.js';
import { ZodPipe } from '../common/pipes/zod-validation.pipe.js';
import { CurrentUser } from '../common/decorators/auth.decorators.js';
import type { AuthUser } from '../common/request-context.js';

@ApiTags('notifications')
@ApiBearerAuth()
@Controller({ path: 'notifications', version: '1' })
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  @ApiOperation({ summary: 'My in-app notifications, newest first (authenticated)' })
  list(@CurrentUser() user: AuthUser, @Query(new ZodPipe(paginationQuerySchema)) q: PaginationQuery) {
    return this.notifications.list(user.id, q.cursor, q.limit);
  }

  @Get('unread-count')
  @ApiOperation({ summary: 'Unread notification count (authenticated)' })
  async unread(@CurrentUser() user: AuthUser) {
    return { count: await this.notifications.unreadCount(user.id) };
  }

  @HttpCode(204)
  @Post('read-all')
  @ApiOperation({ summary: 'Mark all notifications read (authenticated)' })
  async readAll(@CurrentUser() user: AuthUser) {
    await this.notifications.markAllRead(user.id);
  }
}
