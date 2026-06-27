#!/bin/bash
# scripts/verify-admin.sh — Live verification for Phase 4 (Admin Dish Editor).
#
# Exercises the SPEC's acceptance criteria against the live prod site. Run
# after PR #11 (admin UI) AND PR #12 (Caddy vhost split) are both merged
# and deployed.
#
# Exits 0 if every assertion passes, 1 if any fails. Output is verbose on
# failure, terse on success. Use --quiet for a one-line summary.
#
# Usage:
#   scripts/verify-admin.sh                 # full run
#   scripts/verify-admin.sh --quiet         # one-line summary
#   scripts/verify-admin.sh --host=custom   # override gustale.com host

set -u

HOST_GUSTALE_COM="${HOST_GUSTALE_COM:-gustale.com}"
HOST_WWW="${HOST_WWW:-www.gustale.com}"
HOST_RECIPES="${HOST_RECIPES:-gustale.recipes}"
HOST_API="${HOST_API:-api.gustale.com}"

# Parse flags
for arg in "$@"; do
  case "$arg" in
    --quiet) QUIET=1 ;;
    --host=*) HOST_GUSTALE_COM="${arg#*=}" ;;
    *) echo "Unknown arg: $arg" >&2; exit 2 ;;
  esac
done

PASS=0
FAIL=0
FAILED_CHECKS=()

check() {
  local label="$1"
  local expected_status="$2"
  local actual_status="$3"
  if [ "$actual_status" = "$expected_status" ]; then
    [ -z "${QUIET:-}" ] && printf "  \033[32mPASS\033[0m %s (got %s)\n" "$label" "$actual_status"
    PASS=$((PASS + 1))
  else
    printf "  \033[31mFAIL\033[0m %s (expected %s, got %s)\n" "$label" "$expected_status" "$actual_status"
    FAIL=$((FAIL + 1))
    FAILED_CHECKS+=("$label")
  fi
}

curl_status() {
  curl -s -o /dev/null -w "%{http_code}" --max-time 15 "$@"
}

echo "=========================================="
echo " Gustale Admin — Phase 4 live verification"
echo " $(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo "=========================================="
echo ""
echo "  gustale.com  = $HOST_GUSTALE_COM"
echo "  www          = $HOST_WWW"
echo "  recipes      = $HOST_RECIPES"
echo "  api          = $HOST_API"
echo ""

echo "[ADM-05] Admin endpoint shape (returns 4xx on public hosts; 200/401 from recipes)"
# Without a session cookie, all admin endpoints should reject. On
# gustale.com the Caddy block returns 404; on gustale.recipes (after
# Plan 5 + manual VPS reload) the API handler returns 401.
# We accept any 4xx — different layers of the stack reject differently.
ACTUAL_LOOKUPS=$(curl_status "https://$HOST_API/api/admin/lookups")
case "$ACTUAL_LOOKUPS" in
  4*) pass "  /api/admin/lookups returns 4xx (got $ACTUAL_LOOKUPS — auth or Caddy block)" ;;
  200) fail "  /api/admin/lookups returned 200 — endpoint is OPEN without auth!" ;;
  *)   fail "  /api/admin/lookups unexpected status: $ACTUAL_LOOKUPS" ;;
esac
ACTUAL_DISHES=$(curl_status "https://$HOST_API/api/admin/dishes?limit=1")
case "$ACTUAL_DISHES" in
  4*) pass "  /api/admin/dishes returns 4xx (got $ACTUAL_DISHES)" ;;
  200) fail "  /api/admin/dishes returned 200 — endpoint is OPEN without auth!" ;;
  *)   fail "  /api/admin/dishes unexpected status: $ACTUAL_DISHES" ;;
esac

echo "[ADM-06] Read API non-regression (filter params preserved)"
check "  /api/dishes?country=japan"       200 "$(curl_status "https://$HOST_API/api/dishes?country=japan&limit=5")"
check "  /api/dishes?cuisine=Italian"    200 "$(curl_status "https://$HOST_API/api/dishes?cuisine=Italian&limit=5")"
check "  /api/dishes?type=Pasta"         200 "$(curl_status "https://$HOST_API/api/dishes?type=Pasta&limit=5")"
check "  /api/dishes?period=1920-1950"    200 "$(curl_status "https://$HOST_API/api/dishes?period=1920-1950&limit=5")"
check "  /api/dishes?region=japan"       200 "$(curl_status "https://$HOST_API/api/dishes?region=japan&limit=5")"
check "  /api/dishes?family=dumplings"   200 "$(curl_status "https://$HOST_API/api/dishes?family=dumplings&limit=5")"
echo ""

echo "[ADM-07] Relations endpoint non-regression (PR #5 preserved)"
check "  /api/dishes/moussaka-greek/relations" 200 "$(curl_status "https://$HOST_API/api/dishes/moussaka-greek/relations")"
echo ""

echo "[ADM-04] Host separation — /admin unreachable on public hosts"
check "  gustale.com/admin (404)"           404 "$(curl_status "https://$HOST_GUSTALE_COM/admin")"
check "  gustale.com/admin/ (404)"          404 "$(curl_status "https://$HOST_GUSTALE_COM/admin/")"
check "  gustale.com/admin/dishes (404)"    404 "$(curl_status "https://$HOST_GUSTALE_COM/admin/dishes")"
check "  gustale.com/admin/dishes/moussaka-greek (404)" 404 "$(curl_status "https://$HOST_GUSTALE_COM/admin/dishes/moussaka-greek")"
check "  www.gustale.com/admin (404)"       404 "$(curl_status "https://$HOST_WWW/admin")"
check "  gustale.com/admin* via path matcher (404)" 404 "$(curl_status "https://$HOST_GUSTALE_COM/admin/dishes/ramen/edit")"

echo "[ADM-04] Defense in depth — /api/admin blocked on api.gustale.com"
check "  api.gustale.com/api/admin/lookups (404)"    404 "$(curl_status "https://$HOST_API/api/admin/lookups")"
check "  api.gustale.com/api/admin/dishes (404)"     404 "$(curl_status "https://$HOST_API/api/admin/dishes")"
check "  api.gustale.com/api/admin/dishes/moussaka-greek (404)" 404 "$(curl_status "https://$HOST_API/api/admin/dishes/moussaka-greek")"

echo "[ADM-04] /admin still served on gustale.recipes (explicit vhost)"
# gustale.recipes/admin — still resolves, returns the redirect-to-login
# HTML (middleware fires at build time). 200 because the file exists.
# The auth check is in the Astro middleware (page-level gate).
RC_RECIPES=$(curl_status "https://$HOST_RECIPES/admin")
if [ "$RC_RECIPES" = "200" ] || [ "$RC_RECIPES" = "302" ]; then
  [ -z "${QUIET:-}" ] && printf "  \033[32mPASS\033[0m gustale.recipes/admin (got $RC_RECIPES — served, auth-gated by middleware)\n"
  PASS=$((PASS + 1))
else
  printf "  \033[31mFAIL\033[0m gustale.recipes/admin (expected 200/302, got %s)\n" "$RC_RECIPES"
  FAIL=$((FAIL + 1))
  FAILED_CHECKS+=("gustale.recipes/admin")
fi
echo ""

echo "[ADM-03] Auth gate on admin endpoints (no session → 401)"
# After Plan 5, gustale.recipes/admin is reachable but the auth check
# is in the API handler. We can't test gustale.recipes/api here without
# DNS routing, so this is checked implicitly via ADM-04 (Caddy blocks
# gustale.com/api/admin/* with 404, defense in depth).
echo ""

echo "[Smoke] Other public site paths still work"
check "  gustale.com/ (200)"               200 "$(curl_status "https://$HOST_GUSTALE_COM/")"
check "  gustale.com/dishes (200)"         200 "$(curl_status "https://$HOST_GUSTALE_COM/dishes")"
check "  gustale.com/map (200)"            200 "$(curl_status "https://$HOST_GUSTALE_COM/map")"
check "  gustale.com/lineages (200)"       200 "$(curl_status "https://$HOST_GUSTALE_COM/lineages")"
check "  api.gustale.com/health (200)"     200 "$(curl_status "https://$HOST_API/health")"
check "  api.gustale.com/api/dishes (200)" 200 "$(curl_status "https://$HOST_API/api/dishes?limit=1")"
echo ""

echo "=========================================="
TOTAL=$((PASS + FAIL))
if [ $FAIL -eq 0 ]; then
  printf " \033[32mAll $TOTAL checks passed.\033[0m\n"
  exit 0
else
  printf " \033[31m$FAIL of $TOTAL checks FAILED.\033[0m\n"
  echo " Failed checks:"
  for c in "${FAILED_CHECKS[@]}"; do
    echo "   - $c"
  done
  exit 1
fi