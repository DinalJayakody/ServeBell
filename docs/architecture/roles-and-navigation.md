# Roles, permissions and navigation

## Roles

| Role | Scope | How it is obtained |
| --- | --- | --- |
| Guest | Public | No account. Browse restaurants, menus, layouts, QR landing. |
| Customer (`USER`) | Own data | Firebase sign-up → `POST /auth/sync`. |
| `OWNER` | One restaurant | Owner application approved by a platform admin (never self-assigned). |
| `ADMIN` | One restaurant | Invitation created by the **owner**. |
| `WAITER` (Customer Assistant) | One restaurant | Invitation created by owner or admin. |
| `PLATFORM_ADMIN` | Platform | Set directly in the database by operators. Reviews owner applications. |

A person can hold different roles in different restaurants (`restaurant_members`).

## Permission matrix

Defined once in `packages/shared/src/permissions.ts`; enforced only by
`RestaurantAccessGuard` (loads the membership from Postgres on every request).

| Permission | OWNER | ADMIN | WAITER |
| --- | :-: | :-: | :-: |
| restaurant:read | ✓ | ✓ | ✓ |
| restaurant:manage (profile, hours, settings) | ✓ | ✓ | |
| employees:read / employees:manage | ✓ | ✓ | |
| ownership:transfer | ✓ | | |
| services:handle (accept / wait / start / complete) | ✓ | ✓ | ✓ |
| services:monitor (all requests, all staff) | ✓ | ✓ | |
| service-types:manage | ✓ | ✓ | |
| messages:participate | ✓ | ✓ | ✓ |
| messages:audit (read all conversations) | ✓ | ✓ | |
| floorplan:manage / qr:manage / menu:manage / catalog:manage | ✓ | ✓ | |
| orders:handle | ✓ | ✓ | ✓ |
| reservations:read | ✓ | ✓ | ✓ |
| reservations:manage | ✓ | ✓ | |
| analytics:read (restaurant-wide) | ✓ | ✓ | |
| analytics:self | ✓ | ✓ | ✓ |
| audit:read | ✓ | ✓ | |

Extra rule in service code: only an `OWNER` may invite an `ADMIN`.

Customer-side rules are ownership checks in services (a customer only sees
their own visits, requests, orders, reservations, favourites).

## Customer App navigation (Expo Router, `apps/customer-app/src/app`)

```
/                       → redirect: onboarding (first launch) or tabs
/onboarding             3 slides, Skip, shown once                          ✅
/(auth)  [modal]        sign-in · sign-up · forgot-password                  ✅
/(tabs)
  ├─ index  Discover    search, categories, near me / city, infinite list   ✅
  ├─ visit  At table    active visit hero "Request a waiter", services      ⏳ P3
  ├─ requests           service + order history, live status                ⏳ P3/P5
  └─ profile            account, appearance (System/Light/Dark), sign out   ✅
/restaurant/[slug]      details: hours, services, amenities, utensils        ✅
   ├─ menu · floor plan (2D/3D) · table/[id] · reserve                       ⏳ P3/P8
/scan                   camera QR scanner → visit                            ⏳ P3
/request/[id]           request detail, timeline, chat                       ⏳ P3/P5
/favourites                                                                    ⏳ P3
```

## Restaurant App navigation (`apps/restaurant-app/src/app`)

```
/                       session gate → sign-in | join | tabs                 ✅
/sign-in /sign-up /forgot-password                                            ✅
/join                   redeem invitation code · apply as owner + status      ✅
/admin/applications     platform admin: approve / reject owners               ✅
/(tabs)   (tabs shown per permission; API enforces independently)
  ├─ index   Home       restaurant, role, employee ID, restaurant switcher    ✅
  │                     → waiter queue / owner dashboard                       ⏳ P4/P5
  ├─ requests           pending · mine · others · completed; Accept / Wait     ⏳ P5
  ├─ team               invite (code + share), pending invitations, revoke     ✅
  │                     → employee cards, profiles, performance                ⏳ P4
  ├─ manage             floor plan editor, QR, menu, utensils, amenities,
  │                     service types, reservations                            ⏳ P4/P8
  └─ settings           profile, appearance, sign out                          ✅
```
