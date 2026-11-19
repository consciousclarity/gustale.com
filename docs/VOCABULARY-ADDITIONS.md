# Vocabulary additions — the classes the 435-row table is missing

**Status: a proposal list. Nothing here has been added to the
vocabulary. The owner decides, and they are added later in ONE
reviewed batch.**

The `ingredient_categories` table is the vocabulary (Gate 0 of
`docs/RECIPES-INGREDIENT-BACKFILL-PLAN.md`): **435 rows**, enforced by
the `ingredients_category_fk` foreign key that migration `0054` added
on live. A category that is not a row of that table **cannot be
stored**.

**55 of the 435 rows carry no FoodOn identifier.** They are the
pre-existing coarse categories that predate the FoodOn vocabulary —
`beef`, `paste`, `herb`, `sauce`, `beverage`, `cheese`, `meat`, `oil`,
`salt`, `egg`, `milk`, and 44 more. They are real rows of the
vocabulary, so the foreign key accepts them, but they are much broader
than the material they would label.

This file collects the cases where the vocabulary has **no precise class
for a material the project actually uses**. Each entry says what the
material is, what the vocabulary offers instead, and what the exact
FoodOn class would be — so the whole batch can be reviewed at once.

---

## How a row gets added

Adding a class is **not** a content change. It is a **new migration**
that inserts the row into `ingredient_categories`, and it must:

* carry the FoodOn identifier, so the class is a real class and not
  another coarse label;
* have a slug that does **not** collide with an existing category slug
  or with any ingredient slug (the namespace rule — see
  `docs/PANTRY-LIST-moussaka-greek.md`);
* keep the vocabulary's shape: `slug`, `name`, `parent_id`,
  `description`, `foodon_id`, `wikidata_id`.

Because `0054` is **frozen** (Rule 11), this is a **new migration
number** (`0055` or later), never an edit to `0054` or to the seed that
created the 435 rows.

> **Decided (owner, 2026-11-10):** these are added **later, in one
> reviewed batch**, not one at a time. This list is the batch's input.

---

## 1. `cheese, kefalotyri` — the exact class for kefalotyri

| | |
|---|---|
| **FoodOn** | `FOODON:03542880` |
| **FoodOn label** | "cheese, kefalotyri (efsa foodex2)" |
| **FoodOn's own definition** | "The group includes any type of kefalotyri cheese, **a type of hard cheese**. The part consumed/analysed is by default the whole or a portion of it representing the observed heterogeneity." |
| **Why it exists** | the FoodOn class is **specific to kefalotyri** — it is not a general cheese class. It is the most precise class FoodOn offers for the material. |
| **Why it is not in the vocabulary** | the 435-row table was built from the EFSA FOodex2 pesticide groups; this class is not one of them. |
| **The class in use meanwhile** | `ripened-cheese` (`FOODON:03542758`, "any type of Ripened cheese") — a real class, correct for a hard aged cheese, but **generic**. |
| **Status** | **the owner has decided to keep the generic `ripened-cheese` for now.** This row is on the list for the later batch. |

**The material claim, independently sourced.** FoodOn says "a type of
hard cheese"; Wikipedia's article on Kefalotyri says:

> "Kefalotyri or kefalotiri … is a **hard**, salty white cheese made
> from sheep milk or goat's milk (or both) in Greece and Cyprus."
> … "A **very hard** cheese, kefalotyri can be consumed as is, fried in
> olive oil for a dish called saganaki, or added to foods such as pasta
> dishes, meat, or cooked vegetables, and is especially suited for
> grating."

That second passage matters for the recipe: kefalotyri is **grated**
over the finished dish, which is what the seed's step says — *"Pour
béchamel on top, sprinkle with kefalotyri."*

---

## 2. A wine / alcoholic-beverage class

| | |
|---|---|
| **FoodOn** | the exact class to be chosen when the batch is prepared |
| **Why it exists** | the vocabulary has **no wine class at all**. Checked by slug, by name, and by every `wine\|vine\|grape` pattern: the only hits are `vinegar` and a generic `beverage`. |
| **The class in use meanwhile** | `beverage` — a legacy row with **no FoodOn identifier**, and far broader than wine. |
| **Status** | **the owner has decided to remove red wine from the moussaka list for now** and to put the missing class here. |

**What was removed.** `red-wine` was in the moussaka pantry list as an
optional ingredient, inferred from the seed's *"Regional variants exist
across the Balkans, Levant, and Egypt"*. It was **not named in the
seed**, and it was the only row whose category had no precise class at
all. With the wine class missing, the honest choices were to label it
with a coarse legacy row or to leave it out. **It was left out.**

**What to look for when the batch is prepared.** FoodOn's alcoholic
beverage classes, and whether a *wine* class exists that is narrower
than `beverage` — e.g. a "wine" group, a "grape wine" class, or the
EFSA "wine and grape-based beverages" group. The class must be narrow
enough that "red wine" is a member of it by definition, not by
convention.

> **Verified, not recalled.** Every FoodOn identifier in this
> document was checked against the FoodOn ontology itself, not from
> memory:
>
> ```bash
> curl -sL -o foodon.owl \
>   https://raw.githubusercontent.com/FoodOntology/foodon/master/foodon.owl
> ```
>
> then the class's `rdfs:label`, `obo:IAO_0000115` definition and
> `rdfs:subClassOf` were read out of the file. Two identifiers that
> had been written from memory were **wrong** and were corrected:
> `FOODON:03540104` and `FOODON:03546797` do not exist in FoodOn.

---

## 3. `tamarind` — the pulp, not the pod

| | |
|---|---|
| **FoodOn** | `FOODON:03541403` |
| **FoodOn label** | "14030 - tamarind (efsa foodex2)" |
| **FoodOn's own definition** | "Spices from the fruits of the plant classified under the species *Tamarindus indica* L., commonly known as Tamarind. The part consumed/analysed is not specified." |
| **Why it exists** | the ingredient in the moussaka list and in the nasi goreng line is **tamarind pulp** — the pod is a different material and is used whole in some recipes (the spec says tamarind "is not suitable when the whole pod is required for presentation"). |
| **Why it is not in the vocabulary** | the 435-row table was built from the EFSA FOodex2 pesticide groups, and tamarind is **not** among them. FoodOn has two EFSA groups for it — `FOODON:03541403` "tamarind" and `FOODON:03541402` "tamarind and similar" — and neither is in the table. The nearest rows in the 435 are `fruit` (too generic — it is one specific fruit) and `dried-fruit` (wrong — the pulp is not a dried fruit). |
| **The class in use meanwhile** | `fruit` — a real class, but **generic**. |
| **Status** | **accepted for now** (owner, Gate A, 2026-11-10). This row is on the list for the later batch. |

**The material claim, independently sourced.** FoodOn classifies
tamarind as a fruit; the ingredient is the pulp, which is the seed of
the fruit. Both the moussaka's use (seasoning a stew) and the nasi
goreng's use (seasoning) are the **pulp**, not the pod, and the
spec's substitution limit — "not suitable when the whole pod is
required for presentation" — is exactly the distinction this class
would capture.

---

## 4. `shrimp paste` — a fermented ground crustacean product

| | |
|---|---|
| **FoodOn** | `FOODON:03315935` — the general class; `FOODON:03542517` — the EFSA group |
| **FoodOn label** | "crustacean paste" · "25170 - akiami paste shrimp (efsa foodex2)" |
| **FoodOn's own definition** | `FOODON:03315935` has no definition text — it is a parent class under `FOODON:00001792`. `FOODON:03542517`: "Crustaceans classified under the species *Acetes japonicus*, commonly known as Akiami paste shrimp. The part consumed/analysed is not specified." |
| **Why it exists** | terasi / shrimp paste is a **prepared product**, not a crustacean. It is a key ingredient in the nasi goreng line — the owner's decision of 2026-11-10 — and it is **not** interchangeable with dried shrimp or with prawns. |
| **Why it is not in the vocabulary** | the 435-row table was built from the EFSA FOodex2 pesticide groups, and shrimp paste is **not** among them. The nearest rows are `paste` (too generic — it covers every paste, including tomato and bean, and it is a **legacy row with no FoodOn ID**) and `shrimps-and-prawns` (wrong — that is the **carcase**, not the prepared paste). |
| **The two candidates, and the choice between them** | `FOODON:03315935` "crustacean paste" is the **general** class — correct for terasi as such, but it carries no definition text. `FOODON:03542517` "akami paste shrimp" is the EFSA pesticide group — it matches the 435's own shape, and it has a definition, but it names **one species** (*Acetes japonicus*). Terasi is made from a mix of small shrimp, so the EFSA group is **narrower than the ingredient**. **The batch should add the general class `FOODON:03315935`**; the EFSA group is recorded here because it is what the 435's own construction would have produced, and because the species distinction is worth knowing. |
| **The class in use meanwhile** | `paste` — a real class, but **generic**. |
| **Status** | **accepted for now** (owner, Gate A, 2026-11-10). This row is on the list for the later batch. |

**The material claim, independently sourced.** FoodOn's class is
specific to a **shrimp** paste. The moussaka's own pantry list records
the distinction this class would enforce: shrimp paste is "**not**
dried shrimp" — a different material with a different source, a
different supply chain, and a different availability profile in every
country the rating covers.

---

## 5. The `beef` class — a decision, not a gap

| | |
|---|---|
| **FoodOn (precise)** | `FOODON:03541878` — "bovine carcase (efsa foodex2)": "The group includes any types of carcase of bovines, including cattle, yak, zebu, buffalos and other bovines." |
| **The class in use** | `beef` — a legacy row with **no FoodOn identifier**. |
| **Status** | **the owner has decided: `beef`, not `bovine-carcase`.** Closed — no change needed. |

This is recorded here only because the choice was made deliberately
rather than by default. `bovine-carcase` is a *carcase* class; the
vocabulary's own word for the **material** is `beef`, and the ingredient
is the material, not the carcase.

---

## 6. Sub-recipes — a SCHEMA gap, not a vocabulary gap

This is **not** a vocabulary entry, but it was found alongside them and
it belongs on the same list.

> **Owner, 2026-11-10:** *"Add 'sub-recipes' (a parent reference on
> recipes) as its own backlog item: béchamel, sofrito, sambal, curry
> pastes recur across many dishes."*

**What the schema has today.** Nothing:

| looked for | found |
|---|---|
| `recipes.parent_recipe_id`, or any self-reference on `recipes` | **none** |
| a `recipe_subrecipes` / `recipe_components` table | **none** |
| `recipe_ingredients.component_of` | **none** — the columns are `recipe_id`, `ingredient_id`, `quantity`, `unit`, `is_optional`, `preparation_note`, `position` |
| `ingredient_variants` rows | the table exists and `dish_ingredients.variant_id` references it, but it holds **0 rows** |

**Why it matters.** A prepared component that recurs — béchamel,
sofrito, sambal, a curry paste — is a **recipe in its own right**, and
the ingredient list of the dish that uses it should not repeat it row
by row. The current schema cannot express "this ingredient is made of
those ingredients", so the composition has to live in prose.

**The shape it would take.** A parent reference on `recipes`:

```sql
-- a NEW migration (0055+), never an edit to a frozen one
ALTER TABLE public.recipes
  ADD COLUMN parent_recipe_id uuid REFERENCES public.recipes(id);
```

That alone gives the nesting. What it does **not** give is a way to say
"this component is *optional* in the parent" or "the parent uses 250 g
of it" — those are `recipe_ingredients` rows against the **child**
recipe, so they are already expressible once the parent reference
exists.

**The open questions, for whoever picks the card up:**

1. **Should the parent reference be to `recipes` or to a separate
   `recipe_components` table?** A column is simpler; a table can carry
   its own quantity ("this dish uses 250 g of the béchamel") and its
   own position. The current `recipe_ingredients` table has
   `quantity` and `position`, which suggests the latter is the more
   honest shape.
2. **Does a component's ingredient list count against the dish's
   ingredient count?** For the pantry list, the béchamel's components
   (milk, flour, butter, egg, nutmeg) are the sauce's, not the dish's.
   That question has to be answered before Gate B's row count means
   anything for a recipe with components.
3. **Does the component need its own `status`/`review_state`?** A
   published dish with an unpublished component is a broken dish.
4. **Rule 11 applies.** The change is a new migration number, and it
   needs its own proof: the parent reference must refuse a cycle
   (`a` → `b` → `a`) and must refuse to point at a recipe in another
   dish's family without saying so.

**The materials that motivate it**, from the pilot alone:

| component | recurs in |
|---|---|
| béchamel | moussaka, pastitsio, lasagne, many gratins |
| sofrito | paella, risotto, many Spanish and Mediterranean dishes |
| sambal | Indonesian, Malaysian and Singaporean dishes |
| curry paste | Thai, Indian, Malaysian curries |
| the tomato base | innumerable |

---

## The batch, when it happens

One migration, one review. Each row above needs, before it is added:

| what | why |
|---|---|
| the FoodOn identifier | the class must be a real class, not another coarse label |
| the class's own definition, quoted | the vocabulary's `description` column should carry the real text |
| the slug, checked against all 435 category slugs **and** all ingredient slugs | the namespace rule |
| the parent, if the class has one | `fresh-uncured-cheese` and `ripened-cheese` are top-level; a wine class may sit under a "beverages" parent |
| a proof case | the migration must show that the new row is insertable, that the FK accepts an ingredient using it, and that a non-existent class is still refused |

**Nothing in this file has been added.** The vocabulary is unchanged
until the owner opens the batch.
