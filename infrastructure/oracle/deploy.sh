#!/usr/bin/env bash
# Build and (re)start ServeBell on the server. Safe to run repeatedly (updates in place).
# Usage (from the repo root on the server):  bash infrastructure/oracle/deploy.sh
set -euo pipefail
cd "$(dirname "$0")/../.."
ENV=infrastructure/docker/.env.prod
COMPOSE="docker compose -f infrastructure/docker/docker-compose.prod.yml"
# Small servers (< 2 GB RAM, e.g. E2.1.Micro) get the low-memory profile.
if [ "$(awk '/MemTotal/ {print $2}' /proc/meminfo)" -lt 2000000 ]; then
  COMPOSE="$COMPOSE -f infrastructure/docker/docker-compose.micro.yml"
  echo "▶ Low-memory server detected: using docker-compose.micro.yml"
fi
COMPOSE="$COMPOSE --env-file $ENV"

if [ ! -f "$ENV" ]; then
  echo "▶ Creating $ENV with generated secrets"
  IP=$(curl -fsS https://api.ipify.org || curl -fsS https://ifconfig.me)
  SITE="${IP//./-}.sslip.io"
  ACME=${ACME_EMAIL_INPUT:-}
  [ -n "$ACME" ] || read -r -p "Email for Let's Encrypt notices: " ACME
  FB=${FIREBASE_PROJECT_INPUT:-}
  [ -n "$FB" ] || read -r -p "Firebase project ID [servebell-a7dec]: " FB
  FB=${FB:-servebell-a7dec}
  cp infrastructure/docker/.env.prod.example "$ENV"
  sed -i "s#^POSTGRES_PASSWORD=.*#POSTGRES_PASSWORD=$(openssl rand -hex 24)#" "$ENV"
  sed -i "s#^TOKEN_HASH_SECRET=.*#TOKEN_HASH_SECRET=$(openssl rand -base64 48 | tr -d '\n/+=')#" "$ENV"
  sed -i "s#^SITE_ADDRESS=.*#SITE_ADDRESS=$SITE#; s#^ACME_EMAIL=.*#ACME_EMAIL=$ACME#" "$ENV"
  sed -i "s#^CORS_ORIGINS=.*#CORS_ORIGINS=https://$SITE#; s#^PUBLIC_WEB_URL=.*#PUBLIC_WEB_URL=https://$SITE#" "$ENV"
  sed -i "s#^FIREBASE_PROJECT_ID=.*#FIREBASE_PROJECT_ID=$FB#" "$ENV"
  chmod 600 "$ENV"
  echo "  Site: https://$SITE"
fi

# Import the Firebase service-account key once (uploaded to ~/servebell-secrets), then delete the file.
KEY_FILE=$(ls ~/servebell-secrets/*adminsdk*.json 2>/dev/null | head -1 || true)
if [ -n "$KEY_FILE" ]; then
  echo "▶ Importing Firebase service account from $KEY_FILE"
  B64=$(base64 -w0 "$KEY_FILE")
  sed -i "s#^FIREBASE_SERVICE_ACCOUNT_BASE64=.*#FIREBASE_SERVICE_ACCOUNT_BASE64=$B64#" "$ENV"
  shred -u "$KEY_FILE" 2>/dev/null || rm -f "$KEY_FILE"
  echo "  Stored in $ENV (readable only by you); the uploaded file was deleted."
fi
if ! grep -Eq '^FIREBASE_SERVICE_ACCOUNT_BASE64=.+' "$ENV"; then
  echo "  ⚠ No Firebase service account yet — revoked-session checks are off (guide step 5)."
fi

set -a; . "$ENV"; set +a
if [ "${SKIP_BUILD:-0}" = "1" ]; then
  echo "▶ Using pre-built images (SKIP_BUILD=1)"
  UP_FLAGS="--no-build"
else
  echo "▶ Building images (first build takes a few minutes on Ampere A1)"
  $COMPOSE build
  UP_FLAGS=""
fi
echo "▶ Starting (migrations run automatically before the API)"
$COMPOSE up -d --remove-orphans $UP_FLAGS

echo "▶ Waiting for https://$SITE_ADDRESS/api/v1/health"
for i in $(seq 1 60); do
  if curl -fsS "https://$SITE_ADDRESS/api/v1/health" >/dev/null 2>&1; then
    echo "✔ Live:  API https://$SITE_ADDRESS/api/v1   ·   Web https://$SITE_ADDRESS"
    exit 0
  fi
  sleep 5
done
echo "✖ Not reachable yet. Check: $COMPOSE ps   and   $COMPOSE logs caddy backend --tail 100"
exit 1
