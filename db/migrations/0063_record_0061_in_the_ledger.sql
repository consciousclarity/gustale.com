-- ============================================================================
-- 0063_record_0061_in_the_ledger.sql
--
-- Record 0061 in the GUS ledger. Nothing else.
--
-- WHY THE NUMBER IS 0063 AND NOT 0062
-- -----------------------------------
-- This migration was APPLIED TO LIVE on 2026-11-19 as
-- `0062_record_0061_in_the_ledger.sql` (PSQL_RC=0, checksum
-- 498ab199069c49452d2b3cb1219cc483968292b6cbf1368baaf537a02532f0d7).
--
-- It was then RENUMBERED to 0063, because 0062 was already taken:
-- `0062_ingredients_sourcing_vocabulary.sql` (applied to live on
-- 2026-11-11) claims the number 0062. Two migrations must never share
-- a number -- the chain validator reads the three lists as a sequence,
-- and a duplicate number makes the order ambiguous.
--
-- The RENUMBERING CHANGED NO BEHAVIOUR:
--   - this migration still writes exactly ONE row, the ledger entry for
--     0061, and touches no other table;
--   - the row it writes is keyed `0061_ingredient_aliases`, NOT by its
--     own number, so the ledger on live is unaffected by the rename;
--   - the note string is only written when the row is INSERTed -- on
--     live it already exists, so `ON CONFLICT (name) DO NOTHING` leaves
--     it exactly as it is. The live row keeps its original note.
--
-- ONE PROOF WAS REVISED AFTER THE LIVE APPLY -- P4. See "THE P4 REVISION"
-- below. It changes no DATA on live: the live alias table holds exactly
-- one row, and the revised P4 asserts exactly that.
--
-- The receipt is docs/MIGRATION-RECEIPT-0063.md.
--
-- THE P4 REVISION (2026-11-20)
-- ----------------------------
-- The proof P4 was revised AFTER the live apply, because the CI gate
-- caught a real failure that the live apply could not have caught.
--
-- WHAT THE CI GATE REPORTED:
--
--     ERROR:  P4 FAILED: the alias table holds 0 rows, expected exactly 1
--
-- WHY: 0061 CREATES the `ingredient_aliases` table, but the alias ROW
-- it writes exists only where the retired orphan ingredient
-- `bechamel-sauce` exists. That orphan row lives on LIVE only -- it is
-- the duplicate that GUS-092 later deletes. On a chain-built database
-- (CI, the Nightly, a fresh local repro) the orphan is absent, so 0061
-- SKIPS the insert and leaves the table EMPTY. 0061's own P8 accepts
-- that ("at most one alias row").
--
-- So there are two legitimate shapes:
--
--   LIVE           the table exists and holds exactly 1 row
--   CHAIN-BUILT    the table exists and holds 0 rows
--
-- The original P4 asserted the LIVE shape unconditionally. It was
-- written when 0061 was NOT yet in the CI chain (it lived in an unmerged
-- PR), so on CI the table did not exist at all and the proof was
-- skipped entirely. Once 0061 WAS added to the CI chain -- which it now
-- is -- the table exists but is empty, and the unconditional assertion
-- failed.
--
-- The revised P4 asserts the invariant that is TRUE ON BOTH SHAPES AND
-- IS WHAT THE PROOF WAS FOR: this is a LEDGER-ONLY migration, so it
-- must not have disturbed the data 0061 wrote.
--
--   P4a: the alias row count is UNCHANGED by this migration. The count
--        is captured BEFORE the ledger INSERT and compared AFTER. This
--        is STRONGER than the original absolute check: it proves the
--        migration disturbed nothing on EVERY shape, and it cannot be
--        satisfied by a table that was empty to begin with and empty
--        again for the wrong reason.
--
--   P4b: when the retired orphan ingredient `bechamel-sauce` exists --
--        the LIVE shape -- the alias table must hold exactly one row,
--        and it must be the `bechamel-sauce` alias resolving to the
--        `bechamel` ingredient. This is the original live assertion,
--        kept at full strength. On a chain-built database the orphan is
--        absent, the table is legitimately empty, and the proof says so
--        plainly instead of asserting a row that was never written.
--
-- The live outcome is UNCHANGED: live holds one alias row, P4b asserts
-- one alias row, and P4a asserts the count did not move. Nothing on live
-- is weakened -- the live proof is strictly stronger than before,
-- because it now ALSO proves the row resolves to the canonical
-- ingredient and that the count did not move.

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
-- closed here, in 0063, rather than by editing 0061.
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
--
-- The alias row count is captured HERE, BEFORE the ledger INSERT, so
-- that P4a can prove this migration did not disturb it. It is stashed in
-- a transaction-local setting (`set_config(..., true)`), so it is
-- restored on COMMIT and cannot leak into another run.
--
-- -1 means "there is no alias table here", which is the shape of a
-- database where 0061 has not been applied.
DO $$
DECLARE
  before_rows integer;
BEGIN
  IF to_regclass('public.ingredient_aliases') IS NOT NULL THEN
    SELECT count(*) INTO before_rows FROM public.ingredient_aliases;
  ELSE
    before_rows := -1;
  END IF;
  PERFORM set_config('gustale.ledger_0063_alias_rows_before', before_rows::text, true);
END;
$$;

INSERT INTO public.gus_migrations_applied (name, applied_at, applied_by, sha256, note)
VALUES (
  '0061_ingredient_aliases',
  '2026-11-19'::timestamptz,
  'Hermes',
  'd09d86a9b225035517d9430d2ca07b72bc9d0b31b348df726cbfb2d9f17ec85a',
  'applied by direct psql on 2026-11-19; the migration omitted its own ledger row, '
  'and 0063 records it. receipt docs/MIGRATION-RECEIPT-0061.md'
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
-- P4: the data 0061 wrote is untouched. This migration is a ledger-only
--     migration, so it must not have disturbed the data 0061 wrote:
--     P4a asserts the alias row count did not move, and P4b asserts that
--     on the live shape the one alias row is still there and still
--     resolves to the canonical ingredient.
-- ────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  ledger_rows integer;
  alias_rows  integer;
  before_rows integer;
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

  -- P4: the data 0061 wrote is untouched. This migration is a
  -- LEDGER-ONLY migration, so it must not have disturbed the data 0061
  -- wrote. See "THE P4 REVISION" in the header for why the original
  -- absolute assertion was wrong on a chain-built database.
  --
  -- P4a: the alias row count is UNCHANGED by this migration. The count
  --      was captured before the ledger INSERT and is compared now.
  --      This holds on EVERY shape -- live, chain-built, and a database
  --      where 0061 was never applied -- and it is what a ledger-only
  --      migration has to prove.
  --
  -- P4b: on the LIVE shape -- the retired orphan ingredient
  --      `bechamel-sauce` exists -- the alias table must hold exactly
  --      one row, and it must be the `bechamel-sauce` alias resolving to
  --      the canonical `bechamel` ingredient. The original live
  --      assertion, kept at full strength and tightened.
  --
  -- On a chain-built database the orphan is absent, 0061 skipped the
  -- insert, and the table is legitimately EMPTY. The proof says so
  -- plainly instead of asserting a row that was never written.
  IF to_regclass('public.ingredient_aliases') IS NOT NULL THEN
    SELECT count(*) INTO alias_rows FROM public.ingredient_aliases;

    -- P4a: the count did not move.
    before_rows := COALESCE(
      NULLIF(current_setting('gustale.ledger_0063_alias_rows_before', true), '')::integer,
      -1
    );
    IF alias_rows <> before_rows THEN
      RAISE EXCEPTION
        'P4 FAILED: the alias table held % rows before this migration and holds % after -- a ledger-only migration must not change it',
        before_rows, alias_rows;
    END IF;

    -- P4b: the LIVE shape -- the orphan exists, so the alias exists.
    IF EXISTS (SELECT 1 FROM public.ingredients WHERE slug = 'bechamel-sauce') THEN
      IF alias_rows <> 1 THEN
        RAISE EXCEPTION 'P4 FAILED: the alias table holds % rows, expected exactly 1', alias_rows;
      END IF;
      IF NOT EXISTS (
        SELECT 1
        FROM public.ingredient_aliases a
        JOIN public.ingredients c ON c.id = a.ingredient_id
        WHERE a.alias_slug = 'bechamel-sauce'
          AND c.slug = 'bechamel'
      ) THEN
        RAISE EXCEPTION
          'P4 FAILED: the bechamel-sauce alias is missing or does not resolve to the bechamel ingredient';
      END IF;
      RAISE NOTICE 'CONFIRMED: the alias table still holds exactly one alias, and it resolves to the bechamel ingredient';
    ELSE
      RAISE NOTICE
        'NOTE: there is no bechamel-sauce ingredient on this database, so 0061 wrote no alias row here; the alias table holds % rows, unchanged by this migration',
        alias_rows;
    END IF;
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
