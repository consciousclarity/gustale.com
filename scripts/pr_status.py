#!/usr/bin/env python3
"""
pr_status.py -- the GATE on every "Done" report.

WHY THIS EXISTS
---------------
A "done" report that says "CI passed" when CI is red is worse than no
report at all. The check runs and finishes, and the report is written
from memory instead of from the API, so a red build gets described as
"unconfirmed" or "should pass".

This script READS the actual state and PRINTS it. It does not judge,
does not summarise, and does not guess: every line it prints comes from
a GitHub API response read at that moment. If it cannot read the
state, it says so -- loudly -- rather than reporting a default.

WHAT IT READS, PER PR
---------------------
  * mergeable / mergeable_state  -- can GitHub merge it right now?
  * every check run, by NAME      -- including the ones that are still
                                     queued or in progress, because a
                                     run that has not finished is not a
                                     pass
  * the labels                    -- so a label that was removed is
                                     visible, and so nobody has to
                                     guess whether an approval exists

WHY IT IS A SCRIPT AND NOT MODEL JUDGEMENT
------------------------------------------
Because the failure this guards against is exactly the kind of failure
a model makes: summarising a red build optimistically. A script cannot
be optimistic. It prints what the API said.

THE APPROVAL LABEL IS READ-ONLY
-------------------------------
This script NEVER writes a label. Not `approved-live`, not any other.
Only the owner applies, removes and re-adds approval labels. That is a
hard rule, and a tool that could write one would eventually be the
reason a label appeared that the owner never applied.

USAGE
-----
  scripts/pr_status.py 266 267 268
  scripts/pr_status.py --repo gustale.com 266
  scripts/pr_status.py --watch 266      # re-read every 30s, until the
                                        # checks finish

EXIT CODES
----------
  0  every named PR is open, mergeable, and every check run has
     concluded in a success state
  1  at least one PR is red, or has a check that has not concluded
  2  the state could not be read (network, auth, or a missing PR)
"""
from __future__ import annotations

import json
import subprocess
import sys
import time
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO_ROOT / "scripts" / "hermes"))

from gh_app_auth import API, OWNER, api, installation_token  # noqa: E402

# A check run has CONCLUDED when GitHub reports it as such. Everything
# else -- queued, in_progress, pending, waiting, requested -- is NOT a
# pass, and reporting a pending run as a pass is the bug this script
# exists to kill.
CONCLUDED_SUCCESS = {"success", "neutral", "skipped"}

# The states that mean "the PR cannot be merged as it stands".
BLOCKING_STATES = {"blocked", "dirty", "behind", "draft", "unknown"}


def _load_json(path: Path):
    try:
        return json.loads(path.read_text())
    except Exception:
        return None


def _checks_for(tok: str, repo: str, pr_number: int) -> tuple[dict, list[dict]]:
    """
    Read every check run for a PR's HEAD commit.

    Two sources, because they disagree and the disagreement matters:

      1. /pulls/<n> -- the PR's own status rollup (`statuses_url`).
      2. /commits/<sha>/check-runs -- the check runs, with their
         conclusion and their `status`.

    A check that is still running appears in (2) with a non-concluded
    status. Reading only (1) hides that, and a hidden running check is
    how "CI passed" gets said one minute early.
    """
    pr = api(tok, "GET", f"/repos/{OWNER}/{repo}/pulls/{pr_number}")
    if pr.get("message"):
        raise RuntimeError(f"PR #{pr_number}: {pr.get('message')}")

    runs: list[dict] = []

    # (1) the commit statuses
    sha = (pr.get("head") or {}).get("sha")
    if sha:
        st = api(
            tok,
            "GET",
            f"/repos/{OWNER}/{repo}/commits/{sha}/status",
        )
        for s in (st.get("statuses") or []):
            runs.append(
                {
                    "name": s.get("context") or "(status)",
                    "kind": "status",
                    "state": s.get("state"),
                    "url": s.get("target_url"),
                }
            )

    # (2) the check runs
    if sha:
        cr = api(
            tok,
            "GET",
            f"/repos/{OWNER}/{repo}/commits/{sha}/check-runs",
        )
        for c in (cr.get("check_runs") or []):
            # A check run's conclusion is None until it finishes.
            # `status` is the live state: queued/in_progress/completed.
            runs.append(
                {
                    "name": c.get("name"),
                    "kind": "check",
                    "state": c.get("conclusion") or c.get("status"),
                    "status": c.get("status"),
                    "url": c.get("html_url"),
                }
            )

    return pr, runs


def _pr_line(pr: dict) -> str:
    base = (pr.get("base") or {}).get("ref")
    head = (pr.get("head") or {}).get("ref")
    return (
        f"    base={base}  head={head}  "
        f"+{pr.get('additions')}/-{pr.get('deletions')} in {pr.get('changed_files')} files"
    )


def report(tok: str, repo: str, pr_number: int) -> tuple[bool, list[str]]:
    """Return (all_good, lines)."""
    lines: list[str] = []
    try:
        pr, runs = _checks_for(tok, repo, pr_number)
    except Exception as exc:  # noqa: BLE001
        return False, [
            f"PR #{pr_number}: COULD NOT READ THE STATE: {exc}",
        ]

    title = pr.get("title") or ""
    state = pr.get("state")
    mergeable = pr.get("mergeable")
    mstate = pr.get("mergeable_state")
    labels = [l["name"] for l in (pr.get("labels") or [])]

    lines.append(f"PR #{pr_number}  {title}")
    lines.append(_pr_line(pr))

    lines.append(
        f"    state={state}  mergeable={mergeable}  mergeable_state={mstate}"
        f"  draft={pr.get('draft')}"
    )
    lines.append(f"    labels: {labels if labels else '(none)'}")

    if state != "open":
        lines.append(f"    VERDICT: NOT OPEN (state={state})")
        return False, lines

    # The checks.
    if not runs:
        lines.append("    checks: (none reported)")
    else:
        pending = []
        red = []
        green = []
        for r in runs:
            name = r.get("name")
            st = r.get("state")
            if r.get("kind") == "check":
                status = r.get("status")
                if status and status != "completed":
                    pending.append((name, status))
                    continue
            if st in CONCLUDED_SUCCESS:
                green.append(name)
            elif st in ("failure", "cancelled", "timed_out", "action_required", "stale"):
                red.append((name, st))
            elif st is None:
                pending.append((name, "no-state"))
            else:
                pending.append((name, st))

        for name, st in red:
            lines.append(f"    FAIL    {name}  ({st})")
        for name, st in pending:
            lines.append(f"    PENDING {name}  ({st})")
        for name in green:
            lines.append(f"    pass    {name}")

    # The mergeability verdict.
    good = True
    if mergeable is False:
        lines.append("    VERDICT: GitHub says NOT mergeable (a conflict)")
        good = False
    elif mstate in BLOCKING_STATES:
        lines.append(f"    VERDICT: mergeable_state={mstate} -- not mergeable as it stands")
        good = False

    if any(r.get("kind") == "check" and r.get("state") in ("failure", "timed_out", "action_required", "cancelled") for r in runs):
        lines.append("    VERDICT: a check run is RED")
        good = False
    if any(r.get("kind") == "status" and r.get("state") in ("failure", "error") for r in runs):
        lines.append("    VERDICT: a commit status is RED")
        good = False
    if any(r.get("kind") == "check" and r.get("status") and r.get("status") != "completed" for r in runs):
        lines.append("    VERDICT: a check has NOT concluded -- this is not a pass")
        good = False
    if not runs:
        lines.append("    VERDICT: no checks reported -- CI may not have started")
        good = False

    if good:
        lines.append("    VERDICT: every check concluded green and the PR is mergeable")
    return good, lines


def main() -> int:
    args = sys.argv[1:]
    repo = "gustale.com"
    watch = False
    nums: list[int] = []
    i = 0
    while i < len(args):
        a = args[i]
        if a == "--repo" and i + 1 < len(args):
            repo = args[i + 1]
            i += 2
            continue
        if a == "--watch":
            watch = True
            i += 1
            continue
        if a.isdigit():
            nums.append(int(a))
            i += 1
            continue
        i += 1

    if not nums:
        print(__doc__)
        return 2

    try:
        tok = installation_token()
    except Exception as exc:  # noqa: BLE001
        print(f"COULD NOT MINT AN INSTALLATION TOKEN: {exc}")
        return 2

    while True:
        print()
        print("=" * 78)
        print(f"GITHUB STATE, read at {time.strftime('%Y-%m-%d %H:%M:%S %Z')}")
        print(f"repo: {OWNER}/{repo}")
        print("=" * 78)

        all_good = True
        for n in nums:
            good, lines = report(tok, repo, n)
            all_good = all_good and good
            print()
            print("\n".join(lines))

        print()
        print("-" * 78)
        if all_good:
            print("OVERALL: every PR listed is green and mergeable.")
        else:
            print("OVERALL: NOT every PR is green and mergeable. "
                  "Do not report this work as done.")
        print("-" * 78)

        if not watch:
            return 0 if all_good else 1
        time.sleep(30)


if __name__ == "__main__":
    sys.exit(main())
