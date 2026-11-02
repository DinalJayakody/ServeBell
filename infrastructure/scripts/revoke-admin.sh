#!/usr/bin/env bash
# Remove PLATFORM_ADMIN from an account in production.  Usage: infrastructure/scripts/revoke-admin.sh someone@example.com
set -euo pipefail
email="${1:?email}"
cd "$(dirname "$0")/../.."
# psql only interpolates :'var' in SQL read from stdin, not in -c.
echo 'UPDATE users SET "platformRole" = '"'"'USER'"'"' WHERE email = lower(:'"'"'email'"'"') AND "platformRole" = '"'"'PLATFORM_ADMIN'"'"' RETURNING email, "platformRole";' |
  docker compose -f infrastructure/docker/docker-compose.prod.yml --env-file infrastructure/docker/.env.prod exec -T postgres \
    sh -c 'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v email="$1"' sh "$email"
