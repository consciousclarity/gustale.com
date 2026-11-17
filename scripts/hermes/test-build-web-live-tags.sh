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

# Shims: docker records every `-t <image>` it is asked to build AND
# answers the provenance read; curl answers the API health check.
#
# The docker stub is scripts/hermes/docker-stub.sh. It also answers
# `docker run --rm --entrypoint sh <image> -c 'cat .../.build-sha'` to
# prove the finished image contains the commit it claims, because
# build-web-live.sh PROVES the image's provenance before it pushes.
# A stub that ignored that call made the real script refuse to proceed
# ("the geo image carries NO .build-sha") -- which is the check
# WORKING, but the stub has to model a real image, or the test can only
# assert the failure.
#
# The stub remembers the BUILD_SHA it was handed for each image it
# "builds" and answers the read with that SHA. A real image built by
# the Dockerfile carries exactly this file, so this is the faithful
# model, not a rubber stamp.
# shellcheck source=scripts/hermes/docker-stub.sh
. "$(dirname "$0")/docker-stub.sh"
SHIM="$TMP/bin"
mkdir -p "$SHIM"
cat > "$SHIM/curl" <<'EOF'
#!/usr/bin/env bash
echo '{"status":"ok"}'
EOF
chmod +x "$SHIM/curl"

SHA="0123456789abcdef0123456789abcdef01234567"
SHORT="0123456"
REG="ghcr.io/consciousclarity/gustale.com"
TAG_FILE="$TMP/tag.env"
export DOCKER_BUILT="$TMP/built.txt"
export DOCKER_BUILT_SHA="$TMP/built-sha.txt"
: > "$DOCKER_BUILT"
: > "$DOCKER_BUILT_SHA"
write_docker_stub "$SHIM/docker"

echo "=== build-web-live.sh image tags ==="

( cd "$REPO_ROOT" && \
  PATH="$SHIM:$PATH" \
  GITHUB_REPOSITORY="consciousclarity/gustale.com" \
  GUSTALE_NO_PUSH=1 \
  GUSTALE_WEB_LIVE_TAG_FILE="$TAG_FILE" \
  GUSTALE_SKIP_SNAPSHOT=1 \
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

# ─── the NEGATIVE case ────────────────────────────────────────────────
# The stub above answers the provenance read with the SHA it was handed,
# so the run above proves the happy path. This run makes the stub answer
# with a DIFFERENT SHA -- the image claims a commit it does not contain
# -- and the build must REFUSE.
#
# Without this, the test would pass against a stub that always says
# "yes", and would prove nothing about the check.
echo
echo "=== the negative case: the image claims the wrong commit ==="

# The stub honours DOCKER_LIE_SHA: every provenance read answers with
# it instead of the real SHA.
export DOCKER_LIE_SHA="ffffffffffffffffffffffffffffffffffffffff"
rm -f "$TAG_FILE"
: > "$DOCKER_BUILT"

( cd "$REPO_ROOT" && \
  PATH="$SHIM:$PATH" \
  GITHUB_REPOSITORY="consciousclarity/gustale.com" \
  GUSTALE_NO_PUSH=1 \
  GUSTALE_WEB_LIVE_TAG_FILE="$TAG_FILE" \
  GUSTALE_SKIP_SNAPSHOT=1 \
  bash "$SCRIPT" "$SHA" ) > "$TMP/out-lie.log" 2>&1
rc=$?

if [ "$rc" -ne 0 ]; then
  pass "the build REFUSES an image whose .build-sha is a different commit (exit $rc)"
else
  fail "the build accepted an image claiming $DOCKER_LIE_SHA while $SHA was built"
fi

if grep -qi "claims to be" "$TMP/out-lie.log"; then
  pass "the refusal says WHY: the image's commit and the built commit disagree"
else
  fail "the refusal did not name the disagreement: $(grep -m1 -iE 'error|claim' "$TMP/out-lie.log" || tail -1 "$TMP/out-lie.log")"
fi

if grep -qi "pushing" "$TMP/out-lie.log"; then
  fail "the bad image was PUSHED -- a refused build must not publish"
else
  pass "the bad image was NOT pushed"
fi

echo
echo "BUILD_WEB_LIVE_TAGS: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ] || exit 1
echo "BUILD_WEB_LIVE_TAGS_OK=1"
