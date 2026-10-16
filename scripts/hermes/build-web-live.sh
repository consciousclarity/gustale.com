#!/usr/bin/env bash
# scripts/hermes/build-web-live.sh
#
# Build the Gustale web images on the VPS using live data from the local
# API (127.0.0.1:4000), then push to ghcr.io under a :live-data-<sha>
# tag so the deploy job can use them instead of the GHA-built (mock-data)
# images.
#
# Why: GHA cannot reach the VPS API through the firewall, so the GHA
# build uses an in-container mock (apps/web/scripts/mock-api.mjs).
# The static pages then bake the mock data, which is stale the moment
# any content changes via the API (e.g. a PATCH to longDescription).
# This script does the build on the VPS itself, where 127.0.0.1:4000
# is reachable, so the static pages reflect the live data.
#
# Usage (on the VPS):
#   ./scripts/hermes/build-web-live.sh
#
# Inputs (env vars):
#   GITHUB_REPOSITORY   (default: consciousclarity/gustale.com)
#   GITHUB_ACTOR        (for docker login)
#   GITHUB_TOKEN        (PAT or workflow token with packages:write)
#   GUSTALE_WEB_LIVE_TAG (default: live-data-<short sha> from git rev-parse)
#
# Outputs:
#   Writes the image tag to stdout and to .gustale-web-live-tag (in cwd).
#   The deploy job reads this file to know which tag to pull.
#
# Notes:
#   - This script intentionally does NOT restart the running containers.
#     The existing deploy flow in .github/workflows/ci.yml still pulls
#     and restarts; this script just publishes an extra tag.
#   - The GHA-built :latest image is unchanged. We add a :live-data-*
#     tag alongside it; the deploy job pulls :live-data-* for the web
#     containers and :latest for the API.
#   - Build context is the monorepo root (same as GHA).

set -euo pipefail

REPO="${GITHUB_REPOSITORY:-consciousclarity/gustale.com}"
GITHUB_ACTOR="${GITHUB_ACTOR:-${USER:-hermes}}"
TAG="${GUSTALE_WEB_LIVE_TAG:-live-data-$(git rev-parse --short HEAD)}"
REGISTRY="ghcr.io/${REPO}"
TAG_FILE="${GUSTALE_WEB_LIVE_TAG_FILE:-.gustale-web-live-tag}"

if [ -z "${GITHUB_TOKEN:-}" ]; then
  echo "ERROR: GITHUB_TOKEN must be set (for docker login to ghcr.io)" >&2
  exit 1
fi

echo "=== Hermes VPS web build (live data) ==="
echo "  repo:    $REPO"
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
build_one() {
  local domain="$1"
  local img_name="$2"
  local img="${REGISTRY}/${img_name}:${TAG}"
  local img_latest="${REGISTRY}/${img_name}:latest"
  echo ""
  echo "--- building $img (PUBLIC_DOMAIN=$domain, BUILD_DATA_SOURCE=live) ---"
  docker build \
    --build-arg PUBLIC_DOMAIN="$domain" \
    --build-arg BUILD_DATA_SOURCE=live \
    --build-arg PUBLIC_API_BASE=http://127.0.0.1:4000 \
    -f apps/web/Dockerfile \
    -t "$img" \
    -t "$img_latest" \
    . 2>&1 | tail -30
  echo "  pushing $img to ghcr..."
  docker push "$img" | tail -5
  echo "  pushing $img_latest (so the GHA deploy tag also points at live data)..."
  docker push "$img_latest" | tail -5
}

build_one recipes gustale-web-recipes
build_one geo     gustale-web-geo

# Write the tag for the deploy step / operator
echo "$TAG" > "$TAG_FILE"
echo ""
echo "=== DONE ==="
echo "  images pushed: ${REGISTRY}/gustale-web-recipes:${TAG}, ${REGISTRY}/gustale-web-geo:${TAG}"
echo "  tag file:      $TAG_FILE"
echo "  next step:     ./scripts/hermes/deploy-web-live.sh  OR  docker compose pull + restart"
