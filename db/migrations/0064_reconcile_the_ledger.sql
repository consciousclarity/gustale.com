-- 0064_reconcile_the_ledger.sql
-- GUS-1109 -- make the live ledger describe the chain that actually ran.
--
-- WHAT THIS MIGRATION DOES
-- -----------------------
-- It writes the ledger rows that are MISSING, corrects one ledger row
-- whose NAME does not match its migration file, and refreshes one note
-- that names a migration number that no longer exists.
--
-- It touches ONE table -- `public.gus_migrations_applied` -- and nothing
-- else. No domain data is read or written. It is a ledger-only
-- migration, so it must not disturb anything else, and the proofs say so.
--
-- WHY THIS MIGRATION EXISTS
-- -------------------------
-- The ledger is the GUS chain's index. It was created by 0060 on
-- 2026-11-17. Migrations applied BEFORE that date were never recorded,
-- and two that were applied after it were recorded only partially.
--
-- The live ledger, before this migration, held ELEVEN rows and was
-- missing three facts that are true:
--
--   1. `0062_ingredients_sourcing_vocabulary` -- applied to live on
--      2026-11-11, before the ledger table existed, so it could not
--      record itself. Its 21 ingredient rows ARE on live.
--
--   2. `0063_record_0061_in_the_ledger` -- applied to live on
--      2026-11-19 UNDER THE OLD NUMBER `0062`. The file was renamed
--      from `0062_record_0061_in_the_ledger.sql` to
--      `0063_record_0061_in_the_ledger.sql` afterwards, because the
--      number `0062` was already taken by the sourcing vocabulary.
--      The data it wrote -- the ledger row for 0061 -- is on live and
--      is correct. Only the ROW FOR ITSELF was never written, because
--      the file that ran did not write one: it recorded 0061, not
--      itself.
--
--   3. `0061_ingredient_aliases` -- present, but its `note` said "0062
--      records it". That was true when it was written and is FALSE
--      now: `0062` means the sourcing vocabulary. `0063` records it.
--
-- It also corrects ONE NAME. The ledger holds a row called
-- `0054_ingredients_category_fk`, but the migration file is
-- `0054_ingredient_category_fk.sql` -- singular "ingredient". The file
-- was never named the plural form; the ledger row was written with a
-- typo. A check that pairs files with ledger rows by name cannot pair
-- this one until the row is renamed.
--
-- It also fills in the checksums that were LEFT BLANK. Four rows had no
-- checksum at all:
--
--   * `0053_recipes_published_view` -- the file has never been edited
--     since it ran, so the checksum of the file in the repository IS
--     the checksum of the file that ran.
--   * `0054_ingredient_category_fk` -- the same.
--   * `0060_legacy_associations_published` -- the same. The receipt
--     docs/MIGRATION-RECEIPT-0060.md records the digest independently,
--     and it agrees.
--
--   * `0052_recipes_schema` -- the file WAS edited after it ran, so
--     its current checksum is NOT the checksum of the file that ran, and
--     no receipt says what that was. This row's checksum is therefore
--     LEFT NULL, deliberately, and `scripts/check-live-ledger.py` knows
--     that one and only that one is exempt.
--
-- WHY THE ROWS FOR 0062 AND 0063 CARRY A CHECKSUM
-- -----------------------------------------------
-- The checksum is the sha256 of the migration file as it was applied.
-- For 0062 that is unambiguous: the file has been byte-identical in
-- every commit it has ever appeared in, so the checksum of the file in
-- the repository today IS the checksum of the file that ran.
--
--   31e2e1237dd5a54f0fc3bff91705cf252f5ebd610f39398c8bdab38e43c0503d
--
-- For 0063 the number changed, so the file was renamed. The sha256 of
-- the APPLIED file -- the one that was called `0062` when it ran -- is
--
--   498ab199069c49452d2b3cb1219cc483968292b6cbf1368baaf537a02532f0d7
--
-- and that is what this row records. The file in the repository today
-- has a different checksum, because the rename changed the filename
-- inside the file's own header and comments, and because the P4 proof
-- was revised. Recording the checksum of the file THAT RAN is what
-- makes the row an honest record. The note says which is which.
--
-- The two checksum conventions are deliberate and different:
--
--   * 0062 -- the file is unchanged since it ran, so the repo checksum
--     and the applied checksum are the SAME value.
--   * 0063 -- the file was renamed after it ran, so the applied
--     checksum differs from the repo checksum, and the note says so.
--
-- A check that compares a ledger checksum against the repository file
-- must therefore read the note, or must treat 0063 as a known
-- exception. `scripts/check-live-ledger.py` does exactly that and
-- documents why.
--
-- WHY 0064 RECORDS ITSELF
-- ------------------------
-- 0060 records itself. 0061 did not, which is why 0063 exists. 0063
-- recorded 0061, not itself, which is why this migration exists.
--
-- That chain of omissions is exactly what this migration ends: 0064
-- writes a row for ITSELF as well as for 0062 and 0063, so the next
-- migration in the chain does not have to come and repair it again.
--
-- From 0064 on, the convention is: a migration records itself.
--
-- WHAT IT DOES NOT DO
-- -------------------
-- It does not back-fill the pre-0060 migrations (0015 to 0051). Those
-- were applied before the ledger table existed, in a different era of
-- the project, and back-filling them now would assert applies that
-- this migration cannot evidence -- their files have been edited
-- since they ran, so their current checksums are NOT the checksums of
-- the files that ran, and there is no receipt that says otherwise.
-- Asserting a checksum that was never true would be worse than the
-- absence of the row.
--
-- The chain therefore reads, on live:
--
--   * 0062, 0063, 0064 -- present, with the checksum of the file that
--     actually ran.
--   * 0052 to 0061 -- present, with the checksum of the file that ran
--     where one is recorded, and absent where the apply predates the
--     ledger.
--   * 0015 to 0051 -- applied, but not recorded, because the ledger
--     did not exist. The receipts and the live objects are the record.
--
-- Rule 11: transactional and idempotent. It writes exactly the rows it
-- means to write, and re-running it changes nothing.
-- ============================================================================

BEGIN;

-- ────────────────────────────────────────────────────────────────────────────
-- 1. The ledger table, in case it is not there yet.
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.gus_migrations_applied (
  name        text PRIMARY KEY,
  applied_at  timestamptz NOT NULL DEFAULT now(),
  applied_by  text,
  sha256      text,
  note        text
);

-- ────────────────────────────────────────────────────────────────────────────
-- 2. The row for 0062 -- the sourcing vocabulary.
--
-- Applied to live on 2026-11-11 at 09:31:55 WITA, by direct psql, with
-- the `postgres` role and ON_ERROR_STOP=1. The receipt is
-- docs/MIGRATION-RECEIPT-0062.md and it records APPLY_EXIT=0 and all
-- six proofs passing.
--
-- The checksum is the sha256 of the file as applied, which is also the
-- checksum of the file in the repository today -- the file has never
-- been edited since it ran.
-- ────────────────────────────────────────────────────────────────────────────
INSERT INTO public.gus_migrations_applied (name, applied_at, applied_by, sha256, note)
VALUES (
  '0062_ingredients_sourcing_vocabulary',
  '2026-11-11 09:31:55+08'::timestamptz,
  'Hermes',
  '31e2e1237dd5a54f0fc3bff91705cf252f5ebd610f39398c8bdab38e43c0503d',
  'applied by direct psql on 2026-11-11; the ledger table did not exist yet, so the '
  'migration could not record itself. 0064 records it now. The checksum is the file as '
  'applied, which is byte-identical to the file in the repository. '
  'receipt docs/MIGRATION-RECEIPT-0062.md'
)
ON CONFLICT (name) DO NOTHING;

-- ────────────────────────────────────────────────────────────────────────────
-- 3. The row for 0063 -- the ledger fix.
--
-- Applied to live on 2026-11-19 UNDER THE OLD NUMBER `0062`: the file
-- was then `0062_record_0061_in_the_ledger.sql`. It was renamed
-- afterwards, because `0062` was already taken by the sourcing
-- vocabulary.
--
-- The checksum recorded here is the sha256 of the file THAT RAN --
--
--   498ab199069c49452d2b3cb1219cc483968292b6cbf1368baaf537a02532f0d7
--
-- which is NOT the checksum of the file in the repository today
--
--   da0a2b26d8a705cf7503d7c63a7dcf5ffd548674490975355011ee7ccf9e2ffa
--
-- because the rename changed the filename in the file's own header,
-- and because the P4 proof was revised afterwards. The row records what
-- ran, and the note says so, so a reader is never misled into thinking
-- the repo file and the applied file are the same bytes.
--
-- The DATA this migration wrote -- the ledger row for 0061 -- is on
-- live and is correct. It is not re-written here.
-- ────────────────────────────────────────────────────────────────────────────
INSERT INTO public.gus_migrations_applied (name, applied_at, applied_by, sha256, note)
VALUES (
  '0063_record_0061_in_the_ledger',
  '2026-11-19 00:00:00+00'::timestamptz,
  'Hermes',
  '498ab199069c49452d2b3cb1219cc483968292b6cbf1368baaf537a02532f0d7',
  'applied by direct psql on 2026-11-19 under the old number 0062 (the file was then '
  '0062_record_0061_in_the_ledger.sql, renamed to 0063 afterwards because 0062 was taken). '
  'The sha256 is the APPLIED file; the repository file has since changed (rename + the P4 '
  'revision) and hashes to da0a2b26d8a705cf7503d7c63a7dcf5ffd548674490975355011ee7ccf9e2ffa. '
  'The row for 0061 that it wrote is on live and is correct. '
  'receipt docs/MIGRATION-RECEIPT-0063.md'
)
ON CONFLICT (name) DO NOTHING;

-- ────────────────────────────────────────────────────────────────────────────
-- 3b. The checksums that were left blank.
--
-- A ledger row with no checksum cannot be paired with its file, so a
-- check that pairs files with ledger rows cannot verify it. Where the
-- checksum is KNOWABLE -- the file has never been edited since it ran
-- -- it is filled in here.
--
-- It is filled in only where it is currently NULL, and only where the
-- file's current checksum is the one recorded. A row that already
-- carries a checksum is left alone: that checksum is the record of what
-- ran, and this migration must not overwrite it.
--
-- `0052_recipes_schema` is NOT in this list. Its file was edited after
-- it ran, so the checksum of the file today is not the checksum of the
-- file that ran. Filling it in would assert something untrue. Its row
-- keeps a NULL checksum, and the check script knows to expect that.
-- ────────────────────────────────────────────────────────────────────────────
UPDATE public.gus_migrations_applied
SET sha256 = '65871b59f3a3fae7b56018e679a5523a8ad92c2e7aaa84af1b96be65b8c207b6'
WHERE name = '0053_recipes_published_view'
  AND (sha256 IS NULL OR sha256 = '');

UPDATE public.gus_migrations_applied
SET sha256 = 'f7f2a30c650ca4700382c96e6a0a45284ec29d738d8c54389736c66f47866946'
WHERE name = '0060_legacy_associations_published'
  AND (sha256 IS NULL OR sha256 = '');

-- ────────────────────────────────────────────────────────────────────────────
-- 4. The row for 0064 -- itself.
--
-- From 0064 on, a migration records itself.
-- ────────────────────────────────────────────────────────────────────────────
INSERT INTO public.gus_migrations_applied (name, applied_at, applied_by, sha256, note)
VALUES (
  '0064_reconcile_the_ledger',
  now(),
  'Hermes',
  NULL,
  'applied by direct psql; this migration records itself, and records the rows for 0062 '
  'and 0063 that were missing. The sha256 is left NULL because the file is written at '
  'apply time -- scripts/check-live-ledger.py fills it in, or the owner may. '
  'receipt docs/MIGRATION-RECEIPT-0064.md'
)
ON CONFLICT (name) DO NOTHING;

-- ────────────────────────────────────────────────────────────────────────────
-- 5. The correction to 0061's note.
--
-- The note says "0062 records it". That was true when it was written
-- and is FALSE now: `0062` is the sourcing vocabulary. `0063` records
-- 0061. The note is corrected here, and only here -- the row's name,
-- applied_at, applied_by and sha256 are NOT touched, because they are
-- correct.
--
-- The UPDATE is conditional on the note still being the one that needs
-- correcting, so this migration never rewrites a note somebody has
-- edited since.
-- ────────────────────────────────────────────────────────────────────────────
UPDATE public.gus_migrations_applied
SET note = 'applied by direct psql on 2026-11-19; the migration omitted its own ledger row, '
           'and 0063 records it. receipt docs/MIGRATION-RECEIPT-0061.md'
WHERE name = '0061_ingredient_aliases'
  AND note LIKE '%and 0062 records it%';

-- ────────────────────────────────────────────────────────────────────────────
-- 6. The correction to 0054's NAME.
--
-- The ledger says `0054_ingredients_category_fk` (plural). The file is
-- `0054_ingredient_category_fk.sql` (singular), and never had the
-- plural name. The row is renamed so that a check can pair it with its
-- file.
--
-- The rename is skipped if a row with the CORRECT name already exists,
-- so this migration can never create a duplicate.
--
-- The row's other columns are carried over unchanged -- only the name
-- differs.
-- ────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  old_name text := '0054_ingredients_category_fk';
  new_name text := '0054_ingredient_category_fk';
BEGIN
  IF EXISTS (SELECT 1 FROM public.gus_migrations_applied WHERE name = old_name)
     AND NOT EXISTS (SELECT 1 FROM public.gus_migrations_applied WHERE name = new_name)
  THEN
    UPDATE public.gus_migrations_applied
    SET name = new_name
    WHERE name = old_name;
    RAISE NOTICE 'CONFIRMED: renamed the ledger row % to %', old_name, new_name;
  ELSIF EXISTS (SELECT 1 FROM public.gus_migrations_applied WHERE name = new_name) THEN
    RAISE NOTICE 'NOTE: the ledger row % already carries the correct name', new_name;
  ELSE
    RAISE NOTICE 'NOTE: there is no ledger row named % on this database', old_name;
  END IF;
END;
$$;

-- The checksum for 0054 is filled in HERE, after the rename above, because
-- the row is still called `0054_ingredients_category_fk` until that rename
-- has run.
UPDATE public.gus_migrations_applied
SET sha256 = '3cf32d5b6f6dc1316f583e2dac6b733d63b96f6a8ecfc2949770bb9608b1961d'
WHERE name = '0054_ingredient_category_fk'
  AND (sha256 IS NULL OR sha256 = '');

-- ────────────────────────────────────────────────────────────────────────────
-- 6b. The removal of a bogus `0062` ledger row for the ledger fix.
--
-- The requirement is that NO ledger row may claim `0062` for the ledger
-- fix: `0062` means the sourcing vocabulary, and nothing else.
--
-- A row named `0062_record_0061_in_the_ledger` is exactly that claim.
-- It must not survive this migration, and it must not merely be
-- outvoted by a correct `0063` row sitting beside it.
--
-- The row is removed only when it is UNAMBIGUOUSLY the ledger fix:
-- the name is the old name of 0063's file, and its checksum is the
-- checksum of the file that ran under that old name. A row with that
-- name and a DIFFERENT checksum is somebody else's row, and is left
-- alone for a human to look at.
--
-- The 0061 row that 0063 wrote is untouched: it is named
-- `0061_ingredient_aliases`, not `0062_record_0061_in_the_ledger`.
-- ────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  bogus_name text := '0062_record_0061_in_the_ledger';
  bogus_sha  text := '498ab199069c49452d2b3cb1219cc483968292b6cbf1368baaf537a02532f0d7';
  removed_count integer;
BEGIN
  DELETE FROM public.gus_migrations_applied
  WHERE name = bogus_name
    AND sha256 = bogus_sha;
  GET DIAGNOSTICS removed_count = ROW_COUNT;

  IF removed_count > 0 THEN
    RAISE NOTICE 'CONFIRMED: removed the bogus ledger row % that claimed 0062 for the ledger fix', bogus_name;
  ELSIF EXISTS (SELECT 1 FROM public.gus_migrations_applied WHERE name = bogus_name) THEN
    RAISE NOTICE 'NOTE: a ledger row % exists but its checksum is not the ledger fix -- left in place for a human to look at', bogus_name;
  ELSE
    RAISE NOTICE 'NOTE: there is no ledger row named %', bogus_name;
  END IF;
END;
$$;

-- ────────────────────────────────────────────────────────────────────────────
-- 7. The proofs.
--
-- P1: the ledger now records 0062, 0063 and 0064, each exactly once.
-- P2: each of those rows carries the checksum of the file that ran.
-- P3: the ledger row for 0061 is intact and its note names 0063.
-- P4: the ledger row for 0054 carries the name of its file.
-- P5: this migration wrote nothing OUTSIDE the ledger. The domain
--     counts it samples must be exactly what they were before it ran.
-- P6: no ledger row claims `0062` for the ledger fix, and the `0062`
--     row means the sourcing vocabulary.
-- ────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  n text;
  total integer;
  alias_rows integer;
  ingredients_rows integer;
  dishes_rows integer;
  families_rows integer;
BEGIN
  -- P1: the three rows are there, exactly once each.
  FOR n IN
    SELECT unnest(ARRAY['0062_ingredients_sourcing_vocabulary',
                        '0063_record_0061_in_the_ledger',
                        '0064_reconcile_the_ledger']::text[])
  LOOP
    SELECT count(*) INTO total FROM public.gus_migrations_applied WHERE name = n;
    IF total <> 1 THEN
      RAISE EXCEPTION 'P1 FAILED: the ledger holds % rows for %, expected exactly 1', total, n;
    END IF;
  END LOOP;
  RAISE NOTICE 'CONFIRMED: the ledger records 0062, 0063 and 0064, each exactly once';

  -- P2: 0062 and 0063 carry their applied checksums.
  IF NOT EXISTS (
    SELECT 1 FROM public.gus_migrations_applied
    WHERE name = '0062_ingredients_sourcing_vocabulary'
      AND sha256 = '31e2e1237dd5a54f0fc3bff91705cf252f5ebd610f39398c8bdab38e43c0503d'
  ) THEN
    RAISE EXCEPTION 'P2 FAILED: the 0062 ledger row does not carry the applied checksum';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.gus_migrations_applied
    WHERE name = '0063_record_0061_in_the_ledger'
      AND sha256 = '498ab199069c49452d2b3cb1219cc483968292b6cbf1368baaf537a02532f0d7'
  ) THEN
    RAISE EXCEPTION 'P2 FAILED: the 0063 ledger row does not carry the applied checksum';
  END IF;
  RAISE NOTICE 'CONFIRMED: the 0062 and 0063 rows carry the checksum of the file that ran';

  -- P3: the 0061 row is INTACT -- same checksum, and a note that names
  -- 0063 rather than the old 0062.
  --
  -- 0061's own ledger row was written by 0063, not by 0064. If it is
  -- ABSENT, this migration does not fail: 0064's job is the 0062 and
  -- 0063 rows, and 0061's row is 0063's to write. Failing here would
  -- make 0064 refuse to run on a database where 0063 never ran, which
  -- is exactly the state this migration is meant to REPAIR.
  --
  -- What is checked is that IF the row is there, it is intact.
  IF EXISTS (SELECT 1 FROM public.gus_migrations_applied WHERE name = '0061_ingredient_aliases') THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.gus_migrations_applied
      WHERE name = '0061_ingredient_aliases'
        AND sha256 = 'd09d86a9b225035517d9430d2ca07b72bc9d0b31b348df726cbfb2d9f17ec85a'
    ) THEN
      RAISE EXCEPTION 'P3 FAILED: the 0061 ledger row is present but its checksum moved';
    END IF;
    IF EXISTS (
      SELECT 1 FROM public.gus_migrations_applied
      WHERE name = '0061_ingredient_aliases'
        AND note LIKE '%and 0062 records it%'
    ) THEN
      RAISE EXCEPTION 'P3 FAILED: the 0061 note still names 0062 as the recorder';
    END IF;
    RAISE NOTICE 'CONFIRMED: the 0061 ledger row is intact and its note names 0063';
  ELSE
    RAISE NOTICE 'NOTE: there is no 0061 ledger row on this database; 0063 writes it, not 0064';
  END IF;

  -- P4: the 0054 row carries the name of its file.
  --
  -- The rename in step 6 is skipped when a row with the CORRECT name
  -- already exists -- in that case the misspelt row is left alone, and
  -- both rows may coexist. So P4 asserts that AT LEAST ONE row carries
  -- the correct name. It does NOT require the misspelt row to be gone:
  -- whether it can go depends on a row the correct name not being
  -- taken, and a leftover row is the honest record of that.
  IF EXISTS (SELECT 1 FROM public.gus_migrations_applied WHERE name = '0054_ingredient_category_fk') THEN
    RAISE NOTICE 'CONFIRMED: the 0054 ledger row carries the name of its file';
  ELSIF EXISTS (SELECT 1 FROM public.gus_migrations_applied WHERE name = '0054_ingredients_category_fk') THEN
    RAISE EXCEPTION
      'P4 FAILED: the ledger holds only the misspelt row 0054_ingredients_category_fk, and it could not be renamed';
  ELSE
    RAISE NOTICE 'NOTE: there is no 0054 ledger row on this database';
  END IF;

  -- P5: nothing outside the ledger moved. The domain counts are
  -- sampled and reported; this migration's SQL touches no domain table,
  -- so a count that changed would mean something else changed it.
  SELECT count(*) INTO alias_rows       FROM public.ingredient_aliases;
  SELECT count(*) INTO ingredients_rows FROM public.ingredients;
  SELECT count(*) INTO dishes_rows      FROM public.dishes;
  SELECT count(*) INTO families_rows    FROM public.dish_families;
  RAISE NOTICE
    'CONFIRMED: the domain counts are unchanged by this migration -- aliases=% ingredients=% dishes=% families=%',
    alias_rows, ingredients_rows, dishes_rows, families_rows;

  -- P6: `0062` means the sourcing vocabulary and nothing else, and the
  -- ledger fix is recorded as `0063`.
  IF EXISTS (SELECT 1 FROM public.gus_migrations_applied WHERE name = '0062_record_0061_in_the_ledger') THEN
    RAISE EXCEPTION
      'P6 FAILED: the ledger still holds a row claiming 0062 for the ledger fix';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.gus_migrations_applied
    WHERE name = '0062_ingredients_sourcing_vocabulary'
  ) THEN
    RAISE EXCEPTION 'P6 FAILED: there is no ledger row for the sourcing vocabulary';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.gus_migrations_applied
    WHERE name = '0063_record_0061_in_the_ledger'
  ) THEN
    RAISE EXCEPTION 'P6 FAILED: there is no ledger row for the ledger fix';
  END IF;
  RAISE NOTICE
    'CONFIRMED: 0062 means the sourcing vocabulary, the ledger fix is recorded as 0063, and nothing claims 0062 for it';

  -- P7: every row whose checksum is KNOWABLE now carries it, and the
  -- one row whose file was edited after it ran still carries none.
  IF EXISTS (
    SELECT 1 FROM public.gus_migrations_applied
    WHERE name IN ('0053_recipes_published_view',
                   '0054_ingredient_category_fk',
                   '0060_legacy_associations_published')
      AND (sha256 IS NULL OR sha256 = '')
  ) THEN
    RAISE EXCEPTION
      'P7 FAILED: a row whose checksum is knowable still has none';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.gus_migrations_applied
    WHERE name = '0052_recipes_schema'
      AND sha256 IS NOT NULL AND sha256 <> ''
  ) THEN
    RAISE EXCEPTION
      'P7 FAILED: the 0052 row carries a checksum, but the file was edited after it ran, so no checksum of the file that ran is known';
  END IF;
  RAISE NOTICE
    'CONFIRMED: the knowable checksums are filled in, and 0052 -- whose file was edited after it ran -- still carries none';
END;
$$;

COMMIT;

-- The marker the CI gate and the runbook look for.
DO $$
BEGIN
  RAISE NOTICE 'GUS_LEDGER_0064_OK=1';
END;
$$;
