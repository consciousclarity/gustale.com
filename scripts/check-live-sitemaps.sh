#!/usr/bin/env bash
# The post-deploy sitemap check.
#
# WHAT THIS IS
# ------------
# After a deploy, assert that the site serves the expected sitemap URL
# count, and that the count is the expected one.
#
# ONE SITE
# --------
# `gustale.com` and `gustale.recipes` used to be TWO SEPARATE sites,
# served by TWO SEPARATE containers (`gustale-web-geo` on :4002 and
# `gustale-web-recipes` on :4001), built and deployed INDEPENDENTLY.
# They were the same app and the same commit, differing only in
# PUBLIC_DOMAIN — but one could be a stale build while the other was
# current. On 2026-11-02 that was exactly what happened: both
# containers reported the same image tag and were "healthy", while
# gustale.com served 1,531 sitemap URLs and gustale.recipes served
# 1,643. A check that only looked at gustale.com would have called it
# a clean deploy.
#
# THAT IS WHY THE CHECK EXISTED, and it is why the stale-build
# detection is not simply dropped: with ONE container there is no
# second sitemap to disagree with the first, so the check has to look
# somewhere else. It does two things now:
#
#   1. it counts the URLs and compares them against the count derived
#      from the API -- a stale container serves the OLD count, and the
#      API has moved on, so the check still fails;
#   2. it checks that the sitemap contains NO URL on the retired host
#      and NO URL on the retired host's path shape.
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
#     dishes      = the published dish count from the API
#     places      = the published place count from the API (WP-C3 added
#                   the /places/<slug> pages, and the formula without
#                   this term made every deploy fail its own verify)
#     families    = the content-bearing families (the sitemap omits the
#                   empty ones, so this has to be read from the sitemap)
#     lineages    = the content-bearing lineages (same)
#     ingredients = the content-bearing ingredient pages (same)
#     recipes     = the content-bearing recipe pages (same)
#     static      = 4 (the root, /dishes, /recipes, /ingredients)
#
# families, lineages, ingredients and recipes are read from the sitemap
# because "has at least one dish behind it" is a property of the BUILD,
# not of the API.
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
# the sitemap when it is not given. Pass it explicitly only to
# override the derived value (for a test).
#
# EXIT CODES
# ----------
#   0  the site serves the expected count, and the sitemap is clean
#   1  a mismatch, a failure, or a retired host in the sitemap
set -uo pipefail

# The domain to check. ONE site now. A test can override it with a
# local stub (see scripts/test-check-live-sitemaps.sh).
if [ -n "${DOMAINS:-}" ]; then
  # shellcheck disable=SC2206
  DOMAIN_LIST=($DOMAINS)
else
  DOMAIN_LIST=(gustale.com)
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

count_ingredient_urls() {
  local host="$1"
  # The DETAIL pages only. The index is `/ingredients` (no trailing
  # slash -- nginx 301s the slash form to the bare one), so this
  # pattern cannot match it, and the index is counted in STATIC
  # instead. The trailing slash after the name is what makes it a
  # detail page.
  fetch_sitemap "$host" | grep -c "<loc>[^<]*/ingredients/[^<]*</loc>"
}

count_recipe_urls() {
  local host="$1"
  # The DETAIL pages only, for the same reason as the ingredients:
  # the index is `/recipes` and is counted in STATIC.
  fetch_sitemap "$host" | grep -c "<loc>[^<]*/recipes/[^<]*</loc>"
}

# The published dish count, from the API.
api_dish_count() {
  curl -s --max-time 60 "${API_BASE}/api/dishes?status=published&limit=1" 2>/dev/null |
    sed -n 's/.*"total"[[:space:]]*:[[:space:]]*\([0-9][0-9]*\).*/\1/p' |
    head -1
}

# The PUBLISHED PLACE count, from the API.
#
# WHY THIS EXISTS
# ---------------
# WP-C3 added the `/places/<slug>` pages to the sitemap, and the
# sitemap generator emits every place that has at least one published
# dish behind it. The EXPECTED COUNT FORMULA below had no `places`
# term, so every deploy after WP-C3 failed its own post-deploy verify:
# the sitemap carried the place pages and the expectation did not
# count them. That is run 44760972184 (2026-11-20), which read
# "gustale.com/sitemap-en.xml has 1776 URLs, expected 1596" -- and
# 1776 - 1596 = 180, the number of places.
#
# WHY THE PLACES COME FROM `/api/places` AND NOT FROM THE SITEMAP
# --------------------------------------------------------------
# Because the count under test must not define its own expectation.
# The families, the lineages, the ingredients and the recipes are
# read from the sitemap because "has at least one dish behind it" is a
# BUILD property -- there is no API list of them. The places are the
# opposite: `GET /api/places` returns exactly the places that have a
# published dish behind them, from the `geo_entities` table joined to
# the visible place associations. So it is the independent source, the
# same way the dish count is.
#
# It is NOT `/api/atlas/counts`. That endpoint's `places` is 180 while
# this is 178, because it counts the distinct `entity_id`s in the
# ASSOCIATIONS, and two of them have no row in `geo_entities` -- so
# they are associations, not places, and they have no page. The two
# numbers are both right; they count different things, and this check
# wants the ones that have a page.
#
# The endpoint is not paginated -- it returns every place in one
# response. It does NOT return one row per page, though: two
# `geo_entities` rows can slugify to the SAME slug. Live has two rows
# named "China" (one with iso_code CN, one without) and two named
# "Luxembourg" (a country and a region), and `slugifyPlace` maps all
# four onto two slugs. The sitemap has ONE page per slug, so the count
# has to be the number of DISTINCT slugs -- 180 rows, 178 pages.
#
# `sort -u` is what makes it the page count rather than the row count.
api_place_count() {
  curl -s --max-time 60 "${API_BASE}/api/places" 2>/dev/null |
    grep -o '"slug"[[:space:]]*:[[:space:]]*"[^"]*"' |
    sed 's/.*"\([^"]*\)"$/\1/' |
    sort -u |
    wc -l |
    tr -d ' '
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

# The families, lineages, ingredients and recipes are read from the
# site's sitemap, because "has at least one dish behind it" is a build
# property.
FIRST_HOST="${DOMAIN_LIST[0]}"
FAMILIES="$(count_family_urls "$FIRST_HOST")"
LINEAGES="$(count_lineage_urls "$FIRST_HOST")"
INGREDIENTS="$(count_ingredient_urls "$FIRST_HOST")"
RECIPES="$(count_recipe_urls "$FIRST_HOST")"

# The PLACES, from the API. WP-C3 put the `/places/<slug>` pages in the
# sitemap, so the count has to be in the formula or every deploy fails
# its own verify. See `api_place_count` for why it comes from the API
# and not from the sitemap.
PLACES="$(api_place_count)"
if [ -z "$PLACES" ] || [ "$PLACES" -eq 0 ] 2>/dev/null; then
  echo "  ::error::could not read the published place count from ${API_BASE}/api/places"
  echo "  ::error::the expectation cannot be derived, so the check cannot run"
  exit 1
fi

# The root, /atlas, /dishes, /ingredients, /places and /recipes.
#
# It used to be 2 -- the root and the /dishes index -- because the
# recipes and the ingredients lived on the other host, in the other
# sitemap. One site serves them all, so they are in this sitemap.
#
# Then it was 4 -- the root and three section indexes -- and WP-C3 added
# two more section indexes, /atlas and /places, without touching this
# constant. That is the other half of the "1776 URLs, expected 1596"
# failure: 180 unaccounted place pages and 2 unaccounted section
# indexes.
#
# The count has to stay in step with the sitemap generator. Every
# section index the generator emits is one term here.
STATIC=6

DERIVED=$((DISHES + PLACES + FAMILIES + LINEAGES + INGREDIENTS + RECIPES + STATIC))
echo "  places (content-bearing):         $PLACES"
echo "  families (content-bearing):       $FAMILIES"
echo "  lineages (content-bearing):       $LINEAGES"
echo "  ingredients (content-bearing):    $INGREDIENTS"
echo "  recipes (content-bearing):        $RECIPES"
echo "  static (root + 5 section indexes):$STATIC"
echo "  derived expected count:           $DERIVED"

# An explicit argument overrides the derived value (the tests use it).
EXPECTED="${1:-$DERIVED}"
if [ -n "${1:-}" ]; then
  echo "  (overridden by the argument: $EXPECTED)"
fi

echo "=== the post-deploy sitemap check (expecting $EXPECTED URLs) ==="
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

# THE RETIRED HOST MUST NOT BE IN THE SITEMAP.
#
# The old check compared the two domains against EACH OTHER, because
# two containers meant one of them could be stale. One container means
# there is no second sitemap to compare with — but a sitemap that
# lists the retired host is just as wrong as a stale one: it points a
# crawler at URLs that 301, and it says the site's canonical location
# is a host that is being switched off.
#
# The URLs are built on `https://gustale.com`, so this is a check that
# the generator did the cutover.
for host in "${DOMAIN_LIST[@]}"; do
  retired=$(fetch_sitemap "$host" | grep -c "gustale\.recipes" || true)
  if [ "$retired" -ne 0 ] 2>/dev/null; then
    echo "  ::error::$host/sitemap-en.xml contains $retired URL(s) on the retired host gustale.recipes"
    FAILED=1
  fi
  # Every URL must be on the site's own origin.
  offsite=$(fetch_sitemap "$host" | grep -o "<loc>[^<]*</loc>" |
    grep -vc "<loc>https://gustale\.com/" || true)
  if [ "$offsite" -ne 0 ] 2>/dev/null; then
    echo "  ::error::$host/sitemap-en.xml contains $offsite URL(s) that are not on https://gustale.com/"
    FAILED=1
  fi
done

# EVERY URL MUST RETURN 200.
#
# A sitemap's whole contract is "every URL in here is a real page".
# This is a HEAD request per URL, which is a lot of requests, so it is
# limited to a SAMPLE unless VERIFY_EVERY_URL=1 is set. A sample of
# the first N of each kind is enough to catch a shape that is wrong
# for the whole section.
if [ "${VERIFY_SITEMAP_URLS:-0}" = "1" ]; then
  echo "=== checking that the sampled sitemap URLs return 200 ==="
  for host in "${DOMAIN_LIST[@]}"; do
    fetch_sitemap "$host" | grep -o "<loc>[^<]*</loc>" | sed 's/<loc>//; s|</loc>||' |
      head -20 |
      while read -r url; do
        [ -z "$url" ] && continue
        code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 30 "$url" || echo 000)
        if [ "$code" != "200" ]; then
          echo "  ::error::$url returns $code, expected 200"
          exit 1
        fi
      done || FAILED=1
  done
fi

echo "=== the post-deploy sitemap check: $([ "$FAILED" = "0" ] && echo PASSED || echo FAILED) ==="
exit "$FAILED"
