# Applying migration `0053` to live — the owner's checklist

**Status:** NOT APPLIED. `0052` is applied; `0053` is not.
**Prepared:** 2026-11-09 · **Owner:** Alejandro · **Agent:** Hermes

> **Do not run any of this from the agent.** Rule 1: no live database
> write without the owner's explicit go, per operation. These commands
> are for **you**, on the VPS, at the moment the API needs the view.

---

## What `0053` is

`db/migrations/0053_recipes_published_view.sql` — **item 4** of the
recipes task.

It creates **one view** and **six indexes**:

| object | on | why |
|---|---|---|
| `recipe_published` | — | the API's read model: a recipe is published because its **statements** are published |
| `recipes_slug_idx` | `recipes` | the lookup by slug |
| `recipes_dish_status_idx` | `recipes` | the hub: a dish's recipes |
| `recipe_sentences_recipe_idx` | `recipe_sentences` | the view's `EXISTS` and `published_at` subquery |
| `recipe_claims_sentence_idx` | `recipe_claims` | the link between a sentence and its claim |
| `recipe_publish_log_recipe_idx` | `recipe_publish_log` | the feed, newest first |
| `statements_subject_idx_recipe` | `statements` | the scope clause's predicate |

**It alters and drops nothing existing. It writes no content rows.**

### Why it exists

`0052`'s `recipe_publishable` view requires `r.status = 'published'` —
but **nothing ever sets it**. `recipe_auto_publish()` publishes the
recipe's *statements* and never writes `recipes.status`, and the API
must not either (the API never publishes). So `recipe_publishable` is a
view over a column no code path writes, and it is empty forever.

`0053` splits the two facts apart:

- `recipes.status` / `review_state` — the **editorial** state, set by a
  human through the review queue. Stored, unchanged.
- **publishedness** — whether the recipe's own content is live to a
  reader. That is a fact about the statements, and it was never stored.

`0053` stores the second one as a **derived view**, so it cannot drift
from the statements it is derived from.

### The scope clause — the part that matters

A recipe is published when **all** of these hold:

1. the dish is published;
2. the recipe has at least one sentence;
3. **every** sentence carries a claim whose statement is at `verified`
   or `published`;
4. **every one of those statements is about THIS recipe** —
   `st.subject_type = 'recipe' AND st.subject_id = r.id`.

Condition 4 is the scope clause. `statements` is shared with the Atlas,
so without it an Atlas statement could make a recipe look published —
the exact exploit the `0052` proof reproduces. The trigger on
`recipe_claims` refuses the bad **link**, but a view must not depend on
a trigger being present (a superuser, `session_replication_role =
replica`, or a later migration can drop one). **The view carries the
rule itself.**

---

## 0. Before you start

**`0053` reads `0052`'s tables.** It cannot be applied before `0052`
is. `0052` **is** applied (2026-11-09), so this step is a confirmation,
not a gate:

```bash
cd <the repo>
git fetch origin && git checkout main && git log --oneline -1

# The recipe tables must exist.
docker exec -u postgres shared-postgres psql -U postgres -d gustale -tAc "
SELECT count(*) FROM information_schema.tables
 WHERE table_schema='public' AND table_name LIKE 'recipe%';"
```

**Expected: 10** (`recipes`, `recipe_ingredients`, `recipe_sentences`,
`recipe_claims`, `recipe_translations`, `service_accounts`,
`recipe_auto_publish_token`, `recipe_settings`, `recipe_confidence`,
`recipe_publish_log`).

**Confirm `0053` has not already been applied:**

```bash
docker exec -u postgres shared-postgres psql -U postgres -d gustale -tAc "
SELECT count(*) FROM information_schema.views
 WHERE table_schema='public' AND table_name='recipe_published';"
```

`0` is what you want.

---

## 1. The backup — `pg_dump` + `docker cp`, FIRST, and VERIFIED

**Same method as the `0052` backup. `docker cp`, not `cp`.**

```bash
STAMP=$(date '+%Y%m%d-%H%M%S')
DUMP="/home/gustale/backups/pre-0053-${STAMP}.dump"

# The dump is written INSIDE the production container -- that is where
# pg_dump lives; the host has no pg_dump binary.
docker exec -u postgres shared-postgres \
  pg_dump -U postgres -d gustale --format=custom --file=/tmp/pre-0053.dump

# `docker cp` moves it OUT. The host and the container do NOT share
# /tmp, so a plain `cp /tmp/pre-0053.dump "$DUMP"` on the host FAILS
# with "cannot stat" -- there is no such file on the host.
docker cp shared-postgres:/tmp/pre-0053.dump "$DUMP"

ls -la "$DUMP"

# Verify the archive is readable and complete BEFORE applying anything.
docker exec -u postgres shared-postgres \
  pg_restore --list /tmp/pre-0053.dump | wc -l
```

**Do not proceed if the dump is empty, or if `pg_restore --list` errors.**

> The `0052` backup is at
> `/home/gustale/backups/pre-0052-20261109-090734.dump` (4.4 MB, 1,526
> TOC entries). This one is a **new** dump — `0052` has changed the
> schema since that one was taken.

---

## 2. The dry-run on the test Postgres

**On the test Postgres, never on production.** `0053` is additive and
writes no content rows, so the dry-run's job is to prove the view
compiles and its proof passes.

```bash
bash scripts/dryrun-migration.sh db/migrations/0053_recipes_published_view.sql gustale_0053_dryrun
```

**What you are looking for:**

- the apply succeeds;
- the second apply also succeeds (**idempotent**);
- `RECIPES_PUBLISHED_VIEW_OK=1` is in the output — that is the
  migration's **own** proof, and it runs inside the migration's
  transaction;
- the recipe tables are still **empty** afterwards.

> **The dry-run needs the test Postgres running.** On this host it is
> `gustale-test-postgres` on `127.0.0.1:5434`; start it with
> `bash scripts/lib/test_pg.sh up`.

**If the dry-run fails: stop.** Do not apply to live.

---

## 3. The apply — direct psql

**The same method the owner used for `0052`.** The gate script
(`scripts/apply-migration-live.sh`) is being fixed in a separate PR;
until that lands, use the direct method.

```bash
# The apply. ON_ERROR_STOP=1 aborts on the first error, and 0053 is
# transactional, so a failure rolls the whole migration back.
docker exec -u postgres -i shared-postgres psql -U postgres -d gustale \
  -v ON_ERROR_STOP=1 -f - < db/migrations/0053_recipes_published_view.sql 2>&1 | tee /tmp/m0053.log

# The migration's OWN proof must have passed.
grep -E "RECIPES_PUBLISHED_VIEW_OK|CONFIRMED" /tmp/m0053.log | tail -5
```

**`0053`'s proof is not the `0052` proof.** `0052`'s scope triggers are
already on live and already proven — `0053` does not replace them. What
`0053` proves is its **own** thing: that the view's scope clause
refuses an Atlas statement even when the trigger is disabled. Read the
`CONFIRMED:` lines.

---

## 4. Verify `0053` specifically

### 4.1 The view exists

```bash
docker exec -u postgres shared-postgres psql -U postgres -d gustale -c "
SELECT table_name FROM information_schema.views
 WHERE table_schema='public' AND table_name='recipe_published';"
```

**Expected: one row, `recipe_published`.**

### 4.2 The scope clause is IN the view — not just in a trigger

```bash
docker exec -u postgres shared-postgres psql -U postgres -d gustale -tAc "
SELECT pg_get_viewdef('public.recipe_published'::regclass, true);" | grep -c "subject_type"
```

**Expected: ≥ 1.** The view must carry `subject_type = 'recipe'` and
`subject_id = r.id` itself. If the view only relied on the trigger,
dropping the trigger would open the hole — and the view is what the API
reads.

### 4.3 The indexes exist

```bash
docker exec -u postgres shared-postgres psql -U postgres -d gustale -c "
SELECT indexname FROM pg_indexes
 WHERE schemaname='public' AND indexname IN (
   'recipes_slug_idx','recipes_dish_status_idx','recipe_sentences_recipe_idx',
   'recipe_claims_sentence_idx','recipe_publish_log_recipe_idx',
   'statements_subject_idx_recipe')
 ORDER BY 1;"
```

**Expected: six rows.**

### 4.4 The view is empty — and that is correct

```bash
docker exec -u postgres shared-postgres psql -U postgres -d gustale -tAc "
SELECT count(*) FROM recipe_published;"
```

**Expected: `0`.** There are no recipes on live, so the view is empty.
That is the honest state, not a failure.

### 4.5 `0052`'s state is untouched

`0053` changed nothing that existed. Confirm:

```bash
docker exec -u postgres shared-postgres psql -U postgres -d gustale -c "
SELECT 'recipes' t, count(*) FROM recipes
UNION ALL SELECT 'recipe_claims', count(*) FROM recipe_claims
UNION ALL SELECT 'recipe_sentences', count(*) FROM recipe_sentences
UNION ALL SELECT 'recipe_confidence', count(*) FROM recipe_confidence
UNION ALL SELECT 'recipe_publish_log', count(*) FROM recipe_publish_log
UNION ALL SELECT 'recipe_auto_publish_token', count(*) FROM recipe_auto_publish_token
UNION ALL SELECT 'statements', count(*) FROM statements;"
```

**Expected:** every recipe table is **0**, and `statements` is
**1354** — unchanged by `0053`.

### 4.6 The kill switch is still off

```bash
docker exec -u postgres shared-postgres psql -U postgres -d gustale -c "
SELECT auto_publish_enabled, auto_publish_mode FROM recipe_settings;"
```

**Expected:** `false`, `disabled`. `0053` does not touch it, but the
auto-publish path must stay dormant.

### 4.7 The scope triggers are still there

```bash
docker exec -u postgres shared-postgres psql -U postgres -d gustale -c "
SELECT tgname FROM pg_trigger
 WHERE tgname IN ('recipe_claims_subject_trg','recipe_claims_statement_guard_trg')
   AND NOT tgisinternal;"
```

**Expected: two rows.** `0053` does not touch them, but they are the
database-level enforcement of the scope rule and they must survive.

### 4.8 The API answers

```bash
curl -s -o /dev/null -w "health=%{http_code}\n" https://api.gustale.com/health
```

**Expected: `200`.** The API is deployed from `main`, so it only reads
the new view once `0053` is live AND the API image is rebuilt. If the
API routes read `recipe_published` and the view does not exist yet,
they return **500** — which is why `0053` must be applied before, or
with, the API deploy.

---

## 5. Record the receipt

Append the `0053` section to `docs/MIGRATION-RECEIPT-0052.md` (or a
new `docs/MIGRATION-RECEIPT-0053.md`), with: the sha applied, the date,
the dump path, the counts read back, and the §4 results. Commit and
push it.

**After this, `0053`'s file is FROZEN** — Rule 11.

---

## 6. The rollback

`0053` is additive and writes no content rows, so the rollback is a
drop of what it created:

```bash
# A FRESH dump first.
STAMP=$(date '+%Y%m%d-%H%M%S')
DUMP="/home/gustale/backups/pre-0053-rollback-${STAMP}.dump"
docker exec -u postgres shared-postgres \
  pg_dump -U postgres -d gustale --format=custom --file=/tmp/pre-0053-rollback.dump
docker cp shared-postgres:/tmp/pre-0053-rollback.dump "$DUMP"
ls -la "$DUMP"
docker exec -u postgres shared-postgres \
  pg_restore --list /tmp/pre-0053-rollback.dump | wc -l

# Then, in one transaction:
docker exec -u postgres -i shared-postgres psql -U postgres -d gustale -v ON_ERROR_STOP=1 <<'SQL'
BEGIN;
DROP VIEW IF EXISTS public.recipe_published;
DROP INDEX IF EXISTS public.recipes_slug_idx;
DROP INDEX IF EXISTS public.recipes_dish_status_idx;
DROP INDEX IF EXISTS public.recipe_sentences_recipe_idx;
DROP INDEX IF EXISTS public.recipe_claims_sentence_idx;
DROP INDEX IF EXISTS public.recipe_publish_log_recipe_idx;
DROP INDEX IF EXISTS public.statements_subject_idx_recipe;
COMMIT;
SQL
```

**Verify:**

```bash
docker exec -u postgres shared-postgres psql -U postgres -d gustale -tAc "
SELECT count(*) FROM information_schema.views
 WHERE table_schema='public' AND table_name='recipe_published';"
# expected: 0
```

> `DROP INDEX` on `statements_subject_idx_recipe` is a normal index
> drop on a live table — it takes a brief `ACCESS EXCLUSIVE` lock on
> `statements` (1,354 rows). It is quick, but take the dump first.

---

## 7. The summary

| step | what | if it fails |
|---|---|---|
| 0 | confirm `0052` is applied (10 recipe tables); confirm `0053` is not | **stop** — do not apply |
| 1 | `pg_dump` + `docker cp` to `/home/gustale/backups/pre-0053-<stamp>.dump`, verified | **stop** — no verified dump, no apply |
| 2 | `dryrun-migration.sh` on the test Postgres | **stop** — do not apply to live |
| 3 | the apply — direct psql, `ON_ERROR_STOP=1` | transactional; auto-rollback |
| 4 | the `0053`-specific verification queries | report; do not "fix" live by hand |
| 5 | the receipt, committed and pushed | — |
| 6 | the rollback, if needed | drop the view and the six indexes |

**Nothing in this document has been run.** It was written from the
migration's contents and the sandbox proof, which is in
`docs/MIGRATION-RECEIPT-0052.md` — the chain passed with `0053` applied
(`RECIPES_PUBLISHED_VIEW_OK=1`, `FULL_CI_CHAIN_OK=1`) and the API suite
was 200 passed / 3 skipped / 0 failed against a database built with
`0053`.
