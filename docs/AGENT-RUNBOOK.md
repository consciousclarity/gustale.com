# The Gustale runbook — the material behind MEMORY.md

**This document is the long form of the working rules that live in
`MEMORY.md`.** The memory store holds the short, load-bearing facts; this
file holds the reasoning, the traps, and the receipts.

Rule 3 (docker is not a back door) applies to this file as it does to
everything else: nothing here was obtained by reaching into a container
or a file the agent could not otherwise read.

---

## 1. The live database

**Rule 1: the agent never writes to live.** The live database is
`gustale` on the shared production cluster (`shared-postgres`). It is
read-only for the agent:

```bash
GUSTALE_LIVE_DB_ALLOW=1 bash scripts/dbq.sh "<SELECT>"
```

* **Never** `ALTER`, `CREATE` or `DROP` the live role or the live
  database.
* `scripts/lib/db_guard.py` refuses the name `gustale` **always** — no
  environment variable can override it.
* Migrations are applied **by the owner, by direct `psql`**. The
  `scripts/apply-migration-live.sh` gate is *not* used for live: it
  creates and drops a copy database, and the copy must land on the
  **test** Postgres, never on the production cluster.

### The 2026-11-06 live wipe

A stale `GUSTALE_DB_IS_THROWAWAY=1` in the shell environment made
`db_guard.py` treat `gustale` as **disposable**, and a diagnostic
`DROP`ped the live database. Real data, real loss.

The fix (PR #190): **the live name is refused unconditionally**. The
throwaway override no longer exists.

Any **new** script that creates or drops a database must resolve the
name through the guard:

```bash
resolved="$(python3 scripts/lib/db_guard.py <script-name> <db-name>)"
```

CI enforces this: `scripts/check-no-live-db-defaults.py` fails the build
if any script can drop a database without refusing the live name.

**Incident report:** `docs/INCIDENT-2026-11-06-live-db-drop.md`

---

## 2. GitHub identity

The personal access token was **revoked**. The only identity is the
GitHub App `gustale-bot` (installation 178310866).

* The App has **no `workflows` scope**, so a workflow change **cannot be
  pushed by the agent**. It ships as a **patch file** the owner applies:
  `docs/ci-*.patch`.
* The App cannot mint a workflow token (HTTP 422).
* The SSH deploy key is **rejected**.
* PR assets cannot be uploaded — commit screenshots instead.
* CI fires only on `pull_request` against `main`.
* **Job logs return 0 bytes** — reproduce the failure locally instead.

```bash
# Push as the App, a VERIFIED sha, never HEAD:
python3 /tmp/push_sha_as_app.py origin <branch> <sha> <expected-remote-sha>

# Rule 2: NEVER force-push (not even --force-with-lease).
git fetch origin <branch> && git log --oneline HEAD..origin/<branch>
#   non-empty  -> the owner pushed commits you lack. Cherry-pick or
#                  merge. NEVER overwrite.
```

Verify a restoration with `git patch-id --stable`, not a sha.

API helper: `gh-app.sh api <METHOD> <path> [JSON_BODY]` — the path
**must** start with `/`. Or `app_api.py GET|PATCH "/repos/..."`.

---

## 3. Migrations: applied means frozen

**Rule 11: once a migration is applied on live, its file is frozen.**
The line is the **apply**, not the commit. Corrections go into a **new
migration number**.

| migration | applied | receipt |
|---|---|---|
| `0050`+`0051` | 2026-11-07 | `docs/MIGRATION-RECEIPT-0050-0051.md` |
| `0052` recipes schema | 2026-11-07 | `docs/MIGRATION-RECEIPT-0052.md` |
| `0053` recipes_published_view | 2026-11-09 | `docs/MIGRATION-RECEIPT-0053.md` |
| `0054` ingredients_category_fk | 2026-11-10 13:01:41 WITA | `docs/MIGRATION-RECEIPT-0054.md` |

`0050` has **no transaction wrapper** — its two `BEGIN`s are PL/pgSQL
blocks, so it ran in AUTOCOMMIT. Live is consistent.

**Do not grep for `BEGIN`** to decide whether a migration is
transactional. The gate is:

```bash
python3 scripts/check-migrations-are-transactional.py
```

### The live-apply method

**Backup first, then apply by direct `psql`.** The backup lives on the
VPS host, not inside the container:

```bash
docker cp shared-postgres:/tmp/pre-XXXX.dump "$DUMP"
```

A plain `cp` **cannot** cross the host/container filesystem boundary
when they do not share `/tmp` — it fails with `cannot stat`.

Before every production migration on `shared-postgres`, start
`gustale-backup.service` and confirm `SUCCESS`. The sequence is:
snapshot, backup, apply, verify.

**`0052` had to be applied before `0053`** — `0053` reads the tables
`0052` creates.

The apply worked example is `docs/LIVE-APPLY-0053.md`.

---

## 4. The provider keys

The agent has a **valid** `ANTHROPIC_API_KEY` and an `OPENAI_API_KEY`.
They are in the shell environment and in the profile `.env` files.

**They must never reach a CLI.** Claude Code checks the key *first*:

| environment | `claude auth status` |
|---|---|
| key present | `loggedIn: true, authMethod: "api_key", apiKeySource: "ANTHROPIC_API_KEY"` |
| key unset | `loggedIn: false, authMethod: "none"` |

`authMethod: "api_key"` means **every call is pay-per-use**. Codex
ignores `OPENAI_API_KEY` (401 either way), but it is unset anyway.

The wrappers `~/.local/bin/claude-sub` and `~/.local/bin/codex-sub`
unset every provider key, then **verify** the auth method and **refuse**
on `api_key` (exit 4) or not-logged-in (exit 3).

**Rule: zero pay-per-use, ever.** If a CLI hits its usage limit, pause
the card, note the reset window, and continue with the other CLI or
MiniMax. Never fall back to an API key. Never buy credits.

**Kimi K3 is off completely** — no profile, no auxiliary slot, no
fallback. `check_model_routing.py` fails if `kimi` or `moonshot`
appears anywhere in any config.

---

## 5. MiniMax, concretely

The **Max-OAuth** cap is **1,048,576 on (input + max_tokens) together**.
The maximum usable **input** is **917,504** at `max_tokens=131072`;
over the cap returns error **2013**.

**The auxiliary slot gates the main session's compression threshold**
(M2.5's 204,800 became 22% of the window). M3.1-Flash handled 450k.

`session-guard` rotates **only** `MINIMAX_OAUTH_MAX_TOKEN`.

Detail: `docs/HERMES-MINIMAX-CONFIG.md`

---

## 6. Hindsight

Writes fail with **401 `invalid api key (2049)`** when the MiniMax key
in `hermes.env` (fingerprint `dd774d302bbd`) is used — it is invalid on
**both** hosts since 2026-11-06. This is **not** a wrong-host issue.

The working key (fingerprint `b47bd6931ae2`) is in
`/home/gustale/.hermes/.env`.

> **The trap:** MiniMax's legacy endpoint returns **HTTP 200** with
> `base_resp.status_code = 2049` — a false success. Check the body, not
> the status code.

**To read `hermes.env` (mode 600, another user's), ask the owner.**
Docker is **forbidden** as a back door (Rule 3).

Fixed 2026-11-08 when the owner swapped the key; `last_memory_write_at`
moves again now.

Detail: `docs/HINDSIGHT-WRITE-FAILURE.md`

---

## 7. The taxonomy — three vocabularies, one of them retired

| # | vocabulary | status |
|---|---|---|
| **A** | `categories` where `kind = 'family'` | **RETIRED** |
| **B** | `categories` where `kind = 'dish-type'` | the payload's `familySlug` → the home dropdown |
| **C** | `dish_families` (123 rows) | `/api/atlas/counts` and the `family=` filter |

The **payload reads B**; the **hero KPI reads C**. `content_type` is
**EDITORIAL** and has **no sync trigger**. Pelamushi is a **DESSERT**
(`0049`).

---

## 8. The live evidence base — why nothing can auto-publish

* All **1,486** sources are **S6 / Wikipedia**. **Zero** are S1–S5.
* All **1,354** statements are `research_pending`, so the `verified`
  gate is **UNREACHABLE**.
* `publish_credential` is **EMPTY**.
* `ingredients`: **5 rows**, all published.

**Consequence: no recipe can reach HIGH, and nothing auto-publishes
until real S1–S5 sources arrive.** Gate D is blocked on evidence, not
on code.

The recipes sitemap holds **55** Atlas pages (43 `/family/<slug>` +
12 `/lineages/<slug>`). `/family` is a **404 on both sites** — the
index is `/families`.

Detail: `ADR-007-A1` §1.4 and §5.3.

---

## 9. The recipes kanban board

* Board slug: `recipes`
  (`/home/alex/.hermes/kanban/boards/recipes/kanban.db`)
* Project: `gustale-com`
  (primary: `/home/alex/projects/gustale.com`)
* Web view: the Hermes dashboard kanban plugin at
  `http://127.0.0.1:9119/plugins/kanban/`
  (start it with
  `hermes dashboard --port 9119 --host 127.0.0.1 --no-open`;
  the API under it needs auth, the **browser page does not**)

Three lane profiles:

| profile | may do |
|---|---|
| `recipes-db` | the **only** lane that may create a migration (item 4: API + Drizzle) |
| `recipes-fe` | 6b, then item 5 |
| `research` | item 3 — docs only |

The gateway dispatcher claims cards and spawns workers automatically. A
project-anchored card gets its own worktree at
`.worktrees/<task-id>` and its own branch.

**`main` is branch-protected** — a direct push is rejected, so every
change ships as a PR.

---

## 10. Operational hygiene

* **Batch tool calls into ONE turn.** A session was once truncated by
  the per-turn cap.
* **An exit code through a pipe is the pipe's**, not the command's.
  Redirect to a file, then capture `RC=$?`.
* The rebuild timer honours `GUSTALE_NO_PUSH=1` (never pushes to
  ghcr) — the best API-liveness oracle available.
* **After the owner merges, re-fetch and check that `main` actually
  contains your commits.** A merge is **not** a signal that your work
  landed. Open a follow-up PR off `origin/main` for anything pushed
  after the merge. This happened on PR #202.

---

## 11. The rules themselves

The standing rules live in the repository: `docs/RULES.md`. It has
**11 rules**. The ones that bite hardest:

* **Rule 1** — the owner applies live migrations and deploys.
* **Rule 2** — never force-push, absolutely, `--force-with-lease`
  included.
* **Rule 3** — docker is **not** a back door. Reaching into a file,
  user or container the agent could not otherwise reach is forbidden.
  Docker access is root. It is allowed **only** for the
  `gustale-test-postgres` container and the documented build/deploy
  scripts.
* **Rule 11** — an applied migration is immutable.
