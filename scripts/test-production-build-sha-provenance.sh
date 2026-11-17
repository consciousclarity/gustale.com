#!/bin/bash
# scripts/test-production-build-sha-provenance.sh
#
# The production web deploy must PROVE the provenance of the image it
# deploys, not assert it.
#
# WHY THIS EXISTS
# ---------------
# On 2026-11-17 a staging deploy shipped an image whose TAG named one
# commit and whose CONTENT was another: the build had run against a
# different checkout. Every check passed, because the only identity
# available was the tag -- and the tag is a NAME, not proof.
#
# The same class of defect existed in production: the deploy compared
# the container's image TAG with the expected SHA, and the API's served
# identity, but never the web image's own content.
#
# So the commit is written INTO the image at build time and read back
# out of the image. These assertions cover the three places that has
# to happen:
#
#   1. the Dockerfile declares the ARG and writes the file;
#   2. the build passes the ARG and verifies the built image;
#   3. the deploy verifies the RUNNING image.
#
# Exit 0 if every assertion passes, 1 otherwise.
set -uo pipefail

cd "$(dirname "$0")/.." || exit 1

PASS=0
FAIL=0

ok()  { echo "  ok    $*"; PASS=$((PASS + 1)); }
bad() { echo "  FAIL  $*"; FAIL=$((FAIL + 1)); }

BUILD="scripts/hermes/build-web-live.sh"
DEPLOY="scripts/hermes/rebuild-web-live.sh"
DOCKERFILE="apps/web/Dockerfile"

# ─── 1. the files exist ────────────────────────────────────────────────
echo "=== 1. the files exist ==="
for f in "$BUILD" "$DEPLOY" "$DOCKERFILE"; do
  if [ -f "$f" ]; then
    ok "$f exists"
  else
    bad "$f exists"
  fi
done

B="$(cat "$BUILD" 2>/dev/null || echo "")"
D="$(cat "$DEPLOY" 2>/dev/null || echo "")"
K="$(cat "$DOCKERFILE" 2>/dev/null || echo "")"

# ─── 2. the Dockerfile declares and writes the provenance ───────────────
echo ""
echo "=== 2. the Dockerfile writes the commit into the image ==="
if printf '%s' "$K" | grep -qE '^ARG BUILD_SHA='; then
  ok "the Dockerfile declares ARG BUILD_SHA"
else
  bad "the Dockerfile declares ARG BUILD_SHA"
fi
if printf '%s' "$K" | grep -qE 'dist/\.build-sha'; then
  ok "the Dockerfile writes dist/.build-sha"
else
  bad "the Dockerfile writes dist/.build-sha"
fi
# The file must be written AFTER the build, or it would be written
# into a dist/ that the build then replaces.
BUILD_LINE=$(printf '%s' "$K" | grep -nE 'dist/\.build-sha' | head -1 | cut -d: -f1)
ASTRO_LINE=$(printf '%s' "$K" | grep -nE 'pnpm --filter @gustale/web run build:' | tail -1 | cut -d: -f1)
if [ -n "$BUILD_LINE" ] && [ -n "$ASTRO_LINE" ] && [ "$BUILD_LINE" -gt "$ASTRO_LINE" ]; then
  ok "the provenance file is written after the astro build"
else
  bad "the provenance file is written after the astro build"
fi

# ─── 3. the build passes the ARG and verifies the image ────────────────
echo ""
echo "=== 3. the build passes BUILD_SHA and verifies the image ==="
if printf '%s' "$B" | grep -qE '\-\-build-arg BUILD_SHA="\$SHA"'; then
  ok "the build passes BUILD_SHA to docker build"
else
  bad "the build passes BUILD_SHA to docker build"
fi
if printf '%s' "$B" | grep -q '\.build-sha'; then
  ok "the build reads .build-sha out of the built image"
else
  bad "the build reads .build-sha out of the built image"
fi
# An EMPTY .build-sha must be a failure, not a pass. An image that
# cannot prove anything must never be pushed.
if printf '%s' "$B" | grep -q 'carries NO .build-sha'; then
  ok "an image with no .build-sha is refused"
else
  bad "an image with no .build-sha is refused"
fi
# A MISMATCH must be a failure too.
if printf '%s' "$B" | grep -q 'the tag and the content disagree'; then
  ok "a provenance mismatch is refused"
else
  bad "a provenance mismatch is refused"
fi
# The verification must come BEFORE the push, or a bad image is
# already in the registry when the build fails.
#
# The COMMENT lines are skipped: the header documents `docker push`, and
# the first match would otherwise be the comment, not the command.
VERIFY_LINE=$(printf '%s' "$B" | grep -n '^[[:space:]]*echo "  the image proves its provenance' | head -1 | cut -d: -f1)
PUSH_LINE=$(printf '%s' "$B" | grep -n '^[[:space:]]*docker push' | head -1 | cut -d: -f1)
if [ -n "$VERIFY_LINE" ] && [ -n "$PUSH_LINE" ] && [ "$VERIFY_LINE" -lt "$PUSH_LINE" ]; then
  ok "the image is verified BEFORE it is pushed"
else
  bad "the image is verified BEFORE it is pushed"
fi

# ─── 4. the deploy verifies the RUNNING image ──────────────────────────
echo ""
echo "=== 4. the deploy verifies the running image ==="
if printf '%s' "$D" | grep -q 'both web images prove their own provenance'; then
  ok "the deploy checks that the web images prove their provenance"
else
  bad "the deploy checks that the web images prove their provenance"
fi
if printf '%s' "$D" | grep -q '/usr/share/nginx/html/.build-sha'; then
  ok "the deploy reads .build-sha out of the running image"
else
  bad "the deploy reads .build-sha out of the running image"
fi
# The FULL SHA must be compared. The short form is what the tag
# carries, and comparing short forms would compare the very thing
# being proven.
if printf '%s' "$D" | grep -qE '\[ "\$IMAGE_SHA" != "\$BUILD_SHA" \]'; then
  ok "the deploy compares the full SHA"
else
  bad "the deploy compares the full SHA"
fi
# A missing .build-sha must abort the deploy, not warn.
if printf '%s' "$D" | grep -q 'a web image cannot prove its provenance'; then
  ok "an image that cannot prove its provenance aborts the deploy"
else
  bad "an image that cannot prove its provenance aborts the deploy"
fi
# The check must read the IMAGE, not the container's configured tag.
if printf '%s' "$D" | grep -qE "docker inspect --format='\{\{\.Image\}\}'"; then
  ok "the deploy resolves the image ID, not the tag"
else
  bad "the deploy resolves the image ID, not the tag"
fi

echo ""
echo "=== $((PASS + FAIL)) assertions: $PASS passed, $FAIL failed ==="
[ "$FAIL" -eq 0 ] || exit 1
exit 0
