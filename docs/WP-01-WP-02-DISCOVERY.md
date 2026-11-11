# WP-01 + WP-02 — discovery findings

**Date:** 2026-11-11, read-only. Nothing was changed.
**For:** the WP-01a (Codex, API), WP-01b (Claude Code, UI) and WP-02
(Codex) agents, and for Alex.

---

## WP-01a · The region filter — the API is fine, the web drops it

**The API's `region` filter works.** Measured live:

```
$ curl '…/api/dishes?limit=100&status=published&region=Indonesia'
total=193   origins=['Indonesia']

$ curl '…/api/dishes?limit=100&status=published&country=Indonesia'
total=193   origins=['Indonesia']
```

Both spellings work and both are the same filter
(`apps/api/src/routes/dishes.ts:180-183` and `:244-246` — the same
`geo_entities.name ILIKE` EXISTS clause).

**The bug is one line in the web app.** `DishExplorer` parses `region`
from the URL, keeps it in state, renders a chip for it — and then never
sends it.

`apps/web/src/lib/browse.ts:574` — parsed:
```ts
region: emptyToNull(get("region") ?? get("origin")),
```

`apps/web/src/lib/browse.ts:618-623` — rendered as a removable chip:
```ts
if (state.region) {
  … key: `region:${state.region}`, label: `Region: ${state.region}`, …
}
```

`apps/web/src/components/DishExplorer.tsx:46-59` — **dropped**:
```ts
function toListParams(state: BrowseQueryState, offset: number) {
  return {
    status: "published" as const,
    search: state.q || undefined,
    country: state.country ?? undefined,   // ← country is sent
    cuisine: state.cuisine ?? undefined,
    type: state.type ?? undefined,
    ingredient: state.ingredient ?? undefined,
    technique: state.technique ?? undefined,
    family: state.family ?? undefined,
    // region is MISSING
    limit: BROWSE_PAGE_SIZE,
    offset,
  };
}
```

**And `/dishes` is a static page**, so the URL's filter cannot affect
the built HTML at all. `apps/web/src/pages/dishes/index.astro:22`:

```ts
initial = await listDishes({ status: "published", limit: 24 });
```

There is no `Astro.url.searchParams` anywhere in that file — the page is
built once, unfiltered, and the filter only ever exists in the browser.
Measured: `https://gustale.com/dishes?region=Indonesia` serves **23
dish links, all global** (banh-mi, bibimbap, biryani-hyderabadi,
boeuf-bourguignon…) — not one Indonesian dish.

**So there are TWO defects, and they need different fixes:**

| # | defect | where | fix belongs |
|---|---|---|---|
| 1 | `toListParams` omits `region` | `DishExplorer.tsx:46-59` | **WP-01b (Claude Code)** — one line |
| 2 | the static page ignores the query string | `dishes/index.astro` | **WP-01b**, and it is the harder one |

Defect 2 is why the brief says *"Server-rendered if the site uses SSR; if
pages are static, generate `/dishes/region/<country-slug>/` pages at
build time. The filtered list must work without JavaScript."*

**The site is static** — `astro.config.mjs` has no `output` setting and
no adapter; the Dockerfile copies `dist/` into nginx. So the brief's
static answer applies: **the filtered list must work without
JavaScript**, which means path-based pages at build time, with `?region=`
redirecting to the path form.

**Question for the implementers:** how many path pages? 178 origins is a
lot of pages, and most have 1–2 dishes. The brief says *"Places lists all
origins. Show '+ N more' instead of a silently truncated sample list"*
(WP-02), which suggests the owner wants completeness of the *directory*,
not necessarily a static page per country. **Ask Alex before generating
hundreds of pages** — that is a judgement call about the site's shape,
not a technical detail.

## WP-01a · The cover URLs — the defect is in `variantsUrls` only

`/api/dishes/featured` returns `variantsUrls` **without** the `/media/`
prefix. `publicUrl` is correct on both endpoints.

Measured live:

| endpoint | `variantsUrls["800"]` | `publicUrl` |
|---|---|---|
| `/api/dishes/featured` | `dishes/moussaka-greek/cover-800w.webp` ← **no prefix** | `/media/dishes/…/cover-1536w.webp` ✓ |
| `/api/dishes` | `/media/dishes/…/cover-800w.webp` ✓ | `/media/dishes/…/cover-1536w.webp` ✓ |

All 12 featured dishes carry the unprefixed variant, and all 12 render
broken on the homepage.

**The two endpoints build the map differently.** The list route
(`dishes.ts:428`) uses a shared helper; the featured route does not:

- `apps/api/src/routes/dishes.ts:428` — list route:
  ```ts
  const variantsUrls = mapVariantsToUrls(row.cover_variants);
  ```
- `apps/api/src/routes/dishes.ts:1148-1223` — the featured route builds
  its own object, and its `variantsUrls` comes from the raw row:
  ```ts
  publicUrl: `/media/${row.cover_storage_key}`,
  variantsUrls: (row.cover_variants as Record<string, string>) ?? {},
  ```

**That is the bug.** The featured route writes the raw
`cover_variants` map (bare keys like `dishes/<slug>/cover-800w.webp`)
straight into `variantsUrls`, while the list route passes the same data
through `mapVariantsToUrls`, which is the helper that adds the
`/media/` prefix.

**The helper already exists and is already the right one**
(`apps/api/src/routes/dishes.ts:1503`, whose doc comment says it maps
*"to `{"800": "/media/<key>", "1536": "/media/<key>"}`"*). So the fix is
to use it in the featured route too — **not** to write a new serializer.

**Note the subtlety:** `row.cover_variants` may already be a JSON object
whose values are bare keys. `mapVariantsToUrls` takes the *storage key*
and its *variants*. The implementer must check the two call sites agree
on what shape they are passing, and add a test that asserts **every**
variant URL starts with `/media/`.

## WP-01b · The H1 and the title

`apps/web/src/pages/dishes/index.astro:51-57`:
```astro
<Layout title="Recipes — Gustale" description="Browse Gustale recipes and culinary encyclopedia entries.">
  <BrowseHeader … title="Recipes" … />
```

Both say "Recipes". The brief wants "Dishes" or "All dishes". The
`countLabel` fallback at line 48 is also the literal string `"Recipes"`.

## WP-01b · What is NOT in WP-01

The original brief had the associations block and the "Add a dish" link.
**Both have moved:**

- **The associations block works.** `<AtlasPlaces>` is `client:visible`,
  so it only mounts when scrolled into view; the endpoint answers in
  ~1.8 s and the section resolves to *"No association has been published
  for this dish yet."* There is no API hang. (WP-00's correction.)
- **"Add a dish", the language switcher and the Recipes nav link** are
  decisions **D1–D3**, which the owner assigned to **WP-03**.

## WP-02 · Paginate at build time; the count endpoint already exists

Measured live, 2026-11-11:

```
$ curl '…/api/dishes?limit=1'
{"dishes":[…], "hasMore":true, "limit":1, "offset":0, "total":1474}
$ curl '…/api/dishes?limit=1&region=Indonesia'
{"total":193, …}
```

And walking the whole catalogue 100 rows at a time:

```
distinct slugs collected: 1474
total reported by API:    1474
MATCH
```

**No API change is needed.** The `total` is computed with the same WHERE
clause as the list (`dishes.ts:386-399`), so it cannot disagree with it
— which is exactly what the owner's "the count gate must fail if the list
is short" requirement needs.

The defect is two Astro pages fetching only 100 rows
(`regions.astro:26`, `families.astro:22`).

Full detail in `docs/WP-02-NOTE.md`.

### One question for Alex, not for the implementers

`/api/atlas/counts` reports **`places: 0`** while the data holds **178**
origins. **This is not a bug in the count** — `places` counts *located*
dishes, and only **121 of 1,474** dishes have coordinates
(`/api/dishes/map?limit=2000` returns 121). The home page's Places
section renders the **36 distinct places** those 121 occupy.

Two numbers, both correct, measuring different things. The fix is to make
the **labels** say which is which, and that wording is Alex's call.

---

## The smoke checks that gate these packages

| WP | checks | current |
|---|---|---|
| WP-01 | `region-filter-works`, `dish-list-heading`, `featured-cover-files`, `home-images-render`, `home-http-errors` | 5 FAIL |
| WP-01 | `category-filter-works`, `technique-filter-works`, `home-places-section`, `no-stuck-loaders` ×2 | PASS |
| WP-02 | `places-country-count`, `places-indonesia-count`, `family-counts-agree`, `places-stat`, `sitemap-lineage-count` | 5 FAIL |
| WP-02 | `sitemap-dish-count` | PASS |

**Unchanged from the WP-00 baseline: 24 FAIL / 7 PASS / 1 WARN of 32.**
The packages are done when their checks are green on production.

### Two checks that need care

- **`region-filter-works`** asserts the filtered list is ≥95% Indonesian
  and shows ≥10 dishes. With the fix, the API returns 193, all
  Indonesian — but the check reads the **served HTML**. So the fix has to
  make the *page* show them, not just the API.
- **`places-stat`** compares `atlas/counts.places` against the origins in
  the data. As measured above, **these are different measures**, so this
  check may need its expectation rewritten rather than the code changed.
  Raise it rather than "fixing" the count.
