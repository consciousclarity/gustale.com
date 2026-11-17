-- Add the two GUS chain ledger rows for 0059 and 0058.
--
-- WHY THIS IS NEEDED
-- -----------------
-- The GUS chain's own ledger (public.gus_migrations_applied, created by
-- gus-238c) records what was applied to THIS database. Its seed list stops
-- at 'gus-238c-constraint-idempotence-and-ledger'. It therefore records
-- NEITHER 0059_dish_families_descriptions NOR 0058_dish_families_listed
-- -- the two migrations applied on 2026-11-16, after that seed list was
-- written.
--
-- Without these two rows the ledger is incomplete: it would claim the GUS
-- chain's state while omitting the migration that gave the 56 FORM
-- families their descriptions, and the migration that set `listed` and
-- removed the Musakka variant row.
--
-- This is LEDGER ONLY. It inserts two rows. It creates no schema, changes
-- no data, and touches nothing the migrations themselves touched.
--
-- The insert is idempotent (ON CONFLICT DO NOTHING), so re-running this
-- file changes nothing and does not disturb the applied_at of a row that is
-- already there.
--
-- THE sha256 VALUES
-- -----------------
-- They are the digests of the migration FILES AS THEY WERE APPLIED TO
-- LIVE -- the pre-fix versions, which are the ones recorded in the
-- receipt's transfer check:
--
--   0058  md5 260cbe4b77f88a178cacc783ee825384  (matches the receipt)
--   0059  md5 d4c5264c45eaa5ebef160ac67ac7a224  (matches the receipt)
--
-- The repository's copies of both files were FIXED afterwards, in commit
-- 348af03, because CI found two defects that only show up on the CI
-- fixture shape (a 28-family database) and on a re-run. Those fixes do
-- NOT change what live received: the receipt proves, by running the fixed
-- files against the live database inside a rolled-back transaction, that
-- they are no-ops there (0058 -> UPDATE 0; 0059 -> skipped cleanly) and
-- that live is already in the state the fixed files produce. The full
-- reasoning is in docs/MIGRATION-RECEIPT-0059-0058.md, which is the
-- authoritative record of this apply.
--
-- So the sha256 below identifies the file that was actually applied, and
-- the note says so explicitly, so that a reader who compares it with the
-- repository's current file understands the difference instead of
-- concluding the ledger is wrong.

\set ON_ERROR_STOP on

BEGIN;

INSERT INTO public.gus_migrations_applied (name, applied_at, applied_by, sha256, note)
VALUES
  ('0059_dish_families_descriptions',
   '2026-11-16'::timestamptz, 'Hermes',
   'ec6c4117d1be918f8d6724017b9b41d9561dbe49ed26ef72dfa7995b5ed3b813',
   'applied by direct psql (PSQL_RC_0059=0), 0059 FIRST then 0058; sha256 is the APPLIED (pre-fix) file -- the repo file was fixed in 348af03 and is a proven no-op on live; receipt docs/MIGRATION-RECEIPT-0059-0058.md'),
  ('0058_dish_families_listed',
   '2026-11-16'::timestamptz, 'Hermes',
   '9f0a568304a037abeb3cee95404621245031200608ba94b72c688fd1a9d08a7b',
   'applied by direct psql (PSQL_RC_0058=0), after 0059; sha256 is the APPLIED (pre-fix) file -- the repo file was fixed in 348af03 and is a proven no-op on live; receipt docs/MIGRATION-RECEIPT-0059-0058.md')
ON CONFLICT (name) DO NOTHING;

COMMIT;

-- The proof, read back in the SAME session.
DO $$
DECLARE
  v_ledger integer;
  v_total integer;
  v_listed integer;
  v_unlisted integer;
  v_names text;
BEGIN
  SELECT count(*) INTO v_ledger FROM public.gus_migrations_applied;
  SELECT string_agg(name, ', ' ORDER BY name) INTO v_names
    FROM public.gus_migrations_applied;

  IF v_ledger < 9 THEN
    RAISE EXCEPTION 'the GUS ledger has % rows, expected at least 9', v_ledger;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.gus_migrations_applied
                   WHERE name = '0059_dish_families_descriptions'
                     AND sha256 = 'ec6c4117d1be918f8d6724017b9b41d9561dbe49ed26ef72dfa7995b5ed3b813') THEN
    RAISE EXCEPTION 'the 0059 ledger row is missing or has the wrong sha256';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.gus_migrations_applied
                   WHERE name = '0058_dish_families_listed'
                     AND sha256 = '9f0a568304a037abeb3cee95404621245031200608ba94b72c688fd1a9d08a7b') THEN
    RAISE EXCEPTION 'the 0058 ledger row is missing or has the wrong sha256';
  END IF;

  -- The rows record what was applied, so the state they describe must
  -- still be the state of the database. If a migration had been undone
  -- after the fact, the ledger would be claiming something false.
  -- The INTO targets bind in SELECT-list order: total, listed, unlisted.
  SELECT count(*),
         count(*) FILTER (WHERE listed),
         count(*) FILTER (WHERE NOT listed)
    INTO v_total, v_listed, v_unlisted
    FROM dish_families;

  IF v_total <> 306 OR v_listed <> 162 OR v_unlisted <> 144 THEN
    RAISE EXCEPTION 'dish_families is % total / % listed / % unlisted, expected 306/162/144 -- the state the ledger rows describe is not the state of this database', v_total, v_listed, v_unlisted;
  END IF;

  RAISE NOTICE 'CONFIRMED: the GUS ledger holds % rows', v_ledger;
  RAISE NOTICE 'CONFIRMED: %', v_names;
  RAISE NOTICE 'CONFIRMED: dish_families is % total (% listed, % unlisted) -- the state 0058 and 0059 produced', v_total, v_listed, v_unlisted;
  RAISE NOTICE 'GUS_LEDGER_0059_0058_OK=1';
END $$;
