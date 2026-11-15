-- Add the two GUS chain ledger rows that gus-238c's own seed list omits.
--
-- WHY THIS IS NEEDED
-- -----------------
-- gus-238c creates the ledger table AND seeds it with the migrations that
-- were known to be applied at the time it was written. Its seed list stops
-- at 'gus-238-journey-editorial-fields'. It therefore records NEITHER
-- gus-238b NOR gus-238c -- the two migrations applied after it was written.
--
-- Without these two rows the ledger is incomplete: it would claim the GUS
-- chain's own state without mentioning the function replacement that
-- actually changed the public surface.
--
-- The insert is idempotent (ON CONFLICT DO NOTHING), so re-running this
-- file changes nothing.
--
-- The sha256 values are the digests of the migration FILES, computed on the
-- reviewing host and re-computed on the applying host. They match.

\set ON_ERROR_STOP on

BEGIN;

INSERT INTO public.gus_migrations_applied (name, applied_at, applied_by, sha256, note)
VALUES
  ('gus-238b-association-review-visibility',
   '2026-11-15'::timestamptz, 'Hermes',
   'd0eee4a8321706cfcec1187b2e517af83d96811b9bd1d7f70d2bb06fab35591b',
   'applied by direct psql; receipt docs/MIGRATION-RECEIPT-GUS-238B.md'),
  ('gus-238c-constraint-idempotence-and-ledger',
   '2026-11-15'::timestamptz, 'Hermes',
   '6332c4f2b2e0336ba42b960b4a7f4a3eb5af1068ec936bb5c153d39b74a5f7e1',
   'applied by direct psql; receipt docs/MIGRATION-RECEIPT-GUS-238C.md')
ON CONFLICT (name) DO NOTHING;

COMMIT;

-- The proof, read back in the SAME session.
DO $$
DECLARE
  v_count integer;
  v_names text;
BEGIN
  SELECT count(*) INTO v_count FROM public.gus_migrations_applied;
  SELECT string_agg(name, ', ' ORDER BY name) INTO v_names
    FROM public.gus_migrations_applied;

  IF v_count < 7 THEN
    RAISE EXCEPTION 'the GUS ledger has % rows, expected at least 7', v_count;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.gus_migrations_applied
                   WHERE name = 'gus-238b-association-review-visibility'
                     AND sha256 = 'd0eee4a8321706cfcec1187b2e517af83d96811b9bd1d7f70d2bb06fab35591b') THEN
    RAISE EXCEPTION 'the gus-238b ledger row is missing or has the wrong sha256';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.gus_migrations_applied
                   WHERE name = 'gus-238c-constraint-idempotence-and-ledger'
                     AND sha256 = '6332c4f2b2e0336ba42b960b4a7f4a3eb5af1068ec936bb5c153d39b74a5f7e1') THEN
    RAISE EXCEPTION 'the gus-238c ledger row is missing or has the wrong sha256';
  END IF;

  RAISE NOTICE 'CONFIRMED: the GUS ledger holds % rows', v_count;
  RAISE NOTICE 'CONFIRMED: %', v_names;
  RAISE NOTICE 'GUS_LEDGER_238BC_OK=1';
END $$;
