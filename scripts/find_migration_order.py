#!/usr/bin/env python3
"""Find the order that applies BOTH migration chains cleanly to a fresh DB.

The repo has two migration directories that are INTERLEAVED, and the
interleaving depends on the SEED:

  packages/db/drizzle/*.sql  — the drizzle-kit chain. 0000 creates the base
                               33 tables; 0004 creates `dish_relations`.
  db/migrations/*.sql        — the GUS-xxx chain. These CREATE the
                               vocabulary tables (dish_families,
                               dish_cuisines, dish_traditions,
                               dish_techniques, dish_contexts) that 0000
                               does not create, and seed the GUS-242
                               reference data.

`db/migrations/gus-014-pilot-dimensions.sql` needs both `dishes` (0000)
and `dish_relations` (0004), so neither chain alone works and neither
does a fixed alphabetical order.

Two of the GUS-xxx files also need the SEEDED dishes:
  gus-241-taxonomy-and-unset-dimensions.sql  — its pre-flight asserts on
                                              the seeded dimension cells
  gus-242-schema-prep.sql                    — its `provenance` check
                                              reads the seven dimension
                                              tables the seed populates

So the order is: schema first, then the seed, then the rest. This script
finds the working order by trial: it repeatedly attempts the remaining
files and, when one fails with "relation does not exist", moves that file
to the back of the queue and tries again. When a file succeeds it is
fixed in place.

Output: the working order, one path per line.
"""

import subprocess
from pathlib import Path

DB = "gustale_order_probe"

DRIZZLE = sorted(
    str(p) for p in Path("packages/db/drizzle").glob("*.sql")
)
GUS = sorted(
    str(p) for p in Path("db/migrations").glob("*.sql")
)
SEEDS = [
    "packages/db/seed-moussaka.sql",
    "packages/db/seed-journey.sql",
]


def d(sql: str, db: str = "postgres") -> str:
    r = subprocess.run(
        ["docker", "exec", "-u", "postgres", "-i", "shared-postgres",
         "psql", "-U", "postgres", "-d", db, "-tAc", sql],
        capture_output=True, text=True,
    )
    return r.stdout.strip()


def apply(path: str) -> tuple[bool, str]:
    with open(path, "rb") as fh:
        r = subprocess.run(
            ["docker", "exec", "-u", "postgres", "-i", "shared-postgres",
             "psql", "-U", "postgres", "-d", DB, "-v", "ON_ERROR_STOP=1", "-f", "-"],
            stdin=fh, capture_output=True, text=True,
        )
    err = ""
    for line in (r.stderr or "").splitlines():
        if "ERROR" in line:
            err = line.strip()
            break
    return r.returncode == 0, err


def solve(pool: list[str], order: list[str], label: str) -> list[str]:
    """Try to place every file in `pool`, appending to `order`."""
    pending = list(pool)
    stuck: dict[str, str] = {}
    while pending:
        progressed = False
        for path in list(pending):
            ok, err = apply(path)
            if ok:
                order.append(path)
                pending.remove(path)
                print(f"ok   {path}")
                progressed = True
            else:
                stuck[path] = err
        if not progressed:
            print(f"--- {label}: could not place {len(pending)} file(s)")
            for p in pending:
                print(f"      {p}\n        {stuck.get(p, '')}")
            break
    return pending


def main() -> int:
    d(f"DROP DATABASE IF EXISTS {DB};")
    d(f"CREATE DATABASE {DB};")
    d('CREATE EXTENSION IF NOT EXISTS postgis;', db=DB)
    d('CREATE EXTENSION IF NOT EXISTS "uuid-ossp";', db=DB)

    order: list[str] = []

    # Phase 1: the drizzle chain + the GUS-xxx files that only need the
    # base schema.
    phase1_pool = DRIZZLE + [g for g in GUS if "gus-241" not in g and "gus-242-schema-prep" not in g]
    stuck1 = solve(phase1_pool, order, "phase 1")

    # Phase 2: the seed, which populates the dishes the two remaining
    # files assert on.
    print()
    print("=== seed ===")
    for s in SEEDS:
        ok, err = apply(s)
        if ok:
            order.append(s)
            print(f"ok   {s}")
        else:
            print(f"FAILED {s}: {err}")

    # Phase 3: the two files that need the seeded data.
    print()
    phase3_pool = [g for g in GUS if "gus-241" in g or "gus-242-schema-prep" in g]
    stuck3 = solve(phase3_pool, order, "phase 3")

    # Phase 4: the remaining drizzle files (the GUS-242 data migrations).
    print()
    remaining_drizzle = [f for f in DRIZZLE if f not in order]
    stuck4 = solve(remaining_drizzle, order, "phase 4")

    print()
    print("=== ORDER ===")
    for p in order:
        print(p)

    tables = d(
        "select count(*) from information_schema.tables where table_schema='public';",
        db=DB,
    )
    print()
    print(f"tables in the probe DB: {tables}")

    all_stuck = stuck1 + stuck3 + stuck4
    if all_stuck:
        print()
        print("=== NOT PLACED ===")
        for p in all_stuck:
            print(p)
    d(f"DROP DATABASE IF EXISTS {DB};")
    return 0 if not all_stuck else 1


if __name__ == "__main__":
    raise SystemExit(main())
