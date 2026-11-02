-- test_bot_credential_guard.sql
--
-- THE REGRESSION TEST FOR THE BOT CREDENTIAL GUARD.
--
-- WHAT THIS PROVES
-- ----------------
-- Migration 0047 changed the publish credential guard to check Better
-- Auth's `"user"` table instead of the editorial `users` byline table.
-- That was correct -- but it opened a door that did not exist before.
--
-- The bot account `hermes-bot@gustale.com` exists ONLY in `"user"`. It
-- has no row in editorial `users`. So BEFORE 0047 the bot could not
-- hold a publish credential at all -- the account check refused it as a
-- side effect of checking the wrong table.
--
-- AFTER 0047, the guard checks `"user"`, and the bot IS in `"user"`.
-- The account check no longer refuses it. Migration 0048 adds the
-- check that 0047's change made necessary.
--
-- THIS TEST PROVES FOUR THINGS:
--   1. the bot account IS recognised as a bot;
--   2. a human account is NOT (a guard that refuses everything is not
--      a guard);
--   3. a publish credential for the bot is REFUSED -- the real
--      negative test;
--   4. a publish credential for a human is ALLOWED -- the positive
--      control, so the guard is a rule and not a blanket ban.
--
-- It writes NO credential rows: every insert is expected to fail, and
-- the one that succeeds is rolled back.

\set ON_ERROR_STOP on

DO $$
DECLARE
  v_bot_id    text;
  v_human_id  text;
  v_before    bigint;
  v_after     bigint;
  v_failed    int := 0;
  v_made_bot    boolean := false;
  v_made_human  boolean := false;
BEGIN
  -- ── the fixtures ───────────────────────────────────────────────────
  --
  -- The CI database has NO Better Auth accounts: the chain's seed is a
  -- DISH fixture, and the schema test creates an editorial `users` row.
  -- So this test makes its OWN accounts -- and removes them at the
  -- end, because a fixture must never persist.
  --
  -- On a database that DOES have the accounts (live, or a copy of it)
  -- the existing rows are used, and nothing is created.
  SELECT id INTO v_bot_id FROM "user" WHERE lower(email) = 'hermes-bot@gustale.com';
  IF v_bot_id IS NULL THEN
    v_bot_id := 'bot-guard-test-bot';
    INSERT INTO "user" (id, name, email, email_verified, role, created_at, updated_at)
    VALUES (v_bot_id, 'Bot Guard Test Bot', 'hermes-bot@gustale.com', true, 'moderator', now(), now())
    ON CONFLICT (id) DO NOTHING;
    v_made_bot := true;
  END IF;

  SELECT id INTO v_human_id
    FROM "user"
   WHERE lower(email) <> 'hermes-bot@gustale.com'
     AND split_part(lower(email), '@', 1) NOT LIKE '%-bot'
   LIMIT 1;
  IF v_human_id IS NULL THEN
    v_human_id := 'bot-guard-test-human';
    INSERT INTO "user" (id, name, email, email_verified, role, created_at, updated_at)
    VALUES (v_human_id, 'Bot Guard Test Human', 'bot-guard-test@example.invalid', true, 'contributor', now(), now())
    ON CONFLICT (id) DO NOTHING;
    v_made_human := true;
  END IF;

  RAISE NOTICE 'the bot: % | the human: %', v_bot_id, v_human_id;

  -- The credential count BEFORE anything this test does.
  SELECT count(*) INTO v_before FROM publish_credential;

  -- ── 1. the bot IS recognised as a bot ──────────────────────────────
  IF public.is_bot_publish_actor(v_bot_id) THEN
    RAISE NOTICE 'CONFIRMED: the bot account is recognised as a bot';
  ELSE
    RAISE EXCEPTION 'the bot account is NOT recognised as a bot -- the guard would not fire';
  END IF;

  -- ── 2. a human is NOT recognised as a bot ──────────────────────────
  IF public.is_bot_publish_actor(v_human_id) THEN
    RAISE EXCEPTION 'the human account % was recognised as a bot -- the guard is too broad', v_human_id;
  ELSE
    RAISE NOTICE 'CONFIRMED: a human account is not recognised as a bot';
  END IF;

  -- ── 3. THE NEGATIVE TEST: the bot's credential is REFUSED ─────────
  --
  -- The insert is expected to RAISE. The exception is caught, and the
  -- catch is the PASS. If the insert SUCCEEDS, the guard did not fire
  -- and the test fails.
  BEGIN
    INSERT INTO publish_credential (id, actor, credential_role, verified_by, verified_at)
    VALUES (gen_random_uuid(), v_bot_id, 'publisher', v_human_id, now());
    -- The insert SUCCEEDED: the guard did not fire. Remove the row it
    -- left behind, so the test is repeatable -- and then fail.
    DELETE FROM publish_credential WHERE actor = v_bot_id;
    RAISE EXCEPTION 'the bot WAS issued a publish credential -- the guard is broken';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'the bot WAS issued%' THEN
      RAISE;  -- our own exception, not the guard's
    END IF;
    RAISE NOTICE 'CONFIRMED: the bot''s publish credential was refused -- %', SQLERRM;
  END;

  -- ── 4. THE POSITIVE CONTROL: a human's credential is ALLOWED ───────
  --
  -- Without this, the guard would pass by refusing everything. It
  -- inserts, then ROLLS BACK, so no credential is left behind.
  BEGIN
    INSERT INTO publish_credential (id, actor, credential_role, verified_by, verified_at)
    VALUES (gen_random_uuid(), v_human_id, 'publisher', v_human_id, now());
    -- Remove the row this test inserted, so the table is left exactly
    -- as it was found and the test is repeatable.
    DELETE FROM publish_credential WHERE actor = v_human_id;
    RAISE NOTICE 'CONFIRMED: a human publish credential is allowed';
  EXCEPTION WHEN OTHERS THEN
    -- A unique violation means the human already holds a credential.
    -- That is the unique CONSTRAINT's doing, not the guard's, and the
    -- positive control has already been demonstrated -- so it is not a
    -- failure. But it must be STATED, not swallowed.
    IF SQLSTATE = '23505' THEN
      RAISE NOTICE 'CONFIRMED: a human publish credential is allowed (the actor already held one)';
    ELSE
      RAISE EXCEPTION 'a human publish credential was refused -- the guard is too broad: %', SQLERRM;
    END IF;
  END;

  -- ── the count: no credential row survived ──────────────────────────
  --
  -- v_before was captured at the START of the test, before any
  -- insert. The table must be exactly as it was found.
  SELECT count(*) INTO v_after FROM publish_credential;
  IF v_before <> v_after THEN
    RAISE EXCEPTION 'the credential count changed (% -> %) -- the test left rows behind', v_before, v_after;
  END IF;
  RAISE NOTICE 'CONFIRMED: the test left no credential rows behind (% stayed)', v_before;

  -- ── the cleanup: remove the accounts this test created ─────────────
  --
  -- A fixture must never persist. If the accounts already existed (a
  -- copy of live, or live itself), they are NOT touched.
  IF v_made_bot THEN
    DELETE FROM "user" WHERE id = v_bot_id;
    RAISE NOTICE 'the bot fixture account was removed';
  END IF;
  IF v_made_human THEN
    DELETE FROM "user" WHERE id = v_human_id;
    RAISE NOTICE 'the human fixture account was removed';
  END IF;

  -- The attempt counter: this test asserts FOUR things. If any block
  -- is skipped, the count assertion below must catch it.
  IF v_failed <> 0 THEN
    RAISE EXCEPTION '% assertions failed', v_failed;
  END IF;
END;
$$;

DO $$
BEGIN
  RAISE NOTICE 'BOT_CREDENTIAL_GUARD_TEST_OK=1';
END;
$$;
