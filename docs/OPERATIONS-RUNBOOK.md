# Gustale — operations runbook

Operational knowledge that used to live in the agent's `MEMORY.md`. This file is the
long form; `MEMORY.md` keeps one-line pointers to it.

Companion documents:
- `docs/DATABASE-SAFETY.md` — the live-database refusal rules.
- `docs/INCIDENT-2026-11-06-live-db-drop.md` — the accidental live drop and its restore.
- `docs/INCIDENT-2026-11-06-api-outage-password.md` — the API authentication outage.
- `docs/ci-workflow-patch-evidence.md` — why the workflow patch makes CI step 15 pass.

---

## 1. GitHub identity and the App

- The personal access token was revoked on 2026-11-04. The **only** working identity is
  the GitHub App `gustale-bot` (installation `178310866`).
- `scripts/hermes/push-with-app.py <repo-dir> <remote> <refspec>` mints the installation
  token and pushes. Prefix the refspec with `+` to force a non-fast-forward update.
- App permissions: Contents RW, PRs RW (open **and** merge), Issues/Checks/Actions/Status
  READ. It has **no** admin and **no** workflows scope, and it **cannot upload PR assets**.
- Screenshots must therefore be **committed into the branch** and linked, never uploaded
  as a PR asset.
- `scripts/hermes/gh-app.sh` is a **Python** script, not bash. Invoke it as
  `python3 scripts/hermes/gh-app.sh api GET /repos/...` — running it with `bash` fails
  with a confusing `command not found` on each word of its docstring.
- `gh-app.sh api GET /installation/repositories` reports `push: false` even when a push
  has just succeeded. Do not read it as a permission failure — just push and verify.

## 2. When CI fires

- CI fires only on `pull_request: branches: [main]`.
- A stacked PR whose base is another branch will not get CI. Retarget the base to `main`.
- An `edited` event does **not** re-fire CI. Push a new commit instead.

## 3. The App cannot push `.github/workflows/`

Because the App lacks the `workflows` scope, a workflow change cannot be committed and
pushed by the agent. The established pattern is:

1. Make the workflow change in the working tree.
2. Generate it as a **file in the branch**: `docs/ci-workflow-live-db-guard.patch`.
3. Keep a local-only cherry-pickable commit for the same change.
4. The patch must apply cleanly against real `origin/main`.

The owner applies the patch to the **PR branch**, never directly to `main`.

### The chain validator's three lists

`scripts/validate-ci-migration-chain.py` compares **three** lists — `ci.yml`,
`ci-migration-chain.sh`, and `repro-ci-db.sh`. A missing step in `ci.yml` therefore
FAILS the "Lint + typecheck" job. That failure is **expected**, not a bug: it means the
workflow still names the old database.

## 4. Pull-request order and merge rules

- PR #190 (the live-database safety guard) merges **before** PR #184.
- Nothing merges while the live API is unhealthy: the deploy builds the web images from
  the live API, so a broken API produces a broken web build.
- PR #187 and PR #189 stay paused until explicitly resumed.
- Open one independently reviewable PR per work item.

## 5. Live database access

- This session **is** the production VPS (`srv626116` / `62.72.7.218`). Never ssh to it.
- Read-only queries: `GUSTALE_LIVE_DB_ALLOW=1 bash scripts/dbq.sh "<SELECT>"`.
  `dbq.sh` runs `psql` **inside** the `shared-postgres` container. There is no `psql` on
  the host, so it must be run with `bash`.
- `scripts/lib/db_guard.py` refuses the live name `gustale` **unconditionally**. No
  environment variable can override it. A refusal prints a message and exits 1 — it does
  not raise a traceback.
- Never alter, create, or drop the live role or database. The site 500s if the API's
  credential stops matching the role's verifier.

### Why `dbq.sh` succeeding is not proof the credential is right

`dbq.sh` connects from **inside** the container to `127.0.0.1`, which matches
`pg_hba.conf` line 119 `host all all 127.0.0.1/32 trust` — no password is checked. The
API runs with `network_mode: host` and reaches the published port through Docker's
userland proxy, whose DNAT rewrites the client source address, so the API matches line
128 `host all all all scram-sha-256` — the password **is** checked. To test a credential
the way the API sees it, connect to the container's own IP (e.g. `172.18.0.6`), which
matches the SCRAM rule, and use `psql -w` so it can never fall back to a prompt.

## 6. The dedicated test PostgreSQL

- Container `gustale-test-postgres`, published on `127.0.0.1:5434` → container `5432`.
  Port 5433 belongs to Hindsight. `GUSTALE_TEST_PG_PORT` overrides the port.
- Bootstrap superuser is `postgres`; `gustale` is an ordinary role. This mirrors CI.
- PostGIS `3.4.3` is installed.
- The live name `gustale` is refused for create/drop.
- `scripts/lib/test_pg.sh` is the helper. It must not call `set -e`, because sourcing it
  would impose `errexit` on the caller.

## 7. The CI database rename

The CI PostgreSQL service database was renamed `gustale` → `gustale_ci`. A same-named CI
service is not a reason to allow `gustale` anywhere; the live name stays unique on this
host. Removing the rename also removes the only reason `GUSTALE_DB_IS_THROWAWAY` ever
existed for CI.

## 8. Migrations

- Migrations must be **idempotent** and **shape-agnostic**. Asserting an exact row count
  fails on the CI seed (28 families vs 306 live). Assert **invariants** always; use
  documented numbers only when the shape matches.
- A sampling migration must **pin** its sample (temp table, reused if present), or a
  re-apply picks a different 50 rows.
- `dish_families.parent_id` is a self-referential FK with `NO ACTION`, so
  `DELETE FROM dish_families` is pathologically slow. Drop the constraint for a
  throwaway load.
- `pg_dump` COPY aborts on the **first** duplicate. Truncate the targets first.
- `scripts/prove-0049-assertions.sh` must use the shared guard before destructive
  operations and must never be allowlisted as a live-target exception.

## 9. Taxonomy — three family vocabularies

| # | where | what it is | used for |
|---|---|---|---|
| A | `categories` where `kind='family'` | **retired** | no longer the `family=` filter |
| B | `categories` where `kind='dish-type'` | the payload's `familySlug` | the home dropdown |
| C | `dish_families` | 123 families | `/api/atlas/counts` and the `family=` filter's target |

The payload reads **B**; the hero KPI reads **C**.

## 10. Drinks and `content_type`

- `content_type` is **editorial** metadata. It is never synchronised from family tags.
- The verified editorial drink set is **8** records (7 in family `drink` plus lassi).
- Pelamushi is a **dessert**: `content_type='dish'`, family `dessert` (re-pointed by
  migration 0049).
- There is no Startpage drinks row until there are roughly 40 verified drinks.
- Evidence: `docs/DRINK-CONTENT-TYPE-VERIFICATION.md`.

## 11. Lint

- **Biome 2.5.5 cannot parse `.astro` files.** Every `const` used only in the template
  body reads as unused — 219 false-positive lines repo-wide.
- Biome's "unsafe fix" would rename those to `_x` and **break the page**. Never apply it.
- `noUnusedImports` in `.astro` **frontmatter** is real and must still be fixed.
- Genuine new diagnostics that were fixed: two `noAssignInExpressions` and two
  `useNodejsImportProtocol` in the PR3 helper scripts.
- A narrowed Biome override for `.astro` was **rejected** because it suppresses genuine
  frontmatter-only unused-import detection.

## 12. Exit codes through a pipe

`cmd | tail -20; echo $?` reports **tail's** exit code, not the command's. This produced
a false "pnpm run lint: exit 0" while CI was red. Capture exit codes **without** a pipe,
and report the failing **step** of a CI job, not the job name.

## 13. API tests

The API test suite needs a scratch database:
`bash scripts/ci-migration-chain.sh gustale_pr3_vitest` provisions it.
`apps/api/.env` points there, but a **stale shell `DATABASE_URL` wins over it** and
makes the tests 500.

Baseline: 18 test files, 179 passed, 3 skipped.

## 14. Associations

`associations.entity_id` is **polymorphic**:

- `entity_type='place'` → `geo_entities.id`
- `entity_type='community'` → `dish_traditions.id`

Measured live on 2026-11-06: 2,713 rows (1,478 place + 1,235 community), **zero**
dangling. A `community` row is a **correct** culture/tradition claim, not a broken place
link. Never auto re-point it to the cuisine's country — that would corrupt 313+ rows.
The pilot's "dangling" premise was false; all 50 pilot rows are MEDIUM and all remain
`in_review`.

## 15. Data ownership rules

- `content_type` is explicit editorial metadata and must not be synchronised from family
  tags.
- API family filtering uses canonical `dish_families`.
- `total` counts all records matching the active filters; `hasMore` is true only if
  another page exists.
- Never display a dash as a KPI. Hide a KPI without data; show zero only in an
  actionable empty state.
- DOM extraction is authoritative for rendered-count proof.
- Startpage selects exactly 12 dishes by an auditable rule, with no hero map, no drinks
  row, and no dash counters.
- Featured dishes require a photo, a definition, an origin, and a canonical family.
- Dish-page associations are server-rendered with no "Loading…" state.
- Migrations 0050/0051 must not be applied to production without separate authorisation.

## 16. The rebuild timer

- `gustale-rebuild-web.timer` runs `rebuild-web-live.sh` from `/home/deploy/gustale-rebuild`.
- It builds with `GUSTALE_NO_PUSH=1`, so it **never** pushes to ghcr.
- The timer is also the best API-liveness oracle on the host: it fetches dishes from the
  live API on every run, so its log shows exactly when the API broke.
- Curator patches to the `gustale-deploy-vps` skill are **refused**. Put deploy lessons in
  the `quality-gate-integrity` skill instead.
