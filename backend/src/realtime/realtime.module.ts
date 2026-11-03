import { Global, Module } from '@nestjs/common';
import { RealtimeService } from './realtime.service.js';
import { RealtimePublisher, SupabaseBroadcastPublisher } from './realtime.publisher.js';

@Global()
@Module({ providers: [RealtimeService, { provide: RealtimePublisher, useClass: SupabaseBroadcastPublisher }], exports: [RealtimeService] })
export class RealtimeModule {}
