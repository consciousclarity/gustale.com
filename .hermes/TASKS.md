# Gustale — Work Queue

> **Task queue shared across AI agents.** Each task has an owner (which
> AI or human is working on it) and a status. Pick up the next "todo" task
> when idle. Move to "in_progress" when you start, "done" when merged.
> Add new tasks below the "Backlog" header.

## In progress

(none)

## Done (recent — last 10)

- 2026-06-18: Standalone /map page replaced with per-dish `<DishMap>`
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
  fetch on hydration. Real-signup smoke test pending (real session
  signup worked end-to-end; full upload→attach→render chain verified
  via curl response, but the live render verification got cut off).
  — Hermes
- 2026-06-17: Phase 7d prep — MinIO client lib + buckets (`gustale-public`
  anonymous, `gustale-media` private) + multipart deps — Hermes
- 2026-06-17: Dish detail page (SSG, 31 pages, real 404 for unknown slugs) — Hermes
- 2026-06-17: Auth UI (login/register/account/AuthMenu) — Hermes
- 2026-06-17: Auth plugin body-parsing bugfix — Hermes
- 2026-06-17: 31-dish encyclopedia seed (Wikipedia-sourced) — Hermes
- 2026-06-17: Full-stack deploy (nginx-served static web, Fastify API) — Hermes
- 2026-06-17: Cross-subdomain cookie wiring (CORS, trustedOrigins) — Hermes

## Backlog

### P1 — Write API (UNBLOCKED)
**Owner:** unassigned · **Estimate:** half-day
Add `POST /api/dishes`, `PATCH /api/dishes/:slug`, both auth-gated.
Use Zod for input validation (already a project dep). Enforce role
checks: any authenticated user can create drafts; only moderators+
can publish. Audit trail: every write creates an `edit_history`
row with the diff. Blocks the edit wizard.

### P1 — Edit wizard UI
**Owner:** unassigned · **Estimate:** 1-2 days
Multi-step form at `/dishes/new` and `/dishes/:slug/edit`. Steps:
basics → origin (lat/lng picker using Leaflet, since we already
have the dependency) → categories (multi-select) → ingredients
(search + add) → preparations (method + steps + duration) →
review → submit. Drafts auto-save. Reuses
`packages/db/src/seed-data.ts` shape.

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

### P2 — Image upload UI
**Owner:** unassigned · **Estimate:** half-day
Build the upload widget for the edit wizard. Drag-drop a JPEG/PNG,
alt text field, license field (CC-BY-SA / public domain / etc),
credit line. Wire to `POST /api/media/upload`. Once uploaded,
attach to the dish via `POST /api/dishes/:slug/media`. Currently
the API exists but there's no UI to call it.

### P3 — Phase 9 — Discoverability
**Owner:** unassigned · **Estimate:** ~14 hours across 3 phases
Map-based discovery + unified search. Plan summary:
- **9a (6h)** — `GET /api/dishes/nearby?lat=&lng=&radius_km=` using
  `ST_DWithin`. Front-end: `/near` page with geolocation prompt +
  manual lat/lng fallback. `<MapDiscovery>` island that shows the
  10 nearest dishes when you click a dot. (PostGIS already loaded,
  data already has origin coords.)
- **9b (5h)** — extend `GET /api/dishes?q=` to search dish +
  cuisine + geo_entity together. Add `pg_trgm` `similarity()` for
  fuzzy/typo tolerance. Add `result_type` field for grouping.
  Front-end: `<GlobalSearch>` island in header with grouped results.
- **9c (3h)** — "Cuisines near me" + taste-based similarity via
  shared categories and shared origin regions.

### P3 — Edit history UI
**Owner:** unassigned · **Estimate:** half-day
Show `edit_history` rows at the bottom of the dish detail page. Each
row: editor name, timestamp, action, diff (collapsible JSON).
Moderators+ see a "Revert" button.

### P3 — Rate limiting on dish mutations
**Owner:** unassigned · **Estimate:** 30 min
Once write API exists, add per-user rate limiting (e.g. 10
edits/hour) to prevent abuse. Use `better-auth`'s rate limit
infra.

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

## Backlog (longer-term)

- **i18n** — frontend and content. README has this as Phase 7g.
- **Public read API for third parties** — rate limits + API keys.
- **Mobile-first redesign** — current layout is desktop-first; map
  needs mobile UX (pinch-zoom already works via Leaflet, but
  bottom-sheet style overlays for the map popup).
- **DMCA process** — required for opening up open editing publicly.
  Document in `docs/dmca.md`.
- **Moderator UI** — review queue at `/moderation` for pending
  edits.
- **API delete `/api/dishes/map`** — currently unused server-side
  after the standalone `/map` page was removed. Kept for Phase 9
  nearby-dishes work. If 9a doesn't materialize in 6 months,
  delete the endpoint and the dead route in
  `apps/api/src/routes/dishes.ts`.