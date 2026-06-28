# Gustale — Shared State

> **Read this first.** This file is the source of truth for project state,
> decisions, and blockers across all AI assistants working on this repo.
> Both Hermes Agent (Telegram) and Claude Code (terminal) write to it.

## Last updated

2026-06-28 by Claude Code — **PR #15 (entity Lineages domain) landed + deployed; `/api/lineages` 500 fixed; migration `0006` applied + 14 lineages seeded to prod. Main green at `ae1fc29`.**

---

## ✅ Completed this session

### 2026-06-28 — PR #15: entity Lineages domain (NEW — distinct from method-lineages)

Shipped a **third** taxonomy axis: first-class **lineage entities** (`lineages` + `dish_lineages` tables, migration `0006_lineages`), `/lineages` index + `/lineages/[slug]` detail, and the `/api/lineages` route. 14 entities: filled-dough, stuffed-pasta, stuffed-leaves, flatbread, rice-pilaf, noodle-soup, skewered-grilled-meat, curry-spiced-stew, fermented-bean, fried-dough-pastry, preserved-fish, chili-condiment, wrapped-leaf, fermented-batter. **This is NOT the method-lineage axis** (`dish_preparations`/`methodSlug`, documented below) — both coexist.

- **Merged:** PR #15 squash `b7ec20d`; `/api/lineages` 500 fix [PR #17] `ae1fc29`. **Main green at `ae1fc29`.**
- **Prod DB:** migration `0006_lineages` applied manually; 14 lineages + 33 dish-lineage edges seeded (targeted seed, no other tables touched). `/api/lineages` → 200, `totalLineages: 14`.
- **`/api/lineages` 500 bug (fixed):** the `counts` subquery in `apps/api/src/routes/lineages.ts` selected raw `sql\`\`` `dishCount`/`relationCount` without `.as()` → drizzle threw. CI missed it (web build uses the JS mock-api; vitest doesn't hit the query).
- **⚠️ mock-api-data.json SHAPE HAZARD:** the blob MUST stay `{ generatedFrom, list, map, details }` (~228 KB). A raw `/api/dishes` dump `{ dishes, limit, offset }` (~32 KB) makes `mock-api.mjs` serve 0 dishes → CI red. `alex` (geekom) pushed that wrong shape to main **3×** (`502dcf2`, `3b6b32f`, `f0f5da2`) via an automated *"refresh SSG mock data from live API"* — each was reverted/restored. **Do not run that refresh against main.**
- **Migration deploy note:** CI deploy does NOT run migrations, and the documented `/srv/gustale` path is **stale** (deploy dir is `/home/deploy/gustale.com`, image-only). Apply via `docker exec -u postgres shared-postgres psql` + insert the drizzle `__drizzle_migrations` tracking row (resync the `__drizzle_migrations_id_seq` sequence first — it was behind `max(id)`).

### Mock API architecture (the SSG stale-data solution)

The root problem: Astro SSG builds fetch from the **live deployed API** at build time.
GitHub Actions runner IPs are blocked by the VPS firewall, so CI cannot reach `api.gustale.recipes`.

**Solution**: `apps/web/scripts/mock-api.mjs` + `apps/web/scripts/mock-api-data.json`.
- During CI Docker build, `mock-api.mjs` serves `mock-api-data.json` on port 8742 as a local HTTP server
- `PUBLIC_API_BASE=http://127.0.0.1:8742` overrides the production API URL for the build only
- CI is fully self-contained; no upstream API dependency
- After any DB/seed changes: regenerate `mock-api-data.json`, commit, push → CI rebuilds

**Files**:
- `apps/web/scripts/mock-api.mjs` — HTTP server (GET /health, /api/dishes, /api/dishes/map, /api/dishes/:slug)
- `apps/web/scripts/mock-api-data.json` — committed snapshot: `{ list: 60, map: 60, details: 60 }`

### /families — verified fixed (18 families)

- 18 real family filter options: appetizer, bread, curry, dessert, dumpling, kebab, main-course, moussaka, noodle-soup, pancake, pasta, rice-dish, salad, sandwich, sauce, soup, stew, stir-fry
- Plus "all" → 19 total filter chips
- Uses `familySlug` from primary `kind='dish-type'` category (dish-type taxonomy)

### /lineages — verified fixed (14 lineages)

- 14 real lineage filter options: boiled-and-cured, bread, curry, dessert, dumpling, fried-and-topped, fried-rice, kebab, noodle-soup, pasta, poached-in-sauce, salad, steamed-and-custard, stew
- Plus "all" → 15 total legend chips
- Uses `methodSlug` from `dish_preparations → preparation_methods` (cooking method taxonomy)
- **Bug fixed**: `legendMarkup` template literal in `lineages.astro` emitted literal `${slug}` instead of interpolated values. Fixed by switching to explicit string concatenation.

### API — two critical bugs (previously fixed)

1. **`row.updated_at.toISOString()` TypeError** (`d6eb1db`, CI #131)
2. **`column dp.sequence does not exist`** (`3c49ac3`, CI #133)

---

## Current CI status

| Commit | Message | CI |
|--------|---------|-----|
| `01cd64c` | fix(lineages): interpolate legend chip data-lineage attributes | Passed (#140) |
| `b3b58f9` | fix(ci): drop firewall-blocked API health-check gate | Passed (#139) |
| `284d566` | fix(ci): mock API serves real 60-dish data | Passed (#138) |

Main branch SHA: `ae1fc29` (2026-06-28 — PR #15 lineages + #17 api fix; CI green, deployed)

---

## Two-Taxonomy Confusion — Critical Reference

**NEVER confuse these two taxonomies**:

| Page | Taxonomy | Source | Examples |
|------|----------|--------|----------|
| `/families` | `familySlug` / `familyName` | `dish_categories` WHERE `kind='dish-type'` | Soup, Pasta, Noodle soup, Stew |
| `/lineages` | `methodSlug` / `methodName` | `dish_preparations → preparation_methods` | Stew, Fried & topped, Fried rice |

---

## Pending Data-Cleanup Tasks

- [ ] 15 dishes still have `methodSlug=null` in mock data — list: Kimbap, Tacos al pastor, Croffle, Som tam, Poutine, Bánh mì, Pho bo, Khao soi, Biryani, Butter chicken, Pad thai, Feijoada, Tandoori chicken, Tteokbokki
- [ ] After seeding those 15: re-generate `mock-api-data.json` and push → CI rebuilds

---

## SHARED_STATE sync protocol

After any non-trivial change:
1. Commit to `main` → CI deploys automatically
2. Update `.hermes/SHARED_STATE.md` on `private/state` branch
3. `git add -f .hermes/ && git commit -m "claude: <summary>" && git push origin private/state`

---

## Pending User Asks

- **Sophisticated menu**: `AuthMenu.tsx` deployed; `GustaleMenu.tsx` is design reference not implemented
- **Breadcrumbs everywhere**: `Breadcrumbs.astro` exists, used on some pages; full audit needed
- **Structured dish filters on home island**: Implemented (8 filter keys)
