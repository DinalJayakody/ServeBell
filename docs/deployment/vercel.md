# ServeBell API on Vercel (serverless)

Production: **https://servebell-api.vercel.app** (`/api/v1/...`), project `servebell-api`, Hobby plan, functions in
`hnd1` (Tokyo, next to the Supabase database in ap-northeast-1).

## How it is built

| Piece | File |
| --- | --- |
| Project config (install/build commands, region, rewrites everything to the function) | `backend/vercel.json` |
| Function entry | `backend/api/index.js` → `backend/dist/serverless.bundle.mjs` |
| Nest app without `listen()`, created once per warm instance | `backend/src/serverless.ts` |
| Single-file ESM bundle (esbuild) | `backend/vercel-bundle.mjs`, script `build:vercel` |
| Upload allow-list (only backend, packages, workspace files; never `.env*`) | `/.vercelignore` |

Why a bundle: Vercel's function loader rejects `require()` of ES modules. NestJS 12 is ESM-only while some Nest plugins
(e.g. `@nestjs/throttler`) are CommonJS, so packages are resolved at build time. `sharp` and Nest's optional packages stay
external. Local check that mimics Vercel: `node --no-experimental-require-module` with `api/index.js`.

Project settings (set through the API): Root Directory `backend`, Node.js 24.x, framework "Other".

## Environment (Vercel → Project → Settings → Environment Variables; production + preview)

| Variable | Notes |
| --- | --- |
| `NODE_ENV` | `production` |
| `DATABASE_URL` | Supabase **transaction pooler** (port 6543) — sensitive |
| `DATABASE_POOL_MAX` | `5` per instance |
| `SUPABASE_URL`, `SUPABASE_SECRET_KEY` | secret key is sensitive, server only |
| `TOKEN_HASH_SECRET` | new value (invitation codes issued on Oracle must be re-sent) — sensitive |
| `RUN_INTERVAL_JOBS` | `false` (no timers on serverless) |
| `CRON_SECRET` | same value as Vault secret `servebell_cron_secret` — sensitive |
| `PUBLIC_WEB_URL`, `CORS_ORIGINS` | QR web app URL |
| `MAIL_FROM` | sender for invitation emails (`SMTP_URL` optional) |

Local copies of generated secrets live only in `backend/.env.vercel` (git-ignored, mode 600).

## Scheduled work

No timers run in the function. Supabase `pg_cron` (migrations `…000400_jobs.sql`, `…000500_jobs_on_demand.sql`):

| Job | Schedule | Calls the API |
| --- | --- | --- |
| escalate | every 30 s | only when `servebell.escalation_due()` |
| push sweep | every minute | only when `servebell.push_due()` (queued, or receipts pending < 24 h) |
| push flush | on insert into `push_deliveries` | immediately |
| visit expiry | every minute | never (plain SQL) |

An idle system therefore makes no function invocations (Hobby: 1M invocations and 4 h active CPU per month).
Endpoint: `POST /api/v1/internal/jobs/{escalate|expire-visits|push}` with header `x-servebell-cron`; anything else → 404.

## Deploy

```bash
set -a; . backend/.env.vercel; set +a
npx vercel@65.9.0 deploy --prod --yes --token "$VERCEL_TOKEN"     # from the repo root (linked via .vercel/)
```
Rollback: Vercel dashboard → Deployments → previous deployment → "Promote to Production" (instant).

## Limits to keep in mind (Hobby)

* Non-commercial use only (decision D1: move to Pro before commercial launch).
* Request body 4.5 MB (uploads are resized on the phone; R2 in Stage 8).
* Socket.IO cannot run here; realtime moves to Supabase Realtime (Stage 6).

## Verified (2026-11-02)

health 200 (cold ≈1.3 s, warm 0.3–0.9 s); Supabase cloud token → `/auth/sync` 200 (email confirmed read from Supabase),
`/auth/me` 200, tampered token 401; jobs: wrong secret 404, escalate/push 200; served from `hnd1`; pgTAP 22/22 on the cloud DB.
