# WP-02B cross-review (abca249, 0e8c1c1)

Reviewer note: read-only review of the diff, the report, and the surrounding code. No DB access, no tests run (the API suite needs DATABASE_URL). Anything about row counts is the agent's claim and was not re-checked against the database.

## VERDICT: ship with changes

The core SQL change is correct and narrowly scoped. The tests were not weakened. But the API change by itself makes the public site worse in two places: search and the families directory now emit `/family/<slug>` links that mostly 404, and the family page's grid and taxonomy panel now disagree. The agent disclosed the web-route gap, but it did not flag that its own `search.ts` change creates dead links today. Do not deploy the API change without the web route (or a search `href` fix).

## Findings, most serious first

### 1. Search now returns `/family/<slug>` links for pages that are not built (search.ts:333-372, href at :369)
- WHAT: `searchFamilies` now searches `dish_families` (123 in use) but still emits `href: /family/${slug}`. The static route `apps/web/src/pages/family/[slug].astro:34-82` builds its paths from `/api/categories`. By the agent's own count, 104 of the 123 canonical slugs have no categories row.
- WHY it matters: the old query could only return categories, which are exactly the slugs that have pages. The new one returns canonical families, most of which have no page. A visitor searching "bibimbap" or "dumpling" gets a result that 404s. The same applies to the `/families` directory, which links via `familyHref` (browse.ts:782). Once the API ships, 104 of its 123 links are dead.
- WHAT should be done: either land the `[slug].astro` change (paths from `dish_families`, dishes fetched with `family: slug`) in the same release, or keep this API change undeployed until it does. Add a smoke check that every search or families link resolves.

### 2. Family page grid and taxonomy panel now disagree for the 19 slugs that exist in both vocabularies (taxonomy-family.ts:183-187 vs [slug].astro:100-105)
- WHAT: the taxonomy endpoint no longer unions legacy category membership into a family's dish set. The deleted comment said the point was that "dumpling is filed in the legacy one" and "moussaka is in both". The page's dish grid still filters with `category: slug`, which is legacy membership.
- WHY it matters: for those slugs the panel's `counts.dishes` and dish list (canonical) differ from the grid beneath it (legacy). A family whose dishes were only in the legacy taxonomy now shows an empty or short panel next to a full grid. The report's validation only checked `bibimbap`, where both agree.
- WHAT should be done: same fix as finding 1 (point the grid at `family=`). Until then, say in the report that this divergence is introduced by the change.

### 3. 17 cuisine-category pages dropped out of search without being mentioned (search.ts, deleted comment lines 327-337)
- WHAT: the removed docblock stated that category `kind` was deliberately not filtered, so that `/family/japanese-cuisine` (10 dishes) stays findable by "japanese". After the change, none of the legacy cuisine or other category pages are in the families group.
- WHY it matters: it is a visible search regression for exactly the queries the old comment was written to protect. The report says only that search "formerly searched legacy categories". It does not call out the loss.
- WHAT should be done: record this as an intentional consequence, or keep a separate legacy-category group. Do not silently drop it. The deleted rationale should have been replaced with a note, not removed.

### 4. `ORDER BY df.is_primary DESC LIMIT 1` has no tie-breaker (dishes.ts:312)
- WHAT: if a dish has two active families with equal `is_primary` (or none primary), the pick is arbitrary and can change between runs or deploys. Search orders the same relation by `f.name` (search.ts:240); the detail route marks every family `is_primary = true` (dishes.ts:~843).
- WHY it matters: today it is harmless, because the agent reports zero multi-family published dishes (not verified here). The first dish given a second family gets a nondeterministic list family, and the list, search and detail can then disagree. The new list test copies the same ORDER BY, so it cannot catch this.
- WHAT should be done: add a stable tie-break (`, f.name, f.id`) in the list lateral, and the same in the test's expected query.

### 5. The "no inactive relations" claim: the code matches, the database part is unverified
- WHAT: confirmed from code that before the change `atlas.ts` (the old count) counted `dish_dish_families` with neither a status nor a published filter, while `atlas-counts.ts` had only the published filter, and the list filter (dishes.ts:203, 263) uses `df5.status = 'active'`. So the two counts could disagree.
- The agent's table (123 published vs 124 all, from the one draft dish with an active family, and no inactive rows) is plausible and consistent with that code. I could not check it against the DB.
- The agent's decision is sound. Adding `active` alone would give 124, so scoping to published is what makes it 123. It also changes `atlas.ts` from 124 to 123, which is a correct, intended change.
- Minor: the atlas per-dish dimension (atlas.ts:185) now filters active, which matches dishes.ts:841 and was previously inconsistent. Correct.
- WHAT should be done: nothing, other than having someone run the status query read-only to confirm.

### 6. Stale or missing explanation (low)
- Stale comments remain: `apps/web/src/types/dish.ts:52-54` still says familySlug is the "Primary dish-type category slug". `atlas-counts.ts:14-19` still describes the legacy count.
- The `dishes-list.test.ts` header was reduced from the migration-0035 history to two lines. That history explained why the file exists.
- The `family=` filter test (dishes-list.test.ts:~104-120) still only asserts `Array.isArray`. That is pre-existing and not weakened, but the filter stays untested for "returns only the family's dishes". A cheap strengthening would be to assert every returned dish's `familySlug` equals the filter, since that is the point of WP-02B.

## What is correct
- The list lateral (dishes.ts:307-314): canonical join, `status = 'active'`, primary-first, LIMIT 1. A dish with no active family gets no row from the LEFT JOIN LATERAL, so `family_slug` and `family_name` are NULL (dishes.ts:295 and the row mapping at :417). The 29 null-family dishes behave as before. A dish cannot get the wrong family except through the tie case in finding 4.
- Other copies: the only other list-style lateral is the scoped copy of the same SELECT near dishes.ts:295, which is the one changed. `/api/dishes/featured` (dishes.ts:1161, 1170) and the search dish lateral (search.ts:238-243) already used canonical active relations. I found no unconverted legacy family lateral. The remaining `dish_categories` joins at dishes.ts:145, 151, 190, 226, 231, 251 are the `cuisine`, `type` and `category` filters, which are unchanged.
- The `family` filter (dishes.ts:194-203, 263) is untouched; the diff has zero changes to `params.family`.
- The agent's claim about categories holds: `/api/categories`, the `category`, `type` and `cuisine` filters, cuisine categories and the search cuisine lateral are not in the diff. No category filter changed meaning. The only legacy-vocabulary reads removed are in the list lateral, the taxonomy dish set and the search families group.
- `atlas-counts.ts` change is one predicate and correct. `families.astro` is text only.
- Tests were not weakened. The old list test only asserted `toHaveProperty("familySlug")`, which passed on any value. The new one checks every published dish's slug and name against the canonical relation, including nulls, with pagination and duplicate checks, and adds a counts-agreement test. The taxonomy test adds an exact-equality check against canonical membership. The beforeAll fallback in taxonomy-family.test.ts now discovers slugs from canonical list fields instead of `/api/categories`. That is a reasonable change, though it only looks at the first 100 dishes.

## What I could not verify
- Any database figure (22/123/124, 29 nulls, zero multi-family dishes, 104 of 123 missing categories rows, 19 overlap). I used the agent's numbers and the code only. The "19" overlap is my inference from 123 − 104 and is not stated in the report.
- Whether the sitemap, the dish detail page and `GustaleHomeIsland` read `familySlug` in a way the change affects. I did not trace the sitemap generator or the home island's use of the list's family field.
- The API test suite and the new tests: they need DATABASE_URL. I did not run lint, typecheck or builds either. The report's results for those are the agent's.
- The `families.astro` page still only builds from the first 100 dishes (about 20 families). That is a disclosed WP-02 dependency, and it means the production smoke `family-counts-agree` check will keep failing until pagination lands.
