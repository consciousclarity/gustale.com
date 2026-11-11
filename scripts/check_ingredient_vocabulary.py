#!/usr/bin/env python3
"""Check the Stage A ingredient vocabulary against the 435-row category list.

This is the CHECK that the vocabulary must pass. It is a script, not
an LLM: it reads the CSV and the vocabulary and reports the facts.

Usage:
    check_ingredient_vocabulary.py <csv> [--db <database>]

WHAT IT ENFORCES, AND WHY EACH RULE IS THERE
---------------------------------------------

1. Every slug is unique. Two rows for one ingredient would mean the
   rating attaches to a half-empty ingredient.

2. Every category is a MEMBER of the 435-row vocabulary. Not "in the
   family" -- the exact slug. A category that does not exist is the
   moussaka pantry list's original failure mode.

3. The list is CLOSED IN BOTH DIRECTIONS. A row not in the approved
   list may not appear, and a row in it may not be missing. Without
   this, deleting a row or adding one silently passes -- which is
   exactly the mutation that survived the moussaka checker.

4. Every row cites a source.

5. Every row marked `exists` IS already an ingredient row in the
   database, and every row marked `new` is NOT. A row labelled `new`
   that already exists would be inserted twice; a row labelled
   `exists` that does not would be silently created as a duplicate of
   a row the moussaka seed already made.

6. The categories that have NO CLEAN MATCH in the vocabulary are
   declared. `tamarind` and `shrimp-paste` have no exact FoodOn row;
   the vocabulary additions list is where an exact class would go, and
   until it is added these two carry a declared generic category. A
   generic category that is not DECLARED is a hidden guess, so this
   rule refuses it.

7. The reused rows are not duplicated: `garlic` and `whole-egg` appear
   once, and they are the same slugs the moussaka uses.

Rule 6 is the one that keeps the "real but wrong" mutation from
surviving: a generic category is only allowed where the document says
it is, and the document says which two.
"""

import argparse
import csv
import os
import subprocess
import sys

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CONTAINER = "gustale-test-postgres"

# The rows whose category is a DECLARED generic stand-in, because the
# 435-row vocabulary has no exact class for them. The owner reviews
# these; see docs/STAGE-A-INGREDIENT-VOCABULARY.md section 1.3.
#
# A generic category anywhere ELSE is a failure: it would be a guess
# that the document does not admit to.
DECLARED_GENERIC = {
    "tamarind": "fruit",
    "shrimp-paste": "paste",
    # `oil` is a generic catch-all in the 435 (it covers every edible
    # oil). `cooking-oil` and `margarine` are BOTH filed under it
    # because the vocabulary has no row for a specific cooking oil --
    # and margarine is a butter-oil spread, not an oil, so `oil` is
    # the nearest the vocabulary offers. The row's own name carries
    # the distinction.
    "cooking-oil": "oil",
    "margarine": "oil",
}

# The slugs that MUST be reused rather than duplicated, and the dish
# that already uses them.
MUST_BE_REUSED = {
    "garlic": "moussaka-greek",
    "whole-egg": "moussaka-greek",
}


def q(db, sql):
    r = subprocess.run(
        ["docker", "exec", "-u", "postgres", CONTAINER,
         "psql", "-U", "postgres", "-d", db, "-tAc", sql],
        capture_output=True, text=True, timeout=120)
    if r.returncode != 0:
        raise RuntimeError(r.stderr.strip()[:300])
    return r.stdout


# THE APPROVED LIST. The CSV may not add a row to it and may not drop
# one from it: this is the list the owner reviews, and a checker that
# only validates the rows it is given accepts a list that has quietly
# gained or lost an ingredient.
#
# The `exists` rows are the two the moussaka already has and this task
# REUSES. The `new` rows are the ten the owner is being asked to
# approve.
APPROVED_SET = {
    # slug: (status, category, needed_by, hint, cost_weight)
    #
    # The last two columns are the OWNER'S Gate A decisions of
    # 2026-11-10, and they are enforced here so a later edit cannot
    # quietly reverse one:
    #
    #   - `shrimp-paste` hint=yes. It is what distinguishes nasi
    #     goreng from Chinese fried rice.
    #   - `tamarind` and `chilli` and `shallot` and `garlic` are
    #     cost_weight=minor -- a cap on the price score, so a dear
    #     spice cannot make a dish Hard.
    #   - `cooking-oil` and `margarine` are the TWO FORMS of ONE
    #     required line, and both are hint=no.
    #   - `vegetables` is the one generic line: no category, no
    #     source, optional.
    "long-grain-rice": ("new", "rice", "nasi-goreng", "yes", "major"),
    "cooking-oil": ("new", "oil", "nasi-goreng", "no", "major"),
    "margarine": ("new", "oil", "nasi-goreng", "no", "major"),
    "sweet-soy-sauce": ("new", "savoury-sauces", "nasi-goreng", "yes", "major"),
    "shallot": ("new", "onions-and-similar", "nasi-goreng", "no", "minor"),
    "shrimp-paste": ("new", "paste", "nasi-goreng", "yes", "major"),
    "tamarind": ("new", "fruit", "nasi-goreng", "no", "minor"),
    "chilli": ("new", "fruit-spices", "nasi-goreng", "no", "minor"),
    "chicken": ("new", "chicken", "nasi-goreng", "no", "major"),
    "prawn": ("new", "shrimps-and-prawns", "nasi-goreng", "no", "major"),
    "garlic": ("exists", "garlic-and-similar", "moussaka-greek", "no", "minor"),
    "whole-egg": ("exists", "whole-eggs", "moussaka-greek", "no", "major"),
    # The generic line. No category, no source -- so it is EXEMPT from
    # the category and source rules, and the rules below say so
    # explicitly rather than by accident.
    "vegetables": ("new", "", "nasi-goreng", "no", "minor"),
}

# The rows that have NO category and NO source, by the owner's decision
# of 2026-11-10: "vegetables" is one optional line, accepted. It is
# the ONLY such row, and naming it here is what makes that a rule
# rather than an accident.
NO_CATEGORY_NO_SOURCE = {"vegetables"}

# The owner decided (2026-11-10): the oil/margarine line is REQUIRED --
# one line, two forms -- not optional. The contradiction between the
# old section 1.2 and section 2.2 is resolved in favour of REQUIRED,
# and this is the rule that enforces it.
OIL_MARGARINE_FORMS = {"cooking-oil", "margarine"}
OIL_MARGARINE_IS_REQUIRED = True

# The owner decided (2026-11-10): both recipes stay DRAFT until each
# has 2 INDEPENDENT sources. Wikipedia alone is not enough.
RECIPE_STATUS = "draft"
RECIPE_MIN_INDEPENDENT_SOURCES = 2


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("csv")
    ap.add_argument("--db", default="gustale_pantry")
    args = ap.parse_args()

    with open(args.csv, newline="", encoding="utf-8") as f:
        rows = list(csv.DictReader(f))

    categories = set()
    no_foodon = set()
    for line in q(args.db,
                  "SELECT slug, coalesce(foodon_id,'') FROM ingredient_categories").splitlines():
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

    # (1) unique slugs
    slugs = [r["slug"] for r in rows]
    for s in slugs:
        if slugs.count(s) > 1:
            failures.append(f"slug '{s}' appears more than once")

    # (2) every category is a member of the 435 -- except the rows the
    # owner explicitly accepted with NO category.
    for r in rows:
        slug = r["slug"].strip()
        c = r["category"].strip()
        if slug in NO_CATEGORY_NO_SOURCE:
            if c:
                failures.append(
                    f"'{slug}': is a no-category row, but it names the "
                    f"category '{c}'")
            continue
        if c not in categories:
            failures.append(
                f"'{slug}': category '{c}' is not in the vocabulary")

    # (4) every row cites a source -- except the rows the owner
    # explicitly accepted with NO source. A row with no source is not
    # an error if the owner named it; it is an error if it is merely
    # forgotten, which is why the exemption is a named set.
    for r in rows:
        slug = r["slug"].strip()
        if slug in NO_CATEGORY_NO_SOURCE:
            if r["source"].strip():
                failures.append(
                    f"'{slug}': is a no-source row, but it names the "
                    f"source '{r['source'].strip()}'")
            continue
        if not r["source"].strip():
            failures.append(f"'{slug}': no source")

    # (5) the `exists` / `new` label must match reality
    for r in rows:
        s = r["slug"].strip()
        state = r["status"].strip()
        if state == "exists" and s not in existing_ing:
            failures.append(
                f"'{s}': marked 'exists' but there is no ingredient row for it")
        elif state == "new" and s in existing_ing:
            failures.append(
                f"'{s}': marked 'new' but an ingredient row already exists")
        elif state not in ("exists", "new"):
            failures.append(f"'{s}': status '{state}' is not 'exists' or 'new'")

    # (6) a generic category is only allowed where it is declared
    generic_rows = {c for c in categories if not c}
    for r in rows:
        s = r["slug"].strip()
        c = r["category"].strip()
        if s in NO_CATEGORY_NO_SOURCE:
            continue
        if s in DECLARED_GENERIC:
            if c != DECLARED_GENERIC[s]:
                failures.append(
                    f"'{s}': the declared generic category is "
                    f"'{DECLARED_GENERIC[s]}', not '{c}'")
        else:
            # A category that is a generic catch-all -- one that could
            # stand in for many different ingredients -- is only
            # acceptable if the document declares it.
            if c in GENERIC_CATEGORIES and s not in DECLARED_GENERIC:
                failures.append(
                    f"'{s}': the generic category '{c}' is not declared for "
                    f"this row -- see docs/STAGE-A-INGREDIENT-VOCABULARY.md")

    # (7) the reused rows are the moussaka's slugs
    for s, dish in MUST_BE_REUSED.items():
        if s not in slugs:
            failures.append(
                f"'{s}': must be reused from {dish}, but it is missing")
        elif s not in existing_ing:
            failures.append(
                f"'{s}': must be reused from {dish}, but no ingredient row "
                f"exists for it")

    # (8) the owner's Gate A decisions: is_key and cost_weight must
    # match the approved values exactly. These are the decisions the
    # owner made on 2026-11-10, and a later edit must not be able to
    # reverse one silently.
    for r in rows:
        slug = r["slug"].strip()
        if slug not in APPROVED_SET:
            continue
        _, _, _, is_key, cost_weight = APPROVED_SET[slug]
        # The column is named for what it IS: a recipe-line hint.
        # `is_key` belongs to recipe_ingredients and is never stored on
        # an ingredient, so the ingredient-shaped list must not carry
        # that name -- it invites exactly the wrong write.
        if "is_key" in r:
            failures.append(
                f"'{slug}': the column 'is_key' is present -- is_key is a "
                f"RECIPE-LINE property (recipe_ingredients.is_key), never "
                f"an ingredient one; the column is named "
                f"'typically_defines_the_dish_hint'")
        got_key = r.get("typically_defines_the_dish_hint", "").strip()
        got_weight = r.get("cost_weight", "").strip()
        if got_key != is_key:
            failures.append(
                f"'{slug}': is_key is '{got_key}', the owner's decision "
                f"is '{is_key}'")
        if got_weight != cost_weight:
            failures.append(
                f"'{slug}': cost_weight is '{got_weight}', the owner's "
                f"decision is '{cost_weight}'")
        if got_key not in ("yes", "no"):
            failures.append(
                f"'{slug}': is_key '{got_key}' is not 'yes' or 'no'")
        if got_weight not in ("major", "minor"):
            failures.append(
                f"'{slug}': cost_weight '{got_weight}' is not 'major' or "
                f"'minor'")

    # (9) the oil/margarine line is REQUIRED -- one line, two forms.
    # The old document contradicted itself: section 1.2 called it
    # optional, section 2.2 called it required. The owner resolved it
    # as REQUIRED, and this is the rule that holds that resolution.
    if OIL_MARGARINE_IS_REQUIRED:
        all_slugs = {r["slug"].strip() for r in rows}
        present = OIL_MARGARINE_FORMS & all_slugs
        if present != OIL_MARGARINE_FORMS:
            missing = OIL_MARGARINE_FORMS - present
            failures.append(
                f"the oil/margarine line: both forms must be present as "
                f"the forms of ONE required line, missing {sorted(missing)}")
        # And neither form may stand alone: the owner decided ONE
        # line with two forms, and a row that carries no form of its
        # own is a row the rating cannot place.
        for slug in OIL_MARGARINE_FORMS:
            for r in rows:
                if r["slug"].strip() != slug:
                    continue
                forms = r.get("forms", "").strip()
                if not forms:
                    failures.append(
                        f"'{slug}': is a form of the oil/margarine line, "
                        f"so it must name its form")

    # (10) the generic line is optional, and must not be a key
    # ingredient -- it is not a single ingredient at all.
    for r in rows:
        slug = r["slug"].strip()
        if slug not in NO_CATEGORY_NO_SOURCE:
            continue
        if r.get("typically_defines_the_dish_hint", "").strip() == "yes":
            failures.append(
                f"'{slug}': is a generic line, so it cannot be a key "
                f"ingredient")

    # (3) the list is EXACTLY the approved list -- closed in both
    # directions. A row may not be added to it and a row may not be
    # dropped from it. The moussaka checker's first version only
    # validated the rows it was given, and a DELETED row passed
    # silently; that was the mutation that had to be fixed there, and
    # it is fixed here from the start.
    seen = set()
    for r in rows:
        s = r["slug"].strip()
        if s in seen:
            continue
        seen.add(s)
        if s not in APPROVED_SET:
            failures.append(
                f"'{s}': NOT in the approved list -- a row may not be "
                f"added to the list without the owner's review")

    for s, (status, category, dish, is_key, cost_weight) in sorted(APPROVED_SET.items()):
        if s not in seen:
            failures.append(
                f"'{s}': MISSING from the list -- the approved list is "
                f"closed, a row may not be dropped")

    # and the declared attributes must match the approved ones
    for r in rows:
        s = r["slug"].strip()
        if s not in APPROVED_SET:
            continue
        status, category, dish, _, _ = APPROVED_SET[s]
        if r["category"].strip() != category:
            failures.append(
                f"'{s}': category is '{r['category'].strip()}', the "
                f"approved category is '{category}'")
        if r["status"].strip() != status:
            failures.append(
                f"'{s}': status is '{r['status'].strip()}', the approved "
                f"status is '{status}'")
        if r["needed_by"].strip() != dish:
            failures.append(
                f"'{s}': needed_by is '{r['needed_by'].strip()}', the "
                f"approved dish is '{dish}'")

    if failures:
        print(f"  FAILED: {len(failures)} problem(s)")
        for f in failures:
            print(f"    - {f}")
        return 1

    print("  OK: every category is a member of the vocabulary, every row "
          "cites a source, and the exists/new labels match the database")
    return 0


# The categories that are a generic catch-all in the 435-row
# vocabulary -- ones that could stand in for many different
# ingredients. A row may use one of these ONLY if
# DECLARED_GENERIC says so.
GENERIC_CATEGORIES = {
    "fruit",
    "vegetables",
    "poultry",
    "oil",
    "sauce",
    "paste",
    "meat",
    "seafood",
    "fermented",
    "spices",
    "herbs",
}


if __name__ == "__main__":
    sys.exit(main())
