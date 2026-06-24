# Gustale — Shared State

> **Read this first.** This file is the source of truth for project state,
> decisions, and blockers across all AI assistants working on this repo.
> Both Hermes Agent (Telegram) and Claude Code (terminal) write to it.

## Last updated

2026-06-23 by Claude (Cowork) — PR #1 merged to main, gallery hydration fix
shipped, shared state updated.

## Current status

✅ **PR #1 merged. Phase 7c/8a/7d/Edit wizard shipped. All maps use MapLibre. DishGallery hydration fixed.**
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

## Active blockers (none right now)

(none)

---

## 🚨 ACTIVE BLOCKER — Web deploys broken (2026-06-24, Mavis → Hermes)

**Owner: Hermes** (Mavis handed this off)

CI has been failing for every push to `main` since `209fb7a` (the last
green deploy on 2026-06-23T18:20). Affected runs: `8e6ac29`, `da3f866`,
`a1e7cd3` (merge), `828a87e` (Mavis's P1 families.astro Tailwind).

**Symptom.** `Docker build (gustale-web-geo)` and
`Docker build (gustale-web-recipes)` both fail in
`Build and push <variant>` step within ~18s. Tests, lint, typecheck,
and `Docker build (gustale-api)` all pass.

**Root cause (reproduced locally).** The GHA runner cannot reach
`api.gustale.recipes` (Hostinger VPS firewall blocks GHA IPs — see
comment in `apps/web/Dockerfile` lines 65–69). Astro SSG fetches
`/api/dishes` for `/dishes/[slug]` pages; without API access,
`dist/dishes/` ends up with only 2 subdirs instead of ≥20. The
`apps/web/scripts/post-build.mjs` safety check then correctly refuses
to ship a partial build:

```
[post-build] REFUSING to prune — dist/dishes/ has 2 directories (expected ≥20).
This looks like a partial or stale build. Re-run a clean astro build
(e.g. "rm -rf dist .astro && astro build") before post-processing,
or set ALLOW_PARTIAL=1 if you really mean to ship a partial dist.
```

**Live state right now.** gustale.com is on the pre-failure build
(`209fb7a`). Mavis's P1 (`828a87e`, families.astro Tailwind restyle)
is on `origin/main` but **not deployed**. `/families` still renders
the old broken `gustale-families-*` classes.

**Recommended fix (option 1 — cleanest).** Open the Hostinger VPS
firewall to GHA runner IPs. `ssh root@62.72.7.218` (key:
`~/.ssh/gustale-cd/id_ed25519`). One firewall rule, no code change.

**Alternatives.**
- Option 2: Mock the API in CI so SSG has deterministic data.
- Option 3: Roll back to `209fb7a` (keeps prod stable, defers fix).

**Job URL for the actual log** (Mavis can't fetch anonymously):
https://github.com/consciousclarity/gustale.com/actions/runs/28077986766/jobs/83126295710
                                                                                                                  