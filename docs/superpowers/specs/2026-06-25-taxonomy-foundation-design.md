# Food-Family Taxonomy — Slice 1: Foundation — Design

**Date:** 2026-06-25
**Branch:** `feat/taxonomy-foundation` (off `main`)
**Status:** Approved (design); spec under review

## Context

The user supplied a complete food-family taxonomy: ~66 canonical dish
families grouped under 11 course groups, plus an expanded set of
inter-family relationship types and a per-dish model
(`primaryFamily` / `secondaryFamilies` / `courseGroup` / relationships).

The full request spans three independent subsystems and is decomposed into
three slices, each with its own spec→plan→build:

- **Slice 1 (this spec) — Foundation.** Data model + canonical seed of the
  course groups, families, and relationship types. No dish remapping, no
  API/UI changes.
- **Slice 2 — Dish remapping.** Map the 60 seeded dishes onto
  primary/secondary families + course group; author relationships. Absorbs
  the existing P3 "seed-data enrichment" backlog item.
- **Slice 3 — Surfaces.** Taxonomy API endpoints + rebuild `/families`
  around the real taxonomy (grouped by course group); per-dish family
  display. Retires the `methodSlug`-derived families.

## Architecture — extend `categories`

The taxonomy reuses the existing hierarchical `categories` table rather
than introducing parallel tables:

- `categories.parentId` already gives the course-group → family hierarchy.
- `dishCategories.isPrimary` already distinguishes primary vs secondary
  family membership (used in Slice 2).
- `dishRelations.relationType` already models typed, reasoned edges
  (extended here).

The only structural gap: `categories` has no way to say *what kind* of
category a row is. Cuisines and course groups are both top-level
(`parentId = null`), so depth can't distinguish them. We add a `kind`
discriminator.

## Schema changes

### 1. `categoryKind` enum + `kind` column (one migration)

Add to `packages/db/src/schema/index.ts`:

```ts
export const categoryKind = ['cuisine', 'course-group', 'family', 'dish-type'] as const;
export type CategoryKind = typeof categoryKind[number];
```

Add to the `categories` table:

```ts
kind: text('kind').$type<CategoryKind>().notNull().default('dish-type'),
```

`kind` is a **text column typed by the const array** (same pattern as
`categories.source` and `dishRelations.relationType`) — not a Postgres
enum. Generate the migration with `drizzle-kit` (`pnpm db:generate`),
apply with `pnpm db:migrate`. The `default('dish-type')` backfills
existing rows; the seed then corrects cuisine rows to `kind='cuisine'`
(see Seed mechanics).

There is **no** `db/schema.sql` to keep in sync — the CLAUDE.md note about
a second schema file is stale (only `.swarm/schema.sql`, ruflo junk,
exists). Drizzle migrations are the single source of truth.

### 2. Extend `dishRelationType` (no migration — pure code)

`relation_type` is a text column typed by a const array, so extending it
is code-only. Keep all 8 existing values; **add 8** (final list of 16):

```ts
export const dishRelationType = [
  // existing (unchanged — no data breaks)
  'family', 'regional-cousin', 'diaspora', 'shared-ingredient',
  'shared-method', 'similar-serving', 'ancestor', 'descendant',
  // new
  'trade-route', 'colonial', 'festival-ritual',
  'ingredient-substitution', 'cooking-vessel', 'texture',
  'same-region', 'same-occasion',
] as const;
```

User-label → enum mapping (so Slice 2 authors edges with the right value):

| User label | Enum value |
|---|---|
| Same family | `family` |
| Regional cousin | `regional-cousin` |
| Shared technique | `shared-method` |
| Shared base ingredient | `shared-ingredient` |
| Shared serving format | `similar-serving` |
| Ancestor / descendant | `ancestor` / `descendant` |
| Diaspora adaptation | `diaspora` |
| Trade-route influence | `trade-route` (new) |
| Colonial influence | `colonial` (new) |
| Festival / ritual relation | `festival-ritual` (new) |
| Ingredient substitution cousin | `ingredient-substitution` (new) |
| Cooking vessel relation | `cooking-vessel` (new) |
| Texture relation | `texture` (new) |
| Same region | `same-region` (new) |
| Same occasion | `same-occasion` (new) |

## Taxonomy data (new seed-data exports)

Two new exports in `packages/db/src/seed-data.ts`, source of truth:

```ts
export const COURSE_GROUPS: Array<{ slug: string; name: string; description: string; displayOrder: number }> = [...]
export const DISH_FAMILIES: Array<{ slug: string; name: string; courseGroupSlug: string; description: string; displayOrder: number }> = [...]
```

### Course groups (11) — `kind='course-group'`, `parentId=null`

| displayOrder | slug | name |
|---|---|---|
| 1 | `mains` | Mains |
| 2 | `soups-broths` | Soups & broths |
| 3 | `rice-grains` | Rice & grains |
| 4 | `noodles-pasta` | Noodles & pasta |
| 5 | `breads-doughs` | Breads & doughs |
| 6 | `street-foods-snacks` | Street foods & snacks |
| 7 | `small-plates-sides` | Small plates & sides |
| 8 | `preserves-condiments` | Preserves & condiments |
| 9 | `sweets-desserts` | Sweets & desserts |
| 10 | `drinks` | Drinks |
| 11 | `techniques-bases` | Techniques & bases |

### Families (77) — `kind='family'`, `parentId=<course group>`

`displayOrder` is assigned sequentially within each course group (the
order listed). Descriptions are the user's family definitions verbatim.

**Mains (`mains`)** — `egg-dishes` (Egg dishes), `dumplings` (Dumplings),
`stews-braises` (Stews & braises), `curries-spiced-sauces` (Curries &
spiced sauces), `hot-pots-communal-simmer` (Hot pots & communal simmer),
`grilled-skewered` (Grilled & skewered), `roasts-whole-cooked-meats`
(Roasts & whole cooked meats), `barbecue-smoked-foods` (Barbecue & smoked
foods), `stir-fries` (Stir-fries), `stuffed-vegetables` (Stuffed
vegetables), `meatballs-koftas` (Meatballs & koftas),
`savory-pancakes-griddled-batters` (Savory pancakes & griddled batters),
`casseroles-baked-layers` (Casseroles & baked layers), `raw-cured-fish`
(Raw & cured fish), `fermented-mains` (Fermented mains),
`offal-nose-to-tail` (Offal & nose-to-tail dishes),
`seafood-stews-braises` (Seafood stews & braises)

**Soups & broths (`soups-broths`)** — `soups-broths-family` (Soups &
broths), `cold-soups` (Cold soups)
> Note: the *family* "Soups & broths" uses slug `soups-broths-family` to
> avoid colliding with the *course-group* slug `soups-broths`.

**Rice & grains (`rice-grains`)** — `rice-bowls` (Rice bowls),
`pilafs-seasoned-rice` (Pilafs & seasoned rice), `fried-rice` (Fried rice
— **promotes the legacy dish-type**, see Collisions),
`rice-cakes-compressed-rice` (Rice cakes & compressed rice),
`porridges-congees` (Porridges & congees)

**Noodles & pasta (`noodles-pasta`)** — `noodle-soups` (Noodle soups),
`dry-tossed-noodles` (Dry & tossed noodles), `fresh-noodles-pasta` (Fresh
noodles & pasta), `wok-fried-rice-noodles` (Wok-fried rice noodles)

**Breads & doughs (`breads-doughs`)** — `filled-breads` (Filled breads),
`flatbreads` (Flatbreads), `leavened-loaves` (Leavened loaves),
`enriched-breads` (Enriched breads), `steamed-buns` (Steamed buns),
`fried-breads` (Fried breads), `laminated-breads-pastries` (Laminated
breads & pastries)

**Street foods & snacks (`street-foods-snacks`)** — `street-snacks`
(Street snacks), `wraps-rolls` (Wraps & rolls), `fritters-croquettes`
(Fritters & croquettes), `savory-pies-pastries` (Savory pies & pastries),
`sandwiches-stuffed-breads` (Sandwiches & stuffed breads),
`hand-pies-turnovers` (Hand pies & turnovers),
`leaf-wrapped-steamed-foods` (Leaf-wrapped & steamed foods),
`tortilla-masa-dishes` (Tortilla & masa dishes)

**Small plates & sides (`small-plates-sides`)** — `salads-slaws` (Salads &
slaws), `legume-dishes` (Legume dishes), `vegetable-sides` (Vegetable
sides)

**Preserves & condiments (`preserves-condiments`)** — `pickles-ferments`
(Pickles & ferments), `dips-spreads` (Dips & spreads), `relishes-chutneys`
(Relishes & chutneys), `chili-sauces-fermented-pastes` (Chili sauces &
fermented pastes), `cured-meats` (Cured meats), `cheeses-cultured-dairy`
(Cheeses & cultured dairy), `sausages-encased-meats` (Sausages & encased
meats), `pates-terrines` (Pâtés & terrines), `nut-seed-sauces-pastes`
(Nut & seed sauces/pastes)

**Sweets & desserts (`sweets-desserts`)** — `custards-puddings` (Custards &
puddings), `fried-sweets` (Fried sweets), `cakes-sponges` (Cakes &
sponges), `laminated-layered-pastries` (Laminated & layered pastries),
`cookies-biscuits` (Cookies & biscuits), `milk-sweets` (Milk sweets),
`frozen-desserts` (Frozen desserts), `rice-sticky-rice-sweets` (Rice &
sticky rice sweets), `fruit-desserts` (Fruit desserts),
`confections-candies` (Confections & candies)

**Drinks (`drinks`)** — `fermented-drinks` (Fermented drinks),
`hot-brews-spiced-drinks` (Hot brews & spiced drinks),
`cold-drinks-refreshers` (Cold drinks & refreshers), `coffee-traditions`
(Coffee traditions), `tea-traditions` (Tea traditions),
`herbal-tonic-drinks` (Herbal & tonic drinks)

**Techniques & bases (`techniques-bases`)** — `spice-pastes-cooking-bases`
(Spice pastes & cooking bases), `aromatic-bases` (Aromatic bases),
`marinades-rubs` (Marinades & rubs), `stocks-broths-bases` (Stocks & broth
bases), `batters-coatings` (Batters & coatings), `fermentation-starters`
(Fermentation starters)

**Per-course-group counts (total 77):** Mains 17 · Soups & broths 2 · Rice
& grains 5 · Noodles & pasta 4 · Breads & doughs 7 · Street foods & snacks
8 · Small plates & sides 3 · Preserves & condiments 9 · Sweets & desserts
10 · Drinks 6 · Techniques & bases 6.

### Slug collisions with existing categories

Verified against all current cuisine + dish-type slugs. Two adjustments:

1. **`fried-rice`** — exact collision with the legacy dish-type
   `fried-rice`. They are the same concept, so the family insert
   **promotes** the existing row: on-conflict updates it to
   `kind='family'`, `parentId=rice-grains`, the family name/description.
   This is the one intended merge.

   **Safety verdict (checked 2026-06-25): SAFE to promote.** The only code
   that consumes categories is (a) the `?category=<slug>` dish filter
   (`apps/api/src/routes/dishes.ts`), which joins `dish_categories` →
   `categories` **by slug only**, ignoring `kind`/`parentId`; and (b)
   `family/[slug].astro`, which builds one static page per category slug
   the same way. Nothing assumes dish-type rows are parentless in a way
   that would break. The sole observable change is that `fried-rice` gains
   a non-null `parentId` in the flat `/api/categories` list (cosmetic; the
   "group by parentId" client merely nests it). Existing
   `dish_categories` links to `fried-rice` are untouched.

   **Build side effect (flag, not fixing in Slice 1):** `/api/categories`
   returns ALL categories flat, and `family/[slug].astro` emits a static
   page per returned slug. Adding 11 course groups + 77 families means the
   next *web* build generates ~88 extra `/family/<slug>` pages — valid but
   empty until Slice 2 links dishes. This is data-driven, not a code
   change, and Slice 1 does not rebuild/deploy web. The clean fix (filter
   `/api/categories` or the family page by `kind`) belongs to Slice 3.
2. **`soups-broths`** — the family "Soups & broths" would collide with its
   own course-group slug `soups-broths`. The family uses slug
   `soups-broths-family`.

All other near-misses are already distinct (e.g. family `noodle-soups`
vs legacy dish-type `noodle-soup`; family `stir-fries` vs legacy
`stir-fry`). Conceptually-overlapping legacy dish-types with different
slugs (`dumpling`, `pasta`, `stew`, `curry`, `casserole`, `salad`,
`bread`, `pancake`, `kebab`, `soup`, `street-snack`, `fermented`,
`sandwich`, `rice-dish`, `main-course`, `side`, `appetizer`, `sauce`) are
left untouched in Slice 1 and reconciled/retired in Slice 2.

## Seed mechanics

In `packages/db/src/seed.ts`, add a `seedTaxonomy(db)` step (called from
the main seed flow, after categories, before dish relations):

1. Insert `COURSE_GROUPS` as categories (`parentId=null`,
   `kind='course-group'`, `displayOrder`). Idempotent via
   on-conflict-do-update on `slug` (sets name/description/displayOrder/kind).
2. Resolve each course-group slug → id, then insert `DISH_FAMILIES`
   (`parentId=<group id>`, `kind='family'`, `displayOrder`). On-conflict
   updates parentId/kind/name/description/displayOrder — this is what
   promotes the legacy `fried-rice` row.
3. Backfill `kind` on existing taxonomy rows: the cuisine inserts switch
   to on-conflict-do-update setting `kind='cuisine'`; legacy dish-type
   rows keep the column default `'dish-type'`.

The whole step is idempotent and order-independent on re-seed.

## Testing

A DB-backed vitest (`packages/db` or `apps/api/test`) that, after the seed
runs:

- exactly **11** categories with `kind='course-group'` and `parentId IS NULL`;
- exactly **77** categories with `kind='family'`, each with a non-null
  `parentId` that points to a `course-group` row;
- every course group has **≥1** family child;
- `techniques-bases` has **≥6** family children;
- cuisines are `kind='cuisine'`; legacy dish-type rows still resolve via
  the `?category=<slug>` filter (legacy still works);
- the legacy `fried-rice` row now has `kind='family'` and a parent (promotion);
- `categoryKind` exports `['cuisine','course-group','family','dish-type']`
  and `dishRelationType` includes `same-region` and `same-occasion`
  (unit-level assertion, no DB).

## Out of scope (Slice 1)

- Dish → family remapping (dishes keep `dishTypes`/`methodSlug`). → Slice 2.
- Relationship-edge authoring with the new types. → Slice 2.
- Any API endpoint or UI change; `/families` still groups by `methodSlug`. → Slice 3.
- Retiring legacy dish-type categories. → Slice 2/3.

## Judgment calls (flagged for review, easily moved later)

- `noodle-soups` → **Noodles & pasta** (not Soups & broths).
- `wraps-rolls`, `savory-pies-pastries` → **Street foods & snacks** (not Mains).
- `legume-dishes` → **Small plates & sides** (even though feijoada/dal can be mains).
- `dips-spreads`, `cheeses-cultured-dairy`, `cured-meats` → **Preserves & condiments** (not Small plates).
- `porridges-congees` → **Rice & grains** (grain base) rather than Soups & broths.
