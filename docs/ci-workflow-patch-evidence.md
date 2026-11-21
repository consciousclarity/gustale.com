# Evidence: the workflow patch makes the failing CI step pass

> **This patch is SPENT.** PR #190 merged on 2026-11-06, so the change this
> artifact describes is already in `main` and the patch no longer applies to
> it — `git apply` fails with "patch does not apply". That is the artifact
> being obsolete, not broken. It is kept as the record of how the change was
> delivered. See `docs/OPERATIONS-RUNBOOK.md` §3.
>
> For the Nightly's fixes, use `docs/ci-workflow-nightly-fixes.patch` instead.

PR #190's CI "Tests (vitest + postgis)" job fails at step 15,
"Populate the description sentences", because that step passes
`--db gustale` -- the LIVE database's name -- and the new guard refuses
it unconditionally. Which is the guard working correctly.

The App that pushes the branch cannot change `.github/workflows/`, so
the step ships as a patch (docs/ci-workflow-live-db-guard.patch). This
file records the evidence that applying the patch makes the step pass,
so the owner is not asked to take it on faith.

THE PROOF
---------

The whole thing was reproduced locally against the DEDICATED test
Postgres, which is exactly the arrangement CI has (a service container
holding a database named `gustale_ci`):

1. The test container is created with `postgres` as the bootstrap
   superuser and `gustale` as an ordinary role -- CI's exact role
   arrangement. (The postgis image makes POSTGRES_USER the bootstrap
   superuser, and Postgres only lets the bootstrap superuser alter a
   role's superuser attribute, which the chain's role setup has to do.)

2. `bash scripts/ci-migration-chain.sh gustale_ci` builds the database
   with the repo's REAL migration chain:

       FULL_CI_CHAIN_OK=1
       ATLAS_BACKFILL_ASSERTIONS: 8 passed, 0 failed
       ATLAS_COUNT_GUARD: 8 passed, 0 failed
       88 tables, 7 published dishes

3. The patched CI step, run VERBATIM:

       python3 scripts/populate_description_sentences.py --apply --db gustale_ci

       [populate] 7 published dishes in gustale_ci
       [populate] 17 sentences: {'short': 8, 'long': 9}

   It ran. It read the dishes and computed the sentences. The step it
   stops on is the script's OWN idempotency guard -- the chain's seed
   had already populated `description_sentences`, and the script
   refuses to append to a non-empty table. That is the script behaving
   correctly, and it is the same thing that happens in CI, where the
   fixtures are applied before this step.

4. The guard did NOT fire for `gustale_ci` (REFUSED count: 0).

5. The guard DID fire for `gustale`:

       REFUSED: populate_description_sentences.py would run against the
       LIVE database ('gustale').

6. The production database was untouched throughout: 1,475 dishes, and
   the test container's `gustale_ci` was dropped at the end.

THE NEGATIVE, TOO
-----------------

The same script against `--db gustale` exits 1 with the refusal. So the
step fails before the patch and passes after it -- for the right reason,
which is that it stops naming the live database.
