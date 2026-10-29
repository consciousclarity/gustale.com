#!/usr/bin/env python3
"""Curate the fetched Wikidata tradition set into the 1e vocabulary.

The raw fetch (scripts/fetch_traditions_1e.py) returns 991 items that
are instances of "cuisine" with a country. That set contains three kinds
of thing, and only one of them is a tradition:

  1. TRADITIONS  — "Abruzzese cuisine", "Acehnese cuisine", "Cantonese
     cuisine". A named culinary tradition attached to a people, a region
     or a religion. These are the values 1e wants.
  2. DISHES      — "Alakena", "bingka", "bubur ase". These are dishes.
     They belong in the dishes vocabulary, not the traditions one.
  3. NON-CUISINE — "Cinnamon Roll Day" (a holiday), "Basil & Peas" (a
     restaurant), "Baja Med" (a marketing term). These are neither.

The filter is applied on the DESCRIPTION, because that is where Wikidata
states what the item actually IS. A description that says "dish",
"snack", "cake", "soup", "restaurant" or "holiday" marks the item as
not-a-tradition.

Every surviving value carries:
  name       — the Wikidata English label
  definition — the Wikidata English description (CC0)
  source     — the Wikidata Q-id

Where Wikidata has no English description, the item is dropped rather
than given an invented definition: 1e requires a definition AND a
source per value, and a definition we invented would not be sourced.

Output: /tmp/traditions_curated.json
"""

import json
import re
from pathlib import Path

SRC = Path("/tmp/traditions_1e.json")
OUT = Path("/tmp/traditions_curated.json")

# Words in the Wikidata description that mark the item as NOT a cuisine
# tradition.
NOT_A_TRADITION = re.compile(
    r"\b("
    r"dish|dishes|dessert|snack|snacks|cake|cakes|bread|breads|"
    r"soup|porridge|rice dish|stew|salad|sauce|soup|"
    r"restaurant|cafe|bistro|fast food|chain|"
    r"holiday|festival|celebration|anniversary|day|"
    r"drink|beverage|juice|coffee|tea\b|"
    r"noodle|pasta|curry|fried|grilled|roasted|"
    r"appetizer|street food|fast food|snack food|"
    r"biscuit|cookie|candy|confection|dessert|"
    r"ice cream|sorbet|"
    r"cuisine term|marketing term|brand|"
    r"type of|kind of"
    r")\b",
    re.IGNORECASE,
)

# A description that says what the item IS, in the positive.
IS_A_CUISINE = re.compile(
    r"\b("
    r"culinary tradition|culinary traditions|cuisine of|cuisine in|"
    r"cooking tradition|cooking traditions|food tradition|"
    r"food traditions|traditional cuisine|"
    r"cuisine .* of the|cuisine .* for the|"
    r"cuisine characteristic|cuisine of the"
    r")\b",
    re.IGNORECASE,
)


def slugify(name: str) -> str:
    import unicodedata
    s = unicodedata.normalize("NFKD", name)
    s = "".join(c for c in s if not unicodedata.combining(c))
    s = s.lower().replace("'", "").replace("’", "")
    s = re.sub(r"[^a-z0-9]+", "-", s)
    return s.strip("-")


def main() -> int:
    raw = json.loads(SRC.read_text())

    kept, dropped_nocuisine, dropped_dish, dropped_nontradition = [], [], [], []

    for o in raw:
        label = (o.get("label") or "").strip()
        desc = (o.get("description") or "").strip()

        if not label:
            dropped_nontradition.append(o)
            continue

        # Must describe a cuisine/tradition, not a dish or a non-food.
        if not IS_A_CUISINE.search(desc):
            dropped_nontradition.append(o)
            continue

        # Must not describe a dish, a drink, a restaurant or a holiday.
        if NOT_A_TRADITION.search(desc):
            dropped_dish.append(o)
            continue

        kept.append({
            "qid": o["qid"],
            "label": label,
            "description": desc,
            "country_qid": o.get("country_qid"),
            "country": o.get("country"),
            "sitelink": o.get("sitelink"),
        })

    # Slug uniqueness.
    seen = {}
    for k in kept:
        s = slugify(k["label"])
        base = s
        n = 2
        while s in seen:
            s = f"{base}-{n}"
            n += 1
        seen[s] = k["qid"]
        k["slug"] = s

    kept.sort(key=lambda k: k["label"].lower())
    OUT.write_text(json.dumps(kept, indent=2, ensure_ascii=False))

    print(f"raw                  : {len(raw)}")
    print(f"kept (traditions)    : {len(kept)}")
    print(f"dropped - no cuisine description : {len(dropped_nontradition)}")
    print(f"dropped - dish/drink/venue      : {len(dropped_dish)}")
    print(f"-> {OUT}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
