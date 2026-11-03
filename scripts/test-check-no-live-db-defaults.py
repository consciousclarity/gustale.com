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
    if failures:
        print(f"  FAIL  {failures} of {len(CASES)} cases are wrong")
        return 1
    print(f"  ALL PASS  ({len(CASES)} cases)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
