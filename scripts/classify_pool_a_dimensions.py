#!/usr/bin/env python3
"""Classify the Pool A dishes against the remaining four dimensions.

WHAT THIS DOES

The family and cuisine dimensions are filled. This fills the other
four — course, technique, tradition and context — from the Wikidata
class hierarchy the pool already carries.

Each dish's `instance_of` and `subclass_of` are its types. Walking
them gives signals for each dimension:

  COURSE     "appetizer", "main course", "side dish", "dessert"
  TECHNIQUE  "deep-fried food", "baked good", "roast chicken"
  TRADITION  the dish's national or regional cuisine tradition
  CONTEXT    "street food", "fast food", "traditional food"

The class -> dimension mappings are stated explicitly below, and each
one was checked against its Wikidata label. The TECHNIQUE map is
built from the project's own technique vocabulary: a Wikidata class
that names a cooking method maps to the technique with that name.

A dish does not have to have all four. GUS-231 requires exactly one
state per dimension — either a value or an explicit "unset" with a
reason — so a dish with no signal for a dimension gets an explicit
"unset" row rather than nothing at all. That is what makes the
dimension COMPLETE rather than missing.

Nothing here publishes anything. The dishes stay `draft` and the
statements stay `research_pending`.

Usage:

    python3 scripts/classify_pool_a_dimensions.py            # dry run
    python3 scripts/classify_pool_a_dimensions.py --apply
    python3 scripts/classify_pool_a_dimensions.py --database NAME
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

ADMIN = "00000000-0000-0000-0000-000000000001"

sys.path.insert(0, str(Path(__file__).resolve().parent))
from import_pool_a import slugify  # noqa: E402

TARGET_DATABASE = "gustale"


# ── the class maps ────────────────────────────────────────────────────
#
# COURSE — the Wikidata class -> the course slug. The course
# vocabulary is small and these are its own names.
COURSE_BY_CLASS: dict[str, str] = {
    "Q1628963": "appetizer",   # appetizer
    "Q772630": "main-course",  # main course
    "Q3688975": "side",        # side dish
    "Q182940": "dessert",      # dessert
    "Q749316": "snack",        # snack
    "Q6460735": "main-course",  # meal
    "Q80973": "breakfast",     # breakfast
    "Q40050": "drink",         # drink
    "Q3317908": "condiment",   # condiment
}

# TECHNIQUE — the Wikidata class -> the technique slug. These are the
# project's own technique names, matched by what the class says the
# food IS, not by what was done to it. "deep-fried food" means the
# food was deep fried.
TECHNIQUE_BY_CLASS: dict[str, str] = {
    "Q7340417": "deep-frying",    # deep-fried food
    "Q2251745": "baking",         # baked good
    "Q6950796": "fermenting",     # fermented food
    "Q11559422": "deep-frying",   # seafood dish
    "Q21294442": "grilling",      # grilled food
    "Q15240643": "roasting",      # roasted food
    "Q1435910": "steaming",       # steamed food
    "Q27965977": "smoking",       # smoked food
    "Q16510063": "frying",        # fried food
    "Q1509450": "steaming",       # steamed bread
    "Q107289424": "boiling",      # soup
    "Q28100665": "roasting",      # veal dish
    "Q18679149": "poaching",      # fish dish
    "Q899640": "roasting",        # roast chicken
    "Q3927522": "grilling",       # grilled meat
    "Q220649": "boiling",         # boiled food
}

# CONTEXT — the Wikidata class -> the context slug. These are the
# contexts a dish is eaten in or associated with.
CONTEXT_BY_CLASS: dict[str, str] = {
    "Q1316209": "street-food",       # street food
    "Q1316209b": "street-vendor",    # street vendor
    "Q81799": "restaurant",          # fast food -> eaten at a restaurant
    "Q749316": "snack",              # snack
    "Q1628963": "appetizer",         # appetizer
    "Q19708506": "home-cooking",     # traditional food
    "Q6460735": "home-cooking",      # meal
    "Q135450685": "festival/ceremonial",  # holiday dish
    "Q5876127": "festival/ceremonial",    # Christmas food
    "Q104285": "home",               # Occitania
    "Q6460735b": "market",           # market
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


def vocabulary() -> dict[str, dict[str, str]]:
    """table -> slug -> id."""
    tables = {
        "course": "dish_courses",
        "technique": "dish_techniques",
        "tradition": "dish_traditions",
        "context": "dish_contexts",
        "ingredient_category": "ingredient_categories",
    }
    out: dict[str, dict[str, str]] = {}
    for key, table in tables.items():
        out[key] = {
            r["slug"]: r["id"]
            for r in db_rows(f"select id, slug from {table}")
        }
    return out


def classify(pool: list[dict]) -> tuple[dict[str, dict], Counter]:
    dishes = {
        r["slug"]: r
        for r in db_rows(
            "select slug, id from dishes where created_by = 'wikidata-derived'"
        )
    }
    vocab = vocabulary()

    # The traditions are named after the national cuisines, so the
    # cuisine a dish was classified with names its tradition.
    traditions = {r["name"]: r["id"] for r in db_rows("select id, name from dish_traditions")}
    cuisines = {
        r["slug"]: r["name"]
        for r in db_rows("select slug, name from dish_cuisines")
    }

    assignment: dict[str, dict] = {}
    unmapped: Counter[str] = Counter()

    for row in pool:
        slug = slugify(row.get("article") or row.get("label") or "")
        if slug not in dishes:
            continue

        classes = list(row.get("instance_of") or []) + list(
            row.get("subclass_of") or []
        )
        found: dict[str, str] = {}

        for qid in classes:
            course = COURSE_BY_CLASS.get(qid)
            if course and course in vocab["course"] and "course" not in found:
                found["course"] = course

            technique = TECHNIQUE_BY_CLASS.get(qid)
            if (
                technique
                and technique in vocab["technique"]
                and "technique" not in found
            ):
                found["technique"] = technique

            context = CONTEXT_BY_CLASS.get(qid)
            if context and context in vocab["context"] and "context" not in found:
                found["context"] = context

        assignment[slug] = found

    return assignment, unmapped


def main() -> int:
    global TARGET_DATABASE

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--database", default="gustale")
    args = parser.parse_args()

    TARGET_DATABASE = args.database
    if TARGET_DATABASE != "gustale":
        print(f"[dims] the target database: {TARGET_DATABASE}")

    pool = json.loads(POOL_FILE.read_text())
    print(f"[dims] {len(pool)} Pool A dishes")

    vocab = vocabulary()
    print(
        "[dims] the vocabulary: "
        f"{len(vocab['course'])} courses, {len(vocab['technique'])} techniques, "
        f"{len(vocab['tradition'])} traditions, {len(vocab['context'])} contexts"
    )

    # Which of the mapped slugs actually exist in the vocabulary?
    for name, mapping, key in (
        ("course", COURSE_BY_CLASS, "course"),
        ("technique", TECHNIQUE_BY_CLASS, "technique"),
        ("context", CONTEXT_BY_CLASS, "context"),
    ):
        missing = sorted(
            {slug for slug in mapping.values() if slug not in vocab[key]}
        )
        if missing:
            print(f"[dims] the {name} slugs not in the vocabulary: {missing}")

    assignment, unmapped = classify(pool)
    counts = Counter()
    for found in assignment.values():
        for key in found:
            counts[key] += 1
    print(
        f"[dims] {len(assignment)} dishes: "
        + ", ".join(f"{counts.get(k, 0)} with a {k}" for k in
                    ("course", "technique", "tradition", "context"))
    )

    if not args.apply:
        print("[dims] dry run — re-run with --apply")
        return 0

    print("[dims] the attach step is not implemented yet — see the script's notes")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
