#!/usr/bin/env python3
"""The production-container check must be able to FAIL.

WHY THIS IS SEPARATE
--------------------
`scripts/check-no-production-db-drops.py` is a gate. A gate that
cannot fail is worse than no gate, because it looks like a gate that
is passing.

So this file drives the scanner with the cases that MUST be caught,
and proves it catches them. The cases are written to a TEMPORARY
directory and scanned through the scanner's own functions, so the
production repo is never modified.

The cases:

  1. a script that DROPs a database against `shared-postgres`  -> CAUGHT
  2. a script that CREATEs a database against `shared-postgres` -> CAUGHT
  3. a script that DROPs a role against `shared-postgres`        -> CAUGHT
  4. a script that names the container in a VARIABLE            -> CAUGHT
  5. a script that DROPs a database on the TEST container         -> ALLOWED
  6. a script that only mentions the words in a comment          -> ALLOWED
  7. a script that only mentions the words in a docstring        -> ALLOWED
  8. an allowlisted script (a copy of live)                     -> ALLOWED
  9. a variable whose DEFAULT is the production container        -> CAUGHT
 10. a variable the ENVIRONMENT can point at production          -> CAUGHT
 11. a variable pointing at the TEST container                   -> ALLOWED
 12. the destructive statement in a FUNCTION it calls             -> CAUGHT

Cases 9 to 12 are the ones the first version of this scanner got
wrong. It asked whether a line NAMED the production container, and
a line that says `docker exec "$PG_CONTAINER"` names nothing -- so
it passed. That is the 2026-11-06 incident in script form, and a
gate that passes it is a gate that is not there.
"""
from __future__ import annotations

import importlib.util
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location(
    "check_no_production_db_drops", HERE / "check-no-production-db-drops.py"
)
scanner = importlib.util.module_from_spec(spec)
assert spec.loader is not None
spec.loader.exec_module(scanner)


#: (name, source, expect_findings)
CASES: list[tuple[str, str, bool]] = [
    (
        "a DROP DATABASE against the production container",
        """#!/usr/bin/env bash
docker exec -u postgres shared-postgres psql -U postgres -d postgres \\
  -c "DROP DATABASE IF EXISTS gustale;"
""",
        True,
    ),
    (
        "a CREATE DATABASE against the production container",
        """#!/usr/bin/env bash
docker exec -u postgres shared-postgres psql -U postgres -d postgres \\
  -c "CREATE DATABASE gustale_scratch;"
""",
        True,
    ),
    (
        "a DROP ROLE against the production container",
        """#!/usr/bin/env bash
docker exec -u postgres shared-postgres psql -U postgres -d postgres \\
  -c "DROP ROLE IF EXISTS gustale_scratch;"
""",
        True,
    ),
    (
        "the container named through a VARIABLE",
        """#!/usr/bin/env bash
CONTAINER=shared-postgres
docker exec -u postgres "$CONTAINER" psql -U postgres -d postgres \\
  -c "DROP DATABASE IF EXISTS gustale;"
""",
        True,
    ),
    (
        "a DROP DATABASE on the DEDICATED TEST container",
        """#!/usr/bin/env bash
docker exec -u postgres gustale-test-postgres psql -U postgres -d postgres \\
  -c "DROP DATABASE IF EXISTS gustale_scratch;"
""",
        False,
    ),
    (
        "the words only in a COMMENT",
        """#!/usr/bin/env bash
# This script DROPs a database against shared-postgres. It does not.
echo "hello"
""",
        False,
    ),
    (
        "the words only in a DOCSTRING",
        '''#!/usr/bin/env python3
"""A script that explains DROP DATABASE against shared-postgres.

It does not actually run it.
"""


def main() -> int:
    print("hello")
    return 0
''',
        False,
    ),
    (
        "a variable whose DEFAULT is the production container",
        """#!/usr/bin/env bash
PG_CONTAINER="${PG_CONTAINER:-shared-postgres}"
docker exec -u postgres "$PG_CONTAINER" psql -U postgres -d postgres \\
  -c "DROP DATABASE IF EXISTS gustale_scratch;"
""",
        True,
    ),
    (
        "a variable the ENVIRONMENT can point at production",
        """#!/usr/bin/env bash
PG_CONTAINER="${PG_CONTAINER:-gustale-test-postgres}"
docker exec -u postgres "$PG_CONTAINER" psql -U postgres -d postgres \\
  -c "DROP DATABASE IF EXISTS gustale_scratch;"
""",
        True,
    ),
    (
        "a variable pointing at the TEST container",
        """#!/usr/bin/env bash
PG_CONTAINER="gustale-test-postgres"
docker exec -u postgres "$PG_CONTAINER" psql -U postgres -d postgres \\
  -c "DROP DATABASE IF EXISTS gustale_scratch;"
""",
        False,
    ),
    (
        "the destructive statement in a FUNCTION it calls",
        """#!/usr/bin/env bash
PG_CONTAINER="shared-postgres"
psql_run() {
  local db="$1"; shift
  docker exec -i "$PG_CONTAINER" psql -v ON_ERROR_STOP=1 -U postgres -d "$db" "$@"
}
psql_run postgres -c "DROP DATABASE IF EXISTS gustale_scratch;"
""",
        True,
    ),
    (
        "a PYTHON script that shells out to docker exec",
        """#!/usr/bin/env python3
import os
import subprocess

TEST_PG_CONTAINER = os.environ.get("GUSTALE_TEST_PG_CONTAINER", "gustale-test-postgres")

def d(sql: str) -> None:
    r = subprocess.run(
        ["docker", "exec", "-u", "postgres", "-i", TEST_PG_CONTAINER,
         "psql", "-U", "postgres", "-d", "postgres", "-tAc", sql],
        capture_output=True, text=True,
    )

def main() -> None:
    d("DROP DATABASE IF EXISTS gustale_scratch;")
    d("CREATE DATABASE gustale_scratch;")
""",
        True,
    ),
    (
        "a PYTHON script whose container is a constant test container",
        """#!/usr/bin/env python3
import subprocess

TEST_PG_CONTAINER = "gustale-test-postgres"

def d(sql: str) -> None:
    r = subprocess.run(
        ["docker", "exec", "-u", "postgres", "-i", TEST_PG_CONTAINER,
         "psql", "-U", "postgres", "-d", "postgres", "-tAc", sql],
        capture_output=True, text=True,
    )

def main() -> None:
    d("DROP DATABASE IF EXISTS gustale_scratch;")
""",
        False,
    ),
]


def _scan_text(rel: str, source: str) -> list[str]:
    """Scan a source string as if it were a file at `rel`."""
    with tempfile.TemporaryDirectory() as tmp:
        path = Path(tmp) / Path(rel).name
        path.write_text(source)
        # Temporarily point the scanner's REPO at the temp dir so the
        # allowlist and the NO_TARGET list behave as they would in the
        # real repo (by RELATIVE path).
        old_repo = scanner.REPO
        scanner.REPO = Path(tmp)
        try:
            return scanner.scan_file(path)
        finally:
            scanner.REPO = old_repo


def main() -> int:
    print("=== the production-container check's own cases ===")
    failures = 0

    for name, source, expect_findings in CASES:
        findings = _scan_text("scripts/case.sh", source)
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

    # The allowlist case: a script that legitimately copies live.
    print()
    print("=== an allowlisted script is allowed ===")
    allowlisted = scanner.ALLOWLIST.get("scripts/apply-migration-live.sh")
    if allowlisted:
        print(f"  OK    scripts/apply-migration-live.sh is allowlisted")
        print(f"          reason: {allowlisted[:70]}...")
    else:
        print("  FAIL  scripts/apply-migration-live.sh is NOT allowlisted")
        failures += 1

    # The allowlist must have a reason for EVERY entry.
    print()
    print("=== every allowlist entry states its reason ===")
    for path, reason in sorted(scanner.ALLOWLIST.items()):
        if not reason.strip():
            print(f"  FAIL  {path} has no reason")
            failures += 1
        else:
            print(f"  OK    {path}")

    print()
    if failures:
        print(f"  FAIL  {failures} of {len(CASES) + 2} checks are wrong")
        return 1
    print(f"  ALL PASS  ({len(CASES) + 2} checks)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
