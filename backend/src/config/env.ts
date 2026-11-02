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
    FIREBASE_PROJECT_ID: z.string().min(1),
    /** Base64 of the service-account JSON. Optional: enables revoked-token checks. */
    FIREBASE_SERVICE_ACCOUNT_BASE64: z.string().default(''),
    /** Set (e.g. 127.0.0.1:9099) to verify tokens from the Firebase Auth emulator. Dev/test only. */
    FIREBASE_AUTH_EMULATOR_HOST: z.string().default(''),
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
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV !== 'production') return;
    if (env.TOKEN_HASH_SECRET.startsWith('change-me')) {
      ctx.addIssue({ code: 'custom', path: ['TOKEN_HASH_SECRET'], message: 'placeholder secret in production' });
    }
    if (env.FIREBASE_AUTH_EMULATOR_HOST) {
      ctx.addIssue({ code: 'custom', path: ['FIREBASE_AUTH_EMULATOR_HOST'], message: 'emulator tokens are unsigned; never enable in production' });
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
