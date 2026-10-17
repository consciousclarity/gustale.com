#!/usr/bin/env bash
# scripts/hermes/rebuild-web-live.sh
#
# Periodic rebuild + redeploy of the Gustale web images with live data.
# Designed to be run from the systemd timer `gustale-rebuild-web.timer`
# (every 30 minutes), OR manually after a content batch.
#
# This script is the source of truth for what the timer does. The timer
# unit file just calls this script; the actual logic is here.
#
# Behaviour:
#   1. Acquire an exclusive flock on $LOCK_FILE. If another run is in
#      progress, exit 0 (the timer will try again in 30 minutes).
#   2. Read the API's current "content version" — the newest dish
#      updatedAt + the total category count.
#   3. If the content version matches the last successful run, exit 0
#      without rebuilding or restarting anything.
#   4. If the content version has changed (or there's no prior state),
#      cd to the build dir (/home/deploy/gustale-build/), fetch +
#      reset to origin/main, build the 2 web images with live data,
#      push to ghcr as live-data-<short-sha>, then pull + restart
#      the web containers.
#   5. Update the state file with the new content version.
#   6. Prune old live-data-* images, keeping the most recent 3.
#
# Args:
#   --force   Ignore the state file; rebuild unconditionally.
#             Useful for "I just merged code; rebuild now".
#
# Env:
#   GUSTALE_API_BASE    Default: https://api.gustale.recipes
#   GUSTALE_BUILD_DIR   Default: /home/deploy/gustale-build
#   GUSTALE_LOCK_FILE   Default: /var/lock/gustale-rebuild.lock
#   GUSTALE_STATE_FILE  Default: /var/lib/gustale-rebuild/state.json
#   GITHUB_TOKEN        Required for `docker login ghcr.io` and `docker push`.
#                       The systemd service loads this from
#                       /home/deploy/gustale-rebuild.env via
#                       EnvironmentFile= in gustale-rebuild-web.service.
#
# Why this design:
#
#   * Always rebuilds from /home/deploy/gustale-build/, NEVER the
#     working folder. The script does `git fetch origin main && git
#     checkout --force origin/main` itself; the working folder is
#     never touched.
#
#   * The `flock` is the only thing that prevents overlapping runs.
#     The previous `ExecStartPre=/usr/bin/test -f /tmp/...lock` was
#     inverted — it returned 0 only when a stale lock existed, so
#     the service would silently fail to start except when an
#     orphaned lock was present.
#
#   * Content-change detection means we don't restart the web
#     containers 48 times a day for no reason. State file is JSON,
#     written atomically (write-temp + rename), read on every run.
#
#   * Pruning old live-data-* images is essential: every rebuild
#     creates a new image, and over a month of rebuilds at 30 min
#     intervals you'd accumulate ~1500 images. We keep the most
#     recent 3, plus whatever's currently in use by the containers.

set -euo pipefail

API_BASE="${GUSTALE_API_BASE:-https://api.gustale.recipes}"
BUILD_DIR="${GUSTALE_BUILD_DIR:-/home/deploy/gustale-build}"
LOCK_FILE="${GUSTALE_LOCK_FILE:-/var/lock/gustale-rebuild.lock}"
STATE_FILE="${GUSTALE_STATE_FILE:-/var/lib/gustale-rebuild/state.json}"
LOG_PREFIX="[gustale-rebuild $(date -u +'%Y-%m-%dT%H:%M:%SZ')]"

FORCE=0
for arg in "$@"; do
  case "$arg" in
    --force) FORCE=1 ;;
    *) echo "$LOG_PREFIX Usage: $0 [--force]" >&2; exit 2 ;;
  esac
done

log() { echo "$LOG_PREFIX $*"; }

# --- Step 1: acquire an exclusive flock (non-blocking) ---
# If another run is in progress, exit 0. The timer will fire again in 30 min.
mkdir -p "$(dirname "$LOCK_FILE")" 2>/dev/null || true
exec 9>"$LOCK_FILE"
if ! flock -n 9; then
  log "another rebuild is in progress (lock held at $LOCK_FILE); exiting"
  exit 0
fi
# From here on, the lock is held. Any exit (normal or otherwise) releases it
# because the FD 9 closes on shell exit.
trap 'flock -u 9' EXIT

log "=== gustale-rebuild-web start ==="
log "  build_dir: $BUILD_DIR"
log "  api_base:  $API_BASE"
log "  state:     $STATE_FILE"
log "  lock:      $LOCK_FILE (held)"
log "  force:     $FORCE"

# --- Step 2: read the API's current content version ---
# We use the public (no-auth) endpoints:
#   - /api/dishes?status=published&limit=1&sort=-updatedAt — newest updatedAt
#   - /api/categories?limit=500 — total count
log ""
log "--- Reading API content version ---"

# Helper: read a JSON field from a string using jq (which is in the
# standard PATH; node is not on this host's user PATH).
read_json() {
  local body="$1"
  local filter="$2"
  printf '%s' "$body" | jq -r "$filter" 2>/dev/null
}

DISHES_BODY=$(curl -fsS --max-time 15 "$API_BASE/api/dishes?status=published&limit=1&sort=-updatedAt" 2>&1) || {
  log "ERROR: failed to fetch newest dish from $API_BASE: $DISHES_BODY"
  exit 1
}
NEWEST_DISH_UPDATED_AT=$(read_json "$DISHES_BODY" '.dishes[0].updatedAt // ""')
NEWEST_DISH_SLUG=$(read_json "$DISHES_BODY" '.dishes[0].slug // ""')
[ -n "$NEWEST_DISH_UPDATED_AT" ] || {
  log "ERROR: API returned no dishes (dishes.0.updatedAt is empty)"
  exit 1
}
log "  newest dish: $NEWEST_DISH_SLUG @ $NEWEST_DISH_UPDATED_AT"

CATEGORIES_BODY=$(curl -fsS --max-time 15 "$API_BASE/api/categories?limit=500" 2>&1) || {
  log "ERROR: failed to fetch categories from $API_BASE: $CATEGORIES_BODY"
  exit 1
}
CATEGORY_COUNT=$(read_json "$CATEGORIES_BODY" '.categories | length')
[ -n "$CATEGORY_COUNT" ] && [ "$CATEGORY_COUNT" -gt 0 ] 2>/dev/null || {
  log "ERROR: API returned no categories (length: $CATEGORY_COUNT)"
  exit 1
}
log "  category count: $CATEGORY_COUNT"

CURRENT_VERSION="$NEWEST_DISH_UPDATED_AT|categories=$CATEGORY_COUNT"

# --- Step 3: compare to last successful run ---
mkdir -p "$(dirname "$STATE_FILE")" 2>/dev/null || true
PREV_VERSION=""
PREV_BUILD_SHA=""
if [ -f "$STATE_FILE" ] && [ "$FORCE" = "0" ]; then
  PREV_VERSION=$(jq -r '.contentVersion // ""' <"$STATE_FILE" 2>/dev/null || echo "")
  PREV_BUILD_SHA=$(jq -r '.buildSha // ""' <"$STATE_FILE" 2>/dev/null || echo "")
  log "  previous:  $PREV_VERSION  build=$PREV_BUILD_SHA"
fi

if [ "$FORCE" = "0" ] && [ "$CURRENT_VERSION" = "$PREV_VERSION" ] && [ -n "$PREV_VERSION" ]; then
  log ""
  log "--- No content change detected; exiting without rebuild ---"
  log "  current:  $CURRENT_VERSION"
  log "  previous: $PREV_VERSION"
  log "  next run: see gustale-rebuild-web.timer"
  exit 0
fi

log ""
log "--- Content changed (or first run / forced) — proceeding with rebuild ---"
log "  old version: ${PREV_VERSION:-<none>}"
log "  new version: $CURRENT_VERSION"

# --- Step 4: cd to the build dir, fetch + reset to origin/main ---
cd "$BUILD_DIR"

# Ensure the build dir is a git checkout
if [ ! -d "$BUILD_DIR/.git" ]; then
  log "ERROR: $BUILD_DIR is not a git checkout"
  log "  initialise:  cd $BUILD_DIR && git init && git remote add origin github-gustale:consciousclarity/gustale.com.git && git fetch --depth=50 origin main && git checkout origin/main"
  exit 1
fi

# The deploy SSH user is root; the build dir is owned by hermes when the
# rebuild service runs. Git's safe.directory check would fire if the
# dir is owned by a different user.
git config --global --add safe.directory "$BUILD_DIR" 2>/dev/null || true

log "--- Fetching origin/main into $BUILD_DIR ---"
git fetch --no-tags --depth=50 origin main
git checkout --quiet --force origin/main
BUILD_SHA=$(git rev-parse HEAD)
BUILD_SHORT_SHA="${BUILD_SHA:0:7}"
log "  build sha: $BUILD_SHA"

# --- Step 5: build the web images with live data ---
# The rebuild runs entirely on the VPS and consumes the image locally
# (the next step does `docker run` directly). It does NOT need to push
# the image to ghcr — that's only the deploy job's path. Set
# GUSTALE_NO_PUSH=1 to skip the push, which avoids the need for a
# packages:write token in /home/deploy/gustale-rebuild.env.
#
# We invoke build-web-live.sh from /home/deploy/gustale-rebuild/ (a
# non-git directory) rather than from the build dir, because the
# build dir is a git checkout that this script does `git checkout
# --force origin/main` on — which would reset any local file changes,
# including the script itself. Keeping the script outside the build
# dir avoids that chicken-and-egg.
log ""
log "--- Building web images with live data ---"
GUSTALE_NO_PUSH=1 /home/deploy/gustale-rebuild/build-web-live.sh "$BUILD_SHA"

# shellcheck disable=SC1090
TAG_FILE="/tmp/gustale-web-live-tag.env"
# shellcheck disable=SC1090
source "$TAG_FILE"
: "${IMAGE_RECIPES:?build-web-live.sh did not write IMAGE_RECIPES}"
: "${IMAGE_GEO:?build-web-live.sh did not write IMAGE_GEO}"
log "  $IMAGE_RECIPES"
log "  $IMAGE_GEO"

# --- Step 6: pull + restart the web containers ---
# With GUSTALE_NO_PUSH=1 the image is in the local docker cache; no
# pull is needed. The deploy path (without GUSTALE_NO_PUSH) DOES need
# to pull from ghcr because the images were built on a different host
# (the GHA runner). Here we always build locally, so always use the
# local image.
log ""
log "--- Restarting web containers with locally-built image ---"

deploy_container() {
  local NAME="$1"
  local IMAGE="$2"
  local HOST_PORT="$3"
  local CONTAINER_PORT="${4:-$3}"
  log "  redeploying $NAME from $IMAGE on ${HOST_PORT}:${CONTAINER_PORT}"
  docker stop "$NAME" 2>/dev/null || true
  docker rm   "$NAME" 2>/dev/null || true
  docker run -d --name "$NAME" --restart unless-stopped \
    -p "${HOST_PORT}:${CONTAINER_PORT}" \
    "$IMAGE"
}

deploy_container "gustale-web-recipes" "$IMAGE_RECIPES" 4001 4001
deploy_container "gustale-web-geo"     "$IMAGE_GEO"     4002 4001

# --- Step 7: healthcheck + prune old live-data images ---
log ""
log "--- Waiting 10s for healthcheck ---"
sleep 10
FAILED=0
for NAME in gustale-web-recipes gustale-web-geo; do
  STATUS=$(docker inspect --format='{{.State.Status}} {{if .State.Health}}{{.State.Health.Status}}{{end}}' "$NAME" 2>/dev/null || echo "MISSING")
  log "  $NAME: $STATUS"
  if [ "$STATUS" != "running healthy" ] && [ "$STATUS" != "running  healthy" ]; then
    log "  ERROR: $NAME is not running+healthy"
    FAILED=1
  fi
done
if [ "$FAILED" = "1" ]; then
  log "  aborting state-file update; will retry on next run"
  exit 1
fi

log ""
log "--- Pruning old live-data images, keeping newest 3 ---"
# Get all live-data-* images sorted by creation time (newest first),
# skip the first 3 (keep), and remove the rest. Don't touch images
# that are currently in use by the running containers.
IN_USE=$(docker inspect --format='{{.Image}}' gustale-web-recipes gustale-web-geo 2>/dev/null | sort -u)
PRUNE_LIST=$(docker images --format '{{.Repository}}:{{.Tag}} {{.CreatedAt}}' \
  | (grep -E 'live-data-[0-9a-f]{7,}$' || true) \
  | sort -k2,3 -r \
  | awk '{print $1}' \
  | tail -n +4)
PRUNE_COUNT=0
PRUNE_SKIPPED=0
for IMG in $PRUNE_LIST; do
  if echo "$IN_USE" | grep -qF "$IMG"; then
    PRUNE_SKIPPED=$((PRUNE_SKIPPED + 1))
    continue
  fi
  if docker rmi "$IMG" >/dev/null 2>&1; then
    PRUNE_COUNT=$((PRUNE_COUNT + 1))
  fi
done
log "  pruned:  $PRUNE_COUNT"
log "  skipped (in use): $PRUNE_SKIPPED"

# --- Step 8: write the new state file ---
log ""
log "--- Writing new state file ---"
STATE_TMP="$STATE_FILE.tmp.$$"
cat >"$STATE_TMP" <<EOF
{
  "contentVersion": "$CURRENT_VERSION",
  "buildSha": "$BUILD_SHA",
  "imageRecipes": "$IMAGE_RECIPES",
  "imageGeo": "$IMAGE_GEO",
  "lastRunAt": "$(date -u +'%Y-%m-%dT%H:%M:%SZ')",
  "prunedImages": $PRUNE_COUNT
}
EOF
mv -f "$STATE_TMP" "$STATE_FILE"
log "  $STATE_FILE written"

log ""
log "=== gustale-rebuild-web OK at $BUILD_SHORT_SHA ==="
log "  newest dish: $NEWEST_DISH_SLUG @ $NEWEST_DISH_UPDATED_AT"
log "  category count: $CATEGORY_COUNT"
log "  images: $IMAGE_RECIPES, $IMAGE_GEO"
log "  next run: see gustale-rebuild-web.timer"
