#!/usr/bin/env bash
# scripts/hermes/build-web-live.sh
#
# Build the Gustale web images on the VPS using LIVE data from the local
# API (127.0.0.1:4000), then optionally push to ghcr.io under a
# :live-data-<short-sha> tag so the deploy job can pull the live-data
# images and start the web containers from them.
#
# Why this exists: GHA cannot reach the VPS API through the firewall,
# so the GHA build uses an in-container mock (apps/web/scripts/mock-api.mjs).
# The static pages then bake the mock data, which is stale the moment
# any content changes via the API. This script does the build on the
# VPS itself, where 127.0.0.1:4000 is reachable, so the static pages
# reflect the live data.
#
# Usage (on the VPS):
#   ./scripts/hermes/build-web-live.sh <git-sha>
#
# Args:
#   <git-sha>  Required. The commit SHA to tag the images with. The deploy
#              job should pull gustale-web-{recipes,geo}:live-data-<short-sha>.
#
# Required env:
#   GITHUB_TOKEN     PAT or workflow token with packages:write on this repo.
#                    Only required if GUSTALE_NO_PUSH is NOT set to 1.
#   GITHUB_REPOSITORY  Default: consciousclarity/gustale.com
#   GITHUB_ACTOR       Default: $USER
#   GUSTALE_NO_PUSH     Set to 1 to skip the docker push. The image is still
#                       tagged with the ghcr.io/...:live-data-<short-sha>
#                       tag, but it lives only in the local docker cache.
#                       The rebuild timer (gustale-rebuild-web.timer) sets
#                       this because the local-only image is fine for the
#                       subsequent `docker run` that the timer does right
#                       after the build.
#
# Output (stdout, line-prefixed with "TAG=" for easy parsing by the deploy):
#   TAG=live-data-<short-sha>
#   IMAGE_RECIPES=ghcr.io/consciousclarity/gustale.com/gustale-web-recipes:live-data-<short-sha>
#   IMAGE_GEO=ghcr.io/consciousclarity/gustale.com/gustale-web-geo:live-data-<short-sha>
# Also writes the three lines to /tmp/gustale-web-live-tag.env for the deploy script.
#
# Notes:
#   - The script does NOT restart the running containers. The deploy
#     job (in .github/workflows/ci.yml) is responsible for pulling the
#     image and starting the container.
#   - The GHA-built :latest image is left untouched on ghcr. The
#     deploy job pulls by tag (live-data-<short-sha>), not by :latest.
#   - The build needs --network host so the build container can reach
#     127.0.0.1:4000 on the host. Without it, the build fails with
#     "API at http://127.0.0.1:4000/health not reachable after 60s".

set -euo pipefail

if [ $# -ne 1 ]; then
  echo "Usage: $0 <git-sha>" >&2
  exit 2
fi

SHA="$1"
SHORT_SHA="$(echo "$SHA" | cut -c1-7)"
REPO="${GITHUB_REPOSITORY:-consciousclarity/gustale.com}"
GITHUB_ACTOR="${GITHUB_ACTOR:-${USER:-hermes}}"
TAG="live-data-${SHORT_SHA}"
REGISTRY="ghcr.io/${REPO}"
# The tag file is a per-run artefact. A fixed /tmp path collides between
# concurrent runs, and a leftover file owned by another user makes the
# final rm fail - which under `set -e` aborts the caller BEFORE its deploy
# step, even though the images built fine (seen 2026-10-26 during GUS-227).
#
# The caller may pass an explicit path (rebuild-web-live.sh does, so it can
# clean it up via a trap); standalone runs get their own mktemp file.
if [ -n "${GUSTALE_WEB_LIVE_TAG_FILE:-}" ]; then
  TAG_FILE="$GUSTALE_WEB_LIVE_TAG_FILE"
else
  TAG_FILE="$(mktemp /tmp/gustale-web-live-tag.XXXXXX.env)"
  trap 'rm -f "$TAG_FILE"' EXIT
fi
NO_PUSH="${GUSTALE_NO_PUSH:-0}"

if [ "$NO_PUSH" != "1" ] && [ -z "${GITHUB_TOKEN:-}" ]; then
  echo "ERROR: GITHUB_TOKEN must be set (for docker login to ghcr.io). Or set GUSTALE_NO_PUSH=1 to skip the push and use the image locally only." >&2
  exit 1
fi

# The Dockerfile expects the build context to be the monorepo root.
# CWD must be the repo checkout with the requested SHA checked out.
# Caller (the deploy job) ensures this.
if [ ! -d apps/web ]; then
  echo "ERROR: cwd $(pwd) does not look like the gustale monorepo root (no apps/web)" >&2
  exit 1
fi

echo "=== Hermes VPS web build (live data) ==="
echo "  repo:    $REPO"
echo "  sha:     $SHA"
echo "  tag:     $TAG"
echo "  context: $(pwd)"
echo "  push:    $([ "$NO_PUSH" = "1" ] && echo "skipped (GUSTALE_NO_PUSH=1)" || echo "to ghcr")"

# Verify the API is reachable and the build will hit it.
echo ""
echo "--- API health check ---"
curl -fsS http://127.0.0.1:4000/health | head -c 200
echo ""

# Login to ghcr (only if we're going to push)
if [ "$NO_PUSH" != "1" ]; then
  echo ""
  echo "--- docker login to ghcr.io ---"
  echo "$GITHUB_TOKEN" | docker login ghcr.io -u "$GITHUB_ACTOR" --password-stdin
fi

# Build both web variants. The Dockerfile takes the BUILD_DATA_SOURCE=live
# arg, which makes it skip the mock and use PUBLIC_API_BASE=http://127.0.0.1:4000
# for the build. PUBLIC_DOMAIN picks the variant.
# --network host is required so the build container can reach
# 127.0.0.1:4000 on the host (default bridge network would route 127.0.0.1
# to the container's own loopback, not the host's).
build_one() {
  local domain="$1"
  local img_name="$2"
  local img="${REGISTRY}/${img_name}:${TAG}"
  echo ""
  echo "--- building $img (PUBLIC_DOMAIN=$domain, BUILD_DATA_SOURCE=live) ---"
  # Honour a caller-controlled no-cache toggle. The default is to use
  # buildx cache (fast), but a manual --force / GUSTALE_BUILD_NO_CACHE=1
  # forces a clean rebuild so fresh API data is reflected on the next
  # deploy. The earlier bug here was that buildx layer-cache hit on the
  # COPY-fetch-Dockerfile steps and re-baked the OLD data even when the
  # API had changed (2026-10-17).
  local -a cache_args=()
  if [ "${GUSTALE_BUILD_NO_CACHE:-0}" = "1" ]; then
    cache_args=(--no-cache --pull)
  fi
  docker build \
    "${cache_args[@]}" \
    --network host \
    --build-arg PUBLIC_DOMAIN="$domain" \
    --build-arg BUILD_DATA_SOURCE=live \
    --build-arg PUBLIC_API_BASE=http://127.0.0.1:4000 \
    -f apps/web/Dockerfile \
    -t "$img" \
    . 2>&1 | tail -10
  if [ "$NO_PUSH" != "1" ]; then
    echo "  pushing $img to ghcr..."
    docker push "$img" | tail -5
  fi
}

build_one recipes gustale-web-recipes
build_one geo     gustale-web-geo

# Emit the deploy variables. Two channels: stdout (line-prefixed with TAG=
# / IMAGE_=, for the deploy script to capture) and a file (for operators
# to inspect after a deploy). Remove any stale file first so the `cat >`
# below doesn't fail with "Permission denied" if a previous run (run as
# a different user — e.g. hermes for the rebuild, root for the deploy)
# left a non-writable file behind.
rm -f "$TAG_FILE"
cat >"$TAG_FILE" <<EOF
TAG=$TAG
IMAGE_RECIPES=$REGISTRY/gustale-web-recipes:$TAG
IMAGE_GEO=$REGISTRY/gustale-web-geo:$TAG
EOF
# Make the file world-readable so the deploy script (running as root)
# can `source` it even if the file was originally written by hermes
# (the rebuild user).
chmod 0644 "$TAG_FILE"
cat "$TAG_FILE"

echo ""
echo "=== DONE ==="
if [ "$NO_PUSH" = "1" ]; then
  echo "  images built (local only): $REGISTRY/gustale-web-recipes:$TAG, $REGISTRY/gustale-web-geo:$TAG"
else
  echo "  images pushed: $REGISTRY/gustale-web-recipes:$TAG, $REGISTRY/gustale-web-geo:$TAG"
fi
echo "  tag file:      $TAG_FILE"
