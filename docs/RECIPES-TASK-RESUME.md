# Recipes task — resume state

**Written:** 2026-11-07, at the end of the session that completed item 0.
**Read this first** in a new session, then check the PR states below.

The task: "Recipes for every dish, on gustale.recipes". Eight ordered items,
one PR each, the owner merges each. Decisions are the owner's; where
something conflicts with existing code or an ADR, **report it, don't decide it**.

---

## The status table

**Updated with every push.** If a row is stale, the table is wrong — fix
it in the same commit as the push it describes.

| item | status | PR | blocked on |
|---|---|---|---|
| **0** | dry-run on the test Postgres + the BEGIN/COMMIT check | **MERGED** — #199 | — |
| **1** | ADR-007 amendment (docs only) | **MERGED** — #200 | — |
| **2** | schema migration `0052` | **MERGED** — #202, then **FIXED** — #203 (the shared-`statements` security hole). **APPLIED TO LIVE** 2026-11-09 by the owner | — the file is now **frozen** (Rule 11) |
| **3** | ingredient backfill plan + the S1–S7 source tier list | **MERGED** — #206 (docs). **The owner's decisions are recorded** (vocabulary = the 435-row FoodOn table, no `other`; S4 = WorldCat/LoC; pilot = moussaka-greek then nasi goreng) | the owner must still **approve** the tier list and the backfill stages |
| **4** | API: hub + recipe endpoints, publish gate, kill switch **+ the Drizzle schema in both places** | **MERGED** — #207. `0053` **APPLIED TO LIVE** 2026-11-09 by the owner | — `0053` is now **frozen** (Rule 11) |
| **5** | gustale.recipes recipe page v1, empty-state noindex | **IN PROGRESS** — kanban `t_4dc80a38` (FE lane) | the item-4 API is live |
| **6** | Atlas button + "Recipes for this dish" block | not started | — |
| **7** | revised 6c: redirects + recipes sitemap | not started | the exact 301 path set is known (§5.3 of the amendment) |
| **8** | content pipeline: drafting, confidence, daily digest | not started | real S1–S5 sources — today **all 1,486 sources are S6**, so nothing can reach HIGH |
| **6b** | the recipes home (runs in parallel, not part of the 8) | **MERGED** — #208 | — |

### The kanban board

**Board: `recipes`** — `hermes kanban boards switch recipes`, then
`hermes kanban list`. The web view is the Hermes dashboard's kanban
plugin at `http://127.0.0.1:9119/plugins/kanban/` (the dashboard runs
locally: `hermes dashboard --port 9119 --host 127.0.0.1 --no-open`).

**Three lanes, at most three workers.** A lane is a Hermes profile; the
gateway's dispatcher claims the card and runs the worker in its own
worktree.

| lane | profile | card | may create a migration? |
|---|---|---|---|
| **DB** | `recipes-db` | item 4 (API + Drizzle) | **YES — the only lane that may** |
| **Frontend** | `recipes-fe` | 6b, then item 5 | **NO** |
| **Research** | `research` | item 3 (docs only) | **NO** |

Every worker's rules: its own git worktree and branch, its own test DB
on port 5434 named after the card and **dropped when done**, no SSH, no
live DB, no deploy, no force-push. The output is **a PR**.

The lane boundary is enforced by the **card body**, not by convention:
the DB card says it is the only lane that may create a migration, and
the other two say a schema need is a *report*, not an edit. A lane that
crosses the boundary has failed its card even if the code is perfect.

---

## Where the task stands

| item | what | state |
|---|---|---|
| **0** | dry-run on the test Postgres + the BEGIN/COMMIT check | **MERGED** — PR #199 merged 2026-11-07 22:55 UTC (owner applied `approved-live`). `main` CI green. |
| **1** | ADR-007 amendment (docs only) | **MERGED** — PR #200 merged 2026-11-07. The owner's 5 decisions are IN (§10 of the ADR). |
| 2 | schema migration (recipes + confidence + contributor trust) | **MERGED, then FIXED** — PR #202 merged 2026-11-08 (migration `0052`). The owner found a **security hole** in it (a recipe claim could name an **Atlas** statement, and auto-publish would publish it). Fixed in **PR #203** — see below. |
| 3 | ingredient backfill plan, then a pilot | not started |
| 4 | API: hub + recipe endpoints, publish gate, kill switch | not started — **and the Drizzle schema goes HERE**, not in item 2. See the note below. |
| 5 | gustale.recipes hub + recipe page v1, empty-state noindex | not started |
| 6 | Atlas button + "Recipes for this dish" block | not started |
| 7 | revised 6c: redirects + recipes sitemap | not started — the exact 301 path set is now known (§5.3 of the amendment) |
| 8 | content pipeline: drafting, confidence, daily digest | not started |

PR 6b (R1, recipes home) is running in parallel and is not part of this list.

### The Drizzle schema belongs to item 4, not item 2 (owner, 2026-11-08)

`CLAUDE.md` requires the schema in **two places**:
`packages/db/src/schema/index.ts` AND `db/schema.sql`. Item 2 (the
migration `0052`) does **NOT** touch either — the migration is the
database side of it, and the owner explicitly deferred the TypeScript
schema to item 4 (the API work). So item 4 carries BOTH halves of the
Drizzle schema, and they must land together.

**Also note:** `db/schema.sql` is a *dump* of the live schema, so it
cannot be regenerated until `0052` is applied to live. That is one more
reason item 4 waits on the live application of `0052`.

---

## Item 1 — the ADR-007 amendment (DONE)

**File:** `docs/ADR-007-A1-recipes-confidence-autopublish-contributors-language-urls.md`

**Status: PROPOSED — awaiting the owner's approval.** Docs only; no code,
no migration, no live write.

It covers the five things the owner decided on 2026-11-07:

| § | what |
|---|---|
| §1 | **Confidence** — HIGH/MEDIUM/LOW, computed from the rows, not a flag. HIGH is a **conjunction**: 2+ *independent* sources, every ingredient published, every sentence sourced |
| §2 | **Conflict 1** — auto-publish as a **server-side rule** (`recipe_auto_publish()`), not the agent publishing |
| §3 | **Conflict 2** — the ingredient backfill, in three stages with a review gate at each |
| §4 | **Conflict 3** — original-language-first, and the `en`-source constraint it collides with |
| §5 | **The URL scheme** — the three URLs, the hub's empty state, the revised 6c, the sitemap and canonicals |
| §6 | **Contributor trust** — the ladder, and what a trusted contributor may publish on |
| §7 | **The safeguards** — kill switch, daily cap of 20, daily digest |
| §8 | **The schema it implies** — the new tables, the changes to existing tables, the confidence computation |

**Three findings the owner should know about:**

1. **Every one of the 1,486 sources in the live database is `S6`**
   (Wikipedia). There is not one `S1`–`S5`. All 1,354 statements sit at
   `research_pending`, so the `verified` gate is unreachable for all of
   them. **Consequence: with today's data no recipe can be HIGH, and
   nothing auto-publishes.** The auto-publish path is dormant until real
   sources arrive. That is correct behaviour, but the pipeline (item 8) is
   what eventually turns it on.
2. **The ingredient count is 5, not 4** — the brief's "4" is the number
   of *used* ingredients; all 5 rows are published (the fifth,
   `bechamel-sauce`, is an unused near-duplicate of `bechamel`).
3. **The 301 path set in the brief does not match the live routes.**
   The recipes sitemap holds **55 Atlas pages** — 43 `/family/<slug>` and
   12 `/lineages/<slug>` — and `/family` (the index) is a **404**. Every
   candidate target was checked to exist on the Atlas (all 200).

**The five open decisions (§10)** — items 2 and 4 need the first two
before the migration can be written:

1. **The service account for auto-publish.** `statement_set_status()`
   needs a session token for an actor holding a verified `publisher`
   credential, and 0048 refuses bot accounts. The recommendation is a
   dedicated human-named service account — which needs the owner's
   explicit approval, because it is exactly what the `-bot` rule exists
   to prevent. The alternative is to amend 0048 so the rule is an
   explicit service-account list rather than an email-suffix heuristic.
2. **The trusted-contributor standard** — content conditions only
   (proposed), or also the source-independence condition?
3. **The 301 path set** — the three index paths, or also the 55 detail
   pages?
4. **The kill switch's default** — `disabled` is proposed.
5. **The daily cap of 20** — confirm.

---

## Item 2 — the schema migration `0052` — MERGED, then FIXED

**PR #202** (migration `0052`) was **merged 2026-11-08 at `6b51e44`**,
with the owner's own commit `a9e2279` (the CI workflow step) applied
first. The owner applied `approved-live`.

**Then the owner found a security hole in it**, and it was real:

> `recipe_claims.statement_id` may reference ANY statement, including
> Atlas dish/place statements (`statements` is shared).
> `recipe_auto_publish()` then verifies + publishes every statement
> behind the recipe's claims, so a HIGH recipe linked to an Atlas
> statement would publish that Atlas claim with no review.

**Reproduced end to end in the sandbox before the fix**: the Atlas
statement moved `draft` → `published`, `published_by =
system:auto-publish`.

**The fix is PR #203** (`fix/recipes-claims-scope-0052`), which adds:

1. a trigger on `recipe_claims` — a claim may only name a statement with
   `subject_type = 'recipe'` AND `subject_id` = the recipe that owns the
   linked sentence; enforced on INSERT **and** UPDATE;
2. a trigger on `statements` — a claimed statement cannot be moved out
   from under its claim (the claim-side trigger does not fire when the
   *statement* is edited, so this covers the other way in);
3. `statement_set_status()`'s system-actor branch — the transition is
   refused unless the statement is the recipe's own (the
   **authorisation**, which must not depend on a trigger being present);
4. condition 4 and the publish loop — restricted to the recipe's own
   statements.

**Condition 4 — the owner's confirmed reading (2026-11-08):** the
evidence must be present **BEFORE** the transition, and the transition
function **lifts** the statement to verified/published. That is what
makes the ADR's literal wording non-circular. Recorded in ADR-007-A1
§8.3 and the new §8.5.

**The proof** is inside the migration's own transaction, so a failed
proof rolls the migration back: (a) the link is refused on INSERT and
UPDATE, (b) with the link **forced in**, a valid token for the Atlas
statement is refused and the statement does not move, (c) the control —
the recipe's OWN statement — still publishes, (d) a claimed statement
cannot be moved. It is **mutation-tested**: removing the trigger, the
authorisation clause, the statements-side trigger, or condition 4's
scope each makes it fail.

**Also fixed:** an operator-precedence bug in auto-publish's audit
formatting — `key || ': ' || value ->> 'detail'` parses as
`(key || ': ' || value) ->> 'detail'`, because `||` binds tighter than
`->>`.

**The receipt:** `docs/MIGRATION-RECEIPT-0052.md`.

**APPLIED TO LIVE 2026-11-09, by the owner.** Backup
`/home/gustale/backups/pre-0052-20261109-090734.dump` (4.4 MB, 1,526
TOC entries), dry-run `DRYRUN_OK=1`, applied by direct `psql` (the gate
script creates and drops a copy **on the production cluster**, which
RULES.md forbids — it is fixed in **PR #209**). Every §4 check
passed. The checklist is `docs/LIVE-APPLY-0052.md`.

**`0052` is now FROZEN** (Rule 11). Fixes go into a new number —
`0053` is exactly that, and it is applied too.

---

## Item 4 — the API, the Drizzle schema, and `0053` — MERGED, APPLIED

**PR #207**, merged as `492282c`. `0053` **applied to live 2026-11-09** by
the owner: backup
`/home/gustale/backups/pre-0053-20261109-105116.dump` (4.5 MB), `RC=0`,
`RECIPES_PUBLISHED_VIEW_OK=1`, `recipe_published` = 0 rows, all six
indexes present, auto-publish still off.

**The receipt:** `docs/MIGRATION-RECEIPT-0053.md`.
The checklist: `docs/LIVE-APPLY-0053.md`.

**`0053` is now FROZEN** (Rule 11).

---

## Item 0 — PR #199 — **MERGED**

**Branch:** `fix/item0-dryrun-test-postgres-and-transactional-migrations`
**Merge commit:** `98eea60` (2026-11-07 22:55 UTC), owner applied `approved-live`.
`main` CI: green.

**Commits (all now in `main`):**

- `bd1c697` — fix(db-safety): the dry-run runs on the test Postgres; every
  migration must be transactional
- `7413981` — docs(runbook): §8a every migration must be transactional; §8b the
  dry-run's copy is on the test Postgres
- `6b0c573`, `794599b`, `564cc8b`, `d24124d` — the resume doc, the GitHub API
  helper, and the runbook notes
- `061e597` — **the owner's own commit**, "ci: every migration must be wrapped
  in a transaction", adding the transactional-migration CI step to
  `.github/workflows/ci.yml`

**What changed**

1. `scripts/dryrun-migration.sh` restores its copy on `gustale-test-postgres`
   (port **5434**), not on the production cluster. The live database is only
   ever **read**, and only by `pg_dump`. The snapshot is taken inside the
   production container (that is where the `pg_dump` binary is) and copied out
   with `docker cp` — the host and the container do not share `/tmp`. The
   script drops its copy and both snapshots when it finishes.
2. Its allowlist exemption in `scripts/check-no-production-db-drops.py` is
   **removed**, and `scripts/test-check-no-production-db-drops.py` now drives
   the scanner with the dry-run's old shape to prove it is **caught**, plus
   asserts the exemption stays removed.
3. New `scripts/check-migrations-are-transactional.py` + its test. It does
   **not** grep for the word `BEGIN` — it tells a transaction wrapper from a
   PL/pgSQL block. Thirteen legacy migrations are on a frozen, explicit
   grandfathered list; `0050` and `0048` are on it and are **not** rewritten.
4. `docs/MIGRATION-RECEIPT-0050-0051.md` corrected (the wrong `BEGIN`/`COMMIT`
   claim, the "both are transactional" line, the leftover-copy note).
5. `docs/DATABASE-SAFETY.md` §4, `docs/OPERATIONS-RUNBOOK.md` §8a/§8b updated.

**Verified**

- the new dry-run ran end to end: 0051 applied to a restored copy on the test
  container, idempotent re-apply OK, and afterwards **both** clusters carry no
  copy and no snapshot;
- the new CI step was run in a scratch checkout and was **proved to fail**
  (exit 1) on a migration whose wrapper was stripped;
- every gate this PR touches is exit 0, and `pnpm lint` is exit 0.

**Two things the owner must do — BOTH DONE**

1. ~~Apply the `approved-live` label to PR #199.~~ **Done** — applied and
   merged 2026-11-07 22:55 UTC.
2. ~~Apply the CI step, which ships as a patch because the App has no
   `workflows` scope:~~ **Done** — the owner committed the CI step directly
   as `061e597`, so the patch file is no longer needed. The step is now live
   in `.github/workflows/ci.yml` on `main`:

   ```
   - name: Every migration must be wrapped in a transaction
     run: |
       python3 scripts/test-check-migrations-are-transactional.py
       python3 scripts/check-migrations-are-transactional.py
   ```

   `docs/ci-transactional-migration-check.patch` is kept in the repo as the
   record of how it was shipped, but applying it now would duplicate the step.

**No live database write** happened in this PR.

---

## The two corrections, and why they mattered

**1. The dry-run created its copy on the production cluster.** `DROP DATABASE`
and `CREATE DATABASE` are **cluster-scoped**, and `shared-postgres` hosts the
live database plus five other projects' databases, so this violated
`docs/DATABASE-SAFETY.md` §1. It went well, which is exactly why it is
dangerous — "it worked once" is not a defence for a rule. The exemption's
reason ("the copy must be on the same cluster to be faithful") was **wrong**:
a `pg_dump | pg_restore` copy is faithful wherever it is restored.

**2. 0050 has NO transaction wrapper.** The receipt had claimed 0050 "contains
a `BEGIN` and no `COMMIT`". Wrong. 0050 contains the *word* `BEGIN` twice, at
lines 266 and 500, and both are **PL/pgSQL block openers** (`BEGIN … END $$;`).
`0051` is wrapped: `BEGIN;` at line 57, `COMMIT;` at line 606. So **0050 ran in
AUTOCOMMIT**. It succeeded, so live is consistent and the end state matches the
plan exactly — but a failure part-way through would have left the three tables
created, the trigger installed, and only some of the 50 pilot rows updated, with
no `ROLLBACK` able to undo any of it.

The commit proof was still worth doing, for a different reason than the one
the receipt gave: for `0051` (transactional) the same-session read-back is a
sound check, while for `0050` it proved the rows are on disk rather than merely
visible in an open session.

---

## Item 1 — the ADR-007 amendment (DONE)

**Written.** `docs/ADR-007-A1-recipes-confidence-autopublish-contributors-language-urls.md`
— see the section above for what it covers and the five open decisions.

<details><summary>The original brief for item 1 (kept for the record)</summary>

The **ADR-007 amendment**. Docs only, no code. It must cover the three
conflicts the owner listed, plus the new rules:

1. **Migration 0048 forbids a bot from holding a publish credential, and it
   stays.** Auto-publish must be designed as a **server-side rule** that
   evaluates the HIGH conditions itself — not as the agent publishing.
2. **ADR-007 requires every ingredient to be a published Atlas ingredient;
   there are 4.** Propose the ingredient backfill: sources, review, order.
3. Add to ADR-007: the confidence level, the auto-publish rule, contributor
   trust after 3, original-language-first, and the URL scheme.

The URL scheme the owner settled on:

| URL | what |
|---|---|
| `gustale.com/dishes/<slug>` | the Atlas dish — unchanged |
| `gustale.recipes/dishes/<slug>` | the **recipe hub** for that dish |
| `gustale.recipes/recipes/<slug>` | **one** recipe; each variation is its own full recipe (ADR-007) |

Rules that go with it: a hub with zero published recipes says "No recipe yet",
links to the Atlas and "Add the first recipe", and is **noindex**; it becomes
indexable automatically at ≥1 published recipe. **PR 6c is revised: no 301 for
`/dishes/*` on gustale.recipes**; still 301 `/regions`, `/families`,
`/lineages` to gustale.com. The recipes sitemap lists indexable hubs and
published recipes only. Every page self-canonicals on its own site.

</details>

**What the amendment adds on top of the brief** — the brief's own words
are above; these are the parts the live database forced:

- the **independence** condition (§1.2), because `statements.independence`
  exists and is unused;
- the **`S1`–`S5` source-class rule** (§1.3), because every source today
  is `S6`;
- the **service-account conflict** (§2.4), because `publish_credential`
  is empty and 0048 refuses bot accounts;
- the **language-first CHECK for `recipe_sentences`** (§4.3), the mirror
  image of `description_sentences`' English-source CHECK;
- the **55 Atlas pages in the recipes sitemap** (§5.3), which the brief's
  three-path 301 does not cover.

---

## The standing rules now live in `docs/RULES.md`

`docs/RULES.md` is the repo-wide standing-rules file, created 2026-11-08
from two rule breaks. **Read it before any push, any docker call, and
any live-database operation.** The three push traps below are also
written up in `docs/OPERATIONS-RUNBOOK.md` §1 and §1a.

**Rule 2 (absolute): never force-push.** `--force-with-lease` is
included. If history needs fixing, push a NEW commit or ask.

**Rule 3 (new): docker is not a back door.** Using docker to reach
files, users, containers or processes I otherwise could not is
forbidden — docker access *is* root access. Docker is allowed **only**
for the test Postgres container (`gustale-test-postgres`) and the
documented build/deploy scripts (`/home/deploy/gustale-rebuild/`).

---

## Item 1 — the ADR-007 amendment (DONE — the owner's 5 decisions are IN)

**Status 2026-11-08: PR #200 carries the owner's five decisions and is
ready for the owner to merge.** The five open decisions are **closed**;
the document is written to match them.

| # | decision | the owner's answer | where |
|---|---|---|---|
| 1 | the auto-publish actor | **the system actor `system:auto-publish`** — no login, no email, no password, no session, no credential; acts only inside `recipe_auto_publish()`. **No account creation.** | §2.4 |
| 2 | the trusted-contributor standard | a trusted contributor **also** needs **2 independent sources**; without them → **Alejandro's review queue** | §6.2 |
| 3 | the 301 path set | the **full set** — 3 indexes + 43 `/family/<slug>` + 12 `/lineages/<slug>` = **58 paths** | §5.3 |
| 4 | the kill switch's default | **OFF at launch** | §7.1 |
| 5 | the daily cap / the digest | **cap 20**, and the **digest from day one** | §7.2, §7.3 |

**Two of the five were inverted in the first draft and were corrected on
2026-11-08.** Both corrections are recorded in the ADR itself, because
an ADR is a record of decisions *including the ones that changed*:

**1. The publisher — the actor is `system:auto-publish`, not an account.**
The first draft proposed a human-named service account
(`recipes-publisher@gustale.com`) holding a publish credential — and
then contradicted itself by saying listed accounts are *refused*
credentials. Both are deleted. The actor is now a **row** on
`service_accounts` with **no login, no email, no password, no session
and no credential**, and it acts **only** inside `recipe_auto_publish()`
(`SECURITY DEFINER`), which re-checks every HIGH condition, the kill
switch and the cap before performing the transition. The amended 0048
refuses a credential to **any** listed system actor and says exactly
how the system actor publishes anyway: through its own function, not
through the credential path. No human and no bot can use it. **The
item-2 migration needs no account creation at all.**

**2. The wording — published text is in OUR OWN WORDS, never copied.**
The first draft said "own wording is never HIGH", which had it
backwards: it required quoting source text in order to reach HIGH, and
quoting is exactly what the owner forbids. The corrected rule:

- **published recipe text MUST be in our own words, never copied**;
- **provenance = each core claim links to its source with an exact
  locator** (page / section / URL);
- at most a **one-sentence verification excerpt** is stored internally —
  **never rendered, never published**;
- **HIGH depends on 2 independent `S1`–`S5` sources supporting the
  claims**, not on stored quotes.

Condition 7 in §8.3 is replaced by **7′ (locator provenance)**, and the
daily digest (§7.3) now shows the **locator**, not the source text.

**Plus the other source rule that stands**, a hard condition on HIGH:
**a Wikipedia-only recipe is never HIGH** (§1.3, condition 5a), with the
source tiers — cookbook `S4`/`S5`, institution `S3`, established site
`S1`/`S2` may support HIGH; reference `S6` may not.

**The effect on the schema** (§8): `service_accounts` is a new table
(`actor`, `kind='system'` — a CHECK that makes it impossible for the
table to hold a person); `recipe_publish_log` gains
`service_account_id`; `recipe_settings.auto_publish_enabled` defaults
to `false` and `auto_publish_daily_cap` to `20`.

**The effect on the auto-publish function** (§8.4): it has **no
contributor branch**. Trust is not a parameter of it, because making it
one would be the mechanism by which the evidence bar got lowered.

**Item 2 is unblocked.** What the owner still has to *do*: give the
`approved-live` label and a separate go for the item-2 migration.
**That is all** — no account, no credential, no secret.

---

## The standing rules for the whole task

- **No live database writes without the owner's explicit go, per operation.**
- Exit codes captured **without a pipe** (`cmd > file; RC=$?`).
- If a permission or rule blocks you, **stop and ask**. Never route around it.
- Migrations need `approved-live` **and** a separate "go".
- Redirects ship only with the owner's go.
- Secrets are never printed; pass them as files.

---

## Hindsight (separate thread — ROOT CAUSE FOUND)

**The write failure is an INVALID MiniMax key, not a wrong host.** Proven
2026-11-08:

- The owner's edit was correct: all four `HINDSIGHT_API_*_BASE_URL` lines read
  `https://api.minimax.io/v1`, and the daemon restarted 35 s after the edit
  (06:58:08 vs mtime 06:57:33). The URL was never the cause.
- The key in `hermes.env` (fingerprint `dd774d302bbd`) is rejected with 2049
  by **both** hosts, on every model and every endpoint. The key in
  `/home/gustale/.hermes/.env` (`b47bd6931ae2`) returns HTTP 200 on
  `api.minimax.io`. That key is unchanged in all three env backups, so it has
  been invalid since the first 2049 on **2026-11-06 07:23Z**.
- Last successful bank write: **2026-10-30 22:44:01Z**. `llm-requests` has
  **0** success rows and **246** failed operations. Recall still works (it
  needs no LLM); only retain and reflect are broken.
- **Trap:** MiniMax's legacy endpoint answers HTTP 200 with
  `base_resp.status_code=2049`. A status-only probe reads a false success.
- The earlier claim "2049 comes only from the China host" was **wrong** — it
  came from the working key happening to be global-only.

**The fix needs the owner** (the env file is mode 600, owner `hermes`; `gustale`
cannot write it and has no passwordless sudo): put the working key in
`HINDSIGHT_API_LLM_API_KEY` and restart `hindsight.service`.

After he says to test: one write, one recall, report the new
`last_memory_write_at`.

Full write-up: `docs/HINDSIGHT-WRITE-FAILURE.md` (PR #201).

---

## Where the long material lives

| topic | file |
|---|---|
| database rules, the three container rules | `docs/DATABASE-SAFETY.md` |
| the 0050/0051 apply, backup, end state | `docs/MIGRATION-RECEIPT-0050-0051.md` |
| operational runbook (§8a transactions, §8b the dry-run) | `docs/OPERATIONS-RUNBOOK.md` |
| the Hindsight 2049 root cause | `docs/HINDSIGHT-WRITE-FAILURE.md` |
| the 2026-11-06 live-drop incident | `docs/INCIDENT-2026-11-06-live-db-drop.md` |
| the live approval gate | `docs/ADR-005-live-approval-gate.md` |
| the recipes ADR and its amendment | `docs/ADR-007*.md` |
| the Hermes / MiniMax configuration | `docs/HERMES-MINIMAX-CONFIG.md` |

Memory is at **79%** and holds only a thin index into these documents.

---

## The three push traps (write these down before the next push)

1. **`push_as_app.py` pushes `HEAD`, not the branch you name.** If the
   working tree is on a different branch, the wrong commit lands on the
   remote branch and the local repo looks perfectly correct. It happened
   on 2026-11-07: PR #200 briefly showed 13 changed files instead of 1.
   **After every push, read the PR's file list back**
   (`GET /repos/…/pulls/<N>/files`) and compare `git ls-remote` against
   what you committed.
2. **`gh-app.sh` is Python with a `.sh` suffix** — `spec_from_file_location`
   returns `None` without an explicit `SourceFileLoader` — and its `api`
   mode builds the URL with no slash, so the path must start with `/` or
   curl exits 6.
3. **NEVER force-push a branch the owner may have pushed to.** On
   2026-11-08 the owner's own commit `061e597` ("ci: every migration must
   be wrapped in a transaction", pushed 06:49) sat on the item-0 branch
   tip. A `--force-with-lease` push at 07:40 **silently dropped it**,
   because the lease only protects against changes made *after* the
   recorded remote SHA was read — and the owner's commit was already in
   that SHA's history but *not* in the local branch.

   **The rule:** before pushing, run
   `git fetch origin <branch>` and
   `git log --oneline HEAD..origin/<branch>`. If that lists anything, the
   owner pushed commits you do not have — **merge or cherry-pick them, do
   not overwrite them.** Verify afterwards with
   `git patch-id --stable` on both commits, not by SHA (a cherry-pick gets
   a new SHA).

   If a commit *was* dropped: it is usually still in `main` via the merge
   commit, or recoverable from `git fsck --lost-found` / the PR's
   `head.sha`. `GET /repos/…/pulls/<N>` keeps the old `head.sha` even
   after the branch is rewritten.

All three are written up in `docs/OPERATIONS-RUNBOOK.md` §1.
