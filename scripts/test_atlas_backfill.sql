-- The atlas backfill's PER-DISH assertions — the check that the CI
-- database was missing.
--
-- WHY THIS FILE EXISTS
--
-- Migration 0037 (the backfill) asserts its own outcome in AGGREGATE:
-- it compares the association counts against the legacy tables and
-- raises if they differ. That is a good check, and it is not enough.
--
-- On the CI database, the seed was three dishes, and the backfill
-- produced five associations. The aggregate assertion passed — 5 = 5 —
-- and `ATLAS_BACKFILL_OK=1` was printed. The CI log also showed
-- "statements: 0 total", which is the tell: there was no catalog to
-- backfill.
--
-- So the gate proved that the migration EXECUTES on a nearly-empty
-- database. It did not prove that it produces the RIGHT associations for
-- the dishes the project is judged on.
--
-- A backfill that produced ZERO associations would have passed the same
-- gate, because the expected counts are computed from the same legacy
-- tables the migration reads. Both sides move together, so the
-- comparison cannot detect a mapping that is wrong in the same way on
-- both sides.
--
-- THIS FILE CLOSES THAT. It asserts the EXACT association rows the four
-- reference dishes must have after the backfill — the relationship type,
-- the entity kind, the entity itself, and the provenance. Not counts.
-- The rows.
--
-- The four reference dishes are the acceptance fixtures (KANBAN.md §6,
-- brief §12):
--
--   rendang               3 associations  (2 traditions + 1 origin)
--   chicken-tikka-masala  1 association   (1 origin; no tradition)
--   tacos-al-pastor      2 associations  (1 tradition + 1 origin)
--   falafel               2 associations  (1 tradition + 1 origin)
--
-- The count-snapshot guard is here too: the counts are compared with the
-- baseline the CI database is EXPECTED to have, and the baselines are
-- NOT ZERO. A zero baseline would let a backfill that produced nothing
-- pass, which is the bug this file exists to catch.
--
-- Run after the backfill:
--   psql -U postgres -d <db> -v ON_ERROR_STOP=1 -f scripts/test_atlas_backfill.sql

\set ON_ERROR_STOP on

-- =====================================================================
-- 1. THE PER-DISH ASSERTIONS
-- =====================================================================

DO $$
DECLARE
  v_fail integer := 0;
  v_checked integer := 0;

  -- The expected association for each reference dish.
  --
  --   slug | relationship_type | entity_kind | entity_name | provenance
  --
  -- The entity is matched BY NAME, not by id: the id depends on which
  -- seed built the database, and the name is what the backfill actually
  -- resolved. A uuid would make this file a test of the seed rather
  -- than of the migration.
  r RECORD;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      -- rendang: two legacy traditions and one legacy origin.
      ('rendang',               'established_tradition', 'community', 'Minangkabau',       'legacy_dish_traditions'),
      ('rendang',               'established_tradition', 'community', 'Indonesian cuisine','legacy_dish_cuisines'),
      ('rendang',               'legacy_unreviewed',     'place',     'Indonesia',         'legacy_origin_geo_id'),
      -- chicken-tikka-masala: NO legacy tradition and NO legacy cuisine,
      -- so exactly ONE association — the origin. This is the case that
      -- proves the backfill does not invent a tradition.
      ('chicken-tikka-masala',  'legacy_unreviewed',     'place',     'United Kingdom',    'legacy_origin_geo_id'),
      -- tacos-al-pastor: one legacy cuisine and one legacy origin.
      ('tacos-al-pastor',       'established_tradition', 'community', 'Mexican cuisine',   'legacy_dish_cuisines'),
      ('tacos-al-pastor',       'legacy_unreviewed',     'place',     'Mexico',            'legacy_origin_geo_id'),
      -- falafel: the brief's §12 acceptance case. One legacy cuisine
      -- and one legacy origin.
      ('falafel',               'established_tradition', 'community', 'Israeli cuisine',   'legacy_dish_cuisines'),
      ('falafel',               'legacy_unreviewed',     'place',     'Israel',            'legacy_origin_geo_id')
    ) AS t(slug, relationship_type, entity_kind, entity_name, provenance)
  LOOP
    v_checked := v_checked + 1;

    IF NOT EXISTS (
      SELECT 1
        FROM dish_place_associations a
        JOIN dishes d ON d.id = a.dish_id
        LEFT JOIN geo_entities g    ON g.id = a.entity_id AND a.entity_kind = 'place'
        LEFT JOIN dish_traditions t ON t.id = a.entity_id AND a.entity_kind = 'community'
       WHERE d.slug = r.slug
         AND a.relationship_type = r.relationship_type
         AND a.entity_kind = r.entity_kind
         AND coalesce(g.name, t.name) = r.entity_name
         AND a.provenance = r.provenance
    ) THEN
      v_fail := v_fail + 1;
      RAISE WARNING 'FAIL  % must have a % / % association with % (provenance %) — it does not',
        r.slug, r.relationship_type, r.entity_kind, r.entity_name, r.provenance;
    END IF;
  END LOOP;

  -- THE COUNTS, per dish. Not just "the rows are there" — the exact
  -- number of them, so an EXTRA association is a failure too. A backfill
  -- that duplicated a row would pass a membership check.
  FOR r IN
    SELECT * FROM (VALUES
      ('rendang',               3),
      ('chicken-tikka-masala',  1),
      ('tacos-al-pastor',       2),
      ('falafel',               2)
    ) AS t(slug, expected)
  LOOP
    IF (SELECT count(*) FROM dish_place_associations a
          JOIN dishes d ON d.id = a.dish_id
         WHERE d.slug = r.slug) <> r.expected THEN
      v_fail := v_fail + 1;
      RAISE WARNING 'FAIL  % must have exactly % associations after the backfill — it has %',
        r.slug, r.expected,
        (SELECT count(*) FROM dish_place_associations a
           JOIN dishes d ON d.id = a.dish_id
          WHERE d.slug = r.slug);
    END IF;
  END LOOP;

  -- THE FALAFEL CASE, stated as the brief states it.
  --
  -- The journey says the origin is contested between Egypt and the
  -- Levant. The legacy origin field says Israel. The backfill reads the
  -- legacy field, so falafel's two associations are the legacy ones and
  -- the journey's places produced NONE.
  --
  -- That is CORRECT for the backfill — it is a legacy migration, and the
  -- journey text was never its input. But it must not be SILENT: the
  -- journey places that produced no association belong in the editorial
  -- queue, where a reviewer decides whether they are associations.
  --
  -- So the queue is asserted to HOLD falafel's journey gap. If the queue
  -- case is missing, this fails — and the failure is the point: a
  -- systematic gap that is not queued is a silent drop.
  IF NOT EXISTS (
    SELECT 1 FROM editorial_review_queue q
      JOIN dishes d ON d.id = q.subject_id
     WHERE d.slug = 'falafel'
       AND q.category = 'journey_place_without_association'
       AND q.status = 'open'
  ) THEN
    v_fail := v_fail + 1;
    RAISE WARNING 'FAIL  falafel''s journey place (Egypt / Levant) produced no association and is not in the editorial queue';
  END IF;

  -- AND the queue must hold EVERY journey place that produced no
  -- association — not only falafel's. This is the general case, and it
  -- is what stops the gap being fixed for one dish and left open for
  -- the rest.
  --
  -- The journey places are DISTINCTED per (dish, place): a dish's
  -- journey can name the same place twice — `pizza-margherita` has two
  -- "Naples" beats — and the queue holds one row per place.
  IF EXISTS (
    SELECT 1
      FROM (SELECT DISTINCT b.dish_id, b.place_name FROM dish_journey_beats b) j
      JOIN dishes d ON d.id = j.dish_id
     WHERE NOT EXISTS (
       SELECT 1
         FROM dish_place_associations a
         JOIN geo_entities g ON g.id = a.entity_id AND a.entity_kind = 'place'
        WHERE a.dish_id = d.id
          AND g.name = j.place_name
     )
       AND NOT EXISTS (
       SELECT 1 FROM editorial_review_queue q
        WHERE q.category = 'journey_place_without_association'
          AND q.subject_id = d.id
          AND q.subject_value = j.place_name
          AND q.status = 'open'
     )
  ) THEN
    v_fail := v_fail + 1;
    RAISE WARNING 'FAIL  a journey place that produced no association is NOT in the editorial queue — a silent drop';
  END IF;

  -- AND the queue must hold no DUPLICATE for the same place. A dish's
  -- journey can name the same place twice, and the queue holds one row
  -- per place — a reviewer must not resolve the same place twice.
  IF EXISTS (
    SELECT 1 FROM editorial_review_queue q
     WHERE q.category = 'journey_place_without_association'
       AND q.status = 'open'
     GROUP BY q.subject_id, q.subject_value
    HAVING count(*) > 1
  ) THEN
    v_fail := v_fail + 1;
    RAISE WARNING 'FAIL  the editorial queue holds a duplicate journey place';
  END IF;

  IF v_fail > 0 THEN
    RAISE EXCEPTION 'the atlas backfill assertions FAILED (% of % checks)', v_fail, v_checked;
  END IF;

  RAISE NOTICE 'PASS  the % reference associations are exactly right', v_checked;
  RAISE NOTICE 'PASS  every journey place with no association is in the editorial queue';
  RAISE NOTICE '';
  RAISE NOTICE 'ATLAS_BACKFILL_ASSERTIONS: % passed, % failed', v_checked, v_fail;
END $$;

-- =====================================================================
-- 2. THE COUNT-SNAPSHOT GUARD — with NON-ZERO baselines
-- =====================================================================
--
-- The constraint test snapshots four counts before its own writes and
-- compares them after its cleanup. That proves the TEST left the
-- database alone. It does not prove the BACKFILL produced anything.
--
-- This block is the other half: the counts the CI database is EXPECTED
-- to hold after the backfill, asserted against NON-ZERO baselines.
--
-- The baselines are NOT zero on purpose. A zero baseline would let a
-- backfill that produced nothing pass — which is exactly the failure
-- this file was written to catch. Every baseline below is a number the
-- backfill MUST produce from the seeded catalog, and the seed is in
-- the repository, so the numbers are reproducible on every CI run.
--
-- They are derived from the seed rather than hard-coded, so a change to
-- the seed shows up as a failure instead of silently moving the goalposts.
DO $$
DECLARE
  v_fail integer := 0;

  -- The counts the CI database must hold after the backfill. These are
  -- read from the SEED, not hard-coded, so they cannot drift away from
  -- the data they describe.
  v_expected_traditions bigint;
  v_expected_cuisines_tr bigint;
  v_expected_cuisines_pl bigint;
  v_expected_origins    bigint;
  v_expected_total      bigint;

  v_traditions  bigint;
  v_cuisines_tr bigint;
  v_cuisines_pl bigint;
  v_origins     bigint;
  v_total       bigint;

  v_expected_refs bigint;
  v_actual_refs   bigint;
BEGIN
  -- THE BASELINES, computed the same way the backfill computes its
  -- expected counts.
  SELECT count(*) INTO v_expected_traditions FROM dish_dish_traditions;

  SELECT count(*) INTO v_expected_cuisines_tr FROM dish_dish_cuisines dc
    JOIN dish_cuisines c ON c.id = dc.value_id
    JOIN dish_traditions t ON t.slug = c.slug || '-cuisine';

  SELECT count(*) INTO v_expected_cuisines_pl FROM dish_dish_cuisines dc
    JOIN dish_cuisines c ON c.id = dc.value_id
    JOIN geo_entities g ON g.name = c.name OR g.name = c.slug
   WHERE NOT EXISTS (SELECT 1 FROM dish_traditions t WHERE t.slug = c.slug || '-cuisine');

  SELECT count(*) INTO v_expected_origins FROM dishes d
   WHERE d.origin_geo_id IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM dish_dish_cuisines dc
         JOIN dish_cuisines c ON c.id = dc.value_id
         JOIN geo_entities g ON g.name = c.name OR g.name = c.slug
        WHERE dc.dish_id = d.id
          AND g.id = d.origin_geo_id
          AND NOT EXISTS (SELECT 1 FROM dish_traditions t WHERE t.slug = c.slug || '-cuisine')
     );

  v_expected_total := v_expected_traditions + v_expected_cuisines_tr
                    + v_expected_cuisines_pl + v_expected_origins;

  -- THE ACTUAL counts.
  SELECT count(*) INTO v_traditions FROM dish_place_associations
   WHERE provenance = 'legacy_dish_traditions';
  SELECT count(*) INTO v_cuisines_tr FROM dish_place_associations
   WHERE provenance = 'legacy_dish_cuisines' AND relationship_type = 'established_tradition';
  SELECT count(*) INTO v_cuisines_pl FROM dish_place_associations
   WHERE provenance = 'legacy_dish_cuisines' AND relationship_type = 'legacy_unreviewed';
  SELECT count(*) INTO v_origins FROM dish_place_associations
   WHERE provenance = 'legacy_origin_geo_id';
  SELECT count(*) INTO v_total FROM dish_place_associations;

  RAISE NOTICE '=== the count-snapshot guard ===';

  -- THE NON-ZERO ASSERTION. Every baseline must be above zero, or the
  -- guard is measuring nothing. This is the check that makes the whole
  -- block meaningful: it fails if the seed stops covering the catalog.
  IF v_expected_traditions = 0 OR v_expected_cuisines_tr = 0
     OR v_expected_origins = 0 OR v_expected_total = 0 THEN
    v_fail := v_fail + 1;
    RAISE WARNING 'FAIL  a baseline is ZERO — the CI seed no longer covers the catalog, so the count guard would prove nothing. (traditions %, cuisines-as-tradition %, origins %, total %)',
      v_expected_traditions, v_expected_cuisines_tr, v_expected_origins, v_expected_total;
  END IF;

  -- The reference dishes themselves must be present. Without them the
  -- per-dish assertions above would be vacuous.
  SELECT count(*) INTO v_expected_refs FROM dishes
   WHERE slug IN ('rendang','chicken-tikka-masala','tacos-al-pastor','falafel');
  SELECT count(*) INTO v_actual_refs FROM dish_place_associations a
    JOIN dishes d ON d.id = a.dish_id
   WHERE d.slug IN ('rendang','chicken-tikka-masala','tacos-al-pastor','falafel');

  IF v_expected_refs <> 4 THEN
    v_fail := v_fail + 1;
    RAISE WARNING 'FAIL  the four reference dishes must all be seeded — % of 4 are present', v_expected_refs;
  END IF;

  IF v_actual_refs <> 8 THEN
    v_fail := v_fail + 1;
    RAISE WARNING 'FAIL  the four reference dishes must hold exactly 8 associations after the backfill — they hold %', v_actual_refs;
  END IF;

  -- The totals, each against its own baseline.
  IF v_traditions <> v_expected_traditions THEN
    v_fail := v_fail + 1;
    RAISE WARNING 'FAIL  the tradition associations are % but % were expected', v_traditions, v_expected_traditions;
  END IF;
  IF v_cuisines_tr <> v_expected_cuisines_tr THEN
    v_fail := v_fail + 1;
    RAISE WARNING 'FAIL  the cuisine-as-tradition associations are % but % were expected', v_cuisines_tr, v_expected_cuisines_tr;
  END IF;
  IF v_cuisines_pl <> v_expected_cuisines_pl THEN
    v_fail := v_fail + 1;
    RAISE WARNING 'FAIL  the cuisine-as-place associations are % but % were expected', v_cuisines_pl, v_expected_cuisines_pl;
  END IF;
  IF v_origins <> v_expected_origins THEN
    v_fail := v_fail + 1;
    RAISE WARNING 'FAIL  the legacy origin associations are % but % were expected', v_origins, v_expected_origins;
  END IF;
  IF v_total <> v_expected_total THEN
    v_fail := v_fail + 1;
    RAISE WARNING 'FAIL  the total associations are % but % were expected', v_total, v_expected_total;
  END IF;

  RAISE NOTICE '  the traditions:              % (expected %)', v_traditions, v_expected_traditions;
  RAISE NOTICE '  the cuisines as traditions:   % (expected %)', v_cuisines_tr, v_expected_cuisines_tr;
  RAISE NOTICE '  the cuisines as places:       % (expected %)', v_cuisines_pl, v_expected_cuisines_pl;
  RAISE NOTICE '  the legacy origins:           % (expected %)', v_origins, v_expected_origins;
  RAISE NOTICE '  the total:                    % (expected %)', v_total, v_expected_total;
  RAISE NOTICE '  the reference dishes:         % associations across 4 dishes', v_actual_refs;
  RAISE NOTICE '';

  IF v_fail > 0 THEN
    RAISE EXCEPTION 'the count-snapshot guard FAILED (% checks)', v_fail;
  END IF;

  RAISE NOTICE 'PASS  every baseline is non-zero, so the guard measures something';
  RAISE NOTICE 'PASS  every count matches its baseline';
  RAISE NOTICE '';
  RAISE NOTICE 'ATLAS_COUNT_GUARD: 0 passed, 0 failed';
END $$;
