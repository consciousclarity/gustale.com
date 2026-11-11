# WP-00 → WP-01/WP-02 — corrected findings, and what the agents caught

**Date:** 2026-11-11. **Read-only investigation; no code changed yet.**

> **This document corrects `docs/WP-01-WP-02-DISCOVERY.md`.** Two of the
> three findings in that document were wrong, and both were caught by the
> agents that were sent to implement them — one by Codex on WP-02, one by
> Claude Code on WP-01b. The agents were right on every point and stopped
> rather than implement a fix that would not have worked. **That is the
> behaviour the operating model asks for, and it is worth recording.**

---

## 1. The region filter is NOT one line — Claude Code was right

**What WP-00's discovery doc said:** *"`region` is parsed at
`browse.ts:574` and chipped at `:618-623`. It is dropped at the last
step."*

**That is wrong.** Those two lines belong to **`LineageFilterState`** —
the *lineages* page's filter — not to the dishes browse state.

```ts
// apps/web/src/lib/browse.ts:544-552
// ─── Lineage filter state ───────────────────────────────────────────────
export interface LineageFilterState {
  q: string;
  region: string | null;     // ← line 548. The LINEAGES page.
  ...
}
```

`BrowseQueryState` — the state the `/dishes` page actually uses —
**has no `region` field at all** (`apps/web/src/lib/browse.ts:23-34`):

```ts
export interface BrowseQueryState {
  q: string;
  family: string | null;
  country: string | null;
  cuisine: string | null;
  type: string | null;
  ingredient: string | null;
  technique: string | null;
  sort: string | null;
  page: number;
}
```

`BROWSE_URL_KEYS` (`:50-60`) has no `region`, `parseBrowseState` reads
`country` but never `region`, and `FRIENDLY_LABELS` has no `region`.

**So `toListParams` did not drop a parsed filter — there was no filter
to drop.** Adding `region: state.region` would not have compiled.

### The bigger finding: a direct URL load never fetches at all

`DishExplorer.tsx:162-188`:

```ts
useEffect(() => {
  const key = browseFiltersKey(state);
  if (skipFilterFetch.current) {
    skipFilterFetch.current = false;
    ...
    return;                      // ← first render: no fetch
  }
  ...
}, [state.q, state.family, state.country, state.cuisine, state.type, state.ingredient, state.technique]);
```

`skipFilterFetch` short-circuits the **first** effect run. The API is
called only after a *later* state change. So a shared URL — pasted,
bookmarked, or linked from another page — **never filters**, even for
`country`, `cuisine`, `technique` or `family`.

**Measured on live, 2026-11-11 — every filter serves the identical page:**

```
category=stew       ['banh-mi', 'bibimbap', 'biryani-hyderabadi']
technique=curry     ['banh-mi', 'bibimbap', 'biryani-hyderabadi']
country=Indonesia   ['banh-mi', 'bibimbap', 'biryani-hyderabadi']
region=Indonesia    ['banh-mi', 'bibimbap', 'biryani-hyderabadi']
category=zzz        ['banh-mi', 'bibimbap', 'biryani-hyderabadi']   ← a category that does not exist
```

**`category=zzz` proves it.** A filter that does not exist produces the
same page as a filter that does. Nothing is being filtered.

**So the real defect is larger than WP-00 described:** there is no
URL-driven filtering on `/dishes` at all. The filters work only when a
visitor uses the in-page controls.

### And two false PASSes in the smoke test

The smoke test's `category-filter-works` and `technique-filter-works`
**pass today, and both are meaningless.** The assertion
(`scripts/smoke/gustale-smoke.mjs:209-225`) is:

```js
const first = dishSlugsIn(h).slice(0, 3);
const globalTop = dishes.sort(by viewCount).slice(0, 3).map(d => d.slug);
const unfiltered = first.length && first.every((s, i) => s === globalTop[i]);
record(…, unfiltered ? "FAIL" : "PASS", …);
```

It passes when the filtered page's first three dishes merely **differ**
from the global top three. But the static page's list is *not* sorted by
view count — its first three are `banh-mi, bibimbap, biryani-hyderabadi`,
while the global top three are `moussaka-greek, bibimbap, nasi-goreng`.
**They differ, so the check passes — for a page that filters nothing.**

**These two checks must be rewritten before WP-01 can be called done.**
A check that passes while the feature is broken is worse than no check:
it tells you the package is finished when it is not.

The right assertion is the one `region-filter-works` already uses:
**every listed dish must be in the filtered set**, not merely "different
from the unfiltered list".

---

## 2. The family count is NOT a pagination problem — Codex was right

**What WP-00's note said:** *"*22 families shown vs 123 in the taxonomy*"
— and implied that paginating the whole catalogue would close the gap.*

**That is wrong**, and Codex caught it by measuring the **whole**
catalogue rather than the first page:

```
1474 dishes · 178 origins · 22 non-null familySlug
```

**22 across the entire catalogue.** Pagination cannot produce 123.

### The cause: two different vocabularies

| | source | count |
|---|---|---:|
| **The dish list's `familySlug`** | legacy `dish_categories` → `categories` where `kind = 'dish-type'` | **22** |
| **`/api/atlas/counts` → `families`** | `dish_dish_families` → `dish_families` | **123** |

Verified in the live database (read-only):

```
atlas families in use (published):   123
legacy dish-type slugs (published):    22
OVERLAP (legacy slugs that are also dish_families):  19
```

**They are almost entirely different vocabularies.** The atlas's 123
include `brand`, `food`, `drink`, `course`, `national-dish`,
`traditional-food`, `human-food` — a different *granularity*, not a
superset. The legacy 22 are `main-course`, `appetizer`, `rice-dish`,
`curry`, `turkish-cuisine`, `filipino-cuisine` — course and cuisine
categories.

**`families: 123` and "22 families on the page" are both correct.** They
count different things. The home page shows the atlas number while the
families page shows the legacy one, and the site never says which is
which.

**This is the same class of problem as the `places` count** — two
correct numbers with no labels to distinguish them. It is a
**vocabulary decision, not a pagination bug**, and it needs the owner.

### The lineages gap is deliberate, not a bug

The sitemap lists 12 of 14 lineages. The two missing ones —
`preserved-fish` and `wrapped-leaf` — have **`dishCount: 0`**, and
`apps/web/src/pages/lineages/[slug].astro` sets `noindex` on them.
**That is an explicit indexing policy**: a narrative with no dish is not
indexed. Not a defect. WP-02's brief listed it as "the sitemap lists 12,
the API has 14"; it should not have been listed as a defect at all.

---

## 3. What is confirmed and unchanged

- **The cover-URL bug is exactly one call**, and WP-01a fixed it.
  `apps/api/src/routes/dishes.ts:1223`:
  ```diff
  - variantsUrls: (row.cover_variants as Record<string, string>) ?? {},
  + variantsUrls: mapVariantsToUrls(row.cover_variants),
  ```
  The helper already existed, was already correct, and was already
  guarded against drift. WP-01a audited every `variantsUrls` site in
  `apps/api/src/` — the other three already used the helper — and added
  `apps/api/test/dishes-featured-cover.test.ts` (5 tests) asserting the
  prefix, the list/featured agreement, and the empty-variants case.

- **The static `/dishes` page ignores the query string** — confirmed
  independently by Claude Code.

- **The heading says "Recipes"** — confirmed live:
  `<h1 class="browse-h1">Recipes</h1>`.

- **The API's region filter works** — `?region=Indonesia` returns 193,
  all Indonesian. The bug is entirely web-side.

- **WP-02's count gate design is right** — the `total` already exists,
  computed with the same WHERE clause as the list, and live pagination is
  exact (1474 collected, 1474 reported). Codex's draft gate **was proven
  to fail correctly**: with a fixture returning 1 dish and `total: 2`,
  the Astro build exited 1 with the SHORT diagnostic and wrote no page.
  It reverted the draft because the *family* half of the package could
  not be delivered, and it was right to.

---

## 4. What this changes about the plan

### WP-01 gets bigger, and correctly so

The fix is no longer one line. It is:

1. **`region` as an alias of `country`** in `parseBrowseState`, or a
   real `region` field in the state, URL keys, chips and labels.
2. **An initial fetch when a filter is present** — `skipFilterFetch` must
   not swallow the first render when the URL carries a filter. **This is
   the fix that makes `?country=`, `?cuisine=`, `?technique=` and
   `?family=` work on a direct load — which they do not today.**
3. **The static path pages**, because the brief requires the filtered
   list to work without JavaScript, and a static page cannot vary by
   query string.
4. **The heading rename**, and the cover placeholder.
5. **The two false-PASS smoke checks rewritten.**

### WP-02 splits

- **The pagination and the count gate** are sound and ready to build.
- **The family vocabulary** is a separate question, for the owner.

### Two decisions are needed, and they are the owner's

**Decision A — how many region path pages?** 178 origins, most with 1–2
dishes. Claude Code's provisional recommendation: generate pages only for
origins with **≥ 5 dishes**, leaving smaller ones reachable through the
client-side filter and the Places directory with an explicit "+ N more".
The alternative is all 178.

**Decision B — which family vocabulary is canonical?** Either:
- the site shows the **legacy 22** (dish-type categories) everywhere, and
  the home stat says 22; or
- the site shows the **atlas 123** (dish_families), which means the
  dish list's `familySlug` has to come from `dish_dish_families` — an
  **API change**, and a bigger one than WP-01a.

This decision also settles the smoke check `family-counts-agree`, which
currently compares the two vocabularies against each other.

---

## 5. What the agents did

| package | agent | outcome |
|---|---|---|
| WP-01a | Codex | **Done and pushed.** One-line fix, 5 new tests, full `variantsUrls` audit. The API test suite cannot run without `DATABASE_URL` (18 DB-dependent files) — an environment limit, not a code failure. |
| WP-01b | Claude Code | **Stopped at the verification gate.** Caught that the "one line" diagnosis was wrong, and found the `skipFilterFetch` first-load bug and the two false-PASS smoke checks that WP-00 missed. Produced a plan and the page-count question. |
| WP-02 | Codex | **Stopped at the verification gate.** Caught that the family count is a vocabulary mismatch, not a pagination gap. Built and **proved** the short-list gate, then reverted it because the package could not be delivered as briefed. |

**Both stops were correct.** Each agent found an error in WP-00's own
diagnosis before writing code. Neither pushed a fix that would not have
worked.
