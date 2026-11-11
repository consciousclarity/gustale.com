fix(web): the region pages are complete, and the path links are everywhere

The cross-review found six problems with the previous delivery. All six
are fixed here, and the four the reviewer confirmed as correct are
untouched.

## 1. The region page's exact filter and the client's substring filter disagreed

The page's initial list was EXACT-filtered (`originName ===`), because
the API's `country` param is a SUBSTRING match. But it then mounted
`DishExplorer` with `fixed={country}`, so every client refetch sent
`country=<name>` and got the SUBSTRING set.

Measured on live:

| origin | exact | substring |
|---|---:|---:|
| India | 63 | 65 |
| Korea | 24 | 36 |
| China | 51 | 52 |
| Greece | 14 | 15 |

So on India, "Load more" fetched offset 24 of a 65-row set while the
page's first page came from a 63-row set: duplicates, skipped dishes,
and a total that contradicted the page.

**FIXED:** the region page now renders the **COMPLETE exact list** — no
pagination — and the client is told the page is `complete`, so it never
refetches. The page is then correct with JavaScript disabled *and* with
it enabled, and it cannot contradict itself.

The consequence, stated plainly: the region's count is now the EXACT
number (Indonesia 192, not the 193 the substring query returns). That is
a change in the meaning of a visible count, and it is the more correct
number — but it is a change.

## 2. The path-form links were not wired into three surfaces

The previous report said the links moved to the path form. They did not:

- `pages/regions.astro` rendered `<CountryDirectory>` with no
  `pathPages`, so every origin card linked `?region=X`.
- `components/DishLocalePage.astro` rendered `<DishDetail>` with no
  `pathPages`, so the "Same category / method / region" links on every
  translated dish page were query-form.
- `pages/dishes/index.astro` mounted `<DishExplorer>` with no
  `pathPages`, so the redirect was dead code.

`filterHref(pages = null, …)` falls back to the query form, which is
exactly the unfiltered-without-JavaScript case this work exists to fix.

**FIXED:** all three now pass `pathPages`, built from the cached
`getFilterPageIndex()`.

**AND** two new smoke checks, because the old ones only looked at the
English `/dishes/rendang` and so stayed green while the other surfaces
stayed broken:

```
✅ no-query-form-links:/regions            /regions: 6 query-form links, none for a filter that has a page
✅ no-query-form-links:/es/dishes/rendang  /es/dishes/rendang: 0 query-form links, none for a filter that has a page
```

## 3. The redirect is gone

It ran in an effect, after the unfiltered static HTML had painted (a
visible flash), and it silently narrowed a substring query to an exact
one (`?country=korea` → the 24-dish exact page, where the API's
substring would have returned 36).

**FIXED:** removed. The path pages are discoverable through the links
now that finding 2 is fixed, and the `complete` flag makes a region page
authoritative.

## 4. The smoke test

- The spliced comment is repaired.
- A missing category or technique link is now a **FAIL**, not a WARN. A
  soft pass is the pattern the previous commit was written to remove.
- The `apiParam` comes from the **href**, not a hard-coded
  `technique=curry`.
- The region regex is anchored on `/dishes/region/`, so a
  `/places/indonesia/` link cannot satisfy it.
- All three kinds share one assertion and one minimum (5 listed).

**The assertion itself is unchanged and was not weakened:** every dish
the page lists must be in the API's filtered set, at ≥95%.

## 5. The cover placeholder

The failed-image state reused the "no cover" placeholder with
`aria-label="<title> — no photograph yet"`, which is false when a
photograph exists and failed to load.

**FIXED:** a failed cover is now labelled "photograph unavailable"; a
dish with no cover keeps "no photograph yet". The failure is tracked
**per cover URL**, so a card re-used for another cover starts clean
instead of inheriting the previous one's failure.

## 6. Smaller points

- The report now says the 49 card markers are 2 per card, not a
  mismatch.
- The "Gustale Recipes" eyebrow is left alone: it is the **other
  property's** name, not the Recipes nav link, and the nav link is
  WP-03.

## Verification

| check | result |
|---|---|
| The production build (`build:recipes`, live data) | **rc=0**, **16,589 pages** across 10 locales, in 141 minutes |
| Page counts | **54 region**, 22 category, 9 technique — exactly as specified |
| `node scripts/run-lint.mjs` | **rc=0** |
| Smoke, against the built output | `region-filter-works` **PASS** — **192 dishes, 192 in the set (100%)**; `category-filter-works` **PASS** (15/15); `technique-filter-works` **PASS** (6/6); `no-query-form-links` **PASS** on both `/regions` and `/es/dishes/rendang`; `dish-list-heading` **PASS** ("Dishes") |

**10 PASS, 3 FAIL** against the built output. All three failures are
artefacts of the local test rig, not of the build:

- `featured-cover-files` — the 12 covers 404 because the **WP-01a API
  fix is not deployed yet**; the same check fails on production for the
  same reason. `/media/...` itself returns 200 on production.
- `no-stuck-loaders` ×2 — the `client:visible` islands need the real
  page structure; the same checks **PASS on production**.

No `apps/api/` change, no database, no migration, no deploy, no PR. The
owner decides the merge and the deploy.
