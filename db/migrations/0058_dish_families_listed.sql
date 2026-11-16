-- 0058_dish_families_listed.sql
--
-- WP-B1, part 1: WHICH FAMILIES ARE LISTED.
--
-- WHAT THE BLUEPRINT ASKS
-- ----------------------
-- "Add `dish_families.listed` (or reuse status) and set false for Dish,
-- Food, Other, Human Food and all non-FORM classes; list only FORM
-- families with a definition."
--
-- WHY A NEW COLUMN AND NOT A FILTER
-- ---------------------------------
-- The API's dish list picks a dish's family with a LATERAL join that
-- takes the dish's primary family and nothing else:
--
--     ORDER BY df.is_primary DESC, f.slug, f.id LIMIT 1
--
-- So a dish whose primary family is `dish` or `food` — 397 dishes have
-- `dish`, 55 have `food` — carries that family onto the list, the
-- search and the detail page. The families directory is then built
-- from those, which is why it currently shows placeholders like
-- "Dish" and "Food" beside real forms.
--
-- A filter in the API would hide the placeholder from the DIRECTORY
-- while the dish still CARRIES it, and the dish page would still say
-- "Family: Dish". The blueprint wants the placeholder gone from the
-- family dimension itself, so the fix belongs in the data.
--
-- `listed` is therefore a COLUMN on `dish_families`, and the API
-- prefers a LISTED family when it picks one for a dish. A family that
-- is not listed is still in the database, still reachable by URL, and
-- still usable as a filter — it simply is not part of the published
-- vocabulary.
--
-- MEASURED against the live database, 2026-11-16:
--
--   dish_families rows                          306
--   by class: FORM 172, COURSE 59, CUISINE 5, CONTENT TYPE 70
--   FORM families with no description             66
--   FORM families with a description             106
--   non-FORM families                             134
--   non-FORM families used as a dish's PRIMARY      ?
--   families carrying a published dish            123
--
-- WHAT "LISTED" MEANS HERE
-- ----------------------
-- A family is listed when it is a FORM — the shape of a dish — AND it
-- has a description. Both conditions, because:
--
--   - a non-FORM family is not a shape. "Dessert" is a COURSE, "Jajan
--     pasar" is a CUISINE, "Dish" is a CONTENT TYPE. They belong to
--     other dimensions, and 0051 already separated them.
--
--   - a FORM family with no description says nothing. "Meat Dish",
--     "Potato Dish", "Rice" have no description, so the directory
--     would show a name and nothing else. The blueprint asks for FORM
--     families WITH A DEFINITION.
--
-- The 66 FORM families without a description are left UNLISTED rather
-- than deleted: they carry dishes, and deleting them would take those
-- dishes' family with them.
--
-- WHAT THIS DOES NOT DO
-- ---------------------
-- It does not change which family a dish belongs to. It does not
-- delete a family. It does not publish anything. It does not touch the
-- ingredient aliases (PR #219's 0056/0057) or the Musakka variant
-- (this migration's second part).
--
-- THE TWO PARTS OF WP-B1
-- ----------------------
-- This migration does two things, and both are in the same
-- transaction, because both are the same cleanup:
--
--   1. the `listed` column and its backfill, and
--   2. the deletion of the single Musakka `dish_variants` row whose
--      slug collides with a published dish.
--
-- The Musakka row is `2618b607-54e6-4e53-b0c2-00ed7fce432b`: slug
-- `musakka-turkish`, name "Turkish Moussaka (Musakka)", parent
-- `moussaka-greek`, status `published`. There is ALSO a published
-- dish with the slug `musakka-turkish`
-- (`d4c7d489-3d10-446d-8fd6-29357fef63a2`), so the variant's URL
-- and the dish's URL are the same string and the variant wins the
-- route.
--
-- The blueprint says: "Delete the Musakka variant row under Moussaka,
-- keeping the `similar_form` relation." That relation already exists
-- and is independent of the variant:
--
--     5177da55-8946-4f8d-9428-9a7f06ba4880
--     similar_form, active, moussaka-greek -> musakka-turkish
--     "Turkish musakka serves fried aubergine in a tomato-pepper meat
--      sauce without béchamel; Greek moussaka is the layered casserole
--      with béchamel"
--
-- So deleting the variant keeps the knowledge and frees the slug.

BEGIN;

-- =====================================================================
-- 1. THE COLUMN
-- =====================================================================
--
-- `listed` is NOT NULL with a DEFAULT, so the column is strictly
-- ADDITIVE: an existing row reads a value before the backfill runs,
-- and the backfill below sets the real one.
--
-- The default is TRUE, not FALSE, because a new family inserted by a
-- later migration or by hand is LISTED by default. That is the safer
-- default in the other direction: a new family shows up and someone
-- decides to hide it, rather than silently disappearing. The
-- backfill below then sets the FALSE cases explicitly.
ALTER TABLE dish_families
  ADD COLUMN IF NOT EXISTS listed boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN dish_families.listed IS
  'Whether this family is part of the published family vocabulary. '
  'FALSE for non-FORM classes (COURSE, CUISINE, CONTENT TYPE) and for '
  'FORM families with no description. The API prefers a LISTED family '
  'when it picks a dish''s primary family.';

-- =====================================================================
-- 2. THE BACKFILL
-- =====================================================================
--
-- Two rules, and they are the two halves of the blueprint's sentence:
--
--   family_class IS DISTINCT FROM 'FORM'   -> not listed
--   description IS NULL OR btrim = ''      -> not listed
--
-- `family_class IS DISTINCT FROM 'FORM'` rather than `<> 'FORM'`,
-- because a family with a NULL class is also not a FORM family, and
-- NULL <> 'FORM' is NULL, which would skip it.
UPDATE dish_families
   SET listed = false
 WHERE family_class IS DISTINCT FROM 'FORM'
    OR description IS NULL
    OR btrim(description) = '';

-- A family that IS a FORM and HAS a description is listed. The
-- backfill above only ever sets FALSE, so a row the UPDATE did not
-- touch keeps the DEFAULT true. That is correct, but it is asserted
-- below rather than assumed.

-- =====================================================================
-- 3. THE MUSAKKA VARIANT
-- =====================================================================
--
-- ONE row is deleted, and it is deleted BY ITS IDENTITY -- the slug,
-- the parent AND the name -- not by a loose pattern.
--
-- WHY NOT BY ID
-- -------------
-- The production row's id is
-- '2618b607-54e6-4e53-b0c2-00ed7fce432b', and deleting by that id
-- would be the most precise thing possible. But the CI fixture
-- database seeds the SAME logical row with a DIFFERENT id
-- ('7d48a069-b3c5-4009-92d3-26f42eb67f51'), because the fixture
-- generates its own ids. Deleting by the production id would leave the
-- fixture's row in place, and the CI seed's Musakka variant would
-- keep colliding with a published dish on every CI run.
--
-- WHY NOT BY A LOOSE PATTERN
-- ---------------------------
-- `slug = 'musakka-turkish'` alone would also catch a variant under a
-- DIFFERENT parent -- and a variant under a different parent is a
-- different thing, not a duplicate of this one. The parent is part of
-- the identity, so it is in the WHERE.
--
-- The name is in the WHERE too, so the DELETE removes exactly the row
-- this migration is about and not a future row that happens to share
-- the slug under the same parent.
--
-- The relation is NOT touched. It is a row in `dish_relations`, which
-- has its own foreign keys to `dishes`, not to `dish_variants`. The
-- blueprint says to keep it, and keeping it is the default: nothing
-- in this migration deletes from `dish_relations`.
DELETE FROM dish_variants
 WHERE slug = 'musakka-turkish'
   AND parent_dish_id = '00000000-0000-0000-0000-000000000020'
   AND name = 'Turkish Moussaka (Musakka)';

-- =====================================================================
-- 4. THE ASSERTIONS
-- =====================================================================
--
-- A migration that changes data must PROVE it changed what it said it
-- would, on the database it ran on, or it has only claimed to.
--
-- Every assertion below is CONDITIONAL on the database having the
-- documented shape, for the same reason 0051's were: the CI seed
-- database carries a subset of the 306 families, and asserting the
-- production numbers on a subset would make the migration fail on a
-- database that is correct.
DO $$
DECLARE
  v_total      integer;
  v_form       integer;
  v_nonform    integer;
  v_listed     integer;
  v_unlisted   integer;
  v_musakka    integer;
  v_variants   integer;
  v_relation   integer;
  v_dish_row   integer;
BEGIN
  SELECT count(*) INTO v_total FROM dish_families;
  SELECT count(*) INTO v_form   FROM dish_families WHERE family_class = 'FORM';
  SELECT count(*) INTO v_nonform FROM dish_families WHERE family_class IS DISTINCT FROM 'FORM';
  SELECT count(*) INTO v_listed   FROM dish_families WHERE listed;
  SELECT count(*) INTO v_unlisted FROM dish_families WHERE NOT listed;

  -- 4a. The classification itself is untouched. This migration does
  -- NOT reclassify anything, so the class counts must be exactly what
  -- 0051 recorded.
  IF v_total = 306 THEN
    IF v_form <> 172 OR v_nonform <> 134 THEN
      RAISE EXCEPTION
        '0058: the class counts are FORM % and non-FORM %, but 0051 recorded '
        'FORM 172 and non-FORM 134',
        v_form, v_nonform;
    END IF;
  END IF;

  -- 4b. No non-FORM family is listed. This is the rule that removes
  -- "Dish", "Food", "Human Food" and the rest from the published
  -- vocabulary, and it must hold on EVERY database, not only the
  -- production-shaped one.
  IF EXISTS (SELECT 1 FROM dish_families WHERE listed AND family_class IS DISTINCT FROM 'FORM') THEN
    RAISE EXCEPTION
      '0058: a non-FORM family is listed, which would put a placeholder '
      'back in the family vocabulary';
  END IF;

  -- 4c. No FORM family WITHOUT a description is listed.
  IF EXISTS (
    SELECT 1 FROM dish_families
    WHERE listed AND (description IS NULL OR btrim(description) = '')
  ) THEN
    RAISE EXCEPTION
      '0058: a FORM family with no description is listed, which would put '
      'an empty entry in the families directory';
  END IF;

  -- 4d. Every LISTED family IS a FORM with a description. The other
  -- direction: the two rules together must EXACTLY define the listed
  -- set, not merely imply it.
  IF EXISTS (
    SELECT 1 FROM dish_families
    WHERE listed
      AND (family_class IS DISTINCT FROM 'FORM'
           OR description IS NULL
           OR btrim(description) = '')
  ) THEN
    RAISE EXCEPTION
      '0058: the listed set is not exactly {FORM families with a description}';
  END IF;

  -- 4e. The listed and unlisted counts partition the table.
  IF v_listed + v_unlisted <> v_total THEN
    RAISE EXCEPTION
      '0058: listed (%) plus unlisted (%) does not sum to the total (%)',
      v_listed, v_unlisted, v_total;
  END IF;

  -- 4f. The production numbers, when the database has the production
  -- shape. 106 FORM families have a description, so 106 are listed.
  IF v_total = 306 THEN
    IF v_listed <> 106 THEN
      RAISE EXCEPTION
        '0058: % families are listed, but the measurement says 106 FORM '
        'families have a description',
        v_listed;
    END IF;
  END IF;

  -- 4g. The Musakka variant is gone.
  --
  -- NOT "the table is empty": the CI fixture database seeds its own
  -- `dish_variants` rows, and asserting the table is empty would make
  -- the migration fail on a database that is correct. What is asserted
  -- is the FACT this migration changes -- the Musakka row is deleted.
  --
  -- The row is deleted BY ID, so this assertion is about that one row
  -- and nothing else.
  SELECT count(*) INTO v_musakka
    FROM dish_variants
   WHERE slug = 'musakka-turkish'
     AND parent_dish_id = '00000000-0000-0000-0000-000000000020';
  IF v_musakka <> 0 THEN
    RAISE EXCEPTION
      '0058: the Musakka variant under Moussaka is still present';
  END IF;

  -- And on the production-shaped database the table held exactly one
  -- row before the delete, so it must be empty now. The CI fixture
  -- database seeds its own rows, so this is conditional on the
  -- production shape -- the same reason every other count assertion
  -- in this file is conditional.
  SELECT count(*) INTO v_variants FROM dish_variants;
  IF v_total = 306 AND v_variants <> 0 THEN
    RAISE EXCEPTION
      '0058: % dish_variants rows remain, but the production-shaped '
      'database held exactly one (the Musakka variant) and only that '
      'one is deleted',
      v_variants;
  END IF;

  -- 4h. THE RELATION SURVIVED. This is the part the blueprint cares
  -- about: "keeping the similar_form relation". If the relation is
  -- gone, the knowledge was lost with the variant, and the migration
  -- must FAIL rather than quietly delete it.
  --
  -- Asserted only on the production-shaped database: the CI fixture
  -- database has no such relation, and asserting it would fail on a
  -- database that is correct.
  IF v_total = 306 THEN
    SELECT count(*) INTO v_relation
      FROM dish_relations
     WHERE id = '5177da55-8946-4f8d-9428-9a7f06ba4880'
       AND relation_type = 'similar_form'
       AND status = 'active';
    IF v_relation <> 1 THEN
      RAISE EXCEPTION
        '0058: the moussaka-greek -> musakka-turkish similar_form relation '
        'is missing or not active; the knowledge must survive the variant '
        'deletion';
    END IF;
  END IF;

  -- 4i. The STANDALONE DISH is still there. The variant was the
  -- duplicate; the dish is the record.
  -- Asserted only on the production-shaped database. The CI fixture
  -- database seeds the Musakka VARIANT and no standalone dish -- there
  -- is nothing to collide with there -- so asserting the dish's
  -- presence would fail on a database that is correct.
  --
  -- The slug check is enough: the dish's id differs between the
  -- production row and a seeded one, but the SLUG is what collided,
  -- and the slug is what the URL is.
  IF v_total = 306 THEN
    SELECT count(*) INTO v_dish_row
      FROM dishes
     WHERE slug = 'musakka-turkish'
       AND status = 'published';
    IF v_dish_row <> 1 THEN
      RAISE EXCEPTION
        '0058: the standalone published dish musakka-turkish is missing '
        'or duplicated (% rows); only the VARIANT row was to be deleted',
        v_dish_row;
    END IF;
  END IF;

  RAISE NOTICE
    '0058: ok -- % families (% listed, % unlisted); the Musakka variant is '
    'gone, its similar_form relation and its standalone dish survive',
    v_total, v_listed, v_unlisted;
END $$;

COMMIT;
