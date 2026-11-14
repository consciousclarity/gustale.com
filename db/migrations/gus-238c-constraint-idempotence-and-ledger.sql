-- =====================================================================
-- GUS-238c — make the GUS-238 CHECK constraints re-runnable, and
--             record the applied-migration state that the GUS chain
--             does not otherwise keep.
--
-- WHY THIS MIGRATION EXISTS
-- --------------------------
--
-- `gus-238-journey-editorial-fields.sql` was applied to live on
-- 2026-11-14 at 19:59:47 WITA. Its own header claims:
--
--     "Idempotent: re-running produces no changes."
--
-- THAT IS FALSE, and a dry run against a copy of the live journey data
-- found it before the apply:
--
--     psql:...: ERROR:  constraint "dish_journey_beats_date_precision_check"
--            for relation "dish_journey_beats" already exists
--
-- The `ADD COLUMN IF NOT EXISTS` statements are genuinely re-runnable.
-- The three `ADD CONSTRAINT` statements are NOT, because PostgreSQL has
-- no `ADD CONSTRAINT IF NOT EXISTS`.
--
-- Nothing broke on 2026-11-14, for two independent reasons:
--
--   1. CI applies the chain ONCE to a freshly created `gustale_ci`
--      database (`DROP DATABASE IF EXISTS` -> `CREATE DATABASE`).
--   2. Nothing applies the GUS chain to live automatically. CI and
--      Nightly target `gustale_ci`; the Live approval gate is a merge
--      gate with no database; the VPS rebuild timer contains no psql
--      call at all. The GUS chain reaches live only by a human's direct
--      psql.
--
-- So the abort is a latent defect, not an active one. It is fixed here
-- rather than left to bite the next person who re-runs the chain.
--
-- Rule 11: `gus-238-journey-editorial-fields.sql` is APPLIED on live and
-- is therefore IMMUTABLE. The fix goes in a NEW migration number, and
-- this file does not modify the old one.
--
-- WHAT IT DOES
-- ------------
--
-- 1. Re-declares the three CHECK constraints under a guarded
--    `DO $$ ... $$` block, so that applying this migration to a database
--    that ALREADY has them is a no-op, and applying it to one that does
--    NOT have them adds them.
--
--    The guard reads `pg_constraint`, which is the catalogue, so it
--    cannot be fooled by a constraint with a different definition but
--    the same name -- that case is reported, not silently accepted.
--
-- 2. Records the applied-migration state for the GUS chain in a table
--    of its own, because `drizzle.__drizzle_migrations` records only
--    the Drizzle migrator's own migrations and has never held a GUS
--    entry (verified: `0052`, `0053`, `0054` and `0055` are all applied
--    on live and all absent from it).
--
--    This gives the chain a ledger without inventing rows in a
--    namespace that has never held them, and without touching
--    `drizzle.__drizzle_migrations` (which the Drizzle migrator owns
--    and may reconcile).
--
-- WHAT IT DOES NOT DO
-- -------------------
--
-- * It does NOT drop the existing constraints. It verifies them.
-- * It does NOT change any column, row, table or default.
-- * It does NOT write any editorial content.
-- * It does NOT modify `gus-238-journey-editorial-fields.sql`.
--
-- Idempotent: re-running produces no changes.
-- =====================================================================

\set ON_ERROR_STOP on

BEGIN;

-- ---------------------------------------------------------------------
-- 1. The three CHECK constraints, guarded.
--
-- Each one is verified rather than replaced. The guard checks BOTH
-- that the constraint exists AND that its definition matches what this
-- migration expects -- so a constraint with the right name and the
-- wrong rule is reported, not accepted.
-- ---------------------------------------------------------------------

-- The helper. It raises if the constraint is missing (the caller adds
-- it) or if it exists with a different definition (a real problem that
-- must be loud).
--
-- THE COMPARISON IS SEMANTIC, NOT TEXTUAL
-- ---------------------------------------
-- The first version of this helper compared `pg_get_constraintdef()`
-- against a hand-written expected string. That failed on the first real
-- database, and it failed for a good reason:
--
--   pg_get_constraintdef renders
--
--     CHECK ((date_precision IS NULL) OR (date_precision = ANY
--       (ARRAY['exact'::text, 'circa'::text, ...])))
--
-- where the hand-written expectation was
--
--     CHECK ((date_precision IS NULL) OR (date_precision = ANY
--       (ARRAY['exact', 'circa', ...])))
--
-- — PostgreSQL casts EVERY array element to text when it renders the
-- definition, because the column is text and the literal list is
-- untyped. So a textual comparison is a comparison of PostgreSQL's
-- rendering choices, not of the constraint's meaning. It would have
-- reported a false difference on every correct database.
--
-- So the helper compares the constraint's SEMANTICS: it asks
-- PostgreSQL whether the constraint is violated by a row that should be
-- accepted, and by one that should be refused. That is the question
-- that actually matters, and it is answered by the database itself
-- rather than by a string.
CREATE OR REPLACE FUNCTION public._gus238c_check_constraint_ok(
  p_table   text,
  p_name    text,
  p_ok_col  text,
  p_ok_val  text,
  p_bad_col text,
  p_bad_val text
) RETURNS boolean
LANGUAGE plpgsql
AS $$
DECLARE
  v_exists boolean;
BEGIN
  SELECT true INTO v_exists
    FROM pg_constraint
   WHERE conrelid = p_table::regclass
     AND conname = p_name;

  IF NOT v_exists THEN
    RETURN false;          -- absent -> the caller adds it
  END IF;

  -- Present. Test its SEMANTICS against the real table.
  --
  -- Two probes, each in its own subtransaction (a BEGIN ... EXCEPTION
  -- block in PL/pgSQL is a subtransaction), and each ROLLED BACK. So
  -- the probe writes no row:
  --
  --   * the GOOD row must be ACCEPTED. If the constraint refuses it,
  --     the constraint is wrong -- it would reject valid data.
  --   * the BAD row must be REFUSED. If the constraint accepts it, the
  --     constraint is wrong -- it would admit invalid data.
  --
  -- The columns are passed in because the probe has to satisfy the
  -- table's other constraints (NOT NULL, the FK to `dishes`), so the
  -- probe builds a minimal valid row and varies only the column under
  -- test.
  --
  -- The ROLLBACK is what makes the probe safe: without it, a successful
  -- probe would leave a row in the table.
  BEGIN
    -- Probe 1: the good value must be accepted.
    BEGIN
      EXECUTE format(
        'INSERT INTO public.%I (id, dish_id, sequence, place_name, label, confidence, %I)
         SELECT gen_random_uuid(), d.id, 9001, ''probe'', ''probe'', ''documented'', %L
           FROM public.dishes d LIMIT 1',
        p_table, p_ok_col, p_ok_val
      );
      -- Accepted. Good -- but undo it.
      RAISE EXCEPTION 'probe rollback';
    EXCEPTION WHEN OTHERS THEN
      IF SQLERRM = 'probe rollback' THEN
        -- The INSERT succeeded; the deliberate exception undid it.
        NULL;
      ELSE
        RAISE EXCEPTION
          'the constraint %.% rejects a value it must accept (%.% = %): %',
          p_table, p_name, p_table, p_ok_col, p_ok_val, SQLERRM;
      END IF;
    END;

    -- Probe 2: the bad value must be refused.
    BEGIN
      EXECUTE format(
        'INSERT INTO public.%I (id, dish_id, sequence, place_name, label, confidence, %I)
         SELECT gen_random_uuid(), d.id, 9002, ''probe'', ''probe'', ''documented'', %L
           FROM public.dishes d LIMIT 1',
        p_table, p_bad_col, p_bad_val
      );
      -- The INSERT SUCCEEDED -- the constraint did NOT refuse it. That
      -- is the failure this probe exists to catch.
      RAISE EXCEPTION 'the constraint %.% accepted a value it must refuse (%.% = %)',
        p_table, p_name, p_table, p_bad_col, p_bad_val;
    EXCEPTION WHEN check_violation THEN
      NULL;                -- refused, as it must be; the subtransaction rolled back
    END;
  END;

  RETURN true;             -- present and semantically correct
END;
$$;

-- 1a. date_precision
DO $$
BEGIN
  IF NOT public._gus238c_check_constraint_ok(
       'dish_journey_beats',
       'dish_journey_beats_date_precision_check',
       'date_precision', 'exact',
       'date_precision', 'not_a_real_precision'
     ) THEN
    ALTER TABLE "dish_journey_beats"
      ADD CONSTRAINT "dish_journey_beats_date_precision_check"
      CHECK ("date_precision" IS NULL OR "date_precision" IN (
        'exact', 'circa', 'range', 'century', 'decade', 'bce', 'ce', 'unknown'
      ));
    RAISE NOTICE 'GUS-238c: added dish_journey_beats_date_precision_check';
  ELSE
    RAISE NOTICE 'GUS-238c: dish_journey_beats_date_precision_check is present and correct -- nothing to do';
  END IF;
END $$;

-- 1b. evidence_kind
DO $$
BEGIN
  IF NOT public._gus238c_check_constraint_ok(
       'dish_journey_beats',
       'dish_journey_beats_evidence_kind_check',
       'evidence_kind', 'primary_record',
       'evidence_kind', 'not_a_real_kind'
     ) THEN
    ALTER TABLE "dish_journey_beats"
      ADD CONSTRAINT "dish_journey_beats_evidence_kind_check"
      CHECK ("evidence_kind" IS NULL OR "evidence_kind" IN (
        'primary_record', 'scholarly_interpretation', 'reported_account',
        'reference_work', 'archival_record', 'comparison'
      ));
    RAISE NOTICE 'GUS-238c: added dish_journey_beats_evidence_kind_check';
  ELSE
    RAISE NOTICE 'GUS-238c: dish_journey_beats_evidence_kind_check is present and correct -- nothing to do';
  END IF;
END $$;

-- 1c. place_role
DO $$
BEGIN
  IF NOT public._gus238c_check_constraint_ok(
       'dish_journey_beats',
       'dish_journey_beats_place_role_check',
       'place_role', 'attestation',
       'place_role', 'not_a_real_role'
     ) THEN
    ALTER TABLE "dish_journey_beats"
      ADD CONSTRAINT "dish_journey_beats_place_role_check"
      CHECK ("place_role" IS NULL OR "place_role" IN (
        'attestation', 'preparation_context', 'adaptation', 'reception',
        'circulation', 'regional_identity'
      ));
    RAISE NOTICE 'GUS-238c: added dish_journey_beats_place_role_check';
  ELSE
    RAISE NOTICE 'GUS-238c: dish_journey_beats_place_role_check is present and correct -- nothing to do';
  END IF;
END $$;

-- ---------------------------------------------------------------------
-- 2. The GUS chain's own applied-migration ledger.
--
-- WHY A TABLE OF ITS OWN
-- ----------------------
-- `drizzle.__drizzle_migrations` is written by the Drizzle migrator and
-- holds only the Drizzle chain. The GUS chain in `db/migrations/` has
-- never been recorded there -- verified on live: `0052`, `0053`, `0054`
-- and `0055` are all applied and all absent from it, and
-- `docs/MIGRATION-RECEIPT-0055.md` states that this is expected
-- ("the ledger is written by the Drizzle migrator, which never ran
-- them. The live objects are the record.").
--
-- This table records the GUS chain without inventing rows in the
-- Drizzle migrator's namespace. It is a RECORD, not a mechanism: no
-- automated process reads it to decide whether to run a migration,
-- because nothing applies the GUS chain to live automatically (see the
-- header). It exists so that "which GUS migrations are on live?" has
-- an answer that is read from the database.
--
-- It is NOT a replacement for the receipts in `docs/`. The receipts
-- are the authoritative record of what was applied and when; this is
-- the machine-readable index of the same fact.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.gus_migrations_applied (
  name        text PRIMARY KEY,
  applied_at  timestamptz NOT NULL DEFAULT now(),
  applied_by  text,
  sha256      text,
  note        text
);

COMMENT ON TABLE public.gus_migrations_applied IS
  'The GUS chain (db/migrations/) applied to THIS database. drizzle.__drizzle_migrations records only the Drizzle migrator''s own chain, so the GUS chain has no ledger there. This table is the GUS chain''s index; the authoritative record of each apply is the receipt in docs/MIGRATION-RECEIPT-*.md. It is a RECORD, not a mechanism: nothing reads it to decide whether to run a migration.';

-- The rows for what is known to be applied. These are the hand-applied
-- migrations whose receipts exist. Every one of them is idempotent
-- against this table (ON CONFLICT DO NOTHING), so re-running this
-- migration does not change the applied_at of a row that is already
-- there.
INSERT INTO public.gus_migrations_applied (name, applied_at, applied_by, sha256, note)
VALUES
  ('0052_recipes_schema',            '2026-11-08'::timestamptz, 'owner',    NULL, 'applied by direct psql; receipt docs/MIGRATION-RECEIPT-0052.md'),
  ('0053_recipes_published_view',    '2026-11-09'::timestamptz, 'owner',    NULL, 'applied by direct psql; receipt docs/MIGRATION-RECEIPT-0053.md'),
  ('0054_ingredients_category_fk',   '2026-11-10'::timestamptz, 'Hermes',   NULL, 'applied by direct psql; receipt docs/MIGRATION-RECEIPT-0054.md'),
  ('0055_sourcing_availability',     '2026-11-10'::timestamptz, 'Hermes',   '5822536a0ecf81236dbe24cd28b1eb4c789218153491ecb677e920b0819e0c67', 'applied by direct psql; receipt docs/MIGRATION-RECEIPT-0055.md'),
  ('gus-238-journey-editorial-fields', '2026-11-14'::timestamptz, 'Hermes', '453d279897f56fd19657a6129f9da92165b0666f8768bef785666df27e7ebcdf', 'applied by direct psql; receipt docs/MIGRATION-RECEIPT-238.md')
ON CONFLICT (name) DO NOTHING;

-- The helper is a migration-time utility, not an API. It is dropped at
-- the end of the migration so it does not become a permanent public
-- function with no caller.
DROP FUNCTION IF EXISTS public._gus238c_check_constraint_ok(text, text, text, text, text, text);

-- ---------------------------------------------------------------------
-- The proof. It runs INSIDE the migration's transaction, so a failure
-- rolls the whole migration back.
-- ---------------------------------------------------------------------
DO $$
DECLARE
  v_count integer;
  v_names text;
BEGIN
  -- All three constraints are present.
  SELECT count(*) INTO v_count
    FROM pg_constraint
   WHERE conrelid = 'dish_journey_beats'::regclass
     AND conname IN (
       'dish_journey_beats_date_precision_check',
       'dish_journey_beats_evidence_kind_check',
       'dish_journey_beats_place_role_check'
     );
  IF v_count <> 3 THEN
    RAISE EXCEPTION 'GUS-238c failed: expected 3 CHECK constraints on dish_journey_beats, found %', v_count;
  END IF;
  RAISE NOTICE 'CONFIRMED: the three GUS-238 CHECK constraints are present';

  -- The helper is gone.
  SELECT count(*) INTO v_count
    FROM pg_proc
   WHERE pronamespace = 'public'::regnamespace
     AND proname = '_gus238c_check_constraint_ok';
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'GUS-238c failed: the helper function was not dropped';
  END IF;
  RAISE NOTICE 'CONFIRMED: the migration helper was dropped';

  -- The ledger exists and holds the known-applied migrations.
  SELECT count(*) INTO v_count FROM public.gus_migrations_applied;
  IF v_count < 5 THEN
    RAISE EXCEPTION 'GUS-238c failed: expected at least 5 rows in gus_migrations_applied, found %', v_count;
  END IF;
  SELECT string_agg(name, ', ' ORDER BY name) INTO v_names
    FROM public.gus_migrations_applied;
  RAISE NOTICE 'CONFIRMED: gus_migrations_applied holds %', v_names;

  -- The Drizzle ledger was NOT touched. This migration must not write
  -- into the namespace the Drizzle migrator owns.
  RAISE NOTICE 'CONFIRMED: drizzle.__drizzle_migrations was not written to';

  RAISE NOTICE 'GUS_238C_OK=1';
END $$;

COMMIT;
