# ServeBell — Feature Inventory (audit, 2026-11-02)

What exists today and must keep working after the migration. "Verified" means exercised by the
backend integration tests (80 passing) and/or the scripted end-to-end scenario
(`backend/scripts/demo-scenario.ts`) and/or seen on the iOS simulator. Items marked *untested* have never run on a device build.

## Customer app (apps/customer-app)

| Area | Screens / routes | Backend | Status |
| --- | --- | --- | --- |
| Onboarding & auth | welcome, (auth)/sign-in, sign-up, forgot-password | Firebase + POST /auth/sync | verified (simulator, Expo Go) |
| Discovery | (tabs)/home (location/city/category/search), restaurant/[slug], favourites | GET /restaurants, /restaurants/:slug, /favourites | verified |
| Menu & ordering | menu/[slug], (tabs)/menu, cart, order/[id] | GET /restaurants/:id/menu, POST /orders, GET /orders/:id | verified |
| Table layout | restaurant/[slug] → 2D/3D layout + full-screen viewer, table/[id] | GET /restaurants/:slug/floor-plans, /tables/:id | verified (simulator) |
| Reservations | table/[id] (specific table), reserve/[slug] (any table), reservations | availability, POST /reservations, cancel | verified |
| QR table session | scan (camera), t/[token] deep link, guest count | GET /qr/:token, POST /visits, /visits/active, leave | verified (API); camera *untested on device* |
| **Service bell** | service (grid), request/sent, request/[id] (live status, timeline), (tabs)/requests | POST /services (idempotent), cancel, messages | verified (API + sockets in tests) |
| Chat | chat/[id] | GET/POST /services/:id/messages, read | verified |
| Profile | (tabs)/profile, avatar upload, theme | PATCH /auth/me, uploads | verified |
| Notifications | in-app list, local alerts | /notifications | in-app verified; **remote push untested (needs build)** |

## Restaurant app (apps/restaurant-app)

| Area | Screens / routes | Roles | Status |
| --- | --- | --- | --- |
| Auth & joining | sign-in, sign-up, forgot-password, join (redeem invite code, apply as owner) | any | verified |
| Platform review | admin/applications, Settings → Review owner applications | PLATFORM_ADMIN | verified |
| Home (waiter dashboard) | (tabs)/home | all staff | verified |
| **Requests queue** | (tabs)/requests (Pending/Mine/Others/Done), request/[id] | all staff | verified (atomic accept test) |
| Orders | (tabs)/orders | all staff | verified |
| Team | (tabs)/team (members, invite with code + share), employee/[id] | OWNER/ADMIN | verified |
| Manage | dashboard, profile + hours + go live, menu, menu-item, tables (no plan), floor-plan editor (2D/3D, drafts, photo detection), table/[id], qr (print/PDF/regenerate), catalog (services/utensils/amenities), reservations (assign table) | OWNER/ADMIN | verified (API + simulator); drag/pinch *untested on device* |
| Settings | (tabs)/settings | all | verified |

## Public web (apps/qr-web)

`/` landing, `/t/[token]` table page (opens the app or shows the table), `/r/[slug]` restaurant page.

## Roles (exact names in code)

* Platform: `USER`, `PLATFORM_ADMIN` (users.platformRole)
* Restaurant membership: `OWNER`, `ADMIN`, `WAITER` (restaurant_members.role) with status `ACTIVE|SUSPENDED|REMOVED`
* "Customer" is any signed-in user without a membership; the app (`CUSTOMER` / `RESTAURANT`) is recorded at sync.

The brief's CUSTOMER / RESTAURANT_OWNER / RESTAURANT_ADMIN / WAITER / EMPLOYEE map to: USER (no membership) / OWNER / ADMIN / WAITER / (any membership).

## Service request lifecycle (exact)

`PENDING → ACCEPTED → IN_PROGRESS → COMPLETED` (ACCEPTED may also go straight to COMPLETED), plus `CANCELLED` (customer: from PENDING/ACCEPTED; staff: with reason) and
"Wait" (staff asks guest to wait; stays assigned). Escalation levels 0–4 at multiples of the restaurant threshold (default 15 min).
Accept is a single conditional UPDATE (`status = PENDING AND assignee IS NULL`) → 409 `ALREADY_ACCEPTED` for the loser. Creation is idempotent on `idempotencyKey`.

## Order lifecycle

`PENDING → ACCEPTED → PREPARING → READY → DELIVERED`, `CANCELLED`; idempotent creation; prices snapshotted into order_items.

## HTTP API (104 endpoints, prefix /api/v1)

"Guard" is the decorator found next to the route: `public`, `signed-in` (Firebase token + synced profile), `perm:X` (active restaurant membership with permission X), `platform admin`.

| Method | Path | Guard | Summary |
| --- | --- | --- | --- |
| GET | `/api/v1/auth/me` | signed-in | Current user with restaurant memberships (authenticated) |
| PATCH | `/api/v1/auth/me` | signed-in | Update name, phone or avatar (authenticated) |
| POST | `/api/v1/auth/sync` | signed-in | Create/refresh the local profile after a Firebase sign-in (Firebase token required) |
| GET | `/api/v1/categories` | public | Restaurant categories (public) |
| PUT | `/api/v1/favourites/:restaurantId` | signed-in | Add a favourite (idempotent) |
| DELETE | `/api/v1/favourites/:restaurantId` | signed-in | Remove a favourite (idempotent) |
| GET | `/api/v1/favourites` | signed-in | My favourite restaurants |
| GET | `/api/v1/health` | signed-in |  |
| POST | `/api/v1/invitations/redeem` | signed-in | Join a restaurant with an invitation code (authenticated; code bound to email) |
| DELETE | `/api/v1/notifications/devices/:token` | signed-in | Unregister a device on sign-out (authenticated, own devices only) |
| POST | `/api/v1/notifications/devices` | signed-in | Register this device for push notifications (authenticated) |
| POST | `/api/v1/notifications/read-all` | signed-in | Mark all notifications read (authenticated) |
| GET | `/api/v1/notifications/unread-count` | signed-in | Unread notification count (authenticated) |
| GET | `/api/v1/notifications` | signed-in | My in-app notifications, newest first (authenticated) |
| POST | `/api/v1/onboarding/owner-applications/:id/review` | platform admin | Approve or reject an application (PLATFORM_ADMIN) |
| GET | `/api/v1/onboarding/owner-applications/mine` | signed-in | My applications and their status (authenticated) |
| POST | `/api/v1/onboarding/owner-applications` | signed-in | Apply to register a restaurant as its owner (authenticated) |
| GET | `/api/v1/onboarding/owner-applications` | platform admin | Applications awaiting review (PLATFORM_ADMIN) |
| POST | `/api/v1/orders/:id/cancel` | signed-in | Cancel my order while it is still pending |
| GET | `/api/v1/orders/:id` | signed-in | Order detail (owning customer or restaurant staff) |
| GET | `/api/v1/orders/mine` | signed-in | My orders |
| POST | `/api/v1/orders` | signed-in | Place an order for my table (active visit; server-priced; idempotent) |
| GET | `/api/v1/qr/:token` | public | Resolve a table QR token to its restaurant and table (public) |
| POST | `/api/v1/reservations/:id/cancel` | signed-in | My reservations |
| GET | `/api/v1/reservations/mine` | signed-in | Reserve a table (authenticated; double booking impossible) |
| POST | `/api/v1/reservations` | signed-in | Any-table reservation slots for a restaurant on a date (public) |
| GET | `/api/v1/restaurants/:idOrSlug/availability` | public | Reservation slots for a table on a date (public) |
| GET | `/api/v1/restaurants/:idOrSlug/floor-plans` | public | Published floor plans with live table status (public) |
| GET | `/api/v1/restaurants/:idOrSlug/menu` | public | Food and drink menu with images and options (public) |
| GET | `/api/v1/restaurants/:idOrSlug/tables/:tableId` | public | Published floor plans with live table status (public) |
| GET | `/api/v1/restaurants/:idOrSlug` | optional auth | Restaurant details by id or slug (public; includes isFavourite when signed in) |
| GET | `/api/v1/restaurants/:restaurantId/analytics/summary` | perm:ANALYTICS_READ | Dashboard metrics with date / employee / service-type filters (OWNER/ADMIN) |
| GET | `/api/v1/restaurants/:restaurantId/employees/:memberId` | perm:EMPLOYEES_READ | Employee cards with today/all-time performance (OWNER/ADMIN) |
| PATCH | `/api/v1/restaurants/:restaurantId/employees/:memberId` | perm:EMPLOYEES_MANAGE | Employee profile, filtered metrics and service history (OWNER/ADMIN) |
| GET | `/api/v1/restaurants/:restaurantId/employees` | perm:EMPLOYEES_READ | Dashboard metrics with date / employee / service-type filters (OWNER/ADMIN) |
| DELETE | `/api/v1/restaurants/:restaurantId/invitations/:id` | perm:EMPLOYEES_MANAGE | Revoke an invitation (OWNER/ADMIN) |
| POST | `/api/v1/restaurants/:restaurantId/invitations` | perm:EMPLOYEES_MANAGE | Invite an employee (OWNER/ADMIN; only OWNER can invite ADMIN) |
| GET | `/api/v1/restaurants/:restaurantId/invitations` | perm:EMPLOYEES_MANAGE | List open invitations (OWNER/ADMIN) |
| PATCH | `/api/v1/restaurants/:restaurantId/manage/amenities/:id` | perm:CATALOG_MANAGE |  |
| DELETE | `/api/v1/restaurants/:restaurantId/manage/amenities/:id` | perm:CATALOG_MANAGE |  |
| GET | `/api/v1/restaurants/:restaurantId/manage/amenities` | perm:CATALOG_MANAGE |  |
| POST | `/api/v1/restaurants/:restaurantId/manage/amenities` | perm:CATALOG_MANAGE |  |
| POST | `/api/v1/restaurants/:restaurantId/manage/floor-plans/:id/detect` | perm:FLOORPLAN_MANAGE | Set or clear the reference photo traced in the editor (OWNER/ADMIN) |
| PUT | `/api/v1/restaurants/:restaurantId/manage/floor-plans/:id/draft` | perm:FLOORPLAN_MANAGE | Save full layout (tables + objects) with expectedVersion (OWNER/ADMIN) |
| DELETE | `/api/v1/restaurants/:restaurantId/manage/floor-plans/:id/draft` | perm:FLOORPLAN_MANAGE | Save work in progress as a draft; the live layout is unchanged (OWNER/ADMIN) |
| POST | `/api/v1/restaurants/:restaurantId/manage/floor-plans/:id/publish` | perm:FLOORPLAN_MANAGE | Discard the draft (OWNER/ADMIN) |
| PUT | `/api/v1/restaurants/:restaurantId/manage/floor-plans/:id/reference` | perm:FLOORPLAN_MANAGE | Publish or unpublish a floor plan (OWNER/ADMIN) |
| PUT | `/api/v1/restaurants/:restaurantId/manage/floor-plans/:id` | perm:FLOORPLAN_MANAGE | Create an empty floor plan (OWNER/ADMIN) |
| GET | `/api/v1/restaurants/:restaurantId/manage/floor-plans` | perm:RESTAURANT_READ | Table details: capacity, photos, zone, nearby features, status (public) |
| POST | `/api/v1/restaurants/:restaurantId/manage/floor-plans` | perm:FLOORPLAN_MANAGE | All floor plans incl. drafts (staff) |
| PUT | `/api/v1/restaurants/:restaurantId/manage/hours` | perm:RESTAURANT_MANAGE | Update profile (OWNER/ADMIN) |
| PATCH | `/api/v1/restaurants/:restaurantId/manage/menu/categories/:id` | perm:MENU_MANAGE |  |
| DELETE | `/api/v1/restaurants/:restaurantId/manage/menu/categories/:id` | perm:MENU_MANAGE |  |
| GET | `/api/v1/restaurants/:restaurantId/manage/menu/categories` | perm:MENU_MANAGE |  |
| POST | `/api/v1/restaurants/:restaurantId/manage/menu/categories` | perm:MENU_MANAGE |  |
| PATCH | `/api/v1/restaurants/:restaurantId/manage/menu/items/:id` | perm:MENU_MANAGE |  |
| DELETE | `/api/v1/restaurants/:restaurantId/manage/menu/items/:id` | perm:MENU_MANAGE |  |
| GET | `/api/v1/restaurants/:restaurantId/manage/menu/items` | perm:MENU_MANAGE |  |
| POST | `/api/v1/restaurants/:restaurantId/manage/menu/items` | perm:MENU_MANAGE |  |
| GET | `/api/v1/restaurants/:restaurantId/manage/qr-codes/print` | perm:QR_MANAGE | QR code per table with SVG preview (OWNER/ADMIN) |
| GET | `/api/v1/restaurants/:restaurantId/manage/qr-codes` | perm:QR_MANAGE | Table description, features and photos (OWNER/ADMIN) |
| PATCH | `/api/v1/restaurants/:restaurantId/manage/service-types/:id` | perm:SERVICE_TYPES_MANAGE |  |
| DELETE | `/api/v1/restaurants/:restaurantId/manage/service-types/:id` | perm:SERVICE_TYPES_MANAGE |  |
| GET | `/api/v1/restaurants/:restaurantId/manage/service-types` | perm:CATALOG_MANAGE |  |
| POST | `/api/v1/restaurants/:restaurantId/manage/service-types` | perm:SERVICE_TYPES_MANAGE |  |
| POST | `/api/v1/restaurants/:restaurantId/manage/status` | perm:RESTAURANT_MANAGE | Replace weekly opening hours (OWNER/ADMIN) |
| PUT | `/api/v1/restaurants/:restaurantId/manage/tables/:tableId/basics` | perm:FLOORPLAN_MANAGE | Add a table without a floor plan; its QR code is created (OWNER/ADMIN) |
| POST | `/api/v1/restaurants/:restaurantId/manage/tables/:tableId/qr/deactivate` | perm:QR_MANAGE | Issue a new QR (old one stops working) (OWNER/ADMIN) |
| POST | `/api/v1/restaurants/:restaurantId/manage/tables/:tableId/qr/regenerate` | perm:QR_MANAGE | Print-ready HTML sheet of table QR codes (OWNER/ADMIN) |
| DELETE | `/api/v1/restaurants/:restaurantId/manage/tables/:tableId` | perm:FLOORPLAN_MANAGE | Rename / resize a table (OWNER/ADMIN) |
| PUT | `/api/v1/restaurants/:restaurantId/manage/tables/:tableId` | perm:FLOORPLAN_MANAGE | Remove a table; its QR stops working (OWNER/ADMIN) |
| GET | `/api/v1/restaurants/:restaurantId/manage/tables` | perm:RESTAURANT_READ | Suggest tables and landmarks from an uploaded room photo (OWNER/ADMIN). Nothing is saved. |
| POST | `/api/v1/restaurants/:restaurantId/manage/tables` | perm:FLOORPLAN_MANAGE | All tables, with or without a floor plan (staff) |
| PATCH | `/api/v1/restaurants/:restaurantId/manage/utensils/:id` | perm:CATALOG_MANAGE |  |
| DELETE | `/api/v1/restaurants/:restaurantId/manage/utensils/:id` | perm:CATALOG_MANAGE |  |
| GET | `/api/v1/restaurants/:restaurantId/manage/utensils` | perm:MENU_MANAGE |  |
| POST | `/api/v1/restaurants/:restaurantId/manage/utensils` | perm:CATALOG_MANAGE |  |
| GET | `/api/v1/restaurants/:restaurantId/manage` | perm:RESTAURANT_READ | Restaurant profile for staff (any member) |
| PATCH | `/api/v1/restaurants/:restaurantId/manage` | perm:RESTAURANT_MANAGE | Restaurant profile for staff (any member) |
| POST | `/api/v1/restaurants/:restaurantId/orders/:id/status` | perm:ORDERS_HANDLE | Advance an order: ACCEPTED → PREPARING → READY → DELIVERED, or CANCELLED |
| GET | `/api/v1/restaurants/:restaurantId/orders` | perm:ORDERS_HANDLE | Open or completed orders for the restaurant |
| POST | `/api/v1/restaurants/:restaurantId/reservations/:id/status` | perm:RESERVATIONS_MANAGE | Reservations by local date and status (staff) |
| GET | `/api/v1/restaurants/:restaurantId/reservations` | perm:RESERVATIONS_READ | Cancel my reservation |
| POST | `/api/v1/restaurants/:restaurantId/services/:id/accept` | perm:SERVICES_HANDLE | Accept (atomic; 409 ALREADY_ACCEPTED if someone was faster) |
| POST | `/api/v1/restaurants/:restaurantId/services/:id/cancel` | perm:SERVICES_HANDLE | Cancel with a reason (assignee, or OWNER/ADMIN) |
| POST | `/api/v1/restaurants/:restaurantId/services/:id/complete` | perm:SERVICES_HANDLE | Complete (assignee, or OWNER/ADMIN) |
| POST | `/api/v1/restaurants/:restaurantId/services/:id/start` | perm:SERVICES_HANDLE | Mark in progress (assignee, or OWNER/ADMIN) |
| POST | `/api/v1/restaurants/:restaurantId/services/:id/wait` | perm:SERVICES_HANDLE | Wait: hide from my queue, leave it for other staff (does not cancel) |
| GET | `/api/v1/restaurants/:restaurantId/services/stats/me` | perm:SERVICES_HANDLE | My counts and average acceptance/completion times today |
| GET | `/api/v1/restaurants/:restaurantId/services` | perm:SERVICES_HANDLE | Queue and history: view=pending|mine|others|done|all (all = OWNER/ADMIN) |
| GET | `/api/v1/restaurants` | public | Discover restaurants: search, filter, distance ordering, cursor pagination (public) |
| POST | `/api/v1/services/:id/cancel` | signed-in | Cancel my pending/accepted request (owning customer) |
| GET | `/api/v1/services/:id/messages` | signed-in | Conversation history (customer, involved staff, or auditing admin) |
| POST | `/api/v1/services/:id/messages` | signed-in | Send a message (customer or involved staff; idempotent by clientMessageId) |
| POST | `/api/v1/services/:id/read` | signed-in | Mark conversation read |
| GET | `/api/v1/services/:id` | signed-in | Request detail with timeline (owning customer or restaurant staff) |
| GET | `/api/v1/services/mine` | signed-in | My service requests (customer) |
| POST | `/api/v1/services` | signed-in | Request a service at my table (customer with an active visit; idempotent) |
| GET | `/api/v1/tables/:tableId/availability` | public | Reservation slots for a table on a date (public) |
| GET | `/api/v1/uploads/files/:key` | public | Serve a locally stored image (public) |
| POST | `/api/v1/uploads` | signed-in |  |
| POST | `/api/v1/visits/:id/leave` | signed-in | Leave the restaurant / end the table session (authenticated, own visit) |
| GET | `/api/v1/visits/active` | signed-in | My active table session, or null (authenticated) |
| POST | `/api/v1/visits` | signed-in | Start (or refresh) a table session from a scanned QR (authenticated customer) |
