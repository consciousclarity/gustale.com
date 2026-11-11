# Task brief — WP-02b · make the family vocabulary canonical (Codex)

## Context

Repo: `/home/alex/projects/gustale.com`. Branch: **`feature/wp-02b-family-vocabulary`**
— create it from `origin/main`.

This is a **new** package, split out of WP-02 because it changes
`apps/api/src/routes/dishes.ts` and WP-02 is changing `apps/web/`. The
split keeps the two from conflicting.

The decision came from the owner on 2026-11-11.

## The decision

**The canonical food-family vocabulary is the atlas's `dish_families`
(123 in use), not the legacy `categories` where `kind='dish-type'` (22
in use).**

The site's dish list must display and filter on the same vocabulary, and
the home stat, the families page and the atlas count must agree.

## The evidence (measured live, 2026-11-11)

| | source | count |
|---|---:|---:|
| **the dish list's `familySlug`** (what a visitor sees) | `dish_categories` → `categories` where `kind='dish-type'` | **22** |
| **`/api/atlas/counts` → `families`** (the home stat) | `dish_dish_families` → `dish_families` | **123** |

Only **19 of the 22** legacy slugs also exist in `dish_families`. They are
almost entirely different vocabularies:

- the legacy 22: `main-course`, `appetizer`, `rice-dish`, `curry`,
  `turkish-cuisine`, `filipino-cuisine` — an unstructured mix of courses
  and cuisines.
- the atlas 123, grouped by `family_class`: **83 FORM**, 21 COURSE,
  15 CONTENT TYPE, 4 CUISINE — with a parent hierarchy (97 of the 123
  have a parent).

**The atlas vocabulary is structured and the legacy one is not.** The
legacy `categories` table has 152 rows mixing courses and cuisines
(`Appetizer` next to `American cuisine`).

**And the API already filters on the canonical vocabulary.** The `family`
filter (`dishes.ts:194-203` and `:254-263`) already reads
`dish_dish_families` / `dish_families`:

```ts
// A `dish_families` slug -- the canonical family dimension.
// It used to read the legacy `categories` kind='family' rows,
sql`EXISTS (SELECT 1 FROM dish_dish_families df5 JOIN dish_families f5 ON f5.id = df5.value_id WHERE df5.dish_id = dishes.id AND f5.slug = ${params.family} AND df5.status = 'active')`,
```

**So today the API filters by the atlas vocabulary but displays the legacy
one** — a filter for `bibimbap` can return dishes whose displayed family
is `main-course`. That inconsistency is the bug.

### The data supports the change

```
families per published dish:  1,445 have exactly one · 29 have none · 0 have more than one
dish_dish_families.is_primary: 1,357 true · 89 false
```

So the "one family per dish" LATERAL pattern that the list already uses
for the legacy vocabulary works **directly** on the canonical one. The
29 dishes with no family relation will have `familySlug: null` — which
the page must handle as it already handles a null legacy family.

## What to do

1. **Verify the diagnosis first.** Read the code, query the API, query
   the database read-only. If it is wrong, **stop and report**.

2. **Change the list route's family LATERAL**
   (`apps/api/src/routes/dishes.ts:306-314`) to read the canonical
   dimension:

   ```sql
   LEFT JOIN LATERAL (
     SELECT f.slug, f.name
     FROM dish_dish_families df
     JOIN dish_families f ON f.id = df.value_id
     WHERE df.dish_id = d.id
       AND df.status = 'active'
     ORDER BY df.is_primary DESC
     LIMIT 1
   ) fam ON true
   ```

   **Check the `status` filter against the other queries.** The `family`
   filter at `:203` uses `df5.status = 'active'`, and the atlas counts
   (`atlas.ts:490-492`) do **not** filter on status. That is why the
   database has 124 relations and the API reports 123. **Decide which is
   right, state your reasoning, and report it** — the display field and
   the count must agree, or the site's own numbers will not match.

3. **Audit every other place that surfaces a family** — the detail route,
   the atlas route, the taxonomy route — and make them agree. Search for
   `family_slug`, `familySlug`, `family_name` and `familyName` across
   `apps/api/src/`.

4. **The web side.** `apps/web/src/pages/families.astro` and
   `buildCountryDirectory` (`apps/web/src/lib/browse.ts:505`) read the
   list's `familySlug`, so they follow the API automatically. **Check the
   families page's own headings and labels** — if it says "dish types"
   or similar, it must now say "food families".

5. **The smoke test.** `family-counts-agree` compares the API's count,
   the page's count and the families in use. After this change all three
   should be **123** and the check should pass on its own. **Do not
   change the check's logic to make it pass** — change the data, then
   verify.

6. **Tests.** Add a test that the list's `familySlug` resolves against
   `dish_families` and not to a legacy `categories` slug. Follow the
   style of `apps/api/test/dishes-list.test.ts` and
   `apps/api/test/taxonomy-family.test.ts`.

## Checks

```bash
pnpm --filter @gustale/api run typecheck
node scripts/run-lint.mjs
```

**The API test suite needs `DATABASE_URL`** — 18 of the 21 test files
cannot initialize without it, and this checkout has no API `.env`. That
is an environment limit, not a code failure: WP-01a's agent hit it too.
Run what can run, and report exactly what you ran and what it returned.
**Do not try to provision a database.** Do not touch live.

Also build both web domains to confirm nothing broke:
```bash
PUBLIC_DOMAIN=recipes BUILD_DATA_SOURCE=live PUBLIC_API_BASE=http://127.0.0.1:4000 pnpm --filter @gustale/web run build:recipes
PUBLIC_DOMAIN=geo     BUILD_DATA_SOURCE=live PUBLIC_API_BASE=http://127.0.0.1:4000 pnpm --filter @gustale/web run build:geo
```

## Commit and push

```bash
git checkout -b feature/wp-02b-family-vocabulary origin/main
python3 scripts/hermes/push_sha_as_app.py origin feature/wp-02b-family-vocabulary <your-verified-sha> "(none)"
```
The branch does not exist yet, so the expected remote sha is `(none)`.
**NEVER force-push.** If the helper says "remote moved", fetch, reconcile,
re-run.

## Rules

- **Do not write to the database.** No migrations, no data changes, no
  writes to live. This is a **read-side** change only.
- **Do not change the atlas counts** to match the legacy vocabulary. The
  decision is the other way round.
- **Do not touch `apps/web/`** beyond the families page's labels — WP-02
  is changing `apps/web/` on another branch.
- **Do not implement WP-01.**
- **Do not deploy. Do not open a PR.**
- **Never print a secret.**

## Save

Write `docs/WP-02B-REPORT.md` with: your verification of the diagnosis;
every file you changed and why; **your decision on the `status` filter,
with the reasoning and the numbers**; what the audit of the other family
surfaces found; the test output; the commit sha; and anything you found
but did not fix, and why.
