# Migration report — 0057 and 0056

**Written:** 2026-11-11, at the owner's instruction.
**Status: REPORT ONLY. No change was made to any database, and none is
proposed here.**

Every number below was measured on live **during this session**, not copied
from the receipt. Where the receipt agrees, that is stated; where it was
checked independently, the command is given.

---

## 1. Who applied 0057

**Alejandro applied it himself, using Codex, on the VPS, over SSH to
`root@62.72.7.218`, by direct `psql`.**

From the private receipt (`.hermes/MIGRATION-RECEIPT-0057.md`, which is
not public because its evidence directory lives on the VPS):

> *"Applied to live on 2026-11-11 at 09:31:55 WITA, by the owner (Codex,
> on the VPS), over SSH to `root@62.72.7.218`, by direct `psql`."*

**It was not the agent.** The agent's role was to prepare the migration,
review it, and re-measure the owner's evidence afterwards — the receipt
records that the agent *"re-measured"* rather than trusted. The apply
itself was the owner's action, which is what RULES.md requires.

**The exact command used:**

```bash
docker exec -u postgres -i shared-postgres psql -U postgres -d gustale \
  -v ON_ERROR_STOP=1 -f - < "$GUS57_MIG"
```

- The **`postgres` role**, because the tables are owned by `postgres`.
- **`ON_ERROR_STOP=1`**, so it aborts on the first error.
- The file was **byte-identical to the reviewed one**. SHA-256 of
  `db/migrations/0057_ingredients_sourcing_vocabulary.sql` at commit
  `75cd904`:
  `168f43141aa91f89d707eb7339c5d62277b9f42f7f462bd91c281de943420c86`
  The apply script **asserted this digest on the VPS immediately before
  applying** (`sha256sum -c -`), so a mismatch would have aborted it
  before `psql` ran.

**Result:** `APPLY_EXIT=0`, and `0057: all 6 proofs passed`.

### The backup came first, as the rules require

`gustale-backup.service` → `Result=success`, `ActiveState=inactive`
**before** anything else.

| | |
|---|---|
| the pre-migration dump | `/root/gus0057-evidence-20261111/pre0057.dump` |
| size | 4,504,247 bytes (4.3 MB) |
| TOC entries | 1,672 |
| sha256 | `2157daa77eba1d7d48e6208b19466b036b4caddca0cc249f905ccb835a347fcd` |

And it was **verified restorable, not merely listable** — restored into a
throwaway database on the **dedicated test postgres** (never on the
production cluster): `MY_RESTORE_EXIT=0`, `MY_RESTORE_ERRORS=0`,
`MY_RESTORED_VS_SNAPSHOT_DIFFS=0`.

---

## 2. Does 0057 depend on 0056?

**No. They are independent, and 0057 does not need 0056 to have run.**

This is the question that matters, because it decides whether the two can
be applied in either order.

**Measured from the migration files:**

| | 0056 `ingredient_aliases.sql` | 0057 `ingredients_sourcing_vocabulary.sql` |
|---|---|---|
| what it does | `CREATE TABLE IF NOT EXISTS public.ingredient_aliases` | a single `INSERT INTO ingredients (…) VALUES (…)` — 21 rows |
| touches `ingredients`? | only via the FK `ingredient_id REFERENCES public.ingredients(id)` | yes — inserts 21 rows |
| touches `ingredient_aliases`? | it creates it | **no reference at all** |

A full-text search of the 0057 file for `alias` (and for
`ingredient_aliases`) returns **nothing**. 0057 never reads or writes the
table 0056 creates.

**Conclusion:** 0057 is **purely additive and self-contained**. It depends
on the `ingredients` table and on `ingredient_categories` (for the
`category` values), both of which are long-established on live. It does
**not** depend on 0056.

**So the two can be applied in either order.** 0056 is not a prerequisite
of 0057, and 0057's success on live did not and could not have depended
on 0056 having run. The receipt states the same conclusion from the other
direction: *"`0056` creates `ingredient_aliases`; `0057` writes
`ingredients` — they do not overlap."*

---

## 3. The live schema state — measured now

All queries were run read-only against live on 2026-11-11, through the
postgres container (the `psql` client is not on the host's PATH):

```bash
docker exec -i shared-postgres psql -U gustale -d gustale -tA -c "<query>"
```

### `ingredients` — the table 0057 wrote to

| measure | live value |
|---|---|
| total rows | **45** |
| `status = 'draft'` | **40** |
| `status = 'published'` | **5** |
| the 21 slugs from 0057, present | **21 / 21** |
| the other 19 drafts (not from 0057) | 19, all `created_at = 2026-11-10` |
| the 5 published | `bechamel`, `bechamel-sauce`, `eggplant`, `lamb-mince`, `tomato` |

The 21 slugs 0057 inserted, all confirmed present and all `draft`:
`ackee`, `asian-pear`, `cassava`, `coconut-milk`, `curry-leaves`,
`doubanjiang`, `epazote`, `fish-sauce`, `fresh-corn-masa`,
`fresh-mozzarella-di-bufala`, `gochujang`, `huitlacoche`,
`makrut-lime-leaves`, `pandan`, `parmigiano-reggiano`, `pecorino`,
`plantain`, `preserved-lemon`, `saffron`, `tamarind`, `ube`.

**Twenty-one, not twenty.** The original spec had twenty rows, and
*"Parmigiano Reggiano and Pecorino"* was **one** spec row and **two**
ingredients — the owner's correction, and the reason the count is 21.

### The category constraint — verified, not assumed

| check | result |
|---|---|
| drafts whose `category` does **not** resolve against `ingredient_categories(slug)` | **0** |
| drafts with a NULL or blank `category` | **0** |

Every one of the 21 carries a category that resolves against the live
435-row FoodOn taxonomy — and against `ingredient_categories(slug)`
specifically, **not** the `categories` table, which is a different
vocabulary.

### `ingredient_aliases` — the table 0056 creates

| check | result |
|---|---|
| `information_schema.tables` where `table_name = 'ingredient_aliases'` | **0 rows — the table does not exist** |
| any table matching `%alias%` in any schema | **none** |

**0056 is NOT applied.** The receipt asserts the same from the other
direction: `to_regclass('public.ingredient_aliases')` → `f`. Both
measurements agree.

### The rest of the schema

Unchanged by 0057, which touched exactly one table. The pre-existing
24 rows are byte-identical to their pre-apply snapshot, and `ingredients`
was the only table of 97 that differed: `('public.ingredients', '24',
'45')`.

### The migration ledger

**There is no ledger row for 0057, and that is expected.** The
`drizzle.__drizzle_migrations` table is written by the Drizzle migrator,
which never runs a hand-written migration — so `0055` is absent from it
too. **The live objects are the record**, not the ledger.

---

## 4. What this means, and what is still open

### Rule 11: 0057 is frozen

`0057` has run on live. Its file is **immutable**. A correction to it
requires a **new migration number**, and the **apply line** is
authoritative, not the commit.

### 0056 remains unapplied — and that is a live inconsistency

This is the one thing worth flagging. 0056 exists to keep **retired
ingredient slugs resolving** — its own comment says: *"A retired slug, not
a deleted one: the URL keeps working."*

On live:

- `bechamel` and `bechamel-sauce` are **both published** — two live
  ingredients that look like a canonical/alias pair.
- `bechamel-sauce` has a **blank category**, while `bechamel` has
  `savoury-sauces`.
- The `ingredient_aliases` table that would express "these are the same
  thing" **does not exist**.

So the alias relationship is currently expressed **only** by two rows
sitting side by side, and one of them has no category. If 0056 is
applied later, it must decide what happens to `bechamel-sauce` — whether
it becomes an alias row pointing at `bechamel`, or stays a separate
ingredient with its category filled in.

**This is a report, not a recommendation to act.** Applying 0056 is a
decision that needs the owner's approval (Rule 1: any write to the live
database needs explicit approval per operation), and it has a content
implication, not just a schema one.

### Nothing else is pending

| item | state |
|---|---|
| 0057 applied | **yes**, 2026-11-11 09:31:55 WITA, by the owner via Codex, `APPLY_EXIT=0` |
| 0057 frozen | **yes** (Rule 11) |
| 0056 applied | **no** — and it does not need to be, for 0057 to be correct |
| 0056 ↔ 0057 dependency | **none** — 0057 is additive and self-contained |
| backup before the apply | **yes**, `gustale-backup.service` success, restore verified |
| 0057's file in the public repo | **yes**, byte-identical to what was applied |

---

## 5. The commands used, so the next reader can repeat them

```bash
# The live queries, read-only, through the postgres container.
PSQL="docker exec -i shared-postgres psql -U gustale -d gustale -tA"

$PSQL -c "SELECT count(*) FROM ingredients;"
$PSQL -c "SELECT status, count(*) FROM ingredients GROUP BY status ORDER BY 2 DESC;"
$PSQL -c "SELECT count(*) FROM information_schema.tables
          WHERE table_name = 'ingredient_aliases' AND table_schema = 'public';"
$PSQL -c "SELECT count(*) FROM ingredients i WHERE i.status = 'draft'
          AND NOT EXISTS (SELECT 1 FROM ingredient_categories c WHERE c.slug = i.category);"

# The files (they live on feature/sourcing-dataset, not on main).
git show feature/sourcing-dataset:db/migrations/0057_ingredients_sourcing_vocabulary.sql
git show feature/sourcing-dataset:db/migrations/0056_ingredient_aliases.sql
```

**No write of any kind was made.** Every command above is a `SELECT`.
