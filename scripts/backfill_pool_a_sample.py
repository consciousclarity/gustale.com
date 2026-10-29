#!/usr/bin/env python3
"""Record the Pool A review sample for the batches already imported.

WHY THIS EXISTS

The import script records the 10% sample as each batch lands. The
first ten batches were imported before that was wired in, so their
sample was counted but not RECORDED — and without a record, the
review queue holds every research_pending statement, which is a work
queue rather than a sample.

A queue of a thousand items is not reviewable. The point of the 10%
is to make the review round a ROUND: something a human can actually
finish.

THE SAMPLE IS DETERMINISTIC

The same rule the import uses: every Nth row of the batch, where
N = floor(batch size / sample size). The sample is taken over the
batch's ORIGINAL ORDER — the order of data/pool_a.json — not over
whatever order the dishes happen to be in the database. So
re-importing a batch does not reshuffle which ten need review, and
the backfill lands on exactly the same ten the import would have
picked.

Usage:

    python3 scripts/backfill_pool_a_sample.py --dry-run
    python3 scripts/backfill_pool_a_sample.py --apply
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
import unicodedata
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
POOL_FILE = REPO / "data" / "pool_a.json"

BATCH_SIZE = 100
REVIEW_SAMPLE = 0.10


def db(sql: str) -> str:
    out = subprocess.run(
        ["bash", str(REPO / "scripts" / "dbq.sh"), sql],
        capture_output=True,
        text=True,
        check=True,
    ).stdout
    return out


def slug_of(row: dict) -> str:
    text = (row.get("article") or row.get("label") or "").strip().lower()
    folded = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode()
    slug = "".join(c if c.isalnum() else "-" for c in folded)
    while "--" in slug:
        slug = slug.replace("--", "-")
    return slug.strip("-")


def fetch_rows(sql: str) -> list[dict]:
    out = db("select coalesce(json_agg(row_to_json(t)), '[]'::json) from (" + sql + ") t")
    for line in out.splitlines():
        line = line.strip()
        if line.startswith("["):
            try:
                return json.loads(line)
            except json.JSONDecodeError:
                continue
    return []


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--db", default="gustale")
    args = parser.parse_args()

    pool = json.loads(POOL_FILE.read_text())
    batches = [pool[i : i + BATCH_SIZE] for i in range(0, len(pool), BATCH_SIZE)]

    # The statements already in the database, by slug.
    existing = fetch_rows(
        "select d.slug, d.id as dish_id, s.id as statement_id, "
        "       s.subject_id "
        "  from dishes d "
        "  join statements s on s.subject_id = d.id and s.subject_type = 'dish' "
        " where d.created_by = 'wikidata-derived'"
    )
    by_slug = {row["slug"]: row for row in existing}
    print(f"[sample] {len(existing)} imported Pool A statements")

    total = 0
    values: list[str] = []
    for number, rows in enumerate(batches, start=1):
        sample_size = max(1, round(len(rows) * REVIEW_SAMPLE))
        step = max(1, len(rows) // sample_size)
        positions = list(range(0, len(rows), step))[:sample_size]

        for position in positions:
            row = rows[position]
            slug = slug_of(row)
            found = by_slug.get(slug)
            if not found:
                continue
            values.append(
                f"({number}, {position + 1}, '{found['statement_id']}', "
                f"'{found['dish_id']}', 'en')"
            )
        importable = sum(1 for v in values if v.startswith(f"({number},"))
        if positions:
            print(f"    batch {number}: {len(positions)} sampled, "
                  f"{importable} importable")

    total = len(values)
    print(f"[sample] {total} statements to record")

    if not args.apply:
        print("[sample] dry run — re-run with --apply")
        return 0

    if not values:
        print("[sample] nothing to record")
        return 0

    sql = (
        "insert into pool_a_review_samples "
        "(batch_number, position_in_batch, statement_id, dish_id, locale) values\n  "
        + ",\n  ".join(values)
        + "\non conflict (batch_number, position_in_batch) do nothing;\n"
    )
    db(sql)
    print(f"[sample] recorded {total}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
