# WP-C2 — the dish page in the mockup order

**Status:** in progress · **Branch:** `feat/wp-c2-dish-page` · **Base:** `main` at `4e10b10`

## The target

From `mockups/proposed-Dish.png`, top to bottom:

```
Overview   title, intro, FACTS TABLE, cover image
           in-page nav: Overview | Where | History | Connections | Variants | Ingredients | Recipes | Sources
Where it belongs    map + legend
History             journey beats as CLAIM ROWS
Connections         THREE COLUMNS: Resembles | Influenced by | Same family
Variants
Ingredients | Recipes      (same row)
Sources
```

## The current page

Live `gustale.com/dishes/moussaka` today:

```
Journey              (a map + chapters, not claim rows)
You may also explore
Places & traditions  (AtlasPlaces)
Where moussaka is associated   (the origin map)
```

`DishDetail.tsx` renders Regional variants, Ingredients, Preparation, You may
also explore, Sources, About this dish. `DishSectionNav`, `DishIngredientOverview`
and `DishJourneyPilot` exist but are behind the **GUS-238 pilot flag**, which is
OFF, and `DishSectionNav` is used only by the pilot.

## The dependency check

WP-C2 depends on A1, A2 and B2. All three are merged:

| dep | what | merged as |
| --- | --- | --- |
| A1 | visible cover, real empty states, no zero counters | `be5915d` (PR #242) |
| A2 | one `EvidenceLabel`, one `RelationshipKey`, `/about/evidence` | `cb853da` (PR #244) |
| B2 | legacy associations published as Unverified | `af2167e` |

## What the data actually supports

Verified against live on 2026-11-18, so the design is built on what exists, not
on what the mockup wishes for.

**Connections — all three columns have real rows.** `GET /api/dishes/:slug/relations`
returns `relationsByType`, keyed by the relation type:

| column | relation type | example |
| --- | --- | --- |
| Resembles | `similar_form` | `moussaka-greek` → `musakka-turkish` (Turkey), `moussaka-levant` (Lebanon) |
| Influenced by | `ancestor` | `bacalhau-a-bras` → `vindaloo`; `biryani-hyderabadi` → `jollof-rice` |
| Same family | `family` | `falafel` → `hummus`; `empanada` → `tamales` |

Each relation carries a `reason` — the one-line reason the blueprint requires for
a Resembles entry ("A stated reason; no history implied").

**The pilot's relation kinds are NOT the mockup's.** The mockup's three columns
are Resembles / Influenced by / Same family. The pilot's `public-relationship.ts`
classifies into `associated` / `resembles` / `influenced`. The mockup's
"Same family" is a **taxonomic** column, and the mockup's "Influenced by" is a
**directional** one. They are different axes and must not be collapsed:

- Same family → the relation type `family` (taxonomy, symmetric, no direction)
- Influenced by → the relation type `ancestor`, read in its TRUE direction

`descendant` is the inverse and must NOT appear in an "Influenced by" column.
`diaspora` is directional too but is not "influenced by" — it is the dish
spreading FROM somewhere. It gets its own honest treatment rather than being
forced into a column it does not mean.

## The decisions

### 1. The section order is a pure function, tested

The nav must be built from what the page ACTUALLY renders — "every link must
reach real content". The order is fixed by the mockup, but the PRESENCE of each
section is data. So: a pure `buildDishSections(available)` returns the ordered
list, and a table-driven test asserts both the order and the absence rules.

### 2. The facts table replaces scattered metadata

The mockup's facts table is two columns: `Associated with`, `Family`, `Served as`,
`Technique`, `Also called`. These map onto data the API already returns:

| fact | source |
| --- | --- |
| Associated with | the place associations (`AtlasPlaces` already fetches them) |
| Family | `data.dimensions` → the `family` dimension |
| Served as | `data.dimensions` → the `serving` dimension |
| Technique | `data.dimensions` → the `technique` dimension |
| Also called | `data.names` (ADR-003 layer 2) |

A dimension that is UNSET must show "no evidence", not be dropped — that is
A1's rule and `data.unsetDimensions` carries the reason.

### 3. Journey beats render as claim rows, not a map

The mockup's History section is a table of claim rows: a narrow label column, the
claim, and beneath it an evidence chip plus a source note. `DishJourney.tsx` today
renders a map plus chapters. The claim-row rendering is the new presentation;
the map moves to "Where it belongs", which is where the mockup puts it.

This is the same "sourced beats only" rule the home-map fix established: a beat
with no source renders as a claim with an Unverified chip, never as a route stop.

### 4. The preparation stub leaves the non-recipe context

The spec says "Remove the preparation stub from non-recipe context". The
preparation block on the Atlas dish page is a stub with no recipe to back it.
It goes; the Recipes block replaces it.

### 5. The Recipes block is a separate island

`GET /api/dishes/:slug/recipes` already exists. The mockup puts Recipes beside
Ingredients in one row, with the empty state: "No recipe yet." A separate
`client:visible` island keeps the block out of the main bundle and lets it load
lazily, which matters because there are **0 published recipes** today.

### 6. No invented content

Every value on the page comes from the API. Where the mockup shows a sample
(moussaka's Turkey and Levant cards, the "With a potato layer" variant), the
page shows the REAL row or nothing. The blueprint's rule: "Do not invent a
plausible route where source-backed data is unavailable."

## The files

| file | change |
| --- | --- |
| `apps/web/src/lib/dishSections.ts` | the ordered section registry + the facts table model |
| `apps/web/src/lib/dishSections.test.ts` | the order and absence tests |
| `apps/web/src/components/DishFactsTable.tsx` | NEW — the two-column facts table |
| `apps/web/src/components/DishConnections.tsx` | NEW — the three columns |
| `apps/web/src/components/DishJourney.tsx` | claim-row rendering |
| `apps/web/src/components/DishSectionNav.tsx` | the mockup's labels and order |
| `apps/web/src/components/DishDetail.tsx` | the new section order |
| `apps/web/src/pages/dishes/[slug].astro` | the sections and their data |
| `apps/web/src/components/DishRecipesBlock.tsx` | NEW — the Recipes block + empty state |

## The acceptance criteria

- Journeys 1 and 2 completable by links alone:
  - **1** Place → recipe: Atlas → Indonesia → Nasi Goreng → Variants → Recipes block → recipe page
  - **2** Dish → another culture: Moussaka → facts table 'Family: Casserole' → family page → another place; **or** Connections → Resembles → Musakka
- Each claim shows a label.

## The implementation

### Where the split falls, and why

The page is assembled from three pieces, and the split is by WHAT a piece is,
not by where it sits:

| piece | what it is | how it ships |
| --- | --- | --- |
| `DishDetail` | the OVERVIEW island — cover, breadcrumb, title, facts table, nav | `client:load` |
| the map + `AtlasPlaces` | "Where it belongs" | `client:visible` |
| `DishContentSections` | History, Connections, Variants, Ingredients, Recipes, Sources | **server-rendered, zero JavaScript** |

**Why the sections are not in the island.** The blueprint's order puts "Where it
belongs" (the map) SECOND — between the overview and History. If the overview
island also owned the sections after the map, the map would have to live inside
it, and the map would ship in the overview's JavaScript bundle instead of being
fetched when it scrolls into view. So the overview island ends at the nav, the
map keeps its own lazy boundary, and the sections after it render on the
server.

The four new components (`DishFactsTable`, `DishHistory`, `DishConnections`,
`DishRecipesBlock`) use no hooks and no event handlers, so they render to
static HTML and cost no JavaScript at all.

**Why the nav's flags are booleans.** The nav lives in the overview island but
describes the WHOLE page. The overview does not render the sections below the
map, so it cannot know whether they are there — the page tells it, one boolean
per section (`hasWhere`, `hasHistory`, `hasConnections`, `hasVariants`,
`hasIngredients`, `hasRecipes`, `hasSources`). The nav therefore cannot offer
a link to an anchor that is not on the page, and the page cannot render a
section the nav does not mention.

### The anchors

One registry, `lib/dishSections.ts`, owns the section ids, the order, the fact
labels and the connection-column semantics. The components import the ids from
it rather than writing them out, so an anchor and the nav's link to it cannot
drift apart. The registry's `DISH_SECTION_IDS` is the single source; the
sections' `id` and their heading's `id` are the same value.

### "Same family" is a classification, not a relationship

A2 says a family is not ancestry, and the mockup says the same in two ways:
the heading is written in small capitals with **no red mark**, and the card
carries the note "Classification only". So the column gets
`dish-connections__heading--caps` and no mark, while "Resembles" gets a red
dotted line and "Influenced by" a red arrow. The distinction is visible, not
just documented.

### The facts table

The rows are the mockup's, in the mockup's order: **Associated with**, **Family**,
**Served as**, **Technique**, **Also called**. A row whose dimension the record
does not have says **"No evidence"** — it is not omitted and it is not empty.
That distinction matters: a missing row reads as "this site has nothing to say
about serving", while "No evidence" reads as "we looked and there is no source
yet". The first is silence; the second is an honest state. A1 established that
rule and this table follows it.

The table has no outer border and no vertical rules; each row has a thin
horizontal rule under it, and the last row has none.

### The mock API gained `/api/dishes/:slug/relations`

The in-repo mock API had no `/relations` route, so the Connections block would
have baked empty. The route is registered BEFORE the `/api/dishes/:slug` route
(that route matches exactly and would shadow it) and derives the relations from
the ATLAS fixture.

The captured fixture lists each connection TWICE — once per direction of the
pair — so the same relation id appears twice for the same other-dish. The mock
dedupes by the relation id, because the API returns each relation once. Without
it, "Levantine Moussaka" appeared twice under Resembles.

### What was verified, and how

| check | result |
| --- | --- |
| web test suite | **289 pass, 0 fail** (221 on main + 68 new) |
| typecheck | **111 diagnostics — exactly the main baseline**, zero in any WP-C2 file |
| biome (`node scripts/run-lint.mjs`, the CI gate) | **exit 0** |
| biome (the 15 new/edited files) | **0 errors**; 2 warnings, both pre-existing patterns |
| the geo build | exit 0, `validate-build` all checks passed |
| the rendered page | headings in the mockup's order, 8/8 nav anchors resolve, **0 duplicate ids** |

### Three defects the rendered inspection caught

The rendered HTML was checked, not just the source. It found three things the
type-checker and the unit tests could not see.

**1. Every section id appeared twice.** Each section's wrapper `<section>` and
its inner `<h2>` both carried the section's id, so a fragment link landed on
the wrapper — the top edge of the section, with the heading below the fold —
and the document had a duplicate id. The headings own the ids now; the
wrappers point at them with `aria-labelledby`.

**2. The nav's first link had no target.** The overview's anchor was on the
`<h1>`, so "Overview" landed on the title and skipped the facts table, which
is the section's whole point. The overview **block** (the `<article>`) owns
the anchor now, and the `<h1>` inside it owns a separate title id for the
article's `aria-labelledby`. Two ids, two elements, no collision.

**3. "History" was missing from the nav.** The nav's flags described the
island, but History is rendered by `DishContentSections`, outside it — so
the link was never offered even though the section was on the page. The
flags describe the whole PAGE, and the page always renders History (with an
explicit empty state), so `hasHistory` is always true.

`lib/dishAnchors.test.ts` now pins all three: unique ids, the heading owning
the id, every nav link resolving to a registered id, and every flag the nav
can link to.

### The relationship kind, in words

The atlas stores a machine key in `relationship` (`established_tradition`,
`historical_emergence`, …). The facts table spells those out. And
`legacy_unreviewed` — which is what every row in the live data currently
holds — is **the migration's own label, not a relationship kind**: it means
"this row came from the old places & traditions list and no source supports
it yet". Printed raw it puts a sentinel on the page, so it reads as
**"Unverified association"**, which is what the row actually is. The
evidence badge beside it says the same thing.

An unknown kind is humanised rather than dropped, so a new relationship type
is visible on the page instead of silently disappearing.

### The locale page renders the same sections

`DishLocalePage.astro` was still passing the old `journeyBeats` /
`journeyLineages` / `journeyMovements` / `journeyStatus` props to
`DishDetail`, which WP-C2 replaced — Astro would have forwarded them as DOM
attributes. The locale page now renders the same `DishContentSections` in the
same order, so a localised dish page is not a different page.

**What could NOT be verified here:** the built page was checked as HTML, not
rendered in a browser — the browser service was unavailable during this work.
So the visual match to the mockup is asserted from the CSS rules and the
rendered markup, not from a rendered pixel. The browser check is still
outstanding.
