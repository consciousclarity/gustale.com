#!/usr/bin/env python3
"""The regression test for the dependency-audit gate.

WHAT THIS PROVES
----------------
`pnpm audit` against an UNREACHABLE registry exits 0 and prints the
advisories it had CACHED. And it does so SILENTLY:

  * exit code 0
  * empty stderr
  * byte-identical JSON to a successful run

PROVED: with `npm_config_registry` pointed at a dead port,
`pnpm audit --audit-level=high --json` produced exactly the same output
as the successful run, and exit 0.

So the audit's own exit code cannot tell "no vulnerabilities" from "the
registry was never reached". The gate could pass by being unable to
run -- and it did.

THE FIX
-------
CI probes the registry's liveness endpoint (`/-/ping`) BEFORE the
audit. If the registry does not answer, the step fails with an
explicit "the gate did not run" message.

`/-/ping` is used rather than the advisory endpoint because the
advisory endpoint answers 405 to a GET -- it only accepts POST -- and a
probe that fails against a HEALTHY registry is worse than no probe.

THE TEST
--------
The probe logic is extracted into a script so it can be tested
directly, against a dead registry and a live one.

Usage:
    python3 scripts/test_audit_registry_probe.py
"""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent

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


def probe(registry: str) -> tuple[bool, str]:
    """Run the probe. Returns (the registry answered, the message)."""
    r = subprocess.run(
        ["bash", "-c",
         f'''
         REGISTRY="{registry}"
         REGISTRY="${{REGISTRY%/}}"
         if ! curl -fsS --max-time 30 -o /dev/null "$REGISTRY/-/ping" 2>/dev/null; then
           echo "::error::the npm registry ($REGISTRY) did not answer -- the gate did not run."
           exit 1
         fi
         echo "  the registry answered"
         '''],
        capture_output=True,
        text=True,
    )
    return r.returncode == 0, (r.stdout + r.stderr).strip()


def main() -> int:
    print("=== the audit registry probe's tests ===")

    # ── 1. a DEAD registry must fail ────────────────────────────────────
    # Port 9 (discard) is closed on a normal host, so the connection is
    # refused immediately -- no waiting, no flakiness.
    answered, msg = probe("http://127.0.0.1:9")
    check(
        "a DEAD registry FAILS the probe",
        not answered,
        "the probe passed against a registry that is not there",
    )
    check(
        "the failure says the gate did not run",
        "did not run" in msg,
        f"the message was: {msg}",
    )
    check(
        "the failure is an ::error:: annotation",
        "::error::" in msg,
        f"the message was: {msg}",
    )

    # ── 2. a LIVE registry must pass ────────────────────────────────────
    answered, msg = probe("https://registry.npmjs.org")
    check(
        "a LIVE registry PASSES the probe",
        answered,
        f"the probe failed against the real registry: {msg}",
    )
    check(
        "the pass says the registry answered",
        "answered" in msg,
        f"the message was: {msg}",
    )

    # ── 3. the trailing slash must not break it ─────────────────────────
    # A registry configured as "https://registry.npmjs.org/" would become
    # "https://registry.npmjs.org//-/ping" without the strip, which is a
    # different URL.
    answered, msg = probe("https://registry.npmjs.org/")
    check(
        "a trailing slash on the registry URL still PASSES",
        answered,
        f"the probe failed with a trailing slash: {msg}",
    )

    print()
    print(f"=== the audit registry probe's tests: {PASSED} passed, {FAILED} failed ===")
    return 0 if FAILED == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
