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

-- The bot's role keeps DML on the existing tables — it needs to read
-- and write the CONTENT. It gets no CREATE, so a table it creates is
-- its own, and it is not granted anything by default.
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO gustale;

-- The ownership of the tables, so the atlas migrations can ALTER the
-- ones the earlier chain created. This needs the CURRENT role to be
-- the owner of each table or a superuser — in CI the current role is
-- `gustale`, the superuser, and in the local scripts it is `postgres`.
DO $$
DECLARE
  t text;
BEGIN
  FOR t IN
    SELECT c.relname
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public'
       AND c.relkind IN ('r', 'p')
       AND pg_get_userbyid(c.relowner) <> 'gustale_migrator'
  LOOP
    EXECUTE format('ALTER TABLE public.%I OWNER TO gustale_migrator', t);
  END LOOP;
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

  IF v_owned <> v_total THEN
    RAISE EXCEPTION
      'only % of % tables are owned by the migration role — the atlas migrations would fail with "must be owner of table"',
      v_owned, v_total;
  END IF;

  RAISE NOTICE '  every table is owned by the migration role';
  RAISE NOTICE '  the bot role owns none of them';
  RAISE NOTICE '  and the chain that follows creates them as the migration role';
  RAISE NOTICE '';
  RAISE NOTICE 'CI_MIGRATION_ROLE_OK=1';
END $$;
