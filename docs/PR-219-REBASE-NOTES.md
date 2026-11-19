# PR #219, rebased on main — the owner action

**Status:** the branch is pushed. **One step remains, and only the owner
can take it**: apply the workflow patch to the branch.

```bash
cd <gustale.com>
git fetch origin
git checkout feat/219-rebase-nocic
git pull
git apply docs/ci-ingredient-aliases-0061-0062.patch
git commit -m "ci: apply the 0061 and 0062 migration steps"
git push origin feat/219-rebase-nocic
```

That push needs the owner's GitHub credentials — the App has no
`workflows` scope and GitHub refuses its pushes outright:

```
refusing to allow a GitHub App to create or update workflow
`.github/workflows/ci.yml` without `workflows` permission
```

## Why the patch exists at all

The migration list lives in **three** files, and all three must apply the
same migrations:

| file | the database it builds |
| --- | --- |
| `.github/workflows/ci.yml` | the CI database |
| `scripts/ci-migration-chain.sh` | the Nightly database |
| `scripts/repro-ci-db.sh` | the local reproduction |

`scripts/ci-migration-chain.sh` and `scripts/repro-ci-db.sh` already carry
0061 and 0062. The workflow file cannot carry them until the owner
applies the patch. Until then the validator fails, and **that failure is
the guard working** — not a bug to work around:

```
CI migration chain MISMATCH:
  in scripts/ci-migration-chain.sh but NOT in .github/workflows/ci.yml:
    db/migrations/0061_ingredient_aliases.sql
    db/migrations/0062_ingredients_sourcing_vocabulary.sql
```

## What changed, and why

### The migrations were renumbered

PR #219 opened with `0056_ingredient_aliases.sql` and
`0057_ingredients_sourcing_vocabulary.sql`. Main then merged **0058**,
**0059** and **0060**, and all three are **already applied to the live
database**. Two consequences:

- An applied migration is frozen. Its number cannot be reused.
- A new migration that sorts *before* an applied one cannot be applied to
  live at all — the chain runs in filename order, so 0056/0057 would be
  skipped past by the already-applied 0058–0060.

So: **0056 → 0061, 0057 → 0062.** They now sort after 0060, and the
order is 0055 → 0059 → 0058 → 0060 → 0061 → 0062 in all three lists.

### What is actually on live

Verified against the live database on 2026-11-18:

| migration | on live? | evidence |
| --- | --- | --- |
| 0062 (`0057`) | **yes** | all 21 ingredient rows present, all `status = 'draft'`; applied 2026-11-11 09:31:55 WITA per `docs/MIGRATION-RECEIPT-0062.md` |
| 0061 (`0056`) | **no** | `ingredient_aliases` does not exist; `bechamel` and `bechamel-sauce` are still two separate rows |

0062 is idempotent — `ON CONFLICT (slug) DO NOTHING`, and its six proofs
assert on *state*, not on "this migration just ran". Re-running it on a
database that already has it changes nothing, which was verified.

### The béchamel merge is NOT done

`bechamel` and `bechamel-sauce` are still two rows on live. 0061 creates
the alias table that lets the retired slug redirect to the canonical
ingredient **without** deleting the row and breaking its live URL — but
0061 has never been applied. This is the reason #219 still earns its
place in the queue.

## Verification

Everything below was run against this branch.

| check | result |
| --- | --- |
| `scripts/validate-ci-migration-chain.py` (with the patch applied) | `CI migration chain OK (62 migrations, all three lists agree)` |
| `scripts/ci-migration-chain.sh` | `FULL_CI_CHAIN_OK=1`, with `INGREDIENT_ALIASES_OK=1` and `0062: all 6 proofs passed` |
| `scripts/repro-ci-db.sh` | `CI_DB_REPRO_OK=1` |
| 0061 + 0062 re-run on a database that already has them | no-op, proofs still pass |
| API test suite | 232 passed, 24 files, 0 failed |
| Web test suite | 221 passed, 0 failed |
| `git apply --check` of the patch against the branch's `ci.yml` | applies cleanly, and the result is byte-identical to the full commit's `ci.yml` |

## A real defect this found

`@gustale/db`'s **built** output was stale, so `ingredientAliases` was
`undefined` at runtime. Every alias lookup raised a 500:

```
TypeError: Cannot read properties of undefined (reading 'Symbol(drizzle:IsAlias)')
    at resolveIngredientAlias (apps/api/src/routes/ingredients.ts:75)
```

The 7 alias tests had been silently **SKIPPED** — the test file skips
when `ingredient_aliases` is absent from the database, and the local test
database did not have it. Run against a database that has 0061, all 7
pass. The fix is to rebuild `packages/db`; the source schema was always
correct.

## What was dropped from the branch

`scripts/hermes/gh-app.sh` and `scripts/hermes/push_sha_as_app.py` are
restored to main's version. The branch carried stale pre-PR-247 copies
that had their own private JWT mint; main's use the one shared
`gh_app_auth` helper, and there is exactly one mint in the repository.

## After the patch

Apply the patch, push, and the PR is ready to merge. Then **0061 still
has to be applied to live** — that is the step that finally merges
béchamel. Use `docs/LIVE-APPLY-0062.md` for the 0062 procedure and the
equivalent for 0061; both go through the owner's live-approval gate.
