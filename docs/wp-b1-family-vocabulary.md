# WP-B1 — the published family vocabulary, and the Musakka duplicate

**Baseline:** `origin/main` @ `cb853daf` (WP-A2 merged) · **Branch:** `fix/hide-placeholder-families`
**Date:** 2026-11-16 · **Package:** WP-B1 of the 2026-11-15 blueprint

---

## The problem

The families directory shows placeholders beside real families.

Its own subtitle said *"Food families grouped by form, course, content
type, and cuisine"* — and the list it showed had **123 entries, of which
96 were placeholders or description-less forms**:

| family | class | description | published dishes |
| --- | --- | --- | --- |
| `dish` | CONTENT TYPE | none | **397** |
| `dessert` | COURSE | yes | 97 |
| `food` | CONTENT TYPE | none | **55** |
| `pastry` | COURSE | none | 38 |
| `confectionery` | COURSE | none | 37 |
| `human-food` | CONTENT TYPE | none | 28 |
| `potato-dish` | FORM | none | 27 |
| `meat-dish` | FORM | none | 24 |

The cause is in the API. The dish list picked a dish's family with a
LATERAL join that took the dish's **primary** family and nothing else:

```sql
ORDER BY df.is_primary DESC, f.slug, f.id LIMIT 1
```

397 published dishes carry `dish`; 55 carry `food`; 28 carry
`human-food`. For most of those, the placeholder is the **only**
family they have — so it reached the list, the search and the
directory.

## What this does

### 1. `dish_families.listed`

Migration `0058_dish_families_listed.sql` adds a boolean column. A
family is **listed** when it is a **FORM** — the shape of a dish — **and
it has a description**.

| | count |
| --- | --- |
| families | 306 |
| **listed** | **106** |
| unlisted | 200 |

The two rules are the two halves of the blueprint's sentence:

- a non-FORM family is not a shape — "Dessert" is a COURSE, "Jajan
  pasar" is a CUISINE, "Dish" is a CONTENT TYPE, and `0051` already
  separated them;
- a FORM family with no description says nothing — "Meat Dish",
  "Potato Dish", "Rice" have nothing to show.

The 66 FORM families without a description are left **unlisted, not
deleted**: they carry dishes, and deleting them would take those
dishes' family with them.

### 2. The API returns only a listed family

**A filter, not a preference.** This is the part that took two tries.

The first version ordered by `f.listed DESC` first, which *preferred* a
listed family but still **fell back** to an unlisted one. Measured on a
live-shape copy of production, that changed **nothing**:

```
changed|0    of 1,474 published dishes
```

Because a dish that carries `dish` carries nothing else, the fallback is
exactly what put the placeholder back. The filter is a `WHERE` clause:

```sql
AND f.listed
```

With it, the directory holds **27 families, all FORM, all listed, and no
placeholder**:

```
bread cake candy casserole cookie curry dumpling filled-pastry
fish-soup flatbread fried-rice fritter kebab meatball noodle-dish
noodle-soup pancake pasta pie porridge pudding rice-dish salad
sandwich sauce soup stew
```

The **cost, stated plainly**: 1,105 published dishes carry only an
unlisted family, and 29 carry none, so they now have **no family** on
this dimension. That is the honest answer — *"Family: Dish"* is not a
shape. The dish page simply says no family rather than claiming one it
does not have. Classifying those dishes is editorial work (**WP-R**),
not a migration's job.

The search offers only the listed families too. The unlisted ones stay
**reachable by URL and by filter**, so nothing that was linked becomes
unreachable.

### 3. The Musakka duplicate

`dish_variants` held exactly one row: the **Musakka** variant of
Moussaka.

| | |
| --- | --- |
| the variant | `2618b607` · slug `musakka-turkish` · "Turkish Moussaka (Musakka)" · parent `moussaka-greek` · published |
| the standalone dish | `d4c7d489` · slug `musakka-turkish` · "Musakka" · published |

**The same slug, two rows** — so the variant won the route and the
standalone dish was unreachable at its own URL.

The blueprint: *"Delete the Musakka variant row under Moussaka,
keeping the `similar_form` relation."*

The relation is a row in `dish_relations`, with its own foreign keys to
`dishes` — it is independent of the variant, and it survives:

```
5177da55  similar_form  active
  moussaka-greek -> musakka-turkish
  "Turkish musakka serves fried aubergine in a tomato-pepper meat
   sauce without béchamel; Greek moussaka is the layered casserole
   with béchamel"
```

And the migration **fails** if the relation is gone. The knowledge
cannot be silently deleted with the row.

The `DELETE` is by the row's **identity** — slug, parent *and* name —
not by the production id, because the CI fixture database seeds the
same logical row with a different id. And not by a loose pattern
either: a variant under a different parent is a different thing, not a
duplicate of this one.

## Verification

### The migration runs on BOTH shapes

The CI seed database (28 families):

```
0058: ok -- 28 families (2 listed, 26 unlisted)
```

A **live-shape copy of production** — dumped from production and
restored into the local **TEST** container:

```
0058: ok -- 306 families (106 listed, 200 unlisted)
```

### The chain and the API

```
CHAIN_RC=0
FULL_CI_CHAIN_OK=1

23 test files, 23 passed
```

### The live-shape copy proves the outcome

```
families             306
listed               106
unlisted             200
dish_variants          0   the Musakka row is gone
musakka-turkish        1   the standalone dish survives
similar_form_rel       1   the relation survives
nonFORM_listed         0
FORM_nodesc_listed     0
the slug now belongs to the dish, not the variant
```

### Idempotent

A second run exits **0**.

### The fixture changed, on purpose

`packages/db/seed-moussaka.sql` used to seed the Musakka variant,
because production had it. It now seeds the **Levantine** moussaka —
the other relation production already records. The fixture still needs
*a* variant, because `dishes-slug.test.ts` asserts the dish payload
carries at least one, and that is the only thing in the fixture that
exercises the variants path.

## The CI workflow

`0058` needs a step in `.github/workflows/ci.yml`, and the **GitHub App
cannot commit workflow files**. The step ships as:

```
docs/ci-dish-families-listed-0058.patch
```

which applies cleanly:

```
$ git apply --check docs/ci-dish-families-listed-0058.patch
PATCH APPLIES CLEANLY
```

Until the owner applies it, the CI migration-chain validator fails —
**the same state PR #219 is in** with its 0056/0057 patch, and for the
same reason. The patch's marker check passes:

```
$ bash scripts/check-ci-markers.sh "the listed families and the Musakka variant" "0058: ok" /tmp/m0058.log
  the listed families and the Musakka variant: the marker '0058: ok' is present
```

## What this does not do

It does not classify the 1,134 dishes that now have no listed family.
That is editorial work, and it belongs to **WP-R**. It does not touch
the ingredient aliases (PR #219's 0056/0057). It does not publish
anything.
