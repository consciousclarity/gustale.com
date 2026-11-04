#!/usr/bin/env python3
"""The regression test for the description-similarity gate.

WHAT THIS PROVES
----------------
`scripts/check_description_similarity.py` ALWAYS returned 0, whatever it
found. It printed the number of descriptions at or above the threshold
and then exited 0, so it could not fail a build and could not fail CI.

A gate that cannot fail is not a gate. It is a report that happens to
live in the same file as a gate, and it was in the CI path, which made
it read as a gate that was passing.

THE TWO FAILURE MODES
---------------------
1. A FINDING: a description at or above the threshold must make the
   check exit non-zero. Before the fix it exited 0.

2. NO ASSERTIONS: a check that compared NOTHING must not report
   success. If the database is unreachable, or the leads file is
   missing, or there are no dishes to compare, the check has not run
   -- and a check that did not run must not exit 0.

The second is the more insidious one. A gate that fails open when its
input is missing is worse than no gate, because it looks like a gate
that is passing.

THE TEST
--------
The script is exercised as a SUBPROCESS against a stub database and a
stub leads file, so the test does not need the live database and does
not need to touch production.

Usage:
    python3 scripts/test_description_similarity_gate.py
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
SCRIPT = REPO / "scripts" / "check_description_similarity.py"

PASSED = 0
FAILED = 0


def check(name: str, condition: bool, detail: str = "") -> None:
    global PASSED, FAILED
    if condition:
        PASSED += 1
        print(f"  PASS: {name}")
    else:
        FAILED += 1
        print(f"  FAIL: {name}" + (f" -- {detail}" if detail else ""))


def run_check(tmp: Path, dishes: list[dict], leads: dict) -> subprocess.CompletedProcess:
    """Run the similarity check against a stub database + stub leads."""
    db_file = tmp / "dishes.json"
    db_file.write_text(json.dumps(dishes))

    leads_file = tmp / "leads.json"
    leads_file.write_text(json.dumps(leads))

    env = dict(os.environ)
    env["GUSTALE_DESCRIPTION_SIMILARITY_STUB_DB"] = str(db_file)
    env["GUSTALE_DESCRIPTION_SIMILARITY_STUB_LEADS"] = str(leads_file)

    return subprocess.run(
        [sys.executable, str(SCRIPT), "--check"],
        capture_output=True,
        text=True,
        env=env,
        cwd=str(REPO),
    )


def main() -> int:
    print("=== the description-similarity gate's tests ===")

    # A dish whose description is a verbatim copy of the lead: the
    # content n-gram overlap is 1.0, well above the 0.45 threshold.
    copied_lead = (
        "Sushi is a Japanese dish consisting of prepared vinegared rice "
        "with seafood, usually served with other dishes."
    )
    copied_dish = {
        "slug": "sushi",
        "canonical_name": "Sushi",
        "short_description": "",
        "long_description": copied_lead,
    }
    copied_leads = {"sushi": copied_lead}

    # A dish with its own wording: no shared 3-grams.
    own_dish = {
        "slug": "tacos-al-pastor",
        "canonical_name": "Tacos al pastor",
        "short_description": "",
        "long_description": (
            "Trompos al pastor are shaved from a vertical spit of "
            "marinated pork, seared against a hot plate, and folded into "
            "a corn tortilla with onion and coriander."
        ),
    }
    own_leads = {"tacos-al-pastor": "Some encyclopedic sentence entirely unlike that one."}

    with tempfile.TemporaryDirectory() as td:
        tmp = Path(td)

        # ── 1. a finding must fail ─────────────────────────────────────
        r = run_check(tmp, [copied_dish], copied_leads)
        check(
            "a description at or above the threshold FAILS the check",
            r.returncode != 0,
            f"the exit was {r.returncode}, expected non-zero",
        )
        check(
            "the failure names the offending description",
            "sushi" in r.stdout,
            "the output did not name the slug",
        )
        check(
            "the failure says FAIL",
            "FAIL" in r.stdout,
            "the output did not say FAIL",
        )

        # ── 2. a clean description must pass ───────────────────────────
        r = run_check(tmp, [own_dish], own_leads)
        check(
            "a description below the threshold PASSES the check",
            r.returncode == 0,
            f"the exit was {r.returncode}, expected 0; the output was: {r.stdout[-300:]}",
        )

        # ── 3. no dishes at all must NOT be a pass ─────────────────────
        r = run_check(tmp, [], {})
        check(
            "ZERO descriptions compared FAILS the check",
            r.returncode != 0,
            f"the exit was {r.returncode}, expected non-zero",
        )
        check(
            "the zero-assertion failure says it did not run",
            "did not run" in r.stdout,
            f"the output was: {r.stdout[-300:]}",
        )

        # ── 4. a dish with no lead is not a comparison ─────────────────
        # The check skips a dish it has no lead for. If EVERY dish is
        # skipped, nothing was compared -- which is the zero-assertion
        # case again, and must fail.
        r = run_check(tmp, [own_dish], {"some-other-slug": "a lead"})
        check(
            "a dish with NO lead compares nothing and FAILS",
            r.returncode != 0,
            f"the exit was {r.returncode}, expected non-zero",
        )

        # ── 5. the report mode stays informational ─────────────────────
        env = dict(os.environ)
        db_file = tmp / "dishes.json"
        db_file.write_text(json.dumps([copied_dish]))
        leads_file = tmp / "leads.json"
        leads_file.write_text(json.dumps(copied_leads))
        env["GUSTALE_DESCRIPTION_SIMILARITY_STUB_DB"] = str(db_file)
        env["GUSTALE_DESCRIPTION_SIMILARITY_STUB_LEADS"] = str(leads_file)
        r = subprocess.run(
            [sys.executable, str(SCRIPT), "--report"],
            capture_output=True,
            text=True,
            env=env,
            cwd=str(REPO),
        )
        check(
            "the REPORT mode exits 0 even with a finding (it is a tool, not the gate)",
            r.returncode == 0,
            f"the exit was {r.returncode}, expected 0",
        )

    print()
    print(f"=== the description-similarity gate's tests: {PASSED} passed, {FAILED} failed ===")
    return 0 if FAILED == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
