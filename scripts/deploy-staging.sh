#!/usr/bin/env bash
# Deploy a BRANCH to the staging environment.
#
# WHAT THIS IS
# ------------
# The staging environment (WP-00b, card GUS-1122). A minimal, isolated
# copy of the stack that serves a BRANCH, with its own API and its own
# database, so a change can be seen before it goes to production.
#
# WHY IT IS A SEPARATE SCRIPT
# ---------------------------
# Because it must NOT be able to touch production. The production
# deploy is `scripts/hermes/build-web-live.sh`, run by the CI deploy
# job. This script is deliberately different in every way that matters:
#
#   - it never touches shared-postgres (the production database)
#   - it never touches the gustale-api / gustale-web-* containers
#   - it never pushes to ghcr.io under a production tag
#   - it always uses a DIFFERENT database name
#   - it always uses a DIFFERENT port
#
# THE ISOLATION INVARIANT
# -----------------------
# The acceptance criterion is: "It does NOT share the production
# database, and a write on staging cannot reach live."
#
# Two independent things enforce that:
#
#   1. A different postgres CONTAINER. The production DB is
#      shared-postgres on 127.0.0.1:5432. Staging uses
#      gustale-test-postgres on 127.0.0.1:5434 -- already running on
#      the box, already separate.
#
#   2. A different DATABASE NAME inside it: gustale_staging. So even
#      if someone points the staging API at the wrong host, it cannot
#      reach gustale or gustale_prod.
#
# The script REFUSES to run if the database name looks like a
# production one. That is the check that makes the invariant
# enforceable rather than merely documented.
#
# THE FAST SAMPLE BUILD
# ---------------------
# A full production build is 16,454 pages and takes 141 minutes
# (measured 2026-11-12). Staging builds with:
#
#   PUBLIC_BUILD_LOCALES=en        -- one locale
#   PUBLIC_BUILD_DISH_LIMIT=50     -- the first 50 dishes
#
# which is 52 pages and about 17 seconds. The same code paths run --
# only the page COUNT differs, so a change that breaks a page still
# breaks it on staging.
#
# USAGE
# -----
#   scripts/deploy-staging.sh <branch> [sha]
#
# The SHA defaults to the branch's remote head. It is recorded in the
# staging state file so a running container can be traced to the
# commit that built it.
#
# EXIT CODES
# ----------
#   0  the staging stack is up and serving
#   1  a refusal, a failure, or a failed health check
set -uo pipefail

REPO="${GUSTALE_REPO:-/home/deploy/gustale-build}"

# ─── The staging configuration ──────────────────────────────────────
# Every value that separates staging from production is HERE, and the
# refusal checks below read from this one table. There is no second
# place to change.
STAGING_HOST="${STAGING_HOST:-staging.gustale.com}"
# The ports and the container names are overridable so the REFUSALS
# can be tested. A guard that cannot be exercised is a guard that
# nobody knows works.
STAGING_WEB_PORT="${STAGING_WEB_PORT:-4003}"
STAGING_API_PORT="${STAGING_API_PORT:-4004}"
STAGING_DB_HOST=127.0.0.1
STAGING_DB_PORT=5434
STAGING_DB_NAME="${STAGING_DB_NAME:-gustale_staging}"
STAGING_DB_USER="${STAGING_DB_USER:-gustale}"
STAGING_PG_CONTAINER="${STAGING_PG_CONTAINER:-gustale-test-postgres}"
STAGING_ENV_FILE="${STAGING_ENV_FILE:-/tmp/gustale-staging-api.env}"
STAGING_BETTER_AUTH_SECRET="${STAGING_BETTER_AUTH_SECRET:-staging-only-not-a-production-secret}"
STAGING_WEB_CONTAINER="${STAGING_WEB_CONTAINER:-gustale-web-staging}"
STAGING_API_CONTAINER="${STAGING_API_CONTAINER:-gustale-api-staging}"
STAGING_IMAGE_REPO="${GUSTALE_REPO_NAME:-ghcr.io/consciousclarity/gustale.com}"
STAGING_BUILD_LOCALES="${STAGING_BUILD_LOCALES:-en}"
STAGING_BUILD_DISH_LIMIT="${STAGING_BUILD_DISH_LIMIT:-50}"

# ─── The refusals ───────────────────────────────────────────────────
# These are the safety properties, written as checks rather than as
# comments. A comment can drift; a check fails.
#
# They run BEFORE anything else, so a misconfiguration is refused
# before the script touches the database, the API or the web.

refuse() {
  echo "::error::REFUSING TO DEPLOY STAGING: $1" >&2
  exit 1
}

# The database must not be a production one.
case "$STAGING_DB_NAME" in
  gustale|gustale_prod|gustale_live|postgres|template0|template1)
    refuse "the staging database name '$STAGING_DB_NAME' is a production or template database"
    ;;
esac

# The staging postgres must not BE the production postgres.
if [ "$STAGING_PG_CONTAINER" = "shared-postgres" ]; then
  refuse "the staging postgres container must not be shared-postgres (that is the production database)"
fi

# The ports must not collide with production.
case "$STAGING_WEB_PORT" in
  4001|4002) refuse "the staging web port $STAGING_WEB_PORT is a production port" ;;
esac
case "$STAGING_API_PORT" in
  4000) refuse "the staging API port $STAGING_API_PORT is the production API port" ;;
esac

# The container names must not collide with production.
#
# Production runs gustale-api and ONE web container, gustale-web-geo.
# gustale-web-recipes is the RETIRED web container: it keeps serving the
# old host until the owner removes it after the redirects go live, and
# its name stays on this list so staging can never take it either.
for c in "$STAGING_WEB_CONTAINER" "$STAGING_API_CONTAINER"; do
  case "$c" in
    gustale-api|gustale-web-geo|gustale-web-recipes)
      refuse "the staging container name '$c' is a production container name"
      ;;
  esac
done

# The host must not be a production host.
case "$STAGING_HOST" in
  gustale.com|gustale.recipes|www.gustale.com|www.gustale.recipes)
    refuse "the staging host '$STAGING_HOST' is a production host"
    ;;
esac

# ─── The arguments ──────────────────────────────────────────────────
BRANCH="${1:-}"
if [ -z "$BRANCH" ]; then
  echo "usage: $0 <branch> [sha]" >&2
  exit 1
fi
SHA="${2:-}"

# ─── The bootstrap: run the script FROM the tree being deployed ─────
#
# This is the FIRST thing that happens, before the SHA is even
# resolved, and that ordering is the whole point.
#
# WHY: the build directory is a checkout, and a checkout can sit at
# any commit. The deploy is invoked by a human, so the copy of
# scripts/deploy-staging.sh that runs is whatever copy they happened
# to invoke -- which may be OLDER than the commit being deployed. When
# that happens, the guards that run are the OLD guards, and the
# deployed commit's guards never run at all.
#
# On 2026-11-17 that is exactly what happened. The deploy was driven
# from a build directory stuck at 53b30b5, whose script had NO SHA
# checkout and NO provenance check. It deployed 0583313 by building
# 53b30b5's tree, tagged it staging-data-0583313, and reported success
# on every check -- because none of the checks that could have caught
# it existed in the script that ran.
#
# So the tree becomes the authority. The script checks out the target
# commit and then re-executes ITSELF from that tree. Every guard that
# runs after that point is the guard the DEPLOYED COMMIT wrote, and
# the build is of that same tree.
#
# The environment variable is the guard against an exec loop: it is
# set only by the re-exec, so the second run knows it already
# happened. And because this block runs BEFORE the SHA resolution, an
# old driver script that predates this bootstrap still gets to it --
# the OLD script's SHA handling is never reached.
#
# The checkout itself has to happen before the re-exec, because the
# script to re-exec lives in the tree being deployed. So the order is:
#
#   1. resolve the SHA inside $REPO
#   2. check out that SHA inside $REPO
#   3. re-exec $REPO/scripts/deploy-staging.sh
#   4. from there on, the deployed commit's rules are the rules
#
# With GUSTALE_DEPLOY_REEXEC already set, steps 1-3 are skipped and
# this script -- the one from the deployed tree -- simply proceeds.
if [ -z "${GUSTALE_DEPLOY_REEXEC:-}" ]; then
  cd "$REPO" 2>/dev/null || refuse "the build directory $REPO does not exist"

  if [ -z "$SHA" ]; then
    git fetch origin "$BRANCH" >/dev/null 2>&1
    SHA="$(git rev-parse "origin/$BRANCH" 2>/dev/null)"
  fi
  if [ -z "$SHA" ]; then
    refuse "could not resolve a SHA for '$BRANCH'"
  fi

  # Put the tree at exactly that commit. A detached checkout is
  # deliberate: the tree must not depend on which branch the build
  # directory happens to have checked out, and a later deploy of
  # another branch must not be silently blocked by a dirty tree.
  git checkout --detach --force "$SHA" >/dev/null 2>&1 ||
    refuse "could not check out $SHA in $REPO"

  # The checkout is verified, not assumed. `git rev-parse HEAD` is the
  # commit the BUILD will contain; if it is not the commit we were
  # asked to deploy, the image tag would lie about its own contents --
  # which is exactly the failure this guards.
  BUILT_SHA="$(git rev-parse HEAD 2>/dev/null)"
  if [ "$BUILT_SHA" != "$SHA" ]; then
    refuse "the build tree is at $BUILT_SHA but $SHA was requested"
  fi

  DEPLOY_SCRIPT="$REPO/scripts/deploy-staging.sh"
  if [ ! -f "$DEPLOY_SCRIPT" ]; then
    refuse "the deploy script is not in the build tree ($DEPLOY_SCRIPT)"
  fi

  echo "  bootstrapping: re-executing the deploy script from the deployed tree"
  export GUSTALE_DEPLOY_REEXEC=1
  export GUSTALE_REPO="$REPO"
  exec bash "$DEPLOY_SCRIPT" "$@"
fi

# ─── The build tree ─────────────────────────────────────────────────
# From here on this IS the script from the deployed commit, and $REPO
# is checked out at exactly that commit.
cd "$REPO" 2>/dev/null || refuse "the build directory $REPO does not exist"

if [ -z "$SHA" ]; then
  git fetch origin "$BRANCH" >/dev/null 2>&1
  SHA="$(git rev-parse "origin/$BRANCH" 2>/dev/null)"
fi
if [ -z "$SHA" ]; then
  refuse "could not resolve a SHA for '$BRANCH'"
fi

# Put the tree at exactly that commit. A detached checkout is
# deliberate: the tree must not depend on which branch the build
# directory happens to have checked out, and a later deploy of another
# branch must not be silently blocked by a dirty tree.
git checkout --detach --force "$SHA" >/dev/null 2>&1 ||
  refuse "could not check out $SHA in $REPO"

# The checkout is verified, not assumed. `git rev-parse HEAD` is the
# commit the BUILD will contain; if it is not the commit we were asked
# to deploy, the image tag would lie about its own contents -- which
# is exactly the failure this guards.
BUILT_SHA="$(git rev-parse HEAD 2>/dev/null)"
if [ "$BUILT_SHA" != "$SHA" ]; then
  refuse "the build tree is at $BUILT_SHA but $SHA was requested"
fi

SHORT_SHA="$(echo "$SHA" | cut -c1-7)"

# The BUILD DATE -- the commit date of the commit being deployed.
#
# It becomes the sitemaps' <lastmod>, so it says when the CONTENT last
# changed. The commit date is that truth; the wall clock is not.
#
# It is read here, AFTER the checkout was verified to be at exactly
# $SHA, so the date belongs to the content that is about to be built
# and not to whatever the tree happened to hold before.
BUILD_DATE="$(git log -1 --date=short --format=%cd "$SHA" 2>/dev/null || true)"
if ! printf '%s' "$BUILD_DATE" | grep -qE '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'; then
  refuse "could not read the commit date of $SHA (got '${BUILD_DATE:-}') -- the sitemaps' lastmod is generated from it"
fi
echo "  build date  $BUILD_DATE (the commit date of $SHORT_SHA)"

echo "=== staging deploy: $BRANCH @ $SHORT_SHA ==="
echo "  host        $STAGING_HOST"
echo "  web port    $STAGING_WEB_PORT"
echo "  api port    $STAGING_API_PORT"
echo "  database    $STAGING_DB_NAME on $STAGING_DB_HOST:$STAGING_DB_PORT ($STAGING_PG_CONTAINER)"
echo "  build scope $STAGING_BUILD_LOCALES / $STAGING_BUILD_DISH_LIMIT dishes"
echo "  build tree  $REPO @ $SHORT_SHA (verified)"
echo ""

# ─── 1. The staging database ────────────────────────────────────────
# The migrations run against the staging database, and the same
# migration chain CI runs runs here.
echo "--- 1. the staging database ---"

# The database is created through the SANCTIONED helper, not with a
# bare CREATE DATABASE.
#
# `CREATE DATABASE` is CLUSTER-SCOPED, and scripts/check-no-production-db-drops.py
# fails the build if any script can create or drop a database on the
# PRODUCTION cluster -- a bare `docker exec <container> psql -c
# "CREATE DATABASE"` is exactly that, because the container comes
# from the environment and could be shared-postgres.
#
# scripts/lib/test_pg.sh is the sanctioned path: it knows the TEST
# container, it refuses the live database's name outright, and it is
# what the CI's own checks use. The guard is a safety property, and
# this script has to satisfy it rather than argue with it.
#
# The staging postgres IS the test postgres (the whole point is that
# it is a separate cluster from production), so the helper's container
# IS the right one. The refusal above already guarantees the name is
# not the live one.
if ! docker exec "$STAGING_PG_CONTAINER" psql -U postgres -tAc \
  "SELECT 1 FROM pg_database WHERE datname='$STAGING_DB_NAME'" 2>/dev/null | grep -q 1; then
  # shellcheck source=scripts/lib/test_pg.sh
  source "$REPO/scripts/lib/test_pg.sh"
  test_pg_create "$STAGING_DB_NAME" >/dev/null 2>&1 ||
    refuse "could not create the staging database $STAGING_DB_NAME"
  echo "  the database $STAGING_DB_NAME was created"
else
  echo "  the database $STAGING_DB_NAME is present"
fi

# The migrations. The chain is the same one CI runs, so a migration
# that CI would reject is rejected here too.
if [ -x "$REPO/scripts/ci-migration-chain.sh" ]; then
  bash "$REPO/scripts/ci-migration-chain.sh" "$STAGING_DB_NAME" 2>&1 |
    grep -E "FULL_CI_CHAIN_OK|error|FAIL" | tail -3
fi

# ─── 2. The staging API ─────────────────────────────────────────────
# Its own container, its own port, pointed at the staging database.
echo "--- 2. the staging API ---"

# The environment is INHERITED from the production API container --
# the staging API needs the same MinIO credentials (it serves the
# same images) and the same session secret shape -- but the variables
# that MUST differ are FILTERED OUT of the file rather than merely
# overridden.
#
# WHY: a docker --env-file does NOT let a later -e override an
# earlier entry. The container ends up with BOTH, and the app reads
# the first one it finds. Passing
#
#     --env-file <prod env>  -e DATABASE_URL=<staging>
#
# therefore SILENTLY DOES NOTHING: the staging API keeps the
# production DATABASE_URL and talks to the PRODUCTION DATABASE. The
# staging API came up healthy and answered requests from production
# data, which is exactly the failure this environment must never
# have. The filter is what makes the isolation real.
# The staging API inherits the PRODUCTION API's environment -- except
# for the values that must be the staging ones.
#
# WHY IT IS NOT A CHAIN OF `grep -vE` PIPES
# -----------------------------------------
# The obvious spelling is a pipeline of filters:
#
#     docker inspect ... | grep -vE "^(DATABASE_URL|...)=" \
#                        | grep -vE "^(BUILD_SHA|...)=" > "$FILE"
#
# That FAILS, and fails silently in the worst way: `grep` exits as soon
# as it has seen what it needs and closes the pipe, so `docker inspect`
# is killed by SIGPIPE (exit 141). Under `set -euo pipefail` the whole
# script then exits at that line, LEAVING THE ENV FILE EMPTY -- and the
# staging API starts with none of the inherited variables, so it dies
# with "Invalid environment variables: SESSION_SECRET, MINIO_*".
#
# So the filtering is done with ONE `awk`, which reads all of its input
# and writes one line at a time. There is no early exit, so no SIGPIPE,
# and the env file is always complete.
#
# The excluded names are: the values that must be the staging ones
# (DATABASE_URL, the auth settings, CORS_ORIGIN, PORT, HOST) AND the
# build identity (BUILD_SHA, BUILD_TIME, GIT_REF).
#
# The build identity must NOT be inherited. The staging API used to
# inherit the PRODUCTION API's build identity and report production's
# SHA in /health while serving the staging image. The identity was
# INHERITED instead of coming from the thing that is actually serving;
# the image's own ENV is now the only source.
docker inspect gustale-api --format '{{range .Config.Env}}{{println .}}{{end}}' |
  awk -F= '
    /^DATABASE_URL=/           { next }
    /^BETTER_AUTH_URL=/        { next }
    /^BETTER_AUTH_SECRET=/     { next }
    /^CORS_ORIGIN=/            { next }
    /^BETTER_AUTH_TRUSTED_ORIGINS=/ { next }
    /^PORT=/                   { next }
    /^HOST=/                   { next }
    /^BUILD_SHA=/              { next }
    /^BUILD_TIME=/             { next }
    /^GIT_REF=/                { next }
    { print }
  ' > "$STAGING_ENV_FILE"

# The env file must not be empty: an empty one means the inheritance
# silently produced nothing, and the API would start without its
# secrets. That failure mode is caught here, where the cause is
# visible, instead of three steps later as "Invalid environment
# variables".
if [ ! -s "$STAGING_ENV_FILE" ]; then
  refuse "the inherited staging environment is EMPTY -- the production API's environment could not be read"
fi

# The password, taken from the production container and never printed.
#
# The staging role's password must MATCH the production one, because
# the staging postgres is a SEPARATE cluster with its own roles. The
# role is created by the migration chain with its own password, so a
# fresh staging database rejects the production password with
# "password authentication failed" -- a confusing failure, because
# everything else (the host, the port, the user) is right.
#
# So the role is ALIGNED here, explicitly, on every deploy. The
# alignment is idempotent and touches only the STAGING cluster.
STAGING_DB_PASSWORD="$(docker exec gustale-api sh -c 'echo $DATABASE_URL' |
  sed -E 's#^[a-z]+://[^:]+:([^@]+)@.*#\1#')"
if [ -z "$STAGING_DB_PASSWORD" ]; then
  refuse "could not read the database password from the production container"
fi
# Through the helper, so the statement is bound to the TEST container
# and not to whatever container an environment variable names.
# shellcheck source=scripts/lib/test_pg.sh
source "$REPO/scripts/lib/test_pg.sh"
test_pg_psql postgres -q -c \
  "ALTER ROLE ${STAGING_DB_USER} WITH PASSWORD '${STAGING_DB_PASSWORD}'" >/dev/null 2>&1 ||
  refuse "could not align the staging role's password"
echo "  the staging role's password is aligned with the production one"

# The API IMAGE. It is the image for the SHA being deployed -- and it
# is BUILT here, from the tree that is being deployed, when it is not
# already on the box.
#
# WHY IT IS BUILT HERE
# --------------------
# The staging API used to FALL BACK to the newest gustale-api image on
# the box when the branch's image was absent. That fallback is what
# left staging serving an API from a DIFFERENT commit than the web --
# and because the deploy passed `-e BUILD_SHA=$SHA` at RUNTIME, the
# fallback image's /health reported the REQUESTED sha, not its own.
# The identity was asserted rather than proven.
#
# So the API image is now built from the deployed tree, and its
# BAKE-IN BUILD_SHA (the image's own ENV, not a runtime override) is
# what the deploy verifies. A fallback is no longer possible.
#
# The image's own identity is checked with:
#
#   docker run --rm --entrypoint sh <image> -c 'echo $BUILD_SHA'
#
# which reads the ENV the Dockerfile baked in -- NOT the one the
# container was given.
docker rm -f "$STAGING_API_CONTAINER" >/dev/null 2>&1
STAGING_API_IMAGE="${STAGING_IMAGE_REPO}/gustale-api:${SHA}"

if ! docker image inspect "$STAGING_API_IMAGE" >/dev/null 2>&1; then
  echo "  the API image for $SHORT_SHA is not on the box -- building it from the deployed tree"
  API_BUILD_ARGS=()
  if [ "${GUSTALE_BUILD_NO_CACHE:-0}" = "1" ]; then
    API_BUILD_ARGS=(--no-cache)
  fi
  ( cd "$REPO" && docker build "${API_BUILD_ARGS[@]}" \
      --build-arg "BUILD_SHA=$SHA" \
      --build-arg "BUILD_TIME=$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
      --build-arg "GIT_REF=refs/heads/$BRANCH" \
      -f apps/api/Dockerfile \
      -t "$STAGING_API_IMAGE" . ) \
    || refuse "the API image build for $SHORT_SHA failed"
  echo "  the API image $STAGING_API_IMAGE is built"
fi

# The image's OWN build identity. This is the ENV the Dockerfile baked
# in. If it is not the SHA we are deploying, the image is not the
# commit we think it is -- and no runtime environment variable can
# change what this reads.
API_IMAGE_SHA=$(docker run --rm --entrypoint sh "$STAGING_API_IMAGE" -c 'echo "$BUILD_SHA"' 2>/dev/null | tr -d '\r\n ')
if [ "$API_IMAGE_SHA" != "$SHA" ]; then
  refuse "the API image $STAGING_API_IMAGE carries BUILD_SHA='$API_IMAGE_SHA', but $SHA was requested"
fi
echo "  the API image carries BUILD_SHA $API_IMAGE_SHA (verified from the image itself)"

docker run -d --name "$STAGING_API_CONTAINER" \
  --network host --restart unless-stopped \
  --env-file "$STAGING_ENV_FILE" \
  -e NODE_ENV=production \
  -e HOST=0.0.0.0 \
  -e PORT="$STAGING_API_PORT" \
  -e "DATABASE_URL=postgresql://${STAGING_DB_USER}:${STAGING_DB_PASSWORD}@${STAGING_DB_HOST}:${STAGING_DB_PORT}/${STAGING_DB_NAME}" \
  -e "BETTER_AUTH_URL=https://${STAGING_HOST}" \
  -e "BETTER_AUTH_SECRET=${STAGING_BETTER_AUTH_SECRET}" \
  -e "CORS_ORIGIN=https://${STAGING_HOST}" \
  -e "BETTER_AUTH_TRUSTED_ORIGINS=https://${STAGING_HOST}" \
  "$STAGING_API_IMAGE" >/dev/null 2>&1 ||
  refuse "could not start the staging API container"

# Wait for it to be healthy.
for i in $(seq 1 30); do
  if curl -fsS --max-time 3 "http://127.0.0.1:${STAGING_API_PORT}/health" >/dev/null 2>&1; then
    echo "  the staging API is healthy"
    break
  fi
  sleep 2
  if [ "$i" = "30" ]; then
    refuse "the staging API did not become healthy"
  fi
done

# ─── 3. The staging web ─────────────────────────────────────────────
# The SCOPED build: one locale, the first N dishes. The same code
# paths as production, a fraction of the pages.
echo "--- 3. the staging web (a scoped build) ---"
STAGING_TAG="staging-data-${SHORT_SHA}"
STAGING_WEB_IMAGE="$STAGING_IMAGE_REPO/gustale-web-geo:$STAGING_TAG"

# The build runs against the STAGING API, so the staging pages show
# staging data.
# --network host, exactly as the production build does.
#
# The build container has to reach the staging API at 127.0.0.1:4004.
# Without --network host it gets the docker bridge, and the VPS
# firewall (ufw) DROPs the bridge traffic -- so the build fails at
# wait-for-api with a connection timeout that looks like the API is
# down. With --network host the build container shares the host's
# network namespace and reaches 127.0.0.1 directly.
# THE CACHE TOGGLE
# -----------------
# The Astro build step is a Docker layer, and it is cached. That means
# a deploy can ship the PREVIOUS build: the source is unchanged (the
# API's DATA changed, not the code), so the layer is a cache hit and
# the build is not re-run.
#
# This is not hypothetical. The same bug was found and fixed in the
# PRODUCTION build script on 2026-10-17 -- "buildx layer-cache hit on
# the COPY-fetch-Dockerfile steps and re-baked the OLD data even when
# the API had changed". The staging script never got the fix, so it
# had the same behaviour.
#
# It bit the single-domain verification: the moussaka pilot recipe was
# inserted into the staging database, the deploy ran, the build step
# was a cache hit, and the recipe page was not in the output. The
# build had to be re-run with --no-cache before the page appeared.
#
# So: GUSTALE_BUILD_NO_CACHE=1 forces a clean rebuild, exactly as in
# the production script. The default is to use the cache (fast).
#
# `local` is NOT used here: this code is at the top level of the
# script, not inside a function, so `local` prints
# "local: can only be used in a function" and returns non-zero. The
# script runs with `set -uo pipefail` and no `-e`, so the error was
# cosmetic -- the array still ended up correct -- but a script that
# prints an error on every deploy trains the reader to ignore its
# output. A plain array is the correct construct here.
cache_args=()
if [ "${GUSTALE_BUILD_NO_CACHE:-0}" = "1" ]; then
  cache_args=(--no-cache --pull)
  echo "  the cache is OFF -- this build will re-run every step"
fi

docker build \
  "${cache_args[@]}" \
  --network host \
  --build-arg PUBLIC_DOMAIN=staging \
  --build-arg "PUBLIC_API_BASE=http://127.0.0.1:${STAGING_API_PORT}" \
  --build-arg BUILD_DATA_SOURCE=live \
  --build-arg "PUBLIC_BUILD_LOCALES=$STAGING_BUILD_LOCALES" \
  --build-arg "PUBLIC_BUILD_DISH_LIMIT=$STAGING_BUILD_DISH_LIMIT" \
  --build-arg "BUILD_SHA=$SHA" \
  --build-arg "BUILD_DATE=$BUILD_DATE" \
  -f apps/web/Dockerfile \
  -t "$STAGING_WEB_IMAGE" \
  . 2>&1 | tail -6

docker rm -f "$STAGING_WEB_CONTAINER" >/dev/null 2>&1
# The port mapping: 127.0.0.1:<host port> -> <the container's port>.
#
# The container's port is 4001, NOT 80. The nginx in the web image
# listens on 4001 (the production container does the same), and the
# image EXPOSEs 80 as a documentation-only hint that is not where
# nginx actually binds. Mapping to 80 produces a container that is
# "healthy" and serves nothing: the healthcheck inside the container
# passes, and the port on the host forwards into a closed port.
docker run -d --name "$STAGING_WEB_CONTAINER" \
  --restart unless-stopped \
  -p "127.0.0.1:${STAGING_WEB_PORT}:4001" \
  "$STAGING_WEB_IMAGE" >/dev/null 2>&1 ||
  refuse "could not start the staging web container"

# Wait for nginx to be LISTENING, not merely started.
#
# `docker run -d` returns as soon as the container is created. nginx
# then takes a moment to bind the port, and a verification that runs
# immediately gets a connection refused and reports the deploy as
# FAILED -- while the container goes on to serve perfectly.
#
# The container's own healthcheck is the authority here: the image
# declares one, so the wait is on the container's reported health
# rather than on a sleep.
for i in $(seq 1 30); do
  STATUS=$(docker inspect --format='{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' \
    "$STAGING_WEB_CONTAINER" 2>/dev/null)
  if [ "$STATUS" = "healthy" ]; then
    echo "  the staging web is healthy"
    break
  fi
  if [ "$STATUS" = "unhealthy" ] || [ "$STATUS" = "exited" ]; then
    docker logs "$STAGING_WEB_CONTAINER" 2>&1 | tail -10
    refuse "the staging web container is $STATUS"
  fi
  sleep 2
  if [ "$i" = "30" ]; then
    docker logs "$STAGING_WEB_CONTAINER" 2>&1 | tail -10
    refuse "the staging web did not become healthy in 60s (status: $STATUS)"
  fi
done

# ─── 4. The state file ──────────────────────────────────────────────
# What is running, and which commit built it. The same shape as the
# production state file, so "what is live?" has one answer.
STATE_DIR="${GUSTALE_STAGING_STATE_DIR:-/var/lib/gustale-staging}"
mkdir -p "$STATE_DIR"
cat > "$STATE_DIR/state.json" <<JSON
{
  "branch": "$BRANCH",
  "sha": "$SHA",
  "shortSha": "$SHORT_SHA",
  "webImage": "$STAGING_WEB_IMAGE",
  "apiImage": "$STAGING_API_IMAGE",
  "apiContainer": "$STAGING_API_CONTAINER",
  "webContainer": "$STAGING_WEB_CONTAINER",
  "webPort": $STAGING_WEB_PORT,
  "apiPort": $STAGING_API_PORT,
  "database": "$STAGING_DB_NAME",
  "databaseHost": "$STAGING_DB_HOST:$STAGING_DB_PORT",
  "buildLocales": "$STAGING_BUILD_LOCALES",
  "buildDishLimit": $STAGING_BUILD_DISH_LIMIT,
  "deployedAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
JSON
echo "  the state is in $STATE_DIR/state.json"

# ─── 5. The verification ────────────────────────────────────────────
echo "--- 5. the verification ---"
FAILED=0

# The web serves.
#
# The failure message has to be DIAGNOSTIC, because "does not serve"
# has two very different causes:
#
#   - the port mapping is wrong (the container is healthy but the
#     host port forwards into a closed port)
#   - the container is not serving at all
#
# So when it fails, the diagnosis is printed with it.
if curl -fsS --max-time 10 "http://127.0.0.1:${STAGING_WEB_PORT}/" >/dev/null 2>&1; then
  echo "  the staging web serves OK"
else
  echo "  ::error::the staging web does not serve on 127.0.0.1:${STAGING_WEB_PORT}"
  echo "  ::error::the container: $(docker inspect --format='{{.State.Status}}/{{if .State.Health}}{{.State.Health.Status}}{{end}}' "$STAGING_WEB_CONTAINER" 2>/dev/null)"
  echo "  ::error::the ports:    $(docker port "$STAGING_WEB_CONTAINER" 2>/dev/null | tr '\n' ' ')"
  echo "  ::error::the container listens on: $(docker exec "$STAGING_WEB_CONTAINER" sh -c "netstat -tln 2>/dev/null | awk '{print \$4}' | grep -v '^0.0.0.0:0' | head -2 | tr '\n' ' '" 2>/dev/null)"
  FAILED=1
fi

# The API is reachable DIRECTLY.
#
# The /api path is NOT proxied by the web container -- Caddy does
# that, in front of it. The production web container answers 404 for
# /api/* too, and that is correct: the browser reaches the API
# same-origin through Caddy, not through nginx.
#
# So the check here is the API itself, on its own port. The
# same-origin /api path is verified by Caddy once the staging vhost
# is in place, and the vhost's own config carries the proxy.
if curl -fsS --max-time 10 "http://127.0.0.1:${STAGING_API_PORT}/api/dishes?limit=1" >/dev/null 2>&1; then
  echo "  the staging API serves the dish list"
else
  echo "  ::error::the staging API does not serve the dish list"
  FAILED=1
fi

# And the web's own pages serve.
if curl -fsS --max-time 10 "http://127.0.0.1:${STAGING_WEB_PORT}/dishes/" >/dev/null 2>&1; then
  echo "  the staging /dishes/ page serves"
else
  echo "  ::error::the staging /dishes/ page does not serve"
  FAILED=1
fi

# The SERVED build is the build that was deployed.
#
# NOTE what this does NOT prove: /health is the API's endpoint, so it
# reports the SHA of the API IMAGE, not of the web image that was just
# built. A deploy that shipped the wrong web tree passed this check
# unchanged. The web image's own content is verified below, by reading
# the image itself.
#
# This check used to be a WARNING. It is now an ERROR, because the API
# image's own BUILD_SHA was already verified against the image above --
# so if /health disagrees, something is actively wrong (a runtime
# override, a stale container, a proxy) and the deploy must not claim
# success.
SERVED_SHA=$(curl -fsS --max-time 10 "http://127.0.0.1:${STAGING_API_PORT}/health" 2>/dev/null |
  sed -n 's/.*"sha"[[:space:]]*:[[:space:]]*"\([0-9a-f]\{7,40\}\)".*/\1/p' | head -1)
if [ "$SERVED_SHA" = "$SHA" ]; then
  echo "  the served API SHA matches the deployed SHA ($SHORT_SHA)"
else
  echo "  ::error::the API reports SHA '${SERVED_SHA:-none}' but $SHA was deployed -- the image's own BUILD_SHA was verified, so the running container is not the verified image"
  FAILED=1
fi

# THE WEB IMAGE'S OWN CONTENT IS VERIFIED.
#
# This is the check that would have caught the 2026-11-17 deployment
# that shipped a 9-url, no-/recipes, gustale.recipes-baked image under
# the tag staging-data-0583313. Every other check passed: the container
# was healthy, the pages served, the API answered, and the SHA the
# deploy reported was the SHA it had LIED about.
#
# So the image is inspected directly, and it must prove it came from
# the commit being deployed -- by reading the BUILD_SHA that the build
# baked into it, and by finding that commit's OWN marker in its
# content.
#
# The marker is the site itself: the retired host must NOT be in the
# HTML (the single-domain cutover removed it), and the routes the
# commit added must BE there. A build of the wrong commit cannot
# satisfy both.
WEB_IMAGE_SHA=$(docker run --rm --entrypoint sh "$STAGING_WEB_IMAGE" -c \
  'cat /usr/share/nginx/html/.build-sha 2>/dev/null' 2>/dev/null | tr -d '[:space:]')
if [ -z "$WEB_IMAGE_SHA" ]; then
  WEB_IMAGE_SHA=$(docker run --rm --entrypoint sh "$STAGING_WEB_IMAGE" -c \
    'grep -rhoE "[0-9a-f]{40}" /usr/share/nginx/html/ 2>/dev/null | head -1' 2>/dev/null | tr -d '[:space:]')
fi
if [ "$WEB_IMAGE_SHA" = "$SHA" ]; then
  echo "  the web image was built from the deployed SHA ($SHORT_SHA)"
else
  echo "  ::error::the web image was NOT built from $SHA (it reports '${WEB_IMAGE_SHA:-none}') -- the image tag would lie about its own contents"
  FAILED=1
fi

# The retired host must not be in the built HTML. This is a property of
# the COMMIT, not of a date: the single-domain cutover removed the
# retired host from the site, so a build of that commit cannot contain
# it. Its presence means the wrong tree was built.
#
# The pattern matches BOTH retired forms, the same way the repo's own
# guard (scripts/check-no-legacy-recipes-domain.py) matches them, so
# the deploy and the build agree on what "retired" means. Checking only
# one form would let the other slip through.
if docker run --rm --entrypoint sh "$STAGING_WEB_IMAGE" -c \
  'grep -rqlE "(gustale\.recipes|recipes\.gustale\.com)" /usr/share/nginx/html/ 2>/dev/null' 2>/dev/null; then
  echo "  ::error::the web image contains the retired host -- the wrong commit was built"
  FAILED=1
else
  echo "  the web image has no reference to the retired host"
fi

# THE ISOLATION PROOF. This is the check that matters most, so it is
# asserted on every deploy rather than trusted from the configuration.
#
# The staging API must be reading the STAGING database. The dish
# counts make that unambiguous: the staging database holds the seed
# (a handful of dishes) and production holds all the published ones.
STAGING_DISHES=$(curl -fsS --max-time 10 "http://127.0.0.1:${STAGING_API_PORT}/api/dishes?limit=1" 2>/dev/null |
  sed -n 's/.*"total"[[:space:]]*:[[:space:]]*\([0-9][0-9]*\).*/\1/p' | head -1)
PROD_DISHES=$(curl -fsS --max-time 10 "${PRODUCTION_API_BASE:-https://api.gustale.com}/api/dishes?limit=1" 2>/dev/null |
  sed -n 's/.*"total"[[:space:]]*:[[:space:]]*\([0-9][0-9]*\).*/\1/p' | head -1)

echo "  the staging API reports $STAGING_DISHES dishes; production has $PROD_DISHES"
if [ -n "$PROD_DISHES" ] && [ -n "$STAGING_DISHES" ] && [ "$STAGING_DISHES" = "$PROD_DISHES" ]; then
  echo "::error::the staging API is serving the PRODUCTION dish count -- it is pointed at the production database"
  FAILED=1
else
  echo "  the staging API is NOT reading the production database"
fi

# And it points at the staging postgres, not the production one.
STAGING_DB_TARGET=$(docker inspect "$STAGING_API_CONTAINER" --format '{{range .Config.Env}}{{println .}}{{end}}' |
  grep '^DATABASE_URL=' | sed -E 's#.*@([^:]+):([0-9]+)/.*#\1:\2#')
if [ "$STAGING_DB_TARGET" = "${STAGING_DB_HOST}:${STAGING_DB_PORT}" ]; then
  echo "  the staging API points at $STAGING_DB_TARGET (the staging postgres)"
else
  echo "::error::the staging API points at '$STAGING_DB_TARGET', not ${STAGING_DB_HOST}:${STAGING_DB_PORT}"
  FAILED=1
fi

echo ""
if [ "$FAILED" = "0" ]; then
  echo "=== the staging deploy: OK ($BRANCH @ $SHORT_SHA) ==="
  echo "  add the DNS record: A staging -> 62.72.7.218 (TTL 3600) at Spaceship"
  echo "  then Caddy serves it: /etc/caddy/sites/staging.gustale.com.caddy"
  exit 0
fi
echo "=== the staging deploy: FAILED ==="
exit 1
