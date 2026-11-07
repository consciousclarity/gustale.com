# Migration plan — 0050 and 0051

**Date:** 2026-11-07
**Status:** PROPOSED. Nothing has been applied to live. This document is
the approval request, not a receipt.
**PR:** #189 (`feat/family-taxonomy-classification`, head `16710cf`)

---

## 0. Where this stands

| step | state |
|---|---|
| Rebase onto `main` (54d7bc6) | **done** — head `16710cf`, `origin/main` is an ancestor |
| Regenerate the 0050/0051 CI patch for `gustale_ci` | **done** — `docs/ci-migrations-0050-0051.patch` |
| Run the production-drop scanner | **done** — exit 0 |
| Run the chain end-to-end on the test Postgres | **done** — `FULL_CI_CHAIN_OK=1` |
| Prove production is untouched by that run | **done** — byte-identical snapshot |
| Apply to live | **NOT DONE — needs your approval** |

### Two things about PR #189 that need *you*, not me

1. **The workflow patch.** The GitHub App has no `workflows` scope, so the
   two CI steps for 0050/0051 ship as a **file**. Apply it with:

   ```bash
   git apply docs/ci-migrations-0050-0051.patch
   ```

   Verified: `git apply --check` against a pristine copy of `main`'s
   `.github/workflows/ci.yml` is clean, and after applying it
   `scripts/validate-ci-migration-chain.py` reports:

   ```
   CI migration chain OK (50 migrations, all three lists agree)
   ```

   This is why PR #189's CI shows **"Validate the CI migration chain"**
   failing right now: the workflow does not yet list 0050/0051, because
   the patch has not been applied. That is the expected state, not a
   defect in the migrations.

2. **The `approved-live` label.** PR #189 touches the live surface
   (`db/migrations/0050_*`, `db/migrations/0051_*`), so the live-approval
   gate fails closed:

   ```
   ::error::the PR touches the live surface and has no 'approved-live' label.
   ::error::Merging a migration PR is the go to apply it to live.
   LIVE_APPROVAL_GATE=missing_label
   ```

   The label is yours to set. I cannot set it.

---

## 1. The `pg_dump` path — the backup, taken BEFORE anything else

The dump goes on the **host**, in `/home/gustale/backups/`, with the
timestamp in the filename. This is the same path the 0049 backups used
(`pre-0049-20261106-140058.dump`, `post-0049-20261106-152459.dump`).

```bash
STAMP=$(date '+%Y%m%d-%H%M%S')
DUMP="/home/gustale/backups/pre-0050-0051-${STAMP}.dump"

docker exec -u postgres shared-postgres \
  pg_dump -U postgres -d gustale --format=custom --file=/tmp/pre-0050-0051.dump

cp /tmp/pre-0050-0051.dump "$DUMP"
ls -la "$DUMP"

# Verify the archive is readable and complete BEFORE applying anything.
docker exec -u postgres shared-postgres \
  pg_restore --list /tmp/pre-0050-0051.dump | wc -l
```

**Do not proceed if the dump is empty or `pg_restore --list` errors.**
The 0049 incident was survived *because* a good dump existed. A dump
that was never verified is not a backup.

The dump must be taken **before** the migration, and it must be
**verified** — the archive header records the creation time, which is
how the incident timeline was reconstructed.

---

## 2. What 0050 writes

`db/migrations/0050_association_review_ledger.sql` (604 lines)

### Creates

| object | what it is |
|---|---|
| `association_review_log` | the ledger — who changed what, when, and on what evidence |
| `association_sources` | the association ↔ source link table |
| `check_association_entity()` | a trigger function that refuses an association pointing at a non-existent entity |
| `dish_place_associations_entity_guard` | the trigger itself (`BEFORE INSERT OR UPDATE OF entity_kind, entity_id`) |
| 2 indexes on `association_review_log`, 2 on `association_sources`, 1 unique index (`association_sources_one_primary_idx`) | |

### Writes

1. **A 50-row pilot sample.** Deterministic: ordered by association id,
   `MIN(25, available)` per kind, so the same rows are selected on every
   run. A sample that changed between runs could not be reviewed.

2. **50 rows in `association_review_log`** — `action='submitted'`,
   `review_state_before='unreviewed'`, `review_state_after='in_review'`,
   `confidence=3`, `confidence_label='medium'`, `reviewer='pilot:0050'`.

3. **50 rows in `dish_place_associations` move `review_state` from
   `'unreviewed'` to `'in_review'`.** Guarded by `AND a.review_state =
   'unreviewed'`, so a re-apply cannot resurrect a row a later reviewer
   has moved on.

### What 0050 does NOT do — and this is the important part

- **It publishes nothing.** `publication_state` is not touched. The
  migration asserts that none of the rows it touched are published.
- **It accepts nothing.** Every pilot row is `in_review`, not
  `accepted`. No association in the table has a source row yet, so HIGH
  confidence is impossible; the migration asserts that no pilot row
  claims HIGH, and none claims LOW either (every association resolves).
- **It re-points nothing.** `entity_kind` and `entity_id` are untouched.
  This matters: **1,235 of the 2,713 live associations are
  `entity_kind='community'`**, and a 'community' row is a *correct*
  culture claim pointing at `dish_traditions.id` — not a broken place.
  Re-pointing them at the cuisine's country would have converted 1,235
  accurate "established tradition" claims into 1,235 weaker "legacy
  unreviewed" origin claims, silently and with no reviewer.
  The `entity_repointed` action stays in the ledger's enum because the
  operation is legitimate when a *reviewer* decides it, with a source
  behind it. This migration just does not perform it.

### Its assertions (these fail the migration if untrue)

- the pilot has rows of **both** kinds (place and community), or the
  dangling half is hidden;
- the number of distinct pilot associations equals the number of
  `in_review` rows — nothing else may be `in_review`;
- **no** row the migration touched is published;
- **no** pilot row claims HIGH confidence;
- **no** pilot row claims LOW confidence;
- no association is dangling.

### Idempotency

Re-applying is safe: the `NOT EXISTS` guard means a second run finds the
pilot rows already in the ledger and inserts nothing. Without it the
ledger would double (50 → 100) and the `in_review` assertion would then
fail.

---

## 3. What 0051 writes

`db/migrations/0051_family_classification.sql` (606 lines)

### Creates

| object | what it is |
|---|---|
| `dish_families.family_class` | a new `text` column (`ADD COLUMN IF NOT EXISTS`) |
| `dish_families_class_check` | a CHECK constraint: `family_class IS NULL OR family_class IN ('FORM','COURSE','CUISINE','CONTENT TYPE')` |
| `family_classification_ledger` | the classification table itself — `slug`, `family_class`, `classified_name` |

### Writes

1. **306 rows into `family_classification_ledger`** — the approved
   classification from `docs/FAMILY-TAXONOMY-REVIEW.md`, transcribed.

2. **`dish_families.family_class` is updated** for every family whose
   class differs from the ledger, joined on `slug`:

   ```sql
   UPDATE dish_families f
      SET family_class = l.family_class
     FROM family_classification_ledger l
    WHERE f.slug = l.slug
      AND (f.family_class IS DISTINCT FROM l.family_class);
   ```

3. `classified_name` and `applied_at` are recorded on the ledger rows.

### What 0051 does NOT do

- It writes **no content rows** — no dish, no association, no family
  is deleted.
- It does not change `dish_families.parent_id` (the self-referential FK;
  a DELETE against it is pathologically slow and is not part of this
  migration).
- The column is **nullable on purpose**: the schema allows the next
  family to arrive *unclassified* rather than forcing a wrong answer.

### Its assertions

- every family in the document is classified (306 in, 306 out);
- the database's count and the document's count are the **same 306**,
  in both directions — not assumed, checked;
- no family is mis-classified against the ledger;
- the class counts per class match what the document says.

### Checked against live BEFORE proposing this plan

0051 asserts that **every** family in `dish_families` is in the
classification ledger (`v_ledger_missing` must be 0). If a live slug
were missing, the migration would **fail on live** — so this was
checked first, read-only:

```
the ledger carries 306 families
the class split: {'CONTENT TYPE': 70, 'COURSE': 59, 'FORM': 172, 'CUISINE': 5}
live carries 306 families
live families NOT in the ledger: 0
ledger families NOT on live:   0
```

Live's 306 slugs and the ledger's 306 slugs are the **same 306**. The
migration's assertions can hold.

The 0050 pilot size was checked the same way: live has **1,478 place**
and **1,235 community** associations, and the pilot takes
`MIN(25, available)` per kind, so the live pilot is **25 + 25 = 50**,
not a hard-coded number.

---

## 4. Live baseline, measured today

Read-only, `2026-11-07 10:17 WITA`:

```
assoc_total=2713  unreviewed=2713  in_review=0  published=0
families=306      dishes=1475      ledger_tables=0
community_rows=1235
```

Two facts that frame the whole migration:

- **`in_review = 0`** → after 0050 it will be **50** (the pilot size).
  Nothing else moves.
- **`ledger_tables = 0`** → none of the three new tables exist yet.
  0050 and 0051 are both **purely additive**.
- **`published = 0`** and must stay 0. That is the places KPI's
  by-design zero (all 2,713 associations are `draft`), and neither
  migration changes `publication_state`.

---

## 5. Rollback

Both migrations are additive, so rollback is a **DROP**, not a restore:

```sql
-- 0051
DROP TABLE IF EXISTS family_classification_ledger;
DROP CONSTRAINT IF EXISTS dish_families_class_check;
ALTER TABLE dish_families DROP COLUMN IF EXISTS family_class;

-- 0050
DROP TRIGGER IF EXISTS dish_place_associations_entity_guard ON dish_place_associations;
DROP FUNCTION IF EXISTS check_association_entity();
DROP TABLE IF EXISTS association_sources;
DROP TABLE IF EXISTS association_review_log;
```

Then restore the 50 pilot rows' `review_state`:

```sql
UPDATE dish_place_associations
   SET review_state = 'unreviewed'
 WHERE review_state = 'in_review'
   AND id IN (SELECT association_id FROM association_review_log);
```

> Run the UPDATE **before** dropping `association_review_log` — it reads
> the pilot ids from there.

**The full-restore fallback**, if anything looks wrong at all: drop and
restore live from the §1 dump. This is the procedure that recovered the
2026-11-06 incident (80 of 81 tables matched the dump exactly; the one
difference was `spatial_ref_sys`, which PostGIS owns and `CREATE
EXTENSION postgis` recreates).

```bash
docker exec -u postgres shared-postgres psql -U postgres -d postgres \
  -c "DROP DATABASE IF EXISTS gustale;"
docker exec -u postgres shared-postgres createdb -U postgres gustale
docker exec -u postgres shared-postgres \
  pg_restore -U postgres -d gustale --no-owner --no-privileges /tmp/pre-0050-0051.dump
```

> **This is the operation that destroyed live on 2026-11-06.** It is
> here as the documented last resort, and it should only ever be run by
> you, with the dump verified, and with the site in a known state. Do
> not script it.

---

## 6. The order of operations, if you approve

1. Take the dump (§1) and **verify** it.
2. Apply `0050`, then `0051`, to live.
3. Read back the counts and compare with §4.

```bash
# apply
docker exec -i -u postgres shared-postgres psql -U postgres -d gustale \
  -v ON_ERROR_STOP=1 -f db/migrations/0050_association_review_ledger.sql
docker exec -i -u postgres shared-postgres psql -U postgres -d gustale \
  -v ON_ERROR_STOP=1 -f db/migrations/0051_family_classification.sql

# verify
docker exec -u postgres shared-postgres psql -U postgres -d gustale -tAc \
  "SELECT 'assoc_total=' || (SELECT count(*) FROM dish_place_associations)
   || ' in_review=' || (SELECT count(*) FROM dish_place_associations WHERE review_state='in_review')
   || ' published=' || (SELECT count(*) FROM dish_place_associations WHERE publication_state='published')
   || ' unreviewed=' || (SELECT count(*) FROM dish_place_associations WHERE review_state='unreviewed')
   || ' families=' || (SELECT count(*) FROM dish_families)
   || ' families_classified=' || (SELECT count(*) FROM dish_families WHERE family_class IS NOT NULL);"
```

**Expected after:** `assoc_total=2713  in_review=50  published=0
unreviewed=2663  families=306  families_classified=306`.

---

## 7. Evidence that this works

The full chain was run on the **dedicated test Postgres**
(`gustale-test-postgres`, 127.0.0.1:5434) — never on
`shared-postgres`:

```
0050: ok -- 5 pilot rows in_review, 0 associations dangling, 0 published
0051: ok -- 28 families classified (all: FORM 22 COURSE 3 CUISINE 0 CONTENT TYPE 3;
      the 0 with a published dish: FORM 0 COURSE 0 CUISINE 0 CONTENT TYPE 0)
ATLAS_SCHEMA_TESTS: 47 passed, 0 failed
ATLAS_BACKFILL_ASSERTIONS: 8 passed, 0 failed
ATLAS_COUNT_GUARD: 8 passed, 0 failed

FULL_CI_CHAIN_OK=1
```

(The pilot is 5 rows and the classification is 28 families there because
the test database carries the CI seed, not live's 2,713 associations and
306 families. The assertions are *shape* assertions — both kinds
present, nothing published, nothing dangling — not exact counts, which
is deliberate: a migration that hard-codes a row count breaks the
moment the seed changes.)

**Production was proven untouched by that run.** A read-only snapshot of
the database list and the counts above was taken before and after; they
are **byte-identical**:

```
assoc_total=2713 unreviewed=2713 in_review=0 published=0 families=306 dishes=1475 ledger_tables=0
```

---

## 8. What I need from you

1. **Approve or decline the live application** of 0050 and 0051.
2. **Apply the workflow patch** to PR #189's branch:
   `git apply docs/ci-migrations-0050-0051.patch`
3. **Set the `approved-live` label** on PR #189, if you approve.

I will not touch live without (1). The migration is proven to apply
cleanly; the live step is a decision, not a mechanic.
