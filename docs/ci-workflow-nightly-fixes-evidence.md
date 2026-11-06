# Evidence: the Nightly's two failures, and the fixes

The Nightly has failed **every night since 2026-11-02** — five consecutive runs,
all at the same step:

```
Full integration :: Reset database
  ERROR:  role "gustale" does not exist
  ##[error]Process completed with exit code 3.
```

The failing run on `main` is `42108134366` (2026-11-05). The last Nightly that
passed was `41228943405` (2026-10-31), on commit `c41dee8c`.

There are **two** independent defects here, and both are in
`.github/workflows/nightly.yml`. The fixes ship as
`docs/ci-workflow-nightly-fixes.patch`, because the App that pushes this branch
cannot write `.github/workflows/` (see `docs/OPERATIONS-RUNBOOK.md` §3 and §21).

---

## 1. The GRANT has no target — the role does not exist yet

The Nightly's reset step:

```sql
DROP SCHEMA IF EXISTS public CASCADE;
CREATE SCHEMA public;
GRANT ALL ON SCHEMA public TO gustale;   -- <-- the role
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
```

`POSTGRES_USER` is `postgres`, so the service container's only role is
`postgres`. The role `gustale` is created by `scripts/ci-migration-role.sql` —
and the file that applies it in the Nightly is the **chain**, in the **next
step**:

```yaml
- name: Apply the full migration chain
  run: bash scripts/ci-migration-chain.sh gustale_nightly
```

So at reset time the role does not exist, and `GRANT ... TO gustale` fails.
`ON_ERROR_STOP=1` turns that into a failed step, and the job — whose whole
purpose is the drift check — never reaches the drift check.

**The regression.** Commit `fb05999` ("The credential trigger escalation, and
the CI role model that hid it", 2026-11-02) changed the service container from
`POSTGRES_USER: gustale` to `POSTGRES_USER: postgres`, so the bot would stop
being the superuser. That was the right change, and it is the change that
created this: with `POSTGRES_USER: gustale` the role existed from the moment
the container booted, and the GRANT had a target.

`ci.yml` was updated for the same change — it applies the role setup **before**
the chain (`ci.yml`, step "Apply schema to ephemeral DB"):

```yaml
PGPASSWORD=gustale psql -h 127.0.0.1 -U postgres -d gustale_ci -v ON_ERROR_STOP=1 \
  -f scripts/ci-migration-role.sql
```

The Nightly was not. That is the whole bug: **two workflows, one role
arrangement, and only one of them was updated.**

**The fix** is the arrangement `ci.yml` already uses: the same committed role
SQL, applied to the service database first, by the superuser. The file is
idempotent, so the chain applying it again in the next step is fine.

### Reproduced

Against a `postgres:16` container in CI's exact arrangement
(`POSTGRES_USER=postgres POSTGRES_PASSWORD=gustale POSTGRES_DB=gustale_ci`):

```
=== BEFORE: the roles that exist ===
  postgres

=== CASE A: the Nightly's reset SQL, WITHOUT the role setup ===
  DROP SCHEMA
  CREATE SCHEMA
  ERROR:  role "gustale" does not exist
  exit code: 3   (nonzero = the Nightly's failure)

=== CASE B: the role setup FIRST (the fix), then the reset SQL ===
  psql:/tmp/role.sql:358: NOTICE:  CI_MIGRATION_ROLE_OK=1
  role SQL exit code: 0
  DROP SCHEMA
  CREATE SCHEMA
  GRANT
  reset SQL exit code: 0

=== CASE C: the chain's role setup again (it must be idempotent) ===
  exit code: 0  (0 = the chain can still run it)
  psql:/tmp/role.sql:358: NOTICE:  CI_MIGRATION_ROLE_OK=1

=== AFTER: the roles, and the bot's schema privilege ===
  role gustale super=false
  role gustale_credential_issuer super=false
  role gustale_migrator super=false
  the bot can USE the schema: t
  the bot can CREATE in it:    t
```

The bot role is created **without** superuser, exactly as `ci.yml` creates it,
and the chain's second application of the same file still succeeds.

## 2. `POSTGRES_DB: gustale_ci_ci` — the container creates the wrong database

This came in with the CI database rename (`5a14718`) and is a typo: the
service container CREATES the database named by `POSTGRES_DB`, while the
`DATABASE_URL` and every `psql` call in the same file name `gustale_ci`.

```yaml
POSTGRES_DB: gustale_ci_ci     # the container creates THIS
...
PGPASSWORD=gustale psql ... -d gustale_ci    # the job connects to THIS
```

Reproduced against a container created with `POSTGRES_DB=gustale_ci_ci`:

```
  databases that exist:
    gustale_ci_ci
    postgres
  now the Nightly's reset step's connect (-d gustale_ci):
    psql: error: ... FATAL:  database "gustale_ci" does not exist
```

So even with defect 1 fixed, the step would still fail — this time on the
connection rather than on the GRANT. Both are fixed by the patch.

---

## How to apply

The App that pushes this branch cannot write `.github/workflows/`, so the
change ships as a patch:

```bash
git apply docs/ci-workflow-nightly-fixes.patch
```

It applies cleanly to this branch (`git apply --check` exits 0), and it touches
only `.github/workflows/nightly.yml`.

**Apply it to the PR branch, not to `main`** — the same rule as the existing
`docs/ci-workflow-live-db-guard.patch` (`docs/OPERATIONS-RUNBOOK.md` §3).

After it is applied, the Nightly's `Reset database` step runs:

1. `scripts/ci-migration-role.sql` as the superuser → creates `gustale` as an
   ordinary LOGIN role, plus `gustale_migrator` and `gustale_credential_issuer`;
2. the reset SQL → `DROP SCHEMA` / `CREATE SCHEMA` / `GRANT` / the extensions.

and the chain's own application of the role file, in the next step, is a
no-op.

## What was NOT done

- **No change to `main`.** The Nightly is broken on `main` too — the same
  defect 1, independent of this PR. Applying the patch to the PR branch fixes
  the PR branch; `main` needs it separately, and `main` also needs the
  `gustale_ci` rename, which is what the existing
  `docs/ci-workflow-live-db-guard.patch` carries.
- **No change to the role model itself.** The bot role is still created
  without superuser, and still holds no membership of the issuer role. This
  fix makes the Nightly's arrangement match `ci.yml`'s; it does not widen any
  privilege.
- **No live database was touched.** Every reproduction above ran against a
  throwaway `postgres:16` container.
