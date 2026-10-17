#!/usr/bin/env bash
# scripts/hermes/build-web-live.sh
#
# Build the Gustale web images on the VPS using LIVE data from the local
# API (127.0.0.1:4000), then push to ghcr.io under a :live-data-<short-sha>
# tag so the deploy job can pull the live-data images and start the
# web containers from them.
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
#   GITHUB_REPOSITORY  Default: consciousclarity/gustale.com
#   GITHUB_ACTOR       Default: $USER
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
TAG_FILE="${GUSTALE_WEB_LIVE_TAG_FILE:-/tmp/gustale-web-live-tag.env}"

if [ -z "${GITHUB_TOKEN:-}" ]; then
  echo "ERROR: GITHUB_TOKEN must be set (for docker login to ghcr.io)" >&2
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

# Verify the API is reachable and the build will hit it.
echo ""
echo "--- API health check ---"
curl -fsS http://127.0.0.1:4000/health | head -c 200
echo ""

# Login to ghcr
echo ""
echo "--- docker login to ghcr.io ---"
echo "$GITHUB_TOKEN" | docker login ghcr.io -u "$GITHUB_ACTOR" --password-stdin

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
  docker build \
    --network host \
    --build-arg PUBLIC_DOMAIN="$domain" \
    --build-arg BUILD_DATA_SOURCE=live \
    --build-arg PUBLIC_API_BASE=http://127.0.0.1:4000 \
    -f apps/web/Dockerfile \
    -t "$img" \
    . 2>&1 | tail -10
  echo "  pushing $img to ghcr..."
  docker push "$img" | tail -5
}

build_one recipes gustale-web-recipes
build_one geo     gustale-web-geo

# Emit the deploy variables. Two channels: stdout (line-prefixed with TAG=
# / IMAGE_=, for the deploy script to capture) and a file (for operators
# to inspect after a deploy).
cat >"$TAG_FILE" <<EOF
TAG=$TAG
IMAGE_RECIPES=$REGISTRY/gustale-web-recipes:$TAG
IMAGE_GEO=$REGISTRY/gustale-web-geo:$TAG
EOF
cat "$TAG_FILE"

echo ""
echo "=== DONE ==="
echo "  images pushed: $REGISTRY/gustale-web-recipes:$TAG, $REGISTRY/gustale-web-geo:$TAG"
echo "  tag file:      $TAG_FILE"
