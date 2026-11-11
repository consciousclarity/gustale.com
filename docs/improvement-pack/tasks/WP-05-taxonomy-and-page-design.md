# WP-05 · Taxonomy and dish page v2 design

**Owner:** Claude Code (design doc and wireframe). **Reviewer:** Codex (data model fit). **Ends with decision D5 by Alex.**

## Why (evidence)
- 1,353 of 1,474 dishes (92%) have no family and no method.
- "Families" mix forms (Dumpling, Stew), courses (Appetizer, Main course, Dessert) and cuisines (Turkish cuisine, Filipino cuisine, Colombian cuisine). The families page promises "one entry per form".
- Origins mix levels: countries, cities ("Ciudad Autónoma de Buenos Aires"), regions ("Swabia", "Occitania"), eras ("Ancient Greece") and continents ("Americas").
- Dish pages stop at a 14–48-word definition. On a phone the hero fills the whole first screen; the description starts at 872px on an 812px screen.

## Deliverable 1 · Facet model (one page, for Alex)
Proposal to refine against the data:

| Facet | Cardinality | Starting values |
|---|---|---|
| **Form** (replaces "family") | 1 | dumpling, noodle soup, noodles (dry), soup, stew, curry, rice dish, fried rice, flatbread, bread, pancake & crepe, fritter, kebab & skewer, sandwich & wrap, salad, sauce & dip, pasta, casserole & bake, porridge, cutlet, filled pastry, sweet & dessert, drink, condiment & preserve, other |
| **Course** | 1–2 | breakfast, snack/street food, starter, main, side, dessert, drink |
| **Method** (existing 16, cleaned) | 1–2 | fried, stir-fried, deep-fried, grilled, roasted, baked, braised/stewed, steamed, boiled/poached, raw/cured, fermented |
| **Main ingredient** | 1–3 | beef, pork, chicken, lamb/goat, fish, seafood, egg, dairy, legumes, rice, wheat, corn, vegetables, fruit, tofu/soy |
| **Origin** | country required; sub-region, city and historical region optional | ISO country + free sub-region |
| **Diet flags** | 0–n | vegetarian, vegan, contains pork, contains beef, contains alcohol |

Rules to settle: "X cuisine" disappears as a family because the country already carries it; how multi-country dishes are stored (one origin plus "also eaten in" countries); which facets are visitor-facing filters.

Map every current family and method value to the new model in a table, with a migration note for each.

## Deliverable 2 · Dish page v2 wireframe
Desktop and 375px phone. Blocks in order:
1. Name, native name, origin and a short image (hero no taller than 45% of the phone screen)
2. Definition (the existing short description)
3. **Facts box:** form, course, main ingredients, diet flags, when it's eaten, served hot or cold
4. **How it got here:** 100–200 words, confidence label, "disputed origin" note where relevant
5. **Relatives:** 3–6 dishes with one line on the difference each, plus "Part of: <lineage>"
6. **How it's eaten:** accompaniments, how to order it
7. Sources (numbered, inline references), then "Suggest a source or correction"
8. Map of associations (collapsed on phones)

Every block hides itself when empty. Unevidenced dishes show blocks 1–3, 7 and 8 plus the banner.

## Done when
Alex replies "D5 approved" (or with changes). Save the approved version as `docs/taxonomy.md` and `docs/dish-page-v2.md`. WP-06 and WP-07 start from these files.
