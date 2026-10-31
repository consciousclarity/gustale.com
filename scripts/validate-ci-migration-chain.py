#!/usr/bin/env python3
"""
Check that the CI workflow and the chain script apply the SAME migrations.

WHY THIS EXISTS

The migration list was written down twice: once in
`.github/workflows/ci.yml` and once in `scripts/ci-migration-chain.sh`.
Two copies of one thing drift, and they HAD drifted:

  - `0034_gus242_fix_corrupted_tradition.sql` was in the chain script
    and missing from ci.yml
  - `0035_categories_kind.sql` was in neither, because it did not exist
    when the lists were written

The result was a CI database that did not match the chain script's
database, and a nightly database that matched neither. A migration
that is not applied is a schema that does not exist, and the route
that reads it returns 500 — which is exactly what happened to
`GET /api/dishes` with `categories.kind`.

The Nightly now runs `scripts/ci-migration-chain.sh` rather than keeping
its own list, so that half of the problem is gone. This check closes
the other half: the CI workflow's list must match the script's.

Usage:
    python3 scripts/validate-ci-migration-chain.py

Exit 0 = the two lists agree; 1 = they differ (the differences are
printed).
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
CI_WORKFLOW = REPO / ".github" / "workflows" / "ci.yml"
CHAIN_SCRIPT = REPO / "scripts" / "ci-migration-chain.sh"
REPRO_SCRIPT = REPO / "scripts" / "repro-ci-db.sh"

MIGRATION_RE = re.compile(r"db/migrations/[0-9a-zA-Z_.-]+\.sql")


def migrations_in(path: Path) -> set[str]:
    """Every db/migrations/*.sql the file names."""
    if not path.exists():
        print(f"FAIL: {path} not found", file=sys.stderr)
        raise SystemExit(2)
    return set(MIGRATION_RE.findall(path.read_text()))


def compare(name_a: str, a: set[str], name_b: str, b: set[str]) -> list[str]:
    """The migrations that differ between two lists, as report lines."""
    lines: list[str] = []
    only_a = sorted(a - b)
    only_b = sorted(b - a)
    if only_a:
        lines.append(f"  in {name_a} but NOT in {name_b}:")
        lines.extend(f"    {m}" for m in only_a)
    if only_b:
        lines.append(f"  in {name_b} but NOT in {name_a}:")
        lines.extend(f"    {m}" for m in only_b)
    return lines


def main() -> int:
    ci = migrations_in(CI_WORKFLOW)
    chain = migrations_in(CHAIN_SCRIPT)
    repro = migrations_in(REPRO_SCRIPT)

    problems: list[str] = []
    problems += compare(
        ".github/workflows/ci.yml", ci, "scripts/ci-migration-chain.sh", chain
    )
    problems += compare(
        ".github/workflows/ci.yml", ci, "scripts/repro-ci-db.sh", repro
    )
    problems += compare(
        "scripts/ci-migration-chain.sh", chain, "scripts/repro-ci-db.sh", repro
    )

    if not problems:
        print(
            f"CI migration chain OK ({len(ci)} migrations, "
            "all three lists agree)"
        )
        return 0

    print("CI migration chain MISMATCH:", file=sys.stderr)
    for line in problems:
        print(line, file=sys.stderr)
    print(
        "\nAll three files must apply the same migrations.\n"
        "  .github/workflows/ci.yml          — the CI database\n"
        "  scripts/ci-migration-chain.sh     — the Nightly database\n"
        "  scripts/repro-ci-db.sh            — the LOCAL reproduction\n"
        "\nA migration that is not applied is a schema that does not exist,\n"
        "and the route that reads it returns 500. The local reproduction\n"
        "drifting from CI is how a developer ends up debugging a failure\n"
        "that the CI database does not have.",
        file=sys.stderr,
    )
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
