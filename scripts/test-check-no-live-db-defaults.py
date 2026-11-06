#!/usr/bin/env python3
"""The scanner must detect every way a script names the live database,
and must NOT flag the things that merely contain the word.

WHY
---
A scanner that cries wolf gets ignored, and a scanner that is too
loose cannot be trusted to fail a build. These cases are the contract:
each one is a real line from this repo, and each has a known-correct
verdict.

Run:  python3 scripts/test-check-no-live-db-defaults.py
"""
from __future__ import annotations

import importlib.util
import re
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
SCANNER = REPO / "scripts" / "check-no-live-db-defaults.py"

spec = importlib.util.spec_from_file_location("scanner", str(SCANNER))
scanner = importlib.util.module_from_spec(spec)
spec.loader.exec_module(scanner)


#: (line, must_be_flagged)
CASES: list[tuple[str, bool]] = [
    # --- must be flagged: the database is named ---
    ('docker exec -u postgres shared-postgres psql -U postgres -d gustale --format=custom', True),
    ('psql -d "gustale" -c "select 1"', True),
    ('psql -d gustale', True),
    ('psql --dbname=gustale', True),
    ('psql -h 127.0.0.1 -U gustale -d gustale', True),
    ('PGDATABASE=gustale psql', True),
    ('dbname=gustale host=127.0.0.1', True),
    ('DB_NAME = os.environ.get("GUSTALE_DB_NAME", "gustale")', True),
    ('TARGET_DATABASE = "gustale"', True),
    ('DB_NAME_DEFAULT = "gustale"', True),
    ('export DATABASE_URL="postgresql://gustale:pw@127.0.0.1:5432/gustale"', True),
    ('if TARGET_DATABASE == "gustale":', True),
    ('db("gustale", sql)', True),
    ('def fetch_descriptions(db: str = "gustale") -> list[dict]:', True),
    ('parser.add_argument("--db", default="gustale")', True),
    ('parser.add_argument("--database", default="gustale")', True),
    ('ap.add_argument("--db", default="gustale")', True),
    ('"db", "gustale",', True),
    ('"-d", "gustale", "-tA",', True),
    ('connect(dbname="gustale")', True),
    ('{"dbname": "gustale"}', True),
    ('{"db": "gustale"}', True),
    ('  DB_NAME = "gustale"  # the live one', True),

    # --- must NOT be flagged: the word, but not the database ---
    ('import { db } from "@gustale/db";', False),
    ('const url = "https://gustale.com/dishes";', False),
    ('DB = "gustale_dev"', False),
    ('DB = "gustale_atlasflaky"', False),
    ('ROLE = "gustale_credential_issuer"', False),
    ('role = "gustale_migrator"', False),
    ('SVC_USER="gustale"', False),
    ('SVC_GROUP="gustale"', False),
    ('cookiePrefix: "gustale",', False),
    ('ROLE=gustale', False),
    ('print("gustale")', False),
    ('echo "hello # world"', False),
    ('docker exec -u postgres shared-postgres psql -U postgres -d gustale_superprobe', False),
    ('parser.add_argument("--out", default="gustale")', False),

    # --- must NOT be flagged: a comment ---
    ('# psql -d gustale is the live one', False),
    ('  # -d gustale', False),
    ('import { db } from "@gustale/db";  // uses -d gustale', False),
]


#: The destructive-target rule is a DIFFERENT question from "does this
#: line name the live database". A script that DROPs `$DB` names no
#: database at all -- the danger is in the ARGUMENT. So these cases get
#: their own runner.
DESTRUCTIVE_CASES = [
    # A script that DROPs a database or a role by variable is dangerous
    # whatever it is told to drop.
    ('psql -c "DROP DATABASE IF EXISTS $DB;"', True),
    ('d(f"DROP DATABASE IF EXISTS {DB};")', True),
    ('-c "DROP DATABASE IF EXISTS \"$TEST_DB\" WITH (FORCE);"', True),
    ('psql -c "DROP ROLE IF EXISTS $ROLE;"', True),
    ('psql -c "DROP OWNED BY $ROLE;"', True),
    # ...but only when the line is not a comment.
    ('# psql -c "DROP DATABASE IF EXISTS $DB;"', False),
    ('  # DROP ROLE IF EXISTS $ROLE', False),
]


def _is_destructive(line: str) -> bool:
    """Does this line drop a database or a role?"""
    stripped = line.strip()
    if stripped.startswith("#"):
        return False
    upper = stripped.upper()
    return any(pattern in upper for pattern in scanner.DESTRUCTIVE_NEEDS_GUARD)


#: An allowlist entry is a PROMISE, and a promise needs a test.
#:
#: `scripts/delete-test-account.sh` was merged (PR #164) after the
#: destructive-target rule (PR #168, commit 81114d6). Neither branch
#: contained the other, so PR #164's CI was green, and main went red:
#: the script DROPs a database and the scanner could not tell that it
#: only ever drops the disposable COPY, never live.
#:
#: The fix was an allowlist entry with a reason. That entry is only
#: honest as long as the script still drops the COPY and not the live
#: target -- so this test checks BOTH: the script is allowlisted, and
#: every DROP DATABASE in it still targets $COPY_DB, never $DB.
ALLOWLISTED_DROP_TARGETS = {
    "scripts/delete-test-account.sh": ("$COPY_DB",),
}


def _check_allowlisted_drop_targets() -> int:
    """Every allowlisted DROP script must still drop only its copy."""
    failures = 0
    print("=== the allowlisted DROP scripts still drop only their copy ===")
    for rel, allowed_vars in sorted(ALLOWLISTED_DROP_TARGETS.items()):
        if rel not in scanner.ALLOWLIST:
            print(f"  FAIL  {rel} is not on the allowlist")
            failures += 1
            continue
        path = scanner.REPO / rel
        if not path.is_file():
            print(f"  FAIL  {rel} does not exist")
            failures += 1
            continue
        text = path.read_text(encoding="utf-8", errors="replace")

        # Every DROP DATABASE / DROP ROLE line must name one of the
        # allowed variables and must NOT name the live target $DB.
        offenders = []
        for lineno, line in enumerate(text.splitlines(), 1):
            stripped = line.strip()
            if stripped.startswith("#"):
                continue
            upper = stripped.upper()
            if not any(p in upper for p in scanner.DESTRUCTIVE_NEEDS_GUARD):
                continue
            if not any(var in stripped for var in allowed_vars):
                offenders.append(f"{rel}:{lineno}: {stripped[:80]}")
            # A DROP that names the live target is never acceptable,
            # however it is spelled.
            if re.search(r"\$DB\b", stripped) and not any(
                var == "$DB" for var in allowed_vars
            ):
                offenders.append(f"{rel}:{lineno}: names the LIVE target $DB: {stripped[:80]}")

        if offenders:
            failures += len(offenders)
            for off in offenders:
                print(f"  FAIL  {off}")
        else:
            print(f"  OK    {rel} drops only {', '.join(allowed_vars)}")
    return failures


GUARD_CASES = [
    # A refusal: the live name is COMPARED against a variable, and the
    # script backs off when they match.
    ('if [ "$dbname" = "gustale" ]; then', True),
    ("if [ \"${dbname}\" = 'gustale' ]; then", True),
    # Python's equality is a refusal too.
    ('if dbname == "gustale":', True),
    # A MENTION is not a refusal. The script names the live database
    # and then does whatever it likes with it -- the DROP was reported
    # as safe because of this line.
    ('LIVE_DB = "gustale"', False),
    ('DB_NAME = os.environ.get("GUSTALE_DB_NAME", "gustale")', False),
    # A role name is not a refusal either.
    ('SVC_USER="gustale"', False),
    # The guard's own vocabulary.
    ('if forbidden_target; then', True),
    ('refuse_live_container()', True),
]


def _check_guard_detection() -> int:
    """Does the refusal rule accept a COMPARISON and reject a MENTION?"""
    failures = 0
    print("=== the refusal rule: a comparison is a refusal, a mention is not ===")
    for line, expect in GUARD_CASES:
        got = scanner._guards_its_drop_target(line)
        ok = got == expect
        if not ok:
            failures += 1
        verdict = "GUARD" if got else "skip"
        want = "GUARD" if expect else "skip"
        print(f"  {'OK  ' if ok else 'FAIL'}  want={want}  got={verdict}  {line[:68]}")
    return failures


def main() -> int:
    print("=== the live-database scanner's own detection cases ===")
    failures = 0
    for line, expect in CASES:
        got = scanner._names_the_live_database(line)
        ok = got == expect
        if not ok:
            failures += 1
        verdict = "FLAG" if got else "skip"
        want = "FLAG" if expect else "skip"
        print(f"  {'OK  ' if ok else 'FAIL'}  want={want}  got={verdict}  {line[:72]}")
    print()
    print("=== the destructive-target rule's own cases ===")
    d_failures = 0
    for line, expect in DESTRUCTIVE_CASES:
        got = _is_destructive(line)
        ok = got == expect
        if not ok:
            d_failures += 1
        verdict = "FLAG" if got else "skip"
        want = "FLAG" if expect else "skip"
        print(f"  {'OK  ' if ok else 'FAIL'}  want={want}  got={verdict}  {line[:72]}")
    failures += d_failures
    print()
    failures += _check_guard_detection()
    print()
    failures += _check_allowlisted_drop_targets()
    print()
    if failures:
        print(f"  FAIL  {failures} case(s) are wrong "
              f"({len(CASES)} detection + {len(DESTRUCTIVE_CASES)} destructive "
              f"+ {len(GUARD_CASES)} guard + {len(ALLOWLISTED_DROP_TARGETS)} allowlisted-drop)")
        return 1
    print(f"  ALL PASS  ({len(CASES)} detection + {len(DESTRUCTIVE_CASES)} destructive "
          f"+ {len(GUARD_CASES)} guard + {len(ALLOWLISTED_DROP_TARGETS)} allowlisted-drop)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
