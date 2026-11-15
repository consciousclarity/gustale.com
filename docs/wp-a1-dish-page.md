# WP-A1 — the dish page stops looking broken

**Baseline:** `origin/main` @ `094eff35` · **Branch:** `fix/dish-page-cover-and-empty-states`
**Date:** 2026-11-15 · **Package:** WP-A1 of the 2026-11-15 blueprint

---

## What was actually broken

The blueprint recorded four defects on the dish page. Each one was
reproduced on production before a line was changed, and each one turned
out to have a cause that was not obvious from the symptom.

| symptom | the real cause |
| --- | --- |
| "the cover photo stays invisible, leaving a 720 px dark block" | the CSS required an `is-ready` class that **nothing ever added**. The component is server-rendered and no script set it. The image loaded, the browser decoded it, and the reader still saw the placeholder. |
| "'Places & traditions' shows 'Loading the associations…' permanently" | the island was mounted `client:visible` and the section sits **3.5 viewports down** the page, so the request was **never made**. The empty state already existed and was already correct — it could not render because the component never hydrated. |
| "'Variants 0' and 'Contributors 0'" | the meta row printed every cell unconditionally. |
| "578 px content width from unbroken credit URLs" | the credit string was printed verbatim with three URLs inside it, and the citation text was printed with `dangerouslySetInnerHTML` as plain text ending in a raw URL. |

## What was changed

| file | change |
| --- | --- |
| `apps/web/src/styles/global.css` | the cover image is `opacity: 1` by default; the frame is `overflow: clip` (not `hidden`, which made it a scroll container); the caption, the family stats row and the citation line can all break. |
| `apps/web/src/components/DishCoverHero.tsx` | the `is-ready` class is now added by a `useEffect` that handles the **already-complete** image (the warm-cache path). The credit is printed as text. |
| `apps/web/src/lib/creditText.ts` | **new.** `stripUrls` — the credit with its URLs removed and its names kept. |
| `apps/web/src/components/AtlasPlaces.tsx` | a **5-second timeout** on the loading state; the error state says what happened and offers **Retry**; the empty state uses the blueprint's wording. |
| `apps/web/src/pages/dishes/[slug].astro` | the island is `client:idle`, not `client:visible`. |
| `apps/web/src/components/DishDetail.tsx` | a meta cell renders only when its value is greater than zero; the citation is rendered as text with the URL as a link, not as HTML. |
| `apps/web/src/lib/creditText.test.ts` | **new.** 6 unit tests for `stripUrls`. |
| `apps/web/package.json` | a `test` script for the web package. |
| `scripts/hermes/wp-a1-dish-page-gate.mjs` | **new.** The gate that asserts all four acceptance criteria. |
| `docs/ci-wp-a1-web-tests.patch` | **new.** One CI step, for the owner to apply (the App has no workflows scope). |

## The two things that are not obvious

### 1. The empty state was never missing

The blueprint's instruction was to "treat a successful response with zero
associations as its own state". That state **already existed** in
`AtlasPlaces.tsx`, with good wording. The problem was that the island
never hydrated, so the state could not be reached. Changing the
mount directive fixed a defect that no amount of work on the empty
state would have fixed.

Proof, from the browser on production before the change:

```
after load, atlas requests: 0
BEFORE scroll: "Places & traditions\n\nLoading the associations for Chicken Tikka Masala…"
after scroll, atlas requests: [REQ .../atlas, RES 200 .../atlas]
AFTER scroll: "No association has been published for this dish yet. …
               Associated with United Kingdom · GB …"
```

### 2. `client:idle`, not `client:load`

`client:load` would have fixed the loading line too, but it hydrates
every island on the page eagerly. `client:idle` hydrates when the
browser is idle — after the static HTML has painted and the critical
path is done — which keeps the page fast and still has the section's
content ready before a reader reaches it.

## Acceptance criteria — measured

The gate: `node scripts/hermes/wp-a1-dish-page-gate.mjs --base <url>`.

| criterion | production BEFORE | this branch AFTER |
| --- | --- | --- |
| cover opacity 1 within 1 s | **0** on both dishes, both widths | **1** on all four pages |
| cover image decoded | yes (the image was never the problem) | yes |
| no "Loading the associations" after 6 s | **present** on all four pages | **gone** |
| no meta cell shows 0 | 2–3 per page | **0** |
| `scrollWidth == clientWidth` at 390 px | **573 > 390** (chicken tikka masala) | **390 == 390** |

The family page's own overflow is fixed too, and the defect was real:
`/family/casserole` on production scrolls to **482 px** at a 390 px
viewport, and the offenders are the `.fam-stats .s` cells. This branch
builds it at **390 px**.

```
ok       mobile /family/casserole        scrollWidth=390 clientWidth=390
```

### Accessibility

```
axe gate: PASSED — 0 violations across 6 pages x 2 viewports.
```

### Build and tests

| gate | result |
| --- | --- |
| `pnpm --filter @gustale/web run build:geo` (against the mock API) | **BUILD_RC=0**, every `validate-build` check passed |
| `pnpm --filter @gustale/api exec vitest run` | 231 passed, 3 skipped |
| `pnpm --filter @gustale/db run typecheck` | clean |
| `pnpm --filter @gustale/api run typecheck` | clean |
| `pnpm lint` | RC=0 (warnings only — the repo's pre-existing known debt) |
| `tsc --noEmit` on the web | **90 errors on main, 90 on this branch**, identical sets, none in the changed files |
| the web unit tests | **131 passed** (6 new + 125 that were orphaned) |

## Screenshots

`docs/screenshots/wp-a1/before/` is production, `docs/screenshots/wp-a1/after/` is this
branch's build. Both at 1440 px and 390 px, for both test dishes.

The before/after difference is visible: the before screenshot shows a
dark empty block with "GB / UNITED KINGDOM" on it; the after screenshot
shows the photograph.

## The CI step the owner has to apply

`docs/ci-wp-a1-web-tests.patch` adds one step to the "Tests (vitest +
postgis)" job:

```yaml
- name: Run the web unit tests
  working-directory: apps/web
  run: pnpm test
```

```bash
git apply docs/ci-wp-a1-web-tests.patch
```

**Why this is needed at all:** `apps/web` had no `test` script and no
CI step, so the **seven test files already in `apps/web/src/lib/` —
125 assertions — were orphaned.** They passed; nothing ran them. This
PR adds `apps/web/src/lib/creditText.test.ts` to that set, and this
step is what makes it a gate rather than a comment.

## What this PR does NOT do

- It does not publish any association, change any data, or touch the
  database. **No migration, no live write.**
- It does not change the API. The `/api/dishes/:slug/atlas` response
  was read only.
- It does not fix the 2026-11-15 blueprint's other packages. The
  "Origin" label on the meta row stays until WP-B2 publishes the
  legacy associations as Unverified; the dish page's section order
  stays until WP-C2.
- It does not touch `client:visible` on `RelatedDishes`, which is
  correct there — that section is below the fold and its content is
  genuinely optional.

## Recovery

Revert the merge commit. The web images rebuild on the next deploy.
There is no data to restore.
