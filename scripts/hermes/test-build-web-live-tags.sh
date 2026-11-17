#!/usr/bin/env bash
# The regression test for build-web-live.sh's image tags.
#
# ONE IMAGE
# ---------
# The build used to produce TWO images -- `gustale-web-recipes` and
# `gustale-web-geo` -- because the site was two properties on two
# hosts. There is now ONE site, ONE image and ONE container. The
# surviving image is the geo one: `gustale-web-geo`, tagged
# `live-data-<short-sha>-geo`.
#
# WHAT THIS PROVES
# ----------------
# The deploy builds the web image with build-web-live.sh and then reads
# the tag file the script writes (TAG, TAG_GEO, IMAGE_GEO) to find the
# image it should swap in. Three things must hold:
#
#   1. The script runs to the end under `set -u`. On 2026-11-04 the
#      deploy of cb12bfa died at "TAG: unbound variable" because TAG was
#      no longer assigned.
#   2. The image the script BUILDS is exactly the image the tag file
#      ADVERTISES, with its -geo suffix. The same version built the
#      image without the suffix while advertising the suffixed name.
#   3. The tag file carries NO trace of the retired recipes image.
#      This is asserted EXPLICITLY, in both directions: a test that
#      only checked what is PRESENT would not notice the recipes image
#      coming back, and a second image built and deployed alongside the
#      first is exactly the half-deploy shape of the 2026-11-13
#      incident (one container swapped, the other left behind).
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
# The build date. The SHA above is not in any checkout, so it cannot be
# read from git -- which is exactly the case GUSTALE_BUILD_DATE exists
# for. The sitemaps' lastmod is generated from it.
BUILD_DATE="2026-11-17"
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
  GUSTALE_BUILD_DATE="$BUILD_DATE" \
  bash "$SCRIPT" "$SHA" ) > "$TMP/out.log" 2>&1
rc=$?

if [ "$rc" -eq 0 ]; then pass "the script runs to the end (exit 0)"
else fail "the script exited $rc: $(grep -m1 -iE 'unbound|error' "$TMP/out.log" || tail -1 "$TMP/out.log")"; fi

if [ -f "$TAG_FILE" ]; then
  # shellcheck disable=SC1090
  TAG="" TAG_GEO="" IMAGE_GEO=""
  source "$TAG_FILE"
  pass "the tag file was written"
else
  fail "the tag file was not written"
  TAG="" TAG_GEO="" IMAGE_GEO=""
fi

[ "$TAG" = "live-data-$SHORT" ] && pass "TAG is live-data-<short-sha>, as the deploy expects" \
  || fail "TAG is '$TAG', expected 'live-data-$SHORT'"

[ "$TAG_GEO" = "live-data-$SHORT-geo" ] \
  && pass "TAG_GEO carries the -geo suffix" || fail "TAG_GEO is '$TAG_GEO'"
[ "$IMAGE_GEO" = "$REG/gustale-web-geo:live-data-$SHORT-geo" ] \
  && pass "IMAGE_GEO carries the -geo suffix" || fail "IMAGE_GEO is '$IMAGE_GEO'"

# THE RETIRED RECIPES IMAGE MUST NOT COME BACK.
#
# This is asserted in BOTH directions:
#   - the tag file must not mention IMAGE_RECIPES or TAG_RECIPES at
#     all (not even as an empty value), and
#   - the build must not have produced a recipes image.
#
# A test that only asserted "the geo image is present" would sail
# through a build that quietly built TWO images again -- and a second
# image is the exact shape of the 2026-11-13 half-deploy (one
# container swapped, the other left on the old build).
if grep -qE "^(IMAGE_RECIPES|TAG_RECIPES)=" "$TAG_FILE" 2>/dev/null; then
  fail "the tag file still advertises the retired recipes image: $(grep -E '^(IMAGE_RECIPES|TAG_RECIPES)=' "$TAG_FILE" | tr '\n' ' ')"
else
  pass "the tag file does not carry IMAGE_RECIPES or TAG_RECIPES"
fi

if grep -q "gustale-web-recipes" "$DOCKER_BUILT" 2>/dev/null; then
  fail "a gustale-web-recipes image was built: $(grep 'gustale-web-recipes' "$DOCKER_BUILT" | tr '\n' ' ')"
else
  pass "no gustale-web-recipes image was built"
fi

grep -qxF "$IMAGE_GEO" "$DOCKER_BUILT" && [ -n "$IMAGE_GEO" ] \
  && pass "the geo image that was BUILT is the one the tag file advertises" \
  || fail "built [$(tr '\n' ' ' < "$DOCKER_BUILT")] but the tag file advertises '$IMAGE_GEO'"

[ "$(sort -u "$DOCKER_BUILT" | wc -l)" -eq 1 ] && pass "exactly one distinct image was built" \
  || fail "built: [$(tr '\n' ' ' < "$DOCKER_BUILT")]"

[ "$(wc -l < "$DOCKER_BUILT" | tr -d ' ')" -eq 1 ] && pass "exactly one image build ran" \
  || fail "the build ran $(wc -l < "$DOCKER_BUILT" | tr -d ' ') times: [$(tr '\n' ' ' < "$DOCKER_BUILT")]"

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
  GUSTALE_BUILD_DATE="$BUILD_DATE" \
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
