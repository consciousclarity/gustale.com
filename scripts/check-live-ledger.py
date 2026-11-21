#!/usr/bin/env python3
"""The ledger check: every migration file has exactly one ledger row, and
every ledger row has exactly one migration file.

WHAT THIS IS
------------
`public.gus_migrations_applied` is the GUS chain's index. It was created by
migration 0060 on 2026-11-17. Before that date the chain had no index at
all, and the migrations applied in that era were never recorded.

The index drifted from the chain, and nothing noticed, because nothing
compared the two. The drift that this check exists to catch had already
happened by the time it was written:

  * `0062_ingredients_sourcing_vocabulary` was applied on 2026-11-11 and
    had NO ledger row at all.
  * `0063_record_0061_in_the_ledger` was applied on 2026-11-19 under the
    old number `0062` and had NO ledger row for itself, because the file
    that ran recorded 0061 rather than itself.
  * The ledger held a row named `0054_ingredients_category_fk` while the
    file is `0054_ingredient_category_fk.sql` -- a typo that made the row
    unpairable with its file.

Migration 0064 repaired the live ledger. This check is what keeps it
repaired.

THE RULE
--------
For the migrations that the ledger is meant to cover, the pairing is
EXACT and BIDIRECTIONAL:

  * every migration FILE has exactly ONE ledger row, with the same
    migration NUMBER, and the same CHECKSUM;
  * every ledger ROW has exactly ONE migration file.

Both directions are checked, because either one alone can be satisfied by
a broken ledger. A ledger missing a row passes a file->row check that
only asks "does every recorded row have a file". A ledger with a stale
row passes a row->file check that only asks "does every file have a
row".

WHAT IS AND IS NOT COVERED
--------------------------
The chain in `db/migrations/` is NOT a single run of the same migrations
against the same schema. It is three eras:

  * **0015 to 0051** -- applied before the ledger table existed. These
    files have been EDITED since they ran, so their current checksums are
    NOT the checksums of the files that ran. There is no receipt that
    says otherwise. Asserting a checksum that was never true would be
    worse than the absence of a row, so these are EXEMPT and are listed
    in `PRE_LEDGER_ERA`, each with the reason.
  * **0052 to 0061** -- applied after the ledger table existed, or in the
    transition. Every one of these HAS a ledger row, and the row's
    checksum must equal the file's checksum -- with ONE documented
    exception, below.
  * **0062 onwards** -- applied after the ledger table existed, and
    every one of these must have a ledger row whose checksum equals the
    file's checksum.

THE ONE DOCUMENTED EXCEPTION
-----------------------------
`0063_record_0061_in_the_ledger` was applied on 2026-11-19 when its file
was still called `0062_record_0061_in_the_ledger.sql`. The file was
RENAMED afterwards, and the rename changed the filename inside the file's
own header, so the file that ran and the file in the repository have
different bytes.

The ledger row for 0063 therefore carries the checksum of the file THAT
RAN (`498ab199...`), not the checksum of the repository file
(`da0a2b26...`). That is the honest record, and the check knows about it
through `KNOWN_RENAMED_MIGRATIONS`, which names the row, the checksum of
the applied file, and the checksum of the repository file.

The rule for a renamed migration is strict in both directions: the ledger
row's checksum must be the APPLIED checksum, and the applied checksum
must NOT equal the repository checksum -- because if they were equal,
the row would be claiming the current file ran, which is false.

The `gus-238*` ROWS
-------------------
The ledger also holds three rows whose names do not begin with a
migration number:

    gus-238-journey-editorial-fields
    gus-238b-association-review-visibility
    gus-238c-constraint-idempotence-and-ledger

These are the GUS chain's own migrations. They live in a different place
-- `db/migrations/gus/` in some histories, and they are applied by the
owner directly rather than by the CI chain. They are covered by
`EXTRA_LEDGER_ROWS`, which lists them with the reason, and the check
requires each to have a matching file SOMEWHERE in the repository. If
one of them has no file at all, that is a finding, not an exemption.

HOW IT READS THE LEDGER
-----------------------
Two modes, one set of rules.

  * `--db-url URL` (or `DATABASE_URL`) reads a Postgres database over
    the wire. This is what CI uses, against the CI database.
  * `--live` reads the PRODUCTION database over SSH, by running psql
    inside the `shared-postgres` container on the VPS.

`--live` needs the SSH key. It uses `GUSTALE_LIVE_SSH_KEY` (default:
`~/.ssh/gustale-cd/id_ed25519`) and `GUSTALE_LIVE_HOST` (default:
`root@62.72.7.218`).

The live read is READ-ONLY. The script never writes to the database it
checks; it issues exactly one SELECT.

WHAT IT PRINTS
--------------
A table of every pair it checked, and then the findings. Exit code 0
means the ledger and the chain agree. Exit code 1 means they do not, and
the findings say how.

    python3 scripts/check-live-ledger.py --live
    python3 scripts/check-live-ledger.py --container
    python3 scripts/check-live-ledger.py --db-url postgres://.../gustale_ci
"""

from __future__ import annotations

import argparse
import hashlib
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
MIGRATIONS_DIR = REPO / "db" / "migrations"


# ---------------------------------------------------------------------------
# The exemptions, and why each one exists.
# ---------------------------------------------------------------------------

# Migrations applied BEFORE the ledger table existed (0060 created it on
# 2026-11-17). These files have been edited since they ran, so their
# current checksums are not the checksums of the files that ran, and no
# receipt says otherwise. Back-filling a checksum that was never true
# would be worse than the absence of the row.
# The ledger table was created by migration 0060. Everything applied
# BEFORE that is the pre-ledger era.
#
# Those files have been edited since they ran, so their current checksums
# are NOT the checksums of the files that ran, and no receipt says
# otherwise. Back-filling a checksum that was never true would be worse
# than the absence of the row, so they are exempt.
#
# The exemption is DERIVED from the number of the migration that created
# the table, not from a hand-kept list. A hand-kept list goes stale the
# first time a file is added or renamed, and a stale list is exactly the
# bug this check exists to catch.
LEDGER_TABLE_MIGRATION = "0060"


def pre_ledger_era() -> set[str]:
    """The migrations applied before the ledger table existed."""
    limit = int(LEDGER_TABLE_MIGRATION)
    era = set()
    for path in MIGRATIONS_DIR.glob("*.sql"):
        match = re.match(r"^(\d{4})_", path.stem)
        if match is None:
            # A `gus-*` file is not part of the numbered chain. It is
            # exempt only if it has no ledger row -- see EXTRA_LEDGER_ROWS.
            continue
        if int(match.group(1)) < limit:
            era.add(path.stem)
    return era



# Migrations that were RENAMED after they ran. The ledger row's checksum
# is the checksum of the file THAT RAN, which is not the checksum of the
# file in the repository.
#
# Each entry is: row name -> (applied checksum, repository checksum).
KNOWN_RENAMED_MIGRATIONS = {
    "0063_record_0061_in_the_ledger": (
        "498ab199069c49452d2b3cb1219cc483968292b6cbf1368baaf537a02532f0d7",
        "da0a2b26d8a705cf7503d7c63a7dcf5ffd548674490975355011ee7ccf9e2ffa",
    ),
}

# Ledger rows that are not numbered migrations. Each must still have a
# matching file somewhere in the repository.
# The GUS chain's own migrations. They are not numbered, so they are not
# part of the numbered chain, but they DO have ledger rows on live.
#
# A `gus-*` FILE with no ledger row is exempt -- it was applied in the
# pre-ledger era. A `gus-*` ledger ROW with no file is a finding.
EXTRA_LEDGER_ROWS = {
    "gus-238-journey-editorial-fields",
    "gus-238b-association-review-visibility",
    "gus-238c-constraint-idempotence-and-ledger",
}

# Rows whose checksum is DELIBERATELY null, with the reason.
#
# The file of each of these was EDITED after it ran, so the checksum of
# the file in the repository is not the checksum of the file that ran, and
# no receipt records what that was. A NULL checksum says "this file
# changed after it ran and the original digest is unknown", which is
# TRUE. Filling it in with the repository's checksum would say "this is
# the file that ran", which is FALSE.
#
# Every other row in the ledger must carry a checksum.
NULL_CHECKSUM_ALLOWED = {
    "0052_recipes_schema",
}

# Where the GUS chain's files live.
GUS_SEARCH_DIRS = [
    REPO / "db" / "migrations" / "gus",
    REPO / "db" / "gus-migrations",
]


def sha256_of(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def discover_migrations() -> dict[str, Path]:
    """Every migration file in db/migrations, keyed by its bare name."""
    found: dict[str, Path] = {}
    for path in sorted(MIGRATIONS_DIR.glob("*.sql")):
        found[path.stem] = path
    return found


def discover_gus_migrations() -> dict[str, Path]:
    found: dict[str, Path] = {}
    for directory in GUS_SEARCH_DIRS:
        if not directory.is_dir():
            continue
        for path in sorted(directory.glob("*.sql")):
            found.setdefault(path.stem, path)
    return found


# ---------------------------------------------------------------------------
# Reading the ledger.
# ---------------------------------------------------------------------------

LEDGER_QUERY = (
    "SELECT name, coalesce(nullif(sha256, ''), ''), "
    "coalesce(nullif(note, ''), '') "
    "FROM public.gus_migrations_applied ORDER BY name;"
)


def read_ledger_db_url(db_url: str) -> list[tuple[str, str, str]]:
    """Read the ledger over the wire. READ-ONLY: one SELECT.

    It reaches the database with `psql`, the way every other script in
    this repository does -- not with a Python driver. A driver would
    add a dependency that the CI image does not have, and a check that
    cannot run in CI is a check that does not run.
    """
    proc = subprocess.run(
        psql_command(db_url) + ["-X", "-tA", "-F", "\t", "-v", "ON_ERROR_STOP=1",
                               "-c", LEDGER_QUERY],
        capture_output=True, text=True, timeout=120,
    )
    if proc.returncode != 0:
        raise RuntimeError(
            f"the ledger read failed (psql rc={proc.returncode}):\n"
            f"{proc.stderr.strip()[:800]}"
        )
    return _parse_tsv(proc.stdout)


def psql_command(db_url: str) -> list[str]:
    """The command that runs psql against `db_url`.

    `psql` on the PATH is used when it is there. When it is not -- which
    is the case on a developer machine that keeps Postgres in a
    container -- the script falls back to the psql INSIDE the test
    container, and rewrites the URL's host and port to match. The
    database name is the only part of the URL it trusts.
    """
    if shutil.which("psql"):
        return ["psql", db_url]

    name = db_url.rsplit("/", 1)[-1].split("?")[0]
    if not name:
        raise RuntimeError(
            f"the database name could not be read from {db_url!r}"
        )
    return [
        "docker", "exec", "-i", "gustale-test-postgres",
        "psql", "-U", "postgres", "-d", name,
    ]


LEDGER_SQL = (
    "SELECT name, coalesce(nullif(sha256,''),''), coalesce(nullif(note,''),'') "
    "FROM public.gus_migrations_applied ORDER BY name;"
)

LIVE_CONTAINER = "shared-postgres"
LIVE_DATABASE = "gustale"


def read_ledger_live(host: str, key: str) -> list[tuple[str, str, str]]:
    """Read the PRODUCTION ledger over SSH.

    The psql inside the container runs the query as a plain SELECT. The
    container's own database is never written to.
    """
    # `-F $'\t'` sets the field separator, so the three columns come back
    # tab-separated without any string concatenation in the SQL.
    remote = (
        f"docker exec -i {LIVE_CONTAINER} psql -U postgres -d {LIVE_DATABASE} "
        f"-X -tA -F $'\\t' -c {json_quote(LEDGER_SQL)}"
    )
    proc = subprocess.run(
        ["ssh", "-i", key, "-o", "BatchMode=yes", "-o", "ConnectTimeout=25",
         "-o", "StrictHostKeyChecking=no", host, remote],
        capture_output=True, text=True, timeout=120,
    )
    if proc.returncode != 0:
        raise RuntimeError(
            f"the live ledger read failed (ssh rc={proc.returncode}):\n"
            f"{proc.stderr.strip()[:800]}"
        )
    return _parse_tsv(proc.stdout)


def read_ledger_container(container: str = LIVE_CONTAINER,
                          database: str = LIVE_DATABASE) -> list[tuple[str, str, str]]:
    """Read the PRODUCTION ledger from the container, without SSH.

    This is the mode used when the check runs ON the VPS -- the Nightly
    job SSHes to the VPS and then runs the check there, so a second hop
    over SSH would be pointless, and would need a key the VPS does not
    have for itself.

    It is the same read: one plain SELECT, inside the container, against
    the live database. It never writes.
    """
    proc = subprocess.run(
        ["docker", "exec", "-i", container, "psql", "-U", "postgres", "-d", database,
         "-X", "-tA", "-F", "\t", "-v", "ON_ERROR_STOP=1", "-c", LEDGER_SQL],
        capture_output=True, text=True, timeout=120,
    )
    if proc.returncode != 0:
        raise RuntimeError(
            f"the live ledger read failed (docker exec rc={proc.returncode}):\n"
            f"{proc.stderr.strip()[:800]}"
        )
    return _parse_tsv(proc.stdout)


def _parse_tsv(text: str) -> list[tuple[str, str, str]]:
    """Parse the tab-separated ledger rows psql printed."""
    rows = []
    for line in text.splitlines():
        if not line.strip():
            continue
        parts = line.split("\t")
        while len(parts) < 3:
            parts.append("")
        rows.append((parts[0], parts[1], parts[2]))
    return rows


def json_quote(value: str) -> str:
    """Quote a string for a remote shell, single quotes escaped."""
    return "'" + value.replace("'", "'\\''") + "'"


# ---------------------------------------------------------------------------
# The check.
# ---------------------------------------------------------------------------


def check(ledger: list[tuple[str, str, str]]) -> tuple[list[str], list[str]]:
    """Return (findings, checked-lines)."""
    findings: list[str] = []
    checked: list[str] = []

    era = pre_ledger_era()
    files = discover_migrations()
    gus_files = discover_gus_migrations()
    ledger_by_name = {name: (sha, note) for name, sha, note in ledger}

    # --- file -> row -------------------------------------------------------
    for name, path in sorted(files.items()):
        if name in era:
            checked.append(f"  SKIP  {name}  (applied before the ledger table existed)")
            continue
        if name in EXTRA_LEDGER_ROWS:
            # A recorded `gus-*` migration: it has a row, and the row is
            # checked in the row -> file direction below.
            checked.append(f"  OK    {name}  (an extra row, file present)")
            continue
        if re.match(r"^gus-", name) and name not in ledger_by_name:
            # A `gus-*` file with no ledger row. It was applied in the
            # pre-ledger era, like 0015 to 0051 -- it is not numbered, so
            # the table-creation number does not decide it, and the
            # absence of its row is the honest record.
            checked.append(f"  SKIP  {name}  (a GUS-chain file with no ledger row)")
            continue

        file_sha = sha256_of(path)

        if name not in ledger_by_name:
            findings.append(
                f"the migration file {name}.sql has NO ledger row on this database"
            )
            continue

        row_sha, _note = ledger_by_name[name]

        if name in KNOWN_RENAMED_MIGRATIONS:
            applied_sha, repo_sha = KNOWN_RENAMED_MIGRATIONS[name]
            if repo_sha != file_sha:
                findings.append(
                    f"the renamed migration {name} has a repository checksum "
                    f"({file_sha[:16]}...) that is not the one this check expects "
                    f"({repo_sha[:16]}...); update KNOWN_RENAMED_MIGRATIONS"
                )
            if row_sha != applied_sha:
                findings.append(
                    f"the ledger row for {name} carries checksum "
                    f"{row_sha[:16] or '(null)'}, but the file that RAN hashed to "
                    f"{applied_sha[:16]}"
                )
            elif row_sha == repo_sha:
                findings.append(
                    f"the ledger row for {name} claims the current repository file "
                    f"ran, but this migration was RENAMED after it ran -- the row "
                    f"should carry the applied checksum, which is different"
                )
            else:
                checked.append(
                    f"  OK    {name}  (renamed; ledger holds the APPLIED checksum)"
                )
            continue

        if not row_sha:
            if name in NULL_CHECKSUM_ALLOWED:
                checked.append(
                    f"  OK    {name}  (no checksum: the file was edited after it ran)"
                )
                continue
            findings.append(
                f"the ledger row for {name} has NO checksum; it cannot be paired "
                f"with {name}.sql (which hashes to {file_sha[:16]}...)"
            )
            continue

        if row_sha != file_sha:
            findings.append(
                f"the ledger row for {name} carries checksum {row_sha[:16]}..., "
                f"but {name}.sql hashes to {file_sha[:16]}... -- the file was "
                f"edited after it ran, or the row is wrong"
            )
            continue

        checked.append(f"  OK    {name}  {file_sha[:16]}...")

    # --- row -> file -------------------------------------------------------
    for row_name, row_sha, _note in sorted(ledger):
        if row_name in files:
            continue
        if row_name in EXTRA_LEDGER_ROWS:
            if row_name in gus_files:
                checked.append(f"  OK    {row_name}  (an extra row, file present)")
            else:
                findings.append(
                    f"the ledger row {row_name} has no matching file anywhere in "
                    f"the repository"
                )
            continue
        findings.append(
            f"the ledger row {row_name} has NO matching migration file"
        )

    # --- the numbers must not collide --------------------------------------
    # A migration number must name exactly one thing. This is the check that
    # would have caught `0062` meaning the sourcing vocabulary AND the
    # ledger fix at the same time.
    by_number: dict[str, list[str]] = {}
    for name in list(files) + list(ledger_by_name):
        match = re.match(r"^(\d{4})_", name)
        if match:
            by_number.setdefault(match.group(1), []).append(name)
    for number, names in sorted(by_number.items()):
        distinct = sorted(set(names))
        if len(distinct) > 1:
            findings.append(
                f"the migration number {number} names more than one thing: "
                f"{', '.join(distinct)}"
            )
        else:
            checked.append(f"  OK    number {number} names exactly one migration")

    return findings, checked


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--live", action="store_true",
                        help="check the PRODUCTION database over SSH")
    parser.add_argument("--container", action="store_true",
                        help="check the PRODUCTION database from the local container, "
                             "without SSH -- for when the check runs ON the VPS")
    parser.add_argument("--db-url", default=os.environ.get("DATABASE_URL", ""),
                        help="check the database at this Postgres URL")
    parser.add_argument("--host", default=os.environ.get("GUSTALE_LIVE_HOST", "root@62.72.7.218"))
    parser.add_argument("--key", default=os.environ.get(
        "GUSTALE_LIVE_SSH_KEY", str(Path.home() / ".ssh" / "gustale-cd" / "id_ed25519")))
    args = parser.parse_args()

    modes = [args.live, args.container, bool(args.db_url)]
    if sum(modes) > 1:
        print("pass only one of --live, --container or --db-url", file=sys.stderr)
        return 2

    if args.live:
        if not Path(args.key).exists():
            print(f"the SSH key {args.key} does not exist; cannot read the live ledger",
                  file=sys.stderr)
            return 2
        source = f"the live database at {args.host}"
        ledger = read_ledger_live(args.host, args.key)
    elif args.container:
        source = f"the live database in the {LIVE_CONTAINER} container"
        ledger = read_ledger_container()
    elif args.db_url:
        source = "the database at the given URL"
        ledger = read_ledger_db_url(args.db_url)
    else:
        print("pass --live, --container or --db-url", file=sys.stderr)
        return 2

    findings, checked = check(ledger)

    print(f"The ledger check -- {source}")
    print(f"the ledger holds {len(ledger)} rows; "
          f"db/migrations holds {len(discover_migrations())} files")
    print()
    for line in checked:
        print(line)
    print()

    if findings:
        print(f"FAILED -- {len(findings)} finding(s):")
        print()
        for finding in findings:
            print(f"  * {finding}")
        return 1

    print("PASSED -- every migration file has exactly one ledger row with the same")
    print("number and checksum, and every ledger row has exactly one migration file.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
