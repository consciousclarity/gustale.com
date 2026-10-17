#!/usr/bin/env bash
# scripts/hermes/rebuild-web-live.sh
#
# Manually rebuild and deploy the Gustale web images with live data.
# Intended for after content changes that shouldn't wait for the next
# scheduled rebuild (e.g. a contributor publishes a new longDescription
# via the API and you want it visible within 5 minutes rather than 30).
#
# Usage (on the VPS, as the deploy user):
#   ./scripts/hermes/rebuild-web-live.sh [--deploy]
#
# Args:
#   --deploy  After building, also pull the new image and restart the
#             web containers. Without this flag, the script just builds
#             and pushes; the next deploy (or the timer) picks it up.
#
# Workflow:
#   1. cd to the workspace
#   2. git fetch + reset to origin/main (so the build reflects the
#      current deployed code, not whatever is checked out locally)
#   3. invoke build-web-live.sh with the current main SHA
#   4. (with --deploy) source the tag file, pull the images, restart
#      the web containers (leaves gustale-api alone)
#
# Companion timer: see /etc/systemd/system/gustale-rebuild-web.timer
# (added in PR #66). The timer runs rebuild-web-live.sh --deploy every
# 30 minutes.

set -euo pipefail

WORKSPACE="${GUSTALE_WORKSPACE:-/home/hermes/projects/gustale.com}"
DEPLOY=0
for arg in "$@"; do
  case "$arg" in
    --deploy) DEPLOY=1 ;;
    *) echo "Usage: $0 [--deploy]" >&2; exit 2 ;;
  esac
done

cd "$WORKSPACE"

echo "=== Refreshing workspace to origin/main ==="
git fetch --no-tags --depth=50 origin main
git checkout --quiet --force origin/main
SHA=$(git rev-parse HEAD)
SHORT_SHA="${SHA:0:7}"
echo "  sha: $SHA"
echo "  short: $SHORT_SHA"

echo ""
echo "=== Building web images with live data ==="
./scripts/hermes/build-web-live.sh "$SHA"

# shellcheck disable=SC1090
TAG_FILE="/tmp/gustale-web-live-tag.env"
source "$TAG_FILE"
: "${IMAGE_RECIPES:?build-web-live.sh did not write IMAGE_RECIPES}"
: "${IMAGE_GEO:?build-web-live.sh did not write IMAGE_GEO}"

if [ "$DEPLOY" = "0" ]; then
  echo ""
  echo "=== Build OK; --deploy not set, skipping container restart ==="
  echo "  images: $IMAGE_RECIPES, $IMAGE_GEO"
  echo "  next scheduled rebuild: see gustale-rebuild-web.timer"
  exit 0
fi

echo ""
echo "=== Pulling new web images ==="
docker pull "$IMAGE_RECIPES"
docker pull "$IMAGE_GEO"

deploy_container() {
  local NAME="$1"
  local IMAGE="$2"
  local HOST_PORT="$3"
  local CONTAINER_PORT="${4:-$3}"
  echo "  redeploying $NAME from $IMAGE"
  docker stop "$NAME" 2>/dev/null || true
  docker rm   "$NAME" 2>/dev/null || true
  docker run -d --name "$NAME" --restart unless-stopped \
    -p "${HOST_PORT}:${CONTAINER_PORT}" \
    "$IMAGE"
}

deploy_container "gustale-web-recipes" "$IMAGE_RECIPES" 4001 4001
deploy_container "gustale-web-geo"     "$IMAGE_GEO"     4002 4001

echo ""
echo "=== Waiting 10s for healthcheck ==="
sleep 10
for NAME in gustale-web-recipes gustale-web-geo; do
  STATUS=$(docker inspect --format='{{.State.Status}} {{if .State.Health}}{{.State.Health.Status}}{{end}}' "$NAME" 2>/dev/null || echo "MISSING")
  echo "  $NAME: $STATUS"
done

echo ""
echo "=== Done ==="
echo "  Web images rebuilt + redeployed from $SHORT_SHA"
