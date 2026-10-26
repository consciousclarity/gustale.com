#!/usr/bin/env bash
#
# GUS-014 pilot — V4 rollback TEST.
#
# Proves the rollback path works, on a COPY of the database. Never touches
# the live `gustale` database:
#
#   1. restore the snapshot into a throwaway database
#   2. verify the copy is IDENTICAL to the snapshot baseline
#   3. mutate the copy (simulate the pilot migration writing dimension data)
#   4. verify the copy now DIVERGES from the baseline (the mutation landed)
#   5. restore the snapshot over the mutated copy (the rollback)
#   6. verify the copy is IDENTICAL to the baseline again
#   7. drop the throwaway database
#
# Step 4 is the important one: without it, step 6 could pass simply because
# the mutation never landed, and the test would prove nothing.
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
SNAPSHOT_DIR="${GUS014_SNAPSHOT_DIR:-$REPO_ROOT/.hermes/snapshots/gus-014}"
PG_CONTAINER="${PG_CONTAINER:-shared-postgres}"
PG_SUPERUSER="${PG_SUPERUSER:-postgres}"
LIVE_DB="${LIVE_DB:-gustale}"
TEST_DB="${GUS014_TEST_DB:-gustale_pilot_rollback_test}"

SNAP="${1:-}"
if [ -z "$SNAP" ]; then
  SNAP="$(find "$SNAPSHOT_DIR" -mindepth 1 -maxdepth 1 -type d | sort | tail -1)"
fi
[ -d "$SNAP" ] || { echo "no snapshot found in $SNAPSHOT_DIR" >&2; exit 2; }

SCRIPT="$SCRIPT_DIR/gus-014-pilot-snapshot.sh"
fail=0
step() { echo; echo "--- $* ---"; }
ok()   { echo "   PASS  $*"; }
bad()  { echo "   FAIL  $*"; fail=1; }

echo "================================================================"
echo " GUS-014 V4 ROLLBACK TEST"
echo " snapshot: $SNAP"
echo " test db:  $TEST_DB  (live '$LIVE_DB' is never touched)"
echo "================================================================"

cleanup() {
  echo
  echo "-- cleanup: dropping '$TEST_DB'"
  docker exec "$PG_CONTAINER" psql -v ON_ERROR_STOP=1 -U "$PG_SUPERUSER" -d postgres \
    -c "DROP DATABASE IF EXISTS \"$TEST_DB\" WITH (FORCE);" >/dev/null 2>&1 || true
}
trap cleanup EXIT

step "1. restore snapshot into throwaway copy"
bash "$SCRIPT" restore "$SNAP" "$TEST_DB" || { bad "restore failed"; exit 1; }

step "2. verify the copy matches the baseline"
if bash "$SCRIPT" verify "$SNAP" "$TEST_DB"; then
  ok "copy is identical to baseline (pre-rollback state confirmed)"
else
  bad "copy does NOT match baseline after restore"
fi

step "3. mutate the copy (simulate the pilot writing dimension data)"
docker exec -i "$PG_CONTAINER" psql -v ON_ERROR_STOP=1 -U "$PG_SUPERUSER" -d "$TEST_DB" <<'SQL'
-- Simulate what the pilot migration will do to the 3 pilot dishes:
-- add a category, change a description, add a relation.
INSERT INTO dish_categories (id, dish_id, category_id, is_primary)
SELECT gen_random_uuid(), d.id,
       (SELECT id FROM categories WHERE name = 'Appetizer' LIMIT 1),
       false
FROM dishes d WHERE d.slug = 'rendang'
  AND NOT EXISTS (
    SELECT 1 FROM dish_categories dc JOIN categories c ON c.id=dc.category_id
    WHERE dc.dish_id=d.id AND c.name='Appetizer'
  );

UPDATE dishes
SET short_description = short_description || ' [PILOT MUTATION]',
    edit_count = edit_count + 1,
    updated_at = now()
WHERE slug IN ('rendang','chicken-tikka-masala','tacos-al-pastor');

INSERT INTO dish_relations (id, from_dish_id, to_dish_id, relation_type, reason, strength)
SELECT gen_random_uuid(), d.id, s.id, 'ancestor',
       'Al pastor derives from Levantine shawarma', 4
FROM dishes d, dishes s
WHERE d.slug='tacos-al-pastor' AND s.slug='shawarma'
  AND NOT EXISTS (
    SELECT 1 FROM dish_relations dr
    WHERE dr.from_dish_id=d.id AND dr.to_dish_id=s.id AND dr.relation_type='ancestor'
  );
SQL

# Assert the mutation actually landed — do not trust the exit code alone.
mut_count="$(docker exec "$PG_CONTAINER" psql -U "$PG_SUPERUSER" -d "$TEST_DB" -tAc "
  SELECT count(*) FROM dishes WHERE slug IN ('rendang','chicken-tikka-masala','tacos-al-pastor')
    AND short_description LIKE '%PILOT MUTATION%';")"
rel_count="$(docker exec "$PG_CONTAINER" psql -U "$PG_SUPERUSER" -d "$TEST_DB" -tAc "
  SELECT count(*) FROM dish_relations dr JOIN dishes d ON d.id=dr.from_dish_id
  WHERE d.slug='tacos-al-pastor' AND dr.relation_type='ancestor';")"
if [ "$mut_count" = "3" ] && [ "$rel_count" -ge 1 ]; then
  ok "mutation applied and VERIFIED ($mut_count descriptions mutated, $rel_count relation row(s) added)"
else
  bad "mutation did not land as expected (descriptions=$mut_count expected 3, relations=$rel_count expected >=1)"
fi

step "4. verify the copy now DIVERGES (proves the mutation was observable)"
if bash "$SCRIPT" verify "$SNAP" "$TEST_DB" > /tmp/gus014_verify_mutated.txt 2>&1; then
  bad "copy still matches baseline — the mutation was NOT observable, so the rollback test would prove nothing"
  cat /tmp/gus014_verify_mutated.txt
else
  ok "copy diverges from baseline as expected:"
  grep -E "DIFFERS|digest" /tmp/gus014_verify_mutated.txt | sed 's/^/        /' || true
fi

step "5. ROLLBACK: restore the snapshot over the mutated copy"
bash "$SCRIPT" restore "$SNAP" "$TEST_DB" || { bad "rollback restore failed"; exit 1; }

step "6. verify the rolled-back copy matches the baseline again"
if bash "$SCRIPT" verify "$SNAP" "$TEST_DB"; then
  ok "ROLLBACK VERIFIED — copy is identical to baseline"
else
  bad "rollback did NOT restore the baseline"
fi

step "7. confirm the live database was never touched"
live_dishes="$(docker exec "$PG_CONTAINER" psql -U "$PG_SUPERUSER" -d "$LIVE_DB" -tAc "SELECT count(*) FROM dishes;")"
if [ "$live_dishes" = "122" ]; then
  ok "live '$LIVE_DB' still has 122 dishes and was not written to"
else
  bad "live '$LIVE_DB' dish count is $live_dishes (expected 122) — investigate immediately"
fi

echo
echo "================================================================"
if [ $fail -eq 0 ]; then
  echo " V4 ROLLBACK TEST: PASS"
  echo " The rollback path is proven: restore -> mutate -> observe -> restore -> identical."
  echo "================================================================"
  exit 0
else
  echo " V4 ROLLBACK TEST: FAIL — do NOT run the pilot."
  echo "================================================================"
  exit 1
fi
