import { Module } from '@nestjs/common';
import { ManageController } from './manage.controller.js';
import { ManageService } from './manage.service.js';
import { FloorPlansController } from '../floor-plans/floor-plans.controller.js';
import { FloorPlansService } from '../floor-plans/floor-plans.service.js';
import { ReservationsController } from '../reservations/reservations.controller.js';
import { ReservationsService } from '../reservations/reservations.service.js';
import { AnalyticsController } from '../analytics/analytics.controller.js';
import { AnalyticsService } from '../analytics/analytics.service.js';
import { FavouritesModule } from '../favourites/favourites.controller.js';
import { UploadsModule } from '../uploads/uploads.module.js';
import { LayoutDetectService } from '../floor-plans/layout-detect.service.js';

/** Restaurant administration, layout, reservations and analytics. */
@Module({
  imports: [FavouritesModule, UploadsModule],
  controllers: [ManageController, FloorPlansController, ReservationsController, AnalyticsController],
  providers: [ManageService, FloorPlansService, LayoutDetectService, ReservationsService, AnalyticsService],
})
export class ManageModule {}
