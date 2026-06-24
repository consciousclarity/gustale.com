# Handoff — Gustale frontend sprint

**From:** Cowork session (Alex)
**Date:** 2026-06-24
**Branch:** `main` (merge in progress — see below)
**Repo:** `~/DEV/gustale/repo_clone`

---

## ⚠️ Immediate: finish the merge

A `git merge codex/gustale-nav-reference` is in progress on `main`. The four conflicted files have been resolved and written to disk, but `git add` + `git commit --no-edit` haven't been run yet. Finish it:

```bash
cd ~/DEV/gustale/repo_clone
git add apps/web/src/components/AuthMenu.tsx \
        apps/web/src/components/SiteHeader.astro \
        apps/web/src/layouts/Layout.astro \
        apps/web/src/styles/global.css \
        apps/web/src/pages/lineages.astro
git commit --no-edit
git push origin main
```

If there's still an `index.lock`: `rm ~/DEV/gustale/repo_clone/.git/index.lock` first.

---

## What was done this session

1. **`/lineages` page created** — `apps/web/src/pages/lineages.astro`
   Tailwind-styled, server-renders dishes grouped by `methodSlug`, with provenance narratives per lineage. Uses `<Layout>` (no separate `<SiteHeader />` call — Layout handles it).

2. **Nav updated** — `apps/web/src/components/SiteHeader.astro`
   Geo variant nav is now: **Atlas · Families · Lineages · About Gustale**

3. **`methodSlug` added to list API** — `apps/api/src/routes/dishes.ts` line ~101
   Added a correlated subquery so `GET /api/dishes` now returns `methodSlug` (primary prep method by `sequence_order`). Both `families.astro` and `lineages.astro` were broken without this — everything fell into 'other'.

4. **`d.regionSlug` removed from `lineages.astro`** — field doesn't exist on `DishSummary`. `regionsFor()` now returns `[]` as a stub.

5. **Merge conflicts resolved** in four files:
   - `global.css` → kept HEAD (MapLibre, Tailwind, navlink styles)
   - `AuthMenu.tsx` → kept HEAD (mobile variant, dropdown, `getInitials`)
   - `Layout.astro` → HEAD's full layout (description meta, footer) but `<SiteHeader />` without props (SiteHeader reads env vars itself)
   - `SiteHeader.astro` → codex version (reads env, 4-item geo nav) with standard Tailwind responsive classes

---

## Project structure summary

### Repo layout
```
apps/
  api/          Fastify + Drizzle ORM + PostGIS + better-auth
  web/          Astro 5 + React islands + Tailwind (via @tailwindcss/vite)
packages/
  db/           Drizzle schema + migrations
  ui/           Shared SearchInput component
design/         Cowork design blueprint HTML files (standalone bundled apps)
```

### Web pages (apps/web/src/pages/)
| Route | File | State |
|---|---|---|
| `/` | index.astro | ⚠️ Design mock — GustaleAtlasIsland/GustaleRecipesIsland, hardcoded data |
| `/map` | map.astro | ✅ Live — WorldMap, real API |
| `/families` | families.astro | ❌ WIP — uses `gustale-families-*` CSS classes that don't exist |
| `/lineages` | lineages.astro | ✅ Done this session |
| `/dishes` | dishes/index.astro | ⚠️ Bug — line 12 references `total` not in `DishListResponse` |
| `/dishes/[slug]` | dishes/[slug].astro | ✅ Live — SSG, DishDetail + DishMap |
| `/dishes/[slug]/edit` | edit.astro | ✅ Live |
| `/dishes/new` | new.astro | ✅ Live |
| `/ingredients/[slug]` | ingredients/[slug].astro | ✅ Live — SSG |
| `/about` | about.astro | ⚠️ Partial — gustale.recipes content only, no geo variant |
| `/login`, `/register`, `/account` | respective | ✅ Live |

### Design blueprints (design/)
| File | What it is | Implementation status |
|---|---|---|
| `Gustale Atlas (standalone).html` | World map experience | Partial — GustaleAtlasIsland.tsx has 30 hardcoded dishes |
| `Gustale Families (standalone).html` | Families (by form) page | families.astro exists, missing all CSS |
| `Gustale Egg Dishes (standalone).html` | Collection detail page | **Not implemented at all** |
| `Gustale Recipes (standalone).html` | Recipe detail (Shakshuka) | GustaleRecipesIsland.tsx exists, hardcoded data |
| `Gustale Homepage.html` | Font/CSS spec shell | n/a |
| `Gustale Homepage Options.html` | Direction sketches | n/a |

### Key design components (apps/web/src/components/design/)
Hand-ported from Cowork design bundles. Work as React islands but use hardcoded data:
- `GustaleAtlasIsland.tsx` (911 lines) — atlas map, 30 hardcoded dishes, 4 browse modes
- `GustaleRecipesIsland.tsx` (1009 lines) — Shakshuka recipe, 3 regional variants, hardcoded
- `GustaleAppIsland.tsx` (1049 lines) — app shell with nav, browse toolbar, placeholder sections
- `views.jsx` — IndexView, GalleryView, FeedView, AtlasView browse modes
- `scaffold.jsx` — Tweaks panel / design-time controls

---

## Priority backlog

### P1 — Fix `families.astro` styling
`apps/web/src/pages/families.astro` renders but uses `gustale-families-*` CSS classes that don't exist. Add Tailwind styling using `lineages.astro` as the pattern — cards grid, hero section, stat strip. Use `design/Gustale Families (standalone).html` as the visual reference.

The underlying data logic is correct and now works (methodSlug is returned by the list API).

### P2 — Collection detail page (Egg Dishes blueprint)
Create `apps/web/src/pages/families/[slug].astro` — an editorial page for one food family. Blueprint: `design/Gustale Egg Dishes (standalone).html`. Each family slug (e.g. `egg-dishes`, `dumplings`) gets a hero with provenance blurb + dishes filtered by `methodSlug` from the API + dish cards linking to `/dishes/[slug]`.

Update `families.astro` dish cards to link to `/families/[slug]` once this exists.

### P3 — Wire `GustaleAtlasIsland` to real API
`apps/web/src/components/design/GustaleAtlasIsland.tsx` has a hardcoded `ATLAS_DISHES` array (~line 20, 30 dishes). Replace with a `useEffect` fetch to `/api/dishes/map`. That endpoint returns `lat`, `lng`, `canonicalName`, `slug`, `originGeoId`.

### P4 — Fix `dishes/index.astro` TypeScript error
`apps/web/src/pages/dishes/index.astro` line 12: `total` is assigned but `DishListResponse` has no `total` field. Remove or replace with `initial.dishes.length`.

### P5 — Live search in SiteHeader
`apps/web/src/components/SiteHeader.astro` search popup shows static mock rows (the `searchRows` array in the frontmatter). Wire to `GET /api/dishes?q=<term>&limit=5` on input with ~200ms debounce. Extract into a `<SearchIsland client:load />` React component.

---

## API reference

```
GET  /api/dishes              list — returns id, slug, canonicalName, shortDescription,
                              originGeoId, status, viewCount, methodSlug (correlated subquery)
GET  /api/dishes/:slug        detail — full dish with preparations, ingredients, media
GET  /api/dishes/map          map pins — lat/lng/canonicalName/slug/originGeoId
POST /api/dishes              create (auth required, moderator+)
PATCH /api/dishes/:slug       update (auth required, moderator+)
POST /api/dishes/:slug/publish
DELETE /api/dishes/:slug
GET  /api/ingredients         list
GET  /api/ingredients/:slug   detail
GET  /health                  health check (NOT /api/health)
```

Auth: better-auth, session cookie on `api.gustale.com`. `AuthMenu.tsx` handles client-side hydration.

## Key env vars
- `PUBLIC_DOMAIN` — `'geo'` → gustale.com (Atlas), anything else → gustale.recipes
- `PUBLIC_API_BASE` — absolute API URL used at SSG build time
- `apps/api/.env` (gitignored): `DATABASE_URL`, `MINIO_*`, `SESSION_SECRET`, `BETTER_AUTH_SECRET`

## TypeScript / build notes
- Tailwind: `@tailwindcss/vite` Vite plugin — NO `tailwind.config.mjs`
- `apps/web/tsconfig.json` extends `astro/tsconfigs/strict` (cannot extend repo `tsconfig.base.json` — conflicting `moduleResolution: NodeNext vs Bundler`)
- `astro check` has 1 pre-existing error: `dishes/index.astro:12` `total` field (see P4)
- Typecheck scope: `pnpm -r typecheck` covers api + db only; web uses `astro check`

## CI/CD
GitHub Actions on push to `main`. Deploys both web and API containers.
