# ServeBell — Current Architecture (audit, 2026-11-02)

This document describes the system **as it exists today**, before the Supabase / Vercel migration.
Everything here was read from the repository and from the running Oracle server; nothing was changed.

## 1. Repository

| Item | Value |
| --- | --- |
| Layout | pnpm 10 monorepo (`nodeLinker: hoisted`), Node ≥ 22, TypeScript ~6.0 |
| Git | Repository initialised on `main`, **no commits yet**, **no remote**. CI workflow exists (`.github/workflows/ci.yml`: Postgres service, typecheck, tests) but has never run. |
| Workspaces | `apps/customer-app`, `apps/restaurant-app`, `apps/qr-web`, `backend`, `packages/{shared,api-client,design-system,mobile-core,config}` |
| Secrets on disk | `backend/.env`, `apps/*/.env`, `docs/deployment/servebell-a7dec-firebase-adminsdk-*.json` — all git-ignored (verified with `git check-ignore`). The admin-SDK key file should still be moved out of the repo folder. |

```
apps/customer-app      Expo SDK 58, Expo Router — guests
apps/restaurant-app    Expo SDK 58, Expo Router — owners, admins, waiters, platform admin
apps/qr-web            Next.js 16 — public pages behind table QR codes (/t/:token, /r/:slug)
backend                NestJS 12 (ESM), Prisma 7.10 + @prisma/adapter-pg, PostgreSQL 17
packages/shared        Zod schemas, enums, permission matrix, lifecycles, realtime event names, geometry
packages/api-client    Typed fetch client (token refresh, uploads)
packages/design-system Theme tokens + components (dark navy glass UI), motion helpers, InfoTip
packages/mobile-core   Session (Firebase), API instance, realtime (Socket.IO), notifications, floor plan 2D/3D
```

## 2. Runtime topology (production today)

```
 iPhone / Android (Expo Go for now)
   ├─ Firebase Auth (JS SDK, project servebell-a7dec) ──► ID token
   └─ HTTPS + WebSocket ──► Caddy (Let's Encrypt, 140-245-242-243.sslip.io)
                              ├─ /api/*, /socket.io/* ──► backend (NestJS, :4000)
                              └─ everything else ─────► qr-web (Next.js, :3000)
                           backend ──► PostgreSQL 17 (container, not exposed)
                           backend ──► local disk volume "uploads" (images, WebP)
                           backend ──► Expo Push API (outbox worker)
                           backup container ──► nightly pg_dump to infrastructure/backups
```

| Host fact | Value (measured) |
| --- | --- |
| Oracle shape | **VM.Standard.E2.1.Micro, x86_64, ~0.5 GB RAM + 4.5 GB swap** (not ARM64 / 1 GB as the brief states) |
| OS | Oracle Linux 9 |
| Containers | postgres 17, migrate (one-shot), backend, qr-web, caddy, backup |
| Database size | **10 MB** |
| Latest migration | `20261031180000_floor_drafts_screens` |

## 3. Authentication today (Firebase)

* **Client** (`packages/mobile-core/src/session.ts`, `firebase.ts`): Firebase JS SDK with React-Native persistence.
  Email/password sign-up and sign-in, email verification, password reset, Google/Apple credential sign-in (code present; needs dev builds).
  `onIdTokenChanged` → `POST /auth/sync` creates/updates the local `users` row (`firebaseUid`, email, name, app).
* **Server** (`backend/src/auth/firebase-token.verifier.ts`, `common/guards/firebase-auth.guard.ts`):
  global guard verifies the Firebase ID token (`checkRevoked` with the service account); decorators `@Public`, `@OptionalAuth`, `@AllowUnsynced`.
  `email_verified` is read from the token and required for owner applications and invitation redemption.
* **Authorisation** is entirely backend-side: `RestaurantAccessGuard` + `@RequirePermission(Permission.X)` checks the caller's
  active `restaurant_members` row and the permission matrix in `packages/shared/src/permissions.ts`; `@RequirePlatformAdmin` for platform review.
* Firebase is used **only** for Auth. No Firestore, Storage, FCM, Analytics or Remote Config is used in code.

### Firebase users (read with the Admin SDK, read-only)

| Email | Firebase UID | Verified | Server profile | Notes |
| --- | --- | --- | --- | --- |
| dinaljayakody25@gmail.com | aBn8mwghbNbvVJljfCtNcCk5NbF2 | yes | yes — **PLATFORM_ADMIN**, OWNER of "Test Owner" | **real user** |
| dinal25@gmail.com | Xecd2POHRuUEFgDGUrzvgQ9nj2g1 | no | yes — USER | **real user** |
| dinal@gmail.com | PRr1H74F8SbI3uyu4zYw75I4Hef2 | no | no (only in local dev DB) | test account |
| dinaljayakody25+owner / +owner2 / +waiter / +guest / +reviewer @gmail.com | (5 UIDs) | yes | 4 of 5 on server | demo accounts created by `backend/scripts/demo-scenario.ts` |

So Firebase holds **8** accounts, of which **2 are the real users** referred to in the brief.

## 4. Backend

NestJS modules: `auth`, `onboarding`, `restaurants` (discovery), `manage` (profile, hours, menu, catalog, floor plans, tables, QR,
reservations, analytics), `employees` (invitations, members), `visits`, `services` (service requests, messages), `orders`,
`menu`, `favourites`, `notifications` (+ push outbox worker), `uploads`, `realtime`, `health`, `mail`, `audit`.

* **104 HTTP endpoints** under `/api/v1` (full list in `SERVEBELL_FEATURE_INVENTORY.md`).
* Validation: Zod schemas from `@servebell/shared` via `ZodPipe`.
* Hardening: helmet, `@nestjs/throttler`, pino logs, Swagger in development only, CORS allow-list.
* **Long-running pieces** (do not fit serverless as they are):

| Piece | Where | Behaviour |
| --- | --- | --- |
| Socket.IO gateway | `realtime/realtime.gateway.ts` | Firebase-token handshake; rooms `restaurant:{id}:staff`, `user:{id}`, `service:{id}` |
| Escalation job | `services/escalation.job.ts` | every **30 s**: one SQL `UPDATE … RETURNING` bumps escalation level of PENDING requests past the restaurant threshold (default 15 min) |
| Visit expiry | `visits/visits.service.ts` | every **60 s**: expires table sessions |
| Push worker | `notifications/push.worker.ts` | every **5 s**: drains `push_deliveries` outbox (`FOR UPDATE SKIP LOCKED`) to Expo Push, then reads receipts |
| Uploads | `uploads/*` | multipart up to 12 MB → sharp → WebP → `LocalStorage` (disk) or `R2Storage` (already implemented, not configured) |
| Layout detection | `floor-plans/layout-detect.service.ts` | optional Anthropic API call (key not configured) |

## 5. Database (PostgreSQL via Prisma)

38 models / 22 enums (`backend/prisma/schema.prisma`, 4 migrations). Key relationships:

```
users ─┬─ customer_profiles
       ├─ restaurant_members (role OWNER|ADMIN|WAITER, status) ── restaurants
       ├─ owner_onboarding_requests (applicant, reviewer)
       ├─ restaurant_visits ── restaurant_tables ── table_qr_codes
       ├─ service_requests ── service_request_events / service_messages / service_read_cursors / service_dismissals
       ├─ orders ── order_items ── menu_items ── menu_categories
       ├─ reservations (tableId nullable = any-table) ── restaurant_tables
       ├─ notifications, push_devices ── push_deliveries
       └─ file_objects (uploads), audit_logs
restaurants ─ opening_hours, restaurant_images, categories, service_types, utensils, amenities,
              floor_plans ── floor_plan_objects, restaurant_tables, employee_invitations
```

Database-level guarantees that must survive the migration:

* `reservations_no_overlap` **exclusion constraint** (`btree_gist`) — no double booking of a table.
* Partial unique indexes: one active QR per table, one active visit per customer, unique live table label per restaurant.
* CHECK constraints (prices ≥ 0, capacity, etc.), soft deletes (`deletedAt`), UUIDv7 ids, `timestamptz(3)`.
* Atomic conditional `updateMany` for every lifecycle transition (accept / start / complete / cancel), optimistic `version` on floor plans.

Live row counts (Oracle, 2026-11-02): users 6, restaurants 1, restaurant_members 1, restaurant_tables 6, table_qr_codes 6,
floor_plans 1, service_types 9, owner_onboarding_requests 3 (2 pending demo), notifications 2, audit_logs 13; **file_objects 0**
(no uploaded media to migrate).

## 6. Mobile apps

| | Customer app | Restaurant app |
| --- | --- | --- |
| Name / slug | ServeBell / `servebell-customer` | ServeBell Restaurant / `servebell-restaurant` |
| Bundle id (iOS & Android) | `app.servebell.customer` | `app.servebell.restaurant` |
| Scheme | `servebell` | `servebell-restaurant` |
| Version | 0.1.0 | 0.1.0 |
| EAS | **no `eas.json`, no `owner`, no `extra.eas.projectId`** | same |
| Sign in with Apple | `usesAppleSignIn: true` | `usesAppleSignIn: true` |
| Distribution so far | Expo Go only (Expo account `dinal25`) | same |

Shared client plumbing (`packages/mobile-core`): `session.ts` (Firebase), `api` instance (`EXPO_PUBLIC_API_URL`),
`realtime.ts` (Socket.IO client, reconnect, room joins), `notifications.ts` (expo-notifications; local alerts in Expo Go; Expo push token registration when a projectId exists), `media.ts` (image picker + upload), floor plan 2D (react-native-svg) and 3D (three.js on expo-gl).

## 7. Realtime events (Socket.IO today)

`service.created|accepted|started|completed|cancelled|escalated`, `service.message.created`, `order.created|updated`,
`reservation.updated`, `restaurant.layout.updated`, `menu.updated`, `notification.created`.
Staff of a restaurant receive restaurant events; customers receive events for their own requests/orders/reservations.

## 8. Known gaps relevant to the migration

1. Firebase-specific identity column `users.firebaseUid` and token verifier.
2. Socket.IO + three interval jobs need a serverless design.
3. Local-disk uploads; request bodies up to 12 MB (Vercel limit is 4.5 MB).
4. No EAS project / credentials; push to closed apps untested (needs a build).
5. No Git history — there is no baseline to roll back to.
