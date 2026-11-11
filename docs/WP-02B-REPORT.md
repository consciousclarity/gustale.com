# WP-02B — canonical food-family vocabulary

Date: 2026-11-11. Branch: `feature/wp-02b-family-vocabulary`.

## Verification before implementation

Read `docs/tasks/WP-02B-FAMILY.md` in full, the corrections document in full (especially section 2), and `/tmp/wt-wp02/docs/WP-02-REPORT.md`.

The central diagnosis is confirmed by source, public API GETs, and SQL inside explicit `BEGIN READ ONLY` / `ROLLBACK` transactions on the existing database. No database was provisioned or changed.

- The list displayed legacy `dish_categories` → `categories`, restricted to `kind='dish-type'`, but both family filter predicates already used active `dish_dish_families` → `dish_families`.
- The exact legacy LATERAL over published dishes selects **22** distinct family slugs. Counting all legacy relations instead gives 25: the primary-selection step matters.
- The exact proposed canonical LATERAL selects **123** distinct slugs. Published dishes: **1,445** with one active family, **29** with none, **zero** with multiple families; total **1,474**.
- `GET https://api.gustale.recipes/api/dishes?family=bibimbap&limit=2` returned HTTP 200, total 3; sampled `albap` and `heotjesatbap` displayed null legacy families. `GET /api/atlas/counts` returned families **123**.
- Published canonical families comprise **83 FORM, 21 COURSE, 15 CONTENT TYPE, 4 CUISINE**; **97** have parents. Across all relations, `is_primary` is true for **1,357**, false for **89**.

## Status decision and corrected explanation

Use **active canonical relations on published dishes** for the public count, active canonical relations for list/filter/detail/atlas/taxonomy/search membership, and preserve null for dishes lacking an active family.

The brief's explanation of 124 versus 123 is incorrect, although its vocabulary diagnosis is correct. The read-only database query returned:

| Dish status | Relation status | Relations | Distinct families |
|---|---|---:|---:|
| published | active | 1,445 | 123 |
| draft | active | 1 | 1 |
| all | active | 1,446 | 124 |

There are **no inactive relations today**. Thus adding only `status='active'` to the unscoped atlas query would still give **124**. Excluding the draft dish gives **123**, matching the actual public count endpoint and the canonical list. Keep the active predicate because an inactive classification must neither display nor be searchable/filterable/countable, even when future data introduces inactive rows.

The repository has two count implementations: the public endpoint in `atlas-counts.ts` already scopes to published dishes, while the counts embedded in `atlas.ts` did not. Both now apply the same published-and-active family rule. This corrects canonical counting; it does not substitute the legacy vocabulary.

## Files changed and family-surface audit

- `apps/api/src/routes/dishes.ts`: replace only the list family LATERAL with canonical active relations ordered by primary flag. Existing filters, detail vocabulary dimensions, and featured family selection already use canonical active relations and remain consistent. Null family fields remain null. Legacy `categories` fields continue to describe categories, separately from food-family membership.
- `apps/api/src/routes/atlas.ts`: filter the per-dish family dimension to active relations; scope its embedded family count to active relations on published dishes.
- `apps/api/src/routes/atlas-counts.ts`: add the active predicate to the public family count, retaining its published predicate.
- `apps/api/src/routes/taxonomy-family.ts`: remove legacy category membership from the family dish set and require active canonical membership. Preserve the existing legacy prose fallback for definitions, which does not create membership. Explain all four canonical family classes rather than describing every family as a form. Other taxonomy dimensions retain their existing behavior.
- `apps/api/src/routes/search.ts`: the family results group formerly searched legacy categories. It now searches canonical families with active published membership. Dish search already used canonical active family relations. Generic `/api/categories`, category filters, cuisine categories, and editorial category metadata retain their category meaning; they are not repurposed as food families.
- `apps/api/test/dishes-list.test.ts`: compare every published list row's family slug/name against the canonical active relation, including nulls, and check public atlas family counts against canonical published membership. Update the file's obsolete contract description.
- `apps/api/test/taxonomy-family.test.ts`: compare the taxonomy dish set with active canonical membership, preventing legacy category additions; discover fallback test families from canonical list fields instead of legacy categories.
- `apps/web/src/pages/families.astro`: headings already say “Food families”; update the description and subtitle from form-only language to form/course/content type/cuisine. No fetching or grouping behavior changed.
- `docs/WP-02B-REPORT.md`: this report.

Searched `family_slug`, `familySlug`, `family_name`, and `familyName` across `apps/api/src/`, then also searched canonical joins and legacy family usages. `buildFamilyDirectory`/`buildCountryDirectory` consume list family fields and follow the API; no web library was edited.

## Validation

- `pnpm install --frozen-lockfile`: exit 0; no lockfile change.
- `pnpm --filter @gustale/api run typecheck`: exit 0 (`tsc --noEmit`).
- `node scripts/run-lint.mjs`: final exit 0, **242 files checked**, existing warnings retained. The first run caught formatting in the changed list test; formatted that file and reran successfully.
- `git diff --check`: exit 0.
- `pnpm --filter @gustale/api test`: final exit 1, **18 files failed initialization, 2 passed; 23 tests passed**. Failures are missing `DATABASE_URL` and required service/session environment, not failing test assertions. No DB was provisioned and the full suite was not pointed at live.
- `pnpm --filter @gustale/api exec vitest run test/vitest-config.test.ts test/mock-data.test.ts`: exit 0, **2 files / 23 tests passed**. An earlier attempted targeted invocation named nonexistent `atlas-narrative.test.ts` and `atlas-predicate.test.ts`; it exited 1 with “No test files found”, then was corrected to these actual environment-independent files.
- Additional manual verification: `pnpm --filter @gustale/api exec tsx .wp02b-verify.ts`, using dummy environment values and an isolated Fastify instance registering only dish, count, and taxonomy GET routes. Its `db.execute` adapter compiled the handlers' actual Drizzle SQL and executed it through SSH/psql inside **server-enforced read-only transactions**. It did not call `buildServer`, initialize authentication/buckets, or use the PostgreSQL client connection. Exit **0**. Full list pagination returned **1,474 dishes, 29 null families, 123 distinct canonical families**; edited `/api/atlas/counts` returned **123**. All three `family=bibimbap` results (`albap`, `heotjesatbap`, `hoe-deopbap`) displayed `bibimbap`; taxonomy returned the same three. The temporary in-checkout script was removed; a local copy is `/tmp/wp02b-verify.ts`, with output `/tmp/wp02b-readonly-routes.log`.
- `node scripts/smoke/gustale-smoke.mjs --wp WP-02 --no-browser --json /tmp/wp02b-smoke.json`: exit **1**, production **FAIL 5 / PASS 1**. The unchanged `family-counts-agree` reports **home 123 / page 22 / list families 22**. Other failures: country count 36/178, Indonesia 14/193, places stat 0, lineage sitemap 12/14. Dish sitemap passes 1474/1474. These are observations of unchanged production, not successful checks of the branch.

Both required live-data builds passed with exit **0**:

```sh
PUBLIC_DOMAIN=recipes BUILD_DATA_SOURCE=live PUBLIC_API_BASE=http://127.0.0.1:4000 pnpm --filter @gustale/web run build:recipes
PUBLIC_DOMAIN=geo BUILD_DATA_SOURCE=live PUBLIC_API_BASE=http://127.0.0.1:4000 pnpm --filter @gustale/web run build:geo
```

Recipes ran in this checkout. Geo ran in an isolated detached checkout of implementation commit `abca24978b6fbd1979de8d12ccb2f0cd59baa373` at `/tmp/wp02b-geo-build`, with its own frozen dependency installation, so concurrent builds had separate output directories. Recipes reports **59 passed, 0 failed**; geo reports **55 passed, 0 failed** in their taxonomy/domain validators. Existing font-resolution and prerendered-admin-header warnings remain; live mode explicitly skips the mock-only pagination fixture checks. The already-running localhost:4000 service supplies the unchanged public live API; an attempted additional GET-only proxy exited with EADDRINUSE and was not started. These builds establish compatibility with existing live responses, not deployment of the edited API or resolution of the pagination/path gaps below.

Local logs: `/tmp/wp02b-{install,typecheck-final,lint-final,test-final,unit-final,readonly-routes,smoke,build-recipes,build-geo}.log`.

## Remaining gaps outside this package

- This checkout's `/families` page fetches only 100 dishes. WP-02 owns pagination. A read-only query of the actual first 100 dishes finds only **20 canonical families**. Canonical API data alone cannot make a page built from the first 100 contain all 123 families. The smoke assertion was not changed.
- `apps/web/src/pages/family/[slug].astro` prefers legacy `/api/categories` to generate static paths and fetches dishes with `category: slug`, rather than `family: slug`. Read-only SQL finds **104 of the 123 in-use canonical slugs have no categories row**, so the current path generator omits those pages. Canonical directory/search links therefore need that separate web route aligned too; this includes ensuring canonical-only family pages exist. Left unchanged because the user expressly prohibits web edits beyond the families index's labels. This is a completion dependency for the combined site behavior, not a claim that every canonical family landing page is fixed here.
- Production remains unchanged: no deployment or PR was made. Production smoke cannot validate an undeployed API or a future WP-02 pagination build.
- Other WP-02 places/lineage smoke failures, category/cuisine editing, and WP-01 work remain outside scope.

## Commits and push

Implementation commit: `abca24978b6fbd1979de8d12ccb2f0cd59baa373` (`fix(api): use canonical food families across public reads`). This report is committed separately afterward so it can identify the exact implementation SHA without a circular self-reference.

The task-named repository helper `scripts/hermes/push_sha_as_app.py` is absent. The installed helper at `/home/alex/.hermes/github-app/push_sha_as_app.py` is used instead, with the explicit verified delivery SHA and expected remote SHA `ce832f879fe749242fc36d5dda373cf7fec36f0e` obtained with `git ls-remote origin refs/heads/feature/wp-02b-family-vocabulary`. That remote commit is an ancestor of this delivery. No force-push, deployment, or PR is used.
