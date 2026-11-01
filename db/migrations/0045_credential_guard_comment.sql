-- 0045_credential_guard_comment.sql
--
-- THE COMMENT ON THE CREDENTIAL GUARD WAS WRONG, AND THE WRONGNESS
-- MATTERED.
--
-- Migration 0041's function carried this claim:
--
--   "Membership is not bypassable. A superuser is not automatically a
--    member of every role; the membership is granted explicitly, and
--    the bot's role is granted none."
--
-- THAT IS FALSE. PostgreSQL treats a SUPERUSER as a member of every
-- role. Proven on a CI-shaped database:
--
--   SELECT pg_has_role('gustale','gustale_credential_issuer','MEMBER');
--   -> t
--
-- for a role that had never been granted the membership — because it
-- was a superuser. And a superuser could then insert a valid
-- publish_credential row: the guard's own check answered "yes".
--
-- A false comment in a security guard is worse than no comment, because
-- the next reader trusts it. Someone auditing this would conclude the
-- trigger is superuser-proof, and it is not.
--
-- WHAT THIS MIGRATION CHANGES
--
-- ONLY THE COMMENTS. The function's LOGIC IS NOT TOUCHED.
--
-- That is deliberate, and it is the decision the user made: a superuser
-- bypasses any check, so rewriting the trigger around the superuser
-- case would be rearranging the deck. The real fix is the ARRANGEMENT
-- — make the bot's role an ordinary role, so the check has the meaning
-- it claims. Migration 0042 and the CI change do that:
--
--   - 0042 revokes the TRIGGER privilege that let the bot plant a
--     trigger on the table and ride somebody else's insert
--   - the CI now creates the bot as a plain LOGIN role with no
--     SUPERUSER, so the CI's checks answer the way live's do
--
-- So the guard's check is CORRECT FOR AN ORDINARY ROLE, and the
-- arrangement now guarantees the role IS ordinary. The comment has to
-- say precisely that, and no more.
--
-- THE HONEST STATEMENT OF WHAT THE GUARD GUARANTEES:
--
--   For a role that is NOT a superuser:
--     - the account check refuses an unknown actor
--     - the membership check refuses a role that was not granted the
--       issuer role
--     - a REVOKE on publish_credential is real, because the bot is not
--       the owner and not a superuser
--
--   For a SUPERUSER:
--     - the account check still applies
--     - the membership check DOES NOT: a superuser is a member of every
--       role, so it passes
--     - a REVOKE does not apply: a superuser bypasses privilege checks
--
--   A superuser is therefore NOT constrained by this guard. What
--   constrains it is the ARRANGEMENT: the bot's role is not a superuser
--   on live, and the CI now mirrors that.
--
-- IDEMPOTENT — CREATE OR REPLACE with the same body and the same
-- logic, and COMMENT ON FUNCTION is idempotent by definition.

CREATE OR REPLACE FUNCTION public.publish_credential_owner_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  v_may_issue boolean := false;
BEGIN
  -- (1) The account must exist.
  IF NOT EXISTS (SELECT 1 FROM users u WHERE u.id = NEW.actor) THEN
    RAISE EXCEPTION
      'the publish credential for % is refused: there is no such account in users',
      NEW.actor;
  END IF;

  -- (2) The WRITER must be a MEMBER OF THE ISSUER ROLE.
  --
  -- The account check says the credential is FOR a real account. This
  -- says WHO MAY GRANT it — and without it, the bot's role could issue
  -- itself a publish credential for a real account, because the account
  -- WAS real. The account check was never an authorisation check.
  --
  -- MEMBERSHIP, not a table privilege. A table privilege is the wrong
  -- instrument here: a SUPERUSER bypasses every privilege check, so
  -- `has_table_privilege` says true for a superuser no matter what
  -- was revoked.
  --
  -- WHAT THIS CHECK GUARANTEES — and it is worth stating precisely,
  -- because an earlier version of this comment claimed more than was
  -- true:
  --
  --   FOR A ROLE THAT IS NOT A SUPERUSER:
  --     - an unknown actor is refused;
  --     - a role that was not GRANTED the issuer role is refused;
  --     - a REVOKE on publish_credential is real, because the bot is
  --       neither the owner nor a superuser.
  --
  --   FOR A SUPERUSER:
  --     - the account check above still applies;
  --     - this membership check DOES NOT. PostgreSQL treats a superuser
  --       as a member of EVERY role, so `pg_has_role` returns true and
  --       the check passes. An earlier version of this comment claimed
  --       that a superuser is NOT automatically a member of every role.
  --       That claim was FALSE, and it was false in a way that could
  --       mislead an auditor into believing this guard was
  --       superuser-proof.
  --     - a REVOKE does not constrain it either.
  --
  --   So a superuser is NOT constrained by this guard. What constrains
  --   it is the ARRANGEMENT, not this check: on live the bot's role
  --   (`gustale`) is an ordinary role — not a superuser, not the owner
  --   of publish_credential, and not a member of the issuer role — and
  --   the CI now mirrors that arrangement exactly, so the check has the
  --   meaning it claims wherever it runs.
  --
  -- So the issuer role's MEMBERS are the roles that may issue
  -- credentials, and nobody else — among roles that are not superusers.
  SELECT pg_has_role(current_user, 'gustale_credential_issuer', 'MEMBER')
    INTO v_may_issue;

  IF NOT v_may_issue THEN
    RAISE EXCEPTION
      'the publish credential for % is refused: the role % may not issue credentials',
      NEW.actor, current_user;
  END IF;

  RETURN NEW;
END $$;

COMMENT ON FUNCTION public.publish_credential_owner_guard() IS
  'Refuses a publish credential unless (1) the actor is a real users account AND (2) the role that WROTE the row holds the credential-issuing privilege. The account check alone was not an authorisation check: the bot could insert a valid credential for a real account. SCOPE: for a non-superuser role both checks hold and a REVOKE on publish_credential is real. For a SUPERUSER the membership check does NOT hold (PostgreSQL makes a superuser a member of every role) and a REVOKE does not constrain it — a superuser is not constrained by this guard. What constrains it is the arrangement: the bot role is an ordinary role on live, and the CI mirrors that.';

-- ─── the audit ─────────────────────────────────────────────────────────

DO $$
DECLARE
  v_bot_super boolean;
  v_bot_member boolean;
  v_bot_trigger boolean;
  v_migrator_member boolean;
BEGIN
  SELECT rolsuper INTO v_bot_super FROM pg_roles WHERE rolname='gustale';
  SELECT pg_has_role('gustale','gustale_credential_issuer','MEMBER') INTO v_bot_member;
  SELECT has_table_privilege('gustale','publish_credential','TRIGGER') INTO v_bot_trigger;
  SELECT pg_has_role('gustale_migrator','gustale_credential_issuer','MEMBER') INTO v_migrator_member;

  RAISE NOTICE 'CREDENTIAL_GUARD_COMMENT_CORRECTED=1';
  RAISE NOTICE '  the bot role is a superuser:      %', v_bot_super;
  RAISE NOTICE '  the bot is an issuer member:     %', v_bot_member;
  RAISE NOTICE '  the bot holds TRIGGER:           %', v_bot_trigger;
  RAISE NOTICE '  the migrator is an issuer member: %', v_migrator_member;
  RAISE NOTICE '';
  RAISE NOTICE '  The guard constrains a role that is NOT a superuser.';
  RAISE NOTICE '  It does not constrain a superuser: pg_has_role() returns true';
  RAISE NOTICE '  for a superuser for every role. The arrangement is what';
  RAISE NOTICE '  constrains it — the bot role is an ordinary role on live, and';
  RAISE NOTICE '  the CI now creates it that way too.';

  -- The arrangement must hold wherever this runs, or the comment is
  -- describing a situation that does not exist.
  IF v_bot_super THEN
    RAISE EXCEPTION
      'the bot role is a SUPERUSER — this guard does not constrain it, and the arrangement does not hold';
  END IF;

  IF v_bot_member THEN
    RAISE EXCEPTION
      'the bot role is a member of the issuer role — it could issue a credential';
  END IF;
END $$;
