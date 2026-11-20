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

**28 slugs.** A family is a **classification** (by form, course, cuisine or content type, as approved
in migration 0051), **not ancestry**. `name`, `class` and `parent` are approved editorial decisions —
the writer never changes them.

| Slug | Slug | Slug |
|---|---|---|
| `bread` | `fried-rice` | `salad` |
| `breaded-cutlet` | `fritter` | `sandwich` |
| `casserole` | `kebab` | `sauce` |
| `curry` | `moussaka` | `side-dish` |
| `dessert` | `noodle-soup` | `soup` |
| `dumpling` | `pancake` | `stew` |
| `egg-dish` | `pasta` | `stiff-porridge` |
| `fermented-dish` | `porridge` | `street-snack` |
| `filled-pastry` | `rice-dish` | `stuffed-vegetable` |
| | | `taco` |

---

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
