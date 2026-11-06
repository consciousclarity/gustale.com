#!/usr/bin/env python3
"""No script may DROP or CREATE a database on the PRODUCTION cluster.

WHY THIS EXISTS
---------------
`DROP DATABASE` and `CREATE DATABASE` are CLUSTER-SCOPED operations:
they act on a whole Postgres instance, not on one database. The
production instance is the `shared-postgres` container, and it is
shared with OTHER PROJECTS (bali, dewata, n8n, scribe) as well as with
the live `gustale` database.

On 2026-11-06 the live `gustale` database was DROPPED and recreated
empty, because a diagnostic script ran

    DROP DATABASE IF EXISTS gustale; CREATE DATABASE gustale;

against `shared-postgres`. The database was restored from a backup, but
the site was down and the data-loss window was real.

The structural fix is that a throwaway database does not live on the
production cluster at all: it lives on the DEDICATED TEST POSTGRES
(`scripts/lib/test_pg.sh`, container `gustale-test-postgres`, port
5433). This check makes that rule enforceable, so the fix cannot be
undone by a later script.

THE RULE
--------
  * A script that DROPs or CREATEs a database must NOT target the
    production container.
  * A script that DROPs or CREATEs a database MUST target the
    dedicated test container (or the CI's own service, which is not
    the production container at all).
  * The scripts that legitimately make a COPY of the live database --
    the live-migration gate, the account-deletion gate, the dry-run
    and the atlas regression detector -- are exempt, and each states
    WHY in the allowlist below. Their copies are made FROM live, so
    they must live on the same cluster to be restorable into it; they
    create and drop only the COPY, never the live database, and each
    one's target is checked against the live name separately.

WHAT IT CHECKS
--------------
For every script that mentions a cluster-scoped database statement, it
finds which CONTAINER the statement runs against. It reports a script
when:

  * the statement runs against `shared-postgres`, or
  * the script mentions `shared-postgres` and a cluster-scoped
    statement, and does not name the test container at all.

The second rule matters because a script can reach production through
a variable rather than a literal.

Usage:
    python3 scripts/check-no-production-db-drops.py

Exit 0 = clean; 1 = a script can drop a database on production.
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent

#: The production container. `DROP DATABASE` here is a data-loss event.
PRODUCTION_CONTAINER = "shared-postgres"

#: The dedicated test container. Cluster-scoped statements belong here.
TEST_CONTAINER = "gustale-test-postgres"

#: The cluster-scoped statements that matter.
CLUSTER_SCOPED = re.compile(
    r"\b(?:DROP\s+DATABASE|CREATE\s+DATABASE|DROP\s+ROLE|CREATE\s+ROLE|DROP\s+OWNED)\b",
    re.IGNORECASE,
)

#: Scripts exempt from the rule, and why.
#:
#: Each of these makes a COPY of the live database and drops the copy.
#: The copy must be created on the same cluster as the live database,
#: because a `pg_dump | pg_restore` copy is restored into the cluster
#: it will later be applied to, and because `CREATE DATABASE ... TEMPLATE`
#: requires the template to be on the same server.
ALLOWLIST: dict[str, str] = {
    "scripts/apply-migration-live.sh": (
        "The live-migration gate. It creates and drops "
        "gustale_atlas_gate_copy -- a COPY of live, made from the "
        "backup the gate already took -- and NEVER drops the live "
        "database. It asserts the live database is NOT marked "
        "disposable before the constraint tests run on the copy."
    ),
    "scripts/delete-test-account.sh": (
        "The account-deletion gate. It creates and drops "
        "gustale_delacct_$$ -- a COPY of live -- and applies the "
        "delete to live only after the copy has proved the outcome. "
        "It never drops the live database."
    ),
    "scripts/dryrun-migration.sh": (
        "The dry-run. It restores a pg_dump of live into a copy and "
        "drops the copy. The copy is made FROM live, so it must be on "
        "the same cluster to be a faithful copy."
    ),
    "scripts/verify-atlas-tests-detect-regression.sh": (
        "Proves the atlas constraint detector can FAIL. It snapshots "
        "live READ-ONLY (CREATE DATABASE ... TEMPLATE) and drops the "
        "snapshot. It never writes to live."
    ),
    "scripts/drop-stray-role.sh": (
        "Drops a stray role from the live cluster, but ONLY after a "
        "seven-check audit that refuses any role with a login, a "
        "membership, or an owned object."
    ),
}

#: Where to look for scripts.
SCAN_DIRS = ["scripts"]

#: Files that are not targets of this check.
#:
#: The scanner itself and the guard MODULE are the two files that must
#: TALK ABOUT `DROP DATABASE` -- they are the ones that forbid it. Their
#: text is documentation, not a statement they run.
NO_TARGET_SCRIPTS = {
    "scripts/check-no-production-db-drops.py",
    "scripts/lib/db_guard.py",
    "scripts/test-check-no-production-db-drops.py",
}

#: Files that are not scripts.
SKIP_SUFFIXES = {".md", ".json", ".sql", ".png", ".jpg", ".txt", ".yml", ".yaml"}


def _rel(path: Path) -> str:
    try:
        return str(path.relative_to(REPO))
    except ValueError:
        return str(path)


def _is_scannable(path: Path) -> bool:
    if path.suffix not in {".py", ".sh", ".bash"}:
        return False
    if path.suffix in SKIP_SUFFIXES:
        return False
    if "__pycache__" in path.parts:
        return False
    return True


def _strip_comment(line: str) -> str:
    """Remove a trailing comment, respecting quotes."""
    out = []
    quote = None
    i = 0
    while i < len(line):
        ch = line[i]
        if quote:
            out.append(ch)
            if ch == "\\" and i + 1 < len(line):
                out.append(line[i + 1])
                i += 2
                continue
            if ch == quote:
                quote = None
        else:
            if ch in ("'", '"'):
                quote = ch
                out.append(ch)
            elif ch == "#":
                break
            elif ch == "/" and i + 1 < len(line) and line[i + 1] == "/":
                break
            else:
                out.append(ch)
        i += 1
    return "".join(out)


def _names_production(code: str) -> bool:
    """Does this line reference the production container?"""
    return PRODUCTION_CONTAINER in code


def _names_test_container(code: str) -> bool:
    """Does this line reference the dedicated test container?"""
    return TEST_CONTAINER in code


def _strip_docstrings(text: str) -> str:
    """Blank out Python docstrings, so prose is not read as code.

    A triple-quoted block is replaced by empty lines, so the line
    NUMBERS of the real code are preserved.
    """
    triple_double = chr(34) * 3
    triple_single = chr(39) * 3
    out = []
    in_doc = False
    delim = ""
    for line in text.splitlines():
        stripped = line.strip()
        if not in_doc:
            if stripped.startswith(triple_double):
                if stripped.count(triple_double) >= 2 and len(stripped) > 3:
                    out.append("")
                    continue
                in_doc = True
                delim = triple_double
                out.append("")
                continue
            if stripped.startswith(triple_single):
                if stripped.count(triple_single) >= 2 and len(stripped) > 3:
                    out.append("")
                    continue
                in_doc = True
                delim = triple_single
                out.append("")
                continue
            out.append(line)
        else:
            if delim in line:
                in_doc = False
            out.append("")
    return "\n".join(out)


def scan_file(path: Path) -> list[str]:
    """Return the findings for one file. Empty list means clean."""
    rel = _rel(path)
    if rel in ALLOWLIST or rel in NO_TARGET_SCRIPTS:
        return []

    try:
        text = path.read_text(encoding="utf-8", errors="replace")
    except OSError:
        return []

    findings: list[str] = []
    # Prose is skipped: a script that EXPLAINS `DROP DATABASE` in its
    # docstring is not a script that RUNS one.
    lines = _strip_docstrings(text).splitlines()

    # Does this script make cluster-scoped statements at all?
    has_cluster_scoped = any(
        CLUSTER_SCOPED.search(_strip_comment(line))
        for line in lines
        if not line.strip().startswith("#")
    )
    if not has_cluster_scoped:
        return []

    for lineno, line in enumerate(lines, 1):
        stripped = line.strip()
        if stripped.startswith("#"):
            continue
        code = _strip_comment(line)
        if not code.strip():
            continue

        if not CLUSTER_SCOPED.search(code):
            continue

        # A cluster-scoped statement. Which container does it run against?
        if _names_production(code):
            findings.append(
                f"{rel}:{lineno}: runs a cluster-scoped statement against the "
                f"PRODUCTION container ({PRODUCTION_CONTAINER}): "
                f"{stripped[:90]}"
            )
        elif not _names_test_container(code):
            # The statement does not name a container. Look at the
            # surrounding lines for the container the script uses.
            window = "\n".join(
                _strip_comment(l) for l in lines[max(0, lineno - 4) : lineno + 4]
            )
            if _names_production(window):
                findings.append(
                    f"{rel}:{lineno}: runs a cluster-scoped statement against the "
                    f"PRODUCTION container ({PRODUCTION_CONTAINER}): "
                    f"{stripped[:90]}"
                )

    return findings


def collect_files() -> list[Path]:
    files: list[Path] = []
    for d in SCAN_DIRS:
        base = REPO / d
        if not base.is_dir():
            continue
        for p in base.rglob("*"):
            if p.is_file() and _is_scannable(p):
                files.append(p)
    return sorted(files)


def main() -> int:
    print("=== no script may DROP or CREATE a database on the production cluster ===")
    files = collect_files()
    findings: list[str] = []
    for path in files:
        findings.extend(scan_file(path))

    if not findings:
        print(f"  OK  {len(files)} script(s) checked; none can drop a database on")
        print(f"      the production cluster ({PRODUCTION_CONTAINER}).")
        print()
        print("  A throwaway database belongs on the dedicated test Postgres")
        print(f"  ({TEST_CONTAINER}, port 5433) -- see scripts/lib/test_pg.sh.")
        return 0

    print("  FAIL  a script can drop a database on production:", file=sys.stderr)
    for f in findings:
        print(f"    {f}", file=sys.stderr)
    print(
        "\n"
        "  `DROP DATABASE` and `CREATE DATABASE` are CLUSTER-SCOPED, and the\n"
        f"  production cluster ({PRODUCTION_CONTAINER}) hosts the live database\n"
        "  and five other projects' databases. On 2026-11-06 a DROP DATABASE\n"
        "  aimed at this cluster destroyed the live database.\n"
        "\n"
        "  Point the script at the dedicated test Postgres:\n"
        "\n"
        "      source scripts/lib/test_pg.sh\n"
        f"      test_pg_create \"$DB\"    # instead of docker exec {PRODUCTION_CONTAINER} ...\n"
        "\n"
        "  If the script legitimately needs a copy of the LIVE database, it\n"
        "  must name a copy and never the live name -- and it may be added to\n"
        "  the allowlist in this file WITH the reason it needs production.",
        file=sys.stderr,
    )
    return 1


if __name__ == "__main__":
    sys.exit(main())
