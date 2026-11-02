# API contracts

Base path `/api/v1`. Interactive docs (non-production): `http://<host>:4000/api/docs`.

**Authentication**: `Authorization: Bearer <Firebase ID token>`. The API verifies
it with `firebase-admin`, then resolves the local user by `firebaseUid`. A valid
token without a local profile gets `403 PROFILE_REQUIRED` everywhere except
`POST /auth/sync`.

**Errors** always look like:

```json
{ "statusCode": 409, "code": "ALREADY_ACCEPTED", "message": "…", "details": [{ "path": "email", "message": "…" }], "requestId": "…" }
```

Codes: `packages/shared/src/schemas/common.ts` (`ErrorCode`). Clients branch on
`code`, never on `message`.

**Validation**: request bodies/queries are parsed with the Zod schemas from
`@servebell/shared` (`ZodPipe`). The typed client is `@servebell/api-client`.

**Pagination**: `?limit=&cursor=` → `{ items, nextCursor }`.

## Implemented

| Method & path | Auth | Purpose |
| --- | --- | --- |
| `GET /health` | public | Liveness + DB check |
| `POST /auth/sync` | Firebase token (profile optional) | Create/refresh local profile; returns `SessionUser` with memberships |
| `GET /auth/me` | user | Current user + memberships |
| `PATCH /auth/me` | user | Update name / phone / avatar |
| `POST /onboarding/owner-applications` | user | Apply to own a restaurant |
| `GET /onboarding/owner-applications/mine` | user | Own applications |
| `GET /onboarding/owner-applications?status=` | PLATFORM_ADMIN | Review queue |
| `POST /onboarding/owner-applications/:id/review` | PLATFORM_ADMIN | Approve (creates restaurant + OWNER + default services atomically) / reject |
| `POST /restaurants/:restaurantId/invitations` | employees:manage | Invite (owner-only for ADMIN); returns one-time code |
| `GET /restaurants/:restaurantId/invitations` | employees:manage | Open invitations |
| `DELETE /restaurants/:restaurantId/invitations/:id` | employees:manage | Revoke |
| `POST /invitations/redeem` | user | Join with code (bound to invited email, single use) |
| `GET /categories` | public | Restaurant categories |
| `GET /restaurants?q&city&category&lat&lng&cursor&limit` | public | Discovery with distance ordering |
| `GET /restaurants/:idOrSlug` | public (+`isFavourite` when signed in) | Details, hours, services, amenities, utensils |
| `GET /qr/:token` | public, rate-limited | Resolve table QR → restaurant + table |
| `POST /notifications/devices` | user | Register Expo push token |
| `DELETE /notifications/devices/:token` | user (own) | Unregister on sign-out |
| `GET /notifications` · `GET /notifications/unread-count` · `POST /notifications/read-all` | user | In-app notifications |
| `POST /visits` | user | Start/refresh table session from a scanned QR (token or any URL form) |
| `GET /visits/active` · `POST /visits/:id/leave` | user (own) | Restore / end the session |
| `POST /services` | customer with active visit | Request a service (idempotency key; open duplicates return the existing request) |
| `GET /services/mine?active=` · `GET /services/:id` · `POST /services/:id/cancel` | owner customer (detail also staff) | History, detail with timeline, cancel |
| `GET/POST /services/:id/messages` · `POST /services/:id/read` | customer, assigned/pending staff, auditing admin | Conversation |
| `GET /restaurants/:rid/services?view=pending\|mine\|others\|done\|all` | services:handle (`all` = services:monitor) | Queue / history with filters |
| `GET /restaurants/:rid/services/stats/me` | services:handle | My counts and average times today |
| `POST /restaurants/:rid/services/:id/accept\|wait\|start\|complete\|cancel` | services:handle (progress: assignee or OWNER/ADMIN) | Lifecycle; accept is atomic (`409 ALREADY_ACCEPTED`) |

| `GET /restaurants/:idOrSlug/menu` | public | Categories, items (photos, availability), option groups |
| `POST /orders` | customer with active visit | Place order; server-priced, option rules enforced, idempotent |
| `GET /orders/mine` · `GET /orders/:id` · `POST /orders/:id/cancel` | owner customer (detail also staff) | History, live detail, cancel while pending |
| `GET /restaurants/:rid/orders?view=open\|done` · `POST /restaurants/:rid/orders/:id/status` | orders:handle | Kitchen/waiter flow ACCEPTED → PREPARING → READY → DELIVERED / CANCELLED |
| `POST /uploads` (multipart `file`, `purpose`, `restaurantId?`) | AVATAR: any user · others: menu/catalog/floorplan managers | Validated, EXIF-stripped, resized WebP; R2 or local disk |
| `GET /uploads/files/:key` | public (local storage only) | Serve dev images (immutable cache) |

Socket.IO (`/socket.io`, `auth: { token: <Firebase ID token> }`): auto-joins `user:{id}`;
`room.join.restaurant {id}` (staff, membership checked) and `room.join.service {id}`.
Events: `service.created|accepted|started|completed|cancelled|escalated`, `order.created|updated`,
`service.message.created`, `notification.created`.

## Planned (by phase)

| Group | Endpoints |
| --- | --- |
| Menu admin (P4) | CRUD categories/items/options/availability under `/restaurants/:rid/menu/*` |
| Reservations (P3/P4) | `GET /restaurants/:rid/tables/:tid/availability` · `POST /reservations` · `GET /reservations/mine` · `GET /restaurants/:rid/reservations` · confirm/reject/cancel |
| Floor plans (P4/P8) | `GET /restaurants/:rid/floor-plans` (published, public) · `PUT /restaurants/:rid/floor-plans/:id` (`saveLayoutSchema`, optimistic `expectedVersion`) · publish |
| QR admin (P4) | list · regenerate · deactivate · printable PDF |
| Catalog (P4) | utensils, amenities, service types CRUD |
| Employees (P4) | list with metrics · profile · history · suspend/remove |
| Analytics (P4) | dashboard summary · per-employee metrics (date/employee/type filters) |
| Favourites (P3) | `GET /favourites` · `PUT/DELETE /favourites/:restaurantId` |
| Realtime (P6) | `order.*`, `reservation.updated`, `menu.updated`, `restaurant.layout.updated` events |
