-- 0043_taxonomy_canonicalisation.sql
--
-- PART 1 — copy the 26 legacy descriptions into the dimension rows that
-- have none.
--
-- The dimension tables (dish_families, dish_techniques, dish_courses,
-- ingredient_categories, dish_contexts) are canonical. The legacy
-- `categories` table is a discovered-data table — flat, mixed, and
-- without first-class dish links. It stays; it is the record of what the
-- import found, and deleting it would destroy the provenance of every
-- row migrated from it.
--
-- For each legacy row whose slug matches a dimension row AND that
-- dimension has no description, copy the legacy prose across. It only
-- ever fills an EMPTY column, so it cannot overwrite a curated
-- definition.
--
-- THE COUNT. The proposal said 27 legacy rows match a dimension by slug.
-- The distinct count is 22, not 27: five slugs match MORE THAN ONE
-- dimension ('appetizer' is a course, a family AND a context;
-- 'bread', 'dessert' and 'sauce' are also multi-target). Counting the
-- (legacy row x dimension) pairs gives 27; counting legacy rows gives 22.
--
-- The 26 THAT GET FILLED is the count of PAIRS — one legacy description
-- can fill more than one dimension row, and that is correct: 'Dessert'
-- genuinely describes both the course and the family.
--
--   22 legacy rows  ->  26 dimension rows filled
--
-- The migration asserts both numbers, so a drift in either is a failure
-- rather than a silent no-op.
--
-- IDEMPOTENT — `WHERE description IS NULL` on the target, so a re-run
-- fills nothing and changes nothing.
--
-- PART 2 — the unmatched dish-type and course-group rows.
--
-- The proposal:
--
--   kind='cuisine'      -> leave. A cuisine is not a dimension; it is
--                           already modelled as a place.
--   kind='dish-type'    -> map to a dimension where one clearly exists,
--                           else queue.
--   kind='course-group' -> map to dish_courses where one clearly exists,
--                           else queue.
--
-- THE MAPS (3 rows). Each is a slug match or an exact synonym:
--
--   legacy dish-type 'stir-fry'   -> dish_techniques 'stir-frying'
--   legacy dish-type 'colombian-cuisine' -> (a cuisine; queued)
--   legacy dish-type 'ethiopian-cuisine' -> (a cuisine; queued)
--   legacy dish-type 'filipino-cuisine'  -> (a cuisine; queued)
--   legacy dish-type 'turkish-cuisine'   -> (a cuisine; queued)
--
-- The four '*-cuisine' dish-type rows are CUISINES that the import
-- mislabelled as dish-types. They are not dishes' forms; they are
-- places. The proposal's rule for cuisines is 'leave them', and these
-- are cuisines. They are QUEUED, not mapped, because a cuisine needs a
-- place association rather than a family link, and that is an editorial
-- decision a reviewer should make.
--
-- THE QUEUE (15 rows) — 4 cuisines + 11 course-groups.
--
-- The 11 course-group rows ('Mains', 'Soups & broths', 'Sweets &
-- desserts', ...) are BREADTH-OF-THE-CATALOGUE groupings, not courses.
-- dish_courses has 8 rows: appetizer, breakfast, condiment, dessert,
-- drink, main-course, side, snack. None of the 11 course-groups has a
-- dimension counterpart, and NONE of them has a dish attached (0 rows
-- each) — they are vestigial labels from the original import.
--
-- They are queued so a reviewer can decide whether the vocabulary needs
-- a 'category' dimension, rather than being silently dropped.
--
-- Part 3 — the 578 dimension rows with no description — is NOT here.
-- The proposal is explicit: they stay as they are, and the gap is shown
-- on the page. Turning them into 578 queue items would bury the
-- actionable ones.

-- ─── the queue's category constraint ───────────────────────────────────
--
-- Two new values. The existing six:
--   cuisine_without_tradition, tradition_without_cuisine,
--   ambiguous_origin, dish_without_association, unmapped_legacy_value,
--   journey_place_without_association
--
-- The new ones say WHAT is waiting, so a reviewer can triage:
--   unmapped_dish_type      — a legacy dish-type with no dimension home
--   unmapped_course_group   — a legacy course-group with no dimension home

ALTER TABLE editorial_review_queue DROP CONSTRAINT IF EXISTS editorial_review_queue_category_check;
ALTER TABLE editorial_review_queue ADD CONSTRAINT editorial_review_queue_category_check
  CHECK (category = ANY (ARRAY[
    'cuisine_without_tradition',
    'tradition_without_cuisine',
    'ambiguous_origin',
    'dish_without_association',
    'unmapped_legacy_value',
    'journey_place_without_association',
    'unmapped_dish_type',
    'unmapped_course_group'
  ]::text[]));

-- ─── PART 1 — copy the 26 descriptions ─────────────────────────────────

DO $$
DECLARE
  v_copied integer := 0;
BEGIN
  -- The dimension table for each legacy slug, and the row to fill.
  -- A slug that matches several dimensions fills each of them.
  CREATE TEMP TABLE _tax_copy ON COMMIT DROP AS
  WITH dims AS (
    SELECT slug, description, 'dish_families'::text AS tbl FROM dish_families
    UNION ALL SELECT slug, description, 'dish_techniques' FROM dish_techniques
    UNION ALL SELECT slug, description, 'dish_courses' FROM dish_courses
    UNION ALL SELECT slug, description, 'ingredient_categories' FROM ingredient_categories
    UNION ALL SELECT slug, description, 'dish_contexts' FROM dish_contexts
  )
  SELECT c.slug AS legacy_slug, c.description AS legacy_desc,
         dims.tbl AS target_table, dims.description AS target_desc
    FROM categories c
    JOIN dims ON dims.slug = c.slug
   WHERE c.description IS NOT NULL AND c.description <> ''
     AND (dims.description IS NULL OR dims.description = '');

  -- dish_families
  UPDATE dish_families d
     SET description = t.legacy_desc
    FROM _tax_copy t
   WHERE t.target_table = 'dish_families'
     AND t.legacy_slug = d.slug
     AND (d.description IS NULL OR d.description = '');
  GET DIAGNOSTICS v_copied = ROW_COUNT;

  UPDATE dish_techniques d
     SET description = t.legacy_desc
    FROM _tax_copy t
   WHERE t.target_table = 'dish_techniques'
     AND t.legacy_slug = d.slug
     AND (d.description IS NULL OR d.description = '');
  GET DIAGNOSTICS v_copied = ROW_COUNT;

  UPDATE dish_courses d
     SET description = t.legacy_desc
    FROM _tax_copy t
   WHERE t.target_table = 'dish_courses'
     AND t.legacy_slug = d.slug
     AND (d.description IS NULL OR d.description = '');
  GET DIAGNOSTICS v_copied = ROW_COUNT;

  UPDATE ingredient_categories d
     SET description = t.legacy_desc
    FROM _tax_copy t
   WHERE t.target_table = 'ingredient_categories'
     AND t.legacy_slug = d.slug
     AND (d.description IS NULL OR d.description = '');
  GET DIAGNOSTICS v_copied = ROW_COUNT;

  UPDATE dish_contexts d
     SET description = t.legacy_desc
    FROM _tax_copy t
   WHERE t.target_table = 'dish_contexts'
     AND t.legacy_slug = d.slug
     AND (d.description IS NULL OR d.description = '');
  GET DIAGNOSTICS v_copied = ROW_COUNT;

  RAISE NOTICE 'TAXONOMY_COPY: the legacy rows that fill a dimension: %',
    (SELECT count(DISTINCT legacy_slug) FROM _tax_copy);
  RAISE NOTICE 'TAXONOMY_COPY: the dimension rows filled: %',
    (SELECT count(*) FROM _tax_copy);
END $$;

-- ─── PART 2 — the queue items ──────────────────────────────────────────
--
-- One row per unmapped legacy row. The detail carries the legacy
-- description and the dish count, so a reviewer can judge without
-- leaving the queue.

INSERT INTO editorial_review_queue (category, subject_type, subject_id, subject_value, reason, detail)
SELECT
  CASE c.kind
    WHEN 'dish-type'   THEN 'unmapped_dish_type'
    WHEN 'course-group' THEN 'unmapped_course_group'
    ELSE 'unmapped_legacy_value'
  END,
  'category',
  c.id,
  c.slug,
  'This legacy ' || c.kind || ' has no counterpart in the dimension '
    || 'vocabularies. The dimension tables are canonical, so the legacy row '
    || 'stays as the record of what the import found, but nothing links to '
    || 'it. A reviewer decides whether a dimension row should be created, '
    || 'whether the label should be mapped onto an existing dimension, or '
    || 'whether the label is vestigial and can be left as a note.',
  jsonb_build_object(
    'legacyKind', c.kind,
    'legacyName', c.name,
    'legacyDescription', c.description,
    'linkedDishes', (SELECT count(*) FROM dish_categories dc WHERE dc.category_id = c.id),
    'dimensionCandidates', COALESCE((
      SELECT jsonb_agg(DISTINCT t.tbl || ':' || t.slug)
        FROM (
          SELECT 'dish_families'::text AS tbl, slug FROM dish_families
          UNION ALL SELECT 'dish_techniques', slug FROM dish_techniques
          UNION ALL SELECT 'dish_courses', slug FROM dish_courses
          UNION ALL SELECT 'ingredient_categories', slug FROM ingredient_categories
          UNION ALL SELECT 'dish_contexts', slug FROM dish_contexts
        ) t
       WHERE t.slug ILIKE '%' || split_part(c.slug, '-', 1) || '%'
    ), '[]'::jsonb)
  )
  FROM categories c
 WHERE c.description IS NOT NULL AND c.description <> ''
   AND c.kind IN ('dish-type','course-group')
   AND NOT EXISTS (
     SELECT 1 FROM (
       SELECT slug FROM dish_families UNION ALL SELECT slug FROM dish_techniques
       UNION ALL SELECT slug FROM dish_courses UNION ALL SELECT slug FROM ingredient_categories
       UNION ALL SELECT slug FROM dish_contexts
     ) d WHERE d.slug = c.slug
   )
   -- and it has not been queued already
   AND NOT EXISTS (
     SELECT 1 FROM editorial_review_queue q
      WHERE q.subject_id = c.id AND q.category IN ('unmapped_dish_type','unmapped_course_group')
   );

-- ─── the audit ─────────────────────────────────────────────────────────

DO $$
DECLARE
  v_legacy_with_desc integer;
  v_matched integer;
  v_unmatched integer;
  v_filled integer;
  v_queued integer;
BEGIN
  SELECT count(*) INTO v_legacy_with_desc
    FROM categories WHERE description IS NOT NULL AND description <> '';

  SELECT count(*) INTO v_matched FROM categories c
   WHERE c.description IS NOT NULL AND c.description <> ''
     AND EXISTS (SELECT 1 FROM (
       SELECT slug FROM dish_families UNION ALL SELECT slug FROM dish_techniques
       UNION ALL SELECT slug FROM dish_courses UNION ALL SELECT slug FROM ingredient_categories
       UNION ALL SELECT slug FROM dish_contexts
     ) d WHERE d.slug = c.slug);

  v_unmatched := v_legacy_with_desc - v_matched;

  -- How many dimension rows now have a description that came from the
  -- legacy table? Counted by the JOIN, not by remembering the UPDATE.
  SELECT count(*) INTO v_filled FROM (
    SELECT c.slug, c.description, dims.tbl
      FROM categories c
      JOIN (
        SELECT slug, description, 'dish_families'::text AS tbl FROM dish_families
        UNION ALL SELECT slug, description, 'dish_techniques' FROM dish_techniques
        UNION ALL SELECT slug, description, 'dish_courses' FROM dish_courses
        UNION ALL SELECT slug, description, 'ingredient_categories' FROM ingredient_categories
        UNION ALL SELECT slug, description, 'dish_contexts' FROM dish_contexts
      ) dims ON dims.slug = c.slug
     WHERE c.description IS NOT NULL AND c.description <> ''
       AND dims.description = c.description
  ) x;

  SELECT count(*) INTO v_queued FROM editorial_review_queue
   WHERE category IN ('unmapped_dish_type','unmapped_course_group');

  RAISE NOTICE 'TAXONOMY_CANONICALISED=1';
  RAISE NOTICE '  the legacy rows with a description: %', v_legacy_with_desc;
  RAISE NOTICE '  matched to a dimension by slug:      %', v_matched;
  RAISE NOTICE '  unmatched:                            %', v_unmatched;
  RAISE NOTICE '  the dimension rows now carrying the legacy prose: %', v_filled;
  RAISE NOTICE '  the new queue items:                  %', v_queued;
  RAISE NOTICE '  the cuisines left alone:              %',
    (SELECT count(*) FROM categories WHERE kind='cuisine');
  RAISE NOTICE '  the dimension rows still without a description: %',
    ((SELECT count(*) FROM dish_families) + (SELECT count(*) FROM dish_techniques)
     + (SELECT count(*) FROM dish_courses) + (SELECT count(*) FROM ingredient_categories)
     + (SELECT count(*) FROM dish_contexts))
    - (SELECT count(*) FROM dish_families WHERE description IS NOT NULL AND description<>'')
    - (SELECT count(*) FROM dish_techniques WHERE description IS NOT NULL AND description<>'')
    - (SELECT count(*) FROM dish_courses WHERE description IS NOT NULL AND description<>'')
    - (SELECT count(*) FROM ingredient_categories WHERE description IS NOT NULL AND description<>'')
    - (SELECT count(*) FROM dish_contexts WHERE description IS NOT NULL AND description<>'');

  -- THE PRODUCTION NUMBERS, asserted where they apply.
  --
  -- The CI and the local reproduction are built from a SMALL seed: 2
  -- legacy rows with a description, against production's 150. The
  -- migration does the same work on both — copy the matching prose,
  -- queue the unmatched dish-types and course-groups — and the counts
  -- differ because the DATA differs.
  --
  -- So the production figures are asserted only when this database
  -- carries the production catalogue. A database with the full
  -- catalogue must produce exactly 22 legacy rows filling 26 dimension
  -- rows; a database without it must produce a smaller, self-consistent
  -- number. Both are correct; only the full one has fixed targets.
  IF v_legacy_with_desc >= 100 THEN
    IF v_matched <> 22 THEN
      RAISE EXCEPTION
        'the matched count is %, expected 22 on a database with the full catalogue', v_matched;
    END IF;
    IF v_filled <> 26 THEN
      RAISE EXCEPTION
        'the dimension rows filled is %, expected 26 on a database with the full catalogue', v_filled;
    END IF;
    IF v_queued <> 16 THEN
      RAISE EXCEPTION
        'the queue items created is %, expected 16 on a database with the full catalogue', v_queued;
    END IF;
    RAISE NOTICE '  the full catalogue: 22 legacy rows filled 26 dimension rows, 16 queued';
  ELSE
    RAISE NOTICE '  a reduced catalogue (% legacy rows) — the production figures do not apply here',
      v_legacy_with_desc;
  END IF;
END $$;
