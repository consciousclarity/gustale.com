# MIGRATION RECEIPT — `0060_legacy_associations_published.sql`

**WP-B2. The legacy associations, published as Unverified.**

**APPLIED TO LIVE — 2026-11-18 (WITA).** The migration was applied to
the live production database (`gustale` on `shared-postgres`) **before**
PR #259 was merged, because the PR's code calls the functions this
migration creates. Applying it first is what makes the merge safe: the
functions exist before the code that uses them is ever deployed.

`PSQL_RC=0`, 0 error lines, `BEGIN` → `COMMIT`, and the migration's own
in-transaction proof was emitted. The live counts, the backup, the
idempotence proof and the post-apply endpoint checks are all below.

**The order was the point.** `origin/main` (`674548b`) calls
`published_associations_for_dish` — the reviewed-only function — while
PR #259's routes call `visible_associations_for_dish` and
`visible_place_associations_for_place`, which **do not exist until 0060
runs**. Merging first would have deployed code calling missing functions
and 500'd the atlas, the place pages, search and the counts. So:

1. the migration went to live first, and
2. the **existing** main-branch code was then verified to keep serving
   correctly on the migrated database (it did — no 500s, no missing
   function errors), and
3. only then was the merge unblocked.

Applying 0060 is **additive**: it creates five functions and publishes
2,713 rows. The reviewed-only function `published_associations_for_dish`
is untouched and still returns 0 rows for these associations, so the
owner's rule of 2026-11-13 is not weakened by the merge that follows.

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

### The live baseline, taken 2026-11-18 (before the mutation)

Read over SSH with the read-only `dbq.sh` guard. Live was **not**
touched.

> **Re-taken immediately before the apply and compared** — it was
> identical to the numbers below. See the APPLY section, step 4.

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

## The CI workflow patch — APPLIED

The GitHub App has **no `workflows` scope**, so `.github/workflows/ci.yml`
cannot be pushed by the agent. The change shipped as a patch file, and
the owner **APPLIED** it:

**`docs/ci-patches/ci-workflow-0060-and-build-date.patch`** (and its two
components, `ci-sitemap-build-date.patch` and
`ci-legacy-associations-0060.patch`)

It added `0060_legacy_associations_published.sql` to the workflow's
migration chain, plus the sitemap build-date steps. It was verified to
apply cleanly (`git apply --check`, RC=0, no fuzz and no rejects)
against a fresh checkout of `origin/main`.

**It has been applied** — the workflow change is in commit `12453ef`
("ci: the 0060 migration and the sitemap build date"), on the
`feat/wp-b2-legacy-associations` branch. The patch files are therefore
**deleted**: a spent patch is worse than no patch, because it looks
like the change is still queued, and it is not. CI now runs 0060.

The local chain scripts (`scripts/ci-migration-chain.sh`,
`scripts/repro-ci-db.sh`, `scripts/repro-ci-test-job.sh`) included it
from the start, so the local reproduction of the CI job exercised it
too.

---

## The APPLY — what was actually done, on live

Applied over SSH to `root@62.72.7.218`, by direct `psql` against
`shared-postgres`, with `ON_ERROR_STOP=1`. **2026-11-18 07:46–07:48
WITA** (the dump's own timestamp is `20261117T234602Z` — the container
clock is UTC).

### 1. The offsite backup service — SUCCESS

`gustale-backup.service` was started and confirmed **`Result=success`,
`ExecMainStatus=0`**, ending with:

```
SUCCESS: encrypted offsite backup complete: gustale_backup_20261117T233704Z.dump.gpg
```

### 2. A fresh, independent pre-0060 dump

Taken with `pg_dump --format=custom` **inside** the container and copied
out with `docker cp` (a plain `cp` cannot cross the host/container
boundary):

| | |
|---|---|
| path | `/home/gustale/backups/pre-0060-20261117T234602Z.dump` |
| size | **4,519,105** bytes |
| sha256 (host) | `c4d740f0b585b7a8b326eeea0210af99a354e1fe19572d4694275a06bf27b93d` |
| sha256 (container) | **identical** — `c4d740f0…7b93d` |

The size matches the backup service's own upload (`raw=4519105`), so the
dump and the offsite backup are the same data, captured independently.

### 3. The backup was proven RESTORABLE, not merely present

A dump that exists proves only that `pg_dump` exited 0. It was restored
into a disposable database on the **test** Postgres — never the
production cluster:

- `pg_restore` exit code captured **without a pipe**: **RC=0**, **0**
  error lines.
- The restored copy carried the **pre-0060** shape: `2713 | 0 published |
  1235 established | 50 in_review`, and **0** of the 0060 functions — so
  it is demonstrably a pre-0060 backup.
- The verify database was then dropped (`DROP_RC=0`, confirmed absent).

### 4. The live baseline was re-taken and compared

Read over SSH immediately before the apply:

| | live, before | the receipt expected | |
|---|---|---|---|
| total rows | 2,713 | 2,713 | ✅ |
| published | **0** | 0 | ✅ |
| `legacy_unreviewed` | 1,478 | 1,478 | ✅ |
| `established_tradition` | 1,235 | 1,235 | ✅ |
| `unevidenced` | 2,713 | 2,713 | ✅ |
| `evidenced` | 0 | 0 | ✅ |
| `accepted` | 0 | 0 | ✅ |
| `in_review` | **50** | 50 | ✅ |
| `unreviewed` | 2,663 | 2,663 | ✅ |
| `rejected` | 0 | 0 | ✅ |
| ledger rows for 0060 | **0** | 0 | ✅ |
| the 0060 functions on live | **0** | 0 | ✅ |

Live had not moved since the receipt was written, so the migration's own
assertions were applied to the shape they were written for.

### 5. The apply

```
docker exec -u postgres shared-postgres psql -U postgres -d gustale \
  -v ON_ERROR_STOP=1 -f /tmp/0060_legacy_associations_published.sql
```

**`PSQL_RC=0`, 0 error lines, `BEGIN` → `COMMIT`.** The migration's own
proof, emitted from inside the transaction:

```
NOTICE: 0060: measured 2713 rows (1478 legacy, 1235 established, 50 in_review, 2663 unreviewed, 0 rejected)
NOTICE: 0060: ok — 2713 legacy rows published (of 2713 rows in the table), 1477 visible for the busiest dish
```

> **A trap worth recording.** The first attempt failed with
> `psql: error: … No such file or directory` — `RC=1`. The file had been
> copied to the **host's** `/tmp`, but `psql -f` inside `docker exec`
> reads the **container's** filesystem, and the two do not share `/tmp`.
> Nothing was applied (the error came before the file was read) and live
> was verified unchanged (`2713|0|1235|50`, ledger still 0) before the
> file was copied **into** the container with `docker cp` and the apply
> re-run. The migration's sha256 was checked on both sides:
> `f7f2a30c650ca4700382c96e6a0a45284ec29d738d8c54389736c66f47866946`.

### 6. The live post-state — measured independently

| | expected | **live, after** | |
|---|---|---|---|
| total rows | 2,713 | 2,713 | ✅ |
| published | 2,713 | **2,713** | ✅ |
| `legacy_unreviewed` | 2,713 | **2,713** | ✅ |
| `established_tradition` | 0 | **0** | ✅ |
| `unevidenced` | 2,713 | 2,713 | ✅ |
| evidenced | **0** | **0** | ✅ |
| accepted | **0** | **0** | ✅ |
| `in_review` (the #186 pilot) | **50** | **50** | ✅ |
| `unreviewed` | 2,663 | 2,663 | ✅ |
| rejected | **0** | **0** | ✅ |
| ledger row for 0060 | 1 | **1** — `0060_legacy_associations_published`, `applied_by: Hermes` | ✅ |
| `association_review_log` | 50 | **50** | ✅ |

**Nothing was promoted, accepted or rejected.** The pilot's 50 rows kept
their review state and their log rows.

### 7. The functions, and the proof the reviewed rule is intact

All five functions now exist on live (`association_is_legacy_row` ×2
overloads, `association_is_visible` ×2, `published_legacy_associations_for_dish`,
`visible_associations_for_dish`, `visible_place_associations_for_place`).

The owner's rule of 2026-11-13 is **not** weakened, measured on live:

| check | result |
|---|---|
| `published_associations_for_dish(<busiest dish>)` — the reviewed rule | **0** |
| `visible_associations_for_dish(<the same dish>)` — the union | **3** |
| rows visible through the legacy path that are `rejected` | **0** |

### 8. Idempotence — the second run

The migration was applied a **second** time on live:

- `PSQL_RC=0`, 0 error lines, `BEGIN` → `COMMIT`.
- The counts were **identical**: `2713 | 2713 published | 2713 legacy |
  50 in_review | 0 rejected`.
- The ledger's `applied_at` **did not move** —
  `2026-11-17 00:00:00+00` before and after.
- The second run's measurement correctly recognised the post-state:
  `0060: measured 2713 rows (2713 legacy, 0 established, 50 in_review,
  2663 unreviewed, 0 rejected)`.

### 9. The MAIN-branch API still served correctly on the migrated database

This is the gate that made the merge safe. The running API container was
image `ghcr.io/…/gustale-api:674548b` — **exactly `origin/main`** — so
the verification ran against the *old* code, not the PR's.

| endpoint | result |
|---|---|
| `GET /api/dishes/moussaka/atlas` | **200** — full structure: `dish`, `placesAndTraditions`, `foodFamilies`, `historyAndConnections`, `legacy`, `counts`, `published` |
| `GET /api/places` | **200** — **180** places (Greece, Acadia, Afghanistan, Albania, Algeria, Americas, Ancient Greece) |
| `GET /api/places/greece` | **200** — 14 dishes, 1 group *"Unreviewed legacy association"* |
| `GET /api/search?q=greek` | **200** — 18 dishes, **2 places** |
| `GET /api/search?q=moussaka` | **200** — 8 dishes |
| `GET /api/atlas/counts` | **200** — dishes 1,474, families 123, connections 82 |
| `GET /api/dishes/moussaka` | **200** |
| `GET https://gustale.com/` | **200** |
| `GET https://gustale.com/dishes/moussaka` | **200** |
| `GET https://api.gustale.com/health` | **200** |

The API container logged **0** errors mentioning the 0060 functions and
**0** 500s in the 30 minutes after the apply.

**One honest asymmetry.** Main's `atlas-counts.ts` calls
`published_associations_for_dish` — the reviewed-only function — so on
main the counts still read `places: 0, communities: 0`, and the dish
atlas's `placesAndTraditions` is empty. That is **correct**, not a
break: main has no union function to call yet. The rows are published and
the place route (which reads the table) already serves 180 of them. PR
#259's routes call the union, so the counts become 180/108 on merge.

The PR's own queries were then run **against the live migrated
database** to prove they cannot fail for a missing function:

```
WITH visible AS (SELECT a.* FROM dishes d
  CROSS JOIN LATERAL public.visible_associations_for_dish(d.id) a
  WHERE d.status='published')
SELECT count(DISTINCT …) FROM visible v;
```

→ returned **178** distinct geo entities with **no error**. (178 rather
than 180: two of the 180 "places" are communities/traditions rather than
`geo_entities`, which is exactly the places-vs-communities split — the
receipt's 180 places / 108 communities.)

### 10. The web build is still the PRE-0060 one — on purpose

The web containers are `gustale-web-geo:live-data-674548b-geo`, built
**before** 0060, when `/api/places` returned 0 places. So:

- the served `/usr/share/nginx/html/place/` contains **0** pages (and
  1,479 dish pages) — the place pages are prerendered from `/api/places`,
  and that build had none to prerender, so `gustale.com/place/greece`
  404s. **This 404 predates the migration** and is not caused by it.
- the served homepage still shows the **3-KPI** shape — `1,474` dishes,
  `123` food families, `82` connections, and "Published place
  associations" appearing only as a *definition* with no number above it.
  That asymmetry is the pre-0060 signature the receipt describes.

The web rebuild belongs to the **post-merge deploy**, and the receipt's
original rule still holds: **migrate the database first, then rebuild
the web.** The database is migrated; the web rebuild follows the merge.

---

## What this receipt does NOT claim

- **It is applied** — to live, on 2026-11-18, before the merge. Every
  "after" number in the APPLY section above is measured **on live**.
- **The merge has not happened yet.** The migration is live; PR #259 is
  still open. On main the atlas counts still read `places: 0` because
  main calls the reviewed-only function — that changes on merge, not
  before.
- **The web has not been rebuilt.** The running web images are the
  pre-0060 build, so the place pages are not prerendered and the
  homepage still shows three KPIs. That is the post-merge deploy's job.
- **It makes no claim about the 2,713 rows being TRUE.** They are
  published as Unverified because nothing supports them. Whether a
  given row is right is the review work, and it has not been done.
- **It does not weaken the reviewed rule.** That rule is untouched and
  still returns 0 rows for these associations — measured on live after
  the apply — which is correct, because none of them is evidenced or
  accepted.
- **It does not claim the PR's own routes were exercised on live.** The
  running API is main's code. The PR's queries were run directly against
  the live database (no error, correct counts), but the PR's routes will
  first run on live **after** the merge and deploy.

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
| `docs/ci-patches/ci-workflow-0060-and-build-date.patch` | the workflow patch — **APPLIED** (commit `12453ef`), so the file is deleted |
| `docs/MIGRATION-RECEIPT-0060.md` | this file — updated to APPLIED, with the live counts, the backup, the idempotence proof and the post-apply endpoint checks |
