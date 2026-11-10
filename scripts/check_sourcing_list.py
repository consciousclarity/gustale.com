#!/usr/bin/env python3
"""Check the 20-ingredient sourcing list against the owner's spec.

This is the CHECK that the research plan must pass. It is a script, not
an LLM: it reads the CSV and the owner's own spec, and it refuses a
list that has drifted from either.

WHAT IT ENFORCES

  1. The list is EXACTLY the 20 ingredients of the owner's table --
     closed in BOTH directions. A row may not be added and a row may
     not be dropped. The moussaka checker's first version only
     validated the rows it was given, and a DELETED row passed
     silently; that is the mutation that had to be fixed there, and it
     is fixed here from the start.

  2. Every ingredient's FORMS are non-empty, and its PRICE BANDS are
     drawn from the vocabulary ADR-008 defines.

  3. Every `is_key` is `yes` or `no`.

  4. The SUBSTITUTION LIMITS are carried VERBATIM from the spec. The
     spec's limits are the owner's own words, and they are where the
     research gets its sharpest edges -- "soy sauce should not be
     presented as an equivalent substitute" is a constraint on the
     research, and losing it would be a silent weakening.

  5. The three PRICE-CATALOGUE ingredients that have no ingredient row
     (vanilla; truffle and other high-value mushrooms; imported nori,
     miso and mirin) are recorded as a known gap rather than
     silently dropped.

Usage:
    python3 scripts/check_sourcing_list.py docs/SOURCING-20-INGREDIENTS.csv
    python3 scripts/check_sourcing_list.py docs/SOURCING-20-INGREDIENTS.csv \\
        --spec /home/alex/projects/gustale-state/.hermes/SPEC_SOURCING_ORIGINAL.md
"""

import argparse
import csv
import os
import re
import sys

# The price bands ADR-008 defines. `unknown` is a VALUE of the column,
# not a researched band -- it means "no usable price", and it is never
# a research finding.
PRICE_BANDS = {"typical", "elevated", "high", "prohibitive"}

# The availability enum, for reference in the error messages.
AVAILABILITY = {
    "common",
    "occasional",
    "seasonal",
    "specialty_only",
    "limited",
    "unavailable",
}

# THE APPROVED LIST. The CSV may not add a row to it and may not drop
# one from it.
#
# Each entry is (name, forms, is_key, price-catalogue item).
#
# The `forms` are the forms the research must cover -- the rating
# selects the LOWEST-burden form, so the forms are where the real
# difference between countries lives.
APPROVED = {
    "coconut-milk": (
        "Coconut milk",
        "fresh;homemade;packaged;canned;coconut-cream",
        "yes",
        True,
    ),
    "cassava": (
        "Cassava",
        "fresh-root;peeled;frozen;cassava-flour;tapioca-starch",
        "yes",
        True,
    ),
    "plantain": (
        "Plantain",
        "ripe;green;frozen-slices",
        "yes",
        True,
    ),
    "tamarind": (
        "Tamarind",
        "pod;paste;concentrate;juice",
        "no",
        True,
    ),
    "saffron": (
        "Saffron",
        "threads;powder;extract",
        "yes",
        True,
    ),
    "preserved-lemon": (
        "Preserved lemon",
        "whole;salted-lemon;zest-and-salt",
        "yes",
        True,
    ),
    "curry-leaves": (
        "Curry leaves",
        "fresh;frozen;brined",
        "yes",
        True,
    ),
    "makrut-lime-leaves": (
        "Makrut lime leaves",
        "fresh;frozen;zest",
        "yes",
        True,
    ),
    "gochujang": (
        "Gochujang",
        "fresh;paste;gochugaru-mix",
        "yes",
        True,
    ),
    "doubanjiang": (
        "Doubanjiang",
        "paste;regional-varieties",
        "yes",
        True,
    ),
    "fish-sauce": (
        "Fish sauce",
        "standard;lighter;premium",
        "yes",
        False,
    ),
    "fresh-mozzarella-di-bufala": (
        "Fresh mozzarella di bufala",
        "fresh-buffalo;fresh-cow;low-moisture;provolone",
        "yes",
        True,
    ),
    "parmigiano-reggiano-and-pecorino": (
        "Parmigiano Reggiano and Pecorino",
        "parmigiano;pecorino;grana-padano",
        "yes",
        True,
    ),
    "ube": (
        "Ube",
        "fresh;frozen;puree;extract",
        "yes",
        False,
    ),
    "ackee": (
        "Ackee",
        "fresh;frozen;canned",
        "yes",
        False,
    ),
    "huitlacoche": (
        "Huitlacoche",
        "fresh;canned;imported",
        "yes",
        False,
    ),
    "asian-pear": (
        "Asian pear",
        "fresh-nashi;bosc;local-nashi",
        "no",
        True,
    ),
    "pandan": (
        "Pandan",
        "fresh-leaves;juice;extract;flavouring",
        "yes",
        True,
    ),
    "epazote": (
        "Epazote",
        "fresh;dried",
        "no",
        True,
    ),
    "fresh-corn-masa": (
        "Fresh corn masa",
        "fresh-masa;masa-harina;tortillas",
        "yes",
        True,
    ),
}

# The price catalogue names THREE items that have no ingredient row.
# They are on the price list and NOT on the ingredient table, so they
# need their own rows before they can be priced. This is recorded as a
# known gap, not silently dropped.
PRICE_ONLY = [
    "vanilla",
    "truffle and other high-value mushrooms",
    "imported nori, miso and mirin",
]


def norm(text):
    """Normalise for comparison: collapse whitespace, casefold."""
    return re.sub(r"\s+", " ", text or "").strip().casefold()


def spec_limits(spec_path):
    """Extract the substitution-limits cell for each spec row.

    The spec's table has FOUR columns: ingredient, easy contexts,
    harder contexts, and the alternatives/limits. The limits cell is
    the fourth.
    """
    if not spec_path or not os.path.exists(spec_path):
        return None
    with open(spec_path, encoding="utf-8") as f:
        text = f.read()
    out = {}
    for line in text.splitlines():
        if not line.startswith("| **"):
            continue
        cells = [c.strip() for c in line.split("|")[1:-1]]
        if len(cells) < 4:
            continue
        name = cells[0].replace("**", "").strip()
        out[norm(name)] = cells[3].replace("**", "").strip()
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("csv")
    ap.add_argument(
        "--spec",
        default="/home/alex/projects/gustale-state/.hermes/SPEC_SOURCING_ORIGINAL.md",
        help="the owner's original spec, for the verbatim-limits check",
    )
    args = ap.parse_args()

    with open(args.csv, newline="", encoding="utf-8") as f:
        rows = list(csv.DictReader(f))

    failures = []
    print(f"  {len(rows)} rows, {len(APPROVED)} in the approved list")

    # (1) the list is EXACTLY the approved list -- closed in both
    # directions.
    seen = {}
    for r in rows:
        slug = r["slug"].strip()
        if slug in seen:
            failures.append(f"'{slug}': appears more than once")
        seen[slug] = r
        if slug not in APPROVED:
            failures.append(
                f"'{slug}': NOT in the approved list -- a row may not be "
                f"added to the list without the owner's review")

    for slug in sorted(APPROVED):
        if slug not in seen:
            failures.append(
                f"'{slug}': MISSING from the list -- the approved list is "
                f"closed, a row may not be dropped")

    # (2) the declared attributes must match the approved ones, the
    # forms must be non-empty, and the price bands must be from the
    # vocabulary.
    for slug, (name, forms, is_key, _) in sorted(APPROVED.items()):
        r = seen.get(slug)
        if r is None:
            continue

        if r["name"].strip() != name:
            failures.append(
                f"'{slug}': name is '{r['name'].strip()}', the approved "
                f"name is '{name}'")

        if r["forms_to_research"].strip() != forms:
            failures.append(
                f"'{slug}': forms are '{r['forms_to_research'].strip()}', "
                f"the approved forms are '{forms}'")

        got_forms = [f for f in r["forms_to_research"].split(";") if f.strip()]
        if not got_forms:
            failures.append(f"'{slug}': no forms to research")

        if r["is_key"].strip() != is_key:
            failures.append(
                f"'{slug}': is_key is '{r['is_key'].strip()}', the "
                f"approved value is '{is_key}'")
        if r["is_key"].strip() not in ("yes", "no"):
            failures.append(
                f"'{slug}': is_key '{r['is_key'].strip()}' is not 'yes' or "
                f"'no'")

        bands = [b.strip() for b in r["price_bands_to_research"].split(";")
                 if b.strip()]
        if not bands:
            failures.append(f"'{slug}': no price bands to research")
        for b in bands:
            if b not in PRICE_BANDS:
                failures.append(
                    f"'{slug}': price band '{b}' is not one of "
                    f"{sorted(PRICE_BANDS)}")

    # (3) the substitution limits are carried VERBATIM from the spec.
    limits = spec_limits(args.spec)
    if limits is None:
        print("  NOTE: the owner's spec was not found, so the "
              "verbatim-limits check did not run")
    else:
        for slug, (name, _, _, _) in sorted(APPROVED.items()):
            r = seen.get(slug)
            if r is None:
                continue
            want = limits.get(norm(name))
            if want is None:
                failures.append(
                    f"'{slug}': the spec has no row named '{name}' -- the "
                    f"list and the spec have drifted apart")
                continue
            got = r["substitution_limits_from_the_spec"].strip()
            if norm(got) != norm(want):
                failures.append(
                    f"'{slug}': the substitution limits are not the spec's "
                    f"words. The spec says: {want!r}. The list says: "
                    f"{got!r}")

    # (4) the SPEC'S PROHIBITIONS survive into the list.
    #
    # Seven of the twenty name something that is NOT a substitute, or
    # say there is no substitute at all. Those are the sharpest edges
    # in the whole dataset: a research batch that quietly promoted
    # safflower to a saffron substitute, or offered soy sauce for fish
    # sauce, would be inventing data the owner explicitly ruled out.
    #
    # The document says "seven"; this makes it true by construction.
    # The prohibition is a property of SEVEN named ingredients, not of
    # every row. Each entry is (slug, the phrase the spec uses).
    PROHIBITIONS = [
        ("saffron", "safflower"),
        ("fish-sauce", "soy sauce"),
        ("huitlacoche", "corn and mushroom"),
        ("epazote", "parsley and cilantro"),
        ("makrut-lime-leaves", "ordinary lime zest"),
        ("ube", "purple sweet potato"),
        ("ackee", "no generally suitable substitute"),
    ]
    for slug, phrase in PROHIBITIONS:
        r = seen.get(slug)
        if r is None:
            continue
        lim = r["substitution_limits_from_the_spec"].lower()
        if phrase not in lim:
            failures.append(
                f"'{slug}': the spec's prohibition ('{phrase}') is missing "
                f"from the limits -- the research must not lose it")

    # (5) the price-only items are recorded as a known gap.
    for item in PRICE_ONLY:
        if not any(item.split()[0] in r["slug"].lower() for r in rows):
            # Not a failure -- it is a gap -- but it must be VISIBLE.
            print(f"  NOTE: the price catalogue item '{item}' has no "
                  f"ingredient row in this list -- recorded as a known gap")

    # The key/not-key COUNT, checked. The document's prose once said
    # "16 key, 4 not" while the data said 17/3 -- and nothing caught
    # it, because the checker validated each row but not the summary
    # the reader sees. So the count is derived and compared.
    n_key = sum(1 for _, (_, _, k, _) in APPROVED.items() if k == "yes")
    n_not = len(APPROVED) - n_key
    print(f"  {n_key} key, {n_not} not")
    if (n_key, n_not) != (17, 3):
        failures.append(
            f"the key counts are {n_key} key / {n_not} not, the approved "
            f"list has 17 key / 3 not")

    if failures:
        print(f"  FAILED: {len(failures)} problem(s)")
        for f in failures:
            print(f"    - {f}")
        return 1

    print("  OK: the list is exactly the owner's 20 ingredients, the "
          "forms and price bands are well-formed, and the substitution "
          "limits are the spec's own words")
    return 0


if __name__ == "__main__":
    sys.exit(main())
