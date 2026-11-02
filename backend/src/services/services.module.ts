import { Module } from '@nestjs/common';
import { ServicesController, StaffServicesController } from './service-requests.controller.js';
import { ServiceRequestsService } from './service-requests.service.js';
import { ServiceMessagesService } from './service-messages.service.js';
import { EscalationJob } from './escalation.job.js';
import { VisitsModule } from '../visits/visits.module.js';

@Module({
  imports: [VisitsModule],
  controllers: [ServicesController, StaffServicesController],
  providers: [ServiceRequestsService, ServiceMessagesService, EscalationJob],
  exports: [EscalationJob],
})
export class ServicesModule {}
