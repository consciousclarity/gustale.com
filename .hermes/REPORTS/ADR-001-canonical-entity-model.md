# ADR-001 — Canonical culinary entity model

**Status:** 🟡 **DRAFT — for Alejandro's review. Not implemented. No migration written.**
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

### Sequencing (proposal, not decided)
1. `claims` + `citations.claim_id` — unblocks EPIC 03, and is the prerequisite for GUS-026's policy to be enforceable.
2. `recipes` + `recipe_steps` + `recipe_ingredients` — unblocks GUS-015.
3. Dimensions — split `categories`; the 109 orphans get resolved at the same time.
4. `dish_traditions`, `dish_variants` enrichment, `historical_events`.

## 5. Open questions for Alejandro

1. **Dimension count.** Seven dimensions (family, cuisine, course, technique, ingredient-category, tradition, format) — or fewer? The reference dishes already strain the model: `tacos-al-pastor` wants both `main-course` and `street-snack`, which are different *kinds* of thing.
2. **`street-snack` / `appetizer`** — are these courses (eaten at a point in a meal) or formats (how it is served)? This decides whether they need separate dimensions.
3. **`stew`** — preparation character, technique, or family? Rendang is tagged with it today.
4. **Does a `Dish` still carry a description**, or does the description become a set of claims? The reference dishes have no long description today, so this can be decided without a migration cost.
5. **Scope of the first migration**: all 121 dishes, or the three reference dishes first? The latter is cheaper and gives a working example (GUS-025's "migration tools" becomes testable on 3 rows).
6. **Claim granularity**: one claim per sentence, or one per *assertable fact* (e.g. "originates in Glasgow" is one claim, but the description sentence containing it may also assert "marinated in yoghurt and spices")? The second is more work but is what makes "how much of this is evidenced" meaningful.

## 6. What this ADR does NOT decide

- The final table DDL (drafted in §2.4 for `claims` only; the rest is sketched).
- The migration plan and its rollback (GUS-004, GUS-025).
- The evidence *policy* — that is GUS-026, drafted separately in `.hermes/REPORTS/GUS-026-evidence-policy-draft.md`.
- Whether to implement `claims` before or after `recipes`. §4 proposes claims first; that is a recommendation, not a decision.
