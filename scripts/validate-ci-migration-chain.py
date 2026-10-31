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

MIGRATION_RE = re.compile(r"db/migrations/[0-9a-zA-Z_.-]+\.sql")


def migrations_in(path: Path) -> set[str]:
    """Every db/migrations/*.sql the file names."""
    if not path.exists():
        print(f"FAIL: {path} not found", file=sys.stderr)
        raise SystemExit(2)
    return set(MIGRATION_RE.findall(path.read_text()))


def main() -> int:
    ci = migrations_in(CI_WORKFLOW)
    chain = migrations_in(CHAIN_SCRIPT)

    only_ci = sorted(ci - chain)
    only_chain = sorted(chain - ci)

    if not only_ci and not only_chain:
        print(f"CI migration chain OK ({len(ci)} migrations, both lists agree)")
        return 0

    print(
        "CI migration chain MISMATCH:",
        file=sys.stderr,
    )
    if only_ci:
        print(
            "  in .github/workflows/ci.yml but NOT in scripts/ci-migration-chain.sh:",
            file=sys.stderr,
        )
        for m in only_ci:
            print(f"    {m}", file=sys.stderr)
    if only_chain:
        print(
            "  in scripts/ci-migration-chain.sh but NOT in .github/workflows/ci.yml:",
            file=sys.stderr,
        )
        for m in only_chain:
            print(f"    {m}", file=sys.stderr)
    print(
        "\nBoth files must apply the same migrations. The Nightly runs the\n"
        "chain script, so if the lists differ, the Nightly and the CI build\n"
        "different schemas — and the one that is missing a migration is the\n"
        "one whose routes return 500.",
        file=sys.stderr,
    )
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
