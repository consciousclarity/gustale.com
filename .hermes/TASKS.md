# Gustale — Work Queue

> **Task queue shared across AI agents.** Each task has an owner (which
> AI or human is working on it) and a status. Pick up the next "todo" task
> when idle. Move to "in_progress" when you start, "done" when merged.
> Add new tasks below the "Backlog" header.

## In progress

(none right now — check Backlog)

## Done (recent — last 10)

- 2026-06-25: **Homepage sophistication pass** (PR #6, `feat/site-sophistication-pass`). SSR-first split: `index.astro` server-renders an editorial hero ("Every dish has a place."), a rotating `HeroFeaturedCard` island, "Most connected" + "Families & lineages" rails, and a schema-stats band; the atlas/index/gallery/feed explorer is now the `HomeWorkspace` island (seeded from a `#explore=` URL hash). New `GET /api/dishes/featured` API endpoint (top dishes by `dish_relations` count; tested). Nav Contribute CTA + columned footer. Verified: astro check clean, build:recipes+geo green, API suite 48 pass/3 skip. **Follow-up:** run `pnpm --filter @gustale/db run seed` against the dev DB — it has 0 relations + only 31 dishes, so the most-connected rail/hero card render empty until seeded. — Claude Code

- 2026-06-24: **Fixed CI web build blocker.** Created `apps/web/scripts/mock-api.mjs` — a local HTTP server that serves all 31 dishes from inlined seed data. The Dockerfile now starts the mock inside the build container (overriding `PUBLIC_API_BASE=http://127.0.0.1:8742`), so Astro SSG generates all dish pages without needing the production API. Removed the async `wait-for-api` step from ci.yml. — Claude (Cowork)

- 2026-06-23: Merged PR #1 (`feat/maplibre-per-dish` → `main`). All
  6 commits shipped: MapLibre per-dish map, CI matrix/cache improvements,
  lint gate fix, gallery hydration fix. Deployed to VPS. — Claude (Cowork)
- 2026-06-23: Fixed DishGallery hydration — added `client:load` to
  `<DishDetail>` in `pages/dishes/[slug].astro` (commit `2da83d1`).
  Gallery useState/useEffect now run; signed-URL fetch on mount works. — Claude (Cowork)
- 2026-06-18: Migrated per-dish `<DishMap>` from react-leaflet to
  MapLibre GL JS — single map library across the site, same CARTO
  Voyager basemap and emerald marker style as standalone /map,
  same WebGL-detect → static-fallback pattern. Leaflet, react-leaflet,
  @types/leaflet removed. Also cleaned up @types/react-simple-maps,
  @types/d3-geo, @types/topojson-client (dead deps from the old
  react-simple-maps era). Fixed pre-existing P57-style typecheck
  lie: `@types/geojson` was a transitive of maplibre-gl but pnpm
  didn't hoist it, so `tsc --noEmit` had been hiding a
  `Cannot find namespace 'GeoJSON'` error in `WorldMap.tsx`.
  Added as direct devDep. Branch `feat/maplibre-per-dish`, awaiting
  PR. — Hermes
- 2026-06-18: Standalone /map page reactivated with MapLibre GL JS
  globe projection. CARTO Voyager basemap, free, no API key.
  Toggle to flat Mercator in the corner. — Hermes
- 2026-06-18: Edit wizard UI shipped — `/dishes/new` (NewDishForm)
  + `/dishes/<slug>/edit` (EditDishForm) + EditDishButton on every
  dish page. Discovery: backend Write API was already live at
  `dishes-write.ts` — only the front-end was missing. — Hermes
- 2026-06-17: Standalone /map page replaced with per-dish `<DishMap>`
  island (react-leaflet + OpenStreetMap) on every dish page. Removed
  react-simple-maps, world-atlas, d3-*, topojson-client deps. Net
  -200KB bundle. — Hermes
- 2026-06-17: Phase 8a — production-grade error handling shipped
  (centralized handler w/ traceId, structured `{error, message, code,
  traceId}`, ErrorBoundary on data-driven islands, fetchWithRetry w/
  exp backoff + Retry-After, Telegram alert on deploy fail). — Hermes
- 2026-06-17: Phase 7d routes + front-end gallery shipped end-to-end.
  POST /api/media/upload (multipart, mime allow-list, 20MB cap,
  streams to MinIO + writes media + media_attachments), GET
  /api/media/:id/signed-url (15-min presigned), POST /api/dishes/:slug/media
  + DELETE. Front-end: DishGallery component w/ lightbox, signed-URL
  fetch on hydration. — Hermes
- 2026-06-17: Phase 7d prep — MinIO client lib + buckets (`gustale-public`
  anonymous, `gustale-media` private) + multipart deps — Hermes
- 2026-06-17: Dish detail page (SSG, 31 pages, real 404 for unknown slugs) — Hermes
- 2026-06-17: Auth UI (login/register/account/AuthMenu) — Hermes
- 2026-06-17: Auth plugin body-parsing bugfix — Hermes
- 2026-06-17: 31-dish encyclopedia seed (Wikipedia-sourced) — Hermes

## Backlog

### P1 — Configure real linting in `apps/api`, `apps/web`, `packages/db`
**Owner:** unassigned · **Estimate:** ~1 day · **Deadline:** 2026-09-30

**Problem.** The `lint` job in `.github/workflows/ci.yml` is
misleading safety theater. `pnpm -r run lint` resolves to a single
stub (`echo 'lint ui'`) in `packages/ui/package.json` — none of
`apps/api`, `apps/web`, `packages/db`, or `packages/shared` even
define a `lint` script. No ESLint, Biome, or Prettier is installed
anywhere in the repo, and no config file exists. The green
checkmark on every PR's lint job means "the echo command printed
the string 'lint ui'" — nothing else.

`continue-on-error: true` on the `Lint` step (was line 69 of
ci.yml) hid the absence of any real lint from anyone reading the
workflow. Even if a linter is configured tomorrow, that flag
means the first PR that introduces lint errors will fail
visibly for the wrong reason (the debt problem, not the
regression problem), and the natural reaction will be to keep
`continue-on-error: true` permanently. **Removed in commit `e1397b2`.**

**Scope.**
- Pick one tool. Recommended: **Biome** — single binary, no
  per-package config sprawl, replaces ESLint + Prettier for this
  repo's needs (TypeScript + TSX + Astro). Faster cold-start than
  ESLint on CI runners.
- Add `lint` script to `apps/api/package.json`,
  `apps/web/package.json`, `packages/db/package.json`,
  `packages/shared/package.json` (the four non-UI packages).
  Keep `packages/ui`'s stub or replace it.
- Add `biome.json` at the repo root with sensible defaults; tune
  per-package `biome.json` overrides only if Biome can't be
  coerced into one config.
- Run the linter locally, fix the debt in one or more
  "lint debt cleanup" PRs. Don't ship the linter switch until
  the debt is clean — otherwise the moment `continue-on-error`
  comes off, every PR breaks.
- Run `biome` (or chosen tool) as part of CI lint step, replacing
  the stub `pnpm -r run lint`.

**Out of scope.** Pre-commit hooks, husky/lint-staged,
formatting-on-save integration. Add those as a follow-up after
the CI gate works.

**Done means.**
1. `pnpm -r run lint` runs a real linter across all 5 workspace
   packages and exits non-zero on actual violations.
2. At least one PR has shipped with lint catching a real issue
   (proves the gate is wired correctly).
3. This Backlog entry is deleted; the result moves to the "Done"
   list.

**Why the deadline.** A `continue-on-error` with no deadline
becomes permanent. 2026-09-30 gives one quarter to do the work
properly — long enough to not be a fire drill, short enough that
the TODO won't be forgotten. If the deadline passes without
action, the right move is either to remove the `lint` job
entirely (cheaper than running a no-op) or to bump the deadline
once with an explicit reason in this file.

### P1 — Moderation queue UI (`/moderation`)
**Owner:** unassigned · **Estimate:** half-day
Backend already supports this — `POST /api/dishes/:slug/publish` is
moderator-gated, and `edit_history` rows record every action. Only
the front-end is missing. Build:
- `/moderation` page (moderator+ only; shows "access denied" for
  others)
- List pending drafts sorted by oldest first (longest-waiting first)
- Each row: dish name, proposer, time-since-created, "view diff"
  button, approve/reject buttons
- Reject UI requires a reviewer note (the backend requires it; we
  just enforce it in the form)
- Show the edit_history timeline (create + every update since)

### P2 — Fix DishGallery hydration
**Owner:** unassigned · **Estimate:** 30 min
`DishDetail` is rendered without a `client:` directive in
`pages/dishes/[slug].astro`, so the embedded `DishGallery`'s
`useState`/`useEffect` never runs. The seed image for
`moussaka-greek/cover.jpg` is on record but won't render until
this is fixed. Two clean fixes:
- Add `client:load` to `<DishDetail>` in `[slug].astro` (simplest)
- Hoist gallery into a top-level `client:load` island like we did
  for `<DishMap>` (more surgical — only the gallery hydrates, not
  the whole detail view)

### P2 — Image upload UI
**Owner:** unassigned · **Estimate:** half-day
Build the upload widget for the edit wizard. Drag-drop a JPEG/PNG,
alt text field, license field (CC-BY-SA / public domain / etc),
credit line. Wire to `POST /api/media/upload`. Once uploaded,
attach to the dish via `POST /api/dishes/:slug/media`. Currently
the API exists but there's no UI to call it.

### P2 — Re-enable email verification
**Owner:** unassigned · **Estimate:** 30 min
Sign up at resend.com (free tier: 3k emails/month), set
`RESEND_API_KEY` in `/root/.env`, flip
`requireEmailVerification: true` and `sendOnSignUp: true` in
`apps/api/src/auth.ts`. Done.

### P2 — Set Telegram deploy-failure secrets
**Owner:** user · **Estimate:** 5 min
Add `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` to GitHub repo
secrets. Until then the deploy-failure alert added in Phase 8a
no-ops silently.

### P3 — Edit history UI
**Owner:** unassigned · **Estimate:** half-day
Show `edit_history` rows at the bottom of the dish detail page. Each
row: editor name, timestamp, action, diff (collapsible JSON).
Moderators+ see a "Revert" button.

### P3 — Rate limiting on dish mutations
**Owner:** unassigned · **Estimate:** 30 min
Add per-user rate limiting (e.g. 10 edits/hour) to prevent abuse.
Use `better-auth`'s rate limit infra.

### P3 — JSON-LD Recipe schema in dish detail
**Owner:** unassigned · **Estimate:** 1 hour
Add Recipe schema.org structured data (title, description,
ingredients, prep time, cook time, recipe yield, author). Google
Recipes rich results depend on this.

### P3 — OG / Twitter card meta tags
**Owner:** unassigned · **Estimate:** 1 hour
Add OpenGraph + Twitter card meta tags to all pages (especially
dish detail, with dish image as `og:image`). Currently only a
plain `<meta name="description">` exists.

### P3 — Internal link audit: ingredient pages
**Owner:** unassigned · **Estimate:** decision
Dish detail pages link to `/ingredients/<slug>` (e.g.
/ingredients/eggplant) but those pages don't exist. Either stub
404s or build ingredient pages. Build first or stub first — call
it.

### P3 — Phase 9 — Discoverability
**Owner:** unassigned · **Estimate:** ~14 hours across 3 phases
Map-based discovery + unified search. Plan summary:
- **9a (6h)** — `GET /api/dishes/nearby?lat=&lng=&radius_km=` using
  `ST_DWithin`. Front-end: `/near` page with geolocation prompt +
  manual lat/lng fallback. `<MapDiscovery>` island that shows the
  10 nearest dishes when you click a dot.
- **9b (5h)** — extend `GET /api/dishes?q=` to search dish +
  cuisine + geo_entity together. Add `pg_trgm` `similarity()` for
  fuzzy/typo tolerance. Add `result_type` field for grouping.
  Front-end: `<GlobalSearch>` island in header with grouped results.
- **9c (3h)** — "Cuisines near me" + taste-based similarity via
  shared categories and shared origin regions.

## Backlog (longer-term)

- **i18n** — frontend and content. README has this as Phase 7g.
- **Public read API for third parties** — rate limits + API keys.
- **Mobile-first redesign** — current layout is desktop-first; map
 