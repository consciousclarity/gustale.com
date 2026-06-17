-- Gustale — drop FK constraints from domain tables to users.id
-- Reason: better-auth is the source of truth for users. Legacy `users`
-- (plural) is only used by seed data. We store user IDs as text for
-- audit-trail purposes but no longer require FK referential integrity
-- to the legacy users table.
--
-- This migration is idempotent: each DROP is wrapped in IF EXISTS so
-- it's safe to run against fresh DBs that never had these FKs.
--
-- Generated: 2026-06-17

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT conname, conrelid::regclass AS tbl
    FROM pg_constraint
    WHERE confrelid = 'users'::regclass
      AND contype = 'f'
  LOOP
    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT IF EXISTS %I', r.tbl, r.conname);
  END LOOP;
END $$;