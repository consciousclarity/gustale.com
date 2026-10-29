# GUS-001 — Architecture audit (read-only)

**Date:** 2026-10-17 · **Auditor:** Hermes (gustale profile) · **Commit audited:** `a0c56a6` (main, post PR #80)
**Scope:** repository, database schema, services, routes, APIs, deployment configuration, content pipeline, unfinished features. Read-only; no code changed. Live checks against `api.gustale.com` / `gustale.com`.

---

## 1. Repository inventory

Single repo: `github.com/consciousclarity/gustale.com` (pnpm monorepo, Node 22, TypeScript strict).

```
apps/api        Fastify + better-auth backend (port 4000)
apps/web        Astro + React islands frontend (SSG; two domain variants)
packages/db     Drizzle schema, migrations, seed (source of truth for content)
packages/ui     Shared UI primitives (Button, Card, SearchInput)
infra/prod      Caddyfile, docker-compose.yml (reference), env example
infra/local     local dev compose
scripts/hermes  build-web-live.sh, rebuild-web-live.sh, systemd rebuild timer units
.github         ci.yml + nightly.yml (no dependabot.yml — see GUS-006)
.hermes         Operating docs: ROADMAP.md, BACKLOG.yaml, RULES.md, SHARED_STATE.md, TASKS.md (tracked on main since PR #78–#80)
```

## 2. Database schema (packages/db)

- **36 tables** in `packages/db/src/schema/index.ts` (Drizzle). Core: `dishes`, `dish_translations`, `dish_variants`, `dish_ingredients`, `dish_preparations`, `dish_categories`, `dish_tags`, `dish_relations`, `lineages`, `dish_lineages`, `sources`, `citations`, `dish_journey_beats`, `ingredients`(+variants/translations), `preparation_methods`(+translations), `categories`(+translations), `tags`, `geo_entities`, `food_regions`, `dish_regions`, `dish_locations` (+`*_sources` join tables), `media`, `media_attachments`, `users`, `sessions`, `edit_history`, `watch_list`, `comments`, `content_permissions`, `expert_credentials`.
- **13 migrations** (`0000`–`0012`; note dual `0005` files: `0005_food_geography_phase_2a.sql` and `0005_user_role_index.sql`). CI applies migrations from `git ls-files`, **not** the Drizzle journal — journal is documented as drifted (orphans / dual 0005 / missing 0007). Latest: `0012_media_variants.sql` (PR #78).
- **PostGIS + pg_trgm** extensions in use (`0005_food_geography`, `0007_pg_trgm`); geometry columns for origins (`originLocation` seen live as EWKB hex).
- Seed: `packages/db/src/seed-data/` — 121 dishes, 14 lineage entities (`LINEAGES`), 15 preparation-method entries (`LINEAGE_METHODS`), plus relations/journeys/categories. `validate.ts` seed gate runs in CI with `SEED_ALLOW_ORPHANS=1` (known dangling DISH_RELATIONS / DISH_LINEAGES orphans — parked, must fail PRs once cleaned).

## 3. Services & deployment

| Piece | State |
|---|---|
| VPS | Hostinger `62.72.7.218`; containers `gustale-api` (host net, :4000), `gustale-web-recipes` (:4001), `gustale-web-geo` (:4002); shared `shared-postgres` + `shared-minio` on host loopback |
| Domains | `gustale.com` + `gustale.recipes` (two web variants, same build, different `PUBLIC_DOMAIN`); `api.gustale.com` / `api.gustale.recipes` |
| Reverse proxy | Caddy: blocks `/admin` + `/api/admin/*` on public hosts (404), serves same-origin `/media/*` proxy to public MinIO bucket (PR #78), security headers, gzip/zstd |
| CI | `.github/workflows/ci.yml`: lint+biome → vitest w/ ephemeral PostGIS → docker build API + web (matrix recipes/geo, GHA cache) → SSH deploy (main only) → "Real verify" (deploy log + `docker inspect` SHA match + live-page phrase check) → Telegram notify. `.hermes/**` and `**/*.md` are paths-ignored. |
| Nightly | `nightly.yml`: full integration (regenerate schema, reseed, all tests) on cron 14:00 UTC + dispatch |
| Images | ghcr.io `consciousclarity/gustale.com/gustale-{api,web-recipes,web-geo}` |
| Backup | `gustale-backup.service` referenced by RULES (run before migrations); restore test = GUS-012 (open) |
| Rebuild timer | `gustale-rebuild-web.service/.timer` + `scripts/hermes/rebuild-web-live.sh` for content-only web rebuilds |

**Known live defect (feeds GUS-005):** PR #79 (merged `aa0fab0`) reordered deploy correctly on paper (API → healthcheck → live web build → web swap) but its run on main **failed** (run 39037580515): the SSH script calls `deploy_container` at "Step 3" **before the bash function is defined** (`bash: line 84: deploy_container: command not found`). ERR trap caught it; "Real verify" correctly failed the job. No partial deploy — live containers still on `ff1a88c` (PR #78). Function definition must move above first use; duplicate later API redeploy should be dropped.

## 4. API surface (Fastify, all mounted in server.ts)

Public read: `GET /health`, `GET /ready`, `GET /api/dishes` (paged, filters), `GET /api/dishes/:slug`, `GET /api/dishes/map`, `GET /api/dishes-by-region`, `GET /api/dishes/:slug/relations`, `GET /api/dishes/:slug/journey`, `GET /api/lineages`, `GET /api/ingredients`, `GET /api/ingredients/:slug`, `GET /api/categories`, `GET /api/tags`, `GET /api/search` (FTS + pg_trgm).
Write (auth): `POST /api/dishes`, `PATCH /api/dishes/:slug`, `POST /api/dishes/:slug/publish`, `DELETE /api/dishes/:slug`, `POST /api/dishes/:slug/variants`, `PATCH .../variants/:id`, `POST /api/dishes/:slug/media`, `POST /api/media/upload`, `GET /api/media/:id/signed-url`, `POST /api/tags`, `POST /api/categories`.
Admin: `GET /api/admin/{lookups,stats,dishes,dishes/:slug,dishes/:slug/sources}`, `POST /api/admin/dishes/:slug/sources` (blocked at Caddy on public hosts; reachable via gustale.recipes vhost).
Dashboard: `GET /api/dashboard/{drafts,submissions}`.
Auth: better-auth; **email verification currently OFF** (`auth.ts` TODO — pending Resend config).

## 5. Frontend (Astro SSG + React islands)

23 pages: home, dishes (list/detail/new/edit), lineages (list/detail), families + family/[slug], ingredients (list/detail), regions, map, about, contribute, account, login/register, dashboard, admin (dishes list/editor), 404.
Key islands: `DishExplorer`, `WorldMap`/`DishMap` (MapLibre), `DishGallery` + `DishCoverHero` (srcset variants, lightbox credit — PR #77 open), `DishJourney`, `GlobalSearch`, `AtlasHeroKpi` (SSR KPI band, P0-1), admin `AdminDishEditor`, dashboard widgets.
Web builds: GHA builds both variants against `PUBLIC_API_BASE`; deploy re-builds on VPS via `build-web-live.sh` against the freshly deployed API (live-data bake). Mock API (`apps/web/scripts/mock-api*.mjs/json`) supports offline builds.

## 6. Content pipeline

Seed-data (TS) → validate gate → drizzle migrations → API. Dish writes now possible via API (phase 7c, PR #75) + admin editor. Media: MinIO via API upload → variants (800/1536 webp) → same-origin `/media/*` (PR #78). AI image program in flight (IMAGE_STYLE.md; Indonesian batch: 10 dishes live with covers 2026-10-17, batch-2 ongoing on `private/state`). Rebuild detection: content-version based web rebuilds (PR #74).

## 7. Unfinished / parked features (evidence)

- Email verification OFF (`apps/api/src/auth.ts` TODO; branch `fix/p0-4-email-verification` stale-open).
- `comments`, `watch_list`, `content_permissions`, `expert_credentials` tables exist; no public UI routes found.
- Seed validate gate has `SEED_ALLOW_ORPHANS=1` escape hatch (orphan relations parked).
- Biome debt rules parked at "warn" in biome.json (ratchet TODO).
- `apps/web/src/pages/lineages/[slug].astro`, `AdminDishEditor.tsx` carry TODO/FIXME markers.
- PRs open and stale: #57 (bulk AI image upload script, Jul 24), #58–60 (Dependabot), #77 (gallery credit).
- VPS SSH deploy key documented at `~/.ssh/gustale-cd/id_ed25519` is **absent on this machine** (only GitHub `gustale_deploy` key present) — CLAUDE.md path stale; live DB/docker inspection from this host currently impossible.

## 8. Observed-condition verification (roadmap "observed" table)

| Claim | Result (2026-10-17, live API) | Verdict |
|---|---|---|
| 121 dishes | `GET /api/dishes` paged: **121, all `published`** | Confirmed |
| Homepage says 15 lineages, directory lists 14 | Homepage KPI = `<b>15</b> lineages`; `/lineages` = 14 entries; `GET /api/lineages` = 14 | **Root cause found:** `AtlasHeroKpi.astro` computes `lineages` as distinct `d.methodSlug` across dishes (15 distinct values from `LINEAGE_METHODS` seed), not the `lineages` table (14 rows). Semantic mislabel, not missing data. Fix under GUS-011. |
| Pages with only a Wikipedia source | Swept all 121 dish details: **121/121 cite Wikipedia only** (publisher/URL contains wikipedia; 0 dishes with non-Wikipedia source; 0 with no source) | Confirmed — universal; feeds EPIC 03 evidence work |
| "No detailed steps" | **120/121** dishes have `steps: null` on all preparations; sole exception: `moussaka-greek` | Confirmed |
| "Cover pending" | **110/121** have no cover image. 11 with covers: `moussaka-greek` + the 10 Indonesian batch dishes (nasi-goreng, pempek, rendang, gado-gado, babi-guling, rawon, sate-lilit, soto-ayam, sambal, satay) | Confirmed; GUS-153 territory, batch in flight |

Extra observations: 100/121 lack `longDescription`; 36 distinct origin countries; 22 distinct family slugs; no dish has >1 media item yet.

## 9. Roadmap-existence map (what of ROADMAP.md already exists)

| Roadmap item | Exists? | Evidence |
|---|---|---|
| GUS-004 migration discipline | **Partial** | 13 versioned migrations; CI applies full committed chain; journal drift documented; no rollback procedure/tests |
| GUS-005 CI reliability | **Partial** | Real lint gate (biome, no continue-on-error), real test job, Real verify step exist; deploy order fix (#79) merged but **broken in prod** (function-order bug) |
| GUS-007 GHCR auth | **Mostly done** | GHA token packages:write works for build/push; VPS-side push blocked by design (`GUSTALE_NO_PUSH=1`) |
| GUS-008 deployment verification | **Exists** | Real verify: deploy-log gate, image-SHA inspect, live-page phrase check; per-run logs |
| GUS-009 contract tests | **Partial** | vitest integration suite (dish write flow PR #75, media tests); no full CRUD/pagination/authz matrix |
| GUS-011 integrity checks | **No** | Nightly is build/test only; no duplicate/orphan/coordinate integrity report exists |
| EPIC 02 entity model | **Partial** | lineages, geo_entities, food_regions, dish_relations, journey_beats already in schema |
| EPIC 03 evidence | **Schema exists** | `sources` + `citations` tables live; but 100% of dishes Wikipedia-sourced (content gap) |
| EPIC 05 map | **Exists (basic)** | MapLibre map page + `/api/dishes/map` (PostGIS) |
| EPIC 09 search | **Exists (basic)** | `/api/search` Postgres FTS + pg_trgm, GlobalSearch island |
| EPIC 13 media library | **Partial** | Media pipeline + variants + public `/media/*` shipped (#78); 110 dishes coverless |
| GUS-013 feature flags | **No** | none found |

## 10. Risks / notes for sequencing

1. Deploy is currently one bug away from green (GUS-005 fix is a 10-line ci.yml change) — do it first among code tasks.
2. Every roadmap content claim is gated by the Wikipedia-only reality (121/121) — EPIC 03 is the critical path for credibility.
3. `private/state` vs `main` divergence (192/60 commits) is by design (`.hermes` split), but TASKS.md logging must stay on `private/state` while BACKLOG.yaml status lives on `main`.
4. This machine lacks VPS SSH access — deploy verification relies on CI's Real verify + public HTTP checks.
5. GitHub PAT lacks `security_events` scope → Dependabot alerts API (`/dependabot/alerts`) returns "Resource not accessible by personal access token". GUS-006 needs either a token re-scope (approval item) or UI-driven triage.

---
*Acceptance: report merged at `.hermes/REPORTS/GUS-001-architecture-audit.md`; covers inventory §1–7, observed-condition table §8, roadmap-existence map §9; read-only (no code changes).*
