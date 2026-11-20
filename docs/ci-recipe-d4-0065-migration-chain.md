# The CI patch for D4 — migration 0065

**Why this is a patch file and not a commit.**

The GitHub App that pushes this repository (`gustale-bot`) has **no `workflows` scope**, so it
cannot create or update a file under `.github/workflows/`. The push is refused by GitHub with:

```
! [remote rejected] feature/recipe-d4 -> feature/recipe-d4
  (refusing to allow a GitHub App to create or update workflow
  `.github/workflows/ci.yml` without `workflows` permission)
```

That is a deliberate limit, not a bug to work around. So the `.github/workflows/ci.yml` half of
this change ships as **this patch**, and the owner applies it — the same pattern as every other
workflow change in this repository (`docs/ci-0063-migration-chain.patch`, and nineteen others).

**What it does.** It adds two steps to the CI migration-chain job:

1. **Apply the 0065 recipe content model** — runs
   `db/migrations/0065_recipe_layout_and_sentence_fields.sql` against `gustale_ci` and checks
   for the marker `D4_MIGRATION_PROOFS`.
2. **The D4 constraint tests** — runs `scripts/test_recipe_d4_schema.sql` and checks for the
   marker `D4_SCHEMA_TESTS`.

**How to apply it.**

```bash
cd /home/alex/projects/gustale-d4
git apply --check docs/ci-recipe-d4-0065-migration-chain.patch   # dry run
git apply docs/ci-recipe-d4-0065-migration-chain.patch
```

or, from the PR branch, as a commit:

```bash
git apply --index docs/ci-recipe-d4-0065-migration-chain.patch
git commit -m "ci: apply the 0065 recipe content model in the CI chain"
```

**It has to be applied before the PR can go green.** `scripts/validate-ci-migration-chain.py`
runs in CI and requires the three migration lists to agree:

```
  .github/workflows/ci.yml          — the CI database
  scripts/ci-migration-chain.sh     — the Nightly database
  scripts/repro-ci-db.sh            — the LOCAL reproduction
```

The other two lists already carry 0065. Without this patch, the validator fails with:

```
CI migration chain MISMATCH:
  in scripts/ci-migration-chain.sh but NOT in .github/workflows/ci.yml:
    db/migrations/0065_recipe_layout_and_sentence_fields.sql
```

That failure is the validator working, not the change being broken. It is the same class of
failure as the `Live approval gate` reporting `missing_label`.

**After applying it**, the CI chain runs 0065 and then the D4 constraint tests against the
schema the chain produces. The expected markers are:

```
NOTICE:  D4_MIGRATION_PROOFS: 4 passed, 0 failed
NOTICE:  D4_SCHEMA_TESTS: 27 passed, 0 failed
```

**The patch applies to `main` as it is today** (verified with `git apply --check --3way` against
`origin/main` @ `6e851eb`).
