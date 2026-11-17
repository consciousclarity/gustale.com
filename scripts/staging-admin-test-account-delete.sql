-- DELETE the staging admin test account.
-- STAGING DATABASE ONLY.
--
-- This removes the test account and everything that belongs to it: its
-- sessions, its accounts, its passkeys, its verification records.
-- The 'user' row cascades to the tables that reference it.
--
-- The guard is the DATABASE NAME, the same as
-- scripts/staging-admin-test-account.sql.

\set ON_ERROR_STOP on

DO $$
DECLARE
  current_db text := current_database();
  n integer;
BEGIN
  IF current_db <> 'gustale_staging' THEN
    RAISE EXCEPTION 'REFUSING TO RUN: this script is for gustale_staging, not %', current_db;
  END IF;

  -- public."user" is better-auth's table -- the one the account is in.
  SELECT count(*) INTO n FROM public."user"
   WHERE email = 'hermes-admin-test@staging.gustale.com';
  IF n = 0 THEN
    RAISE NOTICE 'the test account is already gone';
    RETURN;
  END IF;

  RAISE NOTICE 'deleting the test account and its % row(s)', n;
END $$;

-- The account is in public."user" (better-auth's table). Its session
-- rows are in public.sessions, which references it by user_id.
--
-- The 'account', 'passkey' and 'verification' tables are checked for
-- existence before they are deleted, because which of them exist
-- depends on the migration chain, and a delete against a missing table
-- would abort the whole cleanup.
DELETE FROM public.sessions
 WHERE user_id IN (SELECT id FROM public."user" WHERE email = 'hermes-admin-test@staging.gustale.com');

DO $$
DECLARE
  t text;
  n integer;
  has_user_id boolean;
  ident text;
BEGIN
  FOREACH t IN ARRAY ARRAY['account', 'accounts', 'passkey', 'passkeys', 'verification'] LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      -- The key column differs by table. `account` and `passkey` are
      -- keyed by `user_id`; `verification` is keyed by `identifier`,
      -- which holds the EMAIL. The old version assumed `user_id` for
      -- every table, so on a schema where `verification` has no
      -- `user_id` the whole cleanup ABORTED at that statement --
      -- the account survived, and the script reported the failure
      -- only as an ERROR in the middle of its output.
      --
      -- So: ask the catalogue which column this table has, and
      -- delete through that one.
      SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = t
           AND column_name = 'user_id'
      ) INTO has_user_id;

      IF has_user_id THEN
        EXECUTE format(
          'DELETE FROM public.%I WHERE user_id IN (SELECT id FROM public."user" WHERE email = %L)',
          t, 'hermes-admin-test@staging.gustale.com');
      ELSE
        EXECUTE format(
          'DELETE FROM public.%I WHERE identifier = %L',
          t, 'hermes-admin-test@staging.gustale.com');
        ident := 'identifier';
      END IF;
      GET DIAGNOSTICS n = ROW_COUNT;
      IF n > 0 THEN
        RAISE NOTICE 'deleted % row(s) from public.% (by %)', n, t,
          CASE WHEN has_user_id THEN 'user_id' ELSE ident END;
      END IF;
    END IF;
  END LOOP;
END $$;

DELETE FROM public."user" WHERE email = 'hermes-admin-test@staging.gustale.com';

\echo '--- the test accounts remaining (must be 0):'
SELECT count(*) AS remaining
FROM public."user"
WHERE email = 'hermes-admin-test@staging.gustale.com';
