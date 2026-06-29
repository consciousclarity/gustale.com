# Gustale — Shared State

> **Read this first.** This file is the source of truth for project state,
> decisions, and blockers across all AI assistants working on this repo.
> Both Hermes Agent (Telegram) and Claude Code (terminal) write to it.

## Last updated

2026-06-29 by Hermes Agent (Telegram) — Phase 2A food_geography migration applied to production `gustale` database via PR #19. All six target tables created, all FKs/indexes in place, baseline preserved, no regression. Phase 7 password rotation deferred to a separate authorized operation.

2026-06-18 19:30 WITA by Hermes Agent (commit `fc36bc4` on branch
feat/maplibre-per-dish, awaiting PR).

## Current status

✅ **Phase 7c/8a/7d/Edit wizard shipped. All maps now use MapLibre.**
Per-dish maps live, standalone /map live. One library, one basemap, one
fallback shape.

Two map surfaces:
1. `/map` — standalone **globe** (MapLibre GL) showing all 31 dishes,
   toggle to flat Mercator in the corner. CARTO Voyager basemap.
2. `/dishes/<slug>/` — per-dish **mini-map** (MapLibre GL) showing one
   dish's origin, same CARTO Voyager basemap + same WebGL pre-flight +
   static fallback pattern. Leaflet/react-leaflet fully removed.

Both islands share: dynamic import of `maplibre-gl` inside `useEffect`
(not at module top), `detectWebGL()` pre-flight, CARTO Voyager raster
style spec, dark-stroked emerald marker style.

Verified locally on branch `feat/maplibre-per-dish`:
- `pnpm --filter apps-web exec tsc --noEmit` clean
- both recipes + geo builds complete (75 pages each)
- no Leaflet refs in emitted HTML
- new `DishMap.<hash>.js` chunk is 6.2KB (island shell; maplibre-gl
  fetches on hydration)

Same Camofox caveat as before: test browser has no WebGL, so visual
verification pending on a real device after the PR merges and deploys.

## What's deployed on main

| Component | Status | Image SHA |
|---|---|---|
| `apps/api` (Fastify + better-auth) | Live, healthy | `634b435` |
| `apps/web` (Astro + React islands) | Live, healthy | `634b435` |
| gustale-api container | Running on VPS :4000 | `634b435…` |
| gustale-web container | Running on VPS :4001 | `634b435…` |
| shared-postgres container | Running | n/a |
| minio container | Running | n/a |
| MinIO bucket `gustale-public` | Ready, anonymous download | n/a |
| MinIO bucket `gustale-media` | Ready, private | n/a |

## Live features (verified)

- `/` — landing page
- `/dishes` — list of 31 dishes (client-side search)
- `/dishes/new` — create new dish (any authed user; creates as draft
  for moderator review)
- `/dishes/<slug>` — full detail page, pre-rendered as static HTML
  per dish (SSG via getStaticPaths). Sections: Origin (interactive
  MapLibre mini-map, same style as standalone /map), hero, regional
  variants, ingredients with quantities, preparation methods with
  steps + duration + difficulty, sources/citations with Wikipedia
  links + reliability, image gallery with lightbox (signed-URL fetches
  from MinIO), editor provenance, auth-gated Edit button.
- `/dishes/<slug>/edit` — edit form (auth-gated; moderator+ can
  publish drafts directly from this page)
- `/dishes/nonexistent-slug` — real HTTP 404
- `/404` (and any unknown URL) — dedicated 404 page
- `/map` — **NEW**: standalone globe view powered by MapLibre GL.
  WebGL globe projection by default, flat Mercator toggle in the
  top-right corner. CARTO Voyager basemap (free, no API key).
  Cluster bubbles when multiple dishes share coordinates. Click a
  dot to navigate to the dish page. 285 KB gzipped, loaded only on
  this page.
- `/login`, `/register`, `/account` — auth UI
- AuthMenu in header — "Sign in" ↔ user name + "Sign out"
- `https://api.gustale.com/api/dishes` — list with `q=` search
- `https://api.gustale.com/api/dishes/:slug` — rich detail (dish +
  origin + variants + ingredients + categories + preparations +
  sources + media + coverImage + availableLanguages)
- `https://api.gustale.com/api/dishes/map` — flat lat/lng (consumed
  by /map; also kept for future Phase 9 search/nearby work)
- `https://api.gustale.com/api/dishes-by-region?bbox=...` — bbox query
  via PostGIS `ST_MakeEnvelope` (kept for future nearby-dishes feature)
- `https://api.gustale.com/api/dishes` — `POST` (auth, draft creation)
  + `PATCH /api/dishes/:slug` (auth, with edit_history diff)
  + `POST /api/dishes/:slug/publish` (moderator+) + `DELETE`
  (admin). Tests in `apps/api/test/dishes-write.test.ts`.
- `https://api.gustale.com/api/auth/{sign-in,sign-up,sign-out,get-session}`
- `https://api.gustale.com/api/media/upload` (auth-gated, multipart,
  JPEG/PNG/WebP/AVIF/GIF, 20MB cap, streams to MinIO + writes `media`
  row + attaches to dish via `media_attachments`)
- `https://api.gustale.com/api/media/:id/signed-url` (auth-gated,
  15-min presigned GET URL)
- `https://api.gustale.com/api/dishes/:slug/media` (POST attach,
  DELETE detach)
- **Structured error responses** — 404/401/etc return `{error, message,
  code, traceId}` matching the Pino request id. Front-end has
  `ErrorBoundary` wrapping data-driven islands + `fetchWithRetry` on
  the API client.

## Open bugs / known issues

- **Resend not configured** → `requireEmailVerification: false` for v1
  (TODO comment in `apps/api/src/auth.ts`). Re-enable when email provider
  is wired.
- **SSR cookie reading doesn't work cross-subdomain** →
  `lib/session.ts: getSessionFromCookies()` returns null because the
  session cookie lives on `api.gustale.com`. Browser handles this fine
  via XHR; only an issue for future SSR personalization.
- **DishGallery island doesn't hydrate** — `DishDetail` is rendered
  without `client:load` directive, so the gallery's `useState`/`useEffect`
  never run. Images with `media_attachments` rows exist (1 seed row
  for `moussaka-greek`) but won't render until this is fixed. Discovery
  noted during Phase 7d map work; not yet resolved. Fix: add `client:load`
  to `<DishDetail>` in `pages/dishes/[slug].astro`, or hoist the
  gallery into a top-level island like we did for `DishMap`.
- **Telegram deploy-failure alert secrets missing** — `TELEGRAM_BOT_TOKEN`
  and `TELEGRAM_CHAT_ID` GitHub repo secrets still unset, so the
  deploy-failure alert in `8a` no-ops.
- **/map visual verification gap** — the Camofox test browser used by
  Claude Code lacks WebGL, so we can't visually confirm the MapLibre
  globe renders. Code deploys cleanly, JS chunk loads, props
  serialize correctly, and MapLibre GL works in every modern browser
  with WebGL (Chrome, Safari, Firefox, Edge). User to verify on a
  real device.

## Next build (priority order)

1. **Moderation queue UI** (`/moderation`) — list pending drafts,
   approve/reject with required reviewer notes, show diff preview.
   The backend already supports this (`POST .../publish` is
   moderator-gated); only the UI is missing. ~half-day.
2. **Fix DishGallery hydration** — small bug, blocks gallery from
   actually showing the seed image. Either add `client:load` to
   `<DishDetail>` or split the gallery into its own island.
3. **Image upload UI** in the edit wizard — drag-drop a JPEG/PNG,
   alt text field, license field. Wire to `POST /api/media/upload`.
   Currently the API exists but there's no UI to call it.
4. **Re-enable Resend** for email verification (small task, just config
   + flip flag).
5. **Set Telegram deploy-failure secrets** — user to add to GitHub
   repo secrets UI.
6. **Edit history UI** — render `edit_history` rows on the dish detail
   page (the data is already there).
7. **Internal link audit** — detail pages link to `/ingredients/<slug>`
   but no ingredient pages exist yet. Either stub 404s or build
   ingredient pages next.
8. **Phase 9 — Discoverability** (map-based "near me", unified search
   across dish/cuisine/region with pg_trgm fuzzy match, "what's similar
   to X"). Plan doc on request; the bbox endpoint at
   `/api/dishes-by-region` is already in place to support "near me".

## Conventions (for both agents to follow)

- **Branch:** `main` is the deploy branch. Feature branches get pushed
  as PRs.
- **Commits:** conventional commits (`feat:`, `fix:`, `chore:`,
  `refactor:`).
- **Seeds:** `packages/db/src/seed.ts` is the runner;
  `packages/db/src/seed-data.ts` is the typed dataset. Both idempotent.
- **Env on VPS:** `/root/.env` is the source of truth. Don't edit
  container env directly — it gets clobbered on next deploy.
- **After API or seed changes:** push an empty commit to trigger web
  rebuild for SSR freshness.
- **getStaticPaths fetch limit:** API caps `limit` at 100, so any
  future static-generated page that lists dishes must paginate (the
  detail page already does this in `pages/dishes/[slug].astro`).
- **SSR safety for MapLibre**: ALWAYS mount map components with
  `client:only="react"`, never `client:load`. Both MapLibre and the
  legacy react-leaflet touch `window` at import time (MapLibre
  imports `mapbox-gl`'s WebGL helpers). The `noscript` fallback in
  the dish page handles no-JS users gracefully.
- **CSS @import order**: `@import url(...)` MUST come before other
  rules (including `@import "tailwindcss"`). Tailwind's @property
  rules will trigger a Vite warning otherwise.

## Recent decisions log

- 2026-06-18: **Migrated per-dish DishMap from react-leaflet to
  MapLibre GL.** Single map library across the site (`/map` and
  `/dishes/<slug>` both use `maplibre-gl@5.24.0`). Same CARTO Voyager
  raster basemap, same emerald halo+dot marker style, same
  WebGL-detect → static-fallback pattern. Leaflet/react-leaflet/
  @types/leaflet removed; @types/react-simple-maps/@types/d3-geo/
  @types/topojson-client cleaned up while at it. Discovered during
  the migration: `tsc --noEmit` had been silently hiding a
  `Cannot find namespace 'GeoJSON'` error in `WorldMap.tsx` for
  weeks (P57 — dangling transitive type). Fixed by adding
  `@types/geojson` as a direct devDep of `apps-web`.
- 2026-06-18: Reactivated `/map` with **MapLibre GL JS** globe
  projection (the prior react-simple-maps had a zoom bug and no
  globe support). CARTO Voyager basemap (free, no API key).
  Per-dish DishMap (Leaflet) is UNCHANGED — it's lighter and the
  right choice for a small encyclopedia detail card.
- 2026-06-18: MapLibre 5.x removed `setFog()` and `projection` from
  the d.ts typings even though the runtime supports them. Use
  `setProjection({ type: 'globe' })` after construction; use
  `setSky({ ... })` (unified fog+sky API) inside `style.load`.
- 2026-06-18: Edit wizard front-end shipped. Discovery: the backend
  Write API (POST/PATCH/publish/DELETE) was already live at
  `apps/api/src/routes/dishes-write.ts` — only the UI was missing.
  End-to-end smoke test confirmed: signup → create draft → PATCH
  with diff → contributor 403 on publish.
- 2026-06-18: Dropped the standalone `/map` page. Per-dish `<DishMap>`
  island (react-leaflet + OpenStreetMap tiles) on every dish page is
  the right shape — smaller, more relevant, no zoom bug. Net bundle
  delta: -200KB (react-simple-maps + world-atlas + d3-* + topojson-client
  → +react-leaflet + leaflet, but we only load Leaflet JS on dish pages).
- 2026-06-18: `<DishMap>` uses `client:only="react"` directive because
  Leaflet touches `window`. Renders nothing during SSR (expected).
  `<noscript>` fallback provides graceful degradation.
- 2026-06-17: Wikipedia-model for v1 (read-everyone, write-credentialed).
- 2026-06-17: Hybrid seed (curated + citations), not live Wikidata fetch.
- 2026-06-17: better-auth cookies are `__Secure-gustale.session_token`.
- 2026-06-17: Fastify JSON parser bug fixed — use `request.body`, not raw.
- 2026-06-17: Dish detail page = SSG (not SSR-on-request). Pulls dish
  list from `https://api.gustale.com/api/dishes` at build time via
  `getStaticPaths`. Falls back to a single placeholder path if the API
  is unreachable.
- 2026-06-17: nginx `try_files` chain ends at `/404.html` (was
  `/index.html`). Real HTTP 404 status for unknown routes.
- 2026-06-17: Phase 8a — centralized error handler with traceId matching
  Pino request id; structured `{error, message, code, traceId}` shape;
  `ErrorBoundary` on data-driven islands; `fetchWithRetry` on API
  client (3 retries, exp backoff + jitter, honors Retry-After,
  skips 4xx). Telegram alert on deploy failure (no-ops without secrets).
- 2026-06-17: Phase 7d — MinIO upload pipeline shipped end-to-end.
  Real upload → attach → signed-URL fetch → image render. Routes:
  `POST /api/media/upload`, `GET /api/media/:id/signed-url`,
  `POST /api/dishes/:slug/media`, `DELETE /api/dishes/:slug/media/:id`.
  Mime allow-list (JPEG/PNG/WebP/AVIF/GIF), 20MB cap, transactional
  DB insert with orphan cleanup. Signed URLs fetched client-side on
  hydration (15-min expiry, not baked into static HTML).
- 2026-06-29: **PR #19 production migration applied — Phase 2A
  `food_geography` schema deployed to `gustale` database on the VPS.**
  Migration file `0005_food_geography_phase_2a.sql` (197 lines,
  8265 bytes, sha256 `5157d40ed9c50703858b183dab645e2f835a48b66856a267842a3e51812588d2`)
  staged on VPS at
  `/home/deploy/gustale.com/migrations/0005_food_geography_phase_2a.sql`
  (Phase 1). Pipe-safe preflight (Phase 2): connection test
  `gustale|gustale`, target-table existence returned 0 rows,
  baseline `dishes (total) = 61`, `dishes (published) = 60`
  (saved to `/tmp/migration-audit/baseline-dishes.txt` on VPS).
  Custom-format `pg_dump` backup (Phase 3):
  `/home/deploy/gustale.com/backups/gustale_pre_phase2a_20260629T103158Z.dump`,
  372,675 bytes, sha256 `a3d80744162f6c07ecea5305dbd918f177729e32d5c474ff9f0381b7daeabfac`,
  1023 TOC entries verified via `pg_restore --list` (Postgres 16.4
  Debian, format=CUSTOM, compression=gzip). Apply (Phase 4): exit 0,
  26 DDL statements (6 CREATE TABLE + 9 CREATE INDEX + 11 ALTER TABLE),
  no errors, no warnings. Verification (Phase 5): all six target
  tables exist (`to_regclass() = t`); row counts all 0; 11 FK
  constraints (10 CASCADE + 1 SET NULL on `food_regions.parent_region_id`
  self-reference for hierarchical regions); 17 indexes (4 PK indexes
  + 2 unique-constraint indexes + 11 declared non-PK / non-unique
  indexes); `dishes (total) = 61`, `dishes (published) = 60` — exact
  match to pre-apply baseline, no regression; homepage HTTP 200 with
  60 dishes rendered post-hydration (hero meta `60 dishes / 18
  families / 32 origins`, breadcrumb `60 dishes`, Index view `60 of
  60 dishes`, filter footer `Showing 60 dishes`); `/api/dishes?limit=100`
  HTTP 200 with 60 dishes; `/api/dishes/map?limit=2000` HTTP 200 with
  60 dishes. The migration is purely additive (CREATE TABLE/INDEX/
  ALTER TABLE only; no INSERT/UPDATE/DELETE). All DB operations used
  the v5 pipe-safe canonical form (URL pipe from
  `docker exec gustale-api printenv DATABASE_URL` →
  `docker exec -i shared-postgres bash -lc 'IFS= read -r DATABASE_URL;
  export DATABASE_URL; …'`). No `docker inspect ... {{range .Config.Env}}`,
  no `-e DATABASE_URL=`, no URL stored in any host shell variable,
  file, or env, no URL printed/echoed/length-measured. v5 runbook
  artifact at `/tmp/runbook-pipesafe-v5.md` (609 lines, 26746 bytes,
  sha256 `24a99afbd93b60940cf8695cc439046714d5ad7904873f572a1fa771090cd088`)
  is the source-of-truth for any re-execution. Migration staging
  scripts under `/tmp/migration-audit/` on the VPS (ephemeral, in
  `/tmp`). Phase 6 (rollback) NOT executed; Phase 7 (password
  rotation) NOT executed — see "Active blockers" below. No `.env`
  edits, no container restarts, no `pnpm db:migrate`, no
  `drizzle-kit generate`, no rollback, no password rotation in this
  round.
- 2026-06-28: **PR #23 merged → `origin/main @ 8fdc8ab`**.
  `apps/web/src/components/design/GustaleHomeIsland.tsx` line 635
  changed from `listDishes({ limit: 200 })` to `listDishes({ limit: 100 })`
  to respect the API's `limit` Zod cap (`apps/api/src/routes/dishes.ts:41`,
  `z.coerce.number().int().min(1).max(100).default(20)`). PR #22 had
  shipped `limit: 200` per its reconcile work; that conflicted with
  the API contract and resulted in `/api/dishes?limit=200` returning
  HTTP 400 (VPS Fastify log: `ZodError too_big maximum: 100 path: ["limit"]`
  at `file:///app/dist/routes/dishes.js:58:40`). Fix: align web to
  the API contract. Result: 60 dishes rendered post-hydration, all
  filters visible, no console errors. **PR #21 remains open** (head
  `cdb1553`, base `9f099fd`, `mergeable: false` — branch/base
  divergence with `origin/main`) and is functionally superseded by
  PRs #22 + #23; closing PR #21 requires a separate authorization
  since it cannot be merged cleanly without conflict resolution.

## Active blockers (none right now)

- **Phase 7 — DB password rotation (deferred, separate operation).** The
  production `gustale` role `DATABASE_URL` was exposed in chat
  transcript earlier in this session (during initial reconnaissance,
  before the migration work began). The password value is treated as
  compromised. Rotation is **not** part of the PR #19 migration closeout
  and was not performed in this round. When scheduled, the operation
  is: (1) generate a new password; (2) `ALTER ROLE gustale WITH
  PASSWORD '<new>'` as `postgres` superuser via the shared-postgres
  container (note: superuser password lives in `/root/.env` on the VPS,
  which is out of our normal SSH access scope); (3) update
  `/home/deploy/gustale.com/.env` and `/home/deploy/gustale.com/.db-password`
  on the VPS; (4) recreate `gustale-api` container
  (`docker stop && docker rm` then `docker compose up -d --force-recreate api`)
  — `docker restart` does NOT re-read `.env`; (5) re-run Phase 5.5
  smoke (homepage 200, `/api/dishes?limit=100` 200, `/api/dishes/map?limit=2000` 200);
  (6) audit-log the rotation timestamp.

(none right now besides the Phase 7 item above)