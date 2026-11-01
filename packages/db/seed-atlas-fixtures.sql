-- Gustale — the ATLAS FIXTURES. CI and local development ONLY.
--
-- ⚠ THIS FILE MUST NEVER BE APPLIED TO THE LIVE DATABASE. ⚠
--
-- The brief's §12 says the model is "demonstrated with isolated
-- fixtures", and §13 says:
--
--   > Fixtures never enter the live database or the production content
--   > pipeline.
--
-- So the fixtures are a SEED, not a migration. A migration is applied to
-- production by the standing gate; a seed is not. That distinction is
-- the whole point of this file's existence — the first version of this
-- work put the fixtures IN migration 0040, which would have put them on
-- live.
--
-- (Alejandro's decision, 2026-10-31: "do NOT apply fixtures to live.
-- Ship only the predicate functions; fixtures stay CI/dev-only per brief
-- §13.")
--
-- WHAT IT DOES
--
-- It publishes the four reference dishes' associations and claims as
-- FIXTURES, so the atlas route has something to serve in CI and in local
-- development. Every fixture row carries `provenance = 'atlas_fixture'`,
-- so a reviewer can find them and remove them.
--
-- WHAT IT DOES NOT DO
--
-- It does not publish any REAL association. All 2,713 backfilled rows
-- stay `draft` with `evidence_status='unevidenced'`, because none of
-- them is supported by a qualifying source, and the brief forbids
-- presenting unevidenced history as fact.
--
-- The fixture claims name "the atlas fixture" — not a person, not a
-- place — and they cite a fixture source whose own title says it is a
-- demonstration record. A claim naming a real person would be a
-- fabricated attribution.
--
-- WHERE IT IS APPLIED
--
--   scripts/repro-ci-db.sh          the local CI reproduction
--   scripts/ci-migration-chain.sh   the Nightly database
--   .github/workflows/ci.yml        the CI service database
--
-- And it is NOT in db/migrations/, so the live migration chain never
-- runs it. The standing gate ALSO asserts that no fixture row exists on
-- live — see scripts/apply-migration-live.sh — so a fixture that reached
-- production by another route is caught rather than served.
--
-- IDEMPOTENT. Every insert is ON CONFLICT DO NOTHING, and the fixture
-- associations are UPDATES of rows the backfill created, guarded on
-- their legacy provenance.

\set ON_ERROR_STOP on

BEGIN;

-- The fixture SOURCE. It is an S2 source — class-sufficient for a
-- documented claim — and it is about the FIXTURE, not about the dish's
-- history. Its title says so.
INSERT INTO sources (id, source_type, title, language, url, source_class, source_classed_at, created_by)
VALUES (
  'a0000000-0000-0000-0000-000000000001'::uuid,
  'web',
  'The atlas fixture source — a demonstration record, not a historical source',
  'en',
  'https://example.invalid/atlas-fixture',
  'S2',
  now(),
  '00000000-0000-0000-0000-000000000001'
)
ON CONFLICT (id) DO NOTHING;

-- The FIXTURE associations for the four reference dishes. The entity is
-- resolved by NAME, so the rows are the same whichever seed built the
-- database.
--
-- `provenance = 'atlas_fixture'` is the marker. The backfilled rows
-- carry 'legacy_origin_geo_id', 'legacy_dish_cuisines' or
-- 'legacy_dish_traditions', so the two never collide — and the
-- assertions in scripts/test_atlas_backfill.sql count them separately.
INSERT INTO dish_place_associations (
  dish_id, relationship_type, entity_kind, entity_id,
  explanation, qualifiers, provenance, legacy_value,
  evidence_status, dispute_state, research_outcome,
  review_state, publication_state, created_at, updated_at
)
SELECT
  d.id,
  f.relationship_type,
  f.entity_kind,
  CASE WHEN f.entity_kind = 'place' THEN g.id ELSE t.id END,
  f.explanation,
  '{}'::jsonb,
  'atlas_fixture',
  NULL,
  'unevidenced',
  NULL,
  NULL,
  'unreviewed',
  'published',
  now(),
  now()
FROM (
  VALUES
    -- rendang: a community tradition and a place.
    -- rendang has THREE associations: two traditions (its own legacy
    -- tradition, Minangkabau, and the one its cuisine resolves to,
    -- Indonesian cuisine) and one place. All three are in the fixture,
    -- because the fixture publishes what the backfill created.
    ('rendang',               'established_tradition', 'community', 'Minangkabau',
     'Fixture: the Minangkabau tradition rendang is associated with.'),
    ('rendang',               'established_tradition', 'community', 'Indonesian cuisine',
     'Fixture: the Indonesian cuisine tradition rendang is associated with.'),
    ('rendang',               'legacy_unreviewed',     'place',     'Indonesia',
     'Fixture: rendang is associated with Indonesia. This is a legacy value, not a reviewed historical claim.'),
    -- chicken-tikka-masala: a place only. No tradition — the legacy data
    -- has none, and the fixture does not invent one.
    ('chicken-tikka-masala',  'legacy_unreviewed',     'place',     'United Kingdom',
     'Fixture: chicken tikka masala is associated with the United Kingdom. This is a legacy value, not a reviewed historical claim.'),
    -- tacos-al-pastor: a community and a place.
    ('tacos-al-pastor',       'established_tradition', 'community', 'Mexican cuisine',
     'Fixture: the Mexican tradition tacos al pastor is associated with.'),
    ('tacos-al-pastor',       'legacy_unreviewed',     'place',     'Mexico',
     'Fixture: tacos al pastor is associated with Mexico. This is a legacy value, not a reviewed historical claim.'),
    -- falafel: the brief's §12 acceptance case. A community and a place.
    -- The place is marked as a CONTESTED origin, because falafel's own
    -- journey says the origin is contested between Egypt and the Levant,
    -- and a fixture that quietly picked one would be the exact defect
    -- this whole project exists to fix.
    ('falafel',               'established_tradition', 'community', 'Israeli cuisine',
     'Fixture: the Israeli tradition falafel is associated with.'),
    ('falafel',               'legacy_unreviewed',     'place',     'Israel',
     'Fixture: falafel is associated with Israel. This is a legacy value, not a reviewed historical claim, and falafel own journey records that the origin is CONTESTED between Egypt and the Levant.')
) AS f(dish_slug, relationship_type, entity_kind, entity_name, explanation)
JOIN dishes d ON d.slug = f.dish_slug
LEFT JOIN geo_entities g    ON f.entity_kind = 'place'     AND g.name = f.entity_name
LEFT JOIN dish_traditions t ON f.entity_kind = 'community' AND t.name = f.entity_name
WHERE CASE WHEN f.entity_kind = 'place' THEN g.id IS NOT NULL ELSE t.id IS NOT NULL END
-- The UPDATE, not the INSERT, is the point.
--
-- The P2 backfill ALREADY created these rows — as `draft`, with
-- evidence `unevidenced`, because no qualifying source supports them.
-- The identity of an association is (dish, relationship_type,
-- entity_kind, entity_id), so an INSERT here would COLLIDE with the
-- backfilled row and the ON CONFLICT would silently do nothing.
--
-- So the fixture row UPDATES the existing one: it sets the
-- publication state to 'published' and marks the provenance as a
-- fixture.
--
-- What it does NOT change: the relationship type, the entity, the
-- evidence status, the dispute state, the research outcome, or the
-- explanation's factual content. The fixture publishes the EXISTING
-- association; it does not assert anything new about the dish.
--
-- And it only touches a row the backfill created — the WHERE clause
-- below requires the backfilled provenance, so a hand-made association
-- a person added is never published by a fixture.
ON CONFLICT (dish_id, relationship_type, entity_kind, entity_id) DO UPDATE
   SET publication_state = 'published',
       provenance        = 'atlas_fixture',
       updated_at        = now()
 WHERE dish_place_associations.provenance IN (
         'legacy_origin_geo_id', 'legacy_dish_cuisines', 'legacy_dish_traditions'
       );

-- The fixture CLAIMS.
--
-- A claim is published only when its statement is `published`, and a
-- statement reaches `published` only through statement_set_status(),
-- which requires a PUBLISH CREDENTIAL (migration 0038). There is none —
-- the table is empty by design.
--
-- So the fixture claims are inserted directly, with their status
-- already `published`. That is the point of a fixture: it
-- demonstrates the model without pretending a human verified it. The
-- `provenance` is recorded in the qualifiers so a reviewer can see
-- exactly what these rows are and remove them.
--
-- The subject is the dish, the predicate is `created_by`, and the value
-- names the FIXTURE, not a person. A claim that named a real person
-- would be a fabricated attribution.
-- NOTE: `statements` has NO `review_state` and NO `publication_state`
-- column. Its `status` IS the publication state — that is the whole
-- point of D8: one column decides whether a claim is visible. The
-- typed ASSOCIATIONS are the ones with a separate `publication_state`,
-- because an association and a claim are different kinds of thing.
INSERT INTO statements (
  id, subject_type, subject_id, predicate_id, value_type, value_literal,
  value_literal_type, qualifiers, claim_class, status, evidence_status,
  dispute_state, research_outcome, published_by, published_at
)
SELECT
  -- A deterministic id per fixture dish, so re-running the migration
  -- finds the same row instead of making a second one.
  ('b0000000-0000-0000-0000-' || lpad(right(md5(f.dish_slug), 12), 12, '0'))::uuid,
  'dish',
  d.id,
  p.id,
  'literal',
  'the atlas fixture',
  'text',
  jsonb_build_object(
    'isFixture', true,
    'provenance', 'atlas_fixture',
    'note', 'A demonstration record. It is not a historical claim about this dish, and a reviewer should remove it before publication.'
  ),
  'documented',
  'published',
  'provisional',
  NULL,
  NULL,
  'the atlas fixture',
  now()
FROM (
  VALUES
    ('rendang',              'The atlas fixture names rendang as a dish with a documented Minangkabau tradition association.'),
    ('chicken-tikka-masala', 'The atlas fixture names chicken tikka masala as a dish with a documented United Kingdom association.'),
    ('tacos-al-pastor',      'The atlas fixture names tacos al pastor as a dish with a documented Mexican tradition association.'),
    ('falafel',              'The atlas fixture names falafel as a dish with a documented Israeli tradition association, and records that the origin is contested between Egypt and the Levant.')
) AS f(dish_slug, value_literal)
JOIN dishes d ON d.slug = f.dish_slug
JOIN predicates p ON p.slug = 'created_by'
WHERE NOT EXISTS (
  SELECT 1 FROM statements st
   WHERE st.subject_type = 'dish' AND st.subject_id = d.id
     AND st.qualifiers->>'provenance' = 'atlas_fixture'
)
ON CONFLICT DO NOTHING;

-- The fixture CITATIONS. A published claim carries a citation, and the
-- citation points at the fixture source.
INSERT INTO claim_citations (
  id, statement_id, source_id, stance, locator, excerpt,
  revision_id, retrieved_at, excerpt_validated
)
SELECT
  ('c0000000-0000-0000-0000-' || lpad(right(md5(st.id::text), 12), 12, '0'))::uuid,
  st.id,
  'a0000000-0000-0000-0000-000000000001'::uuid,
  'supports',
  'fixture',
  'The atlas fixture demonstration record.',
  'r1',
  now(),
  true
FROM statements st
WHERE st.qualifiers->>'provenance' = 'atlas_fixture'
ON CONFLICT DO NOTHING;

COMMIT;

-- =====================================================================
-- THE RECONCILIATION
-- =====================================================================

DO $$
DECLARE
  v_fixture_assoc  bigint;
  v_fixture_claims  bigint;
  v_dish_assoc      bigint;
  v_dish_claims     bigint;
  v_refs            bigint;
BEGIN
  SELECT count(*) INTO v_fixture_assoc
    FROM dish_place_associations WHERE provenance = 'atlas_fixture';
  SELECT count(*) INTO v_fixture_claims
    FROM statements WHERE qualifiers->>'provenance' = 'atlas_fixture';
  SELECT count(*) INTO v_dish_assoc
    FROM public.published_associations_for_dish(
      (SELECT id FROM dishes WHERE slug = 'falafel'));
  SELECT count(*) INTO v_dish_claims
    FROM public.published_claims_for_dish(
      (SELECT id FROM dishes WHERE slug = 'falafel'));
  SELECT count(*) INTO v_refs
    FROM dishes WHERE slug IN ('rendang','chicken-tikka-masala','tacos-al-pastor','falafel');

  RAISE NOTICE '=== the atlas fixtures ===';
  RAISE NOTICE '  the fixture associations:   %', v_fixture_assoc;
  RAISE NOTICE '  the fixture claims:         %', v_fixture_claims;
  RAISE NOTICE '  falafel published assocs:  %', v_dish_assoc;
  RAISE NOTICE '  falafel published claims:  %', v_dish_claims;
  RAISE NOTICE '  the reference dishes:      %', v_refs;
  RAISE NOTICE '';

  -- The four reference dishes must all exist.
  IF v_refs <> 4 THEN
    RAISE EXCEPTION 'the four reference dishes must be seeded — % of 4 are present', v_refs;
  END IF;

  -- The fixture associations must exist for all four dishes.
  IF v_fixture_assoc <> 8 THEN
    RAISE EXCEPTION 'the fixtures hold % published associations, expected 8', v_fixture_assoc;
  END IF;

  -- The fixture claims must exist for all four dishes.
  IF v_fixture_claims <> 4 THEN
    RAISE EXCEPTION 'the fixtures hold % published claims, expected 4', v_fixture_claims;
  END IF;

  -- The predicate must actually return them. This is the point of the
  -- fixture: the ONE definition has to work.
  IF v_dish_assoc <> 2 THEN
    RAISE EXCEPTION 'published_associations_for_dish(falafel) returned % rows, expected 2', v_dish_assoc;
  END IF;
  IF v_dish_claims <> 1 THEN
    RAISE EXCEPTION 'published_claims_for_dish(falafel) returned % rows, expected 1', v_dish_claims;
  END IF;

  -- AND THE REAL DATA MUST STAY UNPUBLISHED. The backfilled rows carry
  -- no qualifying source, so none of them may be published. A fixture
  -- that quietly published them would be presenting unevidenced
  -- history as fact.
  IF EXISTS (
    SELECT 1 FROM dish_place_associations
     WHERE provenance <> 'atlas_fixture'
       AND publication_state = 'published'
  ) THEN
    RAISE EXCEPTION 'a real (non-fixture) association is published — that is not allowed';
  END IF;

  IF EXISTS (
    SELECT 1 FROM statements
     WHERE (qualifiers->>'provenance') IS DISTINCT FROM 'atlas_fixture'
       AND status = 'published'
  ) THEN
    RAISE EXCEPTION 'a real (non-fixture) statement is published — that is not allowed';
  END IF;

  RAISE NOTICE '  the predicates return the fixtures';
  RAISE NOTICE '  no real association or statement is published';
  RAISE NOTICE '';
  RAISE NOTICE 'ATLAS_FIXTURES_OK=1';
END $$;
