#!/usr/bin/env bash
#
# The account-deletion gate must not DEFAULT to the live database.
#
# Until 2026-11-07 the script had:
#
#   DB="${GUSTALE_DB_NAME:-gustale}"
#
# with no guard at all, so a bare run reached live and the only thing
# between an operator and a live DELETE was remembering to set
# GUSTALE_DB_NAME. That is the same shape of hole that let
# GUSTALE_DB_IS_THROWAWAY=1 make the live name disposable in 2026-11-06
# (docs/INCIDENT-2026-11-06-live-db-drop.md): a default that points at
# production.
#
# The script now vets its target through scripts/lib/db_guard.py, which
# refuses the live name ALWAYS.
#
# These tests do NOT touch a database. The guard refuses before any
# connection is attempted, so every case here is decided by the guard
# alone.
#
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
GATE="$ROOT/scripts/delete-test-account.sh"
GUARD="$ROOT/scripts/lib/db_guard.py"

fail=0
ok()  { echo "   PASS  $*"; }
bad() { echo "   FAIL  $*"; fail=1; }

echo "delete-test-account.sh live-default guard tests"

if [ ! -f "$GATE" ]; then
  echo "   FAIL  $GATE not found" >&2
  exit 1
fi

# The script must vet its target BEFORE it does anything else. We
# prove that by checking it refuses a live target with the guard's
# refusal, not with a connection error.
run_gate() {
  ( cd "$ROOT" && env "$@" bash "$GATE" 00000000-0000-0000-0000-000000000000 no-such-account ) 2>&1
}

# ===========================================================================
# CASE 1: the DEFAULT target (no GUSTALE_DB_NAME) must be refused.
# ===========================================================================
echo ""
echo "--- case 1: the default target is refused ---"

OUT=$(run_gate GUSTALE_DB_NAME=)
if printf '%s' "$OUT" | grep -q "REFUSED"; then
  ok "case 1: the default target is REFUSED by the guard"
else
  bad "case 1: the default target was NOT refused. Output:"
  printf '%s\n' "$OUT" | sed 's/^/        /' | head -10
fi

# The refusal must name the LIVE database, so the operator knows what
# was blocked.
if printf '%s' "$OUT" | grep -q "LIVE database"; then
  ok "case 1: the refusal names the live database"
else
  bad "case 1: the refusal did not name the live database"
fi

# ===========================================================================
# CASE 2: an explicit live target must also be refused.
# ===========================================================================
echo ""
echo "--- case 2: an explicit live target is refused ---"

OUT=$(run_gate GUSTALE_DB_NAME=gustale)
if printf '%s' "$OUT" | grep -q "REFUSED"; then
  ok "case 2: an explicit live target is REFUSED"
else
  bad "case 2: an explicit live target was NOT refused. Output:"
  printf '%s\n' "$OUT" | sed 's/^/        /' | head -10
fi

# ===========================================================================
# CASE 3: GUSTALE_DB_IS_THROWAWAY=1 must NOT widen it.
#
# This is the variable that made the live name disposable on
# 2026-11-06. It must never reopen this door.
# ===========================================================================
echo ""
echo "--- case 3: the throwaway escape hatch does not widen it ---"

OUT=$(run_gate GUSTALE_DB_NAME=gustale GUSTALE_DB_IS_THROWAWAY=1)
if printf '%s' "$OUT" | grep -q "REFUSED"; then
  ok "case 3: GUSTALE_DB_IS_THROWAWAY=1 does NOT widen the permission"
else
  bad "case 3: GUSTALE_DB_IS_THROWAWAY=1 widened the permission. Output:"
  printf '%s\n' "$OUT" | sed 's/^/        /' | head -10
fi

# ===========================================================================
# CASE 4: the live-approval signals alone must NOT widen it either.
#
# GUSTALE_LIVE_DB_ALLOW=1 is signal 2 of 3. Signal 1 is the calling
# script being on the guard's allowed-writers list, and this script is
# not. So the live name stays refused.
# ===========================================================================
echo ""
echo "--- case 4: the live-approval signals alone do not widen it ---"

OUT=$(run_gate GUSTALE_DB_NAME=gustale GUSTALE_LIVE_DB_ALLOW=1 GUSTALE_LIVE_PURPOSE=delete-test-account.sh)
if printf '%s' "$OUT" | grep -q "REFUSED"; then
  ok "case 4: GUSTALE_LIVE_DB_ALLOW=1 alone does NOT widen the permission"
else
  bad "case 4: GUSTALE_LIVE_DB_ALLOW=1 alone widened the permission. Output:"
  printf '%s\n' "$OUT" | sed 's/^/        /' | head -10
fi

# ===========================================================================
# CASE 5: a NON-live target still passes the guard.
#
# A guard that refuses everything is not a guard, it is a wall. The CI
# job runs this script against gustale_ci, so that path must work.
# ===========================================================================
echo ""
echo "--- case 5: a non-live target is accepted ---"

RESOLVED=$(python3 "$GUARD" delete-test-account.sh gustale_ci 2>/dev/null)
if [ "$RESOLVED" = "gustale_ci" ]; then
  ok "case 5: a non-live target is accepted and resolved unchanged"
else
  bad "case 5: the guard did not resolve a non-live target (got '$RESOLVED')"
fi

# ===========================================================================
# CASE 6: the script calls the guard at all.
#
# A guard that exists but is not wired in is worth nothing. The script
# must invoke scripts/lib/db_guard.py before it does anything to a
# database.
# ===========================================================================
echo ""
echo "--- case 6: the script actually calls the guard ---"

if grep -q 'scripts/lib/db_guard.py' "$GATE"; then
  ok "case 6: the script invokes scripts/lib/db_guard.py"
else
  bad "case 6: the script does not invoke the guard at all"
fi

# The guard call must come BEFORE the first use of $DB against a
# database. Find the line of the guard call and the line of the first
# pg call, and compare.
GUARD_LINE=$(grep -n 'scripts/lib/db_guard.py' "$GATE" | head -1 | cut -d: -f1)
FIRST_PG_LINE=$(grep -nE '^\s*pg |^\s*pg_admin |^\s*pg_tool |^\s*psql_q ' "$GATE" | head -1 | cut -d: -f1)
if [ -n "$GUARD_LINE" ] && [ -n "$FIRST_PG_LINE" ] && [ "$GUARD_LINE" -lt "$FIRST_PG_LINE" ]; then
  ok "case 6: the guard runs before the first database call (line $GUARD_LINE < $FIRST_PG_LINE)"
else
  bad "case 6: the guard (line ${GUARD_LINE:-?}) does NOT run before the first database call (line ${FIRST_PG_LINE:-?})"
fi

echo ""
if [ "$fail" -eq 0 ]; then
  echo "ALL PASS"
else
  echo "SOME FAILED"
fi
exit "$fail"
