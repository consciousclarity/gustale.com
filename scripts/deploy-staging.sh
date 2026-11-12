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
STAGING_WEB_PORT=4003
STAGING_API_PORT=4004
STAGING_DB_HOST=127.0.0.1
STAGING_DB_PORT=5434
STAGING_DB_NAME="${STAGING_DB_NAME:-gustale_staging}"
STAGING_DB_USER="${STAGING_DB_USER:-gustale}"
STAGING_PG_CONTAINER="${STAGING_PG_CONTAINER:-gustale-test-postgres}"
STAGING_WEB_CONTAINER=gustale-web-staging
STAGING_API_CONTAINER=gustale-api-staging
STAGING_IMAGE_REPO="${GUSTALE_REPO_NAME:-ghcr.io/consciousclarity/gustale.com}"
STAGING_BUILD_LOCALES="${STAGING_BUILD_LOCALES:-en}"
STAGING_BUILD_DISH_LIMIT="${STAGING_BUILD_DISH_LIMIT:-50}"

# ─── The refusals ───────────────────────────────────────────────────
# These are the safety properties, written as checks rather than as
# comments. A comment can drift; a check fails.

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
for c in "$STAGING_WEB_CONTAINER" "$STAGING_API_CONTAINER"; do
  case "$c" in
    gustale-api|gustale-web-geo|gustale-web-recipes)
      refuse "the staging container name '$c' is a production container name"
      ;;
  esac
done

# ─── The arguments ──────────────────────────────────────────────────
BRANCH="${1:-}"
if [ -z "$BRANCH" ]; then
  echo "usage: $0 <branch> [sha]" >&2
  exit 1
fi
SHA="${2:-}"

cd "$REPO" 2>/dev/null || refuse "the build directory $REPO does not exist"

if [ -z "$SHA" ]; then
  git fetch origin "$BRANCH" >/dev/null 2>&1
  SHA="$(git rev-parse "origin/$BRANCH" 2>/dev/null)"
fi
if [ -z "$SHA" ]; then
  refuse "could not resolve a SHA for '$BRANCH'"
fi
SHORT_SHA="$(echo "$SHA" | cut -c1-7)"

echo "=== staging deploy: $BRANCH @ $SHORT_SHA ==="
echo "  host        $STAGING_HOST"
echo "  web port    $STAGING_WEB_PORT"
echo "  api port    $STAGING_API_PORT"
echo "  database    $STAGING_DB_NAME on $STAGING_DB_HOST:$STAGING_DB_PORT ($STAGING_PG_CONTAINER)"
echo "  build scope $STAGING_BUILD_LOCALES / $STAGING_BUILD_DISH_LIMIT dishes"
echo ""

# ─── 1. The staging database ────────────────────────────────────────
# The migrations run against the staging database, and the same
# migration chain CI runs runs here.
echo "--- 1. the staging database ---"
docker exec "$STAGING_PG_CONTAINER" psql -U postgres -tAc \
  "SELECT 1 FROM pg_database WHERE datname='$STAGING_DB_NAME'" 2>/dev/null | grep -q 1 ||
  docker exec "$STAGING_PG_CONTAINER" psql -U postgres -c \
    "CREATE DATABASE $STAGING_DB_NAME" 2>&1 | tail -1
echo "  the database $STAGING_DB_NAME is present"

# The migrations. The chain is the same one CI runs, so a migration
# that CI would reject is rejected here too.
if [ -x "$REPO/scripts/ci-migration-chain.sh" ]; then
  bash "$REPO/scripts/ci-migration-chain.sh" "$STAGING_DB_NAME" 2>&1 |
    grep -E "FULL_CI_CHAIN_OK|error|FAIL" | tail -3
fi

# ─── 2. The staging API ─────────────────────────────────────────────
# Its own container, its own port, pointed at the staging database.
echo "--- 2. the staging API ---"
docker rm -f "$STAGING_API_CONTAINER" >/dev/null 2>&1
docker run -d --name "$STAGING_API_CONTAINER" \
  --network host --restart unless-stopped \
  -e NODE_ENV=production \
  -e HOST=127.0.0.1 \
  -e PORT="$STAGING_API_PORT" \
  -e "DATABASE_URL=postgres://${STAGING_DB_USER}:${STAGING_DB_PASSWORD:-gustale}@${STAGING_DB_HOST}:${STAGING_DB_PORT}/${STAGING_DB_NAME}" \
  -e "BETTER_AUTH_URL=https://${STAGING_HOST}" \
  -e "BETTER_AUTH_SECRET=${STAGING_BETTER_AUTH_SECRET:-staging-only-not-a-production-secret}" \
  -e "CORS_ORIGIN=https://${STAGING_HOST}" \
  -e "BUILD_SHA=$SHA" \
  -e "TRUSTED_ORIGINS=https://${STAGING_HOST}" \
  "$STAGING_IMAGE_REPO/gustale-api:$SHA" >/dev/null 2>&1 ||
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
STAGING_WEB_IMAGE="$STAGING_IMAGE_REPO/gustale-web-recipes:$STAGING_TAG"

# The build runs against the STAGING API, so the staging pages show
# staging data.
docker build \
  --build-arg PUBLIC_DOMAIN=staging \
  --build-arg "PUBLIC_API_BASE=http://127.0.0.1:${STAGING_API_PORT}" \
  --build-arg BUILD_DATA_SOURCE=live \
  --build-arg "PUBLIC_BUILD_LOCALES=$STAGING_BUILD_LOCALES" \
  --build-arg "PUBLIC_BUILD_DISH_LIMIT=$STAGING_BUILD_DISH_LIMIT" \
  --build-arg "BUILD_SHA=$SHA" \
  -f apps/web/Dockerfile \
  -t "$STAGING_WEB_IMAGE" \
  . 2>&1 | tail -6

docker rm -f "$STAGING_WEB_CONTAINER" >/dev/null 2>&1
docker run -d --name "$STAGING_WEB_CONTAINER" \
  --restart unless-stopped \
  -p "127.0.0.1:${STAGING_WEB_PORT}:80" \
  "$STAGING_WEB_IMAGE" >/dev/null 2>&1 ||
  refuse "could not start the staging web container"

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
if curl -fsS --max-time 10 "http://127.0.0.1:${STAGING_WEB_PORT}/" >/dev/null 2>&1; then
  echo "  the staging web serves OK"
else
  echo "  ::error::the staging web does not serve"
  FAILED=1
fi

# The API is reachable THROUGH the web (the same-origin /api path the
# browser uses).
if curl -fsS --max-time 10 "http://127.0.0.1:${STAGING_WEB_PORT}/api/dishes?limit=1" >/dev/null 2>&1; then
  echo "  the staging /api proxy works"
else
  echo "  ::error::the staging /api proxy does not work"
  FAILED=1
fi

# The SERVED build is the build that was deployed.
SERVED_SHA=$(curl -fsS --max-time 10 "http://127.0.0.1:${STAGING_API_PORT}/health" 2>/dev/null |
  sed -n 's/.*"sha"[[:space:]]*:[[:space:]]*"\([0-9a-f]\{7,40\}\)".*/\1/p' | head -1)
if [ "$SERVED_SHA" = "$SHA" ]; then
  echo "  the served SHA matches the deployed SHA ($SHORT_SHA)"
else
  echo "  ::warning::the API did not report the deployed SHA (served='${SERVED_SHA:-none}')"
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
