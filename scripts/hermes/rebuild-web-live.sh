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
#   - /api/dishes?status=published&limit=100&offset=0..N — paginated, max
#     the API's `updatedAt` across pages (server-side sort is unreliable).
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

# Page through all published dishes and find the max(updatedAt). The
# public list endpoint does NOT honor sort/order params consistently
# (verified 2026-10-17), so we paginate and sort client-side. API caps
# limit at 100, so walk offset=0,100,200,... up to ~300 dishes.
NEWEST_DISH_UPDATED_AT=""
NEWEST_DISH_SLUG=""
offset=0
while :; do
  PAGE=$(curl -fsS --max-time 15 "$API_BASE/api/dishes?status=published&limit=100&offset=$offset" 2>&1) || {
    log "ERROR: failed to fetch dishes (offset=$offset) from $API_BASE: $PAGE"
    exit 1
  }
  page_count=$(read_json "$PAGE" '.dishes | length')
  [ -n "$page_count" ] && [ "$page_count" -gt 0 ] 2>/dev/null || {
    log "ERROR: API returned no dishes (offset=$offset, length: $page_count)"
    exit 1
  }
  # Update the running max from this page.
  page_max=$(read_json "$PAGE" '[.dishes[].updatedAt] | max // ""')
  page_max_slug=$(read_json "$PAGE" "[.dishes[] | select(.updatedAt == \"$page_max\")] | first | .slug // \"\"")
  if [ -n "$page_max" ] && { [ -z "$NEWEST_DISH_UPDATED_AT" ] || [ "$page_max" \> "$NEWEST_DISH_UPDATED_AT" ]; }; then
    NEWEST_DISH_UPDATED_AT="$page_max"
    NEWEST_DISH_SLUG="$page_max_slug"
  fi
  log "  page offset=$offset: $page_count dishes, max updatedAt on page = $page_max"
  # Stop if the page wasn't full (we've reached the end).
  if [ "$page_count" -lt 100 ]; then
    break
  fi
  offset=$((offset + 100))
  # Safety cap: 5 pages = 500 dishes, well above the current ~130 published.
  if [ "$offset" -gt 400 ]; then
    log "WARN: hit 5-page cap, stopping pagination"
    break
  fi
done
[ -n "$NEWEST_DISH_UPDATED_AT" ] || {
  log "ERROR: API returned no dishes across all pages"
  exit 1
}
log "  newest dish overall: $NEWEST_DISH_SLUG @ $NEWEST_DISH_UPDATED_AT"

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

# The rebuild is needed when EITHER the content changed OR the code
# changed.
#
# The code check was MISSING, and that is a real bug with a real
# consequence: a commit that changes the BUILD (a sitemap fix, a
# template change, anything in the web app) was never deployed by the
# timer, because the content version had not changed. The timer
# happily reported "No content change detected; exiting without
# rebuild" for a commit that was waiting to be deployed.
#
# On 2026-11-02 that is exactly how gustale.recipes kept serving a
# stale sitemap: the fix was merged, the timer ran, and it declined to
# rebuild because no dish had changed.
#
# The build sha is known only AFTER the fetch (step 4), so the
# comparison happens after the checkout, not here.

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

# THE FETCH IS ANONYMOUS.
#
# The repository is PUBLIC, so a fetch needs no credential at all. It used
# to need one: the remote was the SSH alias `github-gustale:`, which
# authenticates with a deploy key, and the `gh` credential helper supplied
# the personal access token for any https:// remote.
#
# The PAT was in the timer's EnvironmentFile (/home/deploy/gustale-rebuild.env)
# for no reason at all: the script only mentions GITHUB_TOKEN in a comment
# and never runs `docker login` or `docker push` -- it builds the web images
# LOCALLY and tags them, and the deploy job on CI is what pushes to ghcr.
#
# So the fetch now uses an anonymous HTTPS URL, and the credential helper is
# disabled for it, so no token is involved even if one is lying around in
# the environment:
#
#   -c credential.helper=   -> git does not consult ~/.gitconfig's helper
#   GIT_TERMINAL_PROMPT=0   -> git never asks for a password on stdin
#   GIT_ASKPASS=            -> git never launches an askpass program
#
# A public fetch that needs a secret is a fetch waiting to break when the
# secret is rotated.
# GUSTALE_REBUILD_ORIGIN_URL exists for the fail-closed test, which
# drives this script against a throwaway local origin. Production
# never sets it.
ANON_URL="${GUSTALE_REBUILD_ORIGIN_URL:-https://github.com/consciousclarity/gustale.com.git}"
if ! git remote get-url origin 2>/dev/null | grep -qx "$ANON_URL"; then
  log "  switching origin to the anonymous HTTPS URL"
  git remote set-url origin "$ANON_URL"
fi

log "--- Fetching origin/main into $BUILD_DIR (anonymous) ---"
#
# FAIL CLOSED. A fetch that fails must ABORT the run.
#
# This is not defensive padding. On 2026-11-03 the fetch in this dir
# failed (the dir was shared with the root CI deploy, which left
# root-owned object dirs the timer could not write). A failed fetch does
# NOT update origin/main -- it FREEZES the ref at its old value. The
# `git checkout --force origin/main` on the next line then SUCCEEDED
# against that stale ref and rolled the build dir BACKWARDS:
#
#   86c0444 HEAD@{2026-11-03 12:27:19}: checkout: moving from
#               60021a77748d6c69a8506f91213d9bdefc79f7b2 to origin/main
#
# So the timer was silently deploying an old commit every 30 minutes.
# The fetch failing did not stop it -- it made it worse, because the
# script cannot tell "up to date" from "could not be updated".
#
# `set -e` alone is not enough: `git fetch` exits non-zero on failure,
# but we must make the ABORT explicit and loud, because the whole point
# is that a failed fetch must never be followed by a checkout.
if ! GIT_TERMINAL_PROMPT=0 GIT_ASKPASS=/bin/true \
     git -c credential.helper= fetch --no-tags --depth=50 origin main; then
  log "ERROR: git fetch failed — ABORTING without checkout or build."
  log "  The origin/main ref is UNCHANGED and may be STALE."
  log "  Continuing would deploy a stale commit. Refusing."
  exit 1
fi
log "  fetch OK"

# The commit the fetch actually brought in. Read it from origin/main
# (the ref the fetch updated) BEFORE the checkout, so the ancestry
# guard compares against the fetched commit and not against whatever
# the checkout will later produce.
FETCHED_SHA=$(git rev-parse origin/main 2>/dev/null || echo "")
if [ -z "$FETCHED_SHA" ]; then
  log "ERROR: the fetch reported success but origin/main does not resolve to a commit."
  log "  Refusing to check out or build. ABORTING."
  exit 1
fi
log "  fetched sha: $FETCHED_SHA"

# FAIL CLOSED, part 2: the fetched ref must be a DESCENDANT of the
# commit that is currently deployed.
#
# A ref that is not a descendant of the deployed SHA means we are about
# to roll the deployment backwards (a force-push, a revert, a branch
# reset, or a ref that moved to an unrelated history). The timer must
# not deploy that: it would replace a working site with an old one.
#
# The deployed SHA comes from the state file (what the last successful
# run deployed) and falls back to the image tag the live containers
# are running, so the guard still applies on a first run.
DEPLOYED_SHA="${PREV_BUILD_SHA:-}"
if [ -z "$DEPLOYED_SHA" ]; then
  # No state file yet. Fall back to the tag of the running container.
  DEPLOYED_SHA=$(docker inspect --format '{{index .Config.Image "ghcr.io/consciousclarity/gustale.com/gustale-web-recipes"}}' \
    gustale-web-recipes 2>/dev/null | sed -n 's/.*live-data-\([0-9a-f]\{7,40\}\)$/\1/p' || true)
  [ -n "$DEPLOYED_SHA" ] && DEPLOYED_SHA=$(git rev-parse "$DEPLOYED_SHA" 2>/dev/null || echo "$DEPLOYED_SHA")
fi

if [ -n "$DEPLOYED_SHA" ] && git cat-file -e "$DEPLOYED_SHA^{commit}" 2>/dev/null; then
  if ! git merge-base --is-ancestor "$DEPLOYED_SHA" "$FETCHED_SHA"; then
    log "ERROR: the fetched commit $FETCHED_SHA is NOT a descendant of the deployed $DEPLOYED_SHA."
    log "  This would roll the deployment BACKWARDS. Refusing to check out or build."
    exit 1
  fi
  log "  ancestry OK: $DEPLOYED_SHA is an ancestor of $FETCHED_SHA"
fi

git checkout --quiet --force origin/main
BUILD_SHA=$(git rev-parse HEAD)
BUILD_SHORT_SHA="${BUILD_SHA:0:7}"
log "  build sha: $BUILD_SHA"

# Now that the sha is known, compare it to the last successful build.
#
# If the code changed, the rebuild MUST happen even when no content
# changed -- otherwise a merged build fix never reaches production.
if [ "$FORCE" = "0" ] \
   && [ "$CURRENT_VERSION" = "$PREV_VERSION" ] \
   && [ -n "$PREV_VERSION" ] \
   && [ "$BUILD_SHA" = "$PREV_BUILD_SHA" ]; then
  log ""
  log "--- No content AND no code change detected; exiting without rebuild ---"
  log "  content:  $CURRENT_VERSION"
  log "  previous: $PREV_VERSION"
  log "  build:    $BUILD_SHA (unchanged)"
  log "  next run: see gustale-rebuild-web.timer"
  exit 0
fi

if [ "$CURRENT_VERSION" = "$PREV_VERSION" ] && [ -n "$PREV_VERSION" ]; then
  log "  the content is unchanged, but the BUILD changed: $PREV_BUILD_SHA -> $BUILD_SHA"
  log "  rebuilding anyway, because a build fix must reach production"
fi

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
# A per-run temp file, not a fixed /tmp path. A fixed path is a single
# point of failure: concurrent runs collide, and a leftover file owned by
# another user makes the final `rm` fail, which under `set -e` aborts the
# script BEFORE the deploy step even though the images built fine.
#
# build-web-live.sh already honours GUSTALE_WEB_LIVE_TAG_FILE, so the
# path is created here and passed down.
TAG_FILE="$(mktemp /tmp/gustale-web-live-tag.XXXXXX.env)"
# shellcheck disable=SC1090
cleanup_tag_file() { rm -f "$TAG_FILE"; }
trap cleanup_tag_file EXIT

GUSTALE_NO_PUSH=1 \
  GUSTALE_WEB_LIVE_TAG_FILE="$TAG_FILE" \
  /home/deploy/gustale-rebuild/build-web-live.sh "$BUILD_SHA"

# shellcheck disable=SC1090
source "$TAG_FILE"
: "${IMAGE_RECIPES:?build-web-live.sh did not write IMAGE_RECIPES}"
: "${IMAGE_GEO:?build-web-live.sh did not write IMAGE_GEO}"
log "  $IMAGE_RECIPES"
log "  $IMAGE_GEO"

# The two images MUST have distinct tags. They are different builds
# (different PUBLIC_DOMAIN); sharing one tag let a stale build-cache
# layer masquerade as a fresh one, which is how gustale.recipes ended
# up serving 1,643 sitemap URLs while gustale.com served 1,531 -- on
# the same commit, with both containers "healthy".
if [ "$IMAGE_RECIPES" = "$IMAGE_GEO" ]; then
  log "ERROR: the two web images share a tag: $IMAGE_RECIPES"
  exit 1
fi

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
# --- Step 9: the sitemap check on BOTH domains ---
# The rebuild is the thing that most often leaves the two sites out of
# step, so it must verify BOTH. A single-domain check would have called
# the 2026-11-02 state a clean rebuild.
log ""
log "--- Checking both domains' sitemaps ---"
# The check script is installed alongside the rebuild scripts on the
# VPS. It is also looked up relative to this script, so the rebuild
# works when run from a checkout.
CHECK_SCRIPT="/home/deploy/gustale-rebuild/scripts/check-live-sitemaps.sh"
if [ ! -f "$CHECK_SCRIPT" ]; then
  CHECK_SCRIPT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/check-live-sitemaps.sh"
fi
if [ ! -f "$CHECK_SCRIPT" ]; then
  log "ERROR: the sitemap check script is missing ($CHECK_SCRIPT) -- the rebuild cannot verify the two sites"
  exit 1
fi
if ! bash "$CHECK_SCRIPT" 1531; then
  log "ERROR: the sitemap check failed -- one of the two sites is serving a stale build"
  exit 1
fi

log ""
log "=== gustale-rebuild-web OK at $BUILD_SHORT_SHA ==="
log "  newest dish: $NEWEST_DISH_SLUG @ $NEWEST_DISH_UPDATED_AT"
log "  category count: $CATEGORY_COUNT"
log "  images: $IMAGE_RECIPES, $IMAGE_GEO"
log "  next run: see gustale-rebuild-web.timer"
