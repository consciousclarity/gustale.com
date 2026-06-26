# Gustale — Shared State

> **Read this first.** This file is the source of truth for project state,
> decisions, and blockers across all AI assistants working on this repo.
> Both Hermes Agent (Telegram) and Claude Code (terminal) write to it.

## Last updated

2026-06-26 by Claude Code — **/families and /lineages fully verified. 18 families, 14 lineages. CI passing.**

---

## ✅ Completed this session

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

Main branch SHA: `01cd64c`

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
