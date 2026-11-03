import { Injectable, Logger } from '@nestjs/common';
import type { RealtimeEnvelope } from '@servebell/shared';
import { AppConfig } from '../config/config.module.js';

export interface BroadcastMessage {
  topic: string;
  event: string;
  payload: RealtimeEnvelope;
}

/** Abstract so tests can record messages instead of calling Supabase. */
export abstract class RealtimePublisher {
  abstract publish(messages: BroadcastMessage[]): Promise<void>;
}

/**
 * Supabase Realtime Broadcast over REST, sent with the secret key. Topics are private:
 * who may receive them is decided in Postgres (servebell.can_receive, RLS on realtime.messages).
 */
@Injectable()
export class SupabaseBroadcastPublisher extends RealtimePublisher {
  private readonly logger = new Logger(SupabaseBroadcastPublisher.name);
  private readonly url: string;
  private readonly key: string;

  constructor(config: AppConfig) {
    super();
    this.url = `${config.env.SUPABASE_URL.replace(/\/$/, '')}/realtime/v1/api/broadcast`;
    this.key = config.env.SUPABASE_SECRET_KEY;
    if (!this.key) this.logger.warn('SUPABASE_SECRET_KEY is not set: realtime broadcasts are disabled');
  }

  async publish(messages: BroadcastMessage[]) {
    if (!this.key || messages.length === 0) return;
    const res = await fetch(this.url, {
      method: 'POST',
      headers: { apikey: this.key, Authorization: `Bearer ${this.key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: messages.map((m) => ({ ...m, private: true })) }),
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok) throw new Error(`broadcast failed: ${res.status} ${(await res.text()).slice(0, 200)}`);
  }
}
