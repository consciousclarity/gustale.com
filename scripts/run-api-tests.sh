#!/usr/bin/env bash
# Run the API test suite against a given database and show the failures only.
# Usage: run-api-tests.sh <database-name>
set -euo pipefail
export PATH=/home/gustale/.local/node22/bin:$PATH
cd /home/gustale/projects/gustale.com/apps/api

DB_NAME="${1:?usage: run-api-tests.sh <database-name>}"
DB_PASSWORD="$(sed -nE 's#^DATABASE_URL=postgresql://[^:]*:([^@]*)@.*#\1#p' .env | head -1)"
if [ -z "$DB_PASSWORD" ]; then
  echo "could not read the DB password from .env" >&2
  exit 1
fi

export DATABASE_URL="postgresql://gustale:${DB_PASSWORD}@127.0.0.1:5432/${DB_NAME}"
pnpm exec vitest run > /tmp/atlas-vitest.log 2>&1 || true
echo "=== summary ==="
grep -E "Test Files|Tests " /tmp/atlas-vitest.log | tail -4
echo "=== failing tests ==="
grep -E "^ FAIL " /tmp/atlas-vitest.log | sort -u
echo "=== the server-side error ==="
grep -iE "column .* does not exist|categories.*kind|error:" /tmp/atlas-vitest.log | grep -v "internal super-secret" | sort -u | head -12
