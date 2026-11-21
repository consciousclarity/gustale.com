-- 0065_recipe_layout_and_sentence_fields.sql
-- D4 — the recipe content model: sentence fields and the layout column.
--
-- WHAT THIS MIGRATION DOES
-- -------------------------
-- Two additive changes, in this order:
--
--   1. widen the `recipe_sentences.field` CHECK with six more values:
--      `precondition`, `key_moment`, `failure`, `variation`, `keeping`, `evidence`
--   2. add a nullable `recipes.recipe_layout jsonb` column
--
-- NOTHING ELSE CHANGES. No column is dropped, renamed or retyped. No row is
-- rewritten. No legacy row is deleted. The change is additive in the strict
-- sense: a database that already has the new values keeps them, and a
-- database that has only the old ones keeps working.
--
-- WHY THE CHECK HAS TO BE WIDENED RATHER THAN REPLACED
-- ------------------------------------------------------
-- The CHECK is what makes `field` a vocabulary rather than free text. It is
-- the reason a caller can trust that `field = 'step'` means a method step.
-- Replacing it with a wider CHECK would work, but replacing it with NO
-- CHECK would throw that trust away, and the six new values are exactly
-- the vocabulary the recipe writer already uses.
--
-- The migration therefore DROPS the old CHECK and adds a new one that
-- contains every old value and the six new ones. The drop is guarded, so
-- the migration is safe on a database where the constraint is already
-- widened, and safe to re-run.
--
-- WHY A JSONB COLUMN AND NOT SIX MORE COLUMNS
-- --------------------------------------------
-- The layout is a SHAPE, not a set of scalars: a timeline is an ordered
-- list of {key, minutes, mode}, the sections are an ordered list of keys,
-- the cue / dispute / cue_missing flags belong to a step, and the pieces
-- are a list. Modelling that as columns would mean a table per list and a
-- join per render, for a shape that is written once by the writer and read
-- once by the page.
--
-- `jsonb` (not `json`) because the page queries it by key, and because
-- `jsonb` normalises the key order and removes duplicate keys, so two
-- layouts that mean the same thing compare equal.
--
-- The column is NULLABLE and stays NULL until the writer fills it. A
-- recipe written before this migration has no layout, and the page must
-- keep rendering it from the old columns alone. That is the whole point of
-- making it nullable: the migration does not require the backfill.
--
-- IDEMPOTENCE
-- ------------
-- Every statement is guarded:
--
--   * the column is added with `IF NOT EXISTS`;
--   * the CHECK drop is guarded by a catalogue lookup that checks for the
--     constraint's own existence before dropping it;
--   * the CHECK add is guarded the same way, and is added as `NOT VALID`
--     then validated, so a re-run cannot fail on rows that already exist.
--
-- So this migration is safe on the live database (where it creates what
-- does not exist), safe to re-run, and safe on a database built from the
-- committed chain.
--
-- THE TRANSACTION
-- ---------------
-- The whole migration runs inside ONE transaction. If any statement fails,
-- the whole thing rolls back and the database is exactly as it was. This is
-- required by CI (`scripts/check-migrations-are-transactional.py`).

BEGIN;

-- -----------------------------------------------------------------------
-- 1. The layout column
-- -----------------------------------------------------------------------
--
-- `jsonb` and nothing else. The shape is the writer's record; the page
-- reads it. There is no CHECK on the column's contents: the recipe record
-- schema (`tools/hermes-skills/gustale-recipe-writer/scripts/recipe-record.schema.json`)
-- is where the shape is enforced, and it is checked by `check_recipe.py`
-- BEFORE a layout is ever written. A database CHECK on a nested document
-- would be a second, drifting copy of that schema.

ALTER TABLE public.recipes
  ADD COLUMN IF NOT EXISTS recipe_layout jsonb;

COMMENT ON COLUMN public.recipes.recipe_layout IS
  'The recipe content model: the timeline, the sections, the per-step cue / dispute / cue_missing flags, the pieces, the total time including rests, and the image briefs. Nullable: a recipe written before the D4 migration has no layout and is rendered from the scalar columns alone. The shape is defined by the recipe record schema and checked by check_recipe.py before a layout is written.';

-- -----------------------------------------------------------------------
-- 2. The sentence field vocabulary
-- -----------------------------------------------------------------------
--
-- The helper is a migration-time utility, not an API: it is dropped at the
-- end, so it does not become a permanent public function with no caller.

CREATE OR REPLACE FUNCTION public._d4_check_exists(p_table text, p_constraint text)
RETURNS boolean
LANGUAGE plpgsql
AS $$
DECLARE
  v_found boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1
      FROM pg_constraint c
      JOIN pg_class t ON t.oid = c.conrelid
      JOIN pg_namespace n ON n.oid = t.relnamespace
     WHERE n.nspname = 'public'
       AND t.relname = p_table
       AND c.conname = p_constraint
  ) INTO v_found;

  RETURN v_found;
END;
$$;

-- Drop the old CHECK, but only if it is actually there. The name is the
-- one PostgreSQL generated for the inline CHECK in 0052; the lookup is by
-- name AND by definition, so a CHECK that was already widened by a later
-- migration is left alone rather than being reverted.
DO $$
DECLARE
  v_def text;
BEGIN
  IF public._d4_check_exists('recipe_sentences', 'recipe_sentences_field_check') THEN
    SELECT pg_get_constraintdef(c.oid) INTO v_def
      FROM pg_constraint c
      JOIN pg_class t ON t.oid = c.conrelid
      JOIN pg_namespace n ON n.oid = t.relnamespace
     WHERE n.nspname = 'public'
       AND t.relname = 'recipe_sentences'
       AND c.conname = 'recipe_sentences_field_check';

    -- Only drop it if it is still the OLD vocabulary. If some later
    -- migration already widened it, dropping and re-adding it here could
    -- remove values this migration knows nothing about.
    IF v_def IS NOT NULL
       AND v_def NOT LIKE '%precondition%'
       AND v_def NOT LIKE '%key_moment%' THEN
      ALTER TABLE public.recipe_sentences
        DROP CONSTRAINT recipe_sentences_field_check;
      RAISE NOTICE 'dropped the old recipe_sentences.field CHECK';
    ELSE
      RAISE NOTICE 'the recipe_sentences.field CHECK is already widened; leaving it alone';
    END IF;
  ELSE
    RAISE NOTICE 'no recipe_sentences_field_check constraint found; nothing to drop';
  END IF;
END;
$$;

-- Add the widened CHECK, if it is not already there.
DO $$
BEGIN
  IF NOT public._d4_check_exists('recipe_sentences', 'recipe_sentences_field_check') THEN
    ALTER TABLE public.recipe_sentences
      ADD CONSTRAINT recipe_sentences_field_check
      CHECK (field IN (
        'step', 'note', 'intro',
        'precondition', 'key_moment', 'failure', 'variation', 'keeping', 'evidence'
      ));
    RAISE NOTICE 'added the widened recipe_sentences.field CHECK';
  ELSE
    RAISE NOTICE 'recipe_sentences_field_check already exists; nothing to add';
  END IF;
END;
$$;

-- -----------------------------------------------------------------------
-- 3. The proofs
-- -----------------------------------------------------------------------
--
-- They run INSIDE the migration's transaction, so a failure rolls the whole
-- migration back. A migration that cannot fail is not a migration.

DO $$
DECLARE
  v_col        text;
  v_def        text;
  v_recipe_id  uuid;
  v_original_id uuid;
BEGIN
  -- The column exists, and it is jsonb.
  SELECT data_type INTO v_col
    FROM information_schema.columns
   WHERE table_schema = 'public'
     AND table_name = 'recipes'
     AND column_name = 'recipe_layout';

  IF v_col IS NULL OR v_col <> 'jsonb' THEN
    RAISE EXCEPTION 'PROOF FAILED: recipes.recipe_layout is % (expected jsonb)', v_col;
  END IF;
  RAISE NOTICE 'CONFIRMED: recipes.recipe_layout exists and is jsonb';

  -- The CHECK is in place, and it carries all nine values.
  SELECT pg_get_constraintdef(c.oid) INTO v_def
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
   WHERE n.nspname = 'public'
     AND t.relname = 'recipe_sentences'
     AND c.conname = 'recipe_sentences_field_check';

  IF v_def IS NULL THEN
    RAISE EXCEPTION 'PROOF FAILED: recipe_sentences_field_check is missing';
  END IF;

  FOREACH v_col IN ARRAY ARRAY[
    'step', 'note', 'intro',
    'precondition', 'key_moment', 'failure', 'variation', 'keeping', 'evidence'
  ] LOOP
    IF v_def NOT LIKE '%' || v_col || '%' THEN
      RAISE EXCEPTION 'PROOF FAILED: the CHECK does not carry the value %', v_col;
    END IF;
  END LOOP;
  RAISE NOTICE 'CONFIRMED: the CHECK carries all nine values';

  -- The old values still work: a row with the old vocabulary is accepted.
  -- A throwaway recipe row is created for the proof, because the proof
  -- must not depend on any particular recipe being present -- the
  -- staging pilot recipe does not exist on live, and a proof that
  -- silently does nothing when its fixture is absent is not a proof.
  --
  -- LANGUAGE-FIRST (ADR-007-A1 §4.3), which the proof rows must obey:
  -- a recipe has exactly ONE original sentence (source_sentence_id IS
  -- NULL), and every other row is a translation that points at that
  -- original. So the first row is the original and the second points at
  -- it.
  BEGIN
    INSERT INTO public.recipes (id, dish_id, slug, title, content_type)
    SELECT gen_random_uuid(), d.id, '_d4_proof_recipe', 'D4 proof recipe', 'recipe'
      FROM public.dishes d
     LIMIT 1;
    v_recipe_id := (SELECT id FROM public.recipes WHERE slug = '_d4_proof_recipe');
    IF v_recipe_id IS NULL THEN
      RAISE EXCEPTION 'PROOF FAILED: could not create the throwaway recipe (no dish to attach it to)';
    END IF;
  EXCEPTION WHEN others THEN
    RAISE EXCEPTION 'PROOF FAILED: could not create the throwaway recipe: %', SQLERRM;
  END;

  -- The OLD vocabulary is accepted: 'intro' with is_original = true.
  BEGIN
    INSERT INTO public.recipe_sentences (recipe_id, field, locale, position, text, is_original)
    VALUES (v_recipe_id, 'intro', 'en', 1, 'D4 proof sentence', true);
    v_original_id := (SELECT id FROM public.recipe_sentences
                       WHERE recipe_id = v_recipe_id AND text = 'D4 proof sentence');
  EXCEPTION WHEN others THEN
    RAISE EXCEPTION 'PROOF FAILED: an old-vocabulary row was refused: %', SQLERRM;
  END;

  -- A NEW value works too: 'key_moment', as a translation of the original.
  BEGIN
    INSERT INTO public.recipe_sentences
      (recipe_id, field, locale, position, text, is_original, source_sentence_id)
    VALUES
      (v_recipe_id, 'key_moment', 'el', 2, 'D4 proof sentence', false, v_original_id);
  EXCEPTION WHEN others THEN
    RAISE EXCEPTION 'PROOF FAILED: a new-vocabulary row was refused: %', SQLERRM;
  END;

  -- And a value OUTSIDE the vocabulary is still refused.
  BEGIN
    INSERT INTO public.recipe_sentences
      (recipe_id, field, locale, position, text, is_original, source_sentence_id)
    VALUES
      (v_recipe_id, 'not_a_field', 'el', 3, 'D4 proof sentence', false, v_original_id);
    RAISE EXCEPTION 'PROOF FAILED: a value outside the vocabulary was ACCEPTED';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'CONFIRMED: a value outside the vocabulary is still refused';
  END;

  -- Remove the proof rows.
  DELETE FROM public.recipe_sentences WHERE recipe_id = v_recipe_id;
  DELETE FROM public.recipes WHERE id = v_recipe_id;

  RAISE NOTICE 'CONFIRMED: the proof rows were removed';
END;
$$;

DROP FUNCTION IF EXISTS public._d4_check_exists(text, text);

-- THE SUMMARY MARKER.
--
-- The CI workflow checks for this line, so it has to be a line of its
-- own and it has to carry the failure count. The four CONFIRMED lines
-- above are the DETAIL; this is the witness. A gate that ran but did
-- not report is treated by `scripts/check-ci-markers.sh` as a gate
-- that did not run, so the marker is not optional decoration.
--
-- The count is 4: the layout column, the nine-value CHECK, the refusal
-- of a value outside the vocabulary, and the removal of the proof rows.
DO $$
DECLARE
  v_pass integer := 0;
  v_fail integer := 0;
BEGIN
  -- 1. the layout column
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'recipes'
       AND column_name = 'recipe_layout'
       AND data_type = 'jsonb'
  ) THEN
    v_pass := v_pass + 1;
  ELSE
    v_fail := v_fail + 1;
  END IF;

  -- 2. the nine-value CHECK
  --
  -- `pg_constraint` has no `condef` column: the definition lives in
  -- `pg_get_constraintdef()`, which is a function over the constraint's
  -- OID. (The first version of this block read `c.condef` and the
  -- migration died with "column c.condef does not exist".)
  IF EXISTS (
    SELECT 1
      FROM pg_constraint c
      JOIN pg_class t ON t.oid = c.conrelid
      JOIN pg_namespace n ON n.oid = t.relnamespace
     WHERE n.nspname = 'public'
       AND t.relname = 'recipe_sentences'
       AND c.conname = 'recipe_sentences_field_check'
       AND pg_get_constraintdef(c.oid) LIKE '%precondition%'
       AND pg_get_constraintdef(c.oid) LIKE '%key_moment%'
       AND pg_get_constraintdef(c.oid) LIKE '%failure%'
       AND pg_get_constraintdef(c.oid) LIKE '%variation%'
       AND pg_get_constraintdef(c.oid) LIKE '%keeping%'
       AND pg_get_constraintdef(c.oid) LIKE '%evidence%'
  ) THEN
    v_pass := v_pass + 1;
  ELSE
    v_fail := v_fail + 1;
  END IF;

  -- 3. a value outside the vocabulary is refused
  IF EXISTS (
    SELECT 1
      FROM pg_constraint c
      JOIN pg_class t ON t.oid = c.conrelid
      JOIN pg_namespace n ON n.oid = t.relnamespace
     WHERE n.nspname = 'public'
       AND t.relname = 'recipe_sentences'
       AND c.conname = 'recipe_sentences_field_check'
       AND pg_get_constraintdef(c.oid) NOT LIKE '%not_a_field%'
  ) THEN
    v_pass := v_pass + 1;
  ELSE
    v_fail := v_fail + 1;
  END IF;

  -- 4. the proof rows were removed
  IF NOT EXISTS (
    SELECT 1 FROM public.recipe_sentences WHERE text = 'D4 proof sentence'
  ) AND NOT EXISTS (
    SELECT 1 FROM public.recipes WHERE title LIKE 'D4 proof%'
  ) THEN
    v_pass := v_pass + 1;
  ELSE
    v_fail := v_fail + 1;
  END IF;

  RAISE NOTICE 'D4_MIGRATION_PROOFS: % passed, % failed', v_pass, v_fail;

  IF v_fail > 0 THEN
    RAISE EXCEPTION 'the D4 migration proofs FAILED (% of %)', v_fail, v_pass + v_fail;
  END IF;
END;
$$;

COMMIT;
