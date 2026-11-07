#!/usr/bin/env python3
"""
Extract the family classification from docs/FAMILY-TAXONOMY-REVIEW.md
into a SQL VALUES list.

WHY THIS FILE EXISTS
--------------------
docs/FAMILY-TAXONOMY-REVIEW.md classifies 306 families (123 that
carry published dishes, 183 that do not) into FORM / COURSE / CUISINE
/ CONTENT TYPE. The classification is derived by PRINTED RULES, so it
is auditable -- but it lives in prose, which means the database
cannot query it.

The approval settles the doc's own open question ("Whether the
classification is applied to the schema... If they should become one,
that is a migration"), so the classes become a column.

This script parses the doc's tables and emits the VALUES list. It
also RE-CHECKS the parse against the doc's own asserted numbers: the
123-family table's split is printed in the document ("FORM 83 · COURSE
21 · CUISINE 4 · CONTENT TYPE 15"), so a parse that silently
mis-assigned classes, or dropped rows, is caught here rather than
becoming a migration.

Usage:
    python3 scripts/hermes/extract-family-classification.py [--sql]
"""
import re
import sys
from pathlib import Path

DOC = Path(__file__).resolve().parents[2] / "docs/FAMILY-TAXONOMY-REVIEW.md"

# The row shapes:
#   the 123 families:  | # | class | dishes | family | path |
#   the appendix:      | class | family | path |
#
# The family cell is always "**Name** (`slug`)" or "Name (`slug`)".
ROW_RE = re.compile(
    r"^\|\s*\d*\s*\|?\s*(FORM|COURSE|CUISINE|CONTENT TYPE)\s*\|"
    r"(?:\s*\d+\s*\|)?"
    r"\s*(?:\*\*)?(?P<name>[A-Za-z0-9][^|`]*?)(?:\*\*)?\s*\(`(?P<slug>[^`]+)`\)\s*\|"
)


def parse(path: Path):
    """Return (primary, appendix, asserted).

    primary  -- the 123 families that carry published dishes
    appendix -- the 183 families that do not
    asserted -- the class split the doc prints for `primary`
    """
    text = path.read_text()

    marker = "## Appendix"
    if marker not in text:
        sys.exit("the doc no longer has an appendix heading")
    main_part, _, appendix_part = text.partition(marker)

    # The header the doc asserts for the 123:
    # "**FORM 83 · COURSE 21 · CUISINE 4 · CONTENT TYPE 15**"
    asserted = {}
    m = re.search(
        r"\*\*(FORM \d+ · COURSE \d+ · CUISINE \d+ · CONTENT TYPE \d+)\*\*",
        main_part,
    )
    if not m:
        sys.exit("the doc no longer prints the asserted class split")
    for part in m.group(1).split(" · "):
        name, _, count = part.rpartition(" ")
        asserted[name] = int(count)

    def rows_of(section):
        out = []
        for line in section.splitlines():
            if not line.startswith("|"):
                continue
            m = ROW_RE.match(line)
            if not m:
                continue
            out.append(
                (m.group(1), m.group("name").strip(), m.group("slug"))
            )
        return out

    return rows_of(main_part), rows_of(appendix_part), asserted


def split_of(rows):
    counts = {}
    for klass, _n, _s in rows:
        counts[klass] = counts.get(klass, 0) + 1
    return counts


def main():
    if not DOC.exists():
        sys.exit(f"the classification document is missing: {DOC}")

    primary, appendix, asserted = parse(DOC)
    rows = primary + appendix

    print(f"parsed {len(rows)} classifications from {DOC.name}")
    print(f"  {len(primary)} in the 123-family table, {len(appendix)} in the appendix")

    if not rows:
        sys.exit("parsed nothing -- the doc's table format must have changed")

    # The doc's own asserted split must match the parse of the table
    # it describes. This is the check that catches a mis-parse.
    counts = split_of(primary)
    print(f"  the doc asserts {asserted}")
    print(f"  the parse found  {counts}")
    for klass, want in asserted.items():
        got = counts.get(klass, 0)
        if got != want:
            sys.exit(
                f"  MISMATCH in the 123-family table: {klass} -- "
                f"the doc asserts {want}, the parse found {got}"
            )
    if sum(asserted.values()) != len(primary):
        sys.exit(
            f"  MISMATCH: the doc asserts {sum(asserted.values())} families "
            f"in the 123-family table, the parse found {len(primary)}"
        )
    print("  OK: the parse matches the doc's asserted split")

    # No duplicate slugs: a duplicate would mean one family got two
    # classes, and the migration's UPDATE would silently pick one.
    seen = {}
    for klass, name, slug in rows:
        if slug in seen:
            sys.exit(
                f"  DUPLICATE: the doc classifies {slug} twice -- "
                f"{seen[slug]} and {klass}"
            )
        seen[slug] = klass
    print(f"  OK: all {len(seen)} slugs are distinct")

    if "--sql" in sys.argv:
        print()
        print("  -- the VALUES list --")
        for klass, name, slug in rows:
            safe = name.replace("'", "''")
            print(f"    ('{slug}', '{klass}', '{safe}'),")
    else:
        print()
        print("  run with --sql to emit the VALUES list")


if __name__ == "__main__":
    main()
