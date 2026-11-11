# Task brief — WP-01b v3 · fix the cross-review's findings

## Context

Repo: `/home/alex/projects/gustale.com`. Branch: **`feature/wp-01-ui-claude`**.

Your last delivery (commit `32ac7c6`) was cross-reviewed. The reviewer
confirmed the core fix is real — the path pages ARE genuinely filtered,
the threshold IS applied in one place, the smoke assertion was NOT
weakened — but found **six problems**. All six are in this brief. Fix
them, and do not regress what the reviewer confirmed as correct.

Read the review first: `docs/WP-01B-CROSS-REVIEW.md`
Then your own report: `docs/WP-01B-UI-REPORT.md`

## FINDING 1 (most serious) — the region page's exact filter and the client's substring filter disagree

`apps/web/src/pages/dishes/[kind]/[slug].astro:44-56` builds the initial
list with an EXACT `originName ===` filter, because the API's `country`
param is a SUBSTRING match. It then mounts `DishExplorer` with
`fixed={country: entry.value}`, so every client refetch ("Load more",
any filter change) sends `country=<name>` and gets the SUBSTRING set.

Measured on live:

| origin | exact | substring |
|---|---:|---:|
| India | 63 | 65 |
| Korea | 24 | 36 |
| China | 51 | 52 |
| Greece | 14 | 15 |

So on India, "Load more" fetches offset 24 of a 65-row set while the
page's first page came from a 63-row set: the page can show duplicates
or skip dishes, and its total becomes 65.

**FIX:** make the client and the server agree. Pick ONE:

(a) The client filters its results by exact `originName` when the
    filter is a `fixed.country`. The API's substring set is a superset,
    so filtering the superset by exact match gives exactly the same set
    as the server's exact list — and it works for the paginated case
    too, because the API's offset applies to the SUPERSET, so the
    client must not treat the API's offset as an offset into the exact
    set. Careful: option (a) has an off-by-N problem when the superset
    is bigger than the exact set.

(b) Give the API an exact-origin parameter and use it on both sides.
    This is the clean fix but it touches `apps/api/`, which is
    **WP-02b's** branch — do NOT do this here.

(c) On a region path page, render the WHOLE exact list server-side (no
    pagination), and disable the client's refetch for `fixed.country`.
    Then the page is complete and correct without JavaScript, and the
    client cannot contradict it.

**Recommendation: (c).** The region pages hold at most a few hundred
dishes, the site is static, and a complete page is strictly better than
a paginated one that lies about its own total. If you choose (a), you
must handle the superset-offset problem and prove it with a test.

**Also:** the region's `total` (exact) differs from what `?region=`
returns (substring). That is the more correct number, but it IS a change
in the meaning of a visible count. Say so in the report.

## FINDING 2 — the path-form links are NOT wired into three surfaces

Your report says the links moved to the path form. They did not, on
these three:

- `apps/web/src/pages/regions.astro:66` — `<CountryDirectory dishes=… client:load />`
  with no `pathPages`. Every origin-directory card links `?region=X`.
- `apps/web/src/components/DishLocalePage.astro:103-117` — `<DishDetail>`
  with no `pathPages`. The "Same category / method / region" links on
  every TRANSLATED dish page (9 locales) are query-form.
- `apps/web/src/pages/dishes/index.astro:79` — `<DishExplorer initial={initial} client:load />`
  with no `pathPages`, so `pathFormFor()` always returns null and your
  new redirect to the path form is DEAD CODE on `/dishes`.

Because `filterHref(pages=null, …)` falls back to the query form, every
one of those links is `/dishes?region=X` — which is exactly the
unfiltered-without-JS case this work exists to fix. With JavaScript off,
`/regions` and every non-English dish page still show the unfiltered
list.

**FIX:** pass `pathPages` in all three places. `getFilterPageIndex()` is
cached, so it is cheap — verify that claim by reading it.

**AND** add a smoke check that no `href="/dishes?…"` remains for a
filter that HAS a page, on `/regions` and on one translated dish page.
The reviewer notes the current smoke test only checks the English
`/dishes/rendang`, so it stays green while the other surfaces stay
broken.

## FINDING 3 — the redirect would flash the unfiltered list and narrows the filter

`DishExplorer.tsx`'s `pathFormFor` + `window.location.replace` run in an
effect, AFTER the unfiltered static HTML has painted. And
`?country=korea` slugifies to the "korea" page — the EXACT page, where
the API's substring would have returned 36 dishes, not 24.

**FIX:** decide. Either remove the redirect (the path pages are
discoverable through the links once finding 2 is fixed) or keep it and
accept the flash — but then say so in the report. If you keep it,
restrict it to an exact name match, not a slug.

## FINDING 4 — the smoke test needs tidying

- The comment at `scripts/smoke/gustale-smoke.mjs:~205-216` is SPLICED
  — "A check that passes while / Same for a category and technique
  link…". Repair it.
- A missing category or technique link is only a `WARN`. For WP-01 that
  must be a `FAIL` — a soft pass is the pattern the previous commit was
  written to remove.
- The technique regex takes the first `technique/` link on rendang but
  compares it against the hard-coded `technique=curry`. Take the
  `apiParam` from the href itself.
- The region regex also matches `/indonesia/` in ANY href — including a
  `/places/indonesia/` link. Anchor it on `/dishes/region/`.
- The region check requires ≥10 listed while category/technique need
  only ≥1. Make them consistent.

**The assertion itself is correct and must not be weakened:** every dish
the page lists must be in the API's filtered set.

## FINDING 5 — the cover placeholder mislabels a failed image

`packages/ui/src/Card.tsx:~125-140`. The failed-image state reuses the
"no cover" placeholder with `aria-label="<title> — no photograph yet"`.
That is FALSE when a photograph exists and failed to load. Also `failed`
is never reset if `cover` changes.

**FIX:** a neutral label for the failed case ("photograph unavailable"),
and reset `failed` when `cover.publicUrl` changes.

## FINDING 6 — smaller points

- The "49 card markers" for a 23-dish page is 2 markers per card, not a
  mismatch — but say so, so a reader does not think it is a bug.
- The eyebrow on non-Atlas domains still reads "Gustale Recipes"
  (`lib/domain.ts:81`). The nav link is WP-03, but the EYEBROW is not
  the nav link. Decide whether the rename is complete; if you leave the
  eyebrow, say why in the report.

## What the reviewer CONFIRMED as correct — do not regress it

- The filter plumbing round-trips: `category` is in `BrowseQueryState`,
  `DEFAULT_BROWSE_STATE`, `BROWSE_URL_KEYS`, `serializeBrowseState`,
  `browseFiltersKey`, `FRIENDLY_LABELS`, the no-filter test,
  `toListParams` and the effect dependency list. `region`/`origin` parse
  into `country` and serialise as `country`.
- Keeping `category` separate from `cuisine` is right.
- The `skipFilterFetch` fix: one `replaceResults` when the first-load
  key differs from the base key; no fetch on an unfiltered `/dishes`.
- The slugs: no collisions, no empty slugs, 54 origins with ≥5 dishes.
  `filterHref` and `getStaticPaths` read the same cached
  `getFilterPageIndex()` and use the same `slugify`.
- The static page content is genuinely filtered, not the full list under
  a new heading.
- The cuisine/family/technique/ingredient/type filters are untouched by
  the alias change.

## Rules

- Branch: `feature/wp-01-ui-claude`. Commit and push when done.
- **No `apps/api/` change** — WP-02b owns the API.
- No database, no migration, no deploy, no PR. The owner decides the
  merge and the deploy.
- Run `node scripts/run-lint.mjs` (must be rc=0) and the web build.
  **The live-data build takes about 2.5 hours** (16,584 pages, ~550 ms
  each). Build with `PUBLIC_API_BASE=https://api.gustale.recipes` and
  a long timeout, or use `BUILD_DATA_SOURCE=mock` for a quick
  compile check and say which you did.
- Run the smoke test against your built output and report the results.
- Update `docs/WP-01B-UI-REPORT.md` with what changed, what each fix
  does, and what you verified. Correct anything in it that the review
  showed to be wrong.
- Never print a secret.

## Done means

- All six findings fixed, or explicitly not fixed with a reason.
- The lint passes.
- The smoke test passes against the built output, with the new checks.
- The report is updated and honest about what was verified.
