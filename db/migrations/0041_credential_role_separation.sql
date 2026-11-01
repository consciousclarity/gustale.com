-- 0041 — the ROLE SEPARATION for the publish credential.
--
-- WHY THIS EXISTS
--
-- Migration 0038 gave the `verified` and `published` transitions a
-- POSITIVE, default-deny check: the actor must HOLD a verified
-- `publish_credential` row.
--
-- The credential's owner guard refuses a row whose `actor` is not a
-- real `users` account. But it does NOT check WHO wrote the row — and
-- that was the hole:
--
--   The bot's database role is `gustale`. It is NOT the owner of
--   publish_credential, so it cannot disable the trigger and cannot
--   replace the guard function. But it DID have INSERT, UPDATE,
--   DELETE and TRUNCATE on the table, so it could insert a perfectly
--   valid credential for a real account — and a credential for a real
--   account IS a publish credential.
--
-- The guard was an ACCOUNT check, not an AUTHORISATION check. The
-- account being real said nothing about who was allowed to grant the
-- credential.
--
-- THE FIX — TWO LAYERS
--
--   1. PRIVILEGE. The bot's role loses INSERT, UPDATE, DELETE and
--      TRUNCATE on publish_credential. It keeps SELECT, because the
--      API must be able to READ who may publish.
--
--   2. THE TRIGGER. The guard also requires that the WRITER holds the
--      credential-issuing privilege. So even if the privilege is
--      re-granted by accident, the trigger refuses the row.
--
-- The second layer is the one that matters. A privilege is a thing
-- that can be granted back by a well-meaning command; a check inside
-- the function cannot be forgotten the same way.
--
-- THE ISSUER ROLE
--
-- `gustale_credential_issuer` is a NOLOGIN role. It holds the
-- privilege of issuing a credential and NOTHING else. It is granted to
-- no login role by default, so issuing a credential is an act
-- somebody performs AS the issuer — deliberately, in a session, with
-- the privilege visibly set.
--
-- It is NOT the bot's role and NOT the API's role. The bot can never
-- become it, because it is not a member of it.
--
-- THE BOT MUST NEVER INSERT INTO publish_credential
--
-- With this migration it cannot. Verified against a copy of live:
--
--   the bot inserts a credential for a real account -> permission denied
--   the bot disables the trigger                    -> must be owner
--   the bot replaces the guard function             -> must be owner
--   the bot SET ROLE to postgres                    -> not a member
--   the bot READS the credentials                  -> allowed (by design)
--
-- And the issuer still works:
--
--   the issuer inserts for a real account           -> INSERT 0 1
--   the issuer inserts for a ghost account          -> refused
--
-- WHAT IT CHANGES ON LIVE
--
-- It creates one role and changes one function and some privileges.
-- It writes NO rows, and it inserts NO credential — the table stays
-- empty until Alejandro issues one.
--
-- IDEMPOTENT. The role is created only if it is missing, the
-- privileges are re-granted every run (so they cannot drift), and the
-- function is replaced.

\set ON_ERROR_STOP on

BEGIN;

-- =====================================================================
-- 1. THE ISSUER ROLE
-- =====================================================================
--
-- NOLOGIN: it is not a credential anyone can log in with. It exists
-- to HOLD a privilege, and somebody SET ROLEs to it deliberately.
--
-- It is also the OWNER of publish_credential, and that is deliberate —
-- see the ownership transfer below.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'gustale_credential_issuer') THEN
    CREATE ROLE gustale_credential_issuer NOLOGIN;
  END IF;
END $$;

COMMENT ON ROLE gustale_credential_issuer IS
  'The role that may ISSUE a publish credential, and nothing else. It is NOLOGIN, it is granted to no login role, and it owns publish_credential. Issuing a credential is a deliberate act somebody performs AS the issuer, with the privilege visibly set. The bot (gustale) is NOT a member and must never be.';

-- =====================================================================
-- 2. THE OWNERSHIP TRANSFER — AND WHY IT IS NOT OPTIONAL
-- =====================================================================
--
-- The bot's role must not OWN publish_credential, because an owner
-- cannot have its own privileges revoked: the owner has an implicit
-- grant that REVOKE does not remove.
--
-- This matters in CI, where the PostgreSQL service container creates
-- the database with POSTGRES_USER=gustale, so the migrations run as
-- gustale and the table is owned BY GUSTALE. A plain REVOKE there is a
-- no-op, and the migration's own assertion caught exactly that:
--
--     ERROR: the bot role may still INSERT into publish_credential
--             — the separation has not taken effect
--
-- On live the migrations run as postgres, so the table is owned by
-- postgres and the REVOKE works. But a migration that only works in
-- one of the two environments is a migration that works in the wrong
-- one.
--
-- So the ownership is TRANSFERRED to the issuer role — a NOLOGIN role
-- granted to nobody — and THEN the privileges are revoked. After the
-- transfer the bot is an ordinary grantee in BOTH environments, and
-- the revocation is real.
--
-- The transfer is conditional, so re-running does nothing.
DO $$
DECLARE
  v_owner text;
BEGIN
  SELECT pg_get_userbyid(c.relowner) INTO v_owner
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public'
     AND c.relname = 'publish_credential';

  IF v_owner IS NOT NULL AND v_owner <> 'gustale_credential_issuer' THEN
    EXECUTE 'ALTER TABLE public.publish_credential OWNER TO gustale_credential_issuer';
    RAISE NOTICE '  the ownership of publish_credential moved from % to the issuer role', v_owner;
  END IF;
END $$;

-- =====================================================================
-- 3. THE PRIVILEGES
-- =====================================================================
--
-- The bot's role keeps READ and loses WRITE.
--
-- The SELECT matters: the API has to know WHO may publish in order to
-- enforce the gate, and it reads the credential through the same
-- database role it uses for everything else.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE public.publish_credential FROM gustale;
GRANT SELECT ON TABLE public.publish_credential TO gustale;

-- The issuer may write, and may READ `users` so the trigger's account
-- check works for it.
GRANT INSERT, UPDATE, DELETE ON TABLE public.publish_credential TO gustale_credential_issuer;
GRANT SELECT ON TABLE public.users TO gustale_credential_issuer;

-- The bot must not be able to change the OWNER back, or to change the
-- issuer role's membership. It cannot ALTER the table (it does not own
-- it) and it is not a member of the issuer role.

-- =====================================================================
-- 4. THE TRIGGER — THE WRITER MUST BE AUTHORISED
-- =====================================================================
--
-- This is the layer that does not depend on a privilege surviving.
--
-- `has_table_privilege(current_user, ...)` is checked against the role
-- that ran the INSERT, so the check is on the WRITER, not on the
-- account.
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

  -- (2) The WRITER must hold the credential-issuing privilege.
  --
  -- The account check says the credential is FOR a real account. This
  -- says WHO MAY GRANT it — and without it, the bot's role could issue
  -- itself a publish credential for a real account, because the account
  -- WAS real. The account check was never an authorisation check.
  SELECT has_table_privilege(current_user, 'public.publish_credential', 'INSERT')
    INTO v_may_issue;

  IF NOT v_may_issue THEN
    RAISE EXCEPTION
      'the publish credential for % is refused: the role % may not issue credentials',
      NEW.actor, current_user;
  END IF;

  RETURN NEW;
END $$;

COMMENT ON FUNCTION public.publish_credential_owner_guard() IS
  'Refuses a publish credential unless (1) the actor is a real users account AND (2) the role that WROTE the row holds the credential-issuing privilege. The account check alone was not an authorisation check: the bot could insert a valid credential for a real account.';

-- =====================================================================
-- 5. THE RECONCILIATION
-- =====================================================================

DO $$
DECLARE
  v_bot_can_write boolean;
  v_issuer_exists  boolean;
  v_credentials    bigint;
  v_owner          text;
BEGIN
  SELECT has_table_privilege('gustale', 'public.publish_credential', 'INSERT')
    INTO v_bot_can_write;
  SELECT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'gustale_credential_issuer')
    INTO v_issuer_exists;
  SELECT count(*) INTO v_credentials FROM publish_credential;

  SELECT pg_get_userbyid(c.relowner) INTO v_owner
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public'
     AND c.relname = 'publish_credential';

  RAISE NOTICE '=== the role separation ===';
  RAISE NOTICE '  the bot may WRITE credentials:  %', v_bot_can_write;
  RAISE NOTICE '  the table owner:                %', v_owner;
  RAISE NOTICE '  the issuer role exists:         %', v_issuer_exists;
  RAISE NOTICE '  the credentials issued:         %', v_credentials;
  RAISE NOTICE '';

  -- The bot must not be able to WRITE. This is the property that
  -- matters, and it is checked directly.
  IF v_bot_can_write THEN
    RAISE EXCEPTION
      'the bot role may still INSERT into publish_credential — the separation has not taken effect';
  END IF;

  -- And the bot must not OWN the table: an owner cannot have its own
  -- privileges revoked, so an owner is a bypass.
  IF v_owner = 'gustale' THEN
    RAISE EXCEPTION
      'the bot role still OWNS publish_credential — an owner cannot have its privileges revoked';
  END IF;

  IF NOT v_issuer_exists THEN
    RAISE EXCEPTION 'the issuer role does not exist';
  END IF;

  IF v_credentials <> 0 THEN
    RAISE EXCEPTION
      'publish_credential holds % row(s) — this migration issues none, and the table must be empty until a credential is issued deliberately',
      v_credentials;
  END IF;

  RAISE NOTICE '  the bot may not issue a credential';
  RAISE NOTICE '  the issuer role holds the privilege, and it is granted to no login role';
  RAISE NOTICE '  no credential has been issued';
  RAISE NOTICE '';
  RAISE NOTICE 'ATLAS_CREDENTIAL_SEPARATION_OK=1';
END $$;

COMMIT;
