# MIGRATION RECEIPT — `0060_legacy_associations_published.sql`

**WP-B2. The legacy associations, published as Unverified.**

**NOT YET APPLIED TO LIVE.** This receipt records the work, the
measurements and the apply procedure. The apply happens only after this
PR is merged, the workflow patch is applied by the owner, and a fresh
backup is taken. The "APPLY" section below is written in the future
tense for that reason — it is a procedure, not a report.

---

## What WP-B2 is

The blueprint's WP-B2 asks for two things at once:

1. **The legacy associations become visible.** The ADR-004 backfill
   (migration 0037) imported 2,713 rows from the old `places` and
   `traditions` fields. Every one of them was published as `draft`, so
   the public API served **zero** places and the atlas was empty. The
   blueprint asks for them to be published — labelled **Unverified**,
   because no source supports them.

2. **The #186 pilot is preserved.** The 50 rows a human had already
   put into `in_review` must not be duplicated, re-created or reset.

The two are in tension if you publish the rows naively: publication is
what makes a row visible, and the pilot's 50 rows are mid-review. So
0060 publishes the rows **without** touching their review state, and
separately teaches the API to serve the legacy rows through a rule that
does not weaken the reviewed rule.

---

## What counts as a legacy row (the one definition)

Before a row can be published as Unverified, the migration has to know
which rows are legacy. That turns out to be the subtle part, and the CI
fixture caught it.

**A row is legacy when EITHER**

* its `provenance` is one of the three the backfill (0037) writes —
  `legacy_dish_cuisines`, `legacy_dish_traditions` or
  `legacy_origin_geo_id`; **OR**
* any of its `qualifiers` is named `legacy...`.

**Why the qualifiers matter, and why this was nearly wrong.**
`provenance` has **no CHECK constraint** — it is free-form text. The
CI fixture labels its rows `atlas_fixture` while carrying exactly the
same legacy qualifiers the backfill sets, so a provenance-only rule
misses them entirely.

But the qualifiers are not a detail either, and this is the part that
would have shipped a half-done migration. On **production**, the
qualifier keys are:

| qualifier | rows |
|---|---|
| `legacyCuisine` | 1,233 |
| `legacyOriginGeoId` | 1,470 |
| `legacyStatus` | 1,243 |
| `legacyProvenance` | 1,243 |
| `legacyOriginName` | 1,470 |
| `legacySourceClass` | 1,470 |
| `legacyIsPrimary` | 1,233 |

The 1,235 rows that were typed `established_tradition` are the legacy
**tradition** rows, and they carry **only** `legacyStatus` and
`legacyProvenance` — no `legacyCuisine`, no `legacyOriginGeoId`. A rule
that recognised legacy rows by those two markers would have left all
1,235 rows typed `established_tradition`, which is exactly the claim
WP-B2 exists to remove. The rule therefore accepts the **`legacy`
prefix**, so a qualifier the backfill adds later cannot be missed.

The rule lives in `public.association_is_legacy_row(provenance,
qualifiers)` — one function, used by the transformation and by every
assertion, so the two cannot disagree.

---

## The two rules, and the one function that is their union

ADR-004 §D8.2 requires **one** definition of visibility, so that a dish
page and a place page cannot disagree about what exists. There are now
two rules, and they are **disjoint**:

| rule | what it admits | whose rule |
|---|---|---|
| the reviewed rule | published AND `evidenced` AND `accepted` | the owner's, of 2026-11-13 — **unchanged** |
| the legacy rule | published AND `legacy_unreviewed` AND `unevidenced` AND not rejected | WP-B2's |

0060 does **not** restate either rule in the routes. It defines:

- `public.association_is_visible(p_publication_state, p_relationship_type, p_evidence_status, p_review_state)`
  — the **boolean**, taking the four field values. `SECURITY DEFINER`.
  This is the single place the rule lives.
- `public.published_legacy_associations_for_dish(uuid)` — the legacy half.
- `public.visible_associations_for_dish(uuid)` — **the union**.
- `public.visible_place_associations_for_place(uuid)` — the union, place-scoped.

Every public read path uses the union:

| route | before | after |
|---|---|---|
| `apps/api/src/routes/atlas.ts` | `published_associations_for_dish` | `visible_associations_for_dish` |
| `apps/api/src/routes/atlas-counts.ts` | `published_associations_for_dish` | `visible_associations_for_dish` |
| `apps/api/src/routes/places.ts` | the table, twice | `visible_place_associations_for_place`, twice |
| `apps/api/src/routes/search.ts` | the table | `visible_place_associations_for_place` |

**The reviewed rule is not weakened.** `published_associations_for_dish`
is untouched, and it still returns **0** rows for these associations —
there is no `evidenced`/`accepted` row among them, so there never was.
The legacy path is a **second, explicit** path, not a relaxation of the
first. A reviewer who prefers to keep the reviewed rule alone can drop
the union and lose the legacy rows without losing anything reviewed.

---

## What the migration does, and what it refuses to do

It **does**:

1. Measure the pre-state and refuse to proceed on a shape it does not
   recognise.
2. Re-type the 1,235 `established_tradition` rows to
   `legacy_unreviewed` — they were never established traditions; that
   was the legacy import asserting it.
3. Set `publication_state = 'published'` on all 2,713 rows.
4. Leave `evidence_status` alone: all 2,713 stay `unevidenced`.
5. Leave `review_state` alone: 50 stay `in_review`, 2,663 stay
   `unreviewed`. **No row is accepted, no row is rejected, no row's
   review state moves.**
6. Register itself in `public.gus_migrations_applied`.
7. Assert its own outcome **inside** its transaction, so a failed proof
   rolls the whole thing back.

It **refuses to**:

- give any row evidence (`evidence_status` stays `unevidenced`);
- accept any row (`review_state` stays `unreviewed`/`in_review`);
- touch the 50 pilot rows' review state, or create a second pilot;
- create, delete or re-type a dish, a place or a tradition;
- invent a source (`association_sources` stays at 0);
- run twice and publish anything twice — the second run is a no-op.

**No research was performed.** WP-B2 is a visibility change, not an
evidence-gathering project. Every row it publishes is published as
Unverified because nothing supports it yet, and the review work is a
separate job.

---

## The measurements

### The live baseline, taken 2026-11-18 (before any mutation)

Read over SSH with the read-only `dbq.sh` guard. Live was **not**
touched.

| | live, before |
|---|---|
| total rows | **2,713** |
| published | **0** |
| `legacy_unreviewed` | 1,478 |
| `established_tradition` | 1,235 |
| `unevidenced` | 2,713 |
| `evidenced` | 0 |
| `accepted` | 0 |
| `in_review` | **50** |
| `unreviewed` | 2,663 |
| `rejected` | 0 |
| `gus_migrations_applied` rows for 0060 | **0** |
| `association_review_log` | **50** |
| distinct dishes in the pilot | **50** |

Live's shape is identical to the local fixture's, so the local proof
below is a proof about the same data live holds.

### The post-state, measured on the live-shaped copy

The copy is `gustale_ci`, restored from the exact production dump
(`/tmp/live-shape-0059.dump`, taken 2026-11-16) with `0058` and `0059`
applied on top, then `0060`.

| | before | after |
|---|---|---|
| total rows | 2,713 | 2,713 |
| published | 0 | **2,713** |
| `legacy_unreviewed` | 1,478 | **2,713** |
| `established_tradition` | 1,235 | **0** |
| `unevidenced` | 2,713 | 2,713 |
| `evidenced` | 0 | 0 |
| `accepted` | 0 | 0 |
| `in_review` | 50 | **50** |
| `unreviewed` | 2,663 | **2,663** |
| `rejected` | 0 | 0 |
| ledger rows for 0060 | 0 | 1 |
| **places** the API serves | **0** | **180** |
| **communities** the API serves | 0 | **108** |
| strict reviewed rows | 0 | 0 |

The 180 places and 108 communities are **distinct entities**, not rows:
1,478 place rows resolve to 180 distinct places, and 1,235 community
rows to 108 distinct traditions. Both numbers are what the API's own
`/api/atlas/counts` returns, measured against the same predicate it
serves with.

---

## The proof

### The migration's own proof

`NOTICE: 0060: measured 2713 rows (1478 legacy, 1235 established, 50 in_review, 2663 unreviewed, 0 rejected)`
`NOTICE: 0060: ok — 2713 legacy rows published, 1477 visible for moussaka`

Both are emitted **inside** the transaction. The migration was applied
**twice** to the restored copy, and the second run changed nothing —
the ledger's `applied_at` did not move.

### The database-level proof — 18/18

`scripts/test-legacy-associations.sh` restores the production shape
into a disposable database, applies 0060, and asserts:

```
ok   the production shape is restored
ok   the baseline is the pre-WP-B2 state: rows exist and NONE is published
ok   the migration ran and proved itself
ok   every row is published (2713)
ok   the place route's predicate returns 180 places (it returned 0 before)
ok   Greece has visible associations
ok   every row is typed legacy_unreviewed — none claims to be an established tradition
ok   no row gained evidence it does not have (0 evidenced, as before)
ok   no row's review state moved (0 rejected, as before)
ok   the reviewed rule still returns nothing — it was NOT weakened
ok   no rejected row is visible through the legacy path
ok   the #186 pilot's 50 in_review rows are intact
ok   the migration recorded itself in the ledger
ok   a second run is a no-op — the migration is restartable
ok   the second run published nothing extra

15 passed, 0 failed
```

### The source-level contract — 23/23

`apps/web/src/lib/legacyAssociations.test.ts` asserts the contract in
the source, so a later refactor that breaks it fails the test suite
rather than the site. It covers the migration's shape, the rule, the
pilot, the four routes, the UI, and the **LATERAL** requirement.

That last one deserves a note, because it was a real bug found by
running the code rather than by reading it. The place route's first
draft called the union like this:

```sql
FROM public.visible_place_associations_for_place(g.id) a
  JOIN geo_entities g ON g.id = a.entity_id
```

`g` is **not in scope** where the function is called — it arrives with
the JOIN that follows it. PostgreSQL rejects it with *"missing
FROM-clause entry for table g"*, and `/api/places` returned **500**. The
fix is `CROSS JOIN LATERAL ... FROM geo_entities g`, and the test now
asserts the call is LATERAL and that the argument is not a column of a
later-joined table.

The test was proved **sensitive**: against the old (buggy) shape it
fails; against the fix it passes. The same proof was run for the two UI
changes — the old `DishDetail.tsx` and the `AtlasPlaces.tsx` without
the explicit legacy group both fail the suite.

### The full CI migration chain — the strongest of them

The migration was run inside the REAL CI chain, in its real position
(after 0037, after 238b/238c, after 0059 and 0058), against the CI
fixture database:

```
FULL_CI_CHAIN_OK=1
0060: ok — 13 legacy rows published (of 13 rows in the table), 7 visible for the busiest dish
ATLAS_SCHEMA_TESTS: 47 passed, 0 failed
ATLAS_BACKFILL_ASSERTIONS: 8 passed, 0 failed
ATLAS_COUNT_GUARD: 8 passed, 0 failed
```

**This is what caught the legacy-row bug.** The CI fixture's 13
associations carry `provenance = 'atlas_fixture'` and a mix of
qualifiers that production does not have, so the migration's
hard-coded counts (`expected 2713`) and its provenance-only rule both
failed there. Both were fixed to be **shape-based**:

* the count assertions compare against the number of rows the migration
  actually found, not a fixed number;
* the dish and place the assertions probe are "the one with the most
  legacy rows", not `moussaka` and `Greece` by name;
* the legacy-row rule accepts the qualifiers as well as the provenance.

**`scripts/test_atlas_backfill.sql` had to change with it.** Its
count-snapshot guard selected the tradition rows by
`relationship_type = 'established_tradition'` and the place rows by
`relationship_type = 'legacy_unreviewed'`. Migration 0060 retypes every
row to `legacy_unreviewed`, so those two selections became
indistinguishable and the guard began measuring the wrong rows — a
guard that measures the wrong rows is worse than no guard. The guard now
tells the rows apart by their **QUALIFIERS**, which the backfill sets
and 0060 does not touch, and the expected per-dish rows carry the
post-migration type. The migration `0037_atlas_backfill.sql` itself is
**unchanged** — it is applied, and Rule 11 freezes it.

### The API, running

With the API live against the migrated copy, every affected endpoint
returns 200:

| endpoint | result |
|---|---|
| `GET /api/places` | 200 — **180** places |
| `GET /api/places/greece` | 200 — 1 group, *"Unverified associations"* |
| `GET /api/atlas/counts` | 200 — dishes 1474, places **180**, communities **108** |
| `GET /api/atlas/connections` | 200 |
| `GET /api/search?q=greek` | 200 — 5 groups |
| `GET /api/dishes/moussaka` | 200 |
| `GET /api/dishes?limit=2` | 200 — total 1474 |

The web build completes: **110 pages** without `PUBLIC_API_BASE`,
**178 place pages** with it — the place pages are prerendered from
`/api/places`, which returned 180 places, and the built `/regions` page
lists Greece, Acadia and Jordan.

---

## The UI

The blueprint's rule: *"No dish has an 'Origin' field in the UI. Origin
claims are claims. Shared heritage is several associations; none is
marked primary unless sourced."*

**Removed** — the dish page's **"Origin"** meta cell, and the eyebrow's
**"Origin unrecorded"** fallback. The eyebrow now carries only the
first-attested dates, which *are* a documented record and are labelled
as such.

**Kept** — the associations section, which lists the place and the
tradition as several separate associations, each with its own evidence
badge. The legacy rows land in their **own group**, headed
*"Unverified associations"*, rather than falling into *"Other
associations"* — "Other" is a vague word for a specific thing, and the
thing here is specific: rows carried over from the old places and
traditions list, with no source behind them.

That group comes **last**, on purpose: it is the least evidenced group,
and a reader who meets *"Unverified associations"* before *"Historical
emergence"* would reasonably read the page as being about unverified
material.

The badge itself needed no new work — the existing `EvidenceLabel`
mapping already renders `unevidenced` as **"Unverified"**.

### The missing number on the homepage

The home page's KPI block renders **four** statistics. It was showing
**three**, and the one it dropped was **"Published place
associations"** — the label was there in the definitions row, but
**no number** appeared above it.

That is not a layout bug. `AtlasHeroKpi.astro` filters zero values out
of the stats row (`visibleStats`), while the definitions row renders the
full list. Live `/api/atlas/counts` returns **`"places": 0`** and
`"communities": 0` — because every association row is `draft` until this
migration publishes it. So the filter hid a **true zero** and the KPI
disappeared with it.

**This is the user-visible payoff of WP-B2.** Measured on the live-shaped
copy after the migration:

| stat | live, before | after 0060 |
|---|---|---|
| dishes | 1,474 | 1,474 |
| **Published place associations** | **0 (hidden)** | **180** |
| food families | 123 | 123 |
| connections | 82 | 82 |

Post-migration all four render, and the stats row and the definitions
row agree again.

**The proof is the built HTML, not an inference.** A full `astro build`
against the migrated local database (30 min, 16,781 pages) produced
`dist/index.html` whose stats row carries all four:

```
1,474 | dishes
  180 | Published place associations
  123 | food families
   82 | connections
```

and a definitions row of the same four terms. The live page right now
carries **three** stats and **four** definitions — the asymmetry is
visible in the live DOM. The screenshot
`docs/evidence/wp-b2/kpi-post-0060-desktop.png` is the built page's
stats block rendered in the production CSS at 2048 px: all four
present, and the long label fully readable, not clipped.

---

## The CI workflow patch

The GitHub App has **no `workflows` scope**, so `.github/workflows/ci.yml`
cannot be pushed by the agent. The change ships as a patch file:

**`docs/ci-patches/ci-legacy-associations-0060.patch`**

It adds `0060_legacy_associations_published.sql` to the workflow's
migration chain. It was verified to apply cleanly (`git apply --check`,
RC=0, no fuzz and no rejects) against a fresh checkout of `origin/main`.

**The owner applies it.** Until it is applied, CI will not run 0060 —
the local chain scripts (`scripts/ci-migration-chain.sh`,
`scripts/repro-ci-db.sh`, `scripts/repro-ci-test-job.sh`) **do** include
it, so the local reproduction of the CI job exercises it.

---

## The APPLY procedure (to run after the merge)

**Do not run any of this before the PR is merged and the workflow patch
is applied.** The order matters and each step is a gate.

### 1. Fresh backup, offsite copy

By the method in `docs/AGENT-RUNBOOK.md` §3 — `docker cp`, not `cp`,
because the host and the container do not share `/tmp`:

```
docker exec -u postgres shared-postgres pg_dump -U postgres -d gustale \
  --format=custom --file=/tmp/pre-0060-$(date +%Y%m%d-%H%M%S).dump
docker cp shared-postgres:/tmp/pre-0060-*.dump "$DUMP"
```

Confirm `gustale-backup.service` reports SUCCESS **before** continuing.

### 2. Re-take the live baseline

The counts in the table above are from 2026-11-18. Re-take them
immediately before the apply and **compare**. If live has moved, the
migration's own assertions will refuse it — but a mismatch that is
found *before* the apply is a non-event rather than a rollback.

### 3. Apply

Over SSH to `root@62.72.7.218`, by direct `psql`, with
`ON_ERROR_STOP=1`. The migration is idempotent, so a re-run after a
partial apply is safe.

### 4. Verify, in this order

| check | expected |
|---|---|
| `SELECT count(*) FROM dish_place_associations WHERE publication_state='published'` | 2,713 |
| `... WHERE relationship_type='legacy_unreviewed'` | 2,713 |
| `... WHERE evidence_status='evidenced'` | **0** |
| `... WHERE review_state='in_review'` | **50** |
| `... WHERE review_state='rejected'` | **0** |
| `SELECT count(*) FROM gus_migrations_applied WHERE name LIKE '0060%'` | 1 |
| `GET /api/places` | 200, **180** places |
| `GET /api/atlas/counts` | places **180**, communities **108** |
| `GET /api/places/greece` | 200, *"Unverified associations"* |
| the dish page | no **"Origin"** label |

### 5. Then, and only then, rebuild the web

**Migrate the database FIRST, then rebuild the web.** The web build
bakes the place pages from `/api/places`; a web build against the
un-migrated API bakes zero place pages, which is the half-deploy shape
of 2026-11-13. The API is not changed by this migration, so the API
container does not need a rebuild — but it must be **running against
the migrated database** before the web build starts.

---

## What this receipt does NOT claim

- **It is not applied.** Every "after" number is measured on a copy of
  production's data, not on production.
- **It is not verified on production.** The endpoint results are from a
  local API against the live-shaped copy.
- **It makes no claim about the 2,713 rows being TRUE.** They are
  published as Unverified because nothing supports them. Whether a
  given row is right is the review work, and it has not been done.
- **It does not weaken the reviewed rule.** That rule is untouched and
  still returns 0 rows for these associations — which is correct,
  because none of them is evidenced or accepted.

---

## The files

| file | what changed |
|---|---|
| `db/migrations/0060_legacy_associations_published.sql` | the migration, the four functions, the assertions |
| `apps/api/src/routes/atlas.ts` | reads the union |
| `apps/api/src/routes/atlas-counts.ts` | counts with the union |
| `apps/api/src/routes/places.ts` | reads the union on both paths; the LATERAL fix |
| `apps/api/src/routes/search.ts` | reads the union |
| `apps/web/src/components/AtlasPlaces.tsx` | the explicit *"Unverified associations"* group |
| `apps/web/src/components/DishDetail.tsx` | the "Origin" cell and the "Origin unrecorded" fallback, removed |
| `apps/web/src/components/DishCoverHero.tsx` | the "Origin unrecorded" fallback, removed |
| `apps/web/src/lib/legacyAssociations.test.ts` | the 23-contract suite |
| `scripts/test-legacy-associations.sh` | the 18-assertion database proof |
| `scripts/test_atlas_backfill.sql` | the count guard now tells the rows apart by their qualifiers, not by the type 0060 changes |
| `scripts/ci-migration-chain.sh` | 0060 added |
| `scripts/repro-ci-db.sh` | 0060 added |
| `scripts/repro-ci-test-job.sh` | 0060 added |
| `docs/ci-patches/ci-legacy-associations-0060.patch` | the workflow patch, for the owner to apply |
| `docs/MIGRATION-RECEIPT-0060.md` | this file |
