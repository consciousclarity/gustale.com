# MIGRATION RECEIPT — `0055_sourcing_availability.sql`

**Applied to live on 2026-11-10 at 19:03:58 WITA, by Hermes Agent, over
SSH to `root@62.72.7.218`, by direct `psql`.**

**`RC=0`. `INGREDIENT_SOURCING_AVAILABILITY_OK=1`.**

---

## Rule 11 — this migration is now frozen

`0055` has run on live. It is **immutable**.

- A correction to it requires a **new** migration number.
- The **apply line** is authoritative, not the commit.
- `drizzle.__drizzle_migrations` on live does **not** record it, and
  that is expected: it records no hand-written migration. `0052`,
  `0053` and `0054` are absent from it too, for the same reason — all
  four were applied by direct `psql`, and the ledger is written by
  the Drizzle migrator, which never ran them. **The live objects are
  the record.**

What is now on live, verified by querying it directly:

| object | kind |
|---|---|
| `ingredient_availability` | table |
| `ingredient_substitutes` | table |
| `recipe_ingredient_substitutes` | table |
| `ingredient_availability_fallback_trg` | trigger |
| `recipe_ingredients.is_key` | column, `boolean` |
| `recipe_ingredients.accepted_forms` | column, `text[]` |
| `recipe_ingredients.cost_weight` | column, `text` |
| `ingredients.ubiquitous` | column, `boolean` |

---

## The apply

```bash
docker exec -u postgres -i shared-postgres psql -U postgres -d gustale \
  -v ON_ERROR_STOP=1 -f - < /tmp/0055.sql
```

- **The `postgres` role**, not `gustale` — the `gustale` role fails
  with `must be owner of table`; the tables are owned by `postgres`.
- **`ON_ERROR_STOP=1`** — aborts on the first error.
- **The file was byte-identical to the reviewed one.** SHA-256 of
  `db/migrations/0055_sourcing_availability.sql` at commit
  `8e1b068965f1a476ae117df3bcdce6ff5c54a2b6`:

  ```
  5822536a0ecf81236dbe24cd28b1eb4c789218153491ecb677e920b0819e0c67
  ```

  The same digest was computed on the sandbox host before the apply
  and again on the VPS immediately before it. **The migration applied
  to live is the migration that was reviewed.**

---

## The backup — taken first, and verified restorable

**`gustale-backup.service` → `SUCCESS`** before anything else, as
RULES.md requires.

```
Result=success
ExecMainStatus=0
Nov 10 19:00:53  SUCCESS: encrypted offsite backup complete:
                 gustale_backup_20261110T105213Z.dump.gpg
```

**The local pre-migration dump:**

| | |
|---|---|
| path | `/home/gustale/backups/pre-0055-20261110-190114.dump` |
| size | 4,483,112 bytes (4.3 MB) |
| TOC entries | **1,633** |
| sha256 | `2dec54eda110adbe221d6f1b7b44ff4f231acd941452f675aa404c457381db0a` |

**Taken with `pg_dump` inside the production container** (the host
has no `pg_dump` binary) and moved out with `docker cp`. A plain
`cp` cannot cross the container/host filesystem boundary and fails
with `cannot stat`.

**Verified restorable, not merely listable.** The dump was copied
into `gustale-test-postgres` and restored into a throwaway database
there — **never on the production cluster**:

```
pg_restore RC=0
732 log lines
0 errors
```

And the restored copy was compared against live, count for count:

| | restored copy | live |
|---|---|---|
| ingredients | 24 | 24 |
| ingredient_categories | 435 | 435 |
| recipes | 0 | 0 |
| recipe_ingredients | 0 | 0 |
| dish_ingredients | 23 | 23 |

**Identical.** The backup was then deleted, along with the
verification database.

---

## The dry-run — on the test Postgres, before live

```bash
bash scripts/dryrun-migration.sh /tmp/0055.sql gustale_0055_dryrun
```

The dry-run restores a **read-only snapshot of live** onto
`gustale-test-postgres`, applies there, re-applies for idempotence,
and drops the copy. It never writes to production.

```
MIGRATION APPLIED OK
IDEMPOTENT: the second application succeeded
DRYRUN_OK=1  (the copy ran on gustale-test-postgres, port 5434, and is now dropped)
```

---

## The twelve proofs

All twelve ran **inside the migration's own transaction**, so a
failure would have rolled the whole migration back.

```
CONFIRMED: the three tables and four columns exist
CONFIRMED: a valid availability row is accepted
CONFIRMED: an availability row without a source is refused
CONFIRMED: an invalid form is refused
CONFIRMED: an invalid availability is refused
CONFIRMED: an invalid price band is refused
CONFIRMED: a country row may not be a reliable fallback
CONFIRMED: an invalid accepted form is refused
CONFIRMED: the new recipe line columns default correctly
CONFIRMED: an approximate substitute must disclose the change
CONFIRMED: a recipe-level substitute overrides the global default
CONFIRMED: the migration left no content rows behind
INGREDIENT_SOURCING_AVAILABILITY_OK=1
```

**Errors in the apply log: 0.**

The seventh proof is the one a `CHECK` constraint could not have
made. "A country row may not be a reliable fallback" is a
cross-row rule — it compares one row's `country_code` with another
row's `fallback_country_code` — and PostgreSQL's `CHECK`
constraints cannot contain a subquery. It is enforced by the
trigger `ingredient_availability_fallback_trg`, whose presence on
live was verified after the apply.

---

## The before/after comparison

`0055` is **strictly additive** and writes **no content rows**, so
every count of user data must be identical before and after. This is
the strongest single check in the receipt.

| | before | after |
|---|---|---|
| ingredients | 24 | **24** |
| ingredient_categories | 435 | **435** |
| recipes | 0 | **0** |
| recipe_ingredients | 0 | **0** |
| dish_ingredients | 23 | **23** |

**Unchanged.**

**The three new tables are empty** — as they must be:

```
ingredient_availability       0
ingredient_substitutes        0
recipe_ingredient_substitutes 0
```

**The defaults on the existing rows:**

```
ingredients.ubiquitous = false   on all 24 rows
```

(`recipe_ingredients` is empty on live, so its three new columns have
no rows to default on yet.)

---

## The API

```
https://api.gustale.recipes/health          -> 200
https://api.gustale.recipes/api/ingredients  -> 200
```

The ingredients endpoint serves the same data as before — the first
row is still `bechamel-sauce` with `category: null`, and `bechamel`
with `category: savoury-sauces`.

---

## The rollback, for the record

Not needed: the apply was clean, and `0055` is transactional, so a
failure would have rolled itself back. The procedure was **executed
and verified** against a chain-built sandbox *before* the apply:

- the rollback SQL ran with `ON_ERROR_STOP=1` and exited `0`;
- afterwards the three tables were **gone** and the four columns were
  **gone** — `0 | 0`;
- the rest of the schema was **intact** — 103 tables still present;
- the restore-from-backup path was tested the same way:
  `pg_restore --clean --if-exists` exited `0` with **zero errors** on
  an 859-entry archive.

**The backup is the real recovery path.**

---

## What `0055` does NOT do

Stated plainly, because the schema on live now invites the question:

- **No ingredient rows.** The vocabulary on live is still the 23 rows
  the moussaka seed made, plus the orphan `bechamel-sauce` — **24** —
  against a 435-row *category* vocabulary. The ingredient vocabulary
  itself is GUS-1108's work, and it is **not applied**.
- **No recipes and no recipe lines.** `recipes` and
  `recipe_ingredients` are still empty on live. The rating has
  nothing to attach to until the dataset lands (GUS-1106/1107).
- **The four new columns all have defaults**, so every existing row
  is valid as it stands: `is_key` false, `accepted_forms` NULL,
  `cost_weight` `'major'`, `ubiquitous` false.

---

## The sequence, for the record

| when | what |
|---|---|
| 18:52:13 | `gustale-backup.service` started |
| 19:00:53 | `gustale-backup.service` → **SUCCESS**, deactivated |
| 19:01:14 | the pre-0055 dump taken, 1,633 TOC entries, verified restorable |
| — | the dry-run on the test Postgres → `DRYRUN_OK=1`, idempotent |
| **19:03:58** | **the apply → `RC=0`, `INGREDIENT_SOURCING_AVAILABILITY_OK=1`** |
| — | the verification: 3 tables, 4 columns, `0\|0\|0` rows, data unchanged, API 200 |

**Nothing else was written to live.** No content rows, no seeds, no
recipe data. The migration is structure only.
