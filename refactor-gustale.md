# Refactor Gustale — Architecture Cleanup Pass

Behavior-preserving cleanup on `feat/terracotta-design-pass`. Each step: edit →
live-test (typecheck / `astro check` / vitest / boot+smoke) → `/code-review` → commit.

## Progress

- [x] **Step 0 — Baseline**: snapshot terracotta design pass (`908c9a5`) + this tracker.
- [x] **Step 1 — DRY validation schemas** (`aa4cf45`): extracted `apps/api/src/schemas/common.ts`
      (slugParamSchema, slugBodyField/SLUG_RE, limitField/offsetField/pagination); updated
      dishes, dishes-write, dishes-media, ingredients. Net −19 lines. typecheck+tests+smoke green. No review findings.
- [x] **Step 2 — Unify route registration** (`b044219`): converted health/dishes/dishes-write
      to `FastifyPluginAsync`; all six via `await app.register` in server.ts; ordering preserved.
      typecheck+35 tests+smoke green (map static 200, unauth POST 401, bound 400s). No findings.
- [x] **Step 3 — Web tsconfig** (`ce7f913`): layered `noUncheckedIndexedAccess`,
      `noImplicitOverride`, `noFallthroughCasesInSwitch` into `apps/web/tsconfig.json`
      (kept extending astro strict — base's NodeNext is incompatible with astro's Bundler).
      Zero `noUncheckedIndexedAccess` fallout; fixed 3 missing-override members in
      `ErrorBoundary.tsx`. astro check back to baseline; astro build green (76 pages).

## Final verification (all steps)
- api typecheck: clean · db typecheck: clean · api build: OK
- api tests: **35 pass / 3 skip** · web astro check: 1 pre-existing error only (out of scope) · astro build: 76 pages
- live smoke: **10/10 PASS** (health/ready, dishes list+bounds, map static-before-param,
  slug 200/404, unauth POST 401 via requireUser, ingredients, dishes-by-region)
- Commits: `908c9a5` baseline → `aa4cf45` schema DRY → `b044219` route unify → `ce7f913` web tsconfig

### Local stack (left running for further testing)
- Containers: `gustale-pg` (PostGIS), `gustale-minio`. Stop: `docker rm -f gustale-pg gustale-minio`.
- API smoke server: `node --env-file=apps/api/.env --import tsx apps/api/src/server.ts`. Smoke script: `/tmp/gustale-smoke.mjs`.
- `apps/api/.env` is local-only (gitignored). One pre-existing out-of-scope issue remains:
  `apps/web/src/pages/dishes/index.astro:12` sets `total` not in `DishListResponse` (from the design pass).

## Baseline (commit 908c9a5)
- Local stack: PostGIS (`gustale-pg`) + MinIO (`gustale-minio`) containers; `apps/api/.env` local.
- `pnpm --filter @gustale/api typecheck` + db: clean.
- API tests: **35 passed / 3 skipped** (4 files). Run: `cd apps/api && set -a; . ./.env; set +a && pnpm exec vitest run`.
- Web `astro check`: **1 pre-existing error** (`dishes/index.astro:12` — `total` not in `DishListResponse`), 6 hints. Not in scope.
- Pre-existing `packages/ui/SearchInput.tsx` typecheck error (outside CI scope).

## Notes / decisions
- Out of scope (cleanup-only): packages/shared, service layer, TanStack Query, session
  Context, god-component decomposition, URL state, schema.sql sync.
- Stay on this branch (shared checkout, concurrent agent). Never touch `.hermes/`.
