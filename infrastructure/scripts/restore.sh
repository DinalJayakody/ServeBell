#!/usr/bin/env bash
# Restore a backup into the production Postgres container.
# Usage: infrastructure/scripts/restore.sh infrastructure/backups/servebell-YYYYMMDDTHHMMSSZ.dump
# WARNING: replaces existing data. Stop the backend first:
#   docker compose -f infrastructure/docker/docker-compose.prod.yml stop backend
set -euo pipefail
dump="${1:?path to .dump file}"
compose="docker compose -f infrastructure/docker/docker-compose.prod.yml --env-file infrastructure/docker/.env.prod"
read -r -p "Restore $dump over the current database? Type 'restore' to continue: " ok
[ "$ok" = "restore" ] || { echo "Aborted."; exit 1; }
$compose exec -T postgres sh -c 'pg_restore --clean --if-exists --no-owner -U "$POSTGRES_USER" -d "$POSTGRES_DB"' < "$dump"
echo "Restore complete. Start the backend again: $compose start backend"
