# LIVE APPLY — migration `0055_sourcing_availability.sql`

**The migration is approved.** PR #218 is green at `eedadea`, the
`approved-live` label is on, and the live approval gate passes
(run 140).

This document is the procedure Hermes follows on the VPS, following
the worked example in `docs/LIVE-APPLY-0053.md`. It is written to be
executed **in order**, and every step says what "correct" looks
like. **If any step's expected result does not appear, stop.**

The migration is **transactional**, so a failure rolls the whole
thing back — but the backup is still taken first, because a
transaction protects the schema and not the data.

---

## 0. Before you start

**Prerequisites on the VPS host:**

- `shared-postgres` is running (PostGIS 16);
- the repo is checked out at the commit carrying `0055` — the branch
  `feature/sourcing-rating`, head `eedadea`, **unless the owner has
  merged PR #218 to `main`**, in which case `main`;
- SSH works with the dedicated key.

```bash
cd <the repo>
git fetch origin
git log --oneline -1
```

**The file must be present:**

```bash
ls -la db/migrations/0055_sourcing_availability.sql
```

**`0055` must not already be applied.** It is idempotent, but an
already-applied migration means something else applied it and the
counts below will not match:

```bash
docker exec -u postgres shared-postgres psql -U postgres -d gustale -tAc "
SELECT count(*) FROM information_schema.tables
 WHERE table_schema='public' AND table_name IN
 ('ingredient_availability','ingredient_substitutes','recipe_ingredient_substitutes');"
```

**Expected: 0.** Anything else means it already ran — stop and read
the receipt.

**The baseline counts, for the before/after comparison.** `0055` is
strictly additive and writes **no content rows** — every count of
user data must be identical before and after:

```bash
docker exec -u postgres shared-postgres psql -U postgres -d gustale -tAc "
SELECT
  (SELECT count(*) FROM public.ingredients)          AS ingredients,
  (SELECT count(*) FROM public.ingredient_categories) AS categories,
  (SELECT count(*) FROM public.recipes)               AS recipes,
  (SELECT count(*) FROM public.recipe_ingredients)    AS recipe_ingredients,
  (SELECT count(*) FROM public.dish_ingredients)      AS dish_ingredients;"
```

**Record this output.** It is the "before" in the receipt, and the
comparison in section 5 is what proves the migration wrote nothing.

**The `postgres` role, not `gustale`.** The `gustale` role fails
with `must be owner of table` — the tables are owned by `postgres`.

---

## 1. The backup — `pg_dump` + `docker cp`, FIRST, and VERIFIED

**The same method as the `0052` and `0053` backups.** The dump is
written *inside* the production container, because that is where
`pg_dump` lives; the host has no `pg_dump` binary.

```bash
STAMP=$(date '+%Y%m%d-%H%M%S')
DUMP="/home/gustale/backups/pre-0055-${STAMP}.dump"

docker exec -u postgres shared-postgres \
  pg_dump -U postgres -d gustale --format=custom --file=/tmp/pre-0055.dump

docker cp shared-postgres:/tmp/pre-0055.dump "$DUMP"

ls -la "$DUMP"
```

**Verify the archive is readable and complete BEFORE applying
anything:**

```bash
docker exec -u postgres shared-postgres \
  pg_restore --list /tmp/pre-0055.dump | wc -l
```

**Do not proceed if the dump is empty, or if `pg_restore --list`
errors.** A non-zero TOC-entry count is what you want; the `0054`
backup was 4.5 MB, and `0055` adds nothing to the data, so this one
should be about the same size.

---

## 2. The dry-run on the test Postgres

**On the test Postgres, never on production.** This is the step that
catches a broken migration before live sees it.

```bash
bash scripts/lib/test_pg.sh up
bash scripts/dryrun-migration.sh \
  db/migrations/0055_sourcing_availability.sql gustale_0055_dryrun
```

**What you are looking for:**

- the apply succeeds;
- the second apply also succeeds (**idempotent**);
- `INGREDIENT_SOURCING_AVAILABILITY_OK=1` is in the output;
- the twelve `CONFIRMED:` lines are in the output;
- **the tables exist but are EMPTY** afterwards — `0055` adds
  structure, not content.

**If the dry-run fails: stop. Do not apply to live.**

---

## 3. The apply — direct `psql`

```bash
docker exec -u postgres -i shared-postgres psql -U postgres -d gustale \
  -v ON_ERROR_STOP=1 -f - < db/migrations/0055_sourcing_availability.sql 2>&1 | tee /tmp/m0055.log
RC=${PIPESTATUS[0]}
echo "RC=$RC"
```

**`RC=0` is required.** `ON_ERROR_STOP=1` aborts on the first error,
and `0055` is transactional, so a failure rolls the whole migration
back — there would be nothing on live.

**The migration's own proof must have passed.** It runs *inside* the
migration's transaction, so if it failed, the migration rolled back:

```bash
grep -E "INGREDIENT_SOURCING_AVAILABILITY_OK|CONFIRMED" /tmp/m0055.log | tail -20
```

**The twelve proofs**, in order:

| # | what it proves |
|---|---|
| 1 | the three tables and four columns exist |
| 2 | a valid availability row is accepted |
| 3 | an availability row **without a source** is refused |
| 4 | an invalid form is refused |
| 5 | an invalid availability is refused |
| 6 | an invalid price band is refused |
| 7 | a country row may **not** be a reliable fallback (the trigger) |
| 8 | an invalid accepted form is refused |
| 9 | the new recipe-line columns default correctly |
| 10 | an approximate substitute must disclose the change |
| 11 | a recipe-level substitute overrides the global default |
| 12 | the migration left **no content rows** behind |

All twelve `CONFIRMED:` lines must be present, plus
`INGREDIENT_SOURCING_AVAILABILITY_OK=1`.

---

## 4. Verify `0055` specifically

### 4.1 The three tables exist

```bash
docker exec -u postgres shared-postgres psql -U postgres -d gustale -c "
SELECT table_name FROM information_schema.tables
 WHERE table_schema='public' AND table_name IN
 ('ingredient_availability','ingredient_substitutes','recipe_ingredient_substitutes')
 ORDER BY table_name;"
```

**Expected: 3 rows.**

### 4.2 The four columns exist

```bash
docker exec -u postgres shared-postgres psql -U postgres -d gustale -c "
SELECT table_name, column_name, data_type
 FROM information_schema.columns
 WHERE table_schema='public'
   AND ( (table_name='recipe_ingredients' AND column_name IN
          ('is_key','accepted_forms','cost_weight'))
       OR (table_name='ingredients' AND column_name='ubiquitous') )
 ORDER BY table_name, column_name;"
```

**Expected: 4 rows** — `recipe_ingredients.is_key` (boolean),
`recipe_ingredients.accepted_forms` (ARRAY), `recipe_ingredients.cost_weight`
(text), `ingredients.ubiquitous` (boolean).

### 4.3 The tables are EMPTY

```bash
docker exec -u postgres shared-postgres psql -U postgres -d gustale -tAc "
SELECT
  (SELECT count(*) FROM public.ingredient_availability),
  (SELECT count(*) FROM public.ingredient_substitutes),
  (SELECT count(*) FROM public.recipe_ingredient_substitutes);"
```

**Expected: `0 | 0 | 0`.** `0055` writes structure only. If any
count is non-zero, something wrote content rows and the migration is
not what was reviewed — **stop and investigate**.

### 4.4 The user data is unchanged — the before/after comparison

Re-run the section 0 counts and compare:

```bash
docker exec -u postgres shared-postgres psql -U postgres -d gustale -tAc "
SELECT
  (SELECT count(*) FROM public.ingredients),
  (SELECT count(*) FROM public.ingredient_categories),
  (SELECT count(*) FROM public.recipes),
  (SELECT count(*) FROM public.recipe_ingredients),
  (SELECT count(*) FROM public.dish_ingredients);"
```

**Every number must be identical to section 0.** This is the
strongest single check in the document: it proves the migration
touched no data.

### 4.5 The API is still healthy

```bash
curl -s -o /dev/null -w '%{http_code}\n' https://api.gustale.recipes/api/ingredients
```

**Expected: `200`.**

---

## 5. The rollback, if it is needed

`0055` is **strictly additive** — three new tables and four new
columns, all either empty or defaulted. The rollback is therefore
simple, and it is **not** needed in the normal case: a failed apply
rolls itself back.

**If the migration applied but something about it is wrong:**

```bash
# Drop the three tables (they hold no data at this point).
docker exec -u postgres shared-postgres psql -U postgres -d gustale -v ON_ERROR_STOP=1 <<'SQL'
BEGIN;
DROP TABLE IF EXISTS public.recipe_ingredient_substitutes;
DROP TABLE IF EXISTS public.ingredient_substitutes;
DROP TABLE IF EXISTS public.ingredient_availability;
ALTER TABLE public.recipe_ingredients
  DROP COLUMN IF EXISTS is_key,
  DROP COLUMN IF EXISTS accepted_forms,
  DROP COLUMN IF EXISTS cost_weight;
ALTER TABLE public.ingredients
  DROP COLUMN IF EXISTS ubiquitous;
COMMIT;
SQL
```

**If `ingredient_availability` or `ingredient_substitutes` hold rows
when you roll back, you have lost data** — restore from the backup
instead:

```bash
docker exec -u postgres shared-postgres \
  pg_restore -U postgres -d gustale --clean --if-exists "$DUMP"
```

**The backup is the real recovery path.** The dump from section 1 is
the artifact that makes every other failure recoverable.

### 5.1 The rollback, proven

This rollback was **executed and verified** on a sandbox database
built by the full migration chain (`scripts/ci-migration-chain.sh`),
before this document was written:

- the rollback SQL ran with `ON_ERROR_STOP=1` and exited `0`
  (`BEGIN … COMMIT`, all five statements OK);
- afterwards the three tables were **gone** and the four columns were
  **gone** — `0 | 0`;
- the rest of the schema was **intact** — 103 tables still present.

The restore-from-backup path was tested the same way:
`pg_restore --clean --if-exists` exited `0` with **zero errors** on
an 859-entry archive.

---

## 6. The receipt

Write `docs/MIGRATION-RECEIPT-0055.md` in the repo, following
`docs/MIGRATION-RECEIPT-0054.md`. It records:

- the apply timestamp (WITA) and the `RC`;
- the backup path and its size and TOC-entry count;
- the twelve `CONFIRMED:` lines and the
  `INGREDIENT_SOURCING_AVAILABILITY_OK=1` marker;
- the before/after counts from sections 0 and 4.4, with the
  comparison stated;
- the API result;
- the rollback procedure, for the record;
- **the Rule 11 freeze notice** — `0055` is now immutable on live;
  a correction needs a **new** migration number.

---

## 7. What is NOT in this migration

Worth stating plainly, because the schema on live now invites the
question:

- **`0055` adds no ingredient rows.** The vocabulary is still the
  23 rows the moussaka seed made (24 on live, counting the orphan
  `bechamel-sauce`), against a 435-row *category* vocabulary. The
  ingredient vocabulary is GUS-1108's work and is not applied yet.
- **`0055` adds no recipes and no recipe lines.** `recipes` and
  `recipe_ingredients` are still empty on live. The rating has
  nothing to attach to until the dataset lands.
- **The `is_key`, `accepted_forms`, `cost_weight` and `ubiquitous`
  columns all have defaults**, so existing rows are valid as they
  stand: `is_key` false, `accepted_forms` NULL, `cost_weight`
  `'major'`, `ubiquitous` false.
