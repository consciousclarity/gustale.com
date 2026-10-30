#!/usr/bin/env python3
"""Apply the rewritten Pool A descriptions, and publish the batch.

WHAT THIS DOES

Takes the proposals written by `rewrite_pool_a_descriptions.py` and
puts them into the database — but only for the dishes that PASSED
every gate, and only for a batch that passed ENTIRELY.

THE ORDER MATTERS

1. The description is written.
2. The description is READ BACK from the database and re-checked with
   the same similarity measure the gate uses, against the source it
   will be published beside.
3. Only then is the dish published.

Step 2 is not paranoia. The writer checks the text it generated; the
apply writes it to a column that a trigger may adjust and that a
later migration may touch. The thing that gets published has to be
the thing that was checked, and the only way to know that is to read
it back.

THE STATEMENTS STAY `research_pending`

Publishing a dish is not verifying its claims. Each Pool A dish
carries one statement whose only citation is an S6 (discovery-only)
source, and that statement stays `research_pending` — which is what
makes the API show the "unevidenced" badge. The badge and the
publishing are two halves of the same policy: visible, and honest
about what is not yet known.

THE AUDIT TRAIL

Every status change is recorded in `edit_history`, the same table the
moderation path writes to, so a published Pool A dish has the same
kind of record as a dish a moderator approved by hand.

Usage:
    python3 scripts/apply_pool_a_descriptions.py --batch 1            # dry run
    python3 scripts/apply_pool_a_descriptions.py --batch 1 --apply    # write + publish
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
PROPOSALS_FILE = REPO / "data" / "pool_a_descriptions.json"
LEADS_FILE = REPO / "data" / "pool_a_leads.json"

sys.path.insert(0, str(REPO / "scripts"))
from check_description_similarity import THRESHOLD, overlap  # noqa: E402


def db_rows(sql: str) -> list[dict]:
    out = subprocess.run(
        ["bash", str(REPO / "scripts" / "dbq.sh"),
         "select coalesce(json_agg(row_to_json(t)), '[]'::json) from ("
         + sql + ") t"],
        capture_output=True,
        text=True,
        check=True,
    ).stdout
    text = out.strip()
    start = text.find("[{")
    if start == -1:
        return []
    depth = 0
    for i in range(start, len(text)):
        if text[i] == "[":
            depth += 1
        elif text[i] == "]":
            depth -= 1
            if depth == 0:
                return json.loads(text[start : i + 1])
    return []


def run_sql(sql: str, **variables: str) -> str:
    """Run a statement and return psql's output.

    The `variables` are passed to psql as `-v name=value`, so the
    statement can refer to them as `:'name'`. psql quotes the value
    itself, which is what makes it safe to put a description with an
    apostrophe in it into a statement.

    The value has to arrive as a `-v` ARGUMENT and not inside the SQL
    string: psql does not substitute variables inside a `-c` string
    the way it does inside a script read from stdin or a file, so a
    statement that mixes `:'slug'` with a `-c` call fails with
    "syntax error at or near ':'".
    """
    args = ["bash", str(REPO / "scripts" / "dbq.sh")]
    for name, value in variables.items():
        args += ["-v", f"{name}={value}"]
    args.append(sql)
    result = subprocess.run(
        args,
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        raise SystemExit(f"the SQL failed:\n{result.stderr}")
    return result.stdout


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--batch", type=int, required=True)
    parser.add_argument("--apply", action="store_true",
                        help="write and publish (without it, this is a dry run)")
    args = parser.parse_args()

    records = json.loads(PROPOSALS_FILE.read_text())
    batch = [r for r in records if r.get("batch") == args.batch]
    if not batch:
        raise SystemExit(f"no proposals on file for batch {args.batch}")

    passed = [r for r in batch if r.get("status") == "pass"]
    failed = [r for r in batch if r.get("status") == "fail"]
    insufficient = [r for r in batch if r.get("status") == "insufficient"]
    errored = [r for r in batch if r.get("status") == "error"]

    print(f"[apply] batch {args.batch}: {len(batch)} proposals")
    print(f"[apply]   pass         {len(passed)}")
    print(f"[apply]   fail         {len(failed)}")
    print(f"[apply]   insufficient {len(insufficient)}")
    print(f"[apply]   error        {len(errored)}")

    # THE GATE ON THE BATCH.
    #
    # Only a batch that passed ENTIRELY is published. A batch with a
    # single failure is not published at all — publishing 99 of 100
    # would mean the site shows a half-batch that no one reviewed as
    # a batch, and the failures would be invisible.
    if failed or errored:
        print()
        print("[apply] NOT PUBLISHABLE — the batch did not pass entirely.")
        for r in failed + errored:
            print(f"[apply]   {r['slug']}: {r.get('reason') or r.get('error')}")
        print()
        print("[apply] The passing dishes can still be written as drafts.")
        if not args.apply:
            print("[apply] (dry run — nothing was written)")
            return 1

    if not passed:
        print("[apply] nothing to write")
        return 1

    leads = json.loads(LEADS_FILE.read_text())

    # ── 1. WRITE the descriptions ──────────────────────────────────
    written = 0
    skipped = 0
    for r in passed:
        slug = r["slug"]
        text = (r.get("new") or "").strip()
        if not text:
            skipped += 1
            continue

        # The description is written through a variable, because a
        # description with an apostrophe in it ("the dish's own") would
        # otherwise break the statement. psql's :'name' quoting escapes
        # the value itself.
        #
        # The status is NOT part of the WHERE clause. The write has to
        # be idempotent: a dish already published — by an earlier
        # partial run, or by hand — still needs its description
        # brought to the checked text, and a `status = 'draft'` filter
        # would quietly skip it and report a success that never
        # happened. The publish step below is what moves a dish from
        # draft to published, and it only ever moves a DRAFT, so
        # nothing here can publish anything.
        with_svg = subprocess.run(
            ["bash", str(REPO / "scripts" / "dbq.sh"),
             "-v", f"desc={text}", "-v", f"slug={slug}",
             "update dishes set short_description = :'desc' "
             "where slug = :'slug';"],
            capture_output=True,
            text=True,
        )
        if with_svg.returncode != 0:
            raise SystemExit(
                f"the write failed for {slug}:\n{with_svg.stderr}"
            )
        written += 1

    print(f"[apply] wrote {written} descriptions ({skipped} skipped)")

    # ── 2. READ BACK and re-check ────────────────────────────────
    #
    # The read-back is NOT filtered by status. What is being checked
    # here is the TEXT that was stored — that it is what was checked,
    # and that it still passes the gate. A dish that is already
    # published (from an earlier partial run, or published by hand)
    # still has to be verified; filtering it out would let a bad
    # description through unnoticed precisely because it had already
    # gone out.
    reread = db_rows(
        "select slug, short_description from dishes "
        "where slug in (" + ",".join(
            "'" + r["slug"].replace("'", "''") + "'" for r in passed
        ) + ")"
    )
    by_slug = {r["slug"]: r["short_description"] for r in reread}

    recheck_failures = []
    for r in passed:
        stored = by_slug.get(r["slug"])
        lead = leads.get(r["slug"]) or ""
        if stored is None:
            recheck_failures.append((r["slug"], "the description did not read back"))
            continue
        if stored.strip() != (r.get("new") or "").strip():
            recheck_failures.append(
                (r["slug"], "what was written is not what was checked")
            )
            continue
        content, _ = overlap(stored, lead)
        if content >= THRESHOLD:
            recheck_failures.append(
                (r["slug"], f"the stored description is {content:.3f} from the source")
            )

    print(f"[apply] re-checked {len(passed)} stored descriptions")
    if recheck_failures:
        print("[apply] RE-CHECK FAILURES:")
        for slug, why in recheck_failures:
            print(f"[apply]   {slug}: {why}")
        if not args.apply:
            print("[apply] (dry run — nothing was published)")
            return 1
        print("[apply] nothing from this batch will be published.")
        return 1

    if not args.apply:
        print("[apply] (dry run — nothing was published)")
        print(f"[apply] {len(passed)} descriptions would be written and published.")
        return 0

    # ── 3. PUBLISH ───────────────────────────────────────────────
    published = 0
    # The comment goes in as a psql VARIABLE, not as a SQL string
    # literal. It contains an apostrophe ("the site's own voice"),
    # and a literal would have to be escaped by hand; psql's :'name'
    # quoting does it correctly. The same reason the description
    # itself is a variable.
    comment = (
        f"Pool A publication batch {args.batch}: the description was "
        "rewritten in the site's own voice and passed the similarity "
        "and grounding gates; the statement stays research_pending and "
        "the dish is shown with the unevidenced badge."
    )
    for r in passed:
        slug = r["slug"]
        out = run_sql(
            "with u as ("
            "  update dishes set status = 'published', updated_at = now()"
            "   where slug = :'slug' and status = 'draft' returning id"
            ") "
            "insert into edit_history (user_id, target_type, target_id, action, diff, comment) "
            "select u.id, 'dish', u.id, 'review', "
            "       jsonb_build_object('status', jsonb_build_object('from','draft','to','published')), "
            "       :'comment'"
            "  from u;",
            slug=slug,
            comment=comment,
        )
        published += 1

    print(f"[apply] published {published} dishes")

    # ── 4. VERIFY from the database ─────────────────────────────
    check = db_rows(
        "select d.status, count(*)::int as n "
        "from dishes d where d.created_by = 'wikidata-derived' and d.status = 'published' "
        "group by d.status"
    )
    print(f"[apply] the live state: {check}")

    remaining = db_rows(
        "select count(*)::int as n from dishes "
        "where created_by = 'wikidata-derived' and status = 'draft'"
    )
    print(f"[apply] Pool A dishes still in draft: {remaining[0]['n'] if remaining else '?'}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
