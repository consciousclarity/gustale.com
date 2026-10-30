#!/usr/bin/env python3
"""Classify the Pool A dishes against the family vocabulary.

WHAT THIS DOES

Each Pool A dish carries the Wikidata classes it belongs to
(`instance_of` and `subclass_of`). Those classes are the dish's
TYPE — "dish", "dessert", "soup", "rice dish" — and the family
vocabulary is exactly that kind of type.

A dish carries EXACTLY ONE family. The `dish_dish_families` table
has a unique index on `dish_id` alone, and GUS-231 requires exactly
one state per dimension per dish — either a value or an explicit
"unset" with a reason. So this picks the SINGLE MOST SPECIFIC class
each dish has, not all of them.

The specificity order is explicit below: "rice dish" is more
informative than "dish", and "dish" is the fallback for everything.
A class maps to an EXISTING family where one exists, and to a NEW
family where it does not. The new families are created in the same
hierarchy as the existing ones — the top-level ones are roots, and
the specific ones hang off their type parent.

WHAT IT DOES NOT DO

It does not publish anything and it does not touch the description.
The statements stay at `research_pending` and the dishes stay
`draft`. A family is a TYPE, not evidence of an origin, and
classifying one is not a claim that has been verified.

Usage:

    python3 scripts/classify_pool_a_families.py            # dry run
    python3 scripts/classify_pool_a_families.py --apply
    python3 scripts/classify_pool_a_families.py --database NAME
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
import urllib.parse
import uuid
from collections import Counter
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
POOL_FILE = REPO / "data" / "pool_a.json"

ADMIN = "00000000-0000-0000-0000-000000000001"

sys.path.insert(0, str(Path(__file__).resolve().parent))
from import_pool_a import slugify  # noqa: E402

TARGET_DATABASE = "gustale"


# ── the class → family map ────────────────────────────────────────────
#
# The KEY is a Wikidata QID. The VALUE is (family slug, parent slug).
#
# The parent is the family the new one hangs under. `None` means the
# family is a ROOT of its own, which is how the existing vocabulary
# is structured for the broad types.
#
# The slug of an EXISTING family is used as-is — the mapping never
# creates a second family for something the vocabulary already has.
CLASS_TO_FAMILY: dict[str, tuple[str, str | None]] = {
    # The broad types.
    "Q746549": ("dish", None),
    "Q19861951": ("dish", None),
    "Q8195619": ("human-food", "dish"),
    "Q2095": ("food", "dish"),
    "Q6460735": ("meal", "dish"),
    "Q19708506": ("traditional-food", "dish"),
    # Courses and eating contexts.
    "Q1628963": ("appetizer", "dish"),
    "Q1316209": ("street-food", "dish"),
    "Q749316": ("snack", "dish"),
    "Q81799": ("fast-food", "dish"),
    # Sweet things.
    "Q182940": ("dessert", None),
    "Q5159627": ("confectionery", "dessert"),
    "Q477248": ("pastry", "dessert"),
    "Q2251745": ("baked-good", "dessert"),
    "Q2382369": ("sweet-dish", "dessert"),
    "Q12492827": ("kue", "dessert"),
    "Q13276": ("cake", "dessert"),
    "Q185583": ("candy", "dessert"),
    "Q13360264": ("pie", "dessert"),
    "Q16510063": ("dessert-buffet", "dessert"),
    # Savoury bases.
    "Q41415": ("soup", None),
    "Q2920963": ("stew", None),
    "Q7802": ("bread", None),
    "Q666242": ("flatbread", "dessert"),
    "Q21976260": ("rice-dish", None),
    "Q98826752": ("noodle-dish", None),
    "Q18679685": ("pasta-dish", None),
    "Q18679149": ("fish-dish", None),
    "Q1427844": ("meat-dish", None),
    "Q28100368": ("beef-dish", "meat-dish"),
    "Q27994917": ("chicken-dish", "meat-dish"),
    "Q28100020": ("pork-dish", "meat-dish"),
    "Q18697490": ("lamb-dish", "meat-dish"),
    "Q10514020": ("potato-dish", "dish"),
    "Q28100194": ("egg-dish", None),
    "Q28803": ("sandwich", None),
    "Q27966939": ("hamburger", "sandwich"),
    "Q1076288": ("taco", None),
    "Q193536": ("pizza", None),
    "Q25400": ("stuffed-pastry", None),
    "Q26401": ("dumpling", None),
    "Q1509450": ("steamed-bread", "dish"),
    "Q9266": ("salad", None),
    "Q25579312": ("jajan-pasar", "dish"),
    "Q1763319": ("kueh", "dessert"),
}

# The classes that mean "a dish" and carry no useful type on their
# own. They are recorded on the dish but do not produce a family.
IGNORED_CLASSES = {
    "Q177",  # ? — an unresolved label
}

# HOW SPECIFIC A CLASS IS. A dish takes the class with the HIGHEST
# rank — the most informative one it has.
#
# The broad classes rank lowest and are only used when a dish has
# nothing more precise. The rank is a property of the CLASS, not of
# the dish, so it is the same for every dish that carries it.
#
# The scale:
#   100 — a named, specific dish type ("beef dish", "jajan pasar")
#    90 — a preparation type ("stew", "soup", "rice dish", "pastry")
#    80 — a course or eating context ("street food", "appetizer")
#    70 — a broad food category ("dessert", "bread", "sandwich")
#    60 — a broad food class ("food", "human food")
#    50 — the fallback ("dish")
# The SECOND TIER — the long-tail classes.
#
# The map above covers the broad types. These are the specific ones
# that a dish carries INSTEAD of a broad type: "seafood dish",
# "offal dish", "doughnut", "wafer". A dish whose only class is one
# of these would otherwise be left unclassified.
#
# They are the most specific class a dish has, so they rank at 100 —
# the same rank as the named dish types above.
CLASS_TO_FAMILY_TIER2: dict[str, tuple[str, str | None]] = {
    # Savoury dishes.
    "Q84431525": ("vegetable-dish", "dish"),
    "Q11559422": ("seafood-dish", "dish"),
    "Q100320371": ("offal-dish", "meat-dish"),
    "Q28100665": ("veal-dish", "meat-dish"),
    "Q28100907": ("shrimp-dish", "seafood-dish"),
    "Q28101001": ("clam-dish", "seafood-dish"),
    "Q9384666": ("meatball", "meat-dish"),
    "Q60748908": ("bacon-wrapped-food", "dish"),
    "Q138773658": ("sweet-potato-dish", "dish"),
    "Q107289424": ("soup", None),
    "Q107695269": ("cooked-grain", "dish"),
    "Q1142503": ("shiokara", "fermented-dish"),
    "Q3494357": ("culinary-speciality", "dish"),
    "Q1391582": ("national-dish", "dish"),
    "Q748611": ("finger-food", "appetizer"),
    "Q5331296": ("live-seafood", "seafood-dish"),
    "Q815740": ("surimi", "seafood-dish"),
    "Q1051265": ("instant-noodles", "noodle-dish"),
    "Q3897491": ("stuffed-pasta", "pasta-dish"),
    # Sweet things.
    "Q3087607": ("sweetmeat", "dessert"),
    "Q1361086": ("chocolate-bar", "dessert"),
    "Q21596812": ("sweet-bread", "bread"),
    "Q1063096": ("wagashi", "dessert"),
    "Q599548": ("manju", "dessert"),
    "Q117072235": ("wafer", "dessert"),
    "Q131935021": ("ice-cream-flavour", "dessert"),
    "Q13266": ("cookie", "dessert"),
    "Q192783": ("doughnut", "dessert"),
    "Q2461000": ("apple-turnover", "dessert"),
    # Drinks and odds.
    "Q105815873": ("chewing-gum", "confection"),
    "Q130878": ("chewing-gum", "confection"),
    "Q40050": ("drink", None),
    "Q431289": ("brand", "dish"),
    "Q1472481": ("spread", "dish"),
    "Q10987": ("honey", "confection"),
}

# The THIRD TIER — the last 46 dishes, each carrying one or two
# classes that the first two tiers did not cover.
#
# Some of these are single dishes rather than types ("Goulash",
# "Hedgehog slice"). They still need a family, because the family is
# the dish's TYPE and the fallback ("dish") is the honest answer when
# nothing more specific exists.
CLASS_TO_FAMILY_TIER3: dict[str, tuple[str, str | None]] = {
    "Q186817": ("porridge", None),
    "Q178": ("pasta", None),
    "Q818674": ("meze", "appetizer"),
    "Q13377687": ("bun", "bread"),
    "Q668855": ("scrambled-eggs", "egg-dish"),
    "Q5454668": ("fish-soup", "soup"),
    "Q111836983": ("sandwich", None),
    "Q44541": ("pancake", None),
    "Q545985": ("fish-sauce", "sauce"),
    "Q16323605": ("food-brand", "dish"),
    "Q147651": ("peanut-butter", "spread"),
    "Q14915034": ("course", "dish"),
    "Q11753791": ("legume", "vegetable-dish"),
    "Q1778821": ("cuisine", "dish"),
    "Q1485476": ("cold-dish", "dish"),
    "Q1854639": ("dumpling", None),
    "Q205762": ("goulash", "stew"),
    "Q4426758": ("fermented-bean-paste", "fermented-soy"),
    "Q3200265": ("patty", "burger"),
    "Q3006997": ("chadian-cuisine", "dish"),
    "Q80973": ("breakfast", "meal"),
    "Q47530595": ("savoury-pie", "pie"),
    "Q2282540": ("cruller", "dessert"),
    "Q6176900": ("jelly-doughnut", "doughnut"),
    "Q130186": ("torte", "cake"),
    "Q21156490": ("chocolate-egg", "chocolate"),
    "Q28100830": ("goat-meat-dish", "meat-dish"),
    "Q179010": ("kebab", None),
    "Q16242003": ("hedgehog-slice", "pastry"),
    "Q6501890": ("casserole", None),
}

# The FOURTH TIER — the last 21 dishes. Each carries one or two
# classes that the earlier tiers did not cover.
CLASS_TO_FAMILY_TIER4: dict[str, tuple[str, str | None]] = {
    "Q100276703": ("potato-casserole", "casserole"),
    "Q1089051": ("tripe-soup", "soup"),
    "Q1137679": ("baozi", "steamed-bread"),
    "Q11403718": ("sanquette", "dish"),
    "Q115188364": ("been-cin", "rice-dish"),
    "Q11680910": ("cotoletta", "breaded-cutlet"),
    "Q11690488": ("manjar-blanco", "dessert"),
    "Q12486": ("buckwheat-pancake", "pancake"),
    "Q135450685": ("holiday-dish", "dish"),
    "Q15014447": ("cold-noodle", "noodle-dish"),
    "Q1501889": ("white-bread", "bread"),
    "Q17238884": ("ame", "confection"),
    "Q20639978": ("drops", "confection"),
    "Q27994933": ("shiroi-koibito", "dessert"),
    "Q28100113": ("tuna-dish", "fish-dish"),
    "Q28438379": ("leavened-bread", "bread"),
    "Q3272159": ("mithai", "confection"),
    "Q381350": ("semolina", "dish"),
    "Q5090": ("rice", "rice-dish"),
    "Q5372471": ("western-confection", "confection"),
    "Q54423330": ("fish-sandwich", "sandwich"),
    "Q5876127": ("christmas-food", "holiday-dish"),
    "Q6150872": ("janchi-guksu", "cold-noodle"),
    "Q624004": ("mousse", "dessert"),
    "Q648352": ("bibimbap", "rice-dish"),
    "Q702104": ("stuffed-pepper", "stuffed-vegetable"),
    "Q708823": ("brittle", "candy"),
    "Q7491078": ("shaved-ice", "dessert"),
    "Q866153": ("frozen-dessert", "dessert"),
    "Q9053": ("pudding", None),
    "Q917574": ("brioche", "bread"),
    "Q956595": ("idli", "rice-dish"),
}

CLASS_RANK: dict[str, int] = {
    # The specific dish types.
    "Q27966939": 100,  # hamburger
    "Q1763319": 100,   # kueh
    "Q193536": 100,    # pizza
    "Q12492827": 100,  # kue
    "Q25579312": 100,  # jajan pasar
    "Q18697490": 100,  # lamb dish
    "Q28100020": 100,  # pork dish
    "Q27994917": 100,  # chicken dish
    "Q28100368": 100,  # beef dish
    "Q18679685": 100,  # pasta dish
    "Q10514020": 100,  # potato dish
    # The preparation types.
    "Q2920963": 90,    # stew
    "Q41415": 90,      # soup
    "Q21976260": 90,   # rice dish
    "Q98826752": 90,   # noodle dish
    "Q2251745": 90,    # baked good
    "Q477248": 90,     # pastry
    "Q5159627": 90,    # confectionery
    "Q28100194": 90,   # egg dish
    "Q28803": 90,      # sandwich
    "Q1076288": 90,    # taco
    "Q25400": 90,      # stuffed pastry
    "Q26401": 90,      # dumpling
    "Q1509450": 90,    # steamed bread
    "Q13276": 90,      # cake
    "Q185583": 90,     # candy
    "Q13360264": 90,   # pie
    "Q2382369": 90,    # sweet dish
    "Q18679149": 90,   # fish dish
    "Q1427844": 90,    # meat dish
    "Q7802": 90,       # bread
    "Q666242": 90,     # flatbread
    "Q9266": 90,       # salad
    # The courses and eating contexts.
    "Q1316209": 80,    # street food
    "Q1628963": 80,    # appetizer
    "Q749316": 80,     # snack
    "Q81799": 80,      # fast food
    "Q182940": 80,     # dessert
    "Q19708506": 80,   # traditional food
    # The broad classes.
    "Q6460735": 60,    # meal
    "Q2095": 60,       # food
    "Q8195619": 60,    # human food
    "Q19861951": 60,   # type of food or dish
    # The fallback.
    "Q746549": 50,     # dish
}


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


TIER2_AND_3 = (
    set(CLASS_TO_FAMILY_TIER2)
    | set(CLASS_TO_FAMILY_TIER3)
    | set(CLASS_TO_FAMILY_TIER4)
)


def all_mappings() -> dict[str, tuple[str, str | None]]:
    """Every tier of the class map, merged.

    The tiers are layered: a later tier refines an earlier one, so it
    wins for the QIDs it covers.
    """
    merged = dict(CLASS_TO_FAMILY)
    merged.update(CLASS_TO_FAMILY_TIER2)
    merged.update(CLASS_TO_FAMILY_TIER3)
    merged.update(CLASS_TO_FAMILY_TIER4)
    return merged


def existing_families() -> dict[str, dict]:
    rows = db_rows(
        """
        select f.id, f.slug, f.name, f.parent_id, p.slug as parent_slug
          from dish_families f
          left join dish_families p on p.id = f.parent_id
        """
    )
    return {r["slug"]: r for r in rows}


def needed_new_families() -> dict[str, dict]:
    """The families the mapping needs that do not exist yet."""
    families = existing_families()
    needed: dict[str, dict] = {}

    for qid, (slug, parent) in all_mappings().items():
        if slug in families or slug in needed:
            continue
        needed[slug] = {
            "slug": slug,
            "name": slug.replace("-", " ").title(),
            "parent_slug": parent,
            "from_qid": qid,
        }

    # A new family's parent must exist — either already in the
    # vocabulary, or another new one. The parent chain is resolved
    # after every family is collected, so the order does not matter.
    return needed


def create_missing_families(needed: dict[str, dict], existing: dict[str, dict]) -> int:
    """Insert the families that do not exist, parents first."""
    if not needed:
        return 0

    # Resolve the parent id for each new family, creating the
    # families in dependency order (a parent before its child).
    resolved: dict[str, str] = {}
    pending = dict(needed)

    def resolve(slug: str) -> str | None:
        if slug in resolved:
            return resolved[slug]
        if slug in existing:
            return existing[slug]["id"]
        entry = pending.get(slug)
        if not entry:
            return None
        parent_slug = entry.get("parent_slug")
        parent_id = None
        if parent_slug:
            parent_id = resolve(parent_slug)
            if parent_id is None:
                return None
        new_id = str(uuid.uuid4())
        values.append((new_id, slug, entry["name"], parent_id))
        resolved[slug] = new_id
        del pending[slug]
        return new_id

    values: list[tuple[str, str, str, str | None]] = []
    for slug in list(pending):
        resolve(slug)

    if not values:
        return 0

    rows = ",\n  ".join(
        f"({sql_literal(fid)}, {sql_literal(slug)}, {sql_literal(name)}, "
        f"{sql_literal(parent) if parent else 'null'})"
        for fid, slug, name, parent in values
    )
    db(
        f"""
        insert into dish_families (id, slug, name, parent_id)
        values
          {rows}
        on conflict (id) do nothing;
        """
    )
    print(f"[classify] created {len(values)} families")
    return len(values)


def classify(pool: list[dict]) -> tuple[dict[str, list[str]], int]:
    """slug → the family slugs it should carry."""
    dishes = {
        r["slug"]: r
        for r in db_rows(
            """
            select slug, id from dishes where created_by = 'wikidata-derived'
            """
        )
    }

    mappings = all_mappings()
    assignment: dict[str, list[str]] = {}
    unmapped_classes: Counter[str] = Counter()
    chosen_classes: Counter[str] = Counter()
    no_class = 0

    for row in pool:
        slug = slugify(row.get("article") or row.get("label") or "")
        if slug not in dishes:
            continue

        classes = list(row.get("instance_of") or []) + list(
            row.get("subclass_of") or []
        )
        best_qid = None
        best_rank = -1
        for qid in classes:
            if qid in IGNORED_CLASSES:
                continue
            if qid not in mappings:
                unmapped_classes[qid] += 1
                continue
            rank = CLASS_RANK.get(qid, 100 if qid in TIER2_AND_3 else 60)
            # `>` not `>=`, so the FIRST class of equal rank wins —
            # instance_of before subclass_of, which is the more
            # specific assertion of the two.
            if rank > best_rank:
                best_rank = rank
                best_qid = qid

        if best_qid is None:
            no_class += 1
            continue
        assignment[slug] = [mappings[best_qid][0]]
        chosen_classes[best_qid] += 1

    return assignment, no_class, chosen_classes


def attach(assignment: dict[str, list[str]]) -> int:
    """Attach the families to the dishes."""
    dishes = {
        r["slug"]: r
        for r in db_rows(
            """
            select slug, id from dishes where created_by = 'wikidata-derived'
            """
        )
    }
    families = {
        r["slug"]: r
        for r in db_rows("select id, slug from dish_families")
    }

    values: list[str] = []
    for slug, family_slugs in assignment.items():
        dish = dishes.get(slug)
        if not dish:
            continue
        for family_slug in family_slugs:
            family = families.get(family_slug)
            if not family:
                continue
            values.append(
                f"({sql_literal(str(uuid.uuid4()))}, {sql_literal(dish['id'])}, "
                f"{sql_literal(family['id'])}, true, now(), "
                f"{sql_literal('wikidata-class')}, {sql_literal('active')})"
            )

    if not values:
        print("[classify] no assignments to attach")
        return 0

    # Chunked so no single statement is enormous.
    chunk = 400
    for i in range(0, len(values), chunk):
        part = values[i : i + chunk]
        rows = ",\n  ".join(part)
        db(
            f"""
            insert into dish_dish_families
              (id, dish_id, value_id, is_primary, created_at,
               provenance, status)
            values
              {rows}
            on conflict (dish_id) do nothing;
            """
        )
    print(f"[classify] attached {len(values)} family assignments")
    return len(values)


def main() -> int:
    global TARGET_DATABASE

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--database", default="gustale")
    args = parser.parse_args()

    TARGET_DATABASE = args.database
    if TARGET_DATABASE != "gustale":
        print(f"[classify] the target database: {TARGET_DATABASE}")

    pool = json.loads(POOL_FILE.read_text())
    print(f"[classify] {len(pool)} Pool A dishes")

    existing = existing_families()
    needed = needed_new_families()
    print(
        f"[classify] {len(existing)} families exist, "
        f"{len(needed)} would be created"
    )

    assignment, no_class, chosen = classify(pool)
    total_families = sum(len(v) for v in assignment.values())
    print(
        f"[classify] {len(assignment)} dishes would be classified, "
        f"{total_families} assignments, {no_class} with no usable class"
    )
    print("[classify] the classes chosen:")
    mappings = all_mappings()
    for qid, n in chosen.most_common(20):
        mapping = mappings.get(qid)
        print(f"    {qid:<12} {n:>5}  {mapping[0] if mapping else '?'}")

    if not args.apply:
        print("[classify] dry run — re-run with --apply")
        return 0

    create_missing_families(needed, existing)
    attach(assignment)

    final = db_rows(
        """
        select
          (select count(*) from dish_families) as the_families,
          (select count(*) from dish_dish_families) as the_assignments,
          (select count(distinct dish_id) from dish_dish_families) as the_dishes
        """
    )
    print(f"[classify] the final state: {final[0] if final else '?'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
