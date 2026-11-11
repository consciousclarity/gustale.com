# Task brief — WP-02 · paginate the index pages, and gate on the count (Codex)

## Context

Repo: `/home/alex/projects/gustale.com`. Branch:
**`feature/wp-02-pagination`**, already pushed to the remote and checked
out from `origin/main` (`323eade`).

Read these first, in this order:
- `docs/improvement-pack/tasks/WP-02-live-indexes.md` — the brief
- `docs/WP-02-NOTE.md` — the owner's instruction and WP-00's
  measurements
- `docs/WP-01-WP-02-DISCOVERY.md` — the shared discovery findings

## The owner's instruction (2026-11-11)

> *"The API rejects limit > 100. Don't just raise the limit — paginate or
> use a count endpoint, and the count gate must fail if the list is
> short."*

## What WP-00 already established — do not re-derive

**1. The mock-data hypothesis is WRONG.** The original brief proposed
two ways to work around "production pages were built from mock data".
Neither is needed. The production deploy builds with
`BUILD_DATA_SOURCE=live` against the live API **on the VPS**
(`.github/workflows/ci.yml` deploy job → `scripts/hermes/build-web-live.sh`).
The GHA `build-web` job uses mock, but that image is not what production
serves.

**So: do not touch the firewall, do not touch CI secrets, do not build a
snapshot export. Options A and B are moot.**

**2. The count endpoint ALREADY EXISTS.** `GET /api/dishes` returns a
`total`:

```
$ curl '…/api/dishes?limit=1'
{"dishes":[…], "hasMore":true, "limit":1, "offset":0, "total":1474}
$ curl '…/api/dishes?limit=1&region=Indonesia'
{"total":193, …}
```

It is the count of rows matching the filters, computed with the **same
WHERE clause** as the list (`apps/api/src/routes/dishes.ts:386-399`) —
so it cannot disagree with the list it describes.

**3. Pagination over the live API is exact.** Walked to the end, 100
rows per page: **1474 distinct collected, 1474 reported. MATCH.**

**4. The API's `limit` ceiling is 100, by design, and MUST STAY**
(`apps/api/src/routes/dishes.ts:53`). **Do not raise it. Do not add a
new count endpoint. Do not change the API at all.**

**5. The actual defect:** two Astro pages fetch only 100 rows at build
time.
```astro
// apps/web/src/pages/regions.astro:26
initial = await listDishes({ status: "published", limit: 100 });
const countries = buildCountryDirectory(initial.dishes);

// apps/web/src/pages/families.astro:22
initial = await listDishes({ status: "published", limit: 100 });
```
`buildCountryDirectory` groups by `originName`
(`apps/web/src/lib/browse.ts:505`), so the directory can never show more
countries than the first 100 dishes cover: **36 shown vs 178 in the
API**, **22 families shown vs 123 in the taxonomy**.

## What to do

1. **Verify the diagnosis.** Read the two pages and `browse.ts`, and
   confirm the numbers against live. **If the diagnosis is wrong, stop
   and report.**

2. **Add a pagination helper** in `apps/web/src/lib/browse.ts`, next to
   `buildCountryDirectory`:
   ```ts
   export async function listAllDishes(params): Promise<Dish[]> {
     const all: Dish[] = [];
     let offset = 0;
     for (;;) {
       const page = await listDishes({ ...params, limit: 100, offset });
       all.push(...page.dishes);
       if (!page.hasMore || page.dishes.length === 0) break;
       offset += page.dishes.length;
       if (offset > 100_000) break; // runaway guard, not a real limit
     }
     return all;
   }
   ```
   Use the real types from `apps/web/src/lib/api.ts` and
   `apps/web/src/types/dish.ts` — do not invent new ones.

   **Check how `listDishes` is typed and whether it returns `total` in
   every call shape you need**, including with filters applied. If it
   does not, that is the one thing you may need to adjust on the API
   side — and you must say so explicitly in your report.

3. **Use it** in `regions.astro` and `families.astro`.

4. **The count gate — the owner's requirement.** Two levels.

   **Gate 1 (the real one): fail the build if the list is short.** After
   paginating, assert the collected count equals the API's `total`, and
   **throw** so the build fails and the page is never written:
   ```ts
   if (all.length !== page.total) {
     throw new Error(
       `[regions] the dish list is SHORT: collected ${all.length}, ` +
       `the API says ${page.total}. The directory would be built from an ` +
       `incomplete catalogue.`,
     );
   }
   ```
   **A short list must never reach production.**

   **Gate 2: the smoke test.** The existing check `family-counts-agree`
   compares the API count, the page count and the families in use; it
   will pass once the pages are fixed. Add an explicit *"the list is not
   short"* assertion so a regression is reported as a **short list**,
   not as *counts disagree*. The smoke test is at
   `scripts/smoke/gustale-smoke.mjs`.

   Also: **prove the gate can fail.** The brief's "Done when" says *"a
   deliberately broken count (local test) fails the build"*. Add a test
   that feeds a short list and asserts the build fails. Where the repo's
   tests live for the web app, follow that convention.

5. **Also in WP-02:**
   - **Places lists all origins**, with "+ N more" instead of a silently
     truncated sample list.
   - **The sitemap lists 12 lineages; the API has 14.** Find out why and
     fix it — same family of defect (a build that does not see
     everything).

6. **Run the checks:**
   ```bash
   pnpm --filter @gustale/web run typecheck
   node scripts/run-lint.mjs
   PUBLIC_DOMAIN=recipes BUILD_DATA_SOURCE=live PUBLIC_API_BASE=http://127.0.0.1:4000 pnpm --filter @gustale/web run build:recipes
   PUBLIC_DOMAIN=geo     BUILD_DATA_SOURCE=live PUBLIC_API_BASE=http://127.0.0.1:4000 pnpm --filter @gustale/web run build:geo
   ```
   And the smoke test against production (read-only):
   ```bash
   scripts/smoke/run-smoke.sh --wp WP-02
   ```
   It will still show the WP-02 checks failing **on production**, because
   production still has the old pages. That is expected — you are not
   deploying. Say so in your report.

7. **Commit** on `feature/wp-02-pagination`, then push:
   ```bash
   python3 scripts/hermes/push_sha_as_app.py origin feature/wp-02-pagination <your-verified-sha> <the-current-remote-sha>
   ```
   Get the remote sha with `git ls-remote origin refs/heads/feature/wp-02-pagination`.
   **Never force-push.**

## Rules — these are absolute

- **Do not raise the API's `limit` ceiling.** The owner said so
  explicitly, and the code explains why the count is computed the way it
  is.
- **Do not add a second count endpoint.** One count, computed with the
  same WHERE clause as the list, is the design that makes the gate
  trustworthy.
- **Do not change the API** except as noted in step 2, and flag it.
- **Do not touch `apps/api/src/routes/dishes.ts`'s public contract.**
- **Do not touch the database.** No migrations, no writes to live.
- **Do not implement WP-01** (the region filter, the covers, the
  heading) — separate branches.
- **Do not deploy, and do not open a PR.** The owner decides both.
- **Never print a secret.**

## One thing to ASK, not to decide

`/api/atlas/counts` reports **`places: 0`** while the data holds **178**
origins, and `/api/places` returns `{"places":[],"count":0}`.

**This is not a bug in the count.** `/api/dishes/map?limit=2000` returns
**121** dishes with coordinates out of 1,474; the home page's Places
section renders the **36 distinct places** those 121 occupy. So "places"
(counts located dishes) and the places *page* (counts origins) are two
different, both-correct numbers, and the site does not say which is
which.

**Do not change a number to make it match another.** The fix is to make
the **labels** say which measure they are, and that wording is the
owner's call. Raise it in your report with a proposed wording. Note that
the smoke check `places-stat` compares `atlas/counts.places` against the
origins in the data, so **it may need its expectation rewritten rather
than the code changed** — raise that too, do not silently change either
side.

## What to save

Write your findings to
`/home/alex/projects/gustale.com/docs/WP-02-REPORT.md` before you
finish, so the work survives an iteration limit. It must contain:
- your verification of the diagnosis
- every file you changed, and why
- **proof the gate fails on a short list** (the test, and its output)
- the open question about the `places` wording, with your proposal
- the smoke test output and the explanation that production still fails
  because it has the old pages
- the commit sha you pushed
- anything you found that you did not fix, and why

## Completion criteria

- `regions.astro` and `families.astro` see the whole catalogue.
- The build **fails** when the list is short, and a test proves it.
- The smoke test has an explicit "list is not short" assertion.
- The lineage count gap is explained.
- Typecheck and lint pass; both production builds succeed.
- The report file exists.
- The branch is pushed, as a fast-forward.

## Budget

Stop and report if the count endpoint turns out not to be available in a
call shape you need, or if the sitemap's 12-vs-14 gap turns out to need
a database change. Do not widen the scope.
