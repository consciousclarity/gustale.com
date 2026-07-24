# Gustale — Work Queue

> **Task queue shared across AI agents.** Each task has an owner (which
> AI or human is working on it) and a status. Pick up the next "todo" task
> when idle. Move to "in_progress" when you start, "done" when merged.
> Add new tasks below the "Backlog" header.

## In progress

- **U0/U0-C browse usability** — `feat/u0c-browse-usability` @ `2ea9df95f95e67b35bfba2a97b4728f434a286db`, PR #37 (open, draft, awaiting human review/merge). Independently verified PASS on 2026-07-24. Do not mark done until PR #37 merges.

## Codex — usability-first (.com)

Source: `.hermes/CODEX_BRIEF_USABILITY.md` (2026-07-23).
Owner target: Codex. Domain: **gustale.com** only for product UX; recipes stay on **gustale.recipes**.

- [x] Greptile PR #29 P1 cover/gallery duplicate + P2 duplicate CSS — done in PR #33
- [x] U0 trust (never-zero home, covers, search, /family/:slug, domain switcher) — done in PRs #34 + #36
- [ ] U1 browse usability (home + lists + mobile find + empty states) — see in-progress PR #37
- [ ] U2 Journey + confidence flagships
- [ ] U3 Atlas→Recipes CTAs / never-blank prep

## Competitive roadmap (source of truth)

Full detailed backlog with problem / scope / done-means lives in
**`.hermes/COMPETITIVE_ROADMAP.md`** (added 2026-07-22). Positioning:
Gustale = open atlas of how food moved — not a recipe homepage, not a
travel blog. Mirror IDs below; update both files when claiming work.

### Wave A — Trust (pick first)
- [x] **P0-1** Homepage never shows zeros before hydration — done in PR #31
- [x] **P0-2** Dish cover / media reliability — PR #29 (media-first Phase A; merged via PR #33 with Greptile P1/P2 cleanups)
- [x] **P2-7** MapLibre CSS only on map routes — done in PR #30
- [ ] **P0-4** Re-enable email verification (Resend + `hello@gustale.com`)

### Wave B — Stand-out core
- [ ] **P1-1** Dish Journey UI (timeline + map path) + seed 10–15 flagships
- [ ] **P1-5** Surface scholarly confidence on homepage + About
- [ ] **P1-4** `/stories` layer (launch ≥5) + homepage rail
- [ ] **P1-6** Atlas → Recipes bridge / never-blank prep section

### Wave C — Science + geography moat
- [ ] **P1-2** Ingredient origins (`food_geography` seed) + `/ingredients`
- [ ] **P1-3** Region guides for top 12 regions
- [ ] **P2-2** Country ↔ crop-origin connectivity visualization

### Wave D — Density + contribution
- [ ] **P2-3** Seed enrichment pass (≥90 dishes, 0 skipped relations, fix orphans)
- [ ] **P2-4** Moderation queue UI
- [ ] **P2-5** Image upload UI
- [ ] **P2-1** “Also on the table” companions
- [ ] **P2-6** OG cards + honest JSON-LD
- [x] **P0-3** Global grouped search (dish/region/lineage/ingredient) — done in PR #32

### Wave E — Moat
- [ ] **P3-1** Nearby / geolocation discovery
- [ ] **P3-2** Public read API + attribution
- [ ] **P3-3** i18n
- [ ] **P3-4** Brand/handle lock-in (human)
- [x] **P3-5** Real linting (Biome) in CI — DONE via PR #40 (2026-07-24; non-breaking, error rules parked at warn, ratchet pending)

## Done (recent — last 10)

- 2026-07-24 by Claude Code (terminal) — **CI hardening + prod deploys.** Merged to `origin/main` (now `8f52282`) and deployed: **#38** (remove invalid pnpm cache from Docker jobs), **#37** (U0-C browse/list usability), **#41** (gitignore `dist-recipes/` + `graphify-out/`), **#40** (real Biome lint gate, non-breaking). Prod verified healthy (gustale.com 200, gustale.recipes 200, api health 200). **#39** (nightly full migration chain) left DRAFT/blocked — Nightly dispatch fails at "Apply committed schema" (spurious generated `0006_worthless_riptide.sql` from journal drift; fix = glob committed files via `git ls-files`). SiteHeader keep-vs-redesign → **KEEP Nav.astro** (WIP superseded by #34/#36).

- 2026-07-24 by Hermes Agent (Telegram) — **U0/U0-C browse usability verified and pending merge.** PR #37 (`feat/u0c-browse-usability` @ `2ea9df95f95e67b35bfba2a97b4728f434a286db`) independently verified PASS on 2026-07-24: 12/12 search-nav tests, 17/17 browse tests, tsc clean, only pre-existing `AtlasHeroKpi.astro` baseline error, build:recipes 50/50, build:geo 53/53. Browser evidence: pagination 24→48→60 with all 60 slugs unique, Load more disappears at 60, Back/Forward/Refresh restore correct page, popstate does not grow history, search resets page to 1, later-page failure retains 48 cards with friendly Retry → 60, mock country matching exact case-insensitive, mobile 320×720 zero overflow. PR is open in draft; awaiting human review → mark ready → merge → production smoke. Do not mark U1 done until PR #37 merges.

- 2026-07-23 by Hermes Agent (Telegram) — **Wave A of `COMPETITIVE_ROADMAP.md` shipped to `origin/main` via five squash-merges: PR #30 (P2-7 MapLibre CSS scope), PR #31 (P0-1 homepage SSR real counts), PR #32 (P0-3 global grouped search), PR #33 (Greptile PR #29 cleanup: cover/gallery duplicate + duplicate CSS), PR #36 (U0 navigation + search).** PR #35 (custom HTTP 404 from nginx) also landed the same day. PR #34 (U0 trust: domain routing, family SSG, Atlas→Recipes CTAs) closed U0. The full PR list (#30, #31, #32, #33, #34, #35, #36) brought Wave A to completion. U0-C browse/list usability is the next deliverable as PR #37 (draft, awaiting review/merge).


- 2026-07-22: **Verified the "15 dishes missing methodSlug/lineage" cleanup is already resolved** (no code change needed; stale note cleared in SHARED_STATE.md). All 60 published dishes have a `methodSlug` across seed source (`DISH_LINEAGES` 60/60), SSG mock (`mock-api-data.json` 0/60 null), and live API (0/60 null); live `/lineages` has no "Other" bucket. Named dishes in the old note (Kimbap, Croffle, Som tam, Butter chicken, Tandoori chicken, Tteokbokki) aren't in the dataset at all. Also flagged 13 harmless orphan `DISH_LINEAGES` keys for optional cleanup. **DB password rotation** was requested in the same turn but is NOT executable from the Cursor Cloud Agent sandbox (no VPS SSH key / no DB creds injected) — a ready-to-run runbook is recorded in SHARED_STATE.md "Pending User Asks" for Hermes / a VPS-root operator. — Cursor Cloud Agent

- 2026-07-22: **Editorial site header + dish cover hero** (PR #28, `cursor/gallery-and-nav-editorial-6cb3`). Landed config-driven SiteHeader/NavSearch/MobileNav on current main (avoids /families taxonomy regression from old PR #8). DishDetail hero now fetches cover signed URL on hydration; gallery restyled to editorial tokens. — Cursor Cloud Agent

- 2026-06-26: **/lineages real-lineage data fix** (PR #9, `feat/lineages-data-fix`, base `feat/nav-editorial` — stacked). Root cause: `seedEncyclopedia()` never wrote `dish_preparations`, so 59/60 published dishes had `methodSlug=null` → all "Other preparations". Also found: (1) the static `/lineages` is built from `mock-api.mjs`, not the DB — its dish list lacked `methodSlug`/`originName`, so the page was "other" regardless of DB; mock was stale (31 vs 60 dishes); (2) the live `/api/dishes` **list endpoint returns HTTP 500** (map endpoint fine) — runtime issue in the deployed API image, **needs VPS investigation + redeploy** (no VPS SSH on my end). Fix: `seed-data.ts` adds `LINEAGE_METHODS` (16, 1:1 with page `LINEAGE_LABELS`) + `DISH_LINEAGES`; `seed.ts` seeds methods + idempotent per-dish prep pass; `mock-api.mjs` → 60 dishes emitting `methodSlug`+`originName`; `lineages.astro` fixes stew/curry double-label + adds 4 stories. **Live geekom DB updated directly** (idempotent SQL): 16 methods, 60 dish_preparations, 0 published without a prep. typecheck + astro check clean; web build emits 16 distinct lineages, no "other", featured = Stews & braises (11). **VPS owner: please debug the `/api/dishes` 500 + redeploy the API.** — Claude Code

- 2026-06-26: **Editorial site header pushed + PR opened.** Rebased onto `main`, 8 files (+1215/-357), two new React islands (`MobileNav.tsx` full-bleed mobile takeover, `NavSearch.tsx` full-bleed search overlay) + new typed `lib/navigation.ts` config. `astro check` 0/0. Families `originName` fix rides along as identical patch on the taxonomy branch — Git dedups on merge. `gh` CLI auth not configured this session, so the PR body was drafted as `pr-nav-editorial-body.md` at workspace root for Alex to paste into the GitHub PR description textarea. — Mavis

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

### P1 — Configure real linting in `apps/api`, `apps/web`, `packages/db` — ✅ RESOLVED by PR #40 (2026-07-24)
**Owner:** Cursor Cloud · **Resolved:** 2026-07-24 (was Deadline 2026-09-30)

**Resolution.** Biome (`@biomejs/biome@2.5.5` + root `biome.jsonc`) is now the real gate — root `lint` → `biome check .`, CI `Lint` job runs it (not the `echo 'lint ui'` stub), no `continue-on-error`. Non-breaking rollout: ~136 files auto-fixed; remaining error-level rules parked at **warn** with a ratchet TODO, so warnings alone do NOT fail CI today while the debt is worked down (see the "Biome ratchet" item in Backlog (longer-term)). Original problem statement kept below for history.

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

### P3 — Seed-data enrichment pass (dishes, methodSlug, ingredients, relations)
**Owner:** unassigned · **Estimate:** ~1 day
Surfaced 2026-06-25 (PR #6, homepage). All `packages/db/src/seed-data.ts`
content quality. The homepage code is correct and degrades gracefully;
these are data gaps that keep several surfaces sparse. Merged from two
earlier items after a read-only audit of `DISH_RELATIONS` vs `DISHES`.

Audit results (60 dishes, 110 relation entries = 220 directed edges; 31
entries reference a dish slug not in `DISHES`, so 31 edges silently drop
on seed):

**(a) ~25 referenced dishes are missing from `DISHES`** — NOT typos (an
edit-distance check produced only false positives; these are real,
distinct dishes the relation graph names but the dish set never added).
Recovering these edges means *adding the dishes*, then re-seeding. The 27
distinct dangling slugs:
`samosa ×3, soba ×2, sambal ×2, menemen, fries, idli, cotoletta,
tonkatsu, döner, bacon-and-cabbage, fish-cake, focaccia, pita, curry,
lechon, kofta, porridge, patacones, vada, humita, bulgur, lamb-and-rice,
ikan-bakar, poke, baba-ganoush` — plus the two moussaka variants below.

**(b) 2 moussaka-variant slugs** — `musakka-turkish`, `moussaka-levant`
are referenced but don't exist; almost certainly intended as regional
variants of the existing `moussaka-greek`. The only true data
*inconsistency* (vs missing content). Quick optional sub-task: remap
these two to `moussaka-greek` (or add them as dishes) to cut "31 skipped"
toward zero without a full content pass.

**(c) Dishes missing `methodSlug`** — across the 60 dishes only **2
distinct `methodSlug` values** exist, so `/families` and the homepage
"Families & lineages" rail collapse most dishes into "Other".
`FAMILY_LABELS` in `families.astro` already anticipates ~16 families.
Populate `methodSlug` per dish using the existing family slugs.

**(d) Sparse ingredients** — only 4 published ingredients; enrich
alongside the dishes for a fuller `/ingredients` + homepage schema stat.

**Do it as one pass:** add the missing dishes (a) with proper
`methodSlug` (c) and ingredients (d); fix the moussaka slugs (b); re-run
`pnpm --filter @gustale/db run seed` (idempotent) and confirm "0 relation
entries skipped". Re-running the read-only audit: a ~30-line tsx script
over `DISHES`/`DISH_RELATIONS` (see PR #6 session) regenerates the
dangling list on demand.

## Backlog (longer-term)

- **P1 — Drizzle journal reconcile (blocks #39).** `packages/db/drizzle/meta/_journal.json` is out of sync with on-disk `*.sql` (orphans: `0003_add_filter_indexes`, dual `0005_*`, `0007_pg_trgm`). The drift makes `drizzle-kit generate` emit spurious migrations at runtime (e.g. `0006_worthless_riptide.sql` re-creating `dish_lineages`) — which is what breaks nightly #39. Align the journal with the committed SQL. Until then, nightly must apply the **committed** filesystem-sorted set (NOT journal-only — see §5 non-goal).
- **P1 — Biome ratchet (from #40).** Promote rules parked at `warn` in `biome.jsonc` back to `error` in small PRs, in order: a11y cluster → suspicious → `useExhaustiveDependencies`. Track counts; no big-bang. Parked: a11y (`noStaticElementInteractions`, `noSvgWithoutTitle`, `useAriaPropsSupportedByRole`, `useButtonType`, `useGenericFontNames`, `useKeyWithClickEvents`, `useSemanticElements`, `useValidAnchor`); correctness (`noUnknownTypeSelector`, `useExhaustiveDependencies`); security (`noDangerouslySetInnerHtml`); suspicious (`noArrayIndexKey`, `noAssignInExpressions`, `noShadowRestrictedNames`, `useIterableCallbackReturn`).
- **P3 — Nav config extract (optional).** Only if wanted: extract a typed nav config module used *inside* the shipped `Nav.astro` — no UX change, complementary refactor, NOT a SiteHeader restore. (Product decision 2026-07-24: keep U0-B Nav.astro; SiteHeader superseded.)
- **i18n** — frontend and content. README has this as Phase 7g.
- **Public read API for third parties** — rate limits + API keys.
- **Mobile-first redesign** — current layout is desktop-first; map
 