#!/usr/bin/env bash
# The post-deploy sitemap check.
#
# WHAT THIS IS
# ------------
# After a deploy, assert that BOTH domains serve the same sitemap URL
# count, and that the count is the expected one.
#
# WHY BOTH DOMAINS
# ----------------
# `gustale.com` and `gustale.recipes` are TWO SEPARATE sites, served by
# TWO SEPARATE containers (`gustale-web-geo` on :4002 and
# `gustale-web-recipes` on :4001), built and deployed INDEPENDENTLY.
# They are the same app and the same commit, differing only in
# PUBLIC_DOMAIN — but one can be a stale build while the other is
# current. On 2026-11-02 that was exactly what happened: both
# containers reported the same image tag and were "healthy", while
# gustale.com served 1,531 sitemap URLs and gustale.recipes served
# 1,643. A check that only looked at gustale.com would have called it
# a clean deploy.
#
# THE EXPECTED COUNT IS DERIVED, NOT HARDCODED
# --------------------------------------------
# This script used to take the expected count as an argument, and the
# deploy job passed a hardcoded 1531. That number was written for the
# pre-WP-02b vocabulary (1,474 dishes + 43 families + 12 lineages + 2
# static URLs) and went stale the moment WP-02b made the atlas's 123
# canonical families the vocabulary. The live counts became 1,611
# (geo) and 1,614 (recipes), so EVERY DEPLOY FAILED its own verify
# step — on 2026-11-11, on the WP-01 deploy itself.
#
# The count is now computed from the API, which is the source of truth:
#
#     dishes    = the published dish count from the API
#     families  = the content-bearing families (the sitemap omits the
#                 empty ones, so this has to be read from the sitemap)
#     lineages  = the content-bearing lineages (same)
#     static    = 2 (the root and the /dishes index)
#
# families and lineages are read from the sitemap because "has at least
# one dish behind it" is a property of the BUILD, not of the API. The
# count is then taken from the OTHER domain, so the two are compared
# against each other rather than against a literal.
#
# WHY NOT READ THE EXPECTATION FROM THE SITEMAP BEING CHECKED
# -----------------------------------------------------------
# Because that would make the check vacuous: the artifact under test
# would define its own expectation. The API is independent of the
# build, so a dish count that disagrees with the API is a real defect.
#
# USAGE
# -----
#   scripts/check-live-sitemaps.sh [expected-url-count]
#
# The expected count is now OPTIONAL. It is derived from the API and
# the sibling domain when it is not given. Pass it explicitly only to
# override the derived value (for a test).
#
# EXIT CODES
# ----------
#   0  both domains serve the expected count, and they agree
#   1  a mismatch, a failure, or a disagreement between the domains
set -uo pipefail

# The domains to check. The two production sites; a test can override
# them with a local stub (see scripts/test-check-live-sitemaps.sh).
if [ -n "${DOMAINS:-}" ]; then
  # shellcheck disable=SC2206
  DOMAIN_LIST=($DOMAINS)
else
  DOMAIN_LIST=(gustale.com gustale.recipes)
fi

# The base URL. The tests point this at a local stub server; in
# production it is the real https:// origin. The trailing slash is
# REQUIRED: without it the URL came out as
# "http://127.0.0.1:34023stub-a.test/sitemap-en.xml" — no separator
# between the port and the host — and every request 404'd.
URL_BASE="${STUB_URL_BASE:-https://}"
case "$URL_BASE" in
  */) ;;
  *) URL_BASE="$URL_BASE/" ;;
esac

# The API that the expectation is derived from. The web app calls the
# API same-origin through Caddy, but this check runs on the VPS where
# the API is directly reachable.
API_BASE="${API_BASE:-https://api.gustale.com}"

fetch_sitemap() {
  local host="$1"
  curl -s --compressed --max-time 60 \
    -H "Host: ${host}" \
    "${URL_BASE}${host}/sitemap-en.xml" 2>/dev/null
}

count_urls() {
  # grep -c counts LINES containing the pattern, and every <loc> is on
  # its own line, so this is the URL count.
  #
  # The URL is built from URL_BASE so a test can point the check at a
  # local stub server (STUB_URL_BASE=http://127.0.0.1:PORT) while the
  # per-domain routing is exercised by the stub's Host-header lookup.
  local host="$1"
  fetch_sitemap "$host" | grep -c "<loc>"
}

count_family_urls() {
  local host="$1"
  fetch_sitemap "$host" | grep -c "<loc>[^<]*/family/"
}

count_lineage_urls() {
  local host="$1"
  fetch_sitemap "$host" | grep -c "<loc>[^<]*/lineages/"
}

# The published dish count, from the API.
api_dish_count() {
  curl -s --max-time 60 "${API_BASE}/api/dishes?status=published&limit=1" 2>/dev/null |
    sed -n 's/.*"total"[[:space:]]*:[[:space:]]*\([0-9][0-9]*\).*/\1/p' |
    head -1
}

FAILED=0
RESULTS=()
COUNTS=()

echo "=== deriving the expected sitemap URL count ==="

DISHES="$(api_dish_count)"
if [ -z "$DISHES" ] || [ "$DISHES" -eq 0 ] 2>/dev/null; then
  echo "  ::error::could not read the published dish count from ${API_BASE}/api/dishes"
  echo "  ::error::the expectation cannot be derived, so the check cannot run"
  exit 1
fi
echo "  dishes (published, from the API): $DISHES"

# The families and lineages are read from the FIRST domain's sitemap,
# because "has at least one dish behind it" is a build property. The
# count is then applied to both.
FIRST_HOST="${DOMAIN_LIST[0]}"
FAMILIES="$(count_family_urls "$FIRST_HOST")"
LINEAGES="$(count_lineage_urls "$FIRST_HOST")"
STATIC=2  # the root and the /dishes index

DERIVED=$((DISHES + FAMILIES + LINEAGES + STATIC))
echo "  families (content-bearing):       $FAMILIES"
echo "  lineages (content-bearing):       $LINEAGES"
echo "  static (root + /dishes):          $STATIC"
echo "  derived expected count:           $DERIVED"

# An explicit argument overrides the derived value (the tests use it).
EXPECTED="${1:-$DERIVED}"
if [ -n "${1:-}" ]; then
  echo "  (overridden by the argument: $EXPECTED)"
fi

echo "=== the post-deploy sitemap check (expecting $EXPECTED URLs on each domain) ==="
for host in "${DOMAIN_LIST[@]}"; do
  n=$(count_urls "$host")
  COUNTS+=("$n")
  if [ -z "$n" ] || [ "$n" -eq 0 ] 2>/dev/null; then
    echo "  ::error::$host/sitemap-en.xml returned no URLs — the sitemap is missing or the site is down"
    RESULTS+=("$host: FAILED (no URLs)")
    FAILED=1
    continue
  fi
  if [ "$n" -ne "$EXPECTED" ]; then
    echo "  ::error::$host/sitemap-en.xml has $n URLs, expected $EXPECTED"
    RESULTS+=("$host: $n (expected $EXPECTED)")
    FAILED=1
  else
    echo "  $host/sitemap-en.xml: $n URLs OK"
    RESULTS+=("$host: $n OK")
  fi
done

# The two domains must AGREE, even if both differ from the expectation —
# a disagreement means one of them is a stale build, which is the
# specific failure this check exists to catch.
if [ "${#RESULTS[@]}" -eq 2 ]; then
  a=$(echo "${RESULTS[0]}" | awk '{print $2}')
  b=$(echo "${RESULTS[1]}" | awk '{print $2}')
  if [ "$a" != "$b" ]; then
    echo "  ::error::the two domains DISAGREE: ${RESULTS[0]} vs ${RESULTS[1]}"
    echo "  ::error::one of them is a stale build. Compare the images' timestamps:"
    echo "  ::error::  docker exec gustale-web-geo sh -c 'ls -la --time-style=full-iso /usr/share/nginx/html/sitemap-en.xml'"
    echo "  ::error::  docker exec gustale-web-recipes sh -c 'ls -la --time-style=full-iso /usr/share/nginx/html/sitemap-en.xml'"
    FAILED=1
  fi
fi

echo "=== the post-deploy sitemap check: $([ "$FAILED" = "0" ] && echo PASSED || echo FAILED) ==="
exit "$FAILED"
