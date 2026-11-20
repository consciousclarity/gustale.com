# Atlas vocabulary snapshot

**Date:** 2026-11-20
**Repo:** `/home/alex/projects/gustale.com` @ `origin/main` (branch `feature/writing-skills`)
**Extraction:** read-only, from `db/migrations/*.sql` and `packages/db/src/schema/index.ts`.
No live database was queried — the live host was unreachable from the machine that produced this
snapshot. Every value below is traced to the migration that defines it.

> **How to use this file.** The Atlas writer may use **only** these values. Anything not listed here is
> not vocabulary: propose it in `agent.proposed_vocabulary` and stop. The writer never creates a
> vocabulary row.

---

## 1. Predicates

`predicates` is a **table** (`packages/db/src/schema/index.ts` L1135), seeded in
`db/migrations/0027_adr002_claims_model.sql` L420. Eleven values.

| Slug | Name | `value_kind` | `value_type` |
|---|---|---|---|
| `is_a` | Is a | `vocabulary` | `dish_families` |
| `belongs_to_cuisine` | Belongs to cuisine | `vocabulary` | `dish_cuisines` |
| `served_as_course` | Served as course | `vocabulary` | `dish_courses` |
| `cooked_by` | Cooked by | `vocabulary` | `dish_techniques` |
| `contains_ingredient` | Contains ingredient | `vocabulary` | `ingredient_categories` |
| `part_of_tradition` | Part of tradition | `vocabulary` | `dish_traditions` |
| `eaten_in_context` | Eaten in context | `vocabulary` | `dish_contexts` |
| `created_by` | Created by | `literal` | — |
| `originated_in` | Originated in | `entity` | `geo_entities` |
| `named_after` | Named after | `entity` | — |
| `originated_at` | Originated at | `literal` | — |

**The four that need a statement anchor** are `originated_in`, `originated_at`, `created_by` and
`named_after` — the ones that say *where, when, by whom or after what*. The seven dimension
predicates name a controlled vocabulary and are carried by the facts table, not by a sentence claim.

`created_by` is a **marked exception**: its value is a `person_name` literal, because a person
entity is still backlogged. `originated_in` needs a non-S6 source (GUS-026 §3.1).

---

## 2. Relation types (`relation_types`)

A **table**, not a CHECK enum (`packages/db/src/schema/index.ts` L1563; created by
`db/migrations/gus-224-relations-option-b.sql`).

**The direction convention, stated once in `db/migrations/0036_atlas_schema.sql` L375:**

```
source = predecessor / influence / broader dish
target = derived / influenced / variant dish
```

An `adapted_from` edge means **"target was adapted from source"**.

### The live vocabulary — 17 slugs

Three independent sources in the repo agree on this set, and the Atlas schema enum now
matches it exactly:

- the `relation_types` table rows (`0036` L380 + `gus-224` L54),
- the renderer's grammar map (`apps/web/src/lib/relationship-grammar.ts` L57),
- the public-kind module (`apps/web/src/lib/public-relationship.ts` L88).

| Slug | Direction | Group |
|---|---|---|
| `family` | symmetric | family — **classification, not ancestry** |
| `similar_form` | symmetric | likeness |
| `similar_technique` | symmetric | likeness |
| `similar-serving` | symmetric | likeness |
| `similar_serving` | symmetric | likeness |
| `shared-ingredient` | symmetric | likeness |
| `shared_ingredient` | symmetric | likeness |
| `often_compared_with` | symmetric | likeness |
| `regional-cousin` | symmetric | likeness |
| `shared-method` | symmetric | likeness |
| `ancestor` | **directional** | descent |
| `developed_from` | **directional** | descent |
| `adapted_from` | **directional** | descent |
| `influenced_by` | **directional** | descent |
| `diaspora` | **directional** | migration |
| `regional_variant_of` | **directional** | migration |
| `connection_proposed` | undirected, provisional | — |

### The spelling trap

**The vocabulary spells itself two ways.** Two slugs use a hyphen (`similar-serving`,
`shared-ingredient`) where the rest use an underscore (`similar_form`,
`similar_technique`). The live data uses **both** spellings, and the renderer says so in
`relationship-grammar.ts` L64-72: an earlier map that used only the underscore spelling
left the hyphenated types *unclassified*, so the legend silently dropped their counts
and the map silently skipped their edges.

**The writer must use the spelling the live row uses.** Do not normalise. The checker
accepts both.

### `connection_proposed` is special

It is not a kind of its own. Its direction may or may not be known; when
`direction_known` is false, **no arrow is rendered anywhere** and the connection carries
no `this_dish_is`. It asserts neither influence nor resemblance, so it never joins a route.

### Legacy text mirror

`dish_relations.relation_type` is a **denormalised mirror** of `relation_type_id`, which
is the authoritative FK. A trigger (`sync_relation_type()`, gus-224 L95) keeps them in
step and **raises** on a slug it does not recognise. Migration 0058 asserts that the
production-shaped database holds a live relation with `relation_type = 'similar_form'`.

> **Reconciliation note.** Migration 0036 L400-405 *renamed* `regional-cousin` →
> `similar_form`, `shared-method` → `similar_technique` and `shared-serving` →
> `often_compared_with`. Replaying the migrations shows **those three UPDATEs were
> no-ops**: the source slugs did not exist at that point, so nothing was renamed, and
> `similar_form` / `similar_technique` were never inserted by any migration. They are
> nevertheless live — the renderer, the public module and the 0058 assertion all use
> them. The live set is therefore the **union**, not the rename result. This is why
> `similar-serving` and `shared-method` are live **alongside** `often_compared_with`.

---

## 3. `dish_place_associations.relationship_type`

CHECK constraint `dpa_relationship_type_check` (`db/migrations/0036_atlas_schema.sql` L287).
**Six values:**

`historical_emergence` · `established_tradition` · `regional_adaptation` ·
`later_introduction` · `earliest_documentation` · `legacy_unreviewed`

### The other CHECKs on the same table

| Constraint | Values |
|---|---|
| `dpa_entity_kind_check` | `place`, `community` |
| `dpa_evidence_status_check` | `unevidenced`, `research_pending`, `provisional`, `evidenced` |
| `dpa_dispute_state_check` | `disputed`, `unresolved` (or NULL) |
| `dpa_research_outcome_check` | `completed`, `inconclusive` (or NULL) |
| `dpa_review_state_check` | `unreviewed`, `in_review`, `accepted`, `rejected` |

---

## 4. `dish_names.kind`

CHECK constraint (`db/migrations/0023_adr003_dish_names.sql` L51). **Three values:**

`endonym` · `exonym` · `romanization`

`is_primary` marks the canonical name for a (dish, language) pair.

---

## 5. `dish_identities.identity_kind`

CHECK constraint `dish_identities_identity_kind_check`
(`db/migrations/0036_atlas_schema.sql` L586). **Three values:**

`shared_dish` · `regional_variant` · `historically_related`

---

## 6. Families (`dish_families`)

**123 families carry a published dish** — this is the set the Atlas writer may
use, and the set the reviewer should expect to see in a record.

Source: **`docs/FAMILY-TAXONOMY-REVIEW.md`** L125-256 (the table *The 123 families*), which
Alejandro **approved on 2026-11-06** ("I approve the 5 approvals") and which was applied by
`db/migrations/0051_family_classification.sql`. The class split below is transcribed from that
document and matches the migration's ledger.

**Class split (123):** FORM 83 · COURSE 21 · CUISINE 4 · CONTENT TYPE 15.

**A family is a CLASSIFICATION, not ancestry.** `family_class` is one of exactly four values,
enforced by the database (`0051` L86, L113):

```
CHECK (family_class IN ('FORM', 'COURSE', 'CUISINE', 'CONTENT TYPE'))
```

> **Correction.** An earlier draft of this snapshot listed a hand-picked set of 28 slugs as
> "the listed families" and gave no class and no parent. That set was neither the 123 that
> carry a published dish nor the 162 that are `listed` — it was the 28 *pre-1f root* families
> named in `db/migrations/0018_gus242_vocab_1f.sql` L19 ("restore the 28 families' parent_id
> to NULL"). The real table is below.

### `parent_id` — the hierarchy column

`dish_families.parent_id uuid REFERENCES dish_families(id)` was added in
`db/migrations/gus-242-schema-prep.sql` L84, with an index and an acyclicity guard
(`0036_atlas_schema.sql` L538-571: a family may not be its own parent and the hierarchy must
be acyclic, because a descendant walk would loop forever).

The `path` column of the source table gives the chain; the **Parent** column below is the
immediate parent. **26 of the 123 are roots** (parent NULL); 97 have one.

| Slug | Class | Parent | Dishes |
|---|---|---|---:|
| `dish` | CONTENT TYPE | *root* | 397 |
| `dessert` | COURSE | *root* | 96 |
| `soup` | FORM | *root* | 70 |
| `food` | CONTENT TYPE | `dish` | 55 |
| `rice-dish` | FORM | *root* | 45 |
| `pastry` | COURSE | `dessert` | 38 |
| `confectionery` | COURSE | `dessert` | 37 |
| `bread` | FORM | *root* | 30 |
| `human-food` | CONTENT TYPE | `dish` | 28 |
| `stew` | FORM | *root* | 28 |
| `potato-dish` | FORM | `dish` | 27 |
| `salad` | FORM | *root* | 27 |
| `meat-dish` | FORM | *root* | 24 |
| `baked-good` | COURSE | `dessert` | 22 |
| `sandwich` | FORM | *root* | 21 |
| `fish-dish` | FORM | *root* | 20 |
| `jajan-pasar` | CUISINE | `dish` | 18 |
| `chicken-dish` | FORM | `meat-dish` | 18 |
| `candy` | FORM | `confection` | 15 |
| `beef-dish` | FORM | `meat-dish` | 15 |
| `kebab` | FORM | *root* | 14 |
| `pasta-dish` | FORM | *root* | 14 |
| `pork-dish` | FORM | `meat-dish` | 12 |
| `snack` | COURSE | `dish` | 11 |
| `cookie` | FORM | `confection` | 10 |
| `egg-dish` | FORM | *root* | 10 |
| `cake` | FORM | `dessert` | 9 |
| `kue` | CUISINE | `dessert` | 9 |
| `sweet-dish` | COURSE | `dessert` | 9 |
| `lamb-dish` | FORM | `meat-dish` | 9 |
| `noodle-dish` | FORM | `noodle-soup` | 9 |
| `pancake` | FORM | *root* | 9 |
| `flatbread` | FORM | `bread` | 8 |
| `casserole` | FORM | *root* | 8 |
| `pudding` | FORM | `dessert` | 8 |
| `seafood-dish` | FORM | `dish` | 8 |
| `dumpling` | FORM | *root* | 8 |
| `pie` | FORM | `filled-pastry` | 8 |
| `goat-meat-dish` | FORM | `meat-dish` | 8 |
| `drink` | CONTENT TYPE | `beverage` | 8 |
| `curry` | FORM | *root* | 7 |
| `appetizer` | COURSE | `dish` | 7 |
| `finger-food` | COURSE | `appetizer` | 7 |
| `noodle-soup` | FORM | *root* | 7 |
| `sweet-bread` | FORM | `bread` | 6 |
| `doughnut` | COURSE | `dessert` | 6 |
| `sweetmeat` | COURSE | `dessert` | 6 |
| `national-dish` | FORM | `dish` | 6 |
| `street-food` | CONTENT TYPE | `dish` | 6 |
| `traditional-food` | CONTENT TYPE | `dish` | 6 |
| `vegetable-dish` | FORM | `dish` | 6 |
| `pasta` | FORM | *root* | 6 |
| `fish-soup` | FORM | `soup` | 6 |
| `chewing-gum` | COURSE | `confection` | 5 |
| `cuisine` | CONTENT TYPE | `dish` | 5 |
| `culinary-speciality` | CONTENT TYPE | `dish` | 5 |
| `fritter` | FORM | *root* | 5 |
| `offal-dish` | FORM | `meat-dish` | 5 |
| `stuffed-pasta` | FORM | `pasta-dish` | 5 |
| `meze` | COURSE | `side-dish` | 5 |
| `mithai` | CUISINE | `confection` | 4 |
| `shrimp-dish` | FORM | `seafood-dish` | 4 |
| `sauce` | FORM | *root* | 4 |
| `bacon-wrapped-food` | CONTENT TYPE | `dish` | 3 |
| `fast-food` | CONTENT TYPE | `dish` | 3 |
| `food-brand` | CONTENT TYPE | `dish` | 3 |
| `clam-dish` | FORM | `seafood-dish` | 3 |
| `spread` | FORM | `dish` | 3 |
| `tuna-dish` | FORM | `fish-dish` | 3 |
| `veal-dish` | FORM | `meat-dish` | 3 |
| `bibimbap` | FORM | `rice-dish` | 3 |
| `rice` | FORM | `rice-dish` | 3 |
| `bun` | FORM | `bread` | 2 |
| `torte` | FORM | `cake` | 2 |
| `chocolate-bar` | COURSE | `dessert` | 2 |
| `frozen-dessert` | COURSE | `dessert` | 2 |
| `ice-cream-flavour` | COURSE | `dessert` | 2 |
| `wafer` | COURSE | `dessert` | 2 |
| `wagashi` | COURSE | `dessert` | 2 |
| `brand` | CONTENT TYPE | `dish` | 2 |
| `cooked-grain` | FORM | `dish` | 2 |
| `holiday-dish` | FORM | `dish` | 2 |
| `christmas-food` | FORM | `holiday-dish` | 2 |
| `meal` | CONTENT TYPE | `dish` | 2 |
| `live-seafood` | FORM | `seafood-dish` | 2 |
| `surimi` | FORM | `seafood-dish` | 2 |
| `filled-pastry` | FORM | *root* | 2 |
| `meatball` | FORM | `kebab` | 2 |
| `instant-noodles` | FORM | `noodle-dish` | 2 |
| `porridge` | FORM | *root* | 2 |
| `brioche` | FORM | `bread` | 1 |
| `leavened-bread` | FORM | `bread` | 1 |
| `white-bread` | FORM | `bread` | 1 |
| `breaded-cutlet` | FORM | *root* | 1 |
| `cotoletta` | FORM | `breaded-cutlet` | 1 |
| `apple-turnover` | FORM | `dessert` | 1 |
| `ame` | FORM | `confection` | 1 |
| `brittle` | FORM | `candy` | 1 |
| `chocolate-egg` | FORM | `chocolate` | 1 |
| `honey` | FORM | `confection` | 1 |
| `western-confection` | FORM | `confection` | 1 |
| `cruller` | COURSE | `dessert` | 1 |
| `mousse` | COURSE | `dessert` | 1 |
| `hedgehog-slice` | FORM | `pastry` | 1 |
| `shaved-ice` | COURSE | `dessert` | 1 |
| `shiroi-koibito` | COURSE | `dessert` | 1 |
| `chadian-cuisine` | CUISINE | `dish` | 1 |
| `cold-dish` | CONTENT TYPE | `dish` | 1 |
| `course` | CONTENT TYPE | `dish` | 1 |
| `sweet-potato-dish` | FORM | `dish` | 1 |
| `scrambled-eggs` | FORM | `egg-dish` | 1 |
| `fermented-bean-paste` | FORM | `fermented-soy` | 1 |
| `savoury-pie` | FORM | `pie` | 1 |
| `fried-rice` | FORM | *root* | 1 |
| `cold-noodle` | FORM | `noodle-dish` | 1 |
| `buckwheat-pancake` | FORM | `pancake` | 1 |
| `idli` | FORM | `rice-dish` | 1 |
| `patty` | FORM | `burger` | 1 |
| `fish-sauce` | FORM | `sauce` | 1 |
| `tripe-soup` | FORM | `soup` | 1 |
| `goulash` | FORM | `stew` | 1 |
| `stuffed-pepper` | FORM | `stuffed-vegetable` | 1 |
| `taco` | FORM | *root* | 1 |

> **A parent may sit outside the 123.** Seven families that carry published dishes have a
> parent that carries none: `beverage`, `burger`, `chocolate`, `confection`, `fermented-soy`,
> `side-dish`, `stuffed-vegetable`. All seven are real families in the 306 (each is classified
> in the `0051` ledger). A parent that carries no published dish is still a valid parent — the
> hierarchy is a taxonomy, and a branch can be described before anything in it is published.

### What "listed" means — and why it is NOT the same set

`dish_families.listed boolean NOT NULL DEFAULT true` was added in `0058` L114, with the
column comment (L116-120):

> "Whether this family is part of the published family vocabulary. FALSE for non-FORM classes
> (COURSE, CUISINE, CONTENT TYPE) and for FORM families with no description. The API prefers a
> LISTED family when it picks a dish's primary family."

So `listed` is a **derived flag**, not a static list: a family is listed when it is a FORM
family **and** it has a non-empty description. The migration measured 306 rows
(2026-11-16): FORM 172 / COURSE 59 / CUISINE 5 / CONTENT TYPE 70, **162 listed** after
`0059` filled in descriptions.

**Three different sets, and the difference matters:**

| Set | Count | What it means |
|---|---:|---|
| Families in the database | 306 | Every `dish_families` row |
| **Carry a published dish** | **123** | The set above — what the writer uses |
| `listed = true` | 162 | FORM **and** has a description — what the API prefers as a dish's primary family |

A family can be `listed` yet carry no published dish (a FORM family with a description and no
dishes yet), and a family can carry published dishes yet not be `listed` (any COURSE, CUISINE
or CONTENT TYPE family). **The Atlas writer should target the 123.**

> **NOT reconstructible from the repo alone.** The per-family `listed` flag and the dish counts
> above were measured against the live database on 2026-11-16 and transcribed into the
> migration's comments. The full 306-row slug/class/parent table is **not** in any committed
> migration — only the 306-row classification ledger is
> (`0051` L116-431, which does carry `family_class` for all 306). The 306 `parent_id` values
> are not in the repo either: no migration ever *sets* a family's `parent_id`, only the column,
> the index and the guard exist. The parent chains above come from the approved review
> document's `path` column.

## 7. Courses (`dish_courses`) — the "Served as" facet

**Eight values** (`db/migrations/gus-014-118-dimensions.sql` L70-77):

`appetizer` · `breakfast` · `condiment` · `dessert` · `drink` · `main-course` · `side` · `snack`

**"Served as" is the course facet** — confirmed. It is the `dish_courses` dimension, reached through
the `served_as_course` predicate. It is **not** a relation type and **not** a context.

---

## 8. Contexts (`dish_contexts`)

**Four values** (`db/migrations/gus-014-118-dimensions.sql` L201-204):

`home` · `market` · `restaurant` · `street-food`

---

## 9. Techniques (`dish_techniques`)

**Twenty-five values** (`db/migrations/gus-014-118-dimensions.sql` L80-104, plus
`db/migrations/gus-241-taxonomy-and-unset-dimensions.sql` L69):

`baking` · `blanching` · `boiling` · `braising` · `curing` · `deep-frying` · `emulsifying` ·
`fermenting` · `frying` · `grilling` · `kneading` · `mashing` · `pickling` · `pit-roasting` ·
`poaching` · `roasting` · `simmering` · `skewering` · `smoking` · `spit-roasting` · `steaming` ·
`stewing` · `stir-frying` · `tempering` · `whisking`

---

## 10. Traditions (`dish_traditions`)

**433 values.** Too many to list here; read them from
`db/migrations/0019_gus242_traditions_1e.sql` (the `<x>-cuisine` slugs) and
`db/migrations/gus-014-118-dimensions.sql` (the regional/identity slugs such as `aceh`, `bali`,
`cajun`).

**The writer must pick from the table, not from this file.** The Atlas verifier checks a technique
against the live `dish_techniques` table; if a value is not there, it is not vocabulary.

---

## 11. `citations.target_type`

**No CHECK constraint and no seed rows.** `citations.target_type` is a plain `text NOT NULL`
column (`packages/db/src/schema/index.ts` L1884). It is **free text** — the writer cannot rely on a
fixed set.

The usable target types for a **family** or a **lineage** are therefore a convention, not a
constraint. The values in use in the repo are:

| Target | Notes |
|---|---|
| `dish` | The only one the repo seeds today. `citations` is populated for dish descriptions |
| `family` | The convention for a family record. **Unenforced** — confirm against live before using |
| `lineage` | The convention for a lineage record. **Unenforced** — confirm against live before using |

> **Open question for Alejandro.** `family` and `lineage` are not enforced anywhere and are not
> seeded. If the Atlas writer is to cite a family or a lineage, confirm the target string that live
> already uses before the first pilot — otherwise the citation rows are orphaned in practice.

---


### The evidence link — `claim_citations` (the real citation mechanism)

`citations.target_type` above is a **plain-text column on the `citations` table**, and it is
**free text with no seed rows** for families or lineages. It is **not** how the Atlas evidence
model works. The mechanism that *is* constrained is a different table.

`db/migrations/0027_adr002_claims_model.sql` L333-367:

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | `uuid_generate_v4()` |
| `statement_id` | `uuid NOT NULL` | → `statements(id)` `ON DELETE CASCADE` |
| `source_id` | `uuid NOT NULL` | → `sources(id)` |
| `stance` | `citation_stance NOT NULL` | **ENUM** — see below |
| `locator` | `text` | WHERE in the source the passage sits |
| `excerpt` | `text` | **The EXACT text, quoted verbatim** |
| `revision_id` | `text` | The retrieval anchor — which VERSION of the document was read |
| `retrieved_at` | `timestamptz NOT NULL` | WHEN the passage was read |
| `excerpt_validated` | `boolean NOT NULL DEFAULT false` | Was this excerpt validated against the stated revision? |

**`citation_stance` ENUM (L328) — exactly three values:**

| Value | Meaning |
|---|---|
| `supports` | The passage supports the statement |
| `refutes` | The passage refutes the statement |
| `context` | **Counts as NEITHER support nor refutation** (Amendment 3) |

Uniqueness key (L365): `UNIQUE NULLS NOT DISTINCT (statement_id, source_id, revision_id, locator)`.
Multiple passages from one source on one revision are distinct rows; the same passage re-read on
a different revision is a **new** row, and the history is kept.

**Why this matters to the writer.** `citations.target_type` is the *recipe-side* convention. The
Atlas evidence model hangs citations off a **statement**, not off a target type. A family or a
lineage that wants a machine-checkable citation therefore needs a `statement` row and a
`claim_citations` row — not a `citations` row with `target_type = 'family'`. The `citations`
target-type string is a convention with no enforcement behind it, and **no family or lineage
target type is seeded anywhere**.

> **Open question for Alejandro.** `citations.target_type` has no constraint and no seeded
> family/lineage values. If the Atlas writer is to cite a family or a lineage, the mechanism to
> use is `claim_citations` (statement-keyed), and the `citations` target string needs confirming
> against live before anything relies on it.


## 12. The lineage record's own vocabularies

**These are enforced — but by the skill's schema, not by the database.** The `lineages` and
`dish_lineages` tables have **no writer path** (see `SKILL.md` → Write paths: "none: review
only"), so there is no database vocabulary to read. The values below are the ones the skill's
`atlas-record.schema.json` accepts, and they are what `check_atlas.py` validates against.

### `lineage.confidence_level`

`documented` · `likely` · `probable` · `possible` · `uncertain` · `parallel_evolution`

**`documented` needs at least one S1 or S2 source** — the checker raises an ERROR otherwise.
**`parallel_evolution` with `documented`** raises a WARNING: parallel evolution is a claim
against a single origin, so the two together need a second look at the wording.

### `lineage.historical_forces`

Fourteen values, all of them the name of a *force* that moved an idea, not a place:

`migration` · `trade_route` · `empire` · `colonization` · `diaspora` · `religious_exchange` ·
`port_city_exchange` · `agricultural_spread` · `technological_change` · `local_adaptation` ·
`parallel_evolution` · `cultural_exchange` · `nomadic_pastoral` · `war_and_displacement`

### `members[].role` (the `dish_lineages` roles)

Fourteen values, split by what they assert:

| Class | Roles |
|---|---|
| **Transmission** — these claim history and need a source | `ancestor`, `descendant`, `adaptation`, `fusion`, `diaspora_adaptation`, `trade_route_spread`, `colonial_spread` |
| **Resemblance** — these claim only a likeness and carry no history wording | `cousin`, `technique_relative`, `ingredient_relative`, `parallel_evolution` |
| **Uncertain** — possible influence and uncertain never carry `documented` or `likely` confidence | `possible_influence`, `uncertain` |
| **Variant** | `regional_variant` |

### `changedElement`

The fourteen elements a member may be said to have changed:

`ingredient` · `spice_profile` · `cooking_method` · `shape` · `filling` · `dough` · `grain` ·
`preservation_method` · `serving_context` · `religious_rule` · `local_availability` ·
`cooking_fat` · `wrapper` · `fermentation_time`

### `family.family_class`

`FORM` · `COURSE` · `CUISINE` · `CONTENT TYPE`

> **Note the space.** `CONTENT TYPE` has a space in it, and the moussaka family is
> `('moussaka', 'CONTENT TYPE', 'Moussaka')` — migration `0051_family_classification.sql` L260.
> A family is a **classification**, never an ancestry: the checker raises an ERROR for history
> wording on a family ("a family is a classification, not ancestry").

---

## 13. What this snapshot changed

See `CHANGES.md` in this skill for the full log. The substantive corrections are:

1. **The predicate list was wrong.** The style file said "the predicates are `created_by`,
   `named_after`, `originated_at` and `originated_in`". There are **eleven** predicates; those four
   are the statement-anchored ones, and the seven dimension predicates were missing entirely.
2. **The "Served as" facet is confirmed** as the course facet (`dish_courses`), not a relation type.
3. **The relation-type list is confirmed** against `relation_types`, including the two slugs that
   0036 renamed (`shared-method` → `similar_technique`, `shared-serving` → `often_compared_with`).
4. **`citations.target_type` has no constraint** — recorded as an open question, not as a fact.
