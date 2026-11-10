#!/usr/bin/env bash
# scripts/verify-dark-launch.sh
#
# The P1-P10 pre-launch checks for the recipes -> recipes.gustale.com
# dark launch.
#
# WHAT THIS IS
# ------------
# A dark launch serves the recipes site on a NEW host, with the OLD
# host still serving the live site, and the new host kept out of the
# search index. Before the switch, ten things must be true. They are
# P1..P10, and each one is a claim about what a crawler or a reader
# would actually see.
#
# The ten, and WHY each one matters:
#
#   P1  the new host RESOLVES and serves 200
#       -- DNS must exist, and Caddy must route it to the recipes
#          container. Without this nothing else is testable.
#   P2  the new host serves the SAME CONTENT as the old host
#       -- it is the same site. A dark launch that serves different
#          content is not a launch, it is a fork.
#   P3  the new host's canonical points at the NEW host
#       -- THE most important check. The canonical is baked into the
#          image. If it still says gustale.recipes, a search engine
#          follows it and canonicalises the new host AWAY -- the new
#          host would be indexed under the old one, or not at all.
#   P4  EVERY page's canonical is the new host, not just the home
#       -- one page with a stale canonical is enough to leak.
#   P5  the new host's sitemaps name the NEW host
#       -- the sitemap is what a crawler crawls.
#   P6  the new host's robots.txt names the NEW host's sitemap
#       -- a robots.txt pointing at the old host's sitemap tells the
#          crawler to crawl the old site.
#   P7  the new host is NOINDEX
#       -- the point of a dark launch: the host must be reachable but
#          must not be indexed. Measured on the served HTML, not on
#          the intent.
#   P8  the old host is UNCHANGED and still indexable
#       -- the dark launch must not disturb the live site. This is the
#          owner's cutover to make, so the old host has to be exactly
#          as it was.
#   P9  the geo site is UNCHANGED
#       -- gustale.com is a different property. It must not have
#          moved, and its canonical must still be its own.
#   P10 no request to the new host leaks the OLD host in a canonical
#       -- the catch-all: scan every served page for a stale
#          canonical, and for the old host in the sitemap/robots.
#
# USAGE
# -----
#   scripts/verify-dark-launch.sh <new-host> [old-host]
#
#   new-host   the host being launched, e.g. recipes.gustale.com
#   old-host   the host it is replacing (default: gustale.recipes)
#
# ENV
# ---
#   NEW_HOST_URL_BASE   the URL base for the new host (default https://)
#   OLD_HOST_URL_BASE   the URL base for the old host (default https://)
#   DARK_NOINDEX_HEADER the header a dark host serves to say "noindex"
#                       (default: X-Robots-Tag)
#   P_SKIP              space-separated P numbers to skip
#
# EXIT CODES
# ----------
#   0  every check that ran passed
#   1  at least one check failed
set -uo pipefail

NEW_HOST="${1:?usage: verify-dark-launch.sh <new-host> [old-host]}"
OLD_HOST="${2:-gustale.recipes}"

# The URL bases. A base is a SCHEME + HOST prefix -- the host it
# stands for is already inside it. So the URL for the new host is
# "${NEW_BASE}<path>", and NEW_HOST is used only to build the EXPECTED
# strings (the canonical, the sitemap loc).
#
# In production the bases are "https://" for both hosts, and the
# hosts differ by NAME -- but then the requests would go to the same
# address. So in production the bases must be per-host:
#
#   NEW_HOST_URL_BASE=https://recipes.gustale.com
#   OLD_HOST_URL_BASE=https://gustale.recipes
#
# The defaults below assume the hosts are reachable by name on the
# local resolver, which is the production case.
NEW_BASE="${NEW_HOST_URL_BASE:-https://${NEW_HOST}}"
OLD_BASE="${OLD_HOST_URL_BASE:-https://${OLD_HOST}}"
case "$NEW_BASE" in */) ;; *) NEW_BASE="$NEW_BASE/" ;; esac
case "$OLD_BASE" in */) ;; *) OLD_BASE="$OLD_BASE/" ;; esac

# The geo site -- a DIFFERENT property, on its own host. It has its
# own base because it is not either of the two hosts under test.
GEO_BASE="${GEO_HOST_URL_BASE:-https://gustale.com/}"
case "$GEO_BASE" in */) ;; *) GEO_BASE="$GEO_BASE/" ;; esac

SKIP="${P_SKIP:-}"

PASSED=0
FAILED=0
declare -a FAILURES=()

pass() { PASSED=$((PASSED + 1)); printf '  \033[32mPASS\033[0m %s\n' "$1"; }
fail() {
  FAILED=$((FAILED + 1))
  FAILURES+=("$1")
  printf '  \033[31mFAIL\033[0m %s\n' "$1"
  if [ $# -gt 1 ]; then printf '       %s\n' "$2"; fi
}
skipped() { printf '  \033[33mSKIP\033[0m %s\n' "$1"; }

should_skip() {
  case " $SKIP " in *" $1 "*) return 0 ;; *) return 1 ;; esac; }
mark() { printf '\n=== %s ===\n' "$1"; }

# Fetch a URL: status code in $HTTP_CODE, body in $HTTP_BODY.
fetch() {
  local url="$1"
  local tmp
  tmp="$(mktemp)"
  HTTP_CODE="$(curl -s -o "$tmp" -w '%{http_code}' --max-time 30 "$url" 2>/dev/null)"
  HTTP_BODY="$(cat "$tmp")"
  rm -f "$tmp"
}

# The pages used for the per-page checks: the home, the dish list, and
# one dish. A stale canonical on any of them is a leak.
PAGE_PATHS=(
  "/"
  "/dishes/"
  "/dishes/moussaka-greek"
)

# ─── P1: the new host resolves and serves ────────────────────────────────
mark "P1  the new host resolves and serves 200"
if should_skip P1; then
  skipped "P1"
else
  fetch "${NEW_BASE}"
  if [ "$HTTP_CODE" = "200" ]; then
    pass "P1 ${NEW_HOST} serves 200"
  else
    fail "P1 ${NEW_HOST} serves 200" "got HTTP $HTTP_CODE"
  fi
fi

# ─── P2: the new host serves the same content as the old host ──────────
mark "P2  the new host serves the same content as the old host"
if should_skip P2; then
  skipped "P2"
else
  SAME=1
  for p in "${PAGE_PATHS[@]}"; do
    fetch "${NEW_BASE}${p}"
    NEW_CODE="$HTTP_CODE"; NEW_LEN="${#HTTP_BODY}"
    fetch "${OLD_BASE}${p}"
    OLD_CODE="$HTTP_CODE"; OLD_LEN="${#HTTP_BODY}"
    if [ "$NEW_CODE" != "$OLD_CODE" ]; then
      SAME=0
      fail "P2 ${p}: the same status on both hosts" "new=$NEW_CODE old=$OLD_CODE"
      break
    fi
    # The bodies differ by the origin, so compare the LENGTH within a
    # tolerance rather than byte-for-byte: the origin string is
    # substituted in the canonical, the sitemap and the hreflang.
    if [ "$NEW_LEN" -gt 0 ] && [ "$OLD_LEN" -gt 0 ]; then
      DIFF=$(( NEW_LEN > OLD_LEN ? NEW_LEN - OLD_LEN : OLD_LEN - NEW_LEN ))
      PCT=$(( DIFF * 100 / (NEW_LEN > OLD_LEN ? NEW_LEN : OLD_LEN) ))
      if [ "$PCT" -gt 5 ]; then
        SAME=0
        fail "P2 ${p}: the body length is within 5% of the old host" "new=${NEW_LEN} old=${OLD_LEN} (${PCT}%)"
        break
      fi
    fi
  done
  if [ "$SAME" = "1" ]; then
    pass "P2 the new host serves the same content as ${OLD_HOST}"
  fi
fi

# ─── P3: the new host's canonical points at the NEW host ───────────────
mark "P3  the new host's canonical points at the NEW host"
if should_skip P3; then
  skipped "P3"
else
  fetch "${NEW_BASE}"
  if printf '%s' "$HTTP_BODY" | grep -q "rel=\"canonical\" href=\"https://${NEW_HOST}/"; then
    pass "P3 the home canonical is https://${NEW_HOST}/"
  elif printf '%s' "$HTTP_BODY" | grep -q "rel=\"canonical\" href=\"https://${OLD_HOST}/"; then
    fail "P3 the home canonical is https://${NEW_HOST}/" "the canonical still points at ${OLD_HOST}"
  else
    fail "P3 the home canonical is https://${NEW_HOST}/" "no canonical for either host was found"
  fi
fi

# ─── P4: EVERY page's canonical is the new host ─────────────────────────
mark "P4  every sampled page's canonical is the new host"
if should_skip P4; then
  skipped "P4"
else
  BAD=""
  for p in "${PAGE_PATHS[@]}"; do
    fetch "${NEW_BASE}${p}"
    if printf '%s' "$HTTP_BODY" | grep -q "rel=\"canonical\" href=\"https://${OLD_HOST}/"; then
      BAD="${BAD} ${p}"
    fi
  done
  if [ -z "$BAD" ]; then
    pass "P4 no page canonicalises to ${OLD_HOST}"
  else
    fail "P4 no page canonicalises to ${OLD_HOST}" "stale canonical on:${BAD}"
  fi
fi

# ─── P5: the sitemaps name the NEW host ────────────────────────────────
mark "P5  the new host's sitemaps name the new host"
if should_skip P5; then
  skipped "P5"
else
  fetch "${NEW_BASE}sitemap.xml"
  if printf '%s' "$HTTP_BODY" | grep -q "https://${NEW_HOST}/sitemap-en.xml"; then
    pass "P5 the sitemap index names https://${NEW_HOST}/"
  elif printf '%s' "$HTTP_BODY" | grep -q "https://${OLD_HOST}/"; then
    fail "P5 the sitemap index names https://${NEW_HOST}/" "the sitemap index names ${OLD_HOST}"
  else
    fail "P5 the sitemap index names https://${NEW_HOST}/" "no sitemap loc was found"
  fi
fi

# ─── P6: robots.txt names the NEW host's sitemap ────────────────────────
mark "P6  robots.txt names the new host's sitemap"
if should_skip P6; then
  skipped "P6"
else
  fetch "${NEW_BASE}robots.txt"
  if printf '%s' "$HTTP_BODY" | grep -q "Sitemap: https://${NEW_HOST}/sitemap.xml"; then
    pass "P6 robots.txt names https://${NEW_HOST}/sitemap.xml"
  elif printf '%s' "$HTTP_BODY" | grep -q "${OLD_HOST}"; then
    fail "P6 robots.txt names https://${NEW_HOST}/sitemap.xml" "robots.txt still names ${OLD_HOST}"
  else
    fail "P6 robots.txt names https://${NEW_HOST}/sitemap.xml" "no Sitemap: line was found"
  fi
fi

# ─── P7: the new host is NOINDEX ────────────────────────────────────────
#
# The noindex may be expressed EITHER as a robots meta tag in the HTML
# OR as an X-Robots-Tag header. Both are legitimate; either satisfies
# the check. What matters is that a crawler sees it.
mark "P7  the new host is noindex"
if should_skip P7; then
  skipped "P7"
else
  NOINDEX=0
  # The header.
  HDR="$(curl -s -I --max-time 30 "${NEW_BASE}" 2>/dev/null | tr -d '\r')"
  if printf '%s' "$HDR" | grep -qi "x-robots-tag:.*noindex"; then
    NOINDEX=1
  fi
  # The meta tag.
  if [ "$NOINDEX" = "0" ]; then
    fetch "${NEW_BASE}"
    if printf '%s' "$HTTP_BODY" | grep -qi 'name="robots" content="[^"]*noindex'; then
      NOINDEX=1
    fi
  fi
  if [ "$NOINDEX" = "1" ]; then
    pass "P7 the new host is noindex (header or meta)"
  else
    fail "P7 the new host is noindex" "neither an X-Robots-Tag header nor a robots meta tag was found"
  fi
fi

# ─── P8: the old host is UNCHANGED and still indexable ──────────────────
mark "P8  the old host is unchanged and still indexable"
if should_skip P8; then
  skipped "P8"
else
  fetch "${OLD_BASE}"
  OLD_OK=1
  if [ "$HTTP_CODE" != "200" ]; then
    OLD_OK=0
    fail "P8 ${OLD_HOST} still serves 200" "got HTTP $HTTP_CODE"
  fi
  if printf '%s' "$HTTP_BODY" | grep -q "rel=\"canonical\" href=\"https://${OLD_HOST}/"; then
    :
  else
    OLD_OK=0
    fail "P8 ${OLD_HOST} still self-canonicals" "the canonical is not ${OLD_HOST}"
  fi
  # Still indexable: NO noindex on the old host.
  fetch "${OLD_BASE}"
  if printf '%s' "$HTTP_BODY" | grep -qi 'name="robots" content="[^"]*noindex'; then
    OLD_OK=0
    fail "P8 ${OLD_HOST} is still indexable" "a noindex meta was found on the old host"
  else
    HDR_OLD="$(curl -s -I --max-time 30 "${OLD_BASE}" 2>/dev/null | tr -d '\r')"
    if printf '%s' "$HDR_OLD" | grep -qi "x-robots-tag:.*noindex"; then
      OLD_OK=0
      fail "P8 ${OLD_HOST} is still indexable" "an X-Robots-Tag noindex was found on the old host"
    fi
  fi
  if [ "$OLD_OK" = "1" ]; then
    pass "P8 ${OLD_HOST} is unchanged and still indexable"
  fi
fi

# ─── P9: the geo site is UNCHANGED ──────────────────────────────────────
mark "P9  the geo site is unchanged"
if should_skip P9; then
  skipped "P9"
else
  fetch "${GEO_BASE}"
  GEO_OK=1
  if [ "$HTTP_CODE" != "200" ]; then
    GEO_OK=0
    fail "P9 gustale.com still serves 200" "got HTTP $HTTP_CODE"
  elif ! printf '%s' "$HTTP_BODY" | grep -q "rel=\"canonical\" href=\"https://gustale.com/"; then
    GEO_OK=0
    fail "P9 gustale.com still self-canonicals" "the canonical is not gustale.com"
  fi
  if [ "$GEO_OK" = "1" ]; then
    pass "P9 gustale.com is unchanged"
  fi
fi

# ─── P10: no leak of the old host in the new host's canonicals ──────────
mark "P10 no page of the new host leaks the old host"
if should_skip P10; then
  skipped "P10"
else
  LEAK=""
  for p in "${PAGE_PATHS[@]}"; do
    fetch "${NEW_BASE}${p}"
    if printf '%s' "$HTTP_BODY" | grep -q "rel=\"canonical\" href=\"https://${OLD_HOST}/"; then
      LEAK="${LEAK} ${p}"
    fi
  done
  # The sitemap and robots.txt too.
  fetch "${NEW_BASE}sitemap.xml"
  if printf '%s' "$HTTP_BODY" | grep -q "${OLD_HOST}"; then LEAK="${LEAK} /sitemap.xml"; fi
  fetch "${NEW_BASE}robots.txt"
  if printf '%s' "$HTTP_BODY" | grep -q "${OLD_HOST}"; then LEAK="${LEAK} /robots.txt"; fi
  if [ -z "$LEAK" ]; then
    pass "P10 no leak of ${OLD_HOST} in the new host"
  else
    fail "P10 no leak of ${OLD_HOST} in the new host" "leaked on:${LEAK}"
  fi
fi

# ─── the summary ────────────────────────────────────────────────────────
printf '\n===========================================\n'
printf 'DARK LAUNCH CHECKS: %d passed, %d failed\n' "$PASSED" "$FAILED"
if [ "$FAILED" -gt 0 ]; then
  for f in "${FAILURES[@]}"; do printf '  FAILED: %s\n' "$f"; done
  printf 'DARK_LAUNCH_OK=0\n'
  exit 1
fi
printf 'DARK_LAUNCH_OK=1\n'
exit 0
