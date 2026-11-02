#!/usr/bin/env bash
# The live-approval gate's own tests.
#
# The gate is a safety mechanism, so it is tested against the four cases
# that matter:
#
#   1. a PR that does NOT touch the live surface passes without a label
#   2. a PR that touches the live surface and has NO label fails
#   3. a PR that touches the live surface and has the label applied by
#      somebody OTHER than the owner fails
#   4. a PR that touches the live surface and has the label applied by
#      the owner passes
#
# The label/actor logic is exercised through the same JSON shape the
# timeline API returns, so the test parses the real decision path rather
# than a mock of it.
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
GATE="$SCRIPT_DIR/check-live-approval.sh"

PASS=0
FAIL=0

ok()   { echo "  PASS: $1"; PASS=$((PASS+1)); }
bad()  { echo "  FAIL: $1"; FAIL=$((FAIL+1)); }

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

# ── the fixture repo ──────────────────────────────────────────────────
REPO="$TMP/repo"
mkdir -p "$REPO/db/migrations" "$REPO/scripts"
cd "$REPO"
git init -q .
git config user.email t@t.t
git config user.name t
echo "-- base" > db/migrations/0001.sql
echo "-- base" > scripts/apply-migration-live.sh
echo "-- base" > apps-web.ts
git add -A
git commit -qm base
BASE=$(git rev-parse HEAD)

# ── the fake gh ───────────────────────────────────────────────────────
# A stub on PATH that returns a canned timeline, and records whether the
# script even asked for it.
mkdir -p "$TMP/bin"
cat > "$TMP/bin/gh" <<'STUB'
#!/usr/bin/env bash
# The stub answers the timeline API with whatever TIMELINE_JSON holds.
# An EMPTY TIMELINE_JSON means "the label is not there" — that is a
# normal answer, not an API failure, so it succeeds with an empty array.
if [ "${TIMELINE_STUB_MODE:-}" = "fail" ]; then
  echo "gh: could not reach the API" >&2
  exit 1
fi
if [ -n "${TIMELINE_JSON:-}" ]; then
  printf '%s' "$TIMELINE_JSON"
else
  printf '[]'
fi
exit 0
STUB
chmod +x "$TMP/bin/gh"
export PATH="$TMP/bin:$PATH"

# ── the gate under test ───────────────────────────────────────────────
# The gate resolves git diff relative to the CWD, and calls gh for the
# timeline. Both are exercised for real.

run_gate() {
  # $1 = the label JSON (or empty for "the label is not there")
  # $2 = the files to change
  # $3 = "fail" to make the timeline API unreachable
  local timeline="$1"; shift
  local files="$1"; shift
  local mode="${1:-ok}"

  cd "$REPO"
  git checkout -q "$BASE"
  for f in $files; do
    mkdir -p "$(dirname "$f")"
    echo "-- changed" > "$f"
    git add -A
  done
  git commit -qm "change: $files"
  local head
  head=$(git rev-parse HEAD)

  TIMELINE_JSON="$timeline" TIMELINE_STUB_MODE="$mode" \
    GITHUB_REPOSITORY="consciousclarity/gustale.com" \
    bash "$GATE" 1234 "$BASE" "$head" 2>&1
  echo "EXIT=$?"
}

OWNER_APPLIED='[{"event":"labeled","label":{"name":"approved-live"},"actor":{"login":"consciousclarity"}}]'
STRANGER_APPLIED='[{"event":"labeled","label":{"name":"approved-live"},"actor":{"login":"dependabot"}}]'
OTHER_LABEL='[{"event":"labeled","label":{"name":"bug"},"actor":{"login":"consciousclarity"}}]'
BOTH='[{"event":"labeled","label":{"name":"approved-live"},"actor":{"login":"dependabot"}},{"event":"labeled","label":{"name":"approved-live"},"actor":{"login":"consciousclarity"}}]'
# The timeline is an EVENT LOG. A label that was applied and then
# REMOVED leaves both events behind, and only the final state counts.
WITHDRAWN='[{"event":"labeled","label":{"name":"approved-live"},"actor":{"login":"consciousclarity"}},{"event":"unlabeled","label":{"name":"approved-live"},"actor":{"login":"consciousclarity"}}]'
# Re-applied after being withdrawn: the owner is the last actor.
REAPPLIED='[{"event":"labeled","label":{"name":"approved-live"},"actor":{"login":"consciousclarity"}},{"event":"unlabeled","label":{"name":"approved-live"},"actor":{"login":"consciousclarity"}},{"event":"labeled","label":{"name":"approved-live"},"actor":{"login":"consciousclarity"}}]'

echo "=== the live-approval gate's tests ==="

# ── 1. a PR that does not touch the live surface ─────────────────────
OUT=$(run_gate "" "apps-web.ts")
if echo "$OUT" | grep -q "EXIT=0" && echo "$OUT" | grep -q "LIVE_APPROVAL_GATE=not_required"; then
  ok "a PR that does not touch the live surface passes with no label"
else
  bad "a PR that does not touch the live surface passes with no label"
  echo "$OUT" | sed 's/^/      /'
fi

# ── 2. a migration PR with NO label ──────────────────────────────────
OUT=$(run_gate "" "db/migrations/0042_x.sql")
if echo "$OUT" | grep -q "EXIT=1" && echo "$OUT" | grep -q "LIVE_APPROVAL_GATE=missing_label"; then
  ok "a migration PR with no label is blocked"
else
  bad "a migration PR with no label is blocked"
  echo "$OUT" | sed 's/^/      /'
fi

# ── 2b. the label must be the RIGHT label ─────────────────────────────
OUT=$(run_gate "$OTHER_LABEL" "db/migrations/0042_x.sql")
if echo "$OUT" | grep -q "EXIT=1" && echo "$OUT" | grep -q "LIVE_APPROVAL_GATE=missing_label"; then
  ok "a different label does not satisfy the gate"
else
  bad "a different label does not satisfy the gate"
  echo "$OUT" | sed 's/^/      /'
fi

# ── 3. the label applied by somebody else ─────────────────────────────
OUT=$(run_gate "$STRANGER_APPLIED" "db/migrations/0042_x.sql")
if echo "$OUT" | grep -q "EXIT=1" && echo "$OUT" | grep -q "LIVE_APPROVAL_GATE=wrong_actor"; then
  ok "a label applied by a non-owner is blocked"
else
  bad "a label applied by a non-owner is blocked"
  echo "$OUT" | sed 's/^/      /'
fi

# ── 3b. the owner among several applicants ───────────────────────────
OUT=$(run_gate "$BOTH" "db/migrations/0042_x.sql")
if echo "$OUT" | grep -q "EXIT=1" && echo "$OUT" | grep -q "LIVE_APPROVAL_GATE=wrong_actor"; then
  ok "a label applied by BOTH a stranger and the owner is blocked"
else
  bad "a label applied by BOTH a stranger and the owner is blocked"
  echo "$OUT" | sed 's/^/      /'
fi

# ── 4. the label applied by the owner ────────────────────────────────
OUT=$(run_gate "$OWNER_APPLIED" "db/migrations/0042_x.sql")
if echo "$OUT" | grep -q "EXIT=0" && echo "$OUT" | grep -q "LIVE_APPROVAL_GATE=approved"; then
  ok "a label applied by the owner passes"
else
  bad "a label applied by the owner passes"
  echo "$OUT" | sed 's/^/      /'
fi

# ── 5. a WITHDRAWN approval is not an approval ───────────────────────
# The timeline keeps the "labeled" event after the label is removed, so
# a gate that only counts "labeled" events would keep honouring an
# approval that was taken back.
OUT=$(run_gate "$WITHDRAWN" "db/migrations/0042_x.sql")
if echo "$OUT" | grep -q "EXIT=1" && echo "$OUT" | grep -q "LIVE_APPROVAL_GATE=missing_label"; then
  ok "a withdrawn approval does not count"
else
  bad "a withdrawn approval does not count"
  echo "$OUT" | sed 's/^/      /'
fi

# ── 5b. re-applying after a withdrawal IS an approval ────────────────
OUT=$(run_gate "$REAPPLIED" "db/migrations/0042_x.sql")
if echo "$OUT" | grep -q "EXIT=0" && echo "$OUT" | grep -q "LIVE_APPROVAL_GATE=approved"; then
  ok "an approval re-applied after a withdrawal counts"
else
  bad "an approval re-applied after a withdrawal counts"
  echo "$OUT" | sed 's/^/      /'
fi

# ── 6. the gate itself is gated ──────────────────────────────────────
OUT=$(run_gate "$OWNER_APPLIED" "scripts/apply-migration-live.sh")
if echo "$OUT" | grep -q "EXIT=0" && echo "$OUT" | grep -q "LIVE_APPROVAL_GATE=approved"; then
  ok "a change to the gate script itself requires the label"
else
  bad "a change to the gate script itself requires the label"
  echo "$OUT" | sed 's/^/      /'
fi

OUT=$(run_gate "" "scripts/apply-migration-live.sh")
if echo "$OUT" | grep -q "EXIT=1"; then
  ok "a change to the gate script is blocked without the label"
else
  bad "a change to the gate script is blocked without the label"
  echo "$OUT" | sed 's/^/      /'
fi

# ── 6. the marker script is gated ────────────────────────────────────
OUT=$(run_gate "" "scripts/mark_disposable_db.sql")
if echo "$OUT" | grep -q "EXIT=1"; then
  ok "a change to the disposable-db marker is blocked without the label"
else
  bad "a change to the disposable-db marker is blocked without the label"
  echo "$OUT" | sed 's/^/      /'
fi

# ── 7. FAIL CLOSED: the timeline API failing must fail the gate ───────
OUT=$(run_gate "" "db/migrations/0042_x.sql" fail)
if echo "$OUT" | grep -q "EXIT=1" && echo "$OUT" | grep -q "LIVE_APPROVAL_GATE=error"; then
  ok "the gate fails closed when the timeline cannot be read"
else
  bad "the gate fails closed when the timeline cannot be read"
  echo "$OUT" | sed 's/^/      /'
fi

# ── 8. a PR that does not touch the live surface passes even when the
#       timeline API is unreachable — the gate is not consulted at all,
#       so an API outage cannot block ordinary work. ───────────────────
OUT=$(run_gate "" "apps-web.ts" fail)
if echo "$OUT" | grep -q "EXIT=0" && echo "$OUT" | grep -q "LIVE_APPROVAL_GATE=not_required"; then
  ok "an ordinary PR is not blocked by a timeline API outage"
else
  bad "an ordinary PR is not blocked by a timeline API outage"
  echo "$OUT" | sed 's/^/      /'
fi

echo ""
echo "=== the live-approval gate: $PASS passed, $FAIL failed ==="
[ "$FAIL" -eq 0 ] || exit 1
exit 0
