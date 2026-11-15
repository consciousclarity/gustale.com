# Task brief — WP-02 v2 · paginate the index pages, gate on the count

## Context

Repo: `/home/alex/projects/gustale.com`. Branch:
**`feature/wp-02-pagination`**.

You stopped on 2026-11-11 because the family diagnosis was contradicted,
and **you were right to stop** — WP-00's brief was wrong and you caught
it before writing code. This brief is the revised version.

Read your own report again: `docs/WP-02-REPORT.md`. Then read
`docs/WP-01-WP-02-CORRECTIONS.md` (the corrected diagnosis, including
your findings) and `docs/WP-02-NOTE.md` (the owner's instruction).

## What changed

**The family count has been split out of this package.** The owner has
decided the canonical vocabulary, and it needs an API change that would
conflict with the web-side work here. So:

- **This package (WP-02) = the pagination + the count gate + the places
  wording.** No family-vocabulary change. Leave `familySlug` alone.
- **The family vocabulary change is a separate package** (WP-02b) on a
  separate branch, because it changes `apps/api/src/routes/dishes.ts`.

**Your family finding is not wasted** — it is the reason WP-02b exists,
and your report is its brief. Do not implement it here.

## What is confirmed

- The API's `limit` ceiling is 100 by design (`dishes.ts:53`) and must
  stay.
- `GET /api/dishes` already returns a `total`, computed with the **same
  WHERE clause** as the list (`dishes.ts:386-399`), so it cannot disagree
  with it.
- Live pagination is exact: 1474 collected, 1474 reported.
- The defect: `regions.astro:26` and `families.astro:22` fetch only 100
  rows and build the directory from them. `buildCountryDirectory`
  (`browse.ts:505`) groups by `originName`, so the pages can never show
  more than the first 100 dishes cover: **36 countries shown vs 178 in
  the API**.
- **Your draft gate worked.** You proved it: with a fixture returning 1
  dish and `total: 2`, the Astro build exited 1 with the SHORT diagnostic
  and wrote no page. Keep that test — it is the proof the gate can fail.

## The owner's instruction

> *"The API rejects limit > 100. Don't just raise the limit — paginate or
> use a count endpoint, and the count gate must fail if the list is
> short."*

## What to do

### 1. The pagination helper

In `apps/web/src/lib/browse.ts`, next to `buildCountryDirectory`. Use the
real types from `apps/web/src/lib/api.ts` and `apps/web/src/types/dish.ts`
— do not invent new ones. Check that `listDishes` returns `total` in
every call shape you need; if not, **that is the only API-side change you
may make, and you must flag it explicitly**.

### 2. Use it in `regions.astro` and `families.astro`

The two pages must see the whole catalogue.

### 3. The count gate — two levels

**Gate 1 (the real one): the build fails if the list is short.** After
paginating, assert the collected count equals the API's `total`, and
**throw**, so the build fails and the page is never written.

```ts
if (all.length !== page.total) {
  throw new Error(
    `[regions] the dish list is SHORT: collected ${all.length}, ` +
    `the API says ${page.total}. The directory would be built from an ` +
    `incomplete catalogue.`,
  );
}
```

**A short list must never reach production.**

**Gate 2: the smoke test.** The existing `family-counts-agree` compares
the API count, the page count and the families in use. **It will still
fail after your change, and that is correct** — it compares two different
vocabularies (the atlas's 123 against the legacy 22). It belongs to
WP-02b. **Do not change it, and do not change a number to make it pass.**

**Add** an explicit *"the list is not short"* assertion, so a regression
is reported as a **short list**, not as "counts disagree":

```
directory-list-not-short   SHORT LIST if incomplete: Places 178/178; families 22/22
```

**Keep your draft test** — the one that proves the gate fails on a short
list. Put it in the repo this time (it was reverted at the stop; your
report says it was at `apps/web/scripts/test-directory-build-gate.mjs`).
**The brief's "Done when" requires it**: *"a deliberately broken count
(local test) fails the build"*.

### 4. Places lists all origins

With an explicit "+ N more" instead of a silently truncated sample list.

### 5. The lineages gap — do NOT "fix" it

You established that the two missing lineages (`preserved-fish`,
`wrapped-leaf`) have `dishCount: 0` and are deliberately excluded by the
indexing policy, with `noindex` set. **You are right, and this is not a
defect.** Leave it. It is a policy, and WP-00's brief wrongly listed it
as one.

### 6. The places wording — the owner's proposal, for you to implement

From your own report, which Hermes has taken forward:

> **"Dish origins"** for the origin directory, **"Mapped places"** for the
> home map's distinct places, and **"Published place associations"** for
> the atlas statistic if that is the intended measure.

**Implement these labels.** And for `places-stat`: **validate the
matching measure instead of using origins as its comparator.** The
atlas's `places` counts *distinct places associated with a published
dish* — which the API reports as 0, while the data holds 178 origins and
121 located dishes. Do **not** change the number. Change the label and
make the check compare the right thing.

## Checks

```bash
node scripts/run-lint.mjs
PUBLIC_DOMAIN=recipes BUILD_DATA_SOURCE=live PUBLIC_API_BASE=http://127.0.0.1:4000 pnpm --filter @gustale/web run build:recipes
PUBLIC_DOMAIN=geo     BUILD_DATA_SOURCE=live PUBLIC_API_BASE=http://127.0.0.1:4000 pnpm --filter @gustale/web run build:geo
```

**The web package has no `typecheck` script** and `astro check` reports
**83 pre-existing errors** (MapLibre nullability, AtlasHeroKpi's boolean
typing, Layout's missing `isNotFound` prop). Those are not yours. If you
add a `typecheck` script, say in your report that it surfaces pre-existing
errors, and make sure **your own files add none**.

And the smoke test against production:
```bash
scripts/smoke/run-smoke.sh --wp WP-02
```
It will still show the WP-02 checks failing **on production**, because
production still has the old pages and the family-vocabulary work is not
shipped. That is expected — you are not deploying. Say so.

## Commit and push

```bash
python3 scripts/hermes/push_sha_as_app.py origin feature/wp-02-pagination <your-verified-sha> <current-remote-sha>
```
Get the remote sha with `git ls-remote origin refs/heads/feature/wp-02-pagination`.
**NEVER force-push.** If the helper says "remote moved", fetch, reconcile,
re-run.

## Rules

- **Do not raise the API's `limit` ceiling.**
- **Do not add a count endpoint.** One count, computed with the same
  WHERE clause as the list, is what makes the gate trustworthy.
- **Do not change the API** except as flagged in step 1.
- **Do not change the family vocabulary.** It is WP-02b.
- **Do not touch the database.** No migrations, no writes to live.
- **Do not implement WP-01.**
- **Do not deploy. Do not open a PR.**
- **Never print a secret.**

## Save

Rewrite `docs/WP-02-REPORT.md` with: your verification; every file you
changed and why; **the gate-fails test, in the repo, with its output**;
the places wording you implemented and what you changed in the
`places-stat` check; the smoke test output and the explanation that
production still fails; the commit sha; and anything you found but did
not fix, and why.
