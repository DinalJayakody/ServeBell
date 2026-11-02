# Database design

Source: `backend/prisma/schema.prisma` · Migrations: `backend/prisma/migrations/`
PostgreSQL 17 · Prisma 7 (`prisma-client` generator, `@prisma/adapter-pg`).

## Conventions

- UUIDv7 primary keys (time-ordered → good index locality). Never placed in QR codes.
- All timestamps `timestamptz(3)`, written by the server, UTC.
- Money in integer minor units (`priceCents`) plus `currency` (`LKR` default).
- Every restaurant-owned row has `restaurantId` so scoping is a direct `WHERE`.
- Soft delete (`deletedAt`) for users, restaurants, tables, menu categories/items; history tables are append-only.

## Entity groups and relationships

```
users ─┬─< restaurant_members >─ restaurants ─┬─< floor_plans ─┬─< floor_plan_objects
       │                                       │                └─< restaurant_tables ─┬─< table_images
       ├─ customer_profiles (1:1)              │                                         ├─< table_qr_codes
       ├─< owner_onboarding_requests ─(1:1)────┤                                         ├─< reservations
       ├─< employee_invitations (invitedBy)    ├─< employee_invitations                  └─< restaurant_visits
       ├─< restaurant_visits                   ├─< opening_hours, restaurant_images, restaurant_categories >─ categories
       ├─< reservations                        ├─< service_types ─< service_requests ─┬─< service_request_events
       ├─< service_requests (customer)         │                                        ├─< service_dismissals >─ restaurant_members
       ├─< service_messages / read cursors     │                                        ├─< service_messages
       ├─< orders ─< order_items >─ menu_items │                                        └─< service_read_cursors
       ├─< favourites >─ restaurants           ├─< menu_categories ─< menu_items ─┬─< menu_item_images
       ├─< notifications ─< push_deliveries >─ push_devices                       └─< menu_option_groups ─< menu_options
       ├─< files (uploader)                    ├─< utensils, restaurant_amenities
       └─< audit_logs                          └─< files, audit_logs
```

`users.firebaseUid` (unique) links to Firebase Authentication. There are no
password, refresh-token or reset-token tables: Firebase owns credentials.

## Integrity rules enforced by PostgreSQL

| Rule | Mechanism |
| --- | --- |
| No overlapping PENDING/CONFIRMED reservations per table | `EXCLUDE USING gist (tableId =, tstzrange(startsAt, endsAt) &&)` (btree_gist) |
| One ACTIVE QR code per table | partial unique index |
| One ACTIVE visit per customer | partial unique index |
| Table label unique (case-insensitive) among live tables | partial unique index on `lower(label)` |
| Idempotent service requests / orders | unique `(customerId, idempotencyKey)` |
| One notification per dedupe key per user | unique `(userId, dedupeKey)` |
| Sanity checks | CHECK constraints: capacity 1–50, prices ≥ 0, quantities > 0, escalation 1–240 min, opening-hours ranges |

All of these are covered by `backend/test/database-constraints.spec.ts`.

## Hot-path indexes

- Discovery: `restaurants(status, city)`, `restaurants(latitude, longitude)`.
- Waiter queue: `service_requests(restaurantId, status, createdAt)`.
- Escalation scan: partial index `service_requests(createdAt) WHERE status='PENDING'`.
- Analytics per employee: `service_requests(acceptedById, createdAt)`.
- Push worker: `push_deliveries(status, nextAttemptAt)`.

## Seed data (development only)

`pnpm db:seed` — refuses to run when `NODE_ENV=production`. Creates categories,
four restaurants across Sri Lanka, and for **Ocean Breeze (Colombo)** a published
14 m × 10 m floor plan with 12 tables, walls/bar/kitchen objects, QR codes,
menu (prices from the reference UI), utensils, amenities and default services.
Demo Firebase accounts are created only when `SEED_DEMO_ACCOUNTS=true` and a
service account or Auth emulator is configured (see README).
