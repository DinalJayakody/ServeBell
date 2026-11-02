#!/bin/sh
# Runs inside the `backup` container: nightly compressed custom-format dump, pruned after BACKUP_KEEP_DAYS.
set -eu
while true; do
  ts=$(date -u +%Y%m%dT%H%M%SZ)
  file="/backups/servebell-$ts.dump"
  if pg_dump --format=custom --no-owner --file="$file.partial"; then
    mv "$file.partial" "$file"
    echo "[backup] wrote $file ($(du -h "$file" | cut -f1))"
  else
    echo "[backup] FAILED at $ts" >&2
    rm -f "$file.partial"
  fi
  find /backups -name 'servebell-*.dump' -mtime +"${BACKUP_KEEP_DAYS:-14}" -delete
  sleep 86400
done
