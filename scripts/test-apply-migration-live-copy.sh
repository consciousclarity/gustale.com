#!/usr/bin/env bash
# The live-migration gate must be able to RUN, and it must run its copy
# on the TEST Postgres.
#
# WHY THIS IS SEPARATE
# --------------------
# `scripts/apply-migration-live.sh` is a gate for the LIVE database. A
# gate that can only be run against production is a gate that never runs,
# and this one had a defect that only production could have found: it
# created and dropped its copy of the live database ON THE PRODUCTION
# CLUSTER, which RULES.md forbids (`DROP DATABASE` and `CREATE DATABASE`
# are cluster-scoped, and `shared-postgres` hosts the live database AND
# five other projects' databases).
#
# The owner's own apply of 0052 on 2026-11-09 was done DIRECTLY with
# psql, precisely because this script could not be used. This test is
# what stops that from being the normal way to apply a migration.
#
# WHAT IT DOES
# ------------
#   1. Builds a STAND-IN production container -- a PostGIS container of
#      its own, on its own port, with a `gustale` database in it.
#   2. Restores the migration-built schema into that stand-in.
#   3. Runs the gate against the stand-in, with the production
#      container and the expected counts overridden.
#   4. Asserts the outcome: the gate succeeds, the copy was created and
#      dropped on the TEST container, and the stand-in's CLUSTER never
#      gained a database.
#
# Step 4 is the point. The gate can pass while still creating its copy
# on the wrong cluster; this asserts WHERE the copy was.
#
# Usage: bash scripts/test-apply-migration-live-copy.sh
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

# shellcheck source=scripts/lib/test_pg.sh
source "${REPO_ROOT}/scripts/lib/test_pg.sh"

STANDIN_CONTAINER="gustale-gate-standin"
STANDIN_DB="gustale"
SRC_DB="gustale_gate_src"
COPY_DB="gustale_atlas_gate_copy"

failures=0
check() {
  local ok="$1" msg="$2"
  if [ "$ok" = "1" ]; then
    echo "  OK    $msg"
  else
    echo "  FAIL  $msg"
    failures=$((failures + 1))
  fi
}

cleanup() {
  docker rm -f "$STANDIN_CONTAINER" >/dev/null 2>&1 || true
  test_pg_drop "$SRC_DB" >/dev/null 2>&1 || true
  test_pg_drop "$COPY_DB" >/dev/null 2>&1 || true
}
trap cleanup EXIT

echo "=== 1. the stand-in production container ==="
docker rm -f "$STANDIN_CONTAINER" >/dev/null 2>&1 || true
docker run -d --name "$STANDIN_CONTAINER" \
  -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD=gustale -e POSTGRES_DB=postgres \
  -p 127.0.0.1:5435:5432 "$TEST_PG_IMAGE" >/dev/null
for i in $(seq 1 30); do
  if docker exec "$STANDIN_CONTAINER" pg_isready -U postgres -d postgres >/dev/null 2>&1; then
    break
  fi
  sleep 1
done
docker exec "$STANDIN_CONTAINER" pg_isready -U postgres -d postgres >/dev/null 2>&1 \
  || { echo "FAILED: the stand-in did not become ready"; exit 1; }
echo "  the stand-in is up: $STANDIN_CONTAINER"

docker exec -u postgres -i "$STANDIN_CONTAINER" psql -U postgres -d postgres \
  -c "CREATE DATABASE ${STANDIN_DB};" >/dev/null
docker exec -u postgres -i "$STANDIN_CONTAINER" psql -U postgres -d postgres \
  -c "CREATE ROLE gustale LOGIN NOSUPERUSER PASSWORD 'gustale';" >/dev/null 2>&1 || true

echo ""
echo "=== 2. the schema, built on the TEST Postgres and copied over ==="
test_pg_up >/dev/null
test_pg_create "$SRC_DB"
bash scripts/ci-migration-chain.sh "$SRC_DB" >/tmp/gate_test_chain.log 2>&1 \
  || { echo "FAILED: the chain did not pass"; tail -20 /tmp/gate_test_chain.log; exit 1; }
docker exec -u postgres "$TEST_PG_CONTAINER" \
  pg_dump -U "$TEST_PG_ADMIN" -d "$SRC_DB" --format=custom \
  --file="/tmp/gate_test_src.dump" >/dev/null
docker cp "${TEST_PG_CONTAINER}:/tmp/gate_test_src.dump" /tmp/gate_test_src.dump >/dev/null
docker cp /tmp/gate_test_src.dump "${STANDIN_CONTAINER}:/tmp/gate_test_src.dump" >/dev/null
docker exec -u postgres -i "$STANDIN_CONTAINER" \
  pg_restore -U postgres -d "$STANDIN_DB" --no-owner --no-privileges --clean --if-exists \
  /tmp/gate_test_src.dump >/dev/null 2>&1 || true

# The chain marks its database disposable. The stand-in plays the part
# of PRODUCTION, and production must never carry that marker -- so it
# is removed here, and the gate's own check for it is part of the test.
docker exec -u postgres -i "$STANDIN_CONTAINER" psql -U postgres -d "$STANDIN_DB" \
  -c "DROP TABLE IF EXISTS public.gustale_disposable_database;" >/dev/null 2>&1 || true

# The chain also seeds the ATLAS FIXTURES. Production must never carry
# them -- the gate's fixture check refuses to run if it finds any -- so
# they are removed here, and the gate's own fixture check is part of
# the test.
docker exec -u postgres -i "$STANDIN_CONTAINER" psql -U postgres -d "$STANDIN_DB" \
  -c "DELETE FROM dish_place_associations WHERE provenance='atlas_fixture';" \
  -c "DELETE FROM statements WHERE qualifiers->>'provenance'='atlas_fixture';" \
  >/dev/null 2>&1 || true

echo ""
echo "=== 3. the expected counts, read from the stand-in ==="
COUNTS_FILE=/tmp/gate_test_counts.txt
: > "$COUNTS_FILE"
for t in statements claim_citations dish_relations dish_families dishes sources \
         geo_entities dish_traditions users media dish_names vocabulary_labels; do
  n=$(docker exec -u postgres -i "$STANDIN_CONTAINER" psql -U postgres -d "$STANDIN_DB" \
        -tAc "SELECT count(*) FROM ${t};" 2>/dev/null | tr -d ' ')
  [ -z "$n" ] && n=0
  echo "${t}=${n}" >> "$COUNTS_FILE"
done
echo "  $(wc -l < "$COUNTS_FILE") counts recorded"

echo ""
echo "=== 4. the gate, run against the stand-in ==="
# The production container and the expected counts are overridden. The
# OVERRIDE IS THE POINT: it is what lets the gate be exercised at all.
#
# `set +e` around the gate: a non-zero exit is a RESULT to be
# asserted, not a reason to abort the test before the assertions run.
set +e
GUSTALE_PROD_PG_CONTAINER="$STANDIN_CONTAINER" \
GUSTALE_LIVE_EXPECTED_COUNTS="$COUNTS_FILE" \
  bash scripts/apply-migration-live.sh db/migrations/0052_recipes_schema.sql \
  > /tmp/gate_test_run.log 2>&1
GATE_RC=$?
set -e
echo "  the gate exited $GATE_RC"
tail -3 /tmp/gate_test_run.log | sed 's/^/  /'

echo ""
echo "=== 5. the assertions ==="
check "$([ "$GATE_RC" -eq 0 ] && echo 1 || echo 0)" \
  "the gate succeeds against the stand-in"
check "$(grep -q 'LIVE_MIGRATION_OK=1' /tmp/gate_test_run.log && echo 1 || echo 0)" \
  "the gate reports LIVE_MIGRATION_OK=1"

# THE COPY MUST HAVE BEEN ON THE TEST CONTAINER.
COPY_ON_TEST=$(docker exec -u postgres -i "$TEST_PG_CONTAINER" psql -U postgres -d postgres \
  -tAc "SELECT count(*) FROM pg_database WHERE datname='${COPY_DB}';" 2>/dev/null | tr -d ' ')
check "$([ "$COPY_ON_TEST" = "0" ] && echo 1 || echo 0)" \
  "the copy was DROPPED on the test container"

# AND THE STAND-IN'S CLUSTER MUST NOT HAVE GAINED A DATABASE. This is
# the assertion that catches the defect this file exists for.
STANDIN_DBS=$(docker exec -u postgres -i "$STANDIN_CONTAINER" psql -U postgres -d postgres \
  -tAc "SELECT count(*) FROM pg_database WHERE datname='${COPY_DB}';" 2>/dev/null | tr -d ' ')
check "$([ "$STANDIN_DBS" = "0" ] && echo 1 || echo 0)" \
  "the copy was NEVER CREATED on the production cluster"

# The stand-in's total database count must be unchanged: the original
# plus the standard three (postgres, template0, template1) and
# template_postgis.
STANDIN_TOTAL=$(docker exec -u postgres -i "$STANDIN_CONTAINER" psql -U postgres -d postgres \
  -tAc "SELECT count(*) FROM pg_database;" 2>/dev/null | tr -d ' ')
check "$([ "$STANDIN_TOTAL" -le 6 ] && echo 1 || echo 0)" \
  "the production cluster has no extra database (total ${STANDIN_TOTAL})"

# The migration's own proof must have run on the copy.
check "$(grep -q 'ATLAS_SCHEMA_TESTS' /tmp/gate_test_run.log && echo 1 || echo 0)" \
  "the constraint tests ran on the copy"

# The scanner must still pass -- the gate is no longer exempt.
set +e
python3 scripts/check-no-production-db-drops.py >/dev/null 2>&1
SCANNER_RC=$?
set -e
check "$([ "$SCANNER_RC" -eq 0 ] && echo 1 || echo 0)" \
  "the production-drop scanner still passes with the gate NOT exempt"

echo ""
if [ "$failures" -ne 0 ]; then
  echo "  FAIL  $failures check(s) failed"
  exit 1
fi
echo "  ALL PASS"
exit 0
