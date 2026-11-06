#!/usr/bin/env bash
# Run the API test suite against a THROWAWAY database built the same
# way CI builds its own.
#
# WHY THIS EXISTS
# ---------------
# The API tests are integration tests: they read and write the real
# PostgreSQL. `apps/api/.env` points at a scratch database, and a
# stale DATABASE_URL in the shell silently wins over it -- dotenv does
# not override an existing value. So running the suite without
# thinking about the DSN is how a test ends up writing to production.
#
# The chain script already knows how to build a CI-shaped database
# (drizzle chain, GUS-xxx chain, seed, the numbered chain including
# 0049, the disposable marker). So this script runs THAT, and then
# runs vitest against the database it produced.
#
# It never touches live. The database name is disposable and is
# dropped and recreated at the start.
set -euo pipefail
cd "$(dirname "$0")/.."

DB="${1:-gustale_pr3_vitest}"
PW="${GUSTALE_TEST_PW:-gustale}"

echo "=== build $DB with the CI chain ==="
bash scripts/ci-migration-chain.sh "$DB" >/tmp/pr3_vitest_chain.log 2>&1 || {
  echo "the chain FAILED; tail:"
  tail -25 /tmp/pr3_vitest_chain.log
  exit 1
}
echo "chain OK"

echo
echo "=== the roles (CI does this in scripts/ci-migration-role.sql) ==="
# The API connects as `gustale` -- an ordinary LOGIN role, not the
# superuser. The migrations ran as `postgres`, which owns the tables.
# This mirrors live exactly, and it matters: a privilege check that
# passes because the connector is a superuser tests nothing.
#
# The role script creates the role only if it is missing, and it does
# not RESET an existing role's password. The shared container already
# has a `gustale` role with live's password, so the password is set
# explicitly here -- otherwise the tests fail to connect, which looks
# like a test failure and is not one.
docker exec -u postgres -i shared-postgres psql -U postgres -d postgres \
  -v ON_ERROR_STOP=1 < scripts/ci-migration-role.sql >/tmp/pr3_role.log 2>&1 || {
  echo "the role setup FAILED; tail:"
  tail -20 /tmp/pr3_role.log
  exit 1
}
docker exec -u postgres -i shared-postgres psql -U postgres -d postgres \
  -v ON_ERROR_STOP=1 -c "ALTER ROLE gustale LOGIN PASSWORD '$PW';" >/dev/null
echo "roles OK"

echo
echo "=== the family-dimension fixture ==="
# The CI seed defines 28 families but attaches NONE of them to a
# dish, so a test of the `family=` filter against the raw seed
# measures nothing -- every slug returns zero because the dimension
# is empty, not because the filter is broken.
bash scripts/seed-family-dimension-for-tests.sh "$DB" >/tmp/pr3_fixture.log 2>&1 || {
  echo "the family fixture FAILED; tail:"
  tail -20 /tmp/pr3_fixture.log
  exit 1
}
echo "fixture OK"

echo
echo "=== the content_type column on the built database ==="
docker exec -u postgres -i shared-postgres psql -U postgres -d "$DB" \
  -c "SELECT slug, content_type FROM dishes ORDER BY slug;"

echo
echo "=== the PR 3 end-to-end API verification ==="
export DATABASE_URL="postgres://gustale:${PW}@127.0.0.1:5432/${DB}"
export GUSTALE_DB_IS_THROWAWAY=1
python3 scripts/verify-pr3-api.py || {
  echo "the PR 3 API verification FAILED"
  exit 1
}

echo
echo "=== vitest against $DB ==="
export DATABASE_URL="postgres://gustale:${PW}@127.0.0.1:5432/${DB}"
export GUSTALE_DB_IS_THROWAWAY=1
echo "DATABASE_URL=postgres://gustale:***@127.0.0.1:5432/${DB}"
cd apps/api
pnpm exec vitest run 2>&1 | tail -45
