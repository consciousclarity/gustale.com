#!/usr/bin/env bash
# The regression test for the base-branch live-approval gate.
#
# WHAT THIS PROVES
# ----------------
# The live-approval gate decides whether a PR that touches the live
# database may be merged. The gate script lives in the repository, so
# the obvious attack is: a PR that touches db/migrations/ ALSO edits
# scripts/check-live-approval.sh in the same diff, weakening the rule
# that is supposed to judge it.
#
# That attack worked while the gate ran on `pull_request`, because
# `pull_request` checks out the PR's own code: CI ran the PR's
# weakened gate against the PR.
#
# The fix is `pull_request_target`, which runs the workflow from the
# BASE branch. This test asserts that structure is in place, and that
# the base branch's copy of the gate is what runs.
#
# It is a STATIC test on the workflow definition — it cannot prove the
# runtime behaves, but it does prove the configuration that makes the
# runtime safe, and it fails loudly the moment someone moves the gate
# back onto `pull_request`.

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CI_YML="$REPO_ROOT/.github/workflows/ci.yml"

PASS=0
FAIL=0

check() {
  local desc="$1"
  shift
  if "$@" >/dev/null 2>&1; then
    echo "  PASS: $desc"
    PASS=$((PASS + 1))
  else
    echo "  FAIL: $desc"
    FAIL=$((FAIL + 1))
  fi
}

echo "=== the base-branch live-approval gate ==="

# ── 1. The workflow must fire on pull_request_target ─────────────────
check "the workflow triggers on pull_request_target" \
  grep -qE '^  pull_request_target:' "$CI_YML"

# ── 2. The gate job must run ONLY on pull_request_target ─────────────
# If the gate ran on `pull_request` it would use the PR's own copy of
# the script, which is the whole vulnerability.
GATE_IF=$(python3 - "$CI_YML" <<'PY'
import sys, yaml
d = yaml.safe_load(open(sys.argv[1]))
print(d["jobs"]["live-approval"].get("if", ""))
PY
)
check "the gate job runs on pull_request_target (if: '$GATE_IF')" \
  test "$GATE_IF" = "github.event_name == 'pull_request_target'"

# ── 3. The gate job must check out the BASE, not the PR head ─────────
# `actions/checkout` without a `ref` in a pull_request_target run
# checks out the base branch by default; pinning `ref:` to the base
# SHA makes that explicit and immune to a default-branch change.
check "the gate job checks out the base branch's code" \
  grep -A8 'ref: ${{ github.event.pull_request.base.sha }}' "$CI_YML"

# ── 4. The gate job must NOT check out the PR's head ─────────────────
check "the gate job does NOT check out the PR head" \
  bash -c "! grep -qE 'ref: \\\$\{\{ github.event.pull_request.head.sha \}\}' '$CI_YML'"

# ── 5. No other job may run on pull_request_target ───────────────────
# A pull_request_target token is powerful. If the build/test jobs ran
# on it, a PR's code would execute with a privileged token. Only the
# gate may see that event.
check "no other job runs on pull_request_target" \
  python3 - "$CI_YML" <<'PY'
import sys, yaml
d = yaml.safe_load(open(sys.argv[1]))
for name, job in d["jobs"].items():
    if name == "live-approval":
        continue
    cond = job.get("if", "")
    if "pull_request_target" in cond and "!=" not in cond:
        raise SystemExit(f"job {name} would run on pull_request_target")
raise SystemExit(0)
PY

# ── 6. The gate job's permissions must stay minimal ─────────────────
# The gate only reads the PR timeline. It does not need write access.
check "the gate job has no write permissions" \
  python3 - "$CI_YML" <<'PY'
import sys, yaml
d = yaml.safe_load(open(sys.argv[1]))
perms = d["jobs"]["live-approval"].get("permissions", {})
for scope, level in perms.items():
    if level not in ("read", "none"):
        raise SystemExit(f"the gate has {scope}: {level}")
raise SystemExit(0)
PY

# ── 7. The gate script must still be present on the base branch ──────
check "the gate script exists" test -f "$REPO_ROOT/scripts/check-live-approval.sh"

# ── 8. The gate must still demand the label AND the owner's actor ───
# The base-branch move must not have weakened the RULE, only changed
# where the script is loaded from.
check "the gate still requires the approved-live label" \
  grep -q 'LABEL="approved-live"' "$REPO_ROOT/scripts/check-live-approval.sh"
check "the gate still requires the owner's actor" \
  grep -q 'OWNER="consciousclarity"' "$REPO_ROOT/scripts/check-live-approval.sh"

# ── 9. The gate's runs must not share a concurrency group with main ──
# On pull_request_target, github.ref is the BASE branch (refs/heads/main).
# A workflow-level group of just `ci-${{ github.ref }}` with
# cancel-in-progress puts every PR's gate run in main's group, so any PR
# activity cancels main's in-progress build and deploy. The group must
# be keyed by the event and the PR number.
check "the concurrency group is keyed by event and PR number" \
  python3 - "$CI_YML" <<'PY'
import sys, yaml
d = yaml.safe_load(open(sys.argv[1]))
group = str((d.get("concurrency") or {}).get("group", ""))
if "github.event_name" not in group or "github.event.pull_request.number" not in group:
    raise SystemExit(f"concurrency group {group!r} lets PR runs cancel main's runs")
raise SystemExit(0)
PY

echo
echo "BASE_BRANCH_GATE: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ] || exit 1
echo "BASE_BRANCH_GATE_OK=1"
