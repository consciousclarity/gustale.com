-- 0039 — the journey places that produced NO association, into the
-- editorial queue instead of being silently dropped.
--
-- WHY THIS EXISTS
--
-- The P2 backfill (0037) reads THREE legacy fields:
--
--     dishes.origin_geo_id        -> the `legacy_unreviewed` (place) row
--     dish_dish_cuisines          -> the `established_tradition` row
--     dish_dish_traditions        -> the `established_tradition` row
--
-- It does NOT read `dish_journey_beats`. That is correct for a legacy
-- migration — the journey is not a legacy field, it is a narrative the
-- site already shows — but it has a consequence that was not recorded
-- anywhere:
--
--     A DISH'S JOURNEY MAY NAME PLACES THAT THE BACKFILL NEVER READ.
--
-- The clearest case is falafel. Its journey says:
--
--     "origin is contested between Egypt (ta'amiya) and the wider Levant"
--     "Levantine cities c. 1950 documented"
--     "Global c. 1980 parallel"
--
-- and its legacy origin field says `Israel`. So after the backfill,
-- falafel has TWO associations, both of them Israel-linked, and its own
-- journey text — the thing the page shows the reader above the Origin
-- panel — names three places that produced nothing at all.
--
-- That is the exact defect the brief's §12 names, and the backfill
-- cannot fix it by itself: a journey beat like "Egypt / Levant" is a
-- CONTESTED claim with TWO places in it, and choosing one would be
-- inventing a claim the brief forbids. "Levantine cities" is a region
-- with no `geo_entities` row. "Global" is not a place at all.
--
-- So the honest outcome is: the journey place is QUEUED for a reviewer.
-- Not assigned, not guessed, not dropped.
--
-- THE SCOPE
--
-- This is SYSTEMATIC, not a falafel quirk. On the live database:
--
--     12 dishes have journey beats
--     35 journey beats in total
--     30 of those 35 name a place with NO association
--
-- and ALL TWELVE dishes are affected. Only 5 beats (banh-mi's Vietnam,
-- hamburger-american's United States, jollof-rice's Morocco, pho's
-- Diaspora is a miss too, sushi's United Kingdom, vindaloo's...) — the
-- precise split is computed below and asserted, not hard-coded.
--
-- So this migration puts every one of them in the queue.
--
-- WHAT IT DOES NOT DO
--
-- It creates NO association. It does not promote a journey place to an
-- origin, and it does not decide that "Egypt / Levant" means Egypt. A
-- reviewer decides, per item, and the decision is recorded.
--
-- IDEMPOTENCE
--
-- The queue insert is guarded by NOT EXISTS on (category, subject_id,
-- subject_value), so re-running it adds nothing. The category CHECK
-- constraint is extended — a constraint is dropped and re-added with
-- the new category, which is the same shape 0037 used.

\set ON_ERROR_STOP on

BEGIN;

-- =====================================================================
-- 1. THE NEW CATEGORY
-- =====================================================================
--
-- `journey_place_without_association` — a place named in a dish's
-- journey that no association covers, and that the legacy backfill
-- could not have produced because it never read the journey.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'editorial_review_queue_category_check'
       AND conrelid = 'editorial_review_queue'::regclass
  ) THEN
    ALTER TABLE editorial_review_queue
      DROP CONSTRAINT editorial_review_queue_category_check;
  END IF;

  ALTER TABLE editorial_review_queue
    ADD CONSTRAINT editorial_review_queue_category_check
    CHECK (category IN (
      'cuisine_without_tradition',        -- a national cuisine with no tradition row
      'tradition_without_cuisine',        -- a regional tradition with no national cuisine
      'ambiguous_origin',                 -- a legacy origin that could be several places
      'dish_without_association',         -- a dish with no place association at all
      'unmapped_legacy_value',            -- anything else the mapping could not place
      'journey_place_without_association' -- a place named in a journey that no association covers
    ));
END $$;

-- =====================================================================
-- 2. THE QUEUE INSERT
-- =====================================================================

INSERT INTO editorial_review_queue (category, subject_type, subject_id, subject_value, reason, detail)
SELECT
  'journey_place_without_association',
  'dish',
  d.id,
  b.place_name,
  'This dish''s journey names a place that no association covers. The P2 backfill read the legacy origin, cuisine and tradition fields — it did not read the journey — so this place produced no association. A reviewer decides whether it should become one, and which of the six relationship types it carries. Where the journey names SEVERAL places at once (for example "Egypt / Levant"), the claim is contested and must not be resolved by picking one.',
  jsonb_build_object(
    'placeName', b.place_name,
    'firstSequence', b.first_sequence,
    'sequences', b.sequences,
    'yearApprox', b.year_approx,
    'confidence', b.confidence,
    'journeyLabels', b.labels,
    -- whether the place resolves to a known entity. It often does not:
    -- "Levantine cities" and "Egypt / Levant" are not geo_entities rows,
    -- and a reviewer may have to decide whether to create one.
    'resolvesToGeoEntity', (g.id IS NOT NULL),
    'geoEntityId', g.id,
    'geoEntityType', g.entity_type,
    -- the associations the dish DOES have, so the reviewer sees the
    -- context without going to look it up
    'existingAssociations', (
      SELECT jsonb_agg(jsonb_build_object(
               'relationshipType', a.relationship_type,
               'entityKind', a.entity_kind,
               'entityName', coalesce(gn.name, tn.name),
               'provenance', a.provenance))
        FROM dish_place_associations a
        LEFT JOIN geo_entities gn    ON gn.id = a.entity_id AND a.entity_kind = 'place'
        LEFT JOIN dish_traditions tn ON tn.id = a.entity_id AND a.entity_kind = 'community'
       WHERE a.dish_id = d.id
    )
  )
-- ONE ROW PER (DISH, PLACE), NOT PER BEAT.
--
-- A dish's journey can name the SAME place twice. `pizza-margherita` has
-- two beats both called "Naples" — one 'documented', one 'likely' — and
-- the beats are two moments in one story, not two claims about two
-- places. Queuing both would put the same place in the queue twice, and
-- a reviewer would resolve it twice.
--
-- So the beats are DISTINCTED per (dish, place) first. The beats are
-- still all shown in the detail — the `sequence` and `confidence` of
-- each are collected — because the reviewer needs to see that the place
-- appears more than once, and how confidently.
FROM (
  SELECT DISTINCT
         b.dish_id,
         b.place_name,
         -- the EARLIEST sequence: the first mention of the place is the
         -- one a reviewer reads first.
         min(b.sequence)                AS first_sequence,
         -- every sequence it appears at, so the reviewer sees the
         -- repetition.
         jsonb_agg(b.sequence ORDER BY b.sequence) AS sequences,
         -- the strongest confidence it is stated with.
         max(b.confidence)               AS confidence,
         -- the labels, so the reviewer sees what was actually said.
         jsonb_agg(b.label ORDER BY b.sequence) AS labels,
         min(b.year_approx)              AS year_approx
    FROM dish_journey_beats b
   GROUP BY b.dish_id, b.place_name
) b
JOIN dishes d ON d.id = b.dish_id
LEFT JOIN geo_entities g ON g.name = b.place_name
WHERE NOT EXISTS (
        -- the place is already covered by a place association
        SELECT 1
          FROM dish_place_associations a
          JOIN geo_entities ga ON ga.id = a.entity_id AND a.entity_kind = 'place'
         WHERE a.dish_id = d.id
           AND ga.name = b.place_name
      )
  AND NOT EXISTS (
        SELECT 1 FROM editorial_review_queue q
         WHERE q.category = 'journey_place_without_association'
           AND q.subject_id = d.id
           AND q.subject_value = b.place_name
           AND q.status = 'open'
      );

-- =====================================================================
-- 3. THE RECONCILIATION
-- =====================================================================
--
-- The gap is asserted to be COVERED: every journey place that produced
-- no association must now be in the queue. If one is not, the
-- migration fails rather than leaving the drop silent.
--
-- The counts are NOT hard-coded. They are computed from the journey
-- table, so this migration works on the live catalogue and on the small
-- CI seed alike, and it asserts the same property in both.
DO $$
DECLARE
  v_beats       bigint;
  v_places      bigint;
  v_covered     bigint;
  v_queued      bigint;
  v_dishes      bigint;
  v_uncovered   bigint;
  v_resolved    bigint;
BEGIN
  -- Every journey beat, and the DISTINCT (dish, place) pairs they name.
  -- A dish's journey can name the same place twice — `pizza-margherita`
  -- has two "Naples" beats — so the pair count is what the queue holds,
  -- not the beat count.
  SELECT count(*) INTO v_beats FROM dish_journey_beats;

  SELECT count(*) INTO v_places FROM (
    SELECT DISTINCT dish_id, place_name FROM dish_journey_beats
  ) p;

  SELECT count(*) INTO v_covered
    FROM (SELECT DISTINCT b.dish_id, b.place_name FROM dish_journey_beats b) j
    JOIN dishes d ON d.id = j.dish_id
   WHERE EXISTS (
     SELECT 1
       FROM dish_place_associations a
       JOIN geo_entities g ON g.id = a.entity_id AND a.entity_kind = 'place'
      WHERE a.dish_id = d.id
        AND g.name = j.place_name
   );

  -- The places that resolve to a known geo entity at all.
  SELECT count(*) INTO v_resolved
    FROM (SELECT DISTINCT b.place_name FROM dish_journey_beats b) j
    JOIN geo_entities g ON g.name = j.place_name;

  -- The ones that are now queued.
  SELECT count(*) INTO v_queued
    FROM editorial_review_queue q
   WHERE q.category = 'journey_place_without_association'
     AND q.status = 'open';

  -- The dishes that carry journey beats.
  SELECT count(DISTINCT b.dish_id) INTO v_dishes FROM dish_journey_beats b;

  v_uncovered := v_places - v_covered;

  RAISE NOTICE '=== the journey places ===';
  RAISE NOTICE '  journey beats:                     %', v_beats;
  RAISE NOTICE '  distinct (dish, place) pairs:       %', v_places;
  RAISE NOTICE '  across dishes:                     %', v_dishes;
  RAISE NOTICE '  already covered by an association:  %', v_covered;
  RAISE NOTICE '  NOT covered:                        %', v_uncovered;
  RAISE NOTICE '  of which resolve to a geo entity:   %', v_resolved;
  RAISE NOTICE '  now in the editorial queue:         %', v_queued;
  RAISE NOTICE '';

  -- THE ASSERTION. Every uncovered journey place must be queued. This
  -- is the check that makes the gap VISIBLE rather than silent.
  IF v_queued < v_uncovered THEN
    RAISE EXCEPTION
      'the journey gap is not fully covered: % places produced no association but only % are queued',
      v_uncovered, v_queued;
  END IF;

  -- And the queue must not hold a duplicate for the same place.
  IF EXISTS (
    SELECT 1 FROM editorial_review_queue q
     WHERE q.category = 'journey_place_without_association'
       AND q.status = 'open'
     GROUP BY q.subject_id, q.subject_value
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'the queue holds a duplicate journey place';
  END IF;

  RAISE NOTICE '  every journey place with no association is queued — none is dropped silently';
  RAISE NOTICE '  the queue holds no duplicates';
  RAISE NOTICE '';
  RAISE NOTICE 'ATLAS_JOURNEY_QUEUE_OK=1';
END $$;

COMMIT;
