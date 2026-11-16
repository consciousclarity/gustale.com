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
# THE TAG MUST BE DISTINCT PER BUILD.
#
# Both web images are built from the same commit but are DIFFERENT
# builds: PUBLIC_DOMAIN=recipes and PUBLIC_DOMAIN=geo produce different
# static output (different sitemaps, different URLs). They used to share
# one tag, `live-data-<short-sha>`, which was wrong twice over:
#
#   1. It made the two images indistinguishable — the verify step could
#      not tell them apart, and neither could an operator.
#   2. It let a stale build-cache layer masquerade as the new one. On
#      2026-11-02 the recipes image carried a sitemap generated 13
#      minutes before the geo one, from a build that predated the fix.
#      Both containers reported the SAME tag and were "healthy", while
#      gustale.com served 1,531 sitemap URLs and gustale.recipes served
#      1,643.
#
# So each build gets its own tag, suffixed with the domain:
#   live-data-<short-sha>-recipes
#   live-data-<short-sha>-geo
#
# TAG is the shared base; build_one appends the variant's suffix. TAG
# itself must be set here: the deploy checks it against
# live-data-<short-sha>, and `set -u` aborts on the first use if it is
# missing (which is how the 2026-11-04 deploy of cb12bfa failed).
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

# -------------------------------------------------------------------------
# WRITE THE TAG FILE BEFORE THE BUILDS, NOT AFTER.
#
# THE 2026-11-13 FAILURE, AND WHY THE ORDER MATTERS
# ---------------------------------------------------
# The tag file used to be written AFTER both builds succeeded. The geo
# build failed, so the script died before writing it, and the caller's
# `source "$TAG_FILE"` read a ZERO-BYTE file.
#
# An empty file sources successfully and exports NOTHING. The caller's
# next line was:
#
#     : "${IMAGE_RECIPES:?build-web-live.sh did not write IMAGE_RECIPES}"
#
# and THAT is the trap. A `:?` parameter expansion is NOT a command:
#
#   * the ERR trap does not fire on it,
#   * the failure does not set a non-zero exit status,
#   * the script CONTINUES and exits 0.
#
# So the deploy wrote exactly one line to its log --
#
#     DEPLOY_EXIT_CODE=0
#
# -- for a deploy that had swapped the API and then died, leaving the
# web containers on the PREVIOUS SHA. The log said success. The site
# was half-deployed. Verified: run 43429059289, log 19 bytes.
#
# Two fixes, both needed:
#
#   1. Write the tag file BEFORE the builds. The tags are computed from
#      the SHA and are known up front, so there is no reason to wait for
#      the build to advertise them. A failed build then leaves a VALID
#      tag file, and the caller's `source` gets what it expects.
#
#   2. The caller's assertion must be a REAL command, not a `:?`
#      expansion. That is the caller's half of the fix -- see
#      scripts/hermes/rebuild-web-live.sh and the ci.yml deploy step.
#
# This function writes the file. It is called before the builds, and
# again after them (so the file's mtime reflects the build).
# -------------------------------------------------------------------------
write_tag_file() {
  rm -f "$TAG_FILE"
  cat >"$TAG_FILE" <<EOF
TAG=$TAG
TAG_RECIPES=$TAG-recipes
TAG_GEO=$TAG-geo
IMAGE_RECIPES=$REGISTRY/gustale-web-recipes:$TAG-recipes
IMAGE_GEO=$REGISTRY/gustale-web-geo:$TAG-geo
EOF
  # Make the file world-readable so the deploy script (running as root)
  # can `source` it even if the file was originally written by hermes
  # (the rebuild user).
  chmod 0644 "$TAG_FILE"
}

# Write it NOW, before anything can fail.
write_tag_file
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

# ── the live snapshot ───────────────────────────────────────────────────────
#
# WHY A SNAPSHOT AND NOT `BUILD_DATA_SOURCE=live`
# -------------------------------------------------
# `live` points the Astro build straight at the running API, and the build
# then fetches EVERY page's data one request at a time. Measured on the
# 2026-11-16 build: 16,764 x GET /api/dishes/<slug> plus 16,757 x
# .../journey, at a sustained ~48 requests/second for 13+ minutes, while
# the Astro build sat at 25-32% CPU on 4 vCPUs. It was I/O-bound, not
# CPU-bound -- which is why the production build took 27 minutes (and 14
# hours on a contended day) while CI took 2m43s for the IDENTICAL page
# count.
#
# CI is fast only because it uses the mock: the same endpoints, served
# from an inlined JSON file. So the build does not need the network -- it
# needs the DATA in the shape the mock already reads.
#
# So: fetch the live data ONCE, into that shape, and serve it from the
# mock inside the build. Measured: 45.8 seconds and ~46 requests, versus
# ~32,000 requests and ~11 minutes inside the build.
#
# The snapshot is written into the build CONTEXT, so `COPY . .` carries it
# into the image.
SNAPSHOT_REL="apps/web/scripts/live-snapshot.json"
SNAPSHOT_PLACEHOLDER_REL="apps/web/scripts/live-snapshot.placeholder.json"
SNAPSHOT_CACHE_REL="apps/web/scripts/.live-snapshot-cache.json"

fetch_snapshot() {
  local api_base="${1:-http://127.0.0.1:4000}"
  echo ""
  echo "--- fetching the live snapshot from $api_base ---"
  # The fetch writes over the placeholder. The placeholder is committed
  # so the build CONTEXT always has a file at that path (the Dockerfile
  # does `COPY . .`), and the real snapshot is gitignored because it is
  # 7 MB of live data that changes on every build.
  if [ ! -f "$SNAPSHOT_REL" ] && [ -f "$SNAPSHOT_PLACEHOLDER_REL" ]; then
    cp "$SNAPSHOT_PLACEHOLDER_REL" "$SNAPSHOT_REL"
  fi
  # The fetcher is a plain node script; it needs no install because it
  # uses only node built-ins (fetch, fs).
  if ! node apps/web/scripts/fetch-live-snapshot.mjs \
        --api "$api_base" \
        --out "$SNAPSHOT_REL" \
        --cache "$SNAPSHOT_CACHE_REL" \
        --concurrency "${GUSTALE_SNAPSHOT_CONCURRENCY:-24}"; then
    echo "ERROR: the live snapshot could not be fetched -- the build would fall back to the committed CI capture, which is STALE"
    return 1
  fi
  echo "  snapshot: $(wc -c < "$SNAPSHOT_REL") bytes"
}

# The data source for this build. `snapshot` is the default; `live` is the
# old slow path and `mock` is the committed CI capture.
#
# THIS IS SET BEFORE THE SNAPSHOT IS FETCHED, because the fetch only
# happens for `snapshot`.
DATA_SOURCE="${GUSTALE_BUILD_DATA_SOURCE:-snapshot}"

# The snapshot is fetched ONCE, before both builds, so the two images are
# built from the SAME data. (Fetching per image would double the cost
# and could produce two images with different content.)
if [ "$DATA_SOURCE" = "snapshot" ]; then
  fetch_snapshot "${GUSTALE_SNAPSHOT_API_BASE:-http://127.0.0.1:4000}" || exit 1
fi

# Build both web variants.
#
# The data source is `snapshot` by default: the in-container mock serving
# the live snapshot fetched above. That is the same code path CI uses,
# with live data. `live` (fetch straight from the API during the build)
# is kept for a one-off emergency build and is much slower.
#
# PUBLIC_DOMAIN picks the variant.
# --network host is required so the build container can reach
# 127.0.0.1:4000 on the host (default bridge network would route 127.0.0.1
# to the container's own loopback, not the host's). It is also needed for
# the snapshot fetch, which happens on the HOST, before the build.
build_one() {
  local domain="$1"
  local img_name="$2"
  # The per-build tag: the shared TAG plus THIS build's suffix (the third
  # argument). It must match what the tag file below advertises
  # ($TAG-recipes / $TAG-geo), or the deploy looks for an image that was
  # never built.
  local suffix="${3:?build_one needs a tag suffix}"
  local tag="${TAG}-${suffix}"
  local img="${REGISTRY}/${img_name}:${tag}"
  echo ""
  echo "--- building $img (PUBLIC_DOMAIN=$domain, BUILD_DATA_SOURCE=$DATA_SOURCE) ---"
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
  # THE FULL LOG IS KEPT.
  #
  # The build used to be piped through `| tail -10`, which discarded
  # EVERYTHING the Astro build prints -- including the per-page timings.
  # That is why the 2026-11-14 14-hour build could not be diagnosed from
  # the retained logs: the instrumentation needed to answer "where did the
  # time go" was destroyed by the very script that produced it.
  #
  # The full output now goes to a per-run log; the console still shows
  # the tail, but the log keeps everything.
  local build_log
  build_log="$(mktemp "${TMPDIR:-/tmp}/gustale-web-build-${domain}-XXXXXX.log")"
  echo "  the full build log: $build_log"
  #
  # PIPESTATUS[0] is the docker build's exit code; `tail` is the LAST
  # command in the pipe, so $? would be tail's. A pipeline's exit status
  # is the LAST command's -- so the build's status must be captured from
  # PIPESTATUS, or a failed build would look like a success.
  #
  # AND `set -e` MUST BE DISABLED AROUND THE PIPELINE. The script runs
  # with `set -euo pipefail`, and with pipefail a pipeline whose FIRST
  # command fails aborts the script AT THE PIPELINE -- before PIPESTATUS
  # can be read. Without this, a failed build would abort the script
  # with no explanation and no log tail.
  #
  # Proven by scripts/test-parallel-build-wait.sh (case 4).
  set +e
  docker build \
    "${cache_args[@]}" \
    --network host \
    --build-arg PUBLIC_DOMAIN="$domain" \
    --build-arg BUILD_DATA_SOURCE="$DATA_SOURCE" \
    --build-arg PUBLIC_API_BASE=http://127.0.0.1:4000 \
    -f apps/web/Dockerfile \
    -t "$img" \
    . 2>&1 | tee "$build_log" | tail -10
  local build_rc="${PIPESTATUS[0]}"
  set -e
  if [ "$build_rc" != "0" ]; then
    echo "ERROR: the $domain build FAILED (rc=$build_rc). The last 40 lines of $build_log:"
    tail -40 "$build_log"
    return "$build_rc"
  fi
  if [ "$NO_PUSH" != "1" ]; then
    echo "  pushing $img to ghcr..."
    docker push "$img" | tail -5
  fi
}

# Each build gets a DISTINCT tag. The suffix is per-variant, so the two
# images can never share a tag — and a cached layer from one can never be
# served for the other.
#
# THE TWO BUILDS RUN IN PARALLEL.
#
# They used to run one after the other, so the wall-clock was the SUM of
# both. Measured on the 2026-11-16 run: recipes 14m10s, then geo 12m38s
# — 27m06s total, for two images that share every layer except the last
# Astro build. CI runs them in parallel via a matrix, which is why CI's
# two build jobs are 2m43s and 2m16s rather than their sum.
#
# In parallel the total is the SLOWER of the two, not the sum. The two
# builds share the dependency-install and `COPY . .` layers, so with the
# buildx cache the second one is nearly free.
#
# The exit code of EACH build is captured separately: `wait` on a PID
# returns that child's status. A failure in one must fail the script --
# it must not be masked by the other succeeding.
build_one recipes gustale-web-recipes recipes &
RECIPES_PID=$!
build_one geo     gustale-web-geo     geo &
GEO_PID=$!

# `set -e` is active, so a `wait` that returns non-zero would ABORT the
# script at that line -- before the handler below could report WHICH
# build broke. `set +e` around the two waits disables that abort, and
# each status is read on the line immediately after its own `wait`.
#
# NOTE: this cannot be done in a command substitution. A subshell cannot
# `wait` for a PID that is not its own child, so `$( wait $PID; echo $? )`
# returns -1 and loses the real status. The parent must do the waiting.
#
# Proven by scripts/test-parallel-build-wait.sh (4 cases: both succeed,
# one fails, both fail, and the PIPESTATUS of `tee | tail`).
set +e
wait "$RECIPES_PID"
RECIPES_RC=$?
wait "$GEO_PID"
GEO_RC=$?
set -e

if [ "$RECIPES_RC" != "0" ] || [ "$GEO_RC" != "0" ]; then
  echo ""
  echo "ERROR: a web image build FAILED -- recipes rc=$RECIPES_RC, geo rc=$GEO_RC"
  echo "  the build logs are in ${TMPDIR:-/tmp}/gustale-web-build-*.log"
  # The exit code must be the failing one, so a caller sees WHICH build
  # broke rather than a bare 1.
  [ "$RECIPES_RC" != "0" ] && exit "$RECIPES_RC"
  exit "$GEO_RC"
fi

# Emit the deploy variables. The file was ALREADY written before the
# builds (see write_tag_file above and the note on the 2026-11-13
# failure). Rewrite it now so its mtime reflects the build, and so the
# values are provably the ones the builds used.
write_tag_file
cat "$TAG_FILE"

echo ""
echo "=== DONE ==="
if [ "$NO_PUSH" = "1" ]; then
  echo "  images built (local only): $REGISTRY/gustale-web-recipes:$TAG-recipes, $REGISTRY/gustale-web-geo:$TAG-geo"
else
  echo "  images pushed: $REGISTRY/gustale-web-recipes:$TAG-recipes, $REGISTRY/gustale-web-geo:$TAG-geo"
fi
echo "  tag file:      $TAG_FILE"
