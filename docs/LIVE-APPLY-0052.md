# Applying migration `0052` to live — the owner's checklist

**Status:** NOT APPLIED. `0052` has been merged and fixed (PRs #202, #203)
but has **never run on live**. This file is the exact sequence, written
out so it can be followed without improvisation.

**Prepared:** 2026-11-08 · **Owner:** Alejandro · **Agent:** Hermes

> **Do not run any of this from the agent.** Rule 1: no live database
> write without the owner's explicit go, per operation. These commands
> are for **you**, on the VPS, at the moment item 4 needs the schema.

---

## 0. Before you start

**On the VPS** (`srv626116`, the production host), from the repo
checkout at `/home/gustale/gustale-build` or wherever the repo lives:

```bash
cd <the repo>
git fetch origin
git checkout main
git log --oneline -1        # must be 6b51e44 or later, and MUST include the 0052 fix
```

**Check that the fix is in.** `0052` was corrected in PR #203 after
PR #202 was merged. If your `main` predates the fix, the scope hole is
live. Verify:

```bash
grep -c "recipe_claims_subject_trg" db/migrations/0052_recipes_schema.sql
grep -c "recipe_claims_statement_guard_trg" db/migrations/0052_recipes_schema.sql
```

Both must print a number **> 0**. If either prints `0`, stop and pull
`main` — do not apply a migration with the hole in it.

**Check `0052` has not already been applied:**

```bash
docker exec -u postgres shared-postgres psql -U postgres -d gustale -tAc \
  "SELECT count(*) FROM drizzle.__drizzle_migrations WHERE name LIKE '0052%';"
```

`0` is what you want. Anything else means it already ran — stop and
read the section below.

---

## 1. The backup — `pg_dump`, FIRST, and VERIFIED

**The dump goes on the host, in `/home/gustale/backups/`, with the
timestamp in the filename.** This is the same path the 0049 and the
0050/0051 backups used.

```bash
STAMP=$(date '+%Y%m%d-%H%M%S')
DUMP="/home/gustale/backups/pre-0052-${STAMP}.dump"

docker exec -u postgres shared-postgres \
  pg_dump -U postgres -d gustale --format=custom --file=/tmp/pre-0052.dump

cp /tmp/pre-0052.dump "$DUMP"
ls -la "$DUMP"

# Verify the archive is readable and complete BEFORE applying anything.
docker exec -u postgres shared-postgres \
  pg_restore --list /tmp/pre-0052.dump | wc -l
```

**Do not proceed if the dump is empty, or if `pg_restore --list` errors.**
A dump that was never verified is not a backup. The 0049 incident was
survived *because* a good dump existed.

> **Why the dump lives on the host, not in the container:** the host and
> the container do not share `/tmp`. The dump is written inside the
> container (that is where `pg_dump` lives) and then copied out with
> `cp` from the container's own `/tmp` — which `docker cp` does, or a
> plain `docker exec ... cp` to a mounted path. **Confirm the file
> exists at `$DUMP` with a non-trivial size** (`ls -la` above) before
> continuing. A `cp` that silently copied nothing is the failure mode
> this step exists to catch.

**Also check the free space** — the dump is ~42MB and you want room for
the dry-run copy too:

```bash
df -h /home/gustale/backups /tmp
```

---

## 2. The dry-run on an EXACT COPY (before the live apply)

The dry-run is on the **dedicated test Postgres**, never on the
production cluster. `scripts/dryrun-migration.sh` does the whole thing:
it snapshots live read-only, restores the copy onto the test container,
applies the migration, applies it a **second** time (proving
idempotence), reports the counts before and after, and drops the copy.

```bash
bash scripts/dryrun-migration.sh db/migrations/0052_recipes_schema.sql gustale_0052_dryrun
```

**What you are looking for:**

- the apply succeeds;
- the second apply also succeeds (**idempotent**);
- the legacy counts are **unchanged** — `statements` 1354,
  `claim_citations` 1354, `dish_relations` 86, `dish_families` 306,
  `dishes` 1475, `sources` 1486, `geo_entities` 3892,
  `dish_traditions` 433, `users` 1, `media` 1339, `dish_names` 2848,
  `vocabulary_labels` 35871;
- the new recipe tables are **empty** — `0052` writes **no content
  rows**;
- the migration's own proof ran: look for `RECIPES_SCHEMA_OK=1` and the
  `CONFIRMED:` lines.

> **The dry-run needs the test Postgres running.** On this host it is
> `gustale-test-postgres` on `127.0.0.1:5434`; start it with
> `bash scripts/lib/test_pg.sh up`. On the VPS, the dry-run may need the
> test container present — if the script says the test Postgres is not
> reachable, that is a **blocker to report**, not a reason to run the
> dry-run against production.

**If the dry-run fails: stop.** Do not apply to live. The migration is
transactional, so a failed proof rolls itself back — but only in the
database it ran against.

---

## 3. The live apply

`scripts/apply-migration-live.sh` is the gate: snapshot → fixture check
→ count assertions → apply → independent verification.

```bash
bash scripts/apply-migration-live.sh db/migrations/0052_recipes_schema.sql
```

**What it does, in order:**

1. **snapshot** — the counts of every legacy table, before the write;
2. **fixture check** — stops if any `atlas_fixture` row is on live;
3. **assertions** — a `DO` block that raises if any legacy count is not
   what it must be;
4. **apply** — `psql -v ON_ERROR_STOP=1 -f -` on the migration;
5. **independent verification** — the counts read back, a `diff` against
   the snapshot, the fixture check again, and the new objects read back.

**The script exits non-zero on any failure**, and it is transactional,
so a failed apply leaves **no partial state**.

> **Two things to know about this script before you run it.** It asserts
> the legacy counts listed above — if live has moved since they were
> recorded, the assertion fails and the apply stops. That is the gate
> working, not a bug: read the reported count against the expected one,
> and if it is a legitimate change (a dish added since), **update the
> expectation in the script and re-run** — that is an edit to a
> *script*, not to an applied migration, so it is fine under Rule 11.
>
> The script's verification step is tuned for the **Atlas** migration
> (`dish_place_associations`, `claim_dates`, `dish_identities`,
> `dish_name_relations`, `relation_types`). **`0052` creates a different
> set of objects**, so the "new objects, verified independently" query
> in that step will report **zeros for the Atlas tables** — they do not
> exist yet and that is correct. The **new-object checks for the recipe
> tables are section 4 below**, and they are the ones that matter for
> `0052`.

---

## 4. Verify `0052` specifically — the queries that matter

Run these **after** the apply, on live, read-only.

### 4.1 The new tables exist and are empty

```bash
docker exec -u postgres shared-postgres psql -U postgres -d gustale -c "
SELECT 'recipes' t, count(*) FROM recipes
UNION ALL SELECT 'recipe_ingredients', count(*) FROM recipe_ingredients
UNION ALL SELECT 'recipe_sentences', count(*) FROM recipe_sentences
UNION ALL SELECT 'recipe_claims', count(*) FROM recipe_claims
UNION ALL SELECT 'recipe_translations', count(*) FROM recipe_translations
UNION ALL SELECT 'recipe_confidence', count(*) FROM recipe_confidence
UNION ALL SELECT 'recipe_publish_log', count(*) FROM recipe_publish_log
UNION ALL SELECT 'recipe_auto_publish_token', count(*) FROM recipe_auto_publish_token
UNION ALL SELECT 'service_accounts', count(*) FROM service_accounts;"
```

**Expected:** every count is **0**, **except `service_accounts`**, which
has exactly **1** — the system actor `system:auto-publish`. That row is
the actor ADR-007-A1 §2.4 requires, and it carries **no login, no
email, no password, no session and no credential**.

Check that row explicitly:

```bash
docker exec -u postgres shared-postgres psql -U postgres -d gustale -c "
SELECT id, actor, kind, purpose, revoked_at FROM service_accounts;"
```

**Expected:** one row, `actor = 'system:auto-publish'`, `kind = 'system'`,
`revoked_at` NULL. The table has **no login, no email, no password, no
session and no credential column** — that is the point of it (ADR-007-A1
§2.4).

### 4.2 The kill switch is OFF

```bash
docker exec -u postgres shared-postgres psql -U postgres -d gustale -c "
SELECT id, auto_publish_enabled, auto_publish_mode, auto_publish_daily_cap
  FROM recipe_settings;"
```

**Expected:** `auto_publish_enabled = false`, `auto_publish_mode =
'disabled'`, `auto_publish_daily_cap = 20`. **The auto-publish path must
be dormant on arrival.** If it is not, stop and report — do not "fix" it
by editing the row.

### 4.3 The scope guards are in place — the security fix

**This is the one that matters most.** It is the difference between PR
#202's migration and PR #203's.

```bash
docker exec -u postgres shared-postgres psql -U postgres -d gustale -c "
SELECT tgname, tgrelid::regclass
  FROM pg_trigger
 WHERE tgname IN ('recipe_claims_subject_trg','recipe_claims_statement_guard_trg')
   AND NOT tgisinternal;"
```

**Expected: two rows** — `recipe_claims_subject_trg` on `recipe_claims`,
and `recipe_claims_statement_guard_trg` on `statements`. **If either is
missing, the scope hole is open. Stop and report.**

### 4.4 The `statements.subject_type` check was widened

```bash
docker exec -u postgres shared-postgres psql -U postgres -d gustale -tAc "
SELECT pg_get_constraintdef(oid)
  FROM pg_constraint
 WHERE conrelid = 'public.statements'::regclass
   AND conname = 'statements_subject_type_check';"
```

**Expected:** `CHECK ((subject_type = ANY (ARRAY['dish'::text, 'place'::text, 'recipe'::text])))`

### 4.5 The legacy counts did not move

```bash
docker exec -u postgres shared-postgres psql -U postgres -d gustale -c "
SELECT 'statements' t, count(*) FROM statements
UNION ALL SELECT 'claim_citations', count(*) FROM claim_citations
UNION ALL SELECT 'dish_relations', count(*) FROM dish_relations
UNION ALL SELECT 'dishes', count(*) FROM dishes
UNION ALL SELECT 'sources', count(*) FROM sources
UNION ALL SELECT 'users', count(*) FROM users;"
```

**Expected:** `1354`, `1354`, `86`, `1475`, `1486`, `1` — unchanged.

### 4.6 The system actor has no credential

`publish_credential` is the table that holds publish credentials (singular
name). The link is the `actor` column. The 0048 guard, as amended by
`0052`, **refuses** a credential to any listed system actor — so this
must be `0`:

```bash
docker exec -u postgres shared-postgres psql -U postgres -d gustale -tAc "
SELECT count(*) FROM publish_credential pc
  JOIN service_accounts sa ON sa.actor = pc.actor
 WHERE sa.actor = 'system:auto-publish';"
```

**Expected: `0`.**

### 4.7 The token table is closed to the application role

The publish token is a **row** in a table the application role cannot
write (a custom GUC would be forgeable by any role). Confirm the
application role has no INSERT/UPDATE on it:

```bash
docker exec -u postgres shared-postgres psql -U postgres -d gustale -tAc "
SELECT has_table_privilege('gustale','public.recipe_auto_publish_token','INSERT')
    OR has_table_privilege('gustale','public.recipe_auto_publish_token','UPDATE')
    OR has_table_privilege('gustale','public.recipe_auto_publish_token','DELETE');"
```

**Expected: `f`** — false. If it is `t`, the token could be forged and the
whole authorisation in §2.4.3 is void. **Stop and report.**

---

## 5. Record the receipt

The receipt is what makes "was it applied?" answerable later. Append to
`docs/MIGRATION-RECEIPT-0052.md` in the repo — the migration sha applied,
the date, the dump path, and the counts read back. Then commit and push
it.

**After this point, `0052`'s file is FROZEN** — see
[`docs/RULES.md`](../RULES.md) Rule 11. Any fix from here goes into
`0053`.

---

## 6. Rollback

**`0052` is transactional and additive, so the rollback is a DROP of
what it created — not a reverse migration.** A reverse migration would
itself be a new applied migration, and it would have to be immutable
too; for a purely additive schema, dropping the objects is simpler and
leaves no half-reversed state.

### 6.1 The automatic rollback

If the apply itself fails, `scripts/apply-migration-live.sh` **rolls
back automatically** — the migration is wrapped in `BEGIN`/`COMMIT`, so a
failed assertion or a failed proof leaves **no partial state**. Before
assuming a rollback is needed, **check the state**:

```bash
docker exec -u postgres shared-postgres psql -U postgres -d gustale -tAc "
SELECT count(*) FROM information_schema.tables
 WHERE table_schema='public' AND table_name LIKE 'recipe%';"
```

`0` means the rollback already happened. **Nothing to do.**

### 6.2 The manual rollback — if the apply SUCCEEDED and you want it gone

**Only if you decide the apply must be undone.** Take a fresh dump
first, exactly as in section 1, because you are about to destroy the
tables `0052` created.

```bash
# A FRESH dump, before you drop anything.
STAMP=$(date '+%Y%m%d-%H%M%S')
DUMP="/home/gustale/backups/pre-0052-rollback-${STAMP}.dump"
docker exec -u postgres shared-postgres \
  pg_dump -U postgres -d gustale --format=custom --file=/tmp/pre-0052-rollback.dump
cp /tmp/pre-0052-rollback.dump "$DUMP"
ls -la "$DUMP"
docker exec -u postgres shared-postgres \
  pg_restore --list /tmp/pre-0052-rollback.dump | wc -l
```

Then, in **one transaction**, drop what `0052` created and restore the
original `statements` check. **The order matters** — the triggers and the
view depend on the tables, so they go first:

```bash
docker exec -u postgres -i shared-postgres psql -U postgres -d gustale -v ON_ERROR_STOP=1 <<'SQL'
BEGIN;

-- THE TRIGGERS FIRST. Each one hangs off a table this migration
-- touched, so it must go before that table can be dropped.
DROP TRIGGER IF EXISTS recipe_claims_subject_trg         ON public.recipe_claims;
DROP TRIGGER IF EXISTS recipe_claims_statement_guard_trg ON public.statements;
DROP TRIGGER IF EXISTS recipe_sentences_language_first_trg ON public.recipe_sentences;
DROP TRIGGER IF EXISTS ingredients_published_slug_guard_trg ON public.ingredients;
DROP TRIGGER IF EXISTS recipe_settings_switch_guard_trg  ON public.recipe_settings;

-- THE VIEW. It reads recipe_claims, so it goes before the table.
DROP VIEW IF EXISTS public.recipe_publishable;

-- THE TABLES. In dependency order.
DROP TABLE IF EXISTS public.recipe_publish_log;
DROP TABLE IF EXISTS public.recipe_confidence;
DROP TABLE IF EXISTS public.recipe_settings;
DROP TABLE IF EXISTS public.recipe_auto_publish_token;
DROP TABLE IF EXISTS public.service_accounts;
DROP TABLE IF EXISTS public.recipe_translations;
DROP TABLE IF EXISTS public.recipe_claims;
DROP TABLE IF EXISTS public.recipe_sentences;
DROP TABLE IF EXISTS public.recipe_ingredients;
DROP TABLE IF EXISTS public.recipes;

-- Put the statements subject check back exactly as it was before 0052.
ALTER TABLE public.statements
  DROP CONSTRAINT IF EXISTS statements_subject_type_check;
ALTER TABLE public.statements
  ADD CONSTRAINT statements_subject_type_check
  CHECK (subject_type IN ('dish','place'));

-- THE FUNCTIONS 0052 CREATED. These are new, so they simply go.
DROP FUNCTION IF EXISTS public.recipe_claims_statement_guard();
DROP FUNCTION IF EXISTS public.recipe_claims_subject_check();
DROP FUNCTION IF EXISTS public.recipe_sentences_language_first_guard();
DROP FUNCTION IF EXISTS public.ingredients_published_slug_guard();
DROP FUNCTION IF EXISTS public.recipe_settings_switch_guard();
DROP FUNCTION IF EXISTS public.recipe_level_least(text, text);
DROP FUNCTION IF EXISTS public.recipe_compute_confidence(uuid);
DROP FUNCTION IF EXISTS public.recipe_auto_publish(uuid);

CREATE OR REPLACE FUNCTION statements_check_subject()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.subject_type = 'dish' THEN
    IF NOT EXISTS (SELECT 1 FROM dishes d WHERE d.id = NEW.subject_id) THEN
      RAISE EXCEPTION 'statement %: no dish with id %', NEW.id, NEW.subject_id;
    END IF;
  ELSIF NEW.subject_type = 'place' THEN
    IF NOT EXISTS (SELECT 1 FROM geo_entities g WHERE g.id = NEW.subject_id) THEN
      RAISE EXCEPTION 'statement %: no place with id %', NEW.id, NEW.subject_id;
    END IF;
  ELSE
    RAISE EXCEPTION 'statement %: unknown subject_type %', NEW.id, NEW.subject_type;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.publish_credential_owner_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $guard$
DECLARE
  v_may_issue boolean := false;
BEGIN
  -- (1) The account must exist -- in the LOGIN table.
  --
  -- The EDITORIAL `users` table is a byline table. It is not
  -- connected to authentication, and a credential for a person with no
  -- login was meaningless: the credential authorises publishing, and
  -- publishing is an authenticated act.
  IF NOT EXISTS (SELECT 1 FROM "user" u WHERE u.id = NEW.actor) THEN
    RAISE EXCEPTION
      'the publish credential for % is refused: there is no such account in "user"',
      NEW.actor;
  END IF;

  -- (2) THE ACTOR MUST NOT BE A BOT.
  --
  -- This is the check that 0047's change to the login table made
  -- necessary. The bot has a login, so the check above does not
  -- refuse it, and without this check a bot could be issued a
  -- publish credential -- and could then publish statements with no
  -- human in the loop.
  IF public.is_bot_publish_actor(NEW.actor) THEN
    RAISE EXCEPTION
      'the publish credential for % is refused: a bot account must never hold a publish credential',
      NEW.actor;
  END IF;

  -- (3) The WRITER must be a MEMBER OF THE ISSUER ROLE.
  --
  -- MEMBERSHIP, not a table privilege: a SUPERUSER bypasses every
  -- privilege check, so `has_table_privilege` says true for a
  -- superuser no matter what was revoked.
  SELECT pg_has_role(current_user, 'gustale_credential_issuer', 'MEMBER')
    INTO v_may_issue;

  IF NOT v_may_issue THEN
    RAISE EXCEPTION
      'the publish credential for % is refused: the writer % is not a member of the issuer role',
      NEW.actor, current_user;
  END IF;

  RETURN NEW;
END;
$guard$;

CREATE OR REPLACE FUNCTION statement_set_status(
  p_statement_id uuid,
  p_to verification_state,
  p_session_token text
) RETURNS verification_state
LANGUAGE plpgsql
AS $$
DECLARE
  v_from verification_state;
  v_class claim_class;
  v_ok boolean := false;
  -- the credential the actor holds, if any
  v_role text;
  v_credential_verified boolean := false;
  -- THE ACTOR, derived from the session rather than supplied by the caller
  v_actor text;
BEGIN
  -- ── WHO IS CALLING ─────────────────────────────────────────────────
  --
  -- The actor is derived from the session token the caller presented.
  -- There is no actor parameter, so a caller cannot name an identity it
  -- does not hold a session for.
  v_actor := session_actor(p_session_token);

  IF v_actor IS NULL THEN
    RAISE EXCEPTION
      'the % transition is refused: no valid session was presented. '
      'The publisher is derived from the session, not from a supplied identity.',
      p_to;
  END IF;

  SELECT status, claim_class INTO v_from, v_class
    FROM statements WHERE id = p_statement_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'statement % does not exist', p_statement_id;
  END IF;

  -- ── THE PUBLISH CREDENTIAL — positive, default deny ────────────────
  --
  -- The `verified` and `published` transitions require an actor that
  -- HOLDS a credential. There is no name check and no allow-list of
  -- forbidden strings: an actor that is not in `publish_credential` is
  -- refused, whatever it is called.
  --
  -- The ORDER MATTERS, and it is the order that makes this DEFAULT DENY.
  --
  -- This check runs BEFORE the evidence gates below. Two reasons:
  --
  --   1. An actor without a credential has no business learning whether
  --      the evidence gate for this particular statement is met. The
  --      authorisation is decided first; the content gates are only
  --      reached by an actor who is allowed to ask.
  --
  --   2. With the check AFTER the evidence gates, an unknown actor
  --      attempting `published` on a statement with no sentence anchor
  --      would be refused with "the gate for X -> published is not met"
  --      — a message about the CONTENT, not about the CREDENTIAL. The
  --      credential check would never be reached, and the refusal would
  --      look like an editorial decision rather than an authorisation
  --      failure. The constraint test asserts the refusal message names
  --      the credential, which is what keeps this ordering honest.
  IF p_to IN ('verified','published') THEN
    SELECT pc.credential_role,
           (pc.verified_at IS NOT NULL)
      INTO v_role, v_credential_verified
      FROM publish_credential pc
     WHERE pc.actor = v_actor;

    IF v_role IS NULL THEN
      RAISE EXCEPTION
        'the % transition is refused: % holds no publish credential. '
        'Only an account with a verified editor credential may verify or publish a claim.',
        p_to, COALESCE(NULLIF(v_actor, ''), '(none)');
    END IF;

    IF NOT v_credential_verified THEN
      RAISE EXCEPTION
        'the % transition is refused: the publish credential of % has not been verified.',
        p_to, v_actor;
    END IF;

    -- `published` is the stronger act, so it needs the stronger role.
    IF p_to = 'published' AND v_role <> 'publisher' THEN
      RAISE EXCEPTION
        'the % transition is refused: % holds an ''editor'' credential, which may verify but not publish.',
        p_to, v_actor;
    END IF;
  END IF;

  -- The gates, from Q12. These are UNCHANGED by this migration.
  CASE p_to
    WHEN 'research_pending' THEN
      v_ok := true;

    WHEN 'under_review' THEN
      v_ok := EXISTS (
        SELECT 1 FROM claim_citations c
         WHERE c.statement_id = p_statement_id
           AND c.excerpt_validated
      );

    WHEN 'verified' THEN
      v_ok := CASE v_class
        WHEN 'documented' THEN
          EXISTS (SELECT 1 FROM claim_citations c JOIN sources src ON src.id = c.source_id
                   WHERE c.statement_id = p_statement_id AND c.stance = 'supports'
                     AND src.source_class IN ('S1','S2','S3','S4','S5'))
        WHEN 'scholarly_interpretation' THEN
          EXISTS (SELECT 1 FROM claim_citations c JOIN sources src ON src.id = c.source_id
                   WHERE c.statement_id = p_statement_id AND c.stance = 'supports'
                     AND src.source_class IN ('S1','S2','S3'))
        WHEN 'oral_tradition' THEN
          EXISTS (SELECT 1 FROM claim_citations c JOIN sources src ON src.id = c.source_id
                   WHERE c.statement_id = p_statement_id AND c.stance = 'supports'
                     AND src.source_class = 'S4')
        WHEN 'disputed' THEN
          (SELECT count(DISTINCT src.source_class) FROM claim_citations c JOIN sources src ON src.id = c.source_id
            WHERE c.statement_id = p_statement_id AND c.stance = 'supports'
              AND src.source_class IN ('S1','S2','S3')) >= 2
        WHEN 'hypothesis' THEN
          EXISTS (SELECT 1 FROM claim_citations c JOIN sources src ON src.id = c.source_id
                   WHERE c.statement_id = p_statement_id AND c.stance = 'supports'
                     AND src.source_class IN ('S2','S5'))
        ELSE false
      END;

      IF v_ok THEN
        v_ok := EXISTS (
          SELECT 1 FROM claim_citations c JOIN sources src ON src.id = c.source_id
           WHERE c.statement_id = p_statement_id AND c.stance = 'supports'
             AND src.source_class IN ('S1','S2','S3','S4','S5')
        );
      END IF;

    WHEN 'published' THEN
      v_ok := EXISTS (
        SELECT 1 FROM sentence_claims sc WHERE sc.statement_id = p_statement_id
      );

    WHEN 'disputed' THEN
      v_ok := EXISTS (
        SELECT 1 FROM claim_citations c JOIN sources src ON src.id = c.source_id
         WHERE c.statement_id = p_statement_id AND c.stance = 'supports'
           AND src.source_class IN ('S1','S2','S3')
      ) AND EXISTS (
        SELECT 1 FROM claim_citations c JOIN sources src ON src.id = c.source_id
         WHERE c.statement_id = p_statement_id AND c.stance = 'refutes'
           AND src.source_class IN ('S1','S2','S3')
      );

    ELSE
      v_ok := false;
  END CASE;

  IF NOT v_ok THEN
    RAISE EXCEPTION
      'the gate for % -> % is not met', p_statement_id, p_to;
  END IF;

  -- Authorise THIS write only. The setting is transaction-local, so it
  -- cannot leak into another transaction.
  --
  -- WITHOUT THIS, EVERY CALL FAILS: the `statement_status_gate_trg`
  -- trigger refuses any status change that does not come through the
  -- gate, and the gate IS this setting. The trigger is the reason a
  -- direct UPDATE cannot forge a transition — it is not a substitute
  -- for the gate, it is the thing the gate opens.
  PERFORM set_config('gustale.statement_gate', 'on', true);

  UPDATE statements
     SET status = p_to,
         updated_at = now(),
         -- The publisher is recorded from the DERIVED actor, so the
         -- audit trail names the session's user and not a string the
         -- caller chose.
         verified_by = CASE WHEN p_to = 'verified' THEN v_actor ELSE verified_by END,
         verified_at = CASE WHEN p_to = 'verified' THEN now() ELSE verified_at END,
         published_by = CASE WHEN p_to = 'published' THEN v_actor ELSE published_by END,
         published_at = CASE WHEN p_to = 'published' THEN now() ELSE published_at END
   WHERE id = p_statement_id;

  PERFORM set_config('gustale.statement_gate', 'off', true);

  -- The transition log. Every transition is recorded, with the derived
  -- actor — the same one the credential was checked against.
  INSERT INTO statement_status_log (statement_id, from_status, to_status, actor, gate_ok)
  VALUES (p_statement_id, v_from, p_to, COALESCE(v_actor, '(null)'), true);

  RETURN p_to;
END
$$;

COMMIT;
SQL
```

> **This exact sequence was tested**, against a **copy** of the
> post-`0052` schema in the sandbox. It succeeded: the recipe tables went
> to zero, the `statements` subject check went back to `('dish','place')`,
> and the three replaced functions were restored to their pre-`0052`
> bodies — verified by reading the restored `statements_check_subject()`
> back out of the database and confirming it does **not** mention
> `recipe` (the pre-0052 behaviour).
>
> **Two earlier versions of this block FAILED, and the failures are
> the reason the order is what it is:**
>
> 1. *"cannot drop table recipe_claims because other objects depend on
>    it"* — the view `recipe_publishable` and the two scope triggers.
>    **The triggers and the view are dropped first.**
> 2. *"cannot drop function statements_check_subject() because other
>    objects depend on it"* — the pre-existing trigger
>    `statements_subject_exists_trg` (from `0027`) uses it. The
>    **replaced** functions are **restored, not dropped**.
>
> **Do not reorder this block.**
>
> `DROP TRIGGER ... ON public.ingredients` is safe even if the trigger
> is not there — `IF EXISTS` makes it a no-op.

**Then verify:**

```bash
docker exec -u postgres shared-postgres psql -U postgres -d gustale -tAc "
SELECT count(*) FROM information_schema.tables
 WHERE table_schema='public' AND table_name LIKE 'recipe%';"
# expected: 0

docker exec -u postgres shared-postgres psql -U postgres -d gustale -tAc "
SELECT pg_get_constraintdef(oid) FROM pg_constraint
 WHERE conrelid='public.statements'::regclass
   AND conname='statements_subject_type_check';"
# expected: CHECK ((subject_type = ANY (ARRAY['dish'::text, 'place'::text])))

docker exec -u postgres shared-postgres psql -U postgres -d gustale -c "
SELECT 'statements' t, count(*) FROM statements
UNION ALL SELECT 'claim_citations', count(*) FROM claim_citations
UNION ALL SELECT 'dishes', count(*) FROM dishes
UNION ALL SELECT 'sources', count(*) FROM sources;"
# expected: 1354, 1354, 1475, 1486
```

> **`statement_set_status()` is RESTORED, not dropped.** It was
> **amended** by `0052`, not created by it — it existed before (from
> `0027`/`0036`, amended by `0047`/`0048`). `CREATE OR REPLACE` overwrote
> the original, so the rollback block above puts the **pre-0052 body
> back** (copied verbatim from `0047`). The same is true of
> `statements_check_subject()` (from `0027`) and
> `publish_credential_owner_guard()` (from `0048`).
>
> **If the rollback had dropped those three instead, live would have lost
> the statement-status gate and the credential guard** — a far worse
> state than the one being undone. That is why the block restores rather
> than drops, and why it was tested rather than assumed.
>
> **The whole-database rollback, if you prefer it.** If anything in the
> restore is in doubt, the honest rollback is `pg_restore` from the
> verified dump:
>
> ```bash
> # DESTRUCTIVE. Restores the WHOLE database from the pre-0052 dump.
> # Only if you have decided to undo the whole apply.
> docker exec -u postgres shared-postgres \
>   pg_restore -U postgres -d gustale --clean --if-exists /tmp/pre-0052.dump
> ```
>
> That restores everything, including anything else that changed since
> the dump was taken. **Only the owner decides whether that is
> acceptable**, and only if nothing else has changed since the dump was
> taken.
---

## 7. The summary

| step | what | if it fails |
|---|---|---|
| 0 | confirm the fix is in `main`; confirm `0052` is not applied | **stop** — do not apply |
| 1 | `pg_dump` to `/home/gustale/backups/pre-0052-<stamp>.dump`, verified with `pg_restore --list` | **stop** — no verified dump, no apply |
| 2 | `dryrun-migration.sh` on the test Postgres: applies twice, reports counts | **stop** — do not apply to live |
| 3 | `apply-migration-live.sh` | transactional; auto-rollback; check §6.1 |
| 4 | the `0052`-specific verification queries | report; do not "fix" live by hand |
| 5 | the receipt, committed and pushed | — |
| 6 | the rollback, if needed | prefer `pg_restore` from the dump |

**Nothing in this document has been run.** It was written from the
scripts and the migration's own contents; every count and every expected
value comes from the migration's proof block, the receipt, or the
assertions in `apply-migration-live.sh`. **The sandbox proof of `0052`
is in `docs/MIGRATION-RECEIPT-0052.md`** — the chain passed, 29 proof
cases confirmed, the idempotent re-apply was clean, and a deliberate
failure rolled the whole migration back with zero trace.
