import { Body, Controller, Delete, HttpCode, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { registerDeviceSchema, type RegisterDeviceInput } from '@servebell/shared';
import { PrismaService } from '../common/prisma/prisma.service.js';
import { ZodPipe } from '../common/pipes/zod-validation.pipe.js';
import { CurrentUser } from '../common/decorators/auth.decorators.js';
import type { AuthUser } from '../common/request-context.js';

@ApiTags('notifications')
@ApiBearerAuth()
@Controller({ path: 'notifications/devices', version: '1' })
export class DevicesController {
  constructor(private readonly prisma: PrismaService) {}

  /** A token moves to the latest signed-in user on that device (shared phones). */
  @HttpCode(204)
  @Post()
  @ApiOperation({ summary: 'Register this device for push notifications (authenticated)' })
  async register(@CurrentUser() user: AuthUser, @Body(new ZodPipe(registerDeviceSchema)) body: RegisterDeviceInput) {
    await this.prisma.pushDevice.upsert({
      where: { expoPushToken: body.expoPushToken },
      update: { userId: user.id, platform: body.platform, app: body.app, lastSeenAt: new Date(), disabledAt: null },
      create: { userId: user.id, expoPushToken: body.expoPushToken, platform: body.platform, app: body.app },
    });
  }

  @HttpCode(204)
  @Delete(':token')
  @ApiOperation({ summary: 'Unregister a device on sign-out (authenticated, own devices only)' })
  async unregister(@CurrentUser() user: AuthUser, @Param('token') token: string) {
    await this.prisma.pushDevice.updateMany({ where: { expoPushToken: token, userId: user.id }, data: { disabledAt: new Date() } });
  }
}
