# The CI guard for a data migration

**`scripts/guard_data_migrations.py` is CHECK-ONLY. It reports. It never
writes.** If this document and the script ever disagree, the script is
the one that runs, and the script does not write — so the guard has to
be added **by hand**.

## Why the script does not write

It used to. It rewrote the GUS-242 data migrations in place, inserting
a guard block into each one. That was a footgun, and it bit twice:

1. **It rewrote `0019`**, which is **already applied on live**. A
   rewritten applied migration means the committed chain and the applied
   chain have diverged, and nothing in the repo records that.
2. **It could land the guard in the wrong place.** It inserted at a
   fixed offset, and in one run produced a file whose `BEGIN;`/`COMMIT;`
   nesting was wrong.

So the writing was removed. The script now **reports** whether each
migration carries an intact guard, and **exits 1** when one does not.
That way CI — or a human — notices.

## What the script reports

| verdict | meaning |
|---|---|
| `ok` | the guard is present and the transaction is intact |
| `NO GUARD` | the guard block is missing — the migration will fail on an empty database |
| `MALFORMED` | the guard is present but the transaction around it is broken |
| `MISSING` | the file does not exist |

## When it is safe to edit a migration

**Only if the migration is NOT yet applied anywhere.** If it is applied
on live, editing it changes what the repository says happened versus
what actually happened, and the two must stay identical.

Check what is applied before editing:

```sql
-- on the live database, read-only
SELECT name, applied_at FROM drizzle.__drizzle_migrations
 WHERE name LIKE '00%' ORDER BY name;
```

## The guard block

The guard uses psql's `\if` / `\gset` / `\else`, and it wraps the
**whole** migration body — the `BEGIN;`, the assertions, the writes and
the `COMMIT;`.

A `RETURN` inside a `DO` block exits the **block**, not the
transaction, so a `DO`-block guard would still run the assertions after
it. psql conditionals are the right tool: the whole body is skipped.

- `\gset` — run the `SELECT`, store the result in `:have_data`
- `\if` — include the body only when the data is present

The guard is placed **after** `\set ON_ERROR_STOP on` and **before**
`BEGIN;`, so the transaction never opens on an empty database.

```sql
-- =====================================================================
-- CI GUARD
--
-- This is a DATA migration: it asserts the state of the seeded catalog
-- and then fixes it. CI applies the whole committed chain to a FRESH,
-- EMPTY database, where there is nothing to fix.
--
-- So: if the data this migration acts on is not present, skip cleanly.
-- The guard checks for the SPECIFIC rows the migration acts on, not
-- merely "the database is non-empty", so a partially-migrated live
-- database would NOT skip -- it would run the assertions and fail
-- loudly, which is the intended behaviour.
-- =====================================================================
SELECT EXISTS (SELECT 1 FROM dish_traditions) AS have_data \gset
\if :have_data
\echo 'GUS-242: the seeded data is present - running this migration'
BEGIN;

-- ... the migration body, unchanged ...

COMMIT;
\else
\echo 'GUS-242: the seeded data is NOT present - skipping this migration'
\endif
```

**Replace the condition** with the one that proves *this* migration's
data is present — the specific rows it acts on, not merely "the
database is non-empty". The conditions the script knows about:

| migration | condition |
|---|---|
| `0015_gus242_resync.sql` | `EXISTS (SELECT 1 FROM geo_entities WHERE entity_type = 'country' AND status IS DISTINCT FROM 'archived')` |
| `0016_gus242_cuisines.sql` | `EXISTS (SELECT 1 FROM dish_cuisines)` |
| `0017_gus242_cuisine_corrections.sql` | `EXISTS (SELECT 1 FROM dish_cuisines)` |
| `0018_gus242_vocab_1f.sql` | `EXISTS (SELECT 1 FROM dish_families)` |
| `0019_gus242_traditions_1e.sql` | `EXISTS (SELECT 1 FROM dish_traditions)` |

## The rule for the whole repo

**A migration file, once committed, is not edited.** Not to add a
guard, not to fix a typo, not to reformat. A new migration is added
instead. This is what keeps the committed chain and the applied chain
identical, and it is what makes the live database's receipt mean
something.

The one exception is a migration that is **not yet applied anywhere**,
and even then the edit is by hand and reviewed.
