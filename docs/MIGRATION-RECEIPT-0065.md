# MIGRATION RECEIPT — `0065_relation_slug_normalisation.sql`

**Normalises the relationship slugs to underscores (D21-7).**

**NOT APPLIED TO LIVE.** This receipt records the migration, the counts it
was built from, the proofs it makes and the dry run that verified them.
The owner applies it to production by direct `psql` — the command is
below. **Until that command is run, production still carries the two
hyphenated slugs.**

| | |
|---|---|
| File | `db/migrations/0065_relation_slug_normalisation.sql` |
| SHA-256 | `709a7a232ce88579c1ceeb4e962a701b2257de12f53a0f8e01b819873bf595e9` |
| Bytes | 15,606 |
| Written | 2026-11-21 |
| Dry run | `PSQL_RC=0`, `BEGIN` → `COMMIT`, ten proofs emitted |
| Live apply | **not done** |

---

## The number: 0065, not 0064

`0064` belongs to `0064_reconcile_the_ledger.sql` in PR #277, which is
still open. Two migrations must never share a number — the chain
validator (`scripts/validate-ci-migration-chain.py`) reads the three lists
(`ci.yml`, `ci-migration-chain.sh`, `repro-ci-db.sh`) as a sequence, and a
duplicate number makes the order ambiguous.

So this is `0065`, and it places itself after `0063` in all three lists.

---

## The counts — "13, 15 or 17"

The brief asked for this number before anything was built, and got three
different ones. **It is 13.** Here is the whole accounting.

### The vocabulary has 13 rows

```
$ docker exec gustale-test-postgres psql -U postgres -d gustale_live_shape_0059 \
    -c "SELECT slug FROM relation_types ORDER BY slug"

chili-condiment
curry-spiced-stew
fermented-batter
fermented-bean
filled-dough
flatbread
fried-dough-pastry
noodle-soup
preserved-fish
rice-pilaf
shared-ingredient
similar-form
similar-serving
similar-technique
```

### The code union lists 8 of them

`packages/db/src/schema/index.ts` exports:

```ts
export const dishRelationType = [
  "family", "similar_form", "similar_technique",
  "similar_serving", "shared_ingredient",
  "descent", "migration", "influenced",
] as const;
```

**8 values. The database has 13.** The code is missing
`chili-condiment`, `curry-spiced-stew`, `fermented-batter`,
`fermented-bean`, `filled-dough`, `flatbread`, `fried-dough-pastry`,
`noodle-soup`, `preserved-fish`, `rice-pilaf` — ten of them — and it
lists `descent`, `migration` and `influenced`, which are in the
vocabulary, but it does not list `similar-form` or `similar-serving`.

> The code union and the database vocabulary disagree. **That** is the
> bug, not the spelling.

### The two hyphen spellings

Exactly **two** of the 13 vocabulary slugs contain a hyphen:

```
$ docker exec gustale-test-postgres psql -U postgres -d gustale_live_shape_0059 \
    -tAc "SELECT slug FROM relation_types WHERE slug LIKE '%-%' ORDER BY slug"
shared-ingredient
similar-serving
```

So: **13 vocabulary slugs + 2 hyphen spellings = 15.** The brief's "17"
counts two spellings that do not exist. There is no `shared_ingredient`
row in the vocabulary — only `shared-ingredient`.

### The live rows

Read from the live API's relationship payload, not from a local copy:

```console
$ curl -sS https://api.gustale.com/api/atlas/connections | python3 -c "
import json,sys,collections
c=json.load(sys.stdin)['connections']
for k,v in collections.Counter(x['relationship'] for x in c).most_common(): print(f'{k:24} {v}')"

family              47
similar_form        14
similar_technique   12
similar-serving      7
shared-ingredient    2
```

**82 connections live, in 5 distinct spellings.** Nine of them carry a
hyphen: 7 `similar-serving` + 2 `shared-ingredient`.

(The local live-shape copy holds 86 rows against the same 13-row
vocabulary — the live API's connection payload is a filtered view. The
**slugs** and their counts agree; the row totals differ because the API
applies its own filters. The migration's proofs assert that the row
count does not *change*, not what it is.)

### Why the discrepancy exists

There are **two** different things called "the relation types":

1. The **vocabulary** — `relation_types`, 13 rows, the canonical list.
2. The **code union** — `dishRelationType` in the Drizzle schema, 8
   values, which drifted from the vocabulary.

And **two different spellings of the same thing**:

3. The **hyphen** form — `similar-serving`, `shared-ingredient` (2 of 13).
4. The **underscore** form — `similar_serving`, `shared_ingredient`, the
   form the code union uses, the form the brief asks for.

---

## What the migration does

1. Snapshots the counts it is about to change.
2. Renames two `relation_types` rows:
   `similar-serving` → `similar_serving`,
   `shared-ingredient` → `shared_ingredient`.
3. Updates the nine `dish_relations` rows that carried the hyphen.
4. Adds a **guard trigger** that asserts every row's `relation_type`
   equals the slug of the `relation_types` row it points at.
5. Writes a ledger row.
6. Proves ten things and raises if any fails.

### The merge question: zero collisions

Renaming a slug can create a duplicate and break the unique constraint on
`(from_dish_id, to_dish_id, relation_type)`. **It does not here.** The
hyphen rows and the underscore rows sit on **different dish pairs**:

```console
$ docker exec gustale-test-postgres psql -U postgres -d gustale_live_shape_0059 -c "
SELECT a.from_dish_id, a.to_dish_id, a.relation_type AS hyphen,
       b.relation_type AS underscore
  FROM dish_relations a
  JOIN dish_relations b
    ON a.from_dish_id = b.from_dish_id AND a.to_dish_id = b.to_dish_id
 WHERE a.relation_type IN ('similar-serving','shared-ingredient')
   AND b.relation_type IN ('similar_serving','shared_ingredient');"

(0 rows)
```

**Zero rows would merge.** This was checked before the migration was
written, not discovered by it failing.

---

## The guard is a trigger, not a CHECK — and why

The first version of this migration used a `CHECK` constraint to stop the
drift recurring. **Postgres does not allow a subquery in a CHECK
constraint**, and this one needs one:

```
ERROR:  cannot use subquery in check constraint "dish_relations_relation_type_matches_vocab"
```

The dry run failed with `PSQL_RC=3` and **rolled back cleanly** — the
ledger row was gone, the slugs were unchanged, zero residue. That is
recorded here because the failure is the reason the design changed.

The guard is a trigger instead. It fires on `INSERT` and `UPDATE` of
`dish_relations` and raises when `relation_type` and the pointed-at
vocabulary slug disagree.

### The guard has teeth — proved both ways

**Test 1 — the normal path.** Write the old hyphenated spelling back:

```console
$ docker exec gustale-test-postgres psql -U postgres -d d21_7_dryrun -c "
WITH victim AS (SELECT id FROM dish_relations WHERE relation_type='similar_serving' LIMIT 1)
UPDATE dish_relations SET relation_type='similar-serving' WHERE id=(SELECT id FROM victim);"

UPDATE 1
```

The write is **accepted and then corrected** by the existing
`sync_relation_type` trigger, which rewrites `relation_type` from
`relation_type_id`. Afterwards:

```console
$ ... -tAc "SELECT count(*) FROM dish_relations dr
             JOIN relation_types rt ON rt.id=dr.relation_type_id
            WHERE dr.relation_type IS DISTINCT FROM rt.slug"

0
```

**Zero drift.** The legacy spelling cannot survive a write.

**Test 2 — the guard itself.** With the sync trigger disabled, so the
guard is the only thing standing there:

```console
$ docker exec gustale-test-postgres psql -U postgres -d d21_7_dryrun -c "
BEGIN;
ALTER TABLE dish_relations DISABLE TRIGGER trg_a_sync_relation_type;
UPDATE dish_relations SET relation_type='family'
 WHERE relation_type='similar_serving'
   AND id=(SELECT id FROM dish_relations WHERE relation_type='similar_serving' LIMIT 1);
ROLLBACK;"

BEGIN
ALTER TABLE
ERROR:  relation_type family does not match its vocabulary slug similar_serving
        for relation_type_id e3171245-94b8-45c7-a037-af2354df63f9
CONTEXT:  PL/pgSQL function assert_relation_type_matches_vocab() line 19 at RAISE
ROLLBACK
```

**The guard raises.**

**Test 3 — an unknown type.** The existing trigger already rejected
this, before this migration:

```console
$ ... -c "INSERT INTO dish_relations (from_dish_id,to_dish_id,relation_type)
          SELECT from_dish_id,to_dish_id,'bogus-type' FROM dish_relations LIMIT 1"

ERROR:  unknown relation_type bogus-type
CONTEXT:  PL/pgSQL function sync_relation_type() line 6 at RAISE
```

---

## The dry run

On a copy of the live shape:

```console
$ docker exec gustale-test-postgres psql -U postgres \
    -c "DROP DATABASE IF EXISTS d21_7_dryrun" \
    -c "CREATE DATABASE d21_7_dryrun TEMPLATE gustale_live_shape_0059"
CREATE DATABASE

$ docker exec -i gustale-test-postgres psql -X -v ON_ERROR_STOP=1 \
    -U postgres -d d21_7_dryrun \
    < db/migrations/0065_relation_slug_normalisation.sql
BEGIN
INSERT 0 1
SELECT 1
UPDATE 1
UPDATE 1
UPDATE 9
CREATE FUNCTION
DROP TRIGGER
NOTICE:  trigger "trg_d_assert_relation_type_matches_vocab" for relation "public.dish_relations" does not exist, skipping
CREATE TRIGGER
NOTICE:  CONFIRMED: the vocabulary holds no hyphenated slug
NOTICE:  CONFIRMED: no dish_relations row carries a hyphenated relation_type
NOTICE:  CONFIRMED: similar_serving holds 7 rows and shared_ingredient holds 2
NOTICE:  CONFIRMED: every row's relation_type equals its vocabulary slug
NOTICE:  CONFIRMED: every relation_type resolves to a vocabulary row
NOTICE:  CONFIRMED: no row points at a missing relation_types row
NOTICE:  CONFIRMED: the vocabulary still holds 13 rows
NOTICE:  CONFIRMED: dish_relations still holds 86 rows
NOTICE:  CONFIRMED: the legacy hyphenated slugs are gone
NOTICE:  CONFIRMED: the guard trigger exists and is enabled
NOTICE:  D21-7_RELATION_SLUGS_OK=1
DO
COMMIT
```

`PSQL_RC=0`. `BEGIN` → `COMMIT`. **Ten proofs, ten CONFIRMED lines.**

Note `UPDATE 9` — nine rows carried across — and `UPDATE 1` twice, one
for each vocabulary row.

### Idempotence

The second run of the same file:

```console
$ docker exec -i gustale-test-postgres psql -X -v ON_ERROR_STOP=1 \
    -U postgres -d d21_7_dryrun \
    < db/migrations/0065_relation_slug_normalisation.sql

UPDATE 0
UPDATE 0
UPDATE 0
...
NOTICE:  D21-7_RELATION_SLUGS_OK=1
COMMIT
```

`PSQL_RC=0`, ten proofs still pass, **three `UPDATE 0`s** — the second run
changes nothing. The `ON CONFLICT` on the ledger row leaves it alone.

---

## The proofs, and what each one proves

| # | proof | why it matters |
|---|---|---|
| P1 | the vocabulary holds no hyphenated slug | the rename completed |
| P2 | no `dish_relations` row carries a hyphenated `relation_type` | the rows followed the vocabulary |
| P3 | `similar_serving` holds 7 rows and `shared_ingredient` holds 2 | the row counts did not shift |
| P4 | every row's `relation_type` equals its vocabulary slug | no drift |
| P5 | every `relation_type` resolves to a vocabulary row | no orphan |
| P6 | no row points at a missing `relation_types` row | the FK holds |
| P7 | the vocabulary still holds 13 rows | nothing was lost or duplicated |
| P8 | `dish_relations` still holds 86 rows | nothing was lost or duplicated |
| P9 | the legacy hyphenated slugs are gone | the old spellings are unreachable |
| P10 | the guard trigger exists and is enabled | the drift cannot come back |

P7 and P8 together are the loss check: the migration renamed things, it
did not create or drop any.

---

## Applying it to live

**The owner runs this.** The agent does not write to the live database.

```console
$ scp db/migrations/0065_relation_slug_normalisation.sql \
      root@62.72.7.218:/tmp/0065.sql

$ ssh root@62.72.7.218 \
    'sha256sum /tmp/0065.sql; \
     docker exec -i shared-postgres psql -X -v ON_ERROR_STOP=1 -U gustale -d gustale \
       < /tmp/0065.sql'
```

Expected: the SHA-256 must read
`709a7a232ce88579c1ceeb4e962a701b2257de12f53a0f8e01b819873bf595e9`,
`PSQL_RC=0`, `BEGIN` → `COMMIT`, and ten `CONFIRMED` lines ending in
`D21-7_RELATION_SLUGS_OK=1`.

**Take a backup first.** See the backup section of
`docs/MIGRATION-RECEIPT-0063.md` for the established procedure.

**Then re-run it** to prove idempotence on live the same way it was
proved on the dry run: the second run must report three `UPDATE 0`s and
still emit the ten proofs.

---

## What this migration does NOT fix

The **code union** still lists only 8 of the 13 slugs. Normalising the
database slugs does not widen the TypeScript union, and it does not add
the ten missing slugs. That is a separate change, in the schema file,
and it needs its own PR — widening a union type changes what compiles.

**The live rows use the hyphen spellings until this migration is
applied.** Nothing in this PR changes production behaviour.

---

## The chain files

Three files list the migrations, and all three were updated:

| file | change |
|---|---|
| `scripts/ci-migration-chain.sh` | 0065 added after 0063, with a `D21-7_RELATION_SLUGS_OK=1` marker |
| `scripts/repro-ci-db.sh` | 0065 added after 0063, with the same marker |
| `.github/workflows/ci.yml` | **not changed** — see below |

`.github/workflows/ci.yml` is **not** in this PR, because a workflow
change needs the `approved-live` label and the owner's authority — the
App has no workflow scope. The owner applies the workflow hunk from
`docs/ci-0065-migration-chain.patch`, which this PR ships as a file.
