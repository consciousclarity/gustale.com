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

  3. Every "typically defines the dish" hint is `yes` or `no`, and the
     `is_key` column is GONE -- it belongs to recipe_ingredients.

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

# Reviewed policy snapshot, deliberately independent of the submitted CSV.
# Changes to approved research scope require an explicit policy update here.
APPROVED = {'ackee': ('Ackee',
           'fresh;frozen;canned_or_packaged',
           '',
           'elevated;high;prohibitive',
           'yes',
           True),
 'asian-pear': ('Asian pear', 'fresh', 'bosc-pear', 'typical;elevated;high', 'no', True),
 'cassava': ('Cassava',
             'fresh;frozen',
             'cassava-flour;tapioca-starch',
             'typical;elevated;high',
             'yes',
             True),
 'coconut-milk': ('Coconut milk',
                  'fresh;homemade;canned_or_packaged',
                  'coconut-cream',
                  'typical;elevated;high',
                  'yes',
                  True),
 'curry-leaves': ('Curry leaves',
                  'fresh;frozen;canned_or_packaged',
                  '',
                  'typical;elevated;high',
                  'yes',
                  True),
 'doubanjiang': ('Doubanjiang',
                 'paste_or_concentrate',
                 'generic-chili-bean-paste',
                 'elevated;high;prohibitive',
                 'yes',
                 True),
 'epazote': ('Epazote', 'fresh;dried', '', 'typical;elevated;high', 'no', True),
 'fish-sauce': ('Fish sauce',
                'canned_or_packaged;paste_or_concentrate',
                '',
                'typical;elevated;high',
                'yes',
                True),
 'fresh-corn-masa': ('Fresh corn masa',
                     'homemade',
                     'masa-harina;corn-tortillas',
                     'typical;elevated;high',
                     'yes',
                     True),
 'fresh-mozzarella-di-bufala': ('Fresh mozzarella di bufala',
                                'fresh',
                                'fresh-cow-mozzarella;low-moisture-mozzarella;provolone',
                                'elevated;high;prohibitive',
                                'yes',
                                True),
 'gochujang': ('Gochujang',
               'paste_or_concentrate',
               'gochugaru-mix',
               'typical;elevated;high',
               'yes',
               True),
 'huitlacoche': ('Huitlacoche',
                 'fresh;canned_or_packaged',
                 '',
                 'typical;elevated;high',
                 'yes',
                 True),
 'makrut-lime-leaves': ('Makrut lime leaves',
                        'fresh;frozen',
                        'makrut-lime-zest;ordinary-lime-zest',
                        'elevated;high;prohibitive',
                        'yes',
                        True),
 'pandan': ('Pandan', 'fresh;extract', '', 'typical;elevated;high', 'yes', True),
 'parmigiano-reggiano': ('Parmigiano Reggiano',
                         'canned_or_packaged',
                         'grana-padano',
                         'elevated;high;prohibitive',
                         'yes',
                         True),
 'pecorino': ('Pecorino', 'canned_or_packaged', '', 'elevated;high;prohibitive', 'yes', True),
 'plantain': ('Plantain', 'fresh;frozen', 'green-banana', 'typical;elevated;high', 'yes', True),
 'preserved-lemon': ('Preserved lemon',
                     'fresh',
                     'salted-lemon;zest-and-salt',
                     'elevated;high;prohibitive',
                     'yes',
                     True),
 'saffron': ('Saffron', 'dried;extract', '', 'elevated;high;prohibitive', 'yes', True),
 'tamarind': ('Tamarind',
              'fresh;paste_or_concentrate;extract',
              'tamarind-block',
              'typical;elevated;high',
              'no',
              True),
 'ube': ('Ube', 'fresh;frozen;extract', '', 'elevated;high;prohibitive', 'yes', True)}

# THE FORM VOCABULARY.
#
# A FORM is the SAME INGREDIENT in another state: fresh, frozen, dried,
# canned/packaged, paste/concentrate, extract, homemade -- and the
# specific states of a particular ingredient (ripe/green, whole/pod,
# thread/powder).
#
# The owner's fix, stated exactly: "Forms = the same ingredient in
# another state (fresh, frozen, dried, canned/packaged,
# paste/concentrate, extract, homemade)."
#
# Every form in the list must be in this vocabulary. It is what makes
# the split ENFORCED rather than asserted: a substitute that is not in
# here cannot be smuggled into the forms column, because a form that
# names a different product -- coconut cream, provolone, tortillas --
# is simply not in the vocabulary.
FORM_VOCABULARY = {
    # ADR-008 Decision 19: the form is a STATE of the ingredient, and
    # these are the seven the live CHECK constraint accepts.
    "fresh",
    "frozen",
    "dried",
    "canned_or_packaged",
    "paste_or_concentrate",
    "extract",
    "homemade",
}

# THE MEANING MAP.
#
# A form names a state; the SPECIFICITY of that state is a
# product_category, and it is this map that says which. The owner's
# point: "tamarind paste/concentrate are in BOTH forms and
# substitutes -- make the checker compare MEANING, not strings".
#
# A string comparison cannot see that "tamarind-paste" and the form
# "paste_or_concentrate" name the SAME THING. A meaning comparison
# can: the substitute's MEANING is resolved to a form-state, and if
# that state is already claimed by a form of the same ingredient, the
# two are the same product and the substitute is redundant.
#
# Each entry maps a label to the state it MEANS, and to the category
# that carries the specificity.
MEANING = {
    # the seven states, meaning themselves
    "fresh": ("fresh", None),
    "frozen": ("frozen", None),
    "dried": ("dried", None),
    "canned_or_packaged": ("canned_or_packaged", None),
    "paste_or_concentrate": ("paste_or_concentrate", None),
    "extract": ("extract", None),
    "homemade": ("homemade", None),
    # a state, with a category
    "canned": ("canned_or_packaged", "canned"),
    "packaged": ("canned_or_packaged", "packaged"),
    "bottled": ("canned_or_packaged", "bottled"),
    "brined": ("canned_or_packaged", "brined"),
    "paste": ("paste_or_concentrate", "paste"),
    "concentrate": ("paste_or_concentrate", "concentrate"),
    "powder": ("dried", "powder"),
    "threads": ("dried", "threads"),
    "juice": ("extract", "juice"),
    "flavouring": ("extract", "flavouring"),
    "flavoring": ("extract", "flavouring"),
    "puree": ("frozen", "puree"),
    "pod": ("fresh", "pod"),
    "whole": ("fresh", "whole"),
    "peeled": ("fresh", "peeled"),
    "green": ("fresh", "green"),
    "ripe": ("fresh", "ripe"),
    "root": ("fresh", "root"),
    "leaves": ("fresh", "leaves"),
    "nashi": ("fresh", "nashi pear"),
    "slices": ("frozen", "slices"),
    "masa": ("homemade", "fresh masa"),
    "buffalo mozzarella": ("fresh", "buffalo mozzarella"),
    # VARIETIES: not states. These must never be a form -- a variety
    # is a separate ingredient row. (ADR-008 Decision 19.)
    "parmigiano": None,
    "pecorino": None,
}

# A label that is a SUBSTITUTE may still resolve to a MEANING that is
# a form-state. The map is what lets the checker see that a substitute
# and a form can be the SAME PRODUCT, which is the redundancy the owner
# found.
#
# THE RULE IS NOT "SAME STATE". Sharing a state is not redundancy:
# bosc pear and nashi pear are both "fresh" and are DIFFERENT products;
# gochugaru mix and gochujang are both pastes and are DIFFERENT
# products. What makes a substitute redundant is that it names THE SAME
# INGREDIENT as the row it sits in, in a state the row's own forms
# already claim.
#
# So each entry is (the ingredient the substitute IS, the state it
# means). The substitute is redundant only when that ingredient is the
# row's own ingredient.
#
#   "tamarind-paste" -> ("tamarind", "paste_or_concentrate")
#     tamarind's own forms already claim paste_or_concentrate, so
#     listing "tamarind-paste" as a substitute would rate the SAME
#     PRODUCT a second time.
#
#   "bosc-pear" -> ("asian-pear", "fresh")
#     a DIFFERENT pear. It means a state the row's forms also claim,
#     but it is a different product with its own suitability, so it is
#     allowed.
# THE SAME-PRODUCT SUBSTITUTES.
#
# Only these three are the row's OWN ingredient in a state the row's
# forms already claim, and so are redundant:
#
#   tamarind-paste      IS tamarind, in the paste state
#   tamarind-concentrate IS tamarind, in the concentrate state
#   seedless-tamarind   IS tamarind, seedless
#
# Everything else in the substitutes column is a DIFFERENT product that
# happens to share a state -- bosc pear is not a nashi pear, gochugaru
# mix is not gochujang, green banana is a different fruit from
# plantain, grana padano is not Parmigiano Reggiano. Sharing a state
# is not redundancy; those are exactly what a substitute IS.
#
# A substitute that is not in this map is always allowed.
SAME_PRODUCT_SUBSTITUTES = {
    "tamarind-paste": ("tamarind", "paste_or_concentrate"),
    "tamarind-concentrate": ("tamarind", "paste_or_concentrate"),
    "seedless-tamarind": ("tamarind", "fresh"),
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
        reader = csv.DictReader(f)
        required = {'price_bands_to_research', 'spec_easy_contexts', 'spec_harder_contexts', 'forms_to_research', 'substitution_limits_from_the_spec', 'typically_defines_the_dish_hint', 'slug', 'spec_row_name', 'form_product_categories', 'substitutes_to_research', 'name'}
        headers = reader.fieldnames or []
        if len(headers) != len(set(headers)) or not required.issubset(headers):
            print("FAILED: missing or duplicate CSV columns")
            return 1
        rows = list(reader)
    if any(None in r or any(v is None for v in r.values()) for r in rows):
        print("FAILED: malformed CSV row width")
        return 1

    # Closed membership is independent of the submitted CSV.
    approved = APPROVED

    failures = []
    print(f"  {len(rows)} rows, {len(approved)} in the approved list")

    spec_identity = {'coconut-milk': 'Coconut milk', 'cassava': 'Cassava', 'plantain': 'Plantain', 'tamarind': 'Tamarind', 'saffron': 'Saffron', 'preserved-lemon': 'Preserved lemon', 'curry-leaves': 'Curry leaves', 'makrut-lime-leaves': 'Makrut lime leaves', 'gochujang': 'Gochujang', 'doubanjiang': 'Doubanjiang', 'fish-sauce': 'Fish sauce', 'fresh-mozzarella-di-bufala': 'Fresh mozzarella di bufala', 'parmigiano-reggiano': 'Parmigiano Reggiano and Pecorino', 'pecorino': 'Parmigiano Reggiano and Pecorino', 'ube': 'Ube', 'ackee': 'Ackee', 'huitlacoche': 'Huitlacoche', 'asian-pear': 'Asian pear', 'pandan': 'Pandan', 'epazote': 'Epazote', 'fresh-corn-masa': 'Fresh corn masa'}
    expected_slugs = set(APPROVED)
    actual_slugs = {r["slug"] for r in rows}
    for row in rows:
        if row['slug'] in spec_identity and row['spec_row_name'] != spec_identity[row['slug']]:
            failures.append(f"'{row['slug']}': wrong spec row identity")
    for missing in sorted(expected_slugs - actual_slugs):
        failures.append(f"'{missing}': MISSING ingredient")
    for extra in sorted(actual_slugs - expected_slugs):
        failures.append(f"'{extra}': unexpected ingredient")

    # (1) the list must be a SET of distinct slugs.
    #
    seen = {}
    for r in rows:
        slug = r["slug"].strip()
        if slug in seen:
            failures.append(f"'{slug}': appears more than once")
        seen[slug] = r

    # The two cheeses are two ingredients, and both must be present:
    # a split that loses one half is a silent data loss.
    for slug in ("parmigiano-reggiano", "pecorino"):
        if slug not in seen:
            failures.append(
                f"'{slug}': MISSING -- the owner's split of 'Parmigiano "
                f"Reggiano and Pecorino' into two ingredients must keep "
                f"both")

    # (2) the declared attributes must match the approved ones, the
    # forms must be non-empty, and the price bands must be from the
    # vocabulary.
    for slug, (name, forms, substitutes, bands, hint, _) in sorted(
        approved.items()
    ):
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

        got_forms = [f.strip() for f in r["forms_to_research"].split(";") if f.strip()]
        if not got_forms:
            failures.append(f"'{slug}': no forms to research")
        for f in got_forms:
            if f not in FORM_VOCABULARY:
                failures.append(
                    f"'{slug}': '{f}' is not one of the seven form states "
                    f"(fresh, frozen, dried, canned_or_packaged, "
                    f"paste_or_concentrate, extract, homemade). A form is a "
                    f"STATE of the ingredient; a part, a presentation, a "
                    f"variety or a grade belongs in the "
                    f"form_product_categories column -- see ADR-008 "
                    f"Decision 19")

        # THE FORMS/SUBSTITUTES SPLIT, COMPARED BY MEANING.
        #
        # A FORM is the same ingredient in another state. A SUBSTITUTE is
        # a different thing that may serve in its place, with its own
        # suitability. The owner's fix: the two must not be mixed, and a
        # substitute listed as a form is a category error -- it would be
        # rated as if it were the ingredient itself.
        #
        # THE COMPARISON IS BY MEANING, NOT BY STRING. The owner's
        # example: tamarind's "paste" and "concentrate" appeared in BOTH
        # the forms column and the substitutes column. A string
        # comparison sees two different words and passes them; a MEANING
        # comparison sees that "tamarind-paste" IS the paste form of
        # tamarind, and that a substitute which means the same state as
        # a form of the same ingredient is the SAME PRODUCT and so is
        # redundant -- it would be rated as if it were a different
        # ingredient when it is not.
        got_subs = [
            x.strip()
            for x in r["substitutes_to_research"].split(";")
            if x.strip()
        ]
        if r["substitutes_to_research"].strip() != substitutes:
            failures.append(
                f"'{slug}': substitutes are "
                f"'{r['substitutes_to_research'].strip()}', the approved "
                f"substitutes are '{substitutes}'")

        # The states the FORMS claim.
        form_states = set()
        for f in got_forms:
            meaning = MEANING.get(f)
            if meaning:
                form_states.add(meaning[0])

        for sub in got_subs:
            if sub in got_forms:
                failures.append(
                    f"'{slug}': '{sub}' is a SUBSTITUTE, not a form -- it "
                    f"must not appear in the forms column")
                continue
            # THE MEANING COMPARISON. The substitute is redundant only
            # when it names THE SAME INGREDIENT as this row, in a state
            # this row's own forms already claim. Sharing a state is
            # not enough -- that is two different products.
            meaning = SAME_PRODUCT_SUBSTITUTES.get(sub)
            if meaning:
                sub_ingredient, sub_state = meaning
                if sub_ingredient == slug and sub_state in form_states:
                    failures.append(
                        f"'{slug}': '{sub}' IS '{slug}' in its "
                        f"'{sub_state}' state -- the same product as this "
                        f"row's own '{sub_state}' form, so it is not a "
                        f"substitute. Either drop it or remove the form "
                        f"it duplicates")
        # A substitute must also be researchable: the rating needs to
        # know whether it is available and how suitable it is.
        if substitutes and not got_subs:
            failures.append(
                f"'{slug}': the approved substitutes '{substitutes}' are "
                f"missing from the substitutes column")

        # FIX 3, AGAIN, AND FURTHER: an import dependency is NOT an
        # ingredient property. It is a fact about a COUNTRY -- whether
        # that country must import the ingredient -- so it belongs on
        # the country row of the research, not on the ingredient list.
        # The column is gone, and the checker refuses it coming back.
        if "import_dependency" in r:
            failures.append(
                f"'{slug}': the column 'import_dependency' is present -- an "
                f"import dependency is a fact about a COUNTRY (whether that "
                f"country must import the ingredient), not a property of "
                f"the ingredient. It belongs on the country row")

        # FIX 1: the recipe-line hint. It is NOT an ingredient property.
        hint_col = "typically_defines_the_dish_hint"
        if hint_col not in r:
            failures.append(
                f"'{slug}': the column '{hint_col}' is missing -- the "
                f"is_key column was renamed; is_key is a RECIPE-LINE "
                f"property (recipe_ingredients.is_key), not an ingredient "
                f"one")
            continue
        if "is_key" in r:
            failures.append(
                f"'{slug}': the column 'is_key' is still present -- "
                f"is_key belongs to recipe_ingredients, never to the "
                f"ingredient")
        if r[hint_col].strip() != hint:
            failures.append(
                f"'{slug}': {hint_col} is '{r[hint_col].strip()}', the "
                f"approved value is '{hint}'")
        if r[hint_col].strip() not in ("yes", "no"):
            failures.append(
                f"'{slug}': {hint_col} '{r[hint_col].strip()}' is not "
                f"'yes' or 'no'")

        bands = [b.strip() for b in r["price_bands_to_research"].split(";")
                 if b.strip()]
        if r['price_bands_to_research'].strip() != approved[slug][3]:
            failures.append(f"'{slug}': price bands differ from approved scope")
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
        failures.append("the owner's spec was not found; cannot verify substitution limits")
    else:
        for slug, (name, _, _, _, _, _) in sorted(approved.items()):
            r = seen.get(slug)
            if r is None:
                continue
            # The list records which SPEC ROW each ingredient comes
            # from. That matters because an ingredient may be a SPLIT
            # of a spec row: the spec has one row, "Parmigiano Reggiano
            # and Pecorino", and the list has two ingredients, each
            # carrying its own limit.
            spec_row = r.get("spec_row_name", "").strip() or name
            want = limits.get(norm(spec_row))
            if want is None:
                failures.append(
                    f"'{slug}': the spec has no row named '{spec_row}' -- "
                    f"the list and the spec have drifted apart")
                continue
            got = r["substitution_limits_from_the_spec"].strip()
            if got != want:
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

    # THE PROHIBITIONS BIND THE SUBSTITUTES COLUMN TOO.
    #
    # The check above only proves the spec's sentence survived into the
    # limits. It does NOT stop a prohibited item appearing in the
    # substitutes column -- which is the direction that matters,
    # because the substitutes column is what the RESEARCHER reads.
    # The owner's spec says soy sauce must never be presented as an
    # equivalent substitute for fish sauce, and safflower must not be
    # listed for saffron. A research batch that quietly offered one
    # would be inventing data the owner explicitly ruled out, and the
    # limits sentence sitting in a different column does not stop it.
    #
    # So each prohibited thing is matched against the substitutes
    # column as well, by the LABEL the list would use.
    PROHIBITED_SUBSTITUTES = {
        # The spec says "should NOT be presented as an equivalent
        # substitute" / "should not be listed as an equivalent
        # substitute" / "are not equivalent substitutes". These are
        # HARD prohibitions: no label may offer them.
        "fish-sauce": ("soy sauce", "soy-sauce", "kecap asin"),
        "saffron": ("safflower",),
        "epazote": ("parsley", "cilantro"),
        # "Corn and mushroom do not provide a suitable substitute" --
        # they are named only to be ruled out.
        "huitlacoche": ("corn", "mushroom"),
        # "Purple sweet potato can reproduce color but not the
        # distinctive flavor and should be marked as an approximation"
        # -- that is a WEAKER APPROXIMATION, which the spec permits
        # with the marking. It is not a prohibition.
    }

    # THE WEAKER APPROXIMATIONS -- permitted, but the limits text must
    # say they are approximations, and they must carry the marking.
    #
    # The spec: "Purple sweet potato can reproduce color but not the
    # distinctive flavor and should be marked as an approximation."
    # "Ordinary lime zest is a weaker approximation."
    #
    # These are offered substitutes, so the checker must NOT reject
    # them -- but it must insist the limits text still says what they
    # are, so a research batch cannot quietly promote an approximation
    # to an equal.
    APPROXIMATIONS = {
        "ube": ("purple sweet potato", "approximation"),
        "makrut-lime-leaves": ("ordinary lime zest", "weaker approximation"),
    }
    for slug, (thing, qualifier) in APPROXIMATIONS.items():
        r = seen.get(slug)
        if r is None:
            continue
        lim = r["substitution_limits_from_the_spec"].lower()
        if thing not in lim or qualifier not in lim:
            failures.append(
                f"'{slug}': '{thing}' is an APPROXIMATION, and the limits "
                f"must say so -- the spec calls it a '{qualifier}'. The "
                f"substitute may be offered, but not as an equal")
    for slug, names in PROHIBITED_SUBSTITUTES.items():
        r = seen.get(slug)
        if r is None:
            continue
        subs = [
            x.strip().lower()
            for x in r["substitutes_to_research"].split(";")
            if x.strip()
        ]
        for sub in subs:
            for banned in names:
                if banned in sub:
                    failures.append(
                        f"'{slug}': '{sub}' is PROHIBITED -- the spec says "
                        f"'{banned}' must not be offered as a substitute "
                        f"for this ingredient")

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
    n_key = sum(1 for r in rows if r["typically_defines_the_dish_hint"].strip() == "yes")
    n_not = len(rows) - n_key
    print(f"  {n_key} 'typically defines the dish', {n_not} not")
    if (n_key, n_not) != (18, 3):
        failures.append(
            f"the hint counts are {n_key} key / {n_not} not, the approved "
            f"list has 18 key / 3 not")

    if failures:
        print(f"  FAILED: {len(failures)} problem(s)")
        for f in failures:
            print(f"    - {f}")
        return 1

    print("  OK: the list is the owner's 21 ingredient rows (the spec's "
          "20, with 'Parmigiano Reggiano and Pecorino' split into two), "
          "the forms are states of the ingredient and the substitutes "
          "are separate, the recipe-line hint is well-formed, and the "
          "substitution limits are the spec's own words")
    return 0


if __name__ == "__main__":
    sys.exit(main())
