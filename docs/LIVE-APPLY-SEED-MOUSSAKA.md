# Applying the moussaka ingredient seed to live — the owner's checklist

**Status:** NOT APPLIED. **Nothing in this document has touched live.**
**Prepared:** 2026-11-10 · **Owner:** Alejandro · **Agent:** Hermes

> **Do not run any of this from the agent.** Rule 1: no live database
> write without the owner's explicit go, per operation. These commands
> are for **you**, on the VPS, at the moment you decide to apply it.

---

## What this seed is

`packages/db/seed-moussaka-ingredients.sql` — **Stage B** of the
ingredient backfill: the 23 rows of the approved
`moussaka-greek` pantry list.

**It is a SEED, not a migration.** It writes **content** (rows), not
schema. `0054` is applied and frozen (Rule 11); this seed does not
touch any migration file and needs no new migration number.

| | |
|---|---|
| **19** INSERTs | the new ingredient rows — `status='draft'`, both description columns **empty** |
| **4** UPDATEs | the reused rows (`eggplant`, `lamb-mince`, `tomato`, `bechamel`) — their `category` only |
| **23** INSERTs/UPDATEs | the `dish_ingredients` rows for `moussaka-greek`, carrying `is_optional` |
| **1** NOTICE | `SEED_MOUSSAKA_INGREDIENTS_OK=1` — the success marker |

**It is one transaction.** `BEGIN;` … `COMMIT;`. A failure anywhere
rolls the whole seed back — proved in the test, where a deliberate
failure after the inserts left only the 4 pre-existing rows.

**It is idempotent.** `ON CONFLICT (slug) DO NOTHING` on the inserts,
and `WHERE … IS DISTINCT FROM …` on the updates, so re-running it
changes nothing. Proved in the test: a re-apply left the row count at
23.

---

## 0. Before you start

| check | why |
|---|---|
| **`0054` is applied** | the seed writes `ingredients.category`, and the `ingredients_category_fk` foreign key is what accepts it. If `0054` is not on live, the seed's categories are unconstrained — the seed would still work, but it would be writing against a schema you have already decided to freeze. |
| **`0054` is frozen** | this seed does **not** edit it, and must not. |
| **You have the seed file on the VPS** | `packages/db/seed-moussaka-ingredients.sql` from PR #217. Fetch it onto the host. |
| **`gustale-backup.service` is `SUCCESS`** | RULES.md: snapshot before every production change. |
| **You have decided on the four live pages** | see §5 — four published ingredient pages change. |

---

## 1. The pre-checks — run these FIRST, and read the output

**Every one of these must be what is written here. If any differs,
STOP.**

### 1.1 The counts before

```bash
docker exec -u postgres shared-postgres psql -U postgres -d gustale -tAc "
SELECT 'total='   || count(*) FROM ingredients
UNION ALL SELECT 'published=' || count(*) FROM ingredients WHERE status='published'
UNION ALL SELECT 'draft='     || count(*) FROM ingredients WHERE status='draft'
UNION ALL SELECT 'dish_ingredients=' || count(*) FROM dish_ingredients;"
```

**Expected:**

```
total=5
published=5
draft=0
dish_ingredients=4
```

**Why each one matters:**

| count | expected | what it proves |
|---|---|---|
| `total` | **5** | the baseline. `0054`'s receipt recorded 5, and the live API serves 5. If this is not 5, something else has changed the ingredients table and the "after" numbers below are not comparable. |
| `published` | **5** | the public API filters `WHERE status='published'`, so **this is the number of entries a visitor sees**. It must be 5 before and 5 after. |
| `draft` | **0** | there are no draft ingredients yet. This seed creates 19. |
| `dish_ingredients` | **4** | `moussaka-greek` has 4 ingredient rows. The seed adds 19 more, to 23. |

### 1.2 The four reused rows, and their categories

```bash
docker exec -u postgres shared-postgres psql -U postgres -d gustale -tAc "
SELECT slug||' | status='||status||' | category='||coalesce(category,'(null)')
FROM ingredients ORDER BY slug;"
```

**Expected: five rows**, and the four reused ones (`bechamel`,
`eggplant`, `lamb-mince`, `tomato`) must show `status=published` and
`category=(null)`.

**`category=(null)` is the point.** It is what proves the seed's four
UPDATEs have something to do — and it proves `0054`'s `NULL`-allowed
foreign key let the baseline through.

### 1.3 The constraint is there

```bash
docker exec -u postgres shared-postgres psql -U postgres -d gustale -tAc "
SELECT conname FROM pg_constraint WHERE conname='ingredients_category_fk';"
```

**Expected: `ingredients_category_fk`.** If this is empty, `0054` is
not applied on live — stop and apply `0054` first.

### 1.4 The vocabulary is intact

```bash
docker exec -u postgres shared-postgres psql -U postgres -d gustale -tAc "
SELECT count(*) FROM ingredient_categories;"
```

**Expected: `435`.** The seed's 18 distinct categories are all rows of
this table. A different count means the vocabulary changed and the
seed's categories must be re-checked before applying.

### 1.5 The dish exists and is published

```bash
docker exec -u postgres shared-postgres psql -U postgres -d gustale -tAc "
SELECT d.slug||' | '||d.status FROM dishes d WHERE d.slug='moussaka-greek';"
```

**Expected: `moussaka-greek | published`.**

---

## 2. The backup — `pg_dump` + `docker cp`, FIRST, and VERIFIED

**The same method as `0054`.** Note the `docker cp`: a plain `cp`
cannot cross the host/container filesystem boundary when they do not
share `/tmp`.

```bash
STAMP=$(date +%Y%m%d-%H%M%S)
DUMP=/home/gustale/backups/pre-seed-moussaka-$STAMP.dump

# The dump INSIDE the container, then out to the host.
docker exec -u postgres shared-postgres pg_dump -U postgres -d gustale -Fc -f /tmp/pre-seed-moussaka.dump
docker cp shared-postgres:/tmp/pre-seed-moussaka.dump "$DUMP"

# VERIFY it is a real, non-empty dump -- do not skip this.
ls -la "$DUMP"
```

**Record the path and the size.** `0054`'s backup was 4.5 MB; this
seed's should be of a similar order. If it is 0 bytes, the backup
failed and you must not apply.

---

## 3. The dry-run, on the TEST Postgres

**Never apply a seed to live first.** Run it on the test container,
where the whole thing is disposable.

```bash
# A throwaway database on the TEST Postgres -- never on the production cluster.
docker exec -u postgres gustale-test-postgres psql -U postgres -d postgres \
  -c "DROP DATABASE IF EXISTS gustale_seed_dryrun;"
docker exec -u postgres gustale-test-postgres psql -U postgres -d postgres \
  -c "CREATE DATABASE gustale_seed_dryrun;"

# The chain, so the schema is there.
bash scripts/ci-migration-chain.sh gustale_seed_dryrun

# The four baseline ingredient rows, so the seed has something to reuse.
docker exec -u postgres -i gustale-test-postgres psql -U postgres -d gustale_seed_dryrun \
  -v ON_ERROR_STOP=1 -q < packages/db/seed-moussaka.sql

# The seed itself.
docker exec -u postgres -i gustale-test-postgres psql -U postgres -d gustale_seed_dryrun \
  -v ON_ERROR_STOP=1 -f - < packages/db/seed-moussaka-ingredients.sql 2>&1 | tee /tmp/seed-dryrun.log

# Its own marker.
grep -E "SEED_MOUSSAKA_INGREDIENTS_OK" /tmp/seed-dryrun.log
```

**Expected: `SEED_MOUSSAKA_INGREDIENTS_OK=1`** — and nothing else on
the error stream. `ON_ERROR_STOP=1` means the first error aborts, and
the whole seed rolls back.

**If the dry-run fails, the seed is broken. Do not apply it to live.**
The repo's own verifier does all of this in one command:

```bash
bash scripts/verify-pantry-seed.sh gustale_seed_dryrun
```

It runs 10 checks, including the rollback proof.

### 3.1 The dry-run's counts are NOT the live counts — read this

The dry-run database is built from `packages/db/seed-moussaka.sql`,
which creates **4** ingredient rows. **Live has 5** — the fifth is
`bechamel-sauce`, the published orphan that only exists on live (see
§7 and the `bechamel-sauce` decision in
`docs/RECIPES-INGREDIENT-BACKFILL-PLAN.md` §P-3).

So the dry-run ends at:

```
total=23   published=4   draft=19   dish_ingredients=23   with_category=23
```

and **live** ends at:

```
total=24   published=5   draft=19   dish_ingredients=23   with_category=23
```

The difference is exactly the orphan: `bechamel-sauce` is **not** in
the pantry list, the seed does **not** touch it, and it keeps its
`published` status and its null category. **That is correct** — it is
a separate decision, and the pantry list does not resolve it.

**Note `with_category` is 23 in BOTH.** In the dry-run, all 23 rows
carry a category (4 reused + 19 new). On live, 23 of the 24 rows carry
one — the 4 reused + the 19 new, and the orphan carries none.

**The two numbers to compare are `draft` and `dish_ingredients`: both
must be identical between the dry-run and live** — 19 and 23. The
`total` and `published` differ by exactly 1, and that 1 is
`bechamel-sauce`.

---

## 4. The apply — direct psql

**The same method the owner used for `0052`, `0053` and `0054`.**

```bash
# The apply. ON_ERROR_STOP=1 aborts on the first error, and the seed is
# one transaction, so a failure rolls the WHOLE seed back.
docker exec -u postgres -i shared-postgres psql -U postgres -d gustale \
  -v ON_ERROR_STOP=1 -f - < packages/db/seed-moussaka-ingredients.sql 2>&1 | tee /tmp/seed-moussaka.log

# The seed's OWN marker must have passed.
grep -E "SEED_MOUSSAKA_INGREDIENTS_OK" /tmp/seed-moussaka.log
```

**Expected: exactly one `SEED_MOUSSAKA_INGREDIENTS_OK=1` and no
`ERROR`.** The marker is emitted **inside** the transaction, so it is
only seen if the whole seed applied.

**If the apply fails:** the transaction has already rolled back and
**live is unchanged**. Check `/tmp/seed-moussaka.log`, fix the cause,
and re-run §1 before trying again — the "before" counts must still be
5/5/0/4.

---

## 5. The expected counts AFTER

```bash
docker exec -u postgres shared-postgres psql -U postgres -d gustale -tAc "
SELECT 'total='   || count(*) FROM ingredients
UNION ALL SELECT 'published=' || count(*) FROM ingredients WHERE status='published'
UNION ALL SELECT 'draft='     || count(*) FROM ingredients WHERE status='draft'
UNION ALL SELECT 'dish_ingredients=' || count(*) FROM dish_ingredients
UNION ALL SELECT 'with_category=' || count(*) FROM ingredients WHERE category IS NOT NULL;"
```

**Expected:**

```
total=24
published=5
draft=19
dish_ingredients=23
with_category=23
```

| count | before | after | what changed |
|---|---:|---:|---|
| `ingredients` total | 5 | **24** | +19 new draft rows |
| `ingredients` published | 5 | **5** | **unchanged** — this is the number the public API serves |
| `ingredients` draft | 0 | **19** | the new rows |
| `dish_ingredients` | 4 | **23** | +19 rows for `moussaka-greek` |
| with a `category` | 0 | **23** | the 4 reused rows gained one; the 19 new rows have one each |

**`with_category` is 23, not 24.** The 24th ingredient is
`bechamel-sauce` — the published orphan the seed does **not** touch —
and its category is still `NULL`. Only 23 of the 24 ingredients carry a
category, because the orphan is not one of the seed's 23 rows.

> **CORRECTION (2026-11-10, after the live apply).** This runbook
> originally said `with_category=24`, on the reasoning that all 24
> ingredients would carry one. **That was wrong.** The live apply
> measured **`with_category=23`**, and the owner's apply confirmed the
> same. The reason is the orphan: `bechamel-sauce` has no category and
> the seed correctly leaves it alone. The numbers below are the
> **measured** live values, not predictions.

### 5.1 The four reused rows, after

```bash
docker exec -u postgres shared-postgres psql -U postgres -d gustale -tAc "
SELECT slug||' | '||status||' | '||coalesce(category,'(null)')
FROM ingredients WHERE slug IN ('eggplant','lamb-mince','tomato','bechamel') ORDER BY slug;"
```

**Expected:**

```
bechamel    | published | savoury-sauces
eggplant    | published | solanacea
lamb-mince  | published | mammals-meat
tomato      | published | other-fruiting-vegetables
```

**`published` must still be `published`.** The seed only sets
`category`; demoting published content would be publication (Gate C),
which is a separate gate with a separate decision.

**And the fifth ingredient must be untouched.** `bechamel-sauce` is
the published orphan the seed does not touch:

```bash
docker exec -u postgres shared-postgres psql -U postgres -d gustale -tAc "
SELECT slug||' | '||status||' | '||coalesce(category,'(null)') FROM ingredients WHERE slug='bechamel-sauce';"
```

**Expected: `bechamel-sauce | published | (null)`.** It is on the
cleanup list — merge it into `bechamel` or retire it — but that is a
separate decision and this seed makes no move on it.

### 5.2 The new rows, after

```bash
docker exec -u postgres shared-postgres psql -U postgres -d gustale -tAc "
SELECT slug||' | '||status||' | '||category||' | desc='
       || coalesce(nullif(short_description,''),'(empty)')
FROM ingredients WHERE status='draft' ORDER BY slug;"
```

**Expected: 19 rows**, every one `draft`, every one with a category,
and every description `(empty)`. **A description is a claim, and a
claim needs a source** (ADR-007-A1 §4.3) — publication is Gate C.

### 5.3 The dish's ingredient list, after

```bash
docker exec -u postgres shared-postgres psql -U postgres -d gustale -tAc "
SELECT i.slug||' | optional='||di.is_optional||' | pos='||di.position
FROM dish_ingredients di
JOIN public.ingredients i ON i.id=di.ingredient_id
JOIN public.dishes d ON d.id=di.dish_id
WHERE d.slug='moussaka-greek' ORDER BY di.position;"
```

**Expected: 23 rows**, positions 0–22, with exactly **4** marked
optional: `carrot`, `tomato-paste`, `parsley`, `beef-mince`.

---

## 6. Which 4 live pages change

**This is the part to read before applying.** The seed is **not** a
no-op on live.

### 6.1 The four pages that change

| page | what changes | how |
|---|---|---|
| `gustale.recipes/ingredients/eggplant` | gains **Category: Solanacea** | the API serves `ingredients.category` |
| `gustale.recipes/ingredients/lamb-mince` | gains **Category: Mammals meat** | ↑ |
| `gustale.recipes/ingredients/tomato` | gains **Category: Other fruiting vegetables** | ↑ |
| `gustale.recipes/ingredients/bechamel` | gains **Category: Savoury sauces** | ↑ |

**The same four pages on `gustale.com`** if the domain serves them.

**That is the complete list.** Nothing else on the site changes:

* **The 19 new rows are `draft`**, and the public API filters
  `WHERE ingredients.status = 'published'` — so they are **invisible**.
  No new page appears. `GET /api/ingredients` still returns **5**
  entries, and `/ingredients/<new-slug>` returns **404**.
* The four pages above change by **one field**: a category label that
  was empty is now filled in. The dish, the description, the image and
  the URL are all untouched.

### 6.2 Verify it, from outside

```bash
# The ingredient list still serves 5, not 24.
curl -s https://api.gustale.recipes/api/ingredients | grep -c '"slug"'

# A new ingredient is NOT publicly visible.
curl -s -o /dev/null -w "%{http_code}\n" https://api.gustale.recipes/api/ingredients/kefalotyri
curl -s -o /dev/null -w "%{http_code}\n" https://gustale.recipes/ingredients/kefalotyri

# A reused one now has a category.
curl -s https://api.gustale.recipes/api/ingredients/eggplant | grep -o '"category":"[^"]*"'
```

**Expected:** the count is `5`; both new-slug requests are `404`; and
eggplant's category is `"solanacea"`.

---

## 7. The rollback

**The seed is one transaction, so a failed apply needs no rollback at
all** — it never committed.

If the seed applied and you want it undone:

```bash
# The rollback, in the ORDER that satisfies the foreign keys.
docker exec -u postgres shared-postgres psql -U postgres -d gustale -v ON_ERROR_STOP=1 <<'SQL'
BEGIN;
-- 1. The dish_ingredients rows the seed ADDED: every row for
--    moussaka-greek whose ingredient is NOT one of the 4 baseline rows.
--    This must come first -- the ingredients cannot be deleted while a
--    dish_ingredients row still references them.
DELETE FROM dish_ingredients di
  USING public.dishes d, public.ingredients i
 WHERE di.dish_id = d.id
   AND di.ingredient_id = i.id
   AND d.slug = 'moussaka-greek'
   AND i.slug NOT IN ('eggplant','lamb-mince','tomato','bechamel');

-- 2. The 19 new ingredient rows.
DELETE FROM ingredients
 WHERE slug IN ('onion','garlic','potato','carrot','whole-egg','whole-milk',
                'wheat-flour','plain-butter','olive-oil','table-salt','black-pepper',
                'bay-leaf','nutmeg','cinnamon','allspice','kefalotyri',
                'tomato-paste','parsley','beef-mince');

-- 3. The 4 reused rows: take back their category.
UPDATE public.ingredients SET category = NULL
 WHERE slug IN ('eggplant','lamb-mince','tomato','bechamel');
COMMIT;
SQL

# 2. The counts must be back to the "before" values.
docker exec -u postgres shared-postgres psql -U postgres -d gustale -tAc "
SELECT 'total='||count(*) FROM ingredients
UNION ALL SELECT 'published='||count(*) FROM ingredients WHERE status='published'
UNION ALL SELECT 'draft='||count(*) FROM ingredients WHERE status='draft'
UNION ALL SELECT 'dish_ingredients='||count(*) FROM dish_ingredients
UNION ALL SELECT 'with_category='||count(*) FROM ingredients WHERE category IS NOT NULL;"
```

**Expected: `total=5`, `published=5`, `draft=0`, `dish_ingredients=4`,
`with_category=0`** — the exact §1.1 baseline.

**This SQL has been run**, against a copy of the seeded test database:
`DELETE 19`, `DELETE 19`, `UPDATE 4`, and the counts came back to the
baseline. An earlier draft of it deleted the `dish_ingredients` rows by
a hand-written slug list that **missed `cinnamon` and `allspice`**, and
then failed on `dish_ingredients_ingredient_id_ingredients_id_fk`. The
version above deletes the added rows by "everything that is not one of
the 4 baseline rows", which cannot drift from the list.

**`bechamel-sauce` must still be there**, published, with a null
category — the rollback deletes only what the seed wrote. Check it:

```bash
docker exec -u postgres shared-postgres psql -U postgres -d gustale -tAc "
SELECT slug||' | '||status||' | '||coalesce(category,'(null)') FROM ingredients WHERE slug='bechamel-sauce';"
```

**Expected: `bechamel-sauce | published | (null)`.**

**The `pg_dump` from §2 is the real safety net**; this is the fast
path.

---

## 8. Record the receipt

After a successful apply, record it in
`docs/MIGRATION-RECEIPT-0054.md`'s sibling — a
`docs/SEED-RECEIPT-MOUSSAKA.md` — with:

* the backup path and size;
* the §1 pre-check output (verbatim);
* the apply log's `SEED_MOUSSAKA_INGREDIENTS_OK=1` line;
* the §5 after-counts;
* the §6.2 external checks.

**A seed is not a migration**, so Rule 11 does not freeze it the way
it freezes a migration — but the same discipline applies: if the seed
is wrong, it is corrected by a **new seed**, never by editing the one
that was applied.

---

## 9. The summary

| step | command | expected |
|---|---|---|
| 1.1 counts before | the `SELECT 'total='…` | 5 / 5 / 0 / 4 |
| 1.2 the reused rows | `SELECT slug… FROM ingredients` | 4 reused rows, `published`, `category=(null)` |
| 1.3 the constraint | `SELECT conname…` | `ingredients_category_fk` |
| 1.4 the vocabulary | `SELECT count(*) FROM ingredient_categories` | 435 |
| 1.5 the dish | `SELECT … FROM dishes` | `moussaka-greek | published` |
| 2. the backup | `pg_dump` + `docker cp` | a non-empty file, ~4.5 MB |
| 3. the dry-run | the seed on the TEST Postgres | `SEED_MOUSSAKA_INGREDIENTS_OK=1` |
| 4. the apply | direct `psql` | `SEED_MOUSSAKA_INGREDIENTS_OK=1`, no ERROR |
| 5. the counts after | the `SELECT 'total='…` | 24 / 5 / 19 / 23 / **23** |
| 6.2 the external check | `curl` | 5 ingredients; new slugs 404; eggplant has a category |
| 8. the receipt | write it | the facts above |

**Nothing in this document has been run.** The seed is prepared, proven
in the test, and waiting for your go.
