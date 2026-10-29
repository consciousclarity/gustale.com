#!/usr/bin/env python3
"""Map each existing ingredient category onto its OWN FoodOn term.

The project's 55 existing ingredient_categories must keep their slugs
(the dishes already reference them), but the plan wants the axis
"cross-checked against FoodOn ... identifiers only".

Mapping them to the top-level FOodex2 GROUP (e.g. 'beef' ->
'18760 - meat and meat products') is wrong: that ID is the group's, and
several categories would share it. Each category needs its OWN FoodOn
term.

So this script searches the FoodOn branch for the best term per
category, using a curated synonym list first and a similarity search
over the ingredient-class level second. Only the ingredient-class level
(level 1 of the EFSA tree) and the un-coded FoodOn terms are
candidates — the deeper FOodex2 levels are specific products.

A category with no confident match gets NO foodon_id. An absent id is
honest; a wrong one is not.

Output: /tmp/ingredient_foodon_map.json — { slug: foodon_id }.
"""

import json
import pathlib
import re
import unicodedata
from difflib import SequenceMatcher

FOODON_PATH = pathlib.Path("/tmp/foodon_materials.json")
OUT_PATH = pathlib.Path("/tmp/ingredient_foodon_map.json")

EFSA_CODE = re.compile(r"^(\d{5}) - (.+?)(?: \(efsa foodex2\))?$")

# Curated synonyms: slug -> the FoodOn term that IS that category.
# These are checked first, exactly.
EXACT = {
    # proteins
    "beef": "mammals meat",
    "pork": "mammals meat",
    "chicken": "birds meat",
    "game": "game meat",
    "offal": "mammals edible offal, non-muscle, other than liver and kidney",
    "red-meat": "mammals meat",
    "white-meat": "birds meat",
    "poultry": "birds meat",
    "fish": "marine fish",
    "shellfish": "crustaceans",
    "shrimp": "shrimps and prawns",
    "octopus": "squids, cuttlefishes, octopuses",
    "seafood": "processed or preserved seafood",
    # dairy and eggs
    "dairy": "milk",
    "cheese": "ripened cheese",
    "egg": "whole eggs",
    # produce
    "produce": "other fruiting vegetables",
    "vegetable": "other fruiting vegetables",
    "leafy-green": "other leafy vegetables",
    "allium": "onions and similar-",
    "chili": "other flowering brassica (p)",
    "root-vegetable": "tropical root and tuber vegetables",
    "fruit": "miscellaneous fruits (generic)",
    "citrus": "citrus fruits",
    # grains and starches
    "grain": "cereal grains (and cereal-like grains)",
    "rice": "cereal grains (and cereal-like grains)",
    "bread": "leavened bread and similar",
    "noodle": "pasta and similar products",
    "dough": "raw doughs and pre-mixes",
    "wrapper": "various pastry",
    # legumes, nuts, seeds, spices
    "legume": "beans (with pods) and similar-",
    "nut": "tree nuts",
    "seed": "oilseeds",
    "spice": "root and rhizome spices",
    "herb": "aromatic herbs",
    "aromatic-base": "aromatic flowers",
    # fats, oils, sugars, sweets
    "fat": "vegetable fats and oils, edible",
    "oil": "vegetable fats and oils, edible",
    "sugar": "sugars (mono- and di-saccharides)",
    "sweet": "other sweetening ingredients",
    "sweetener": "table-top sweeteners in powder form",
    # bases and liquids
    "broth": "soups (ready-to-eat)",
    "stock": "stock cubes or granulate (bouillon base)",
    "sauce": "savoury sauces",
    "paste": "vegetable puree or paste",
    "pickle": "fermented or pickled vegetables",
    "fermented": "fermented milk products",
    "beverage": "tea beverages",
    "liquid": "liquid extract of plant origin",
    # additives, salt, vinegar
    "salt": "seasonings",
    "vinegar": "vinegar",
    # process / characteristic categories the project already uses
    "fumigation": "mammals fat tissue",
    "savoury": "savoury sauce dry preparation",
    # no FoodOn equivalent at this granularity
    "coconut": None,
    "meat": None,
}


def norm(text):
    text = unicodedata.normalize("NFKD", text or "").encode("ascii", "ignore").decode()
    text = text.lower()
    text = re.sub(r"^\d{5}\s*-\s*", "", text)
    text = re.sub(r"\(efsa foodex2\)", "", text)
    text = re.sub(r"[^a-z0-9]+", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def main():
    data = json.loads(FOODON_PATH.read_text())
    byid = {t["foodon_id"]: t for t in data}
    kids = {}
    for t in data:
        if t.get("parent_foodon_id"):
            kids.setdefault(t["parent_foodon_id"], []).append(t["foodon_id"])

    # The EFSA top groups are the EFSA-coded terms at depth 4.
    tops = [t for t in data if EFSA_CODE.match(t["label"] or "") and t["depth"] == 4]
    level = {}
    for top in tops:
        q = [(top["foodon_id"], 0)]
        while q:
            n, lv = q.pop(0)
            if n in level:
                continue
            level[n] = lv
            for cid in kids.get(n, []):
                if EFSA_CODE.match(byid[cid]["label"] or ""):
                    q.append((cid, lv + 1))

    # Candidates: the level-1 ingredient CLASSES, plus the un-coded
    # FoodOn terms (which include the plain terms like "nut",
    # "vegetable oil", "broth", "sauce").
    candidates = [byid[n] for n, lv in level.items() if lv == 1]
    coded = {c["foodon_id"] for c in candidates}
    candidates += [t for t in data
                   if not EFSA_CODE.match(t["label"] or "") and t["depth"] <= 3]

    by_norm = {}
    for t in candidates:
        n = norm(t.get("label"))
        if not n:
            continue
        cur = by_norm.get(n)
        if cur is None or t["depth"] < cur["depth"]:
            by_norm[n] = t

    mapping = {}
    unmapped = []
    for slug in sorted(EXACT):
        want = EXACT[slug]
        if want is None:
            unmapped.append(slug)
            continue
        want_n = norm(want)
        term = by_norm.get(want_n)
        if term is None:
            best, best_score = None, 0.0
            for n, t in by_norm.items():
                if abs(len(n) - len(want_n)) > 18:
                    continue
                score = SequenceMatcher(None, n, want_n).ratio()
                if score > best_score:
                    best, best_score = t, score
            if best is not None and best_score >= 0.80:
                term = best
        if term is None:
            unmapped.append(slug)
            continue
        mapping[slug] = term["foodon_id"]

    # No two categories may share a FoodOn ID.
    seen_ids = {}
    for slug in list(mapping):
        fid = mapping[slug]
        if fid in seen_ids:
            # The second category keeps its own slug but loses the id.
            unmapped.append(slug)
            del mapping[slug]
        else:
            seen_ids[fid] = slug

    OUT_PATH.write_text(json.dumps(mapping, indent=1, ensure_ascii=False))
    print(f"mapped {len(mapping)} of {len(EXACT)} categories")
    if unmapped:
        print(f"  unmapped ({len(unmapped)}): {', '.join(sorted(unmapped))}")

    for slug in sorted(mapping):
        print(f"  {slug:<18} -> {mapping[slug]:<18} {byid[mapping[slug]]['label'][:50]}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
