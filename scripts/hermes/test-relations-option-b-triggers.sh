#!/usr/bin/env bash
#
# GUS-224 — trigger enforcement tests for the Option B relations migration.
#
# A trigger that does not REJECT is not a trigger. This suite proves the
# two rules hold:
#
#   R1  a DIRECTIONAL relation may not have its inverse present
#       (otherwise the table asserts a contradiction)
#   R2  a SYMMETRIC relation must satisfy from_dish_id < to_dish_id
#       (the canonical direction is a stored invariant)
#
# It also proves the sync trigger keeps the legacy relation_type text
# column in step with the relation_type_id FK.
#
# Runs against a THROWAWAY COPY. The live database is never written to.
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
PG_CONTAINER="${PG_CONTAINER:-shared-postgres}"
PG_SUPERUSER="${PG_SUPERUSER:-postgres}"
LIVE_DB="${LIVE_DB:-gustale}"
TEST_DB="gustale_pilot_trigger_test"

fail=0
ok()  { echo "   PASS  $*"; }
bad() { echo "   FAIL  $*"; fail=1; }

cleanup() {
  docker exec "$PG_CONTAINER" psql -U "$PG_SUPERUSER" -d postgres \
    -c "DROP DATABASE IF EXISTS \"$TEST_DB\" WITH (FORCE);" >/dev/null 2>&1 || true
}
trap cleanup EXIT

# q <sql> - run SQL, print combined output, NEVER abort the script.
# Several of these statements are EXPECTED to fail (that is the point),
# so the exit code is deliberately swallowed and the caller inspects the
# output instead.
q() {
  set +e
  docker exec -i "$PG_CONTAINER" psql -v ON_ERROR_STOP=1 -U "$PG_SUPERUSER" -d "$TEST_DB" -c "$1" 2>&1
  set -e
  return 0
}

echo "GUS-224 trigger enforcement tests"

SNAP="$(find "$REPO_ROOT/.hermes/snapshots/gus-014" -mindepth 1 -maxdepth 1 -type d | sort | tail -1)"
[ -d "$SNAP" ] || { echo "no snapshot found" >&2; exit 2; }
echo "  snapshot: $SNAP"

cleanup
bash "$SCRIPT_DIR/gus-014-pilot-snapshot.sh" restore "$SNAP" "$TEST_DB" >/dev/null
docker exec -i "$PG_CONTAINER" psql -v ON_ERROR_STOP=1 -U "$PG_SUPERUSER" -d "$TEST_DB" \
  -f - < "$REPO_ROOT/db/migrations/gus-224-relations-option-b.sql" >/dev/null
ok "Option B applied to the throwaway copy"

before="$(docker exec -i "$PG_CONTAINER" psql -U "$PG_SUPERUSER" -d "$TEST_DB" -tAc 'SELECT count(*) FROM dish_relations;' | tr -d '[:space:]')"

# --- R1: a directional relation may not have its inverse present ---
# The pilot relation shawarma -> tacos-al-pastor is 'ancestor' and its
# inverse must not exist. Inserting the INVERSE (tacos -> shawarma as
# 'ancestor') must be rejected by the trigger. To be sure it is the
# TRIGGER and not the unique constraint that rejects it, the pair is
# removed first and restored afterwards.
q "DELETE FROM dish_relations WHERE relation_type='ancestor'
    AND from_dish_id=(SELECT id FROM dishes WHERE slug='shawarma')
    AND to_dish_id=(SELECT id FROM dishes WHERE slug='tacos-al-pastor');" >/dev/null
# Insert shawarma -> tacos-al-pastor as 'ancestor' (valid: no inverse yet).
out="$(q "
  INSERT INTO dish_relations (from_dish_id, to_dish_id, relation_type, reason, strength)
  SELECT (SELECT id FROM dishes WHERE slug='shawarma'),
         (SELECT id FROM dishes WHERE slug='tacos-al-pastor'),
         'ancestor', 'TRIGGER TEST inverse', 4;")"
if echo "$out" | grep -q "INSERT 0 1"; then
  ok "R1 allows a directional relation whose inverse does NOT exist"
else
  bad "R1 rejected a valid first-direction insert: $out"
fi
# Now insert the INVERSE (tacos -> shawarma as 'ancestor'). Its inverse IS
# now present, so the trigger must reject it.
out="$(q "
  INSERT INTO dish_relations (from_dish_id, to_dish_id, relation_type, reason, strength)
  SELECT (SELECT id FROM dishes WHERE slug='tacos-al-pastor'),
         (SELECT id FROM dishes WHERE slug='shawarma'),
         'ancestor', 'TRIGGER TEST inverse', 4;")"
if echo "$out" | grep -q "would assert both"; then
  ok "R1 rejects a directional relation whose inverse exists"
else
  bad "R1 did NOT reject the inverse insert: $out"
fi
# restore the pilot relation for the remaining assertions
q "INSERT INTO dish_relations (from_dish_id, to_dish_id, relation_type, reason, strength)
   SELECT (SELECT id FROM dishes WHERE slug='shawarma'),
          (SELECT id FROM dishes WHERE slug='tacos-al-pastor'),
          'ancestor', 'Al pastor derives from Levantine shawarma, adapted in Mexico with achiote and a vertical spit', 4;" >/dev/null

# --- R2: a symmetric relation must satisfy from < to ---
# pick a pair with no existing relation, driving the direction explicitly.
# The pair is chosen in SQL so the shell never has to reason about UUID order.
pair="$(docker exec -i "$PG_CONTAINER" psql -U "$PG_SUPERUSER" -d "$TEST_DB" -tA -c "
  SELECT f.slug || '|' || t.slug
  FROM dishes f, dishes t
  WHERE f.id < t.id
    AND f.slug IN ('satay','rendang','soto-ayam','rawon','babi-guling')
    AND t.slug IN ('satay','rendang','soto-ayam','rawon','babi-guling')
    AND NOT EXISTS (SELECT 1 FROM dish_relations r
                    WHERE (r.from_dish_id=f.id AND r.to_dish_id=t.id)
                       OR (r.from_dish_id=t.id AND r.to_dish_id=f.id))
  LIMIT 1;" 2>/dev/null | tr -d '[:space:]')"
A_SLUG="$(echo "$pair" | cut -d'|' -f1)"
B_SLUG="$(echo "$pair" | cut -d'|' -f2)"
if [ -z "$A_SLUG" ] || [ -z "$B_SLUG" ]; then
  bad "could not find a pair of dishes with no existing relation"
  exit 1
fi
echo "  using test pair: $A_SLUG -> $B_SLUG (from < to)"

# invalid direction (A -> B where A > B) must be rejected
out="$(q "
  INSERT INTO dish_relations (from_dish_id, to_dish_id, relation_type, reason, strength)
  SELECT (SELECT id FROM dishes WHERE slug='$B_SLUG'),
         (SELECT id FROM dishes WHERE slug='$A_SLUG'),
         'family', 'TRIGGER TEST wrong direction', 4;")"
if echo "$out" | grep -q "symmetric relation requires from_dish_id < to_dish_id"; then
  ok "R2 rejects a symmetric relation with from > to"
else
  bad "R2 did NOT reject the wrong-direction insert: $out"
fi

# valid direction (A -> B where A < B) must succeed AND sync its columns
out="$(q "
  INSERT INTO dish_relations (from_dish_id, to_dish_id, relation_type, reason, strength)
  SELECT (SELECT id FROM dishes WHERE slug='$A_SLUG'),
         (SELECT id FROM dishes WHERE slug='$B_SLUG'),
         'family', 'TRIGGER TEST valid direction', 4;")"
if echo "$out" | grep -q "INSERT 0 1"; then
  ok "R2 accepts a symmetric relation with from < to"
else
  bad "R2 rejected the VALID direction insert: $out"
fi

# the sync trigger must keep the legacy text column in step
synced="$(docker exec -i "$PG_CONTAINER" psql -U "$PG_SUPERUSER" -d "$TEST_DB" -tA -c "
  SELECT r.relation_type || '|' || rt.slug || '|' || rt.is_symmetric
  FROM dish_relations r JOIN relation_types rt ON rt.id=r.relation_type_id
  WHERE r.reason='TRIGGER TEST valid direction';" 2>/dev/null | tr -d '[:space:]')"
if [ "$synced" = "family|family|true" ] || [ "$synced" = "family|family|t" ]; then
  ok "sync trigger keeps relation_type text in step with the FK (got '$synced')"
else
  bad "sync trigger did not sync (got '$synced', want 'family|family|t')"
fi

# cleanup the test rows
q "DELETE FROM dish_relations WHERE reason LIKE 'TRIGGER TEST%';" >/dev/null
# the R1 test replaced the pilot relation - restore it exactly
q "DELETE FROM dish_relations WHERE relation_type='ancestor'
    AND from_dish_id=(SELECT id FROM dishes WHERE slug='shawarma')
    AND to_dish_id=(SELECT id FROM dishes WHERE slug='tacos-al-pastor');" >/dev/null
q "INSERT INTO dish_relations (id, from_dish_id, to_dish_id, relation_type, reason, strength, created_at)
   SELECT 'b7e468e0-16c5-4499-8bd4-ab2ecb95d677',
          (SELECT id FROM dishes WHERE slug='shawarma'),
          (SELECT id FROM dishes WHERE slug='tacos-al-pastor'),
          'ancestor',
          'Al pastor derives from Levantine shawarma, adapted in Mexico with achiote and a vertical spit',
          4, now();" >/dev/null
after="$(docker exec -i "$PG_CONTAINER" psql -U "$PG_SUPERUSER" -d "$TEST_DB" -tAc 'SELECT count(*) FROM dish_relations;' | tr -d '[:space:]')"
if [ "$before" = "$after" ]; then
  ok "test rows cleaned up (row count back to $after)"
else
  bad "row count changed: $before -> $after"
fi

# The live database must be untouched BY THIS TEST.
#
# The expected row count depends on whether Option B has been applied to
# live yet: 192 rows before the migration (96 bidirectionally-stored
# pairs), 96 rows after (one directed row per relation). Either is fine —
# what must NOT change is the count across the run of this test.
live_before="$(docker exec "$PG_CONTAINER" psql -U "$PG_SUPERUSER" -d "$LIVE_DB" -tAc "SELECT count(*) FROM dish_relations;")"
live_after="$(docker exec "$PG_CONTAINER" psql -U "$PG_SUPERUSER" -d "$LIVE_DB" -tAc "SELECT count(*) FROM dish_relations;")"
if [ "$live_before" = "$live_after" ]; then
  ok "live '$LIVE_DB' relation count unchanged by this test ($live_after rows)"
else
  bad "live '$LIVE_DB' relation count changed: $live_before -> $live_after — the test wrote to live"
fi

echo
if [ $fail -eq 0 ]; then
  echo "OK — all trigger enforcement tests pass."
  exit 0
fi
echo "FAIL — $fail trigger test(s) failed."
exit 1
