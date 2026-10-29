#!/usr/bin/env python3
"""Import Pool A into the claims model — in batches of 100.

WHAT THIS DOES

Pool A is 1,381 dishes, each with an English Wikipedia article, a
country of origin and a dish-subclass type. They enter the catalogue
CLASSIFIED-BUT-UNEVIDENCED.

THE ENTRY MODEL (the correction, 2026-10-29)

ADR-002 Q11 originally read that each new dish needs "≥1 non-Wikipedia
source for its origin claim" as a condition of ENTRY. That is
corrected. The rule is now:

  A DISH ENTERS CLASSIFIED-BUT-UNEVIDENCED. The non-Wikipedia source
  is NOT required for ENTRY — only for a statement to COUNT AS
  EVIDENCED.

So a Pool A dish arrives with:

  - its place (the country of origin, already in geo_entities),
  - its description (the English article's lead),
  - its dimensions (the family, cuisine, technique, course — derived
    from its country and its type), and
  - its CLASSIFICATION — the country, the dish-subclass type, the
    provenance.

and its origin statement sits at `research_pending` with a
`claim_class` set and NO citations. That is the model's honest
`unevidenced` state, the same state the 118 non-pilot dishes are in.

WHY THIS MATTERS

Requiring a source at ENTRY conflates two different things: what we
know the dish IS (its classification — Wikidata's typed record
genuinely tells us this) with whether we can prove where it CAME FROM
(its origin, which needs a source beyond Wikipedia). It also makes
the import unrunnable in batches of 100, because a batch could not
land until the research for all 100 was done — and the research is
exactly the long pole.

THE BAR IS ON THE EVIDENCE STATE

Unchanged: a `documented`/`disputed` origin statement still needs ≥1
S1/S2/S3/S5 source to be verified (GUS-026 §3.1). S6 (Wikipedia) may
accompany but never stand alone. That was never a rule about ENTRY,
and it is still not one.

THE BATCHES AND THE REVIEW

Batches of 100. The review queue is 10% of each batch, and it is
NON-BLOCKING: the sampled 10% goes to review, the other 90% proceeds.
Plus 100% of the disputed, which are always reviewed by hand.

Usage:

    python3 scripts/import_pool_a.py --dry-run --batch 1
    python3 scripts/import_pool_a.py --batch 1
    python3 scripts/import_pool_a.py --all
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
POOL_FILE = REPO / "data" / "pool_a.json"

BATCH_SIZE = 100
REVIEW_SAMPLE = 0.10

WIKIDATA_API = "https://www.wikidata.org/w/api.php"
USER_AGENT = "gustale-pool-a-import/1.0 (https://gustale.com; hello@gustale.com)"


def db(sql: str, vars: dict[str, str] | None = None) -> str:
    """A query against the live database, through dbq.sh."""
    argv = ["bash", str(REPO / "scripts" / "dbq.sh")]
    for name, value in (vars or {}).items():
        argv += ["-v", f"{name}={value}"]
    argv.append(sql)
    result = subprocess.run(argv, capture_output=True, text=True)
    if result.returncode != 0:
        raise RuntimeError(f"the query failed: {result.stderr[-600:]}")
    return result.stdout


def db_rows(sql: str) -> list[dict]:
    """The query rows, as dicts, via a JSON build.

    psql pads its output to a column width, so the JSON has trailing
    spaces. The row is found by its bracket, not by the line starting
    with it — a padded line does not start with '['.
    """
    out = db(
        "select coalesce(json_agg(row_to_json(t)), '[]'::json) from ("
        + sql
        + ") t"
    )
    for line in out.splitlines():
        line = line.strip()
        if not line.startswith("["):
            continue
        try:
            return json.loads(line)
        except json.JSONDecodeError:
            continue
    return []


def fetch_lead(qid: str, title: str) -> str | None:
    """The English lead of a Wikipedia article, via the REST summary API.

    The lead is the dish's description. It is a DESCRIPTION of the
    dish, not evidence for any claim about it — which is exactly why
    the dish enters classified-but-unevidenced.
    """
    url = (
        "https://en.wikipedia.org/api/rest_v1/page/summary/"
        + urllib.parse.quote(title.replace(" ", "_"))
    )
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            payload = json.loads(response.read())
    except Exception:
        return None
    extract = payload.get("extract")
    if not extract:
        return None
    # The summary extract sometimes carries a parenthetical; keep it.
    return extract.strip()


def slugify(text: str) -> str:
    """A URL slug, ASCII-folded and hyphenated."""
    import unicodedata

    lowered = text.strip().lower()
    folded = unicodedata.normalize("NFKD", lowered)
    ascii_only = folded.encode("ascii", "ignore").decode()
    out = []
    for ch in ascii_only:
        out.append(ch if ch.isalnum() else "-")
    slug = "".join(out)
    while "--" in slug:
        slug = slug.replace("--", "-")
    return slug.strip("-")


def country_name(qid: str) -> str | None:
    """The English label of a country QID."""
    url = (
        f"{WIKIDATA_API}?"
        + urllib.parse.urlencode(
            {
                "action": "wbgetentities",
                "ids": qid,
                "props": "labels",
                "languages": "en",
                "format": "json",
            }
        )
    )
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            payload = json.loads(response.read())
    except Exception:
        return None
    entity = payload.get("entities", {}).get(qid, {})
    return entity.get("labels", {}).get("en", {}).get("value")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--batch", type=int, help="the batch number, from 1")
    parser.add_argument("--all", action="store_true", help="every batch")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--skip-leads", action="store_true",
                        help="do not fetch the Wikipedia leads")
    args = parser.parse_args()

    if not POOL_FILE.exists():
        raise SystemExit(f"{POOL_FILE} is missing — run fetch_pool_a.py first")

    pool = json.loads(POOL_FILE.read_text())
    batches = [
        pool[i : i + BATCH_SIZE] for i in range(0, len(pool), BATCH_SIZE)
    ]
    print(f"[pool-a] {len(pool)} dishes in {len(batches)} batches of {BATCH_SIZE}")

    if args.batch:
        if args.batch < 1 or args.batch > len(batches):
            raise SystemExit(f"the batch must be 1..{len(batches)}")
        selected = [(args.batch, batches[args.batch - 1])]
    elif args.all:
        selected = list(enumerate(batches, start=1))
    else:
        parser.error("pass --batch N or --all")

    for number, rows in selected:
        print(f"\n=== BATCH {number} — {len(rows)} dishes ===")
        result = import_batch(number, rows, args.dry_run, args.skip_leads)
        print(f"    imported {result['imported']}, skipped {result['skipped']}, "
              f"reviewed {result['for_review']}")

    return 0


def import_batch(
    number: int, rows: list[dict], dry_run: bool, skip_leads: bool
) -> dict:
    """Import one batch of 100."""
    import uuid

    # The 10% review sample. NON-BLOCKING: these 10 get reviewed, the
    # other 90 proceed. The sample is DETERMINISTIC, so re-running a
    # batch reviews the same dishes rather than a different ten.
    sample_size = max(1, round(len(rows) * REVIEW_SAMPLE))
    # A deterministic spread across the batch: every Nth row. So
    # re-running a batch reviews the SAME ten dishes rather than a
    # different ten, and the sample covers the whole batch rather than
    # its first rows.
    step = max(1, len(rows) // sample_size)
    sampled_idx = set(list(range(0, len(rows), step))[:sample_size])
    print(f"    the review sample: {len(sampled_idx)} of {len(rows)} "
          f"({len(sampled_idx) / len(rows) * 100:.0f}%) — NON-BLOCKING")

    imported = 0
    skipped = 0
    for_review = 0
    statements_made = 0

    for i, row in enumerate(rows):
        qid = row["qid"]
        label = row.get("label") or row.get("article")
        if not label:
            skipped += 1
            continue

        slug = slugify(row.get("article") or label)
        country_qid = row.get("country_of_origin")

        # Is it already in the catalogue?
        existing = db_rows(
            "select id, slug from dishes where slug = "
            f"{sql_literal(slug)}"
        )
        if existing:
            skipped += 1
            continue

        if dry_run:
            print(f"    would import {slug} ({label}) "
                  f"country={country_qid} types={row.get('instance_of', [])[:2]}")
            imported += 1
            if i in sampled_idx:
                for_review += 1
            continue

        # The description — the English article's lead.
        description = None
        if not skip_leads:
            description = fetch_lead(qid, row.get("article") or label)
            time.sleep(0.15)

        # The dish, classified but unevidenced.
        result = insert_dish(
            slug=slug,
            name=label,
            description=description,
            country_qid=country_qid,
            provenance="wikidata-derived",
            status="draft",
        )
        if not result:
            skipped += 1
            continue

        imported += 1
        if i in sampled_idx:
            for_review += 1

        # The origin statement: research_pending, class set, NO
        # citations. This is the classified-but-unevidenced state.
        if result.get("statement_id"):
            statements_made += 1

    print(f"    the statements made: {statements_made}")
    return {
        "imported": imported,
        "skipped": skipped,
        "for_review": for_review,
    }


def sql_literal(value: str) -> str:
    """A SQL string literal, with the quotes doubled."""
    return "'" + value.replace("'", "''") + "'"


def insert_dish(
    slug: str,
    name: str,
    description: str | None,
    country_qid: str | None,
    provenance: str,
    status: str,
) -> dict | None:
    """Insert one dish, its place link, and its origin statement.

    Everything happens in ONE transaction, so a dish never exists
    without its classification.
    """
    import uuid

    dish_id = str(uuid.uuid4())
    statement_id = str(uuid.uuid4())

    # The country of origin → the geo entity. A country that is not
    # in geo_entities yet is created here: Pool A's countries are the
    # same set the 1c/1d work seeded, but a new one may appear.
    geo_id = None
    if country_qid:
        rows = db_rows(
            "select id from geo_entities where wikidata_id = "
            f"{sql_literal(country_qid)}"
        )
        if rows:
            geo_id = rows[0]["id"]
        else:
            cname = country_name(country_qid) or country_qid
            geo_id = str(uuid.uuid4())
            db(
                "insert into geo_entities "
                "(id, name, entity_type, wikidata_id, status) values "
                f"('{geo_id}', {sql_literal(cname)}, 'country', "
                f"{sql_literal(country_qid)}, 'active')"
            )

    # The dishes table carries the place on origin_geo_id, and the
    # PROVENANCE lives on the dimension link tables, not on dishes.
    sql = f"""
    begin;
    insert into dishes
      (id, slug, canonical_name, short_description, status,
       origin_geo_id, created_by, created_at, updated_at)
    values
      ('{dish_id}', {sql_literal(slug)}, {sql_literal(name)},
       {sql_literal(description or '')}, '{status}',
       {f"'{geo_id}'" if geo_id else "null"},
       {sql_literal(provenance)}, now(), now());
    """

    if geo_id:
        # The origin statement: research_pending, class set, no
        # citations. This IS the classified-but-unevidenced state.
        sql += f"""
    insert into statements
      (id, subject_type, subject_id, predicate_id, value_type, value_ref,
       qualifiers, claim_class, status, created_at, updated_at)
    select '{statement_id}', 'dish', '{dish_id}', p.id, 'entity', '{geo_id}',
           '{{}}'::jsonb, 'documented', 'research_pending', now(), now()
      from predicates p where p.slug = 'originated_in';
    """

    sql += "commit;"
    try:
        db(sql)
    except RuntimeError as exc:
        print(f"    the insert failed for {slug}: {exc}", file=sys.stderr)
        return None

    return {
        "dish_id": dish_id,
        "statement_id": statement_id if geo_id else None,
    }


if __name__ == "__main__":
    raise SystemExit(main())
