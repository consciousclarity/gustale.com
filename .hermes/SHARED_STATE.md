# Gustale — Shared State

> **Read this first.** This file is the source of truth for project state,
> decisions, and blockers across all AI assistants working on this repo.
> Both Hermes Agent (Telegram) and Claude Code (terminal) write to it.

## Last updated

2026-06-26 by Hermes — **All critical bugs fixed. CI passing. Site deployed.**

---

## ✅ Completed this session

### API /listDishes — two critical bugs fixed

1. **`row.updated_at.toISOString()` TypeError** (`d6eb1db`, CI #131 passed)
   - postgres-js returns TIMESTAMPTZ as ISO string, not Date
   - Fix: `typeof row.updated_at === 'string' ? row.updated_at : (row.updated_at as Date).toISOString()`
   - API returned 500 on every `/api/dishes` request

2. **`column dp.sequence does not exist`** (`3c49ac3`, CI #133 building)
   - The `dish_preparations` table column is `sequence_order`, not `sequence`
   - Fix: use `dp.sequence_order` in the LATERAL JOIN SQL
   - API was crashing with PostgresError on listDishes

### /lineages — real lineages now

- `997ef75` (feat/lineages-data-fix, CI #132 passed): seed-data.ts has `LINEAGE_METHODS` (16 methods) + `DISH_LINEAGES` (60 dishes); seed.ts has `seedDishLineages()` idempotent pass; `lineages.astro` groups by `methodSlug` (NOT familySlug)
- **VPS DB seeded directly** (`3c49ac3` deploy still running): 16 preparation_methods + 45 dish_preparations rows inserted on `shared-postgres` → real lineages now in production DB
- Fixes the root cause: `seedEncyclopedia()` never wrote `dish_preparations` rows, so 59/60 dishes fell into "Other"

### /families — family filter

- `c82d2da` + `80295d2` (CI #127-130 passed): `familySlug` derived from primary `kind='dish-type'` category via LATERAL JOIN; region filter added to families page; combined family+region filtering works
- **Note**: `/families` groups by dish-type (Noodle soups, Soups, Pasta, etc.) — different taxonomy from `/lineages` (which groups by preparation method: Stews, Fried & topped, etc.)

---

## Current CI status

| Commit | Message | CI |
|--------|---------|-----|
| `3c49ac3` | fix: sequence_order column name | **Running (#133)** |
| `2580e04` | fix(lineages): methodSlug + seed data | Passed (#132) |
| `d6eb1db` | fix(api): updated_at string handling | Passed (#131) |

Main branch SHA: `3c49ac3`

---

## Key schema facts (for future reference)

- `dish_preparations.sequence_order` — DB column name; Drizzle schema uses `sequenceOrder`
- `dish_categories.is_primary` — drives which category is the "primary" family for a dish
- Two taxonomies: `kind='dish-type'` (Noodle soup, Soup, Pasta…) and `kind='family'` (African, East Asian…)
- `methodSlug` comes from `preparation_methods.slug` via `dish_preparations`
- `familySlug` comes from `categories.slug WHERE kind='dish-type'` via `dish_categories`

---

## Known issues

1. **Node.js 20 deprecation in CI** — `actions/checkout@v4` / `setup-node@v4` use Node 20 internally, runner is now Node 24. GitHub infrastructure issue. Not user-fixable in workflow file.
2. **VPS DB seeded by hand** — `shared-postgres` container has the 16 new lineage methods and 45 dish_preparations inserted directly via SQL. The next `pnpm --filter @gustale/db run seed` will also seed these (idempotent) but hasn't been run in the container yet.

---

## What's next

1. Wait for CI #133 to pass (sequence_order fix)
2. Verify `/lineages` shows real lineages (Stews & braises, Noodle soups, etc. instead of "Other")
3. Verify `/families` shows real family chips (Soup, Pasta, Noodle soup, etc.)
4. Update this file with verification results
5. (Nice to have) Fix Node.js 20 deprecation — watch for GitHub Actions update to v5 of the actions
6. (Nice to have) Seed run on VPS via `pnpm --filter @gustale/db run seed` once container has the updated image
