#!/usr/bin/env bash
#
# GUS-014 — safety-guard tests for the snapshot/restore tooling.
#
# The restore path has a guard that refuses to target the live database.
# A guard that silently lets the live DB through is worse than no guard,
# so the guard itself is tested here.
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCRIPT="$SCRIPT_DIR/gus-014-pilot-snapshot.sh"
LIVE_DB="${LIVE_DB:-gustale}"
PG_CONTAINER="${PG_CONTAINER:-shared-postgres}"
PG_SUPERUSER="${PG_SUPERUSER:-postgres}"
SNAPSHOT_DIR="${GUS014_SNAPSHOT_DIR:-$(cd "$SCRIPT_DIR/../.." && pwd)/.hermes/snapshots/gus-014}"

fail=0
ok()  { echo "   PASS  $*"; }
bad() { echo "   FAIL  $*"; fail=1; }

echo "GUS-014 restore-guard tests (live db = '$LIVE_DB')"

# Build a minimal snapshot dir so the guard is reached before any DB work.
TMP="$(mktemp -d)"
mkdir -p "$TMP/snap"
: > "$TMP/snap/db.dump"

# The guard test's "accepted" cases actually reach the restore path, which
# creates databases. Clean them up so the test leaves no residue.
GUARD_TEST_DBS="gustale_pilot_restore gustale_pilot_rollback_test gustale_staging_copy"
cleanup_guard_dbs() {
  for db in $GUARD_TEST_DBS; do
    docker exec "$PG_CONTAINER" psql -U "$PG_SUPERUSER" -d postgres \
      -c "DROP DATABASE IF EXISTS \"$db\" WITH (FORCE);" >/dev/null 2>&1 || true
  done
}
trap 'rm -rf "$TMP"; cleanup_guard_dbs' EXIT
cleanup_guard_dbs

# --- the live database must be refused ---
if bash "$SCRIPT" restore "$TMP/snap" "$LIVE_DB" >/dev/null 2>&1; then
  bad "restoring into the live database '$LIVE_DB' was ALLOWED"
else
  ok "refuses to restore into the live database '$LIVE_DB'"
fi

# --- PostgreSQL system databases must be refused ---
for db in postgres template0 template1; do
  if bash "$SCRIPT" restore "$TMP/snap" "$db" >/dev/null 2>&1; then
    bad "restoring into system database '$db' was ALLOWED"
  else
    ok "refuses to restore into system database '$db'"
  fi
done

# --- a production-looking name must be refused (typo safety) ---
for db in gustale_prod gustale-production gustale_main gustale; do
  if bash "$SCRIPT" restore "$TMP/snap" "$db" >/dev/null 2>&1; then
    bad "restoring into production-looking database '$db' was ALLOWED"
  else
    ok "refuses production-looking target '$db'"
  fi
done

# --- explicit throwaway names must be ACCEPTED by the guard ---
# (These will still fail later on the missing dump; we only assert the guard
#  did not reject them. We distinguish by the guard's message.)
for db in gustale_pilot_restore gustale_pilot_rollback_test gustale_staging_copy; do
  out="$(bash "$SCRIPT" restore "$TMP/snap" "$db" 2>&1 || true)"
  if echo "$out" | grep -q "does not look like a throwaway"; then
    bad "guard rejected legitimate throwaway target '$db'"
  else
    ok "guard accepts throwaway target '$db'"
  fi
done

echo
if [ $fail -eq 0 ]; then
  echo "OK — all restore-guard tests pass."
  exit 0
fi
echo "FAIL — $fail guard test(s) failed."
exit 1
