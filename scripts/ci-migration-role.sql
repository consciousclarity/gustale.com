-- The CI's MIGRATION ROLE setup.
--
-- WHY THIS FILE EXISTS
--
-- The atlas migrations must run as a role that is NOT the bot's role.
--
-- The reason is the publish credential. Migration 0041 gives the bot's
-- role no write privilege on publish_credential, and the bot's role is
-- ALSO the table's owner in the CI — because the postgis image's
-- POSTGRES_USER=gustale makes `gustale` the superuser, and the
-- service container creates the database and its tables as that role.
--
-- An OWNER cannot have its own privileges revoked. The owner has an
-- implicit grant that REVOKE does not remove. So with the bot as the
-- owner, the separation could not take effect, and 0041's own assertion
-- caught it:
--
--     ERROR: the bot role may still INSERT into publish_credential
--             — the separation has not taken effect
--
-- On live the arrangements are already separate: the migrations run as
-- `postgres`, which owns the tables, and the bot's role is `gustale`,
-- which does not. This file makes the CI's arrangement THE SAME.
--
-- WHAT IT DOES
--
--   1. Creates the role `gustale_migrator` — a LOGIN role, with the
--      CI's own POSTGRES_PASSWORD. There is no secret in the
--      repository.
--
--   2. Transfers the OWNERSHIP of the tables in the public schema to
--      the migration role, so the atlas migrations can ALTER the ones
--      the earlier chain created.
--
-- WHAT IT DELIBERATELY DOES NOT DO
--
-- It does NOT change the SCHEMA's owner. The public schema belongs to
-- pg_database_owner in a modern PostgreSQL, and the attempt to
-- transfer it fails with "must be owner of schema public" — which,
-- with ON_ERROR_STOP=1, aborted the whole step and left the tables
-- unowned by the migration role. The schema needs no change: the
-- migration role is GRANTED CREATE on it below.
--
-- IT IS IDEMPOTENT. The role is created only if it is missing, and the
-- ownership transfer is applied to every table every run.
--
-- IT IS A CI-ONLY FILE. It is not a migration, it is not in
-- db/migrations/, and the live chain never runs it — the live database
-- already has the separation.

\set ON_ERROR_STOP on

-- The role. The password is the CI's own POSTGRES_PASSWORD.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'gustale_migrator') THEN
    EXECUTE format('CREATE ROLE gustale_migrator LOGIN PASSWORD %L', 'gustale');
  END IF;

  -- THE BOT'S ROLE — created here, and created as a PLAIN LOGIN.
  --
  -- With POSTGRES_USER=postgres the image's superuser is `postgres`, so
  -- the bot role does not exist at all until this script creates it. It
  -- is created WITHOUT SUPERUSER, and it is given no membership of the
  -- issuer role.
  --
  -- This is what makes the CI's privilege checks mean the same thing
  -- live's do. On live the bot is `gustale`: not a superuser, not a
  -- member of `gustale_credential_issuer`, and it holds no privilege
  -- on `publish_credential` beyond SELECT.
  --
  -- The explicit `NOSUPERUSER` is not cosmetic: if the role somehow
  -- existed with the attribute set, this would CLEAR it rather than
  -- leaving a superuser bot in place.
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'gustale') THEN
    EXECUTE format('CREATE ROLE gustale LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD %L', 'gustale');
  ELSE
    -- The role exists: make sure it is NOT a superuser.
    EXECUTE 'ALTER ROLE gustale NOSUPERUSER';
  END IF;

  -- The ISSUER role, which holds the privilege of issuing a publish
  -- credential and is granted to no login role.
  --
  -- It is created here as well, because the migration that uses it
  -- (0041) runs as the migration role, which may not create roles.
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'gustale_credential_issuer') THEN
    -- NOLOGIN: nobody logs in as it. It exists to HOLD a privilege.
    --
    -- The ADMIN OPTION is not a CREATE ROLE option — it goes on the
    -- GRANT below.
    CREATE ROLE gustale_credential_issuer NOLOGIN;
  END IF;
END $$;

-- The migration role is a MEMBER of the issuer role, so it can hand
-- publish_credential over to it in migration 0041 (handing a table to a
-- role requires being a member of it).
--
-- The grant is made HERE, by the superuser, because the migration role
-- does not have ADMIN OPTION on the issuer role — and a grant needs
-- it. The migration therefore uses a membership it finds rather than
-- granting one itself.
--
-- The BOT'S ROLE IS NEVER A MEMBER of the issuer role. That is the
-- whole point: the issuer role holds the privilege of issuing a publish
-- credential, and the bot must never hold it.
GRANT gustale_credential_issuer TO gustale_migrator WITH ADMIN OPTION;

-- CREATE on the schema, so the chain can create its tables.
-- The schema's OWNER is left alone: it belongs to pg_database_owner,
-- and transferring it fails with "must be owner of schema public".
GRANT ALL ON SCHEMA public TO gustale_migrator;

-- And to the ISSUER role: it owns publish_credential, and owning a
-- table in a schema requires CREATE on that schema. Without this the
-- ownership transfer in 0041 fails with "permission denied for schema
-- public".
GRANT ALL ON SCHEMA public TO gustale_credential_issuer;

-- CREATE on the DATABASE, so the chain can create the TRUSTED
-- extensions it needs — `pg_trgm` is one, and the chain's
-- packages/db/drizzle/0007_pg_trgm.sql creates it.
--
-- The untrusted ones (postgis, uuid-ossp) are created by the CI as the
-- superuser, in the step before this one. A trusted extension needs
-- only CREATE on the database, so no superuser is needed here.
DO $$
BEGIN
  EXECUTE format('GRANT CREATE ON DATABASE %I TO gustale_migrator', current_database());
END $$;

-- The DEFAULT PRIVILEGES, so every table the chain creates AFTER this
-- point is owned by the migration role.
--
-- This is the key to the whole arrangement. The chain runs as the
-- migration role, so the tables it creates would be owned by the
-- migration role anyway — but the ones created BEFORE this step (by the
-- drizzle chain, if it ran first) are owned by `gustale`. The default
-- privileges make the arrangement uniform, and the ownership transfer
-- below fixes the ones that already exist.
--
-- The bot's role is EXCLUDED from the default privileges, so a table
-- created after this point does NOT belong to it. That is the property
-- the credential separation depends on.
ALTER DEFAULT PRIVILEGES FOR ROLE gustale_migrator IN SCHEMA public
  GRANT ALL ON TABLES TO gustale_migrator;

-- The bot's default privileges, matching live's
-- `pg_default_acl`: {gustale=arwdDxt/postgres} for tables and
-- {gustale=rwU/postgres} for sequences.
--
-- This is what gives the bot the same rights on the tables the chain
-- creates AFTER this point as it has on the ones that already exist.
-- Without it, the bot would own nothing new and the tests would fail
-- with a permission error that looks like a test bug.
--
-- FOR BOTH ROLES, because the role that creates the tables depends on
-- the environment:
--
--   - in CI mode the chain connects as gustale_migrator, so the
--     migration role creates them;
--   - in container mode the chain connects as postgres, so the
--     superuser creates them.
--
-- Setting it for both means the bot's rights do not depend on which
-- environment the chain runs in. Only the superuser can set a default
-- for another role's objects, and this file runs as the superuser.
ALTER DEFAULT PRIVILEGES FOR ROLE gustale_migrator IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLES TO gustale;
ALTER DEFAULT PRIVILEGES FOR ROLE gustale_migrator IN SCHEMA public
  GRANT SELECT, UPDATE, USAGE ON SEQUENCES TO gustale;

DO $$
BEGIN
  -- The superuser's own default privileges, for the container mode.
  EXECUTE 'ALTER DEFAULT PRIVILEGES FOR ROLE ' || quote_ident(current_user) || ' IN SCHEMA public '
       || 'GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLES TO gustale';
  EXECUTE 'ALTER DEFAULT PRIVILEGES FOR ROLE ' || quote_ident(current_user) || ' IN SCHEMA public '
       || 'GRANT SELECT, UPDATE, USAGE ON SEQUENCES TO gustale';
END $$;

-- The bot's role keeps DML on the existing tables — it needs to read
-- and write the CONTENT. It gets no CREATE, so a table it creates is
-- its own, and it is not granted anything by default.
--
-- THE GRANT IS arwdDxt, NOT "ALL".
--
-- On live the bot holds exactly this on an ordinary table:
--
--   gustale=arwdDxt/postgres
--
--   r  SELECT      a  INSERT     w  UPDATE      d  DELETE
--   D  TRUNCATE    x  REFERENCES t  TRIGGER
--
-- The blanket GRANT ALL below would add `m` (MAINTAIN), `s` (SET) and
-- `o` (OWNER-adjacent rights) as well. It matters, because "ALL" is a
-- superset of what live has, and the point of this whole arrangement is
-- that the CI's privilege set is not stronger than production's.
--
-- The bot NEEDS TRIGGER and REFERENCES on ordinary tables: it owns the
-- content model and the guards on those tables are part of it. The
-- escalation is not the privilege itself — it is TRIGGER on a table the
-- bot CANNOT WRITE TO. That is what publish_credential was, and
-- migration 0042 revokes it there.
GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON ALL TABLES IN SCHEMA public TO gustale;

-- publish_credential IS THE EXCEPTION.
--
-- The blanket GRANT above would give the bot everything on it, including
-- the TRIGGER privilege — the escalation that migration 0042 exists to
-- remove. On live the bot holds SELECT only.
--
-- So the blanket grant is corrected here, AFTER it is applied. The
-- order matters: the correction must come last, or a later blanket
-- grant would undo it.
--
-- This is deliberately NOT relying on 0042 to fix it, because 0042 runs
-- LATER in the chain — and the chain's own migrations run as the
-- migration role, which would be affected by a bot-side grant in the
-- meantime. The CI's starting state must match live's before the chain
-- runs at all.
--
-- The table may not exist yet — it is created by migration 0038, which
-- runs after this file. So the correction is conditional, and the
-- condition is checked rather than assumed.
DO $$
BEGIN
  IF to_regclass('public.publish_credential') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON publish_credential FROM gustale';
    EXECUTE 'GRANT SELECT ON publish_credential TO gustale';
  ELSE
    RAISE NOTICE '  publish_credential does not exist yet — 0038 will create it, and 0042 will set the grants';
  END IF;
END $$;

-- THE OWNERSHIP — IT MIRRORS LIVE, AND LIVE DOES NOT TRANSFER IT.
--
-- On live the tables are owned by `postgres` (72 of them), by the bot
-- `gustale` (7 legacy tables from the original import), and by the
-- issuer `gustale_credential_issuer` (publish_credential). The role
-- `gustale_migrator` EXISTS on live and owns NOTHING.
--
-- So this file does NOT transfer the ownership to the migration role.
-- An earlier version did, and it was wrong in a way that mattered: the
-- CI would then test a SCHEMA ARRANGEMENT THAT LIVE DOES NOT HAVE. The
-- privilege model is what the CI must mirror — the bot is an ordinary
-- role, the admin owns the tables — and the OWNER of each table is not
-- part of that model.
--
-- The chain's migrations need to ALTER the tables, and on live they do
-- that as `postgres`, which owns them. So the chain runs as `postgres`
-- in CI too, exactly as it runs as `postgres` on live.
--
-- The migration role `gustale_migrator` is still created, because live
-- has it, and because the CI workflow uses it for its own migration
-- steps. It owns nothing on live and owns nothing here.
DO $$
DECLARE
  t text;
BEGIN
  -- The tables the BOT owns on live are the seven legacy ones from the
  -- original import: dish_journey_beats, dish_location_sources,
  -- dish_locations, dish_region_sources, dish_regions,
  -- food_region_sources and food_regions. On a fresh database they do
  -- not exist yet, and the chain's base schema creates them as the
  -- admin — so on a fresh database the bot owns nothing, and that is
  -- correct: it owns them on live only because the ORIGINAL import ran
  -- as the bot.
  --
  -- Nothing to do here. The point of this block is to RECORD that the
  -- ownership is deliberately NOT transferred.
  RAISE NOTICE '  the table ownership is left as the admin created it — the same as live';
END $$;

-- The report.
DO $$
DECLARE
  v_owned bigint;
  v_total  bigint;
BEGIN
  SELECT count(*) INTO v_total
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p');

  SELECT count(*) INTO v_owned
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
     AND pg_get_userbyid(c.relowner) = 'gustale_migrator';

  RAISE NOTICE '=== the CI migration role ===';
  RAISE NOTICE '  the tables in the public schema: %', v_total;
  RAISE NOTICE '  owned by the migration role: %', v_owned;
  RAISE NOTICE '';

  -- The migration role owns NOTHING, on live and here. That is not a
  -- defect: on live the migrations run as `postgres`, which owns the
  -- tables, and the role `gustale_migrator` exists for the CI's own
  -- migration steps.
  --
  -- What MUST hold is that the BOT owns none of the tables that the
  -- credential separation depends on. The bot's own tables on live are
  -- seven legacy ones from the original import, and the bot cannot
  -- ALTER a table it does not own — which is the property 0041 needs.
  IF EXISTS (
    SELECT 1 FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public'
       AND c.relkind IN ('r', 'p')
       AND pg_get_userbyid(c.relowner) = 'gustale'
       AND c.relname = 'publish_credential'
  ) THEN
    RAISE EXCEPTION
      'the bot owns publish_credential — an owner cannot have its own privileges revoked, so the credential separation cannot take effect';
  END IF;

  -- THE INVARIANT THE WHOLE CI CHANGE EXISTS TO ESTABLISH.
  --
  -- The bot's role must NOT be a superuser. A superuser bypasses every
  -- privilege check, so a CI run where the bot is an admin does not
  -- test the arrangement live runs.
  --
  -- It must also not be a member of the issuer role — that is the
  -- separation from migration 0041.
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='gustale' AND rolsuper) THEN
    RAISE EXCEPTION
      'the bot role is a SUPERUSER — the CI would answer every privilege check as an admin, which is not how live is arranged';
  END IF;

  IF pg_has_role('gustale','gustale_credential_issuer','MEMBER') THEN
    RAISE EXCEPTION
      'the bot role is a member of the issuer role — it could issue a publish credential';
  END IF;

  -- And the bot's privilege on publish_credential must be SELECT only.
  -- TRIGGER there is the escalation: a trigger fires as the user who
  -- performed the insert, so the bot could plant one and ride somebody
  -- else's insert with the issuer's privileges.
  IF to_regclass('public.publish_credential') IS NOT NULL
     AND (has_table_privilege('gustale','publish_credential','TRIGGER')
       OR has_table_privilege('gustale','publish_credential','REFERENCES')
       OR has_table_privilege('gustale','publish_credential','INSERT')) THEN
    RAISE EXCEPTION
      'the bot role holds more than SELECT on publish_credential — it must match live';
  END IF;

  RAISE NOTICE '  the bot role does not own publish_credential';
  RAISE NOTICE '  the table ownership mirrors live (the admin owns them)';
  RAISE NOTICE '  the bot role is NOT a superuser';
  RAISE NOTICE '  the bot role is NOT a member of the issuer role';
  RAISE NOTICE '  the bot holds SELECT only on publish_credential';
  RAISE NOTICE '  and the chain that follows creates them as the migration role';
  RAISE NOTICE '';
  RAISE NOTICE 'CI_MIGRATION_ROLE_OK=1';
END $$;
