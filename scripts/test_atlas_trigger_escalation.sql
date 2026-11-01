-- The credential TRIGGER ESCALATION check.
--
-- WHY THIS IS A SEPARATE FILE
--
-- The main constraint suite (scripts/test_atlas_schema.sql) runs TWICE in
-- the chain: once before migration 0038, and once after it. The D9
-- publish-credential cases belong to the second run.
--
-- These cases cannot go there. They assert a GRANT state that only
-- migrations 0041 and 0042 establish:
--
--   - the bot holds SELECT on publish_credential  (0041 grants it)
--   - the bot holds neither TRIGGER nor REFERENCES (0042 revokes them)
--
-- The second run of the main suite happens BEFORE 0041 and 0042, so it
-- would see a state that exists only mid-chain — and a chain that only
-- ever passes in the middle is not a chain that passes.
--
-- So this is its own file, run after 0042, with its own report line.
--
-- WHAT IT PROVES
--
-- TRIGGER is the privilege to CREATE a trigger on a table. A trigger
-- FIRES AS THE USER WHO PERFORMED THE INSERT. So the bot could:
--
--   1. plant a trigger on publish_credential, whose function lives in
--      `public` (the bot has CREATE on the schema);
--   2. not insert anything itself;
--   3. let the ISSUER insert a credential — and the bot's trigger would
--      fire, inside that insert, WITH THE ISSUER'S PRIVILEGES.
--
-- Proven on a disposable copy of the live structure:
--
--   NOTICE:  THE BOT TRIGGER RAN as gustale_credential_issuer
--
-- And a BEFORE trigger can REWRITE the row: the issuer inserted
-- `verified_by = 'the-real-owner'` and the bot's trigger changed it to
-- `'GRANTED BY THE BOT'`. The credential's audit trail was forgeable.
--
-- The guard was not merely bypassable — it was INSTRUMENTED by the party
-- it was meant to exclude.
--
-- THE DISPOSABLE MARKER
--
-- This test refuses to run against a database that is not marked
-- disposable. It makes no changes that outlive itself, but the rule is
-- uniform: no test writes against a database nobody marked for it.

-- ─── the disposable guard ──────────────────────────────────────────────

DO $$
DECLARE
  v_db text := current_database();
  v_marked boolean := false;
BEGIN
  -- The marker table may not exist yet on a database that has never
  -- been marked. That is the SAME as "not marked" — the default is deny.
  IF to_regclass('public.gustale_disposable_database') IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM gustale_disposable_database
    ) INTO v_marked;
  END IF;

  IF NOT v_marked THEN
    RAISE EXCEPTION
      'REFUSED: the credential escalation tests refuse to run against the database % — it is not marked disposable. Apply scripts/mark_disposable_db.sql to a database you created for them, and NEVER to production.',
      v_db;
  END IF;
END $$;

-- ─── the cases ─────────────────────────────────────────────────────────

DO $$
DECLARE
  v_pass integer := 0;
  v_fail integer := 0;
  v_err text;
  v_trigger boolean;
  v_references boolean;
  v_select boolean;
  v_insert boolean;
  v_bad_tables text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables
                  WHERE table_schema='public' AND table_name='publish_credential') THEN
    RAISE EXCEPTION 'the publish credential table does not exist — migration 0038 has not run';
  END IF;

  SELECT has_table_privilege('gustale','publish_credential','TRIGGER')   INTO v_trigger;
  SELECT has_table_privilege('gustale','publish_credential','REFERENCES') INTO v_references;
  SELECT has_table_privilege('gustale','publish_credential','SELECT')     INTO v_select;
  SELECT has_table_privilege('gustale','publish_credential','INSERT')     INTO v_insert;

  -- (a) CREATE TRIGGER as the bot must be REFUSED.
  --
  -- The role is assumed and reset inside the statement, because SET ROLE
  -- is a session property and the EXECUTE happens in the same session.
  v_err := '';
  BEGIN
    EXECUTE 'SET LOCAL ROLE gustale; '
         || 'CREATE TRIGGER bot_planted_trg BEFORE INSERT ON publish_credential '
         || 'FOR EACH ROW EXECUTE FUNCTION publish_credential_owner_guard()';
  EXCEPTION WHEN OTHERS THEN
    v_err := SQLERRM;
  END;

  IF v_err IS NULL THEN
    v_fail := v_fail + 1;
    RAISE WARNING 'FAIL  the bot CAN create a trigger on publish_credential -- it would fire with the inserter''s privileges';
  ELSE
    v_pass := v_pass + 1;
    RAISE NOTICE 'PASS  the bot cannot create a trigger on publish_credential';
  END IF;

  -- (b) the escalation privileges are gone.
  IF NOT v_trigger AND NOT v_references THEN
    v_pass := v_pass + 1;
    RAISE NOTICE 'PASS  the bot holds neither TRIGGER nor REFERENCES on publish_credential';
  ELSE
    v_fail := v_fail + 1;
    RAISE WARNING 'FAIL  the bot holds TRIGGER=% REFERENCES=% on publish_credential -- the escalation privilege is still held',
      v_trigger, v_references;
  END IF;

  -- (c) the bot cannot write to the table either.
  IF NOT v_insert THEN
    v_pass := v_pass + 1;
    RAISE NOTICE 'PASS  the bot holds no INSERT on publish_credential';
  ELSE
    v_fail := v_fail + 1;
    RAISE WARNING 'FAIL  the bot holds INSERT on publish_credential';
  END IF;

  -- (d) SELECT is still held — statement_set_status() reads the table AS
  -- ITS CALLER, because it is not SECURITY DEFINER, and the bot calls
  -- it. Revoking SELECT would break the bot's legitimate use.
  IF v_select THEN
    v_pass := v_pass + 1;
    RAISE NOTICE 'PASS  the bot still holds SELECT on publish_credential';
  ELSE
    v_fail := v_fail + 1;
    RAISE WARNING 'FAIL  the bot does not hold SELECT on publish_credential -- statement_set_status() would fail';
  END IF;

  -- (e) the bot holds TRIGGER only on tables it can also WRITE. The
  --     escalation needs TRIGGER on a table it cannot write to. If one
  --     ever appears, this fails loudly rather than waiting to be found.
  SELECT string_agg(c.relname, ', ') INTO v_bad_tables
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE c.relkind = 'r'
     AND n.nspname = 'public'
     AND has_table_privilege('gustale', c.oid, 'TRIGGER')
     AND NOT has_table_privilege('gustale', c.oid, 'INSERT')
     AND NOT has_table_privilege('gustale', c.oid, 'UPDATE')
     AND NOT has_table_privilege('gustale', c.oid, 'DELETE');

  IF v_bad_tables IS NULL THEN
    v_pass := v_pass + 1;
    RAISE NOTICE 'PASS  the bot holds TRIGGER only on tables it can also write';
  ELSE
    v_fail := v_fail + 1;
    RAISE WARNING 'FAIL  the bot holds TRIGGER on tables it cannot write to: %', v_bad_tables;
  END IF;

  -- (f) and the arrangement that makes the guard meaningful: the bot is
  --     NOT a superuser, and NOT a member of the issuer role.
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='gustale' AND rolsuper) THEN
    v_fail := v_fail + 1;
    RAISE WARNING 'FAIL  the bot role is a SUPERUSER -- the guard does not constrain it';
  ELSE
    v_pass := v_pass + 1;
    RAISE NOTICE 'PASS  the bot role is not a superuser';
  END IF;

  IF pg_has_role('gustale','gustale_credential_issuer','MEMBER') THEN
    v_fail := v_fail + 1;
    RAISE WARNING 'FAIL  the bot role is a member of the issuer role -- it could issue a credential';
  ELSE
    v_pass := v_pass + 1;
    RAISE NOTICE 'PASS  the bot role is not a member of the issuer role';
  END IF;

  RAISE NOTICE 'ATLAS_TRIGGER_ESCALATION: % passed, % failed', v_pass, v_fail;

  IF v_fail > 0 THEN
    RAISE EXCEPTION 'the credential escalation checks FAILED (% of %)', v_fail, v_pass + v_fail;
  END IF;
END $$;
