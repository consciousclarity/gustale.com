# Database safety rules

These rules are about **the live database** (`gustale`, on the `shared-postgres`
container on the production VPS). They are enforced in code as well as written
here: see [the enforcement](#where-each-rule-is-enforced).

## 1. Never DROP or CREATE a database on `shared-postgres`

**No `DROP DATABASE`, no `CREATE DATABASE`, no `DROP ROLE`, no `CREATE ROLE` on
`shared-postgres` — ever, for any reason, under any environment variable.**

`DROP DATABASE` and `CREATE DATABASE` are **cluster-scoped**: they act on the
whole Postgres instance, not on one database. `shared-postgres` is shared with
other projects (bali, dewata, n8n, scribe) as well as with the live `gustale`
database, so a throwaway database created there is a hazard for all of them.

### This has already happened

On **2026-11-06** the live `gustale` database was dropped and recreated empty.
A diagnostic script ran

```sql
DROP DATABASE IF EXISTS gustale; CREATE DATABASE gustale;
```

against `shared-postgres`, while a stale `GUSTALE_DB_IS_THROWAWAY=1` was
exported in the shell. The guard was supposed to stop exactly this and did not,
because the variable could widen the permission it existed to restrict.

The database was restored from a backup. The full report, including the
timeline and the data-loss analysis, is
[docs/INCIDENT-2026-11-06-live-db-drop.md](docs/INCIDENT-2026-11-06-live-db-drop.md).

## 2. The live database's NAME is refused always

`resolve("gustale")` in [`scripts/lib/db_guard.py`](scripts/lib/db_guard.py)
**always raises**. No environment variable can widen that permission.

In particular **not** `GUSTALE_DB_IS_THROWAWAY=1`. That variable used to be able
to turn the refusal off, which is precisely how the incident happened: the CI's
Postgres service container was also named `gustale`, so the guard had to ask
*which server* it was talking to, and a stale export of that flag on the
production host made the guard hand out the live name.

The CI's database is now named `gustale_ci`, so the live name is unique on
every host and can be refused by name alone.

**Every variable in the guard can only ever narrow what is permitted.** There
is no variable that widens it.

## 3. Test and throwaway databases live on the dedicated test Postgres

A throwaway database does not live on the production cluster at all. It lives
on `gustale-test-postgres`, port **5434** (production is 5432), with the same
PostGIS image production uses.

```bash
source scripts/lib/test_pg.sh
test_pg_up                       # start it
test_pg_create "$DB"             # create a throwaway database
test_pg_run "$DB" -f some.sql    # run SQL against it
test_pg_drop "$DB"               # drop it
```

The helper refuses the live name itself, unconditionally.

## 4. A copy of the live database is still a copy

Some scripts must make a copy of the live database — the live-migration gate,
the account-deletion gate, the dry-run. Those copies are made **on
`shared-postgres`**, because a `pg_dump | pg_restore` copy, and a
`CREATE DATABASE ... TEMPLATE` copy, have to be on the same cluster to be
faithful.

Those scripts:

- create and drop only the **copy** (`gustale_atlas_gate_copy`,
  `gustale_delacct_$$`), never the live database;
- must never name the live database as their drop target;
- are listed, with their reasons, in the allowlist of
  [`scripts/check-no-production-db-drops.py`](scripts/check-no-production-db-drops.py).

## 5. Approval for a live action is per operation and must be explicit

Never infer approval for a live action from an earlier approval, from a general
permission, or from CI being green. A hold ("not yet", "wait for CI", "hold
until X") is a hold on **that operation** until the owner lifts it in a message
that names it.

A live write goes through:

1. the live-approval gate (`scripts/check-live-approval.sh`) — the owner's
   `approved-live` label on the specific PR;
2. `scripts/apply-migration-live.sh` — the only sanctioned path to a live
   schema change, which takes a backup, snapshots, dry-runs on a copy, asserts
   counts, applies, and verifies independently;
3. the guard's three-signal opt-in — the calling script must be on the
   guard's allowed-writers list, `GUSTALE_LIVE_DB_ALLOW=1` must be set for that
   invocation, and `GUSTALE_LIVE_PURPOSE` must name the operation.

## Where each rule is enforced

| Rule | Enforced by |
|---|---|
| The live name is refused always | `scripts/lib/db_guard.py` → `resolve()` |
| No env var can widen the guard | `scripts/test-db-guard.py` (the incident's exact combination is a test case) |
| The vitest suite never runs on live | `apps/api/test/setup.ts` |
| No script drops a DB on production | `scripts/check-no-production-db-drops.py` |
| …and that gate can fail | `scripts/test-check-no-production-db-drops.py` |
| No script defaults to the live DB | `scripts/check-no-live-db-defaults.py` |
| …and that gate can fail | `scripts/test-check-no-live-db-defaults.py` |

All of these run in CI. A gate that cannot fail is not a gate, so each scanner
has a test that drives it with the cases it must catch.
