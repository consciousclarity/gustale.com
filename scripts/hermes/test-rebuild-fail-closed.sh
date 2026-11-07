#!/usr/bin/env bash
#
# The rebuild timer must FAIL CLOSED.
#
# Two ways it could silently deploy the wrong thing:
#
#   1. The git fetch fails. A failed fetch does NOT update origin/main
#      -- it FREEZES the ref at its old value. If the script then runs
#      `git checkout --force origin/main`, the checkout SUCCEEDS
#      against the stale ref and rolls the build dir BACKWARDS to an
#      old commit. This actually happened on 2026-11-03: the timer was
#      rolling the build dir back to 86c0444 every 30 minutes while
#      only reporting a fetch error.
#
#   2. The fetched commit is not a descendant of the deployed commit
#      (a force-push, a revert, a branch reset). Deploying it would
#      replace a working site with an older one.
#
# A guard that cannot be proven to fail is worse than no guard, so both
# cases are exercised here against a REAL git repo and the REAL
# rebuild script.
#
# These tests never build an image and never touch a container: the
# script must abort BEFORE it reaches the build step, and the test
# proves it by watching for the build marker.
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCRIPT="$SCRIPT_DIR/rebuild-web-live.sh"

fail=0
ok()  { echo "   PASS  $*"; }
bad() { echo "   FAIL  $*"; fail=1; }

echo "rebuild-web-live.sh fail-closed tests"

if [ ! -f "$SCRIPT" ]; then
  echo "   FAIL  $SCRIPT not found" >&2
  exit 1
fi

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

# ---------------------------------------------------------------------------
# A throwaway git repo that stands in for the build dir.
# ---------------------------------------------------------------------------
ORIGIN="$TMP/origin"
BUILD="$TMP/build"
mkdir -p "$ORIGIN" "$BUILD"
git -C "$ORIGIN" init -q -b main
git -C "$ORIGIN" config user.email t@example.invalid
git -C "$ORIGIN" config user.name "Test"

echo "base" > "$ORIGIN/f.txt"
git -C "$ORIGIN" add -A
git -C "$ORIGIN" commit -q -m "base"
BASE_SHA=$(git -C "$ORIGIN" rev-parse HEAD)

echo "second" >> "$ORIGIN/f.txt"
git -C "$ORIGIN" add -A
git -C "$ORIGIN" commit -q -m "second"
SECOND_SHA=$(git -C "$ORIGIN" rev-parse HEAD)

# The build dir clones the origin.
git -C "$BUILD" init -q -b main
git -C "$BUILD" remote add origin "$ORIGIN"
git -C "$BUILD" fetch -q --no-tags origin main
git -C "$BUILD" checkout -q --force origin/main

# The script is invoked with a build dir whose fetch ALWAYS fails, and
# with an API base that points at nothing (so the script cannot get
# past the content check either — but the point of the test is that it
# must abort at the FETCH, before any checkout or build).
#
# We shim `git` on PATH so that the `fetch` invocation fails while
# every other git invocation behaves normally. This is exactly the
# real-world failure: a permission error on the object write.
SHIM="$TMP/bin"
mkdir -p "$SHIM"
cat > "$SHIM/git" <<'SHIMEOF'
#!/usr/bin/env bash
# Shim: fail ONLY on `fetch`, pass everything else through to the real git.
for a in "$@"; do
  if [ "$a" = "fetch" ]; then
    echo "error: insufficient permission for adding an object to repository database .git/objects" >&2
    echo "fatal: failed to write object" >&2
    echo "fatal: unpack-objects failed" >&2
    exit 128
  fi
done
exec /usr/bin/git "$@"
SHIMEOF
chmod +x "$SHIM/git"

# ---------------------------------------------------------------------------
# A stub API, so the script gets PAST its content check and actually
# reaches the git phase we are testing. Without this the script exits
# at "failed to fetch dishes" and the guard is never exercised.
#
# It answers the two endpoints the script reads:
#   /api/dishes?status=published&limit=100&offset=N  -> one dish
#   /api/categories?limit=500                         -> one category
# One dish is fewer than the API's limit of 100, so the pagination
# loop stops after a single page.
# ---------------------------------------------------------------------------
STUB_PORT=18731
cat > "$TMP/stub.py" <<'PYEOF'
import json, sys
from http.server import BaseHTTPRequestHandler, HTTPServer

DISH = {"slug": "test-dish", "updatedAt": "2026-01-01 00:00:00+00"}

class H(BaseHTTPRequestHandler):
    def do_GET(self):
        if "/api/dishes" in self.path:
            body = json.dumps({"dishes": [DISH]}).encode()
        elif "/api/categories" in self.path:
            body = json.dumps({"categories": [{"slug": "c"}]}).encode()
        else:
            self.send_response(404); self.end_headers(); return
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)
    def log_message(self, *a):
        pass

HTTPServer(("127.0.0.1", int(sys.argv[1])), H).serve_forever()
PYEOF

python3 "$TMP/stub.py" "$STUB_PORT" &
STUB_PID=$!
trap 'kill $STUB_PID 2>/dev/null || true; rm -rf "$TMP"' EXIT

# Wait for the stub to accept connections.
for _ in $(seq 1 40); do
  if curl -fsS --max-time 2 "http://127.0.0.1:$STUB_PORT/api/categories?limit=500" >/dev/null 2>&1; then
    break
  fi
  sleep 0.25
done

STUB_API="http://127.0.0.1:$STUB_PORT"

# ===========================================================================
# CASE 1: the fetch fails -> must exit non-zero, must NOT check out,
#          must NOT build.
# ===========================================================================
echo ""
echo "--- case 1: the git fetch fails ---"

STATE="$TMP/state.json"
cat > "$STATE" <<EOF
{
  "contentVersion": "v1",
  "buildSha": "$SECOND_SHA",
  "imageRecipes": "x",
  "imageGeo": "y",
  "lastRunAt": "2026-01-01T00:00:00Z",
  "prunedImages": 0
}
EOF

# Put the build dir back to the base commit, so a stale checkout would
# be VISIBLE (HEAD would move from SECOND_SHA back to BASE_SHA).
git -C "$BUILD" checkout -q --force "$BASE_SHA"
HEAD_BEFORE=$(git -C "$BUILD" rev-parse HEAD)

set +e
PATH="$SHIM:$PATH" \
GUSTALE_API_BASE="$STUB_API" \
GUSTALE_BUILD_DIR="$BUILD" \
GUSTALE_REBUILD_ORIGIN_URL="$ORIGIN" \
GUSTALE_LOCK_FILE="$TMP/lock" \
GUSTALE_STATE_FILE="$STATE" \
GUSTALE_FORCE=1 \
  bash "$SCRIPT" > "$TMP/case1.log" 2>&1
rc=$?
set -e

HEAD_AFTER=$(git -C "$BUILD" rev-parse HEAD)

if [ "$rc" -eq 0 ]; then
  bad "case 1: the script exited 0 after a failed fetch (it must fail closed)"
else
  ok "case 1: the script exited $rc after a failed fetch"
fi

if [ "$HEAD_BEFORE" = "$HEAD_AFTER" ]; then
  ok "case 1: the build dir HEAD was NOT moved ($HEAD_AFTER)"
else
  bad "case 1: the build dir HEAD moved from $HEAD_BEFORE to $HEAD_AFTER — a stale checkout happened"
fi

if grep -q "ABORTING without checkout or build" "$TMP/case1.log"; then
  ok "case 1: the script said it was aborting"
else
  bad "case 1: the script did not report the abort"
fi

if grep -qE "Building web images|page\(s\) built|docker build" "$TMP/case1.log"; then
  bad "case 1: the script reached the BUILD step"
else
  ok "case 1: the script never reached the build step"
fi

# ===========================================================================
# CASE 2: the fetch succeeds but the fetched commit is NOT a descendant
#          of the deployed commit -> must exit non-zero, must NOT check
#          out, must NOT build.
# ===========================================================================
echo ""
echo "--- case 2: the fetched commit is not a descendant of the deployed one ---"

# Make the origin's main point at the BASE commit (an ancestor of the
# deployed SECOND_SHA) -- i.e. a ref that moved backwards.
git -C "$ORIGIN" checkout -q "$BASE_SHA"
git -C "$ORIGIN" branch -f main "$BASE_SHA"
git -C "$BUILD" fetch -q --no-tags origin main

# The deployed SHA is SECOND_SHA. BASE_SHA is its ANCESTOR, not a
# descendant, so the guard must fire.
rm -f "$SHIM/git"

HEAD_BEFORE=$(git -C "$BUILD" rev-parse HEAD)

set +e
GUSTALE_API_BASE="$STUB_API" \
GUSTALE_BUILD_DIR="$BUILD" \
GUSTALE_REBUILD_ORIGIN_URL="$ORIGIN" \
GUSTALE_LOCK_FILE="$TMP/lock2" \
GUSTALE_STATE_FILE="$STATE" \
GUSTALE_FORCE=1 \
  bash "$SCRIPT" > "$TMP/case2.log" 2>&1
rc=$?
set -e

HEAD_AFTER=$(git -C "$BUILD" rev-parse HEAD)

if [ "$rc" -eq 0 ]; then
  bad "case 2: the script exited 0 for a non-descendant commit (it must fail closed)"
else
  ok "case 2: the script exited $rc for a non-descendant commit"
fi

if [ "$HEAD_BEFORE" = "$HEAD_AFTER" ]; then
  ok "case 2: the build dir HEAD was NOT moved ($HEAD_AFTER)"
else
  bad "case 2: the build dir HEAD moved from $HEAD_BEFORE to $HEAD_AFTER — a backwards checkout happened"
fi

if grep -q "NOT a descendant" "$TMP/case2.log"; then
  ok "case 2: the script said the commit was not a descendant"
else
  bad "case 2: the script did not report the ancestry refusal"
fi

if grep -qE "Building web images|page\(s\) built|docker build" "$TMP/case2.log"; then
  bad "case 2: the script reached the BUILD step"
else
  ok "case 2: the script never reached the build step"
fi

# ===========================================================================
# CASE 3 (the control): the fetch succeeds and the fetched commit IS a
#          descendant -> the guard must NOT fire. A guard that always
#          fires is as useless as no guard.
# ===========================================================================
echo ""
echo "--- case 3 (control): the fetched commit IS a descendant ---"

git -C "$ORIGIN" checkout -q "$SECOND_SHA"
git -C "$ORIGIN" branch -f main "$SECOND_SHA"
echo "third" >> "$ORIGIN/f.txt"
git -C "$ORIGIN" add -A
git -C "$ORIGIN" commit -q -m "third"
THIRD_SHA=$(git -C "$ORIGIN" rev-parse HEAD)
git -C "$BUILD" fetch -q --no-tags origin main

# The deployed SHA stays SECOND_SHA; THIRD_SHA is its descendant.
set +e
GUSTALE_API_BASE="$STUB_API" \
GUSTALE_BUILD_DIR="$BUILD" \
GUSTALE_REBUILD_ORIGIN_URL="$ORIGIN" \
GUSTALE_LOCK_FILE="$TMP/lock3" \
GUSTALE_STATE_FILE="$STATE" \
GUSTALE_FORCE=1 \
  bash "$SCRIPT" > "$TMP/case3.log" 2>&1
rc=$?
set -e

if grep -q "ancestry OK" "$TMP/case3.log"; then
  ok "case 3: the ancestry guard PASSED a legitimate descendant"
else
  bad "case 3: the ancestry guard rejected a legitimate descendant (the guard is too strict)"
  echo "        --- case3.log ---"; sed 's/^/        /' "$TMP/case3.log" | tail -20
fi

if grep -q "fetch OK" "$TMP/case3.log"; then
  ok "case 3: the fetch step reported OK"
else
  bad "case 3: the fetch step did not report OK"
fi

echo ""
if [ "$fail" -eq 0 ]; then
  echo "ALL PASS"
else
  echo "SOME FAILED"
fi

# ===========================================================================
# The timer's OTHER guard: it must share ONE lock with the CI deploy.
#
# This is invoked from here, rather than from its own CI step, because
# the CI step that runs this file is the only one that already exists
# for the timer's guards -- and adding a CI step means editing
# .github/workflows/ci.yml, which the GitHub App cannot push (no
# `workflows` scope). Invoking it from an existing script keeps the
# whole fix pushable by the App.
#
# The shared-lock test also asserts that the two lock paths still
# agree, so it reads .github/workflows/ci.yml (read-only) to find the
# deploy's DEPLOY_LOCK.
# ===========================================================================
echo ""
echo "--- the shared deploy lock ---"
if bash "$SCRIPT_DIR/test-shared-deploy-lock.sh"; then
  ok "the rebuild timer and the CI deploy share one lock"
else
  bad "the rebuild timer and the CI deploy do NOT share one lock"
fi

# ===========================================================================
# The recipes accent gate.
#
# The herb-green accent was APPROVED on 2026-11-06 and held in
# recipes-island.css, but that file was never imported, so the accent
# never reached a build. It now ships in recipes-theme.css.
#
# The gate checks the approved accent's contrast ratios, that no
# accent-coloured text sits on an accent-soft tint, and that the
# SHIPPED theme still matches the APPROVED accent -- plus a selftest
# proving the gate can fail.
#
# Invoked from here for the same reason as the shared-lock test: the
# App cannot push .github/workflows/, so a new CI step is not
# available. An existing script that CI already runs is.
# ===========================================================================
echo ""
echo "--- the recipes accent ---"
if bash "$SCRIPT_DIR/test-recipes-accent.sh"; then
  ok "the recipes accent passes its contrast gate and matches the approved values"
else
  bad "the recipes accent does NOT pass its gate"
fi

# ===========================================================================
# The systemd units must be ROOT-OWNED.
#
# A unit file owned by a normal user is an escalation to root: systemd
# reads the unit as root and executes what it says, so whoever can write
# the file gets root. The service runs as `gustale` -- which is also the
# account the operator logs in as -- so this is a real boundary.
#
# The test is static: it reads the installer. It writes nothing and
# needs no root.
# ===========================================================================
echo ""
echo "--- the systemd unit ownership ---"
if bash "$SCRIPT_DIR/test-systemd-unit-ownership.sh"; then
  ok "the systemd units are installed root:root"
else
  bad "the systemd units are NOT installed root:root"
fi

exit "$fail"
