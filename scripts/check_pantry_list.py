#!/usr/bin/env python3
"""Check the pantry list against the 435-row category vocabulary.

This is the CHECK that the pantry list must pass. It is a script, not
an LLM: it reads the CSV and the vocabulary and reports the facts.

Usage:
    check_pantry_list.py <csv> [--db <database>]
"""

import argparse
import csv
import os
import subprocess
import sys

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CONTAINER = "gustale-test-postgres"


def q(db, sql):
    r = subprocess.run(
        ["docker", "exec", "-u", "postgres", CONTAINER,
         "psql", "-U", "postgres", "-d", db, "-tAc", sql],
        capture_output=True, text=True, timeout=120)
    if r.returncode != 0:
        raise RuntimeError(r.stderr.strip()[:300])
    return r.stdout


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("csv")
    ap.add_argument("--db", default="gustale_pantry_check")
    args = ap.parse_args()

    with open(args.csv, newline="", encoding="utf-8") as f:
        rows = list(csv.DictReader(f))

    categories = set()
    no_foodon = set()
    for line in q(args.db, "SELECT slug, coalesce(foodon_id,'') FROM ingredient_categories").splitlines():
        if "|" in line:
            s, fo = line.split("|", 1)
            categories.add(s.strip())
            if not fo.strip():
                no_foodon.add(s.strip())

    existing_ing = set()
    for line in q(args.db, "SELECT slug FROM ingredients").splitlines():
        if line.strip():
            existing_ing.add(line.strip())

    failures = []
    print(f"  {len(rows)} rows, {len(categories)} categories in the vocabulary")

    slugs = [r["slug"] for r in rows]
    for s in slugs:
        if slugs.count(s) > 1:
            failures.append(f"slug '{s}' appears more than once")

    for r in rows:
        slug, cat = r["slug"], r["category"]
        if cat not in categories:
            failures.append(f"'{slug}': category '{cat}' is NOT in the vocabulary")
        elif cat in no_foodon:
            print(f"  NOTE  '{slug}': category '{cat}' has NO FoodOn id (a legacy row)")
        if slug in categories:
            failures.append(f"'{slug}': collides with a category slug")
        if not slug.replace("-", "").replace(" ", "").isalnum():
            failures.append(f"'{slug}': not English-singular-lowercase-hyphenated")
        if slug != slug.lower():
            failures.append(f"'{slug}': not lowercase")
        if r.get("is_optional", "false") not in ("true", "false"):
            failures.append(f"'{slug}': is_optional must be true or false")
        if r.get("needed_by") != "moussaka-greek":
            failures.append(f"'{slug}': needed_by must be moussaka-greek")

    reused = [r["slug"] for r in rows if r["slug"] in existing_ing]
    new = [r["slug"] for r in rows if r["slug"] not in existing_ing]
    print(f"  reused existing ingredient rows: {len(reused)} -> {reused}")
    print(f"  new ingredient rows: {len(new)}")
    print(f"  optional rows: {sum(1 for r in rows if r.get('is_optional') == 'true')}")

    # Every row must carry a source, and every source must be a real
    # thing in the repository.
    valid_sources = {
        "seed-moussaka.dish_ingredients",
        "seed-moussaka.dish_preparations",
        "seed-moussaka.dishes.long_description",
        "seed-moussaka.dishes.long_description.regional-variants",
        "backfill-plan-s4",
    }
    for r in rows:
        src = r.get("source", "")
        if not src:
            failures.append(f"'{r['slug']}': no source")
        elif src not in valid_sources:
            failures.append(f"'{r['slug']}': unknown source '{src}'")

    # A row that claims a SEED source must actually be named in the
    # seed.
    #
    # The rule this enforces is the one the owner's review produced:
    # an ingredient named by NEITHER the seed NOR the backfill plan's
    # ingredient-count sentence cannot be a REQUIRED ingredient of the
    # dish -- it must be optional. Everything else may be required.
    seed = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                        "packages", "db", "seed-moussaka.sql")
    seed_text = ""
    if os.path.isfile(seed):
        seed_text = open(seed, encoding="utf-8", errors="ignore").read().lower()
    plan = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                        "docs", "RECIPES-INGREDIENT-BACKFILL-PLAN.md")
    plan_text = ""
    if os.path.isfile(plan):
        plan_text = open(plan, encoding="utf-8", errors="ignore").read().lower()
    for r in rows:
        if not seed_text:
            break
        slug = r["slug"]
        src = r.get("source", "")
        # The seed's own words for the material, not the slug.
        probe = {"whole-egg": "egg", "whole-milk": "milk", "wheat-flour": "flour",
                 "plain-butter": "butter", "table-salt": "salt",
                 "olive-oil": "olive oil", "black-pepper": "pepper",
                 "bay-leaf": "bay leaf", "beef-mince": "beef",
                 "red-wine": "wine", "tomato-paste": "tomato paste",
                 "parsley": "parsley", "carrot": "carrot"}.get(slug, slug)
        if src == "seed-moussaka.dishes.long_description.regional-variants":
            # INFERRED from the seed's own statement that regional
            # variants exist. The seed does NOT name the ingredient, so
            # it must be optional -- that is the rule.
            if probe in seed_text:
                # It IS named -- then the stronger source is available.
                failures.append(
                    f"'{slug}': '{probe}' IS named in the seed, so its source "
                    f"should be a seed source, not the regional-variants one")
            elif r.get("is_optional") != "true":
                failures.append(
                    f"'{slug}': inferred from the regional variants and not "
                    f"named in the seed, so it must be optional")
            continue
        if src.startswith("seed-moussaka"):
            # It claims the seed as its source, so the seed must name it.
            if probe not in seed_text:
                failures.append(
                    f"'{slug}': its source is the seed, but '{probe}' is not in the seed")
            continue
        # A plan-sourced row. The plan's ingredient-count sentence must
        # name it -- otherwise nothing names it and it must be optional.
        if probe not in plan_text and r.get("is_optional") != "true":
            failures.append(
                f"'{slug}': '{probe}' is named by neither the seed nor the "
                f"backfill plan, so it must be optional")

    # ── The material's CLASS, not just "is it a real category?" ──────
    # A category can be a real vocabulary row and still be the WRONG
    # class for the material. The owner's review found exactly that:
    # kefalotyri was in the brined/feta class, and it is a hard cheese.
    #
    # This table is the assertion, and the script enforces it.
    EXPECTED_CLASS = {
        "kefalotyri": "ripened-cheese",
        "plain-butter": "butter",
        "whole-milk": "milk",
        "whole-egg": "whole-eggs",
        "wheat-flour": "cereal-and-cereal-like-flours",
        "table-salt": "seasonings",
        "eggplant": "solanacea",
        "lamb-mince": "mammals-meat",
        "beef-mince": "beef",
        "tomato": "other-fruiting-vegetables",
        "bechamel": "savoury-sauces",
        "onion": "onions-and-similar",
        "garlic": "garlic-and-similar",
        "potato": "potatoes-and-similar",
        "carrot": "carrots-and-similar",
        "olive-oil": "vegetable-fats-and-oils-edible",
        "black-pepper": "fruit-spices",
        "allspice": "fruit-spices",
        "bay-leaf": "dried-herbs",
        "nutmeg": "seed-spices",
        "cinnamon": "bark-spices",
        "parsley": "aromatic-herbs",
        "tomato-paste": "processed-tomato-products",
        "red-wine": "beverage",
    }
    for r in rows:
        want = EXPECTED_CLASS.get(r["slug"])
        if want and r["category"] != want:
            failures.append(
                f"'{r['slug']}': category must be '{want}', not '{r['category']}'")

    # ── An ALTERNATIVE is optional ───────────────────────────────────
    # beef-mince is not an addition to the dish; it REPLACES the lamb.
    # So it must be optional, even though the seed names it.
    ALTERNATIVES = {"beef-mince"}
    for r in rows:
        if r["slug"] in ALTERNATIVES and r.get("is_optional") != "true":
            failures.append(
                f"'{r['slug']}': it is an ALTERNATIVE to another ingredient "
                f"(not an addition), so it must be optional")

    if failures:
        print("\n  FAILURES:")
        for f in failures:
            print("   -", f)
        return 1
    print("\n  ALL CHECKS PASS")
    return 0


if __name__ == "__main__":
    sys.exit(main())
