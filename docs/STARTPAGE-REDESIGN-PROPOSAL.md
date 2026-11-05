# Startpage redesign proposal — hierarchy for 1,474 dishes + drinks

**Date:** 2026-11-05 · **Status:** proposal for Alejandro's approval · **No implementation started**
**Ask:** "It's not convenient to have a large list of dishes at the Startpage it means endless scrolling I need a better solution, also take into account that it's not only dishes but also drinks"

Every number below is measured against **production** (gustale.com rendered DOM + live API) or the **live database** via the sanctioned read-only path (`GUSTALE_LIVE_DB_ALLOW=1 bash scripts/dbq.sh "<SELECT>"`). Nothing is estimated.

---

## 1. The problem, measured

| Fact | Value | Source |
|---|---|---|
| `.atl-item` elements rendered on `/` | **1,474** | production DOM |
| `.atl-region-h` group headings | **178** | production DOM |
| Document body height | **~87,825 px** | production DOM |
| Published dishes | 1,474 (1,475 total, 1 draft) | live DB |
| Distinct origins on published dishes | 179 | live DB |
| Dishes downloaded to render the Startpage | **1.11 MB** in 15 sequential requests | live API |
| `limit` accepted by `GET /api/dishes` | **max 100** (400 above that) | live API |

**Cause (source-confirmed):** `apps/web/src/components/design/GustaleHomeIsland.tsx` loads the *entire* published catalogue on hydration (`listAllDishes` → 15 × 100 paged requests) and then renders every dish four times over — `IndexView`, `GalleryView`, `FeedView` and the `AtlasView` sidebar each map the **full** filtered array (`sorted.map(...)`, `dishes.map(...)`, `dishes.map((d, i) => ...)`). The `AtlasView` sidebar groups all 1,474 by origin into 178 headings with no pagination, no virtualization and no progressive boundary.

This is not a "lower the limit" problem. Cutting `limit` would hide data, not structure it.

---

## 2. What is already wrong (and must be fixed for any redesign to work)

These are **confirmed production defects**, not hypotheses. A redesign built on top of them would be built on sand.

### 2.1 The public `family=` filter is completely broken — it returns 0 for every value

```
family=dumpling    → 0 dishes      family=drink      → 0 dishes
family=main-course → 0 dishes      family=appetizer  → 0 dishes
family=stew        → 0 dishes
```

Root cause (source-confirmed, `apps/api/src/routes/dishes.ts:189` and `:237`): the filter joins the **legacy** `categories` table with `c4.kind = 'family'`, but the response payload's `familySlug`/`familyName` come from the **current** dimension table `dish_families` (via `dish_dish_families`). Two different vocabularies under one parameter name.

Live DB proof of the split:

| Legacy `categories.kind='family'` | published dishes linked |
|---|---|
| `fried-rice` | **1** |

| Current `dish_families` (dimension) | published dishes |
|---|---|
| `dish` | 397 |
| `dessert` | 96 |
| `soup` | 70 |
| `food` | 55 |
| `rice-dish` | 45 |
| `pastry` | 38 |
| `confectionery` | 37 |
| `bread` | 30 |
| `stew` | 28 |
| `potato-dish` | 27 |
| `salad` | 27 |

The current dimension has **123 families in use**; the legacy table has essentially nothing. So the filter is pointing at an empty vocabulary while the UI advertises 123.

### 2.2 The list response cannot express "there is more"

`GET /api/dishes` returns `{ dishes, limit, offset }` — **no `total`, no `hasMore`, no `count`**. The client cannot know whether more pages exist, so any paginated UI would have to fetch until it falls short. `/api/dishes/map` does return `count`, so the pattern exists in the codebase.

### 2.3 The `/families` page covers only ~127 of 1,474 dishes

Rendered production `/families` shows **~22 groups / ~127 dishes** against a 1,474-dish catalogue. It cannot be promoted as the Startpage without being rebuilt first.

### 2.4 The map is a stub, and the hero says so

- **121** of 1,474 published dishes carry `origin_location` geometry (69 distinct points). The other **1,353 have no coordinates at all**.
- `geo_entities.centroid` is **NULL for all 3,892 rows** — the geographic backbone is empty.
- **All 2,713 `dish_place_associations` are `draft` / `unevidenced` / `unreviewed`**, so the published-association predicate returns **0 places**.
- Consequence: the homepage hero renders **"— places"** (an em dash) while claiming 1,474 dishes, 123 families, 82 connections. The map shows 121 dots and the fallback text *"Your browser does not support WebGL…"* appears on machines without WebGL.

### 2.5 The family filter dropdown offers the wrong 22 values

The homepage's "Filter by category" offers 22 values (Appetizer, Bread, Casserole, Colombian cuisine, Dumpling, …). These are legacy `categories` rows, not the 123 dimension families. The hero separately claims "123 food families" and the subheader claims "22 families" — **the same page states two different family counts.**

---

## 3. The drinks question — what the data actually supports

Drinks are a **first-class peer content type** in the product (this is stated product scope), but the data does not yet carry a content-type discriminator.

### 3.1 There is no `dish`/`drink` type field anywhere

`information_schema` on the `dishes` table returns **0 rows** for any column matching `%drink%`, `%beverage%`, `%kind%`, `%type%`, `%category%`. There is no `content_type` column, and `dish_categories`/`categories.kind` covers only **121 published dishes** (339 links) — a quarter of the catalogue.

### 3.2 What *does* exist, and it is a good foundation

| Evidence | Count | Notes |
|---|---|---|
| `dish_families` row with `slug='drink'` | **8** published dishes | Buttermilk koldskål, Cendol, Champurrado, Pelamushi, bir pletok, es doger, es goyobod, neera |
| Other drink families in controlled vocabulary | 9 values | Beverage, Drink, Tea, Coffee, Wine, Beer, Cocktail, Juice, Bubbletea — **0 published dishes** |
| Legacy `categories` "Drinks" course-group | 1 group + 5 families | Coffee traditions, Cold drinks & refreshers, Fermented drinks, Herbal & tonic drinks, Hot brews & spiced drinks, Tea traditions — **0 published dishes** |
| Published dishes whose *name* looks like a drink but are **not** tagged `Drink` | **0** | The name-based sweep found nothing untagged |

That last row matters: **every** published drink-like dish is already tagged. So the 8 `Drink`-family records are not an arbitrary slice — they are the honest current total of drinks.

### 3.3 The honest problem with a "Drinks" entry point today

A top-level **Drinks** tab showing 8 items against 1,466 dishes would look like a broken section, not a peer content type. And the richer drink families (Tea, Coffee, Wine, Beer, Cocktail, Juice) have **zero** published content, so a sub-taxonomy would be empty shelves.

**This is a content gap, not a UI gap.** The UI can model drinks as a peer type *now* (the data supports it — 8 tagged, cleanly, with no contradictions), but the catalogue needs drink content before the section carries weight. The two honest paths:

- **(a) Ship the peer-type model now, label it honestly.** "Drinks (8)" appears as a peer entry point; the count is truthful and it grows as content is added.
- **(b) Model the type, but gate the entry point on a threshold** (e.g. show it once ≥ 30 drinks exist) — avoids a thin first impression.

**Recommendation: (a).** The type is real and correctly tagged; the section states its own size rather than pretending to be a full taxonomy, and it becomes useful the moment content lands.

---

## 4. Proposed information architecture

The principle: **the Startpage must never render the catalogue.** It renders *entry points into* the catalogue; the catalogue itself is paginated.

### 4.1 Layout

```
┌─ Atlas at a glance ─────────────────────────────────────┐
│  1,474 dishes · 123 families · 179 origins · 8 drinks   │
│  (no more em-dash placeholders — omit the metric, don't  │
│   render a dash)                                         │
└──────────────────────────────────────────────────────────┘

┌─ Start here ────────────────────────────────────────────┐
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌─────────┐ │
│  │ 1,466    │  │ 8        │  │ 123      │  │ 179     │ │
│  │ Dishes   │  │ Drinks   │  │ Families │  │ Origins │ │
│  └──────────┘  └──────────┘  └──────────┘  └─────────┘ │
│   Browse by region, by family, by course, by technique   │
└──────────────────────────────────────────────────────────┘

┌─ Featured (curated, ~24 items) ─────────────────────────┐
│  12 dishes · 12 drinks, hand-picked, each a real card    │
└──────────────────────────────────────────────────────────┘

┌─ Explore by origin (region tiles, 24 shown + "all") ─────┐
│  China · Italy · Mexico · India · France · Greece · …    │
└──────────────────────────────────────────────────────────┘

┌─ Explore by family (24 shown + "all") ──────────────────┐
│  Dumpling · Soup · Stew · Rice dish · Pastry · …         │
└──────────────────────────────────────────────────────────┘
```

**No full list on the Startpage at all.** The catalogue lives behind the entry points.

### 4.2 The peer content-type contract

This is the piece that must be built first, because everything else depends on it.

**New canonical field on `dishes`:** `content_type text NOT NULL DEFAULT 'dish' CHECK (content_type IN ('dish','drink'))`.

- **Backfill:** the 8 `Drink`-family dishes → `'drink'`; the other 1,466 → `'dish'`. This is a pure backfill derived from existing tags, so it is verifiable: after backfill, `count(*) FILTER (WHERE content_type='drink')` must equal 8, and `content_type='drink'` must be a subset of `family='drink'` exactly.
- **API:** `GET /api/dishes?content_type=dish|drink`, and `content_type` included in every dish payload alongside `familySlug`.
- **Family filter repaired at the same time** (§2.1) — the filter must resolve against `dish_families` (the dimension that actually holds 123 families), and the homepage's "Filter by category" dropdown must be rebuilt from the same source so the "22 families" vs "123 families" contradiction disappears.

> **Note on the backfill:** a `CHECK` constraint plus a trigger keeping `content_type` in sync with the `drink` family tag would make the two impossible to drift. Recommend a trigger rather than a one-off backfill alone, so a future editor tagging a dish `Drink` gets `content_type='drink'` automatically.

### 4.3 Paginated catalogue (reusing what already works)

`apps/web/src/lib/browse.ts` already has the complete pagination toolkit — `pageOffset()`, `hasMorePages()`, `appendDishes()`, `sliceDishesToPage()`, `loadedPageFromCount()` — and `DishExplorer.tsx` already ships a working **"Load more dishes"** button (verified in production at `/dishes`: 24 cards + Load more). **The Startpage should reuse `DishExplorer`'s pattern rather than invent a second one.**

Required API additions:
- `total` and `hasMore` on the list response (the pattern already exists on `/api/dishes/map`).
- `content_type` filter + payload field.
- `family` filter re-pointed at `dish_families`.

### 4.4 Route/query state (pause–resume must be lossless)

Every entry point is a real URL, so a shared link reproduces exactly what the user saw:

```
/                       → Startpage (curated + entry points)
/browse?type=dish       → paginated catalogue, dishes
/browse?type=drink      → paginated catalogue, drinks
/browse?family=dumpling → filtered by family
/browse?origin=italy    → filtered by origin
/browse?q=...&page=3    → search results, page 3
```

`browse.ts` already models this (`parseBrowseState`, `buildBrowseQuery`, `mergeBrowseState`, `planHistoryRestore`, `recoveryLinks`, filter chips, Back-history trimming) — **it is already built for exactly this and is currently under-used.** The Startpage should hand off to it rather than reimplement.

---

## 5. Acceptance criteria

Each is objectively checkable against production after implementation.

| # | Criterion |
|---|---|
| AC1 | `/` renders **≤ 300 dish links** in the DOM (currently 1,474). |
| AC2 | `/` document height ≤ **~15,000 px** (currently ~87,825 px). |
| AC3 | The Startpage downloads **≤ 300 KB** on first load (currently 1.11 MB / 15 requests). |
| AC4 | `/` shows a **Dishes** and a **Drinks** peer entry point, and the Drinks count equals the live `content_type='drink'` count. |
| AC5 | `GET /api/dishes?family=dumpling` returns **> 0** dishes matching `dish_families.slug='dumpling'`. |
| AC6 | `GET /api/dishes?family=<slug>` returns the same count as the live dimension for that slug. |
| AC7 | The list response includes `total` and `hasMore`. |
| AC8 | The homepage states **one** family count, and it equals the live dimension count (123). |
| AC9 | The hero renders **no em-dash placeholder** for a metric that has no data; the metric is omitted instead. |
| AC10 | The catalogue route paginates: no single page renders more than 48 dishes. |
| AC11 | Every Startpage entry point is a shareable URL that reproduces the same view state. |
| AC12 | Back/Forward restores the previous page and filter state (existing `browse.ts` behaviour, now reachable). |

---

## 6. Suggested sequencing

| Tier | Work | Why first |
|---|---|---|
| **P0** | Fix the `family=` filter to resolve against `dish_families` (§2.1); add `total` + `hasMore` to the list response (§2.2); add `content_type` column + backfill + sync trigger (§4.2) | Every other layer is blocked on the data contract being truthful. Also independently fixes a live search bug. |
| **P0** | Rebuild the Startpage as entry points + curated features (§4.1) — no full list | This is the actual ask. |
| **P1** | Rebuild `/families` from the 123-family dimension so it covers the catalogue | Currently 127/1,474 — it is the obvious destination for the new entry points and it is not ready. |
| **P1** | Catalogue route on `DishExplorer`'s pagination pattern + `browse.ts` URL state (§4.3, §4.4) | Needed for "see all 1,466 dishes" and for shareable URLs. |
| **P2** | Geo work: populate `geo_entities.centroid` / `dishes.origin_location` (currently 121/1,474), then decide the association-publication strategy | The map cannot be a primary discovery surface until 1,353 more dishes have coordinates. Also unblocks the "places" hero metric. |
| **P2** | Drink content: publish content for Tea / Coffee / Wine / Beer / Cocktail / Juice families | 8 drinks is honest but thin; this is what makes the peer entry point carry weight. |
| **P3** | Unify `dish_categories` (121 dishes) into the dimension model | Two vocabularies is the root cause of §2.1; the legacy table should be retired once the dimension is authoritative. |

---

## 7. Open decisions for Alejandro

1. **Drinks entry point at 8 items** — ship it labelled honestly (recommended), or gate it behind a content threshold until the drink catalogue is larger?
2. **Curated "Featured" row** — 12 dishes + 12 drinks, hand-picked, on the Startpage. Or leave it out and make the Startpage purely entry points?
3. **Family filter target** — re-point `family=` at `dish_families` (123 families, recommended) or migrate the legacy `categories` data into the dimension first and then re-point?
4. **Drinks backfill trigger** — should `content_type` auto-follow a `drink` family tag (recommended), or stay an explicit editorial field?
5. **Map priority** — is the map in scope for this redesign, or should the Startpage treat geography as text/region browsing until the geo data is populated?

---

## 8. Evidence appendix — commands used

Read-only, no writes. All live-DB statements via the sanctioned path.

```bash
cd /home/gustale/projects/gustale.com
GUSTALE_LIVE_DB_ALLOW=1 bash scripts/dbq.sh "<SELECT>"
```

- Published dish counts, origin/family coverage, drinks tagging, legacy-vs-dimension family split: live DB SELECTs.
- `.atl-item` / `.atl-region-h` counts, body height, `/families` coverage: real-browser rendering of `https://gustale.com/`.
- `family=` filter returning 0 for every value; `limit` > 100 → HTTP 400; list response shape; 15-page / 1.11 MB full-catalogue pull: live API via `https://gustale.com/api/dishes`.
- `/api/dishes/map` → 121 dishes with coordinates; `/api/taxonomy/family/:slug` route shape: live API + source.
- Implementation shape: `GustaleHomeIsland.tsx`, `browse.ts`, `DishExplorer.tsx`, `apps/api/src/routes/dishes.ts`, `apps/api/src/routes/taxonomy-family.ts`, `packages/db/src/schema/index.ts`.
