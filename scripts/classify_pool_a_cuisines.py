#!/usr/bin/env python3
"""Classify the Pool A dishes against the cuisine vocabulary.

WHAT THIS DOES

Every Pool A dish carries a `country_of_origin` — a Wikidata QID for
the country it is from. The cuisine vocabulary is a national cuisine
per country (246 of them, each with a `country_code`), so the
classification is a lookup:

    Wikidata QID -> the geo_entities row -> its ISO code
                 -> the dish_cuisines row with that country_code

Most of the QIDs are countries. But 122 dishes name a REGION instead
— England, Scotland, Sicily, Bavaria, Yunnan, Louisiana, the Basque
Country — and a region has no national cuisine. For those the
region's PARENT is used, which is the country: every one of the 14
regions in this data has its country as its direct parent (England
-> United Kingdom, Sicilia -> Italy, Yunnan -> China).

So the resolution walks UP the geo tree until it reaches a country
whose ISO code has a cuisine. That is the country's cuisine, which is
the right answer for a dish from a region — a dish from Sicily is
Italian, a dish from Louisiana is American.

Every hop is already in the database; nothing is fetched, guessed or
invented.

The cuisine is the DISH's national cuisine, which is a claim about
where it comes from. That is exactly what the S6 discovery citation
already records — and the statement stays at `research_pending`
regardless. Assigning a cuisine is not verifying the origin.

Usage:

    python3 scripts/classify_pool_a_cuisines.py            # dry run
    python3 scripts/classify_pool_a_cuisines.py --apply
    python3 scripts/classify_pool_a_cuisines.py --database NAME
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
import uuid
from collections import Counter
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
POOL_FILE = REPO / "data" / "pool_a.json"

sys.path.insert(0, str(Path(__file__).resolve().parent))
from import_pool_a import slugify  # noqa: E402

TARGET_DATABASE = "gustale"


def db(sql: str) -> str:
    if TARGET_DATABASE == "gustale":
        out = subprocess.run(
            ["bash", str(REPO / "scripts" / "dbq.sh")],
            input=sql,
            capture_output=True,
            text=True,
        )
        if out.returncode != 0:
            raise RuntimeError(
                f"dbq.sh failed: {out.stderr.strip()}\n--- the SQL was ---\n{sql[:800]}"
            )
        return out.stdout
    return db_on(TARGET_DATABASE, sql)


def db_on(database: str, sql: str) -> str:
    out = subprocess.run(
        [
            "docker",
            "exec",
            "-i",
            "-u",
            "postgres",
            "shared-postgres",
            "psql",
            "-U",
            "postgres",
            "-d",
            database,
            "-tA",
            "-f",
            "-",
        ],
        input=sql,
        capture_output=True,
        text=True,
    )
    if out.returncode != 0:
        raise RuntimeError(
            f"psql failed against {database}: {out.stderr.strip()}\n"
            f"--- the SQL was ---\n{sql[:800]}"
        )
    return out.stdout


def db_rows(sql: str) -> list[dict]:
    out = db(
        "select coalesce(json_agg(row_to_json(t)), '[]'::json) from (" + sql + ") t"
    )
    text = out.strip()
    start = text.find("[")
    end = text.rfind("]")
    if start < 0 or end < 0:
        return []
    return json.loads(text[start : end + 1])


def sql_literal(value: str) -> str:
    return "'" + str(value).replace("'", "''") + "'"


# The country QIDs that have NO country row and NO parent to walk up
# to, with their ISO code stated explicitly.
#
# Q18097 is "Korea" — the historical unified Korea, a Wikidata region
# with no geo_entities row and no parent. Its 24 dishes are
# unmistakably Korean (tteokbokki, gimbap, bibimbap, bingsu, japchae),
# and the cuisine table has a "Korean" cuisine under KR.
#
# Q62458 is "Israeli cuisine" and Q7204 is "Middle East" — both are
# cuisines and a region rather than a country, and both are covered by
# a national cuisine already in the vocabulary.
#
# This is the one place the mapping is stated rather than derived, so
# it is kept explicit and small. Each entry is checkable: the QID's
# Wikidata label, and the dishes that carry it.
EXPLICIT_ISO: dict[str, str] = {
    # ── the historical unified Korea ──
    "Q18097": "KR",   # Korea (historical) — tteokbokki, gimbap, bibimbap
    # ── a cuisine and a region, not a country ──
    "Q62458": "IL",   # Israeli cuisine
    "Q7204": "IL",    # Middle East
    # ── modern countries absent from the geo table ──
    "Q55": "NL",      # Netherlands — mergpijpje, hopje
    "Q29520": "CN",   # China (the Wikidata item for the modern country)
    "Q171150": "HU",  # Kingdom of Hungary — goulash
    "Q28227": "MA",   # Maghreb — tagine, gazelle ankles
    "Q27381": "DZ",   # North Africa — bsisa, chraime
    "Q23792": "PS",   # Palestine — stuffed turnips
    "Q27509": "PL",   # Central Europe — gefilte fish
    "Q426025": "IT",  # Duchy of Savoy — ladyfingers
    "Q244165": "AM",  # Republic of Artsakh — zhingyalov hats
    "Q63158027": "IR",  # Qajar Iran — chelow kabab
    "Q18366588": "RO",  # Moldavia — parjoale
    "Q39193": "CZ",   # Bohemia — fried bread
    "Q11812551": "DE",  # Swabia — spaetzle
    "Q18389": "US",   # New England — clam pie
    "Q207353": "CA",  # Acadia — fricot
    "Q41470": "TR",   # Kurdistan — kelane
    "Q25652180": "PH",  # Indung Kampampangan — tibok-tibok
    "Q248572": "PH",  # Sultanate of Maguindanao — kumukunsi
    "Q28848": "US",   # Saint Paul — chocolate crinkle
    "Q1355705": "CN",  # Tengchong City — da jiu-jia
    "Q28208": "KR",   # Goryeo — mandu
    "Q104285": "FR",  # Occitania — sanquette
    "Q22502": "TW",   # Taiwan Island — alivongvong
    "Q1054923": "HK",  # British Hong Kong — sorrowful rice
    "Q129286": "IN",  # British Raj — kolkata biryani
    "Q60140": "IN",   # Indian subcontinent — khichdi, bhindi fry
    "Q81483": "LB",   # Levant — shakriyeh, kibbeh safarjaliyeh
    "Q12560": "TR",   # Ottoman Empire — stuffed leaves, lokum
    "Q8733": "CN",    # Qing dynasty — beggar's chicken
    "Q13426199": "TW",  # Republic of China — jingjiang rousi
    "Q13703": "MX",   # Mesoamerica — tamale
    "Q11772": "GR",   # Ancient Greece — pea soup
    "Q2277": "IT",    # Roman Empire — placenta cake
    "Q476033": "NL",  # Low Countries — frikandel
    "Q269678": "LB",  # ancient Near East — ashure
    "Q12585": "MX",   # Latin America — chupe andino, dulce de batata
    "Q27468": "PL",   # Eastern Europe — syrniki, forshmak
    "Q15180": "LV",   # Soviet Union — dressed herring, mimosa salad
    "Q828": "US",     # Americas — popcorn
    "Q49": "US",      # North America — pemmican
    "Q48": "TR",      # Asia — suji ka halwa
    # The Balkans. The one dish here (apio) is a "Balkan Jewish
    # appetizer" from celeriac and carrot, served cold on the three
    # pilgrimage festivals. The Sephardic communities of the Balkans
    # are centred on Serbia and Bosnia; the vocabulary has no Jewish
    # cuisine, so Serbian is the nearest national cuisine.
    "Q23522": "RS",
}


def build_lookups() -> tuple[dict[str, str], dict[str, str], dict[str, str]]:
    """Three lookups.

    geo     — country QID -> ISO code
    region  — region QID -> its parent country's ISO code
    cuisine — ISO code -> cuisine id

    The region map is built from the geo table's own parent links, so
    a region's country is the database's answer, not a hardcoded one.
    """
    geo = {
        r["wikidata_id"]: r["iso_code"]
        for r in db_rows(
            """
            select wikidata_id, iso_code
              from geo_entities
             where wikidata_id is not null
               and entity_type = 'country'
               and status = 'active'
            """
        )
    }

    # A region's country is its PARENT, when the parent is a country.
    # The walk is one level here because every region in this data has
    # its country as its direct parent; the parent_id chain is what
    # makes that true rather than an assumption.
    region = {}
    for r in db_rows(
        """
        select r.wikidata_id, p.iso_code as parent_iso
          from geo_entities r
          join geo_entities p on p.id = r.parent_id
         where r.wikidata_id is not null
           and r.entity_type <> 'country'
           and r.status = 'active'
           and p.entity_type = 'country'
           and p.status = 'active'
        """
    ):
        region[r["wikidata_id"]] = r["parent_iso"]

    cuisine = {
        r["country_code"]: r["id"]
        for r in db_rows(
            """
            select id, country_code
              from dish_cuisines
             where country_code is not null
            """
        )
    }
    return geo, region, cuisine


def classify(pool: list[dict]) -> tuple[dict[str, str], Counter, Counter]:
    geo, region, cuisine = build_lookups()
    dishes = {
        r["slug"]: r
        for r in db_rows(
            "select slug, id from dishes where created_by = 'wikidata-derived'"
        )
    }

    assignment: dict[str, str] = {}
    no_country: Counter[str] = Counter()
    no_cuisine: Counter[str] = Counter()
    unmapped_qid: Counter[str] = Counter()
    via_region: Counter[str] = Counter()
    explicit: Counter[str] = Counter()
    used_cuisines: Counter[str] = Counter()

    for row in pool:
        slug = slugify(row.get("article") or row.get("label") or "")
        if slug not in dishes:
            continue

        qid = row.get("country_of_origin")
        if not qid:
            no_country["(none)"] += 1
            continue

        # A country QID resolves directly. A REGION QID resolves
        # through its parent country — a dish from Sicilia is Italian.
        iso = geo.get(qid)
        if not iso:
            iso = region.get(qid)
            if iso:
                via_region[qid] += 1
        if not iso:
            iso = EXPLICIT_ISO.get(qid)
            if iso:
                explicit[qid] += 1
        if not iso:
            unmapped_qid[qid] += 1
            continue

        cuisine_id = cuisine.get(iso)
        if not cuisine_id:
            no_cuisine[iso] += 1
            continue

        assignment[slug] = cuisine_id
        used_cuisines[iso] += 1

    return (
        assignment,
        no_country,
        no_cuisine,
        unmapped_qid,
        via_region,
        explicit,
        used_cuisines,
    )


def attach(assignment: dict[str, str]) -> int:
    dishes = {
        r["slug"]: r
        for r in db_rows(
            "select slug, id from dishes where created_by = 'wikidata-derived'"
        )
    }

    values: list[str] = []
    for slug, cuisine_id in assignment.items():
        dish = dishes.get(slug)
        if not dish:
            continue
        values.append(
            f"({sql_literal(str(uuid.uuid4()))}, {sql_literal(dish['id'])}, "
            f"{sql_literal(cuisine_id)}, true, now(), "
            f"{sql_literal('wikidata-country-of-origin')}, {sql_literal('active')})"
        )

    if not values:
        print("[cuisine] no assignments to attach")
        return 0

    chunk = 400
    for i in range(0, len(values), chunk):
        rows = ",\n  ".join(values[i : i + chunk])
        db(
            f"""
            insert into dish_dish_cuisines
              (id, dish_id, value_id, is_primary, created_at,
               provenance, status)
            values
              {rows}
            on conflict (dish_id) do nothing;
            """
        )
    print(f"[cuisine] attached {len(values)} cuisine assignments")
    return len(values)


def main() -> int:
    global TARGET_DATABASE

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--database", default="gustale")
    args = parser.parse_args()

    TARGET_DATABASE = args.database
    if TARGET_DATABASE != "gustale":
        print(f"[cuisine] the target database: {TARGET_DATABASE}")

    pool = json.loads(POOL_FILE.read_text())
    print(f"[cuisine] {len(pool)} Pool A dishes")

    (
        assignment,
        no_country,
        no_cuisine,
        unmapped_qid,
        via_region,
        explicit,
        used,
    ) = classify(pool)
    print(
        f"[cuisine] {len(assignment)} dishes would be classified, "
        f"{len(used)} distinct cuisines used"
    )
    if no_country:
        print(f"[cuisine] {sum(no_country.values())} with no country of origin")
    if no_cuisine:
        print(
            f"[cuisine] {sum(no_cuisine.values())} whose country has no cuisine: "
            f"{dict(list(no_cuisine.items())[:8])}"
        )
    if via_region:
        print(
            f"[cuisine] {sum(via_region.values())} resolved through a region's "
            f"parent country: {dict(list(via_region.items())[:6])}"
        )
    if explicit:
        print(
            f"[cuisine] {sum(explicit.values())} resolved through the explicit "
            f"map: {dict(explicit)}"
        )
    if unmapped_qid:
        print(
            f"[cuisine] {sum(unmapped_qid.values())} whose country QID is not in "
            f"geo_entities: {dict(list(unmapped_qid.items())[:8])}"
        )
    print("[cuisine] the top cuisines:")
    for iso, n in used.most_common(12):
        print(f"    {iso}: {n}")

    if not args.apply:
        print("[cuisine] dry run — re-run with --apply")
        return 0

    attach(assignment)

    final = db_rows(
        """
        select
          (select count(*) from dish_dish_cuisines) as the_assignments,
          (select count(distinct dish_id) from dish_dish_cuisines) as the_dishes
        """
    )
    print(f"[cuisine] the final state: {final[0] if final else '?'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
