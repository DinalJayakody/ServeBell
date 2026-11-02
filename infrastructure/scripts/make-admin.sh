#!/usr/bin/env bash
# Grant PLATFORM_ADMIN (approves restaurant owners) in production.
# The account must have signed in to an app once.  Usage: infrastructure/scripts/make-admin.sh you@example.com
set -euo pipefail
email="${1:?email}"
cd "$(dirname "$0")/../.."
# psql only interpolates :'var' in SQL read from stdin, not in -c.
echo 'UPDATE users SET "platformRole" = '"'"'PLATFORM_ADMIN'"'"' WHERE email = lower(:'"'"'email'"'"') RETURNING email, "platformRole";' |
  docker compose -f infrastructure/docker/docker-compose.prod.yml --env-file infrastructure/docker/.env.prod exec -T postgres \
    sh -c 'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v email="$1"' sh "$email"
