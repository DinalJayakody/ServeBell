import { Global, Module } from '@nestjs/common';
import { DevicesController } from './devices.controller.js';
import { NotificationsController } from './notifications.controller.js';
import { NotificationsService } from './notifications.service.js';
import { PushWorker } from './push.worker.js';

@Global()
@Module({
  controllers: [DevicesController, NotificationsController],
  providers: [NotificationsService, PushWorker],
  exports: [NotificationsService, PushWorker],
})
export class NotificationsModule {}
