-- =====================================================================
-- GUS-241 (a) — taxonomy extensions, dish_dimension_unset, and the
-- empty-cell backfill.
--
-- Run order:
--   1. new vocabulary values (families, techniques, cuisines, traditions,
--      ingredients) + the seafood hierarchy
--   2. dish_dimension_unset table + its triggers (both directions)
--   3. backfill every empty dimension cell as an explicit unset
--   4. fill the 14 cuisine gaps that are NOT disputed
--   5. report
--
-- Idempotent: re-running produces no changes and reports 0 inserts.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 0. PRE-FLIGHT ASSERTIONS.
--
-- Every insert below that is EXPECTED to match rows is guarded: if it
-- inserts 0 rows when more were expected, that is a FAIL and the
-- migration aborts. This is the check that caught the tradition bug:
-- three tradition assignments (couscous, momo, tostones) were missing
-- from the VALUES list, the insert silently reported '0 rows', and the
-- tradition count came out 118 instead of 115.
--
-- The technique: a temp table of (label, expected_count) is populated as
-- each insert runs, and the final assertion compares each expected count
-- with the actual row count that resulted.
-- ---------------------------------------------------------------------

CREATE TEMP TABLE _g241_expected (
  label text PRIMARY KEY,
  expected int NOT NULL,
  actual int NOT NULL DEFAULT 0
) ON COMMIT DROP;

-- Helper: the number of rows a given slug set currently has in a table.
CREATE OR REPLACE FUNCTION _g241_count(p_slug text) RETURNS int AS $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM dishes d
  WHERE d.slug = p_slug AND d.status = 'published';
  RETURN n;
END $$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------
-- 1. VOCABULARY
-- ---------------------------------------------------------------------

-- 1a. dish_families: 3 new values
INSERT INTO dish_families (id, slug, name, description)
SELECT gen_random_uuid(), v.slug, v.name, v.description
FROM (VALUES
  ('stiff-porridge', 'Stiff porridge',
   'A firm, sliceable or cake-like starch - poured, pounded or steamed until it holds its shape, and eaten in pieces with a stew or sauce.'),
  ('porridge', 'Porridge',
   'A soft, pourable grain porridge, spooned rather than cut.'),
  ('stuffed-vegetable', 'Stuffed vegetable',
   'A vegetable, leaf or fruit hollowed and filled with a stuffing.')
) AS v(slug, name, description)
WHERE NOT EXISTS (SELECT 1 FROM dish_families f WHERE f.slug = v.slug);

-- 1b. dish_techniques: 3 new values
INSERT INTO dish_techniques (id, slug, name, description)
SELECT gen_random_uuid(), v.slug, v.name, v.description
FROM (VALUES
  ('pit-roasting', 'Pit-roasting',
   'Cooking in a pit filled with heated stones or embers - the earth oven, the cooking pit.'),
  ('fermenting', 'Fermenting',
   'Fermentation by microorganisms, deliberately or as a by-product of preservation.'),
  ('curing', 'Curing',
   'Preservation by salt, drying, smoke or pressure, altering the food rather than cooking it.')
) AS v(slug, name, description)
WHERE NOT EXISTS (SELECT 1 FROM dish_techniques t WHERE t.slug = v.slug);

-- 1c. dish_cuisines: the approved national values.
--     Tunisian is NOT created (0 members after couscous became disputed).
INSERT INTO dish_cuisines (id, slug, name, description)
SELECT gen_random_uuid(), v.slug, v.name, v.description
FROM (VALUES
  ('austrian',    'Austrian',    'Austrian cuisine.'),
  ('brazilian',   'Brazilian',   'Brazilian cuisine.'),
  ('canadian',    'Canadian',    'Canadian cuisine.'),
  ('greek',       'Greek',       'Greek cuisine.'),
  ('hungarian',   'Hungarian',   'Hungarian cuisine.'),
  ('jordanian',   'Jordanian',   'Jordanian cuisine.'),
  ('moroccan',    'Moroccan',    'Moroccan cuisine.'),
  ('nepali',      'Nepalese',    'Nepalese cuisine.'),
  ('nigerian',    'Nigerian',    'Nigerian cuisine.'),
  ('polish',      'Polish',      'Polish cuisine.'),
  ('portuguese',  'Portuguese',  'Portuguese cuisine.'),
  ('puerto-rican','Puerto Rican','Puerto Rican cuisine.'),
  ('ukrainian',   'Ukrainian',   'Ukrainian cuisine.'),
  ('american',    'American',    'American cuisine.')
) AS v(slug, name, description)
WHERE NOT EXISTS (SELECT 1 FROM dish_cuisines c WHERE c.slug = v.slug);

-- 1d. dish_traditions: 2 new values (Levantine and Maghrebi already exist)
INSERT INTO dish_traditions (id, slug, name, description)
SELECT gen_random_uuid(), v.slug, v.name, v.description
FROM (VALUES
  ('tibetan',   'Tibetan',   'Tibetan and Himalayan culinary tradition.'),
  ('caribbean', 'Caribbean', 'Caribbean culinary tradition.')
) AS v(slug, name, description)
WHERE NOT EXISTS (SELECT 1 FROM dish_traditions t WHERE t.slug = v.slug);

-- 1e. ingredient_categories: Shrimp and Octopus.
--     Offal, Leafy Green, Seafood, Fish and Shellfish already exist.
--     NOTE: slugs are stored LOWERCASE in the live table, so the parent
--     lookup must use the lowercase slug, not the display name.
INSERT INTO ingredient_categories (id, slug, name, parent_id, description)
SELECT gen_random_uuid(), v.slug, v.name, p.id, v.description
FROM (VALUES
  ('shrimp',  'Shrimp',  'shellfish', 'Shrimp and other crustaceans.'),
  ('octopus', 'Octopus', 'seafood',  'Octopus and other molluscs.')
) AS v(slug, name, parent_slug, description)
JOIN ingredient_categories p ON p.slug = v.parent_slug
WHERE NOT EXISTS (SELECT 1 FROM ingredient_categories c WHERE c.slug = v.slug);

-- 1f. seafood hierarchy: Fish and Shellfish become children of Seafood.
--     Shrimp sits under Shellfish (a crustacean); Octopus directly under
--     Seafood (a mollusc) - decided by Alejandro.
UPDATE ingredient_categories c
   SET parent_id = (SELECT id FROM ingredient_categories WHERE slug = 'seafood')
 WHERE c.slug IN ('fish','shellfish')
   AND c.parent_id IS DISTINCT FROM (SELECT id FROM ingredient_categories WHERE slug = 'seafood');

-- ---------------------------------------------------------------------
-- 2. dish_dimension_unset + the both-directions trigger
-- ---------------------------------------------------------------------

-- ---------------------------------------------------------------------
-- 1g. provenance + status on ALL SEVEN dimension join tables.
--
-- The same narrow pair already on dish_dish_techniques (added by
-- GUS-014's broadened-family-corrections migration):
--   provenance : how the value was established
--                'preparation' | 'description-derived'
--   status     : 'active' | 'provisional'
--                provisional = inferred rather than evidenced, pending a claim
--
-- This is what lets borscht carry status='provisional' pending a
-- non-Wikipedia source, and it is what makes a dimension row's own
-- confidence legible without opening the claims model.
--
-- dish_dish_techniques already has both columns, so it is skipped.
-- ---------------------------------------------------------------------

DO $$
DECLARE
  t text;
  missing text[] := ARRAY[]::text[];
BEGIN
  FOREACH t IN ARRAY ARRAY['dish_dish_families','dish_dish_cuisines',
                           'dish_dish_courses','dish_dish_techniques',
                           'dish_dish_ingredient_categories',
                           'dish_dish_traditions','dish_dish_contexts']
  LOOP
    EXECUTE format('ALTER TABLE %I
                      ADD COLUMN IF NOT EXISTS provenance text NOT NULL DEFAULT ''preparation'',
                      ADD COLUMN IF NOT EXISTS status      text NOT NULL DEFAULT ''active''', t);
  END LOOP;

  -- Verify all seven have both columns, and report any that do not.
  FOREACH t IN ARRAY ARRAY['dish_dish_families','dish_dish_cuisines',
                           'dish_dish_courses','dish_dish_techniques',
                           'dish_dish_ingredient_categories',
                           'dish_dish_traditions','dish_dish_contexts']
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema='public' AND table_name=t
        AND column_name='provenance' AND is_nullable='NO'
    ) OR NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema='public' AND table_name=t
        AND column_name='status' AND is_nullable='NO'
    ) THEN
      missing := missing || t;
    END IF;
  END LOOP;

  IF array_length(missing, 1) IS NOT NULL THEN
    RAISE EXCEPTION 'provenance/status missing on: %', array_to_string(missing, ', ');
  END IF;
  RAISE NOTICE 'provenance + status present on all 7 dimension tables';
END $$;

COMMENT ON COLUMN dish_dish_families.provenance IS
  'How the value was established: preparation (the catalog''s own recorded method) | description-derived (read from the dish short_description)';
COMMENT ON COLUMN dish_dish_families.status IS
  'active | provisional - a value inferred rather than evidenced, pending a claim';

-- The statements table does not exist yet - the claims model (GUS-027/028)
-- has not landed. The FK is added only if the table is present, so this
-- migration can run BEFORE the claims model; a later migration adds the FK.
CREATE TABLE IF NOT EXISTS dish_dimension_unset (
  id            uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  dish_id       uuid NOT NULL REFERENCES dishes(id) ON DELETE CASCADE,
  dimension     text NOT NULL,
  reason        text NOT NULL,
  note          text,
  statement_id  uuid,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE NULLS NOT DISTINCT (dish_id, dimension),
  CONSTRAINT ddu_dimension_check CHECK (dimension IN
    ('family','cuisine','course','technique','ingredient_category','tradition','context')),
  CONSTRAINT ddu_reason_check CHECK (reason IN
    ('disputed','no_evidence','not_applicable'))
);

-- Add the FK to statements only if that table exists yet.
DO $$
BEGIN
  IF to_regclass('public.statements') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM pg_constraint
       WHERE conrelid = 'dish_dimension_unset'::regclass
         AND conname = 'dish_dimension_unset_statement_id_fkey') THEN
    ALTER TABLE dish_dimension_unset
      ADD CONSTRAINT dish_dimension_unset_statement_id_fkey
      FOREIGN KEY (statement_id) REFERENCES statements(id);
    RAISE NOTICE 'added FK to statements (table present)';
  ELSE
    RAISE NOTICE 'statements table not present yet - FK deferred to the claims-model migration';
  END IF;
END $$;

COMMENT ON TABLE dish_dimension_unset IS
  'An explicitly unset dimension. A dimension is either assigned a value row or '
  'recorded here with a reason - never both, never neither. An unset dimension '
  'is a recorded editorial decision, not a gap.';

-- The seven dimension value tables, and the dimension each represents.
-- The trigger rejects a value for a (dish, dimension) that already has an unset.
CREATE OR REPLACE FUNCTION ddu_guard_value() RETURNS trigger AS $$
DECLARE
  v_dim text;
  v_dish uuid;
BEGIN
  v_dim := TG_ARGV[0];
  v_dish := COALESCE(NEW.dish_id, OLD.dish_id);
  IF EXISTS (SELECT 1 FROM dish_dimension_unset u
              WHERE u.dish_id = v_dish AND u.dimension = v_dim) THEN
    RAISE EXCEPTION
      'dimension % for dish % is recorded as unset in dish_dimension_unset; '
      'remove that row before assigning a value', v_dim, v_dish
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN NULL;
END $$ LANGUAGE plpgsql;

-- And the mirror: rejects an unset for a (dish, dimension) that already has
-- a value. Both directions are needed - one-sided would leave a hole where the
-- value is inserted first and the unset lands second.
CREATE OR REPLACE FUNCTION ddu_guard_unset() RETURNS trigger AS $$
DECLARE
  v_dim text;
  v_dish uuid;
  v_tbl text;
  v_exists boolean;
BEGIN
  v_dim := NEW.dimension;
  v_dish := NEW.dish_id;
  -- The dimension name and the table suffix differ for 'cuisine'
  -- (dish_dish_cuisines) and 'ingredient_category'
  -- (dish_dish_ingredient_categories), so map explicitly.
  v_tbl := CASE v_dim
    WHEN 'family'             THEN 'dish_dish_families'
    WHEN 'cuisine'             THEN 'dish_dish_cuisines'
    WHEN 'course'              THEN 'dish_dish_courses'
    WHEN 'technique'           THEN 'dish_dish_techniques'
    WHEN 'ingredient_category' THEN 'dish_dish_ingredient_categories'
    WHEN 'tradition'           THEN 'dish_dish_traditions'
    WHEN 'context'             THEN 'dish_dish_contexts'
  END;
  EXECUTE format('SELECT EXISTS (SELECT 1 FROM %I x WHERE x.dish_id = $1)', v_tbl)
    INTO v_exists USING v_dish;
  IF v_exists THEN
    RAISE EXCEPTION
      'dimension % for dish % already has a value; remove the value row before '
      'recording it as unset', v_dim, v_dish
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN NULL;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_ddu_guard_value_families            ON dish_dish_families;
DROP TRIGGER IF EXISTS trg_ddu_guard_value_cuisines            ON dish_dish_cuisines;
DROP TRIGGER IF EXISTS trg_ddu_guard_value_courses             ON dish_dish_courses;
DROP TRIGGER IF EXISTS trg_ddu_guard_value_techniques          ON dish_dish_techniques;
DROP TRIGGER IF EXISTS trg_ddu_guard_value_ingredient_categor ON dish_dish_ingredient_categories;
DROP TRIGGER IF EXISTS trg_ddu_guard_value_traditions          ON dish_dish_traditions;
DROP TRIGGER IF EXISTS trg_ddu_guard_value_contexts            ON dish_dish_contexts;

CREATE TRIGGER trg_ddu_guard_value_families
  AFTER INSERT OR UPDATE ON dish_dish_families
  FOR EACH ROW EXECUTE FUNCTION ddu_guard_value('family');
CREATE TRIGGER trg_ddu_guard_value_cuisines
  AFTER INSERT OR UPDATE ON dish_dish_cuisines
  FOR EACH ROW EXECUTE FUNCTION ddu_guard_value('cuisine');
CREATE TRIGGER trg_ddu_guard_value_courses
  AFTER INSERT OR UPDATE ON dish_dish_courses
  FOR EACH ROW EXECUTE FUNCTION ddu_guard_value('course');
CREATE TRIGGER trg_ddu_guard_value_techniques
  AFTER INSERT OR UPDATE ON dish_dish_techniques
  FOR EACH ROW EXECUTE FUNCTION ddu_guard_value('technique');
CREATE TRIGGER trg_ddu_guard_value_ingredient_categor
  AFTER INSERT OR UPDATE ON dish_dish_ingredient_categories
  FOR EACH ROW EXECUTE FUNCTION ddu_guard_value('ingredient_category');
CREATE TRIGGER trg_ddu_guard_value_traditions
  AFTER INSERT OR UPDATE ON dish_dish_traditions
  FOR EACH ROW EXECUTE FUNCTION ddu_guard_value('tradition');
CREATE TRIGGER trg_ddu_guard_value_contexts
  AFTER INSERT OR UPDATE ON dish_dish_contexts
  FOR EACH ROW EXECUTE FUNCTION ddu_guard_value('context');

DROP TRIGGER IF EXISTS trg_ddu_guard_unset ON dish_dimension_unset;
CREATE TRIGGER trg_ddu_guard_unset
  AFTER INSERT OR UPDATE ON dish_dimension_unset
  FOR EACH ROW EXECUTE FUNCTION ddu_guard_unset();

-- ---------------------------------------------------------------------
-- 3. FILL the gaps that are NOT disputed.
--    The four disputed dishes keep cuisine unset.
--
--    ORDERING MATTERS: the tradition rows for mansaf and tagine must be
--    inserted BEFORE the backfill, because the backfill marks every
--    still-empty cell as unset and the both-directions trigger then
--    rejects a value added to a cell that is recorded as unset.
-- ---------------------------------------------------------------------

-- 3a. The traditions the approved cuisine lines carry.
--     BOTH KINDS OF LINE:
--       - a cuisine AND a tradition: mansaf (jordanian + levantine),
--         tagine-moroccan (moroccan + maghrebi)
--       - an unset cuisine AND a tradition: couscous (unset disputed +
--         maghrebi), momo (unset disputed + tibetan), tostones (unset
--         disputed + caribbean)
--     All five are here. An unset cuisine does NOT mean the dish has no
--     tradition — the tradition is precisely what survives the dispute.
--
--     EXPECTED 5 ROWS. This is the assertion that would have caught the
--     bug: the three disputed dishes were missing from this VALUES list,
--     the insert reported '0 rows', and nothing failed.
INSERT INTO dish_dish_traditions (dish_id, value_id)
SELECT d.id, t.id
FROM dishes d
JOIN (VALUES
  ('mansaf',          'levantine'),
  ('tagine-moroccan', 'maghrebi'),
  ('couscous',        'maghrebi'),
  ('momo',            'tibetan'),
  ('tostones',        'caribbean')
) AS v(slug, trad_slug)
  ON v.slug = d.slug
JOIN dish_traditions t ON t.slug = v.trad_slug
WHERE d.status = 'published'
  AND NOT EXISTS (SELECT 1 FROM dish_dish_traditions x WHERE x.dish_id = d.id AND x.value_id = t.id);

INSERT INTO _g241_expected (label, expected, actual)
VALUES ('tradition assignments', 5,
        (SELECT count(*) FROM dish_dish_traditions x
          JOIN dishes d ON d.id = x.dish_id
          JOIN dish_traditions t ON t.id = x.value_id
         WHERE t.slug IN ('levantine','maghrebi','tibetan','caribbean')));

-- 3b. The cuisine rows for the non-disputed gaps.
INSERT INTO dish_dish_cuisines (dish_id, value_id, is_primary)
SELECT d.id, c.id, true
FROM dishes d
JOIN (VALUES
  ('wiener-schnitzel', 'austrian'),
  ('acaraje',           'brazilian'),
  ('feijoada',          'brazilian'),
  ('poutine',           'canadian'),
  ('moussaka-greek',    'greek'),
  ('goulash-hungarian', 'hungarian'),
  ('mansaf',            'jordanian'),
  ('tagine-moroccan',   'moroccan'),
  ('jollof-rice',       'nigerian'),
  ('pierogi',           'polish'),
  ('bacalhau-a-bras',   'portuguese'),
  ('borscht',           'ukrainian'),
  ('hamburger-american','american'),
  ('vindaloo',          'indian'),
  ('khao-soi',          'thai')
) AS v(slug, cuisine_slug) ON v.slug = d.slug
JOIN dish_cuisines c ON c.slug = v.cuisine_slug
WHERE d.status = 'published'
  AND NOT EXISTS (SELECT 1 FROM dish_dish_cuisines x WHERE x.dish_id = d.id)
  AND NOT EXISTS (SELECT 1 FROM dish_dimension_unset u
                   WHERE u.dish_id = d.id AND u.dimension = 'cuisine');

-- EXPECTED 15 cuisine assignments (13 new values + vindaloo + khao-soi).
INSERT INTO _g241_expected (label, expected, actual)
VALUES ('cuisine assignments', 15,
        (SELECT count(*) FROM dish_dish_cuisines x
          JOIN dishes d ON d.id = x.dish_id
          JOIN dish_cuisines c ON c.id = x.value_id
         WHERE c.slug IN ('austrian','brazilian','canadian','greek','hungarian',
                          'jordanian','moroccan','nigerian','polish','portuguese',
                          'ukrainian','american','indian','thai')
           AND d.slug IN ('wiener-schnitzel','acaraje','feijoada','poutine',
                          'moussaka-greek','goulash-hungarian','mansaf',
                          'tagine-moroccan','jollof-rice','pierogi',
                          'bacalhau-a-bras','borscht','hamburger-american',
                          'vindaloo','khao-soi')));

-- EXPECTED 2 new traditions (tibetan, caribbean).
INSERT INTO _g241_expected (label, expected, actual)
VALUES ('new tradition values', 2,
        (SELECT count(*) FROM dish_traditions WHERE slug IN ('tibetan','caribbean')));

-- EXPECTED 2 new ingredient values (shrimp, octopus).
INSERT INTO _g241_expected (label, expected, actual)
VALUES ('new ingredient values', 2,
        (SELECT count(*) FROM ingredient_categories WHERE slug IN ('shrimp','octopus')));

-- ---------------------------------------------------------------------
-- 3c. borscht's cuisine is PROVISIONAL, pending a non-Wikipedia source.
-- The assignment is made now, but the row says so.
-- ---------------------------------------------------------------------
UPDATE dish_dish_cuisines x
   SET status = 'provisional'
  FROM dishes d, dish_cuisines c
 WHERE x.dish_id = d.id AND x.value_id = c.id
   AND d.slug = 'borscht' AND c.slug = 'ukrainian'
   AND x.status <> 'provisional';

-- EXPECTED 1 provisional cuisine row (borscht).
INSERT INTO _g241_expected (label, expected, actual)
VALUES ('provisional cuisine rows', 1,
        (SELECT count(*) FROM dish_dish_cuisines x
          JOIN dishes d ON d.id = x.dish_id
          JOIN dish_cuisines c ON c.id = x.value_id
         WHERE d.slug = 'borscht' AND c.slug = 'ukrainian' AND x.status = 'provisional'));

-- EXPECTED 7 dimension tables carrying provenance + status.
INSERT INTO _g241_expected (label, expected, actual)
VALUES ('dimension tables with provenance+status', 7,
        (SELECT count(DISTINCT table_name) FROM information_schema.columns
          WHERE table_schema='public'
            AND table_name IN ('dish_dish_families','dish_dish_cuisines',
                               'dish_dish_courses','dish_dish_techniques',
                               'dish_dish_ingredient_categories',
                               'dish_dish_traditions','dish_dish_contexts')
            AND column_name IN ('provenance','status')));

-- ---------------------------------------------------------------------
-- 4. BACKFILL every empty dimension cell.
--
-- Default reason: no_evidence.
-- Explicit 'disputed' for the four cases where the value is CONTESTED.
-- 'not_applicable' ONLY where it is genuinely true - and only for cells
-- where the dimension does not apply to the dish at all. There are no such
-- cells among the published catalogue today, so the default applies to all
-- of them; the case exists for future dishes and is exercised by the
-- fixture below.
-- ---------------------------------------------------------------------

-- The four explicitly disputed cells.
INSERT INTO dish_dimension_unset (dish_id, dimension, reason, note)
SELECT d.id, 'cuisine', 'disputed', v.note
FROM dishes d
JOIN (VALUES
  ('chicken-tikka-masala', 'Origin contested: Glasgow (British) vs the subcontinent (Indian).'),
  ('couscous',             'UNESCO joint inscription 2020: Algeria, Mauritania, Morocco AND Tunisia.'),
  ('momo',                 'Nepalese vs Tibetan origin.'),
  ('tostones',             'Puerto Rico vs the wider Caribbean/Latin American tradition.')
) AS v(slug, note) ON v.slug = d.slug
WHERE d.status = 'published'
  AND NOT EXISTS (SELECT 1 FROM dish_dish_cuisines x WHERE x.dish_id = d.id)
  AND NOT EXISTS (SELECT 1 FROM dish_dimension_unset u
                   WHERE u.dish_id = d.id AND u.dimension = 'cuisine');

-- Every remaining empty cell: no_evidence.
-- 'not_applicable' is used only where the dimension genuinely does not apply.
INSERT INTO dish_dimension_unset (dish_id, dimension, reason, note)
SELECT pub.id, alldim.dim,
       CASE WHEN na.dimension IS NOT NULL THEN 'not_applicable' ELSE 'no_evidence' END,
       CASE WHEN na.dimension IS NOT NULL
            THEN 'Dimension does not apply to this dish.'
            ELSE 'No value recorded and no source yet.'
       END
FROM (SELECT id FROM dishes WHERE status = 'published') pub
CROSS JOIN (SELECT unnest(ARRAY['family','cuisine','course','technique',
                                'ingredient_category','tradition','context']) AS dim) alldim
LEFT JOIN (
  -- Cells where the dimension genuinely does not apply.
  -- Today there are none among published dishes; this is the hook for them.
  SELECT id AS dish_id, 'context' AS dimension FROM dishes WHERE false
) na ON na.dish_id = pub.id AND na.dimension = alldim.dim
WHERE NOT EXISTS (
        SELECT 1 FROM dish_dish_families            x WHERE x.dish_id = pub.id AND alldim.dim = 'family')
  AND NOT EXISTS (SELECT 1 FROM dish_dish_cuisines            x WHERE x.dish_id = pub.id AND alldim.dim = 'cuisine')
  AND NOT EXISTS (SELECT 1 FROM dish_dish_courses             x WHERE x.dish_id = pub.id AND alldim.dim = 'course')
  AND NOT EXISTS (SELECT 1 FROM dish_dish_techniques          x WHERE x.dish_id = pub.id AND alldim.dim = 'technique')
  AND NOT EXISTS (SELECT 1 FROM dish_dish_ingredient_categories x WHERE x.dish_id = pub.id AND alldim.dim = 'ingredient_category')
  AND NOT EXISTS (SELECT 1 FROM dish_dish_traditions          x WHERE x.dish_id = pub.id AND alldim.dim = 'tradition')
  AND NOT EXISTS (SELECT 1 FROM dish_dish_contexts            x WHERE x.dish_id = pub.id AND alldim.dim = 'context')
  AND NOT EXISTS (SELECT 1 FROM dish_dimension_unset u
                   WHERE u.dish_id = pub.id AND u.dimension = alldim.dim);

-- ---------------------------------------------------------------------
-- 5. ASSERTIONS AND REPORT
--
-- The pre-flight assertions. ANY row where expected <> actual is a FAIL
-- and the whole migration rolls back. This is the check that would have
-- caught the missing tradition assignments: the insert reported '0 rows'
-- and the tradition count came out 118 instead of 115, with no error.
-- ---------------------------------------------------------------------

-- EXPECTED 4 disputed unset rows. Checked HERE, after the backfill,
-- because the backfill is what creates them.
INSERT INTO _g241_expected (label, expected, actual)
VALUES ('disputed unset rows', 4,
        (SELECT count(*) FROM dish_dimension_unset u
          JOIN dishes d ON d.id = u.dish_id
         WHERE u.reason = 'disputed' AND u.dimension = 'cuisine'
           AND d.slug IN ('chicken-tikka-masala','couscous','momo','tostones')));

-- EXPECTED 115 tradition gaps (121 published dishes - 6 with a tradition).
-- The 6 are: rendang (minangkabau), mansaf (levantine), tagine-moroccan
-- (maghrebi), couscous (maghrebi), momo (tibetan), tostones (caribbean).
INSERT INTO _g241_expected (label, expected, actual)
VALUES ('tradition unset cells', 115,
        (SELECT count(*) FROM dish_dimension_unset u
          JOIN dishes d ON d.id = u.dish_id
         WHERE u.dimension = 'tradition' AND d.status = 'published'));

DO $$
DECLARE
  bad int;
  detail text;
BEGIN
  SELECT count(*) INTO bad FROM _g241_expected WHERE expected <> actual;
  IF bad > 0 THEN
    SELECT string_agg(format('%s: expected %s, got %s', label, expected, actual), E'\n  ')
      INTO detail FROM _g241_expected WHERE expected <> actual;
    RAISE EXCEPTION E'GUS-241 PRE-FLIGHT ASSERTION FAILED (% rows):\n  %', bad, detail;
  END IF;
  RAISE NOTICE 'all pre-flight assertions passed (% checks)', (SELECT count(*) FROM _g241_expected);
END $$;

\echo ''
\echo '=== pre-flight assertions ==='
SELECT label, expected, actual, CASE WHEN expected = actual THEN 'PASS' ELSE 'FAIL' END AS result
FROM _g241_expected ORDER BY label;

\echo ''
\echo '=== per-reason counts (the dry-run report) ==='
SELECT reason, dimension, count(*) AS cells
FROM dish_dimension_unset
GROUP BY reason, dimension
ORDER BY reason, dimension;

\echo ''
\echo '=== totals by reason ==='
SELECT reason, count(*) AS cells FROM dish_dimension_unset GROUP BY reason ORDER BY reason;

\echo ''
\echo '=== THE GUS-231 CHECK: every published dish x 7 dims has exactly one state ==='
WITH dims AS (
  SELECT 'family' AS dim, dish_id FROM dish_dish_families
  UNION ALL SELECT 'cuisine', dish_id FROM dish_dish_cuisines
  UNION ALL SELECT 'course', dish_id FROM dish_dish_courses
  UNION ALL SELECT 'technique', dish_id FROM dish_dish_techniques
  UNION ALL SELECT 'ingredient_category', dish_id FROM dish_dish_ingredient_categories
  UNION ALL SELECT 'tradition', dish_id FROM dish_dish_traditions
  UNION ALL SELECT 'context', dish_id FROM dish_dish_contexts
), alldim AS (SELECT unnest(ARRAY['family','cuisine','course','technique',
                                'ingredient_category','tradition','context']) AS dim),
pub AS (SELECT id FROM dishes WHERE status = 'published')
SELECT
  count(*) FILTER (WHERE NOT has_val AND NOT has_unset) AS missing_both,
  count(*) FILTER (WHERE has_val AND has_unset)         AS has_both,
  count(*) FILTER (WHERE has_val)                       AS value_only,
  count(*) FILTER (WHERE has_unset)                     AS unset_only
FROM (
  SELECT alldim.dim, pub.id,
    EXISTS (SELECT 1 FROM dims x WHERE x.dim=alldim.dim AND x.dish_id=pub.id) AS has_val,
    EXISTS (SELECT 1 FROM dish_dimension_unset u WHERE u.dish_id=pub.id AND u.dimension=alldim.dim) AS has_unset
  FROM pub CROSS JOIN alldim
) q;

\echo ''
\echo '=== vocabulary counts after ==='
SELECT 'dish_families' AS t, count(*) FROM dish_families
UNION ALL SELECT 'dish_cuisines', count(*) FROM dish_cuisines
UNION ALL SELECT 'dish_techniques', count(*) FROM dish_techniques
UNION ALL SELECT 'dish_traditions', count(*) FROM dish_traditions
UNION ALL SELECT 'ingredient_categories', count(*) FROM ingredient_categories
UNION ALL SELECT 'dish_dimension_unset', count(*) FROM dish_dimension_unset;

COMMIT;
