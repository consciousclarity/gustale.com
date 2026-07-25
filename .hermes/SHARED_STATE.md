# Gustale — Shared State

> **Read this first.** This file is the source of truth for project state,
> decisions, and blockers across all AI assistants working on this repo.
> Both Hermes Agent (Telegram) and Claude Code (terminal) write to it.

## Last updated

### Hermes (Geekom / Telegram) — 2026-07-25 (Encrypted offsite backup and restore gate)

- **Contradiction resolved:** the earlier statement “no offsite copies exist” is now stale, and the migration report was correct at the time it was written. A working Google Drive backup was installed on 2026-07-25 before this re-issued audit: `gustale-backup.timer` runs daily at `01:00 UTC` with `RandomizedDelaySec=15m` and `Persistent=true`.
- **Offsite destination:** Google Drive retained by explicit user decision; Cloudflare R2 was not configured. The remote account owner cannot be identified from the stored OAuth token/config because the token lacks a usable identity endpoint; record the owning Google account in the external credential vault.
- **Coverage:** whole-database PostgreSQL custom-format dump plus `gustale-public` and `gustale-media` MinIO buckets. Database dumps are AES-256 GPG encrypted. MinIO now synchronizes through `rclone crypt` (`gdrive-crypt:`), encrypting object contents, filenames, and directory names before Google Drive receives them.
- **MinIO inventory before implementation:** `gustale-public` = 0 objects / 0 bytes; `gustale-media` = 0 objects / 0 bytes. There was no user media to migrate. A 16,384-byte canary was uploaded, backed up, deleted from MinIO, restored from Google Drive, and checksum verified (`a9d2110f7e926d57797637b610989aff7afe54fe6ad015be08aae2155d9291f9`); the canary was then removed.
- **Retention:** DB = 7 daily + 4 weekly + 3 monthly snapshots. Media = current append-mostly mirror plus deleted/replaced object versions for 90 days under `media/deleted/YYYYMMDD/`; no GFS rotation for current media.
- **Key recovery:** active key exists at `/root/.backup-key` (`0600 root:root`) and `/home/deploy/gustale.com/.backup-key` (`0600 hermes:hermes`), with matching SHA-256. A verified off-VPS recovery copy now exists on Geekom at `/home/alex/.local/share/gustale/backup-key` (`0600 alex:alex`). This Geekom copy must itself be included in the operator's encrypted workstation backup/credential vault.
- **Restore drill:** pulled `gustale_backup_20260725T131747Z.dump.gpg` from `gdrive-crypt:db`, decrypted it, matched its plaintext SHA-256 manifest, restored into `gustale_restore_test`, compared all public-table counts, and dropped the throwaway DB. Elapsed: **15.453 seconds**. All non-volatile table counts matched; live `rate_limit` changed during the drill (`1` live vs `2` in snapshot), which is expected write activity after the dump.
- **Directus readiness:** the job runs `pg_dump -Fc` against the entire `gustale` database with no table allowlist. Any future `directus_*` tables created in the same database are covered automatically. At verification time there were `0` `directus_*` tables because ADR-002 Phase 3 has not started.
- **Capacity:** encrypted offsite backup tree currently uses approximately 316 KB. Google Drive reports ~5.30 TB free, so the previously proposed R2 10 GB free-tier calculation is no longer applicable. With only one measured snapshot and empty media buckets, there is not yet enough history to calculate a defensible growth rate or exceed date.
- **Environment drift check:** `DATABASE_URL`, `BETTER_AUTH_URL`, MinIO credentials, and `RESEND_API_KEY` match between `/root/.env` and `/home/deploy/gustale.com/.env`. `BETTER_AUTH_SECRET`, `SESSION_SECRET`, and `CORS_ORIGIN` differ and require a separate application-env audit; no secret value was printed or changed during this backup task.
- **Runbook:** `.hermes/RECOVERY_RUNBOOK.md` is now the standalone post-ADR-002 recovery source of truth. Git seed data is explicitly not a content backup.

### Hermes (Geekom / Telegram) — 2026-07-25 (Ops run: Applied Migrations 0009, 0010, 0011)

**Task 4 (Apply Migrations): RESOLVED.** Successfully backed up production DB to `/home/deploy/gustale.com/backups/gustale_pre_migration_0009_20260725T121711Z.dump` (sha256 `9fdc5c3fcd823cbe28b80f5e163703b306dcbe8443b9858e09dfe1ab9d7d1527`, TOC lines `1086`). Applied migrations `0009_db_invariants.sql`, `0010_surrogate_pks.sql`, and `0011_dish_ingredients_pk.sql` in strict order as `postgres` superuser. Resynced drizzle sequence and inserted tracking rows for all three migrations, bringing the `drizzle.__drizzle_migrations` table count to 9 rows. Fully verified primary and unique constraints exist on all 11 modified tables plus `dish_ingredients` via pg_constraint query. Confirmed published dish count remains `121` and all API smoke endpoints are green.

2026-06-24 by Claude (Cowork) — CI web build blocker fixed: mock API server inside Dockerfile replaces the unreachable production API during Astro SSG.

## Current status

✅ **CI web builds fixed. Mock API server added to Dockerfile. Async `wait-for-api` step removed.**
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
| `apps/api` (Fastify + better-auth) | Live, healthy | `2da83d1` |
| `apps/web` (Astro + React islands) | Live, healthy | `2da83d1` |
| gustale-api container | Running on VPS :4000 | `2da83d1…` |
| gustale-web container | Running on VPS :4001 | `2da83d1…` |
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
- ~~**DishGallery island doesn't hydrate**~~ — **Fixed** (2026-06-23,
  commit `2da83d1`). Added `client:load` to `<DishDetail>` in
  `pages/dishes/[slug].astro`. Gallery now hydrates and fetches
  signed URLs. Visual verification on a real device still pending
  (needs MinIO reachable + WebGL for the map on the same page).
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

## Active blockers

(none)
                                                                                                                  