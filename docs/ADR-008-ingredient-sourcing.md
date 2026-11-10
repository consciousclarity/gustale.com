# ADR-008: Country-aware ingredient sourcing

**Status:** Accepted · **Date:** 2026-11-10 · **Owner:** Alejandro ·
**Agent:** Hermes · **Backlog:** GUS-1101 · **Epic:** EPIC 07

**Scope:** the data model and the rating rules for a **Sourcing** rating
on every recipe page. This ADR decides the *shape*. GUS-1102 builds the
migration, GUS-1103 the engine, GUS-1104 the API, GUS-1105 the page,
GUS-1106 and GUS-1107 the data.

**Read first:** `.hermes/BRIEF_SOURCING_DIFFICULTY.md` in the
`gustale-state` repo. This ADR is the decision record for that brief;
the brief is the merged spec. Where the brief is ambiguous, this ADR
resolves it; where it is clear, this ADR cites it.

---

## Context

### What the owner asked for

On every recipe page, show **how hard the ingredients are to get in the
reader's chosen country**:

> **Sourcing: Moderate in Germany** — Fresh curry leaves are sold mainly
> in Asian grocery stores. Frozen curry leaves work; no other herb is an
> equivalent.

### The naming, which is not negotiable

**This is "Sourcing", never "Difficulty".** `recipes.difficulty` already
exists and measures *technique*. A reader who sees "Difficulty: Hard"
and "Sourcing: Hard" must never be confused about which is which. The
UI label is **"Sourcing"**, in every locale, without exception.

### What exists today — measured on `main` @ `78be807`

Every claim below was checked against the schema, not taken from the
brief on trust.

| Need | On `main` today | Consequence |
|---|---|---|
| Required vs optional | `recipe_ingredients.is_optional` ✓ | use as-is |
| Shared ingredient rows | `recipe_ingredients.ingredient_id` → Atlas `ingredients` (ADR-007 D5) | availability attaches to the **shared ingredient**, not the recipe |
| Countries | `geo_entities` country tier seeded by ISO 3166-1 (GUS-242), `parent_id` hierarchy, `geo_entity_names` per language | the country key is `geo_entities.id` / `iso_code` |
| **the country tier's size** | **259** country rows, 3,590 region rows (measured on the test DB) | ~250 in the brief was an estimate; **259** is the number that matters |
| Sources | `sources` + `citations` (`target_type`/`target_id`) + SOURCE-TIER-LIST | every availability/price record cites a source |
| Forms | `ingredient_variants` exists but models *varieties*; `recipe_ingredients` has **no** form column | forms need their own field |
| "Key" ingredient | **nothing** | new column |
| Availability, effort, price, substitutes | **nothing** — no table, no column, no data | the spec says "existing availability data"; **there is none**. All of it is new data that must be researched and cited. |
| Reader's country | **nothing** — `LocaleSuggestion.tsx` handles *language* only; the site is SSG | new client-side country choice |
| `ingredients.ubiquitous` | **nothing** | new column (the staples rule) |

**One near-miss worth recording.** `local_availability` appears in
`packages/db/src/schema/index.ts` — but it is a member of the
`changedElement` **enum** for dish lineages, not a table. There is no
availability table. (Checked while writing this ADR, because the name
reads like one.)

**One real gap worth recording.** `geo_entity_names` — the per-language
country-name table the country picker needs — **exists in the database
but is not in `packages/db/src/schema/index.ts`.** It was created by
`db/migrations/gus-242-seed-country-names.sql` and never added to the
Drizzle schema. It is correct and complete as a table (338 rows, 202
entities, 169 languages, `UNIQUE (entity_id, language)`, cascading
delete), and `geo_entities.local_name` is **deprecated and NULL by
design** — a single column cannot hold a multilingual country (CH has
4 official languages, IN 20+, RU 26).

Two consequences for this feature:

* GUS-1105's country picker can **read** `geo_entity_names` as it
  stands. It does not need a schema change to do that.
* But the API's Drizzle queries cannot reach it through the generated
  types. GUS-1105 will need either a raw SQL fragment for that one
  read, or `geo_entity_names` added to the Drizzle schema. **Adding it
  to the schema is the better fix** — a missing table in the schema is
  a trap for the next reader — and it is **additive**, so it fits
  GUS-1102's additive guarantee.

**Also measured:** 57 of the 259 countries have **no** non-English name
row yet. The picker must fall back to `geo_entities.name` (English)
when the page language has no row. All **32** countries the brief names
are present in the tier.

### The related backlog this must also serve

GUS-083 (substitutions), GUS-096 (preparation forms), GUS-101
(regional substitutions) and GUS-102 (seasonality) all need tables
this feature would otherwise duplicate. **The tables below are built to
serve those four as well**, and each of those tasks' notes will say so.

---

## The decision

### Decision 1 — Sourcing is a **computed** rating, never a stored one

There is **no `sourcing_rating` column** anywhere.

The rating is computed on read by a pure function, from the underlying
availability, price and substitute rows. The reasons:

* The spec lists five recalculation triggers — country change, recipe
  line change, availability/price/substitute change, price crossing a
  band, and staleness. A stored rating must be invalidated by all
  five. A computed rating is invalidated by **none**, because it is
  never stored.
* A stored rating drifts. A computed rating cannot.
* The brief §7 says exactly this: *"no stored ratings to go stale."*

**The cost is computation.** Mitigated by a short-TTL cache keyed on
recipe + country + data version (Decision 9).

### Decision 2 — The rating scale is **four values**

**Easy · Moderate · Hard · Availability unknown.**

"Availability unknown" is a **first-class result**, not an error and not
a fifth "worse than Hard". A recipe whose ingredients have not been
researched for a country is *unknown*, and saying so honestly is the
point: the brief's scope is ~7,500 ingredient-country pairs, so most
countries will be unknown for most ingredients for a long time.

### Decision 3 — The per-ingredient burden score

For each **required** ingredient, look at every **recipe-compatible
form** of it in the reader's country, and score each form on two
dimensions:

| Score | Availability | Price (vs. the local market) |
|---:|---|---|
| 0 | commonly available in ordinary retail | typical |
| 1 | occasional, seasonal, or somewhat hard to find | elevated |
| 2 | specialty / international store only, substantially limited, or import-dependent | high |
| 3 | unavailable in a recipe-compatible form | prohibitive |

**A form's burden = `max(availability, price)` — the higher of the two,
never the sum.** An imported premium is one problem, not two.

**The ingredient's burden = the LOWEST burden across its compatible
forms.** A packaged form being rare does not matter if fresh or
homemade is easy, and vice versa. (This is the rule that makes fixture
7 — coconut milk, Easy in *both* Indonesia and Germany — come out
right.)

**Optional ingredients are excluded from every step.** They may be
*mentioned* in the explanation ("ube is optional and hard to find
here") but never move the result.

### Decision 4 — The recipe result, evaluated in this order

1. **Hard** — some **key** required ingredient has burden 3 and no
   *suitable* substitute.
2. **Availability unknown** — no Hard, but some required ingredient has
   no usable record for the country, or only stale price data.
3. **Moderate** — any required ingredient has burden 1 or 2; or burden 3
   but rescued by a suitable substitute; or a non-key ingredient rescued
   by an approximate substitute (the explanation must disclose the
   change).
4. **Easy** — every required ingredient has burden 0 in at least one
   compatible form.

**Hard outranks Unknown**, because a known blocker is certain whatever
the unknowns are.

**A non-key ingredient with burden 3 and no substitute at all →**
**Moderate**, not Hard: the dish is still makeable without it. This is
the owner's answer (brief §9 answer 3), and the explanation names it.

### Decision 5 — Substitutes carry a suitability grade, and it is
**recipe-specific**

Every substitute carries one of:

* **suitable** — replaces it without materially changing the dish;
* **approximate** — changes flavour, texture, appearance or cooking
  behaviour; the change is stored as **text**;
* **not suitable** — stored and **shown** ("soy sauce is not a
  substitute for fish sauce"), because that is useful to the reader and
  prevents the site from ever suggesting it.

**Suitability is recipe-specific.** A cheese fine in baked pasta may be
wrong for fondue. So there are **two** tables: a global default
(`ingredient_substitutes`) and a per-recipe override
(`recipe_ingredient_substitutes`). The recipe-level row wins.

**A substitute is itself scored for the country.** A substitute with
burden ≥ 2 **does not rescue anything** — an imported substitute is not
a rescue.

**An approximate substitute never rescues a key ingredient.** That is
what `is_key` means, and it is why `is_key` is a column and not a
heuristic.

### Decision 6 — Price is recipe-specific, so recipe lines carry a cost
weight

Quantities are free text ("a pinch", "2½") and **cannot drive
arithmetic**. So each recipe line carries an editorial **cost weight**:

* `minor` — a pinch of saffron, a few leaves;
* `major` — the cheese in fondue. **This is the default.**

For a `minor` line the price score is **capped at 1**. Without this,
"a pinch of saffron" would price a whole recipe out of reach.

### Decision 7 — The data model

Three new tables, all with `status` (draft / published), `created_by`,
timestamps. All **additive** — nothing dropped, nothing renamed, every
existing row unchanged.

#### `ingredient_availability` — one row per ingredient × form × product
category × geo

| column | type | note |
|---|---|---|
| `id` | uuid PK | |
| `ingredient_id` | uuid → `ingredients` | the shared Atlas row (ADR-007 D5) |
| `form` | text CHECK | `fresh`, `frozen`, `dried`, `canned_or_packaged`, `paste_or_concentrate`, `extract`, `homemade` |
| `product_category` | text | e.g. *"imported Gruyère AOP block"* vs *"domestic Emmental"* — **separate rows** |
| `geo_entity_id` | uuid → `geo_entities` | a country; a region row **only** with `fallback_reliable = true` |
| `availability` | text CHECK | `common`, `occasional`, `seasonal`, `specialty_only`, `limited`, `unavailable` |
| `sourcing_effort` | text CHECK | `low`, `moderate`, `high` |
| `channel` | text CHECK | `supermarket`, `market`, `specialty`, `online` |
| `season` | text NULL | |
| `import_dependency` | text CHECK | `local`, `regional`, `imported`, `international_supply_chain` |
| `price_amount` | numeric NULL | |
| `price_currency` | text NULL | ISO 4217 |
| `price_unit` | text NULL | *"per 400 ml can"* |
| `price_band` | text CHECK | `typical`, `elevated`, `high`, `prohibitive`, `unknown` |
| `price_benchmark` | text NULL | what the price was compared against |
| `notes` | text NULL | |
| `source_id` | uuid → `sources` | **NOT NULL** — every row cites a source |
| `last_reviewed` | date | drives the 12-month staleness rule |
| `fallback_reliable` | boolean | **only meaningful on a region row** |
| `status`, `created_by`, timestamps | | |

**Why `product_category` is a separate column and not a note.** Price
comparisons are only meaningful against a like-for-like product. "Gruyère
is €12/kg" and "grated Emmental is €3/kg" are not comparable, and a
single row per ingredient would average them into a number that is
true of neither. Separate rows let the engine take the **best
recipe-compatible form**, which is the rule.

**Why `source_id` is NOT NULL.** The brief §5.4 is explicit: *"No
invented availability."* A nullable `source_id` would make an
unsourced row merely inconvenient rather than impossible. **A row
without a source cannot be written.**

#### `ingredient_substitutes` — the global default

`id`, `ingredient_id`, `substitute_ingredient_id`, `substitute_form`,
`suitability` (CHECK: `suitable` / `approximate` / `not_suitable`),
`change_note`, `source_id`, `status`, `created_by`, timestamps.

#### `recipe_ingredient_substitutes` — the per-recipe override

`id`, `recipe_ingredient_id` → `recipe_ingredients`, `substitute_ingredient_id`,
`substitute_form`, `suitability`, `change_note`, `source_id`, `status`,
`created_by`, timestamps.

**Same columns as the global default, so the merge is trivial**: the
recipe row wins if it exists; otherwise the global default applies.

#### `recipe_ingredients` — three new columns

| column | type | default | meaning |
|---|---|---|---|
| `is_key` | boolean NOT NULL | `false` | the ingredient defines the dish; an approximate substitute does not rescue it |
| `accepted_forms` | text[] | `NULL` | `NULL` = any form is acceptable |
| `cost_weight` | text NOT NULL | `'major'` | `minor` caps the price score at 1 |

**All three have defaults, so every existing row is unchanged.** That
is the additive guarantee.

#### `ingredients` — one new column

`ubiquitous boolean NOT NULL DEFAULT false` — the staples rule
(Decision 8).

#### Schema in **both** places

`packages/db/src/schema/index.ts` **and** `db/schema.sql`. The
migration is transactional. GUS-1102 ships it.

### Decision 8 — Staples (`ubiquitous`)

Without this, salt and water make **every** recipe Unknown. An
ingredient marked `ubiquitous` counts as **burden 0 everywhere** unless
a country row says otherwise.

The list is drafted by Hermes and **listed in the PR** so the owner can
see it (brief §9 answer 5): salt, water, sugar, wheat flour, eggs,
onion — and the brief's own examples. The rule is that the list is
short and defensible: an ingredient is a staple if it is in ordinary
retail in essentially every country in the tier.

### Decision 9 — Most specific data wins, and the region rule is strict

**Country row → region row with `fallback_reliable = true` → otherwise
unknown.**

**"Europe" is never one profile.** A region row is allowed **only**
when the source covers that region as a whole. A German supermarket
chain's German-only listing is **not** a European profile.

Where no reliable source exists for a pair, the row is recorded as
**"no reliable source"** — **never** filled in from a neighbouring
country or a continent. (Brief §9 answer 2.)

### Decision 10 — Freshness: price data expires at 12 months

Price data older than **12 months** (`last_reviewed`) counts as
**unknown for the price score**. Availability data has **no expiry** in
v1.

12 months is the owner's answer (brief §9 answer 4).

### Decision 11 — The reader's country is a **client-side choice**, never
forced

* A country picker on the recipe page, searchable, using
  `geo_entity_names` in the page language.
* The choice is stored in **`localStorage`, in a `try/catch`** — the site
  is SSG and storage can be refused (private mode, blocked cookies).
  The site must not break if it is.
* **First visit: suggest** a country from the browser locale region
  (`de-CH` → Switzerland), **never force**. Same principle as ADR-003:
  suggest, do not decide for the reader.
* **No IP geolocation.** No new service, no new data flow.
* **No choice and no suggestion** → a neutral prompt, *"Choose your
  country to see how easy the ingredients are to find"*, **not** a
  rating. An unresearched rating shown as if it were researched would
  be the two-truths failure ADR-002 exists to prevent.

### Decision 12 — The engine is **one pure function**

```ts
rateSourcing(recipeLines, availabilityRows, substitutes, country)
  → { rating, reasons[] }
```

**No I/O, no database access inside the function.** Its inputs are
plain data. That is what makes it testable against synthetic fixtures
and what makes it reusable from the API, a CLI, and a test.

**The reasons are structured data**, not prose: ingredient, form,
country, cause, substitute, `change_note`. The prose is generated from
them by **templates** — never free LLM text. (Brief §7: *"never free
LLM text"*.)

**The explanation must name**: the hard-to-get required ingredients,
the country used, the local form that makes something easy, suitable
substitutes, the disclosed change for approximate ones, and **both
dimensions when they differ** ("inexpensive, but sold only in specialty
stores").

Ingredient names come from `ingredient_translations`; country names
from **`geo_entity_names`** — falling back to `geo_entities.name`
(English) when the page language has no row, which is the case for 57
of the 259 countries today. **English templates first**, then the site
locales.

### Decision 13 — The API computes on read, with a short-TTL cache

`GET /api/recipes/:slug/sourcing?country=DE` → rating + structured
reasons.

* Computed on read, so **every** recalculation trigger is automatic.
* Country by **ISO 3166-1 alpha-2**, resolved through `geo_entities`.
* Region fallback **only** from rows with `fallback_reliable = true`.
* **Only published availability rows** are used.
* **400** on an unknown country code. **Unknown** (not an error) when
  the country is valid but has no data.

**Cache:** short TTL, keyed on recipe + country + data version. The
data version is what makes a data change visible without a redeploy —
the contract test in GUS-1104 depends on it.

### Decision 14 — The rating is **not** in `recipes.difficulty`, and the
recipe page labels it "Sourcing"

The island goes next to the recipe's other metadata, with a herb-green
accent, and it **passes the axe gate**.

**Where the recipe detail page renders must be confirmed before
building** (brief §7): `GustaleRecipesIsland.tsx` in this repo, or the
`consciousclarity/gustale.recipes` repo. GUS-1105 confirms this first.

### Decision 15 — Hermes publishes the data **and** the migration, with
one thing the owner keeps

**The owner's answer (brief §9 answer 1): Hermes publishes directly,
including the database.** For this feature, this replaces RULES.md
Rule 1's per-operation approval. Still mandatory:

* backup before the migration;
* a transactional migration;
* CI green;
* a receipt doc.

**The one thing Hermes cannot do: the CI `Live approval gate` only
accepts the `approved-live` label when the *owner* applied it.** When
GUS-1102's PR is green, Hermes sends the owner the PR link and asks
for the label. **The gate is not bypassed, edited, or worked around.**

### Decision 16 — The scope is the **full list**, and the unknown is
honest

**The owner's answer (brief §9 answer 2): the full list from the
start.** No small pilot.

* Research in parallel: (a) the recipe lines of `moussaka-greek` and
  `nasi goreng` in ID, DE, CH, US; (b) the spec's 20-ingredient
  catalogue (coconut milk … fresh corn masa); (c) the spec's price
  catalogue (fondue cheeses, saffron, vanilla, truffle, nori/miso/mirin
  …).
* **Every country in the `geo_entities` country tier — 259, measured —
  for every ingredient.** Not only the ones the brief names. ~30
  ingredients × ~259 countries ≈ **7,800 pairs**, roughly **15–20k
  rows.** (The brief's "~250" was an estimate; the tier is 259.)
* **Order:** the 32 countries the brief names (ID, TH, PH, LK, MY, VN,
  KH, CN, JP, KR, IN, IR, AF, GH, NG, CM, UG, ZA, MA, TN, JM, MX, BR,
  US, CA, AU, DE, FR, GB, IT, ES, CH) first, then the rest by
  population, largest first.
* **Work in batches** — one ingredient family × a set of countries — so
  **each batch is publishable on its own**. The rating shows Unknown
  for whatever is not yet researched.
* **After the first batch, report pairs/day** to the owner so the total
  time can be estimated.
* Where no reliable source exists for a pair, record **"no reliable
  source"** — never fill the gap from a neighbouring country or a
  continent.

**The owner's answers in brief §9 are recorded here and are not asked
again.** They are: publishing (answer 1), scope (answer 2), the
non-key/unavailable/no-substitute → Moderate rule (answer 3), the
12-month staleness threshold (answer 4), and the staples list being
drafted and listed in the PR (answer 5).

### Decision 17 — The verification is **16 fixtures**, synthetic data is
fine

The fixtures test the **rules**, not the world. They live in the test
DB and the unit tests; they are the acceptance criterion for GUS-1103.

1. all required ingredients common → **Easy**
2. a missing ingredient with a suitable substitute → **Moderate**
3. hard-to-find ingredient with a usable alternative form → **Moderate**
4. missing key ingredient, no suitable substitute → **Hard**
5. no country data for a required ingredient → **Unknown**
6. unavailable / expensive optional ingredient → **no change**
7. coconut milk, Indonesia vs Germany → **Easy in both**, different
   explanation (fresh/homemade vs packaged)
8. cassava stew: Ghana **Easy** (fresh) · Germany **Moderate** (frozen /
   specialty)
9. ackee & saltfish: Jamaica **Easy** · canned-only country
   **Moderate** · a no-supply country **Hard** (ackee is key, no
   substitute)
10. preserved-lemon tagine: Morocco vs Germany, salted lemon marked
    approximate
11. gochujang dish: South Korea **Easy** · Germany **Moderate/Hard** by
    import effort
12. fondue: Switzerland **Easy** · Indonesia **Moderate** (suitable local
    blend) / **Hard** (none)
13. coconut curry where only an imported can exists: stocked + reasonable
    → **Moderate**; prohibitive + no alternative → **Hard**
14. price band Typical → High flips a recipe **Easy → Moderate**
15. price older than the threshold → **Unknown**
16. `minor` cost weight caps an expensive spice at **Moderate**

**Live check after deploy:** the pilot recipe(s) render a rating for
each pilot country, and a non-pilot country shows **Unknown, not an
error**.

### Decision 18 — The doubtful rows in the owner's table are re-researched
first

The brief §5.4 names three. They are **not** written from the owner's
example table — the table is a **list of what to research**, not data.

* **Ackee in the US** — the spec expects **Hard**. **Re-verified
  2026-11-10** against the FDA's own page (*"Hypoglycin A and Ackee
  Fruit"*, fda.gov/food/natural-toxins-food/hypoglycin-and-ackee-fruit,
  fetched via the Jina reader):

  > "Ripe ackee can be frozen, canned, or cooked. Most of the ackee
  > products in the U.S. are imported from tropical countries, such as
  > Jamaica, Belize, and Haiti."

  > "the FDA places the processor and their products on one of two lists
  > on Import Alert 21-11 'Detention Without Physical Examination of
  > Ackees': *The Green List*, meaning their ackee products are
  > excluded from DWPE. […] *The Yellow List*, meaning border agents
  > can detain these ackee products without physical examination."

  So **canned, frozen and dried ackee is legally importable and sold in
  the US**, from Green-List processors who have demonstrated food-safety
  controls. The US is therefore most likely **Moderate** (canned,
  Caribbean/specialty stores), **not Hard**.

  **Fixture 9 therefore uses a synthetic no-supply country, not the
  US.** The brief's reasoning holds, and now rests on the FDA's own
  wording rather than on a summary of it.
* **Makrut lime in South Africa** — and "calamansi" in the same row.
  Calamansi is a **different citrus**. The whole row is re-researched.
* **"Fresh gochujang"** — gochujang is a **fermented paste**; the form
  is `paste_or_concentrate` or `homemade`, never `fresh`.

---

## The owner decisions, recorded

**The owner answered brief §9 on 2026-11-10. They are recorded here so
they are not asked again.**

| # | Decision |
|---|---|
| 1 | **Hermes publishes directly — data rows AND the database migration.** Replaces RULES.md Rule 1's per-operation approval *for this feature*. Backup, transactional migration, CI green and a receipt doc remain mandatory. **The `approved-live` label is the owner's to apply** — Hermes sends the PR link and does not bypass the gate. |
| 2 | **Scope: the full list from the start.** Every country in the country tier (~250), for every ingredient. The 32 named countries first, then by population. Batches are individually publishable. "No reliable source" is recorded, never inferred. **Report pairs/day after the first batch.** |
| 3 | **Non-key ingredient, unavailable, no substitute → Moderate**, and the explanation names it. |
| 4 | **Price staleness: 12 months.** |
| 5 | **Staples list: Hermes drafts it, applies it directly, and lists it in the PR** so the owner can see it. |

---

## Consequences

### Good

* **Nothing can go stale.** The rating is computed, so it cannot.
* **The unknown is honest.** Most countries will be unknown for most
  ingredients for a long time, and the site says so rather than
  guessing.
* **The tables serve four other backlog items** (GUS-083, GUS-096,
  GUS-101, GUS-102) instead of duplicating them.
* **A source is mandatory, not optional.** `source_id` is NOT NULL, so
  an unsourced row cannot exist.
* **"Sourcing" cannot be confused with "difficulty".**

### Bad, and honestly so

* **~15–20k rows to research and cite.** At ~7,800 pairs, this is the
  largest data task in the project. The batching rule and the
  pairs/day reporting are what make it tractable.
* **Most countries will show "Unknown" for a long time.** That is
  correct, but it is a poor first impression. The owner's answer was
  the full list, and this ADR accepts the consequence rather than
  narrowing the scope.
* **The engine is computed per request** (with a cache). It is cheap
  — it is a set operation over rows already loaded — but it is not
  free.
* **Price data is perishable.** 12 months is short for a large
  catalogue. The `last_reviewed` column is the renewal queue.

### Neutral

* The "key ingredient" flag is editorial. It is a judgement, and it
  is recorded per recipe line, which is where the judgement belongs.
* Price comparability depends on `product_category` being filled in
  honestly. A reviewer who writes "cheese" instead of "domestic
  Emmental" has made the row useless for price.

---

## The data the rating attaches to — a measured gap

Recorded 2026-11-10, while preparing GUS-1106. It is a finding, not a
change of decision, but the reader of this ADR needs it: **the
sourcing rating has almost nothing to attach to yet.**

| what | measured on the test database, after migration 0055 |
|---|---|
| `ingredient_categories` (the 435-row vocabulary) | **435** |
| `ingredients` (the rows availability attaches to) | **4** |
| `recipe_ingredients` (the recipe lines) | **0** |
| `dish_ingredients` (the legacy dish lines) | moussaka only — 4 rows |

And the four are: `eggplant`, `lamb-mince`, `tomato`, `bechamel` —
created by the moussaka seed, plus the 19 draft rows the Stage B seed
added and the orphan `bechamel-sauce` (live total **24**).

**Why this matters.** The 435 categories are a *vocabulary of kinds*
("cheese", "root vegetable", "leafy green"). The rating attaches to
*ingredients* — the specific things a recipe names, so that "the same
dried chilli is hard to find in two different recipes" (Decision 5).
There is currently no ingredient vocabulary to research availability
against. GUS-1107's ~30 ingredients × 259 countries cannot be loaded
until the ingredient rows exist.

**Why it is not this ADR's problem.** Creating the ingredient
vocabulary is a separate piece of work with its own editorial rules
(one canonical row per ingredient, shared across recipes, per
ADR-007 Decision 5), and it is not in the brief's scope. The brief's
§2 table measured the *availability* tables as absent — it did not
measure the *ingredients* table, because on `main` at the time the
question had not been asked.

**Consequence for the plan.** GUS-1106 (the pilot dataset) and
GUS-1107 (the full catalogue) both depend on an ingredient vocabulary
that does not exist yet. That dependency is now explicit and tracked
on the kanban, rather than discovered halfway through a research
batch.

**The recipe-line gap is separate and smaller.** `recipe_ingredients`
has **0** rows: the rows that exist inside migration 0052 are proof
fixtures, and the live moussaka recipe's lines live in the legacy
`dish_ingredients` table. ADR-008's rating reads `recipe_ingredients`,
because that is where `is_optional`, `is_key`, `accepted_forms` and
`cost_weight` live. So the moussaka lines have to be carried into the
new table before the pilot can rate a recipe at all — and the nasi
goreng lines, which exist only as prose in a long description, have to
be made into lines.

---

## What this ADR does **not** decide

* **The exact rating for any real ingredient in any real country.**
  That is data (GUS-1106, GUS-1107).
* **The staples list's contents.** Drafted in GUS-1106, listed in that
  PR.
* **Where the recipe page renders.** GUS-1105 confirms it before
  building.
* **The locale translations of the templates.** English first; the
  site locales follow.
* **The `local_availability` enum member** — unrelated to this feature
  and untouched.
* **The remaining doubtful rows** — the makrut lime row and the
  gochujang form are *specified* here (re-research; a fermented paste,
  never `fresh`) but their *data* is GUS-1107's work.

---

## Related documents

* `.hermes/BRIEF_SOURCING_DIFFICULTY.md` — the merged brief (in the
  `gustale-state` repo)
* `docs/ADR-007-recipe-schema.md` — the recipe schema this builds on
* `docs/SOURCE-TIER-LIST.md` — the source classes the rows cite
* `docs/ADR-002-directus-admin.md` — the two-truths rule the unknown
  respects
* `docs/ADR-003-*.md` — the "suggest, never force" principle (Decision
  11)
* `docs/ADR-005-live-approval-gate.md` — the gate the owner keeps
