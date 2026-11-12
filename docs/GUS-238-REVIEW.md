# GUS-238 — Dish Journey: separate OSM map cards, visible lineage, visible ingredients

**Branch:** `feature/gus-dish-journey-osm-cards`
**Base:** `origin/main` @ `af4a0f8`
**Status:** ready for review. **Not merged, not deployed, no live data written.**

---

## What this is

The dish-page redesign from the reference pack, implemented **inside the real Gustale
application** — its components, tokens, MapLibre basemap, canonical data and build
pipeline — rather than as a detached prototype.

Two things ship:

1. **A real, reviewed improvement for every dish** (pilot switch OFF):
   the Journey section no longer renders nothing when a dish has no chronology.
   It now states a **research gap** plainly, and distinguishes that from a
   **fetch failure**. Before this, a dish with no beats rendered *no section at
   all*, and a failed journey fetch was silently indistinguishable from an
   empty history.

2. **The new presentation, behind an off-by-default switch** (pilot switch ON):
   one map per historical chapter, laid out side by side; a visible,
   data-backed Lineage section; a sticky section nav; and a visible ingredient
   overview.

---

## Local review

```bash
# from the repo root
git checkout feature/gus-dish-journey-osm-cards

# 1. install
pnpm install --frozen-lockfile

# 2. apply the new migration to a DISPOSABLE database ONLY
#    (never the live 'gustale' database — see scripts/lib/test_pg.sh)
docker exec -i gustale-test-postgres psql -U postgres -d gustale_ci \
  -f - < db/migrations/gus-238-journey-editorial-fields.sql

# 3. start the API against the disposable DB
cp apps/api/.env apps/api/.env.local   # or set DATABASE_URL yourself
pnpm --filter @gustale/db run build
pnpm --filter @gustale/api run dev

# 4. build the Atlas with the pilot ON
cd apps/web
PUBLIC_DOMAIN=geo BUILD_DATA_SOURCE=live \
PUBLIC_API_BASE=http://127.0.0.1:4000 \
PUBLIC_DISH_JOURNEY_PILOT=1 \
  ./node_modules/.bin/astro build

# 5. serve it
./node_modules/.bin/astro preview
# then open /dishes/moussaka-greek/
```

**To see the pilot OFF** (the production default), omit
`PUBLIC_DISH_JOURNEY_PILOT=1`.

### The pilot dishes

| Slug | What it shows |
| --- | --- |
| `/dishes/moussaka-greek/` | The two-dish application pilot: 3 chapters, 3 maps, lineage section |
| `/dishes/bibimbap/` | The other pilot dish (6 chapters in the reference fixture) |
| `/dishes/chongqing-hot-pot/` | The hot-pot review fixture (2 attributed accounts) |
| `/dishes/century-egg-tofu/` | A research-gap fixture — no chapters, explicit gap state |
| `/dishes/beyaynetu/` | A research-gap fixture — no chapters, explicit gap state |

Only the first two are the **application** pilot. The other three are review
coverage and are **not** published routes.

### A dish outside the pilot must be unchanged

Open `/dishes/vindaloo/` with the pilot ON: it keeps the existing Journey
presentation, has no sticky section nav, no ingredient cards, and no pilot CSS.
That is asserted by the build output, not just by inspection.

---

## What changed

### The additive schema extension (the ONE new migration)

`db/migrations/gus-238-journey-editorial-fields.sql`

`dish_journey_beats` gains **nullable** columns for the editorial fields a
historical chapter needs and the current table could not hold:

`title` · `date_label` · `date_precision` · `evidence_kind` · `locator` ·
`authors` · `place_role` · `scope_note` · `bounds` · `regions`

Plus one new table, `dish_journey_movements`, for **source-supported**
transmission edges. An edge exists only if a historical record supports it;
chapter order and map proximity never produce one.

**What this does NOT do:**

- It does **not** change the confidence enum. The CHECK constraint
  `('documented','likely','possible','parallel')` is untouched. Evidence type
  lives in its own `evidence_kind` column, so badge wording can change
  editorially without touching a constraint other code reads.
- It does **not** create a second journey store, a second lineage store, or a
  competing endpoint.
- It does **not** create or promote any historical record. It is empty
  structure.

### The API

`GET /api/dishes/:slug/journey` now also returns:

- `status` — `"history"` | `"gap"`. A dish with no chapters is a **research
  gap**, which is a different editorial statement from a fetch failure.
- `movements` — only ever the rows that exist.
- richer `lineages` — the **existing** `dish_lineages.role` (14 values),
  `explanation`, `changed_elements`, `confidence_level`, plus the lineage's own
  descriptions and its published related dishes.

The lineage data model was already richer than the brief assumed; **no new
lineage relationship type was needed.**

### The web

| File | What it does |
| --- | --- |
| `apps/web/src/lib/journey.ts` | Pure editorial semantics: date precision, evidence labels, lineage wording, movement rules, map framing. No React, no DOM — so it is unit-testable. |
| `apps/web/src/components/JourneyMapCard.tsx` | One map per chapter, on the site's existing CARTO/OSM vector basemap, restyled toward the reference palette. |
| `apps/web/src/components/LegacyJourney.tsx` | The existing P1-1 presentation, preserved exactly for every non-pilot dish. |
| `apps/web/src/components/DishIngredientOverview.tsx` | Visible ingredient cards near the introduction. The SAME ingredient rows the page already lists — a presentation, not a second content model. |
| `apps/web/src/components/DishSectionNav.tsx` | Sticky section nav. Built from what the page actually renders, so a link can never point at a missing anchor. |
| `apps/web/src/lib/dishSections.ts` | Which sections exist. Pure, tested. |
| `apps/web/src/lib/dishJourneyPilot.ts` | The off-by-default switch and the pilot allowlist. |
| `apps/web/src/lib/dishJourneyFixtures.ts` | The five review cases, with their bibliographic provenance preserved. Review material, never live content. |
| `apps/web/src/lib/maplibreLoader.ts` | One typed place for the dynamic MapLibre import. |

---

## Editorial rules the implementation enforces

- **Date precision is preserved.** "1810", "c. 1810", "1810–1820", "late 19th
  century", "1930s" and "unknown" are all representable. A missing date is
  never rendered as 0, the current year, or the source's publication year.
- **BCE dates display without a year zero.**
- **Confidence and evidence type are labelled separately.** "Documented" says
  how sure we are; "Primary record" says what the record is.
- **A movement is drawn only when a source supports it.**
- **A lineage role that is not directional reads as "related to", never as an
  ancestor or a descendant.** The section says so in as many words: *"A culinary
  grouping is not a proven chain of descent. The relationship recorded here is
  membership, not ancestry."*
- **Every chapter carries its inspection status.** The `scope_note` says
  whether the original record was read directly or reported through another
  author.
- **A research gap is stated plainly**, and never dressed up with invented
  milestones.

---

## Validation results (actual, measured)

| Check | Result |
| --- | --- |
| Web unit tests | **40 / 40 pass** (`journey.test.ts` 27, `dishJourneyFixtures.test.ts` 13) |
| API tests (new) | **9 / 9 pass** (`dishes-journey-v2.test.ts`) |
| API suite (full) | **22 files, 217 passed, 3 skipped, 0 failed** |
| `astro check` | **77 errors, 0 in the changed files** (baseline `origin/main`: 83 — six fewer) |
| API `tsc --noEmit` | clean |
| Biome lint | no findings in the changed files |
| Atlas build (pilot OFF) | **127 pages, exit 0** |
| Atlas build (pilot ON) | **127 pages, exit 0** |
| Recipes build | **127 pages, exit 0** — no pilot CSS, no fixture data |
| `validate-build.mjs` | 6 failures, **identical on `origin/main`** (sparse test DB: no `/family/dumpling/` page, no lineage cards) |

### The isolation guarantee, verified on the built output

With the pilot **OFF** (the production default):

- the pilot CSS file is **not emitted**,
- the pilot CSS is **not referenced** by any page,
- the fixture strings are **absent** from the bundle,
- `dj--v2` appears on **zero** pages,
- but the research-gap improvement is present on **51** pages.

With the pilot **ON**, the switch is verified to apply to the allowlist only —
`moussaka-greek` gets `presentation=true`, every other dish `false`.

### Rendering, measured in a real browser

On the pilot dish: **3 chapters, 3 separate map cards** in one row
(`left: 120 / 472 / 824`, all at the same `top`), **3 map canvases** with
`© OpenStreetMap contributors © CARTO` attribution and scale bars, **1 lineage
note**, **5 section-nav links**, **4 ingredient cards**, **3 research-limit
disclosures**, **3 citations**, **6 evidence badges**, and **no horizontal
overflow** at 1280 px or 390 px.

The maps show real geography — Turkey, the Black Sea, the Aegean and the
Mediterranean with country labels and borders — matching the reference's pale
water and warm land.

> **Screenshots** are in `docs/gus-238-screenshots/`. They were captured with
> Windows Chrome over CDP, because WSL's Playwright Chromium is missing
> `libnspr4.so` and installing system libraries is outside this task's scope.

---

## Evidence gaps carried forward (not papered over)

1. **The named OSM/lineage reference does not exist.**
   `references/gustale-osm-lineage-reference.png` is not in either archive. The
   two files in `gustale-dish-design-reference/reference/` are **hero** images,
   not maps. The map style was therefore derived from the 21 reference JPGs'
   palette and the site's existing basemap. **This is a real gap in the brief's
   evidence, and it should be closed by supplying the missing reference.**

2. **The reference maps are simplified SVG outlines** with no attribution, no
   scale bar and, in several cards, no markers — while the brief demands OSM
   attribution and a scale. The implementation uses the real OSM-derived CARTO
   basemap with attribution and scale. That is a **deliberate improvement over
   the reference**, not a copy of it.

3. **The pilot's historical records were not independently re-verified against
   their primary sources in this pass.** The pack's `journey-content-notes.md`
   states precisely which originals were inspected and which were reported
   through another author. That provenance is carried into the fixtures
   **verbatim** and exposed in the UI. No claim is upgraded, and no unverified
   record is presented as inspected.

4. **`century-egg-tofu` and `beyaynetu` return 404 live.** Their canonical
   slugs are unresolved. They are review fixtures only, never published routes.

5. **`chongqing-hot-pot` has zero beats and zero lineages live**, so the
   hot-pot fixture cannot be validated against live data until editorial
   records exist.

6. **The live `recipe.gustale.com` alias.** The brief and the request name
   `recipes.gustale.com`. It resolves and serves the Recipes site, but its
   canonical is `gustale.recipes`, and `infra/prod/Caddyfile` routes only
   `gustale.recipes`. The implementation targets the real canonical. **No DNS
   or hosting change is made here.**

---

## Rollback

The pilot is **off by default**, so rolling back is a matter of turning it off:
delete `PUBLIC_DISH_JOURNEY_PILOT=1` from the build environment. Nothing
already published changes, because the pilot never applied to it.

The migration is **additive and nullable**. Rolling it back is
`DROP COLUMN` on the ten new columns and `DROP TABLE dish_journey_movements` —
which also removes any editorial records written into it. **If records have
been approved and written, drop the table only after they have been exported.**

The legacy presentation is preserved in `LegacyJourney.tsx` and is still the
code path for every non-pilot dish.

---

## What this PR does NOT do

- No merge, no deploy, no auto-merge, no approval labels.
- No DNS, hosting or infrastructure change.
- No live migration — the migration file is for a disposable/verified target.
- No published editorial data. The fixtures are review material.
- No redesign of `gustale.recipes`.
- No change to the confidence enum, the lineage model, or any existing
  component's behaviour outside the Journey section.

---

## Files changed

```
M apps/api/src/routes/dishes.ts
M apps/web/src/components/DishDetail.tsx
M apps/web/src/components/DishJourney.tsx
M apps/web/src/components/DishLocalePage.astro
M apps/web/src/env.d.ts
M apps/web/src/lib/api.ts
M apps/web/src/pages/dishes/[slug].astro
M packages/db/src/schema/index.ts
A apps/api/test/dishes-journey-v2.test.ts
A apps/web/src/components/DishIngredientOverview.tsx
A apps/web/src/components/DishSectionNav.tsx
A apps/web/src/components/JourneyMapCard.tsx
A apps/web/src/components/LegacyJourney.tsx
A apps/web/src/lib/dishJourneyFixtures.test.ts
A apps/web/src/lib/dishJourneyFixtures.ts
A apps/web/src/lib/dishJourneyPilot.ts
A apps/web/src/lib/dishSections.ts
A apps/web/src/lib/journey.test.ts
A apps/web/src/lib/journey.ts
A apps/web/src/lib/maplibreLoader.ts
A apps/web/src/styles/dish-journey-v2.css
A db/migrations/gus-238-journey-editorial-fields.sql
A docs/DISH-JOURNEY-ASSESSMENT-2026-11-12.md
A docs/GUS-238-REVIEW.md
```
