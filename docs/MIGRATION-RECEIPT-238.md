# MIGRATION RECEIPT — `gus-238-journey-editorial-fields.sql`

**Applied to live on 2026-11-14 at 19:59:47 WITA (11:59:47 UTC), by Hermes
Agent, over SSH to `root@62.72.7.218`, by direct `psql`.**

**`PSQL_RC=0`. `COMMIT`.**

**Authorisation:** the `approved-live` label on PR #234, applied by
`consciousclarity` on 2026-11-13 12:28:09 UTC, and the PR merged by
`consciousclarity` on 2026-11-13 12:54:06 UTC.

---

## Rule 11 — this migration is now frozen

`gus-238-journey-editorial-fields.sql` has run on live. It is **immutable**.

* A correction requires a **new** migration number.
* The **apply line** is authoritative, not the commit.

---

## 1. The file that was applied — verified byte-identical

| | |
| --- | --- |
| path on the VPS | `/home/deploy/gustale-build/db/migrations/gus-238-journey-editorial-fields.sql` |
| sha256 | **`453d279897f56fd19657a6129f9da92165b0666f8768bef785666df27e7ebcdf`** |
| size | 7,505 bytes |
| sha256 of `git show 8750b17:db/migrations/gus-238-journey-editorial-fields.sql` | **`453d279897f56fd19657a6129f9da92165b0666f8768bef785666df27e7ebcdf`** |
| VPS checkout HEAD at the apply | `8750b173` (the merge commit of PR #234) |
| working tree for that file | clean |

The digest was computed from git on the sandbox host and again on the VPS
immediately before the apply. **The migration applied to live is the migration
that was merged and reviewed.**

---

## 2. The backup — taken first, verified restorable, copied off the VPS

`gustale-backup.service` had run **SUCCESS** at 2026-11-14 09:18:37 WITA
(`status=0/SUCCESS`, the offsite encrypted backup), before anything else.

**The pre-migration dump:**

| | |
| --- | --- |
| path on the VPS | `/tmp/pre-238-20261114-195631.dump` |
| path on the sandbox host | `/home/alex/gustale-backups/pre-238-20261114-195631.dump` |
| size | **4,508,676 bytes** (4.3 MB) |
| format | PostgreSQL custom database dump, v1.15-0 |
| TOC entries | **1,661** |
| sha256 (both sides) | **`3d6bfa4a1395d602c314302701ee90d088f5a99ecfac410eafc4d1993aca0ea6`** |

Taken with `pg_dump --format=custom` **inside the production container** (the
host has no `pg_dump` binary), written via **stdout redirection** to the host
path. A plain host `cp` cannot cross the container/host filesystem boundary.

**Verified restorable, not merely listable.** The dump was copied into
`gustale-test-postgres` and restored into a throwaway database there — **never
on the production cluster**:

```
pg_restore RC=0
0 errors
```

and the restored copy was compared against live, count for count:

| | restored copy | live |
| --- | --- | --- |
| dishes | 1,475 | 1,475 |
| journey beats | 36 | 36 |
| users | 3 | 3 |

**Identical.** The verification database and the copy inside the test
container were then deleted. It held credential hashes and session tokens.

---

## 3. The apply — one transaction, all or nothing

```bash
docker exec -u postgres -i shared-postgres psql -U postgres -d gustale \
  -v ON_ERROR_STOP=1 --single-transaction -f - \
  < /home/deploy/gustale-build/db/migrations/gus-238-journey-editorial-fields.sql
```

* **The `postgres` role**, not `gustale` — the `gustale` role fails with
  `must be owner of table`; the tables are owned by `postgres`.
* **`ON_ERROR_STOP=1`** — aborts on the first error.
* **`--single-transaction`** — the whole file is one transaction, so a failure
  anywhere rolls back everything.
* The file contains its own `BEGIN;` … `COMMIT;`, so psql printed
  `WARNING: there is already a transaction in progress`. **Benign**: the
  file's `BEGIN` is a no-op inside the outer transaction, and the file's
  `COMMIT` closes the outer one.

### The apply log

```
BEGIN
ALTER TABLE   x10
CREATE TABLE
ALTER TABLE   x4
CREATE INDEX
COMMIT
```

**`PSQL_RC=0`. No error line.**

---

## 4. How the runner tracks applied migrations — and why nothing will re-run this

**This is the question that matters for a migration whose `ADD CONSTRAINT`
statements are not re-runnable.** The answer, verified rather than assumed:

### 4.1 There are two namespaces, and the GUS chain is not in the ledger

The ledger is `drizzle.__drizzle_migrations`, with columns
`(id integer PK, hash text, created_at bigint)`. It has **13 rows** on live:

| id | hash | era |
| --- | --- | --- |
| 1–9 | 64-char hex sha256 | the Drizzle migrator's own hashes |
| 12–15 | a **name** (`media_variants`, `passkey_aaguid`, `geo_entity_provenance`, `pool_a_batch`) | the 0009–0014 convention |

Ids **10 and 11 are absent** — deleted. The next free id is therefore 16.

**Only `packages/db/drizzle/*.sql` self-record.** Each of `0012`–`0015`
ends with:

```sql
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at)
VALUES (15, 'pool_a_batch', EXTRACT(EPOCH FROM NOW()) * 1000)
ON CONFLICT (id) DO NOTHING;
```

**None of the 54 files in `db/migrations/` self-record** — verified by
grepping all of them for `__drizzle_migrations`: zero hits.

### 4.2 The GUS chain is absent from the ledger, and that is the established practice

`0052`, `0053`, `0054` and `0055` were all applied to live, and **none** of
them appears in the ledger. This was verified independently on live:

| migration | its object on live | in the ledger? |
| --- | --- | --- |
| `0053` | `recipe_published` view — **present** | **no** |
| `0055` | `ingredient_availability` table — **present** | **no** |
| `0054` | `ingredients` category FK columns — **present** | **no** |

`docs/MIGRATION-RECEIPT-0055.md` §"Rule 11" states the rule in the repo's own
words:

> `drizzle.__drizzle_migrations` on live does **not** record it, and that is
> expected: it records no hand-written migration. `0052`, `0053` and `0054`
> are absent from it too, for the same reason — all four were applied by
> direct `psql`, and the ledger is written by the Drizzle migrator, which
> never ran them. **The live objects are the record.**

**So `gus-238` was NOT written to the ledger, and that is correct.** Writing
it would have invented a row in a namespace that has never held a GUS-chain
entry, with an id that could collide with a future Drizzle migration.

### 4.3 Nothing automated can re-run it — verified at every candidate

The fear was that a deploy would re-apply the migration and hit the
`ADD CONSTRAINT` aborts. Each possible re-runner was checked:

| candidate | what it does | re-runs `db/migrations/` on live? |
| --- | --- | --- |
| **CI** (`ci.yml`) | applies the chain with `psql -h 127.0.0.1 -d **gustale_ci**` | **No.** Every psql call targets `gustale_ci`, which is `DROP DATABASE IF EXISTS` → `CREATE DATABASE` first. A throwaway database, on the GitHub runner's own Postgres. |
| **Nightly** (`nightly.yml`) | same chain | **No.** `DATABASE_URL` is `…/gustale_ci`; every psql targets `gustale_ci`. |
| **Live approval gate** (`live-approval.yml`) | a **merge gate** | **No.** It has no database at all. It reads the diff and the label timeline via `scripts/check-live-approval.sh`. It never connects to anything. |
| **The VPS rebuild timer** (`gustale-rebuild-web.timer`, every 12h) | rebuilds the web images | **No.** `rebuild-web-live.sh` contains **no** `psql` and no migration step at all. |
| **`gustale-backup.timer`** | pg_dump + encrypt + upload | **No.** It reads. |

**Conclusion: the `ADD CONSTRAINT` abort can never fire from an automated
deploy.** The GUS chain reaches live only by a human's direct `psql`, which
is exactly the procedure that produced this receipt.

**The record of this migration is therefore: this receipt, plus the live
objects themselves.**

---

## 5. The before/after comparison

The migration is **strictly additive** and writes **no content rows**, so
every count of user data must be identical before and after. This is the
strongest single check in the receipt.

| | before | after |
| --- | --- | --- |
| `dish_journey_beats` rows | **36** | **36** |
| `dish_journey_beats` columns | **11** | **21** |
| `dish_journey_movements` table | **absent** | **present** |
| `dish_journey_movements` rows | — | **0** |
| CHECK constraints on `dish_journey_beats` | 6 | **9** |
| `dishes` | 1,475 | **1,475** |
| `sources` | 1,486 | **1,486** |
| ledger rows | 13 | **13** |

**Unchanged.** The one new table is **empty**, as it must be — it holds
source-supported transmission edges, and no editorial record has been
approved.

### The ten new columns, as they exist on live

| column | type | nullable | default |
| --- | --- | --- | --- |
| `title` | text | yes | — |
| `date_label` | text | yes | — |
| `date_precision` | text | yes | — |
| `evidence_kind` | text | yes | — |
| `locator` | text | yes | — |
| `authors` | text | yes | — |
| `place_role` | text | yes | — |
| `scope_note` | text | yes | — |
| `bounds` | jsonb | **no** | `'[]'::jsonb` |
| `regions` | jsonb | **no** | `'[]'::jsonb` |

### The constraints, present on live

CHECK constraints on `dish_journey_beats` (9):

```
dish_journey_beats_confidence_check        <- pre-existing, UNTOUCHED
dish_journey_beats_date_precision_check    <- NEW
dish_journey_beats_evidence_kind_check      <- NEW
dish_journey_beats_place_role_check         <- NEW
dish_journey_beats_sequence_positive_check  <- pre-existing, UNTOUCHED
```

(The 6th of the 9 is the primary key, `dish_journey_beats_pkey`.)

Constraints on `dish_journey_movements` (6):

```
dish_journey_movements_pkey
dish_journey_movements_confidence_check
dish_journey_movements_distinct_beats_check
dish_journey_movements_dish_id_dishes_id_fk
dish_journey_movements_from_beat_fk
dish_journey_movements_to_beat_fk
dish_journey_movements_source_id_sources_id_fk
```

### The constraints actually bite

An invalid `evidence_kind` was refused by the live database:

```
ERROR:  new row for relation "dish_journey_beats" violates check constraint
        "dish_journey_beats_evidence_kind_check"
```

(The test insert was inside `BEGIN; … ROLLBACK;`, so nothing was written.)

---

## 6. The API — before and after

**Before the apply**, the deployed API (SHA `8750b17`) returned **500** on
every journey route, because it selects columns the live database did not
have:

```
PostgresError: column dish_journey_beats.title does not exist
  at /app/dist/routes/dishes.js:1121:26
```

**After the apply**, measured against `https://api.gustale.com`:

| endpoint | before | after |
| --- | --- | --- |
| `/api/dishes/bibimbap/journey` | 500 | **200** |
| `/api/dishes/moussaka-greek/journey` | 500 | **200** |
| `/api/dishes/chongqing-hot-pot/journey` | 500 | **200** |
| `/api/dishes/falafel/journey` | 500 | **200** |
| `/api/dishes/rendang/journey` | 500 | **200** |
| `/api/dishes/vindaloo/journey` | 500 | **200** |
| `/api/dishes/chicken-tikka-masala/journey` | 500 | **200** |
| `/api/dishes/century-egg-tofu/journey` | 404 | 404 |
| `/api/dishes/beyaynetu/journey` | 404 | 404 |
| `/api/dishes/bibimbap/atlas` | 200 | **200** |
| `/api/dishes/bibimbap` | 200 | **200** |
| `/api/dishes/map?limit=5` | 200 | **200** |
| `/health` | 200 | **200** |

The two 404s are **correct and unchanged**: `century-egg-tofu` and `beyaynetu`
are review fixtures that do not exist as published dishes on live (verified in
the database), so they were 404 before the apply and are 404 after it.

**The payload now carries the new fields.** `GET /api/dishes/falafel/journey`
returns `status: "history"`, 3 beats, and every beat carries all ten new
fields:

```
authors, bounds, confidence, dateLabel, datePrecision, evidenceKind,
id, label, lat, lng, locator, placeName, placeRole, regions,
scopeNote, sequence, source, title, yearApprox
```

**The API log is clean after the apply.** Counting only requests after
11:59:48 UTC (the apply was at 11:59:47):

| | |
| --- | --- |
| `"column dish_journey_beats.title does not exist"` errors | **0** |
| other level-50 errors | **2**, both `"Dish not found"` — a 404 for a slug that does not exist, which is correct |

---

## 7. The known defect — the constraints are not re-runnable

**The migration's own header claims "Idempotent: re-running produces no
changes." That is FALSE, and it was found by a dry run before the apply.**

The `ADD COLUMN IF NOT EXISTS` statements are genuinely re-runnable (they
emit NOTICEs and do nothing). But the three `ADD CONSTRAINT` statements
**abort** on a re-run:

```
ERROR:  constraint "dish_journey_beats_date_precision_check" for relation
        "dish_journey_beats" already exists
```

**PostgreSQL has no `ADD CONSTRAINT IF NOT EXISTS`.**

Nothing breaks today, for two independent reasons:

1. **CI never re-runs a migration** — it applies the chain once to a freshly
   created `gustale_ci`.
2. **Nothing applies this chain to live automatically** — §4.3.

**The fix goes in a new migration number**, because this file is now applied
on live and is frozen. The guarded form is in
`docs/GUS-238-REVIEW.md` §14.9.

---

## 8. What this migration does NOT do

* **No editorial content.** All ten new columns are NULL on all 36 rows. The
  `title`, `date_label`, `evidence_kind` and the rest are empty structure —
  no chapter has been written into them.
* **No movements.** `dish_journey_movements` is empty.
* **No change to the confidence enum.** The `confidence` CHECK constraint
  still reads `('documented','likely','possible','parallel')`.
* **No change to any existing row.** `dish_journey_beats` still has exactly
  the 36 rows it had, with their original values.
* **No change to `dishes`, `sources`, or anything else.**

---

## 9. The sequence, for the record

| when (WITA) | what |
| --- | --- |
| 09:09:20 | `gustale-backup.service` started — the offsite encrypted backup |
| 09:18:37 | `gustale-backup.service` → **SUCCESS**, `status=0/SUCCESS` |
| 19:56:31 | the pre-238 dump taken, 1,661 TOC entries, restored and verified on the test Postgres, then deleted |
| 19:58 | the dump copied off the VPS to the sandbox host, sha256 matched on both sides |
| 19:59:47 | **the apply → `PSQL_RC=0`, `COMMIT`** |
| — | the verification: 21 columns, 9 CHECK constraints, 36 rows unchanged, movements table present and empty, all journey endpoints 200, the other three endpoints 200, 0 column errors in the API log |

**Nothing else was written to live.**
