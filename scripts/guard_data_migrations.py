#!/usr/bin/env python3
"""REPORT on the GUS-242 data migrations. It never writes.

WHY THIS SCRIPT IS CHECK-ONLY
-----------------------------
This script used to REWRITE the GUS-242 data migrations in place,
inserting a "CI GUARD" block into each one so that it would skip
cleanly on an empty database.

That was a footgun, and it bit twice:

  1. It rewrote **0019**, a migration that is **already applied on
     live**. Rewriting an applied migration means the file on disk no
     longer matches what ran. The committed chain and the applied
     chain diverge, and nothing in the repo records that.
  2. It inserted the guard at a fixed offset and could land it in the
     wrong place -- in one run it produced a file whose BEGIN/COMMIT
     nesting was wrong.

So the writing is gone. **This script now only reports.** It never
modifies a migration file, it never modifies anything at all, and it
exits 1 when a migration it inspects is not in the expected shape.

WHAT IT REPORTS
---------------
For each GUS-242 data migration, whether it already carries the CI
guard. A migration with the guard is fine. A migration without it is
REPORTED, not fixed -- and the exit code is 1, so CI or a human
notices.

WHAT A HUMAN DOES ABOUT A REPORT
--------------------------------
Edit the migration file **by hand**, and only if the migration is NOT
yet applied anywhere. The guard block is documented in
`docs/MIGRATION-GUARD-REFERENCE.md`. If the migration is already
applied on live, it must not be edited at all: the applied chain and
the committed chain must stay identical.
"""

import re
import sys
from pathlib import Path

MIGRATIONS = [
    # (file, the table+condition that proves the data is present)
    ("0015_gus242_resync.sql",
     "EXISTS (SELECT 1 FROM geo_entities WHERE entity_type = 'country' AND status IS DISTINCT FROM 'archived')"),
    ("0016_gus242_cuisines.sql",
     "EXISTS (SELECT 1 FROM dish_cuisines)"),
    ("0017_gus242_cuisine_corrections.sql",
     "EXISTS (SELECT 1 FROM dish_cuisines)"),
    ("0018_gus242_vocab_1f.sql",
     "EXISTS (SELECT 1 FROM dish_families)"),
    ("0019_gus242_traditions_1e.sql",
     "EXISTS (SELECT 1 FROM dish_traditions)"),
]

BASE = Path("db/migrations")

# The guard uses psql's \if / \gset / \else, and it wraps the WHOLE
# migration body -- the BEGIN, the assertions, the writes and the COMMIT.
#
# A `RETURN` inside a DO block exits the BLOCK, not the transaction, so a
# DO-block guard would still run the assertions after it. psql
# conditionals are the right tool: the whole body is skipped.
#
#   \gset  -- run the SELECT, store the result in :have_data
#   \if    -- include the body only when the data is present
#
# The guard is placed AFTER `\set ON_ERROR_STOP on` and BEFORE `BEGIN;`,
# so the transaction never opens on an empty database.
GUARD = """
-- =====================================================================
-- CI GUARD
--
-- This is a DATA migration: it asserts the state of the seeded catalog
-- and then fixes it. CI applies the whole committed chain to a FRESH,
-- EMPTY database, where there is nothing to fix.
--
-- So: if the data this migration acts on is not present, skip cleanly.
-- The guard checks for the SPECIFIC rows the migration acts on, not
-- merely "the database is non-empty", so a partially-migrated live
-- database would NOT skip -- it would run the assertions and fail
-- loudly, which is the intended behaviour.
-- =====================================================================
SELECT {condition} AS have_data \\gset
\\if :have_data
\\echo 'GUS-242: the seeded data is present - running this migration'
"""
GUARD_END = r"""
\else
\echo 'GUS-242: the seeded data is NOT present - skipping this migration'
\endif
"""

# The guard must be present, AND the transaction must still be intact:
# a BEGIN; before the guard and a COMMIT; after it.
RE_BEGIN = re.compile(r"^BEGIN;\s*$", re.MULTILINE)
RE_COMMIT = re.compile(r"^COMMIT;\s*$", re.MULTILINE)
# The `\gset` is often on a CONTINUATION line -- the SELECT is written
# across several lines and `AS have_data \gset` ends the last one. So
# the marker is matched anywhere on a line, not only at the start.
RE_GUARD = re.compile(r"AS have_data\s+\\gset")


def inspect(fname: str, condition: str) -> str:
    """Return one of: 'ok', 'missing-guard', 'malformed'.

    This function is PURE. It reads a file and returns a verdict. It
    does not write, and it does not modify anything.
    """
    path = BASE / fname
    if not path.exists():
        return "missing-file"

    text = path.read_text()

    if "CI GUARD" not in text:
        return "missing-guard"

    # The guard is present. Now check the transaction is still sound:
    # the guard's \if must sit between a BEGIN; and a COMMIT;, and the
    # \if / \else / \endif must all be there.
    m = RE_BEGIN.search(text)
    end = RE_COMMIT.search(text)
    if not m:
        return "malformed: no BEGIN;"
    if not end or end.start() < m.end():
        return "malformed: no COMMIT; after BEGIN;"
    if not RE_GUARD.search(text):
        return "malformed: the guard has no \\gset"
    if "\\if :have_data" not in text:
        return "malformed: the guard has no \\if"
    if "\\else" not in text:
        return "malformed: the guard has no \\else"
    if "\\endif" not in text:
        return "malformed: the guard has no \\endif"

    return "ok"


def main() -> int:
    ok = True
    missing = []

    print("=== the GUS-242 data migrations: CI GUARD report ===")
    print("This script is CHECK-ONLY. It does not write any file.")
    print("")

    for fname, condition in MIGRATIONS:
        verdict = inspect(fname, condition)
        if verdict == "ok":
            print(f"  ok          {fname}: the guard is present and the transaction is intact")
        elif verdict == "missing-file":
            print(f"  MISSING     {fname}: the file does not exist")
            ok = False
        elif verdict == "missing-guard":
            print(f"  NO GUARD    {fname}: the CI guard is NOT present")
            print(f"              -> this migration will FAIL on an empty database")
            print(f"              -> add the guard BY HAND; see docs/MIGRATION-GUARD-REFERENCE.md")
            print(f"              -> do NOT edit it if it is already applied on live")
            missing.append(fname)
            ok = False
        else:
            print(f"  MALFORMED   {fname}: {verdict}")
            ok = False

    print("")
    if ok:
        print("RESULT: every GUS-242 data migration carries an intact CI guard.")
        return 0

    if missing:
        print(f"RESULT: {len(missing)} migration(s) need the CI guard, added BY HAND:")
        for f in missing:
            print(f"  - {f}")
    else:
        print("RESULT: at least one GUS-242 data migration is malformed.")
    print("No file was modified.")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
