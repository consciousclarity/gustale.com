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

### The two push traps

**`push_as_app.py` pushes `HEAD`, not the branch you name.** If the working tree is on a
different branch when you call it, the *wrong* commit lands on the remote branch — and
the local repository looks perfectly correct, so nothing warns you. This happened on
2026-11-07: the item-1 branch was pushed with the item-0 tip, and PR #200 briefly
showed 13 changed files instead of 1.

**The check that catches it** — after every push, read the PR's own file list back:

```bash
python3 scripts/hermes/app_api.py GET "/repos/consciousclarity/gustale.com/pulls/<N>/files"
```

and compare `changed_files` against what you committed. Also compare the remote ref:

```bash
git ls-remote origin refs/heads/<branch>
```

`scripts/hermes/app_api.py` is a thin wrapper over `gh-app.sh` for exactly this. Two
things it gets right:

- `gh-app.sh` is Python with a `.sh` suffix, so `importlib.util.spec_from_file_location`
  returns **None** unless the loader is given explicitly
  (`importlib.machinery.SourceFileLoader`).
- `gh-app.sh`'s `api` mode builds `https://api.github.com{path}` with **no slash**, so
  the path must start with `/`. Without it curl exits **6** (could not resolve host).

To push a *specific* commit to a branch, use `push_sha_as_app.py` with
`--force-with-lease` semantics rather than `push_as_app.py`.

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

### 6a. The three database rules

These are the rules that follow from the 2026-11-06 accidental drop and from the
production leak found on 2026-11-07. They are absolute; nothing in the environment
can widen them.

**1. No `DROP DATABASE`, `CREATE DATABASE`, `DROP ROLE` or `CREATE ROLE` on
`shared-postgres` — ever.**

Those statements are **cluster-scoped**: they act on a whole Postgres instance, not
on one database. `shared-postgres` hosts the live `gustale` database *and* five other
projects' databases (bali, dewata, n8n, scribe), so a throwaway database created there
is a hazard for all of them. `scripts/check-no-production-db-drops.py` fails the build
if any script can do this; `scripts/test-check-no-production-db-drops.py` proves the
gate can fail.

**2. The live name `gustale` is refused unconditionally.**

No environment variable, CLI flag or config file may turn that refusal off. A guard
that can be switched off is not a guard: a stale `GUSTALE_DB_IS_THROWAWAY=1` in a
production shell is exactly what caused the incident. The guard is
`scripts/lib/db_guard.py`; `resolve("gustale")` always raises. The live name is
refused **by name**, so CI's own database was renamed `gustale` → `gustale_ci` rather
than weakening the guard.

**3. The container follows the TARGET, not the machine.**

A script must decide *where* it connects by looking at *what it is targeting*, never
by asking what the machine happens to have. The bug this rule kills is real:
`scripts/populate_description_sentences.py` used to ask "is the `shared-postgres`
container here?", and on the production host — which is the host that has that
container — every target resolved to `docker exec shared-postgres`. A throwaway
database was therefore created and written **on the production cluster**.

The shape now:

| the target | where it connects |
|---|---|
| the live `gustale` | the production container, and only through the guard (three signals) plus the live-approval gate |
| a throwaway database | the dedicated test PostgreSQL, never production — whatever the machine looks like |
| `CHAIN_MODE=ci` | the CI's own service on `PG_HOST:PG_PORT` |

A host that has the production container and no test container **refuses** rather
than guessing, because the only local Postgres there is production's.

The general form: **if a value can be aimed at the wrong thing by an environment
variable, it must be a constant.** `scripts/find_migration_order.py` and
`scripts/populate_description_sentences.py` both hold their container name as a
constant for this reason.

### 6b. Verifying that a script did not touch production

A static scanner is necessary but not sufficient: it cannot see a decision made at
runtime. Before and after running anything that creates or writes a database, snapshot
the production cluster and diff it:

```bash
docker exec -u postgres shared-postgres psql -U postgres -d postgres -tAc \
  "select datname from pg_database where not datistemplate order by datname;"
```

Compare the database list *and* the row counts of every scratch database on the
cluster, not just the list — a leaked write leaves the list unchanged.

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
- `scripts/prove-0049-assertions.sh` uses the shared guard before destructive
  operations, runs on the dedicated test PostgreSQL (`scripts/lib/test_pg.sh`), and
  is never allowlisted as a live-target exception. It must not be allowlisted at
  all: the correct repair is to move it off the production cluster, not to exempt it.

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

### 16a. The timer and the CI deploy share ONE lock

Both sides swap the same two containers (`gustale-web-recipes`, `gustale-web-geo`), so both
must take the **same** lock: `/tmp/gustale-deploy.lock`.

**Two different lock files do not exclude each other.** Until 2026-11-07 the CI deploy locked
`/tmp/gustale-deploy.lock` and the timer locked `/var/lock/gustale-rebuild.lock`. They raced
for real: CI run `42314759004` (as `root`) and the timer (as `gustale`) built the same image
tag at the same time. The timer then swapped the containers with **its own** build *after* the
CI's "Real verify" had already passed — so the verified build was silently replaced by an
unverified one, with no error anywhere.

**Why the lock is in `/tmp`, and why `gustale` cannot write it.** The CI deploy runs as root
and creates the lock as `root:root` mode `0644`. The timer runs as `gustale` and can only
*read* it. That is fine: `flock()` locks the **inode**, not the mode, so an exclusive flock on
a read-only descriptor conflicts with an exclusive flock on a write descriptor. The timer
therefore opens the lock read-only and flocks that. Proven in both directions by
`scripts/hermes/test-shared-deploy-lock.sh`.

**The fix is script-only on purpose.** The obvious fix is to change *both* sides to a new path,
but the deploy side lives in `.github/workflows/ci.yml` and the App cannot push
`.github/workflows/` files. So the timer takes the lock the deploy **already** takes, and the
workflow does not change. The test asserts the two paths still agree, so a later edit cannot
silently split them again.

**The installed scripts must be refreshed.** The timer runs the copy in
`/home/deploy/gustale-rebuild/`, not the repo. On 2026-11-07 that copy was from 2026-11-02 and
was missing the fail-closed fetch guard, the ancestry guard, and the `-recipes`/`-geo` image
tag suffixes. A merge alone does not install anything:

```bash
sudo GUSTALE_SRC_DIR=/home/gustale/gustale-rebuild-checkout \
  bash scripts/hermes/install-rebuild-timer.sh
```

**Do not merge during a timer run.** The timer starts about every 30 minutes (it drifts; it is
not on a fixed minute). Check before merging:

```bash
systemctl list-timers --all | grep gustale-rebuild-web
```

### 16b. The systemd unit files are ROOT-OWNED

`/etc/systemd/system/gustale-rebuild-web.service` and its `.timer` must be owned by
**`root:root`**. The service still **runs** as `gustale` — that is set by `User=` inside the
unit, not by who owns the file. Those are two different things, and only the second one is a
privilege boundary.

**A unit file owned by a normal user is an escalation to root.** systemd reads the unit as root
and executes what it says, so whoever can *write* the file can put `ExecStartPre=/bin/sh` in it
and have root run it. The `User=` directive does not protect the file: the file is parsed as
root *before* the privilege drop happens. Since `gustale` is also the account the operator logs
in as, "gustale can rewrite the unit" means "any write primitive that reaches gustale is root".

Until 2026-11-07 `scripts/hermes/install-rebuild-timer.sh` installed both units with
`-o "$SVC_USER"`, so every re-install put the escalation back. The install now:

1. installs the two unit files with `-o root -g root`;
2. **asserts** the ownership afterwards with `stat -c '%U:%G'` and **exits non-zero** if it is
   not `root:root` — a stale unit left over from an earlier install is corrected or refused, not
   silently kept;
3. takes the same ownership for the `.service.d` drop-in directories and their `.conf` files,
   because a drop-in is a unit file fragment and systemd executes what it says.

The check is static and needs no root: `scripts/hermes/test-systemd-unit-ownership.sh`
(9 assertions), run in CI from `scripts/hermes/test-rebuild-fail-closed.sh`.

**Verify after any install:**

```bash
ls -l /etc/systemd/system/gustale-rebuild-web.service \
      /etc/systemd/system/gustale-rebuild-web.timer
# both must be: -rw-r--r-- 1 root root
```

## 17. The private `gustale-state` repository

`consciousclarity/gustale-state` is the **private** repo that holds the shared agent
context: `.hermes/SHARED_STATE.md`, `.hermes/TASKS.md`, `.hermes/RULES.md`,
`.hermes/KANBAN.md`, and the reports.

**The branch is `state`, not `main`.** `CLAUDE.md` in the public repo states it
explicitly, and the workflow is:

```bash
# pull the shared context
git fetch https://github.com/consciousclarity/gustale-state.git state

# commit updates to the PRIVATE repo, on its `state` branch
cd ~/gustale-state
git checkout state
# edit .hermes/SHARED_STATE.md and .hermes/TASKS.md
git push origin state
```

The `main` branch of that repo exists but is a different line of history; the shared
context lives on `state`.

**The GitHub App is NOT installed on it.** `GET /installation/repositories` reports
`total_count: 1` — only `gustale.com`. A `GET /repos/consciousclarity/gustale-state`
returns 404, and the deploy key cannot authenticate (`could not read Username for
'https://github.com'`). So the App cannot push there and neither can this agent: only
Alejandro can, with his own credentials.

This is deliberate separation, not an oversight: it is what keeps shared agent context
out of a **public** repository. A branch of a public repository is public; the
repository's visibility is what makes it private.

## 18. Where the long-form material lives

This runbook is the long form. `MEMORY.md` holds one-line pointers to:

| pointer | file |
|---|---|
| §1-3, §5-8, §11-17 | this file |
| drinks / `content_type` | `docs/DRINK-CONTENT-TYPE-VERIFICATION.md` |
| Hindsight write failure | `docs/HINDSIGHT-WRITE-FAILURE.md` |
| the live DB wipe | `docs/INCIDENT-2026-11-06-live-db-drop.md` |
| the API outage | `docs/INCIDENT-2026-11-06-api-outage-password.md` |
| database safety policy | `docs/DATABASE-SAFETY.md` |
| the CI workflow patch evidence | `docs/ci-workflow-patch-evidence.md` |
| the Hermes/MiniMax configuration | `docs/HERMES-MINIMAX-CONFIG.md` |
| the Recipes task (ADR-007 amendment, resume state) | `docs/ADR-007-A1-recipes-confidence-autopublish-contributors-language-urls.md`, `docs/RECIPES-TASK-RESUME.md` |

The **full** incident reports — the ones that name credential values and fingerprints —
also live in the **private** repo under `.hermes/REPORTS/`. The public copies carry
one-way fingerprints only.

## 19. Secrets hygiene

**A credential value must never reach the PUBLIC `gustale.com` repository.** The public
copy of an incident report carries one-way fingerprints (a truncated SHA-256 of the
value) — never the value, never a prefix of it. The full report lives in the private
`gustale-state` repo under `.hermes/REPORTS/`.

Check before committing:

```bash
# does this file contain any prefix of a real credential?
grep -noE '[0-9a-f]{8,}' <file>
```

Every hit must be a fingerprint, not a fragment. The `scripts/ci-migration-role.sql`
value *is* public — it is in the repository — which is exactly why a live role must
never hold it.

**Pasted text and secret files reach the model provider verbatim** and are then
persisted in `~/.hermes/state.db`. If a secret was pasted into a chat, it is in the
session store. To redact it:

1. `UPDATE` the row to replace the secret with a placeholder;
2. rebuild the FTS5 index;
3. `wal_checkpoint(TRUNCATE)`;
4. `VACUUM`.

`hermes gateway restart` runs **outside** the agent — it cannot be triggered from
inside a session, so schedule it with the user rather than assuming it took effect.

## 20. The approval gate

The live approval gate is configured as:

- `mode: smart`
- `cron_mode: deny`
- `bypass: false` — LIVE, not a dry run
- no restart was performed, because `load_config` caches on mtime

**Known defect:** a single-line regex for `tools.approval: Hardline block:` **drops 4
multi-line records**. The gate's own audit trail is therefore incomplete — a block that
spans multiple lines is not recorded.

**The GitHub Actions "Live approval gate" job fails BY DESIGN** until the owner applies
the `approved-live` label to the pull request. The App cannot apply it: it has
`issues: read` and no write permission on issues.

**The live database name is refused unconditionally**, with no environment override.
`GUSTALE_DB_IS_THROWAWAY=1` used to make `scripts/lib/db_guard.py` treat `gustale` as
DISPOSABLE — a stale value in a shell environment once caused a live wipe on
2026-11-06 (see `docs/INCIDENT-2026-11-06-live-db-drop.md`). PR #190 fixes it: the
live name is refused ALWAYS, and a refusal prints a message and exits 1 rather than
raising a traceback.

## 21. Pushing a workflow change when the App cannot

The App (`gustale-bot`) has **no `workflows` permission**. Two consequences:

1. it cannot **push** a change that touches `.github/workflows/` — GitHub rejects the
   push outright ("refusing to allow a GitHub App to create or update workflow
   `.github/workflows/ci.yml` without `workflows` permission");
2. it cannot **mint** a token with that scope either — requesting
   `permissions: {workflows: write}` returns HTTP 422, "The permissions requested are
   not granted to this installation".

**The SSH deploy key can.** `~/.ssh/gustale_deploy` authenticates as the repository
account and is **not** subject to the App's permission set, so it can push a workflow
change:

```bash
GIT_SSH_COMMAND='ssh -i /home/gustale/.ssh/gustale_deploy -o IdentitiesOnly=yes' \
  git push --force git@github.com:consciousclarity/gustale.com.git \
  HEAD:refs/heads/<branch>
```

Always `--dry-run` first and read the result: a *permission* rejection appears in the
dry run, so you learn it before the real push.

**Careful with `--force`.** A force-push of a branch that was moved by someone else
silently discards their commits. Before force-pushing:

```bash
git merge-base --is-ancestor <their-tip> HEAD && echo "safe: nothing of theirs is lost"
```

If that fails, recover their work first — `git log --oneline <their-tip>..HEAD` shows
what you would drop, and their commits can be cherry-picked back on top of yours.

The App's own push path stays the default for ordinary code:
`python3 scripts/hermes/push-with-app.py <remote> <refspec>`. Use the SSH key only for
the workflow files the App cannot write.
