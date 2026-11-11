#!/usr/bin/env bash
# Build the web app the way CI does, for one domain + origin, and report
# the origin-sensitive facts about the OUTPUT.
#
# Usage: scripts/build-web-local.sh <domain> [site_origin]
#
#   domain       "recipes" | "geo"
#   site_origin  the PUBLIC_SITE_ORIGIN to bake (default: the live one)
#
# It starts the committed mock API, builds, then stops the mock. The
# output is left in apps/web/dist for inspection.
set -uo pipefail

DOMAIN="${1:?usage: build-web-local.sh <domain> [site_origin] [recipes_origin]}"
ORIGIN="${2:-}"
RECIPES_ORIGIN="${3:-}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

export PATH="$HOME/.local/bin:$PATH"

if [ -n "$ORIGIN" ]; then
  export PUBLIC_SITE_ORIGIN="$ORIGIN"
  # The recipes cross-link origin follows the same host, so the local
  # build exercises the same wiring the Docker build does.
  export PUBLIC_RECIPES_ORIGIN="$ORIGIN"
fi
if [ -n "$RECIPES_ORIGIN" ]; then
  export PUBLIC_RECIPES_ORIGIN="$RECIPES_ORIGIN"
fi

PORT=8742
rm -rf apps/web/dist apps/web/.astro

node apps/web/scripts/mock-api.mjs --port "$PORT" > /tmp/mock-api.log 2>&1 &
MOCK_PID=$!
cleanup() { kill "$MOCK_PID" 2>/dev/null || true; }
trap cleanup EXIT

node apps/web/scripts/wait-for-api.mjs "http://127.0.0.1:$PORT" || {
  echo "MOCK_API_NEVER_CAME_UP=1"
  exit 1
}

echo "=== building domain=$DOMAIN origin=${PUBLIC_SITE_ORIGIN:-<default>} ==="
cd apps/web
PUBLIC_DOMAIN="$DOMAIN" PUBLIC_API_BASE="http://127.0.0.1:$PORT" \
  pnpm run "build:$DOMAIN" > "/tmp/web-build-$DOMAIN.log" 2>&1
RC=$?
cd "$ROOT"

echo "BUILD_RC=$RC"
if [ "$RC" != "0" ]; then
  tail -25 "/tmp/web-build-$DOMAIN.log"
  exit "$RC"
fi

echo "--- the origin-sensitive facts about the OUTPUT ---"
echo -n "canonical on the home:  "; grep -o 'rel="canonical" href="[^"]*"' apps/web/dist/index.html | head -1
echo -n "sitemap index loc:      "; grep -o '<loc>[^<]*</loc>' apps/web/dist/sitemap.xml | head -1
echo -n "robots Sitemap:          "; grep -o 'Sitemap: .*' apps/web/dist/robots.txt | head -1
echo -n "the property switcher:   "; grep -o 'href="https://[^"]*" class="foot-domain"' apps/web/dist/index.html | head -2 | tr '\n' ' '; echo
echo -n "occurrences of the OLD origin in dist: "
grep -rl "gustale.recipes" apps/web/dist 2>/dev/null | wc -l
echo -n "occurrences of the NEW origin in dist: "
grep -rl "recipes.gustale.com" apps/web/dist 2>/dev/null | wc -l
echo "WEB_BUILD_OK=1"
