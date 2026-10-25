# Categories merge map — for Alejandro's approval

**Date:** 2026-10-25 · **Status:** 🔴 **PROPOSAL ONLY. Nothing has been changed.** No category was merged, renamed, or deleted. This is a read-only analysis of the live catalog plus a proposed map, awaiting approval.

**Source:** live API (`GET /api/categories` + per-dish `categories[]` across all 121 published dishes), 2026-10-25.

---

## 1. The headline: 109 of 152 categories are orphans

| | Count |
|---|---|
| Categories in the table | **152** |
| Categories actually attached to a dish | **43** |
| Categories attached to **no dish at all** | **109** (71.7%) |

The GUS-011 integrity report called these "86 near-duplicates". That number was wrong in a way that matters: they are not 86 *duplicates* of live categories — they are **109 orphans**, of which 71 are duplicates-in-waiting of a live category and 38 have no live counterpart at all.

**Consequence for this map: merging any of them affects 0 dishes.** Every source category is already orphaned. This is a pure cleanup, not a data migration of dish assignments.

## 2. The 43 live categories (the ones worth keeping)

| Category | Dishes |
|---|---|
| `main-course` | 97 |
| `appetizer` | 25 |
| `indonesian-cuisine` | 16 |
| `soup` | 12 |
| `stew` | 12 |
| `rice-dish` | 11 |
| `street-snack` | 11 |
| `japanese-cuisine` | 10 |
| `chinese-cuisine` | 9 |
| `noodle-soup` | 9 |
| `curry` | 8 |
| `kebab` | 8 |
| `lebanese-cuisine` | 8 |
| `turkish-cuisine` | 7 |
| `bread` | 6 |
| `dumpling` | 6 |
| `indian-cuisine` | 6 |
| `filipino-cuisine` | 5 |
| `italian-cuisine` | 5 |
| `pancake` | 5 |
| `sandwich` | 5 |
| `stir-fry` | 5 |
| `argentine-cuisine` | 4 |
| `mexican-cuisine` | 4 |
| `peruvian-cuisine` | 4 |
| `sauce` | 4 |
| `south-indian-cuisine` | 4 |
| `casserole` | 3 |
| `dessert` | 3 |
| `israeli-cuisine` | 3 |
| `korean-cuisine` | 3 |
| `salad` | 3 |
| `colombian-cuisine` | 2 |
| `ethiopian-cuisine` | 2 |
| `french-cuisine` | 2 |
| `singaporean-cuisine` | 2 |
| `spanish-cuisine` | 2 |
| `thai-cuisine` | 2 |
| `vietnamese-cuisine` | 2 |
| `breaded-cutlet` | 1 |
| `egg-dish` | 1 |
| `fried-rice` | 1 |
| `pasta` | 1 |

## 3. Proposed merge map (71 merges)

All sources are unused orphans. "Dishes" = how many dishes the **target** currently carries.

| Old (unused) | → New | Dishes on target |
|---|---|---|
| `breads-doughs` | `bread` | 6 |
| `enriched-breads` | `bread` | 6 |
| `fried-breads` | `bread` | 6 |
| `laminated-breads-pastries` | `bread` | 6 |
| `laminated-layered-pastries` | `bread` | 6 |
| `leavened-loaves` | `bread` | 6 |
| `flatbreads` | `pancake` | 5 |
| `savory-pancakes-griddled-batters` | `pancake` | 5 |
| `filled-breads` | `sandwich` | 5 |
| `hand-pies-turnovers` | `sandwich` | 5 |
| `sandwiches-stuffed-breads` | `sandwich` | 5 |
| `wraps-rolls` | `sandwich` | 5 |
| `cakes-sponges` | `dessert` | 3 |
| `confections-candies` | `dessert` | 3 |
| `cookies-biscuits` | `dessert` | 3 |
| `custards-puddings` | `dessert` | 3 |
| `fried-sweets` | `dessert` | 3 |
| `frozen-desserts` | `dessert` | 3 |
| `fruit-desserts` | `dessert` | 3 |
| `milk-sweets` | `dessert` | 3 |
| `rice-sticky-rice-sweets` | `dessert` | 3 |
| `sweets-desserts` | `dessert` | 3 |
| `chili-sauces-fermented-pastes` | `sauce` | 4 |
| `dips-spreads` | `sauce` | 4 |
| `nut-seed-sauces-pastes` | `sauce` | 4 |
| `preserves-condiments` | `sauce` | 4 |
| `relishes-chutneys` | `sauce` | 4 |
| `curries-spiced-sauces` | `curry` | 8 |
| `cold-soups` | `soup` | 12 |
| `hot-pots-communal-simmer` | `soup` | 12 |
| `porridges-congees` | `soup` | 12 |
| `soups-broths` | `soup` | 12 |
| `soups-broths-family` | `soup` | 12 |
| `seafood-stews-braises` | `stew` | 12 |
| `stews-braises` | `stew` | 12 |
| `casseroles-baked-layers` | `casserole` | 3 |
| `cured-meats` | `appetizer` | 25 |
| `fritters-croquettes` | `appetizer` | 25 |
| `legume-dishes` | `appetizer` | 25 |
| `offal-nose-to-tail` | `appetizer` | 25 |
| `pates-terrines` | `appetizer` | 25 |
| `sausages-encased-meats` | `appetizer` | 25 |
| `side` | `appetizer` | 25 |
| `small-plates-sides` | `appetizer` | 25 |
| `vegetable-sides` | `appetizer` | 25 |
| `noodle-soups` | `noodle-soup` | 9 |
| `dry-tossed-noodles` | `noodle-soup` | 9 |
| `wok-fried-rice-noodles` | `noodle-soup` | 9 |
| `noodles-pasta` | `pasta` | 1 |
| `fresh-noodles-pasta` | `pasta` | 1 |
| `dumplings` | `dumpling` | 6 |
| `stir-fries` | `stir-fry` | 5 |
| `street-snacks` | `street-snack` | 11 |
| `street-foods-snacks` | `street-snack` | 11 |
| `egg-dishes` | `egg-dish` | 1 |
| `salads-slaws` | `salad` | 3 |
| `grilled-skewered` | `kebab` | 8 |
| `rice-bowls` | `rice-dish` | 11 |
| `rice-grains` | `rice-dish` | 11 |
| `pilafs-seasoned-rice` | `rice-dish` | 11 |
| `rice-cakes-compressed-rice` | `rice-dish` | 11 |
| `barbecue-smoked-foods` | `main-course` | 97 |
| `leaf-wrapped-steamed-foods` | `main-course` | 97 |
| `mains` | `main-course` | 97 |
| `meatballs-koftas` | `main-course` | 97 |
| `moussaka` | `main-course` | 97 |
| `roasts-whole-cooked-meats` | `main-course` | 97 |
| `savory-pies-pastries` | `main-course` | 97 |
| `steamed-buns` | `main-course` | 97 |
| `stuffed-vegetables` | `main-course` | 97 |
| `tortilla-masa-dishes` | `main-course` | 97 |

## 4. Proposed deletions (25 orphans with no live counterpart)

All unused. All are `X-cuisine` country tags — and per the OPERATIONS.md rule, **country/cuisine singletons should not be categories at all** (geography belongs in `/regions`):

| Old | Reason |
|---|---|
| `american-cuisine` | unused cuisine tag |
| `austrian-cuisine` | unused cuisine tag |
| `bahian-cuisine` | unused cuisine tag |
| `brazilian-cuisine` | unused cuisine tag |
| `british-cuisine` | unused cuisine tag |
| `canadian-cuisine` | unused cuisine tag |
| `caribbean-cuisine` | unused cuisine tag |
| `goan-cuisine` | unused cuisine tag |
| `greek-cuisine` | unused cuisine tag |
| `hungarian-cuisine` | unused cuisine tag |
| `jordanian-cuisine` | unused cuisine tag |
| `maghrebi-cuisine` | unused cuisine tag |
| `moroccan-cuisine` | unused cuisine tag |
| `nepali-cuisine` | unused cuisine tag |
| `nigerian-cuisine` | unused cuisine tag |
| `northern-thai-cuisine` | unused cuisine tag |
| `polish-cuisine` | unused cuisine tag |
| `portuguese-cuisine` | unused cuisine tag |
| `ukrainian-cuisine` | unused cuisine tag |
| `coffee-traditions` | drink taxonomy with no live counterpart |
| `cold-drinks-refreshers` | drink taxonomy with no live counterpart |
| `drinks` | drink taxonomy with no live counterpart |
| `herbal-tonic-drinks` | drink taxonomy with no live counterpart |
| `hot-brews-spiced-drinks` | drink taxonomy with no live counterpart |
| `tea-traditions` | drink taxonomy with no live counterpart |

## 5. Need your decision (13 orphans with no obvious home)

These are legitimate *concepts* (fermented foods, cooking techniques, cheese, raw fish) but there is no live category that subsumes them, and the dishes that would use them have no such category today. Three options per row:

| Orphan | Option A | Option B | Option C |
|---|---|---|---|
| `fermented` | keep as a new canonical, attach to fermented dishes | merge into `main-course` | delete |
| `fermented-mains` | keep as new canonical | merge into `main-course` | delete |
| `fermented-drinks` | keep as new canonical | merge into `main-course` | delete |
| `fermentation-starters` | keep as new canonical | merge into `main-course` | delete |
| `pickles-ferments` | keep as new canonical | merge into `main-course` | delete |
| `aromatic-bases` | keep as new canonical | merge into `sauce` | delete |
| `batters-coatings` | keep as new canonical | merge into `main-course` | delete |
| `marinades-rubs` | keep as new canonical | merge into `sauce` | delete |
| `spice-pastes-cooking-bases` | keep as new canonical | merge into `sauce` | delete |
| `stocks-broths-bases` | keep as new canonical | merge into `soup` | delete |
| `techniques-bases` | keep as new canonical | merge into `main-course` | delete |
| `cheeses-cultured-dairy` | keep as new canonical | merge into `appetizer` | delete |
| `raw-cured-fish` | keep as new canonical | merge into `main-course` | delete |

My recommendation: **Option A for `fermented` / `fermented-mains` / `pickles-ferments` / `fermentation-starters`** (fermentation is a real culinary axis the ROADMAP's entity model wants — EPIC 02), **Option C (delete) for the rest** until something actually uses them.

## 6. What the execution would look like (if approved)

- 109 source rows → 43 live + 13 new = **56 canonical categories** (from 152).
- **0 dishes change their category assignments** — every source is an orphan. Nothing visible on the site moves.
- No schema change. The `categories` table has no `merged_into` column, so the merge is "repoint `dish_categories.category_id` from the source id to the target id, then delete the source row". Since no dish points at a source, the repoint is a no-op and the delete is the whole job.
- **RULES.md approval required**: this deletes rows from `categories`. I will not touch it until you approve.

## 7. Corrections this makes to GUS-011's report

| GUS-011 said | Actually |
|---|---|
| "86 near-duplicate categories" | 109 unused categories: 71 duplicates of a live one, 25 orphans with no live counterpart, 13 needing a decision |
| implies merges affect dishes | 0 dishes affected — every source is already an orphan |
| "no duplicate slugs / no orphan refs" | true for dishes, but the `categories` table itself is 72% orphaned |

The GUS-011 report should be amended with these numbers.
