# ServeBell

Restaurant service ecosystem: a **Customer App** and a **Restaurant App** (Expo /
React Native), a **QR web experience** (Next.js) and one **NestJS + PostgreSQL**
backend, in a pnpm monorepo.

```
apps/customer-app      Expo SDK 58 — guests & customers
apps/restaurant-app    Expo SDK 58 — owners, admins, customer assistants
apps/qr-web            Next.js 16 — page opened by table QR codes
backend                NestJS 12 (ESM), Prisma 7, PostgreSQL 17
packages/shared        Zod contracts, enums, permissions, realtime events (single source of truth)
packages/api-client    Typed HTTP client used by all three clients
packages/design-system Tokens (light + dark) and React Native components
packages/mobile-core   Firebase session, API wiring, providers, auth forms shared by both apps
infrastructure         Dockerfiles, production compose, Nginx, backup/restore scripts
docs                   Architecture, database, API, testing, deployment
```

Progress and known issues: [DEVELOPMENT_STATUS.md](DEVELOPMENT_STATUS.md).

## Prerequisites

- Node **22 LTS** (`nvm use`; Prisma does not support Node 25), pnpm 10 (`npm i -g pnpm@10`)
- Docker Desktop
- A free **Firebase** project (Authentication)
- Expo Go (SDK 58) on your phone

## Quick start (no accounts needed)

Development uses a local **Firebase Auth emulator**, so nothing has to be created online.

```bash
nvm use                       # Node 22
pnpm install                  # also builds shared packages
pnpm db:up && pnpm db:deploy  # PostgreSQL in Docker + migrations
pnpm dev:stack                # Auth emulator + API (:4000) + QR web (:3000)   — keep running
pnpm db:seed                  # in another terminal: demo restaurant + demo accounts
pnpm dev:customer             # Customer App  (Metro :8081) — press i for iOS simulator
pnpm dev:restaurant           # Restaurant App (Metro :8082) — press i, or scan with Expo Go
pnpm dev:tables               # table QR sheet + simulator "scan" commands
pnpm dev:smoke                # automated end-to-end check of the running stack
```

Full guide for simulators + your phone at the same time:
[docs/testing/expo-go.md](docs/testing/expo-go.md).

### Using a real Firebase project (optional, required for production)

1. <https://console.firebase.google.com> → **Add project** → Authentication → enable **Email/Password**.
2. Project settings → Your apps → **Web app** → copy `apiKey`, `authDomain`, `projectId`, `appId` into
   `apps/customer-app/.env` and `apps/restaurant-app/.env` (`EXPO_PUBLIC_FIREBASE_*`).
3. `backend/.env`: set `FIREBASE_PROJECT_ID`, clear `FIREBASE_AUTH_EMULATOR_HOST`, and optionally
   add `FIREBASE_SERVICE_ACCOUNT_BASE64` (`base64 -i key.json | tr -d '\n'`) for revoked-token checks.

### Running without a VPS

No server is needed for development: the backend, database and web app run on
your computer and your phone talks to it over Wi-Fi. To let someone **outside**
your network try it before you rent a VPS, use a free Cloudflare quick tunnel:

```bash
brew install cloudflared
cloudflared tunnel --url http://localhost:4000      # prints https://<random>.trycloudflare.com
# put that URL in EXPO_PUBLIC_API_URL in both app .env files (and use a real Firebase project)
pnpm --filter @servebell/customer-app start:tunnel
```

A VPS is only required when you want a permanent public URL for real customers
and staff: see [docs/deployment/vps.md](docs/deployment/vps.md).

## Demo accounts (development only)

Created by `pnpm db:seed` in the local Auth emulator (or a real project when a service
account is configured and `SEED_DEMO_ACCOUNTS=true`). Password: `ServeBell#2026`.
The sign-in screens show one-tap demo buttons in development.

| Email | Role |
| --- | --- |
| admin@servebell.dev | Platform admin (approves owners) |
| owner@servebell.dev | Owner of Ocean Breeze |
| manager@servebell.dev | Admin of Ocean Breeze |
| waiter@servebell.dev, waiter2@servebell.dev | Customer assistants |
| customer@servebell.dev | Customer |

To make another account platform admin locally:
`docker compose exec postgres psql -U servebell -c "update users set \"platformRole\"='PLATFORM_ADMIN' where email='you@example.com'"`.

## Tests and checks

```bash
pnpm test         # shared + api-client unit tests, backend integration tests (needs pnpm db:up)
pnpm typecheck    # every workspace
pnpm --filter @servebell/customer-app doctor
```

Backend tests run against a separate `servebell_test` database created automatically.

## Production builds

```bash
pnpm build                                                    # packages, backend, web
docker compose -f infrastructure/docker/docker-compose.prod.yml --env-file infrastructure/docker/.env.prod up -d --build
npx eas-cli@latest build --profile production                 # inside each Expo app (after `eas init`)
```
