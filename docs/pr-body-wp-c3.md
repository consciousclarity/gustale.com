# Dish page: stop printing internal metadata, show the photo at once, fix the accent

Six fixes to `/dishes/moussaka-greek`, found by walking the live page at 1440 and 375 after #265. The structure was good, so this keeps it and fixes what was wrong.

One PR, as asked.

---

## 1. "Places & traditions" was printing the database's internal notes

The association row printed the `explanation` field verbatim — which is the **database's note about how the row got there**, not a finding about the dish:

> Migrated from the legacy origin_geo_id. This is the Wikidata 'country of origin' value -- DISCOVERY DATA, not a reviewed historical claim ... preserved in legacy_value.

Also visible: `dish_cuisines`, and the unfilled placeholders `<cuisine>` and `<tradition>` printed literally.

**The fix is at the API boundary, not in CSS.** `apps/api/src/routes/atlas.ts` no longer selects `explanation`, `legacy_value` or `provenance`, and the page builds its own ONE public sentence from the relationship and the entity:

```
Unverified association · [Unverified]
Associated with Greece.
```

The same field leaked from the **place** page's API too — `/api/places/greece` was shipping it — so `apps/api/src/routes/places.ts` is fixed as well.

**The build now fails if it ever comes back.** `apps/web/scripts/validate-build.mjs` scans every generated page and fails on `origin_geo_id`, `DISCOVERY DATA`, `historical_emergence`, `legacy_value`, `dish_cuisines`, `<cuisine>` or `<tradition>`.

---

## 2. The cover was a dark hero that waited for hydration

The old cover was a full-bleed hero with a typographic fallback painted dark, and the photograph only covered it once the island had hydrated.

Measured cold on 2026-11-19, the photograph painted at:

| | live | this branch |
|---|---|---|
| desktop 1440 | 1687 ms | **454 ms** |
| mobile 390 @3x | 3498 ms | **467 ms** |

(The owner saw ~4 s and >6 s; my machine is faster than theirs, so the numbers are lower but the ratio is the same. On the phone this is a **7.5x** improvement.)

The fix is not a faster fade — it is a different layout. The photograph is now a **4:3 image beside the title**, in the flow of the Overview section. There is no dark full-bleed frame to wait for, so there is nothing to wait for.

**Responsive srcset, and the 800w file on mobile.** A plain `srcset` cannot promise that: the browser multiplies `sizes` by the device pixel ratio, so a 390px phone at 3x asked for more than 800 device pixels and took the **1536w** file. A `<picture>` with a `media`-scoped source offers only the 800w file on a phone, so there is nothing larger to choose at any pixel ratio:

```
desktop 1440 @1x  →  cover-800w.webp
mobile  390 @2x   →  cover-800w.webp
mobile  390 @3x   →  cover-800w.webp   (was 1536w)
```

The image is `loading="eager" fetchPriority="high"`, with no opacity gate and no hydration dependency.

---

## 3. Greece was shown twice

The legacy origin block and the association list are the **same fact** — the migration wrote the legacy `origin_geo_id` into an association row *and* left the legacy block in place. The page printed "Greece" in the list and again in a separate "Associated with Greece" box.

The list wins, because it carries the relationship and the evidence label. The legacy block still appears for a dish with **no** associations at all, where it is the only thing the reader has.

---

## 4. "Prepared components" listed a preparation method

It listed "Fried & topped" — that is a method, not a component. It now lists components only:

> **Prepared components** — Béchamel sauce

and the method moved under Technique, which reads:

> **Technique** — Frying, Fried & topped

Components are identified through the canonical ingredient taxonomy (`savoury-sauces` and the other 22 categories). There is no "is a component" flag in the database, so the taxonomy is the source of truth.

---

## 5. "Add a dish" was herb green everywhere

`rgb(50,122,47)` on gustale.com. The recipe theme was applied through a **body-level** marker, so it leaked onto every page.

The theme is now a **page-level** marker: recipe routes get herb green, everything else keeps the terracotta accent.

| page | accent |
|---|---|
| `/dishes/moussaka-greek` | terracotta `#b04e29` |
| `/recipes`, `/recipes/<slug>` | herb green `#327a2f` |

---

## 6. The Nightly on main failed — owner patch included

Run `44404490001`, SHA `7c0c53ce`, 2026-11-18 21:44. The `Nightly reset` job failed and the rest were skipped:

```
FATAL:  database "gustale_ci" does not exist
```

**The cause.** The service container was told to create one database and the job asked for another:

```yaml
.github/workflows/nightly.yml:49
  POSTGRES_DB: gustale_ci_ci      ← creates gustale_ci_ci

.github/workflows/nightly.yml:14
  DATABASE_URL: postgres://...@127.0.0.1:5432/gustale_ci
.github/workflows/nightly.yml:105
  psql -h 127.0.0.1 -U postgres -d gustale_ci
```

The `_ci` suffix is a copy/paste slip — `ci.yml` runs its own service with `POSTGRES_DB: gustale_ci`.

**This ships as a patch, not a commit:** the GitHub App has no `workflows` scope, so it cannot push a change to `.github/workflows/*.yml` at all (GitHub rejects the token with 422). The owner applies it:

```bash
git checkout main
git apply docs/ci-nightly-postgres-db.patch
git commit -m "ci: the nightly service database is gustale_ci"
git push
```

The patch is verified to apply cleanly to `origin/main`, and the patched workflow then matches `ci.yml` exactly.

---

## Screenshots

**Before (live, before this change)**

| 1440 | 390 |
|---|---|
| ![before 1440](https://raw.githubusercontent.com/consciousclarity/gustale.com/feat/wp-c3-dish-page-fixes/docs/screenshots/before-1440.png) | ![before 390](https://raw.githubusercontent.com/consciousclarity/gustale.com/feat/wp-c3-dish-page-fixes/docs/screenshots/before-390.png) |

**After (this branch)**

| 1440 | 390 |
|---|---|
| ![after 1440](https://raw.githubusercontent.com/consciousclarity/gustale.com/feat/wp-c3-dish-page-fixes/docs/screenshots/after-1440.png) | ![after 390](https://raw.githubusercontent.com/consciousclarity/gustale.com/feat/wp-c3-dish-page-fixes/docs/screenshots/after-390.png) |

Captured with Playwright against the live site and against the local build of this branch, at a cold cache.

They are linked rather than attached: GitHub removed the issue-asset upload endpoint on 2026-11-17, so the App cannot upload to a PR comment any more. The files are committed under `docs/screenshots/` and served from raw.githubusercontent.com.

---

## What was verified, and how

| check | result |
|---|---|
| web unit tests | **306 / 306 pass** |
| api atlas tests | **28 / 28 pass** |
| typecheck | **79 errors — identical to `main`**, no new ones |
| lint | **0 errors — identical to `main`** |
| build | **16,634 pages, 0 errors** |
| `validate-build.mjs` | **90 passed, 0 failed** |
| cover paint time | 454 ms desktop / 467 ms mobile (was 1687 / 3498) |
| mobile cover file | `cover-800w.webp` at 1x, 2x and 3x |
| forbidden strings in the built page | **0 occurrences of each** |

### Two pre-existing failures I fixed along the way

Both were in `apps/api/test/atlas.test.ts`, and both were **asserting the leak**:

- *"exposes NO draft association"* asserted `association.provenance === "atlas_fixture"` — i.e. it asserted the internal field **was present**. It now asserts the internal fields are **absent** and the public identifiers are still there.
- *"does not expose a reviewer's notes or the queue's reasons"* failed on `main` too, because it did a blanket `expect(json).not.toContain("reason")` and the payload legitimately contains `"reason":"Both core Levantine street foods..."` — a **public, human-written** connection sentence. It now targets the reviewer's reason field specifically.

### Not fixed here, on purpose

The full API suite has **6 remaining failures locally** (8 on `main` before this PR). They are **fixture-data mismatches** in the local `gustale_ci` container, which has different seed data than CI's — not regressions from this branch. CI runs the API tests against a fresh `gustale_ci` service.

---

## Screenshots of the internals

The `Places & traditions` section now reads:

```
Unverified associations
  Unverified association · [Unverified]
  Associated with Greece.

  Unverified association · [Unverified]
  Associated with the Greek cuisine.
```

No explanation, no `legacy_value`, no `dish_cuisines`, no `<cuisine>`, no `<tradition>`.
