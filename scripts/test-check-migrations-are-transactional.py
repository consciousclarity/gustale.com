#!/usr/bin/env python3
"""The transaction check must be able to FAIL.

WHY THIS IS SEPARATE
--------------------
`scripts/check-migrations-are-transactional.py` is a gate. A gate that
cannot fail is worse than no gate, because it looks like a gate that
is passing.

So this file drives the checker with the cases that MUST be caught, and
proves it catches them. The cases are written to a TEMPORARY directory
and scanned through the checker's own functions, so the repository is
never modified.

The cases:

  1. a migration with no BEGIN at all              -> CAUGHT
  2. a BEGIN with no COMMIT                        -> CAUGHT
  3. a COMMIT before the BEGIN                     -> CAUGHT
  4. a PL/pgSQL block whose only BEGIN is the block -> CAUGHT
  5. a commented-out `BEGIN;`                      -> CAUGHT
  6. a proper BEGIN; ... COMMIT;                   -> allowed
  7. a BEGIN TRANSACTION; ... COMMIT;              -> allowed
  8. a BEGIN; ... COMMIT; with a PL/pgSQL block inside -> allowed
  9. a BEGIN; ... ROLLBACK; (no COMMIT)            -> CAUGHT

Case 4 is the important one. It is the exact shape of
`0050_association_review_ledger.sql`: the file contains the word
`BEGIN` twice, and a `grep BEGIN` says the migration is wrapped. It
is not -- both of those `BEGIN`s open a PL/pgSQL block. A checker that
matched the word would pass 0050, which is the bug the check exists to
prevent.
"""
from __future__ import annotations

import importlib.util
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location(
    "check_migrations_are_transactional", HERE / "check-migrations-are-transactional.py"
)
checker = importlib.util.module_from_spec(spec)
assert spec.loader is not None
spec.loader.exec_module(checker)


#: (name, source, expect_findings)
CASES: list[tuple[str, str, bool]] = [
    (
        "a migration with no BEGIN at all",
        """-- 0052_something.sql
CREATE TABLE example (id uuid PRIMARY KEY);
INSERT INTO example (id) VALUES (gen_random_uuid());
""",
        True,
    ),
    (
        "a BEGIN with no COMMIT",
        """-- 0052_something.sql
BEGIN;
CREATE TABLE example (id uuid PRIMARY KEY);
""",
        True,
    ),
    (
        "a COMMIT before the BEGIN",
        """-- 0052_something.sql
COMMIT;
BEGIN;
CREATE TABLE example (id uuid PRIMARY KEY);
""",
        True,
    ),
    (
        "a PL/pgSQL block whose only BEGIN is the BLOCK's own",
        # The exact shape of 0050: the word BEGIN appears, but it opens
        # a PL/pgSQL block, not a transaction. A checker that matched
        # the word would pass this, and 0050 is exactly the file that
        # ran unwrapped on live.
        """-- 0052_something.sql
CREATE OR REPLACE FUNCTION f() RETURNS trigger AS $$
DECLARE
  n integer;
BEGIN
  SELECT count(*) INTO n FROM example;
  RETURN NEW;
END $$;

DO $$
DECLARE
  n integer;
BEGIN
  SELECT count(*) INTO n FROM example;
END $$;
""",
        True,
    ),
    (
        "a commented-out BEGIN",
        """-- 0052_something.sql
-- BEGIN;
CREATE TABLE example (id uuid PRIMARY KEY);
-- COMMIT;
""",
        True,
    ),
    (
        "a proper BEGIN; ... COMMIT;",
        """-- 0052_something.sql
BEGIN;
CREATE TABLE example (id uuid PRIMARY KEY);
INSERT INTO example (id) VALUES (gen_random_uuid());
COMMIT;
""",
        False,
    ),
    (
        "a BEGIN TRANSACTION; ... COMMIT;",
        """-- 0052_something.sql
BEGIN TRANSACTION;
CREATE TABLE example (id uuid PRIMARY KEY);
COMMIT;
""",
        False,
    ),
    (
        "a BEGIN; ... COMMIT; with a PL/pgSQL block inside",
        """-- 0052_something.sql
BEGIN;
CREATE OR REPLACE FUNCTION f() RETURNS trigger AS $$
BEGIN
  RETURN NEW;
END $$;
DO $$
BEGIN
  RAISE NOTICE 'hello';
END $$;
COMMIT;
""",
        False,
    ),
    (
        "a BEGIN; ... ROLLBACK; with no COMMIT",
        """-- 0052_something.sql
BEGIN;
CREATE TABLE example (id uuid PRIMARY KEY);
ROLLBACK;
""",
        True,
    ),
]


def _check_text(source: str) -> list[str]:
    """Check a source string as if it were a migration file."""
    with tempfile.TemporaryDirectory() as tmp:
        path = Path(tmp) / "0052_case.sql"
        path.write_text(source)
        return checker.check_file(path)


def main() -> int:
    print("=== the transaction checker's own cases ===")
    failures = 0

    for name, source, expect_findings in CASES:
        findings = _check_text(source)
        got = bool(findings)
        ok = got == expect_findings
        if not ok:
            failures += 1
        want = "CAUGHT" if expect_findings else "allowed"
        print(
            f"  {'OK  ' if ok else 'FAIL'}  want={want:<6} got="
            f"{'CAUGHT' if got else 'allowed':<6}  {name}"
        )
        for f in findings:
            print(f"          {f}")

    # The grandfathered list must not contain a file that no longer
    # exists, or a legacy migration silently leaves the list and the
    # check starts failing on it.
    print()
    print("=== the grandfathered list matches the migrations on disk ===")
    migrations_dir = checker.MIGRATIONS_DIR
    on_disk = {p.name for p in migrations_dir.glob("*.sql")} if migrations_dir.is_dir() else set()
    for name in sorted(checker.LEGACY_UNWRAPPED):
        if name not in on_disk:
            print(f"  FAIL  {name} is grandfathered but is not on disk")
            failures += 1
        else:
            print(f"  OK    {name}")

    # Every grandfathered entry must SAY WHY.
    print()
    print("=== every grandfathered entry states its reason ===")
    for name, reason in sorted(checker.LEGACY_UNWRAPPED.items()):
        if not reason.strip():
            print(f"  FAIL  {name} has no reason")
            failures += 1
        else:
            print(f"  OK    {name}")

    # The grandfathered list must not grow silently: it is a FROZEN
    # baseline. Its size is asserted, so a new name cannot be added
    # without the count changing and this test failing.
    print()
    print("=== the grandfathered list is frozen at its size ===")
    expected = 13
    got = len(checker.LEGACY_UNWRAPPED)
    if got == expected:
        print(f"  OK    {got} grandfathered migration(s)")
    else:
        print(
            f"  FAIL  the grandfathered list has {got} entries, expected {expected}."
        )
        print("        The list only ever SHRINKS: a legacy migration that is")
        print("        wrapped properly is removed from it in the same change.")
        failures += 1

    print()
    if failures:
        print(f"  FAIL  {failures} of {len(CASES) + 3} checks are wrong")
        return 1
    print(f"  ALL PASS  ({len(CASES) + 3} checks)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
