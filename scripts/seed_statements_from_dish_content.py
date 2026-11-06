#!/usr/bin/env python3
"""Create research_pending statements for dishes that have none.

GUS-1010, part 1: "create statements first for the top 20 most-visited
dishes. Derive them only from content already on their pages (journey
beats, origin text), status research_pending/unevidenced, never verified
or published."

WHY THIS EXISTS
---------------
The claims model landed on 2026-10-29 (migration 0027). Every dish
imported after that date got its `originated_in` statement from the
import script. The dishes that predate the claims model — 122 of them,
created between 2026-06-15 and 2026-07-25 — were never backfilled,
so they have NO statement at all.

That matters because the verified gate reads S1-S5 sources, and a
statement is what a citation attaches to. A dish with no statement can
never be researched into a verified one.

The twenty most-visited dishes are all in that set. They are the most
viewed content on the site and they are the ones that can never be
verified.

WHAT IT DOES
------------
For each dish, it derives statements FROM CONTENT THAT IS ALREADY ON
THE DISH'S OWN PAGE:

  * `originated_in`   — from the dish's origin_geo_id. This is the same
                        statement the import script writes, and it is
                        what 121 of the 122 already have (they were
                        skipped for a different reason — see below).
  * `originated_at`   — from the dish's origin_date_earliest /
                        origin_date_latest, when it has them.
  * `part_of_tradition` — from the dish's journey beats: a beat whose
                        place_name names a tradition, with the beat's
                        own label as the value.

Every statement is written with:
  * status        = 'research_pending'
  * claim_class   = 'documented'    (the class the existing 1,354
                     statements carry; there is NO 'unevidenced' claim
                     class. 'unevidenced' is a DERIVED flag the API
                     computes — "this dish has statements and none of
                     them is verified" — and it is never stored.
                     'unsupported' would be wrong: it means there is
                     evidence the claim is unbacked, which is a
                     different statement than "not gathered yet")
  * value_type    = 'literal' or 'entity'
  * NO citation, NO source, NO credential, NO verified_by.

A dish whose statements are all research_pending reads as
`unevidenced` in the API response, which is exactly the state asked
for.

WHAT IT DOES NOT DO
-------------------
  * It never sets 'verified' or 'published'.
  * It never inserts into `sources` or `claim_citations`.
  * It never touches `publish_credential`.
  * It never invents content. Every value it writes comes from a
    column that is already on the dish's page. If the dish has no
    journey beats, it gets no `part_of_tradition` statement.
  * It does not modify a dish that already has statements.

USAGE
-----
  python3 scripts/seed_statements_from_dish_content.py --dry-run
  python3 scripts/seed_statements_from_dish_content.py --apply --limit 20
  python3 scripts/seed_statements_from_dish_content.py --apply --all
"""

from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
import uuid
from pathlib import Path
# The live-database guard. It refuses to let this script reach the live
# database unless GUSTALE_LIVE_DB_ALLOW=1 was set for THIS invocation.
# See scripts/lib/db_guard.py for why the opt-in is a separate variable.
sys.path.insert(0, str(Path(__file__).resolve().parent / "lib"))
import db_guard  # noqa: E402


REPO = Path(__file__).resolve().parent.parent

# The database is named by the environment, so the script can be pointed
# at a COPY of live rather than live itself. The default is live, so a
# bare invocation would write to live — which is why --apply is the
# only path that writes anything and why the dry run is the default.
# The target database. It is read AT CALL TIME, not at import time.
#
# It used to be captured once at import, which made the --db flag a LIE:
# main() set os.environ["GUSTALE_DB_NAME"] = args.db, but db() then
# overwrote the child environment with the import-time constant, so the
# script always wrote to the import-time database while PRINTING the
# --db value. Proved: `--db gustale_no_such_db_xyz` succeeded (reading
# live) and claimed that name.
#
# The default is deliberately NOT "gustale". A seeder that writes to
# production by default is a footgun; it must be aimed at a copy.
# NOT live by default. The live database requires the explicit
# GUSTALE_LIVE_DB_ALLOW=1 opt-in for this invocation.
DB_NAME_DEFAULT = db_guard.scratch_database()


def db_name() -> str:
    """The database this run writes to."""
    return os.environ.get("GUSTALE_DB_NAME") or DB_NAME_DEFAULT


def db(sql: str, vars: dict[str, str] | None = None) -> str:
    """A query against the target database, through dbq.sh."""
    argv = ["bash", str(REPO / "scripts" / "dbq.sh")]
    for name, value in (vars or {}).items():
        argv += ["-v", f"{name}={value}"]
    argv.append(sql)
    env = dict(os.environ)
    env["GUSTALE_DB_NAME"] = db_name()
    result = subprocess.run(argv, capture_output=True, text=True, env=env)
    if result.returncode != 0:
        raise RuntimeError(f"the query failed: {result.stderr[-600:]}")
    return result.stdout


def db_rows(sql: str) -> list[dict]:
    """The query rows, as dicts.

    psql pads its output to a column width, so the JSON has trailing
    spaces. The row is found by its bracket, not by the line starting
    with it.
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


# ── the content a statement may be derived from ─────────────────────
#
# The journey beats name a place. A place that names a tradition is a
# `part_of_tradition` candidate. The list is deliberately short and
# explicit: a place name that does not appear here is not guessed at.

TRADITIONS_BY_PLACE = {
    "india": "Indian cuisine",
    "indian": "Indian cuisine",
    "bengal": "Bengali cuisine",
    "bengali": "Bengali cuisine",
    "punjab": "Punjabi cuisine",
    "punjabi": "Punjabi cuisine",
    "hyderabad": "Hyderabadi cuisine",
    "tamil": "Tamil cuisine",
    "kerala": "Kerala cuisine",
    "mughlai": "Mughlai cuisine",
    "south india": "South Indian cuisine",
    "egypt": "Egyptian cuisine",
    "levant": "Levantine cuisine",
    "levantine": "Levantine cuisine",
    "palestine": "Palestinian cuisine",
    "palestinian": "Palestinian cuisine",
    "israel": "Israeli cuisine",
    "turkey": "Turkish cuisine",
    "ottoman": "Ottoman cuisine",
    "iran": "Persian cuisine",
    "persian": "Persian cuisine",
    "thailand": "Thai cuisine",
    "thai": "Thai cuisine",
    "siam": "Thai cuisine",
    "china": "Chinese cuisine",
    "chinese": "Chinese cuisine",
    "japan": "Japanese cuisine",
    "japanese": "Japanese cuisine",
    "korea": "Korean cuisine",
    "korean": "Korean cuisine",
    "mexico": "Mexican cuisine",
    "mexican": "Mexican cuisine",
    "spain": "Spanish cuisine",
    "spanish": "Spanish cuisine",
    "italy": "Italian cuisine",
    "italian": "Italian cuisine",
    "france": "French cuisine",
    "french": "French cuisine",
    "brazil": "Brazilian cuisine",
    "brazilian": "Brazilian cuisine",
    "argentina": "Argentine cuisine",
    "argentine": "Argentine cuisine",
    "senegal": "Senegalese cuisine",
    "senegalese": "Senegalese cuisine",
    "ghana": "Ghanaian cuisine",
    "ghanaian": "Ghanaian cuisine",
    "nigeria": "Nigerian cuisine",
    "nigerian": "Nigerian cuisine",
    "west africa": "West African cuisine",
    "hungary": "Hungarian cuisine",
    "hungarian": "Hungarian cuisine",
    "austria": "Austrian cuisine",
    "austrian": "Austrian cuisine",
    "poland": "Polish cuisine",
    "polish": "Polish cuisine",
    "russia": "Russian cuisine",
    "russian": "Russian cuisine",
    "ukraine": "Ukrainian cuisine",
    "ukrainian": "Ukrainian cuisine",
    "philippines": "Filipino cuisine",
    "filipino": "Filipino cuisine",
    "indonesia": "Indonesian cuisine",
    "indonesian": "Indonesian cuisine",
    "vietnam": "Vietnamese cuisine",
    "vietnamese": "Vietnamese cuisine",
    "lebanon": "Lebanese cuisine",
    "lebanese": "Lebanese cuisine",
    "syria": "Syrian cuisine",
    "syrian": "Syrian cuisine",
    "iraq": "Iraqi cuisine",
    "iraqi": "Iraqi cuisine",
    "morocco": "Moroccan cuisine",
    "moroccan": "Moroccan cuisine",
    "portugal": "Portuguese cuisine",
    "portuguese": "Portuguese cuisine",
    "scandinavia": "Scandinavian cuisine",
    "sweden": "Swedish cuisine",
    "swedish": "Swedish cuisine",
    "denmark": "Danish cuisine",
    "danish": "Danish cuisine",
    "norway": "Norwegian cuisine",
    "norwegian": "Norwegian cuisine",
    "finland": "Finnish cuisine",
    "finnish": "Finnish cuisine",
}


def tradition_for(place_name: str) -> str | None:
    """The tradition a journey beat's place belongs to, or None.

    The match is on a WHOLE PLACE-NAME TOKEN, not a substring: "India"
    must not match "Indiana", and "Levant" must not match "Levantine"
    by accident — both are in the table, so the longer one is tried
    first.
    """
    if not place_name:
        return None
    low = place_name.lower()
    # The longest place name first, so "south india" wins over "india".
    for key in sorted(TRADITIONS_BY_PLACE, key=len, reverse=True):
        if re.search(rf"(?<![a-z]){re.escape(key)}(?![a-z])", low):
            return TRADITIONS_BY_PLACE[key]
    return None


# ── the derivation ──────────────────────────────────────────────────

def derive(dish: dict) -> list[dict]:
    """The statements a dish's own page content supports.

    Only content already on the page is used. A dish with no journey
    beats gets no `part_of_tradition` statement; a dish with no origin
    dates gets no `originated_at` statement.
    """
    out: list[dict] = []

    # 1. originated_in — from the dish's own origin_geo_id.
    if dish.get("origin_geo_id"):
        out.append({
            "predicate": "originated_in",
            "value_type": "entity",
            "value_ref": str(dish["origin_geo_id"]),
            "value_literal": None,
            "value_literal_type": None,
            "qualifiers": {},
            "derivation": "the dish's own origin_geo_id",
        })

    # 2. originated_at — from the dish's own origin dates.
    earliest = dish.get("origin_date_earliest")
    latest = dish.get("origin_date_latest")
    if earliest or latest:
        if earliest and latest and earliest != latest:
            literal = f"{earliest}/{latest}"
        elif earliest:
            literal = str(earliest)
        else:
            literal = str(latest)
        out.append({
            "predicate": "originated_at",
            "value_type": "literal",
            "value_ref": None,
            "value_literal": literal,
            "value_literal_type": "date",
            "qualifiers": {},
            "derivation": (
                f"the dish's own origin dates "
                f"({earliest or '?'} to {latest or '?'})"
            ),
        })

    # 3. part_of_tradition — from the dish's own journey beats.
    #
    # Each beat names a place. The beat's LABEL is the text that says
    # what the beat means, and it is already on the page.
    seen: set[str] = set()
    for beat in dish.get("beats") or []:
        tradition = tradition_for(beat.get("place_name"))
        if not tradition:
            continue
        if tradition in seen:
            continue
        seen.add(tradition)
        out.append({
            "predicate": "part_of_tradition",
            "value_type": "literal",
            "value_ref": None,
            "value_literal": tradition,
            "value_literal_type": "text",
            "qualifiers": {
                "place_name": beat.get("place_name"),
                "year_approx": beat.get("year_approx"),
                "confidence": beat.get("confidence"),
                "journey_label": beat.get("label"),
            },
            "derivation": (
                f"the dish's own journey beat {beat.get('sequence')} "
                f"({beat.get('place_name')})"
            ),
        })

    # Normalise, so a branch that forgets a key cannot crash the run.
    for stmt in out:
        stmt.setdefault("value_ref", None)
        stmt.setdefault("value_literal", None)
        stmt.setdefault("value_literal_type", None)
        stmt.setdefault("qualifiers", {})
        stmt.setdefault("derivation", "")

    return out


# ── the SQL ─────────────────────────────────────────────────────────

SELECT_DISHES = """
SELECT d.id, d.slug, d.canonical_name, d.view_count,
       d.origin_geo_id, d.origin_date_earliest, d.origin_date_latest,
       d.short_description,
       COALESCE(
         (SELECT json_agg(json_build_object(
                    'sequence', b.sequence,
                    'place_name', b.place_name,
                    'year_approx', b.year_approx,
                    'confidence', b.confidence,
                    'label', b.label
                  ) ORDER BY b.sequence)
          FROM dish_journey_beats b WHERE b.dish_id = d.id),
         '[]'::json) AS beats,
       (SELECT count(*) FROM statements s WHERE s.subject_id = d.id) AS n_statements
  FROM dishes d
 WHERE d.status = 'published'
   AND NOT EXISTS (SELECT 1 FROM statements s WHERE s.subject_id = d.id)
 ORDER BY d.view_count DESC, d.slug
 LIMIT {limit}
"""

INSERT_STATEMENT = """
INSERT INTO statements
  (id, subject_type, subject_id, predicate_id, value_type, value_ref,
   value_literal, value_literal_type, qualifiers, claim_class, status,
   created_at, updated_at)
SELECT :'sid'::uuid, 'dish', :'subject'::uuid, p.id,
       :'vtype', nullif(:'vref', '')::uuid, nullif(:'vlit', ''),
       nullif(:'vlittype', ''), :'quals'::jsonb,
       'documented', 'research_pending', now(), now()
  FROM predicates p WHERE p.slug = :'pred'
ON CONFLICT (id) DO NOTHING
RETURNING id
"""


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--apply", action="store_true",
                    help="write the statements (default is a dry run)")
    ap.add_argument("--limit", type=int, default=20,
                    help="how many dishes to seed (default 20)")
    ap.add_argument("--all", action="store_true",
                    help="seed every published dish with no statement")
    ap.add_argument("--db", default=None, help="the database to write to")
    args = ap.parse_args()

    limit = 100000 if args.all else args.limit

    if args.db:
        os.environ["GUSTALE_DB_NAME"] = args.db

    # The resolved target, ONCE, and printed from this value — never
    # from the raw environment, which could disagree with it.
    #
    # The guard vets it: the live database needs the explicit
    # GUSTALE_LIVE_DB_ALLOW=1 opt-in, and this script has its own,
    # stricter rule below (it never writes to live at all).
    target = db_guard.resolve_target(
        db_name(), purpose="seed_statements_from_dish_content.py"
    )
    os.environ["GUSTALE_DB_NAME"] = target

    # A LIVE WRITE MUST BE IMPOSSIBLE BY ACCIDENT. The claims data is
    # research-only (research_pending, no citations), so a write to
    # production is never what anyone wants from this script; it is
    # always a copy, and then a deliberate promotion. The one case
    # that IS allowed is a copy that carries the disposable marker,
    # because that is how the CI exercises the script.
    if args.apply and target == db_guard.LIVE_DB:
        print(f"::error::refusing to write to the LIVE database ({db_guard.LIVE_DB!r})")
        print("::error::this script writes research-only statements; it must")
        print("::error::target a copy. Pass --db <copy> or set GUSTALE_DB_NAME.")
        return 2

    dishes = db_rows(SELECT_DISHES.replace("{limit}", str(limit)))

    print(f"=== seeding statements from the dishes' own page content")
    print(f"    the database: {target}")
    print(f"    the mode:     {'APPLY' if args.apply else 'DRY RUN'}")
    print(f"    the dishes:   {len(dishes)} published dishes with no statement")
    print()

    total_written = 0
    dishes_touched = 0
    failures = 0
    already_present = 0

    for dish in dishes:
        derived = derive(dish)
        if not derived:
            continue

        for stmt in derived:
            # THE DRY RUN MUST NOT WRITE. The insert used to run
            # unconditionally and `--apply` only changed the REPORTING, so
            # a dry run wrote 30 statements and the follow-up --apply wrote
            # 26 more — 56 rows where 26 were intended, with the same
            # subject+predicate written twice.
            #
            # The dry run now checks the statement's PRECONDITION (does
            # the predicate exist?) and reports what WOULD be written, and
            # writes nothing.
            if args.apply:
                # A DETERMINISTIC id, so a second run is a no-op. A
                # uuid4() made the script non-idempotent: running it
                # twice wrote two statements for the same fact. The id
                # is derived from the dish, the predicate and the value,
                # so the same fact always gets the same id and the
                # unique constraint (statements_one_fact_uniq) rejects
                # the second one.
                sid = str(uuid.uuid5(
                    uuid.NAMESPACE_URL,
                    f"gustale:statement:{dish['id']}:{stmt['predicate']}:"
                    f"{stmt['value_literal'] or stmt['value_ref']}",
                ))
                try:
                    out = db(INSERT_STATEMENT, {
                        "sid": sid,
                        "subject": str(dish["id"]),
                        "vtype": stmt["value_type"],
                        "vref": stmt["value_ref"] or "",
                        "vlittype": stmt["value_literal_type"] or "",
                        "vlit": stmt["value_literal"] or "",
                        "quals": json.dumps(stmt["qualifiers"]),
                        "pred": stmt["predicate"],
                    })
                except RuntimeError as exc:
                    print(f"  !! {dish['slug']} / {stmt['predicate']}: {exc}")
                    failures += 1
                    continue

                # "INSERT 0 0" means the row already existed — ON CONFLICT
                # DO NOTHING suppressed it. That is NOT a failure and NOT
                # a missing predicate: the fact is already recorded. Only
                # "INSERT 0 1" is a real write, and only the absence of
                # both means the predicate does not exist.
                if "INSERT 0 1" not in out:
                    if "INSERT 0 0" in out:
                        # Already there. Not a failure; the fact stands.
                        already_present += 1
                        print(f"  {dish['slug']:26s} {stmt['predicate']:20s} "
                              f"{str(stmt['value_literal'] or stmt['value_ref'])[:38]:40s} "
                              f"[already present — not written again]")
                        continue
                    print(f"  !! the predicate '{stmt['predicate']}' does not exist — skipped")
                    failures += 1
                    continue
            else:
                # The dry run checks the same precondition the insert's
                # SELECT depends on: the predicate must exist, or the
                # insert writes nothing.
                exists = db(
                    "SELECT count(*) FROM predicates WHERE slug = :'pred';",
                    {"pred": stmt["predicate"]},
                )
                # psql prints the count on its own line, padded.
                if "1" not in "".join(exists.split()):
                    print(f"  !! the predicate '{stmt['predicate']}' does not exist — skipped")
                    failures += 1
                    continue

            total_written += 1
            if args.apply:
                dishes_touched += 1
            print(f"  {dish['slug']:26s} {stmt['predicate']:20s} "
                  f"{str(stmt['value_literal'] or stmt['value_ref'])[:38]:40s} "
                  f"[{stmt['derivation']}]")

    print()
    print(f"=== {total_written} statements derived from {len(dishes)} dishes")
    if already_present:
        print(f"    {already_present} were already present and were not written again")
    if failures:
        print(f"    !! {failures} failures")
    if not args.apply:
        print("    (dry run — nothing was written)")
    else:
        print(f"    (APPLIED — {total_written} statements written)")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
