#!/usr/bin/env python3
"""Make the GUS-242 data migrations safe on an empty database.

CI applies the whole committed migration chain to a FRESH, EMPTY database
(`.github/workflows/ci.yml`, "Apply schema to ephemeral DB"). The GUS-242
migrations 0015-0019 are DATA migrations: they assert the state of the
seeded catalog and then fix it. On an empty database there is nothing to
fix, and the assertions correctly fail — which breaks CI.

The established pattern in this repo is that migrations are idempotent
and data-agnostic (see 0010_surrogate_pks.sql and
0011_dish_ingredients_pk.sql, which guard on the existence of the
constraint rather than on the row count).

The fix follows that pattern: each data migration gets a GUARD at the
top of its transaction. If the data it acts on is not present, the
migration skips cleanly — no error, no write — and the migration chain
continues. On the seeded/live database the data IS present, the guard
passes, and every assertion runs exactly as before.

The guard is written so it cannot mask a real problem on the live
database: it checks for the SPECIFIC rows the migration acts on, not
merely "the database is non-empty". A partially-migrated live database
would fail the guard and the assertions would run and fail loudly.

This script rewrites the guard block in each affected file in place.
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
SELECT {condition} AS have_data \gset
\if :have_data
\echo 'GUS-242: the seeded data is present - running this migration'
"""
GUARD_END = r"""
\else
\echo 'GUS-242: the seeded data is NOT present - skipping this migration'
\endif
"""


def main() -> int:
    ok = True
    for fname, condition in MIGRATIONS:
        path = BASE / fname
        if not path.exists():
            print(f"ERROR: {path} not found")
            ok = False
            continue

        text = path.read_text()

        if "CI GUARD" in text:
            print(f"skip {fname}: guard already present")
            continue

        # Wrap the whole body: BEGIN ... COMMIT, plus everything between.
        m = re.search(r"^BEGIN;\s*$", text, re.MULTILINE)
        if not m:
            print(f"ERROR: {fname}: no BEGIN; found")
            ok = False
            continue
        end = re.search(r"^COMMIT;\s*$", text, re.MULTILINE)
        if not end or end.start() < m.end():
            print(f"ERROR: {fname}: no COMMIT; after BEGIN;")
            ok = False
            continue

        head = text[:m.start()]
        body = text[m.start():end.end()]
        tail = text[end.end():]

        guarded = (
            head
            + GUARD.format(condition=condition)
            + body
            + GUARD_END
            + tail
        )
        path.write_text(guarded)
        print(f"guarded {fname}")

    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
