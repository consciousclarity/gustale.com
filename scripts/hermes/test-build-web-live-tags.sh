#!/usr/bin/env bash
# The regression test for build-web-live.sh's image tags.
#
# WHAT THIS PROVES
# ----------------
# The deploy builds both web images with build-web-live.sh and then reads
# the tag file the script writes (TAG, IMAGE_RECIPES, IMAGE_GEO) to find
# the images it should swap in. Two things must hold:
#
#   1. The script runs to the end under `set -u`. On 2026-11-04 the
#      deploy of cb12bfa died at "TAG: unbound variable" because TAG was
#      no longer assigned.
#   2. The images the script BUILDS are exactly the images the tag file
#      ADVERTISES, and the two variants have distinct tags. The same
#      version built both images without their -recipes/-geo suffix
#      while advertising the suffixed names.
#
# It runs the REAL script with `docker` and `curl` shimmed on PATH, so it
# builds nothing and needs no API. Only the deploy (which runs on main,
# after merge) exercised this script before; this test runs it on every
# PR.

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
SCRIPT="$SCRIPT_DIR/build-web-live.sh"

PASS=0
FAIL=0
pass() { echo "  PASS: $1"; PASS=$((PASS + 1)); }
fail() { echo "  FAIL: $1"; FAIL=$((FAIL + 1)); }

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

# Shims: docker records every `-t <image>` it is asked to build; curl
# answers the API health check.
SHIM="$TMP/bin"
mkdir -p "$SHIM"
cat > "$SHIM/docker" <<'EOF'
#!/usr/bin/env bash
if [ "${1:-}" = "build" ]; then
  prev=""
  for a in "$@"; do
    [ "$prev" = "-t" ] && echo "$a" >> "$DOCKER_BUILT"
    prev="$a"
  done
fi
exit 0
EOF
cat > "$SHIM/curl" <<'EOF'
#!/usr/bin/env bash
echo '{"status":"ok"}'
EOF
chmod +x "$SHIM/docker" "$SHIM/curl"

SHA="0123456789abcdef0123456789abcdef01234567"
SHORT="0123456"
REG="ghcr.io/consciousclarity/gustale.com"
TAG_FILE="$TMP/tag.env"
export DOCKER_BUILT="$TMP/built.txt"
: > "$DOCKER_BUILT"

echo "=== build-web-live.sh image tags ==="

( cd "$REPO_ROOT" && \
  PATH="$SHIM:$PATH" \
  GITHUB_REPOSITORY="consciousclarity/gustale.com" \
  GUSTALE_NO_PUSH=1 \
  GUSTALE_WEB_LIVE_TAG_FILE="$TAG_FILE" \
  bash "$SCRIPT" "$SHA" ) > "$TMP/out.log" 2>&1
rc=$?

if [ "$rc" -eq 0 ]; then pass "the script runs to the end (exit 0)"
else fail "the script exited $rc: $(grep -m1 -iE 'unbound|error' "$TMP/out.log" || tail -1 "$TMP/out.log")"; fi

if [ -f "$TAG_FILE" ]; then
  # shellcheck disable=SC1090
  TAG="" IMAGE_RECIPES="" IMAGE_GEO=""
  source "$TAG_FILE"
  pass "the tag file was written"
else
  fail "the tag file was not written"
  TAG="" IMAGE_RECIPES="" IMAGE_GEO=""
fi

[ "$TAG" = "live-data-$SHORT" ] && pass "TAG is live-data-<short-sha>, as the deploy expects" \
  || fail "TAG is '$TAG', expected 'live-data-$SHORT'"

[ "$IMAGE_RECIPES" = "$REG/gustale-web-recipes:live-data-$SHORT-recipes" ] \
  && pass "IMAGE_RECIPES carries the -recipes suffix" || fail "IMAGE_RECIPES is '$IMAGE_RECIPES'"
[ "$IMAGE_GEO" = "$REG/gustale-web-geo:live-data-$SHORT-geo" ] \
  && pass "IMAGE_GEO carries the -geo suffix" || fail "IMAGE_GEO is '$IMAGE_GEO'"

grep -qxF "$IMAGE_RECIPES" "$DOCKER_BUILT" && [ -n "$IMAGE_RECIPES" ] \
  && pass "the recipes image that was BUILT is the one the tag file advertises" \
  || fail "built [$(tr '\n' ' ' < "$DOCKER_BUILT")] but the tag file advertises '$IMAGE_RECIPES'"
grep -qxF "$IMAGE_GEO" "$DOCKER_BUILT" && [ -n "$IMAGE_GEO" ] \
  && pass "the geo image that was BUILT is the one the tag file advertises" \
  || fail "built [$(tr '\n' ' ' < "$DOCKER_BUILT")] but the tag file advertises '$IMAGE_GEO'"

[ "$(sort -u "$DOCKER_BUILT" | wc -l)" -eq 2 ] && pass "exactly two distinct images were built" \
  || fail "built: [$(tr '\n' ' ' < "$DOCKER_BUILT")]"

echo
echo "BUILD_WEB_LIVE_TAGS: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ] || exit 1
echo "BUILD_WEB_LIVE_TAGS_OK=1"
