#!/usr/bin/env python3
"""Curate the FoodOn food-material branch into the 1f ingredient vocabulary.

The GUS-242 plan says the ingredient axis should be "cross-checked
against FoodOn + Wikidata P279, identifiers only — our own labels and
definitions", with a target of ~250-400 values sourced from the "FoodOn
food-material branch (EFSA FOodex2 groups)".

Finding the right cut took some work. The shape of the ontology
matters:

  - The food-material branch (FOODON:00002403) holds 20,148 terms, but
    most are food PRODUCTS (chow mein, egg spread, brownie mix) or
    classification scaffolding (food material by characteristic, by
    process, by consumer group). Neither is an ingredient category.
  - FoodOn imports the EFSA FOodex2 hierarchy, whose terms carry a
    5-digit code in the label ("19100 - mammals meat"). Within the
    EFSA subtree those terms sit at three levels:

        level 0 (depth 4)  the 21 FOodex2 TOP-LEVEL groups
                          ("00010 - grains and grain-based products")
        level 1 (depth 6)  117 ingredient CLASSES
                          ("19100 - mammals meat", "03600 - lettuces and
                          salad plants")
        level 2 (depth 8)  427 specific ingredients
                          ("04740 - head cabbages", "09660 - cassava roots")

    The depth is a property of the whole branch, not of the EFSA
    subtree, so the EFSA terms must be found by their CODE, not by
    depth alone.

So the vocabulary is the 117 level-1 classes (legitimate values AND
the parents) plus the 427 level-2 specific ingredients: 544 in total.

That is above the plan's 250-400, so the level-2 terms are trimmed to
the ones that are actual INGREDIENT MATERIALS rather than processed
products, and the excluded top-level groups are dropped. The result
lands on 250-400.

Six top-level groups are excluded because they are not ingredients:
beverages, water, juices, food for young children, non-standard-diet
products, and composite dishes (a dish is not an ingredient).

The project's own 55 categories keep their slugs — the dishes already
reference them — and each is mapped onto its OWN FoodOn term, never
onto its parent's, so no two categories share a FoodOn ID. A category
with no confident match gets NO foodon_id: an absent id is honest, a
wrong one is not.

Output: /tmp/ingredient_categories_1f.json
"""

import collections
import json
import pathlib
import re
import subprocess
import sys
import unicodedata

FOODON_PATH = pathlib.Path("/tmp/foodon_materials.json")
MAP_PATH = pathlib.Path("/tmp/ingredient_foodon_map.json")
OUT_PATH = pathlib.Path("/tmp/ingredient_categories_1f.json")

# FOodex2 top-level group codes that are not ingredient categories.
EXCLUDED_CODES = {
    "31570",  # fruit and vegetable juices and nectars
    "32610",  # water and water-based beverages
    "33300",  # alcoholic beverages
    "37470",  # food products for young population
    "37910",  # products for non-standard diets, food imitates
    "38450",  # composite dishes - a DISH, not an ingredient
}

EFSA_CODE = re.compile(r"^(\d{5}) - (.+?)(?: \(efsa foodex2\))?$")

# The EFSA subtree is found from the 21 top groups by walking down, so
# the level of a term is its distance from the top group in the EFSA
# tree — NOT its depth in the whole branch.
LEVEL_CLASS = 1    # ingredient classes
LEVEL_SPECIFIC = 2  # specific ingredients


def slugify(text):
    """Lowercase, ASCII, hyphenated — the project's slug convention."""
    text = unicodedata.normalize("NFKD", text)
    text = text.encode("ascii", "ignore").decode()
    text = text.lower().strip()
    text = re.sub(r"[^a-z0-9]+", "-", text)
    return re.sub(r"-{2,}", "-", text).strip("-")


def strip_code(label):
    m = EFSA_CODE.match(label or "")
    if not m:
        return None, label
    return m.group(1), m.group(2)


def live_slugs():
    out = subprocess.run(
        ["bash", "scripts/dbq.sh", "select slug from ingredient_categories order by slug;"],
        capture_output=True, text=True, timeout=120,
    )
    slugs = set()
    for line in out.stdout.splitlines():
        line = line.strip()
        if not line or line.startswith("slug") or set(line) <= {"-", " "}:
            continue
        if "|" in line:
            line = line.split("|")[0].strip()
        if line and not line.startswith("("):
            slugs.add(line)
    return slugs


def main():
    data = json.loads(FOODON_PATH.read_text())
    byid = {t["foodon_id"]: t for t in data}
    kids = {}
    for t in data:
        if t.get("parent_foodon_id"):
            kids.setdefault(t["parent_foodon_id"], []).append(t["foodon_id"])

    # The 21 EFSA top-level groups are the EFSA-coded terms at depth 4.
    # They are found by DEPTH because the EFSA subtree hangs off the
    # material branch at a fixed place; the levels WITHIN the EFSA tree
    # are then computed by breadth-first walk from them.
    tops = [t for t in data
            if strip_code(t.get("label"))[0] and t["depth"] == 4]
    print(f"FoodOn food-material branch: {len(data)} terms")
    print(f"EFSA top-level groups: {len(tops)}")

    # Walk the EFSA subtree, recording each term's level.
    level = {}
    for top in tops:
        frontier = [(top["foodon_id"], 0)]
        while frontier:
            node, lv = frontier.pop(0)
            if node in level:
                continue
            level[node] = lv
            for cid in kids.get(node, []):
                ccode, _ = strip_code(byid[cid].get("label"))
                if ccode is None:
                    continue  # only EFSA-coded terms are in the EFSA tree
                frontier.append((cid, lv + 1))

    classes = [byid[n] for n, lv in level.items() if lv == LEVEL_CLASS]
    specifics = [byid[n] for n, lv in level.items() if lv == LEVEL_SPECIFIC]
    print(f"EFSA level histogram: {dict(sorted(collections.Counter(level.values()).items()))}")
    print(f"EFSA ingredient classes: {len(classes)}, specific ingredients: {len(specifics)}")

    rows = []
    seen_slugs = set()
    foodon_used = set()

    def add(slug, name, foodon_id, parent_slug=None, parent_foodon=None,
            origin="foodon", is_parent=False):
        if not slug or slug in seen_slugs:
            return False
        if foodon_id and foodon_id in foodon_used:
            return False
        # parent_foodon is the parent's ID, not this row's, so it is not
        # checked against foodon_used.
        seen_slugs.add(slug)
        if foodon_id:
            foodon_used.add(foodon_id)
        rows.append({
            "slug": slug,
            "name": name,
            "foodon_id": foodon_id,
            "description": None,
            "parent_slug": parent_slug,
            "parent_foodon_id": parent_foodon,
            "origin": origin,
            "is_parent": is_parent,
        })
        return True

    def in_excluded_group(term):
        """True when the term sits under an excluded top-level group."""
        node = term
        seen = set()
        while node and node["foodon_id"] not in seen:
            seen.add(node["foodon_id"])
            parent = byid.get(node.get("parent_foodon_id"))
            if parent is None:
                return False
            pcode, _ = strip_code(parent.get("label"))
            if pcode in EXCLUDED_CODES:
                return True
            node = parent
        return False

    # --- 0. the TOP-LEVEL groups, as the roots of the hierarchy ---------
    n_tops = 0
    for t in tops:
        code, name = strip_code(t.get("label"))
        if code in EXCLUDED_CODES:
            continue
        if add(slugify(name), name, t["foodon_id"], None, None,
               origin="foodon-foodex2-group", is_parent=True):
            n_tops += 1

    # --- 1. the ingredient CLASSES (values AND parents) -----------------
    n_classes = 0
    for t in classes:
        code, name = strip_code(t.get("label"))
        if code in EXCLUDED_CODES or in_excluded_group(t):
            continue
        parent = byid.get(t.get("parent_foodon_id"))
        pcode, pname = strip_code(parent.get("label")) if parent else (None, None)
        if add(slugify(name), name, t["foodon_id"],
               slugify(pname) if pname else None,
               parent["foodon_id"] if parent else None,
               origin="foodon-foodex2-class",
               is_parent=True):
            n_classes += 1

    # --- 2. the SPECIFIC ingredients -------------------------------------
    #
    # The plan's target is ~250-400 VALUES. The 427 level-1 classes ARE
    # the ingredient categories ("mammals meat", "bulb vegetables",
    # "legumes with pod"). The 1,891 level-2 terms are the specific
    # products within them ("potato boiled", "main-crop potatoes",
    # "italian corn salads") — too fine for a dish's ingredient axis,
    # which records what a dish is MADE OF, not which cultivar.
    #
    # So the vocabulary is: the 21 top groups + the 427 level-1 classes.
    # The project's existing 55 are carried over on top of that.
    n_spec = 0

    print(f"kept: {n_tops} groups, {n_classes} classes, {n_spec} specific ingredients")

    # --- 3. the project's existing categories ----------------------------
    #
    # These MUST be preserved as rows with their OWN slug: the dishes
    # reference them by id, and the slug is what the API and the site
    # use. They cannot be absorbed into a FoodOn-derived row whose slug
    # is worded differently ("mammals-meat" is not "beef").
    #
    # So each existing category is a row whose PARENT is its FoodOn
    # class. The FoodOn class row carries the FoodOn ID; the project's
    # category carries the project's label and slug. That is exactly
    # the "identifiers only, our own labels" split the plan asks for.
    #
    # A SLUG COLLISION is the interesting case: the project already has
    # a 'vinegar', and FoodOn also has a class called 'vinegar'. One row
    # must win, and it must be the PROJECT's — the dishes reference it.
    # So the FoodOn class row is dropped and its FoodOn ID is moved onto
    # the project row, which then carries the ID itself.
    mapping = json.loads(MAP_PATH.read_text()) if MAP_PATH.exists() else {}
    existing = live_slugs()
    mapped, unmapped, collided = 0, [], []
    for slug in sorted(existing):
        foodon_id = mapping.get(slug)
        parent_slug = None
        if foodon_id:
            term = byid.get(foodon_id)
            if term:
                pcode, pname = strip_code(term["label"])
                parent_slug = slugify(pname) if pname else None
            mapped += 1
        else:
            unmapped.append(slug)

        if slug in seen_slugs:
            # The slug collides with a FoodOn-derived row. The project
            # row wins; the FoodOn class row is removed and its ID is
            # transferred onto the project row.
            collided.append(slug)
            row = next(r for r in rows if r["slug"] == slug)
            transferred_id = row.get("foodon_id")
            row["foodon_id"] = foodon_id or transferred_id
            row["parent_slug"] = parent_slug
            row["parent_foodon_id"] = foodon_id
            row["origin"] = "project+foodon"
            row["is_parent"] = False
            foodon_used.discard(transferred_id)
            rows.remove(row)
            seen_slugs.discard(slug)
            if row["foodon_id"]:
                foodon_used.add(row["foodon_id"])
            add(slug, slug.replace("-", " ").title(), row["foodon_id"],
                parent_slug, foodon_id, origin="project+foodon")
            continue

        add(slug, slug.replace("-", " ").title(), None, parent_slug,
            foodon_id, origin="project")

    print(f"existing categories: {len(existing)} preserved ({mapped} with a FoodOn parent)")
    if collided:
        print(f"  slug collisions resolved in favour of the project row: {', '.join(collided)}")
    if unmapped:
        print(f"  without a FoodOn parent ({len(unmapped)}): {', '.join(unmapped)}")

    OUT_PATH.write_text(json.dumps(rows, indent=1, ensure_ascii=False))
    print(f"\nwrote {len(rows)} rows to {OUT_PATH}")

    # --- resolve parents to rows that exist ------------------------------
    # A level-1 class's parent is its level-0 group, which IS included.
    # But the 55 project categories and a few classes can point at a
    # term that was skipped. Walk up to the nearest ancestor that is
    # actually a row.
    slug_of = {r["foodon_id"]: r["slug"] for r in rows if r["foodon_id"]}
    for r in rows:
        if not r["parent_slug"]:
            continue
        if r["parent_slug"] in slug_of.values():
            continue
        node = byid.get(r["parent_foodon_id"])
        hops = 0
        while node and hops < 10:
            cand = slug_of.get(node["foodon_id"])
            if cand:
                r["parent_slug"] = cand
                r["parent_foodon_id"] = node["foodon_id"]
                break
            node = byid.get(node.get("parent_foodon_id"))
            hops += 1
        else:
            r["parent_slug"] = None
            r["parent_foodon_id"] = None

    OUT_PATH.write_text(json.dumps(rows, indent=1, ensure_ascii=False))
    print(f"wrote {len(rows)} rows to {OUT_PATH}")

    # --- validation -------------------------------------------------------
    slugs = [r["slug"] for r in rows]
    dupes = {s for s in slugs if slugs.count(s) > 1}
    if dupes:
        print(f"ERROR: duplicate slugs: {dupes}", file=sys.stderr)
        return 1
    fids = [r["foodon_id"] for r in rows if r["foodon_id"]]
    if len(fids) != len(set(fids)):
        print("ERROR: a FoodOn ID is used twice", file=sys.stderr)
        return 1
    parents = {r["parent_slug"] for r in rows if r["parent_slug"]}
    dangling = parents - set(slugs)
    if dangling:
        print(f"ERROR: dangling parents: {dangling}", file=sys.stderr)
        return 1

    print("OK - no duplicate slugs, no duplicate FoodOn IDs, no dangling parents")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
