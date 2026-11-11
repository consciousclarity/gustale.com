#!/usr/bin/env bash
# scripts/test-verify-dark-launch.sh
#
# The P-test suite's own test: it must CATCH the failures it claims to
# catch.
#
# A check that always passes is worthless. This script stands up a stub
# that serves two hosts -- the "new" one and the "old" one -- and then
# runs the P suite against MUTATIONS of that stub, asserting that each
# mutation is DETECTED.
#
# The mutations are the four ways a dark launch goes wrong:
#
#   M1  the new host's canonical still points at the old host
#       (the baked-canonical bug -- the one that canonicalises the new
#       host away)
#   M2  the new host is not noindex (it would be indexed)
#   M3  the old host has been noindex'd (the live site was disturbed)
#   M4  the new host's sitemap names the old host
#
# And the baseline: with NO mutation, every check passes.
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

PORT="${PORT:-8791}"
STUB_DIR="$(mktemp -d)"
cleanup() { rm -rf "$STUB_DIR"; }
trap cleanup EXIT

PASSED=0
FAILED=0

ok()   { PASSED=$((PASSED + 1)); printf '  \033[32mPASS\033[0m %s\n' "$1"; }
bad()  { FAILED=$((FAILED + 1)); printf '  \033[31mFAIL\033[0m %s\n' "$1"; }

# ─── the stub ───────────────────────────────────────────────────────────
#
# It serves a small site whose content is generated from the MUTATION
# flags, so one stub can be the baseline or any mutant.
cat > "$STUB_DIR/stub.py" <<'PYEOF'
import http.server, socketserver, sys, os

NEW_HOST = os.environ.get("NEW_HOST", "recipes.gustale.com")
OLD_HOST = os.environ.get("OLD_HOST", "gustale.recipes")
# Mutations, as env flags.
M_CANONICAL = os.environ.get("M_CANONICAL") == "1"
M_NOINDEX = os.environ.get("M_NOINDEX") == "1"
M_OLD_NOINDEX = os.environ.get("M_OLD_NOINDEX") == "1"
M_SITEMAP = os.environ.get("M_SITEMAP") == "1"

def canonical(host):
    # The mutation: the new host's canonical names the OLD host.
    if host == NEW_HOST and M_CANONICAL:
        return f"https://{OLD_HOST}/"
    return f"https://{host}/"

def noindex(host):
    # A dark-launch host IS noindex -- that is the point of it. The
    # M_NOINDEX mutation removes that, and M_OLD_NOINDEX puts it on the
    # OLD host, which must never happen.
    if host == NEW_HOST and M_NOINDEX:
        return False
    if host == OLD_HOST and M_OLD_NOINDEX:
        return True
    if host == NEW_HOST:
        return True
    return False

class H(http.server.BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def _send(self, code, body, ctype="text/html; charset=utf-8", extra=None):
        raw = body.encode()
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(raw)))
        for k, v in (extra or {}).items():
            self.send_header(k, v)
        self.end_headers()
        self.wfile.write(raw)

    def do_HEAD(self):
        self.do_GET(head=True)

    def do_GET(self, head=False):
        host = globals().get("SELF_HOST", NEW_HOST)
        path = self.path.split("?")[0]

        if path == "/robots.txt":
            sitemap_host = OLD_HOST if (host == NEW_HOST and M_SITEMAP) else host
            body = (f"User-agent: *\nAllow: /\n\n"
                    f"Sitemap: https://{sitemap_host}/sitemap.xml\n")
            self._send(200, body, "text/plain; charset=utf-8")
            return

        if path == "/sitemap.xml":
            loc_host = OLD_HOST if (host == NEW_HOST and M_SITEMAP) else host
            body = ('<?xml version="1.0" encoding="UTF-8"?>\n'
                    '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
                    f'  <sitemap><loc>https://{loc_host}/sitemap-en.xml</loc></sitemap>\n'
                    '</sitemapindex>\n')
            self._send(200, body, "application/xml")
            return

        # The GEO site: a third stub stands for it, so it is reached by
        # PORT, not by path. Its own identity is gustale.com.
        if host == "gustale.com":
            body = ('<!doctype html><html><head><link rel="canonical" '
                    'href="https://gustale.com/"><title>Atlas</title></head>'
                    '<body>gustale.com ' + "pad " * 200 + '</body></html>')
            self._send(200, body)
            return

        # A page on the new or old host.
        idx = NOINDEX_MARKER
        ni = ""
        if noindex(host):
            ni = f'<meta name="robots" content="noindex, follow">'
        body = (f'<!doctype html><html><head>'
                f'<link rel="canonical" href="{canonical(host)}">'
                f'{ni}<title>Recipes</title></head>'
                f'<body>{"gustale.recipes " * 200}{idx}</body></html>')
        self._send(200, body)

NOINDEX_MARKER = "recipes-host"

if __name__ == "__main__":
    # argv[1] = the port, argv[2] = WHICH host this stub stands for.
    # Two stubs on two ports: one for the new host, one for the old.
    # The suite requests a bare address, so the Host header cannot
    # identify the host -- the stub's own identity must.
    globals()["SELF_HOST"] = sys.argv[2] if len(sys.argv) > 2 else NEW_HOST
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(("127.0.0.1", int(sys.argv[1])), H) as httpd:
        httpd.serve_forever()
PYEOF

# The stub must know which host is which -- it reads the Host header, so
# the requests must carry the right Host. curl -H is needed; the suite
# does not send a Host header, so the stub's default is used.
# To make the Host correct, the suite's URLs must carry the host --
# which they do NOT when the base is a bare address.
#
# So the stub resolves the host from the PATH prefix instead: the suite
# requests "/", "/dishes/" etc., and the BASE carries the host. That
# means the base must be per-host, which the suite supports via
# NEW_HOST_URL_BASE / OLD_HOST_URL_BASE -- but both hosts then need
# DIFFERENT bases, which the suite takes as one base each.
#
# The clean way: run TWO stubs on two ports -- one for the new host,
# one for the old -- and point the suite at each.

start_stub() {
  local port="$1"; local self_host="$2"; shift 2
  env "$@" NEW_HOST="recipes.gustale.com" OLD_HOST="gustale.recipes" \
    python3 "$STUB_DIR/stub.py" "$port" "$self_host" > "$STUB_DIR/server-$port.log" 2>&1 &
  echo $!
}

NEW_PORT=$((PORT))
OLD_PORT=$((PORT + 1))
GEO_PORT=$((PORT + 2))

wait_for() {
  for _ in $(seq 1 40); do
    if curl -s -o /dev/null --max-time 2 "http://127.0.0.1:$1/" ; then return 0; fi
    sleep 0.25
  done
  return 1
}

# The geo site is served by the OLD stub (it knows the /gustale.com
# path), so the geo base points at the old stub's port.
run_suite() {
  NEW_HOST_URL_BASE="http://127.0.0.1:$NEW_PORT/" \
  OLD_HOST_URL_BASE="http://127.0.0.1:$OLD_PORT/" \
  GEO_HOST_URL_BASE="http://127.0.0.1:$GEO_PORT/" \
    bash scripts/verify-dark-launch.sh recipes.gustale.com gustale.recipes 2>&1
}

printf '=== the P-suite test: every mutation must be DETECTED ===\n'

# ─── the baseline: no mutation, the suite passes ────────────────────────
printf '\n=== baseline (no mutation) ===\n'
PID_NEW="$(start_stub $NEW_PORT recipes.gustale.com)"
PID_OLD="$(start_stub $OLD_PORT gustale.recipes)"
PID_GEO="$(start_stub $GEO_PORT gustale.com)"
wait_for $NEW_PORT; wait_for $OLD_PORT; wait_for $GEO_PORT
OUT="$(run_suite)"; RC=$?
kill $PID_NEW $PID_OLD $PID_GEO 2>/dev/null; wait $PID_NEW $PID_OLD $PID_GEO 2>/dev/null
if [ "$RC" -eq 0 ]; then ok "the baseline passes every check"
else bad "the baseline passes every check" "rc=$RC"; printf '%s\n' "$OUT" | tail -25; fi
printf '%s\n' "$OUT" > "$STUB_DIR/baseline.txt"

# ─── M1: the new host's canonical still points at the old host ─────────
printf '\n=== M1: the new host canonicalises to the old host ===\n'
PID_NEW="$(start_stub $NEW_PORT recipes.gustale.com M_CANONICAL=1)"
PID_OLD="$(start_stub $OLD_PORT gustale.recipes)"
PID_GEO="$(start_stub $GEO_PORT gustale.com)"
wait_for $NEW_PORT; wait_for $OLD_PORT; wait_for $GEO_PORT
OUT="$(run_suite)"; RC=$?
kill $PID_NEW $PID_OLD $PID_GEO 2>/dev/null; wait $PID_NEW $PID_OLD $PID_GEO 2>/dev/null
if [ "$RC" -ne 0 ]; then ok "M1 DETECTED (rc=$RC)"
else bad "M1 DETECTED" "the suite passed with a stale canonical"; fi
printf '%s\n' "$OUT" | grep -E "FAIL|P3|P4|P10" | head -6
printf '%s\n' "$OUT" > "$STUB_DIR/m1.txt"

# ─── M2: the new host is not noindex ────────────────────────────────────
printf '\n=== M2: the new host is not noindex ===\n'
PID_NEW="$(start_stub $NEW_PORT recipes.gustale.com M_NOINDEX=1)"
PID_OLD="$(start_stub $OLD_PORT gustale.recipes)"
PID_GEO="$(start_stub $GEO_PORT gustale.com)"
wait_for $NEW_PORT; wait_for $OLD_PORT; wait_for $GEO_PORT
OUT="$(run_suite)"; RC=$?
kill $PID_NEW $PID_OLD $PID_GEO 2>/dev/null; wait $PID_NEW $PID_OLD $PID_GEO 2>/dev/null
if [ "$RC" -ne 0 ]; then ok "M2 DETECTED (rc=$RC)"
else bad "M2 DETECTED" "the suite passed with an indexable new host"; fi
printf '%s\n' "$OUT" | grep -E "FAIL|P7" | head -6

# ─── M3: the old host has been noindex'd ───────────────────────────────
printf '\n=== M3: the old host was noindexed ===\n'
PID_NEW="$(start_stub $NEW_PORT recipes.gustale.com)"
PID_OLD="$(start_stub $OLD_PORT gustale.recipes M_OLD_NOINDEX=1)"
wait_for $NEW_PORT; wait_for $OLD_PORT; wait_for $GEO_PORT
OUT="$(run_suite)"; RC=$?
kill $PID_NEW $PID_OLD $PID_GEO 2>/dev/null; wait $PID_NEW $PID_OLD $PID_GEO 2>/dev/null
if [ "$RC" -ne 0 ]; then ok "M3 DETECTED (rc=$RC)"
else bad "M3 DETECTED" "the suite passed with the old host noindexed"; fi
printf '%s\n' "$OUT" | grep -E "FAIL|P8" | head -6

# ─── M4: the new host's sitemap names the old host ─────────────────────
printf '\n=== M4: the new host sitemap names the old host ===\n'
PID_NEW="$(start_stub $NEW_PORT recipes.gustale.com M_SITEMAP=1)"
PID_OLD="$(start_stub $OLD_PORT gustale.recipes)"
PID_GEO="$(start_stub $GEO_PORT gustale.com)"
wait_for $NEW_PORT; wait_for $OLD_PORT; wait_for $GEO_PORT
OUT="$(run_suite)"; RC=$?
kill $PID_NEW $PID_OLD $PID_GEO 2>/dev/null; wait $PID_NEW $PID_OLD $PID_GEO 2>/dev/null
if [ "$RC" -ne 0 ]; then ok "M4 DETECTED (rc=$RC)"
else bad "M4 DETECTED" "the suite passed with a stale sitemap"; fi
printf '%s\n' "$OUT" | grep -E "FAIL|P5|P6|P10" | head -6

printf '\n===========================================\n'
printf 'DARK LAUNCH SUITE TEST: %d passed, %d failed\n' "$PASSED" "$FAILED"
if [ "$FAILED" -gt 0 ]; then
  printf 'DARK_LAUNCH_SUITE_TEST_OK=0\n'
  exit 1
fi
printf 'DARK_LAUNCH_SUITE_TEST_OK=1\n'
exit 0
