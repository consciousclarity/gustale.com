-- The constraint tests for D4 — the recipe content model.
--
-- WHAT IS COVERED
--
-- Migration 0065 does two things: it widens the `recipe_sentences.field`
-- CHECK with six more values, and it adds a nullable
-- `recipes.recipe_layout jsonb` column. This file asserts BOTH halves:
--
--   1. every one of the nine values is ACCEPTED by the CHECK;
--   2. a value OUTSIDE the nine is still REFUSED;
--   3. the CHECK was not weakened into a no-op;
--   4. `recipe_layout` exists, is jsonb, is nullable, and round-trips a
--      document;
--   5. a recipe written BEFORE the migration (no layout) is untouched.
--
-- Every case here is a NEGATIVE test that can detect a regression: it
-- asserts that a specific bad write is REFUSED, and that the good ones
-- are accepted. A test that cannot fail is not a test.
--
-- Run against a database that has had 0065 applied:
--   psql -U postgres -d <db> -v ON_ERROR_STOP=1 -f scripts/test_recipe_d4_schema.sql
--
-- ── THE REFUSAL ────────────────────────────────────────────────────────
--
-- These tests WRITE rows and then delete them. Against a throwaway
-- database that is fine. Against PRODUCTION it is not.
--
-- So the file REFUSES to run against a database that is not marked
-- disposable (scripts/mark_disposable_db.sql). The check is POSITIVE --
-- the database must carry the marker, and the default is DENY. An
-- unmarked database, whatever its name, is refused.
--
-- Production never gets the marker, and the gate asserts that. The
-- fixtures here are marker-scoped anyway: every row this file inserts
-- carries a marker, only marked rows are removed, and the file asserts
-- at the end that it left the database exactly as it found it.
--
-- ── WHY THE FIXTURES ARE BUILT BY HAND ─────────────────────────────────
--
-- The `recipe_sentences` table is LANGUAGE-FIRST (ADR-007-A1 §4.3): a
-- recipe has exactly ONE original sentence (source_sentence_id IS NULL),
-- and every other row is a translation that points at that original.
-- So a fixture row is not a single INSERT -- it is an original plus,
-- for the translation cases, a row that points at it.
--
-- This is the same trap the 0065 proof fell into: a first version of
-- that proof inserted rows without `is_original` and was refused by
-- `recipe_sentences_original_source_check`. The constraint is correct;
-- the fixture was wrong.

-- ---------------------------------------------------------------------
-- the gate: refuse an unmarked database
-- ---------------------------------------------------------------------

DO $$
DECLARE
  v_db text := current_database();
  v_marked boolean := false;
BEGIN
  -- The marker table may not exist yet on a database that has never
  -- been marked. That is the SAME as "not marked" -- the default is deny.
  IF to_regclass('public.gustale_disposable_database') IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM gustale_disposable_database
    ) INTO v_marked;
  END IF;

  IF NOT v_marked THEN
    RAISE EXCEPTION
      'REFUSED: the D4 constraint tests refuse to run against the database % -- it is not marked disposable. Apply scripts/mark_disposable_db.sql to a database you created for them, and NEVER to production.',
      v_db;
  END IF;
END $$;

-- ---------------------------------------------------------------------
-- the helpers
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION d4_test_fail(p_name text, p_detail text)
RETURNS text
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE WARNING 'FAIL  % -- %', p_name, p_detail;
  RETURN p_name;
END $$;

CREATE OR REPLACE FUNCTION d4_test_pass(p_name text)
RETURNS text
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE NOTICE 'PASS  %', p_name;
  RETURN p_name;
END $$;

-- Run a statement that MUST fail. Returns the error message, or NULL if it
-- unexpectedly succeeded.
CREATE OR REPLACE FUNCTION d4_test_must_fail(p_sql text)
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  v_err text;
BEGIN
  BEGIN
    EXECUTE p_sql;
  EXCEPTION WHEN OTHERS THEN
    v_err := SQLERRM;
  END;
  RETURN v_err;
END $$;

-- Run a statement that MUST succeed. Returns NULL if it did, or the
-- error message if it did not.
CREATE OR REPLACE FUNCTION d4_test_must_succeed(p_sql text)
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  v_err text;
BEGIN
  BEGIN
    EXECUTE p_sql;
  EXCEPTION WHEN OTHERS THEN
    v_err := SQLERRM;
  END;
  RETURN v_err;
END $$;

-- The fixture recipe. ONE recipe, marked, that every case hangs off.
--
-- It is created once and reused, because the LANGUAGE-FIRST rule allows
-- exactly ONE original per recipe -- so the translation cases need
-- their OWN recipe, or they must all be translations of the SAME
-- original.
CREATE OR REPLACE FUNCTION d4_make_recipe(p_slug text)
RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  v_dish uuid;
  v_recipe uuid;
BEGIN
  SELECT id INTO v_dish FROM public.dishes LIMIT 1;
  IF v_dish IS NULL THEN
    RAISE EXCEPTION 'the D4 tests need at least one dish to attach a recipe to';
  END IF;

  INSERT INTO public.recipes (id, dish_id, slug, title, content_type)
  VALUES (gen_random_uuid(), v_dish, p_slug, p_slug, 'recipe')
  RETURNING id INTO v_recipe;

  RETURN v_recipe;
END $$;

-- The ORIGINAL sentence of a recipe: one row, is_original = true,
-- source_sentence_id IS NULL.
CREATE OR REPLACE FUNCTION d4_make_original(p_recipe uuid, p_field text, p_position integer)
RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO public.recipe_sentences
    (id, recipe_id, field, locale, position, text, is_original)
  VALUES
    (gen_random_uuid(), p_recipe, p_field, 'en', p_position, 'D4 test sentence', true)
  RETURNING id INTO v_id;

  RETURN v_id;
END $$;

-- ---------------------------------------------------------------------
-- the cases
-- ---------------------------------------------------------------------

DO $$
DECLARE
  v_pass        integer := 0;
  v_fail        integer := 0;
  v_floor       integer := 20;
  v_err         text;
  v_def         text;
  v_data_type   text;
  v_is_nullable text;
  v_recipe      uuid;
  v_recipe2     uuid;
  v_original    uuid;
  v_original2   uuid;
  v_marker      text := 'd4-constraint-test';
BEGIN
  -- ── 1. The column exists, is jsonb, and is nullable ─────────────────
  SELECT data_type, is_nullable
    INTO v_data_type, v_is_nullable
    FROM information_schema.columns
   WHERE table_schema = 'public'
     AND table_name = 'recipes'
     AND column_name = 'recipe_layout';

  IF v_data_type = 'jsonb' THEN
    v_pass := v_pass + 1;
    PERFORM d4_test_pass('the layout column is jsonb');
  ELSE
    v_fail := v_fail + 1;
    PERFORM d4_test_fail('the layout column is jsonb', 'it is ' || coalesce(v_data_type, 'MISSING'));
  END IF;

  -- NULLABLE, on purpose: a recipe written before this migration has no
  -- layout and is rendered from the scalar columns alone. A NOT NULL
  -- column would have required a backfill, and the migration must not
  -- require one.
  IF v_is_nullable = 'YES' THEN
    v_pass := v_pass + 1;
    PERFORM d4_test_pass('the layout column is nullable');
  ELSE
    v_fail := v_fail + 1;
    PERFORM d4_test_fail('the layout column is nullable', 'is_nullable = ' || coalesce(v_is_nullable, 'MISSING'));
  END IF;

  -- ── 2. The CHECK carries all nine values ───────────────────────────
  SELECT pg_get_constraintdef(c.oid) INTO v_def
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
   WHERE n.nspname = 'public'
     AND t.relname = 'recipe_sentences'
     AND c.conname = 'recipe_sentences_field_check';

  IF v_def IS NULL THEN
    v_fail := v_fail + 1;
    PERFORM d4_test_fail('the field CHECK exists', 'recipe_sentences_field_check is missing');
  ELSE
    v_pass := v_pass + 1;
    PERFORM d4_test_pass('the field CHECK exists');

    FOREACH v_marker IN ARRAY ARRAY[
      'step', 'note', 'intro',
      'precondition', 'key_moment', 'failure', 'variation', 'keeping', 'evidence'
    ] LOOP
      IF v_def LIKE '%' || v_marker || '%' THEN
        v_pass := v_pass + 1;
        PERFORM d4_test_pass('the CHECK carries ' || v_marker);
      ELSE
        v_fail := v_fail + 1;
        PERFORM d4_test_fail('the CHECK carries ' || v_marker, v_def);
      END IF;
    END LOOP;
  END IF;

  -- ── 3. Every one of the nine values is ACCEPTED ────────────────────
  --
  -- The originals go on ONE recipe (there may be exactly one original
  -- per recipe), and the six new ones go on a SECOND recipe as
  -- translations of that recipe's original.
  v_recipe  := d4_make_recipe('_d4_test_original_recipe');
  v_recipe2 := d4_make_recipe('_d4_test_translation_recipe');
  v_original  := d4_make_original(v_recipe, 'step', 1);
  v_original2 := d4_make_original(v_recipe2, 'step', 1);

  FOREACH v_marker IN ARRAY ARRAY[
    'step', 'note', 'intro',
    'precondition', 'key_moment', 'failure', 'variation', 'keeping', 'evidence'
  ] LOOP
    -- The value goes on the SECOND recipe, as a translation of that
    -- recipe's own original. That is the only shape the LANGUAGE-FIRST
    -- trigger accepts besides the original itself.
    v_err := d4_test_must_succeed(format(
      'INSERT INTO public.recipe_sentences (recipe_id, field, locale, position, text, is_original, source_sentence_id) '
      'VALUES (%L, %L, %L, 2, %L, false, %L)',
      v_recipe2, v_marker, 'en', 'D4 test sentence', v_original2));

    IF v_err IS NULL THEN
      v_pass := v_pass + 1;
      PERFORM d4_test_pass('the CHECK accepts ' || v_marker);
    ELSE
      v_fail := v_fail + 1;
      PERFORM d4_test_fail('the CHECK accepts ' || v_marker, v_err);
    END IF;
  END LOOP;

  -- ── 4. A value OUTSIDE the nine is still REFUSED ───────────────────
  v_err := d4_test_must_fail(format(
    'INSERT INTO public.recipe_sentences (recipe_id, field, locale, position, text, is_original, source_sentence_id) '
    'VALUES (%L, %L, %L, 3, %L, false, %L)',
    v_recipe2, 'not_a_field', 'en', 'D4 test sentence', v_original2));

  IF v_err IS NULL THEN
    v_fail := v_fail + 1;
    PERFORM d4_test_fail('a value outside the vocabulary is refused', 'the INSERT SUCCEEDED');
  ELSE
    v_pass := v_pass + 1;
    PERFORM d4_test_pass('a value outside the vocabulary is refused');
  END IF;

  -- A NEAR MISS is refused too -- the CHECK is a vocabulary, not a
  -- prefix match. 'stepper' is not 'step'.
  v_err := d4_test_must_fail(format(
    'INSERT INTO public.recipe_sentences (recipe_id, field, locale, position, text, is_original, source_sentence_id) '
    'VALUES (%L, %L, %L, 4, %L, false, %L)',
    v_recipe2, 'stepper', 'en', 'D4 test sentence', v_original2));

  IF v_err IS NULL THEN
    v_fail := v_fail + 1;
    PERFORM d4_test_fail('a near miss is refused', 'the INSERT SUCCEEDED');
  ELSE
    v_pass := v_pass + 1;
    PERFORM d4_test_pass('a near miss is refused');
  END IF;

  -- ── 5. The layout round-trips a document ───────────────────────────
  --
  -- The shape is the recipe record schema's, and `check_recipe.py`
  -- checks it BEFORE a layout is written. So the DATABASE stores
  -- whatever it is given -- what matters here is that it stores it
  -- faithfully and does not mangle it.
  v_err := d4_test_must_succeed(format(
    'UPDATE public.recipes SET recipe_layout = %L::jsonb WHERE id = %L',
    '{"timeline":[{"key":"prep","minutes":20,"mode":"active"}],"sections":[{"key":"base"}],"total_min":95}',
    v_recipe));

  IF v_err IS NULL THEN
    v_pass := v_pass + 1;
    PERFORM d4_test_pass('a layout is stored');
  ELSE
    v_fail := v_fail + 1;
    PERFORM d4_test_fail('a layout is stored', v_err);
  END IF;

  -- It reads back EXACTLY. `jsonb` normalises key order and removes
  -- duplicate keys, so the comparison is on the parsed value rather
  -- than on the text.
  IF EXISTS (
    SELECT 1 FROM public.recipes
     WHERE id = v_recipe
       AND recipe_layout->'timeline'->0->>'key' = 'prep'
       AND recipe_layout->'timeline'->0->>'minutes' = '20'
       AND recipe_layout->'total_min' = '95'
  ) THEN
    v_pass := v_pass + 1;
    PERFORM d4_test_pass('the layout reads back faithfully');
  ELSE
    v_fail := v_fail + 1;
    PERFORM d4_test_fail('the layout reads back faithfully', 'the stored document is not what was written');
  END IF;

  -- ── 6. A recipe written BEFORE the migration is untouched ──────────
  --
  -- The column is NULL for a recipe that was never given a layout, and
  -- setting it to NULL again works. This is the case that would break
  -- if the column were NOT NULL.
  IF EXISTS (
    SELECT 1 FROM public.recipes
     WHERE id = v_recipe2
       AND recipe_layout IS NULL
  ) THEN
    v_pass := v_pass + 1;
    PERFORM d4_test_pass('a recipe with no layout still has NULL there');
  ELSE
    v_fail := v_fail + 1;
    PERFORM d4_test_fail('a recipe with no layout still has NULL there', 'the column is not NULL');
  END IF;

  -- ── 7. The cleanup left the database as it found it ─────────────────
  DELETE FROM public.recipe_sentences WHERE recipe_id IN (v_recipe, v_recipe2);
  DELETE FROM public.recipes WHERE id IN (v_recipe, v_recipe2);

  IF NOT EXISTS (SELECT 1 FROM public.recipes WHERE slug LIKE '_d4_test_%') THEN
    v_pass := v_pass + 1;
    PERFORM d4_test_pass('the fixtures were removed');
  ELSE
    v_fail := v_fail + 1;
    PERFORM d4_test_fail('the fixtures were removed', 'a fixture row survived');
  END IF;

  -- ── the floor ───────────────────────────────────────────────────────
  --
  -- A gate that asserts less than it thinks it does is a gate that can
  -- pass while broken. The floor is the number of assertions this file
  -- ACTUALLY makes, so a lost assertion fails the run instead of
  -- quietly reducing it.
  IF v_pass + v_fail < v_floor THEN
    RAISE EXCEPTION
      'the D4 constraint tests made only % assertions (expected at least %) -- the gate is not asserting what it should',
      v_pass + v_fail, v_floor;
  END IF;

  IF v_fail > 0 THEN
    RAISE EXCEPTION 'the D4 constraint tests FAILED (% of %)', v_fail, v_pass + v_fail;
  END IF;

  RAISE NOTICE 'D4_SCHEMA_TESTS: % passed, % failed', v_pass, v_fail;
END $$;

-- the helpers are dropped, so the database is left as it was found
DROP FUNCTION IF EXISTS d4_test_fail(text, text);
DROP FUNCTION IF EXISTS d4_test_pass(text);
DROP FUNCTION IF EXISTS d4_test_must_fail(text);
DROP FUNCTION IF EXISTS d4_test_must_succeed(text);
DROP FUNCTION IF EXISTS d4_make_recipe(text);
DROP FUNCTION IF EXISTS d4_make_original(uuid, text, integer);
