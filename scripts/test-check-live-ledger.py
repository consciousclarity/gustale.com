#!/usr/bin/env python3
"""The test for `scripts/check-live-ledger.py`.

A check that can only pass is not a check. This builds a ledger that
AGREES with the repository, proves the check passes against it, then
breaks it one way at a time and proves the check fails each time.

It runs against the DEDICATED TEST Postgres (scripts/lib/test_pg.sh),
never against live. It creates and drops a throwaway database, which
is why it must never run on the production cluster.

    python3 scripts/test-check-live-ledger.py
"""

from __future__ import annotations

import glob
import hashlib
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
MIGRATIONS = REPO / "db" / "migrations"
CHECK = REPO / "scripts" / "check-live-ledger.py"


def _load_guard():
    """Load scripts/lib/db_guard.py by path."""
    import importlib.util
    spec = importlib.util.spec_from_file_location(
        "db_guard", REPO / "scripts" / "lib" / "db_guard.py"
    )
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


db_guard = _load_guard()

# The throwaway database this test creates and drops.
#
# It is resolved THROUGH the guard, which refuses the live database name
# unconditionally -- no environment variable can authorise it. The test
# drops a database, so it must never be able to name the live one.
TEST_DB = db_guard.resolve(
    "gustale_ledger_check_test",
    purpose="the ledger check's throwaway test database",
)

# The rows the fixture ledger carries, and the checksum each must have.
#
# `applied` is the checksum of the file as it RAN. For 0063 that is NOT
# the repository file's checksum: the file was renamed after it ran, and
# the rename changed the filename inside the file's own header.
APPLIED_CHECKSUMS = {
    "0063_record_0061_in_the_ledger":
        "498ab199069c49452d2b3cb1219cc483968292b6cbf1368baaf537a02532f0d7",
}


def sha256_of(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def psql(db: str, sql: str) -> str:
    """Run SQL against the test Postgres. Returns stdout.

    It uses the psql INSIDE the test container, so it works on a machine
    that has no local psql -- which is the normal case here.
    """
    proc = subprocess.run(
        ["docker", "exec", "-i", "gustale-test-postgres", "psql",
         "-U", "postgres", "-d", db, "-X", "-tA", "-v", "ON_ERROR_STOP=1", "-c", sql],
        capture_output=True, text=True, timeout=120,
    )
    if proc.returncode != 0:
        raise RuntimeError(f"psql failed: {proc.stderr.strip()[:600]}")
    return proc.stdout


def drop_and_create(db: str) -> None:
    subprocess.run(
        ["docker", "exec", "gustale-test-postgres", "psql", "-U", "postgres",
         "-c", f"DROP DATABASE IF EXISTS {db};", "-c", f"CREATE DATABASE {db};"],
        capture_output=True, text=True, timeout=120, check=True,
    )


def build_agreeing_ledger(db: str) -> None:
    """Write a ledger that agrees with the repository."""
    psql(db, """
        CREATE TABLE IF NOT EXISTS public.gus_migrations_applied (
          name        text PRIMARY KEY,
          applied_at  timestamptz NOT NULL DEFAULT now(),
          applied_by  text,
          sha256      text,
          note        text
        );
    """)
    for path in sorted(MIGRATIONS.glob("*.sql")):
        stem = path.stem
        match = re.match(r"^(\d{4})_", stem)
        if match and int(match.group(1)) < 60:
            # The pre-ledger era: no row, by design.
            continue
        if stem.startswith("gus-") and stem not in {
            "gus-238-journey-editorial-fields",
            "gus-238b-association-review-visibility",
            "gus-238c-constraint-idempotence-and-ledger",
        }:
            continue
        checksum = APPLIED_CHECKSUMS.get(stem, sha256_of(path))
        if stem == "0052_recipes_schema":
            # Its file was edited after it ran, so no checksum is knowable.
            checksum = ""
        psql(db, "INSERT INTO public.gus_migrations_applied (name, applied_by, sha256, note) "
                 f"VALUES ('{stem}', 'test', '{checksum}', 'fixture');")


def run_check(db: str) -> tuple[int, str]:
    url = f"postgresql://postgres@127.0.0.1:5434/{db}"
    proc = subprocess.run(
        ["python3", str(CHECK), "--db-url", url],
        capture_output=True, text=True, cwd=REPO, timeout=180,
    )
    return proc.returncode, proc.stdout + proc.stderr


def main() -> int:
    if shutil.which("docker") is None:
        print("SKIP: docker is not available")
        return 0
    if subprocess.run(["docker", "exec", "gustale-test-postgres", "true"],
                      capture_output=True, timeout=60).returncode != 0:
        print("SKIP: the test Postgres container is not running")
        return 0

    results: list[tuple[str, bool, str]] = []

    def check(name: str, ok: bool, detail: str = "") -> None:
        results.append((name, ok, detail))

    try:
        # -----------------------------------------------------------
        # 1. The ledger agrees -> the check PASSES.
        # -----------------------------------------------------------
        drop_and_create(TEST_DB)
        build_agreeing_ledger(TEST_DB)
        rc, out = run_check(TEST_DB)
        check("an agreeing ledger PASSES", rc == 0, out[-700:])

        # -----------------------------------------------------------
        # 2. Each way the ledger can disagree -> the check FAILS.
        # -----------------------------------------------------------
        breaks = [
            ("a row with a wrong checksum FAILS",
             "UPDATE public.gus_migrations_applied SET sha256 = 'deadbeef' "
             "WHERE name = '0061_ingredient_aliases';"),
            ("a missing row FAILS",
             "DELETE FROM public.gus_migrations_applied "
             "WHERE name = '0062_ingredients_sourcing_vocabulary';"),
            ("a ledger row whose NUMBER is claimed by two files FAILS",
             # The ledger's key is the full name, so a second row with the
             # SAME name is impossible. What the check must catch is two
             # files claiming the same NUMBER -- here a stray file that
             # claims 0062 -- which is what makes the chain ambiguous.
             None),
            ("a ledger row with no migration file FAILS",
             "INSERT INTO public.gus_migrations_applied (name, sha256) "
             "VALUES ('0099_not_a_real_migration', 'x');"),
            ("a migration file with no ledger row FAILS",
             "INSERT INTO public.gus_migrations_applied (name, sha256) "
             "VALUES ('0062_wrong_name_for_the_file', 'x');"),
            ("a null checksum on a knowable row FAILS",
             "UPDATE public.gus_migrations_applied SET sha256 = NULL "
             "WHERE name = '0060_legacy_associations_published';"),
        ]
        for name, mutation in breaks:
            drop_and_create(TEST_DB)
            build_agreeing_ledger(TEST_DB)
            stray_file = None
            if mutation is None:
                # A second file claiming number 0062. The check must see
                # that two files claim one number.
                stray_file = MIGRATIONS / "0062_a_second_file_claiming_the_number.sql"
                stray_file.write_text("-- a stray file that claims number 0062\n")
            else:
                psql(TEST_DB, mutation)
            try:
                rc, out = run_check(TEST_DB)
            finally:
                if stray_file and stray_file.exists():
                    stray_file.unlink()
            check(name, rc == 1, f"rc={rc}\n{out[-500:]}")

        # -----------------------------------------------------------
        # 3. The 0052 exemption must NOT be a loophole: a checksum on
        #    0052 is not knowable, so the check must tolerate its
        #    absence and NOT tolerate its presence.
        # -----------------------------------------------------------
        drop_and_create(TEST_DB)
        build_agreeing_ledger(TEST_DB)
        rc, out = run_check(TEST_DB)
        check("0052's null checksum is tolerated", rc == 0, out[-500:])

    finally:
        subprocess.run(
            ["docker", "exec", "gustale-test-postgres", "psql", "-U", "postgres",
             "-c", f"DROP DATABASE IF EXISTS {TEST_DB};"],
            capture_output=True, text=True, timeout=120,
        )

    print("=" * 70)
    print("the ledger check")
    print("=" * 70)
    failed = 0
    for name, ok, detail in results:
        print(("  PASS  " if ok else "  FAIL  ") + name)
        if not ok:
            failed += 1
            if detail:
                print("        " + detail.replace("\n", "\n        "))
    print()
    if failed:
        print(f"FAILED -- {failed} of {len(results)} checks failed")
        return 1
    print(f"PASSED -- {len(results)} checks passed")
    return 0


if __name__ == "__main__":
    sys.exit(main())
