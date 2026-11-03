#!/usr/bin/env python3
"""The one place that decides whether a script may touch the live database.

WHY THIS EXISTS
---------------
Three separate incidents reached the LIVE cluster from diagnostics:

  1. `probe_issuer` — a scratch role created on live by a `psql` shim
     that redirected to the shared container. The script pointed at a
     throwaway DATABASE, but `CREATE ROLE` is CLUSTER-SCOPED, so the
     scratch-database isolation was the wrong granularity.
  2. The membership probe that used the same role.
  3. An atlas stress harness (audited later: it did NOT reach live,
     but it was one default away from it).

The common shape is: a diagnostic reached production because live was
the DEFAULT, not because anything asked it to.

THE RULE
--------
A diagnostic or test script may not reach the live database unless it
is told to, BY NAME, at the moment it runs:

    GUSTALE_LIVE_DB_ALLOW=1 python3 scripts/whatever.py

Why a SEPARATE variable, and not `GUSTALE_DB_NAME=gustale`:

  * `GUSTALE_DB_NAME` is what every script already reads. Using it as
    the opt-in is not a separate signal — it is the same signal, and a
    stale export would silently re-enable live access.
  * `DATABASE_URL` is worse: `dotenv` does NOT override an existing
    `DATABASE_URL`, so a stale one in the shell silently wins over the
    repo's `.env`. That is a live trap in this repo already.

`GUSTALE_LIVE_DB_ALLOW` is read from the process environment ONLY. It
is not read from a `.env` file, not from a shell profile, and not from
any config file. It has to be typed for one invocation.

THE SCRATCH DATABASE
--------------------
`GUSTALE_SCRATCH_DB` names the disposable database that diagnostics
use. It defaults to `gustale_dev`. It must never be the live database;
:func:`resolve` refuses that.

THE SAME NAME, A DIFFERENT SERVER
---------------------------------
A NAME cannot identify the live database. The CI's Postgres service
container is deliberately named `gustale` too, so that the CI schema
mirrors live's exactly -- same dbname, same roles, same guards. A
script told `--db gustale` on the CI runner is talking to a THROWAWAY
database that lives for one job.

So "is this live?" is not one question. It is two:

  1. Is the dbname the live name (`gustale`)? and
  2. Is the SERVER the live server?

The live server is the VPS's own Postgres -- the `shared-postgres`
container, reachable on this host at 127.0.0.1:5432. A CI service
container is also on 127.0.0.1:5432, but it is a DIFFERENT server that
happens to share the address.

The rule therefore is: the live database is live **only** when the
dbname matches AND the process has not declared itself to be running
against a throwaway server. `GUSTALE_DB_IS_THROWAWAY=1` is that
declaration, and it is set by the CI workflow -- which runs on a GitHub
runner, where `127.0.0.1:5432` is the job's own service container and
never the production VPS.

`GUSTALE_DB_IS_THROWAWAY` is a statement about the SERVER, not about
the data, so it does not weaken the rule that matters: a diagnostic on
the production host still cannot reach live without
`GUSTALE_LIVE_DB_ALLOW=1`.
"""
from __future__ import annotations

import os
import re
import sys

#: The live production database. Nothing else is live.
LIVE_DB = "gustale"

#: The variable that must be set to exactly "1" to allow live access.
LIVE_ALLOW_VAR = "GUSTALE_LIVE_DB_ALLOW"

#: The variable naming the disposable database diagnostics may use.
SCRATCH_VAR = "GUSTALE_SCRATCH_DB"

#: Declares that THIS PROCESS is running against a throwaway server.
#:
#: The CI's Postgres service container is deliberately named `gustale`, so
#: that the CI schema mirrors live's exactly. A script told `--db gustale`
#: on a GitHub runner is talking to a database that lives for one job.
#:
#: This variable says "the server is not the production one". It does NOT
#: say "live data is fine" -- on the production host the guard still
#: refuses the live database without GUSTALE_LIVE_DB_ALLOW=1.
THROWAWAY_VAR = "GUSTALE_DB_IS_THROWAWAY"

#: The default scratch database.
DEFAULT_SCRATCH_DB = "gustale_dev"

#: Set by :func:`resolve` so a later call cannot silently switch
#: databases mid-script.
_RESOLVED: str | None = None


class LiveDatabaseRefused(RuntimeError):
    """Raised when something tries to reach the live DB without opt-in."""


def _dbname_from_dsn(dsn: str) -> str | None:
    """Extract the database name from a postgres DSN.

    Handles both URL form (postgresql://user:pw@host:port/db?opts) and
    the keyword/value form (dbname=x host=y).
    """
    if not dsn:
        return None

    if "://" in dsn:
        # postgresql://user:password@host:port/dbname?params
        rest = dsn.split("://", 1)[1]
        # strip the query string
        rest = rest.split("?", 1)[0]
        # strip the fragment
        rest = rest.split("#", 1)[0]
        # remove the userinfo
        if "@" in rest:
            rest = rest.rsplit("@", 1)[1]
        # the dbname is after the last "/"
        if "/" in rest:
            name = rest.rsplit("/", 1)[1]
            return name or None
        return None

    # keyword=value form
    m = re.search(r"(?:^|\s)dbname\s*=\s*(\S+)", dsn)
    if m:
        return m.group(1).strip("'\"")
    return None


def server_is_throwaway() -> bool:
    """Is this process running against a throwaway server?

    Set by the CI workflow. It means "the server is not the production
    VPS's Postgres", not "live data is acceptable here".
    """
    return os.environ.get(THROWAWAY_VAR, "").strip() == "1"


def _is_live(dbname: str | None) -> bool:
    """Is this the live database?

    Two conditions, both required:

      1. the dbname is exactly the live name. The check is exact on
         purpose. `gustale_dev` is NOT live, and `gustale` IS. A prefix
         match would wrongly call `gustale_dev` live; a fuzzy match
         would wrongly call `gustale_recipes` live.
      2. the server is not a declared throwaway.

    Condition 2 exists because the CI's service container is named
    `gustale` on purpose, so the CI schema mirrors live's exactly.
    """
    if dbname != LIVE_DB:
        return False
    return not server_is_throwaway()


def live_allowed() -> bool:
    """Is live access permitted in THIS process?"""
    return os.environ.get(LIVE_ALLOW_VAR, "").strip() == "1"


def scratch_database() -> str:
    """The disposable database diagnostics should use.

    Raises if someone has pointed it at the live database, because a
    scratch database that IS the live database is not a scratch
    database.
    """
    name = os.environ.get(SCRATCH_VAR, "").strip() or DEFAULT_SCRATCH_DB
    if _is_live(name):
        raise LiveDatabaseRefused(
            f"{SCRATCH_VAR} is set to the live database ({LIVE_DB}). "
            f"{SCRATCH_VAR} must name a DISPOSABLE database. "
            f"Unset it to use the default ({DEFAULT_SCRATCH_DB})."
        )
    return name


def resolve(dbname: str | None = None, *, purpose: str = "this script") -> str:
    """Resolve and vet the database this process may use.

    Returns the database name to use. Raises
    :class:`LiveDatabaseRefused` if that database is the live one and
    the process has not opted in.

    Call this at the START of a script, not at the point of use.
    """
    global _RESOLVED

    if _RESOLVED is not None:
        if dbname is not None and dbname != _RESOLVED:
            raise LiveDatabaseRefused(
                f"{purpose} already resolved its database to {_RESOLVED!r} "
                f"and may not now switch to {dbname!r}. Resolve once, "
                f"at the start."
            )
        return _RESOLVED

    if dbname is None:
        # No explicit target: use the scratch database. A diagnostic
        # with no stated target must NEVER default to live.
        dbname = scratch_database()
    elif not dbname:
        raise LiveDatabaseRefused(f"{purpose} was given an empty database name.")

    if _is_live(dbname):
        if not live_allowed():
            raise LiveDatabaseRefused(
                f"\n"
                f"  REFUSED: {purpose} would run against the LIVE database "
                f"({LIVE_DB!r}).\n"
                f"\n"
                f"  A diagnostic or test script must not touch live data by\n"
                f"  default. Live access is an explicit, per-invocation\n"
                f"  opt-in, and this process has not made it.\n"
                f"\n"
                f"  If you really mean to write to live, run it as:\n"
                f"\n"
                f"      {LIVE_ALLOW_VAR}=1 <your command>\n"
                f"\n"
                f"  ...and make sure it goes through the live-approval gate\n"
                f"  (scripts/check-live-approval.sh). If this is a test, the\n"
                f"  right target is the scratch database instead:\n"
                f"\n"
                f"      {SCRATCH_VAR}={DEFAULT_SCRATCH_DB} <your command>\n"
            )
        # Opted in. Fine.

    _RESOLVED = dbname
    return dbname


def resolve_from_env(purpose: str = "this script", *, var: str = "DATABASE_URL") -> str:
    """Resolve the database from a DSN in the environment.

    This is the path a script takes when it already has a
    ``DATABASE_URL``. The DSN's dbname is what matters — that is what
    actually determines where the connection goes.
    """
    dsn = os.environ.get(var, "")
    dbname = _dbname_from_dsn(dsn)
    if not dbname:
        # No usable DSN. Fall back to the scratch database rather than
        # letting the caller's own default decide.
        return resolve(None, purpose=purpose)
    return resolve(dbname, purpose=purpose)


def assert_not_live(dbname: str | None, *, purpose: str = "this script") -> None:
    """Refuse if ``dbname`` is live and there is no opt-in.

    For callers that already know the name and just want the check.
    """
    if dbname and _is_live(dbname) and not live_allowed():
        resolve(dbname, purpose=purpose)  # raises with the good message


def reset() -> None:
    """Forget the resolved database. For tests only."""
    global _RESOLVED
    _RESOLVED = None


def _main(argv: list[str]) -> int:
    """CLI: report what this process may use, and vet an optional target."""
    purpose = argv[0] if argv else "this script"
    if len(argv) > 1:
        target = argv[1]
    else:
        target = os.environ.get(SCRATCH_VAR, "").strip() or DEFAULT_SCRATCH_DB
    try:
        resolved = resolve(target, purpose=purpose)
    except LiveDatabaseRefused as exc:
        print(str(exc), file=sys.stderr)
        return 1
    print(resolved)
    return 0


if __name__ == "__main__":
    sys.exit(_main(sys.argv[1:]))
