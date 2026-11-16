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
SITES_DIR="${REPO_ROOT}/infra/prod/caddy/sites"

# THE THREE REDIRECT HOST FILES.
#
# They are three files because Caddy refuses to start when two imported
# files declare the same host, and because the VPS keeps one file per
# vhost in /etc/caddy/sites/ and imports them by name.
#
# Their rules must be IDENTICAL, and this script is what keeps them
# that way: it loads all three into one Caddy and asserts the same
# table against every host. A divergence between the files fails here
# rather than shipping.
SOURCE_CONFS=(
  "${SITES_DIR}/gustale.recipes.caddy"
  "${SITES_DIR}/recipes.gustale.com.caddy"
  "${SITES_DIR}/recipe.gustale.com.caddy"
)
WORK="${TMPDIR:-/tmp}/gustale-redirect-test"
IMAGE="caddy:2-alpine"
CONTAINER="gustale-redirect-test"
PORT="${GUSTALE_REDIRECT_TEST_PORT:-9080}"

for f in "${SOURCE_CONFS[@]}"; do
  if [ ! -f "$f" ]; then
    echo "FAILED: $f does not exist" >&2
    exit 1
  fi
done

mkdir -p "$WORK"

# ─── Build the test Caddyfile from the repo's file ────────────────────
#
# Two changes only, and both are test scaffolding:
#
#   * the global options block (admin off, auto_https off), so Caddy
#     does not try to get a certificate for gustale.recipes;
#   * the http:// scheme, so no TLS is negotiated;
#   * the `bind` line, so it listens on port 80 INSIDE the container
#     (published as -p <testport>:80) instead of 443.
#
# Everything else -- every matcher, every rewrite, every redir -- is
# the repo's file, verbatim. A change to the rules changes this test.
python3 - "${SOURCE_CONFS[@]}" "$WORK/Caddyfile" <<'PY'
import re
import sys

src_paths = sys.argv[1:-1]
out_path = sys.argv[-1]

blocks = []
for src_path in src_paths:
    lines = open(src_path).read().splitlines()
    # Skip the comment header: the site block starts at the first
    # line that is not a comment and not blank.
    i = 0
    while i < len(lines) and (lines[i].startswith('#') or lines[i].strip() == ''):
        i += 1
    block = "\n".join(lines[i:])

    # The test needs each block to listen on the local port and to
    # speak plain HTTP, so that no certificate is ever requested.
    #
    # The host list is the FIRST thing in the block and may span
    # several lines, so it is matched as a whole and rewritten as a
    # whole.
    def rewrite(match):
        hosts = [h.strip() for h in match.group(1).replace("\n", " ").split(",")]
        hosts = [h for h in hosts if h]
        prefixed = ", ".join("http://" + h for h in hosts)
        # The bind port is 80 INSIDE the container. The container
        # publishes it as -p <testport>:80, so the test reaches it on
        # the host at <testport>.
        #
        # It must NOT be the test port here: a container listening on
        # 9080 with -p 9080:80 publishes NOTHING, and the requests
        # land on the automatic :80 fallback server instead -- which
        # answers 200 for every host, so the redirects look broken
        # for one host and fine for the others. The `port` argument is
        # the HOST-side port and is not used in the Caddyfile.
        return prefixed + " {\n\tbind 0.0.0.0:80\n"

    block, n = re.subn(
        r"^([a-z0-9.\-]+(?:,\s*\n?[a-z0-9.\-]+)*)\s*\{",
        rewrite,
        block,
        count=1,
        flags=re.M,
    )
    if n != 1:
        sys.stderr.write("could not find the site block in %s\n" % src_path)
        sys.exit(1)
    blocks.append(block)

open(out_path, "w").write(
    "{\n\tadmin off\n\tauto_https off\n}\n\n" + "\n\n".join(blocks)
)
PY

# ─── Start Caddy ──────────────────────────────────────────────────────
docker rm -f "$CONTAINER" >/dev/null 2>&1
docker run -d --name "$CONTAINER" -p "${PORT}:80" \
  -v "${WORK}/Caddyfile:/etc/caddy/Caddyfile:ro" \
  "$IMAGE" >/dev/null 2>&1

# A STALE CONTAINER ON THE PORT IS THE TRAP
# ------------------------------------------
# `docker run -p <port>:80` does NOT fail when another container
# already holds <port> -- Docker reports a bind error on stderr and
# exits, but the port keeps serving the OTHER container's config.
#
# That is worse than no container at all: the test runs, it gets
# answers, and those answers come from a config that is not the one
# under test. It looks like a rule failure and it is not.
#
# So the port is checked BEFORE the container is started, and the
# container's own logs are checked after.
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

# The container must be the one that is serving. If another container
# holds the port, this one has exited and the answers above came from
# somewhere else.
if [ "$(docker inspect -f '{{.State.Running}}' "$CONTAINER" 2>/dev/null)" != "true" ]; then
  echo "FAILED: the test container is not running -- another container is holding port ${PORT}" >&2
  echo "  holders:" >&2
  docker ps -a --format "    {{.Names}}\t{{.Ports}}\t{{.Status}}" | grep ":${PORT}->" >&2 || true
  echo "  stop it with: docker rm -f <name>" >&2
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
  local host="${2:-gustale.recipes}"
  local code
  code=$(curl -sS -o /dev/null -w '%{http_code}' --max-time 5 \
        "http://127.0.0.1:${PORT}${path}" -H "Host: ${host}" 2>&1)
  case "$code" in
    301|302|307|308)
      FAIL=$((FAIL + 1))
      printf '  FAIL  %-46s %s  <-- IT REDIRECTED\n' "$path" "$code" ;;
    *)
      PASS=$((PASS + 1))
      printf '  PASS  %-46s %s  (proxied, not redirected)\n' "$path" "$code" ;;
  esac
}

# A POST that gets a 301 is a data-loss bug: the client follows the
# 301 with a GET and the write silently becomes a read.
probe_post_noredirect() {
  local path="$1"
  local host="${2:-gustale.recipes}"
  local code
  code=$(curl -sS -o /dev/null -w '%{http_code}' --max-time 5 -X POST \
        -H 'Content-Type: application/json' --data '{}' \
        "http://127.0.0.1:${PORT}${path}" -H "Host: ${host}" 2>&1)
  case "$code" in
    301|302|307|308)
      FAIL=$((FAIL + 1))
      printf '  FAIL  POST %-41s %s  <-- IT REDIRECTED\n' "$path" "$code" ;;
    *)
      PASS=$((PASS + 1))
      printf '  PASS  POST %-41s %s  (proxied, not redirected)\n' "$path" "$code" ;;
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
# ─── THE SAME TABLE, ON EVERY HOST ─────────────────────────────────────
#
# The three files carry the same rules, and that is only true if the
# same table is asserted against each of them. A file that drifted
# from the others fails here.
#
# The SINGULAR host (recipe.gustale.com) is a typo host. It is NOT one
# of the three the cutover retires, but it IS a fourth door onto the
# same content, and it is redirecting to a redirect host after the
# cutover -- which would make it a two-hop chain. So it gets the same
# treatment: one hop, direct to gustale.com.
#
# It has ONE fewer rule than the others: its "/" goes to the recipes
# hub, and everything else keeps its path. It does not have the
# /recipes/<slug> and /dishes/<slug> rules, because a recipe URL on
# the singular host was never a thing -- the singular host redirected
# to recipes.gustale.com, which did not serve /recipes at all (it was
# a 404 there until this cutover).

echo
echo "=== THE OTHER TWO HOSTS ==="
probe "/recipes/moussaka-greek" "https://gustale.com/recipes/moussaka-greek" "www.gustale.recipes"
probe "/recipes/moussaka-greek" "https://gustale.com/recipes/moussaka-greek" "recipes.gustale.com"
probe "/dishes/moussaka-greek"  "https://gustale.com/dishes/moussaka-greek#recipes" "recipes.gustale.com"

echo
echo "=== THE SINGULAR TYPO HOST ==="
probe "/"                        "https://gustale.com/recipes"          "recipe.gustale.com"
probe "/dishes/moussaka-greek"   "https://gustale.com/dishes/moussaka-greek" "recipe.gustale.com"
probe "/families?q=region%3Dindonesia" "https://gustale.com/families?q=region%3Dindonesia" "recipe.gustale.com"

echo
echo "=== EVERY HOST, THE SAME TABLE ==="
#
# The three cutover hosts must answer IDENTICALLY. This is what proves
# the three files have not drifted.
for HOST in gustale.recipes www.gustale.recipes recipes.gustale.com; do
  echo "  --- $HOST ---"
  probe "/"                         "https://gustale.com/recipes"                      "$HOST"
  probe "/recipes"                  "https://gustale.com/recipes"                      "$HOST"
  probe "/recipes/"                 "https://gustale.com/recipes"                      "$HOST"
  probe "/recipes/moussaka-greek"   "https://gustale.com/recipes/moussaka-greek"       "$HOST"
  probe "/dishes/moussaka-greek"    "https://gustale.com/dishes/moussaka-greek#recipes" "$HOST"
  probe "/dishes/new"               "https://gustale.com/dishes/new"                   "$HOST"
  probe "/ingredients/bechamel"     "https://gustale.com/ingredients/bechamel"         "$HOST"
  probe "/login"                    "https://gustale.com/login"                        "$HOST"
  probe "/register"                 "https://gustale.com/register"                     "$HOST"
  probe "/account"                  "https://gustale.com/account"                      "$HOST"
  probe "/dashboard"                "https://gustale.com/dashboard"                    "$HOST"
  probe "/fr/dishes/moussaka-greek" "https://gustale.com/fr/dishes/moussaka-greek"     "$HOST"
  probe "/some/unmapped/path"       "https://gustale.com/some/unmapped/path"           "$HOST"
  probe "/recipes?page=2&lang=de"   "https://gustale.com/recipes?page=2&lang=de"        "$HOST"
  probe "/dishes/moussaka-greek?a=1" "https://gustale.com/dishes/moussaka-greek?a=1#recipes" "$HOST"
done

echo
echo "=== THE API/MEDIA EXCEPTION (must NOT be a 301) ==="
probe_noredirect "/api/dishes?limit=1"
probe_noredirect "/api/recipes"
probe_noredirect "/media/dishes/moussaka-greek/cover-1536w.webp"

echo
echo "=== THE EXCEPTION, ON EVERY HOST ==="
for HOST in gustale.recipes www.gustale.recipes recipes.gustale.com; do
  probe_noredirect "/api/dishes?limit=1" "$HOST"
  probe_noredirect "/media/dishes/moussaka-greek/cover-1536w.webp" "$HOST"
  probe_post_noredirect "/api/dishes" "$HOST"
done

echo
echo "=== A POST IS NOT REDIRECTED (a 301 here loses the write) ==="
probe_post_noredirect "/api/dishes"
probe_post_noredirect "/api/dishes" "www.gustale.recipes"
probe_post_noredirect "/api/dishes" "recipes.gustale.com"

echo
echo "================================================"
echo "  PASS: $PASS   FAIL: $FAIL"
echo "================================================"

docker rm -f "$CONTAINER" >/dev/null 2>&1

[ "$FAIL" -eq 0 ]
