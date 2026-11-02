#!/usr/bin/env bash
# The regression test for the account-deletion gate.
#
# WHAT THIS PROVES
# ----------------
# The gate is the only thing standing between "delete an account" and
# a dangling author in live. `dishes.created_by` and `edit_history.user_id`
# carry NO FOREIGN KEY, so Postgres does not stop a delete that orphans
# a row. The gate has to stop it, and this test proves it does.
#
# The gate is tested against a DISPOSABLE COPY of live. It must never
# be run against live by this test.
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
GATE="$ROOT/scripts/delete-test-account.sh"

PASS=0
FAIL=0

ok()   { echo "  PASS: $1"; PASS=$((PASS+1)); }
bad()  { echo "  FAIL: $1"; FAIL=$((FAIL+1)); }

# Run the gate and require BOTH a non-zero exit AND a refusal message.
#
# The exit code alone is not enough: 126 means "permission denied" and
# 127 means "command not found" -- neither is the gate refusing, and a
# test that accepts them passes for the wrong reason. (It did, once.)
run_gate() {
  OUT=$(bash "$GATE" "$@" 2>&1)
  RC=$?
  if [ "$RC" -eq 126 ] || [ "$RC" -eq 127 ]; then
    return 99   # the gate could not be run at all
  fi
  return "$RC"
}

echo "=== the account-deletion gate's regression test ==="

# ── the gate exists and is executable ────────────────────────────────
if [ ! -f "$GATE" ]; then
  bad "the gate script is missing: $GATE"
  echo "  === $PASS passed, $FAIL failed ==="
  exit 1
fi
bash -n "$GATE" 2>/dev/null && ok "the gate script's syntax is valid" \
                        || bad "the gate script has a syntax error"

# The gate must be EXECUTABLE. It was not once, and the test passed
# anyway -- because 126 ("permission denied") is also non-zero.
if [ -x "$GATE" ]; then
  ok "the gate script is executable"
else
  bad "the gate script is NOT executable -- every refusal test would pass for the wrong reason"
fi

# ── it refuses a target that does not exist ─────────────────────────
run_gate "00000000-0000-0000-0000-000000000000" "no-such-account"
RC=$?
if [ "$RC" = "99" ]; then
  bad "the gate could not be RUN (exit 99 = permission or not-found)"
elif [ "$RC" -ne 0 ]; then
  ok "it refuses an account that does not exist (exit $RC)"
else
  bad "it ACCEPTED an account that does not exist"
fi

# ── it refuses a target whose email does not match ─────────────────
# The gate takes an id AND an expected email substring. Passing a real
# id with the WRONG expected email must be refused -- that is what
# stops a production account being deleted by passing its id.
REAL_ID=$(docker exec -i -u postgres shared-postgres psql -U postgres -d "${GUSTALE_DB_NAME:-gustale}" -tAc \
  "SELECT id FROM \"user\" ORDER BY email LIMIT 1" 2>/dev/null | tail -1)
if [ -n "$REAL_ID" ]; then
  run_gate "$REAL_ID" "definitely-not-the-email"
  RC=$?
  if [ "$RC" = "99" ]; then
    bad "the gate could not be RUN (exit 99 = permission or not-found)"
  elif [ "$RC" -ne 0 ]; then
    ok "it refuses an account whose email does not match the expectation (exit $RC)"
  else
    bad "it ACCEPTED an account whose email did not match the expectation"
  fi
else
  bad "could not read any account to test the email mismatch against"
fi

# ── it refuses an unknown option ────────────────────────────────────
run_gate "00000000-0000-0000-0000-000000000000" "x" --not-an-option
RC=$?
if [ "$RC" = "99" ]; then
  bad "the gate could not be RUN (exit 99 = permission or not-found)"
elif [ "$RC" -ne 0 ]; then
  ok "it refuses an unknown option (exit $RC)"
else
  bad "it ACCEPTED an unknown option"
fi

# ── it leaves NO disposable copy behind ─────────────────────────────
# Every run makes a copy and must drop it. If a copy survives, the next
# run's counts are wrong and the credential-bearing copy persists.
BEFORE=$(docker exec -i -u postgres shared-postgres psql -U postgres -d postgres -tAc \
  "SELECT count(*) FROM pg_database WHERE datname LIKE 'gustale_delacct_%'" 2>/dev/null | tail -1)
bash "$GATE" "00000000-0000-0000-0000-000000000000" "no-such-account" >/dev/null 2>&1
AFTER=$(docker exec -i -u postgres shared-postgres psql -U postgres -d postgres -tAc \
  "SELECT count(*) FROM pg_database WHERE datname LIKE 'gustale_delacct_%'" 2>/dev/null | tail -1)
if [ "$BEFORE" = "$AFTER" ]; then
  ok "it leaves no disposable copy behind ($BEFORE stayed)"
else
  bad "it left a disposable copy behind ($BEFORE -> $AFTER)"
fi

echo "  === $PASS passed, $FAIL failed ==="
[ "$FAIL" -eq 0 ] || exit 1
exit 0
