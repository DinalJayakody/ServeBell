# ServeBell on Supabase Postgres

## How the schema is managed

| Layer | Source of truth | Applied by |
| --- | --- | --- |
| Application tables, enums, constraints (38 models) | `backend/prisma/schema.prisma` + `backend/prisma/migrations/*` | copied verbatim into `supabase/migrations/` by `node supabase/sync-prisma-migrations.mjs` |
| Supabase-only SQL (auth link, RLS, Realtime authorisation, jobs) | `supabase/migrations/20261102000100…0400_*.sql` | Supabase CLI |
| Reference data | `supabase/seed.sql` (8 discovery categories, idempotent) | `supabase db reset` locally; run once in production |

Rules:
1. Never edit a migration that has been applied anywhere; add a new one.
2. Schema change → `cd backend && npx prisma migrate dev --name <change>` → `node supabase/sync-prisma-migrations.mjs` → `supabase db reset && supabase test db` → commit both folders.
3. Production applies migrations with `supabase db push` (linked project). Prisma's own `migrate deploy` is used only for the plain-Postgres test database in CI/local backend tests.
4. Drift check: `cd backend && npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script` must print an empty migration.

## What the database guarantees (kept from Oracle)

* UUIDv7 primary keys, `timestamptz(3)` timestamps, soft deletes (`deletedAt`) on user-facing entities.
* Money as integer cents (`priceCents`, `totalCents`) — no floating point.
* Exclusion constraint `reservations_no_overlap` (`btree_gist`): a table can never be double-booked.
* Partial unique indexes: one active QR per table, one active visit per customer, unique live table label per restaurant.
* Atomic transitions: every status change is a conditional `UPDATE … WHERE status = <expected>`; waiter acceptance cannot be won twice.
* Idempotency keys on service requests and orders.

## Identity link (Supabase Auth)

`public.users."authUserId" uuid unique` → `auth.users(id) ON DELETE SET NULL` (FK added in `20261102000100_supabase_auth_fk.sql`).
`firebaseUid` is nullable during the migration and will be dropped after both real users have moved.
Roles stay in `public.users."platformRole"` and `public.restaurant_members` — never in Auth metadata that clients can edit.

## Row Level Security

`20261102000200_rls_lockdown.sql`:
* RLS is **enabled on every table** in `public`.
* `anon` and `authenticated` have **no privileges** on tables, sequences or functions in `public`, including future ones (default privileges).
* The mobile apps therefore cannot read or write application data with the publishable key; all data goes through the API, which
  connects as the database owner and enforces tenant isolation and permissions explicitly (covered by the backend test suite).
* Guard rail: `public.servebell_tables_without_rls` must always be empty (asserted by the test suite).

## Realtime authorisation

`20261102000300_realtime_authorization.sql` — private Broadcast channels, read access decided by `servebell.can_receive(topic)`:

| Topic | Who may receive |
| --- | --- |
| `user:{users.id}` | that user only |
| `restaurant:{restaurants.id}` | ACTIVE members of that restaurant (suspended/removed lose access immediately) |
| `service:{service_requests.id}` | the requesting customer and ACTIVE staff of the request's restaurant |

There is no INSERT policy on `realtime.messages`, so clients cannot publish; the backend sends with the secret key after each change commits.

## Scheduled work

`20261102000400_jobs.sql` (pg_cron + pg_net + Vault):

| Job | Schedule | Action |
| --- | --- | --- |
| `servebell-escalate` | every 30 s | `POST /api/v1/internal/jobs/escalate` |
| `servebell-expire-visits` | every minute | `POST /api/v1/internal/jobs/expire-visits` |
| `servebell-push-sweep` | every minute | `POST /api/v1/internal/jobs/push` (retries + Expo receipts) |
| trigger `push_deliveries_flush` | on insert | same push endpoint, immediately |
| `servebell-retention` | daily 03:17 UTC | delete cron logs > 3 days, push deliveries > 30 days, read notifications > 180 days, audit logs > 365 days |

Ticks are no-ops until two Vault secrets exist (configured in Stage 5):

```sql
select vault.create_secret('https://<api-host>', 'servebell_api_url');
select vault.create_secret('<same value as CRON_SECRET on the API>', 'servebell_cron_secret');
```

## Size budget (free plan: 500 MB)

* Fresh database with migrations + seed: **13 MB** (measured locally). Oracle production data today: 10 MB.
* No media in Postgres: images live in Cloudflare R2; only keys/URLs/metadata are stored (`file_objects`).
* Retention job above keeps the high-volume tables bounded. Check usage: Dashboard → Reports → Database, or
  `select pg_size_pretty(pg_database_size(current_database()));`

## Local development

```bash
supabase start        # Postgres 17 + Auth + Realtime + Mailpit (Studio/Storage/Edge disabled in supabase/config.toml)
supabase db reset     # apply all migrations + seed
supabase test db      # pgTAP security tests (supabase/tests)
supabase stop
```
Local endpoints: API `http://127.0.0.1:54321`, DB `postgresql://postgres:postgres@127.0.0.1:54322/postgres`, mail `http://127.0.0.1:54324`.

## Tests (executed 2026-11-02)

| Suite | Result |
| --- | --- |
| `supabase test db` — 19 pgTAP assertions (RLS on all tables; anon/authenticated denied on users, restaurants, service_requests, role escalation; Realtime topic isolation across restaurants, customers, suspended staff, malformed topics) | **19/19 pass**; a deliberate regression (RLS disabled on `orders`) is detected |
| Backend integration tests on plain Postgres after the schema change | **80/80 pass** |
| Prisma schema ↔ migrations drift | none |

## Cloud project (Stage 3, 2026-11-02)

| Item | Value |
| --- | --- |
| Plan | Free |
| Region | ap-northeast-1 (Tokyo) |
| Project ref | stored in `backend/.env.supabase` (git-ignored) |
| Postgres | 17.11 |
| Runtime connection | transaction pooler, port 6543 (`DATABASE_URL`) |
| Migrations / admin | session pooler, port 5432 (`DIRECT_URL`) |

Credentials live only in `backend/.env.supabase` (mode 600, git-ignored). A database password containing URL-reserved
characters (`@ : / ? #`) must be percent-encoded in the URLs (`@` → `%40`).

Applied with `supabase db push --db-url "$DIRECT_URL" --include-seed` (no `supabase login` needed).

### Verification on the cloud project

| Check | Result |
| --- | --- |
| `supabase test db --db-url "$DIRECT_URL"` (19 pgTAP assertions, run inside a rolled-back transaction) | **19/19 pass** |
| Schema fingerprint vs. local stack (columns 368, constraints 127, indexes 113, public enums 22, policy, `servebell.*` functions) | identical |
| Tables without RLS | 0 |
| REST API with the publishable key on `users`, `restaurants`, `categories` | `42501 permission denied` |
| Seed categories | 8 |
| Cron jobs | 4 registered; escalate / expire-visits / push-sweep run and succeed (no-op until Vault secrets exist) |
| Prisma 7 through the transaction pooler | parallel queries, interactive transactions, rollback: OK |
| Database size | 14 MB of 500 MB |

`prisma migrate diff --from-config-datasource` cannot introspect the cloud database (P4002: `users.authUserId` → `auth.users`
is a cross-schema FK by design). Use the fingerprint comparison above, or run the Prisma drift check against plain Postgres.

### Auth settings (dashboard, still to do)

| Setting | Value |
| --- | --- |
| Authentication → Sign In / Providers → Email | enabled, **Confirm email on** (verified: `mailer_autoconfirm=false`) |
| Authentication → URL Configuration → Site URL | `servebell://auth/callback` |
| Authentication → URL Configuration → Redirect URLs | `servebell://**`, `servebell-restaurant://**`, `exp://**` (Expo Go during development) |
| Authentication → SMTP | custom SMTP required before real users get emails — Supabase's built-in sender only delivers to project team members and is rate-limited |
