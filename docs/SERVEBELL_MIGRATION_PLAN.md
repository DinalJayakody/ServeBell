# ServeBell — Migration Plan (Oracle + Firebase → Supabase + Vercel + R2 + EAS)

Status: **proposal, Stage 1 (audit) complete. Nothing has been migrated yet.**
Companion documents: `SERVEBELL_CURRENT_ARCHITECTURE.md`, `SERVEBELL_FEATURE_INVENTORY.md`.

## 1. Facts that change the brief

| Brief says | Audit found | Consequence |
| --- | --- | --- |
| Oracle ARM64, 1 GB | x86_64 E2.1.Micro, ~0.5 GB RAM | Irrelevant after migration; keep as rollback. |
| Two Firebase users | 8 accounts: 2 real (dinaljayakody25@gmail.com — platform admin & owner; dinal25@gmail.com), 1 local test (dinal@gmail.com), 5 demo accounts I created | Migrate the 2 real users; recreate demo data with the scenario script instead of migrating demo accounts. |
| Vercel free tier | **Hobby is non-commercial only** ("Hobby teams are restricted to non-commercial personal use only. All commercial usage of the platform requires either a Pro or Enterprise plan." — vercel.com/docs/limits/fair-use-guidelines, updated 2026-09-14) | ServeBell is a commercial SaaS → see Decision D1. |
| Vercel crons | Hobby: **once per day**, ±59 min (vercel.com/docs/cron-jobs/usage-and-pricing) | 30-s escalation, 60-s visit expiry and 5-s push outbox cannot be Vercel crons → move to **Supabase pg_cron + pg_net**. |
| Vercel body size | **4.5 MB** max request/response (vercel.com/docs/functions/limitations) | Current uploads allow 12 MB → resize on device / direct-to-R2 upload. |
| Git repository | No commits, no remote | Make a baseline commit (and a private GitHub remote for Vercel) before any change — Decision D3. |

Supabase Free Realtime quotas (supabase.com/docs/guides/realtime/quotas): **200 concurrent connections, 100 messages/s, 100 channel joins/s**. Fine for development and TestFlight; a hard ceiling for production scale.

## 2. Target architecture

```
 Customer app / Restaurant app (Expo, EAS builds → TestFlight)
   ├─ Supabase Auth (supabase-js, publishable key, SecureStore session) ── JWT
   ├─ Supabase Realtime (private Broadcast channels, authorised by RLS on realtime.messages)
   └─ HTTPS ──► Backend API (existing NestJS, serverless entry)  ── Decision D1 where it runs
                  ├─ verifies Supabase JWT (JWKS) → same guards / permission matrix
                  ├─ Prisma → Supabase Postgres via Supavisor (transaction pooler :6543)
                  ├─ Cloudflare R2 (existing R2Storage driver) for media
                  └─ Expo Push API (outbox drained on demand)
 Supabase Postgres
   ├─ existing schema (Prisma migrations, unchanged semantics) + users.auth_user_id → auth.users
   ├─ RLS ON for every table; no anon/authenticated table access (API is the only data path)
   ├─ triggers → realtime.send(...) for service/order/reservation/notification events
   └─ pg_cron: escalation (30 s), visit expiry (60 s), push sweep (60 s); pg_net → API /internal/push/flush
 qr-web (Next.js) → Vercel (static/SSR pages)
 Oracle VM → unchanged, rollback only
```

Principles: keep the NestJS code and every API contract; replace only the four infrastructure seams
(identity, realtime transport, timers, file storage). The mobile apps change in `packages/mobile-core` (session, realtime, upload) and config only — screens stay as they are.

## 3. Key design decisions

### 3.1 Identity
* Keep `public.users` (own UUID, all foreign keys unchanged). Replace `firebaseUid` with `authUserId uuid unique` referencing `auth.users(id)` (FK added in a SQL migration; Prisma models it as a plain column).
* Backend guard verifies Supabase access tokens with the project **JWKS** (asymmetric signing keys), reads `sub`, `email`, `email_confirmed_at`/`email_verified`. `POST /auth/sync` stays (now keyed by `sub`). Roles stay in our tables — **never** in client-editable `user_metadata`.
* Client: `@supabase/supabase-js` with `expo-secure-store`-backed storage (chunked for size), `autoRefreshToken`, `AppState` start/stop refresh, deep links `servebell://auth/callback` and `servebell-restaurant://auth/callback` for email confirmation and recovery (PKCE).
* Google/Apple sign-in code exists; port to `signInWithIdToken` (needs dev builds) — Decision D5.

### 3.2 User migration (2 real users)
Recommended: create both users in Supabase with the Admin API (same email, `email_confirm` per current Firebase state), set `users.authUserId`, then send each a **password reset** email. No hashes are moved. (Supabase's `firebase-to-supabase` tool can import Firebase scrypt parameters; continuity of passwords is not guaranteed by its docs, so it is not worth the risk for two accounts.) Decision D2.

### 3.3 Realtime
* Replace Socket.IO with **Supabase Realtime Broadcast, private channels**: `restaurant:{id}` (staff), `user:{id}` (one person), `service:{id}` (one request's chat/timeline). Same event names and envelope as today, so `useRealtimeEvent(...)` call sites do not change.
* Messages are sent **by the backend after the transaction commits**, through Supabase's Broadcast REST API with the secret key (refined in Stage 2: keeps today's exact payloads and event names, and an event exists only if the change committed). No polling.
* Authorisation: RLS policies on `realtime.messages` — `restaurant:{id}` only for active members of that restaurant; `user:{id}` only for that user; `service:{id}` for the requesting customer and staff of the request's restaurant.
* Reconnection: on `SUBSCRIBED` after a drop the client refetches the affected queries once (TanStack Query invalidation) — no periodic polling.

### 3.4 Timers → database
| Today (Nest interval) | Target |
| --- | --- |
| Escalation every 30 s | `pg_cron` `'30 seconds'` → `pg_net` → `POST /api/v1/internal/jobs/escalate` (existing `EscalationJob.run()`; logic stays in the backend) |
| Visit expiry every 60 s | `pg_cron` every minute → `POST /api/v1/internal/jobs/expire-visits` |
| Push outbox every 5 s | trigger on `push_deliveries` insert → `pg_net.http_post` to `POST /api/v1/internal/push/flush` (shared-secret header); `pg_cron` sweep every minute for retries + Expo receipts |

### 3.5 Files
* `R2Storage` already exists. Add a read path (S3 `GetObject`) and serve public media from the R2 public bucket URL (r2.dev or a custom domain).
* Keep server-side sharp → WebP. Resize on device first (`expo-image-manipulator`, ≤ 2048 px) so requests stay well under 4.5 MB. Prod has **0** stored files, so there is nothing to copy.

### 3.6 Backend runtime — **Decision D1**
The Nest app becomes stateless (no sockets, no timers, no disk), so it can run on any serverless or small host. Options:

| Option | Cost | Commercial use | Effort | Notes |
| --- | --- | --- | --- | --- |
| A. Vercel **Hobby** now, **Pro** (paid per member; price on vercel.com/pricing, not verified here) before any commercial use | 0 now | Hobby: **no** | Low (Nest as one Vercel Function) | Vercel's own definition counts paid development of a for-profit project as commercial; confirm with Vercel support if you want Hobby during pre-launch testing. |
| B. Vercel **Pro** from the start | paid (see vercel.com/pricing) | yes | Low | Needs your approval (paid). |
| C. Keep the API on **Oracle Always Free**, everything else on Supabase/R2 | 0 | Oracle Always Free has no commercial restriction in its free-tier terms (to be re-checked before launch) | Lowest | Single small VM, no autoscaling; violates "backend on Vercel". |
| D. Rewrite API as **Supabase Edge Functions** (Deno) | 0 | yes | **High** (rewrite 104 endpoints) | Contradicts "do not rewrite"; not recommended. |

Recommendation: build for Vercel (works for A and B), deploy to Hobby **only for private development/TestFlight testing if you accept the terms risk**, and switch to Pro before onboarding real restaurants. Nothing paid is enabled without your approval.

### 3.7 Row Level Security
* `ALTER TABLE … ENABLE ROW LEVEL SECURITY` on every `public` table, **no policies for `anon`/`authenticated`** → the publishable key cannot read or write application tables through the Data API. The backend connects with a server role (bypasses RLS) and keeps its explicit authorisation (guards + scoped queries, already tenant-isolated and tested).
* Policies exist only where clients talk to Supabase directly: `realtime.messages` (channel authorisation). Tests prove cross-tenant subscriptions are rejected.
* The secret key / DB password exist only in server env; the apps get `EXPO_PUBLIC_SUPABASE_URL` + publishable key only.

### 3.8 Push
Keep the existing outbox + `expo-server-sdk`. Add `eas.json`, EAS project ids, APNs key via `eas credentials` (interactive), FCM V1 key later for Android. Realtime covers foreground; push covers background; one `dedupeKey` per event (already implemented) prevents duplicates.

## 4. Stages (from the brief) and what each needs

| # | Stage | Work | Needs from you |
| --- | --- | --- | --- |
| 1 | Audit | **Done** — 3 documents | — |
| 2 | Database architecture | Map Prisma schema to Supabase (extensions `btree_gist`, `pg_cron`, `pg_net`), `supabase/migrations/` generated from Prisma + SQL for RLS/realtime/cron, `supabase/seed.sql`, `docs/SUPABASE_DATABASE.md` | — |
| 3 | Supabase project | Create project (region: **ap-south-1 Mumbai** closest to Sri Lanka), enable extensions, apply migrations, auth settings (email confirm, redirect URLs, SMTP) | Create the project in the dashboard (free) and give me the project ref, publishable key, secret key, DB password via local `.env` files (never in chat) — or run `supabase login` yourself so I can link |
| 4 | Auth migration | Server JWT verifier, mobile session rewrite, deep links, 2-user migration | Approve D2; you confirm the reset emails arrive |
| 5 | Backend → Vercel | Serverless entry (`api/index.ts` wrapping Nest), `vercel.json`, pooler URLs, `/api/health` | D1; Vercel account + GitHub repo (D3) |
| 6 | Realtime | Triggers, `realtime.send`, RLS on `realtime.messages`, client channel layer | — |
| 7 | Push | Outbox flush endpoint, pg_net trigger, EAS project ids | Expo account login (done: `dinal25`) |
| 8 | R2 | Bucket, CORS, public URL, keys | Cloudflare account; create R2 bucket + API token (free tier: 10 GB) |
| 9–10 | App integration | mobile-core session/realtime/upload swap; env config | — |
| 11 | Data + user migration | `pg_dump` Oracle → restore into Supabase, counts/FK checks, user mapping | — |
| 12 | Automated tests | Existing 80 backend tests on Supabase-compatible Postgres + new RLS/realtime/auth tests | — |
| 13 | Staging deploy | Vercel preview/staging, Supabase project | — |
| 14–15 | iOS + TestFlight | `eas.json`, build numbers, privacy strings, `eas build -p ios`, `eas submit` | Apple: App Store Connect app records / API key, 2FA prompts (you complete them) |
| 16 | Device testing | TestFlight on your iPhone | You install and run the checklist |
| 17 | Docs | Remaining documents listed in the brief | — |

## 5. Risks and mitigations

| Risk | Mitigation |
| --- | --- |
| Vercel Hobby terms (commercial) | D1; build is portable to Pro/Oracle without code changes. |
| Cold starts (Nest + Prisma) on serverless | Fluid compute instance reuse; lazy module init; keep bundle small; measure p95 in staging. |
| Pooler + Prisma prepared statements | Use transaction pooler URL with `?pgbouncer=true` for runtime, session/direct URL for migrations; verify in Stage 3. |
| Realtime free quota (200 connections) | One channel set per app session; unsubscribe on background; document the ceiling. |
| pg_cron seconds granularity / pg_net availability | Verify on the created project in Stage 3; fall back to 1-minute escalation if needed (still within the 15-minute SLA). |
| Losing work during migration | Baseline Git commit + tag; Oracle untouched; Firebase project kept until both users log in on Supabase; nightly Oracle backups continue. |
| Secrets | `.env*` and admin keys git-ignored (verified); move the Firebase admin key out of `docs/deployment/` and rotate it after cut-over. |
| Apple bundle ids already registered elsewhere | Check in App Store Connect in Stage 14; changing them would be a decision for you. |

## 6. Rollback

Until the final cut-over the apps can be pointed back to Oracle by changing `EXPO_PUBLIC_API_URL` and the auth provider flag in one build;
Oracle keeps running with its own database and nightly backups; Firebase Auth stays enabled until both real users have signed in through Supabase.

## 7. Decisions (answered 2026-11-02)

* **D1 → A:** build for Vercel; Hobby for private development/TestFlight testing, upgrade to Pro before commercial use (owner accepts the terms risk; nothing paid enabled).
* **D2 → reset:** recreate the 2 real users in Supabase, link profiles/roles, send password-reset emails; no hash import.
* **D3 → yes:** baseline commit + tag, private GitHub repository.
* **D4 → recreate:** demo data is regenerated on Supabase with `backend/scripts/demo-scenario.ts`, not migrated.
* **D5:** open — Google/Apple sign-in later unless requested.

### Original questions

* **D1** Backend host given Vercel's commercial-use rule (A / B / C).
* **D2** Password reset for the 2 real users (recommended) vs hash import.
* **D3** Baseline commit + private GitHub repo for Vercel deployments.
* **D4** Demo accounts: recreate on Supabase with the scenario script (recommended) vs migrate.
* **D5** Google / Apple sign-in in this round or later.
