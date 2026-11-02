import { z } from 'zod';

const csv = z
  .string()
  .default('')
  .transform((v) => v.split(',').map((s) => s.trim()).filter(Boolean));

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().default(4000),
    CORS_ORIGINS: csv,
    PUBLIC_WEB_URL: z.url(),
    DATABASE_URL: z.string().min(1),
    /** Connections per API instance. Keep small on serverless (Supabase transaction pooler). */
    DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(50).default(10),
    /** Supabase project URL (https://<ref>.supabase.co, or http://127.0.0.1:54321 for the local stack). */
    SUPABASE_URL: z.url(),
    /** Server-only secret key (sb_secret_…). Never shipped to the apps. */
    SUPABASE_SECRET_KEY: z.string().default(''),
    TOKEN_HASH_SECRET: z.string().min(32),
    R2_ACCOUNT_ID: z.string().default(''),
    R2_ACCESS_KEY_ID: z.string().default(''),
    R2_SECRET_ACCESS_KEY: z.string().default(''),
    R2_BUCKET: z.string().default(''),
    R2_PUBLIC_BASE_URL: z.string().default(''),
    SMTP_URL: z.string().default(''),
    MAIL_FROM: z.string().default('ServeBell <no-reply@servebell.app>'),
    EXPO_ACCESS_TOKEN: z.string().default(''),
    /** Optional: enables "detect tables from a photo" in the floor-plan editor. */
    ANTHROPIC_API_KEY: z.string().default(''),
    ANTHROPIC_MODEL: z.string().default('claude-opus-5-5'),
    SEED_DEMO_ACCOUNTS: z.stringbool().default(false),
    /**
     * In-process timers for escalation, visit expiry and the push outbox. A long-running
     * server keeps them on; serverless (Vercel) turns them off and pg_cron calls
     * POST /api/v1/internal/jobs/:job with CRON_SECRET instead.
     */
    RUN_INTERVAL_JOBS: z.stringbool().default(true),
    /** Shared secret for the internal job endpoints (header x-servebell-cron). Empty = endpoints disabled. */
    CRON_SECRET: z.string().default(''),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV !== 'production') return;
    if (env.TOKEN_HASH_SECRET.startsWith('change-me')) {
      ctx.addIssue({ code: 'custom', path: ['TOKEN_HASH_SECRET'], message: 'placeholder secret in production' });
    }
    if (!env.RUN_INTERVAL_JOBS && env.CRON_SECRET.length < 32) {
      ctx.addIssue({ code: 'custom', path: ['CRON_SECRET'], message: 'required (32+ chars) when RUN_INTERVAL_JOBS=false, or scheduled work never runs' });
    }
    if (!env.SUPABASE_URL.startsWith('https://')) {
      ctx.addIssue({ code: 'custom', path: ['SUPABASE_URL'], message: 'must be the https project URL in production' });
    }
    if (!env.SUPABASE_SECRET_KEY.startsWith('sb_secret_')) {
      ctx.addIssue({ code: 'custom', path: ['SUPABASE_SECRET_KEY'], message: 'secret key (sb_secret_…) is required in production' });
    }
  });

export type Env = z.infer<typeof envSchema>;

export function validateEnv(raw: Record<string, unknown>): Env {
  const parsed = envSchema.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  return parsed.data;
}
