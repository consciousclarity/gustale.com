# Gustale — Shared State

> **Read this first.** This file is the source of truth for project state,
> decisions, and blockers across all AI assistants working on this repo.
> Both Hermes Agent (Telegram) and Claude Code (terminal) write to it.

## Last updated

2026-06-18 02:20 WITA by Hermes Agent (commit `38d9fbb`).

## Current status

✅ **Phase 7d (MinIO upload + gallery) shipped live + Phase 8a (production
error handling) shipped live + Standalone /map replaced by per-dish
mini-maps.** All 31 dish pages now show an interactive Origin map
(react-leaflet + OpenStreetMap) with the dish's geographic origin.
The /map route and WorldMap component are gone.

Verified live: https://gustale.com/dishes/moussaka-greek/ now shows
"Greece · GR · country" with a real Leaflet map centered on Athens.

## What's deployed on main

| Component | Status | Image SHA |
|---|---|---|
| `apps/api` (Fastify + better-auth) | Live, healthy | `38d9fbb` |
| `apps/web` (Astro + React islands) | Live, healthy | `38d9fbb` |
| gustale-api container | Running on VPS :4000 | `38d9fbb…` |
| gustale-web container | Running on VPS :4001 | `38d9fbb…` |
| shared-postgres container | Running | n/a |
| minio container | Running | n/a |
| MinIO bucket `gustale-public` | Ready, anonymous download | n/a |
| MinIO bucket `gustale-media` | Ready, private | n/a |

## Live features (verified)

- `/` — landing page
- `/dishes` — list of 31 dishes (client-side search)
- `/dishes/<slug>` — full detail page, pre-rendered as static HTML
  per dish (SSG via getStaticPaths). Sections: Origin (interactive
  map), hero, regional variants, ingredients with quantities,
  preparation methods with steps + duration + difficulty,
  sources/citations with Wikipedia links + reliability, image gallery
  with lightbox (signed-URL fetches from MinIO), editor provenance.
- `/dishes/nonexistent-slug` — real HTTP 404
- `/404` (and any unknown URL) — dedicated 404 page
- `/login`, `/register`, `/account` — auth UI
- AuthMenu in header — "Sign in" ↔ user name + "Sign out"
- `https://api.gustale.com/api/dishes` — list with `q=` search
- `https://api.gustale.com/api/dishes/:slug` — rich detail (dish +
  origin + variants + ingredients + categories + preparations +
  sources + media + coverImage + availableLanguages)
- `https://api.gustale.com/api/dishes/map` — flat lat/lng (server-side
  endpoint kept for future Phase 9 search/nearby work; no client
  consumer since commit `38d9fbb`)
- `https://api.gustale.com/api/dishes-by-region?bbox=...` — bbox query
  via PostGIS `ST_MakeEnvelope` (kept for future nearby-dishes feature)
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
- **No write API** → authenticated users can't yet create/edit dishes.
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

## Next build (priority order)

1. **Write API** (`POST /api/dishes`, `PATCH /api/dishes/:slug`,
   auth-gated) — unlocks the edit wizard. ~half-day.
2. **Edit wizard UI** (`/dishes/new`, `/dishes/:slug/edit`) — multi-step
   form, draft → review → publish. Needs #1.
3. **Fix DishGallery hydration** — small bug, blocks gallery from
   actually showing the seed image. Either add `client:load` to
   `<DishDetail>` or split the gallery into its own island.
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
- **SSR safety for Leaflet**: ALWAYS mount map components with
  `client:only="react"`, never `client:load`. Leaflet touches `window`
  at import time. The `noscript` fallback in the dish page handles
  no-JS users gracefully.
- **CSS @import order**: `@import url(...)` MUST come before other
  rules (including `@import "tailwindcss"`). Tailwind's @property
  rules will trigger a Vite warning otherwise.

## Recent decisions log

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