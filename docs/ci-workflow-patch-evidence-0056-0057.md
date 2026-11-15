# Evidence: the 0056/0057 workflow patch makes the chain validator pass

PR #219 carries two new migrations — `0056_ingredient_aliases.sql` and
`0057_ingredients_sourcing_vocabulary.sql` — and the App that pushes the
branch cannot change `.github/workflows/`. So the two migration steps ship
as a patch, `docs/ci-ingredient-aliases-0056-0057.patch`.

This file records the evidence that applying the patch makes the failing
step pass, so the owner is not asked to take it on faith.

## What fails without the patch

The CI job **"Lint + typecheck"** runs, as its first step after the
safety gates:

```
python3 scripts/validate-ci-migration-chain.py
```

That script checks that the **three** migration lists apply the **same**
migrations:

| file | the database it builds |
| --- | --- |
| `.github/workflows/ci.yml` | the CI database |
| `scripts/ci-migration-chain.sh` | the Nightly database |
| `scripts/repro-ci-db.sh` | the local reproduction |

The chain script and the repro script already carry 0056 and 0057 —
they were written in this branch. The workflow file cannot be, because
the App has no workflow scope. So without the patch the validator fails:

```
CI migration chain MISMATCH:
  in scripts/ci-migration-chain.sh but NOT in .github/workflows/ci.yml:
    db/migrations/0056_ingredient_aliases.sql
    db/migrations/0057_ingredients_sourcing_vocabulary.sql
  in scripts/repro-ci-db.sh but NOT in .github/workflows/ci.yml:
    db/migrations/0056_ingredient_aliases.sql
    db/migrations/0057_ingredients_sourcing_vocabulary.sql
```

**That is the guard working correctly.** A migration applied in one list
and not the others is a schema that exists in one environment and not
the others, and the route that reads it returns 500 where it is missing.
That is exactly what happened to `GET /api/dishes` when `categories.kind`
was in the live database and in no committed migration.

## The proof

Reproduced locally against a **throwaway PostGIS container** — never the
live database, never the VPS's production cluster.

### 1. The patch applies cleanly to main's workflow file

The patch is generated against `main` at `094eff35` (the merge of PR
#235, Astro 7.4.7).

```
$ git apply --check docs/ci-ingredient-aliases-0056-0057.patch
STILL APPLIES CLEANLY

$ git apply docs/ci-ingredient-aliases-0056-0057.patch
APPLIED
```

### 2. The validator passes after the patch, and fails before it

```
$ python3 scripts/validate-ci-migration-chain.py
CI migration chain OK (59 migrations, all three lists agree)
VALIDATOR_RC=0
```

Before the patch the same script exits 1 with the MISMATCH block quoted
above. So the step fails before the patch and passes after it — for the
right reason, which is that all three lists then carry the same 59
migrations.

### 3. The whole chain runs with both migrations applied

The chain was run end to end against a throwaway `postgis/postgis:16-3.4`
container on a separate port, as the `gustale` user (the owner of the
`/tmp` artefacts the chain writes):

```
$ bash scripts/ci-migration-chain.sh
CHAIN_RC=0
FULL_CI_CHAIN_OK=1
```

and both new markers are present in the log:

```
psql:<stdin>:295: NOTICE:  0057: all 6 proofs passed
psql:<stdin>:333: NOTICE:  INGREDIENT_ALIASES_OK=1
```

The rest of the chain is unchanged and still green:

```
ATLAS_SCHEMA_TESTS: 47 passed, 0 failed
ATLAS_BACKFILL_ASSERTIONS: 8 passed, 0 failed
ATLAS_COUNT_GUARD: 8 passed, 0 failed
```

### 4. The alias mechanism itself is proven by the API tests

The API suite was run against that same chain-built database:

```
Test Files  24 passed (24)
     Tests  231 passed | 3 skipped (234)
```

Seven of those tests are the new ones, and they are the ones that matter
for the béchamel merge:

| test | what it proves |
| --- | --- |
| resolves a retired slug to the canonical ingredient | the mechanism works |
| says which slug was asked for and which one it resolved to | no silent substitution |
| leaves the canonical slug untouched — no alias block | the normal path is unaffected |
| does NOT resolve an alias whose target is a draft | a draft stays invisible |
| does not resolve an alias whose target is a draft, even when the alias layer is the only thing filtering it | the filter cannot be bypassed |
| 404s a slug that is neither an ingredient nor an alias | no false positives |
| does not create a second ingredient when an alias resolves | the merge is a merge, not a copy |

### 5. The béchamel merge's premise is true on live

The merge is only safe because `bechamel-sauce` is referenced by
nothing. Measured on the live database, read-only, 2026-11-15:

| ingredient | id | status | `dish_ingredients` | `recipe_ingredients` |
| --- | --- | --- | --- | --- |
| `bechamel` | `57f6dda0…` | published | **1** | 0 |
| `bechamel-sauce` | `33f93412…` | published | **0** | 0 |

`bechamel-sauce` has a live public URL, so the migration makes it an
**alias** that resolves to `bechamel` rather than deleting the row. The
page keeps working and points at the right thing.

### 6. The production database was untouched throughout

The chain ran against a container created for the run and bound to a
port that is not production's. The live database was not connected to at
any point in this exercise.

## The negative, too

The same script **without** the patch exits 1 with the MISMATCH block.
So the CI step fails before the patch and passes after it.

## What the owner does

```
git apply docs/ci-ingredient-aliases-0056-0057.patch
```

That is the whole change. It adds two steps to the "Apply the database
migrations" job, and it is the same shape as every other workflow patch
this repository has shipped.

## It replaces two earlier patches

| patch | state |
| --- | --- |
| `docs/ci-ingredient-aliases-0056.patch` | still applies, but the combined patch covers it |
| `docs/ci-0057-migration.patch` | **no longer applies** — it was generated against an older `main` |

Both were removed in favour of the combined patch. **Use the combined
one.**
