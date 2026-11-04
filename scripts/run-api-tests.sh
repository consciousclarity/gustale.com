#!/usr/bin/env bash
# Run the API test suite against a given database and show the failures only.
# Usage: run-api-tests.sh <database-name>
set -euo pipefail
export PATH=/home/gustale/.local/node22/bin:$PATH
cd /home/gustale/projects/gustale.com/apps/api

DB_NAME="${1:?usage: run-api-tests.sh <database-name>}"

# The test suite must NEVER run against the live database. It can write
# to it, and even a read-only test can change the numbers another test
# asserts on. Reaching live requires the explicit, per-invocation
# opt-in -- the same variable scripts/lib/db_guard.py uses.
if [ "$DB_NAME" = "gustale" ] && [ "${GUSTALE_LIVE_DB_ALLOW:-}" != "1" ]; then
  echo "REFUSED: the test suite would run against the LIVE database ('gustale')." >&2
  echo "" >&2
  echo "  The test suite must never run against production." >&2
  echo "  Point it at a scratch database:" >&2
  echo "" >&2
  echo "      scripts/run-api-tests.sh gustale_dev" >&2
  echo "" >&2
  echo "  ...or, if you really mean it:" >&2
  echo "" >&2
  echo "      GUSTALE_LIVE_DB_ALLOW=1 scripts/run-api-tests.sh gustale" >&2
  echo "" >&2
  exit 1
fi
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
