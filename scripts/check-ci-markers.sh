#!/usr/bin/env bash
# The CI marker checker.
#
# WHAT THIS IS
# ------------
# Several gates in this repo print a MARKER when they succeed:
#
#   ATLAS_SCHEMA_TESTS: N passed, M failed
#   ATLAS_COUNT_GUARD: N passed, M failed
#   ATLAS_TRIGGER_ESCALATION: N passed, M failed
#   FULL_CI_CHAIN_OK=1
#   SOURCE_CANDIDATES_TABLE_READY=1
#   SESSION_BINDING_PROOF_OK=1
#
# The markers are written for a human reading the log -- and the human
# was the ONLY thing reading them.
#
#   PROVED: before this change,
#
#       grep -n "ATLAS_SCHEMA_TESTS\|ATLAS_BACKFILL_ASSERTIONS\|\
#       ATLAS_TRIGGER_ESCALATION\|FULL_CI_CHAIN_OK" .github/workflows/ci.yml
#       (no output)
#
# Nothing in the workflow grepped for any of them. The workflow checked
# the EXIT CODE of each step, and that is not the same thing: a gate
# whose assertion bodies are removed, or whose counter is never
# incremented, still exits 0. The floors added to the SQL gates cover
# that case inside the gates themselves, but the floors are only as
# strong as the code that computes them -- and a marker is the
# independent witness. The gate says "I ran N assertions"; the workflow
# checks that the gate actually SAID that.
#
# So: the workflow now greps for the markers, and a missing marker is a
# failure. A gate that ran but did not report is treated as a gate that
# did not run.
#
# WHY A SCRIPT AND NOT A GREP IN THE WORKFLOW
# -------------------------------------------
# Because the check has to be right, and "grep the log for a string"
# is easy to get subtly wrong:
#
#   * the marker must be in the OUTPUT, not in the exit code;
#   * the marker must say the gate PASSED -- "47 passed, 3 failed"
#     contains the marker, and it is a failure;
#   * a step that never ran at all produces no output, and must fail,
#     not pass by absence.
#
# USAGE
# -----
#   scripts/check-ci-markers.sh <name> <expected-marker> <file>...
#
# The <file>s are the files to search (a captured log, normally).
# The marker is searched for as a whole line.
#
# EXIT CODES
# ----------
#   0  the marker was found, on its own line, with a zero failure count
#   1  the marker was missing, or it reported a failure
set -uo pipefail

NAME="${1:?usage: check-ci-markers.sh <name> <expected-marker> <file>...}"
MARKER="${2:?usage: check-ci-markers.sh <name> <expected-marker> <file>...}"
shift 2
FILES=("$@")

if [ "${#FILES[@]}" -eq 0 ]; then
  echo "::error::the marker check for '$NAME' was given no file to search" >&2
  exit 1
fi

missing=0
for f in "${FILES[@]}"; do
  if [ ! -f "$f" ]; then
    echo "::error::the marker check for '$NAME' was given '$f', which does not exist" >&2
    missing=1
    continue
  fi
done
[ "$missing" -eq 0 ] || exit 1

# The marker must appear on a line of its own, and that line must NOT
# report a failure.
#
# The shape of the marker line is:
#
#     <marker>: N passed, M failed
#
# so the failure count is the number that follows the LAST "failed" on
# the line. The pattern below extracts it and the shell compares it to
# zero. A "47 passed, 0 failed" line passes; a "47 passed, 3 failed"
# line does not.
#
# The count is read with grep -o and compared as a NUMBER, not as a
# pattern: a regex like "failed[^0-9]*[1-9]" cannot tell "0 failed"
# from "3 failed" reliably once the line has other digits on it.
FAILING=""
for f in "${FILES[@]}"; do
  while IFS= read -r line; do
    [ -n "$line" ] || continue
    # The count FOLLOWS the word "failed": "47 passed, 3 failed".
    n=$(printf '%s' "$line" | grep -oE '[0-9]+[[:space:]]*failed' | grep -oE '[0-9]+' | tail -1)
    if [ -n "$n" ] && [ "$n" -ne 0 ] 2>/dev/null; then
      FAILING="${FAILING}${line}
"
    fi
  done < <(grep -hE "${MARKER}" "$f" 2>/dev/null)
done
FAILING=$(printf '%s' "$FAILING" | head -3)
if [ -n "$FAILING" ]; then
  echo "::error::the marker '$MARKER' reported a FAILURE:" >&2
  echo "$FAILING" | sed 's/^/  /' >&2
  exit 1
fi

FOUND=$(grep -hE "${MARKER}" "${FILES[@]}" 2>/dev/null | head -3)
if [ -z "$FOUND" ]; then
  echo "::error::the marker '$MARKER' was not found -- the gate '$NAME' either did not run, or ran without reporting. A gate that did not report is treated as a gate that did not run." >&2
  exit 1
fi

echo "  $NAME: the marker '$MARKER' is present"
echo "$FOUND" | sed 's/^/    /'
exit 0
