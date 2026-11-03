#!/usr/bin/env python3
"""Fail the build if a diagnostic or test script can default to the LIVE database.

WHY
---
The live database must be reachable ONLY by an explicit, per-invocation
opt-in (``GUSTALE_LIVE_DB_ALLOW=1``). That rule is only worth anything
if it keeps holding, so this scanner enforces it in CI: it fails the
build when a script regresses to defaulting to live.

WHAT IT CHECKS
--------------
For every shell and Python script under ``scripts/`` and
``apps/api/test/`` (plus the vitest config), it looks for:

  1. A DEFAULT database name of the live database:
       DB = "gustale"
       DB_NAME = os.environ.get("GUSTALE_DB_NAME", "gustale")
       TARGET_DATABASE = "gustale"
       PGDATABASE=gustale
  2. A default DATABASE_URL whose dbname is the live database.
  3. A reference to the live database in a script that does NOT import
     the guard (scripts/lib/db_guard.py) and is not on the allowlist.

The allowlist holds scripts that legitimately operate on live. Every
entry must say WHY, and an entry must name the live database
explicitly — the allowlist is a statement of intent, not a loophole.

EXIT CODES
----------
  0  clean
  1  a script can default to live (the build fails)
  2  the scanner itself is broken
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent

LIVE_DB = "gustale"

#: Scripts that are ALLOWED to name the live database, and why.
#:
#: Each entry is (path, reason). The reason is part of the contract: if
#: the script's purpose changes, the reason must change too.
ALLOWLIST: dict[str, str] = {
    "scripts/dbq.sh": (
        "The live query helper. It is the ONE way a shell script reaches "
        "live, and it is what the gate scripts use."
    ),
    "scripts/check-live-approval.sh": (
        "The live-approval gate. It must read the live PR metadata and "
        "decide whether a migration may be applied. Not a diagnostic."
    ),
    "scripts/apply-migration-live.sh": (
        "Applies a migration to live THROUGH the approval gate. It is the "
        "script the gate exists to protect."
    ),
    "scripts/drop-stray-role.sh": (
        "Drops a stray role from the live cluster, but ONLY after a "
        "seven-check audit that refuses any role with a login, a "
        "membership, or an owned object. Not a diagnostic."
    ),
    "scripts/dryrun-migration.sh": (
        "Its LIVE usage is a READ-ONLY pg_dump snapshot of live, used as "
        "the base for a throwaway copy. It never WRITES to live."
    ),
    "scripts/verify-atlas-tests-detect-regression.sh": (
        "Snapshots live READ-ONLY (CREATE DATABASE ... TEMPLATE) to "
        "prove the detector works, then drops the snapshot. It never "
        "writes to live."
    ),
    "scripts/repro-ci-db.sh": (
        "Reproduces the CI database locally. It creates its OWN "
        "throwaway database and applies the role setup to THAT, never to "
        "live."
    ),
    "scripts/ci-migration-chain.sh": (
        "Runs the migration chain against a THROWAWAY container. It "
        "never touches live."
    ),
    "scripts/apply_pool_a_descriptions.py": (
        "Applies a Pool A description batch THROUGH the live-approval "
        "gate, in named batches. The gate is the only path."
    ),
    "scripts/find_source_candidates.py": (
        "The GUS-1010 candidate finder. Its writes are gated by the "
        "live-approval label, and its default target is a scratch copy."
    ),
    "scripts/hermes/test-118-mapping-regression.py": (
        "A READ-ONLY regression test. It compares the generated mapping "
        "against the live database to prove nothing was silently lost. "
        "It never writes to live."
    ),
    "apps/api/test/setup.ts": (
        "The vitest setup file. It ASSERTS that the suite is not about to "
        "run against the live database -- it is the guard itself, not a "
        "script that reaches live. Its rule is duplicated from "
        "scripts/lib/db_guard.py because that module is Python and this "
        "file is TypeScript."
    ),
}

#: Where to look for scripts.
SCAN_DIRS = ["scripts", "apps/api/test", "apps/api"]
SCAN_FILES = ["apps/api/vitest.config.ts"]

#: A default assignment of a database name.
#:
#: Matches:  DB = "gustale"   DB_NAME = "gustale"   TARGET_DATABASE="gustale"
#:           os.environ.get("GUSTALE_DB_NAME", "gustale")
DEFAULT_ASSIGN = re.compile(
    r"""(?ix)
    \b(
        DB | DB_NAME | DATABASE | DATABASE_NAME | TARGET_DATABASE
        | PGDATABASE | DB_TARGET | PG_DATABASE | SCHEMA_DB
    )\s*
    =                                            # plain assignment
    \s*
    (?:
        os\.environ\.get\(\s*["'][A-Z_]*DB[A-Z_]*["']\s*,\s*   # env with default
      | ["']                                       # a bare string
    )
    ["']gustale["']
    """
)

#: An argparse default that is the live database.
#:
#:   parser.add_argument("--db", default="gustale")
#:
#: This is the single most common way a diagnostic in this repo chose
#: its target, so it must be caught.
DEFAULT_ARGPARSE = re.compile(
    r"""(?ix)
    -- \w* (?: db | database | dbname | target | dsn ) \w* ["']?
    \s* ,? \s* default \s* = \s* ["'] gustale ["']
    """
)

#: A DSN whose dbname is live, assigned as a DEFAULT.
DEFAULT_DSN = re.compile(
    r"""(?ix)
    (?:
        DATABASE_URL | PG_DSN | DSN | DB_URL
    )\s*
    =\s*
    ["'][^"']*://[^"']*@[^"']*?/gustale(?:\?[^"']*)?["']
    """
)

#: A bare `-d gustale` / `PGDATABASE=gustale` in a shell script.
SHELL_LIVE_TARGET = re.compile(
    r"""(?ix)
    (?:^|[\s"'=])(?:
        -d\s+gustale\b
      | --dbname[= ]gustale\b
      | PGDATABASE=gustale\b
      | -U\s+gustale\s+-d\s+gustale\b
    )
    """
)

#: The guard module's import, so we know a script is guarded.
GUARD_IMPORT = re.compile(r"db[-_]guard|from\s+lib\.db_guard|scripts\.lib\.db_guard")

#: Scripts that are exempt from the "must use the guard" rule, because
#: they are not diagnostics at all (or do not touch a database).
NO_DB_SCRIPTS = {
    "scripts/lib/db_guard.py",
    "scripts/check-no-live-db-defaults.py",
    # The scanner's OWN test file. It contains live-database strings on
    # purpose: they are the test cases. Flagging them would mean the
    # scanner cannot be tested.
    "scripts/test-check-no-live-db-defaults.py",
}

#: Files under scripts/ that are not scripts.
SKIP_SUFFIXES = {".pyc", ".md", ".json", ".sql", ".png", ".jpg", ".txt"}


#: A name that is DATABASE-ish.
#:
#: This is what separates `DB_NAME = "gustale"` (a database) from
#: `SVC_USER = "gustale"` (a ROLE) and `cookiePrefix: "gustale"` (a
#: cookie). Without this distinction the scanner produces false
#: positives, and a scanner that cries wolf gets ignored.
DBISH = r"[A-Za-z_]*?(?:db|database|dbname|target|dsn)[A-Za-z_]*"

#: A reference to the live database NAME.
#:
#: Deliberately narrow. `gustale` must be in a position that means
#: "this is the database":
#:
#:   -d gustale                        psql's -d
#:   --dbname=gustale                  psql's --dbname
#:   PGDATABASE=gustale                libpq's environment variable
#:   dbname=gustale                    the keyword form of a DSN
#:   postgresql://u:p@h:5432/gustale   the dbname in a DSN
#:   DB_NAME = "gustale"               a db-ish VARIABLE assigned live
#:   --db default="gustale"            an argparse default
#:   db("gustale", sql)                a call's first argument
#:   db: str = "gustale"               a parameter default
#:   "-d", "gustale"                   psql's args as a list
#:
#: NOT a database reference:
#:
#:   import { db } from "@gustale/db"     the npm scope
#:   https://gustale.com/dishes           a URL
#:   gustale_credential_issuer            a ROLE
#:   SVC_USER="gustale"                   a ROLE
#:   cookiePrefix: "gustale"              a cookie prefix
#:   DB = "gustale_dev"                   a SCRATCH database
LIVE_DB_PATTERNS = [
    # psql -d gustale  /  psql -d "gustale"
    re.compile(r"""(?ix) -d \s+ ["']? gustale \b"""),
    # psql --dbname=gustale
    re.compile(r"""(?ix) --dbname [= ] \s* ["']? gustale \b"""),
    # libpq's PGDATABASE
    re.compile(r"""(?ix) PGDATABASE \s* = \s* ["']? gustale \b"""),
    # the keyword form of a DSN
    re.compile(r"""(?ix) \b dbname \s* = \s* ["']? gustale \b"""),
    # the dbname in a URL DSN
    re.compile(r"""(?ix) // [^\s"']* @ [^\s"']* / gustale (?= [?"'\s] )"""),
    # a db-ish VARIABLE assigned the live name
    re.compile(r"""(?ix) \b {dbish} \s* (?: = | == ) \s* ["'] gustale ["']""".format(dbish=DBISH)),
    # an env lookup with the live name as the DEFAULT
    re.compile(r"""(?ix) os\.environ\.get \( \s* ["'][A-Z_]*DB[A-Z_]*["'] \s* , \s* ["'] gustale ["']"""),
    # an argparse default
    re.compile(r"""(?ix) -- \w* (?: db | database | dbname | target | dsn ) \w* ["']? \s* ,? \s* default \s* = \s* ["'] gustale ["']"""),
    # a call whose first argument is the live name
    re.compile(r"""(?ix) \b {dbish} \s* \( \s* ["'] gustale ["']""".format(dbish=DBISH)),
    # a parameter default
    re.compile(r"""(?ix) \b {dbish} \s* : \s* [A-Za-z_]+ \s* = \s* ["'] gustale ["']""".format(dbish=DBISH)),
    # psql's arguments as a list
    re.compile(r"""(?ix) ["'] -d ["'] \s* , \s* ["'] gustale ["']"""),
    re.compile(r"""(?ix) ["'] dbname ["'] \s* , \s* ["'] gustale ["']"""),
    # a keyword-argument list: {"dbname": "gustale"}
    re.compile(r"""(?ix) ["'] dbname ["'] \s* : \s* ["'] gustale ["']"""),
    # a keyword-argument list with the bare "db" key: {"db": "gustale"}
    re.compile(r"""(?ix) ["'] db ["'] \s* : \s* ["'] gustale ["']"""),
    # a positional list whose first element is the db key: ["db", "gustale"]
    re.compile(r"""(?ix) ["'] db ["'] \s* , \s* ["'] gustale ["']"""),
    # psycopg's connect(dbname="gustale")
    re.compile(r"""(?ix) connect \s* \( [^)]{0,80}? dbname \s* = \s* ["'] gustale ["']"""),
]

#: A line that is entirely a comment.
_COMMENT_LINE = re.compile(r"^\s*(#|//|/\*|\*)")


def _strip_inline_comment(line: str) -> str:
    """Remove a trailing comment, respecting quotes.

    A `#` inside a string is not a comment, and neither is the `#` in
    a URL fragment.
    """
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


def _names_the_live_database(line: str) -> bool:
    """Does this line refer to the live DATABASE (not the word)?"""
    if _COMMENT_LINE.match(line):
        return False
    code = _strip_inline_comment(line)
    if not code.strip():
        return False
    return any(p.search(code) for p in LIVE_DB_PATTERNS)


def _is_scannable(path: Path) -> bool:
    if path.suffix not in {".py", ".sh", ".ts", ".bash"}:
        return False
    if path.suffix in SKIP_SUFFIXES:
        return False
    if "__pycache__" in path.parts:
        return False
    return True


def _rel(path: Path) -> str:
    try:
        return str(path.relative_to(REPO))
    except ValueError:
        return str(path)


def collect_files() -> list[Path]:
    files: list[Path] = []
    for d in SCAN_DIRS:
        base = REPO / d
        if not base.is_dir():
            continue
        for p in base.rglob("*"):
            if p.is_file() and _is_scannable(p):
                files.append(p)
    for f in SCAN_FILES:
        p = REPO / f
        if p.is_file():
            files.append(p)
    return sorted(files)


def scan_file(path: Path) -> list[str]:
    """Return the findings for one file. Empty list means clean."""
    rel = _rel(path)
    if rel in NO_DB_SCRIPTS:
        return []

    try:
        text = path.read_text(encoding="utf-8", errors="replace")
    except OSError:
        return []

    findings: list[str] = []
    lines = text.splitlines()

    for lineno, line in enumerate(lines, 1):
        stripped = line.strip()
        # Ignore comments and docstring prose.
        if stripped.startswith("#") or stripped.startswith('"') or stripped.startswith("*"):
            continue

        m = DEFAULT_ASSIGN.search(line)
        if m:
            findings.append(
                f"{rel}:{lineno}: defaults the database to the LIVE "
                f"database: {stripped[:100]}"
            )
            continue

        m = DEFAULT_DSN.search(line)
        if m:
            findings.append(
                f"{rel}:{lineno}: defaults DATABASE_URL to the LIVE "
                f"database: {stripped[:100]}"
            )
            continue

        m = DEFAULT_ARGPARSE.search(line)
        if m:
            findings.append(
                f"{rel}:{lineno}: defaults a --db argument to the LIVE "
                f"database: {stripped[:100]}"
            )
            continue

        if path.suffix in {".sh", ".bash"}:
            m = SHELL_LIVE_TARGET.search(line)
            if m and rel not in ALLOWLIST:
                findings.append(
                    f"{rel}:{lineno}: names the LIVE database directly: "
                    f"{stripped[:100]}"
                )

    # The "must use the guard" rule: a script that names the live
    # database must either import the guard or be on the allowlist.
    #
    # `gustale` here means THE DATABASE NAME, not the word. The npm
    # scope `@gustale/db` is not a database reference, and neither is
    # `gustale.com`, `gustale.recipes`, `gustale_credential_issuer` or
    # a container name. Getting this wrong produces 60+ false
    # positives, which is how a scanner gets ignored.
    names_live = any(
        _names_the_live_database(ln)
        for ln in lines
    )
    if names_live and rel not in ALLOWLIST:
        if not GUARD_IMPORT.search(text):
            findings.append(
                f"{rel}: names the live database but does not import "
                f"scripts/lib/db_guard.py. Either use the guard, or add "
                f"the script to the allowlist with a reason."
            )

    return findings


def main() -> int:
    files = collect_files()
    all_findings: list[str] = []
    for f in files:
        all_findings.extend(scan_file(f))

    print(f"=== scanning {len(files)} script(s) for a live-database default ===")
    print(f"    live database: {LIVE_DB!r}")
    print(f"    allowlisted:  {len(ALLOWLIST)} script(s)")
    print("")

    if not all_findings:
        print("    OK  no script can default to the live database")
        print("")
        print("    Every diagnostic and test script resolves to a scratch")
        print("    database unless GUSTALE_LIVE_DB_ALLOW=1 is set for that")
        print("    one invocation.")
        return 0

    print(f"    FAIL  {len(all_findings)} finding(s):")
    print("")
    for finding in all_findings:
        print(f"      - {finding}")
    print("")
    print("    Fix it: point the script at a scratch database")
    print(f"    (GUSTALE_SCRATCH_DB, default 'gustale_dev'), or import")
    print("    scripts/lib/db_guard.py and call resolve().")
    print("")
    print("    If the script genuinely operates on live, it belongs on the")
    print("    allowlist in scripts/check-no-live-db-defaults.py, with a")
    print("    reason that says why.")
    return 1


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as exc:  # the scanner must never silently pass
        print(f"ERROR: the scanner itself failed: {exc}", file=sys.stderr)
        sys.exit(2)
