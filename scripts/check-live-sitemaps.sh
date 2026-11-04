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
# USAGE
# -----
#   scripts/check-live-sitemaps.sh [expected-url-count]
#
# The expected count defaults to 1531 (1,474 published dishes + 43
# content-bearing families + 12 content-bearing lineages + 2 static
# URLs). Pass a different number to check a different expectation.
#
# EXIT CODES
# ----------
#   0  both domains serve the expected count, and they agree
#   1  a mismatch, a failure, or a disagreement between the domains
set -uo pipefail

EXPECTED="${1:-1531}"

# The sitemap is an INDEX (sitemap.xml -> sitemap-<locale>.xml), and the
# per-locale file is large — without --compressed the transfer is
# truncated and the count comes out wrong (~46 URLs).
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

count_urls() {
  # grep -c counts LINES containing the pattern, and every <loc> is on
  # its own line, so this is the URL count.
  #
  # The URL is built from URL_BASE so a test can point the check at a
  # local stub server (STUB_URL_BASE=http://127.0.0.1:PORT) while the
  # per-domain routing is exercised by the stub's Host-header lookup.
  local host="$1"
  curl -s --compressed --max-time 60 \
    -H "Host: ${host}" \
    "${URL_BASE}${host}/sitemap-en.xml" 2>/dev/null | grep -c "<loc>"
}

FAILED=0
RESULTS=()

echo "=== the post-deploy sitemap check (expecting $EXPECTED URLs on each domain) ==="
for host in "${DOMAIN_LIST[@]}"; do
  n=$(count_urls "$host")
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
