#!/bin/bash
# The live-snapshot path of build-web-live.sh, proven.
#
# WHY THIS TEST EXISTS
# -------------------
# build-web-live.sh fetches a live snapshot before the builds. That fetch
# is a NETWORK call, and the tag-file test (test-build-web-live-tags.sh)
# stubs docker and curl but has no API on :4000 -- so an UNCONDITIONAL
# fetch aborted the whole script before a single image was built, and
# that test failed with the confusing symptom:
#
#   FAIL: built [] but the tag file advertises '...-geo'
#
# i.e. it looked like the TAGS were wrong when in fact no build had run
# at all. So the skip switch and the fetch-failure behaviour both need
# their own coverage.
#
# Run: bash scripts/hermes/test-build-web-live-snapshot.sh
set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SCRIPT="$REPO_ROOT/scripts/hermes/build-web-live.sh"

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

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
mkdir -p "$TMP/bin"

# A docker stub that records the -t tags and answers the provenance
# read the way a real image would, and a curl stub.
#
# The shared stub is scripts/hermes/docker-stub.sh: it also answers
# `docker run ... cat .../.build-sha` with the BUILD_SHA the image was
# built with, because build-web-live.sh PROVES the image's provenance
# before it pushes, and a stub that cannot be read from makes the real
# script refuse to proceed.
# shellcheck source=scripts/hermes/docker-stub.sh
. "$(dirname "$0")/docker-stub.sh"
export DOCKER_BUILT="$TMP/built.txt"
export DOCKER_BUILT_SHA="$TMP/built-sha.txt"
: > "$DOCKER_BUILT"
: > "$DOCKER_BUILT_SHA"
write_docker_stub "$TMP/bin/docker"
cat > "$TMP/bin/curl" <<'EOF'
#!/usr/bin/env bash
echo '{"status":"ok"}'
EOF
chmod +x "$TMP/bin/curl"

SHA="0123456789abcdef0123456789abcdef01234567"

run_build() {
  # run_build <extra env assignments...>
  : > "$DOCKER_BUILT"
  ( cd "$REPO_ROOT" && \
    PATH="$TMP/bin:$PATH" \
    GITHUB_REPOSITORY="consciousclarity/gustale.com" \
    GUSTALE_NO_PUSH=1 \
    GUSTALE_WEB_LIVE_TAG_FILE="$TMP/tag.env" \
    "$@" \
    bash "$SCRIPT" "$SHA" ) > "$TMP/out.log" 2>&1
  echo $?
}

echo "=== 1. GUSTALE_SKIP_SNAPSHOT=1 skips the fetch and builds the one image ==="
rc=$(run_build env GUSTALE_SKIP_SNAPSHOT=1)
check "the exit code" "$rc" "0"
check "the number of images built" "$(wc -l < "$DOCKER_BUILT" | tr -d ' ')" "1"

echo
echo "=== 2. WITHOUT the skip, an unreachable API must FAIL THE BUILD ==="
# This is the important one: a stale snapshot must never be silently
# used. The build has to fail loudly so the caller knows.
rc=$(run_build env GUSTALE_SNAPSHOT_API_BASE="http://127.0.0.1:9" GUSTALE_SNAPSHOT_CONCURRENCY=2)
if [ "$rc" != "0" ]; then
  echo "  OK   the build FAILED (rc=$rc) rather than building from stale data"
  PASS=$((PASS + 1))
else
  echo "  FAIL the build succeeded (rc=0) with an unreachable API -- it would ship STALE data"
  FAIL=$((FAIL + 1))
fi
if grep -q "could not be fetched" "$TMP/out.log"; then
  echo "  OK   the failure says the snapshot could not be fetched"
  PASS=$((PASS + 1))
else
  echo "  FAIL the failure message does not mention the snapshot"
  FAIL=$((FAIL + 1))
fi
check "no images were built" "$(wc -l < "$DOCKER_BUILT" | tr -d ' ')" "0"

echo
echo "=== 3. BUILD_DATA_SOURCE=mock does not fetch at all ==="
rc=$(run_build env GUSTALE_BUILD_DATA_SOURCE=mock)
check "the exit code" "$rc" "0"
check "the number of images built" "$(wc -l < "$DOCKER_BUILT" | tr -d ' ')" "1"

echo
echo "=== 4. BUILD_DATA_SOURCE=live does not fetch either (the old path) ==="
rc=$(run_build env GUSTALE_BUILD_DATA_SOURCE=live)
check "the exit code" "$rc" "0"
check "the number of images built" "$(wc -l < "$DOCKER_BUILT" | tr -d ' ')" "1"

echo
echo "=== $PASS passed, $FAIL failed ==="
[ "$FAIL" -eq 0 ] || exit 1
echo "BUILD_WEB_LIVE_SNAPSHOT_OK=1"
