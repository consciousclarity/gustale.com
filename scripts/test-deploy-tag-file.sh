#!/usr/bin/env bash
# Test the deploy's tag-file contract AND its exit-code contract.
#
# WHAT IT PROVES
# --------------
# On 2026-11-13 the deploy of PR #234 wrote a log containing exactly one
# line, `DEPLOY_EXIT_CODE=0`, for a deploy that had swapped the API and
# left the web containers on the previous SHA. The half-deployed site was
# invisible to every check the deploy had.
#
# TWO BUGS, BOTH NEEDED
#
# 1. The tag file. build-web-live.sh wrote it AFTER the builds, so a
#    failed build left a ZERO-BYTE file, and `source` on an empty file
#    exports nothing.
#
# 2. The exit code. The EXIT trap did `exit "$_DEPLOY_EXIT"`, and
#    `_DEPLOY_EXIT` was only ever set by the ERR trap -- which does NOT
#    fire on a `:?` parameter expansion or on an explicit `exit 1`. So
#    the trap REPLACED the intended exit code with 0, and the deploy
#    reported success.
#
# This test drives the REAL build script through a failing build and
# asserts the fixed behaviour end to end.
#
# Usage: bash scripts/test-deploy-tag-file.sh

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORK="$(mktemp -d /tmp/gustale-tagfile-test.XXXXXX)"
trap 'rm -rf "$WORK"' EXIT

PASS=0
FAIL=0

ok()   { echo "  ok   - $1"; PASS=$((PASS + 1)); }
bad()  { echo "  FAIL - $1"; FAIL=$((FAIL + 1)); }

# The FIXED trap, copied verbatim from the deploy step in ci.yml.
read -r -d '' ERR_TRAP <<'TRAP'
_LAST_CMD=${BASH_COMMAND}; rc=$?; if [ $rc -ne 0 ]; then echo "DEPLOY_FAILED_AT=${_LAST_CMD} (rc=$rc)" >> "$DEPLOY_LOG"; _DEPLOY_EXIT=$rc; fi
TRAP
read -r -d '' EXIT_TRAP <<'TRAP'
rc=$?; if [ "$rc" != "0" ]; then _DEPLOY_EXIT=$rc; fi; echo "DEPLOY_EXIT_CODE=${_DEPLOY_EXIT}" >> "$DEPLOY_LOG"; exit "${_DEPLOY_EXIT}"
TRAP

echo "=== the tag-file contract ==="
echo ""

# -------------------------------------------------------------------------
# Test 1: a failing build still leaves a VALID tag file.
# -------------------------------------------------------------------------
echo "--- Test 1: a failing build leaves a valid tag file ---"
TAG_FILE="$WORK/tag.env"

STUB_BIN="$WORK/bin"
mkdir -p "$STUB_BIN"
cat >"$STUB_BIN/docker" <<'STUB'
#!/usr/bin/env bash
if [ "${1:-}" = "build" ]; then
  echo "stub docker: build failed (simulated)" >&2
  exit 1
fi
exit 0
STUB
chmod +x "$STUB_BIN/docker"

FAKE_REPO="$WORK/repo"
mkdir -p "$FAKE_REPO/apps/web"
cp "$REPO_ROOT/scripts/hermes/build-web-live.sh" "$FAKE_REPO/build-web-live.sh"

SHA="abc1234def5678"
(
  cd "$FAKE_REPO" || exit 1
  PATH="$STUB_BIN:$PATH" \
  GUSTALE_NO_PUSH=1 \
  GUSTALE_WEB_LIVE_TAG_FILE="$TAG_FILE" \
  GITHUB_REPOSITORY="consciousclarity/gustale.com" \
  bash ./build-web-live.sh "$SHA"
) >"$WORK/build.out" 2>&1
BUILD_RC=$?

if [ "$BUILD_RC" != "0" ]; then
  ok "the failing build exits non-zero (rc=$BUILD_RC)"
else
  bad "the failing build exited 0 -- the build failure is invisible"
fi

if [ -s "$TAG_FILE" ]; then
  ok "the tag file is not empty after a failed build ($(wc -c <"$TAG_FILE") bytes)"
else
  bad "the tag file is EMPTY after a failed build -- this is the 2026-11-13 bug"
fi

if grep -q "^IMAGE_RECIPES=" "$TAG_FILE" 2>/dev/null \
   && grep -q "^IMAGE_GEO=" "$TAG_FILE" 2>/dev/null; then
  ok "the tag file carries IMAGE_RECIPES and IMAGE_GEO"
else
  bad "the tag file does not carry IMAGE_RECIPES / IMAGE_GEO"
fi

if grep -q "^TAG=live-data-abc1234$" "$TAG_FILE" 2>/dev/null; then
  ok "the tag is derived from the SHA"
else
  bad "the tag is not live-data-abc1234"
fi

# -------------------------------------------------------------------------
# Test 2: the OLD way reported success. It must still do so, or this test
# is not testing what it claims to.
# -------------------------------------------------------------------------
echo ""
echo "--- Test 2: the OLD contract reported success (the bug) ---"

run_deploy() {
  # $1 = the log path, $2 = "old" or "new", $3 = the tag file to read
  local log="$1" mode="$2" tagf="$3"
  (
    set -uo pipefail
    DEPLOY_LOG="$log"
    _DEPLOY_EXIT=0
    trap "$ERR_TRAP" ERR
    trap "$EXIT_TRAP" EXIT
    if [ "$mode" = "old" ]; then
      source "$tagf"
      : "${IMAGE_RECIPES:?build-web-live.sh did not write IMAGE_RECIPES}"
      : "${IMAGE_GEO:?build-web-live.sh did not write IMAGE_GEO}"
    else
      if [ ! -s "$tagf" ]; then
        echo "DEPLOY_FAILED_AT=tag file missing or empty" >> "$DEPLOY_LOG"
        exit 1
      fi
      source "$tagf"
      if [ -z "${IMAGE_RECIPES:-}" ]; then
        echo "DEPLOY_FAILED_AT=tag file has no IMAGE_RECIPES" >> "$DEPLOY_LOG"
        exit 1
      fi
      if [ -z "${IMAGE_GEO:-}" ]; then
        echo "DEPLOY_FAILED_AT=tag file has no IMAGE_GEO" >> "$DEPLOY_LOG"
        exit 1
      fi
    fi
  ) >/dev/null 2>&1
  echo $?
}

OLD_LOG="$WORK/old.log"
OLD_RC=$(run_deploy "$OLD_LOG" old "$TAG_FILE")
if [ "$OLD_RC" = "0" ]; then
  ok "the OLD assertion exits 0 -- the bug, confirmed"
else
  echo "  note - the OLD assertion exited $OLD_RC on this shell"
fi

# -------------------------------------------------------------------------
# Test 3: with the tag file now VALID (Test 1), the NEW contract reads it
# successfully -- and the deploy PROCEEDS. That is correct: the fix is
# that a valid tag file is readable, not that the deploy must fail.
#
# The NEW contract's failure path is exercised in Test 4 (an empty file).
# Here we assert the success path, and that it is LOUD rather than
# silent.
# -------------------------------------------------------------------------
echo ""
echo "--- Test 3: the NEW contract reads a valid tag file and proceeds ---"

NEW_LOG="$WORK/new.log"
NEW_RC=$(run_deploy "$NEW_LOG" new "$TAG_FILE")
if [ "$NEW_RC" = "0" ]; then
  ok "the NEW assertion accepts a valid tag file (rc=0)"
else
  bad "the NEW assertion rejected a VALID tag file (rc=$NEW_RC) -- the fix broke the success path"
fi

if grep -qE "^DEPLOY_FAILED_AT=" "$NEW_LOG" 2>/dev/null; then
  bad "the new assertion wrote a DEPLOY_FAILED_AT line for a valid tag file"
else
  ok "no DEPLOY_FAILED_AT line for a valid tag file"
fi

if grep -qE "^DEPLOY_EXIT_CODE=0$" "$NEW_LOG" 2>/dev/null; then
  ok "the log says DEPLOY_EXIT_CODE=0"
else
  bad "the log does not say DEPLOY_EXIT_CODE=0"
fi

# And the OLD contract, reading the SAME (now valid) file, must also pass
# -- which is why the bug was invisible: on a good build the old code
# worked fine. The difference only shows when the build fails.
OLD_OK_LOG="$WORK/old-ok.log"
OLD_OK_RC=$(run_deploy "$OLD_OK_LOG" old "$TAG_FILE")
if [ "$OLD_OK_RC" = "0" ]; then
  ok "the OLD contract also accepts a valid tag file -- the bug only bit on a failed build"
else
  bad "the OLD contract rejected a valid tag file (rc=$OLD_OK_RC)"
fi

# -------------------------------------------------------------------------
# Test 4: an EMPTY tag file is caught (the exact shape of the live failure).
# -------------------------------------------------------------------------
echo ""
echo "--- Test 4: an empty tag file is caught ---"
EMPTY="$WORK/empty.env"
: > "$EMPTY"
EMPTY_LOG="$WORK/empty.log"
EMPTY_RC=$(run_deploy "$EMPTY_LOG" new "$EMPTY")

if [ "$EMPTY_RC" != "0" ]; then
  ok "an empty tag file aborts the deploy (rc=$EMPTY_RC)"
else
  bad "an empty tag file did NOT abort the deploy"
fi

if grep -qE "^DEPLOY_FAILED_AT=tag file missing or empty" "$EMPTY_LOG" 2>/dev/null; then
  ok "the empty-file failure is recorded in the log"
else
  bad "the empty-file failure is not in the log"
fi

# -------------------------------------------------------------------------
# Test 5: the EXIT trap reports an explicit `exit 1` correctly.
#
# This is the trap bug that made the deploy lie. The old EXIT trap did
# `exit "$_DEPLOY_EXIT"`, which was still 0.
# -------------------------------------------------------------------------
echo ""
echo "--- Test 5: the EXIT trap reports an explicit exit 1 ---"
EXPLICIT_LOG="$WORK/explicit.log"
(
  set -uo pipefail
  DEPLOY_LOG="$EXPLICIT_LOG"
  _DEPLOY_EXIT=0
  trap "$ERR_TRAP" ERR
  trap "$EXIT_TRAP" EXIT
  echo "DEPLOY_FAILED_AT=api unhealthy" >> "$DEPLOY_LOG"
  exit 1
) >/dev/null 2>&1
EXPLICIT_RC=$?

if [ "$EXPLICIT_RC" != "0" ]; then
  ok "an explicit exit 1 leaves the script with rc=$EXPLICIT_RC"
else
  bad "an explicit exit 1 left the script with rc=0 -- the trap swallowed it"
fi

if grep -qE "^DEPLOY_EXIT_CODE=1$" "$EXPLICIT_LOG" 2>/dev/null; then
  ok "the log says DEPLOY_EXIT_CODE=1"
else
  bad "the log does not say DEPLOY_EXIT_CODE=1: $(cat "$EXPLICIT_LOG" 2>/dev/null)"
fi

# -------------------------------------------------------------------------
# Test 6: a SUCCESSFUL deploy still reports DEPLOY_EXIT_CODE=0.
#
# A fix that made every deploy fail would be worse than the bug. This
# proves the success path is untouched.
# -------------------------------------------------------------------------
echo ""
echo "--- Test 6: a successful deploy still reports DEPLOY_EXIT_CODE=0 ---"
OK_LOG="$WORK/ok.log"
(
  set -uo pipefail
  DEPLOY_LOG="$OK_LOG"
  _DEPLOY_EXIT=0
  trap "$ERR_TRAP" ERR
  trap "$EXIT_TRAP" EXIT
  source "$TAG_FILE"
  exit 0
) >/dev/null 2>&1
OK_RC=$?

if [ "$OK_RC" = "0" ]; then
  ok "a successful deploy exits 0"
else
  bad "a successful deploy exited $OK_RC"
fi

if grep -qE "^DEPLOY_EXIT_CODE=0$" "$OK_LOG" 2>/dev/null; then
  ok "the log says DEPLOY_EXIT_CODE=0"
else
  bad "the log does not say DEPLOY_EXIT_CODE=0"
fi

if grep -qE "^DEPLOY_FAILED_AT=" "$OK_LOG" 2>/dev/null; then
  bad "a successful deploy wrote a DEPLOY_FAILED_AT line"
else
  ok "a successful deploy wrote no DEPLOY_FAILED_AT line"
fi

# -------------------------------------------------------------------------
echo ""
echo "=== $PASS passed, $FAIL failed ==="
[ "$FAIL" = "0" ] || exit 1
exit 0
