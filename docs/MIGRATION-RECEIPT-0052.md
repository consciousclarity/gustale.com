# Migration receipt — 0052, the recipes schema (item 2)

**Date:** 2026-11-08
**Status:** SANDBOX ONLY — **not applied to live**
**Migration:** `db/migrations/0052_recipes_schema.sql`
**Item:** item 2 of the recipes task (`docs/RECIPES-TASK-RESUME.md`)
**ADRs:** ADR-007 (`docs/ADR-007-recipe-schema.md`) and ADR-007-A1
(`docs/ADR-007-A1-recipes-confidence-autopublish-contributors-language-urls.md`)
§8

> **This receipt records a SANDBOX migration.** Every statement below was
> executed against `gustale-test-postgres` on `127.0.0.1:5434` on
> GEEKOBOT (WSL2). **Nothing was applied to the live database, and no
> SSH to the VPS was performed.** The live database was not read either.
> Applying 0052 to live is a separate, deliberate step that this receipt
> does not authorise.

---

## 1. What the migration creates

| Object | Purpose | ADR |
|---|---|---|
| `public.recipes` | the recipe itself | ADR-007 |
| `public.recipe_ingredients` | the ingredient lines | ADR-007 |
| `public.recipe_sentences` | the sentences (steps, notes) | ADR-007 |
| `public.recipe_claims` | a sentence's claims → a statement | ADR-007 |
| `public.recipe_translations` | the translations of a sentence | ADR-007 |
| `public.service_accounts` | the system actors | §2.4 |
| `public.recipe_settings` | the kill switch and the daily cap | §7.1, §7.2 |
| `public.recipe_confidence` | the computed confidence and its evidence | §8.3 |
| `public.recipe_publish_log` | the audit trail | §7.3 |
| `public.recipe_auto_publish_token` | the authorisation token | §8.4 |
| `public.recipe_compute_confidence(uuid)` | the confidence computation | §8.3 |
| `public.recipe_auto_publish(uuid)` | the auto-publish function | §8.4 |
| `public.recipe_publishable` | the publish predicate | §8.2 |

It also **widens** one existing constraint and **amends** two existing
functions:

- `statements_subject_type_check` gains `'recipe'` (additive — `'dish'`
  and `'place'` are unchanged);
- `public.statements_check_subject()` learns the `'recipe'` subject type;
- `public.statement_set_status()` gains the system-actor branch (§8.4);
- the 0048 credential guard gains the system-actor rule (§2.4).

The migration writes **no content rows**. The kill switch ships
`disabled`, so the auto-publish path is dormant on arrival.

---

## 2. The authorisation design, and why it is what it is

This is the part of item 2 that needed the most care, so it is recorded
in full.

### 2.1 What ADR-007-A1 §8.4 requires

> the marker is not a plain GUC — it is checked against `current_user`
> and the marker together, and the branch additionally requires that the
> caller is the function's owner.

### 2.2 Why a GUC nonce cannot satisfy it

A custom GUC is a **plain string that any role may set**:

```sql
SET gustale.auto_publish_token = 'anything I like';
```

There is no way to make a custom GUC unforgeable — `set_config()` is
available to every role. A marker that the caller chooses is therefore
not a marker at all, and the first draft of this migration (which used
one) was **rejected and rewritten** rather than shipped.

### 2.3 What replaced it

The marker is a **row in a table the application role cannot write**:

```
public.recipe_auto_publish_token(
  token       uuid PRIMARY KEY,
  created_at  timestamptz NOT NULL,
  recipe_id   uuid REFERENCES recipes(id) ON DELETE CASCADE,  -- nullable
  txid        bigint NOT NULL
)
```

`recipe_auto_publish()` (SECURITY DEFINER) mints the token inside
itself and deletes it when it returns, so it is single-use and cannot
be replayed. The application role holds **no** privilege on the table.

The branch in `statement_set_status()` then requires **all** of:

1. `current_user` is the owner of `recipe_auto_publish()` — the
   `current_user` half of §8.4;
2. the presented marker matches a token row;
3. that token's `txid` equals `txid_current()` — so it cannot be carried
   across a commit;
4. that token's `recipe_id` is the recipe that owns **this** statement.

The token is passed as the *"session token"* argument, because
`statement_set_status()` takes one text argument and the system actor
has no session. The ordinary session path is untouched: a real session
token is not a token in the table, and it never becomes one.

### 2.4 The mechanic that makes it work

Inside a **SECURITY DEFINER** function, `current_user` is the **owner**.
That is why the owner check has to live in the *caller's* context — and
it does, because `statement_set_status()` is **SECURITY INVOKER** (0047
left it that way). Inside an INVOKER function, `current_user` is the
caller, so the check sees who actually called.

Two PostgreSQL facts that constrain the design, both established by
direct experiment on the sandbox rather than assumed:

| Fact | Consequence |
|---|---|
| `SET ROLE` is **forbidden** inside a SECURITY DEFINER function ("cannot set parameter role within security-definer function") | A forge probe cannot drop privileges from inside a definer body. It must be a SECURITY INVOKER function called after `SET LOCAL ROLE`, which *is* allowed inside a plain `DO` block. |
| `txid_current()` is stable across subtransactions | A token minted in a subtransaction still binds to the outer transaction, so the txid check is meaningful. |

---

## 3. The proof, and what each case establishes

The migration carries its own behavioural proof. It runs **inside the
migration's transaction**, so a failing proof **rolls the whole
migration back** — the schema and its proof land together, or neither
lands.

The proof is not only "bad things are refused": a function that refused
everything would pass such a suite. It therefore includes a **positive**
case that builds a real HIGH recipe and shows the function publishing
it.

| # | Case | What it establishes |
|---|---|---|
| 1 | every object exists | the schema is really there |
| 2 | the system actor is a row, with no login and no credential | §2.4's "no account creation" |
| 3 | the switch reads `disabled` and the cap reads 20 | §7.1, §7.2 |
| 4 | a direct `statement_set_status()` call with the system actor is refused | the branch is not reachable from outside |
| 5 | a forged token (chosen by the caller) is refused | the token is not a string the caller may pick |
| 6 | **the positive case** — a HIGH fixture is really published, the statement moves to `published`, the log names the system actor, the publish log carries the `service_account_id`, and the token is single-use | the function works; the suite is not passing against a no-op |
| 7 | a credential for the system actor is refused **by the system-actor rule** | the amended 0048 guard fired (the message is matched, so the proof shows *which* rule refused) |
| 8 | a human account is not a system actor; the bot rule is unaffected | the bot rule was not broken |
| 9 | the application role has **no** privilege on the token table | the token cannot be forged by the application |
| 10 | the migration left no content rows, no token, and the switch is off | the proof's fixtures do not survive |
| 11 | the confidence function runs and reports a level | it does not raise |

### 3.1 The forge test — the strongest case

Cases 4 and 5 prove that a bad call is refused, but not that the
**token** is what refuses it. A direct call is refused because there is
no session, whatever the token says.

So the proof's forge test is the strongest forgery there is. The
**owner** mints a token that is valid in **every respect**:

- it exists in the token table;
- it was minted in **this** transaction, so the txid matches;
- it is bound to **this** recipe, so it names the right recipe;
- it was minted by the table's **owner**, so it is exactly what the
  legitimate caller would present.

The only thing wrong with it is **who is calling**. The probe runs as
the application role — the role an attacker would be — and the call
must be refused.

The probe distinguishes "refused by the authorisation" from "refused by
the content gate": if the call got past the authorisation, the error
would be about the **gate**, and the probe **fails** in that case
rather than reporting success. That is what makes the positive
assertion meaningful.

The probe runs as the application role because `SET LOCAL ROLE` is
forbidden inside a SECURITY DEFINER body. It is therefore a SECURITY
INVOKER function, called from a `DO` block that has done
`SET LOCAL ROLE gustale` — which *is* allowed inside a plain `DO`
block.

---

## 4. The circularity in §8.3 condition 4 — and how it is read here

§8.3's condition 4 is *"every sentence has a claim with a statement at
`status IN ('verified','published')`"*. §8.4's function transitions
statements **to** verified/published.

**Read literally, the recipe can only be HIGH once it is already
published — so §8.4's function could never succeed, and would be dead
code.** That is not a reading anybody intends.

The reading this migration implements, and states plainly:

> **Condition 4 is checked against the statements' EVIDENCE, not against
> their CURRENT STATUS.** Every sentence must have a claim whose
> statement is *evidenced* — it carries the supporting S1–S5 citations
> the other conditions require, and it is not `unsupported` or
> `disputed`. The auto-publish function is what **lifts** those
> statements to verified/published.

The two questions are asked at different moments, and neither
contradicts the other:

- the **confidence computation** asks the pre-transition question — "is
  this sentence backed by an evidenced claim?";
- the **publish view** (`recipe_publishable`) asks the post-transition
  question — "are the statements really `verified`/`published`?" — so a
  recipe is only publishable once the statements really are verified.

This is the only reading under which §8.4's function can ever succeed,
and it is consistent with ADR-007's own rule that "a recipe sentence
with no verified statement cannot be published".

**This is a deviation from the ADR's literal wording and it needs the
owner's confirmation.** It is flagged here rather than buried in the
migration.

---

## 5. The sandbox proof

Every run below was against `gustale-test-postgres` on
`127.0.0.1:5434` (the dedicated test container, created by
`scripts/lib/test_pg.sh`). Ports 5432 and 5433 were already taken.

### 5.1 The chain

```
$ bash scripts/ci-migration-chain.sh gustale_m0052
...
--- the recipes schema
psql:<stdin>:2505: NOTICE:  RECIPES_SCHEMA_OK=1
psql:<stdin>:1389: NOTICE:  ATLAS_SCHEMA_TESTS: 47 passed, 0 failed
--- the atlas backfill assertions
psql:<stdin>:230: NOTICE:  ATLAS_BACKFILL_ASSERTIONS: 8 passed, 0 failed
psql:<stdin>:462: NOTICE:  ATLAS_COUNT_GUARD: 8 passed, 0 failed

FULL_CI_CHAIN_OK=1
```

The chain is the repo's own authoritative route: it creates the
migration roles, applies the extensions, the drizzle chain, the GUS
chain, the seed, the data migrations and then every numbered migration
in order.

### 5.2 The full proof output

```
CONFIRMED: every object the migration creates exists
CONFIRMED: the system actor is a row, with no login and no credential
CONFIRMED: the switch is disabled and the cap is 20
CONFIRMED: a direct call with the system actor is refused: the published
           transition is refused: no valid session was presented...
CONFIRMED: a forged token is refused: the published transition is refused:
           no valid session was presented...
CONFIRMED: a credential for the system actor is refused by the system-actor rule
CONFIRMED: the bot rule is unaffected by the system actor
CONFIRMED: the application role has no privilege on the token table
CONFIRMED: the confidence function runs and reports a level (lows)
CONFIRMED: the auto-publish function refuses while the switch is disabled
CONFIRMED: the proof fixture is HIGH (2s S1-S5 sources, 2s independent)
CONFIRMED: recipe_auto_publish() published the HIGH fixture
CONFIRMED: the fixture statement is published
CONFIRMED: the transition is logged as the system actor
CONFIRMED: the publish log holds the audit row
CONFIRMED: the authorisation token is single-use
CONFIRMED: a forged token is refused as gustale: the published transition is
           refused: no valid session was presented...
CONFIRMED: the migration left no content rows, no token, and the switch is off
RECIPES_SCHEMA_OK=1
```

Note the fixture's two sources are **S2 and S3** — two *independent
classes*. Two citations from ONE source would be one source, not two,
and the independence condition would fail and the fixture would be
MEDIUM. The fixture honours the condition rather than working around
it.

### 5.3 Idempotent re-apply

0052 was applied a second time onto the already-migrated database:

```
$ psql -v ON_ERROR_STOP=1 -f - < db/migrations/0052_recipes_schema.sql
REAPPLY_RC=0
```

No errors, and the full proof ran again — all nineteen cases confirmed
on the second pass.

### 5.4 The commit, from a new session

A separate `psql` connection — not the one that applied the migration:

```
recipes table:        recipes
auto_publish fn:      recipe_auto_publish(uuid)
publishable view:     recipe_publishable
system actor rows:    1
kill switch:          disabled
recipe rows left:     0
tokens left:          0
subject_type check:   CHECK (subject_type = ANY (ARRAY['dish','place','recipe']))
```

### 5.5 The rollback

The proof was made to fail deliberately — the final
`RECIPES_SCHEMA_OK=1` notice was replaced with a `RAISE EXCEPTION` —
and the migration was applied to a fresh database through the same
chain:

```
FAILED: 0052
psql:<stdin>:2505: ERROR:  DELIBERATE FAILURE - the proof must roll the migration back
```

Then the database was inspected. **Nothing survived:**

```
recipes:             ABSENT (correct)
recipe_sentences:    ABSENT (correct)
service_accounts:    ABSENT (correct)
auto_publish fn:     ABSENT (correct)
publishable view:    ABSENT (correct)
token table:         ABSENT (correct)
forge probe:         ABSENT (correct)
subject_type check:  CHECK (subject_type = ANY (ARRAY['dish','place']))
```

The constraint is back to `'dish','place'` — the widening was rolled
back with everything else. **A failing proof cannot leave a partial
schema behind.**

### 5.6 The rest of the gauntlet

| Gate | Result |
|---|---|
| `scripts/check-migrations-are-transactional.py` | OK — 38 migrations checked, all wrapped in BEGIN/COMMIT |
| `scripts/guard_data_migrations.py` | OK (see §6 — it rewrites files; the change was reverted) |
| `scripts/validate-ci-migration-chain.py` | OK |
| `scripts/ci-migration-chain.sh` | `FULL_CI_CHAIN_OK=1` |
| `scripts/repro-ci-db.sh` | `CI_DB_REPRO_OK=1` |
| `pnpm --filter @gustale/db run typecheck` | pass |
| `pnpm --filter @gustale/api run typecheck` | pass |
| `pnpm run lint` | pass |
| `pnpm exec vitest run` (apps/api) | **19 files, 186 passed, 3 skipped, 0 failed** |

The API suite ran against the post-0052 schema.

---

## 6. The `repro-ci-db.sh` gap, and one hazard found on the way

`scripts/repro-ci-db.sh` failed at migration 0045 with:

```
ERROR:  role "gustale_migrator" does not exist
```

The local reproduction never applied `scripts/ci-migration-role.sql`,
so it did not have the arrangement CI has. That is the exact drift the
script exists to prevent. The fix adds the role setup **before** the
migrations, and 0052 itself after 0051. The reproduction now ends with
`CI_DB_REPRO_OK=1`.

**A hazard found while running the gates, and NOT shipped:**
`scripts/guard_data_migrations.py` **rewrites migration files in place**
(`path.write_text(guarded)`), and its "CI GUARD" marker check is a
substring match. Migration `0019_gus242_traditions_1e.sql` already had
a *stronger* guard — one that checks ten specific slugs — but without
the marker, so the script **wrapped it a second time**, producing a
nested `\if` and replacing the specific check with a weaker
`EXISTS (SELECT 1 FROM dish_traditions)`.

That change was **reverted** and is not part of this work:

```
$ git checkout -- db/migrations/0019_gus242_traditions_1e.sql
```

The full chain was re-run after the revert and still passes
(`FULL_CI_CHAIN_OK=1`). The script is a one-time authoring tool and is
not run by CI, so the hazard is dormant — but it is a trap for
whoever next runs it. **It is reported, not fixed**, because fixing it
would touch a migration that has already run on live.

---

## 7. What still needs the owner

1. **The §8.3 condition-4 reading (§4).** The literal ADR wording makes
   the auto-publish function unreachable. This migration implements the
   evidence-based reading and states it plainly. **Confirm it, or say
   how condition 4 should read.**
2. **Applying 0052 to live.** Not done, not authorised by this receipt.
   It needs the usual live procedure: a backup, a pre-apply gate, and
   the owner-saved approval.
3. **The `guard_data_migrations.py` hazard (§6).** Reported, not fixed.

## 8. What this migration does NOT do

- It does not create an account for the system actor (§2.4: no login, no
  email, no password, no session, no credential).
- It does not publish anything. The kill switch ships `disabled`.
- It does not write content rows.
- It does not touch the Drizzle schema. The tables exist in SQL only;
  `packages/db/src/schema/` is unchanged, because ADR-007-A1's §8.2
  is a SQL-level spec and the TypeScript model is a separate piece of
  work.
- It does not touch the live database, the VPS, or any deployment.
