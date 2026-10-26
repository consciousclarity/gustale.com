#!/usr/bin/env bash
#
# GUS-014 — tests for the I15 other-dishes integrity checker.
#
# The checker is the thing that proves the pilot did not corrupt the
# other 118 dishes. A checker that cannot FAIL proves nothing, so both
# failure modes are exercised against a throwaway database:
#
#   A. a non-pilot dish changes with NO edit_history row  -> must FAIL
#   B. a non-pilot dish changes WITH an edit_history row    -> must PASS (explained)
#
# The live database is never written to; all mutations happen in a
# throwaway copy.
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
SNAPSHOT_DIR="${GUS014_SNAPSHOT_DIR:-$REPO_ROOT/.hermes/snapshots/gus-014}"
PG_CONTAINER="${PG_CONTAINER:-shared-postgres}"
PG_SUPERUSER="${PG_SUPERUSER:-postgres}"
LIVE_DB="${LIVE_DB:-gustale}"
TEST_DB="gustale_pilot_i15_test"
SNAP_TOOL="$SCRIPT_DIR/gus-014-pilot-snapshot.sh"
CHECKER="$SCRIPT_DIR/gus-014-check-other-dishes.py"

SNAP="$(find "$SNAPSHOT_DIR" -mindepth 1 -maxdepth 1 -type d | sort | tail -1)"
[ -d "$SNAP" ] || { echo "no snapshot in $SNAPSHOT_DIR" >&2; exit 2; }

fail=0
ok()  { echo "   PASS  $*"; }
bad() { echo "   FAIL  $*"; fail=1; }

cleanup() {
  docker exec "$PG_CONTAINER" psql -U "$PG_SUPERUSER" -d postgres \
    -c "DROP DATABASE IF EXISTS \"$TEST_DB\" WITH (FORCE);" >/dev/null 2>&1 || true
}
trap cleanup EXIT

echo "GUS-014 I15 checker tests"
echo "  snapshot: $SNAP"
echo "  test db:  $TEST_DB"

# Rebuild the throwaway copy from the snapshot so it starts clean.
bash "$SNAP_TOOL" restore "$SNAP" "$TEST_DB" >/dev/null

# The checker reads the window anchor from the snapshot's high-water mark.
# For the test we need a window anchor that includes our synthetic edits,
# so write a modified anchor into a scratch snapshot copy.
SCRATCH="$(mktemp -d)"
cp -r "$SNAP" "$SCRATCH/snap"
# Anchor the window well in the past so our synthetic edit_history rows count.
echo "2000-01-01T00:00:00+00" > "$SCRATCH/snap/edit-history-max-created-at.txt"
trap 'rm -rf "$SCRATCH"; cleanup' EXIT

echo
echo "--- baseline: no changes at all ---"
if python3 "$CHECKER" "$SCRATCH/snap" --db "$TEST_DB" > /tmp/gus014_i15_base.txt 2>&1; then
  ok "passes when nothing changed"
else
  bad "failed on an unmodified copy"; cat /tmp/gus014_i15_base.txt
fi

echo
echo "--- case A: non-pilot dish changed with NO edit_history row ---"
docker exec "$PG_CONTAINER" psql -v ON_ERROR_STOP=1 -U "$PG_SUPERUSER" -d "$TEST_DB" -c "
  UPDATE dishes SET short_description = short_description || ' [SILENT CHANGE]'
  WHERE slug = 'rendang' AND false;" >/dev/null
# pick a real non-pilot dish
NONPILOT="$(docker exec "$PG_CONTAINER" psql -U "$PG_SUPERUSER" -d "$TEST_DB" -tAc "
  SELECT slug FROM dishes WHERE slug NOT IN ('rendang','chicken-tikka-masala','tacos-al-pastor') LIMIT 1;")"
docker exec "$PG_CONTAINER" psql -v ON_ERROR_STOP=1 -U "$PG_SUPERUSER" -d "$TEST_DB" -c "
  UPDATE dishes SET short_description = short_description || ' [SILENT CHANGE]'
  WHERE slug = '$NONPILOT';" >/dev/null
if python3 "$CHECKER" "$SCRATCH/snap" --db "$TEST_DB" > /tmp/gus014_i15_a.txt 2>&1; then
  bad "PASSED despite an unexplained change to '$NONPILOT' — the checker is not effective"
  cat /tmp/gus014_i15_a.txt
else
  if grep -q "UNEXPLAINED" /tmp/gus014_i15_a.txt; then
    ok "fails on an unexplained change to '$NONPILOT'"
  else
    bad "failed but not for the right reason"; cat /tmp/gus014_i15_a.txt
  fi
fi

echo
echo "--- case B: non-pilot dish changed WITH an edit_history row in the window ---"
# undo the silent change, then redo it WITH a logged edit
docker exec "$PG_CONTAINER" psql -v ON_ERROR_STOP=1 -U "$PG_SUPERUSER" -d "$TEST_DB" -c "
  UPDATE dishes SET short_description = replace(short_description, ' [SILENT CHANGE]', '') WHERE slug = '$NONPILOT';" >/dev/null
docker exec "$PG_CONTAINER" psql -v ON_ERROR_STOP=1 -U "$PG_SUPERUSER" -d "$TEST_DB" -c "
  UPDATE dishes SET short_description = short_description || ' [LOGGED CHANGE]' WHERE slug = '$NONPILOT';
  INSERT INTO edit_history (id, target_type, target_id, action, created_at, comment, diff)
  SELECT gen_random_uuid(), 'dish', d.id, 'update', now(), 'concurrent agent write', '{}'::jsonb
  FROM dishes d WHERE d.slug = '$NONPILOT';" >/dev/null
if python3 "$CHECKER" "$SCRATCH/snap" --db "$TEST_DB" > /tmp/gus014_i15_b.txt 2>&1; then
  if grep -q "CHANGED (explained)" /tmp/gus014_i15_b.txt; then
    ok "passes when the change is explained by an in-window edit_history row"
  else
    bad "passed but did not report the change as explained"; cat /tmp/gus014_i15_b.txt
  fi
else
  bad "failed on an EXPLAINED change — the checker is too strict"; cat /tmp/gus014_i15_b.txt
fi

echo
echo "--- live database untouched ---"
live_mut="$(docker exec "$PG_CONTAINER" psql -U "$PG_SUPERUSER" -d "$LIVE_DB" -tAc "
  SELECT count(*) FROM dishes WHERE short_description LIKE '%[SILENT CHANGE]%' OR short_description LIKE '%[LOGGED CHANGE]%';")"
if [ "$live_mut" = "0" ]; then
  ok "live '$LIVE_DB' has no test mutations"
else
  bad "live '$LIVE_DB' was modified ($live_mut rows) — investigate"
fi

echo
if [ $fail -eq 0 ]; then
  echo "OK — all I15 checker tests pass."
  exit 0
fi
echo "FAIL — $fail I15 checker test(s) failed."
exit 1
