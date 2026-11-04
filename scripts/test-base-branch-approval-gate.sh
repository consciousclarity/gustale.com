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
# The gate lives in its own workflow, live-approval.yml. It must never
# appear in ci.yml again: there it had to be skipped on `pull_request`
# runs, and GitHub reports a skipped job as SUCCESS, which satisfies a
# required status check of the same name.
#
# It is a STATIC test on the workflow definition — it cannot prove the
# runtime behaves, but it does prove the configuration that makes the
# runtime safe, and it fails loudly the moment someone moves the gate
# back onto `pull_request`.

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WF_DIR="$REPO_ROOT/.github/workflows"
CI_YML="$WF_DIR/ci.yml"
LIVE_YML="$WF_DIR/live-approval.yml"

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

# Run a python snippet against a workflow file; the snippet exits non-zero
# to fail the check.
py() {
  local file="$1" code="$2"
  python3 - "$file" "$WF_DIR" <<PY
import sys, glob, yaml
d = yaml.safe_load(open(sys.argv[1]))
on = d.get("on", d.get(True, {})) or {}
wf_dir = sys.argv[2]
$code
PY
}

echo "=== the base-branch live-approval gate ==="

# ── 1. The gate workflow fires on pull_request_target, and ONLY on it ─
# On `pull_request` it would use the PR's own copy of the script, which
# is the whole vulnerability.
check "the gate workflow exists" test -f "$LIVE_YML"
check "the gate workflow triggers only on pull_request_target" \
  py "$LIVE_YML" 'raise SystemExit(0 if list(on) == ["pull_request_target"] else f"triggers: {list(on)}")'

# ── 2. Applying or removing the label re-runs the gate ───────────────
check "the gate re-runs on labeled and unlabeled" \
  py "$LIVE_YML" 'types = (on["pull_request_target"] or {}).get("types", [])
raise SystemExit(0 if {"labeled", "unlabeled"} <= set(types) else f"types: {types}")'

# ── 3. The gate always runs: no path filter ─────────────────────────
# A required check that is filtered out never reports, and the PR waits
# forever.
check "the gate trigger has no path filter" \
  py "$LIVE_YML" 't = on["pull_request_target"] or {}
raise SystemExit(0 if not ({"paths", "paths-ignore"} & set(t)) else "the gate is path-filtered")'

# ── 4. Nothing else may produce a check named "Live approval gate" ───
# A skipped job reports SUCCESS and satisfies a required check of the
# same name. Only live-approval.yml may define a job with that name.
check "no other workflow has a job named 'Live approval gate'" \
  py "$LIVE_YML" 'bad = []
for f in glob.glob(wf_dir + "/*.yml") + glob.glob(wf_dir + "/*.yaml"):
    if f.endswith("/live-approval.yml"):
        continue
    w = yaml.safe_load(open(f)) or {}
    for jid, job in (w.get("jobs") or {}).items():
        if jid == "live-approval" or (job or {}).get("name") == "Live approval gate":
            bad.append(f"{f}:{jid}")
raise SystemExit(0 if not bad else f"also defined in {bad}")'

# ── 5. ci.yml never runs on pull_request_target ─────────────────────
# Its build and test jobs execute the PR's code; with a
# pull_request_target token that code would run privileged.
check "ci.yml does not trigger on pull_request_target" \
  py "$CI_YML" 'raise SystemExit(0 if "pull_request_target" not in on else "ci.yml runs on pull_request_target")'

# ── 6. The gate checks out the BASE, never the PR head ──────────────
check "the gate job checks out the base branch's code" \
  grep -q 'ref: ${{ github.event.pull_request.base.sha }}' "$LIVE_YML"
check "the gate job does NOT check out the PR head" \
  bash -c "! grep -qE 'ref: \\\$\{\{ github.event.pull_request.head.(sha|ref) \}\}' '$LIVE_YML'"

# ── 7. The gate's permissions stay minimal ──────────────────────────
check "the gate workflow and job have no write permissions" \
  py "$LIVE_YML" 'perms = dict(d.get("permissions") or {})
perms.update(d["jobs"]["live-approval"].get("permissions") or {})
bad = {k: v for k, v in perms.items() if v not in ("read", "none")}
raise SystemExit(0 if perms and not bad else f"permissions: {perms}")'

# ── 8. The gate script is present and still demands label + owner ───
check "the gate script exists" test -f "$REPO_ROOT/scripts/check-live-approval.sh"
check "the gate still requires the approved-live label" \
  grep -q 'LABEL="approved-live"' "$REPO_ROOT/scripts/check-live-approval.sh"
check "the gate still requires the owner's actor" \
  grep -q 'OWNER="consciousclarity"' "$REPO_ROOT/scripts/check-live-approval.sh"

# ── 9. Concurrency: PR runs never share a group with main's runs ─────
# With cancel-in-progress, a shared group lets PR activity cancel main's
# in-progress build and deploy.
check "the gate's concurrency group is keyed by PR number" \
  py "$LIVE_YML" 'g = str((d.get("concurrency") or {}).get("group", ""))
raise SystemExit(0 if "github.event.pull_request.number" in g and "github.ref" not in g else f"group: {g}")'
check "ci.yml's concurrency group is keyed by event and PR number" \
  py "$CI_YML" 'g = str((d.get("concurrency") or {}).get("group", ""))
raise SystemExit(0 if "github.event_name" in g and "github.event.pull_request.number" in g else f"group: {g}")'

echo
echo "BASE_BRANCH_GATE: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ] || exit 1
echo "BASE_BRANCH_GATE_OK=1"
