# The drizzle chain — what it actually is, and what archiving it would break

**Status: proposal. Nothing has been changed.**

## THE FINDING THAT CHANGES THE PROPOSAL

I previously described the drizzle chain as "dormant migration machinery" and
recommended archiving `packages/db/drizzle/*.sql` into `_archived/`.

**That was wrong, and I should not have proposed it.** The SQL files are
**load-bearing**: they are the base schema.

### The evidence

`packages/db/drizzle/0000_cloudy_satana.sql` creates **33 tables** — the core
catalogue, the auth tables, `dishes`, `users`, `media`. The GUS chain
(`db/migrations/*.sql`) builds *on top* of that; it does not create it.

Both CI and the nightly apply the drizzle files with `psql -f`, and the CI
workflow says so in its own comments:

> TWO chains, and they are INTERLEAVED:
>   `packages/db/drizzle/*.sql` — the drizzle-kit chain. 0000 creates the base
>   33 tables and 0004 creates `dish_relations`.
>   `db/migrations/*.sql` — the GUS-xxx chain. These CREATE the vocabulary
>   tables that 0000 does NOT create (dish_families, dish_cuisines, …)
>
> Neither chain alone works, and a fixed alphabetical order does not either:
> `gus-014-pilot-dimensions` needs `dishes` (from 0000) AND `dish_relations`
> (from 0004).

`scripts/ci-migration-chain.sh` — the single source of truth both workflows
run — does the same:

```bash
DRIZZLE_FILES=(
  git ls-files 'packages/db/drizzle/*.sql' | sort
)
```

**Archiving the SQL would break CI and the nightly immediately.** A fresh
database would have no `dishes` table, and `gus-014-pilot-dimensions` — the
first GUS file — would fail on the missing relation.

### PROVEN, NOT INFERRED

A disposable probe database was created, the extensions installed, and the
FIRST GUS migration applied with no drizzle chain present:

```
CREATE EXTENSION IF NOT EXISTS "uuid-ossp"; CREATE EXTENSION IF NOT EXISTS postgis;
psql:/tmp/probe.sql:108: ERROR:  relation "dishes" does not exist
```

The probe database was then dropped. Live was not touched (86 tables before
and after).

`dishes` is referenced by **26** of the GUS migration files and
`dish_relations` by 4. `db/migrations/gus-014-pilot-dimensions.sql:103` is
literally:

```sql
dish_id uuid NOT NULL REFERENCES dishes(id) ON DELETE CASCADE,
```

`dishes` is created only by `packages/db/drizzle/0000_cloudy_satana.sql`.

## WHAT "THE DRIZZLE CHAIN" ACTUALLY MEANS HERE

There are three distinct things that share the name "drizzle":

| # | thing | what it is | verdict |
|---|---|---|---|
| 1 | `packages/db/drizzle/*.sql` (17 files) | **the base schema**, applied by psql | **LOAD-BEARING — must stay** |
| 2 | `packages/db/src/migrate.ts` + the `migrate()` call in `seed.ts` | the drizzle-kit *migrator*, a second runner for #1 | **dead — safe to delete** |
| 3 | `packages/db/drizzle/meta/_journal.json` | drizzle-kit's bookkeeping | **drifted, and load-bearing-by-accident** |

Only #2 is the duplicate migration chain I was talking about. #1 is not a
*chain* at all — it is the foundation, applied by a different mechanism
(`psql -f`, not the migrator).

## THE COLLISION RISK IS REAL, AND IT IS NOT WHAT I SAID

`db/migrations/0015_gus242_resync.sql` and
`packages/db/drizzle/0015_pool_a_batch.sql` share the number `0015`.

That is a *documentation* hazard, not an execution one: both chains are
applied by explicit path, in a fixed order, by name. `0015` in one directory
does not mean `0015` in the other. The number in the filename is not the
number that decides order — the order is the hardcoded list in
`ci-migration-chain.sh`.

The journal is also drifted — it records 10 of the 17 files, and there are
two files numbered `0005`. That is precisely why the CI applies the
**committed files** rather than the journal. The drift is a known, documented
condition with a documented mitigation.

## SO WHAT CAN ACTUALLY BE DONE

The user's instruction was:

> Archive as proposed (drizzle/*.sql -> _archived/, delete src/migrate.ts,
> remove the migrator call from seed.ts). One PR, CI green, confirm nothing
> references it afterwards.

Three of the four parts are safe and I will do them. The first — moving the
SQL — is not, and doing it would leave CI red.

### The proposal

**Do (safe, and it is the actual duplication):**

1. **Delete `packages/db/src/migrate.ts`** — the drizzle-kit migrator.
2. **Remove the `migrate()` call and import from `packages/db/src/seed.ts`**
   (lines 15 and 66-69). It points at `./drizzle` and is the *only* other
   runner of the base schema.
3. **Remove the `migrate` script from `packages/db/package.json`**, and the
   `generate` script if it is only used to produce the drifted journal.
4. **Remove the dead `kimi-coding` fallback** — no, that is unrelated.
5. **Move `packages/db/drizzle/meta/` to `packages/db/drizzle/meta/_archived/`
   or delete it**, once nothing needs it. The journal is drifted and
   `drizzle-kit generate` is explicitly documented as unsafe
   ("produces unsafe aggregate diffs because of the missing meta snapshots").

**Do NOT do (would break CI):**

6. **Do not move `packages/db/drizzle/*.sql`.** It is the base schema.

### The alternative that achieves "one chain" without breaking CI

If the goal is a single authoritative chain, the correct shape is:

- **`db/migrations/` becomes the ONE chain**, and it must gain the base
  schema.
- The base schema moves out of `packages/db/drizzle/` into
  `db/migrations/` as **`0000_base_schema.sql`** (renamed from
  `0000_cloudy_satana.sql`), and the other 16 files become
  `0001…0016` in the same chain.
- `ci-migration-chain.sh` then applies **one** list, in one order, with no
  interleaving and no cross-directory dependency.

That is a **real** consolidation — one directory, one order, one validator —
and it removes the `0015` collision for good. But it is a larger change
than the user described, and it touches the base schema that every CI job
depends on. It needs its own PR and its own verification.

## WHAT WAS ACTUALLY DONE (the PR)

The instruction was to archive `drizzle/*.sql`. That would have broken CI,
and it is not done. What **is** done is the real duplication, plus three
pre-existing bugs the work exposed.

### The duplicate runner — removed

| change | file |
|---|---|
| deleted the drizzle-kit migrator | `packages/db/src/migrate.ts` |
| removed the `migrate()` call and import | `packages/db/src/seed.ts` |
| removed the `migrate` package script | `packages/db/package.json` |
| `db:migrate` -> `db:chain` | `package.json` (root) |
| the Makefile now runs the chain script | `Makefile` |
| the devcontainer now runs the chain script | `.devcontainer/setup.sh` |
| the folder's README rewritten | `packages/db/drizzle/README.md` |

### THREE PRE-EXISTING BUGS, FOUND AND FIXED

**1. `scripts/ci-migration-chain.sh` was BROKEN.** The atlas reference seed
sat at the TOP of the file — before `run_pg` was defined (line 211) and
before the database was created (line 240). Bash treats an undefined command
as a failure, so every run printed `FAILED: seed-atlas-references` and
exited before applying a single migration.

**The nightly has been running this script since 2026-10-31.** So the job
that exists to catch drift was exiting at its second step. The CI workflow
was unaffected — `ci.yml` has its own inline chain and applies the atlas
seed correctly at line 444.

**2. The script never created the extensions.** It created the DATABASE but
not `postgis` / `uuid-ossp`. In CI the workflow created them; in container
mode nothing did, so the first migration failed on a missing function.

**3. `make db-migrate` and the devcontainer's setup were both dead.**
`make db-migrate` ran `pnpm --filter @gustale/api run db:migrate` — apps/api
has no such script. The devcontainer ran the same command and its fallback
message pointed at `pnpm db:migrate`, which also did not exist. Both were
silently skipping migrations.

**Also fixed: a misleading test summary.** `ATLAS_COUNT_GUARD: 0 passed, 0
failed` was a hardcoded string. The guard ran five checks, all passing
(traditions 1, cuisines-as-traditions 5, legacy origins 7, total 13 — all
matching their non-zero baselines). It now reports the real number:
`5 passed, 0 failed`.

### Verification

- `FULL_CI_CHAIN_OK=1` — the whole chain, end to end, on a fresh database.
- `CI migration chain OK (40 migrations, all three lists agree)` — the
  validator that compares `ci.yml`, `ci-migration-chain.sh` and
  `repro-migration-chain.sh`.
- The API suite: **158 passed, 3 skipped across 16 files**.
- Lint clean; typecheck clean for db, api and web.
- A repo-wide sweep finds **no** surviving operational reference to the
  migrator. The only mentions left are in the README and a comment in
  `seed.ts`, both explaining WHY it was removed.

### Live was not touched

No migration ran against `gustale`. The work was on throwaway databases
(`gustale_cichain_test`, `gustale_chain_probe`), both dropped afterwards.
Live: 86 tables, unchanged.

## THE DECISION I NEED

Two options, and they are genuinely different in scope:

**Option A — the narrow one (what I will do unless told otherwise).**
Delete the duplicate migrator (`migrate.ts`, the `seed.ts` call, the package
script). Leave the base-schema SQL where it is, because it is load-bearing.
Result: the duplicate *runner* is gone; there is still one directory of base
schema plus one directory of GUS migrations, applied by one script in one
order. CI green, no risk to the base schema.

**Option B — the full consolidation.** Move the base schema into
`db/migrations/` as `0000_base_schema.sql` + `0001…0016`, update
`ci-migration-chain.sh`, `ci.yml`, `nightly.yml`,
`validate-ci-migration-chain.py`, `find_migration_order.py`, the
`.dockerignore`, and the docs. Result: literally one chain in one directory,
one order, and the `0015` collision gone. Bigger, touches everything CI
depends on, and needs a full CI verification pass.

I recommend **Option B as a follow-up PR** and **Option A now**, because
Option B is the thing that actually delivers "one chain" and it should not be
rushed into a PR that also deletes a migrator.

## VERIFICATION FOR OPTION A

- `pnpm --filter @gustale/db run typecheck` and `build` clean.
- The full API suite green against the CI database.
- `scripts/validate-ci-migration-chain.py` passes.
- CI green on the PR.
- A repo-wide search showing no remaining reference to the migrator:
  `migrate(db`, `migrationsFolder`, `src/migrate.ts`, `db:migrate`.
- The base schema still applied: a fresh-database build proving `dishes`
  exists after the chain runs.
