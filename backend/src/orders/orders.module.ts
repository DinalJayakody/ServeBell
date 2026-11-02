import { Module } from '@nestjs/common';
import { OrdersController, StaffOrdersController } from './orders.controller.js';
import { OrdersService } from './orders.service.js';
import { VisitsModule } from '../visits/visits.module.js';

@Module({ imports: [VisitsModule], controllers: [OrdersController, StaffOrdersController], providers: [OrdersService] })
export class OrdersModule {}
