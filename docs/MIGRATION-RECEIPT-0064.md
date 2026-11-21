# MIGRATION RECEIPT — `0064_reconcile_the_ledger.sql`

**The migration that makes the live ledger describe the chain that actually ran.**

**APPLIED TO LIVE — 2026-11-20 (WITA).** Applied to the live production
database (`gustale` on `shared-postgres`) by direct `psql`, with
`-X -v ON_ERROR_STOP=1`.

`PSQL_RC=0`, 0 error lines, `BEGIN` → `COMMIT`, and the migration's
eight proofs were emitted. The backup, the independent verification and
the idempotence proof are all below.

**This migration touches one table — `public.gus_migrations_applied` —
and nothing else.** It writes four ledger rows, renames one, corrects
one note, and fills in three checksums. No domain data is read or
written, and a proof says so.

---

## Why this migration exists

The requirement was: *the ledger records 0063; no ledger row claims 0062
for the ledger fix; 0062 means the sourcing vocabulary only.*

The live ledger, before this migration, held **eleven rows** and was
missing three facts that are true, and wrong about one more.

| # | What was true on live | What the ledger said |
|---|---|---|
| 1 | `0062_ingredients_sourcing_vocabulary` was applied on 2026-11-11. Its 21 ingredient rows **are** on live. | **No row at all.** The ledger table did not exist until 0060 created it on 2026-11-17, so 0062 could not record itself. |
| 2 | `0063_record_0061_in_the_ledger` was applied on 2026-11-19 **under the old number `0062`**. The row it wrote — for 0061 — **is** on live and is correct. | **No row for itself.** The file that ran recorded 0061, not itself. |
| 3 | The file is `0054_ingredient_category_fk.sql` — singular. It was never named the plural form. | The row said `0054_ingredients_category_fk` — a typo that made the row unpairable with its file. |
| 4 | The file was renamed after it ran, so the file that ran and the repository file have different bytes. | The 0061 note said "**0062** records it" — true when written, **false** now, because 0062 is the sourcing vocabulary. |

### Why a new number, and not an edit to 0063

**Rule 11: an applied migration is immutable.** 0062 was applied on
2026-11-11 and 0063 on 2026-11-19. Both are frozen. A fix goes into a
**new** number, which is 0064.

### The chain of omissions, and where it ends

| Migration | Records itself? |
|---|---|
| 0060 | **Yes** — it creates the table and writes its own row. |
| 0061 | **No** — it omits its own row. This is why 0063 exists. |
| 0063 | **No** — it records 0061, not itself. This is why 0064 exists. |
| **0064** | **Yes.** From here on, a migration records itself. |

---

## What it does, step by step

| Step | Action |
|---|---|
| 1 | `CREATE TABLE IF NOT EXISTS public.gus_migrations_applied` — for a database that has never had the ledger. |
| 2 | Insert the row for **`0062_ingredients_sourcing_vocabulary`**. |
| 3 | Insert the row for **`0063_record_0061_in_the_ledger`**. |
| 3b | Fill in the checksums that were left blank on 0053, 0054 and 0060. |
| 4 | Insert the row for **`0064_reconcile_the_ledger`** — itself. |
| 5 | Correct the 0061 note: "0062 records it" → "0063 records it". |
| 6 | Rename the 0054 row to the name of its file. |
| 6b | Remove a bogus `0062_record_0061_in_the_ledger` row if one exists. |
| 7 | Eight proofs. |

### The checksums, and why two of them differ from the repository file

| Row | Checksum recorded | Why |
|---|---|---|
| `0062_ingredients_sourcing_vocabulary` | `31e2e123…503d` — **the repository file's** checksum | The file has been **byte-identical in every commit it has ever appeared in**. The checksum of the file today *is* the checksum of the file that ran. |
| `0063_record_0061_in_the_ledger` | `498ab199…2f0d7` — **the APPLIED file's** checksum | The file was renamed after it ran, and the rename changed the filename inside the file's own header. The repository file now hashes to `da0a2b26…e2ffa`. The row records what **ran**, and its note says which is which. |
| `0053_recipes_published_view` | `65871b59…07b6` | The file has never been edited since it ran. |
| `0054_ingredient_category_fk` | `3cf32d5b…1961d` | The file has never been edited since it ran. |
| `0060_legacy_associations_published` | `f7f2a30c…6946` | The file has never been edited since it ran. The receipt `docs/MIGRATION-RECEIPT-0060.md` records the digest independently, and it agrees. |
| `0052_recipes_schema` | **NULL — deliberately** | The file **was** edited after it ran, so the checksum of the file today is **not** the checksum of the file that ran, and no receipt says what that was. A NULL checksum says "this file changed after it ran and the original digest is unknown", which is **true**. Filling it in would assert something false. |

### The pre-ledger era is not back-filled

Migrations 0015 to 0051 were applied before the ledger table existed.
Their files have been edited since they ran, so their current checksums
are not the checksums of the files that ran. **This migration does not
write rows for them.** Asserting a checksum that was never true would be
worse than the absence of the row, and there is no receipt that would
make it true.

The same applies to the thirteen `gus-*` files that have no ledger row.

---

## The proofs

All eight fired on live.

| Proof | What it asserts |
|---|---|
| **P1** | The ledger records 0062, 0063 and 0064, each exactly once. |
| **P2** | The 0062 and 0063 rows carry the checksum of the file that ran. |
| **P3** | The 0061 row, if present, is intact and its note names 0063 — not 0062. |
| **P4** | The 0054 row carries the name of its file. |
| **P5** | The domain counts are unchanged by this migration. |
| **P6** | `0062` means the sourcing vocabulary; the ledger fix is recorded as `0063`; nothing claims `0062` for the ledger fix. |
| **P7** | The knowable checksums are filled in, and 0052 — whose file was edited after it ran — still carries none. |
| **marker** | `GUS_LEDGER_0064_OK=1` |

P3 and P4 are written to **tolerate a database that is missing rows**,
because this migration exists precisely to repair a database that is
missing rows. P3 fails if the 0061 row is present but wrong; it does not
fail if 0061's row is absent, because **0063** writes that row, not
0064. P4 fails only if the misspelt row exists *and* could not be
renamed.

---

## The ledger, before and after

### BEFORE — 11 rows

```
0052_recipes_schema                     (null)
0053_recipes_published_view             (null)
0054_ingredients_category_fk            (null)     <- misspelt
0055_sourcing_availability              5822536a…
0058_dish_families_listed               9f0a5683…
0059_dish_families_descriptions         ec6c4117…
0060_legacy_associations_published      (null)
0061_ingredient_aliases                 d09d86a9…   note names 0062
gus-238-journey-editorial-fields        453d2798…
gus-238b-association-review-visibility  d0eee4a8…
gus-238c-constraint-idempotence-and-ledger 6332c4f2…
```

No `0062` row. No `0063` row. No `0064` row.

### AFTER — 14 rows

```
0052_recipes_schema                     (null)     <- deliberately NULL
0053_recipes_published_view             65871b59…
0054_ingredient_category_fk            3cf32d5b…   <- renamed
0055_sourcing_availability              5822536a…
0058_dish_families_listed               9f0a5683…
0059_dish_families_descriptions         ec6c4117…
0060_legacy_associations_published      f7f2a30c…
0061_ingredient_aliases                 d09d86a9…   note names 0063
0062_ingredients_sourcing_vocabulary    31e2e123…   <- NEW
0063_record_0061_in_the_ledger          498ab199…   <- NEW
0064_reconcile_the_ledger                f69e546a…   <- NEW (itself)
gus-238-journey-editorial-fields        453d2798…
gus-238b-association-review-visibility  d0eee4a8…
gus-238c-constraint-idempotence-and-ledger 6332c4f2…
```

---

## The backup

Taken **before** the first apply, by the offsite backup service, which
is the project's own:

```
systemctl start gustale-backup.service
```

| | |
|---|---|
| Service result | `Result=success`, `ExecMainStatus=0` |
| Dump | `gustale_backup_20261120T080108Z.dump.gpg` (encrypted, offsite) |
| Database sha256 | `1d0b44fc8deff4b81b7b1b2e72562cce92de461f9fb0e0fb9309876548923285` |
| MinIO buckets | `gustale-public` and `gustale-media` synced through the encrypted rclone remote |
| GFS snapshots retained | 11 |

A second backup was taken before the final apply, after the first
version of this migration had already run.

---

## The idempotence proof

0064 was run **twice** on live. The second run:

```
INSERT 0 0
INSERT 0 0
UPDATE 0
...
NOTICE:  CONFIRMED: the ledger records 0062, 0063 and 0064, each exactly once
NOTICE:  CONFIRMED: the 0062 and 0063 rows carry the checksum of the file that ran
NOTICE:  CONFIRMED: the 0061 ledger row is intact and its note names 0063
NOTICE:  CONFIRMED: the 0054 ledger row carries the name of its file
NOTICE:  CONFIRMED: the domain counts are unchanged by this migration
NOTICE:  CONFIRMED: 0062 means the sourcing vocabulary, the ledger fix is recorded as 0063
NOTICE:  CONFIRMED: the knowable checksums are filled in, and 0052 still carries none
NOTICE:  GUS_LEDGER_0064_OK=1
```

`PSQL_RC=0`. Row count unchanged at 14. The eighth notice is absent on
the second run **by design**: the rename reports "already carries the
correct name" instead of "renamed".

---

## The test suite

0064 was tested against a fixture that mirrors live's exact shape —
the same 11 rows, the same misspelt 0054 name, the same stale 0061
note, and live-shaped domain tables — before it was applied to live.

| # | Test | Result |
|---|---|---|
| 1 | Applies clean, `rc=0`, no errors | PASS |
| 2 | All eight proofs fire | PASS |
| 3 | The marker `GUS_LEDGER_0064_OK=1` is emitted | PASS |
| 4 | 0053's checksum is filled in | PASS |
| 5 | 0054's checksum is filled in | PASS |
| 6 | 0060's checksum is filled in | PASS |
| 7 | 0052's checksum is **still NULL** | PASS |
| 8 | The 0054 row is renamed to the file's name | PASS |
| 9 | The 0062 row is the sourcing vocabulary | PASS |
| 10 | The 0063 row is the ledger fix | PASS |
| 11 | No row claims 0062 for the ledger fix | PASS |
| 12 | The 0061 note names 0063 | PASS |
| 13 | Idempotent: a second run writes nothing | PASS |
| 14 | The row count stays at 14 | PASS |
| 15 | **NEG:** 0052 with a checksum present → P7 fails | PASS |
| 16 | **NEG:** a bogus `0062_record_0061_in_the_ledger` row is removed | PASS |
| 17 | **NEG:** a hand-edited 0061 note is preserved, not clobbered | PASS |
| 18 | **NEG:** a correct 0054 name already present → no duplicate | PASS |
| 19 | **NEG:** 0062 pre-exists with a wrong checksum → P2 fails | PASS |
| 20 | **NEG:** 0063 pre-exists with a wrong checksum → P2 fails | PASS |
| 21 | **NEG:** the 0061 row deleted → no failure, not silently re-added | PASS |
| 22 | **NEG:** a foreign row under the bogus name is **left in place** and P6 then **fails** | PASS |

**Two real bugs were found by this suite and fixed before any live
apply:**

1. `unnest(ARRAY[...])` inferred `integer[]`, so the loop variable `n`
   had to be `text`, not `integer`. The migration aborted with
   `invalid input syntax for type integer`.
2. The 0054 checksum was filled in **before** the 0054 rename, so it
   matched no row. The whole transaction then rolled back at P7 — which
   also rolled back the rename, hiding the cause.

**A third test corrected a claim rather than the code.** A row named
`0062_record_0061_in_the_ledger` with a checksum that is *not* the
ledger fix is somebody else's row. The migration leaves it in place
and says so with a NOTICE — but P6 then **fails**, because the
requirement is that nothing claims 0062 for the ledger fix, and a row
that does still claim it must not be passed over in silence. The
migration **fails closed** on an ambiguous row instead of deleting a
human's row or quietly tolerating it.

---

## The check this enables

`scripts/check-live-ledger.py` compares the migration files against the
ledger in **both** directions, and is the thing that keeps this
reconciliation from drifting again.

```
python3 scripts/check-live-ledger.py --live
```

It is read-only: one `SELECT`, no writes, and it requires an explicit
`--live` or `--db-url` — it defaults to neither.

---

## Related

- `docs/MIGRATION-RECEIPT-0061.md` — the migration that omitted its own row.
- `docs/MIGRATION-RECEIPT-0062.md` — the sourcing vocabulary, applied before the ledger existed.
- `docs/MIGRATION-RECEIPT-0063.md` — the ledger fix, applied under the old number 0062.
- `docs/RULES.md` — Rule 11 (an applied migration is immutable).
