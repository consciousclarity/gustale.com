# Recipes task — resume state

**Written:** 2026-11-07, at the end of the session that completed item 0.
**Read this first** in a new session, then check the PR states below.

The task: "Recipes for every dish, on gustale.recipes". Eight ordered items,
one PR each, the owner merges each. Decisions are the owner's; where
something conflicts with existing code or an ADR, **report it, don't decide it**.

---

## Where the task stands

| item | what | state |
|---|---|---|
| **0** | dry-run on the test Postgres + the BEGIN/COMMIT check | **code done**, PR #199 open, waiting on the owner's label |
| **1** | ADR-007 amendment (docs only) | **DONE** — `docs/ADR-007-A1-recipes-confidence-autopublish-contributors-language-urls.md`, 12 sections. **5 open decisions for the owner** (§10) |
| 2 | schema migration (recipes + confidence + contributor trust) | not started — **blocked on 2 of the owner's decisions** (service account, trusted-contributor standard) |
| 3 | ingredient backfill plan, then a pilot | not started |
| 4 | API: hub + recipe endpoints, publish gate, kill switch | not started |
| 5 | gustale.recipes hub + recipe page v1, empty-state noindex | not started |
| 6 | Atlas button + "Recipes for this dish" block | not started |
| 7 | revised 6c: redirects + recipes sitemap | not started — the exact 301 path set is now known (§5.3 of the amendment) |
| 8 | content pipeline: drafting, confidence, daily digest | not started |

PR 6b (R1, recipes home) is running in parallel and is not part of this list.

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

## Item 0 — PR #199

**Branch:** `fix/item0-dryrun-test-postgres-and-transactional-migrations`
**Commits (pushed, local == remote at `7413981`):**

- `bd1c697` — fix(db-safety): the dry-run runs on the test Postgres; every
  migration must be transactional
- `7413981` — docs(runbook): §8a every migration must be transactional; §8b the
  dry-run's copy is on the test Postgres

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

**Two things the owner must do**

1. Apply the `approved-live` label to PR #199. The **Live approval gate**
   is failing because `scripts/dryrun-migration.sh` is a protected path under
   ADR-005 — and the label only counts when the owner applies it.
2. Apply the CI step, which ships as a patch because the App has no
   `workflows` scope:

   ```
   git apply docs/ci-transactional-migration-check.patch
   ```

   It applies cleanly, the patched workflow is valid YAML with the step in the
   `lint` job, and the step was verified in a scratch checkout.

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

## Standing rules for the whole task

- **No live database writes without the owner's explicit go, per operation.**
- Exit codes captured **without a pipe** (`cmd > file; RC=$?`).
- If a permission or rule blocks you, **stop and ask**. Never route around it.
- Migrations need `approved-live` **and** a separate "go".
- Redirects ship only with the owner's go.
- Secrets are never printed; pass them as files.

---

## Hindsight (separate thread, owner is on it)

Writes fail with `invalid api key (2049)`; reads work. 2049 comes **only** from
`api.minimaxi.com` — the global host returns 200/1004/404 and never 2049 — so
the daemon is calling a China-region host while the key itself is valid. The bad
value is **inherited**: systemd's `EnvironmentFile=` only shadows variables it
defines, so deleting the base-URL line *exposed* an inherited one.

The owner is fixing it. When he says to test:

1. one write,
2. one recall,
3. report the new `last_memory_write_at`.

Full write-up: `docs/HINDSIGHT-WRITE-FAILURE.md`.

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
| the recipes ADR being amended | `docs/ADR-007*.md` |

Memory is at **68%** and holds only a thin index into these documents.
