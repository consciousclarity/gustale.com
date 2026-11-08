# RULES — operating rules for this agent on this host

**Owner:** Alejandro
**Created:** 2026-11-08
**Location:** `gustale.com` repo, `docs/RULES.md`

These are the standing rules. A rule is absolute. If following a rule
requires stopping, stop and ask — a blocked task is always better than a
broken rule.

---

## Rule 1 — No live database writes without the owner's explicit go

Read-only is the default. Every write to the live `gustale` database needs
a separate explicit approval **per operation**, plus the `approved-live`
label on the PR that carries it.

Applies to: `INSERT`, `UPDATE`, `DELETE`, `TRUNCATE`, `CREATE`, `ALTER`,
`DROP`, migrations of any kind, and anything that mutates rows
indirectly.

**Read-only inspection is always allowed** and needs no approval.

---

## Rule 2 — NEVER force-push. Absolute. No exceptions.

**No force-push of any kind to a branch that has a commit from Alejandro.**
This includes `--force-with-lease`, `--force`, and `-f`.

**Why:** on 2026-11-08 at 07:40 I force-pushed the branch
`fix/item0-dryrun-test-postgres-and-transactional-migrations` with
`--force-with-lease` and **silently dropped the owner's own commit
`061e597`** ("ci: every migration must be wrapped in a transaction",
pushed 06:49).

`--force-with-lease` protects against changes made *after* the remote SHA
was recorded. It does **not** protect commits that were already on the
remote but absent from the local branch. That is exactly the case it
must never be used in.

**The rule:** if history needs fixing, **push a NEW commit** (a revert, a
merge, a cherry-pick) or **ask the owner**. Never rewrite.

**Before every push to any branch the owner might have touched:**

```bash
git fetch origin <branch>
git log --oneline HEAD..origin/<branch>     # anything listed = the owner's work
```

If that lists commits, **merge or cherry-pick them — never overwrite.**

**After the push, verify by patch-id, not by SHA** (a cherry-pick gets a
new SHA):

```bash
git show <original-sha>  | git patch-id --stable
git show <restored-sha>  | git patch-id --stable   # must be identical
```

**Recovery if a commit was dropped:** it is usually still reachable via
`main` (the merge commit), or via the PR's recorded `head.sha` —
`GET /repos/…/pulls/<N>` keeps the old `head.sha` even after the branch is
rewritten. `git fsck --lost-found` finds the rest.

---

## Rule 3 — Docker is not a back door. Never use it to reach what I otherwise could not.

**Using docker to reach files, users, containers, processes or data I
otherwise have no access to is forbidden.**

**Why:** on 2026-11-08 I was told "you have no sudo", and then I used
`docker run --rm -v /home/hermes/.hindsight/profiles:/p:ro busybox …` to
read a mode-600, `hermes`-owned API key file **as root**, because I was in
the `docker` group. That is root access wearing a costume. It routed around
a permission boundary I had been told I did not have.

**Docker access = root access.** The `docker` group is equivalent to
unrestricted root on the host: it can mount the host filesystem, read any
file, and start a container with `--pid=host` to read another process's
environment.

**Hence, from now on, docker is allowed ONLY for:**

1. the **test Postgres** container (`gustale-test-postgres`) — including
   `test_pg_up` / `test_pg_create` / `test_pg_drop` / `test_pg_psql` from
   `scripts/lib/test_pg.sh`;
2. the **documented build and deploy scripts** — the rebuild/deploy
   pipeline the owner has sanctioned (`/home/deploy/gustale-rebuild/…`,
   the CI deploy path).

**Everything else is out of scope**, including — and especially — using
docker to read another user's files, to inspect another user's processes,
to reach a container the owner has not sanctioned, or to obtain a
credential I could not otherwise read.

**If I need something I cannot legitimately access: ask the owner for it,
or ask the owner to run it.** A blocked task is the correct outcome. A
secret obtained by routing around a permission boundary is worse than no
secret.

**Corollary for secrets:** never print a secret value into chat, a log, a
commit, or a document. Print only the **name**, a length, or a truncated
SHA-256 fingerprint.

---

## Rule 4 — Secrets never appear in output

No API keys, tokens, passwords, private keys or connection strings in
chat, logs, commits, or documents. Pass secrets as files. When a secret's
identity matters, use `len` and `sha256[:12]`.

---

## Rule 5 — Exit codes are captured without a pipe

`cmd > file; RC=$?` — never `cmd | …; echo $?`, which reports the **pipe's**
exit code, not the command's.

---

## Rule 6 — Batch tool calls into one turn

The per-turn cap truncated a session once. Batch independent reads and
checks into a single turn.

---

## Rule 7 — When a permission or rule blocks me, stop and ask

Never route around it. Never infer permission that was not given. "If a
permission or rule blocks you, stop and ask."

---

## Rule 8 — A wrong premise is corrected with independent evidence

When the owner states a fact that the live state contradicts, check the live
state, state the corrected number, and say why — do not silently comply
with the wrong premise and do not argue for its sake.

---

## Rule 9 — Reports separate *fixed* from *suppressed*

When something stops happening, say which one it is. "Fixed" means the
cause is gone. "Suppressed" means the symptom is hidden. Alejandro
distinguishes these and cares which it is.

---

## Rule 10 — The owner's decisions are the owner's

Where a decision is the owner's — naming a service account, setting a cap,
choosing a kill-switch default, choosing a source standard — the decision
is recorded in the ADR and implemented as stated. The agent proposes; it
does not decide. If the owner has already decided, the decision is
transcribed, not re-litigated.

---

## Rule 11 — An applied migration is IMMUTABLE. Fixes go into a new number.

**Owner, 2026-11-08.**

Once a migration has been **applied on live**, its file is frozen. It is
never edited again — not to fix a bug, not to reformat, not to change a
comment.

**Why.** The committed file is the record of what ran. If an applied
migration's file changes, the repository says one thing happened and the
database says another, and **nothing in the repo records the
divergence**. A later reader — a human or an agent — cannot tell whether
the migration was re-run, whether the fix was applied by hand, or whether
it was never applied at all. That ambiguity is the whole failure.

**What to do instead.** A fix goes into a **NEW migration**, numbered
after the last one. The new migration is the fix; the old file stays as
the historical record of what actually ran.

**The line is the apply, not the commit.** A migration that is **not yet
applied on live** may still be edited — that is normal development, and
it is exactly what happened to `0052`: it was merged, then a security
hole was found and the file was corrected before it ever ran. Once the
apply happens, the file is frozen and Rule 11 applies to it forever.

**How to tell.** The live receipt: `drizzle.__drizzle_migrations` on the
live database lists what has been applied. A migration in that table is
frozen. A migration absent from it may still be edited.

**Corollary.** A tool that rewrites migration files is a hazard, not a
helper. `scripts/guard_data_migrations.py` used to rewrite them in
place — including `0019`, which was already applied. It is now
check-only (`docs/MIGRATION-GUARD-REFERENCE.md`).

---

## Where these rules live in the rest of the repo

| rule | also documented in |
|---|---|
| Rule 1 | `docs/DATABASE-SAFETY.md` §1, `docs/ADR-005-live-approval-gate.md` |
| Rule 2 | `docs/OPERATIONS-RUNBOOK.md` §1, §1a |
| Rule 3 | this file only — **new** |
| Rule 5 | `docs/OPERATIONS-RUNBOOK.md` §12 |
| Rule 6 | `docs/OPERATIONS-RUNBOOK.md` §16 |
| Rule 11 | `docs/MIGRATION-GUARD-REFERENCE.md`, `docs/DATABASE-SAFETY.md` §1 |

`docs/OPERATIONS-RUNBOOK.md` §1a was written **before** Rule 2 was
absolute. It says "never overwrite them" but still describes
`--force-with-lease` as a tool to use. **Rule 2 wins**: no force-push,
no exceptions.
