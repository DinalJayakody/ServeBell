import { Module } from '@nestjs/common';
import { JobsController } from './jobs.controller.js';
import { ServicesModule } from '../services/services.module.js';
import { VisitsModule } from '../visits/visits.module.js';

@Module({ imports: [ServicesModule, VisitsModule], controllers: [JobsController] })
export class JobsModule {}
