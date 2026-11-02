import { Controller, Headers, HttpCode, NotFoundException, Param, Post } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { timingSafeEqual } from 'node:crypto';
import { Public } from '../common/decorators/public.decorator.js';
import { AppConfig } from '../config/config.module.js';
import { EscalationJob } from '../services/escalation.job.js';
import { VisitsService } from '../visits/visits.service.js';
import { PushWorker } from '../notifications/push.worker.js';

/**
 * Scheduled work for serverless deployments. pg_cron (supabase/migrations/…_jobs.sql)
 * POSTs here with the shared secret; each job is idempotent and safe to overlap.
 * Unknown jobs, a missing secret or a wrong secret all answer 404.
 */
@ApiExcludeController()
@SkipThrottle()
@Public()
@Controller({ path: 'internal/jobs', version: '1' })
export class JobsController {
  constructor(
    private readonly config: AppConfig,
    private readonly escalation: EscalationJob,
    private readonly visits: VisitsService,
    private readonly push: PushWorker,
  ) {}

  @Post(':job')
  @HttpCode(200)
  async run(@Param('job') job: string, @Headers('x-servebell-cron') secret?: string) {
    if (!this.authorised(secret)) throw new NotFoundException();
    const started = Date.now();
    let count: number | undefined;
    if (job === 'escalate') count = await this.escalation.run();
    else if (job === 'expire-visits') count = await this.visits.expireStale();
    else if (job === 'push') {
      await this.push.sendQueued();
      await this.push.checkReceipts();
    } else throw new NotFoundException();
    return { ok: true, job, count, ms: Date.now() - started };
  }

  private authorised(secret?: string) {
    const expected = this.config.env.CRON_SECRET;
    if (!expected || !secret) return false;
    const a = Buffer.from(secret);
    const b = Buffer.from(expected);
    return a.length === b.length && timingSafeEqual(a, b);
  }
}
