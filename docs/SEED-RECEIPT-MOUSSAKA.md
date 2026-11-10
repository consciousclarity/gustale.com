# SEED RECEIPT — `seed-moussaka-ingredients.sql`

**Applied to live: 2026-11-10 15:44:42 WITA, by the owner, by direct
`psql`.** (Rule 1: the owner applies live changes. This agent did not
connect to the live database to write, and did not apply it.)
**Status: APPLIED.**

This receipt records the Stage B seed — the first application of the
moussaka ingredient backfill — and the one place where the runbook's
predicted numbers were wrong.

---

## What was applied

`packages/db/seed-moussaka-ingredients.sql` — **Stage B** of the
ingredient backfill, from PR #217.

| | |
|---|---|
| **the list** | `docs/PANTRY-LIST-moussaka-greek.csv` — 23 rows, 19 new, 4 reused, 4 optional |
| **the seed** | 19 INSERTs, 4 UPDATEs, 23 `dish_ingredients` rows — **one transaction** |
| **the marker** | `SEED_MOUSSAKA_INGREDIENTS_OK=1` |
| **the runbook** | `docs/LIVE-APPLY-SEED-MOUSSAKA.md` |
| **the receipt for the migration it depends on** | `docs/MIGRATION-RECEIPT-0054.md` |

**It is a SEED, not a migration.** It writes content, not schema.
`0054` is applied and frozen (Rule 11); this seed does not touch any
migration file and needed no new migration number.

---

## The backup

```
/home/gustale/backups/pre-seed-moussaka-20261110-154442.dump   (4.5 MB)
```

Taken **before** the apply, by the owner, with the `pg_dump` +
`docker cp` method (a plain `cp` cannot cross the host/container
boundary when they do not share `/tmp`). The size matches the
`0054` backup — the database did not change size, which is what
expect: the seed adds 23 small rows to a table with 5.

---

## The apply

```bash
docker exec -u postgres -i shared-postgres psql -U postgres -d gustale \
  -v ON_ERROR_STOP=1 -f - < packages/db/seed-moussaka-ingredients.sql
```

| | |
|---|---|
| **RC** | `0` |
| **the seed's own marker** | `SEED_MOUSSAKA_INGREDIENTS_OK=1` |

The marker is emitted **inside** the transaction, so it is only
reachable if the whole seed applied. `RC=0` and the marker together
are the proof.

---

## The counts — before and after

| count | before | after | what changed |
|---|---:|---:|---|
| `ingredients` total | 5 | **24** | +19 new draft rows |
| `ingredients` published | 5 | **5** | **unchanged** — this is what the public API serves |
| `ingredients` draft | 0 | **19** | the new rows |
| `dish_ingredients` | 4 | **23** | +19 rows for `moussaka-greek` |
| with a `category` | 0 | **23** | the 4 reused rows gained one; the 19 new rows have one each |

**`with_category` is 23, not 24.** The 24th ingredient is
`bechamel-sauce` — the published orphan the seed does **not** touch —
and its category is still `NULL`.

### The correction

**The runbook predicted `with_category=24`, and that was wrong.** It
reasoned that all 24 ingredients would carry a category once the seed
ran. The live apply measured **23**, and the owner's apply confirmed
it.

**The reason is the orphan.** `bechamel-sauce` is a published ingredient
that nothing references. It is not one of the seed's 23 rows, so the
seed correctly leaves it exactly as it found it — published, with a
null category. The seed gives categories to the 23 rows it knows about
(4 reused + 19 new) and to no others.

The runbook has been corrected, and the correction is recorded in it so
the next reader does not re-derive it.

### Independently verified, by this agent, read-only

`GET https://api.gustale.recipes/api/ingredients` — **HTTP 200, 5
ingredients**:

| slug | category |
|---|---|
| `bechamel-sauce` | `null` ← **untouched, as it should be** |
| `bechamel` | `savoury-sauces` |
| `eggplant` | `solanacea` |
| `lamb-mince` | `mammals-meat` |
| `tomato` | `other-fruiting-vegetables` |

**The public count is still 5**, not 24 — the 19 new rows are `draft`,
and the API filters `WHERE status = 'published'`. **This is the
property that makes Stage B safe**: it adds the vocabulary for a dish
without publishing anything.

---

## The 4 live pages that changed

| page | what changed |
|---|---|
| `/ingredients/eggplant` | gains **Category: Solanacea** |
| `/ingredients/lamb-mince` | gains **Category: Mammals meat** |
| `/ingredients/tomato` | gains **Category: Other fruiting vegetables** |
| `/ingredients/bechamel` | gains **Category: Savoury sauces** |

One field each, on a page that previously showed it empty. Nothing
else on the site changed: no new page, no dish change, no image change.
The 19 new ingredients have **no** page — they are `draft`, and their
URLs 404.

---

## The `bechamel-sauce` duplicate — on the cleanup list

Live now has **two** béchamel ingredients:

| slug | refs | published | category |
|---|---:|---|---|
| `bechamel` | 1 (`moussaka-greek`, position 3) | yes | `savoury-sauces` |
| `bechamel-sauce` | **0** | yes | `null` |

`bechamel-sauce` is an **orphan**: published, referenced by nothing,
and now the only ingredient with no category — which is exactly why
`with_category` is 23 and not 24.

**The owner's decision is pending: merge it into `bechamel`, or retire
it.** The merge plan is already filed in `TASKS.md` (Backlog, P0):

* keep `bechamel` as the canonical slug;
* add an `ingredient_aliases` table and backfill `bechamel-sauce` into
  it;
* **delete** the orphan row;
* add a `resolveIngredientSlug` helper in `apps/web/src/lib/api.ts` so
  the old URL **301-redirects** instead of 404ing.

**Ingredients canonical-entities work is a P0 dependency on that alias
table and cannot be done in isolation** — so the cleanup is a
prerequisite, not a nice-to-have.

**Until it is done, the duplicate is live and visible**: two béchamel
entries in the public ingredient list, one of them pointing nowhere.

---

## Rule 11 — this seed is not frozen, but the discipline holds

`0054` is a migration and is **frozen**: its file is immutable, and
any correction goes into a new migration number.

This is a **seed**, so the letter of Rule 11 does not apply — a seed
is content, and content is corrected by a new seed. But the same
discipline does: **if this seed turns out to be wrong, it is corrected
by a NEW seed, never by editing the one that was applied.** The file
`packages/db/seed-moussaka-ingredients.sql` is a historical record of
what was applied on 2026-11-10.

---

## What this proves, and what it does not

**Proven:**

* the vocabulary FK (`ingredients_category_fk`, from `0054`) accepts
  every category the pantry list uses — **18 distinct categories, all
  of them rows of the 435-row vocabulary**;
* the seed is **idempotent** — a re-apply changes nothing;
* the seed is **transactional** — a deliberate failure in the test left
  only the 4 pre-existing rows, no trace;
* the new rows are **invisible to the public API** — the public count
  stayed at 5;
* the reused rows were **not demoted** — publication is Gate C, a
  separate gate with a separate decision;
* the 19 new rows carry **no description text** — a description is a
  claim, and a claim needs a source (ADR-007-A1 §4.3).

**Not proven, and still open:**

* **the descriptions.** All 19 rows are empty. That is correct for
  Stage B, and it means the rows are not yet publishable — Gate C
  needs sourced descriptions.
* **the `bechamel-sauce` duplicate.** Still live.
* **the vocabulary gaps.** `docs/VOCABULARY-ADDITIONS.md` — kefalotyri's
  exact class and a wine class — are not added; the vocabulary is
  unchanged at 435.
* **the sub-recipes mechanism.** Still does not exist; it is its own
  backlog item.

---

## Related documents

- `docs/MIGRATION-RECEIPT-0054.md` — the migration this seed depends on
- `docs/LIVE-APPLY-SEED-MOUSSAKA.md` — the runbook, with the correction
- `docs/PANTRY-LIST-moussaka-greek.md` — the approved list and its reasoning
- `docs/PANTRY-LIST-moussaka-greek.csv` — the list, machine-readable
- `docs/VOCABULARY-ADDITIONS.md` — the classes the vocabulary is missing
- `packages/db/seed-moussaka-ingredients.sql` — the seed, as applied
- `scripts/verify-pantry-seed.sh` — the 10-check verifier
- `scripts/check_pantry_list.py` — the list checker (mutation-tested)
