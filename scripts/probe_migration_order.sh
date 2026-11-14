#!/usr/bin/env bash
# Determine the correct order for the two migration chains.
#
# The repo has TWO migration directories:
#
#   packages/db/drizzle/*.sql  — the original drizzle-kit chain (0000-0014).
#                                0000 creates the base 33 tables.
#   db/migrations/*.sql        — the GUS-xxx chain, which CREATES the
#                                vocabulary tables (dish_families,
#                                dish_cuisines, dish_traditions,
#                                dish_techniques, dish_contexts) that
#                                0000 does NOT create, and seeds the
#                                GUS-242 reference data.
#
# They are INTERLEAVED: the drizzle chain must be applied first (0000
# creates `dishes`, which the GUS-014 files need), and the GUS-xxx chain
# must be applied before the drizzle files that touch the vocabulary
# tables.
#
# This script finds an order that applies cleanly to a fresh database.

set -euo pipefail

# This script DROPs and recreates the database it probes. It must never
# be pointed at the live database, so its target goes through the shared
# guard -- which refuses `gustale` unless the process has made the
# explicit per-invocation opt-in.
DB="$(python3 scripts/lib/db_guard.py probe_migration_order.sh gustale_order_probe)"

# The DEDICATED TEST POSTGRES, never `shared-postgres`.
#
# `DROP DATABASE` is CLUSTER-SCOPED, and the production cluster hosts
# the live database and five other projects' databases. On 2026-11-06
# a `DROP DATABASE` aimed at this cluster destroyed the live database.
# shellcheck source=scripts/lib/test_pg.sh
source scripts/lib/test_pg.sh
DOCKER=(docker exec -u postgres -i "$TEST_PG_CONTAINER")

psql_run() {
  "${DOCKER[@]}" psql -U postgres -d "$1" -v ON_ERROR_STOP=1 -f - "${@:2}"
}

echo "=== creating a fresh probe database ==="
test_pg_up
test_pg_create "$DB"
"${DOCKER[@]}" psql -U postgres -d "$DB" \
  -c "CREATE EXTENSION IF NOT EXISTS postgis;" \
  -c "CREATE EXTENSION IF NOT EXISTS \"uuid-ossp\";" >/dev/null

# The order to try. The drizzle chain runs first (0000 creates `dishes`),
# then the GUS-xxx chain in its documented dependency order, then the
# remaining drizzle files.
read -r -a DRIZZLE <<< "$(git ls-files 'packages/db/drizzle/*.sql' | LC_ALL=C sort)"
read -r -a GUS <<< "gus-014-pilot-dimensions
gus-014-118-dimensions
gus-014-broadened-families
gus-014-broadened-family-corrections
gus-014-technique-fallback
gus-224-relations-option-b
gus-227-preparation-method-names
gus-238-journey-editorial-fields
gus-241-taxonomy-and-unset-dimensions
gus-242-schema-prep
gus-242-seed-countries
gus-242-seed-country-names
gus-242-seed-cuisines
gus-242-seed-regions"

apply() {
  local f="$1"
  if ! psql_run "$DB" < "$f" > /tmp/probe.out 2>&1; then
    echo "FAILED: $f"
    grep -E 'ERROR' /tmp/probe.out | head -2
    return 1
  fi
  echo "ok: $(basename "$f")"
}

echo
echo "=== drizzle chain ==="
for f in "${DRIZZLE[@]}"; do
  apply "$f" || exit 1
done

echo
echo "=== db/migrations chain ==="
for g in "${GUS[@]}"; do
  apply "db/migrations/${g}.sql" || exit 1
done

echo
echo "=== final table count ==="
"${DOCKER[@]}" psql -U postgres -d "$DB" -tAc \
  "select count(*) from information_schema.tables where table_schema='public';"

echo "PROBE OK"
