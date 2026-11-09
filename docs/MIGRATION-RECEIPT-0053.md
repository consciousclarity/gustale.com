# Migration receipt — 0053, the published-recipe view (item 4)

**Date:** 2026-11-09 (sandbox proof) · **2026-11-09 (applied to live)**
**Status:** **APPLIED TO LIVE** — 2026-11-09
**Migration:** `db/migrations/0053_recipes_published_view.sql`
**Item:** item 4 — the recipes API's read model
**PR:** #207 (`feat/recipes-item4-api-drizzle`, merged as `492282c`)
**Predecessor:** `0052` (the recipes schema) — **applied to live 2026-11-09**
**Receipt for `0052`:** [`docs/MIGRATION-RECEIPT-0052.md`](MIGRATION-RECEIPT-0052.md)

> **`0053` is now FROZEN** (Rule 11: an applied migration is immutable).
> Any fix goes into a **new** migration number, never into this file.

---

## 0. The live apply, in brief

**Performed by the owner**, directly with `psql`, under Rule 1. This agent
did not write to live and did not SSH to the VPS.

| step | result |
|---|---|
| the backup | `/home/gustale/backups/pre-0053-20261109-105116.dump` (4.5 MB) |
| the apply | `RC=0` |
| the migration's own proof | `RECIPES_PUBLISHED_VIEW_OK=1` |
| the view on live | `recipe_published` — **0 rows** |
| the indexes on live | **all six present** |
| the publish path | **still off** — `mode=disabled`, `enabled=false` |
| the deploy | live — `gustale-api` runs `492282c` |
| the live API | `GET /api/recipes/settings` → `{"mode":"disabled","enabled":false,"dailyCap":20}` |

**The apply method** is the same direct-`psql` method the owner used for
`0052`, and for the same reason: `scripts/apply-migration-live.sh` used to
create and drop its copy of the live database **on the production cluster**,
which RULES.md forbids. That script is fixed in **PR #209** — its copy now
runs on the dedicated test Postgres. The checklist for this apply is
[`docs/LIVE-APPLY-0053.md`](LIVE-APPLY-0053.md).

---

## 1. What the migration does

**One view and six indexes. It alters and drops nothing. It writes no
content rows.**

### 1.1 The view — `public.recipe_published`

The migration exists because of a real contradiction in `0052`.

ADR-007-A1 §8.4 says the auto-publish function *"does not update
`recipes.status` directly. The recipe becomes published because its
STATEMENTS are published."* That is right, and it is what `0052`
implements: `recipe_auto_publish()` transitions the recipe's **statements**
through `statement_set_status()`, and it never writes `recipes.status`.

But `0052` also created a `recipe_publishable` view whose predicate required
`r.status = 'published'`. **Nothing ever sets `recipes.status` to
`'published'`.** The auto-publish function does not, and the API must not —
the API never publishes. So `recipe_publishable` was a view over a column
that no code path writes, and it was empty forever.

There are **two different facts**, and only one of them was stored:

- the recipe's **editorial state** (`recipes.status`, `review_state`) — what a
  human sets through the review queue. Real, and stored.
- the recipe's **publishedness** — whether the recipe's own content is
  published. Real, and **derivable**.

`0053` makes publishedness **derived** instead of stored.

The view's predicate, in order:

1. the dish is published (`d.status = 'published'`);
2. the recipe is not archived and not rejected — the **editorial** state is
   honoured, and it is not what makes the recipe live;
3. the recipe has **at least one sentence**;
4. **every** sentence has a statement that is `verified` or `published`, and
   that statement is **about this recipe** — `subject_type = 'recipe'` AND
   `subject_id = r.id`.

Condition 4's scope clause is the important one. It is the same rule
`0052` enforces in the database, restated in the read model: **an Atlas
statement can never make a recipe look published.** The view does not depend
on a trigger being present to be safe.

### 1.2 The six indexes

| index | on | for |
|---|---|---|
| `recipes_slug_idx` | `recipes (slug)` | one recipe by slug |
| `recipes_dish_status_idx` | `recipes (dish_id, status)` | the hub — a dish's recipes |
| `recipe_sentences_recipe_idx` | `recipe_sentences (recipe_id)` | the view's `EXISTS` and its `published_at` subquery |
| `recipe_claims_sentence_idx` | `recipe_claims (recipe_sentence_id)` | the link between sentences and statements |
| `recipe_publish_log_recipe_idx` | `recipe_publish_log (recipe_id)` | the publish feed |
| `statements_subject_idx_recipe` | `statements (subject_type, subject_id) WHERE subject_type = 'recipe'` | the scope clause's lookups |

**Five of the six are on tables `0052` created** — they are new objects, not
changes to anything. **One is on an existing table**: `statements`.

### 1.3 The lock cost on live

`statements_subject_idx_recipe` is an ordinary `CREATE INDEX` on the
existing `statements` table, inside the migration's transaction. It takes a
write lock on `statements` for the duration of the build.

**Measured, not guessed:** on a synthetic table of exactly live's size
(**1,354 rows** — the live row count), the identical index builds in
**27 ms**. Negligible.

The alternative would have been `CREATE INDEX CONCURRENTLY`, which cannot run
inside a transaction — and an unwrapped migration is what Rule 8a forbids.
**A 27 ms lock is the right trade.** The decision and the measurement are
recorded here so the trade is visible to whoever reads this next.

---

## 2. The proof

The migration carries its own proof, **inside its transaction**, so a failed
assertion rolls back the whole thing — schema and proof together.

| # | the case | what it establishes |
|---|---|---|
| 1 | a recipe with its own published statement **IS** published | the control — the happy path works |
| 2 | a recipe whose statement is a draft is **NOT** published | the view is not trivially true |
| 3 | an Atlas statement **cannot** make a recipe look published | the scope clause holds **in the read model**, not only in the triggers |
| 4 | a **rejected** recipe is not published | the editorial state is honoured |
| 5 | an **archived** recipe is not published | the editorial state is honoured |
| 6 | the confidence is `NULL` for a recipe that never went through the publish path | the view does not invent a level |
| 7 | the view reports the **computed** confidence | the level comes from `recipe_confidence`, not from a column |
| 8 | the migration left **no content rows** behind | the proof cleaned up after itself |
| — | `RECIPES_PUBLISHED_VIEW_OK=1` | the proof's own marker |

**Case 3 is the one that matters most.** The shared-`statements` hole that
`0052` was fixed for (PR #203) was a **security** hole: an Atlas statement
behind a recipe claim would be auto-published. `0053` re-proves the same
property in a second, independent place — the **view** — so a future
migration that weakens the triggers but leaves the view alone is still safe.

**On live, the proof's marker is `RECIPES_PUBLISHED_VIEW_OK=1` and the view
has 0 rows.** Zero rows is the correct state: no recipe has been published,
because the publish path is off and nothing has been drafted.

---

## 3. What is live right now

The deploy that carried `0053` is live: **`gustale-api` runs `492282c`**.

```
GET /api/recipes/settings
{"mode":"disabled","enabled":false,"dailyCap":20}
```

**The kill switch is off.** This is the state ADR-007-A1 §8.4 asks for: the
machinery exists, it is proven, and it is not publishing anything.

`recipe_published` has **0 rows**, so every recipe route returns its empty
state. That is why item 5's empty state — *"No recipe yet"*, a link to the
Atlas, `noindex` — is the deliverable that matters **right now**. The API is
live and correct; there is simply nothing published to show yet.

---

## 4. The dependency that had to be honoured

**`0053` reads `0052`'s tables** — `recipes`, `recipe_sentences`,
`recipe_claims`, `recipe_confidence`, `recipe_publish_log`. It could not have
been applied before `0052`.

`0052` was applied to live on 2026-11-09 by the owner, and `0053` the same
day. The order was: `0052` → `0053` → merge #207 → deploy. **`0053` must
never be applied to a database that does not have `0052`.**

---

## 5. What this migration does NOT do

- It does **not** publish anything. The view has 0 rows and the kill switch
  is `disabled`.
- It does **not** write content rows of any kind.
- It does **not** alter or drop any existing object. Five of its six indexes
  are on tables `0052` created; the sixth is a new index on `statements`.
- It does **not** change `recipes.status`. The API never writes that column —
  it is the editorial state, and a human sets it.
- It does **not** replace `recipe_publishable` from `0052`. That view is
  still there, still empty, and still correct about the *editorial* state.
  `0053` adds the *derived* publishedness beside it. **Neither file is
  edited** — `0052` is frozen, and `0053` is now frozen too.
- It does **not** touch the Drizzle schema. The view and the indexes are
  read-model objects; `packages/db/src/schema/` is the write model, and
  PR #207's schema work is unchanged by this migration.

---

## 6. The open item: `db/schema.sql`

`CLAUDE.md` says the schema lives in **two places**:
`packages/db/src/schema/index.ts` **and** `db/schema.sql`.

**`db/schema.sql` does not exist in the repository.** It has never been
committed (`git log --all -- db/schema.sql` is empty), and it is not in
`main`. It is described in the runbook as *a dump of the LIVE schema* — a
snapshot of the production database, regenerated from live after a live
apply.

So it is **not** a second source to keep in sync by hand; it is a
**regenerated artifact**, and after `0053` it is out of date. The exact
read-only command for the owner to regenerate it is in
[`docs/LIVE-APPLY-0053.md`](LIVE-APPLY-0053.md) §6.

**It was not faked by hand.** A hand-written snapshot would drift from the
database it claims to describe, and it would be a file nobody can verify.

---

## 7. The verification, in one table

| check | result |
|---|---|
| the apply | `RC=0` |
| the migration's own proof | `RECIPES_PUBLISHED_VIEW_OK=1` |
| the view on live | `recipe_published` — 0 rows |
| the indexes on live | all six present |
| the publish path | off — `{"mode":"disabled","enabled":false,"dailyCap":20}` |
| the deploy | `gustale-api` runs `492282c` |
| the backup | `/home/gustale/backups/pre-0053-20261109-105116.dump` (4.5 MB) |
| the lock cost on `statements` | 27 ms, measured on a live-sized table |
| the transaction | `BEGIN` at line 597, `COMMIT` at line 602; the proof is inside |
| `scripts/check-migrations-are-transactional.py` | passes on `0053` |

**No live system was touched by this agent.** The live apply was the owner's;
the verification above is read-only.
