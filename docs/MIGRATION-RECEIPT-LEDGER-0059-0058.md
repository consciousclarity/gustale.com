# MIGRATION RECEIPT — the `gus_migrations_applied` ledger rows for `0059` and `0058`

**Applied to live on 2026-11-17 at 13:14 UTC (14:14 WITA), by Hermes
Agent, over SSH to `root@62.72.7.218`, by direct `psql`.**

**`PSQL_RC=0`.**

**This was LEDGER ONLY.** It inserted two rows into
`public.gus_migrations_applied`. It created no schema, changed no data,
and touched nothing that `0059` or `0058` themselves had touched.

---

## Why the rows were needed

The GUS chain's own ledger (`public.gus_migrations_applied`) is created by
`db/migrations/gus-238c-constraint-idempotence-and-ledger.sql`, and its
seed list stops at `gus-238c-constraint-idempotence-and-ledger`. It
therefore recorded **neither** `0059_dish_families_descriptions` **nor**
`0058_dish_families_listed` — the two migrations applied on 2026-11-16,
after that seed list was written.

Before this apply the live ledger held **7 rows**:

```
0052_recipes_schema
0053_recipes_published_view
0054_ingredients_category_fk
0055_sourcing_availability
gus-238-journey-editorial-fields
gus-238b-association-review-visibility
gus-238c-constraint-idempotence-and-ledger
```

After this apply it holds **9 rows**: the same seven, plus the two that
were missing.

The precedent for this exact shape is
`scripts/gus-238-ledger-rows-bc.sql`, which added the two rows that
gus-238c's own seed list omitted. This file follows it.

---

## The sha256 values, and why they are the *applied* files

The `sha256` column holds the digest of the migration **file**. The files
applied to live on 2026-11-16 were the **pre-fix** versions, and their
MD5 sums are recorded in the original receipt:

```
260cbe4b77f88a178cacc783ee825384  0058.sql
d4c5264c45eaa5ebef160ac67ac7a224  0059.sql
```

Those two MD5s were re-derived from git and **match the receipt exactly**,
which is what identifies the applied versions as the ones in commit
`796bad7`. Their SHA-256 digests are:

| migration | applied sha256 |
|---|---|
| `0059_dish_families_descriptions` | `ec6c4117d1be918f8d6724017b9b41d9561dbe49ed26ef72dfa7995b5ed3b813` |
| `0058_dish_families_listed` | `9f0a568304a037abeb3cee95404621245031200608ba94b72c688fd1a9d08a7b` |

The repository's copies of both files were **fixed afterwards**, in commit
`348af03`, because CI found two defects that only appear on the CI
fixture shape (a 28-family database) and on a re-run. The current files'
digests are therefore *different*:

| migration | current (fixed) sha256 |
|---|---|
| `0058_dish_families_listed` | `a326c47113bde7d732771e6d5fa49e9dea3aa2484d3a82b621e67c9b5964ca2c` |
| `0059_dish_families_descriptions` | `0a11dd63fa2f94d9e59e229826a7d96e751aefdf9acf6d3d4d39897f44b8b335` |

The fixes do **not** change what live received. The original receipt
proves it by running the fixed files against the live database inside a
rolled-back transaction: `0058` → `UPDATE 0` (a true no-op), `0059` →
skipped cleanly, and live is already in the state the fixed files produce.
The full reasoning is in `docs/MIGRATION-RECEIPT-0059-0058.md`.

**So the ledger records the file that was actually applied**, and each
row's `note` says so explicitly — so that a reader who compares the
digest with the repository's current file understands the difference
instead of concluding the ledger is wrong.

---

## The backup

The offsite encrypted backup was run immediately before the apply:

```
gustale-backup.service -> Result=success, ExecMainStatus=0
Database uploaded: raw=4518812 encrypted=3987810
sha256=451c56fb0ed9409de41919c7da3ba9082ddd1373203eceb654402953afe39a56
MinIO bucket synced through encrypted rclone remote: gustale-public
MinIO bucket synced through encrypted rclone remote: gustale-media
SUCCESS: encrypted offsite backup complete: gustale_backup_20261117T130241Z.dump.gpg
```

A local pre-apply dump was taken at the same time:

| | |
|---|---|
| path | `/home/gustale/backups/pre-ledger-0059-0058-20261117T131206Z.dump` |
| size | **4,518,812 bytes** |
| TOC entries | **1,687** (`pg_restore --list \| wc -l`) |
| method | `docker exec -u postgres shared-postgres pg_dump -U postgres -d gustale --format=custom --file=/tmp/pre-ledger.dump` then `docker cp shared-postgres:/tmp/pre-ledger.dump "$DUMP"` |

`docker cp`, not `cp` — the host and the container do not share `/tmp`.

The dump's size matches the backup service's own `raw=4518812` exactly,
and its TOC has **1,687** entries against the 1,686 of the
0059/0058 receipt — one more, because the ledger has grown since.

---

## The apply

```bash
docker cp /tmp/ledger-0059-0058.sql shared-postgres:/tmp/ledger-0059-0058.sql
docker exec -u root shared-postgres chmod 644 /tmp/ledger-0059-0058.sql
docker exec -u postgres -i shared-postgres psql -U postgres -d gustale \
  -v ON_ERROR_STOP=1 -f /tmp/ledger-0059-0058.sql
```

The `chmod` is not optional: `docker cp` writes the file as `root` with
mode `0600`, and `psql` runs as `postgres`, so the first attempt failed
with `error: /tmp/ledger-0059-0058.sql: Permission denied`. Nothing was
written by that failed attempt — the file never opened.

### The output

```
BEGIN
INSERT 0 2
COMMIT
NOTICE:  CONFIRMED: the GUS ledger holds 9 rows
NOTICE:  CONFIRMED: 0052_recipes_schema, 0053_recipes_published_view,
          0054_ingredients_category_fk, 0055_sourcing_availability,
          0058_dish_families_listed, 0059_dish_families_descriptions,
          gus-238-journey-editorial-fields,
          gus-238b-association-review-visibility,
          gus-238c-constraint-idempotence-and-ledger
NOTICE:  CONFIRMED: dish_families is 306 total (162 listed, 144 unlisted)
          -- the state 0058 and 0059 produced
NOTICE:  GUS_LEDGER_0059_0058_OK=1
DO
```

---

## The dry run, before the live apply

The file was run first against a **live-shaped copy** of production in
the `gustale-test-postgres` container — a database whose `dish_families`
was **162 listed / 144 unlisted / 306 total** and whose ledger held the
same **7 rows** as live, i.e. an exact replica of the state being
changed.

The dry run is what caught the one real bug in the first version of the
script: the proof's `SELECT ... INTO` bound its three targets in the
wrong order, so the `dish_families` **total** was compared against the
**listed** expectation and the script aborted with

```
ERROR: dish_families is 162 total / 144 listed / 306 unlisted,
       expected 306/162/144
```

The `INTO` targets bind in SELECT-list order, so the query was
rewritten to list `count(*)`, then the two `FILTER`ed counts, and to
bind them to `v_total`, `v_listed`, `v_unlisted`. The dry run then
passed with `PSQL_RC=0`.

**Idempotence was proven on the same copy:** a second run reported
`INSERT 0 0`, the ledger stayed at 9 rows, and the two new rows kept
their original `applied_at` of `2026-11-16` — a re-run does not
restamp the record.

---

## The verification — independent queries, not the script's own report

Read back from live after the apply:

```
                    name                    |     at     | applied_by |      sha16
--------------------------------------------+------------+------------+------------------
 0052_recipes_schema                        | 2026-11-08 | owner      |
 0053_recipes_published_view                | 2026-11-09 | owner      |
 0054_ingredients_category_fk               | 2026-11-10 | Hermes     |
 0055_sourcing_availability                 | 2026-11-10 | Hermes     | 5822536a0ecf8123
 gus-238-journey-editorial-fields           | 2026-11-14 | Hermes     | 453d279897f56fd1
 gus-238b-association-review-visibility     | 2026-11-15 | Hermes     | d0eee4a8321706cf
 gus-238c-constraint-idempotence-and-ledger | 2026-11-15 | Hermes     | 6332c4f2b2e0336b
 0058_dish_families_listed                  | 2026-11-16 | Hermes     | 9f0a568304a037ab
 0059_dish_families_descriptions            | 2026-11-16 | Hermes     | ec6c4117d1be918f
(9 rows)
```

| check | expected | measured |
|---|---|---|
| ledger rows | 9 | **9** |
| the 0058 row's sha256 | `9f0a5683…` | **matches** |
| the 0059 row's sha256 | `ec6c4117…` | **matches** |
| `dish_families` | 306 / 162 / 144 | **306 / 162 / 144 — unchanged** |

The last row matters: the ledger rows claim a state, so that state must
still be the state of the database. It is.

---

## The rollback

Trivial and exact: the two rows are the only thing that was written.

```sql
DELETE FROM public.gus_migrations_applied
 WHERE name IN ('0058_dish_families_listed', '0059_dish_families_descriptions');
```

That restores the 7-row ledger. Nothing else was touched, so nothing
else needs restoring.
