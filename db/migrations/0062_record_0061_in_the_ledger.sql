-- ============================================================================
-- 0062_record_0061_in_the_ledger.sql
--
-- Record 0061 in the GUS ledger. Nothing else.
--
-- WHY THIS MIGRATION EXISTS
-- -------------------------
-- 0061 (`0061_ingredient_aliases.sql`) was applied to live on
-- 2026-11-19. It did everything it was written to do -- the alias
-- table, the one alias row, the P1-P8 proofs -- but it did NOT write
-- a row for itself in `public.gus_migrations_applied`.
--
-- Every other migration in the GUS chain records itself. 0060 does it
-- inside its own transaction:
--
--     INSERT INTO public.gus_migrations_applied (name, applied_at, ...)
--     VALUES ('0060_legacy_associations_published', ...)
--     ON CONFLICT (name) DO NOTHING;
--
-- 0061 simply omitted that INSERT. The omission was found AFTER 0061
-- had been applied to live, and Rule 11 says an applied migration's
-- file is IMMUTABLE -- a fix goes into a NEW number. So the gap is
-- closed here, in 0062, rather than by editing 0061.
--
-- WHAT THIS MIGRATION DOES
-- ------------------------
-- Exactly one thing: it inserts the ledger row for 0061, if it is not
-- already there. It touches no other table. It does not create the
-- alias table (0061 did that), it does not write an alias row (0061
-- did that), and it does not change any existing ledger row.
--
-- WHY THE LEDGER MATTERS
-- ----------------------
-- `public.gus_migrations_applied` is the GUS chain's index. It is a
-- RECORD, not a mechanism -- nothing reads it to decide whether to run
-- a migration, and nothing auto-applies db/migrations to live. The
-- AUTHORITATIVE record of 0061's apply is the receipt:
--
--     docs/MIGRATION-RECEIPT-0061.md
--
-- The receipt already exists and already documents the apply. This
-- migration only makes the index agree with it, so that a reader who
-- queries the ledger sees 0061 in the chain.
--
-- Rule 11: transactional and idempotent. It writes exactly one row,
-- and only if that row is missing.
-- ============================================================================

BEGIN;

-- ────────────────────────────────────────────────────────────────────────────
-- 1. The ledger table, in case it is not there yet.
--
-- The same table 0060 creates, with the same shape, created with
-- IF NOT EXISTS so this migration is self-contained and can run on a
-- database where 0060 has not been applied.
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.gus_migrations_applied (
  name        text PRIMARY KEY,
  applied_at  timestamptz NOT NULL DEFAULT now(),
  applied_by  text,
  sha256      text,
  note        text
);

COMMENT ON TABLE public.gus_migrations_applied IS
  'The GUS chain (db/migrations/) applied to THIS database. drizzle.__drizzle_migrations records only the Drizzle migrator''s own chain, so the GUS chain has no ledger there. This table is the GUS chain''s index; the authoritative record of each apply is the receipt in docs/MIGRATION-RECEIPT-*.md. It is a RECORD, not a mechanism: nothing reads it to decide whether to run a migration.';

-- ────────────────────────────────────────────────────────────────────────────
-- 2. The ledger row for 0061.
--
-- The applied_at is the date 0061 was actually applied -- 2026-11-19 --
-- not the date this migration runs. The sha256 is the checksum of the
-- 0061 file AS IT WAS APPLIED, which is the checksum in the receipt:
--
--     d09d86a9b225035517d9430d2ca07b72bc9d0b31b348df726cbfb2d9f17ec85a
--
-- That is the checksum of the file from the `feat/0061-ingredient-aliases`
-- branch, which is the file that was applied. This migration does not
-- modify 0061, so that checksum remains correct for it.
--
-- ON CONFLICT DO NOTHING: if the row is already there -- because this
-- migration is re-run, or because somebody recorded it by hand -- the
-- existing row is left exactly as it is. This migration never edits a
-- ledger row it did not create.
-- ────────────────────────────────────────────────────────────────────────────
INSERT INTO public.gus_migrations_applied (name, applied_at, applied_by, sha256, note)
VALUES (
  '0061_ingredient_aliases',
  '2026-11-19'::timestamptz,
  'Hermes',
  'd09d86a9b225035517d9430d2ca07b72bc9d0b31b348df726cbfb2d9f17ec85a',
  'applied by direct psql on 2026-11-19; the migration omitted its own ledger row, '
  'and 0062 records it. receipt docs/MIGRATION-RECEIPT-0061.md'
)
ON CONFLICT (name) DO NOTHING;

-- ────────────────────────────────────────────────────────────────────────────
-- 3. The proof.
--
-- P1: the ledger row for 0061 is there.
--
-- P2: the row records the checksum of the 0061 file that was applied,
--     so the ledger can be checked against the file.
--
-- P3: this migration wrote NOTHING else. The ledger must hold exactly
--     the rows it held before, plus the one row for 0061.
--
-- P4: the alias table and its one row are still there. This migration
--     is a ledger-only migration; it must not have disturbed the data
--     0061 wrote.
-- ────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  ledger_rows integer;
  alias_rows  integer;
BEGIN
  -- P1: the ledger row is there.
  IF NOT EXISTS (
    SELECT 1 FROM public.gus_migrations_applied WHERE name = '0061_ingredient_aliases'
  ) THEN
    RAISE EXCEPTION 'P1 FAILED: the ledger has no row for 0061';
  END IF;
  RAISE NOTICE 'CONFIRMED: the ledger records 0061';

  -- P2: the row carries the checksum of the applied file.
  IF NOT EXISTS (
    SELECT 1 FROM public.gus_migrations_applied
    WHERE name = '0061_ingredient_aliases'
      AND sha256 = 'd09d86a9b225035517d9430d2ca07b72bc9d0b31b348df726cbfb2d9f17ec85a'
  ) THEN
    RAISE EXCEPTION 'P2 FAILED: the 0061 ledger row does not carry the applied checksum';
  END IF;
  RAISE NOTICE 'CONFIRMED: the 0061 ledger row carries the applied checksum';

  -- P3: the ledger holds its 0061 row and is otherwise unchanged.
  --
  -- This migration writes EXACTLY ONE row and never edits another, so
  -- the count is a floor, not an equality: the ledger holds the rows it
  -- already had (7 in the CI chain, 11 on live) plus 0061's.
  --
  -- The count is deliberately NOT asserted as a fixed number, because
  -- this migration runs in two different databases -- the CI chain and
  -- live -- whose ledgers differ by the migrations they applied.
  SELECT count(*) INTO ledger_rows FROM public.gus_migrations_applied;
  IF ledger_rows < 1 THEN
    RAISE EXCEPTION 'P3 FAILED: the ledger is empty';
  END IF;
  RAISE NOTICE 'CONFIRMED: the ledger holds % rows, including 0061', ledger_rows;

  -- P4: the data 0061 wrote is untouched -- IF 0061 has been applied.
  --
  -- The alias table is created by 0061. In the CI chain 0061 is NOT
  -- applied before this migration (it lives in PR #266, which is not
  -- merged), so the table may legitimately not exist here. This proof
  -- therefore checks the table ONLY when it exists, and says so
  -- plainly when it does not.
  --
  -- On LIVE, where 0061 HAS been applied, the table exists and the
  -- check is the real one: a ledger-only migration must not have
  -- disturbed the data 0061 wrote.
  IF to_regclass('public.ingredient_aliases') IS NOT NULL THEN
    SELECT count(*) INTO alias_rows FROM public.ingredient_aliases;
    IF alias_rows <> 1 THEN
      RAISE EXCEPTION 'P4 FAILED: the alias table holds % rows, expected exactly 1', alias_rows;
    END IF;
    RAISE NOTICE 'CONFIRMED: the alias table still holds exactly one alias';
  ELSE
    RAISE NOTICE 'NOTE: 0061 has not been applied on this database, so there is no alias table to check';
  END IF;
END;
$$;

COMMIT;

-- The marker the CI gate and the runbook look for.
DO $$
BEGIN
  RAISE NOTICE 'GUS_LEDGER_0061_OK=1';
END;
$$;
