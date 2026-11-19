# MIGRATION RECEIPT — `0061_ingredient_aliases.sql`

**The ingredient alias table, and the route that resolves it.**

**APPLIED TO LIVE — 2026-11-19 (WITA).** The migration was applied to the
live production database (`gustale` on `shared-postgres`) **before** PR
#266 was merged, because the PR's route reads the table this migration
creates. Applying it first is what makes the merge safe: the table
exists before the code that uses it is ever deployed.

`PSQL_RC=0`, 0 error lines, `BEGIN` → `COMMIT`, and the migration's own
in-transaction proofs (P1–P8) were all emitted. The live counts, the
backup, and the independent post-apply verification are all below.

---

## What 0061 is

`bechamel` and `bechamel-sauce` are the same ingredient: both are named
"Béchamel sauce", both are `published`, and both have a live public page.
They are two rows for one ingredient. Measured on live:

| slug | id | status | category |
| --- | --- | --- | --- |
| `bechamel` | `57f6dda0-af1f-4bbc-a5c5-5009cf4bff05` | published | `savoury-sauces` |
| `bechamel-sauce` | `33f93412-19d4-5365-976b-9b3ece95af5f` | published | (none) |

`bechamel-sauce` is referenced by nothing — 0 `dish_ingredients` rows, 0
`recipe_ingredients` rows. It is an orphan **with a public URL**.

**Why an alias and not a delete.** `bechamel-sauce` returns HTTP 200
today. Deleting the row would turn that URL into a 404. An alias makes it
*resolve* to the canonical ingredient, so the URL keeps working and points
at the right thing. That is the difference between retiring a page and
breaking one.

The alias table is the general mechanism, not a one-off for béchamel:
GUS-104 ("intelligent ingredient normalization") needs it, and every
future duplicate needs it. It is built here so that merging the béchamel
pair does not require a second migration later.

### The table

```
public.ingredient_aliases
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid()
  alias_slug    text NOT NULL UNIQUE   -- the OLD slug that must keep resolving
  ingredient_id uuid NOT NULL REFERENCES public.ingredients(id) ON DELETE CASCADE
  reason        text NOT NULL
  created_at    timestamptz NOT NULL DEFAULT now()

  CHECK (length(btrim(alias_slug)) > 0)
  CHECK (length(btrim(reason))    > 0)
```

Plus a `BEFORE INSERT OR UPDATE` trigger
(`_ingredient_aliases_not_self`) that refuses an ingredient being an alias
of itself, and an index on `ingredient_id`.

**Rule 11 honoured:** the migration is transactional and idempotent
(`CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`,
`CREATE OR REPLACE FUNCTION`, `DROP TRIGGER IF EXISTS`,
`ON CONFLICT (alias_slug) DO UPDATE`), and it writes **no content rows
beyond the one alias**. It does **not** delete the orphan row — that is
GUS-092's separate, owner-approved data change, and it happens *after*
the alias is live so the URL never breaks.

---

## The order was the point

1. the migration went to live first, and
2. only then was the merge of #266 unblocked.

---

## The backup

Taken immediately before the apply, on the VPS, from inside the
production container (the host has no `pg_dump` binary), then copied OUT
with `docker cp` — a plain `cp` cannot cross the host/container boundary.

```
/home/deploy/gustale.com/backups/gustale_pre_0061_20261119T130936Z.dump   4528697 bytes
```

The automated offsite backup (`gustale-backup.service`) had also
**succeeded** earlier the same day:

```
Nov 19 09:04:06  Starting gustale-backup.service
Nov 19 09:11:43  SUCCESS: encrypted offsite backup complete:
                 gustale_backup_20261119T010406Z.dump.gpg
Nov 19 09:11:43  Finished gustale-backup.service - status=0/SUCCESS
```

---

## The apply

The file was transferred by `scp` and its SHA-256 verified on both sides
before it was run, so the file that ran is byte-for-byte the file in
PR #266's branch:

```
d09d86a9b225035517d9430d2ca07b72bc9d0b31b348df726cbfb2d9f17ec85a  (local)
d09d86a9b225035517d9430d2ca07b72bc9d0b31b348df726cbfb2d9f17ec85a  (VPS)
```

Applied with `ON_ERROR_STOP=1`, so any error would have aborted and
rolled the transaction back.

```
PSQL_RC=0
BEGIN
CREATE TABLE
COMMENT
COMMENT
COMMENT
CREATE INDEX
CREATE FUNCTION
DROP TRIGGER
CREATE TRIGGER
DO
COMMIT
DO
```

### The migration's own in-transaction proofs

```
CONFIRMED: the ingredient_aliases table exists                         (P1)
CONFIRMED: the bechamel-sauce alias resolves to the bechamel ingredient (P2)
CONFIRMED: an alias to a missing ingredient is refused                 (P3)
CONFIRMED: an ingredient may not be an alias of itself                 (P4)
CONFIRMED: an alias slug may not be used twice                         (P5)
CONFIRMED: a blank alias slug is refused                               (P6)
CONFIRMED: the retired slug resolves through the alias table           (P7)
CONFIRMED: the migration left at most one alias row and no other content (P8)
INGREDIENT_ALIASES_OK=1
```

---

## Independent verification

The migration's own NOTICE lines are **its report**. These are a second,
separate look, read back with queries the migration did not write:

```
alias_rows|1
alias_slug|bechamel-sauce -> 57f6dda0-af1f-4bbc-a5c5-5009cf4bff05
alias_target_slug|bechamel
bechamel_status|published
bechamel_sauce_still_a_row|1
```

- the alias table holds **exactly one** row,
- `bechamel-sauce` resolves to `57f6dda0…`, which is the **canonical**
  `bechamel` row (the one carrying the category), and
- `bechamel-sauce` is **still a row in `ingredients`** — the alias is
  additive and the orphan was not deleted, exactly as the migration
  documents.

---

## The legacy counts are unchanged

The same snapshot query, before and after:

| table | before | after |
| --- | --- | --- |
| statements | 1354 | 1354 |
| claim_citations | 1354 | 1354 |
| dish_relations | 86 | 86 |
| dish_families | 306 | 306 |
| dishes | 1475 | 1475 |
| sources | 1486 | 1486 |
| geo_entities | 3892 | 3892 |
| dish_traditions | 433 | 433 |
| users | 1 | 1 |
| media | 1339 | 1339 |
| dish_names | 2848 | 2848 |
| vocabulary_labels | 35871 | 35871 |
| relation_types | 13 | 13 |
| ingredients | 45 | 45 |
| **ingredient_aliases** | **0** (table absent) | **1** (table present) |

Every legacy count matches `scripts/live-expected-counts.txt` **before**
the apply, and every one of them is **identical** after it. The only
change in the database is the new table and its one row.

---

## The ledger row is missing — and why

`public.gus_migrations_applied` does **not** carry a `0061` row:

```
ledger_has_0061|0
```

**This is a real gap, not an accident of this apply.** Every other
migration in the chain writes its own ledger row inside its own
transaction (0060 does it at `db/migrations/0060_legacy_associations_published.sql:575`),
but `0061_ingredient_aliases.sql` **does not**. It was not written by
this apply, and it was not left out of it — the migration simply never
had the `INSERT INTO public.gus_migrations_applied` block.

Per the table's own COMMENT, the ledger is *"a RECORD, not a mechanism:
nothing reads it to decide whether to run a migration"*, and the
**authoritative** record of an apply is this receipt. So the apply is
fully documented; but the index is now out of date, and a later reader
of `gus_migrations_applied` alone would not see that 0061 ran.

**Rule 11 note:** an applied migration's file is immutable, so this is
NOT fixed by editing `0061_ingredient_aliases.sql`. It needs either a
new migration number (0063+) that inserts the missing ledger row, or an
owner decision that the ledger row is optional for migrations that do not
touch the atlas chain.

---

## What was NOT done here

- **The orphan was not deleted.** `bechamel-sauce` is still a row in
  `ingredients`. That is GUS-092, a separate data change, and it is
  deliberately sequenced *after* the alias is live.
- **No other table was written.** No dish, no ingredient, no
  association.
- **No live row was created and dropped by the proofs.** The proofs that
  write (P3–P6) write only into `ingredient_aliases`, and P5's fixture
  row is deleted inside the same transaction.
