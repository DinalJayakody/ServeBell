import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { ScheduleModule } from '@nestjs/schedule';
import { LoggerModule } from 'nestjs-pino';
import { randomUUID } from 'node:crypto';
import { ConfigModule } from './config/config.module.js';
import { PrismaModule } from './common/prisma/prisma.module.js';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter.js';
import { AuditModule } from './audit/audit.service.js';
import { MailModule } from './mail/mail.service.js';
import { AuthModule } from './auth/auth.module.js';
import { EmployeesModule } from './employees/employees.module.js';
import { OnboardingModule } from './onboarding/onboarding.module.js';
import { RestaurantsModule } from './restaurants/restaurants.module.js';
import { NotificationsModule } from './notifications/notifications.module.js';
import { QrModule } from './qr/qr.module.js';
import { RealtimeModule } from './realtime/realtime.module.js';
import { VisitsModule } from './visits/visits.module.js';
import { ServicesModule } from './services/services.module.js';
import { UploadsModule } from './uploads/uploads.module.js';
import { MenuModule } from './menu/menu.module.js';
import { OrdersModule } from './orders/orders.module.js';
import { ManageModule } from './manage/manage.module.js';
import { HealthController } from './health/health.controller.js';
import { JobsModule } from './jobs/jobs.module.js';

const isProd = process.env['NODE_ENV'] === 'production';
const isTest = process.env['NODE_ENV'] === 'test';
// Serverless instances freeze between requests, so timers there are replaced by pg_cron → /internal/jobs.
const runIntervalJobs = process.env['RUN_INTERVAL_JOBS'] !== 'false';

@Module({
  imports: [
    ConfigModule,
    LoggerModule.forRoot({
      pinoHttp: {
        level: isTest ? 'silent' : isProd ? 'info' : 'debug',
        genReqId: (req) => (req.headers['x-request-id'] as string) || randomUUID(),
        redact: ['req.headers.authorization', 'req.headers.cookie'],
        transport: isProd || isTest ? undefined : { target: 'pino-pretty', options: { singleLine: true } },
        autoLogging: { ignore: (req) => req.url?.startsWith('/api/v1/health') ?? false },
      },
    }),
    // Global default; sensitive routes tighten this with @Throttle.
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 120 }]),
    ...(runIntervalJobs ? [ScheduleModule.forRoot()] : []),
    PrismaModule,
    AuditModule,
    MailModule,
    RealtimeModule,
    AuthModule,
    EmployeesModule,
    OnboardingModule,
    RestaurantsModule,
    NotificationsModule,
    QrModule,
    VisitsModule,
    ServicesModule,
    UploadsModule,
    MenuModule,
    OrdersModule,
    ManageModule,
    JobsModule,
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule {}
