# WP-01b cross-review (32ac7c6 + bb84ae9)

Reviewer did not edit code, commit or push. Evidence: source reading, and the production API (read-only) for the origin data.

## VERDICT: ship with changes

The core fix is real. The path pages are genuinely filtered, the threshold is applied in one place, and the smoke assertion was not weakened. But several of the report's "links point at the path form" claims are false for three surfaces, and the region pages are wrong for the 8 origins listed in finding 1, once a visitor clicks "Load more".

## Findings, most serious first

### 1. Region pages filter exactly, but the client refetch filters by substring (wrong lists, wrong totals)
- WHAT: `apps/web/src/pages/dishes/[kind]/[slug].astro:44-56` builds the initial list with an exact `originName ===` filter (the comment says the API is substring). It then mounts `DishExplorer` with `fixed={country: entry.value}` (`:76`). Every later fetch (Load more, `toListParams` at `DishExplorer.tsx:~105`) sends `country=<name>` to the API, which is the substring match.
- Checked on the live data: 8 of the 54 region pages have an origin name that is a substring of another origin: Korea (also South Korea 9, North Korea 3), India (+Indian subcontinent 2), China (+Republic of China 1), Greece (+Ancient Greece), Hungary, England (+New England), Iran (+Qajar Iran), Taiwan (+Taiwan Island).
- WHY: The header says "63 dishes" (exact). Load more on India then fetches offset 24 of a 65-dish substring set, so the page can show duplicates or skip dishes. Its total can become 65. The initial slice is of the exact-filtered list, so its offsets do not line up with the API's. Korea (24 exact, `hasMore` false) is fine until a client-side refetch happens; any filter or sort change on a path page refetches with the substring semantics. The smoke test only checks the first page of Indonesia, so it cannot catch this.
- DO: make the client and the server agree. Either filter the client results by exact `originName` for a `fixed.country`, or give the API an exact-origin param. Short term, on path pages render all dishes (or set `hasMore` from the true list) and disable refetch for `fixed.country`.

### 2. The links that were supposed to move to the path form did not, on three surfaces; the report says they did
- WHAT:
  - `pages/regions.astro:66` renders `<CountryDirectory dishes=… client:load />` with no `pathPages`. The report's file table says `regions.astro` changed, but it is not in `git show --stat 32ac7c6`. So every origin-directory card links `?region=X` (`filterHref` falls back to the query form when `pages` is null).
  - `components/DishLocalePage.astro:103-117` renders `DishDetail` without `pathPages`. So the "Same category / method / region" links on every translated dish page (9 locales) are query-form.
  - `pages/dishes/index.astro:79` mounts `DishExplorer` without `pathPages`, so `pathFormFor()` always returns null. The new redirect to the path form (`DishExplorer.tsx:~236-243`) is dead code on `/dishes`.
- WHY: These are exactly the no-JS entry points the work exists to fix. With JS off, `/regions` and every non-English dish page still show the unfiltered list for a filter link. The smoke test only checks the English `/dishes/rendang`, so it stays green.
- DO: pass `pathPages` in all three places (`getFilterPageIndex()` is cached). Add a smoke check for `/regions` and one locale dish page, or at least grep that no `href="/dishes?` remains for a filter that has a page. Correct the report.

### 3. The redirect (if wired) would flash the unfiltered list and rewrites the filter semantics
- WHAT: `DishExplorer.tsx` `pathFormFor` + `window.location.replace` run in an effect, after the unfiltered static HTML has painted. Also `?country=korea` slugifies to the "korea" page, i.e. the exact-match page, where the API's substring would have returned 36 dishes.
- WHY: Today it is dead (finding 2). Once wired, it adds a visible flash on the direct-load path. It also silently narrows a substring query to an exact one.
- DO: decide whether the redirect is wanted at all. If kept, restrict it to exact name match (not slug) and accept the flash.

### 4. Smoke test: assertion intact, but comments and fallbacks need tidying
- WHAT: `scripts/smoke/gustale-smoke.mjs:~205-216` has a spliced, broken comment ("A check that passes while / Same for a category and technique link…"). The category/technique "link not found" case is `WARN`, not `FAIL` (`:~228`). The technique regex takes the first `technique/` link on rendang but compares against the hard-coded `technique=curry`. The region regex also matches `/indonesia/` in any href (e.g. a `/places/indonesia/` link).
- WHY: The strong assertion (`share ≥ 0.95` of listed dishes in the API's filtered set, `listed.length ≥ 1`) is kept, and a query-form href would still fail it because the static list is unfiltered, so the earlier false-pass is not reintroduced. But if the link disappears the check degrades to WARN, which is the soft-pass pattern the previous commit was written to remove. The region check requires ≥10 listed while category/technique need only ≥1.
- DO: make link-missing a FAIL for WP-01; anchor the regexes on `/dishes/(region|category|technique)/`; take the apiParam from the href rather than hard-coding curry; repair the comment.

### 5. Cover placeholder mislabels a failed image
- WHAT: `packages/ui/src/Card.tsx:~125-140`. The failed-image state reuses the "no cover" placeholder, with `role="img"` and `aria-label="<title> — no photograph yet"`.
- WHY: It is accessible (it has a role and a label, and the initial is `aria-hidden`), but "no photograph yet" is false when a photograph exists and failed to load. `failed` is never reset if `cover` changes (the card is re-used when the list is replaced, unless keyed).
- DO: use a neutral label (e.g. `<title> — photograph unavailable`) for the failed case, and reset `failed` when `cover.publicUrl` changes.

### 6. Smaller points
- Header numbers: the region page's count (exact) now differs from what `?region=` substring queries and the API's own total return for the 8 origins in finding 1. It is the more correct number, but it is a change in the meaning of a visible count, and it is not mentioned in the report.
- The "Recipes → Dishes" rename covers the title, breadcrumb, header and fallback only. The eyebrow on non-Atlas domains still reads "Gustale Recipes" (`lib/domain.ts:81`), and the description and subtitle changed wording. That is consistent with the stated scope (nav link is WP-03).
- The report's "49 card markers" for a 23-dish page is 2 markers per card, not a bug, but it reads like a mismatch.

## What is correct

- Filter plumbing round-trips. `category` is in `BrowseQueryState`, `DEFAULT_BROWSE_STATE`, `BROWSE_URL_KEYS`, `serializeBrowseState`, `browseFiltersKey`, `FRIENDLY_LABELS`, `applyBrowseFilter`'s no-filter test, `toListParams` and the effect dependency list. `region`/`origin` parse into `country` and serialise as `country`, so Back/shared URLs are stable. Keeping `category` separate from `cuisine` is right.
- The `skipFilterFetch` fix: a first-load key differing from the base key triggers one `replaceResults`; an unfiltered `/dishes` and an unfiltered path page do not fetch. The path page's `baseKey` accounts for `fixed`. No double request found on the paths I read. Not exercised in a browser.
- Slugs: 178 origins, no `slugify` collisions and no empty slugs (production data). 54 origins have ≥5 dishes, matching the report. `filterHref` and `getStaticPaths` both read the one `getFilterPageIndex()` and use the same `slugify`, so a link for a page that is in the index cannot 404.
- The static page content is genuinely filtered, not the full list under a new heading: region uses `listAllDishes({country})` plus an exact filter; category/technique call `listDishes` with the filter. Titles and totals come from that filtered result.
- The cuisine/family/technique/ingredient/type filters are untouched by the alias change (`get("country") ?? get("region") ?? get("origin")` only affects `country`). Unfiltered `/dishes?…` for origins with <5 dishes still works with JS (direct-load fetch). Without JS it shows the unfiltered list, which is the unavoidable static-site limit and is what the 124 query-form links do.
- Placeholder has role, label, and hidden decoration.

## What I could not verify

- Did not run the production build (2.5 h) or the built output, so the 54/22/9 page counts, the "49 markers", and the smoke PASS lines are the report's claims. I verified the 54 from the live API only.
- Did not run the page in a browser: hydration behaviour, the redirect flash, Load more duplicates on India, and the no-JS rendering are from reading code.
- Category/technique counts (22/9) rely on the API's totals; I did not recompute them.
- Did not check whether `[locale]` routes should also get path pages (only that their links would be query-form).
