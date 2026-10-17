# Gustale — Work Queue

> **Task queue shared across AI agents.** Each task has an owner (which
> AI or human is working on it) and a status. Pick up the next "todo" task
> when idle. Move to "in_progress" when you start, "done" when merged.
> Add new tasks below the "Backlog" header.

## In progress

- 2026-10-17: **PR #77 — DishGallery lightbox credit+license (prereq for Phase 11 image expansion).** Branch `fix/gallery-lightbox-credit`, commit `b46a43c` (+30/-0, 2 files: `apps/web/src/components/DishGallery.tsx`, `apps/web/src/styles/global.css`). Hero already shows credit/license; lightbox did not. URL: https://github.com/consciousclarity/gustale.com/pull/77. — gustale profile

- 2026-10-17: **Moussaka cover image live on both domains; CC BY-SA credit visible.** Confirmed via `curl https://gustale.recipes/dishes/moussaka-greek` and `https://gustale.com/dishes/moussaka-greek`: the static HTML now contains `Dieter Mueller via Wikimedia Commons (https://commons.wikimedia.org/wiki/File:Mousakas.jpg), CC BY-SA 3.0` and `CC-BY-SA-3.0` rendered by `<DishCoverHero>` (lines 96–99). The new `live-data-2f1f985` images are running on `gustale-web-recipes` and `gustale-web-geo`. — gustale profile

- 2026-10-17 by gustale profile — **PR #76: docs(hermes): record gustale profile as owner, workspace moved to /home/gustale/projects/gustale.com.** Updated `.hermes/PROJECT.md` on main: owner is now the `gustale` profile (formerly Hermes), workspace path is `/home/gustale/projects/gustale.com`. Squash-merged into main at `2f1f985`. Docs-only; CI `paths-ignore` correctly skipped Docker pipeline. 1 file, +3/-3.

## Done (recent — last 10)

- 2026-10-17 by gustale profile — **DB corrections verified (live query, not from reports).** (1) `SELECT count(long_description) FROM dishes WHERE status='published'` = **21** (not 0). (2) `SELECT id, slug, canonical_name, count(refs) FROM ingredients WHERE slug ILIKE '%bechamel%'` returned **2 rows**: `bechamel` (id `57f6dda0…`, 1 ref, published) and `bechamel-sauce` (id `33f93412…`, 0 refs, published), both with `canonical_name = 'Béchamel sauce'`. The duplicate is real. Public API `/api/ingredients` returns both. Merge proposal: keep `bechamel` (has the reference and is alphabetically shorter); move `bechamel-sauce` to an alias; redirect `/ingredients/bechamel-sauce` to `/ingredients/bechamel`. Merge plan filed as TODO below.

- 2026-10-17 by gustale profile — **Ran `rebuild-web-live.sh` directly with docker group active (group 988).** Image built `live-data-2f1f985`, deployed to `gustale-web-recipes` and `gustale-web-geo` on VPS, both `running healthy`. First run failed at `rm -f /tmp/gustale-web-live-tag.env` because the file was owned by `root:root` (left over from a previous systemd-driven run; `/tmp` sticky bit blocked `gustale` from removing it; the `set -euo pipefail` propagated the failure into the inner `build-web-live.sh`, even though the outer wrapper's `tail -200` reported exit 0). Cleared the file via `docker run --rm -v /tmp:/tmp --user root alpine:latest rm -f /tmp/gustale-web-live-tag.env`, then re-ran. State-file write still fails (the `/var/lib/gustale-rebuild/` dir is owned by `hermes:hermes` from 2026-07-25) — but the actual image deploy succeeded and the containers are healthy. The systemd timer will refresh the state file on its next tick under the `hermes` user. **Real bug surfaced:** non-root users of the rebuild script hit these two permission collisions. Should be fixed in a follow-up PR (make the build script self-heal: `chmod` its own tag file before `rm -f`, and write state.json via `install -m 0644` so the dir doesn't matter).

- 2026-07-25 by Hermes Agent (Telegram) — **Ops run: Applied Migrations 0009, 0010, 0011 to Production.** (1) Backed up database to `/home/deploy/gustale.com/backups/gustale_pre_migration_0009_20260725T121711Z.dump` (sha256 `9fdc5c3fcd823cbe...`, TOC count `1086`). (2) Applied migrations 0009 (db invariants), 0010 (surrogate pks), and 0011 (dish ingredients pk) in strict order as postgres superuser. (3) Resynced drizzle sequence and inserted tracking rows for all three migrations, bringing the drizzle tracking count to 9. (4) Verified pg_constraint return p and u constraints for all 11 modified tables plus dish_ingredients, confirmed published dish count remains 121, all API smoke routes return 200, and PostGIS geometries are unchanged.

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

## Backlog

### P0 — Data-coverage funnel (largest gap, 2026-10-17 audit)
**Owner:** unassigned · **Discovered:** 2026-10-17 (gustale profile)

Live DB reality check — published dishes: 121. Cross-tabulation:

| what | count | % of 121 |
|---|---|---|
| have `longDescription` | 21 | 17% (the 11-dish India batch + others) |
| have a `cover` media attachment | 1 | <1% (moussaka-greek only) |
| have **both** longDescription AND cover | **0** | **0%** |
| have **zero** ingredients (no `dish_ingredients` rows) | **120** | **99%** |
| have **zero** media attachments (cover OR gallery) | **120** | **99%** |

The published ingredients table is itself a skeleton: **5 published, 4 actually used, 4 total `dish_ingredients` rows across 121 dishes.** Only `moussaka-greek` (bechamel, position 3) has a real recipe ingredient chain. The "Phase 11 image-licensing" perception in prior memory is wrong: the actual state is *near-zero media coverage*.

**Implication for the queue:**
- "Wikimedia covers" is a **120-dish task**, not a small follow-up.
- "Ingredients for all dishes" is a **120-dish task** and the data model needs serious thought (which ingredients? canonical or free-text? what sources?).
- "Japan long descriptions" is a sub-batch of the 100 dishes that don't have longDescription.
- The "all 11 India dishes are cookable" framing in older notes is a fiction: 11 have longDescription but only 1 has ingredients.

**Recommendation:** before scaling content, ship (a) the béchamel merge (P0 below — schema prerequisite for an alias table that the canonical ingredient model will need anyway); (b) the rebuild-script permission fix; (c) a `longDescription` template + source-tracker schema that the Japan + remaining 89 dishes can share. Then attack the funnel in this order: (1) long descriptions (100 remaining); (2) media covers (120 remaining); (3) ingredients (120 remaining). Each is research-heavy and should be batched (10–15 per PR, not 120 in one).

### P0 — Merge `bechamel` + `bechamel-sauce` duplicate ingredient
**Owner:** unassigned · **Discovered:** 2026-10-17
**Evidence (live DB):**
- `bechamel` (id `57f6dda0-af1f-4bbc-a5c5-5009cf4bff05`, `canonical_name='Béchamel sauce'`, status=published, 1 reference from `moussaka-greek` dish_ingredients at position 3).
- `bechamel-sauce` (id `33f93412-19d4-5365-976b-9b3ece95af5f`, `canonical_name='Béchamel sauce'`, status=published, 0 references, 0 variants, 0 translations).
- Both appear in the public `/api/ingredients` list with `dishCount=1` and `dishCount=0`.

**Merge plan:**
1. **Keep `bechamel`** (id `57f6dda0…`): it has the real reference, is alphabetically shorter, and is the form used by the Moussaka recipe in the seed.
2. **Add `bechamel-sauce` as a slug alias** on the surviving row. This requires (a) making `slug` non-unique (drop the unique constraint) or (b) adding an `ingredient_aliases` table. The current schema has only `ingredients.slug` (unique) and `ingredient_variants.name` (per-ingredient). **No alias mechanism exists today.**
3. **Recommended schema change:** new table `ingredient_aliases(ingredient_id uuid REFERENCES ingredients(id), alias text, source text, created_at)` plus a partial unique index on `LOWER(alias)`. This generalises beyond this one case.
4. **Migration order:** (a) backfill `bechamel-sauce` → `bechamel` alias; (b) DELETE the orphan row (id `33f93412…`) AFTER backfill and AFTER confirming no FK references exist; (c) add the alias table.
5. **Web redirects:** `apps/web/src/pages/ingredients/[slug].astro` should 301 redirect any slug not found in `ingredients.slug` to a slug found in `ingredient_aliases`. Add a small `resolveIngredientSlug` helper in `apps/web/src/lib/api.ts` that tries the slug, then the alias, and returns the canonical dish page.
6. **API:** add `GET /api/ingredients/by-alias/:alias` if we want the API to surface the alias table for editors; not required for read-side redirect.

**Risk:** The slug column is `text not null unique`. If the migration in step 2 is done before the alias table exists, the temporary state allows both rows to coexist (no FK conflict), but external links to `/ingredients/bechamel-sauce` will 404 unless step 5 is shipped in the same release. Coordinate deploy.

**Owner estimate:** ~½ day. DB migration + web redirect + smoke test.

### P1 — PR #57: 60-AI-generated dish images, needs review before merge
**Owner:** unassigned · **Discovered:** 2026-10-17

`feat(scripts): bulk-upload 60 AI-generated dish images + gitignore` — still open, no merge conflict yet.

**Why this needs review now (not auto-merge):**
1. **Content rules say** "Wikimedia Commons is preferred for covers" and "AI images only used when nothing exists and must be labelled as illustrations". A bulk upload of 60 AI images as primary content is the opposite of the rule.
2. PR was opened before PR #77 (DishGallery lightbox credit/license), so even if the AI images had credit strings, they wouldn't be visible on the lightbox yet.
3. The 60 AI images would crowd out the 120 remaining Commons-covers work because once AI covers are attached, replacing them with Commons requires deleting media_attachments and re-uploading.

**Recommendation:** **do not merge as-is.** Either (a) close in favor of the Commons-priority plan in the data-coverage funnel, or (b) get explicit user sign-off that the 60 AI images are wanted as placeholders with a clear "swap-to-Commons" migration step, AND require the PR author to add a `source_acknowledged: ai-illustration` field to each upload so the front-end can label them.

### P1 — Dependabot: 3 open PRs, all major-version jumps
**Owner:** unassigned · **Discovered:** 2026-10-17

- **#58** `chore(deps-dev): bump vitest from 2.1.9 to 4.1.11` — major-skip. Affects test runner; PR #75 (test-dish-7c) was merged at 2.x, so a 4.x bump may need test-rewrite. Coordinate with the API test pass.
- **#59** `chore(deps): bump maplibre-gl from 5.24.0 to 6.4.1` — major. The per-dish `<DishMap>` and standalone /map use MapLibre. PR #1 shipped this; 6.x is a breaking bump (style spec, marker API). Should go through a smoke test on a staging deploy, not direct-to-main.
- **#60** `chore(deps): bump astro from 6.4.7 to 7.2.8` — major. The whole `apps/web` is built on Astro; a major bump is days of work. Defer until after Phase 11 image-licensing is shipped.

**Recommendation:** close #58/#59/#60 for now with a comment explaining the deferral; revisit post-Phase-11. Add a `dependabot.yml` `groups` config so minor/patch updates still flow automatically.

### P1 — Fix `rebuild-web-live.sh` permission collisions for non-root runners
**Owner:** unassigned · **Discovered:** 2026-10-17 (gustale profile run)

**Evidence:**
- First run today failed at `rm -f /tmp/gustale-web-live-tag.env` because the file was owned `root:root` from a prior systemd-driven run, and `/tmp`'s sticky bit blocked `gustale` from removing it. `set -euo pipefail` propagated this into the inner `build-web-live.sh`.
- Final step also failed: `cat > /var/lib/gustale-rebuild/state.json.tmp.693433` → "Permission denied" because that dir is owned `hermes:hermes`.
- The wrapper's `tail -200` masked the exit code so CI/deploy dashboards saw a green exit.
- Cleared the tag file via `docker run --rm -v /tmp:/tmp --user root alpine:latest rm -f /tmp/gustale-web-live-tag.env` as a workaround.

**Fix:**
1. In `build-web-live.sh`, before the `rm -f` of `$TAG_FILE`, run `chmod 0666 "$TAG_FILE" 2>/dev/null || true` and `chmod 1777 /tmp 2>/dev/null || true` (no-op if already correct).
2. Switch the state-file write to `install -m 0644 /dev/null "$STATE_FILE.tmp" < <(jq -n …)` so it does not depend on the parent dir's group.
3. Outer wrapper: replace the `| tail -200` with `tee /var/log/gustale-rebuild-$(date -u +%s).log | tail -200` AND propagate the real `$PIPESTATUS[0]` (or just drop the `| tail` and use `--lines=200` in the logfile). The current masking is a real safety defect: failed deploys can look successful.
4. Add a `--no-restart` flag for cases where we only want to rebuild (CI does its own restart via GHCR pull).
5. Add a `--check` mode that just prints what it would do.

**Estimate:** ~2h. Real bug. Worth filing.

## Backlog (longer-term)

- **i18n** — frontend and content. README has this as Phase 7g.
- **Public read API for third parties** — rate limits + API keys.
- **Mobile-first redesign** — current layout is desktop-first; map
 