#!/usr/bin/env bash
# Verify the PR2 redirect rules against a REAL Caddy.
#
# WHY THIS EXISTS
# ---------------
# Caddy's `redir` has three behaviours that are easy to get wrong and
# impossible to see by reading:
#
#   1. `redir` is NOT A MATCHER. It is a terminal handler that always
#      fires. Several `redir` directives in one site block means the
#      FIRST one answers EVERY request -- so /login would redirect to
#      whatever the first rule pointed at.
#
#   2. `redir` does NOT expand regexp captures. `{http.regexp.1}`
#      comes out LITERALLY in the Location header.
#
#   3. `{uri}` ALREADY CONTAINS THE QUERY STRING. Appending {?query}
#      to it DOUBLES the query.
#
# Each of those was found by running a real Caddy and reading the
# Location headers back. Each of them is invisible in the config file.
#
# So the rules are TESTED, not asserted. Run this after any change to
# the Caddy files.
#
# USAGE
# -----
#   bash scripts/verify-redirect-rules.sh
#
# It starts a throwaway Caddy in Docker, points it at the repo's
# config with the test-only global options added, exercises every
# rule, and prints a PASS/FAIL table. It touches NOTHING on the
# production server.
#
# REQUIRES: docker, and the caddy:2-alpine image.
set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SOURCE_CONF="${REPO_ROOT}/infra/prod/caddy/sites/gustale.recipes.caddy"
WORK="${TMPDIR:-/tmp}/gustale-redirect-test"
IMAGE="caddy:2-alpine"
CONTAINER="gustale-redirect-test"
PORT="${GUSTALE_REDIRECT_TEST_PORT:-9080}"

if [ ! -f "$SOURCE_CONF" ]; then
  echo "FAILED: $SOURCE_CONF does not exist" >&2
  exit 1
fi

mkdir -p "$WORK"

# ─── Build the test Caddyfile from the repo's file ────────────────────
#
# Two changes only, and both are test scaffolding:
#
#   * the global options block (admin off, auto_https off), so Caddy
#     does not try to get a certificate for gustale.recipes;
#   * the http:// scheme and the `bind` line, so it listens on a
#     local port instead of 443.
#
# Everything else -- every matcher, every rewrite, every redir -- is
# the repo's file, verbatim. A change to the rules changes this test.
python3 - "$SOURCE_CONF" "$WORK/Caddyfile" "$PORT" <<'PY'
import sys
src_path, out_path, port = sys.argv[1], sys.argv[2], sys.argv[3]
lines = open(src_path).read().splitlines()
i = 0
while i < len(lines) and (lines[i].startswith('#') or lines[i].strip() == ''):
    i += 1
body = "\n".join(lines[i:])
body = body.replace(
    "gustale.recipes,\nwww.gustale.recipes,\nrecipes.gustale.com {",
    "http://gustale.recipes,\nhttp://www.gustale.recipes,\n"
    "http://recipes.gustale.com {\n\tbind 0.0.0.0:" + port,
)
open(out_path, "w").write("{\n\tadmin off\n\tauto_https off\n}\n\n" + body)
PY

# ─── Start Caddy ──────────────────────────────────────────────────────
docker rm -f "$CONTAINER" >/dev/null 2>&1
docker run -d --name "$CONTAINER" -p "${PORT}:80" \
  -v "${WORK}/Caddyfile:/etc/caddy/Caddyfile:ro" \
  "$IMAGE" >/dev/null 2>&1

for _ in $(seq 1 30); do
  sleep 0.5
  if curl -sS -o /dev/null --max-time 2 "http://127.0.0.1:${PORT}/" 2>/dev/null; then
    break
  fi
done

if ! curl -sS -o /dev/null --max-time 2 "http://127.0.0.1:${PORT}/" 2>/dev/null; then
  echo "FAILED: Caddy did not come up" >&2
  docker logs "$CONTAINER" 2>&1 | tail -20 >&2
  docker rm -f "$CONTAINER" >/dev/null 2>&1
  exit 1
fi

echo "=== caddy ==="
docker exec "$CONTAINER" caddy version 2>&1 | head -1
echo

PASS=0
FAIL=0

probe() {
  local path="$1" want="$2" host="${3:-gustale.recipes}"
  local out code loc
  out=$(curl -sS -o /dev/null -D - --max-time 5 \
        "http://127.0.0.1:${PORT}${path}" -H "Host: ${host}" 2>&1)
  code=$(printf '%s' "$out" | head -1 | awk '{print $2}')
  loc=$(printf '%s' "$out" | grep -i '^location:' \
        | sed 's/^[Ll]ocation:[[:space:]]*//' | tr -d '\r')
  if [ "$code" = "301" ] && [ "$loc" = "$want" ]; then
    PASS=$((PASS + 1))
    printf '  PASS  %-38s 301 %s\n' "$path" "$loc"
  else
    FAIL=$((FAIL + 1))
    printf '  FAIL  %-38s %s %s   (wanted %s)\n' \
      "$path" "$code" "${loc:-<none>}" "$want"
  fi
}

probe_noredirect() {
  local path="$1"
  local code
  code=$(curl -sS -o /dev/null -w '%{http_code}' --max-time 5 \
        "http://127.0.0.1:${PORT}${path}" -H "Host: gustale.recipes" 2>&1)
  case "$code" in
    301|302|307|308)
      FAIL=$((FAIL + 1))
      printf '  FAIL  %-46s %s  <-- IT REDIRECTED\n' "$path" "$code" ;;
    *)
      PASS=$((PASS + 1))
      printf '  PASS  %-46s %s  (proxied, not redirected)\n' "$path" "$code" ;;
  esac
}

echo "=== THE RULE TABLE ==="
probe "/"                       "https://gustale.com/recipes"
probe "/recipes"                "https://gustale.com/recipes"
probe "/recipes/"               "https://gustale.com/recipes"
probe "/recipes/moussaka-greek" "https://gustale.com/recipes/moussaka-greek"
probe "/dishes/moussaka-greek"  "https://gustale.com/dishes/moussaka-greek#recipes"
probe "/ingredients/bechamel"   "https://gustale.com/ingredients/bechamel"
probe "/ingredients"            "https://gustale.com/ingredients"
probe "/dishes/new"             "https://gustale.com/dishes/new"
probe "/login"                  "https://gustale.com/login"
probe "/register"               "https://gustale.com/register"
probe "/account"                "https://gustale.com/account"
probe "/dashboard"              "https://gustale.com/dashboard"
probe "/families"               "https://gustale.com/families"
probe "/fr/dishes/moussaka-greek" "https://gustale.com/fr/dishes/moussaka-greek"
probe "/de/ingredients/bechamel"  "https://gustale.com/de/ingredients/bechamel"
probe "/zh/dashboard"             "https://gustale.com/zh/dashboard"
probe "/some/unmapped/path"       "https://gustale.com/some/unmapped/path"

echo
echo "=== THE QUERY STRING (must survive, exactly once) ==="
probe "/recipes?page=2&lang=de"      "https://gustale.com/recipes?page=2&lang=de"
probe "/?a=1"                        "https://gustale.com/recipes?a=1"
probe "/recipes/?x=9"                "https://gustale.com/recipes?x=9"
probe "/families?q=test%20query&b=2" "https://gustale.com/families?q=test%20query&b=2"
probe "/dishes/moussaka-greek?a=1"   "https://gustale.com/dishes/moussaka-greek?a=1#recipes"
probe "/recipes/moussaka-greek?z=1"  "https://gustale.com/recipes/moussaka-greek?z=1"

echo
echo "=== THE OTHER TWO HOSTS ==="
probe "/recipes/moussaka-greek" "https://gustale.com/recipes/moussaka-greek" "www.gustale.recipes"
probe "/recipes/moussaka-greek" "https://gustale.com/recipes/moussaka-greek" "recipes.gustale.com"
probe "/dishes/moussaka-greek"  "https://gustale.com/dishes/moussaka-greek#recipes" "recipes.gustale.com"

echo
echo "=== THE API/MEDIA EXCEPTION (must NOT be a 301) ==="
probe_noredirect "/api/dishes?limit=1"
probe_noredirect "/api/recipes"
probe_noredirect "/media/dishes/moussaka-greek/cover-1536w.webp"

echo
echo "================================================"
echo "  PASS: $PASS   FAIL: $FAIL"
echo "================================================"

docker rm -f "$CONTAINER" >/dev/null 2>&1

[ "$FAIL" -eq 0 ]
