# Gustale — Shared State

> **Read this first.** This file is the source of truth for project state,
> decisions, and blockers across all AI assistants working on this repo.
> Both Hermes Agent (Telegram) and Claude Code (terminal) write to it.

## Last updated

2026-06-29 by Hermes Agent (Telegram) — PR #19 production migration applied (Phase 2A `food_geography` schema deployed to `gustale` database on the VPS); PR #23 limit-fix verified; Phase 7 password rotation deferred to a separate authorized operation.

2026-06-28 by Claude Code — **PR #15 (entity Lineages domain) landed + deployed; `/api/lineages` 500 fixed; migration `0006` applied + 14 lineages seeded to prod. Main green at `ae1fc29`.**

---

## ✅ Completed this session

### 2026-06-29 — PR #19: food_geography Phase 2A migration deployed

Phase 2A `food_geography` schema deployed to `gustale` database on the VPS via PR #19.

- **Migration file** (Phase 1, staged on VPS): `/home/deploy/gustale.com/migrations/0005_food_geography_phase_2a.sql` (197 lines, 8265 bytes, sha256 `5157d40ed9c50703858b183dab645e2f835a48b66856a267842a3e51812588d2`).
- **Backup** (Phase 3, custom-format `pg_dump`): `/home/deploy/gustale.com/backups/gustale_pre_phase2a_20260629T103158Z.dump` (372,675 bytes, sha256 `a3d80744162f6c07ecea5305dbd918f177729e32d5c474ff9f0381b7daeabfac`, 1023 TOC entries verified via `pg_restore --list`; Postgres 16.4 Debian, format=CUSTOM, compression=gzip).
- **Preflight** (Phase 2, pipe-safe): connection test `gustale|gustale`; target-table existence returned 0 rows; baseline `dishes (total) = 61`, `dishes (published) = 60` (saved to `/tmp/migration-audit/baseline-dishes.txt` on VPS).
- **Apply** (Phase 4): exit 0; 26 DDL statements (6 CREATE TABLE + 9 CREATE INDEX + 11 ALTER TABLE); no errors, no warnings.
- **Verification** (Phase 5): all six target tables exist (`to_regclass() = t`); row counts all 0; 11 FK constraints (10 CASCADE + 1 SET NULL on `food_regions.parent_region_id` self-reference for hierarchical regions); 17 indexes (4 PK indexes + 2 unique-constraint indexes + 11 declared non-PK / non-unique indexes); `dishes (total) = 61`, `dishes (published) = 60` — exact match to pre-apply baseline, no regression; homepage HTTP 200 with 60 dishes rendered post-hydration (hero meta `60 dishes / 18 families / 32 origins`, breadcrumb `60 dishes`, Index view `60 of 60 dishes`, filter footer `Showing 60 dishes`); `/api/dishes?limit=100` HTTP 200 with 60 dishes; `/api/dishes/map?limit=2000` HTTP 200 with 60 dishes.
- The migration is purely additive (CREATE TABLE/INDEX/ALTER TABLE only; no INSERT/UPDATE/DELETE).
- All DB operations used the v5 pipe-safe canonical form (URL pipe from `docker exec gustale-api printenv DATABASE_URL` → `docker exec -i shared-postgres bash -lc 'IFS= read -r DATABASE_URL; export DATABASE_URL; …'`). No `docker inspect ... {{range .Config.Env}}`, no `-e DATABASE_URL=`, no URL stored in any host shell variable, file, or env, no URL printed/echoed/length-measured.
- **v5 runbook artifact**: `/tmp/runbook-pipesafe-v5.md` (609 lines, 26746 bytes, sha256 `24a99afbd93b60940cf8695cc439046714d5ad7904873f572a1fa771090cd088`) is the source-of-truth for any re-execution. Migration staging scripts under `/tmp/migration-audit/` on the VPS (ephemeral, in `/tmp`).
- Phase 6 (rollback) NOT executed; Phase 7 (password rotation) NOT executed — see "Pending User Asks" below. No `.env` edits, no container restarts, no `pnpm db:migrate`, no `drizzle-kit generate`, no rollback, no password rotation in this round.

### 2026-06-28 — PR #23: homepage dishes request within API limit

`apps/web/src/components/design/GustaleHomeIsland.tsx` line 635 changed from `listDishes({ limit: 200 })` to `listDishes({ limit: 100 })` to respect the API's `limit` Zod cap (`apps/api/src/routes/dishes.ts:41`, `z.coerce.number().int().min(1).max(100).default(20)`). PR #22 had shipped `limit: 200` per its reconcile work; that conflicted with the API contract and resulted in `/api/dishes?limit=200` returning HTTP 400 (VPS Fastify log: `ZodError too_big maximum: 100 path: ["limit"]` at `file:///app/dist/routes/dishes.js:58:40`). Fix: align web to the API contract. Result: 60 dishes rendered post-hydration, all filters visible, no console errors.

**PR #21 status**: remains open (head `cdb1553`, base `9f099fd`, `mergeable: false` — branch/base divergence with `origin/main`) and is functionally superseded by PRs #22 + #23; closing PR #21 requires a separate authorization since it cannot be merged cleanly without conflict resolution.

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

- **Phase 7 — DB password rotation (deferred, separate operation).** The
  production `gustale` role `DATABASE_URL` was exposed in chat transcript
  earlier in this session (during initial reconnaissance, before the
  migration work began). The password value is treated as compromised.
  Rotation is **not** part of the PR #19 migration closeout and was not
  performed in this round. When scheduled, the operation is: (1)
  generate a new password; (2) `ALTER ROLE gustale WITH PASSWORD '<new>'`
  as `postgres` superuser via the shared-postgres container (note:
  superuser password lives in `/root/.env` on the VPS, which is out of
  our normal SSH access scope); (3) update
  `/home/deploy/gustale.com/.env` and
  `/home/deploy/gustale.com/.db-password` on the VPS; (4) recreate
  `gustale-api` container (`docker stop && docker rm` then
  `docker compose up -d --force-recreate api`) — `docker restart` does
  NOT re-read `.env`; (5) re-run Phase 5.5 smoke (homepage 200,
  `/api/dishes?limit=100` 200, `/api/dishes/map?limit=2000` 200); (6)
  audit-log the rotation timestamp.
- **Sophisticated menu**: `AuthMenu.tsx` deployed; `GustaleMenu.tsx` is design reference not implemented
- **Breadcrumbs everywhere**: `Breadcrumbs.astro` exists, used on some pages; full audit needed
- **Structured dish filters on home island**: Implemented (8 filter keys)

---

## 2026-06-28 — Graphify + Layout handoff

Graphify was run for `/Users/ghostx/DEV/gustale/repo_clone`.
Output path:
`/Users/ghostx/DEV/gustale/repo_clone/graphify-out/`
Generated files:
- `graph.html`
- `GRAPH_REPORT.md`
- `graph.json`
`repo_clone/CLAUDE.md` was updated with the Graphify output path.

Trace completed:
- `../layouts/Layout.astro` bridges 7 communities because it is the shared HTML shell.
- All 19 Graphify edges to `Layout.astro` are real extracted import dependencies, not artifacts.
- `Layout.astro` is healthy and should not be refactored.
- Do not split `Layout.astro`.
- Do not split `SiteHeader.astro`.
- Do not fix Graphify warnings yet.

Pending Hermes task:
Move MapLibre CSS so it loads only on `/map`.
Required change:
- Remove MapLibre CDN import from `apps/web/src/styles/global.css`
- Add `import 'maplibre-gl/dist/maplibre-gl.css';` to `apps/web/src/pages/map.astro`

Validation for Hermes:
- run repo typecheck/build commands
- confirm `/map` still builds
- confirm non-map pages no longer import MapLibre CSS globally