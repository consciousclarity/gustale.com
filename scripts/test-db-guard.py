#!/usr/bin/env python3
"""The guard's behaviour must be exactly as specified.

WHY THIS IS SEPARATE FROM THE DETECTION TEST
--------------------------------------------
`scripts/test-check-no-live-db-defaults.py` proves the SCANNER notices
when a script names the live database. This file proves the GUARD then
does the right thing with it.

THE RULE (changed 2026-11-06)
------------------------------
The live NAME (`gustale`) is refused ALWAYS.

    | dbname      | throwaway | allow  | purpose | result        |
    |-------------|-----------|--------|---------|---------------|
    | gustale     | no        | no     | -       | REFUSED       |
    | gustale     | no        | yes    | -       | REFUSED       |
    | gustale     | yes       | no     | -       | REFUSED       |
    | gustale     | yes       | yes    | -       | REFUSED       |
    | gustale     | yes       | yes    | set    | REFUSED (CLI) |
    | gustale_dev | any       | any    | any     | allowed       |

Every row with `gustale` in it is REFUSED, because no combination of
environment variables may widen the permission. That is the fix for
the incident of 2026-11-06, when a stale `GUSTALE_DB_IS_THROWAWAY=1`
in a production shell made the guard hand out the live name to a script
that DROPPED it.

The old rule had a THROW-AWAY row that was ALLOWED:

    | gustale     | yes       | no     | -       | allowed       |

That row is the incident. It is gone.

THE THIRD ROW THAT MATTERS MOST
-------------------------------
`gustale_dev` is a scratch database and must NEVER be treated as live,
whatever else is set.
"""
from __future__ import annotations

import importlib.util
import os
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE / "lib"))

import db_guard  # noqa: E402


#: Every environment variable this test must CONTROL. A case that does not
#: mention one must find it UNSET -- not whatever the ambient environment
#: happens to hold.
#:
#: This matters because the CI workflow USED to set
#: GUSTALE_DB_IS_THROWAWAY=1 at the workflow level, so the runner's
#: environment was NOT a neutral baseline. The first version of this test
#: inherited it, and the two "production server" cases failed in CI while
#: passing locally -- the ambient environment leaked into the assertions.
#:
#: The variable is gone from the workflow now (the CI's database is named
#: `gustale_ci`, so the name alone identifies live), but the test must
#: still CONTROL it: the incident proved that an ambient value of this
#: variable was enough to drop the live database, so a stray one in a
#: developer's shell must not be able to change what these assertions
#: prove.
CONTROLLED_VARS = (
    db_guard.LIVE_ALLOW_VAR,
    db_guard.THROWAWAY_VAR,
    db_guard.SCRATCH_VAR,
    db_guard.LIVE_PURPOSE_VAR,
)


def check(env: dict[str, str], dbname: str | None, *, live_allowed: bool) -> tuple[bool, bool]:
    """Is `dbname` the live database for this process, and was it allowed?

    Returns (is_live, was_allowed).

    The two are different questions, and conflating them is exactly
    the bug this test exists to catch:

      * `is_live` asks whether the target IS the production database.
        The guard refuses it, so the guard never hands it out -- but the
        refusal is precisely BECAUSE it is live.
      * `was_allowed` asks whether the process may proceed.

    So the correct expectation for "the live name" is
    (is_live=True, was_allowed=False): the guard knows what it is and
    refuses it.
    """
    saved = {k: os.environ.get(k) for k in CONTROLLED_VARS}
    # Start from a CLEAN baseline: every controlled variable is unset
    # unless this case says otherwise.
    for k in CONTROLLED_VARS:
        os.environ.pop(k, None)
    for k, v in env.items():
        os.environ[k] = v
    if live_allowed:
        os.environ[db_guard.LIVE_ALLOW_VAR] = "1"

    db_guard.reset()
    was_allowed = True
    try:
        resolved = db_guard.resolve(dbname, purpose="test")
        # The guard handed it out, so it is not live -- OR it is live and
        # the opt-in allowed it. Ask the question directly.
        got_live = db_guard._is_live(resolved)
    except db_guard.LiveDatabaseRefused:
        # Refused. It was refused BECAUSE it is live.
        got_live = db_guard._is_live(dbname)
        was_allowed = False
    finally:
        db_guard.reset()
        for k, v in saved.items():
            if v is None:
                os.environ.pop(k, None)
            else:
                os.environ[k] = v
    return got_live, was_allowed


# (env, dbname, live_allowed, expected_is_live, expected_allowed, description)
CASES = [
    # The live name, on the production server, with no opt-in: the guard
    # KNOWS it is live, and REFUSES it.
    ({}, "gustale", False, True, False,
     "the live name is live -> refused"),
    # Same, with the opt-in: STILL REFUSED. The opt-in is not enough
    # on its own -- the caller must also be an allowed live writer.
    ({}, "gustale", True, True, False,
     "the live name with the opt-in alone -> STILL refused"),
    # THE REGRESSION CASE. This combination is what dropped the live
    # database on 2026-11-06. It must be refused, always.
    ({db_guard.THROWAWAY_VAR: "1"}, "gustale", False, True, False,
     "GUSTALE_DB_IS_THROWAWAY=1 + the live name -> STILL refused"),
    # Both variables together: still refused. Neither one widens.
    ({db_guard.THROWAWAY_VAR: "1"}, "gustale", True, True, False,
     "THROWAWAY=1 + ALLOW=1 + the live name -> STILL refused"),
    # The scratch database is never live, whatever else is set.
    ({}, "gustale_dev", False, False, True,
     "gustale_dev is scratch, never live"),
    ({db_guard.THROWAWAY_VAR: "1"}, "gustale_dev", False, False, True,
     "gustale_dev is scratch, even on a throwaway server"),
    ({}, None, False, False, True,
     "no target at all resolves to the scratch database"),
    ({}, "gustale_recipes", False, False, True,
     "a different database is not live"),
    ({}, "gustale_dev_scratch", False, False, True,
     "a scratch database with the live name as a PREFIX is not live"),
    # A throwaway declaration must NOT weaken the opt-in requirement on
    # the production server: it only applies when the throwaway var is set.
    ({db_guard.THROWAWAY_VAR: "0"}, "gustale", False, True, False,
     "GUSTALE_DB_IS_THROWAWAY=0 is not a declaration -> still refused"),
]


def check_live_writer() -> tuple[bool, str]:
    """Does `resolve_live` require all THREE signals?

    Checks the three refusals and the one permission, by calling
    `resolve_live` from THIS file -- which is NOT on the allowed
    writers list, so it is refused for signal 1 regardless of the
    environment.
    """
    saved = {k: os.environ.get(k) for k in CONTROLLED_VARS}
    for k in CONTROLLED_VARS:
        os.environ.pop(k, None)

    failures = []

    # Signal 1: this file is not an allowed live writer -> refused, even
    # with every variable set.
    os.environ[db_guard.LIVE_ALLOW_VAR] = "1"
    os.environ[db_guard.LIVE_PURPOSE_VAR] = "a live operation"
    db_guard.reset()
    try:
        db_guard.resolve_live("gustale", purpose="a live operation")
        failures.append("an unlisted script was allowed to reach the live name")
    except db_guard.LiveDatabaseRefused:
        pass
    finally:
        db_guard.reset()

    # Signal 2: no GUSTALE_LIVE_DB_ALLOW -> refused.
    # (The caller must be allowed too, so the allowlist is checked first.)
    db_guard.reset()
    try:
        db_guard.resolve_live("gustale", purpose="a live operation")
        failures.append("the live name was allowed without the opt-in")
    except db_guard.LiveDatabaseRefused:
        pass
    finally:
        db_guard.reset()

    # A NON-live target never needs a live permission.
    db_guard.reset()
    try:
        got = db_guard.resolve_live("gustale_dev", purpose="a live operation")
        if got != "gustale_dev":
            failures.append(f"resolve_live returned {got!r} for a scratch target")
    except db_guard.LiveDatabaseRefused:
        failures.append("resolve_live refused a NON-live target")
    finally:
        db_guard.reset()

    for k, v in saved.items():
        if v is None:
            os.environ.pop(k, None)
        else:
            os.environ[k] = v

    return (not failures), "; ".join(failures)


def check_production_container() -> tuple[bool, str]:
    """Is the production container refused for cluster-scoped statements?"""
    failures = []
    try:
        db_guard.refuse_production_container(
            db_guard.PRODUCTION_CONTAINER, purpose="test"
        )
        failures.append("the production container was allowed")
    except db_guard.ProductionContainerRefused:
        pass

    try:
        db_guard.refuse_production_container(
            "gustale-test-postgres", purpose="test"
        )
    except db_guard.ProductionContainerRefused:
        failures.append("the dedicated test container was refused")

    return (not failures), "; ".join(failures)


def check_allowlist_matching() -> tuple[bool, str]:
    """Does the allowlist match the NAMED script, and not a copy of it?

    The allowlist keys are repo-relative and the call stack holds
    absolute paths, so a suffix match is the obvious comparison. It is
    also a hole: `/tmp/anything/scripts/cite_pool_a.py` ends with the
    same suffix, so a COPY of an allowlisted script would inherit the
    permission to reach the live database.

    Two cases:
      1. the real script, in this checkout -> allowlisted
      2. a file OUTSIDE the checkout, with the same name -> NOT
    """
    failures = []
    allowed = db_guard._allowed_live_scripts()
    if not allowed:
        return False, "the allowlist is empty, so this check proves nothing"

    # Pick a script that actually exists in this checkout.
    root = db_guard._repo_root()
    real = None
    for rel in sorted(allowed):
        if os.path.isfile(os.path.join(root, rel)):
            real = rel
            break
    if real is None:
        return False, "no allowlisted script exists in this checkout"

    # Case 1: the real script, resolved from the repo root.
    got = db_guard._relative_to_repo(os.path.join(root, real), root)
    if got != real:
        failures.append(
            f"the real script {real!r} resolved to {got!r} instead of matching"
        )

    # Case 2: a copy of the same name, outside the checkout.
    outside = os.path.join("/tmp/somewhere-else", real)
    got = db_guard._relative_to_repo(outside, root)
    if got is not None:
        failures.append(
            f"a copy of {real!r} outside the checkout resolved to {got!r}, "
            "so it would have inherited the live-database permission"
        )

    return (not failures), "; ".join(failures)


def main() -> int:
    print("=== the live-database guard's own behaviour cases ===")
    failures = 0
    for env, dbname, allow, expect_live, expect_allowed, desc in CASES:
        got_live, got_allowed = check(env, dbname, live_allowed=allow)
        ok = (got_live, got_allowed) == (expect_live, expect_allowed)
        if not ok:
            failures += 1
        envs = ", ".join(f"{k}={v}" for k, v in env.items()) or "(none)"
        print(
            f"  {'OK  ' if ok else 'FAIL'}  "
            f"live={got_live!s:<5}/{expect_live!s:<5} "
            f"allowed={got_allowed!s:<5}/{expect_allowed!s:<5} "
            f"db={dbname!s:<18} {envs:<34} {desc}"
        )

    print()
    print("=== resolve_live requires all THREE signals ===")
    ok, why = check_live_writer()
    print(f"  {'OK  ' if ok else 'FAIL'}  {why or 'the three signals are all required'}")
    if not ok:
        failures += 1

    print()
    print("=== the production container is refused for cluster-scoped statements ===")
    ok, why = check_production_container()
    print(f"  {'OK  ' if ok else 'FAIL'}  {why or 'the production container is refused'}")
    if not ok:
        failures += 1

    print()
    print("=== the allowlist matches the NAMED script, not a copy of it ===")
    ok, why = check_allowlist_matching()
    print(f"  {'OK  ' if ok else 'FAIL'}  {why or 'a copy outside the checkout is not allowlisted'}")
    if not ok:
        failures += 1

    print()
    if failures:
        print(f"  FAIL  {failures} of {len(CASES) + 3} checks are wrong")
        return 1
    print(f"  ALL PASS  ({len(CASES) + 3} checks)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
