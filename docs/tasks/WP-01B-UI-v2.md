# Task brief — WP-01b v2 · the URL-driven filter, the static region pages, the heading

## Context

Repo: `/home/alex/projects/gustale.com`. Branch: **`feature/wp-01-ui-claude`**.
You reported back on 2026-11-11 that the brief's "one line" diagnosis was
**wrong**, and that was correct. This brief replaces the first one.

**Your first report is the input to this brief.** Read it again:
`docs/WP-01B-UI-REPORT.md`.

Two things have been decided since:

- **Decision A:** generate static region pages for the **54 origins with
  ≥ 5 dishes**. The rest stay reachable through the client-side filter
  and the Places directory, with an explicit "+ N more".
- **The smoke test has been fixed.** Two checks that were passing on a
  broken page are now failing correctly. The corrected checks assert
  "every dish the page lists is IN the API's filtered set", so the page
  itself must be right — a client-side-only fix will not pass them.

Also read: `docs/WP-01-WP-02-CORRECTIONS.md` (the full corrected
diagnosis) and `docs/WP-01-WP-02-DISCOVERY.md` (WP-00's original, partly
superseded — where the two disagree, **the corrections win**).

## What you established (confirmed by Hermes, independently)

Your findings are all confirmed:

1. `browse.ts:574` and `:618-623` are `LineageFilterState`, not
   `BrowseQueryState`. `BrowseQueryState` has no `region` field.
2. `skipFilterFetch` short-circuits the first effect run, so a direct
   URL load never fetches.
3. Every filter is inert on a direct load. Measured live: `category=stew`,
   `technique=curry`, `country=Indonesia`, `region=Indonesia` and
   `category=zzz` all serve the **identical** page.

## What to do

### 1. Make the URL drive the filter

Accept `region` and `origin` as aliases of `country`, and `category` as an
alias of `cuisine`, in `parseBrowseState`. Serialize back to `country`
(the API treats `region` and `country` identically — `dishes.ts:180-183`
and `:244-246` — both return 193 for Indonesia).

**Be careful:** `parseBrowseState` and `parseLineageFilters` both exist and
both use the word `region`. Do not confuse them. `parseLineageFilters`
(browse.ts:562) is for the **lineages** page and is already correct.

### 2. Make the first load fetch, when a filter is present

`DishExplorer.tsx:162-188` skips the first effect run. When the URL
carries a filter, the first run **must** fetch. This is the fix that makes
`?country=`, `?cuisine=`, `?category=`, `?technique=` and `?family=` work
on a direct load — they do not work today, for any filter.

Also add any new key to the effect's dependency list (`:180-188`).

### 3. The static region pages (Decision A: 54 origins, ≥5 dishes)

- Generate `/dishes/region/<slug>/` pages at build time, for the
  **54 origins with ≥ 5 dishes**.
- The slug: derive it from the origin name the way the rest of the site
  does — check `apps/web/src/lib/browse.ts` for the existing kebab/slug
  helper and **use it**, so the links from the Places directory and the
  dish pages resolve to the same slugs.
- `/dishes?region=X` must redirect to the path form.
  **A `<noscript>` meta-refresh is not possible on a static page** (you
  established this). So:
  - the client-side redirect handles the JS case;
  - the **no-JS** case relies on links pointing **straight** to the path
    form — so update `AlsoExplore`, `CountryDirectory`, and the dish
    pages' "Same region" links to use `/dishes/region/<slug>/`.
  - for an origin with **fewer than 5 dishes** there is no path page. The
    link must then go to the query form (`/dishes?region=X`) and the
    client-side filter handles it. Say clearly in your report how many
    links take each route.

### 4. Rename the heading

`"Recipes"` → `"Dishes"` (or "All dishes") in the `<Layout title>`, the
breadcrumb, the `<BrowseHeader title>`, and the `countLabel` fallback at
`index.astro:48`.

### 5. The cover placeholder

A neutral placeholder when a cover fails to load, never a broken-image
icon.

### 6. The active-filter UI

A heading like "193 dishes from Indonesia" and a removable chip; clearing
returns to `/dishes`. **Check first** what already works for
`country`/`cuisine`/`technique` — do not rebuild what is there.

## The done condition is the corrected smoke test

```bash
scripts/smoke/run-smoke.sh --wp WP-01
```

`region-filter-works`, `category-filter-works` and `technique-filter-works`
must all PASS. They now assert that every dish the page lists is in the
API's filtered set — **a client-side-only fix will not pass them.**

Also, from the brief's "Done when": the filtered list must work with
**JavaScript disabled**. Verify that and say how you verified it.

## Checks

```bash
pnpm --filter @gustale/web run typecheck
node scripts/run-lint.mjs
PUBLIC_DOMAIN=recipes BUILD_DATA_SOURCE=live PUBLIC_API_BASE=http://127.0.0.1:4000 pnpm --filter @gustale/web run build:recipes
PUBLIC_DOMAIN=geo     BUILD_DATA_SOURCE=live PUBLIC_API_BASE=http://127.0.0.1:4000 pnpm --filter @gustale/web run build:geo
```

**Note:** `pnpm --filter @gustale/web run typecheck` may not exist as a
script — WP-02's agent found the web package has **no `typecheck`
script** and that `astro check` reports **83 pre-existing errors**
(MapLibre nullability, AtlasHeroKpi's boolean typing, Layout's missing
`isNotFound` prop). **Do not fix those** — they are not yours. If you
add a `typecheck` script, note in your report that it surfaces pre-existing
errors, and make sure **your own files add none**.

## Commit and push

```bash
python3 scripts/hermes/push_sha_as_app.py origin feature/wp-01-ui-claude <your-verified-sha> <current-remote-sha>
```
Get the remote sha with `git ls-remote origin refs/heads/feature/wp-01-ui-claude`.
**NEVER force-push.** If the helper says "remote moved", fetch, reconcile,
re-run.

## Rules

- **Do not touch `apps/api/`.** A separate branch changes the API's
  `familySlug` source; touching the API here makes the branches conflict.
- **Do not touch the database.** No migrations, no writes to live.
- **Do not implement D1, D2 or D3** — the language switcher, the banner,
  "Add a dish" → "Suggest a source or correction", and the Recipes **nav
  link** are WP-03. (The dishes-page **heading** is yours, step 4.)
- **Do not implement WP-02.** The regions/families directory pages and the
  count gate are a separate branch.
- **Do not fix the associations loader.** It works; it only mounts on
  scroll (`client:visible`).
- **Do not deploy. Do not open a PR.** The owner decides both.
- **Never print a secret.**

## Save

Rewrite `docs/WP-01B-UI-REPORT.md` with: your verification of each
defect; what you changed, file by file; **how you verified the no-JS
path**; how many links go to the path form vs the query form and why;
the smoke test output; the commit sha; and anything you found but did not
fix, and why.
