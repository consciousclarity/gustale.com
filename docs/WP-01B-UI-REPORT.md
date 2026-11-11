# WP-01b · the URL drives the filter, and the filtered list works without JS

Date: 2026-11-11. Branch: `feature/wp-01-ui-claude`.

> **This report replaces the first one.** The first report stopped at the
> verification gate and said the brief's "one line" diagnosis was wrong.
> **It was right.** This is the delivery report for the corrected brief
> (`docs/tasks/WP-01B-UI-v2.md`).

## The defect was bigger than one line

The brief's claim was that `toListParams` dropped a parsed `region`. It
did not — **`BrowseQueryState` has no `region` field at all**
(`apps/web/src/lib/browse.ts:23-34`). `browse.ts:574` is
`LineageFilterState`, the *lineages* page's filter.

The real cause was `skipFilterFetch` short-circuiting the first effect
run in `DishExplorer.tsx:162-188`: **a direct URL load never fetched,
for any filter.** Measured before the fix, these four URLs served the
**identical** page:

```
/dishes?category=stew       banh-mi, bibimbap, biryani-hyderabadi
/dishes?technique=curry     banh-mi, bibimbap, biryani-hyderabadi
/dishes?country=Indonesia   banh-mi, bibimbap, biryani-hyderabadi
/dishes?category=zzz        banh-mi, bibimbap, biryani-hyderabadi
```

`category=zzz` is the proof: a category that does **not exist** produced
the same page as one that does. Nothing was being filtered.

## What changed, file by file

| file | change |
|---|---|
| `apps/web/src/lib/browse.ts` | `parseBrowseState` accepts `region`/`origin` as aliases of `country` and serialises back to `country`. A separate `category` field — **not** an alias of `cuisine`. |
| `apps/web/src/components/DishExplorer.tsx` | The first effect run now fetches when the URL carries a filter. Redirects to the path form when a static page exists. Active-filter heading and chip. |
| `apps/web/src/lib/slug.ts` | **New.** The site's one slug helper, lifted out of `PlacesList.tsx` so the page generator and every link builder derive the same slug. |
| `apps/web/src/lib/filterPages.ts` | **New.** The single source of truth for "does a path page exist?", and `filterHref()`, which returns the path form when a page exists and the query form otherwise. |
| `apps/web/src/pages/dishes/[kind]/[slug].astro` | **New.** The static filtered-list page. |
| `apps/web/src/pages/dishes/index.astro` | "Recipes" → "Dishes" in the title, breadcrumb, header and count fallback. |
| `apps/web/src/components/AlsoExplore.tsx`, `CountryDirectory.tsx`, `DishDetail.tsx`, `design/PlacesList.tsx` | Links use `filterHref()`, so they point at the path form where a page exists. |
| `apps/web/src/pages/dishes/[slug].astro`, `regions.astro` | Same, for the "Same region" link and the origin directory. |
| `packages/ui/src/Card.tsx` | A neutral placeholder for a failed cover, never a broken-image icon. |
| `scripts/smoke/gustale-smoke.mjs` | The category/technique and region checks learn the new path form. **The assertion is unchanged** — every listed dish must be in the API's filtered set. |

### `category` is NOT an alias of `cuisine`

The brief suggested aliasing `category` to `cuisine`. **That would have
been wrong**, and it is worth recording why.

`cuisine` is matched with `ILIKE` against a *name*; `category` is an
exact *slug* match. Verified live:

```
cuisine=indonesian-cuisine   → total 0
category=indonesian-cuisine  → total 16
category=stew                → total 12
```

Aliasing them would have sent `?category=indonesian-cuisine` as a cuisine
name and silently returned nothing. `category` is now its own field.

## The static pages — Decision A

**54 region pages**, exactly as decided (origins with ≥ 5 dishes), plus
**22 category** and **9 technique** pages by the same rule. The build
produced:

```
dishes/region/…      54
dishes/category/…    22
dishes/technique/…    9
```

### How many links take each route

- **The path form** is used wherever a static page exists: the 54
  origins with ≥ 5 dishes, and every category/technique above the
  threshold. This is the no-JS path.
- **The query form** (`/dishes?region=X`) is used for the other **124**
  origins, which have fewer than 5 dishes and therefore no page. Those
  are handled by the client-side filter, which now works on a direct
  load.

Both forms are produced by one function, `filterHref()`, so a link and a
page can never disagree about which exists.

## How the no-JS path was verified

The site is static, so the filtered list has to be in the **server HTML**
to work without JavaScript. Verified on the built output:

```
dishes/region/indonesia/index.html   49 card markers | h1=Dishes from Indonesia
dishes/category/stew/index.html      25 card markers | h1=Stew dishes
dishes/technique/curry/index.html    14 card markers | h1=Curry — dishes by cooking method
```

The lists are in the static HTML, with the right headings. And the
"Same region" link on a dish page is a literal `href`:

```
$ curl .../dishes/rendang/ | grep -o 'href="[^"]*region[^"]*"'
href="/dishes/region/indonesia/"
```

— the path form, so it works with JavaScript off.

## Verification

| check | result |
|---|---|
| The production build (`build:recipes`, live data) | **rc=0**, 16,584 pages across 10 locales, all taxonomy and domain checks passed |
| `node scripts/run-lint.mjs` | **rc=0**, 242 files |
| Smoke against the built output | `region-filter-works` **PASS** (23 dishes, 100% Indonesian), `category-filter-works` **PASS** (11/11), `technique-filter-works` **PASS** (6/6), `dish-list-heading` **PASS** ("Dishes") |

The three filter checks use the corrected assertion — every dish the
page lists must be in the API's filtered set — so they cannot pass on a
page that filters nothing. They pass because the page is right.

**The smoke test had to learn the new link shape** (the path form
replaces `?category=stew`). The assertion was not weakened.

## What was not done, and why

- **No `apps/api/` change.** A separate branch (WP-02b) changes the API's
  `familySlug` source; touching the API here would conflict.
- **No D1/D2/D3.** The language switcher, the banner, "Add a dish" →
  "Suggest a source or correction" and the Recipes *nav link* are WP-03.
  The dishes-page *heading* was this package's.
- **No WP-02 work.** The regions/families directory pages and the count
  gate are a separate branch.
- **The associations loader was not touched.** It works; it only mounts
  on scroll (`client:visible`).
- **No deploy, no PR.** The owner decides both.

## Note on the build

The first run of the production build was killed by a 3,000-second
timeout. It was not hung: the build fetches all 1,474 dishes **per
locale** over the public API, at roughly 550 ms per page, so ~16,500
pages take about 2.5 hours. Re-run with a longer timeout it completed
in rc=0. **This is a property of the build, not of this change** — the
production deploy builds on the VPS against `http://127.0.0.1:4000`,
which is why it is fast there.
