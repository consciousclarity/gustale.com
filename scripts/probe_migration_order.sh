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

DB="gustale_order_probe"
DOCKER=(docker exec -u postgres -i shared-postgres)

psql_run() {
  "${DOCKER[@]}" psql -U postgres -d "$1" -v ON_ERROR_STOP=1 -f - "${@:2}"
}

echo "=== creating a fresh probe database ==="
"${DOCKER[@]}" psql -U postgres -d postgres -c "DROP DATABASE IF EXISTS ${DB};" >/dev/null
"${DOCKER[@]}" psql -U postgres -d postgres -c "CREATE DATABASE ${DB};" >/dev/null
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
