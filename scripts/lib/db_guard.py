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

And on 2026-11-06:

  4. The live `gustale` database was DROPPED and recreated empty.

The common shape is: a diagnostic reached production because live was
the DEFAULT, or because a flag said it was allowed to.

THE RULE
--------
A diagnostic or test script may not reach the live database. There is
no opt-in for that, and no environment variable that can grant it.

    resolve("gustale")   ->  ALWAYS raises LiveDatabaseRefused

That is the whole rule. Everything below is the reasoning, the
mechanics, and the ONE narrow path to a genuinely approved live
operation.

THE 2026-11-06 INCIDENT -- WHY THE LIVE NAME IS NOW UNCONDITIONAL
-----------------------------------------------------------------
The guard used to have two conditions for "this is live":

    1. the dbname is exactly `gustale`, AND
    2. the server is not a declared throwaway
       (GUSTALE_DB_IS_THROWAWAY=1)

Condition 2 existed because the CI's Postgres service container is
deliberately named `gustale`, so the CI schema mirrors live's exactly.
On a GitHub runner, 127.0.0.1:5432 is the job's own service container
and never the production VPS's Postgres, so the workflow set
GUSTALE_DB_IS_THROWAWAY=1 to say so.

But a flag that can turn a refusal OFF is not a safety control; it is
a hazard with a nice name. On 2026-11-06 a stale
`GUSTALE_DB_IS_THROWAWAY=1` was exported in a shell on the PRODUCTION
host — copied from the CI workflow, where it is true — and it made
`resolve("gustale")` hand out the live name to a script that then ran

    DROP DATABASE IF EXISTS gustale; CREATE DATABASE gustale;

against the production cluster. The live database was destroyed and
restored from a backup.

So the lesson is structural, not procedural:

    A name that must never be dropped may not be protected by a flag
    that anyone can set.

The live NAME is now refused by NAME, alone. No environment variable
can widen that permission — every variable in this module can only
ever NARROW what is permitted.

THE ONE PATH TO AN APPROVED LIVE OPERATION
-------------------------------------------
A live WRITE still has to be possible, or the site could never be
updated. It is possible through :func:`resolve_live`, which requires
THREE independent signals:

  1. The calling SCRIPT is named in :data:`ALLOWED_LIVE_WRITERS` (or
     :data:`ALLOWED_LIVE_READERS`). This is CODE, not a variable: it
     is the file the process is running as, read from the call stack.
     A command line cannot prove which file it came from, so the
     command-line interface NEVER reaches the live name.

  2. `GUSTALE_LIVE_DB_ALLOW=1` is set for THIS invocation.

  3. `GUSTALE_LIVE_PURPOSE` names the operation, and matches the
     purpose the script declares. Approval for a live action is per
     OPERATION, and the operator has to say which one.

And behind all three stands the live-approval gate
(scripts/check-live-approval.sh), which records the owner's `go` for
the specific PR. The variables only narrow; the gate is the decision.

THE SCRATCH DATABASE
--------------------
`GUSTALE_SCRATCH_DB` names the disposable database that diagnostics
use. It defaults to `gustale_dev`. It must never be the live database;
:func:`scratch_database` refuses that, by name, unconditionally.

THE TEST DATABASE IS NOT ON THE PRODUCTION CLUSTER
--------------------------------------------------
A test or throwaway database must never be created on the production
Postgres container (`shared-postgres`), because `DROP DATABASE` is a
CLUSTER-SCOPED operation and the cluster is shared with other
projects. :func:`refuse_production_container` enforces this for the
scripts that drop databases, and scripts/check-no-production-db-drops.py
fails the CI build if any script manages to do it anyway.
"""
from __future__ import annotations

import inspect
import os
import re
import sys

#: The live production database. Nothing else is live.
LIVE_DB = "gustale"

#: The production Postgres container on the VPS.
#:
#: It is shared with other projects (bali, dewata, n8n, scribe), so a
#: `DROP DATABASE` aimed at it is a hazard for all of them. No
#: throwaway or test database may be created here, ever.
PRODUCTION_CONTAINER = "shared-postgres"

#: The variable that must be set to exactly "1" to allow a live
#: operation. It NARROWS nothing on its own: without the other two
#: signals it grants nothing.
LIVE_ALLOW_VAR = "GUSTALE_LIVE_DB_ALLOW"

#: The variable naming WHAT live operation this invocation is.
#:
#: It must name the same purpose the script declares, so a stale
#: export of :data:`LIVE_ALLOW_VAR` alone cannot authorise anything:
#: it cannot guess the purpose string.
LIVE_PURPOSE_VAR = "GUSTALE_LIVE_PURPOSE"

#: The variable naming the disposable database diagnostics may use.
SCRATCH_VAR = "GUSTALE_SCRATCH_DB"

#: Declares that THIS PROCESS is running against a throwaway server.
#:
#: The CI's Postgres service container is deliberately named `gustale`, so
#: that the CI schema mirrors live's exactly. A script told `--db gustale`
#: on a GitHub runner is talking to a database that lives for one job.
#:
#: This variable says "the server is not the production one". Since
#: 2026-11-06 it CANNOT make the live NAME acceptable -- it can only
#: ever relax a NON-live target, and it is never consulted for the live
#: name at all.
THROWAWAY_VAR = "GUSTALE_DB_IS_THROWAWAY"

#: The scripts that may WRITE to the live database.
#:
#: Each entry is (script path, reason). The reason is part of the
#: contract: if the script's purpose changes, the reason must change
#: too.
#:
#: The list is deliberately short. A script earns its place here by
#: going through the live-approval gate, and by being a script whose
#: JOB is to write to live. Everything else -- every diagnostic, every
#: test, every scratch tool -- is refused the live name outright, on
#: every host, under every environment.
ALLOWED_LIVE_WRITERS: dict[str, str] = {
    "scripts/cite_pool_a.py": (
        "Writes source classifications to live THROUGH the live-approval "
        "gate. The gate is the only path."
    ),
    "scripts/classify_pool_a_cuisines.py": (
        "Writes cuisine classifications to live THROUGH the live-approval "
        "gate. The gate is the only path."
    ),
    "scripts/classify_pool_a_families.py": (
        "Writes family classifications to live THROUGH the live-approval "
        "gate. The gate is the only path."
    ),
    "scripts/import_pool_a.py": (
        "Imports a Pool A batch to live THROUGH the live-approval gate, "
        "in named batches. The gate is the only path."
    ),
    "scripts/populate_description_sentences.py": (
        "Populates the description sentences to live THROUGH the "
        "live-approval gate. The gate is the only path."
    ),
    "scripts/backfill_pool_a_sample.py": (
        "Backfills the 10% review sample to live THROUGH the "
        "live-approval gate. The gate is the only path."
    ),
    "scripts/find_source_candidates.py": (
        "The GUS-1010 candidate finder. Its writes are gated by the "
        "live-approval label, and its default target is a scratch copy."
    ),
    "scripts/seed_statements_from_dish_content.py": (
        "Seeds statements from dish content to live THROUGH the "
        "live-approval gate. It REFUSES to write to live by itself "
        "(see its own --apply check) and is here only for its reads."
    ),
}

#: The scripts that may READ the live database.
#:
#: A read cannot destroy anything, but it still must be a deliberate
#: act, and it still must be a script whose job it is.
ALLOWED_LIVE_READERS: dict[str, str] = {
    "scripts/hermes/record-live-counts.py": (
        "Records the live counts before and after a migration. "
        "READ-ONLY by construction: it only ever runs SELECTs."
    ),
    "scripts/hermes/gus-014-check-other-dishes.py": (
        "Audits the other dishes' associations. READ-ONLY."
    ),
    "scripts/hermes/gus-014-audit-relations.py": (
        "Audits the relation rows. READ-ONLY."
    ),
    "scripts/hermes/gus-014-build-118-mapping.py": (
        "Builds the 118-dish mapping. READ-ONLY against live."
    ),
    "scripts/hermes/test-118-mapping-regression.py": (
        "A READ-ONLY regression test. It compares the generated mapping "
        "against the live database to prove nothing was silently lost. "
        "It never writes to live."
    ),
}

#: The default scratch database.
DEFAULT_SCRATCH_DB = "gustale_dev"

#: Set by :func:`resolve` so a later call cannot silently switch
#: databases mid-script.
_RESOLVED: str | None = None


class LiveDatabaseRefused(RuntimeError):
    """Raised when something tries to reach the live DB."""


class ProductionContainerRefused(RuntimeError):
    """Raised when a throwaway database is aimed at the production cluster."""


def _dbname_from_dsn(dsn: str) -> str | None:
    """Extract the database name from a postgres DSN.

    Handles both URL form (postgresql://user:***@host:port/db?opts) and
    the keyword/value form (dbname=x host=y).
    """
    if not dsn:
        return None

    if "://" in dsn:
        # postgresql://user:***@host:port/dbname?params
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
    VPS's Postgres".

    Since 2026-11-06 this variable CANNOT make the live NAME acceptable.
    It used to, and that is exactly how the live database was dropped:
    a stale `GUSTALE_DB_IS_THROWAWAY=1` in a production shell made
    `resolve("gustale")` hand out the live name, and the caller DROPPED
    it. The variable now only ever relaxes a NON-live target.
    """
    return os.environ.get(THROWAWAY_VAR, "").strip() == "1"


def _is_live(dbname: str | None) -> bool:
    """Is this the live database?

    ONE condition, and it is about the NAME only:

        the dbname is exactly the live name.

    The check is exact on purpose. `gustale_dev` is NOT live, and
    `gustale` IS. A prefix match would wrongly call `gustale_dev` live;
    a fuzzy match would wrongly call `gustale_recipes` live.

    There used to be a SECOND condition -- "and the server is not a
    declared throwaway" -- because the CI's service container is named
    `gustale` on purpose, so the CI schema mirrors live's exactly.

    That second condition is GONE, and it is gone because of the
    2026-11-06 incident. A NAME plus a VARIABLE could be un-refused:
    `GUSTALE_DB_IS_THROWAWAY=1` turned the guard's refusal off for the
    one name the guard exists to protect, and the database was dropped.

    A name that must never be dropped may not be protected by a flag
    that anyone can set. So the live NAME is refused outright, and the
    scripts that legitimately need a database called `gustale` -- the
    CI's, and the live-approval gate's -- reach it through
    :func:`resolve_live`, which is code, not an environment variable.
    """
    return dbname == LIVE_DB


def live_allowed() -> bool:
    """Is live access permitted in THIS process?

    This is necessary but NOT sufficient for :func:`resolve_live`. It
    is one of three independent signals; on its own it grants nothing.
    """
    return os.environ.get(LIVE_ALLOW_VAR, "").strip() == "1"


def _calling_scripts() -> list[str]:
    """The paths of the scripts in the call stack, outside this module.

    Used to decide whether this caller is one of the
    :data:`ALLOWED_LIVE_WRITERS` or :data:`ALLOWED_LIVE_READERS`. Every
    frame outside `db_guard.py` is returned, so a live writer is
    recognised even when it reaches the guard through a helper module.

    When the guard is run as a COMMAND (`python3 scripts/lib/db_guard.py
    ...`) every frame is inside this module, so the list is EMPTY. That
    is deliberate: the command line is the one place where the caller
    cannot be identified by its file, so the command line NEVER reaches
    the live name.
    """
    frames: list[str] = []
    frame = inspect.currentframe()
    try:
        while frame is not None:
            filename = frame.f_code.co_filename
            if os.path.basename(filename) != os.path.basename(__file__):
                frames.append(os.path.normpath(filename))
            frame = frame.f_back
    finally:
        # Break the reference cycle frames create.
        del frame
    return frames


def _allowed_live_scripts() -> dict[str, str]:
    """Every script allowed to reach the live name, writers and readers."""
    return {**ALLOWED_LIVE_WRITERS, **ALLOWED_LIVE_READERS}


def _is_allowed_live_script() -> str | None:
    """The allowlisted script this process is, or None.

    The match is on the FILE the process is running as. A string the
    caller passes in is not a signal — it is a claim.
    """
    allowed = _allowed_live_scripts()
    for caller in _calling_scripts():
        for allowed_path in allowed:
            if caller.endswith(allowed_path):
                return allowed_path
    return None


def scratch_database() -> str:
    """The disposable database diagnostics should use.

    Raises if someone has pointed it at the live database, because a
    scratch database that IS the live database is not a scratch
    database. This refusal is by NAME and is unconditional.
    """
    name = os.environ.get(SCRATCH_VAR, "").strip() or DEFAULT_SCRATCH_DB
    if _is_live(name):
        raise LiveDatabaseRefused(
            f"{SCRATCH_VAR} is set to the live database ({LIVE_DB}). "
            f"{SCRATCH_VAR} must name a DISPOSABLE database. "
            f"Unset it to use the default ({DEFAULT_SCRATCH_DB})."
        )
    return name


def _refusal_message(purpose: str) -> str:
    return (
        f"\n"
        f"  REFUSED: {purpose} would run against the LIVE database "
        f"({LIVE_DB!r}).\n"
        f"\n"
        f"  The live NAME is refused ALWAYS. No environment variable can\n"
        f"  override this -- in particular NOT {THROWAWAY_VAR}=1, which is\n"
        f"  what allowed the live database to be dropped on 2026-11-06.\n"
        f"  A diagnostic or test script must not touch live data, ever,\n"
        f"  and neither may a destructive script.\n"
        f"\n"
        f"  If this is a test, the right target is a throwaway database:\n"
        f"\n"
        f"      {SCRATCH_VAR}={DEFAULT_SCRATCH_DB} <your command>\n"
        f"\n"
        f"  If this is an APPROVED live operation, it must be a script on\n"
        f"  the guard's allowed-writers list, and it must carry BOTH:\n"
        f"\n"
        f"      {LIVE_ALLOW_VAR}=1 {LIVE_PURPOSE_VAR}='<the operation>' <cmd>\n"
        f"\n"
        f"  ...and the live-approval gate (scripts/check-live-approval.sh)\n"
        f"  must have recorded the owner's go for it.\n"
    )


def resolve(dbname: str | None = None, *, purpose: str = "this script") -> str:
    """Resolve and vet the database a DIAGNOSTIC or TEST may use.

    Returns the database name to use. Raises
    :class:`LiveDatabaseRefused` if that database is the live one --
    ALWAYS, with no environment-variable escape.

    This is the function every diagnostic and test must use. A live
    writer uses :func:`resolve_live` instead.

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
        # THE LIVE NAME. Unconditional. No variable can turn it off.
        raise LiveDatabaseRefused(_refusal_message(purpose))

    _RESOLVED = dbname
    return dbname


def resolve_live(
    dbname: str | None = None,
    *,
    purpose: str = "this live operation",
    write: bool = True,
) -> str:
    """Resolve the database for an APPROVED live operation.

    This is the ONLY way to reach the live database. It requires THREE
    independent signals, and each one alone is insufficient:

      1. The calling SCRIPT is on :data:`ALLOWED_LIVE_WRITERS` (for a
         write) or :data:`ALLOWED_LIVE_READERS` (for a read). This is
         read from the CALL STACK -- the file the process is running
         as -- so it cannot be faked by a string argument.

      2. `GUSTALE_LIVE_DB_ALLOW=1` is set for this invocation.

      3. `GUSTALE_LIVE_PURPOSE` names this exact operation.

    Behind all three stands the live-approval gate
    (scripts/check-live-approval.sh), which records the owner's `go`.

    Every signal NARROWS. None of them can widen a permission on its
    own, and that is the point: the old `GUSTALE_DB_IS_THROWAWAY=1`
    escape hatch could widen, and it destroyed the live database.
    """
    global _RESOLVED

    allowed = ALLOWED_LIVE_WRITERS if write else ALLOWED_LIVE_READERS
    both = _allowed_live_scripts()

    if dbname is not None and not _is_live(dbname):
        # Not a live target at all: no live permission is needed, and
        # none is granted by asking for it.
        return resolve(dbname, purpose=purpose)

    script = _is_allowed_live_script()
    if script is None or script not in allowed:
        raise LiveDatabaseRefused(
            _refusal_message(purpose)
            + f"\n"
            f"  This script is not on the guard's "
            f"{'allowed-writers' if write else 'allowed-readers'} list.\n"
            f"  The scripts that are: "
            f"{', '.join(sorted(allowed)) or '(none)'}\n"
        )

    if not live_allowed():
        raise LiveDatabaseRefused(
            _refusal_message(purpose)
            + f"\n"
            f"  {LIVE_ALLOW_VAR} is not set for this invocation.\n"
        )

    declared = os.environ.get(LIVE_PURPOSE_VAR, "").strip()
    if declared != purpose:
        raise LiveDatabaseRefused(
            _refusal_message(purpose)
            + f"\n"
            f"  {LIVE_PURPOSE_VAR} is {declared!r}, but this operation is\n"
            f"  {purpose!r}. Approval is per OPERATION: the purpose must\n"
            f"  name exactly what is about to happen to live.\n"
        )

    resolved = dbname or LIVE_DB
    _RESOLVED = resolved
    return resolved


def resolve_target(
    dbname: str | None = None,
    *,
    purpose: str = "this script",
    write: bool = True,
) -> str:
    """Resolve a target that MAY be the live database.

    This is the function a script that can legitimately touch live
    uses. It dispatches:

      * a NON-live target -> :func:`resolve` (no live permission needed)
      * the live NAME     -> :func:`resolve_live` (all three signals
                            required)

    A diagnostic or a test must use :func:`resolve` instead, so that it
    is REFUSED the live name rather than being offered a way to reach
    it.
    """
    if dbname is None or not _is_live(dbname):
        return resolve(dbname, purpose=purpose)
    return resolve_live(dbname, purpose=purpose, write=write)


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
    """Refuse if ``dbname`` is the live name.

    For callers that already know the name and just want the check.
    The refusal is unconditional.
    """
    if dbname and _is_live(dbname):
        raise LiveDatabaseRefused(_refusal_message(purpose))


def refuse_production_container(
    container: str,
    *,
    purpose: str = "this script",
) -> None:
    """Refuse to run a cluster-scoped statement against production.

    `DROP DATABASE` and `CREATE DATABASE` are CLUSTER-SCOPED: they
    act on the whole Postgres instance, not on one database. The
    production container `shared-postgres` is shared with other
    projects, so a throwaway database created there is a hazard for all
    of them -- and on 2026-11-06 a `DROP DATABASE` aimed at this
    cluster destroyed the live database.

    So: a test or throwaway database must never be created on the
    production cluster. Use the dedicated test Postgres
    (scripts/lib/test_pg.sh) instead.

    The check is by CONTAINER NAME, and it is unconditional.
    """
    if container == PRODUCTION_CONTAINER:
        raise ProductionContainerRefused(
            f"\n"
            f"  REFUSED: {purpose} would run against the PRODUCTION "
            f"Postgres container ({PRODUCTION_CONTAINER!r}).\n"
            f"\n"
            f"  DROP DATABASE and CREATE DATABASE are CLUSTER-SCOPED, and\n"
            f"  {PRODUCTION_CONTAINER} is shared with other projects. On\n"
            f"  2026-11-06 a DROP DATABASE aimed at this cluster destroyed\n"
            f"  the live database.\n"
            f"\n"
            f"  Test and throwaway databases belong on the dedicated test\n"
            f"  Postgres (scripts/lib/test_pg.sh), never here.\n"
        )


def reset() -> None:
    """Forget the resolved database. For tests only."""
    global _RESOLVED
    _RESOLVED = None


def _main(argv: list[str]) -> int:
    """CLI: report what this process may use, and vet an optional target.

    The command line NEVER reaches the live name: a command line cannot
    prove which file it came from, so it cannot satisfy signal 1 of
    :func:`resolve_live`.
    """
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
