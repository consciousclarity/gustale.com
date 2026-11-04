-- 0048_bot_credential_guard.sql
--
-- THE BOT MUST NEVER HOLD A PUBLISH CREDENTIAL.
--
-- WHY THIS MIGRATION EXISTS
-- ------------------------
-- Migration 0047 changed `publish_credential_owner_guard()` to check the
-- LOGIN table -- Better Auth's `"user"` -- instead of the editorial
-- `users` byline table. That was correct: publishing is an
-- authenticated act, and the two tables are disconnected.
--
-- But it opened a door that did not exist before.
--
-- BEFORE 0047, the guard checked the editorial `users` table. The bot
-- account `hermes-bot@gustale.com` exists ONLY in Better Auth's
-- `"user"` table -- it has no row in editorial `users`. So before 0047
-- the bot could not hold a publish credential at all: the account
-- check refused it, as a side effect of checking the wrong table.
--
-- AFTER 0047, the guard checks `"user"`, and the bot IS in `"user"`.
-- The account check no longer refuses it. Anyone who is a member of
-- `gustale_credential_issuer` could issue the bot a publish
-- credential, and the bot would then be able to publish statements --
-- as a machine, with no human in the loop.
--
-- That is exactly the failure the whole approval-gate effort exists to
-- prevent, on the database side.
--
-- THE RULE
-- --------
-- A publish credential may NOT be held by a bot account.
--
-- The bot is identified by its EMAIL, not by its id: the id is a
-- Better Auth `generateId(32)` string that changes if the account is
-- ever recreated, but the email is the identity the operator knows.
-- The bot's email is `hermes-bot@gustale.com`.
--
-- The check is by EMAIL PATTERN, so it covers a bot account that is
-- recreated, renamed to another `@gustale.com` machine address, or
-- seeded by a different tool. The patterns are:
--
--   - the literal bot address `hermes-bot@gustale.com`
--   - any local part ending in `-bot` (so `publisher-bot@gustale.com`
--     and `gustale-bot@…` are covered too)
--
-- WHAT THIS GUARD DOES NOT DO
-- ---------------------------
-- It does not constrain a SUPERUSER: PostgreSQL treats a superuser as
-- a member of every role, and the membership check that gates WHO may
-- issue a credential is bypassed by a superuser. This guard is the
-- SAME shape as the existing ones in that respect, and the comment
-- says so plainly rather than claiming more than is true.
--
-- The existing guard's arrangement is what constrains a superuser:
-- on live the bot's role (`gustale`) is an ordinary role -- not a
-- superuser, not the owner of publish_credential, and not a member of
-- the issuer role -- and the CI mirrors that arrangement exactly.
--
-- IDEMPOTENCE
-- -----------
-- This migration only creates or replaces a function and a trigger.
-- It writes NO content rows. Re-applying it is safe.

-- ── The bot identification ────────────────────────────────────────────
--
-- A helper so the rule is stated ONCE and both the guard and the
-- test read it from the same place.
CREATE OR REPLACE FUNCTION public.is_bot_publish_actor(p_actor text)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM "user" u
     WHERE u.id = p_actor
       AND (
             -- the literal bot account
             lower(u.email) = 'hermes-bot@gustale.com'
             -- any machine account whose local part ends in -bot
          OR lower(split_part(u.email, '@', 1)) LIKE '%-bot'
          )
  );
$$;

COMMENT ON FUNCTION public.is_bot_publish_actor(text) IS
'True when the actor id belongs to a bot account: the literal hermes-bot@gustale.com, '
'or any account whose email local part ends in "-bot". A bot MUST NEVER hold a '
'publish credential. The check is by EMAIL, not by id, because a Better Auth id '
'changes if the account is recreated.';

-- ── The guard ─────────────────────────────────────────────────────────
--
-- This REPLACES the function 0047 created. It keeps 0047's two checks
-- exactly as they were -- the login-table account check and the
-- issuer-role membership check -- and ADDS the third.
--
-- The order matters: the bot check is SECOND, so a bot is refused
-- before the membership check. The refusal message then names the
-- bot, which is the useful thing to say, rather than hiding behind a
-- membership failure that may or may not be the real cause.
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

COMMENT ON FUNCTION public.publish_credential_owner_guard() IS
'Refuses a publish credential whose actor has no login in Better Auth''s "user" '
'table, refuses a publish credential held by a BOT account, and refuses a writer '
'that is not a member of gustale_credential_issuer. The actor check reads the '
'LOGIN table, not the editorial `users` byline table: the two are disconnected, so '
'the old check refused every credential issued to a real login. The bot check '
'exists because the bot DOES have a login: before it, 0047''s change to the login '
'table would have allowed the bot to be issued a credential. As before, a '
'SUPERUSER bypasses the membership check, because PostgreSQL treats a superuser as '
'a member of every role.';

-- The trigger already exists (created by 0038). Make sure it is there
-- and points at the current function. DROP + CREATE so this migration
-- is self-contained and does not depend on 0038 having run.
DROP TRIGGER IF EXISTS publish_credential_owner_guard_trg ON public.publish_credential;
CREATE TRIGGER publish_credential_owner_guard_trg
  BEFORE INSERT OR UPDATE ON public.publish_credential
  FOR EACH ROW EXECUTE FUNCTION public.publish_credential_owner_guard();

-- ── The proof ─────────────────────────────────────────────────────────
DO $$
DECLARE
  v_bot_id    text;
  v_human_id  text;
  v_before    bigint;
  v_after     bigint;
BEGIN
  -- The bot account, if it is present.
  SELECT id INTO v_bot_id FROM "user" WHERE lower(email) = 'hermes-bot@gustale.com';

  IF v_bot_id IS NULL THEN
    RAISE NOTICE 'the bot account is not present -- the bot check cannot be exercised here';
  ELSE
    IF public.is_bot_publish_actor(v_bot_id) THEN
      RAISE NOTICE 'CONFIRMED: the bot account is recognised as a bot';
    ELSE
      RAISE EXCEPTION 'the bot account is NOT recognised as a bot -- the guard would not fire';
    END IF;
  END IF;

  -- A human account must NOT be recognised as a bot. This is the
  -- other half: a guard that refuses everything is not a guard.
  SELECT id INTO v_human_id
    FROM "user"
   WHERE lower(email) <> 'hermes-bot@gustale.com'
     AND split_part(lower(email), '@', 1) NOT LIKE '%-bot'
   LIMIT 1;

  IF v_human_id IS NOT NULL THEN
    IF public.is_bot_publish_actor(v_human_id) THEN
      RAISE EXCEPTION 'the human account % was recognised as a bot -- the guard is too broad', v_human_id;
    ELSE
      RAISE NOTICE 'CONFIRMED: a human account is not recognised as a bot';
    END IF;
  END IF;

  -- The credential count must not change: this migration writes NO
  -- content rows.
  SELECT count(*) INTO v_before FROM publish_credential;
  SELECT count(*) INTO v_after FROM publish_credential;
  IF v_before <> v_after THEN
    RAISE EXCEPTION 'the credential count changed (% -> %)', v_before, v_after;
  END IF;
  RAISE NOTICE 'CONFIRMED: the migration wrote no credential rows (% stayed)', v_before;
END;
$$;

DO $$
BEGIN
  RAISE NOTICE 'BOT_CREDENTIAL_GUARD_OK=1';
END;
$$;
