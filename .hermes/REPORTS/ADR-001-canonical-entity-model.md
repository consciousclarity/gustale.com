# ADR-001 — Canonical culinary entity model

**Status:** 🟢 **CLOSED — approved 2026-10-26 (with amendments D3b–D3f, D6b-amend). Not implemented. No migration written.** One open follow-up (cuisine hierarchy) recorded in §4 as a follow-up, not a decision.
**Date:** 2026-10-25 · **Task:** GUS-014 (EPIC 02 — Redesign the culinary knowledge model) · **Related:** ROADMAP.md §4 (EPIC 02), GUS-015…GUS-025

---

## 1. Context

Gustale's schema grew organically around one content type: *the dish*. Every other concept — a regional variant, a cooking technique, an ingredient, a place, a community, a lineage — was modelled as a **category row** in a single `categories` table, or as a `tag`, or as a bespoke table added later.

The consequence is measurable. Live catalog, 2026-10-25:

| | |
|---|---|
| Categories in the table | 152 |
| Attached to at least one dish | **43** |
| Attached to **no dish at all** | **109** (71.7%) |

And the 43 that are in use mix **classification dimensions** that should never be compared to each other:

| Live category | Dishes | Actually a… |
|---|---|---|
| `main-course` | 97 | **course** |
| `appetizer` | 25 | **course** |
| `indonesian-cuisine` | 16 | **cuisine** |
| `curry` | 8 | **dish family / technique** |
| `kebab` | 8 | **cooking technique** |
| `bread` | 6 | **dish family** |
| `dumpling` | 6 | **dish family** |
| `noodle-soup` | 9 | **dish family** |
| `fried-rice` | 1 | **technique** |

ROADMAP.md §4 already names this: *"The current food-family directory includes categories such as Appetizer, Noodle soup, Filipino cuisine, and Turkish cuisine within one classification. These describe different concepts and should not be treated as equivalent."*

A second, deeper problem: **the dish is doing two jobs.** `rendang` the culinary concept and *a specific recipe for rendang* are the same row, distinguished only by prose. The schema has `dish_variants` (a regional variant of a dish) but no place to record *a documented preparation* of a dish — so the actual recipe (ingredients, quantities, steps, yield) has nowhere to live except inside the dish's own description text.

Third: **claims have no addressable unit.** `citations` links a dish to a source. `sources` holds a bibliography entry. There is no row that represents *"this specific sentence is asserted by this specific source"* — so there is no way to say *which part* of a dish's description is supported, which parts are disputed, or which parts have no source at all.

## 2. Decision

**Adopt the ROADMAP §4 entity architecture, and introduce a `claim` as the atom of evidence.**

### 2.1 The entity types

```
CULINARY KNOWLEDGE GRAPH
│
├── Dish ──────────── the culinary concept (what rendang IS)
│   ├── Names / aliases          → dish_translations (exists)
│   ├── Descriptions             → dish_translations (exists)
│   ├── Dish family              → NEW: dish_families
│   ├── Cuisine                  → NEW: dish_cuisines
│   ├── Course                   → NEW: dish_courses
│   ├── Cultural tradition       → NEW: dish_traditions
│   ├── Regional variants        → dish_variants (exists)
│   ├── Recipes                  → NEW: recipes + recipe_steps + recipe_ingredients
│   ├── Claims                   → NEW: claims (see §2.4)
│   └── Related dishes           → dish_relations (exists)
│
├── Ingredient ───── NEW: ingredients (exists, needs re-scoping)
│   ├── Botanical / zoological identity
│   ├── Regional names           → ingredient_translations (exists)
│   ├── Culinary uses
│   └── Substitutions
│
├── Cooking technique ─ NEW: preparation_methods (exists — needs promotion)
│
├── Place ─────────── geo_entities (exists) + food_regions (exists)
│
├── Community / Tradition ─ NEW
│
├── Historical event ─ NEW
│
└── Evidence
    ├── Source ──── sources (exists)
    ├── Claim ──── NEW: claims
    └── Claim→source ─ citations (exists, but needs to point at claims)
```

### 2.2 What changes vs. today

| Today | Proposed | Change type |
|---|---|---|
| `categories` (152 rows, mixed dimensions) | split into `dish_families`, `dish_cuisines`, `dish_courses`, `ingredient_categories` | **new tables + migration** |
| `dish_categories` join | four separate joins, one per dimension | **new tables** |
| `tags` (free-form, 0 used on reference dishes) | folded into `dish_traditions` | **new table** |
| `dish_variants` (region/culture variant) | unchanged, becomes a first-class `Dish` child | unchanged |
| — | `recipes`, `recipe_steps`, `recipe_ingredients` | **new** |
| — | `claims` | **new** |
| `citations` (dish → source) | `citations` (claim → source), plus `dish_claims` (dish → claim) | **extended** |
| `lineages` / `dish_lineages` (historical lineage) | unchanged, promoted to a first-class dimension | unchanged |
| `geo_entities` / `food_regions` / `dish_regions` | unchanged | unchanged |

### 2.3 The dimension rule

**A category may only be compared with categories in the same dimension.** Concretely:

```
dish_families     : dumpling, curry, bread, noodle-soup, kebab, …
dish_cuisines     : indonesian, japanese, chinese, filipino, mexican, …
dish_courses      : main-course, appetizer, dessert, side, …
ingredient_categories : legume, dairy, …
dish_traditions   : minangkabau, glasgow-muslim, …   (cultural, not geographic)
```

This is exactly the ROADMAP §4 table. It also resolves the OPERATIONS.md rule that country-cuisine singletons should not be categories at all — **cuisine becomes a dimension, not a tag.**

### 2.4 Claim as the evidence atom

```sql
claims (
  id            uuid primary key,
  subject_type  enum('dish','recipe','ingredient','place','tradition'),
  subject_id    uuid,
  predicate     text,      -- 'originated_in', 'cooked_by', 'contains',
  object_type   enum('place','technique','ingredient','dish','time_interval'),
  object_id     uuid,
  text          text,      -- the human-readable statement
  claim_class   enum('documented','scholarly_interpretation','oral_tradition',
                     'disputed','hypothesis','unsupported'),
  status        enum('draft','research_pending','under_review','verified',
                     'disputed','published','needs_revision'),
  confidence    enum('high','medium','low','speculative'),
  verified_at   timestamptz,
  verified_by   uuid,
  created_at, updated_at
)

citations (
  id          uuid primary key,
  claim_id    uuid references claims(id),   -- was: target_type + target_id
  source_id   uuid references sources(id),
  locator     text,          -- 'p. 42', 'section 3', 'para 1'
  supports    enum('supports','refutes','context','mentions'),
  excerpt     text,
  accessed_at date
)
```

`citations` today is `(source_id, target_type, target_id, claim_text, location)` — `claim_text` is a free-text field on the citation, which means "the supported statement" is *prose*, not an addressable row. That is precisely what GUS-028 asks to fix.

### 2.5 Why a `claim` and not just better `citations`

Without a claim row:
- you cannot mark one part of a description as disputed while another is verified;
- you cannot count how much of a dish is evidenced (GUS-011's finding: 121/121 dishes are Wikipedia-only, but there is no way to say *how much* of each dish that covers);
- you cannot re-verify a claim on its own schedule (GUS-036);
- "corroboration" (GUS-029) is impossible to compute, because independence is a property of claims, not of dishes.

## 3. The three reference dishes, checked

The ADR must survive contact with real data. All three checked against the live API, 2026-10-25.

### 3.1 Rendang

```
name         Rendang
longDesc     (none)
origin       Indonesia
categories   indonesian-cuisine, stew, curry, main-course
tags         []
preparations curry (steps: null)
ingredients []
variants     []
sources      1 — Wikipedia, The Free Encyclopedia, en.wikipedia.org/wiki/Rendang
             claim: "A West Sumatran dry curry of beef slow-cooked for hours
                     in coconut milk and a paste of ginger, galangal, ..."
relations    6  { family: 4, shared-method: 1, shared-ingredient: 1 }
lineages     curry-spiced-stew
journey      0 beats
```

**Mapping:** Dish `rendang` → family `curry`, cuisine `indonesian`, course `main-course`, technique `curry` (preparation), lineage `curry-spiced-stew`, place `Indonesia` (origin). The `stew` category currently on rendang is **neither a family nor a cuisine nor a course** — it is a *preparation character*. In the new model it becomes a technique or is dropped; it does not survive as a dimension value. This is the taxonomy correction in action.

**Gaps the ADR exposes:**
- `longDesc` is empty → no description row to attach claims to. Claim rows need a `text` anchor.
- `preparations: curry` has **steps: null** → the technique is asserted but the method is undocumented. That is a *claim without evidence*, exactly what GUS-026 must handle.
- `ingredients: []` → rendang has no ingredient rows at all, despite the Wikipedia source describing ginger, galangal, turmeric, coconut milk. Those ingredients exist in prose only. There is no recipe to hold them.
- `variants: []` → rendang has **no regional variants**, though it is the canonical example of a dish with strong regional variation (Padang/Minangkabau vs. other West Sumatran preparations). The model supports them; the data does not have them.

### 3.2 Chicken Tikka Masala

```
name         Chicken Tikka Masala
longDesc     (none)
origin       United Kingdom          ← the Glasgow problem
categories   curry, main-course
tags         []
preparations curry (steps: null)
ingredients []
variants     []
sources      1 — Wikipedia, The Free Encyclopedia
relations    4  { family: 1, shared-method: 2, regional-cousin: 1 }
lineages     curry-spiced-stew
```

**Mapping:** family `curry`, course `main-course`, technique `curry`, lineage `curry-spiced-stew`, place `United Kingdom`.

**This is the roadmap's designated test case** (ROADMAP §5: *"The dish originated in Glasgow"*). The current schema **cannot represent the dispute**:
- `sources` holds one Wikipedia row whose `claimText` is a neutral description, not an origin claim.
- There is no claim row to attach "originated in Glasgow" or "originated in the subcontinent" to.
- There is no place row for Glasgow at the right granularity to scope an origin claim (`geo_entities` has countries; `food_regions` is for cuisines).
- `variants: []` — the dish has a documented UK/Indian variant relationship (`relations: regional-cousin: 1`) but no variant rows.

**Conclusion:** the entity model is **not** the blocker for the Glasgow dispute; the *claim* model is. A `claims` row with `claim_class: 'disputed'`, two `object_id` references to competing places, and two `citations` rows (one supporting, one refuting) is what makes the dispute representable. This confirms the ADR's ordering: `claims` is the keystone.

### 3.3 Tacos al Pastor

```
name         Tacos al Pastor
longDesc     (none)
origin       Mexico
categories   mexican-cuisine, main-course, street-snack
tags         []
preparations kebab (steps: null)
ingredients []
variants     []
sources      1 — Wikipedia
relations    0        ← no relations at all
lineages     skewered-grilled-meat
```

**Mapping:** family `kebab` (technique-as-family, the classic taxonomy smell), cuisine `mexican`, course `main-course` **and** `street-snack` — two course values on one dish, which the current single-`categories` model cannot type-check. In the new model `street-snack` is either a course (then `main-course` is wrong) or a *format* (then it needs its own dimension).

**Gaps:** zero relations. The dish has a well-documented lineage (Lebanese *shawarma* → Mexican *al pastor*) and the schema's `dish_relations` supports exactly that — it is simply unpopulated. `variants: []` despite it being a textbook regional variant.

### 3.4 What the reference dishes tell us

| Finding | Consequence for the ADR |
|---|---|
| All three have **empty `longDescription`** | Claims need a `text` anchor independent of the dish description; description writing is a separate workstream (not modelled here) |
| All three have **zero ingredients** and **zero recipe steps** | The `recipes` subtree is the largest gap; without it "recipe variant" (GUS-015) has nowhere to live |
| All three have **1 Wikipedia source** and no other evidence | The evidence atom must exist before EPIC 03 can do anything; `claims` is P0 |
| CTM's origin dispute is **unrepresentable** today | `claims` + scoped `place` + `claim_class: disputed` is the minimum viable fix |
| `main-course` + `street-snack` co-occur on one dish | Dimensions must be typed; a single `categories` join cannot express this |
| `tacos-al-pastor` has **0 relations** while its lineage is textbook | Typed relations (GUS-020) need backfill tooling (GUS-025), not just schema |

## 4. Consequences

### Positive
- The category table stops being a dumping ground: 109 orphans get either a dimension or deletion.
- Claims become countable and auditable: "how much of this dish is evidenced?" becomes a query, not a feeling.
- Disputes (Glasgow) become data instead of prose.
- Recipes get a home, so GUS-015/GUS-016 stop fighting over the `dishes` row.

### Negative / risky
- **12 new tables** (dimensions, recipes, claims, traditions, events). This is the largest migration in the project's history.
- Every dish's category assignments must be re-expressed across dimensions. The 43 live categories map onto 4 dimensions, so each dish's 2-4 categories become 2-4 typed assignments — mostly mechanical, but the taxonomy calls (e.g. `stew`) need a human.
- `citations` must be migrated from `target_type/target_id` to `claim_id`, and the 121 existing dish-level citations become claim-level — which means **creating a claim row per existing citation**. That is the honest cost: today's 121 Wikipedia citations are 121 claims that happen to be about whole dishes.
- Readers of the old URLs must keep working (GUS-018/025): dish slugs and ids must be preserved.

### Open follow-up — cuisine hierarchy (national vs. regional)

**This ADR does not decide a cuisine hierarchy.** `dish_cuisine` is specified here as a flat, single-valued dimension with a controlled vocabulary, and `rendang` is assigned `indonesian`. But `indonesian` (national) and `minangkabau` (regional/regional-cultural) are different *granularities* of the same axis, and the model currently has no way to say that a dish is Minangkabau *within* Indonesian cuisine rather than in some peer category of it.

Observed pressure for this:
- `rendang` → `indonesian` is true but coarse; its documented origin is West Sumatra / Minangkabau.
- The reference dish already carries `origin` as a **place** (`geo_entities`), which is a different mechanism from a cuisine value — `place` = where it came from, `cuisine` = which culinary tradition it belongs to. `minangkabau` is arguably both a place-derived cuisine and a culinary tradition.
- The 152-row `categories` table contains both national (`indonesian-cuisine`, `mexican-cuisine`) and regional (`indonesian-cuisine` vs. implied sub-regional) values mixed flat, which is exactly the flattening D1 removes.

**Open questions for a follow-up ADR (not decided here):**
1. Is cuisine hierarchical (national → regional → sub-regional), or flat with a separate `dish_tradition` layer carrying the regional identity?
2. If hierarchical, is the hierarchy stored as a parent pointer on the cuisine rows, or as a `dish_cuisines` join with a depth/level column?
3. Does `minangkabau` belong in `dish_cuisine`, `dish_tradition`, or both — and if both, what stops the two from disagreeing?
4. Does a dish get one cuisine or a path through the hierarchy (`indonesian > minangkabau`)? Note this interacts with the single-valued `dish_cuisine` decision (D7b): a path is not a single value.

**Until that follow-up lands, the pilot uses the flat vocabulary as decided here** — `rendang` → `dish_cuisine = indonesian` — and the Minangkabau specificity is carried by `origin` (place) and by claims, **not** by inventing a `minangkabau` cuisine row.

### Sequencing (proposal, not decided)
1. `claims` + `citations.claim_id` — unblocks EPIC 03, and is the prerequisite for GUS-026's policy to be enforceable.
2. `recipes` + `recipe_steps` + `recipe_ingredients` — unblocks GUS-015.
3. Dimensions — split `categories`; the 109 orphans get resolved at the same time.
4. `dish_traditions`, `dish_variants` enrichment, `historical_events`.

## 5. Decisions taken (Alejandro, 2026-10-26)

### D1 — Seven classification dimensions

`dish_family` · `dish_cuisine` · `dish_course` · `dish_technique` · `ingredient_category` · `dish_tradition` · `dish_context`

Five are already forced by the live data; `dish_tradition` is the cultural layer the ROADMAP's entity model needs; `dish_context` was added in D2.

### D2 — `street-snack` splits: course + context

`street-snack` is **not** a course. It becomes:
- `dish_course = snack`
- `dish_context = street-food` (one of: `street-food`, `home`, `festival/ceremonial`, `restaurant`, `market`)

`tacos-al-pastor` today carries both `main-course` and `street-snack`. In the new model that is `dish_course = main-course`, `dish_context = street-food` — no ambiguity. (`dish_course` is single-valued; `dish_context` is multi-valued — see D7b cardinality table.)

### D3 — The noun/gerund rule

> **family = nouns (what it is)**
> **technique = gerunds (how it's made)**

Consequences for the live data:
- `dish_technique` values are gerunds: **stewing, braising, simmering, grilling**, and the other existing techniques (`baking`, `frying`, `roasting`, `grilling`).
- `kebab` and `curry` are **removed from `dish_technique`** — they are families. They were doing double duty as family *and* technique, which is precisely the ambiguity the dimension split exists to kill.
- `stew` **stays a `dish_family` value** (it is a noun, and it names a family of preparations).
- **Rendang** → `dish_family = curry`, `dish_technique = braising` (a dry braise), and the `stew` tag is **dropped**.

### D3b — `tacos-al-pastor` family = `taco`; its shawarma lineage is a relation, not a family

`tacos-al-pastor` → `dish_family = taco`.

`taco` is a **controlled-vocabulary family value** (a noun naming a family of preparations — the same class as `curry`, `kebab`, `stew`, `dumpling`). `kebab` is **not** the family here: `kebab` names a *form of meat preparation*, which is what the technique dimension is for, and it would force `kebab` back into double duty that D3 just killed.

**The Lebanese `shawarma` → Mexican `al pastor` lineage is a `dish_relations` row, not a family assignment.** It is recorded as a typed relation:

> `dish_relations(target = shawarma, type = derived-from)`

Rationale: lineage is a historical relationship between two dishes, not a taxonomic membership. A dish's family answers *what kind of dish is this*; the relation answers *where did this come from*. Putting the lineage in `dish_family` would make the family dimension a relation store — the same mistake D3 removed.

**Consequence for the pilot spec:** `tacos-al-pastor` carries `dish_family = taco` and **no** family value of `kebab`; its shawarma lineage appears as a `dish_relations` row with type `derived-from`.

### D3c — `chicken-tikka-masala` technique = `grilling` + `simmering`

`chicken-tikka-masala` → `dish_technique = grilling, simmering` (multi-valued, per D7b).

*Grilling* covers the `tikka` (the marinated chunks cooked over fire); *simmering* covers the sauce the grilled pieces are added to. Both are gerund technique values already in the controlled vocabulary. The technique dimension is multi-valued precisely so a two-stage method like this is representable without inventing a compound verb.

**Consequence:** the pilot spec must list **two** technique values for `chicken-tikka-masala`, and `dish_technique` for the pilot is validated against the controlled vocabulary (no free-text techniques).

### D3d — `rendang` context = `home` + `festival/ceremonial` + `restaurant`

`rendang` → `dish_context = home, festival/ceremonial, restaurant` (multi-valued, per D7/D7b).

Rendang is not only a home dish: it is served at **festivals and ceremonial occasions** (it is a staple of Minangkabau ceremonial and celebratory cooking, including wedding and communal feasts), and it is a **restaurant** dish too. Recording all three is the point of a multi-valued context dimension — the single-valued alternative would have forced dropping two true facts.

### D3e — Controlled-vocabulary discipline: `dry braise` is a claim, not a technique value

**All 7 dimensions accept only controlled-vocabulary values.** No free-text values, no compound adjectives, no parenthetical qualifiers in the dimension column.

`braising` is the technique value for `rendang`. The fact that the braise is **dry** (as opposed to wet/liquid braising) is **not** a dimension value — it is an **assertable fact** and therefore belongs in a **claim**:

> claim: `rendang` — technique-qualifier → `dry` (braise), source-anchored

This is the same principle as D6: a compound fact that one source can settle is one claim. "Rendang is braised" (technique = `braising`, dimension value) and "the braise is dry" (a qualifier on the technique, a claim) are two separately-sourced facts. If the vocabulary later proves to need `dry-braising` as an atomic technique, it is added to the controlled vocabulary explicitly and the claim is re-expressed — but it is **not** smuggled into the dimension as `braising (dry)`.

**Vocabulary rule for the pilot spec:** every dimension cell is either a value drawn verbatim from the dimension's controlled vocabulary, or the literal token **`unset`**. Nothing else — no parentheticals, no modifiers, no prose.

### D3f — `dish_course` rationale: primary meal role

**Corrected rationale for the single-valued `dish_course` dimension:**

> **`dish_course` = the dish's PRIMARY role in a meal.** Secondary / situational uses belong to `dish_context`.

A dish may be eaten in more than one situational capacity, but it occupies one *primary* seat at the table. Examples:
- `tacos-al-pastor` — primary course: `main-course`; it is also eaten as street food → that is `dish_context = street-food`, not a second course value. (D2's split stands; `street-snack` was correctly rejected as a course.)
- A dish served both as an appetizer and as a main gets `dish_course = main-course` (its primary role) and any appetizer usage is captured as context, not as a competing course.

This is the reason `dish_course` is single-valued while `dish_context` is multi-valued: **one primary role, many situations.**

### D4 — The description stays authored; claims anchor it

- The `Dish` row keeps an **authored** description. It is not derived from claims.
- **Claims are the source of truth for evidence** — the description is the prose; the claims are the evidence layer attached to it.
- **Each factual sentence carries claim-ID anchors.**
- **Validation fails** if a sentence is anchored to a claim that is unpublished, retracted, or missing.
- **Unanchored sentences are allowed but flagged `unevidenced`.**
- **Evidence coverage = anchored-sentence ratio.**
- Live edits of the description are fine.

### D4a — Which column the claims attach to: `short_description`, not `long_description`

**Correction, verified against the live schema 2026-10-26.** The `dishes` table has **two** description columns:

| column | pilot dishes | catalog |
|---|---|---|
| `dishes.short_description` | **populated** (149–206 chars, all 3) | populated for all |
| `dishes.long_description` | empty (all 3) | empty for 100 of 122 |

**`short_description` is the prose the claims anchor to.** `long_description` is the long-form 200–400-word field (ADR content rule) and is a separate, later workstream.

Each pilot dish's `short_description` is a single compound factual sentence, and **rendang's is verbatim the D6 worked example**:

> *"A West Sumatran dry curry of beef slow-cooked for hours in coconut milk and a paste of ginger, galangal, turmeric, chili, lemongrass, garlic, and shallots until the sauce fully reduces and the meat darkens."*

D6 decomposes that sentence into 6 claims (origin / family / protein / technique / medium / duration), and the pilot's dimension values are derived from it. That is the D4 "authored prose + claim anchors" model working exactly as intended.

**Consequence — coverage is measurable, and the honest starting value is `0%`:**
- each pilot dish has **≥1 factual sentence** → coverage is **measurable**, not `null`;
- **no claim rows exist yet** (claims are GUS-027/028) → coverage = **`0%`** and corroboration = **`0%`**;
- `0%` is distinct from `null`: `null` = *not measurable*, `0%` = *measurable and unsourced*.

This is consistent with the catalog-wide finding (GUS-011): **121/121 dishes are Wikipedia-only**, so `0%` corroboration across the board is the true baseline, not a defect to be hidden.

**Not contradicted:** the ADR's earlier statement that *all three have empty `longDescription`* remains **true**. The correction is that `short_description` also exists, is populated, and is where the claims live.

### D3g — Relation types are an existing vocabulary, not invented per use

`dish_relations.relation_type` is **free text** (no CHECK constraint), which makes it easy to introduce a one-off type. The pilot uses the vocabulary that already exists:

| `relation_type` | live uses | meaning |
|---|---|---|
| `family` | 104 | taxonomic family relation |
| `regional-cousin` | 30 | regional variant kinship |
| `shared-method` | 28 | shares a cooking technique |
| `similar-serving` | 14 | eaten in similar contexts |
| `shared-ingredient` | 6 | shares a defining ingredient |
| `ancestor` | 4 | X is the documented ancestor of Y |
| `diaspora` | 4 | X travelled/adapted into Y in a diaspora |

**The shawarma → al pastor lineage is `ancestor`**, not a new `derived-from` type.

Note that `shawarma → hamburger-american` is `diaspora` (*"Doner kebab's diaspora to Berlin inspired the hamburger-among-immigrants"*, strength 2) — a **different** relation. The two shawarma relations use different types because they tell different stories, which is why the pilot must not copy the `diaspora` precedent by mistake.

**Direction convention (CORRECTED 2026-10-26 — Alejandro): `from_dish_id` is the ANCESTOR, `to_dish_id` is the descendant.**

An earlier draft of this ADR asserted the opposite (descendant → ancestor) and was **wrong**. The live rows' own `reason` text settles it:

| row | reason | source is… |
|---|---|---|
| `bacalhau-a-bras → vindaloo` | *"…is the direct **ancestor of** vindaloo"* | **the ancestor** |
| `biryani-hyderabadi → jollof-rice` | *"Biryani's … tradition is the documented **ancestor of** jollof"* | **the ancestor** |

`from_dish_id` is always the **subject** of the relation and `to_dish_id` the **object** — the same convention as `family` (`chicken-tikka-masala → biryani-hyderabadi`).

**Every relation is stored bidirectionally.** Verified across all 190 live rows:

| `relation_type` | rows | with reverse | without |
|---|---|---|---|
| `family` | 104 | 104 | 0 |
| `regional-cousin` | 30 | 30 | 0 |
| `shared-method` | 28 | 28 | 0 |
| `similar-serving` | 14 | 14 | 0 |
| `shared-ingredient` | 6 | 6 | 0 |
| `diaspora` | 4 | 4 | 0 |
| `ancestor` | 4 | 4 | 0 |

**190 rows = 95 pairs, zero unpaired.** A single one-sided row would make its dish the only one in the catalog with an asymmetric relation. The pilot therefore writes **two** rows: `shawarma → tacos-al-pastor` and `tacos-al-pastor → shawarma`, both `relation_type = ancestor`, both `strength = 4`, both carrying the **same** `reason` string — exactly the pattern of the existing pairs.

**Rule:** a new `relation_type` is added only by an explicit decision, never opportunistically — free text plus a fresh type per use is how a vocabulary rots.

#### D3g note (2026-10-26, GUS-224 audit) — the convention is writer intent, and its content is unverified

Two limitations of the direction convention, recorded so they are not mistaken for stronger guarantees than they are:

**(1) The convention is taken from WRITER INTENT, not from verified content.** The `from_dish_id` = ancestor reading is inferred from the *reason text the original writer chose* — *"…is the direct ancestor of vindaloo"* — and from the fact that all 192 live rows are bidirectionally paired with an identical `reason` on both sides. It is **not** derived from an independent source, because **`dish_relations` has no source column and there are 0 relation-level citations**. The direction convention is therefore a **reading of intent**, which is the best available signal and is corroborated by the pilot's own relation (shawarma → tacos-al-pastor), but it is not an evidenced fact.

**(2) The `bacalhau-a-bras → vindaloo` content is UNVERIFIED, and on audit it is likely wrong.** This was flagged by Alejandro at the GUS-224 kickoff and the audit (2026-10-26) confirmed the concern and went further:

- The **vindaloo ← carne de vinha d'alhos** derivation is well sourced (Wikipedia *Vindaloo*, a Good Article citing Collingham's *Curry: The Food That Took Over the World*, BBC Food, and others; and *Carne de vinha d'alhos*, citing Condé Nast Traveller, *The Hindu*, Visit Madeira).
- But **`carne de vinha d'alhos` is pork in garlic wine vinegar** — and **`bacalhau à brás` is salt cod**. They are unrelated dishes.
- The reason text names the *correct* ancestor; the relation is wired to the *wrong* dish.

**Consequence for D3g:** the pilot's own relation (`shawarma → tacos-al-pastor`) is **independently corroborated** — Wikipedia *Al pastor*: *"The method of preparing and cooking al pastor is based on the lamb shawarma brought by Lebanese immigrants to the region"* and *"The Levantine version, called shawarma, was brought to Mexico in the late 19th and early 20th centuries."* So the pilot does not rest on the unverified precedent; it stands on its own evidence.

**But the convention itself must not be treated as verified.** Two of the other three `ancestor`/`diaspora` pairs were found **likely wrong** on audit (see GUS-224). The direction convention is applied because it is the writer's evident intent and the only self-consistent reading of the data — not because the underlying claims have been verified.

**Recorded as GUS-224:** the audit of all 96 relation pairs, and the recommendation to move to a single directed row with a derived inverse, a `relation_type` CHECK constraint, and a source/claim link on `dish_relations`.

### D3h — `ingredient_category` stores leaves only; parents are derived

A dish's `ingredient_category` assignment stores **leaf values only**. Parent categories are **derived at query time** and are never written.

| stored leaf | derived parent(s) |
|---|---|
| `beef`, `pork`, `game`, `offal` | `red-meat` |
| `chicken`, `poultry` | `white-meat` |
| `fish`, `shellfish`, `seafood` | `white-meat` |
| `vegetable`, `fruit`, `herb`, `nut`, `seed`, `legume` | `produce` |
| `cheese`, `egg` | `dairy` |

**Why:** storing both a leaf and its parent double-counts. A dish with `beef` would carry `beef` **and** `red-meat`; a query for "how many dishes use red meat" would return that dish under two rows, and a query for "how many distinct categories does this dish have" would be inflated. The parent is a **derivation over the leaf set**, not a stored fact.

**Pilot consequence:** `rendang` stores `beef`, `coconut` — **not** `red-meat`. `chicken-tikka-masala` stores `chicken`, `dairy` — **not** `poultry`. `tacos-al-pastor` stores `pork` — **not** `red-meat`.

**Exception:** `dairy` is stored as a leaf in the pilot, because the claim establishes "dairy base", not "cream" or "yoghurt". The `dairy → cheese, egg` derivation is future vocabulary.

**Why this is better than deriving the description:** the prose keeps editorial voice (which matters for a reference work), while the evidence layer stays machine-checkable. Deriving the prose from claims would have made evidence coverage trivially 100% — every sentence would be a claim — and so the metric would measure nothing. With anchoring, coverage is a real, falsifiable number: *how much of this dish's prose is actually sourced?*

**Consequence:** "how much of this dish is evidenced?" becomes a query — `anchored_sentences / total_factual_sentences` — computed over the claim anchors in the description, not a count of claims.

### D6 — Claim granularity: one claim per *assertable fact*

> **An assertable fact = one subject–predicate–value statement that can be independently supported or contradicted by one source.**

A single source must be able to settle a claim on its own — that is the test.

**Worked example — `rendang` is 6 claims, not 1:**

| # | subject | predicate | value |
|---|---|---|---|
| 1 | rendang | origin | West Sumatra, Indonesia (Minangkabau) |
| 2 | rendang | family | curry |
| 3 | rendang | protein | beef |
| 4 | rendang | technique | braising (dry) |
| 5 | rendang | medium | coconut milk |
| 6 | rendang | duration | hours (slow-cooked) |

Each has its own evidence requirement. A scholar on Minangkabau settles #1 but not #3; a recipe book settles #3, #5 and #6 but says nothing about #1. That separation is what makes corroboration computable (D6b) and what lets a *disputed* claim (#1) coexist with a *documented* one (#3) in the same sentence.

### D6b — Evidence coverage and corroboration are two separate metrics

**D4 amended.** A sentence counts as **evidenced only if ALL of its facts are anchored**.

- A sentence with *all* facts anchored → **evidenced**
- A sentence with *some* facts anchored → **partial** → counted as **unevidenced** (it does not count toward coverage)
- A sentence with *no* facts anchored → **unevidenced** (flagged)

**Coverage = fully-evidenced sentences / total factual sentences.** Partial anchoring earns nothing — a sentence that half-cites a compound claim is not evidenced, it is half-sourced.

**Edge case — coverage is `null`, not `0`, when the dish has no factual sentences.** A dish with no description prose (or only non-factual prose: greetings, navigation text, "see below") has an undefined coverage, not zero coverage. Reporting `0%` there would falsely accuse the dish of being unsourced. `null` means *not measurable*; `0%` means *measurable and nothing is sourced*. These are different states and must be stored and displayed differently.

```
coverage = null                                      if total_factual_sentences == 0
coverage = fully_evidenced / total_factual_sentences  otherwise
```

**Separate metric — corroboration:**
> **corroboration = claims with ≥ 2 independent sources**

The two are independent and both matter:
- **coverage** asks *how much of this dish's prose is sourced at all*
- **corroboration** asks *how much of it is confirmed more than once*

A dish can have **full coverage (100%) and zero corroboration (0%)** — every sentence anchored, but every anchor pointing at a single Wikipedia source, which is exactly the current catalog. Coverage alone would therefore have looked like success while the catalog stayed single-sourced. Both metrics are reported per dish.

Two further clarifications on the pair:
- **The two metrics are independent.** Coverage asks *how much of the prose is sourced at all*; corroboration asks *how much of it is confirmed more than once*. A dish can be 100% covered and 0% corroborated; a dish can be 40% covered and 90% corroborated (few sentences, but each rests on multiple sources). Neither implies the other.
- **Coverage is `null` when there are no factual sentences** (see above), so the "100% covered" case only arises for dishes that actually have prose to cover.

### D7 — `dish_context` is multi-valued, flat 5 values, no qualifiers

`dish_context` value set (final, flat — **no qualifier mechanism**):

`street-food` · `home` · `festival/ceremonial` · `restaurant` · `market`

**`market` ≠ `street-food`.** They are siblings, not parent/child:
- `market` = purchased at a **pasar** (traditional market) — bought to take away or cook at home.
- `street-food` = sold and eaten from a **stall or cart** — the purchase is the eating occasion.
- `jajan pasar` (snacking at the market) is its own case: the same dish may carry `market` **and** `street-food`, which is exactly why the dimension must be multi-valued.

**Multi-valued, not single-valued.** A dish may carry more than one `dish_context` value, and the values are stored flat (one row per value in the join table). No qualifier column, no nesting.

### D7b — Cardinality table (all 7 dimensions)

| # | dimension | cardinality | rationale |
|---|---|---|---|
| 1 | `dish_family` | **single-valued** | A dish belongs to one family in the taxonomy; multiple families would make family-based lookup ambiguous. (Related dishes that straddle families are expressed as `dish_relations`, not as multiple family rows.) |
| 2 | `dish_cuisine` | **single-valued** | One primary cuisine. A dish with contested origin (e.g. `chicken-tikka-masala`) leaves the dimension **unset** and records the dispute as competing `claims` — the migration must not resolve it. |
| 3 | `dish_course` | **single-valued** | A dish is served as one course. `street-snack` was split out to `dish_context` precisely because a dish can be a snack *and* a main course. |
| 4 | `dish_technique` | **multi-valued** | A dish can legitimately be prepared by more than one technique (e.g. grilled **and** braised, roasted **and** smoked). Gerund values. |
| 5 | `ingredient_category` | **multi-valued** | An ingredient may belong to several overlapping categories (e.g. a nut that is also a spice, a fruit that is also an herb); the dimension is applied per ingredient, not per dish. |
| 6 | `dish_tradition` | **multi-valued** | A dish can participate in several cultural traditions (e.g. a festival tradition *and* a regional culinary tradition). |
| 7 | `dish_context` | **multi-valued** | D7 — flat 5 values, no qualifiers. A dish can be both `market` and `street-food`; `home` and `restaurant` co-occur less often but are equally valid. |

**Summary: 3 single-valued (`dish_family`, `dish_cuisine`, `dish_course`), 4 multi-valued (`dish_technique`, `ingredient_category`, `dish_tradition`, `dish_context`).**

**Enforcement:** single-valued dimensions reject a second assignment at the DB level (unique constraint on `(dish_id, dimension)`); multi-valued dimensions are one-row-per-value join tables with a uniqueness constraint on `(dish_id, value_id)`.

> **Note on `skewering`:** Alejandro added `skewering` to `dish_technique` as an instruction inside the D4 message (it is a gerund, and `tacos-al-pastor` / `sate-lilit` / `satay` are skewered). It is **not** a separate numbered decision and carries no separate approval.

### D5 — Pilot = all 3 reference dishes; baseline verified by content, not `editCount`

**Pilot scope: all 3** (`rendang`, `chicken-tikka-masala`, `tacos-al-pastor`).

**`editCount` is NOT a valid provenance signal** — verified in the code 2026-10-26:

| write handler | bumps `editCount` | bumps `updatedAt` |
|---|---|---|
| `POST /api/dishes` (create) | no | no |
| `PATCH /api/dishes/:slug` | **yes** | yes |
| `POST /api/dishes/:slug/publish` | no | yes |
| `DELETE /api/dishes/:slug` (archive) | no | yes |
| `POST /api/dishes/:slug/variants` | no | no |
| `PATCH /api/dishes/:slug/variants/:variantId` | no | yes |
| `DELETE /api/dishes/:slug/variants/:variantId` | no | no |
| `POST /api/admin/dishes/:slug/sources` | no | no |
| `PATCH /api/admin/dishes/:slug/sources/:citationId` | no | no |
| `DELETE /api/admin/dishes/:slug/sources/:citationId` | no | no |
| `POST /api/dishes/:slug/media` | no | no |
| `DELETE /api/dishes/:slug/media/:attachmentId` | no | no |

**1 of 12 write handlers bumps `editCount`.** Adding a source, attaching a cover, creating a variant — all silent. So `editCount: 0` does **not** mean "never edited", and `updatedAt` is not a complete signal either.

**The authoritative provenance is `edit_history`** (`edit_history` rows carry `action`, `created_at`, `comment`, `userId`, `diff`). Baseline determined from it, 2026-10-26:

| dish | `edit_history` rows | last edit | verdict |
|---|---|---|---|
| `rendang` | **0** | — | never edited since creation |
| `tacos-al-pastor` | **0** | — | never edited since creation |
| `chicken-tikka-masala` | **2** | 2026-10-16 16:18:52 | both are "singleton-category merge" edits |

**Both CTM edits predate the ADR** (2026-10-16 vs. the ADR drafted 2026-10-25, decided 2026-10-26) by nine days, and **neither is an ADR-001 edit** — no Q1–Q4 decision touched CTM. Its current state is therefore a valid baseline.

**Baseline by content (2026-10-26), which is what the migration must reproduce-plus-transform:**

| dish | categories today | longDescription | ingredients | sources | media |
|---|---|---|---|---|---|
| `rendang` | `indonesian-cuisine`, `stew`, `curry`, `main-course` | empty | 0 | 1 (Wikipedia) | 1 cover |
| `chicken-tikka-masala` | `curry`, `main-course` | empty | 0 | 1 (Wikipedia) | 0 |
| `tacos-al-pastor` | `mexican-cuisine`, `main-course`, `street-snack` | empty | 0 | 1 (Wikipedia) | 0 |

**`stew` is still on rendang** — confirmed live today. The D3 reclassification (drop `stew`, family `curry`, technique `braising`) is still to be applied.

### Pilot conditions (Alejandro, 2026-10-26) — binding on the first migration

1. **Baseline = state before any ADR-001 edit, verified by content** (see table above), not by `editCount`.
2. **Write the exact expected end state per dish (all 7 dimensions) as a pass/fail spec BEFORE running the migration.**
3. **Snapshot + rollback before the pilot.** The full 118-dish run happens **only after Alejandro's explicit go.**

### D5b — `tacos-al-pastor` technique = `spit-roasting`

`spit-roasting` is added to `dish_technique`. It is more precise than `skewering` for this dish: the meat is cooked on a **vertical spit** (al pastor), which is a different technique from horizontal skewering (satay, sate lilit).

`dish_technique` gerunds now: **stewing, braising, simmering, grilling, skewering, spit-roasting**, plus the existing baking / frying / roasting.

**Consequence:** `tacos-al-pastor` → `technique = spit-roasting`; `sate-lilit` and `satay` → `technique = skewering`.

### ADR-001 is CLOSED

All 7 questions asked (Q1–Q7) are decided and recorded as D1–D7, with sub-decisions D3b–D3f, D5b, D6b (amended) and D7b.

**Approved by Alejandro 2026-10-26 with amendments** (D3b–D3f, D6b-amend) plus one **open follow-up** that is explicitly *not* a decision (cuisine hierarchy, recorded in §4 Consequences).

**Implementation has NOT started:** no schema migration, no pilot migration. The pilot on the 3 reference dishes requires Alejandro's explicit go, after the pass/fail expected-end-state spec (`.hermes/REPORTS/GUS-014-pilot-spec.md`) and the snapshot/rollback are written.

---

## 6. Changelog of applied edits

Every decision that changes the model, in order, with the date it was taken. This section is appended to, never rewritten.

| # | Date | Decision | Applied to the model |
|---|---|---|---|
| D1 | 2026-10-26 | Seven dimensions | `dish_family`, `dish_cuisine`, `dish_course`, `dish_technique`, `ingredient_category`, `dish_tradition`, `dish_context` |
| D2 | 2026-10-26 | `street-snack` splits | `dish_course = snack` + `dish_context = street-food`; `dish_context` values: `street-food`, `home`, `festival/ceremonial`, `restaurant`, `market` |
| D3 | 2026-10-26 | Noun/gerund rule | family = nouns, technique = gerunds. `kebab` + `curry` removed from `dish_technique` (they are families). `stew` stays a `dish_family`. Rendang → family `curry`, technique `braising` (dry braise), `stew` tag dropped |
| D4 | 2026-10-26 | Description stays authored; claims anchor it | Each factual sentence carries claim-ID anchors. Validation fails on anchors to unpublished/retracted/missing claims. Unanchored sentences allowed but flagged `unevidenced`. Evidence coverage = anchored-sentence ratio. Live edits fine. |
| D5 | 2026-10-26 | Pilot = all 3; baseline by content, `editCount` invalidated as a provenance signal | `edit_history` is authoritative. Baseline table recorded. `stew` still live on rendang |
| D5b | 2026-10-26 | `dish_technique` gains `spit-roasting` | `tacos-al-pastor` → technique `spit-roasting` (vertical spit, not horizontal skewer); `sate-lilit`, `satay` → `skewering` |
| D6 | 2026-10-26 | Claim granularity = one assertable fact | A fact = one subject–predicate–value statement independently supportable/contradictable by one source. `rendang` = 6 claims (origin, family, protein, technique, medium, duration) |
| D6b | 2026-10-26 | Coverage + corroboration are separate metrics | A sentence is evidenced only if ALL its facts are anchored; partial anchoring is marked `partial` and counts as unevidenced. Coverage = fully-evidenced sentences / factual sentences. Corroboration = claims with ≥2 independent sources (separate metric) |
| D3g | 2026-10-26 | Relation types use the existing vocabulary; **source = ancestor** | `dish_relations.relation_type` is free text, but the pilot uses `ancestor`, not a new `derived-from`. **Direction: `from_dish_id` is the ANCESTOR** (`bacalhau-a-bras → vindaloo`, *"…is the direct ancestor of vindaloo"*). Every relation in the catalog is stored BIDIRECTIONALLY (190 rows = 95 pairs, zero unpaired), so the pilot writes a pair: `shawarma → tacos-al-pastor` and the reverse, same `reason`, strength 4. An earlier draft asserting "descendant → ancestor" was wrong and is corrected here |
| D3g-note | 2026-10-26 | Direction convention is writer intent; content unverified | The `from_dish_id` = ancestor reading is inferred from the original writer's reason text and the universal bidirectional pairing — NOT from an independent source, because `dish_relations` has no source column and there are 0 relation-level citations. The `bacalhau-a-bras → vindaloo` content is **unverified and on audit likely wrong**: the vindaloo ← *carne de vinha d'alhos* derivation is well sourced, but *carne de vinha d'alhos* is PORK in garlic wine vinegar while *bacalhau à brás* is SALT COD — unrelated. The pilot's own relation is independently corroborated by Wikipedia *Al pastor*. Full audit: GUS-224 |
| D3h | 2026-10-26 | `ingredient_category` stores LEAVES only | Parents are derived at query time, never stored. `red-meat`, `white-meat`, `produce` are parents of `beef`/`pork`/`game`/`offal`, `chicken`/`poultry`/`fish`/`shellfish`/`seafood`, and `vegetable`/`fruit`/`herb`/`nut`/`seed`/`legume` respectively. Storing both a leaf and its parent double-counts. Pilot: rendang `beef`+`coconut`, CTM `chicken`+`dairy`, tacos `pork` — no parents. `dairy` is a leaf in the pilot (the claim says "dairy base") |
| D4a | 2026-10-26 | Claims anchor to `short_description`, not `long_description` | Live schema has both columns. `short_description` is populated for all 3 pilot dishes (149–206 chars) and is the prose the claims attach to; `long_description` is empty for all 3 (and 100 of 122 catalog-wide). Rendang's short description is verbatim the D6 6-claim worked example. **Coverage is therefore measurable: expected `0%` (no claims exist yet), not `null`** — consistent with GUS-011's catalog-wide Wikipedia-only finding |
| D7 | 2026-10-26 | `dish_context` = multi-valued, flat 5 values, no qualifiers | `street-food`, `home`, `festival/ceremonial`, `restaurant`, `market`. `market` ≠ `street-food` (pasar purchase vs. stall/cart; `jajan pasar` carries both). No qualifier mechanism |
| D7b | 2026-10-26 | Cardinality table for all 7 dimensions | Single-valued: `dish_family`, `dish_cuisine`, `dish_course`. Multi-valued: `dish_technique`, `ingredient_category`, `dish_tradition`, `dish_context`. DB enforcement: unique constraint on single-valued joins |
| D3b | 2026-10-26 | `tacos-al-pastor` family = `taco`; shawarma lineage → relation | `dish_family = taco` (controlled-vocab noun). `kebab` not used as family. Shawarma lineage recorded as a `dish_relations` pair (type `ancestor`, direction fixed in D3g) — lineage is a historical relation, not taxonomic membership |
| D3c | 2026-10-26 | `chicken-tikka-masala` technique = grilling + simmering | Two-stage method: grilling covers the `tikka`, simmering covers the sauce. `dish_technique` is multi-valued, so no compound verb needed. Both are existing controlled-vocab gerunds |
| D3d | 2026-10-26 | `rendang` context = home + festival/ceremonial + restaurant | Rendang is a home dish, a festival/ceremonial dish (Minangkabau wedding and communal feasts) and a restaurant dish. Recording all three is the point of a multi-valued context dimension |
| D3e | 2026-10-26 | Controlled-vocabulary discipline for all 7 dimensions | Dimension cells are verbatim controlled-vocab values or the literal token `unset` — no free text, no parentheticals. `braising (dry)` is rejected: `braising` is the technique value, "dry" is a **claim** (a separately-sourceable assertable fact, per D6). `dry-braising` would have to be added to the vocabulary explicitly, not smuggled in |
| D3f | 2026-10-26 | `dish_course` rationale corrected | `dish_course` = the dish's **primary meal role**; secondary/situational uses → `dish_context`. This is why course is single-valued and context multi-valued: one primary role, many situations |
| D6b-amend | 2026-10-26 | Coverage `null` when no factual sentences | `coverage = null` if `total_factual_sentences == 0` (not `0%` — `null` = not measurable, `0%` = measurable and unsourced). Also fixed the wording of the "100% covered and 0% corroborated" line and stated that the two metrics are independent |
| follow-up | 2026-10-26 | **Open follow-up (not a decision): cuisine hierarchy** | Recorded in §4 Consequences. National vs. regional granularity (`indonesian` vs. `minangkabau`) is unresolved: hierarchy vs. flat + tradition layer; where Minangkabau belongs (`dish_cuisine` / `dish_tradition` / both); and how a hierarchical path interacts with single-valued `dish_cuisine`. Pilot uses the flat vocabulary as decided here; Minangkabau specificity is carried by `origin` (place) and claims, not by inventing a cuisine row |

### Live-data consequences of D1–D7 (to apply in the migration)

| Dish | family | cuisine | course | technique | context |
|---|---|---|---|---|---|
| `rendang` | curry | indonesian | main-course | braising | home, festival/ceremonial, restaurant |
| `chicken-tikka-masala` | curry | unset | main-course | grilling, simmering | restaurant |
| `tacos-al-pastor` | taco | mexican | main-course | spit-roasting | street-food |

Amended 2026-10-26 (D3b–D3f):
- `tacos-al-pastor` family = **`taco`** (not `kebab`); its shawarma lineage is a **`dish_relations` pair**, type **`ancestor`** (D3b + D3g): `shawarma → tacos-al-pastor` and the reverse, same reason, strength 4 (source = ancestor; every live relation is bidirectionally paired).
- `ingredient_category` stores **leaves only** (D3h): rendang `beef` + `coconut`; CTM `chicken` + `dairy`; tacos `pork`. Parents (`red-meat`, `white-meat`, `produce`) are derived, never written.
- `chicken-tikka-masala` technique = **`grilling`, `simmering`** (D3c).
- `rendang` context = **`home`, `festival/ceremonial`, `restaurant`** (D3d).
- `rendang` technique = **`braising`** — the "dry" qualifier is a **claim**, not a dimension value (D3e).
- `chicken-tikka-masala` cuisine = **`unset`** (the Glasgow dispute; a migration must not resolve it).
- `dish_course` = primary meal role; secondary uses → `dish_context` (D3f).

**Controlled vocabulary rule (D3e):** every dimension cell above is either a value drawn verbatim from the dimension's controlled vocabulary, or the literal token **`unset`**. The full pilot spec (including `ingredient_category` and `dish_tradition`, with explicit `unset` where empty) is `.hermes/REPORTS/GUS-014-pilot-spec.md`.

## 6. What this ADR does NOT decide

- The final table DDL (drafted in §2.4 for `claims` only; the rest is sketched).
- The migration plan and its rollback (GUS-004, GUS-025).
- The evidence *policy* — that is GUS-026, drafted separately in `.hermes/REPORTS/GUS-026-evidence-policy-draft.md`.
- Whether to implement `claims` before or after `recipes`. §4 proposes claims first; that is a recommendation, not a decision.
