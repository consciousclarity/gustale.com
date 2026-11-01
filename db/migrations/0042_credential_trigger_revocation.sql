-- 0042_credential_trigger_revocation.sql
--
-- THE TRIGGER ESCALATION ON publish_credential.
--
-- `gustale` — the bot's role — holds TRIGGER on `publish_credential`. The
-- table is owned by `gustale_credential_issuer`, and the bot cannot write
-- to it. That combination was read as safe: "the bot has no INSERT, so
-- it cannot issue a credential."
--
-- IT IS NOT SAFE, and this migration closes it.
--
-- WHAT TRIGGER ACTUALLY MEANS
--
-- TRIGGER is the privilege to CREATE a trigger on a table. A trigger
-- FIRES AS THE USER WHO PERFORMED THE INSERT. So:
--
--   1. the bot plants a trigger on `publish_credential`, whose function
--      lives in `public` (the bot has CREATE on the schema);
--   2. the bot does NOT insert anything;
--   3. the ISSUER — or the migration role — inserts a credential;
--   4. the bot's trigger runs, INSIDE that insert, WITH THE ISSUER'S
--      PRIVILEGES.
--
-- PROVEN, on a disposable copy of the live structure:
--
--   NOTICE:  THE BOT TRIGGER RAN as gustale_credential_issuer
--
-- And a BEFORE trigger can REWRITE the row. The issuer inserted
-- `verified_by = 'the-real-owner'` and the bot's trigger changed it to
-- `'GRANTED BY THE BOT'`. The credential's audit trail is forgeable.
--
-- So the guard was not merely bypassable — it was INSTRUMENTED BY THE
-- PARTY IT WAS MEANT TO EXCLUDE.
--
-- WHY THIS IS THE ONLY TABLE WITH THE PATTERN
--
-- The audit: the bot holds TRIGGER and REFERENCES on all 80 public
-- tables, and full write on 79 of them. That is BY DESIGN — the bot
-- owns the content and the user confirmed it on 2026-10-24.
--
-- TRIGGER on a table you can already write to is not an escalation. The
-- escalation needs TRIGGER on a table you CANNOT write to, where a MORE
-- privileged role writes. Exactly one table qualifies:
--
--   publish_credential — owned by gustale_credential_issuer
--
-- The other projects' roles on this shared cluster (`dewata`,
-- `scribe_app`) hold no privilege on it at all.
--
-- WHAT IS REVOKED, AND WHY SELECT STAYS
--
--   REVOKE TRIGGER     — the escalation itself
--   REVOKE REFERENCES  — REFERENCES lets the bot add a FOREIGN KEY
--                         constraint pointing at publish_credential, which
--                         is a DDL change to a table it does not own.
--                         It has no legitimate use here.
--   KEEP SELECT        — `statement_set_status()` reads the credential
--                         row to check the actor, and that function is
--                         NOT SECURITY DEFINER (owner=postgres,
--                         secdef=false), so it reads the table AS ITS
--                         CALLER. The bot calls it. Revoking SELECT
--                         would break the bot's own legitimate use.
--
-- The bot's grants on publish_credential go from rxt to r.
--
-- IDEMPOTENT
--
-- `REVOKE` is idempotent — revoking a privilege that is not held is a
-- no-op, not an error. The guard below reports what it finds, so a
-- re-run says "already revoked" rather than failing.

-- ─── the revocations ───────────────────────────────────────────────────

REVOKE TRIGGER ON publish_credential FROM gustale;
REVOKE REFERENCES ON publish_credential FROM gustale;

-- The grant is now r (SELECT) only. This is stated explicitly so the
-- intent survives a later GRANT ALL by accident: the GRANT block below
-- re-asserts the reduced set.
GRANT SELECT ON publish_credential TO gustale;

-- ─── the audit, reported ───────────────────────────────────────────────

DO $$
DECLARE
  v_bot_trigger boolean;
  v_bot_references boolean;
  v_bot_select boolean;
  v_bad_tables text;
  v_writers text;
BEGIN
  SELECT has_table_privilege('gustale','publish_credential','TRIGGER')
    INTO v_bot_trigger;
  SELECT has_table_privilege('gustale','publish_credential','REFERENCES')
    INTO v_bot_references;
  SELECT has_table_privilege('gustale','publish_credential','SELECT')
    INTO v_bot_select;

  IF v_bot_trigger OR v_bot_references THEN
    RAISE EXCEPTION
      'the revocation failed: the bot still holds TRIGGER=% REFERENCES=% on publish_credential',
      v_bot_trigger, v_bot_references;
  END IF;

  IF NOT v_bot_select THEN
    RAISE EXCEPTION
      'the revocation removed SELECT, which statement_set_status() needs (it is not SECURITY DEFINER)';
  END IF;

  -- The same pattern, checked across EVERY public table: TRIGGER on a
  -- table the bot cannot write to. If another table ever acquires it,
  -- this fails loudly instead of waiting to be discovered.
  SELECT string_agg(c.relname, ', ')
    INTO v_bad_tables
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE c.relkind = 'r'
     AND n.nspname = 'public'
     AND has_table_privilege('gustale', c.oid, 'TRIGGER')
     AND NOT has_table_privilege('gustale', c.oid, 'INSERT')
     AND NOT has_table_privilege('gustale', c.oid, 'UPDATE')
     AND NOT has_table_privilege('gustale', c.oid, 'DELETE');

  IF v_bad_tables IS NOT NULL THEN
    RAISE EXCEPTION
      'the bot holds TRIGGER on tables it cannot write to: %', v_bad_tables;
  END IF;

  -- Who can still WRITE to the table? Each of those roles is a party
  -- whose insert the bot would have ridden had the trigger survived.
  SELECT string_agg(DISTINCT r.rolname, ', ')
    INTO v_writers
    FROM pg_roles r
   WHERE r.rolcanlogin
     AND (has_table_privilege(r.rolname,'publish_credential','INSERT')
       OR has_table_privilege(r.rolname,'publish_credential','UPDATE'));

  RAISE NOTICE 'PUBLISH_CREDENTIAL_TRIGGER_REVOKED=1';
  RAISE NOTICE '  the bot''s grants on publish_credential: SELECT=% TRIGGER=% REFERENCES=%',
    v_bot_select, v_bot_trigger, v_bot_references;
  RAISE NOTICE '  the roles that can still write to it: %', COALESCE(v_writers,'(none)');
  RAISE NOTICE '  every other table: the bot holds TRIGGER only where it can also write';
END $$;
