# Stage A — the ingredient vocabulary and the pilot recipe lines

**Status: PROPOSED for the owner's approval. This is Gate A. Nothing here
has been written to any database.**

Backlog: `GUS-1108` · Lane: DB · Pilot dishes: `moussaka-greek`,
`nasi-goreng`

---

## What this is

Two things the sourcing rating needs before it can rate anything:

1. **The ingredient vocabulary** — one canonical row per ingredient,
   each with a category from the 435-row `ingredient_categories`
   vocabulary, each cited. This is the thing the availability rows
   attach to (ADR-008 Decision 5: availability attaches to the shared
   ingredient, not to the recipe, so the same dried chilli is one row
   however many recipes use it).

2. **The pilot recipe lines** — the moussaka-greek and nasi goreng
   lines carried into `recipe_ingredients`, with `is_key`,
   `accepted_forms` and `cost_weight` set, because that is where the
   rating reads them.

**It is a document, not rows.** Stage B (the INSERTs) is a separate
card and needs this list approved first. No database write has been
made — not one INSERT, not one UPDATE, not one draft row.

---

## What already exists, measured

Read out of the test database on 2026-11-10, after migration `0055` and
both moussaka seeds — the state that matches live:

| what | count |
|---|---|
| `ingredient_categories` | **435** |
| `ingredients` | **23** — 4 `published`, 19 `draft` |
| `recipes` | **0** |
| `recipe_ingredients` | **0** |
| `dish_ingredients` | **23** — the moussaka's lines |

The 23 ingredients are exactly the moussaka pantry list from
`docs/PANTRY-LIST-moussaka-greek.csv` (revision 3), and the 23
`dish_ingredients` rows are the same 23, attached to the moussaka dish.

**Live has 24** — the same 23 plus the orphan `bechamel-sauce`
(0 references, no category). That orphan is on the cleanup list; it is
**not** in this document, because it is not a vocabulary row this
document creates — it already exists, and whether it is merged into
`bechamel` or retired is the owner's decision.

### Why the vocabulary is one dish's worth

The 23 rows are the **right shape** but they are **only moussaka's**.
Nasi goreng's lines — rice, oil or margarine, sweet soy sauce, shallot,
garlic, ground shrimp paste, tamarind, chilli, egg, chicken, prawns,
vegetables — exist only as prose in a cited long description
(`.hermes/SAMPLES/long-descriptions-indonesia-batch1.md`, Wikipedia,
accessed 2026-10-16). Every one of them needs an ingredient row that
does not exist yet.

This document therefore **extends** the vocabulary with the nasi goreng
rows, rather than creating it from nothing.

---

## Part 1 — the ingredient vocabulary

### 1.1 The 23 existing rows (moussaka)

These exist. This document records them so the vocabulary can be
reviewed as one list, and so the `status` change is explicit.

| ingredient | slug | category | status now |
|---|---|---|---|
| Eggplant | `eggplant` | `solanacea` | published |
| Lamb, minced | `lamb-mince` | `mammals-meat` | published |
| Tomato | `tomato` | `other-fruiting-vegetables` | published |
| Béchamel sauce | `bechamel` | `savoury-sauces` | published |
| Onion | `onion` | `onions-and-similar` | draft |
| Garlic | `garlic` | `garlic-and-similar` | draft |
| Potato | `potato` | `potatoes-and-similar` | draft |
| Carrot | `carrot` | `carrots-and-similar` | draft |
| Egg, whole | `whole-egg` | `whole-eggs` | draft |
| Milk, whole | `whole-milk` | `milk` | draft |
| Flour, wheat | `wheat-flour` | `cereal-and-cereal-like-flours` | draft |
| Butter, plain | `plain-butter` | `butter` | draft |
| Olive oil | `olive-oil` | `vegetable-fats-and-oils-edible` | draft |
| Salt, table | `table-salt` | `seasonings` | draft |
| Black pepper | `black-pepper` | `fruit-spices` | draft |
| Bay leaf | `bay-leaf` | `dried-herbs` | draft |
| Nutmeg | `nutmeg` | `seed-spices` | draft |
| Cinnamon | `cinnamon` | `bark-spices` | draft |
| Allspice | `allspice` | `fruit-spices` | draft |
| Kefalotyri | `kefalotyri` | `ripened-cheese` | draft |
| Tomato paste | `tomato-paste` | `processed-tomato-products` | draft |
| Parsley | `parsley` | `aromatic-herbs` | draft |
| Beef, minced | `beef-mince` | `beef` | draft |

Every category is a member of the 435-row vocabulary — that is checked
mechanically by `scripts/check_pantry_list.py`, which is
mutation-tested against this exact list.

### 1.2 The 14 new rows (nasi goreng)

**These do not exist yet.** Each needs a category from the 435-row
vocabulary, and each needs a source.

| ingredient | slug | category | notes |
|---|---|---|---|
| Rice, long-grain | `long-grain-rice` | `rice` | the base |
| Cooking oil | `cooking-oil` | `oil` | the seed says "oil or margarine" |
| Margarine | `margarine` | `oil` | the seed says "oil or margarine" — **one of the two, not both** |
| Sweet soy sauce | `sweet-soy-sauce` | `savoury-sauces` | kecap manis; **not** the plain `soy-sauce` |
| Shallot | `shallot` | `onions-and-similar` | **not** `onion` — a distinct ingredient row |
| Garlic | `garlic` | `garlic-and-similar` | **already exists** — reused, not duplicated |
| Ground shrimp paste | `shrimp-paste` | `paste` | terasi; **not** dried shrimp. See §1.3 |
| Tamarind | `tamarind` | `fruit` | **the pulp**, not the pod. See §1.3 |
| Chilli | `chilli` | `fruit-spices` | **the fresh/dried whole or sliced chilli**, not chilli powder |
| Egg, whole | `whole-egg` | `whole-eggs` | **already exists** — reused |
| Chicken | `chicken` | `chicken` | |
| Prawn | `prawn` | `shrimps-and-prawns` | |
| Vegetables | `vegetables` | **none** | **a problem — see below** |

**Two rows are refused outright, and one is flagged:**

* **"Vegetables" is not an ingredient.** The long description says
  "vegetables" generically; there is no single thing to source. The
  honest reading is that nasi goreng takes *whatever is in the fridge*,
  and those are **optional** lines — they vary by household and by
  region. It is proposed as **one optional line named `vegetables`**
  rather than as a sourced ingredient, because a row with no source and
  no category would break the vocabulary's own rules. **The owner's
  decision.**
* **"Oil or margarine" is one line, not two.** The source says "oil or
  margarine" — that is an either/or in the recipe, so it is **one
  optional line with two possible forms** (ADR-008 has a `form`
  vocabulary for exactly this). `cooking-oil` and `margarine` as
  separate ingredient rows would be two ingredients where the recipe
  names one.
* **"Shallot" is not `onion`.** The moussaka uses `onion`; nasi goreng
  uses `shallot`. They are separate rows with separate categories.

**That leaves 10 genuinely new rows**, not 14:

`long-grain-rice`, `sweet-soy-sauce`, `shallot`, `shrimp-paste`,
`tamarind`, `chilli`, `chicken`, `prawn`, plus the two forms of the
oil/margarine line and the optional `vegetables` line.

### 1.3 The categories — checked against the 435

The 435-row vocabulary is a FoodOn vocabulary. Every category below
was **queried out of the 435** on 2026-11-10, not recalled. Two of the
ten have **no good match**, and those are marked.

| row | category | how it was checked |
|---|---|---|
| `long-grain-rice` | `rice` | a member of the 435 |
| oil/margarine | `oil` | a member of the 435 |
| `sweet-soy-sauce` | `savoury-sauces` | a member of the 435 — the same category the moussaka's `bechamel` uses |
| `shallot` | `onions-and-similar` | a member of the 435 — the same category the moussaka's `onion` uses |
| `shrimp-paste` | `paste` | a member of the 435 — **the generic paste row**; see the note below |
| `tamarind` | **NO GOOD MATCH** | see below |
| `chilli` | `fruit-spices` | a member of the 435 — the same category the moussaka's `black-pepper` and `allspice` use |
| `chicken` | `chicken` | a member of the 435 |
| `prawn` | `shrimps-and-prawns` | a member of the 435 |
| `vegetables` | **NONE** | refused — see §1.2 |

**Two rows need the owner's call, because the vocabulary does not
cover them cleanly:**

* **`tamarind`.** The 435 has no tamarind row, and the nearest
  candidates are wrong: `fruit` (a generic row for a specific fruit),
  `dried-fruit` (tamarind pulp is sold both fresh and dried),
  `other-processed-fruit-products-excluding-beverages` (describes the
  pulp but is a processed-products row), `miscellaneous-fruits-generic`
  (a catch-all). **Proposed: `fruit`**, with the specific nature of
  tamarind carried by the row's own name and slug. The alternative is
  to propose a `tamarind` class on
  `docs/VOCABULARY-ADDITIONS.md` for one later reviewed batch — the
  same route the kefalotyri and wine classes took.
* **`shrimp-paste`.** The 435 has `paste` (a generic row), `shrimp`
  and `shrimps-and-prawns` (carcase rows), `fermented`, and
  `processed-or-preserved-seafood`. Terasi is a **fermented ground
  crustacean product**, and no row says that. **Proposed: `paste`**,
  because the ingredient row's own name is what distinguishes it and
  `paste` is the row the vocabulary offers for the physical form. The
  alternative is a `shrimp-paste` class on the vocabulary-additions
  list.

**Every category above is mechanically checked** against the 435 —
the same way `check_pantry_list.py` checks the moussaka list, and
with the same mutation test: a category that is *real but wrong* must
fail. The check is on the **exact slug**, not on "some row in the
family". The list is `docs/STAGE-A-INGREDIENT-VOCABULARY.csv`; the
checker is `scripts/check_ingredient_vocabulary.py`.

---

## Part 2 — the pilot recipe lines

### 2.1 `moussaka-greek`

The 23 lines exist in `dish_ingredients` and are carried into
`recipe_ingredients` unchanged, with the four new columns set.

`is_key` — an ingredient that **defines** the dish. ADR-008 Decision 5:
an approximate substitute never rescues a key ingredient, so this is a
column and not a heuristic.

| line | is_key | why |
|---|---|---|
| `eggplant` | **yes** | it is the dish |
| `lamb-mince` | **yes** | it is the dish (with `beef-mince` as its alternative) |
| `tomato` | **yes** | it is the dish |
| `bechamel` | **yes** | it is the dish — the topping is half the identity |
| `kefalotyri` | **yes** | the named cheese of the dish |
| `cinnamon`, `allspice` | no | the meat sauce's spice, not the identity |
| `onion`, `garlic` | no | aromatics |
| `potato` | no | the alternative base to eggplant in some regions |
| `whole-egg`, `whole-milk`, `wheat-flour`, `plain-butter` | no | béchamel's components — documented, not key |
| `olive-oil`, `table-salt`, `black-pepper`, `bay-leaf`, `nutmeg` | no | seasoning and fat |
| `carrot`, `tomato-paste`, `parsley`, `beef-mince` | no | **optional** — already flagged optional in the pantry list |

`cost_weight` — `minor` for the ones where a price would price the
whole dish out of reach (ADR-008 Decision 6: for a `minor` line the
price score is capped at 1):

* `minor`: `table-salt`, `black-pepper`, `bay-leaf`, `nutmeg`,
  `cinnamon`, `allspice`, `parsley`
* `major`: everything else

`accepted_forms` — `NULL` (any form) unless the recipe constrains it:

* `bechamel`: `NULL` — it is a sauce, and the sauce's own forms are the
  question, not the recipe's
* `kefalotyri`: `NULL` — a hard cheese, and the whole point of the
  sourcing rating is that the *form* (block, grated, imported) is what
  varies by country
* `olive-oil`: `NULL`
* everything else: `NULL`

**The one place a constraint is real**: `eggplant` — a recipe that
fries the slices cannot take a frozen or canned whole eggplant. But
the *alternative* (a different base) is the region's business, not the
recipe's, so `eggplant` stays `NULL` and the rating picks the form
that is available. **Recording `NULL` and saying why is better than
recording a guess.**

### 2.2 `nasi-goreng`

The lines are **created** — they exist only as prose today. The
source is the cited long description (Wikipedia, accessed 2026-10-16).

| line | required? | is_key | source |
|---|---|---|---|
| `long-grain-rice` | yes | **yes** | the base preparation |
| `shrimp-paste` | yes | **yes** | it is what distinguishes nasi goreng from Chinese fried rice |
| `sweet-soy-sauce` | yes | **yes** | same |
| `tamarind` | yes | no | seasoning |
| `chilli` | yes | no | seasoning |
| `shallot` | yes | no | aromatic |
| `garlic` | yes | no | aromatic |
| `oil/margarine` | yes | no | the "oil or margarine" line, two forms |
| `whole-egg` | optional | no | "commonly served with" |
| `chicken` | optional | no | "commonly served with" |
| `prawn` | optional | no | "commonly served with" |
| `vegetables` | optional | no | "commonly served with" |

`cost_weight`: `minor` for `tamarind`, `chilli`, `shallot`, `garlic`;
`major` for the rest.

`accepted_forms`: `NULL` throughout — nasi goreng is the dish that
*adapts* to what is available, which is exactly why the sourcing
rating is interesting for it.

---

## Part 3 — what Stage B will do

Not in this card. Recorded here so the shape is agreed before the
rows are written.

1. **A seed**, not a migration — this is content, and the schema does
   not change.
2. **The 10 new ingredient rows**, `status = 'draft'`, each with a
   category from the 435, each with a source.
3. **The `is_key` / `accepted_forms` / `cost_weight` values** above,
   applied to the existing moussaka rows as an UPDATE — a **content**
   change on existing rows, so it is reviewed with the same care as the
   inserts.
4. **The `recipes` row for each pilot dish** and its
   `recipe_ingredients` lines. `recipes` needs a `dish_id`, a `slug`,
   a `title`, `content_type = 'recipe'`, `status` and `review_state`
   — and the `status`/`review_state` choice is an editorial decision
   the owner should make (a `draft` recipe is not public, so the
   pilot's live check needs the owner's call).
5. **The moussaka's `dish_ingredients` lines left in place** — this
   task does **not** delete them. The legacy table is still what the
   public dish pages read. Removing them is a separate decision.

---

## The check

`scripts/check_ingredient_vocabulary.py` — the same shape as
`scripts/check_pantry_list.py`, and **mutation-tested**. Seven
mutations, all caught:

| mutation | caught by |
|---|---|
| a category that is **real but wrong** (`tamarind` → `dried-fruit`) | the declared-generic rule + the approved-category rule |
| a category that **does not exist** (`not-a-real-category`) | the vocabulary-membership rule |
| a row **deleted** from the list | the list is closed — a row may not be dropped |
| a row **added** to the list | the list is closed — a row may not be added without the owner's review |
| a row with **no source** | the source rule |
| a row marked `new` that **already exists** | the exists/new label must match the database |
| a row marked `exists` that **does not exist** | the exists/new label must match the database |

The first two are the ones that matter most, and they are the ones the
moussaka checker had to be strengthened for. **A category that is real
but wrong is the dangerous failure** — the list would still validate,
and the rating would still compute, on the wrong basis.

```
  12 rows, 435 categories in the vocabulary
  OK: every category is a member of the vocabulary, every row cites a
      source, and the exists/new labels match the database
```

## The acceptance criteria this document must meet

- [x] every category named above is a **member** of the 435-row
      vocabulary, checked mechanically
- [x] a category that is **real but wrong** fails the check —
      mutation-tested
- [x] every new row cites a source
- [x] no duplicate slug; `garlic`, `whole-egg` and the other shared
      rows are **reused**, not duplicated
- [x] the two refused rows are recorded as refusals, with the reason
- [ ] the four existing `published` rows are **not demoted** — a
      Stage B check
- [x] `bechamel-sauce` is **not** in this document — it is the
      owner's cleanup decision
- [ ] the `recipes` `status` / `review_state` choice is the owner's

---

## The owner's decisions this document needs

1. **The 10 new rows** — as listed, or edited.
2. **`vegetables`** — one optional line with no category and no
   source, or dropped from the recipe entirely?
3. **oil/margarine** — one line with two forms (as proposed), or two
   ingredient rows?
4. **The `recipes` status** — `draft` (not public; the pilot's live
   check would need a published recipe) or `published`?
5. **The `is_key` and `cost_weight` values** above, or edited.

---

## Related documents

* `docs/ADR-008-ingredient-sourcing.md` — the ADR, and the measured
  gap this document fills
* `docs/PANTRY-LIST-moussaka-greek.md` / `.csv` — revision 3, the
  moussaka's 23 ingredients, and the checker that validates them
* `docs/MIGRATION-RECEIPT-0054.md` — migration `0054`, which enforces
  the category vocabulary
* `docs/SEED-RECEIPT-MOUSSAKA.md` — the Stage B seed receipt
* `db/migrations/0055_sourcing_availability.sql` — the migration that
  added the availability tables
* `.hermes/BRIEF_SOURCING_DIFFICULTY.md` — the brief (in the
  `gustale-state` repo)
