# Gustale — Shared State

> **Read this first.** This file is the source of truth for project state,
> decisions, and blockers across all AI assistants working on this repo.
> Both Hermes Agent (Telegram) and Claude Code (terminal) write to it.

## Last updated

2026-06-17 19:48 WITA by Hermes Agent (commit `c2c4fda`).

## Current status

✅ **Phase 7c (Dish detail pages) shipped live.** All 31 dishes now have
statically-rendered SEO-friendly detail pages with hero, ingredients,
preparation steps, regional variants, sources/citations, and editor
provenance. HTTP 404 for unknown slugs (was 200 OK + home page).
Verified end-to-end on https://gustale.com/dishes/moussaka-greek/.

## What's deployed on main

| Component | Status | Image SHA |
|---|---|---|
| `apps/api` (Fastify + better-auth) | Live, healthy | `c2c4fda` |
| `apps/web` (Astro + React islands) | Live, healthy | `c2c4fda` |
| gustale-api container | Running on VPS :4000 | `c2c4fda…` |
| gustale-web container | Running on VPS :4001 | `c2c4fda…` |
| shared-postgres container | Running | n/a |
| minio container | Running | n/a |

## Live features (verified)

- `/` — landing page
- `/dishes` — list of 31 dishes (client-side search)
- `/dishes/<slug>` — **NEW**: full detail page, pre-rendered as static HTML
  per dish (SSG via getStaticPaths). Sections: hero (origin + dates),
  regional variants, ingredients with quantities, preparation methods
  with steps + duration + difficulty, sources/citations with Wikipedia
  links + reliability, gallery placeholder, editor provenance.
- `/dishes/nonexistent-slug` — **NEW**: returns real HTTP 404 (was 200 OK).
- `/404` (and any unknown URL) — **NEW**: dedicated 404 page with links
  back to /dishes and /map.
- `/map` — 31 dots across 22 countries, Equal Earth projection
- `/login`, `/register`, `/account` — auth UI
- AuthMenu in header — "Sign in" ↔ user name + "Sign out"
- `https://api.gustale.com/api/dishes` — list
- `https://api.gustale.com/api/dishes/:slug` — rich detail (dish +
  origin + variants + ingredients + categories + preparations + sources
  + media + coverImage + availableLanguages)
- `https://api.gustale.com/api/dishes/map` — flat lat/lng
- `https://api.gustale.com/api/auth/{sign-in,sign-up,sign-out,get-session}`

## Open bugs / known issues

- **Resend not configured** → `requireEmailVerification: false` for v1
  (TODO comment in `apps/api/src/auth.ts`). Re-enable when email provider
  is wired.
- **No write API** → authenticated users can't yet create/edit dishes.
- **SSR cookie reading doesn't work cross-subdomain** →
  `lib/session.ts: getSessionFromCookies()` returns null because the
  session cookie lives on `api.gustale.com`. Browser handles this fine
  via XHR; only an issue for future SSR personalization.
- **Gallery section is placeholder-only** — media storage is wired
  (MinIO container + `media` schema), but no dish has uploaded images
  yet. Once images exist, the gallery needs a real carousel/grid
  component and signed-URL fetching from MinIO.

## Next build (priority order)

1. **Write API** (`POST /api/dishes`, `PATCH /api/dishes/:slug`,
   auth-gated) — unlocks the edit wizard. ~half-day.
2. **Edit wizard** (`/dishes/new`, `/dishes/:slug/edit`) — multi-step
   form, draft → review → publish. Needs #1.
3. **Re-enable Resend** for email verification (small task, just config
   + flip flag).
4. **Image upload + gallery rendering** — wire up MinIO signed URLs
   from the API; render `<img>` tags in the dish detail gallery
   section. Removes the "1 attachment on record" placeholder text.
5. **Edit history UI** — render `edit_history` rows on the dish detail
   page (the data is already there).
6. **Internal link audit** — detail pages link to `/ingredients/<slug>`
   but no ingredient pages exist yet. Either stub 404s or build
   ingredient pages next.

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

## Recent decisions log

- 2026-06-17: Wikipedia-model for v1 (read-everyone, write-credentialed).
- 2026-06-17: Hybrid seed (curated + citations), not live Wikidata fetch.
- 2026-06-17: Equal Earth projection for map (not Mercator, not 3D globe yet).
- 2026-06-17: better-auth cookies are `__Secure-gustale.session_token`.
- 2026-06-17: Fastify JSON parser bug fixed — use `request.body`, not raw.
- 2026-06-17: Dish detail page = SSG (not SSR-on-request). Pulls dish
  list from `https://api.gustale.com/api/dishes` at build time via
  `getStaticPaths`. Falls back to a single placeholder path if the API
  is unreachable.
- 2026-06-17: DishDetail is a presentational React component, NO
  `client:load` directive → renders as static HTML, no hydration JS
  shipped to the browser. Zero JS for dish pages.
- 2026-06-17: nginx `try_files` chain ends at `/404.html` (was
  `/index.html`). Real HTTP 404 status for unknown routes.

## Active blockers (none right now)

(none)