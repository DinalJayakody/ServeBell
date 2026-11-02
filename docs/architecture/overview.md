# ServeBell architecture

## System at a glance

```
 Customer App (Expo)      Restaurant App (Expo)        QR Web (Next.js)
   guests + customers       owners / admins / waiters    scanned-QR landing
        │  Firebase JS SDK         │ Firebase JS SDK              │ (public reads only)
        │  (sign-in, tokens)       │                              │
        ▼                          ▼                              ▼
   ┌──────────────────────── NestJS API  /api/v1 ───────────────────────┐
   │ FirebaseAuthGuard → local user │ RestaurantAccessGuard (membership+permission)
   │ REST (source of truth) · Socket.IO (change notifications) · cron jobs │
   └───────────────┬───────────────────────────────┬────────────────────┘
                   ▼                               ▼
             PostgreSQL 17                 Cloudflare R2 (media)
         (Prisma 7, pg adapter)            Expo Push Service (outbox)
```

One backend, one database, three clients. Business rules live only in the API; the
apps share contracts (`@servebell/shared`) and one HTTP client (`@servebell/api-client`).

## Key decisions

| Decision | Choice | Why |
| --- | --- | --- |
| Identity | **Firebase Authentication** (JS SDK in apps, `firebase-admin` in API) | Requested by product. Gives email/password, Google, Apple, password reset, session refresh and abuse protection for free. The JS SDK works in Expo Go. |
| Authorization | **Postgres memberships**, checked per request | Firebase has no concept of "waiter at restaurant X". Keeping roles in our DB means suspensions apply instantly and a waiter can never reach owner APIs, whatever the client does. |
| Contracts | Zod schemas in `@servebell/shared`; types inferred | One definition validates API input *and* app forms; types cannot drift. A test asserts shared enums equal Prisma enums. (The spec's separate `shared-types` and `validation` packages are merged for this reason.) |
| Mobile shared code | `@servebell/design-system` + `@servebell/mobile-core` (TS source, compiled by Metro) | Avoids duplicating session/theme/auth-form logic across the two apps. |
| Backend modules | NestJS 12 (ESM), thin controllers, services own logic | Matches spec; ESM is required by Nest 12. |
| Data integrity | DB constraints for invariants | Double booking blocked by a Postgres **exclusion constraint**; one active QR per table and one active visit per customer via partial unique indexes. Concurrency-safe by construction. |
| Concurrency for "accept" | Atomic conditional `UPDATE … WHERE status='PENDING'` | Two waiters tapping Accept: exactly one succeeds, the other gets `ALREADY_ACCEPTED`. Pattern already used for invitation redemption and onboarding review (tested). |
| Escalation (15 min) | Server cron + conditional update on `escalationLevel` | Device timers are untrustworthy; the conditional update guarantees one escalation per threshold even with several API instances. |
| Push | Expo Push via DB **outbox** (`push_deliveries`) | Retries, ticket/receipt tracking, and an honest SENT vs DELIVERED distinction. In-app notifications are always written as the fallback. |
| Redis | **Not used yet** | Single VPS, single API process. Add only for multi-instance Socket.IO (redis adapter) or heavy queues. |
| Media | Cloudflare R2 behind a storage interface; local disk in dev | Cheap egress; provider swappable. Never base64 in Postgres. |
| 3D | Generated from the same floor-plan rows as the 2D blueprint | See below. |

## Floor plan: one geometry, two renderings

`floor_plans`, `restaurant_tables` and `floor_plan_objects` store centimetre
coordinates, size and rotation (`packages/shared/src/floor-plan.ts` defines the
model). The 2D SVG blueprint and the 3D scene are **pure functions of these
rows** — neither stores positions of its own, so they cannot diverge. Table IDs
are stable UUIDs used by both renderers, reservations and QR codes.

3D rendering plan (Phase 8): `expo-gl` + `three` via `@react-three/fiber/native`
(both available in Expo Go), extruding walls/objects to `DEFAULT_OBJECT_HEIGHT_CM`
and placing table meshes at the same x/y (→ x/z). No generative AI: it cannot
guarantee positions. Video-assisted layout: the admin uploads a photo/video frame
as a **reference overlay** in the 2D editor and traces tables manually; automatic
reconstruction is not promised.

## Service request lifecycle

```
PENDING ──accept (atomic)──▶ ACCEPTED ──start──▶ IN_PROGRESS ──complete──▶ COMPLETED
   │  ▲ "Wait" = per-waiter dismissal, request stays PENDING for everyone else
   └──────────────── cancel (customer/staff) ─────────────────▶ CANCELLED
```

Timestamps (`createdAt`, `acceptedAt`, `startedAt`, `completedAt`, `cancelledAt`)
are written by the server in UTC; every transition appends a
`service_request_events` row (audit trail). Durations are computed from server
timestamps only (`durationMs` in shared). Transitions are defined once in
`SERVICE_TRANSITIONS`.

## Realtime

Socket.IO authenticates with the Firebase ID token at handshake, then joins rooms
after a membership check (`restaurant:{id}:staff`, `service:{id}`, `user:{id}`).
Events (`RealtimeEvent` in shared) only announce changes; clients refetch or patch
their TanStack Query cache, so REST stays the source of truth and reconnects
simply refetch.

## QR codes and visits

A QR encodes `https://<web>/t/<token>` — a 128-bit random token, never a DB id.
Regenerating bumps `version` and revokes the old token. Scanning starts a
**visit** (server-side, expiring, one active per customer). Every customer action
(service request, order) is validated against an active visit for that
restaurant/table; the QR alone authorises nothing.

## Technical risks and mitigations

| Risk | Mitigation |
| --- | --- |
| Expo Go cannot verify remote push, Google sign-in, or custom native code | Documented in `docs/testing/expo-go.md`; use EAS development builds for those. |
| Node 25 is not supported by Prisma | `.nvmrc` pins Node 22 LTS; Docker uses Node 22. |
| Firebase outage blocks sign-in | Existing sessions keep working until token expiry (1h); public browsing needs no auth. |
| Single VPS is a single point of failure | Nightly `pg_dump` with retention, documented restore; stateless API can be moved quickly. |
| Hoisted pnpm + React Native duplicates | `autoInstallPeers: false`, single React version override, `expo-doctor` in CI. |
| 3D performance on low-end Android | Low-poly primitives, no textures by default, 2D view is the primary interaction. |
