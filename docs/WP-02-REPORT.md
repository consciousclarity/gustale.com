# WP-02 v2 delivery report

Date: 2026-11-11. Branch: feature/wp-02-pagination.

## Scope and verification

Implemented the revised brief: complete directory pagination, a build-failing count gate, an explicit production SHORT LIST check, and the approved places wording. No API code, limit ceiling, database, family vocabulary, lineage indexing, WP-01 behavior, deployment, or PR was changed.

Verified that listDishes in apps/web/src/lib/api.ts passes the typed DishListResponse through unchanged, including total, for filtered and unfiltered queries. The API list and total share the same WHERE clause. No API-side exception was needed.

The new helper uses ListDishesParams and DishSummary, requests at most 100 rows at a time, and verifies a valid stable total, collected count, and distinct slugs before returning. Errors propagate out of both Astro pages. Empty/short responses, duplicate slugs, changing totals, or runaway pagination cannot silently produce an incomplete directory.

## Files changed and why

- apps/web/src/lib/browse.ts: add the typed, gated directory pagination helper next to buildCountryDirectory; retain all origin dish names so search covers the full catalogue.
- apps/web/src/pages/regions.astro: paginate all published dishes, propagate build failures, and label the directory “Dish origins” with an origins count.
- apps/web/src/pages/families.astro: use the same complete catalogue and propagate failures; retain the existing family vocabulary.
- apps/web/src/components/CountryDirectory.tsx: show “+ N more” after five sample names, and use origin wording in search/status text.
- apps/web/src/components/Nav.astro: label origin-directory navigation “Dish origins”.
- apps/web/src/components/design/PlacesList.tsx: label the home map-derived distinct-place list “Mapped places”, including its empty state.
- apps/web/src/components/AtlasHeroKpi.astro: label the atlas places statistic “Published place associations”; leave its value and existing zero-stat visibility policy unchanged.
- apps/web/scripts/validate-build.mjs: update existing origin-directory heading/navigation assertions to the approved “Dish origins” wording.
- apps/web/scripts/test-directory-build-gate.mjs: retain the regression test that builds each actual Astro directory page against an intentionally incomplete local API fixture.
- scripts/smoke/gustale-smoke.mjs: add directory-list-not-short, recognize the origins label, and compare places-stat against published-associated places from /api/places (including response count/list consistency), instead of comparing to origins or requiring a positive number. The new coverage check counts the 22 real family slugs in use and excludes the existing fallback Other bucket. family-counts-agree and the lineage check are unchanged.
- docs/WP-02-REPORT.md: replace the stopped report with this delivery evidence, preserving the WP-02b diagnosis below.

Pre-existing supporting documents and deleted old task briefs in the working tree were left untouched and excluded from this delivery.

## Gate-fails test, retained in the repository

Command: node --test apps/web/scripts/test-directory-build-gate.mjs

The local fixture returns one dish, total 2, hasMore false. The test imports the actual pages and helper through isolated Astro builds. It asserts a nonzero build exit, the SHORT diagnostic, and no written directory page.

```text
TAP version 13
# regions: Astro exit 1; collected 1 (1 distinct), API says 2; page absent
# Subtest: regions: short list fails Astro build before writing page
ok 1 - regions: short list fails Astro build before writing page
  ---
  duration_ms: 3987.24888
  type: 'test'
  ...
# families: Astro exit 1; collected 1 (1 distinct), API says 2; page absent
# Subtest: families: short list fails Astro build before writing page
ok 2 - families: short list fails Astro build before writing page
  ---
  duration_ms: 3896.202517
  type: 'test'
  ...
1..2
# tests 2
# suites 0
# pass 2
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 8020.358573
```

## Places measures

“Dish origins” describes the originName directory; “Mapped places” describes the home list derived from coordinate-bearing dishes; “Published place associations” describes the atlas statistic, which counts distinct place entities associated with published dishes, not association rows.

places-stat now compares atlas/counts.places with /api/places.count and its returned places length. The current matching measure is 0/0 and passes. No number was changed to 178 origins, 121 located dishes, or 36 mapped places. The places endpoint additionally requires active geo entities; any future discrepancy involving inactive associated entities should be investigated in the API package rather than hidden by changing this statistic.

## Checks

- node scripts/run-lint.mjs: exit 0; Biome checked 243 files.
- node --test apps/web/scripts/test-directory-build-gate.mjs: exit 0; both actual Astro builds correctly fail with the short fixture, no page written (output above).
- PUBLIC_DOMAIN=recipes BUILD_DATA_SOURCE=live PUBLIC_API_BASE=http://127.0.0.1:4000 pnpm --filter @gustale/web run build:recipes: exit 0; all taxonomy + domain checks passed.
- Recipes generated output: 178 origin cards; their dish counts sum to 1474. Indonesia has 193 dishes with “+ 188 more”. Family directory contains 22 actual slugs plus its unchanged Other bucket.
- PUBLIC_DOMAIN=geo BUILD_DATA_SOURCE=live PUBLIC_API_BASE=http://127.0.0.1:4000 pnpm --filter @gustale/web run build:geo: exit 0; all taxonomy + domain checks passed. Geo output also has 178 origin cards summing to 1474 dishes, with the explicit sample remainder.
- Production smoke: exit 1, FAIL 5 / PASS 2, as explained below.

Builds use the requested localhost:4000 endpoint. No local API was listening, so a temporary GET-only proxy fetched live api.gustale.recipes responses, cached them in memory across both builds, and prefetched published dish details/journeys with concurrency six (and locale responses with concurrency twelve). No database credentials, writes, or synthetic catalogue data were used. An initial uncached recipes build was interrupted for this optimization; only completed runs are claimed below.

astro check (run directly; no typecheck script added) reports 83 pre-existing errors, 0 warnings, 20 hints. The only diagnostic in a changed file is the already known AtlasHeroKpi.astro:96 boolean typing error. No new diagnostics in the pagination helper, directories, Nav, CountryDirectory, or PlacesList. Existing MapLibre and Layout errors remain outside scope.

## Production smoke

Command: scripts/smoke/run-smoke.sh --wp WP-02

```text
Gustale smoke test · https://gustale.com · 2026-11-11T10:33:30.875Z · WP-02

❌ WP-02  places-country-count                   Places page says 36 countries; API has 178 distinct origins
❌ WP-02  places-indonesia-count                 Places shows Indonesia 14; API 193
❌ WP-02  directory-list-not-short               SHORT LIST if incomplete: Places 36/178; families 22/22
❌ WP-02  family-counts-agree                    Home stat 123 · families page 22 · families in use by dishes 22
✅ WP-02  places-stat                            Published place associations: atlas/counts 0; published-associated places 0
✅ WP-02  sitemap-dish-count                     sitemap-en dish URLs 1474; API 1474
❌ WP-02  sitemap-lineage-count                  sitemap-en lineage URLs 12; API 14

FAIL 5 · PASS 2
```

Exit 1 is expected: production still serves the old pages and this package does not deploy. The new check identifies Places 36/178 as SHORT LIST. family-counts-agree remains failing because canonical family work is WP-02b. sitemap-lineage-count also still fails because it compares all 14 narratives against 12 deliberately indexed narratives; the zero-dish indexing policy is unchanged. places-stat now passes against the matching published-association measure.

## Local built-output smoke verification

Command: scripts/smoke/run-smoke.sh --wp WP-02 --base http://127.0.0.1:4002 --no-browser

A temporary local static preview served the completed geo build and forwarded API GETs through the live-response cache.

```text
Gustale smoke test · http://127.0.0.1:4002 · 2026-11-11T10:35:43.704Z · WP-02

✅ WP-02  places-country-count                   Places page says 178 countries; API has 178 distinct origins
✅ WP-02  places-indonesia-count                 Places shows Indonesia 193; API 193
✅ WP-02  directory-list-not-short               SHORT LIST if incomplete: Places 178/178; families 22/22
❌ WP-02  family-counts-agree                    Home stat 123 · families page 23 · families in use by dishes 22
✅ WP-02  places-stat                            Published place associations: atlas/counts 0; published-associated places 0
✅ WP-02  sitemap-dish-count                     sitemap-en dish URLs 1474; API 1474
❌ WP-02  sitemap-lineage-count                  sitemap-en lineage URLs 12; API 14

PASS 5 · FAIL 2
```

Exit 1 is expected for the two explicitly excluded vocabulary/indexing-policy checks. The delivered pagination, completeness, Indonesia count, matching places statistic, and dish sitemap checks all pass locally.

## Preserved WP-02b diagnosis and work deliberately not done

The whole live catalogue has 1474 published dishes, 178 origins, and 22 distinct non-null legacy familySlug values. Pagination cannot produce 123 families.

The dish list displays family_slug from legacy dish_categories/categories where kind='dish-type'; atlas/counts counts the canonical dish_dish_families/dish_families vocabulary. Independent verification found 123 canonical values in use: 83 FORM, 21 COURSE, 15 CONTENT TYPE, 4 CUISINE, with a parent hierarchy. Only 19 of the 22 legacy slugs overlap. Legacy examples include main-course, turkish-cuisine, colombian-cuisine, ethiopian-cuisine, and filipino-cuisine. The API already FILTERS with the canonical vocabulary while DISPLAYING legacy family fields. The owner chose the atlas vocabulary; updating familySlug belongs to WP-02b on its separate API branch. The complete directory also exposes the pre-existing Other bucket for dishes with null familySlug, making 23 cards (22 real slugs plus Other). This existing grouping policy is unchanged; the SHORT LIST check measures coverage of real slugs, while family-counts-agree retains its existing comparison. No family number, slug source, or family-counts-agree assertion was changed here.

preserved-fish and wrapped-leaf both have dishCount 0 and deliberately receive noindex and sitemap exclusion. This is policy, not a defect. Neither was changed.

The pre-existing type errors, other pages' independent pagination/fallback policies, and any API publication-predicate differences remain outside this scoped package.

## Commit and push

Verified implementation commit: 7c26be339117a5e35a8321b5b7f0aafc0f167029.

This report is committed separately after the implementation so it can name the verified implementation SHA without a self-referential commit hash. The final pushed HEAD includes both commits; runtime files are identical to the implementation commit verified above.

The repository does not contain scripts/hermes/push_sha_as_app.py. The same installed helper was located at /home/alex/.hermes/github-app/push_sha_as_app.py and is used with origin, feature/wp-02-pagination, the explicit final HEAD SHA, and the current remote SHA obtained with git ls-remote. It verifies ancestry and refuses an unexpected remote; no force-push is used.

Temporary verification proxy/preview processes are stopped after verification. No deployment or PR was made.
