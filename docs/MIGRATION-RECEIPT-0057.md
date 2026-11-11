# MIGRATION RECEIPT — `0057_ingredients_sourcing_vocabulary.sql`

**Applied to live on 2026-11-11 at 09:31:55 WITA.**

**`APPLY_EXIT=0`. `0057: all 6 proofs passed`.**

> **The full receipt is in the private state repository**, at
> `.hermes/MIGRATION-RECEIPT-0057.md`. It carries the evidence
> directory's paths, the backup's digest and the server-side command
> details, which do not belong in a public repository. This file
> records what is already visible in the migration and in the counts.

---

## Rule 11 — this migration is now frozen

`0057` has run on live. It is **immutable**.

- A correction to it requires a **new** migration number.
- The **apply line** is authoritative, not the commit.
- There is no migration-ledger row for it: `0055` is absent from
  `drizzle.__drizzle_migrations` too, because that ledger is written
  by the Drizzle migrator, which never runs a hand-written migration.
  **The live objects are the record.**

What is now on live:

| object | kind |
|---|---|
| 21 rows in `ingredients`, all `status = 'draft'` | rows |
| every one of the 21 carrying a `category` that resolves against `ingredient_categories(slug)` | rows |

---

## The migration

`db/migrations/0057_ingredients_sourcing_vocabulary.sql`, applied by
direct `psql` with the **`postgres` role** and **`ON_ERROR_STOP=1`**.

The file was **byte-identical to the reviewed one**. The digest was
asserted on the server immediately before the apply, so the migration
that reached live is byte-for-byte the migration that was reviewed —
a mismatch aborts before `psql` runs.

---

## The backup — taken first, and verified restorable

**`gustale-backup.service` → `Result=success`** before anything else,
as RULES.md requires.

**Verified restorable, not merely listable.** The dump was restored
into a throwaway database on the dedicated test postgres — **never on
the production cluster**:

```
pg_restore RC=0
0 errors
97 tables restored
0 diffs against the pre-apply snapshot
24 ingredients in the restored copy (the pre-apply count, not 45)
```

The restored copy holding **24** ingredients rather than 45 is the
point: the backup was taken *before* the apply, so it restores the
pre-migration state.

---

## The dry-run — on the test Postgres, before live

```
BEGIN
INSERT 0 21
DO
NOTICE:  0057: all 6 proofs passed
COMMIT
```

and the **second** application, for idempotence:

```
BEGIN
INSERT 0 0
DO
NOTICE:  0057: all 6 proofs passed
COMMIT
```

`INSERT 0 21` then `INSERT 0 0` is the idempotence property stated
plainly: the migration inserts its 21 rows once, and a second run
inserts none.

---

## The six proofs

All six ran **inside the migration's own transaction**, so a failure
would have rolled the whole migration back.

```
NOTICE:  0057: all 6 proofs passed
```

**Errors in the apply log: 0.**

The proofs assert: the 21 rows exist; all 21 are `draft`; all 21
carry a category that resolves against the taxonomy; no pre-existing
row changed; the published count is unchanged; and the migration left
no published content behind.

### The proof-mutant test — `ALL_MUTANTS_CAUGHT=1` (5/5)

A proof that never fails is not a proof. Each mutant breaks one thing
the migration claims, and each must be caught: a row published
instead of draft, a category that does not exist, a missing row, an
`is_key` leak onto the ingredient row, and a duplicate.

**A fix was needed here.** `scripts/prove-0057-assertions.sh` had a
hard-coded path and **silently fell back to a live `pg_dump` when its
snapshot was missing** — so the test could pass against the wrong
database, or against production. Commit `eb2772e` made it require an
**explicitly supplied snapshot** and derive its own repository path.
The test now fails loudly rather than testing something else.

---

## The before/after comparison

`0057` is **strictly additive** and writes **no published content
rows**, so every count of user data must be identical before and
after except `ingredients` itself.

### The 97 tables

| | |
|---|---|
| the tables in the before snapshot | 97 |
| the tables in the after snapshot | 97 |
| the tables only in one snapshot | **none** |
| **the tables whose count changed** | **exactly one: `public.ingredients`, 24 → 45** |

### The ingredient rows

| | before | after |
|---|---|---|
| ingredients | 24 | **45** |
| published | 5 | **5** |
| draft | 19 | **40** |
| the 21 new rows, all draft | — | **21** |
| the 21 new rows with an unresolvable category | — | **0** |

**The five published rows are exactly the same five:**
`bechamel`, `bechamel-sauce`, `eggplant`, `lamb-mince`, `tomato`.

**The 24 pre-existing rows are byte-identical** — the full row JSON
for every one was compared before and after.

---

## The 21 ingredients

`coconut-milk`, `cassava`, `plantain`, `tamarind`, `saffron`,
`preserved-lemon`, `curry-leaves`, `makrut-lime-leaves`, `gochujang`,
`doubanjiang`, `fish-sauce`, `fresh-mozzarella-di-bufala`,
`parmigiano-reggiano`, `pecorino`, `ube`, `ackee`, `huitlacoche`,
`asian-pear`, `pandan`, `epazote`, `fresh-corn-masa`.

**Twenty-one, not twenty.** The spec's list has twenty rows, and
*"Parmigiano Reggiano and Pecorino"* is **one** spec row and **two**
ingredients — the owner's correction. Every one of the 21 carries a
category queried out of the live 435-row FoodOn taxonomy
(`ingredient_categories(slug)`, **not** the `categories` table, which
is a different vocabulary).

---

## The rollback

`0057` is purely additive, so the rollback is a `DELETE` of the 21
slugs. It publishes nothing, so nothing that was visible before the
apply is visible after it.

```sql
DELETE FROM ingredients WHERE slug IN (
  'coconut-milk','cassava','plantain','tamarind','saffron',
  'preserved-lemon','curry-leaves','makrut-lime-leaves','gochujang',
  'doubanjiang','fish-sauce','fresh-mozzarella-di-bufala',
  'parmigiano-reggiano','pecorino','ube','ackee','huitlacoche',
  'asian-pear','pandan','epazote','fresh-corn-masa'
);
```

The full-dump fallback is the pre-migration backup.

---

## What is still open

- **`0056` — the ingredient alias table — is NOT applied.** The label
  `approved-live` is on PR #219 and the live-approval gate passes,
  but the alias table does not exist on live. It is a **separate
  migration** with its own backup, dry run and receipt. **The two do
  not overlap**: `0056` creates `ingredient_aliases`; `0057` writes
  `ingredients` rows.
- **The sourcing data has not been loaded.** `0057` creates the
  *vocabulary* the availability rows attach to. The availability rows
  themselves — the research — are GUS-1106 and GUS-1107.
- **Nothing on `ingredients` is published.** 40 of the 45 rows are
  draft, including all 21 new ones.
