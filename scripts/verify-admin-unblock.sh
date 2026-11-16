#!/usr/bin/env bash
# Prove the four conditions of the /admin move to gustale.com.
#
# THE CONDITIONS (the owner's decision, 2026-11-16)
# ------------------------------------------------
#   1. /admin AND /api/admin/* are reachable on gustale.com (same
#      origin), and /api/admin/* is STILL BLOCKED on api.gustale.com.
#   2. Logged out, every /api/admin/* route returns 401 or 403.
#   3. Logged out, the static admin shell renders NO data.
#   4. Signed in as admin, the admin editor loads and saves.
#
# Conditions 1-3 are proven here, from OUTSIDE, against a live origin.
# Condition 4 needs a signed-in session and is proven in the browser.
#
# USAGE
# -----
#   scripts/verify-admin-unblock.sh [origin]
#
# The default origin is https://gustale.com. Pass a different one to
# run it against staging:
#
#   scripts/verify-admin-unblock.sh https://staging.gustale.com
#
# The staging origin needs the basic-auth credential. Pass it as a
# FILE (never as an argument, never in chat):
#
#   scripts/verify-admin-unblock.sh https://staging.gustale.com --cred-file /path/to/cred
#
# ...where the file holds "username:password" on one line.
set -uo pipefail

ORIGIN="${1:-https://gustale.com}"
CRED_FILE=""
shift || true
while [ $# -gt 0 ]; do
  case "$1" in
    --cred-file) CRED_FILE="${2:-}"; shift 2 ;;
    *) shift ;;
  esac
done

CURL=(curl -sS --max-time 15)
if [ -n "$CRED_FILE" ]; then
  [ -f "$CRED_FILE" ] || { echo "FAILED: no credential file at $CRED_FILE" >&2; exit 1; }
  CURL=(curl -sS --max-time 15 --netrc-file "$CRED_FILE")
fi

PASS=0
FAIL=0
ok()   { PASS=$((PASS+1)); printf '  \033[32m✓\033[0m %s\n' "$1"; }
bad()  { FAIL=$((FAIL+1)); printf '  \033[31m✗\033[0m %s\n' "$1"; }
head2() { echo; echo "--- $1"; }

echo "=== the /admin proof, against $ORIGIN ==="

# ─────────────────────────────────────────────────────────────────────────
head2 "1. the reachability matrix"
# ─────────────────────────────────────────────────────────────────────────
# The API host must still refuse the admin API. This is the condition
# that the api.gustale.com block is NOT being changed.
for p in /api/admin/lookups /api/admin/stats /api/admin/dishes; do
  code=$("${CURL[@]}" -o /dev/null -w '%{http_code}' "https://api.gustale.com$p" 2>/dev/null || echo 000)
  if [ "$code" = "404" ]; then
    ok "api.gustale.com$p is still blocked (404)"
  else
    bad "api.gustale.com$p returned $code — it MUST be 404"
  fi
done

# The site host must now serve the admin shell (200) and proxy the
# admin API (which answers 401 logged out, NOT 404 — the difference
# proves the route exists and the API's own auth is what refuses).
for p in /admin /admin/dishes /admin/translations; do
  code=$("${CURL[@]}" -o /dev/null -w '%{http_code}' "$ORIGIN$p" 2>/dev/null || echo 000)
  if [ "$code" = "200" ]; then
    ok "$ORIGIN$p serves the admin shell (200)"
  else
    bad "$ORIGIN$p returned $code — it MUST be 200"
  fi
done

# ─────────────────────────────────────────────────────────────────────────
head2 "2. every /api/admin/* route, logged out, is 401 or 403"
# ─────────────────────────────────────────────────────────────────────────
# EVERY route the admin API exposes. A route that is not in this list
# is a route that is not proven.
ADMIN_ROUTES=(
  "/api/admin/lookups"
  "/api/admin/stats"
  "/api/admin/dishes"
  "/api/admin/dishes?limit=5"
  "/api/admin/dishes/moussaka-greek"
  "/api/admin/dishes/moussaka-greek/sources"
  "/api/admin/dishes/moussaka-greek/sources/00000000-0000-0000-0000-000000000000"
  "/api/admin/translations/review-queue"
  "/api/admin/translations/stale-queue"
  "/api/admin/translations/proposals"
  "/api/admin/translations/summary"
  "/api/admin/translations/00000000-0000-0000-0000-000000000000/propose"
  "/api/admin/translations/00000000-0000-0000-0000-000000000000/resolve"
  "/api/admin/translations/00000000-0000-0000-0000-000000000000/review"
)

for p in "${ADMIN_ROUTES[@]}"; do
  code=$("${CURL[@]}" -o /dev/null -w '%{http_code}' "$ORIGIN$p" 2>/dev/null || echo 000)
  case "$code" in
    401|403) ok "GET  $p -> $code" ;;
    404)     bad "GET  $p -> 404 (the route is missing or the params are invalid — NOT proven)" ;;
    *)       bad "GET  $p -> $code (MUST be 401 or 403)" ;;
  esac
done

# The WRITE routes, with the methods they use.
for spec in \
  "POST|/api/admin/dishes/moussaka-greek/sources" \
  "POST|/api/admin/translations/00000000-0000-0000-0000-000000000000/propose" \
  "POST|/api/admin/translations/00000000-0000-0000-0000-000000000000/resolve" \
  "POST|/api/admin/translations/00000000-0000-0000-0000-000000000000/review" \
  "PATCH|/api/admin/dishes/moussaka-greek/sources/00000000-0000-0000-0000-000000000000" \
  "DELETE|/api/admin/dishes/moussaka-greek/sources/00000000-0000-0000-0000-000000000000" \
  "PATCH|/api/dishes/moussaka-greek" ; do
  m="${spec%%|*}"; p="${spec#*|}"
  code=$("${CURL[@]}" -o /dev/null -w '%{http_code}' -X "$m" -H "Content-Type: application/json" -d '{}' "$ORIGIN$p" 2>/dev/null || echo 000)
  case "$code" in
    401|403) ok "$m  $p -> $code" ;;
    *)       bad "$m  $p -> $code (MUST be 401 or 403)" ;;
  esac
done

# ─────────────────────────────────────────────────────────────────────────
head2 "3. the static admin shell renders NO data"
# ─────────────────────────────────────────────────────────────────────────
# The shell must be a shell: the admin content is a React island that
# fetches at runtime, so nothing about a dish may be in the HTML.
for p in /admin /admin/dishes /admin/dishes/moussaka-greek; do
  body=$("${CURL[@]}" "$ORIGIN$p" 2>/dev/null || echo "")
  if [ -z "$body" ]; then
    bad "$p returned no body"
    continue
  fi
  # Data markers: a real dish name, an ingredient, a count.
  hits=$(printf '%s' "$body" | grep -ioE 'moussaka|bakso|feijoada|risotto|tacos-al-pastor|ingredients|servings|calories|citation' | sort -u | tr '\n' ',' | sed 's/,$//')
  if [ -z "$hits" ]; then
    ok "$p carries no dish data"
  else
    bad "$p contains data markers: $hits"
  fi
  # The shell must be marked noindex.
  if printf '%s' "$body" | grep -qi '<meta name="robots" content="noindex'; then
    ok "$p carries noindex"
  else
    bad "$p does NOT carry noindex"
  fi
done

# The robots.txt must still disallow /admin.
robots=$("${CURL[@]}" "$ORIGIN/robots.txt" 2>/dev/null || echo "")
if printf '%s' "$robots" | grep -qE '^Disallow: /admin'; then
  ok "robots.txt still has 'Disallow: /admin'"
else
  bad "robots.txt does NOT disallow /admin"
fi

# ─────────────────────────────────────────────────────────────────────────
head2 "the summary"
# ─────────────────────────────────────────────────────────────────────────
echo "  $PASS passed, $FAIL failed"
if [ "$FAIL" -ne 0 ]; then
  echo
  echo "FAILED: the /admin conditions are NOT all met."
  exit 1
fi
echo
echo "Conditions 1-3 are proven. Condition 4 (signed in, the editor"
echo "loads and saves) needs a browser with an admin session."
exit 0
