# MIGRATION RECEIPT — 0054 `ingredients_category_fk`

**Applied to live: 2026-11-10 13:01:41 WITA, by the owner, by direct
`psql`.** (Rule 1: the owner applies live migrations. This agent did not
connect to the live database, did not run the migration, and did not
deploy anything.)

**Predecessor:** `0053` (the published-recipes view) — **applied to live 2026-11-09**
**Receipt for `0053`:** [`docs/MIGRATION-RECEIPT-0053.md`](MIGRATION-RECEIPT-0053.md)

> **`0054` is now FROZEN** (Rule 11: an applied migration is immutable).
> Any fix goes into a **new** migration number, never into this file.

**Status: APPLIED. FROZEN under Rule 11.**

This receipt records a **live** application performed by the owner on the
production host.

---

## 0. The live apply, in brief

| step | result |
|---|---|
| backup | `/home/gustale/backups/pre-0054-20261110-130141.dump` — **4.5 MB**, taken **13:01:41 WITA**, immediately before the apply |
| preflight | **PREFLIGHT OK** — 435 categories, all **5** existing ingredients resolve |
| apply | by direct `psql`, **2026-11-10 13:01:41 WITA** |
| proof | **4 CONFIRMED cases** (P3, P4, P5, P6) |
| success marker | `INGREDIENT_CATEGORY_FK_OK=1` |
| constraint | `ingredients_category_fk` **present** |
| data | `ingredients` still **5** rows — unchanged |
| API | **HTTP 200** |

---

## What 0054 does

One foreign key, and the index that supports it. It changes no column,
deletes nothing, and writes no content rows.

```sql
CREATE INDEX IF NOT EXISTS ingredients_category_idx
  ON public.ingredients (category);

ALTER TABLE public.ingredients
  ADD CONSTRAINT ingredients_category_fk
  FOREIGN KEY (category) REFERENCES public.ingredient_categories (slug)
  ON UPDATE CASCADE
  ON DELETE SET NULL;
```

**The referential actions are deliberate and worth stating:**

* `ON UPDATE CASCADE` — a category **rename** propagates to the
  ingredients that use it, so renaming a vocabulary row cannot silently
  orphan every ingredient that pointed at it.
* `ON DELETE SET NULL` — deleting a vocabulary row **detaches** the
  ingredient (`category` becomes `NULL`, which is legal) rather than
  deleting the ingredient. The ingredient is content; the category is
  vocabulary. Removing a vocabulary row must not destroy content.

**The constraint is validated, not `NOT VALID`.** It was created and
validated in the same statement, so it applies to every existing row
immediately. The migration's own comment is explicit about why:

> A `NOT VALID` constraint would still refuse new and updated rows but
> would leave the old ones unchecked — which is the half-enforced state
> this migration exists to end.

The constraint's own `COMMENT` records the vocabulary rule and the
absence of an "other" bucket:

> The ingredient category is a SLUG from `ingredient_categories` — the
> 435-row FoodOn vocabulary (option A, Gate 0 of
> docs/RECIPES-INGREDIENT-BACKFILL-PLAN.md). A category that does not
> exist in the vocabulary cannot be stored; an ingredient that fits none
> goes to the owner's review queue, NOT to an 'other' bucket — there is
> none. ON UPDATE CASCADE follows a category rename; ON DELETE SET NULL
> detaches the ingredient rather than deleting it.

---

## The backup

| | |
|---|---|
| path | `/home/gustale/backups/pre-0054-20261110-130141.dump` |
| size | **4.5 MB** |
| taken | **2026-11-10 13:01:41 WITA** — immediately before the apply |
| method | `pg_dump` |

The backup precedes the migration in the same minute. **It is the
rollback material for 0054**: because the migration is additive (one FK
and one index, no data change), restoring it means dropping the
constraint and the index — the backup is the safety net beyond that.

---

## The preflight

Run before the migration was applied:

| check | result |
|---|---|
| `ingredient_categories` row count | **435** |
| every existing `ingredients.category` resolves to a category row | **5 / 5** — all existing ingredient rows resolve |
| the constraint would not fail on existing data | **PREFLIGHT OK** |

The 5 existing ingredients are `bechamel-sauce`, `bechamel`, `eggplant`,
`lamb-mince` and `tomato`. Their `category` was `NULL` before the
migration, and `NULL` is still allowed — a foreign key does not
constrain a null value, so the preflight had nothing to fail on and the
migration could not reject a row.

---

## The proof

0054 carries its own proof, inside its own transaction, so a failed
assertion rolls the whole migration back. Four cases were **CONFIRMED**
on the live apply:

| case | what it proved | result |
|---|---|---|
| **P3** | a valid category (`solanacea`) is **accepted** | **CONFIRMED** — "a valid category is accepted" |
| **P4** | an invalid category is **REFUSED** | **CONFIRMED** — "an invalid category is refused" |
| **P5** | a `NULL` category is **still allowed** | **CONFIRMED** — "a NULL category is still allowed" |
| **P6** | the proof leaves **no content rows** behind | **CONFIRMED** — "the migration left no content rows behind" |

The migration's own success marker:

```
INGREDIENT_CATEGORY_FK_OK=1
```

**The two cases that matter most are P4 and P5.** P4 is the negative
case: without it, a migration that silently created an unenforced
constraint would still print `OK`. P5 is the compatibility case: it
proves the constraint does not break the 5 existing rows, whose
`category` is null.

---

## The post-apply verification

| check | result |
|---|---|
| the constraint `ingredients_category_fk` is present | **present** |
| `ingredients` row count | **5** — unchanged |
| the API | **HTTP 200** |

The API check was repeated independently by the agent against the
public read-only endpoint, and it agrees:

```
GET https://api.gustale.recipes/api/ingredients   ->  HTTP 200
  ingredients: 5
    bechamel-sauce | category = null
    bechamel       | category = null
    eggplant       | category = null
    lamb-mince     | category = null
    tomato         | category = null
```

Five ingredients, all with a null category, exactly as before the
migration. **0054 changed the schema, not the data** — which is what an
additive migration must do.

---

## Rule 11 — this migration is now FROZEN

**Rule 11: an applied migration is immutable.** The line is the **APPLY**,
not the commit. 0054 was applied to live on 2026-11-10 13:01:41 WITA,
so from that moment:

* `db/migrations/0054_ingredient_category_fk.sql` **must not be edited**,
  on any branch, for any reason.
* Any correction goes into a **new migration number** (0055, 0056, …).
* The receipt, this file, may be amended — it is a document, not a
  migration.

This is the same status as `0052` and `0053`.

---

## The Stage B seed that follows this migration

`0054` gave the `ingredients.category` column a vocabulary to point at.
**Stage B** is the seed that fills it in for the first dish:
`packages/db/seed-moussaka-ingredients.sql`.

| | |
|---|---|
| the list | `docs/PANTRY-LIST-moussaka-greek.csv` — **23 rows**, 19 new, 4 reused, 4 optional |
| the seed | 19 INSERTs, 4 UPDATEs, 23 `dish_ingredients` rows, one transaction |
| the marker | `SEED_MOUSSAKA_INGREDIENTS_OK=1` |
| the runbook | `docs/LIVE-APPLY-SEED-MOUSSAKA.md` — direct `psql`, pre-checks, expected counts, the 4 live pages that change |
| the verification | `scripts/verify-pantry-seed.sh` — 10 checks, including the rollback proof |
| the vocabulary gaps found | `docs/VOCABULARY-ADDITIONS.md` — kefalotyri's exact class, a wine class, and the sub-recipes schema item |

**The seed is NOT applied.** `0054` is; the seed waits for the owner's go.

---

## What this means for the ingredient backfill

Before 0054, `ingredients.category` was free text and the five existing
rows had no category at all. After 0054:

* a category **must** be a row of the 435-row vocabulary, or be `NULL`;
* the vocabulary is enforced by the database, not by a script;
* the TypeScript union (`ingredientCategory`) is now the **same 435
  rows** — it was regenerated from the table on this branch, so it
  carries **435 members** and contains no `other`. Before that work it
  was a **third vocabulary of 12 coarse values** that disagreed with
  the table (11 of its 12 existed as category rows, and `other` did not
  exist at all). That disagreement is what 0054's own header describes,
  and it is why the union had to be regenerated rather than trusted.

So Stage B of the backfill — writing the pantry list's 24 rows with
their categories — can no longer write a category that is not in the
table. **The vocabulary is now a constraint, not a convention.**

Note for the pantry list: **55 of the 435 rows carry no FoodOn
identifier.** They are the pre-existing coarse categories (`beef`,
`paste`, `herb`, `sauce`, `beverage`, …) that predate the FoodOn
vocabulary. They are real rows of the vocabulary, so the foreign key
accepts them, but they are much broader than the material they would
label. The `moussaka-greek` pantry list uses two of them (`beverage` for
red wine, `beef` for beef mince) and flags both.

---

## Related documents

| document | what it is |
|---|---|
| `docs/RECIPES-INGREDIENT-BACKFILL-PLAN.md` | the backfill plan; Gate 0 settled the vocabulary, Gate A is the pantry list |
| `docs/PANTRY-LIST-moussaka-greek.md`
- `docs/LIVE-APPLY-SEED-MOUSSAKA.md` — the Stage B seed's live-apply runbook
- `docs/VOCABULARY-ADDITIONS.md` — the classes the vocabulary is missing | the Stage A pantry list (the pilot) |
| `db/migrations/0054_ingredient_category_fk.sql` | the migration — **frozen** |
| `scripts/check-migrations-are-transactional.py` | proves 0054 is transaction-wrapped (it is not grandfathered) |
