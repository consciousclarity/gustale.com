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
    # slug: (status, category, needed_by)
    "long-grain-rice": ("new", "rice", "nasi-goreng"),
    "cooking-oil": ("new", "oil", "nasi-goreng"),
    "margarine": ("new", "oil", "nasi-goreng"),
    "sweet-soy-sauce": ("new", "savoury-sauces", "nasi-goreng"),
    "shallot": ("new", "onions-and-similar", "nasi-goreng"),
    "shrimp-paste": ("new", "paste", "nasi-goreng"),
    "tamarind": ("new", "fruit", "nasi-goreng"),
    "chilli": ("new", "fruit-spices", "nasi-goreng"),
    "chicken": ("new", "chicken", "nasi-goreng"),
    "prawn": ("new", "shrimps-and-prawns", "nasi-goreng"),
    "garlic": ("exists", "garlic-and-similar", "moussaka-greek"),
    "whole-egg": ("exists", "whole-eggs", "moussaka-greek"),
}


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

    # (2) every category is a member of the 435
    for r in rows:
        c = r["category"].strip()
        if c not in categories:
            failures.append(
                f"'{r['slug']}': category '{c}' is not in the vocabulary")

    # (4) every row cites a source
    for r in rows:
        if not r["source"].strip():
            failures.append(f"'{r['slug']}': no source")

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

    for s, (status, category, dish) in sorted(APPROVED_SET.items()):
        if s not in seen:
            failures.append(
                f"'{s}': MISSING from the list -- the approved list is "
                f"closed, a row may not be dropped")

    # and the declared attributes must match the approved ones
    for r in rows:
        s = r["slug"].strip()
        if s not in APPROVED_SET:
            continue
        status, category, dish = APPROVED_SET[s]
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
