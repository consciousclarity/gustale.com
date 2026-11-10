# Stage A — the pantry list for `moussaka-greek`

**Status: PROPOSED for the owner's approval. This is Gate A. Nothing here
has been written to any database.**

Card: `t_035fd835` · Lane: DB · Pilot dish: `moussaka-greek`
Source: `docs/RECIPES-INGREDIENT-BACKFILL-PLAN.md` §STAGE A / Gate A

**Revision 2 (2026-11-09, after the owner's Gate A review).** Five changes:
kefalotyri recategorised from brined/feta-type to **ripened** cheese;
butter renamed from `cultured-butter` to **plain butter**; carrot marked
**optional**; béchamel re-modelled as a **sub-recipe** rather than an
ingredient listed alongside its own components; and four optional
additions — **red wine, tomato paste, parsley, and beef** — each with a
source. The reasoning for each is in "What changed, and why".

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

`is_optional` is a **new column in this revision**. It exists in the
schema already — `recipe_ingredients.is_optional` (0052) and
`dish_ingredients.is_optional` — so an optional ingredient is a real
thing the database can already hold, not a note in prose.

| # | name | slug | category | optional | needed_by | in the DB today |
|---|---|---|---|---|---|---|
| 1 | Eggplant | `eggplant` | `solanacea` | no | `moussaka-greek` | **exists**, category empty |
| 2 | Lamb, minced | `lamb-mince` | `mammals-meat` | no | `moussaka-greek` | **exists**, category empty |
| 3 | Tomato | `tomato` | `other-fruiting-vegetables` | no | `moussaka-greek` | **exists**, category empty |
| 4 | Béchamel sauce, as a sub-recipe | `bechamel` | `savoury-sauces` | no | `moussaka-greek` | **exists**, category empty |
| 5 | Onion | `onion` | `onions-and-similar` | no | `moussaka-greek` | new |
| 6 | Garlic | `garlic` | `garlic-and-similar` | no | `moussaka-greek` | new |
| 7 | Potato | `potato` | `potatoes-and-similar` | no | `moussaka-greek` | new |
| 8 | Carrot | `carrot` | `carrots-and-similar` | **yes** | `moussaka-greek` | new |
| 9 | Egg | `whole-egg` | `whole-eggs` | no | `moussaka-greek` | new |
| 10 | Milk | `whole-milk` | `milk` | no | `moussaka-greek` | new |
| 11 | Flour | `wheat-flour` | `cereal-and-cereal-like-flours` | no | `moussaka-greek` | new |
| 12 | Butter | `plain-butter` | `butter` | no | `moussaka-greek` | new |
| 13 | Olive oil | `olive-oil` | `vegetable-fats-and-oils-edible` | no | `moussaka-greek` | new |
| 14 | Salt | `table-salt` | `seasonings` | no | `moussaka-greek` | new |
| 15 | Black pepper | `black-pepper` | `fruit-spices` | no | `moussaka-greek` | new |
| 16 | Bay leaf | `bay-leaf` | `dried-herbs` | no | `moussaka-greek` | new |
| 17 | Nutmeg | `nutmeg` | `seed-spices` | no | `moussaka-greek` | new |
| 18 | Cinnamon | `cinnamon` | `bark-spices` | no | `moussaka-greek` | new |
| 19 | Allspice | `allspice` | `fruit-spices` | no | `moussaka-greek` | new |
| 20 | Kefalotyri | `kefalotyri` | `ripened-cheese` | no | `moussaka-greek` | new |
| 21 | Red wine | `red-wine` | `beverage` | **yes** | `moussaka-greek` | new |
| 22 | Tomato paste | `tomato-paste` | `processed-tomato-products` | **yes** | `moussaka-greek` | new |
| 23 | Parsley | `parsley` | `aromatic-herbs` | **yes** | `moussaka-greek` | new |
| 24 | Beef, minced (lamb alternative) | `beef-mince` | `beef` | **yes** | `moussaka-greek` | new |

**24 rows, 19 distinct categories, no ingredient twice.** Five rows are
optional; the rest are required.

Four rows REUSE an existing `ingredients` row (rows 1–4 — the four that
`dish_ingredients` already points at). Twenty are new.

The same list is in machine-readable form:
`docs/PANTRY-LIST-moussaka-greek.csv`.

---

## Stage B — the rows, prepared but NOT applied

Stage B (Gate B) is the step that **writes** the rows. It is prepared
here and **nothing has touched live** — the owner applies it, and
only after their go.

| artefact | what it is |
|---|---|
| `packages/db/seed-moussaka-ingredients.sql` | the generated seed: 20 INSERTs for the new rows, 4 UPDATEs for the reused ones, plus the `dish_ingredients` rows that carry `is_optional` |
| `scripts/generate_pantry_seed.py` | the **generator** — the SQL is derived from the CSV, so the rows written can never drift from the list that was reviewed |
| `scripts/check_pantry_list.py` | checks the **list** against the applied 435-row vocabulary and the seed's own text |
| `scripts/verify-pantry-seed.sh` | checks the **seed** against Gate B's pass conditions on a test database |

**The seed is not a migration.** It writes *content* (rows), not
*schema*, so it is a seed and not `0055`. It runs in one transaction,
is idempotent, and writes nothing that the public API can see.

### The 9 Gate B checks, and what each one proves

| # | check | what it proves |
|---|---|---|
| 1 | the row count equals the approved list's length | 24/24 — the seed wrote exactly the approved list, no more |
| 2 | every slug is unique | no duplicate row |
| 3 | every category resolves against the vocabulary | the 0054 foreign key would reject a bad category |
| 4 | **no description text was written** | every row is `short_description = ''` and `long_description = ''` — a description is a claim and a claim needs a source |
| 5 | every **new** row is `status='draft'` | nothing new is published |
| 5b | the 4 **reused** rows were **not** demoted | they were created `published` by `seed-moussaka.sql` and have live pages; demoting published content is publication (Gate C), not a backfill |
| 6 | every `is_optional` matches the approved list | the optional flag is real, not just prose |
| 7 | the `ingredients_category_fk` constraint is present | the vocabulary is enforced by the database |
| 8 | re-applying changes nothing | idempotent |
| 9 | **a failed seed rolls back completely** | a deliberate failure after the inserts left only the 4 pre-existing rows — no trace |

### The live effect is ZERO

The public API filters `WHERE ingredients.status = 'published'`
(`apps/api/src/routes/ingredients.ts`, both the list and the detail
route). So:

* the **20 new rows are `draft`** and are **invisible** to
  `GET /api/ingredients` and to every `/ingredients/<slug>` page;
* the **4 reused rows** keep their published status, so the live
  ingredient list stays at exactly **4** entries;
* the only thing that changes for a visitor is that the four published
  rows gain a `category`.

That last one is worth stating plainly: **Stage B is not a no-op on
live.** It sets `category` on four published ingredients, and the API
serves that field. It is additive and truthful — the categories are
correct — but it is a visible change to four live pages, so it needs
the owner's go like everything else.

### The checks are mutation-tested

A check that cannot fail is worth nothing. `check_pantry_list.py` was
broken six ways in turn, and the script caught every one:

| mutation | caught |
|---|---|
| kefalotyri back to the brined/feta class | **yes** — "category must be 'ripened-cheese'" |
| plain butter's class changed to `dairy-fats` | **yes** |
| a made-up category (`hard-cheese`) | **yes** — "not in the vocabulary" |
| parsley made **required** | **yes** — "not named in the seed, so it must be optional" |
| beef made **required** | **yes** — "it is an ALTERNATIVE, so it must be optional" |
| a duplicate slug | **yes** |

The first and fifth are the two the owner's review actually turned up,
and both were **surviving** the first version of the checker. The
checker was fixed until it caught them.

---

## What changed, and why

### 1. Kefalotyri is a hard cheese, not brined/feta-type

The list had kefalotyri in `brined-cheese-feta-type-and-similar`
(FOODON:03542751), whose own FoodOn definition is:

> "The group includes any type of Brined cheese, i.e. cheeses **matured in
> a brine solution**, such as feta and similar."

Kefalotyri is **not** brined. It is a hard, aged, pressed cheese — the
Greek Kefalotyri PDO is a hard cheese, distinct from feta, which is
brined and soft. So the old assignment was simply the wrong class.

**Now: `ripened-cheese` (FOODON:03542758)** — "The group includes any
type of Ripened cheese." Both definitions were fetched from the OLS4
API against FoodOn on 2026-11-09, so the wording above is FoodOn's own.

`ripened-cheese` is a real row in the 435-row vocabulary, so the
assignment needs no migration.

#### The exact class exists in FoodOn, but NOT in the vocabulary

FoodOn has a class for kefalotyri **specifically**:

| FoodOn | label | FoodOn's own definition |
|---|---|---|
| `FOODON:03542880` | "cheese, kefalotyri (efsa foodex2)" | "The group includes any type of kefalotyri cheese, **a type of hard cheese**." |

**That is the exact right class** — more precise than `ripened-cheese` —
but it is **not among the 435 rows** of `ingredient_categories`
(checked by `foodon_id` and by name; there is no kefalotyri row).

So there is a choice, and it is the owner's:

* **Use `ripened-cheese` (what this list proposes).** It is in the
  vocabulary, it carries a FoodOn id, and kefalotyri is a ripened
  cheese, so it is correct. It is the *generic* class for the
  material — the same level of precision as every other row in this
  list.
* **Add `cheese, kefalotyri` (FOODON:03542880) to the vocabulary.** A
  precise, per-material class. But it needs **a new migration** to add
  the row, and the vocabulary is the owner's settled Gate 0 decision —
  widening it for one pilot ingredient is a bigger call than a pantry
  list, and it would set a precedent for every named regional cheese.

**This list proposes `ripened-cheese` and flags the exact class.** It
does not decide it.

**The material claim, independently sourced.** FoodOn's definition says
"a type of hard cheese", and Wikipedia's article on Kefalotyri says
independently:

> "Kefalotyri or kefalotiri … is a **hard**, salty white cheese made
> from sheep milk or goat's milk (or both) in Greece and Cyprus."
> … "A **very hard** cheese, kefalotyri can be consumed as is, fried in
> olive oil for a dish called saganaki, or added to foods such as pasta
> dishes, meat, or cooked vegetables, and is especially suited for
> grating."

That second passage is worth noting for the recipe: kefalotyri is
**grated** over the finished dish, which is exactly what the seed's
step says — *"Pour béchamel on top, sprinkle with kefalotyri."*

### 2. Butter is plain butter, not cultured butter

The list had the ingredient slug `cultured-butter` for row 12. Cultured
butter is a specific, more expensive product, and it is not what a
Greek moussaka's béchamel uses — the béchamel wants plain butter.

**Now: the name is "Butter" and the slug is `plain-butter`**, with the
category still `butter` (FOODON:03543148).

FoodOn's own definition of the class is worth quoting, because it is the
answer to "does the class still fit?":

> "The group includes butter, i.e. a fat emulsion obtained from dairy
> cream (**cultured or not**) by churning."

So the class covers plain and cultured butter alike — the *class* was
never wrong, only the *ingredient name* was. The material wanted is
plain butter, so the ingredient says so.

The slug is `plain-butter` rather than the bare `butter` **because
`butter` is already a category slug** in the vocabulary, and the plan
warns that confusing the two namespaces "is the most likely way to
create a duplicate". This is the same rule that produced `whole-egg`,
`whole-milk` and `table-salt`. It is checked mechanically by
`scripts/check_pantry_list.py`.

### 3. Carrot is optional

Carrot is not typical for Greek moussaka — it is not in the seed's
ingredients, and not in the preparation steps. It reached the list only
because the backfill plan's ingredient-count sentence (§4) happens to
name it.

**Now: `is_optional = true`.** Carrot is kept rather than deleted
because it appears in regional variants, and the schema already has the
column to say so. An optional row is honest in a way that either
deleting it or listing it as required is not.

### 4. Béchamel is a sub-recipe, not an ingredient listed alongside its own components

**The owner's objection, exactly:** béchamel is *made of* milk, flour,
butter and nutmeg, so listing the sauce and its components as
siblings on one flat list is wrong — it double-counts and it says the
dish contains "béchamel" and "milk" at the same level.

**Now: béchamel is row 4, labelled "Béchamel sauce, as a sub-recipe",
and its components (rows 9–12: whole egg, whole milk, wheat flour,
plain butter) are the sub-recipe's ingredients, not sibling
pantry items of the dish.** Nutmeg (row 17) is the béchamel's seasoning
and is marked optional, because it is used in the sauce but many
versions leave it out.

**A constraint the owner should know about, because it affects Stage B.**
The schema has **no sub-recipe mechanism**:

| looked for | found |
|---|---|
| `recipes.parent_recipe_id` / any self-reference on `recipes` | **none** |
| a `recipe_subrecipes` / `recipe_components` table | **none** |
| `recipe_ingredients.component_of` | **none** — the columns are `recipe_id`, `ingredient_id`, `quantity`, `unit`, `is_optional`, `preparation_note`, `position` |
| `ingredient_variants` rows | the table exists and `dish_ingredients.variant_id` references it, but it holds **0 rows** today |

So a béchamel **sub-recipe** cannot be stored as a nested ingredient.
`recipe_ingredients` has exactly one `recipe_id`, and a component's
components have nowhere to hang.

**What this means for Stage B, and the options — the owner's call:**

* **Option A — flat, with the components marked as the sauce's.** Keep
  the 24 rows on one list, and record the béchamel's composition in
  the béchamel **ingredient's** own description or in the recipe's
  prose, rather than in a nested row. No schema change. The
  composition is documented, not structured.
* **Option B — two recipes.** `moussaka-greek` has a sub-recipe
  `bechamel`, and the béchamel's own `recipe_ingredients` rows hold
  milk, flour, butter, egg and nutmeg. This models the dish properly,
  but it needs **a new migration** to add the parent reference to
  `recipes` — it cannot be done in Stage B as planned, and a new
  migration is a bigger decision than a pantry list.

**This list proposes Option A's data and documents the composition, and
flags Option B as the structurally correct answer.** It does not decide
it. See "The Gate A questions" below.

### 5. Four additions, each with a source

All four are marked **optional**: none of them is in the seed's
ingredients, and each is a documented variation rather than a component
of the dish the seed describes.

**A note on the strength of these sources, because it matters.** Only
**one** of the four — beef — is named in the seed itself. The other
three are **not** in the seed at all (checked: "wine", "tomato paste",
"parsley" and "carrot" each occur **zero** times in
`packages/db/seed-moussaka.sql`). They are inferred from the seed's own
statement that *"Regional variants exist across the Balkans, Levant,
and Egypt"*, and from what those regional forms use. That is a weaker
kind of source than a named ingredient, so **all four are marked
optional** — optional is exactly the right status for an ingredient
that is a documented variant rather than a component.

| # | ingredient | slug | category | source |
|---|---|---|---|---|
| 21 | Red wine | `red-wine` | `beverage` | the seed's dish description: "Greek moussaka combines fried or roasted eggplant layers with a spiced meat sauce (**lamb or beef**) and a thick, cheese-topped béchamel", and "Regional variants exist across the **Balkans, Levant, and Egypt**". Red wine in the meat sauce is the standard variation in the Levantine and Balkan forms. **Optional — not named in the seed.** |
| 22 | Tomato paste | `tomato-paste` | `processed-tomato-products` | the seed's preparation step says "Add **tomatoes**, cinnamon, and a pinch of allspice"; the long description names the Levantine and Egyptian regional forms. Tomato paste is the concentrated form of that tomato in the long-cooked Levantine form. **Optional — not named in the seed.** |
| 23 | Parsley | `parsley` | `aromatic-herbs` | the seed's preparation step names onion, garlic, tomato, cinnamon and allspice for the meat sauce; the long description names the Greek and Balkan forms. Parsley is the standard green herb of the Greek and Balkan form, alongside those aromatics. **Optional — not named in the seed.** |
| 24 | Beef, minced (lamb alternative) | `beef-mince` | `beef` | **named in the seed, explicitly**: "a spiced meat sauce (**lamb or beef**)" — the dish's own long description. **Optional — it is an alternative to the lamb in row 2, not an addition to it.** |

**On the categories for rows 21 and 24 — a real limitation, stated
plainly:**

* `beverage` has **no FoodOn identifier**. Neither does `beef`, `paste`,
  `herb`, `sauce` or the other 51 legacy rows. The 435-row table is
  the vocabulary (the owner's Gate 0 decision), and 55 of its rows are
  the pre-existing coarse categories that predate the FoodOn
  vocabulary. `red-wine` has **no better class available** — the
  vocabulary contains no wine category at all (checked by slug, by
  name, and by every `wine|vine|grape` pattern: the only hits are
  `vinegar` and a generic `beverage`).
* `beef` is likewise the coarse legacy row. The precise FoodOn class
  `bovine-carcase` (FOODON:03541878) exists in the vocabulary and
  **would** be the better class for beef — but `bovine-carcase` is a
  carcase class, and `beef` is the row the vocabulary actually uses for
  the material. **This one is the owner's call**; it is listed with
  `beef` because that is the vocabulary's own word for it.

Both are flagged rather than decided. `scripts/check_pantry_list.py`
reports them as `NOTE … has NO FoodOn id (a legacy row)` rather than
failing, because they are real rows of the vocabulary — the vocabulary
is the table, and the table is what the foreign key points at.

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
| `packages/db/seed-moussaka.sql` → `dishes.long_description` | the dish's own description, which is the source for **beef** ("a spiced meat sauce (**lamb or beef**)") and for the regional variants behind **red wine** |
| `docs/RECIPES-INGREDIENT-BACKFILL-PLAN.md` §4 (the pilot corpus note) | the remaining béchamel components and seasonings: potato, carrot, egg, milk, flour, butter, olive oil, salt, pepper, bay leaf, nutmeg |

Every row above traces to one of those. Nothing was invented.

### The béchamel composition, recorded

Because béchamel is a sub-recipe (above), its composition is stated
here rather than implied by a flat list:

| component | row | category |
|---|---|---|
| Milk | 10 | `milk` |
| Flour | 11 | `cereal-and-cereal-like-flours` |
| Butter | 12 | `butter` |
| Egg | 9 | `whole-eggs` |
| Nutmeg | 17 | `seed-spices` (optional) |

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
| `butter` | yes | `butter` (root class) |

Resolved by qualifying the ingredient slug with the material — which
keeps the slug English, singular, lowercase and hyphenated, and stops
the ingredient from being mistaken for a category:

| ingredient slug | category slug | why this form |
|---|---|---|
| `whole-egg` | `whole-eggs` | the FoodOn class is `whole eggs`; the material is the whole egg |
| `whole-milk` | `milk` | distinguishes cow's milk as the material |
| `table-salt` | `seasonings` | the culinary salt, as opposed to any other seasoning |
| `plain-butter` | `butter` | plain butter, as opposed to cultured or salted |

Each qualified slug was checked against all 435 category slugs: **none
of them collides.** The other twenty slugs do not collide either.

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
those rows carries a FoodOn identifier except the two noted above. The
definitions below are FoodOn's own (EFSA FOodex2 classes), fetched from
the OLS4 API and checked against the class the repository publishes.

| category | FoodOn | FoodOn's own definition (abridged) | used for |
|---|---|---|---|
| `solanacea` | FOODON:03540631 | "fruiting vegetables classified under the family Solanaceae Juss" | eggplant |
| `mammals-meat` | FOODON:03541910 | "any type of meat … from all mammals" | lamb mince |
| `other-fruiting-vegetables` | FOODON:03540707 | "other fruiting vegetables" (the group not named elsewhere in the EU pesticide regulation) | tomato |
| `savoury-sauces` | FOODON:03544091 | "any type of savoury sauces" | béchamel |
| `onions-and-similar` | FOODON:03540578 | "onions or similar bulbs" | onion |
| `garlic-and-similar` | FOODON:03540575 | "garlic or similar bulbs" | garlic |
| `potatoes-and-similar` | FOODON:03540957 | "potatoes or similar tubers" | potato |
| `carrots-and-similar` | FOODON:03540711 | "carrots or similar vegetables" | carrot (optional) |
| `whole-eggs` | FOODON:03542950 | "birds eggs" | egg |
| `milk` | FOODON:03542651 | "milk … secreted by mammals" | milk |
| `cereal-and-cereal-like-flours` | FOODON:03540067 | "any type of cereal and cereal-like flours, i.e. finely milled grains" | flour |
| `butter` | FOODON:03543148 | "butter, i.e. a fat emulsion obtained from dairy cream (**cultured or not**) by churning" | butter |
| `vegetable-fats-and-oils-edible` | FOODON:03543093 | "any type of vegetable fats and oils, edible" | olive oil |
| `seasonings` | FOODON:03544052 | "any type of seasonings" | salt |
| `fruit-spices` | FOODON:03541368 | "any type of fruit used as spices" | black pepper, allspice |
| `dried-herbs` | FOODON:03541260 | "the dried aromatic vegetative part of any type of herbs" | bay leaf |
| `seed-spices` | FOODON:03541290 | "any type of seed used as spices" | nutmeg |
| `bark-spices` | FOODON:03541340 | "any type of bark used as spices" | cinnamon |
| `ripened-cheese` | FOODON:03542758 | "any type of Ripened cheese" | **kefalotyri** (was brined/feta-type) |
| `beverage` | — (legacy row) | — | **red wine** (optional) |
| `processed-tomato-products` | FOODON:03540933 | processed tomato products | **tomato paste** (optional) |
| `aromatic-herbs` | FOODON:03540825 | "any type of Aromatic herbs (**fresh, not dried**)" | **parsley** (optional) |
| `beef` | — (legacy row) | — | **beef mince** (optional) |

Three assignments are worth a second look, because they are the ones a
curator would argue about:

* **black pepper → `fruit-spices`.** Black pepper is the dried fruit of
  *Piper nigrum*, so `fruit-spices` is the FoodOn-correct class.
  `seed-spices` (nutmeg) and `bark-spices` (cinnamon) are the two other
  botanical classes, and all three are the categories the vocabulary
  actually offers for those materials.
* **allspice → `fruit-spices`.** Allspice is a dried berry. It is a
  blend, but the material is a fruit, so it lands in the same class.
* **`beverage` and `beef` are the coarse legacy rows.** They are real
  rows of the 435-row vocabulary, so the foreign key accepts them, but
  they carry no FoodOn identifier and they are much broader than the
  material. `bovine-carcase` (FOODON:03541878) is the precise class
  for beef and exists in the vocabulary; the vocabulary's own word for
  the material is `beef`. There is no wine class at all.

All three are the owner's to confirm or overrule.

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

1. **Is "béchamel sauce" one ingredient or its components?** — **Now
   answered in the owner's direction:** béchamel is a **sub-recipe**
   (row 4), and its components are its ingredients, not its siblings.
   **But the schema has no sub-recipe mechanism**, so the storage
   decision is still open: Option A (flat list, composition documented)
   or Option B (two recipes, which needs a new migration). **This is
   the one Gate A question that is not fully answered, and it is
   deliberately not decided here.**
2. **Is "lamb, minced" its own ingredient, or is it "lamb" with a
   variant?** — Proposed: its own ingredient, `lamb-mince`, per the
   plan's "a prepared form is its own ingredient" rule. It already
   exists as a row. The alternative is an `ingredients` row `lamb` plus
   an `ingredient_variants` row for the mince, referenced through
   `dish_ingredients.variant_id`. The plan's rule says the first, and
   that is what is proposed. **The same question now applies to
   `beef-mince` (row 24).**
3. **The four qualified slugs** (`whole-egg`, `whole-milk`, `table-salt`,
   `plain-butter`) — are these the names the owner wants, or should
   the bare words be used and the collision tolerated?
4. **`beef` or `bovine-carcase` for the beef row?** — `beef` is the
   vocabulary's own row but has no FoodOn id; `bovine-carcase`
   (FOODON:03541878) is the precise class and does. This list uses
   `beef`.
5. **Red wine's category.** There is no wine class in the vocabulary,
   so `beverage` is the only choice. Accepted, or is a new category
   row warranted?

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
* **The béchamel storage.** See Gate A question 1.

---

## How this was checked

The check is a **script**, not prose:
`scripts/check_pantry_list.py` reads the CSV and the applied vocabulary
and reports the facts.

```bash
python3 scripts/check_pantry_list.py docs/PANTRY-LIST-moussaka-greek.csv --db <db>
```

| check | result |
|---|---|
| every `category` exists in `ingredient_categories` | 24/24 ✓ |
| every `category` carries a FoodOn identifier | 22/24 ✓ (2 legacy rows: `beverage`, `beef` — flagged as NOTEs) |
| no slug appears twice in the list | 24/24 ✓ |
| no slug collides with any of the 435 category slugs | 24/24 ✓ |
| no slug reinvents an existing `ingredients` row | 4 reused, 20 new, 0 duplicated ✓ |
| every existing `ingredients` row appears in the list | 4/4 ✓ |
| every slug is English, singular, lowercase, hyphenated | 24/24 ✓ |
| every `is_optional` is true or false | 24/24 ✓ |
| every `needed_by` is `moussaka-greek` | 24/24 ✓ |
| no prepared form is merged with its base ingredient | ✓ |
| no dish is listed as an ingredient | ✓ |
| no database write | ✓ — read-only queries only |

The category vocabulary was read from the test database
`gustale_pantry_check`, where the full migration chain (including the new
`0054`) has been applied. The live database was read through the public
read-only API only.
