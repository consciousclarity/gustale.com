# WP-02 · Indexes from live data, with a count gate

**Owner:** Codex. **Reviewer:** Claude Code.

> **Corrected and narrowed by WP-00, 2026-11-11.** The mock-data
> hypothesis is **wrong**, the API already has the count, and the owner has
> ruled on the approach. Read this before the original brief — **the
> work is much smaller than the original brief implies, and Option A and
> Option B are both unnecessary.**

## What WP-00 established (measured, live, 2026-11-11)

**1. The mock-data hypothesis is REJECTED.** The original brief's
recorded history says *"deployed Astro SSG pages used mock API data
because CI runners could not reach the live API through the VPS
firewall"*, and proposes two ways to fix that.

**Neither is needed.** The production deploy builds with
`BUILD_DATA_SOURCE=live` against the live API **on the VPS**:

- `.github/workflows/ci.yml` (deploy job) runs
  `scripts/hermes/build-web-live.sh "$SHA"` on the VPS;
- that script builds with `--build-arg BUILD_DATA_SOURCE=live
  --build-arg PUBLIC_API_BASE=http://127.0.0.1:4000`;
- the GHA `build-web` job *does* use the mock, but **that image is not
  what production serves**.

The site is built from live data. **Do not touch the firewall, do not
touch CI secrets, do not build a snapshot export.** Options A and B are
moot.

**2. The real cause is a fetch that is too small.** Two Astro pages ask
for 100 dishes and build an index from them:

```astro
<!-- apps/web/src/pages/regions.astro:26 -->
initial = await listDishes({ status: "published", limit: 100 });
const countries = buildCountryDirectory(initial.dishes);

<!-- apps/web/src/pages/families.astro:22 -->
initial = await listDishes({ status: "published", limit: 100 });
```

`buildCountryDirectory` groups by `originName`
(`apps/web/src/lib/browse.ts:505`), so the directory can never show more
countries than the first 100 dishes cover: **36 shown vs 178 in the
API**, **22 families shown vs 123 in the taxonomy**.

**3. The API's `limit` ceiling is 100, by design — and must stay.**
`apps/api/src/routes/dishes.ts:53`:

```ts
limit: z.coerce.number().int().min(1).max(100).default(20),
```

Live proof: `?limit=200` → `400` with
`"Too big: expected number to be <=100"`; `?limit=100` → `200`.

**4. The count endpoint ALREADY EXISTS.** `GET /api/dishes` returns a
`total` — the number of rows matching the filters, computed with the
**same WHERE clause** as the list
(`apps/api/src/routes/dishes.ts:386-399`):

```
$ curl '…/api/dishes?limit=1'
{"dishes":[…], "hasMore":true, "limit":1, "offset":0, "total":1474}
$ curl '…/api/dishes?limit=1&region=Indonesia'
{"total":193, …}
```

And pagination over the live API is exact — walked to the end, 100 rows
per page:

```
distinct slugs collected: 1474
total reported by API:    1474
MATCH
```

**So WP-02 needs NO API change and NO new endpoint.**

## The owner's instruction (2026-11-11)

> *"The API rejects limit > 100. Don't just raise the limit — paginate or
> use a count endpoint, and the count gate must fail if the list is
> short."*

All three parts are satisfied by the plan below: **paginate**, **use the
count endpoint that exists**, and **fail the build if the list is
short**.

## The plan

### Change — paginate at build time. Web side only.

One helper, used by both pages, that walks the list to the end:

```ts
// apps/web/src/lib/browse.ts, next to buildCountryDirectory
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

Then `regions.astro` and `families.astro` call it instead of `listDishes`.

**Cost:** 15 list requests per page, at build time only. The build
already fetches every dish page individually for the static output, so
this is not a meaningful addition.

### The count gate — fail the build if the list is short

**Gate 1 — where the data is fetched (the real gate).** After
pagination, assert that the number of dishes collected equals the `total`
the API reported, and **throw**, so the build fails and the page is
never written:

```ts
if (all.length !== page.total) {
  throw new Error(
    `[regions] the dish list is SHORT: collected ${all.length}, ` +
    `the API says ${page.total}. The directory would be built from an ` +
    `incomplete catalogue.`,
  );
}
```

**A short list must never reach production.** This is the owner's
requirement, and it belongs where the list is produced.

**Gate 2 — in the smoke test, on production.** The existing check
`family-counts-agree` already compares the API count, the page count and
the families in use; it will pass once the pages are fixed. Add an
explicit *"the list is not short"* assertion so a regression is reported
as a **short list**, not as *counts disagree*.

**Why both.** Gate 1 stops it happening. Gate 2 catches it if it happens
another way — a stale build, a deploy that skipped the build.

### Also in WP-02

- **Places lists all origins**, with "+ N more" instead of a silently
  truncated sample list.
- **The sitemap lists 12 lineages; the API has 14.** Find out why and fix
  it — it is in the same family as the other two (a build that does not
  see everything).

### One thing to ASK, not to decide

`/api/atlas/counts` reports **`places: 0`** while the data holds **178**
origins, and `/api/places` returns `{"places":[],"count":0}`.

**This is not a bug in the count.** Measured: `/api/dishes/map?limit=2000`
returns **121** dishes with coordinates out of 1,474. `places` counts
*located* dishes; the home page's Places section renders the **36
distinct places** those 121 occupy. Two different numbers, both correct.

**So do not change a number to match another.** The fix is to make the
labels say which is which — and the wording needs the owner's call.
Raise it in the discovery report.

## Discovery still required (report before editing)

1. Confirm the code path for `/regions`, `/families`, `/lineages`, the
   home stats and the sitemaps — and **which of them fetch only 100
   rows**. The sitemap's 12-vs-14 lineage gap is unexplained; find it.
2. Confirm the `total` is present on every response shape the two pages
   use, including with filters applied.

## Done when

- `--wp WP-02` all PASS on production.
- **A deliberately broken count fails the build** (a local test) — the
  owner's requirement, and the gate's proof that it can fail.
- The clean-clone check passes (see WP-01's "Done when" — it is the same
  check).

## Gate

Merge and deploy need Alex's explicit "merge WP-02" / "deploy WP-02".
No firewall, CI secret or server change should be needed — if you find
yourself wanting one, the discovery was wrong.
