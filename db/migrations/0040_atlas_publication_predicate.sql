-- 0040 — the PUBLICATION PREDICATE: one definition of what the public may
-- see.
--
-- WHY THIS EXISTS
--
-- ADR-004 §8.2 (D8.2) says:
--
--   > Decision: a single SQL function is the only thing that decides what
--   > the public may see.
--
-- and it names the function:
--
--   CREATE FUNCTION public.published_claims_for_dish(p_dish_id uuid)
--   RETURNS SETOF statements ...
--
-- That function DID NOT EXIST. The P3 route wrote the filter out by
-- hand, three times:
--
--     AND a.publication_state = 'published'
--     AND st.status = 'published'
--     AND status = 'published'
--
-- Three hand-written copies of one rule is exactly what D8.2 forbids: a
-- claim can be public on one surface and draft on another, and nobody
-- notices until a reader sees a draft claim.
--
-- So this migration creates the functions, and the route uses them.
--
-- THE TWO PREDICATES
--
--   public.published_claims_for_dish(p_dish_id uuid)
--     The claims about a dish that are visible to the public.
--     status = 'published' — and PER STATEMENT, never per dish, so one
--     disputed claim does not suppress the published ones beside it.
--
--   public.published_associations_for_dish(p_dish_id uuid)
--     The typed associations about a dish that are visible to the public.
--     publication_state = 'published' — and the dish must itself be
--     published, so a draft dish's associations never leak through a
--     route that forgot to check.
--
-- Both are STABLE and PARALLEL SAFE, so they can be used in a WHERE
-- clause.
--
-- WHAT THIS MIGRATION WRITES
--
-- NOTHING. It creates three functions and their comments. It writes no
-- rows, touches no table, and changes no data.
--
-- THE FIXTURES ARE NOT HERE
--
-- The brief's §12 says the model is "demonstrated with isolated
-- fixtures", and §13 says:
--
--   > Fixtures never enter the live database or the production content
--   > pipeline.
--
-- So the FIXTURES ARE IN A SEPARATE FILE — packages/db/seed-atlas-fixtures.sql
-- — which the CI and the local reproduction apply and the LIVE MIGRATION
-- CHAIN NEVER RUNS. (Alejandro's decision, 2026-10-31.)
--
-- The split matters: a migration is applied to production by the standing
-- gate, and a seed is not. Putting the fixtures in the migration would
-- have put them on live.
--
-- The gate ALSO asserts that no fixture row exists on live — see
-- scripts/apply-migration-live.sh — so a fixture that reached production
-- by another route is caught rather than served.

\set ON_ERROR_STOP on

BEGIN;

-- =====================================================================
-- 1. THE PREDICATES
-- =====================================================================

-- The published claims about a dish.
--
-- PER STATEMENT, never per dish: a dish with one published claim and
-- one disputed claim shows the published one normally and the disputed
-- one with its badge. A dish whose only claim is a draft shows no
-- claim at all.
CREATE OR REPLACE FUNCTION public.published_claims_for_dish(p_dish_id uuid)
RETURNS SETOF statements
LANGUAGE sql
STABLE
PARALLEL SAFE
AS $$
  SELECT st.*
    FROM statements st
   WHERE st.subject_type = 'dish'
     AND st.subject_id = p_dish_id
     AND st.status = 'published';
$$;

COMMENT ON FUNCTION public.published_claims_for_dish(uuid) IS
  'ADR-004 D8.2. THE definition of a publicly visible claim. Every public read path goes through this function or through a predicate written from the same definition, so a claim cannot be public on one surface and draft on another. Per STATEMENT, never per dish: one disputed claim does not suppress the published ones beside it.';

-- The published typed associations about a dish.
--
-- The dish's OWN status is checked as well: a draft dish's
-- associations must not leak through a route that forgot to check.
CREATE OR REPLACE FUNCTION public.published_associations_for_dish(p_dish_id uuid)
RETURNS SETOF dish_place_associations
LANGUAGE sql
STABLE
PARALLEL SAFE
AS $$
  SELECT a.*
    FROM dish_place_associations a
    JOIN dishes d ON d.id = a.dish_id
   WHERE a.dish_id = p_dish_id
     AND a.publication_state = 'published'
     AND d.status = 'published';
$$;

COMMENT ON FUNCTION public.published_associations_for_dish(uuid) IS
  'ADR-004 D8.2. THE definition of a publicly visible typed association. The dish own status is checked too, so a draft dish associations cannot leak through a route that forgot to check.';

-- The published typed connections about a dish.
--
-- Same shape: one definition, so the graph endpoint and the list
-- cannot disagree about which edges exist.
CREATE OR REPLACE FUNCTION public.published_connections_for_dish(p_dish_id uuid)
RETURNS SETOF dish_relations
LANGUAGE sql
STABLE
PARALLEL SAFE
AS $$
  SELECT r.*
    FROM dish_relations r
    JOIN dishes d ON d.id = r.from_dish_id OR d.id = r.to_dish_id
   WHERE (r.from_dish_id = p_dish_id OR r.to_dish_id = p_dish_id)
     AND r.status = 'active'
     AND d.status = 'published';
$$;

COMMENT ON FUNCTION public.published_connections_for_dish(uuid) IS
  'ADR-004 D8.2. THE definition of a publicly visible typed connection. An edge is visible when it is active and both of its dishes are published.';

-- =====================================================================
-- 2. THE RECONCILIATION
-- =====================================================================

DO $$
DECLARE
  v_functions bigint;
  v_fixture_rows bigint;
BEGIN
  SELECT count(*) INTO v_functions
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname IN (
           'published_claims_for_dish',
           'published_associations_for_dish',
           'published_connections_for_dish'
         );

  -- THE FIXTURES MUST NOT BE HERE. This migration writes no rows, and
  -- the fixtures live in a seed the live chain never runs. If a
  -- fixture row is here, something applied the fixture seed to live,
  -- and this fails rather than letting it be served.
  SELECT count(*) INTO v_fixture_rows FROM (
    SELECT 1 FROM dish_place_associations WHERE provenance = 'atlas_fixture'
    UNION ALL
    SELECT 1 FROM statements WHERE qualifiers->>'provenance' = 'atlas_fixture'
  ) f;

  RAISE NOTICE '=== the publication predicate ===';
  RAISE NOTICE '  the functions:        % of 3', v_functions;
  RAISE NOTICE '  the fixture rows:     %', v_fixture_rows;
  RAISE NOTICE '';

  IF v_functions <> 3 THEN
    RAISE EXCEPTION 'the publication predicates are missing: % of 3 exist', v_functions;
  END IF;

  IF v_fixture_rows <> 0 THEN
    RAISE EXCEPTION
      'there are % FIXTURE rows in this database — the fixtures are CI/dev only (brief §13) and must never be on live',
      v_fixture_rows;
  END IF;

  RAISE NOTICE '  all three predicates exist';
  RAISE NOTICE '  no fixture row is present — this migration writes none';
  RAISE NOTICE '';
  RAISE NOTICE 'ATLAS_PUBLICATION_PREDICATE_OK=1';
END $$;

COMMIT;
