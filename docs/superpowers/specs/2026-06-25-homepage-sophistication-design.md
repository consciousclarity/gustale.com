# Homepage Sophistication Pass — Design

**Date:** 2026-06-25
**Branch:** `feat/site-sophistication-pass`
**Status:** Approved (Approach A)

## Goal

Polish the `gustale.com` / `gustale.recipes` landing page to match the blueprint
editorial mockups (`blueprint/New page options/`): an oversized Instrument-Serif
hero, a rotating featured-dish card, algorithmic "most-connected" featured rails,
a schema-stats band, a Contribute nav CTA, and a refined footer — while keeping
the existing 4-mode Explore workspace (atlas / index / gallery / feed).

This is a **polish pass**, not a rebuild. The interactive workspace is a strong,
working differentiator and stays.

## Architecture — Approach A (SSR-first split)

Today `index.astro` mounts one 462-line `client:only` island
(`GustaleHomeIsland.tsx`) that fetches everything client-side. The hero and stats
are therefore invisible to crawlers and slow to first paint.

Approach A splits responsibilities, reusing the SSR-first + fallback pattern that
`families.astro` and `lineages.astro` already use:

- **`index.astro` (server-rendered)** owns the editorial sections: hero shell,
  featured rails, schema-stats band, CTA band. Data is fetched at build time with
  the same try/catch-with-fallback as `families.astro` (if the API is unreachable
  during build, the page still renders and islands take over).
- **`HeroFeaturedCard.tsx` (small island)** — the rotating featured-dish card in
  the hero's right panel. Auto-rotates ~6s through the featured set passed as a
  prop. `client:load`.
- **`HomeWorkspace.tsx` (island)** — the interactive Explore section (search +
  atlas/index/gallery/feed + live map). This is the existing
  `GustaleHomeIsland.tsx` workspace logic extracted from the hero/CTA chrome.
  `client:only="react"` (it touches MapLibre/`window`).

Boundaries:
- `index.astro` — what: assembles the page + build-time data. Depends on: api lib.
- `HeroFeaturedCard` — what: rotates a featured-dish card. Depends on: featured
  data prop only (no fetch).
- `HomeWorkspace` — what: live, filterable multi-view dish explorer. Depends on:
  `listDishes`, `/api/dishes/map`.

## New backend endpoint

`GET /api/dishes/featured?limit=8`

Returns the top dishes by curated-relation count, for the hero card and the
most-connected rail. One request instead of N per-slug `/relations` calls.

- Query: `SELECT from_dish_id, COUNT(*) FROM dish_relations GROUP BY from_dish_id`
  joined to `dishes` (published only) + origin geo + primary cuisine category +
  optional cover media (`media_attachments.role = 'cover'`), ordered by count desc,
  limited to `?limit` (default 8, cap 24).
- Response item: `{ slug, canonicalName, shortDescription, originName, originIso,
  cuisineSlug, cuisineName, relationCount, coverMediaId | null }`.
- Anonymous-readable. Drafts/archived excluded on both ends of the edge (same rule
  as the existing `/relations` route).
- `coverMediaId` is nullable; the client fetches a signed URL on hydration only if
  present (seed data largely has no images yet, so the card falls back to a
  stylized panel).

## Sections

### 1. Nav (`Layout.astro`)
- Add a terracotta **Contribute** button (`--accent` bg, `--accent-ink` text) →
  `/dishes/new`, right-aligned next to `AuthMenu`.
- Keep real link labels: Dishes / Families / Lineages / Map (geo only) / About.
  **Not** the mockup's "Regions / Data" — those pages don't exist.
- Refine spacing/typography to the mockup.

### 2. Hero (`index.astro` + `HeroFeaturedCard.tsx`)
- Kicker: `A LIVING ATLAS OF WORLD FOOD` (mono, tracked).
- Oversized Instrument-Serif H1: "Every dish has a place." with the final word in
  `--accent`, matching the mockup scale.
- Lede paragraph (existing copy refined).
- Search input that routes into the workspace below. Mechanism: the hero search is
  a small `client:load` control that writes the query to `location.hash`
  (`#explore=<query>`) and smooth-scrolls to the workspace anchor. `HomeWorkspace`
  reads the initial hash on mount and listens for `hashchange`, seeding its search
  state. This keeps the two islands decoupled (no shared store) — the URL is the
  single channel.
- Hero meta row: real counts (dishes / families / origins).
- Right panel: `HeroFeaturedCard` — cover image when `coverMediaId` present (signed
  URL on hydration), else a refined stylized panel; shows name, origin, 1-line
  story; auto-rotates ~6s; whole card links to the dish. Respects
  `prefers-reduced-motion` (no auto-rotate; manual dots).

### 3. Featured rails (`index.astro`)
- **Most-connected dishes** — from `/api/dishes/featured`, horizontal card rail,
  each card: name, origin, relation count ("N links"), 1-line story.
- **Richest families & lineages** — derived at build from the dish set by
  `methodSlug` group size (reuse the grouping + `FAMILY_LABELS` logic already in
  `families.astro`). Links to `/families` and `/lineages`.

### 4. Schema-stats band (`index.astro`)
Blueprint "Browse the schema" grid: big-serif counts with terracotta square
bullets. Derived at build:
- Dishes = list total
- Ingredients = ingredients list count
- Origins = distinct `originName` over the dish set
- Families = distinct `methodSlug` over the dish set

Each tile: number (serif), label, one-line descriptor. No fabricated metrics — only
counts we can actually derive. If a count is unavailable at build, omit that tile
rather than show a placeholder.

### 5. Explore workspace (`HomeWorkspace.tsx`)
Keep the 4-mode workspace (atlas / index / gallery / feed). Polish toolbar and card
styling against the design tokens. No behavioral change.

### 6. CTA + footer
- Refine the existing "Know a dish we don't?" band.
- Restructure the footer (`Layout.astro`) into columns (Browse / About / Contribute)
  in the editorial style; add the Lineages link.

## Error handling
- Build-time API failure → `index.astro` renders with empty featured/stats and a
  graceful fallback (same pattern as `families.astro`), islands take over live.
- `/api/dishes/featured` failure on the client → hero card and rail hide quietly;
  no error chrome on the landing page.
- Featured card with no cover image → stylized panel fallback (not a broken image).
- `prefers-reduced-motion` → no auto-rotation.

## Testing
- API: a `dishes-featured` test (vitest) — returns dishes ordered by relation count,
  excludes drafts, respects `limit` cap.
- Web: `astro check` (Astro's typecheck) clean; both `build:recipes` and `build:geo`
  complete; post-build dish-count floor still satisfied.
- Manual: hero renders server-side (view-source shows the H1), card rotates,
  reduced-motion disables rotation, rails populate, stats counts match reality.

## Out of scope
- Uploading/seeding real dish images (card simply uses the fallback until images
  exist).
- Redesigning `DishDetail.tsx` (tracked separately as the remaining Wikipedia-style
  page).
- The mockup's "Regions" and "Data" nav destinations (no such pages).

## Design tokens (reference)
`--bg #F6F1E7` · `--card #FBF8F1` · `--ink #211C16` · `--sub #6B6052` ·
`--accent #B8552F` · `--accent-ink #FBEFE6` · `--accent-soft` ·
`--display 'Instrument Serif'` · `--mono 'IBM Plex Mono'`.
