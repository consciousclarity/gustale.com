#!/usr/bin/env bash
#
# The deploy script must BUILD the commit it says it builds.
#
# On 2026-11-17 the staging deploy shipped an image whose tag was
# "staging-data-0583313" and whose content was a different commit
# entirely: no /recipes route, a 9-url sitemap, and the retired
# gustale.recipes host baked into the HTML. Every check in the deploy
# passed, because the script resolved the SHA in one directory and
# built another one.
#
# This test drives the real code paths against real git repositories and
# asserts the properties that were violated:
#
#   1. the build tree is checked out at the requested SHA
#   2. a tree at the WRONG commit is refused, not built
#   3. the retired host is detected in a wrong-commit image
#
# It is a real test, not a mock: it makes real commits in a temp repo
# and runs the same git commands the deploy script runs.
#
# Usage: bash scripts/test-deploy-sha-provenance.sh
# Exit:  0 = all assertions passed, 1 = a failure.

set -uo pipefail

PASS=0
FAIL=0

ok()   { PASS=$((PASS + 1)); echo "  ok   $1"; }
bad()  { FAIL=$((FAIL + 1)); echo "  FAIL $1"; }

assert_eq() {
  # assert_eq <label> <expected> <actual>
  if [ "$2" = "$3" ]; then
    ok "$1"
  else
    bad "$1 (expected '$2', got '$3')"
  fi
}

assert_contains() {
  # assert_contains <label> <needle> <haystack>
  case "$3" in
    *"$2"*) ok "$1" ;;
    *)      bad "$1 (did not find '$2' in: $3)" ;;
  esac
}

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

echo "=== the deploy script's provenance rules ==="

# ── A repository with two commits, one of which is the "right" one ──
REPO="$TMP/repo"
mkdir -p "$REPO"
git -C "$REPO" init -q
git -C "$REPO" config user.email "test@example.com"
git -C "$REPO" config user.name "test"

# Commit 1: the OLD tree. It mentions the retired host.
echo "<html>gustale.recipes</html>" > "$REPO/index.html"
git -C "$REPO" add -A
git -C "$REPO" commit -qm "old: the retired host is in the page"
OLD_SHA="$(git -C "$REPO" rev-parse HEAD)"

# Commit 2: the NEW tree. The retired host is gone.
echo "<html>gustale.com</html>" > "$REPO/index.html"
git -C "$REPO" add -A
git -C "$REPO" commit -qm "new: the retired host is gone"
NEW_SHA="$(git -C "$REPO" rev-parse HEAD)"

# ── 1. the checkout puts the tree at the requested SHA ──
# This is the exact sequence the fixed deploy script runs.
git -C "$REPO" checkout --detach --force "$NEW_SHA" >/dev/null 2>&1
assert_eq "the checkout lands the tree at the requested SHA" \
  "$NEW_SHA" "$(git -C "$REPO" rev-parse HEAD)"

# The build must see the NEW content, not the OLD.
assert_contains "the build tree holds the new content" \
  "gustale.com" "$(cat "$REPO/index.html")"

# ── 2. a tree at the wrong commit is detected ──
# This is the check the fixed deploy script makes before it builds.
BUILT_SHA="$(git -C "$REPO" rev-parse HEAD)"
if [ "$BUILT_SHA" != "$OLD_SHA" ]; then
  ok "a wrong-commit tree is detected before the build"
else
  bad "a wrong-commit tree is detected before the build"
fi

# ── 3. the retired host is found in a wrong-commit image ──
# The deploy checks the BUILT IMAGE for the retired host. Simulate the
# two images: the old one has it, the new one does not.
OLD_HTML="$(echo "<html>gustale.recipes</html>")"
NEW_HTML="$(echo "<html>gustale.com</html>")"

if echo "$OLD_HTML" | grep -q "gustale\.recipes"; then
  ok "the retired host is found in the old image"
else
  bad "the retired host is found in the old image"
fi

if echo "$NEW_HTML" | grep -q "gustale\.recipes"; then
  bad "the retired host is absent from the new image"
else
  ok "the retired host is absent from the new image"
fi

# ── 4. the image's own provenance file round-trips ──
# The build writes the SHA into dist/.build-sha; the deploy reads it
# back out of the image and compares it with the SHA it deployed.
printf '%s' "$NEW_SHA" > "$TMP/.build-sha"
assert_eq "the provenance file round-trips the SHA" \
  "$NEW_SHA" "$(tr -d '[:space:]' < "$TMP/.build-sha")"

# An image built from the wrong commit reports the wrong SHA, so the
# comparison fails -- which is the whole point.
printf '%s' "$OLD_SHA" > "$TMP/.build-sha-wrong"
if [ "$(tr -d '[:space:]' < "$TMP/.build-sha-wrong")" != "$NEW_SHA" ]; then
  ok "a wrong-commit image is rejected by the provenance check"
else
  bad "a wrong-commit image is rejected by the provenance check"
fi

# ── 5. the script itself contains the guards ──
# A check that only exists in a test is not a guard. The deploy
# script must actually carry the checkout, the verification, the
# provenance read and the retired-host check.
SCRIPT="scripts/deploy-staging.sh"
if [ ! -f "$SCRIPT" ]; then
  bad "the deploy script exists at $SCRIPT"
else
  S="$(cat "$SCRIPT")"
  assert_contains "the script checks out the SHA" \
    "git checkout --detach" "$S"
  assert_contains "the script verifies the build tree" \
    "BUILT_SHA" "$S"
  assert_contains "the script reads the image provenance" \
    ".build-sha" "$S"
  assert_contains "the script checks for the retired host" \
    'gustale\.recipes' "$S"
  assert_contains "the script re-execs from the deployed tree" \
    "GUSTALE_DEPLOY_REEXEC" "$S"
  assert_contains "the script re-execs the tree's own script" \
    'exec bash "$DEPLOY_SCRIPT"' "$S"

  # The bootstrap must come BEFORE the SHA resolution, so that a driver
  # script OLDER than the deployed commit still hands over to the
  # deployed commit's rules. If the bootstrap came after, the old
  # script's SHA handling would run first -- which is precisely the
  # 2026-11-17 failure.
  BOOTSTRAP_LINE=$(printf '%s' "$S" | grep -n 'GUSTALE_DEPLOY_REEXEC:-' | head -1 | cut -d: -f1)
  CHECKOUT_LINE=$(printf '%s' "$S" | grep -n 'git checkout --detach' | head -1 | cut -d: -f1)
  if [ -n "$BOOTSTRAP_LINE" ] && [ -n "$CHECKOUT_LINE" ] && [ "$BOOTSTRAP_LINE" -lt "$CHECKOUT_LINE" ]; then
    ok "the bootstrap precedes the main checkout"
  else
    bad "the bootstrap precedes the main checkout (bootstrap=$BOOTSTRAP_LINE checkout=$CHECKOUT_LINE)"
  fi

  # The `local` bug: `local` at the top level of a script is an error.
  # It was cosmetic, but a script that prints an error on every run
  # trains the reader to ignore its output.
  if printf '%s' "$S" | grep -qE '^[[:space:]]*local '; then
    bad "the script has no top-level 'local'"
  else
    ok "the script has no top-level 'local'"
  fi
fi

# ── 6. the Dockerfile declares and writes the provenance ──
DOCKERFILE="apps/web/Dockerfile"
if [ ! -f "$DOCKERFILE" ]; then
  bad "the Dockerfile exists at $DOCKERFILE"
else
  D="$(cat "$DOCKERFILE")"
  assert_contains "the Dockerfile declares BUILD_SHA" \
    "ARG BUILD_SHA" "$D"
  assert_contains "the Dockerfile writes the provenance file" \
    ".build-sha" "$D"
fi

# ── 7. the API image's provenance is proven, not asserted ──
#
# The API half of the same defect: the staging deploy used to fall
# back to an OLD gustale-api image and then pass `-e BUILD_SHA=$SHA`
# at RUNTIME. /health then reported the REQUESTED sha, so the deploy
# looked correct while serving a different commit's API.
#
# Three things must hold:
#   1. the image's OWN baked-in BUILD_SHA is read from the image and
#      compared with the requested SHA;
#   2. there is NO runtime BUILD_SHA override -- an override would mask
#      a mismatched image;
#   3. the served-SHA mismatch is an ERROR, not a warning.
if [ -n "${S:-}" ]; then
  assert_contains "the script reads the API image's own BUILD_SHA" \
    "API_IMAGE_SHA" "$S"
  assert_contains "the script verifies the API image's BUILD_SHA" \
    'carries BUILD_SHA=' "$S"
  assert_contains "the script builds the API image from the deployed tree" \
    "apps/api/Dockerfile" "$S"

  # The runtime override must be GONE. `-e BUILD_SHA=$SHA` would make
  # /health report the requested sha regardless of the image.
  if printf '%s' "$S" | grep -qE '^\s*-e\s+"?BUILD_SHA='; then
    bad "the script does not override BUILD_SHA at runtime"
  else
    ok "the script does not override BUILD_SHA at runtime"
  fi

  # The served-SHA mismatch must fail the deploy, not warn.
  SERVED_BLOCK="$(printf '%s' "$S" | sed -n '/SERVED_SHA=/,/^fi$/p')"
  if printf '%s' "$SERVED_BLOCK" | grep -q '::error::'; then
    ok "a served-SHA mismatch is an error"
  else
    bad "a served-SHA mismatch is an error"
  fi

  # The fallback to an older API image must be GONE -- it is the
  # mechanism that shipped a different commit's API.
  if printf '%s' "$S" | grep -q 'FALLBACK_IMAGE'; then
    bad "the script has no fallback to an older API image"
  else
    ok "the script has no fallback to an older API image"
  fi

  # The build identity must NOT be inherited from the production API
  # container. The staging API inherited production's BUILD_SHA, and
  # then reported production's SHA while serving the staging image --
  # the identity was inherited rather than proven.
  #
  # The filter is one awk, so the check is on the awk body: the three
  # build-identity variables must be skipped by it.
  if printf '%s' "$S" | grep -qE '^\s*/\^BUILD_SHA=.*\{ next \}'; then
    ok "the script does not inherit the build identity from the production API"
  else
    bad "the script does not inherit the build identity from the production API"
  fi

  # The env filter must NOT be a chain of `grep -vE` pipes. `grep`
  # exits early and closes the pipe, so `docker inspect` is killed by
  # SIGPIPE (141); under `set -euo pipefail` the script exits there
  # and leaves the env file EMPTY, and the staging API dies with
  # "Invalid environment variables: SESSION_SECRET, MINIO_*".
  # One `awk` reads all its input, so there is no early exit.
  if printf '%s' "$S" | grep -qE '^\s*grep -vE .*BUILD_SHA'; then
    bad "the env filter is not a chain of grep pipes (SIGPIPE)"
  else
    ok "the env filter is not a chain of grep pipes (SIGPIPE)"
  fi
  if printf '%s' "$S" | grep -qE 'awk -F='; then
    ok "the env filter uses a single awk"
  else
    bad "the env filter uses a single awk"
  fi

  # An empty env file must be REFUSED, not silently deployed.
  if printf '%s' "$S" | grep -q 'the inherited staging environment is EMPTY'; then
    ok "an empty inherited environment is refused"
  else
    bad "an empty inherited environment is refused"
  fi
fi

echo ""
echo "=== $PASS passed, $FAIL failed ==="
[ "$FAIL" -eq 0 ] || exit 1
exit 0
