# WP-02 — the fix, narrowed by measurement

**Written:** 2026-11-11 (WP-00, after the owner's note on the API's
`limit` ceiling).
**Status:** discovery findings and the plan. **Nothing has been changed.**
The code work is WP-02 itself.

---

## 1. The owner's note, and what it settles

> *"The API rejects limit > 100. Don't just raise the limit — paginate or
> use a count endpoint, and the count gate must fail if the list is
> short."*

**Measured, live, 2026-11-11:**

```
$ curl -o /dev/null -w '%{http_code}' 'https://api.gustale.recipes/api/dishes?limit=200'
400
{"error":"validation_error", ..., "fieldErrors":{"limit":["Too big: expected number to be <=100"]}}

$ curl -o /dev/null -w '%{http_code}' 'https://api.gustale.recipes/api/dishes?limit=100'
200
```

The ceiling is in the route's own schema — `apps/api/src/routes/dishes.ts:53`:

```ts
limit: z.coerce.number().int().min(1).max(100).default(20),
```

**This ceiling is correct and must stay.** It is a deliberate bound on a
public endpoint, and WP-02 has no reason to widen it. The owner's
instruction not to raise it is right, and this report does not propose
raising it.

---

## 2. The count endpoint already exists

**This is the finding that changes the shape of WP-02: there is nothing
to build on the API side.**

`GET /api/dishes` already returns a `total`:

```
$ curl 'https://api.gustale.recipes/api/dishes?limit=1'
{"dishes":[…], "hasMore":true, "limit":1, "offset":0, "total":1474}
```

And it is the **count of the rows matching the filters**, not the page
size — measured with a filter:

```
$ curl 'https://api.gustale.recipes/api/dishes?limit=1&region=Indonesia'
{"total":193, …}
```

The code explains why it is trustworthy
(`apps/api/src/routes/dishes.ts:386-399`):

```ts
// The TOTAL for this query -- the number of dishes that MATCH the
// filters, not the number returned in this page.
//
// It is a second query rather than a window function, because the
// page query's LEFT JOIN LATERALs (cover image, family, method)
// would have to be reproduced exactly for a window count to match,
// and a mismatch would produce a total that contradicts the list
// next to it. This counts the same WHERE, with no joins.
const countRow = (await db.execute(sql`
  SELECT count(*)::int AS total
  FROM dishes d
  WHERE ${whereClause.length > 1 ? sql.join(whereClause, sql` AND `) : whereClause[0]}
`)) as { total: number }[];
```

**The count and the list share one WHERE clause.** That is exactly the
property the owner's "the count gate must fail if the list is short"
requirement needs — a count that is computed independently could
disagree with the list it is supposed to describe.

### Pagination over the live API is exact

Walked the whole catalogue, 100 rows per page:

```
pages walked to offset 1400        (15 pages)
distinct slugs collected: 1474
total reported by API:   1474
MATCH
```

**No duplicates, no gaps.** So the fix is a *build-time* pagination
loop, and the count gate has something exact to check against.

---

## 3. The actual defect

Two Astro pages fetch only the first 100 rows at build time:

```astro
<!-- apps/web/src/pages/regions.astro:26 -->
initial = await listDishes({ status: "published", limit: 100 });
...
const countries = buildCountryDirectory(initial.dishes);
```

```astro
<!-- apps/web/src/pages/families.astro:22 -->
initial = await listDishes({ status: "published", limit: 100 });
```

`buildCountryDirectory` groups by `originName`
(`apps/web/src/lib/browse.ts:505-525`), so **the directory can never
contain more countries than the first 100 dishes happen to cover.**

| | page shows | the API has |
|---|---:|---:|
| countries (from `originName`) | **36** | **178** |
| families | **22** | **123** |

**This is not the mock-data problem the pack hypothesised.** The
production deploy builds with `BUILD_DATA_SOURCE=live` against the live
API on the VPS (`scripts/hermes/build-web-live.sh`); the site is not
mock-built. It is a one-line-too-small fetch in two pages.

### Why 22 families and not 123

`/api/atlas/counts` reports `families: 123` — the size of the **taxonomy**
(how many families exist). The families *page* shows the families **in
use by the dishes it can see** — 22, from the first 100 dishes. The
smoke check `family-counts-agree` compares all three numbers and fails
because they disagree.

Once the page paginates, the third number becomes correct by
construction, and the check compares like with like.

---

## 4. The plan for WP-02

### The change: paginate at build time. No API change.

A single helper, used by both pages, that walks the list to the end:

```ts
// apps/web/src/lib/browse.ts (new export, next to buildCountryDirectory)

/**
 * Fetch EVERY matching dish, by paginating.
 *
 * WHY: the API caps `limit` at 100 by design (dishes.ts:53) — it is a
 * deliberate bound on a public endpoint, not an oversight. So a page
 * that wants the whole catalogue must WALK it.
 *
 * The count comes from the SAME response's `total`, which the API
 * computes with the same WHERE clause as the list (dishes.ts:386-399),
 * so the two cannot disagree.
 */
export async function listAllDishes(params): Promise<Dish[]> {
  const all: Dish[] = [];
  let offset = 0;
  for (;;) {
    const page = await listDishes({ ...params, limit: 100, offset });
    all.push(...page.dishes);
    if (!page.hasMore || page.dishes.length === 0) break;
    offset += page.dishes.length;
    if (offset > 100_000) break; // a runaway guard, not a real limit
  }
  return all;
}
```

Then `regions.astro` and `families.astro` call it instead of `listDishes`.

**The build cost is 15 requests per page, at build time only.** The build
already fetches every dish page individually for the static output, so
15 more list requests is not a meaningful addition.

### The count gate — the owner's requirement, made concrete

**The gate must fail if the list is short.** Concretely, the build must
assert that the number of dishes it collected equals the `total` the API
reported, and must **fail the build** if it does not. A short list must
never reach production.

Two gates, at two levels:

**Gate 1 — in the page itself, at build time.** After pagination:

```ts
const expected = page.total;      // from the API, same WHERE
const got = all.length;
if (got !== expected) {
  throw new Error(
    `[regions] the dish list is SHORT: collected ${got}, the API says ${expected}. ` +
    `The directory would be built from an incomplete catalogue.`,
  );
}
```

**The build fails. The page is not written.** This is the gate the owner
asked for, and it belongs where the data is fetched — a short list is
caught at the moment it is produced, not afterwards by a smoke test.

**Gate 2 — in the smoke test, on production.** The existing check
`family-counts-agree` already compares the API's count, the page's count
and the families in use. It will pass once the pages are fixed, because
all three will be the same number. It should also gain an explicit
"the list is not short" assertion, so that a regression is reported as
*short list* rather than as *counts disagree*.

**Why both.** Gate 1 stops it happening. Gate 2 catches it if the
failure happens some other way — a stale build, a deploy that skipped the
build, a page that was hand-edited. The smoke test is the pack's
definition of done, so the condition belongs there too.

### What WP-02 must NOT do

- **Do not raise the API's `limit` ceiling.** It is a deliberate bound.
  The owner's instruction is explicit, and the code explains why the
  count is computed the way it is; neither is disturbed by paginating.
- **Do not add a second count endpoint.** The count already exists, it is
  already computed with the same WHERE clause as the list, and adding a
  duplicate would create two numbers that could disagree.
- **Do not change the API at all.** WP-02 is a web-side change.

---

## 5. One thing WP-02 should also check

`/api/atlas/counts` reports **`places: 0`** while the data holds **178**
origins, and `/api/places` returns `{"places":[],"count":0}`.

This is **not** a bug in the count, and it should not be "fixed" as
one. Measured: `/api/dishes/map?limit=2000` returns **121** dishes with
coordinates, out of 1,474. `places` counts *located* dishes, and the
home page's Places section renders the **36 distinct places** those 121
dishes occupy.

So **two different numbers are both correct** — "places" counts located
dishes, and the places *page* counts origins. The failure is that the
site does not say which is which. WP-02 should make the labels say so,
rather than change a number to match another.

**This needs the owner's call** on the wording, so it is raised rather
than decided. It is listed under "Needs you" in the WP-01/WP-02 report.
