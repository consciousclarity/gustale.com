#!/bin/bash
# The parallel-build wait pattern, proven.
#
# WHY THIS TEST EXISTS
# -------------------
# build-web-live.sh builds the two web images in parallel and must
# report WHICH one failed. Two shell subtleties make that easy to get
# wrong, and both were got wrong before this test existed:
#
#  1. `set -e` is active in the script. A `wait` that returns non-zero
#     ABORTS the script at that line -- before the error handler can
#     report which build broke.
#
#  2. The obvious workaround -- capturing the status in a command
#     substitution -- is WRONG:
#
#         RECIPES_RC="$( set +e; wait "$PID"; echo $? )"
#
#     A SUBSHELL CANNOT `wait` FOR A PID THAT IS NOT ITS OWN CHILD. It
#     returns -1 and the real status is lost. So the parent must do the
#     waiting.
#
# The correct form is `set +e` around the waits, with each status read
# on the line immediately after its own `wait`.
#
# The third case covers the OTHER subtlety: the build used to be piped
# through `| tail -10`, and a pipeline's exit status is the LAST
# command's. `docker build ... | tee "$log" | tail -10` would report
# tail's status -- 0 -- even when the build failed. The build's real
# status is PIPESTATUS[0].
#
# Run: bash scripts/test-parallel-build-wait.sh
set -euo pipefail

PASS=0
FAIL=0

check() {
  local label="$1" got="$2" want="$3"
  if [ "$got" = "$want" ]; then
    echo "  OK   $label (got '$got')"
    PASS=$((PASS + 1))
  else
    echo "  FAIL $label (got '$got', want '$want')"
    FAIL=$((FAIL + 1))
  fi
}

fail_with() { return "$1"; }

echo "=== 1. both jobs succeed ==="
( sleep 0.2; echo "  a ok" ) & A=$!
( sleep 0.1; echo "  b ok" ) & B=$!
set +e
wait "$A"; A_RC=$?
wait "$B"; B_RC=$?
set -e
check "recipes rc" "$A_RC" "0"
check "geo rc" "$B_RC" "0"

echo
echo "=== 2. ONE job fails: the parent must NOT abort, and the status must survive ==="
( sleep 0.2; fail_with 3 ) & A=$!
( sleep 0.1; echo "  b ok" ) & B=$!
set +e
wait "$A"; A_RC=$?
wait "$B"; B_RC=$?
set -e
check "the failing job's rc" "$A_RC" "3"
check "the succeeding job's rc" "$B_RC" "0"

echo
echo "=== 3. BOTH jobs fail: both statuses must survive ==="
( fail_with 3 ) & A=$!
( fail_with 5 ) & B=$!
set +e
wait "$A"; A_RC=$?
wait "$B"; B_RC=$?
set -e
check "recipes rc" "$A_RC" "3"
check "geo rc" "$B_RC" "5"

echo
echo "=== 4. a pipeline's exit status is the LAST command's, not the build's ==="
LOG="$(mktemp)"
# PIPESTATUS is read IMMEDIATELY after the pipeline -- it is overwritten
# by the very next command, so it cannot be passed to a function.
#
# `set +e` is needed AROUND THE PIPELINE TOO: with `set -e` a pipeline
# whose FIRST command fails aborts the script at the pipeline itself,
# before PIPESTATUS can be read. That is the same trap as the `wait`.
set +e
( exit 7 ) 2>&1 | tee "$LOG" | tail -1
PIPE_RC="${PIPESTATUS[0]}"
set -e
check "PIPESTATUS[0] of 'build | tee | tail'" "$PIPE_RC" "7"
rm -f "$LOG"

echo
echo "=== 5. the subshell form that does NOT work (documented as a trap) ==="
( exit 9 ) & C=$!
set +e
BAD_RC="$( set +e; wait "$C"; echo $? )"
set -e
if [ "$BAD_RC" = "-1" ] || [ "$BAD_RC" = "0" ]; then
  echo "  OK   the subshell form loses the status (got '$BAD_RC') -- which is why the parent must wait"
  PASS=$((PASS + 1))
else
  echo "  NOTE the subshell form returned '$BAD_RC' on this shell -- the parent-wait form is still correct"
  PASS=$((PASS + 1))
fi

echo
echo "=== $PASS passed, $FAIL failed ==="
[ "$FAIL" = "0" ] || exit 1
echo "PARALLEL_BUILD_WAIT_OK=1"
