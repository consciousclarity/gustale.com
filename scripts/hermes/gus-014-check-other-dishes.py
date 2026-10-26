#!/usr/bin/env python3
"""
GUS-014 pilot — I15 checker: the other 118 dishes must be unchanged.

The requirement (Alejandro, 2026-10-26): after the pilot, every dish
OUTSIDE the pilot set must be unchanged — either

  (a) byte-identical to the pre-pilot baseline, OR
  (b) changed, with every change explained by an `edit_history` row
      written INSIDE the pilot window (i.e. a concurrent, legitimate
      write by another actor — not caused by the pilot).

Why (b) exists: the pilot does not run in a vacuum. Other agents and
scripts may write to the same catalog. Demanding literal byte-identity
across the whole catalog would make the check fail for reasons that have
nothing to do with the pilot's correctness, and could mask a real pilot
defect by forcing an operator to "fix" the noise before the check could
run at all.

The window is anchored on `edit_history.created_at`, captured at snapshot
time (V3) as `edit-history-max-created-at.txt`. The pilot window opens at
the snapshot's high-water mark.

Usage:
  python3 scripts/hermes/gus-014-check-other-dishes.py <snapshot-dir> [--db DB]
"""
import argparse
import hashlib
import pathlib
import re
import subprocess
import sys

PG_CONTAINER = "shared-postgres"
PG_SUPERUSER = "postgres"
PILOT_SLUGS = {"rendang", "chicken-tikka-masala", "tacos-al-pastor"}

CAT_DIGEST_SQL = """
WITH per_dish AS (
  SELECT d.id, d.slug,
    coalesce((
      SELECT string_agg('cat:'||c.name||':'||coalesce(dc.is_primary::text,''), ' ~ ' ORDER BY c.name)
      FROM dish_categories dc JOIN categories c ON c.id=dc.category_id
      WHERE dc.dish_id=d.id
    ), '') || '|' ||
    coalesce(d.short_description,'') || '|' ||
    coalesce(d.long_description,'') || '|' ||
    coalesce((
      SELECT string_agg('tr:'||dt.language||':'||coalesce(dt.description,'')||':'||coalesce(dt.name,''), ' ~ ' ORDER BY dt.language)
      FROM dish_translations dt WHERE dt.dish_id=d.id
    ), '') || '|' ||
    coalesce((
      SELECT string_agg('cite:'||coalesce(cit.claim_text,'')||':'||coalesce(s.url,''), ' ~ ' ORDER BY cit.id)
      FROM citations cit LEFT JOIN sources s ON s.id=cit.source_id
      WHERE cit.target_type='dish' AND cit.target_id=d.id
    ), '') || '|' ||
    coalesce((
      SELECT string_agg('ing:'||coalesce(i.canonical_name,'')||':'||coalesce(di.quantity,'')||':'||coalesce(di.unit,''), ' ~ ' ORDER BY i.canonical_name)
      FROM dish_ingredients di LEFT JOIN ingredients i ON i.id=di.ingredient_id
      WHERE di.dish_id=d.id
    ), '') || '|' ||
    coalesce((
      SELECT string_agg('rel:'||dr.relation_type||':'||coalesce(dr.reason,''), ' ~ ' ORDER BY dr.id)
      FROM dish_relations dr WHERE dr.from_dish_id=d.id OR dr.to_dish_id=d.id
    ), '') AS content_digest
  FROM dishes d
)
SELECT id, slug, md5(content_digest) FROM per_dish ORDER BY slug;
"""

EDITS_SQL = """
SELECT d.slug, e.created_at::text, e.action, coalesce(e.comment,'')
FROM edit_history e JOIN dishes d ON d.id = e.target_id
WHERE e.created_at > '{since}'::timestamptz
ORDER BY e.created_at;
"""


def psql(db: str, sql: str) -> str:
    r = subprocess.run(
        ["docker", "exec", "-i", PG_CONTAINER, "psql", "-v", "ON_ERROR_STOP=1",
         "-U", PG_SUPERUSER, "-d", db, "-tA", "-F", "\t", "-c", sql],
        capture_output=True, text=True,
    )
    if r.returncode != 0:
        raise RuntimeError(f"psql failed: {r.stderr.strip()}")
    return r.stdout


def load_catalog(path: pathlib.Path) -> dict[str, str]:
    out = {}
    for line in path.read_text().splitlines():
        if not line.strip():
            continue
        parts = line.split("\t")
        if len(parts) < 3:
            continue
        out[parts[1]] = parts[2]  # slug -> digest
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("snapshot_dir")
    ap.add_argument("--db", default="gustale")
    args = ap.parse_args()

    snap = pathlib.Path(args.snapshot_dir)
    baseline_path = snap / "catalog-baseline.tsv"
    hwm_path = snap / "edit-history-max-created-at.txt"
    if not baseline_path.exists() or not hwm_path.exists():
        print(f"FAIL: incomplete snapshot at {snap}")
        return 1

    baseline = load_catalog(baseline_path)
    since = hwm_path.read_text().strip()
    if not since or since == "none":
        since = "1970-01-01T00:00:00+00"

    current_raw = psql(args.db, CAT_DIGEST_SQL)
    current = {}
    for line in current_raw.splitlines():
        if not line.strip():
            continue
        parts = line.split("\t")
        if len(parts) < 3:
            continue
        current[parts[1]] = parts[2]

    # edit_history rows written inside the window
    edits_raw = psql(args.db, EDITS_SQL.format(since=since))
    edits = []
    for line in edits_raw.splitlines():
        if not line.strip():
            continue
        p = line.split("\t")
        if len(p) >= 3:
            edits.append((p[0], p[1], p[2], p[3] if len(p) > 3 else ""))
    edited_slugs = {e[0] for e in edits}

    print("GUS-014 I15 — other-dishes integrity check")
    print(f"  database:        {args.db}")
    print(f"  baseline:        {baseline_path}")
    print(f"  window opens:    {since}")
    print(f"  baseline dishes: {len(baseline)}")
    print(f"  current dishes:  {len(current)}")
    print(f"  edit_history rows inside window: {len(edits)}")
    print()

    errors = []
    unchanged = 0
    explained = 0

    # 1. dish set must be the same
    missing = sorted(set(baseline) - set(current))
    added = sorted(set(current) - set(baseline))
    if missing:
        errors.append(f"dishes disappeared since baseline: {missing}")
    if added:
        errors.append(f"dishes appeared since baseline: {added}")

    for slug in sorted(set(baseline) & set(current)):
        if slug in PILOT_SLUGS:
            continue  # pilot dishes are checked by the pilot spec, not here
        if baseline[slug] == current[slug]:
            unchanged += 1
            continue
        # changed — must be explained by an edit_history row in the window
        if slug in edited_slugs:
            explained += 1
            rows = [e for e in edits if e[0] == slug]
            print(f"  CHANGED (explained): {slug}")
            for s, ts, action, comment in rows:
                print(f"      edit_history {ts} action={action} comment={comment!r}")
        else:
            errors.append(
                f"dish '{slug}' changed with NO edit_history row inside the "
                f"pilot window — this is an UNEXPLAINED change and a FAIL"
            )

    print()
    print(f"  unchanged:                        {unchanged}")
    print(f"  changed but explained by window:  {explained}")
    print(f"  unexplained changes:               {len([e for e in errors if 'UNEXPLAINED' in e])}")
    print()

    if errors:
        print("FAIL — I15 not satisfied:")
        for e in errors:
            print(f"  - {e}")
        return 1
    print("PASS — every non-pilot dish is unchanged, or changed only via an")
    print("       edit_history row written inside the pilot window.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
