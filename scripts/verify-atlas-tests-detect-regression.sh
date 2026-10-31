#!/usr/bin/env bash
# Prove the atlas schema tests can DETECT a regression.
#
# A negative test that cannot detect a regression is not a test. So each
# constraint is dropped on a throwaway copy, the test suite is re-run, and
# the suite MUST FAIL. If the suite still passes with the constraint gone,
# the test is not actually testing that constraint.
#
# Usage: verify-atlas-tests-detect-regression.sh
set -uo pipefail

cd /home/gustale/projects/gustale.com
DB=gustale_atlas_regress
SQL=scripts/test_atlas_schema.sql

docker exec -u postgres shared-postgres psql -U postgres -d postgres \
  -c "DROP DATABASE IF EXISTS ${DB};" >/dev/null 2>&1
docker exec -u postgres shared-postgres createdb -U postgres "$DB"
docker exec -u postgres shared-postgres pg_restore -U postgres -d "$DB" \
  --no-owner --no-privileges /tmp/gustale_atlas_snapshot.dump >/dev/null 2>&1 || true
docker exec -u postgres shared-postgres psql -U postgres -d "$DB" \
  -c "GRANT ALL ON SCHEMA public TO gustale;" \
  -c "GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO gustale;" \
  -c "GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO gustale;" >/dev/null

echo "=== applying 0036 to the copy ==="
docker exec -u postgres -i shared-postgres psql -U postgres -d "$DB" -v ON_ERROR_STOP=1 \
  -f - < db/migrations/0036_atlas_schema.sql >/dev/null 2>&1

echo "=== the suite passes on the intact schema ==="
docker exec -u postgres -i shared-postgres psql -U postgres -d "$DB" -v ON_ERROR_STOP=1 \
  -f - < "$SQL" 2>&1 | grep -E "ATLAS_SCHEMA_TESTS" | tail -2

echo ""
echo "=== now: drop each constraint and prove the suite FAILS ==="

run_case() {
  local name="$1"
  local drop_sql="$2"

  # restore the schema from a clean copy each time
  docker exec -u postgres shared-postgres psql -U postgres -d postgres \
    -c "DROP DATABASE IF EXISTS ${DB};" >/dev/null 2>&1
  docker exec -u postgres shared-postgres createdb -U postgres "$DB"
  docker exec -u postgres shared-postgres pg_restore -U postgres -d "$DB" \
    --no-owner --no-privileges /tmp/gustale_atlas_snapshot.dump >/dev/null 2>&1 || true
  docker exec -u postgres shared-postgres psql -U postgres -d "$DB" \
    -c "GRANT ALL ON SCHEMA public TO gustale;" \
    -c "GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO gustale;" \
    -c "GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO gustale;" >/dev/null
  docker exec -u postgres -i shared-postgres psql -U postgres -d "$DB" -v ON_ERROR_STOP=1 \
    -f - < db/migrations/0036_atlas_schema.sql >/dev/null 2>&1

  # the regression
  docker exec -u postgres shared-postgres psql -U postgres -d "$DB" -c "$drop_sql" >/dev/null 2>&1

  # the suite must now FAIL
  local out
  out="$(docker exec -u postgres -i shared-postgres psql -U postgres -d "$DB" \
    -f - < "$SQL" 2>&1)"
  if echo "$out" | grep -qE "ATLAS_SCHEMA_TESTS: [0-9]+ passed, [1-9][0-9]* failed"; then
    local n
    n="$(echo "$out" | grep -oE "ATLAS_SCHEMA_TESTS: [0-9]+ passed, [0-9]+ failed" | tail -1)"
    echo "DETECTED  $name  (the suite reported: $n)"
  elif echo "$out" | grep -qE "FAIL  "; then
    # The suite reported a failing case but the summary line was not
    # captured (the DO block raises, so psql may not reach it).
    local n
    n="$(echo "$out" | grep -cE "FAIL  ")"
    echo "DETECTED  $name  (the suite reported $n failing case(s))"
  else
    echo "NOT DETECTED  $name  <-- THE TEST IS NOT TESTING THIS"
  fi
}

# NOTE ON `IF EXISTS`
#
# Every DROP in the cases below is `IF EXISTS`. The regression copy is a
# pg_restore of a snapshot, and a trigger that was created AFTER the
# snapshot (or by a migration that ran only on live) is simply not there.
# Without `IF EXISTS`, the DROP raises, the psql call aborts, and the
# regression silently measures nothing — which is exactly the failure
# this script exists to catch.

run_case "the evidence_status CHECK" \
  "ALTER TABLE statements DROP CONSTRAINT statements_evidence_status_check;"
run_case "dispute_state CHECK" \
  "ALTER TABLE statements DROP CONSTRAINT statements_dispute_state_check;"
run_case "the statements.status gate trigger" \
  "DROP TRIGGER IF EXISTS statements_status_gate_trg ON statements;"
run_case "the claim_dates interval-order CHECK" \
  "ALTER TABLE claim_dates DROP CONSTRAINT claim_dates_interval_order_check;"
run_case "the dpa relationship-type CHECK" \
  "ALTER TABLE dish_place_associations DROP CONSTRAINT dpa_relationship_type_check;"
run_case "the dpa entity-kind guard trigger" \
  "DROP TRIGGER IF EXISTS dpa_entity_guard_trg ON dish_place_associations;"
# The symmetric-pair index and the variant cycle guard are SHADOWED by
# the pre-existing check_relation_direction() trigger, which refuses the
# exact inverse of a directional relation and requires from < to for a
# symmetric one. So to prove the NEW constraint is doing the work, the
# regression drops the OLD trigger as well — otherwise the old one refuses
# the bad write first and the new one is never exercised.
run_case "the symmetric-pair unique index (with the old direction trigger)" \
  "DROP INDEX IF EXISTS dish_relations_symmetric_pair_uniq; DROP TRIGGER IF EXISTS trg_b_check_relation_direction ON dish_relations;"
run_case "the regional_variant_of cycle trigger (with the old direction trigger)" \
  "DROP TRIGGER IF EXISTS trg_c_check_variant_cycle ON dish_relations; DROP TRIGGER IF EXISTS trg_b_check_relation_direction ON dish_relations;"
run_case "the family parent cycle trigger (with the old self-parent guard)" \
  "DROP TRIGGER IF EXISTS dish_families_parent_cycle_trg ON dish_families; DROP TRIGGER IF EXISTS trg_family_parent ON dish_families;"
run_case "the dish_identities kind CHECK" \
  "ALTER TABLE dish_identities DROP CONSTRAINT dish_identities_kind_check;"

echo ""
docker exec -u postgres shared-postgres psql -U postgres -d postgres \
  -c "DROP DATABASE IF EXISTS ${DB};" >/dev/null 2>&1
echo "the regression copy is dropped"
