#!/usr/bin/env python3
"""The guard's behaviour must be exactly as specified -- in particular the
rule that decides whether a database named `gustale` is the LIVE one.

WHY THIS IS SEPARATE FROM THE DETECTION TEST
--------------------------------------------
`scripts/test-check-no-live-db-defaults.py` proves the SCANNER notices
when a script names the live database. This file proves the GUARD then
does the right thing with it.

The subtle case is the CI. Its Postgres service container is deliberately
named `gustale`, so the CI schema mirrors live's exactly -- same dbname,
same roles, same guards. A name therefore cannot identify the live
database, and the guard asks about the SERVER as well:

    GUSTALE_DB_IS_THROWAWAY=1   the server is a throwaway (the CI's)

The rule must hold in all four combinations:

    | dbname      | throwaway | allow  | live? |
    |-------------|-----------|--------|-------|
    | gustale     | no        | no     | YES   |
    | gustale     | no        | yes    | no    |
    | gustale     | yes       | no     | no    |
    | gustale     | yes       | yes    | no    |
    | gustale_dev | any       | any    | no    |

The fifth row is the one that matters most: `gustale_dev` is a scratch
database and must NEVER be treated as live, whatever else is set.
"""
from __future__ import annotations

import importlib.util
import os
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE / "lib"))

import db_guard  # noqa: E402


def check(env: dict[str, str], dbname: str | None, *, live_allowed: bool) -> tuple[bool, bool]:
    """Is `dbname` the live database for this process, and was it allowed?

    Returns (is_live, was_allowed).

    The two are different questions, and conflating them is exactly the
    bug this test exists to catch:

      * `is_live` asks whether the target IS the production database.
        The guard refuses it, so the guard never hands it out -- but the
        refusal is precisely BECAUSE it is live.
      * `was_allowed` asks whether the process may proceed.

    So the correct expectation for "the live name, no opt-in" is
    (is_live=True, was_allowed=False): the guard knows what it is and
    refuses it.
    """
    saved = {k: os.environ.get(k) for k in env}
    saved_allow = os.environ.get(db_guard.LIVE_ALLOW_VAR)
    for k, v in env.items():
        if v is None:
            os.environ.pop(k, None)
        else:
            os.environ[k] = v
    if live_allowed:
        os.environ[db_guard.LIVE_ALLOW_VAR] = "1"
    else:
        os.environ.pop(db_guard.LIVE_ALLOW_VAR, None)

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
        if saved_allow is None:
            os.environ.pop(db_guard.LIVE_ALLOW_VAR, None)
        else:
            os.environ[db_guard.LIVE_ALLOW_VAR] = saved_allow
    return got_live, was_allowed


# (env, dbname, live_allowed, expected_is_live, expected_allowed, description)
CASES = [
    # The production server, the live name, no opt-in: the guard KNOWS it
    # is live, and REFUSES it.
    ({}, "gustale", False, True, False,
     "the live name on the production server IS live -> refused"),
    # Same, with the opt-in: allowed through.
    ({}, "gustale", True, True, True,
     "the live name with the opt-in -> allowed"),
    # The CI's service container is also named `gustale`, but the server
    # is a throwaway, so it is NOT live.
    ({db_guard.THROWAWAY_VAR: "1"}, "gustale", False, False, True,
     "the CI's throwaway server is NOT live -> allowed"),
    ({db_guard.THROWAWAY_VAR: "1"}, "gustale", True, False, True,
     "the CI's throwaway server is NOT live, even with the opt-in"),
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
    if failures:
        print(f"  FAIL  {failures} of {len(CASES)} cases are wrong")
        return 1
    print(f"  ALL PASS  ({len(CASES)} cases)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
