# Deploying to a VPS (Hostinger or any Ubuntu host)

Status: the full production stack (Postgres, migrate, API, web, Caddy HTTPS, backups) is
built and smoke-tested locally on arm64 (same CPU architecture as Oracle Ampere A1).
It has **not** yet been deployed to a real server.

## 1. Server

Ubuntu 24.04, 2 vCPU / 4 GB RAM is enough to start.

```bash
adduser deploy && usermod -aG sudo deploy
apt update && apt upgrade -y
curl -fsSL https://get.docker.com | sh && usermod -aG docker deploy
ufw allow OpenSSH && ufw allow 80 && ufw allow 443 && ufw enable
```

## 2. Domain and HTTPS

HTTPS is automatic: **Caddy** (in the compose stack) obtains and renews Let's Encrypt
certificates for `SITE_ADDRESS`. Use either your domain (an `A` record → server IP) or,
with no domain, `<ip-with-dashes>.sslip.io`. Ports 80 and 443 must be reachable.
With Cloudflare in front, use SSL mode **Full (strict)**.

> **Oracle Cloud Always Free** has its own step-by-step guide: [oracle.md](oracle.md).

## 3. Configuration

```bash
git clone <repo> /opt/servebell && cd /opt/servebell
cp infrastructure/docker/.env.prod.example infrastructure/docker/.env.prod
nano infrastructure/docker/.env.prod
```

Required: `POSTGRES_PASSWORD`, `TOKEN_HASH_SECRET` (`openssl rand -base64 48`),
`FIREBASE_PROJECT_ID`, `SITE_ADDRESS`, `ACME_EMAIL`, `CORS_ORIGINS`, `PUBLIC_WEB_URL`
(`infrastructure/oracle/deploy.sh` fills these in automatically). Recommended:
`FIREBASE_SERVICE_ACCOUNT_BASE64` (`base64 -w0 service-account.json`), SMTP, R2.
The API refuses to start with placeholder secrets or the Auth emulator in production.

## 4. Start

```bash
docker compose -f infrastructure/docker/docker-compose.prod.yml --env-file infrastructure/docker/.env.prod up -d --build
docker compose -f infrastructure/docker/docker-compose.prod.yml ps
curl -k https://localhost/api/v1/health
```

The `migrate` service runs `prisma migrate deploy` before the API starts.
Never run `db:seed` in production (the seed script refuses anyway).

## 5. Updates

```bash
git pull
docker compose -f infrastructure/docker/docker-compose.prod.yml --env-file infrastructure/docker/.env.prod up -d --build
```

## 6. Backups and restore

- The `backup` service writes `pg_dump --format=custom` nightly to
  `infrastructure/backups/` (or `BACKUP_DIR`), keeping `BACKUP_KEEP_DAYS`.
- Copy backups off the server (e.g. `rclone` to R2) — a backup on the same disk is not a backup.
- Restore: stop the backend, then `infrastructure/scripts/restore.sh <file.dump>`.
- Test a restore regularly on a scratch machine.

## 7. Storage (Cloudflare R2)

Create a bucket, an API token with object read/write, and a public bucket domain
(or custom domain). Fill `R2_*` variables. (Upload module lands in Phase 4.)

## 8. Mobile production configuration

Set in each app's EAS environment / `.env`: `EXPO_PUBLIC_API_URL=https://<domain>`
and the `EXPO_PUBLIC_FIREBASE_*` values. Build with `eas build --profile production`.

## Operations

- Logs: `docker compose … logs -f backend` (JSON, rotated at 10 MB × 5).
- Memory caps: API 768 MB, web 384 MB. Watch `docker stats`.
- Restart policy `unless-stopped` on all long-running services.
