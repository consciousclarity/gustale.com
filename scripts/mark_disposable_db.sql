-- Mark a database as DISPOSABLE.
--
-- WHY THIS EXISTS
--
-- The atlas constraint tests WRITE rows and then delete them. Against a
-- throwaway database that is fine. Against PRODUCTION it is not: on
-- 2026-10-31 the test's cleanup deleted by DISH
--
--     DELETE FROM dish_place_associations WHERE dish_id IN (v_a, v_b, v_c);
--
-- and on the live database the fixtures ARE the three reference dishes
-- — rendang, chicken-tikka-masala, tacos-al-pastor — which carry the P2
-- backfill's associations. So the test deleted SIX real rows:
--
--     rendang               0 associations (was 3)
--     chicken-tikka-masala  0 associations (was 1)
--     tacos-al-pastor      0 associations (was 2)
--
-- The cleanup is now marker-scoped (every row the test inserts carries a
-- marker, and only marked rows are removed) and the file asserts at the
-- end that it left the database exactly as it found it. But a cleanup
-- bug is a bug, and the strongest control is to not run there at all.
--
-- WHY A MARKER AND NOT A NAME
--
-- The first attempt at this protection was a NAME list:
--
--     GUSTALE_PROTECTED_DATABASES: gustale, gustale_prod, gustale_production
--
-- and it was WRONG, for a reason worth recording. The CI database is
-- named `gustale` — the same name as production — because the
-- PostgreSQL service container in ci.yml creates it that way. A name
-- list cannot tell "the production database" from "a CI database that
-- happens to share the name", so either the CI run is refused (and the
-- constraint tests never run in CI at all) or production is not
-- protected. There is no correct name list.
--
-- So the protection is POSITIVE: a database must DECLARE that it is
-- disposable, and the test runs only on a database that has. The
-- default is DENY — an unmarked database, whatever its name, is refused.
--
-- This is the same shape as the publish credential (0038): an explicit
-- credential, not a list of forbidden names.
--
-- WHERE THE MARKER IS CREATED
--
-- Only by the scripts that CREATE a disposable database:
--
--   scripts/apply-migration-live.sh      the gate's copy of live
--   scripts/repro-ci-db.sh                the local CI reproduction
--   scripts/ci-migration-chain.sh         the Nightly's database
--   scripts/verify-atlas-tests-detect-regression.sh
--   .github/workflows/ci.yml              the CI service database
--
-- PRODUCTION NEVER GETS THIS FILE APPLIED. The gate asserts that the
-- live database has NO marker, so a production database can never be
-- marked disposable by accident.

\set ON_ERROR_STOP on

CREATE TABLE IF NOT EXISTS public.gustale_disposable_database (
  marker    text PRIMARY KEY,
  marked_at timestamptz NOT NULL DEFAULT now(),
  note      text
);

COMMENT ON TABLE public.gustale_disposable_database IS
  'Marks a database as a disposable copy or an ephemeral CI database. The atlas constraint tests refuse to run against a database that does not carry this mark. The mark is applied only by the scripts that CREATE such a database — never to production.';

INSERT INTO public.gustale_disposable_database (marker, note)
VALUES (
  'gustale-atlas-constraint-tests',
  'This database is a disposable copy or an ephemeral CI database. The atlas constraint tests may write to it, because whatever they create they also remove.'
)
ON CONFLICT (marker) DO UPDATE SET marked_at = EXCLUDED.marked_at;

-- The report, so the mark is visible in the CI log.
DO $$
DECLARE
  v_db text := current_database();
BEGIN
  RAISE NOTICE 'the database % is marked DISPOSABLE — the atlas constraint tests may write to it', v_db;
END $$;
