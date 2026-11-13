# Gustale dish journey — assessment of the reference pack vs. current platform

Audit date: 12 November 2026
Auditor: Hermes Agent
Baseline: `origin/main` = `af4a0f8` ("chore(deploy): the smoke baseline measured against production, and the deploy trigger (#230)")
Working branch: `feature/gus-dish-journey-osm-cards` (isolated worktree, off `origin/main`)

---

## 1. What the pack contains

Three archives arrived:

| Archive | Contents | Status |
| --- | --- | --- |
| `Archive.zip` | 21 design reference JPGs (Bibimbap / moussaka / hot pot / beyaynetu / pidan, desktop + mobile) | Extracted, reviewed |
| `reference.zip` (15 MB) | `gustale-dish-fieldguide` (complete static prototype: `dist/`, `docs/`, fonts, SVG maps), `gustale-dish-design-reference` (prototype + 2 reference JPGs), `sourcing-ci-review` (unrelated CI/migration tree) | Extracted, reviewed |
| `HERMES-GUSTALE-DISH-REDESIGN.md` + `GUSTALE-HERMES-IMPLEMENTATION-STRATEGY.md` | Two strategy documents (text, inlined by Telegram) | Read |

## 2. Corrections to the pack's premises

These are verified against the current repository and the live sites, not accepted on the pack's word.

### 2.1 The domain in the request is not the canonical Recipes host

The request names `https://recipes.gustale.com`. Verified live:

| Host | Resolves | Serves | Declared canonical |
| --- | --- | --- | --- |
| `gustale.com` | yes | Atlas | `https://gustale.com/` |
| `recipes.gustale.com` | yes (DNS alias → `62.72.7.218`) | Recipes | **`https://gustale.recipes/`** |
| `gustale.recipes` | yes | Recipes | `https://gustale.recipes/` |

`infra/prod/Caddyfile` routes exactly three host blocks: `gustale.com` + `www.gustale.com`,
`api.gustale.com` + `api.gustale.recipes`, and `gustale.recipes` + `www.gustale.recipes`.
`recipes.gustale.com` is **not** a Caddy host — it falls through to the default block, which
is why it serves Recipes content while advertising a `gustale.recipes` canonical.

The entire codebase treats `gustale.recipes` as canonical (`apps/web/src/lib/domain.ts`
`RECIPES_ORIGIN`, `apps/api/src/auth.ts` trusted origins, `apps/web/scripts/validate-build.mjs`,
`apps/web/scripts/search-nav-helpers.mjs`, the footer's "Recipes" link).

**Decision:** implement against the real canonical `gustale.recipes`. `recipes.gustale.com`
is a working alias; it is not the target and this work does not change hosting or DNS.

### 2.2 `references/gustale-osm-lineage-reference.png` does not exist

The brief names this file as the source of the OSM basemap style and the visible lineage
placement. It is not in either archive. The two files in `gustale-dish-design-reference/reference/`
are `bibimbap-desktop.jpg` and `moussaka-desktop.jpg` — both are **hero sections, not maps**
(confirmed by inspection: no basemap, no markers, no attribution, no lineage block).

**Consequence:** the specific map style the brief says to copy is not available. The style is
therefore derived from (a) the 21 reference JPGs, whose maps are demonstrably simplified SVG
outlines, and (b) the site's own existing CARTO vector basemap, restyled toward the reference
palette. This is a genuine evidence gap, recorded below.

### 2.3 The pack's audit of the live API is accurate

Re-verified against the live API today (not the pack's snapshot):

| Slug | HTTP | beats | lineages |
| --- | --- | --- | --- |
| `chicken-tikka-masala` | 200 | 3 | `curry-spiced-stew` |
| `bibimbap` | 200 | **0** | `rice-pilaf` |
| `moussaka-greek` | 200 | **0** | `stuffed-leaves` |
| `chongqing-hot-pot` | 200 | **0** | `[]` |
| `century-egg-tofu` | 404 | — | — |
| `beyaynetu` | 404 | — | — |

The pack's `live-journey-audit-2026-11-12.json` matches exactly. Its own caution is correct:
a 404 under one slug does not establish absence under every alias, so no canonical-name claim
is made from it.

### 2.4 The pack's integration audit points at blobs, and the code has moved on

`production-integration-audit.md` gives **blob SHAs**, not a commit — its own first line says
so. Two named files no longer exist at those paths:

- `apps/web/src/components/DishLocalePage.astro` → now `apps/web/src/components/DishLocalePage.astro` exists but the
  brief's path (`src/pages/`) does not; the component lives in `components/`.
- `packages/db/drizzle/0008_dish_journey_beats.sql` exists (verified), but the **drizzle journal is out of
  sync** with the hand-written migrations (the repo's own comment says so).

All named integration points were re-verified in the current tree: `DishJourney.tsx`,
`DishDetail.tsx`, `dishes.ts`, `api.ts`, `[slug].astro`, `DishLocalePage.astro` — all present.

### 2.5 The current platform is richer than the pack assumes

The pack says the brief "does not prescribe a new endpoint or relationship type". Verified —
the model is **already typed and richer**:

- `dish_lineages.role` ∈ 14 values (`ancestor`, `descendant`, `cousin`, `regional_variant`,
  `adaptation`, `fusion`, `diaspora_adaptation`, `trade_route_spread`, `colonial_spread`,
  `technique_relative`, `ingredient_relative`, `possible_influence`, `parallel_evolution`,
  `uncertain`) — so "a link alone never upgrades confidence" is already representable.
- `dish_lineages` also carries `explanation`, `changed_elements` (12-element vocabulary),
  `confidence_level` (6 values), `sort_order`.
- `lineages` carries `short_description`, `long_description`, `concept_summary`,
  `origin_summary`, `origin_regions`, `related_regions`, `historical_forces`, `techniques`,
  `base_ingredients`, `representative_dishes`, `confidence_level`, `uncertainty_note`,
  `cultural_practice_note`, `route_hints`, `source_notes`.

**Decision:** no new lineage relationship type and no new lineage table are needed. The Lineage
section is a presentation layer over existing canonical data, exactly as the brief demands.

### 2.6 The current Journey component has the three defects the pack names — confirmed

- `DishJourney.tsx`: `if (!beats.length) return null;` → **no empty state** (Bibimbap currently
  renders nothing at all — verified in the live browser snapshot).
- The map draws **one LineString through all points**, unconditionally — no evidence check.
- The lineage line is one `<p>` with `lineages[0]` only → **no Lineage section**, no heading,
  no member dishes, no role, no anchor.

Also confirmed in the live page: no sticky section nav, no visible ingredient cards, and the
journey fetch failure is swallowed to `[]` in both `[slug].astro` and `DishLocalePage.astro`.

### 2.7 The map infrastructure already exists and is suitable

`apps/web/src/lib/basemap.ts` documents that CARTO retired keyless *raster* basemaps on
2026-09-25 and that **CARTO vector GL styles still load without a key**; the site already uses
`CARTO_VECTOR_STYLE_URL` (`voyager-gl-style`) for `<WorldMap>`, `<DishMap>`, `<DishJourney>`
and the homepage island. OSM is the underlying OSM-derived data source, so an OSM-based
presentation needs **no new provider, no new account, and no new library** — only restyling
the existing CARTO layers toward the reference palette. This satisfies the brief's "do not add a
competing mapping library or new account/provider unless the existing setup cannot meet the
requirement".

### 2.8 The pack's prototype data is richer than the current API — the required additive extension

The prototype's journey records carry fields the current `dish_journey_beats` table cannot
hold: `title`, `dateLabel`, `kind` (evidence type), `locator`, `authors`, `scope`, `context`,
`bounds`, `regions`, `movement`, plus a per-record `origin`/`region`/`precision`/`explanation`
structure.

The current table has: `id, dish_id, sequence, place_name, lat, lng, year_approx, label,
confidence, source_id` and the confidence CHECK is
`('documented','likely','possible','parallel')`.

**Decision (the one additive extension):** extend `dish_journey_beats` with nullable columns
for the editorial fields the brief explicitly requires and the prototype demonstrates —
`title`, `date_label`, `evidence_kind`, `locator`, `authors`, `scope_note`, `place_role`,
`precision` — plus a separate `dish_journey_movements` table for **source-supported**
transmission edges (each with its own claim + source), because "chapter order and proximity
cannot create one" and "each transmission edge needs its own claim and supporting historical
source".

No new endpoint family is needed for the journey itself, but the journey payload must
distinguish **empty** (research gap) from **unavailable** (fetch failure), which the current
API cannot express.

### 2.9 The confidence enum stays as it is

The brief: "Do not mutate the existing confidence enum (`documented`, `likely`, `possible`,
`parallel`) just to change badge wording." Verified the CHECK constraint and the TS union agree.
Evidence type is carried by the **new** `evidence_kind` column instead, so wording can be
editorial without touching the enum.

---

## 3. What is valid, already implemented, or needs work

| Area | Status | Action |
| --- | --- | --- |
| Journey component, beats model, confidence enum, optional source | **Implemented** | Adapt, don't replace |
| Journey API endpoint, ordered beats, source join, lineage join | **Implemented** | Extend payload |
| Lineage data model (typed role, explanation, changed elements, confidence, descriptions) | **Implemented and richer than assumed** | Use as-is |
| Lineage presentation on the dish page | **Missing** | New section |
| Separate per-chapter map cards | **Missing** (one combined path map) | New component |
| Visible ingredient cards | **Missing** (explorer only) | New presentation |
| Sticky section navigation | **Missing** | New component |
| Journey empty/unavailable states | **Missing** (returns null) | New states |
| Evidence-aware map connections | **Missing** (unconditional line) | Fix |
| Editorial date precision (ranges, circa, BCE/CE, unknown) | **Partial** (`year_approx` integer only) | Additive fields |
| Per-chapter source attribution with locator + inspection status | **Partial** (title/url/year/reliability only) | Additive fields |
| Pilot fixture data for Bibimbap + moussaka | **Not in the repo** | Fixture file, off by default |
| Five-case review coverage (hot pot + two research gaps) | **Not in the repo** | Fixture file |
| Country/styles sourced section | **Missing** | Only with sourced evidence; Bibimbap pilot |
| Recipes site redesign | **Explicitly out of scope** | Not touched |

---

## 4. Corrected implementation approach

**Principle:** the reference is a *composition and editorial-contract* reference. The
implementation is the real Gustale application — its components, tokens, MapLibre basemap,
canonical data and build pipeline — carrying the reference's composition and rigour.

1. **Additive schema extension** (migration, nullable columns + one new table for
   source-supported movement edges). The existing enum, existing columns and existing
   confidence CHECK are untouched. No live migration is run.
2. **Journey payload** distinguishes `status: "history" | "gap" | "unavailable"`.
3. **`DishJourney` rebuilt** as: chapter list + **one map per chapter** (separate, comparable,
   3 / 2 / 1-with-rail responsive) + per-chapter source and inspection-limits disclosure +
   movement edges drawn only when a source supports them.
4. **New `DishLineageSection`** directly below Journey: real lineage name, description, role,
   confidence, explanation, changed elements, related published dishes (canonical links).
   No ancestor/descendant arrows unless the recorded role is directional.
5. **New `DishIngredientOverview`** — visible ingredient cards near the introduction, each
   opening the existing detailed explorer. Same data source, no duplicate content model.
6. **New `DishSectionNav`** — sticky, Journey first, every anchor reaching real content.
7. **Pilot fixtures** in a clearly separated module, gated by an off-by-default flag, so no
   demonstration data can reach a public build.
8. **Focused tests** for: pilot isolation and domain isolation, the four journey states,
   date semantics, unsupported movement edges, lineage without a lineage, and canonical links.

**Scope discipline:** no merge, no deploy, no DNS/hosting change, no live migration, no
published editorial data, no approval labels, no `gustale.recipes` redesign.

---

## 5. Evidence gaps carried into the report (not invented)

1. **No OSM/lineage style reference exists.** The named PNG is absent from both archives. The
   map style is derived from the reference JPGs' palette and the site's existing CARTO
   basemap. Recorded as an unresolved evidence gap, not silently substituted.
2. **Reference maps are simplified SVG outlines with no attribution, no scale, and no
   markers** in several cards — while the brief demands OSM attribution and a scale bar.
   The implementation therefore uses the real OSM-derived CARTO basemap with attribution and
   scale, which is a *deliberate improvement* over the reference, not a copy of it.
3. **The pilot's historical records were not independently re-verified against their primary
   sources in this pass.** The pack's `journey-content-notes.md` states precisely which
   originals were inspected and which were reported through another author. That provenance is
   carried into the fixtures verbatim and exposed in the UI — no claim is upgraded, and no
   unverified record is presented as inspected.
4. **`century-egg-tofu` and `beyaynetu` return 404** live; the prototypes' canonical slugs are
   unresolved. These are review fixtures only, never published routes.
5. **`chongqing-hot-pot` has zero beats and zero lineages** live — the hot-pot fixture cannot
   be validated against live data until editorial records exist.

---

## 6. GitHub identity constraint

`consciousclarity/gustale-bot` has **no `workflows` scope** and the PAT is revoked, so this
work cannot push a branch to the remote. Per the established procedure, the branch is produced
and the push is performed with the App helper where permitted; otherwise the work is delivered
as a local branch plus a reviewable patch, and the owner applies the push. The draft PR is
prepared but **not** opened on the owner's behalf without an explicit instruction, and no
`approved-live` label is applied by the agent.
