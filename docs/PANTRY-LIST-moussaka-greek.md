# Stage A — the pantry list for `moussaka-greek`

**Status: PROPOSED for the owner's approval. This is Gate A. Nothing here
has been written to any database.**

Card: `t_035fd835` · Lane: DB · Pilot dish: `moussaka-greek`
Source: `docs/RECIPES-INGREDIENT-BACKFILL-PLAN.md` §STAGE A / Gate A

---

## What this is

The list of ingredients the first-wave recipe for `moussaka-greek` needs.
It is a **document**, not rows. Stage B (the INSERTs) is a separate card
and needs this list approved first.

**No database write has been made.** Not one INSERT, not one UPDATE, not
one draft row. The list below was read out of the test database and out
of the live read-only API, and written down here.

Descriptions are **not** in scope: a description is a claim, and a claim
needs a source (ADR-007-A1 §4.3). Every row below carries no description
and `status` would be `draft` if it were written.

---

## The pantry list

| # | name | slug | category | needed_by | in the DB today |
|---|---|---|---|---|---|
| 1 | Eggplant | `eggplant` | `solanacea` | `moussaka-greek` | **exists**, category empty |
| 2 | Lamb, minced | `lamb-mince` | `mammals-meat` | `moussaka-greek` | **exists**, category empty |
| 3 | Tomato | `tomato` | `other-fruiting-vegetables` | `moussaka-greek` | **exists**, category empty |
| 4 | Béchamel sauce | `bechamel` | `savoury-sauces` | `moussaka-greek` | **exists**, category empty |
| 5 | Onion | `onion` | `onions-and-similar` | `moussaka-greek` | new |
| 6 | Garlic | `garlic` | `garlic-and-similar` | `moussaka-greek` | new |
| 7 | Potato | `potato` | `potatoes-and-similar` | `moussaka-greek` | new |
| 8 | Carrot | `carrot` | `carrots-and-similar` | `moussaka-greek` | new |
| 9 | Egg | `whole-egg` | `whole-eggs` | `moussaka-greek` | new |
| 10 | Milk | `whole-milk` | `milk` | `moussaka-greek` | new |
| 11 | Flour | `wheat-flour` | `cereal-and-cereal-like-flours` | `moussaka-greek` | new |
| 12 | Butter | `cultured-butter` | `butter` | `moussaka-greek` | new |
| 13 | Olive oil | `olive-oil` | `vegetable-fats-and-oils-edible` | `moussaka-greek` | new |
| 14 | Salt | `table-salt` | `seasonings` | `moussaka-greek` | new |
| 15 | Black pepper | `black-pepper` | `fruit-spices` | `moussaka-greek` | new |
| 16 | Bay leaf | `bay-leaf` | `dried-herbs` | `moussaka-greek` | new |
| 17 | Nutmeg | `nutmeg` | `seed-spices` | `moussaka-greek` | new |
| 18 | Cinnamon | `cinnamon` | `bark-spices` | `moussaka-greek` | new |
| 19 | Allspice | `allspice` | `fruit-spices` | `moussaka-greek` | new |
| 20 | Kefalotyri | `kefalotyri` | `brined-cheese-feta-type-and-similar` | `moussaka-greek` | new |

**20 rows, 19 distinct categories, no ingredient twice.**

Four rows REUSE an existing `ingredients` row (rows 1–4 — the four that
`dish_ingredients` already points at). Sixteen are new.

---

## Where the ingredient list came from

The plan is explicit that "the list comes from the recipes, not from a
catalogue" (ADR-007-A1 §3.5), and that Stage A needs a draft-only
recipe corpus. The pilot corpus for this dish is what the repository
already holds:

| source | what it contributes |
|---|---|
| `packages/db/seed-moussaka.sql` → `dish_ingredients` | the 4 structured ingredient rows: eggplant, lamb-mince, tomato, bechamel |
| `packages/db/seed-moussaka.sql` → `dish_preparations.steps` | the prose: "Brown the minced lamb with **onion** and **garlic**. Add **tomatoes**, **cinnamon**, and a pinch of **allspice**." and "Layer fried **eggplant** slices and the meat sauce in a baking dish. Pour **béchamel** on top, sprinkle with **kefalotyri**." |
| `docs/RECIPES-INGREDIENT-BACKFILL-PLAN.md` §4 (the pilot corpus note) | the remaining béchamel components and seasonings: potato, carrot, egg, milk, flour, butter, olive oil, salt, pepper, bay leaf, nutmeg |

Every row above traces to one of those three. Nothing was invented.

### The `bechamel` question, answered

`bechamel` is a **prepared form** — a sauce, not a food material. Per the
plan's slug rule, a prepared form is its own ingredient, and the DB
models that with `ingredients` → `ingredient_variants`
(`variant_id` on `dish_ingredients`). So:

* `bechamel` stays ONE ingredient row (it already exists), and
* its components — milk, flour, butter, egg — are separate rows in this
  list, because the recipe uses them.

That is the plan's own reading: "close to the ~30 target **with the
béchamel sauce's own components counted**".

---

## The four namespace collisions, and how they are resolved

The plan warns: "a category slug is not an ingredient slug, but they
share a namespace in practice, and confusing the two is the most likely
way to create a duplicate."

Checked mechanically against all 435 category slugs and all existing
ingredient slugs: **four** of the obvious ingredient slugs are already
category slugs.

| ingredient slug | is also a category slug | the category it would shadow |
|---|---|---|
| `egg` | yes | `egg` (child of `whole-eggs`) |
| `milk` | yes | `milk` (child of `milk-and-dairy-products`) |
| `salt` | yes | `salt` (child of `seasonings`) |
| `butter` | yes | `butter` (child of the fats-and-oils class) |

Resolved by qualifying the ingredient slug with the material — which
keeps the slug English, singular, lowercase and hyphenated, and stops
the ingredient from being mistaken for a category:

| ingredient slug | category slug | why this form |
|---|---|---|
| `whole-egg` | `whole-eggs` | the FoodOn class is `whole eggs`; the material is the whole egg |
| `whole-milk` | `milk` | distinguishes cow's milk as the material |
| `table-salt` | `seasonings` | the culinary salt, as opposed to any other seasoning |
| `cultured-butter` | `butter` | the churned dairy-fat material |

Each qualified slug was checked against all 435 category slugs: **none
of them collides.** The other sixteen slugs do not collide either.

**This is a naming decision, and it is the owner's.** The alternative is
to accept the collision and let the ingredient slug be the bare word.
That is what the four existing project rows do — `bechamel`, `bread`,
`cheese` exist as BOTH a category slug and an ingredient slug — so
there is precedent for the collision being tolerated. The plan says it
is "the most likely way to create a duplicate", and this list is the
place to decide. Flagging it rather than deciding it.

---

## The category assignments

Every category is a real row in `ingredient_categories`, and every one of
those rows carries a FoodOn identifier. The definitions below are
FoodOn's own (EFSA FOodex2 classes), fetched from the OLS4 API and
checked against the class the repository publishes.

| category | FoodOn | FoodOn's own definition (abridged) | used for |
|---|---|---|---|
| `solanacea` | FOODON:03540631 | "fruiting vegetables classified under the family Solanaceae Juss" | eggplant |
| `mammals-meat` | FOODON:03541910 | "any type of meat … from all mammals" | lamb mince |
| `other-fruiting-vegetables` | FOODON:03540707 | "other fruiting vegetables" (the group not named elsewhere in the EU pesticide regulation) | tomato |
| `savoury-sauces` | FOODON:03544091 | "any type of savoury sauces" | béchamel |
| `onions-and-similar` | FOODON:03540578 | "onions or similar bulbs" | onion |
| `garlic-and-similar` | FOODON:03540575 | "garlic or similar bulbs" | garlic |
| `potatoes-and-similar` | FOODON:03540957 | "potatoes or similar tubers" | potato |
| `carrots-and-similar` | FOODON:03540711 | "carrots or similar vegetables" | carrot |
| `whole-eggs` | FOODON:03542950 | "birds eggs" | egg |
| `milk` | FOODON:03542651 | "milk … secreted by mammals" | milk |
| `cereal-and-cereal-like-flours` | FOODON:03540067 | "any type of cereal and cereal-like flours, i.e. finely milled grains" | flour |
| `butter` | FOODON:03543148 | "a fat emulsion obtained from dairy cream … by churning" | butter |
| `vegetable-fats-and-oils-edible` | FOODON:03543093 | "any type of vegetable fats and oils, edible" | olive oil |
| `seasonings` | FOODON:03544052 | "any type of seasonings" | salt |
| `fruit-spices` | FOODON:03541368 | "any type of fruit used as spices" | black pepper, allspice |
| `dried-herbs` | FOODON:03541260 | "the dried aromatic vegetative part of any type of herbs" | bay leaf |
| `seed-spices` | FOODON:03541290 | "any type of seed used as spices" | nutmeg |
| `bark-spices` | FOODON:03541340 | "any type of bark used as spices" | cinnamon |
| `brined-cheese-feta-type-and-similar` | FOODON:03542751 | "brined cheese (feta-type and similar)" | kefalotyri |

Two assignments are worth a second look, because they are the ones a
curator would argue about:

* **black pepper → `fruit-spices`.** Black pepper is the dried fruit of
  *Piper nigrum*, so `fruit-spices` is the FoodOn-correct class.
  `seed-spices` (nutmeg) and `bark-spices` (cinnamon) are the two other
  botanical classes, and all three are the categories the vocabulary
  actually offers for those materials.
* **allspice → `fruit-spices`.** Allspice is a dried berry. It is a
  blend, but the material is a fruit, so it lands in the same class.

Both are the owner's to confirm or overrule.

### One category that is NOT a catch-all

`other-fruiting-vegetables` for tomato is *not* an "other" bucket. It is
a named EFSA FOodex2 class: the group of fruiting vegetables not named
elsewhere in the EU pesticide regulation. Tomato is in it. The owner's
"No 'other' bucket" rule is about the vocabulary, and this row is a
real class with a real FoodOn identifier — but it is close enough to the
word "other" that it is flagged here for a deliberate yes.

---

## The Gate A questions

Per the plan, Gate A is checked by Alejandro, name by name, against
§3.2's questions. The ones this list raises:

1. **Is "béchamel sauce" one ingredient or its components?** — Proposed:
   one ingredient (`bechamel`), plus its components as separate rows,
   because the recipe uses them. See the section above.
2. **Is "lamb, minced" its own ingredient, or is it "lamb" with a
   variant?** — Proposed: its own ingredient, `lamb-mince`, per the
   plan's "a prepared form is its own ingredient" rule. It already
   exists as a row. The alternative is an `ingredients` row `lamb` plus
   an `ingredient_variants` row for the mince, referenced through
   `dish_ingredients.variant_id`. The plan's rule says the first, and
   that is what is proposed.
3. **The four qualified slugs** (`whole-egg`, `whole-milk`, `table-salt`,
   `cultured-butter`) — are these the names the owner wants, or should
   the bare words be used and the collision tolerated?

---

## What is NOT decided here

* **The `bechamel` / `bechamel-sauce` duplicate on live.** The live
  ingredient list serves FIVE rows, and two of them are the same thing:
  `bechamel` ("Béchamel sauce", used by 1 dish) and `bechamel-sauce`
  ("Béchamel sauce", used by 0 dishes). The test database has only
  `bechamel`. The pantry list reuses `bechamel` — the one that is
  actually used. The orphan is not touched by this card; it is
  reported here because the pantry list is the thing that would resolve
  it.
* **The Greek-language names.** ADR-007-A1 §4.1 says the canonical name
  is in the dish's own language, and `moussaka-greek` is Greek. The
  `name` column above is the English name. Whether Stage B writes the
  Greek name into `canonical_name` and the English into
  `ingredient_translations`, or the other way round, is the owner's
  call and is not decided by this list.
* **`source_language`.** The plan's Stage A table has a
  `source_language` column. It is not repeated per row above because it
  is a property of the DISH (Greek), not of the ingredient — every row
  in this list has `source_language = el` for the dish's own name. The
  slug is the English identity, per the slug rule.
* **`status`.** No row carries a source, so no row would carry a
  description. If Stage B writes these rows, they go in with
  `status = 'draft'` and empty descriptions.

---

## How this was checked

| check | result |
|---|---|
| every `category` exists in `ingredient_categories` | 20/20 ✓ |
| every `category` has a FoodOn identifier | 20/20 ✓ (19 distinct classes) |
| no slug appears twice in the list | 20/20 ✓ |
| no slug collides with any of the 435 category slugs | 20/20 ✓ |
| no slug reinvents an existing `ingredients` row | 4 reused, 16 new, 0 duplicated ✓ |
| every existing `ingredients` row appears in the list | 4/4 ✓ |
| every slug is English, singular, lowercase, hyphenated | 20/20 ✓ |
| no prepared form is merged with its base ingredient | ✓ |
| no dish is listed as an ingredient | ✓ |
| no database write | ✓ — read-only queries only |

The category vocabulary was read from the test database
`gustale_t_035fd835`, where the full migration chain (including the new
0054) has been applied. The live database was read through the public
read-only API only.
