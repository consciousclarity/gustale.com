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

### 1.2 The 13 rows (nasi goreng)

**These do not exist yet.** Each needs a category from the 435-row
vocabulary, and each needs a source — except `vegetables`, which the
owner accepted as a generic line with neither.

The **"typically defines the dish"** and `cost_weight` columns below are the **owner's Gate A
decisions of 2026-11-10**, and the checker enforces them, so a later
edit cannot quietly reverse one.

**The column is named for what it is, and it is a RECIPE-LINE value.**
`is_key` lives on `recipe_ingredients` (ADR-008 Decision 5), and the
`ingredients` table has exactly one sourcing column — `ubiquitous`, the
staples rule. The same ingredient can be key in one recipe and not in
another, so a column on the ingredient would force one answer on every
recipe that uses it.

Every row in this table **is** a recipe line — it names the dish it is
for (`needed_by`) — so the value belongs to the line. It is never
written to the ingredient row: the seed inserts into `ingredients`
only `(canonical_name, slug, category, status)`.

**The checker refuses the column named `is_key`**, so the wrong write
cannot be made by accident.

| ingredient | slug | category | typically defines the dish | cost_weight | notes |
|---|---|---|---|---|---|
| Rice, long-grain | `long-grain-rice` | `rice` | **yes** | major | the base |
| Cooking oil | `cooking-oil` | `oil` | no | major | **form 1 of 2** of the oil/margarine line |
| Margarine | `margarine` | `oil` | no | major | **form 2 of 2** of the oil/margarine line |
| Sweet soy sauce | `sweet-soy-sauce` | `savoury-sauces` | **yes** | major | kecap manis; **not** the plain `soy-sauce` |
| Shallot | `shallot` | `onions-and-similar` | no | **minor** | **not** `onion` — a distinct ingredient row |
| Garlic | `garlic` | `garlic-and-similar` | no | **minor** | **already exists** — reused, not duplicated |
| Ground shrimp paste | `shrimp-paste` | `paste` | **yes** | major | terasi; **not** dried shrimp. See §1.3 |
| Tamarind | `tamarind` | `fruit` | no | **minor** | **the pulp**, not the pod. See §1.3 |
| Chilli | `chilli` | `fruit-spices` | no | **minor** | **the fresh/dried whole or sliced chilli**, not chilli powder |
| Egg, whole | `whole-egg` | `whole-eggs` | no | major | **already exists** — reused |
| Chicken | `chicken` | `chicken` | no | major | |
| Prawn | `prawn` | `shrimps-and-prawns` | no | major | |
| Vegetables | `vegetables` | **none** | no | minor | **one generic line** — see below |

**The owner's decisions, and what they settled:**

* **The oil/margarine line is REQUIRED — one line, two forms.**
  The source says "oil or margarine", so it is one *line* with two
  possible *forms* (ADR-008 has a `form` vocabulary for exactly
  this). `cooking-oil` and `margarine` are two rows because the
  rating must be able to say "this dish is easy because the oil is
  ordinary, or hard because only margarine is stocked" — but they are
  **one required line**, not two required ingredients, and not an
  optional one.

  **This resolves a contradiction in the previous revision of this
  document.** §1.2 called the line *optional* while §2.2 called it
  *required*. The owner's answer is **REQUIRED**, and the checker now
  enforces it: both forms must be present, each must name its form,
  and neither may be a key ingredient.

* **"Vegetables" is one optional line, accepted.** The long
  description says "vegetables" generically; there is no single thing
  to source. The honest reading is that nasi goreng takes *whatever is
  in the fridge*, and those vary by household and by region. So it is
  **one optional line named `vegetables`**, with **no category and no
  source** — and it is explicitly **not** a key ingredient, because it
  is not a single ingredient at all. The checker names it in
  `NO_CATEGORY_NO_SOURCE`, so the exemption is a rule rather than an
  accident.

* **"Shallot" is not `onion`.** The moussaka uses `onion`; nasi goreng
  uses `shallot`. They are separate rows with separate categories.

* **`shrimp-paste` is a key ingredient.** It is what distinguishes
  nasi goreng from Chinese fried rice; without it the dish is
  something else.

**Ten new rows plus two reused plus the generic line** — 13 rows in
the list, of which 11 are new ingredient rows, 2 are reused, and 1
(`vegetables`) is the generic line.

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
| `kefalotyri` | **no** | the owner's decision, 2026-11-10 — see below |
| `cinnamon`, `allspice` | no | the meat sauce's spice, not the identity |

**The owner's decision on kefalotyri, 2026-11-10: `is_key = no`.**

Kefalotyri was proposed as a key ingredient because it is the named
cheese of the dish. The owner decided it is **not** key, and the
reason is the substitution record: a key ingredient may only be
rescued by a **suitable** substitute, and the moussaka has one.

**The substitutes are recorded, with their suitability still to be
researched:**

| substitute | for | suitability | status |
|---|---|---|---|
| `parmesan` | `kefalotyri` | **to be researched** | **pending** |
| `pecorino` | `kefalotyri` | **to be researched** | **pending** |

Both are aged hard cheeses, grated over the dish in the same way, so
the **material** claim is already established — the owner's own spec
lists "Parmigiano Reggiano and Pecorino" as an ingredient in its own
right, and its substitution limits note that "Grana Padano, another
aged hard cheese, [may serve]". What is **not** yet established is
the *suitability* rating for a moussaka, which is a research question
(GUS-1107), not a guess.

**Until the suitability is researched, neither substitute is written
to the database.** A substitute row with an unresearched suitability
would be exactly the kind of unsupported claim the project refuses —
and the rating would then offer a substitute the research may not
support. The `is_key = no` decision is what makes the dish's rating
**Moderate rather than Hard** in a country without kefalotyri, once
the suitability is established; until then the honest answer for that
country is what the data says.
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

| line | required? | is_key | cost_weight | source |
|---|---|---|---|---|
| `long-grain-rice` | yes | **yes** | major | the base preparation |
| `shrimp-paste` | yes | **yes** | major | it is what distinguishes nasi goreng from Chinese fried rice |
| `sweet-soy-sauce` | yes | **yes** | major | same |
| `tamarind` | yes | no | **minor** | seasoning |
| `chilli` | yes | no | **minor** | seasoning |
| `shallot` | yes | no | **minor** | aromatic |
| `garlic` | yes | no | **minor** | aromatic |
| `oil/margarine` | **yes** | no | major | the "oil or margarine" line — **one required line, two forms** |
| `whole-egg` | optional | no | major | "commonly served with" |
| `chicken` | optional | no | major | "commonly served with" |
| `prawn` | optional | no | major | "commonly served with" |
| `vegetables` | optional | no | minor | "commonly served with" — the generic line |

**The oil/margarine line is REQUIRED.** The previous revision of this
document contradicted itself: §1.2 called it optional and §2.2 called
it required. The owner's answer is **required**, and the checker
enforces that both forms are present and each names its form.

`accepted_forms`: `NULL` throughout — nasi goreng is the dish that
*adapts* to what is available, which is exactly why the sourcing
rating is interesting for it.

**The recipe's own status: `draft`.** The owner's decision is that
**both recipes stay DRAFT until each has 2 independent sources** —
Wikipedia alone is not enough. So the `recipes` rows are written with
`status = 'draft'`, and neither pilot dish is published by this work.
A `draft` recipe is not public, so the pilot's rating is verified in
the API's authenticated/draft path and in the database, not on a live
public page. That is a deliberate consequence of the decision, not an
oversight: a recipe whose sourcing rating rests on a single source
does not belong on a public page yet.

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
`scripts/check_pantry_list.py`, and **mutation-tested**. Thirteen
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
| **the owner's `is_key` reversed** (`shrimp-paste` → no) | rule (8) — the Gate A decisions are *enforced*, not just written |
| **the owner's `cost_weight` reversed** (`tamarind` → major) | rule (8) |
| **the oil/margarine line losing a form** | rule (9) — both forms must be present |
| **a form emptied** (`cooking-oil` with no form named) | rule (9) |
| **the generic line given a category** | rule (2) + the closed-list rule |
| **the generic line made a key ingredient** | rule (10) |

The first two are the ones that matter most, and they are the ones the
moussaka checker had to be strengthened for. **A category that is real
but wrong is the dangerous failure** — the list would still validate,
and the rating would still compute, on the wrong basis.

The last six are the **owner's Gate A decisions**. They are enforced
by the checker rather than merely written in the document, so a later
edit cannot quietly reverse a decision the owner already made.

```
  13 rows, 435 categories in the vocabulary
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
- [x] the refusals are recorded, with the reason
- [ ] the four existing `published` rows are **not demoted** — a
      Stage B check
- [x] `bechamel-sauce` is **not** in this document — it is the
      owner's cleanup decision
- [x] the `recipes` rows are **`draft`** — the owner's decision,
      2026-11-10: both recipes stay draft until each has 2
      independent sources
- [x] the owner's `is_key` and `cost_weight` values are **enforced by
      the checker**, not just written in the document
- [x] the oil/margarine line is **required** — rule (9), and the
      §1.2 / §2.2 contradiction is resolved

---

## The owner's decisions — Gate A, 2026-11-10

**APPROVED**, with the following changes. Each is now enforced by
`scripts/check_ingredient_vocabulary.py`, so none of them can be
reversed by a later edit.

| # | the decision | where it is enforced |
|---|---|---|
| 1 | **oil/margarine: REQUIRED**, one line with two forms — **not** optional. This resolves the contradiction between §1.2 and §2.2. | rule (9): both forms present, each naming its form |
| 2 | **kefalotyri: `is_key = no`.** Parmesan and pecorino are recorded as its substitutes, **suitability to be researched** — so neither is written to the database yet. | the moussaka's table in §2.1 |
| 3 | **shrimp-paste: `is_key = yes`.** | rule (8) |
| 4 | **tamarind → `fruit` and shrimp-paste → `paste` accepted for now**, and **both added to `docs/VOCABULARY-ADDITIONS.md`** for a later reviewed batch. | `docs/VOCABULARY-ADDITIONS.md` §3 and §4 |
| 5 | **`vegetables`: one optional line, accepted.** No category, no source, not a key ingredient. | rules (2), (4), (10) and `NO_CATEGORY_NO_SOURCE` |
| 6 | **Both recipes stay `DRAFT`** until each has **2 independent sources**. Wikipedia alone is not enough. | §2.1 and §2.2 |

### Two things the decisions changed that are worth stating plainly

**The kefalotyri substitutes are recorded but NOT written.** The
material claim — that parmesan and pecorino are aged hard cheeses
grated over the dish in the same way — is established. The
*suitability* is a research question (GUS-1107). A substitute row
with an unresearched suitability would be exactly the unsupported
claim this project refuses, and the rating would offer a substitute
the research may not support.

**The recipes being draft is a consequence, not an oversight.** A
`draft` recipe is not public, so the pilot's rating is verified in
the database and through the API's draft path, **not** on a live
public page. A recipe whose sourcing rating rests on a single source
does not belong on a public page yet — which is precisely why the
owner required two independent sources first.

### The FoodOn identifiers were verified, not recalled

Both classes added to the vocabulary-additions list were checked
against the FoodOn ontology itself (the `rdfs:label`, the
`obo:IAO_0000115` definition and the `rdfs:subClassOf` were read out
of the `.owl` file). **Two identifiers that had been written from
memory were wrong** — `FOODON:03540104` and `FOODON:03546797` do not
exist in FoodOn — and were corrected to `FOODON:03541403` (tamarind)
and `FOODON:03315935` (crustacean paste), with the EFSA group
`FOODON:03542517` (akami paste shrimp) recorded as the narrower
alternative. The provenance note is in
`docs/VOCABULARY-ADDITIONS.md`.

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
