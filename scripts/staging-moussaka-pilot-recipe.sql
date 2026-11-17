-- The MOUSSAKA PILOT RECIPE -- STAGING ONLY.
--
-- WHAT THIS IS
-- ------------
-- A disposable recipe row on the STAGING database, so that the recipe
-- DETAIL page (/recipes/<slug>) can be verified -- direct load and
-- refresh -- before PR #250 is merged.
--
-- WHY IT IS NEEDED
-- ----------------
-- The live database has ZERO published recipes:
--
--     SELECT count(*) FROM recipe_published;   --> 0
--
-- and the staging database had zero too. So `/recipes` renders its
-- honest empty state, and `/recipes/<slug>` has no page to serve.
--
-- That is correct behaviour, but it means the recipe detail route
-- cannot be PROVEN from a site with no recipes. The route is built
-- from the `recipe_published` view -- a recipe that is not published
-- is not built, so it is a 404 on the site -- which is the publish
-- gate applied to the page as well as to the API. Verifying the route
-- needs ONE published recipe.
--
-- WHY IT NEEDS ALL FIVE ROWS
-- --------------------------
-- The `recipe_published` view (db/migrations/0053) requires:
--
--   (1) the DISH is published
--   (2) the recipe has at least one SENTENCE
--   (3) every sentence has a VERIFIED-OR-PUBLISHED statement
--   (4) that statement is SCOPED to this recipe
--       (subject_type = 'recipe', subject_id = this recipe's id)
--   (5) the recipe is neither archived nor rejected
--
-- So a recipe row on its own is NOT enough. It needs the sentence, the
-- claim, and a statement about the recipe that is published.
--
-- SAFETY
-- ------
-- This script is written to run against the STAGING database only. It
-- refuses to run against production: the guard is the database name.
-- The staging database is `gustale_staging` on the TEST postgres
-- (127.0.0.1:5434), which is a disposable instance -- `gustale_staging`
-- does not exist on the production cluster at all.
--
-- It is DELETABLE: the rows are tagged with the slug
-- 'moussaka-pilot-recipe' and the cleanup is at the bottom.

\set ON_ERROR_STOP on

-- ─── the guard: this must be the staging database ───────────────────────
DO $$
DECLARE
  current_db text := current_database();
BEGIN
  IF current_db <> 'gustale_staging' THEN
    RAISE EXCEPTION 'REFUSING TO RUN: this script is for gustale_staging, not %', current_db;
  END IF;
END $$;

-- ─── 1. the recipe row ──────────────────────────────────────────────────
INSERT INTO public.recipes (
  id, dish_id, slug, title, content_type,
  servings, prep_minutes, cook_minutes, difficulty,
  status, review_state, created_by, last_edited_by,
  created_at, updated_at, is_primary
)
SELECT
  gen_random_uuid(),
  d.id,
  'moussaka-pilot-recipe',
  'Moussaka (the pilot recipe)',
  'recipe',
  6, 40, 60, 2,
  'published', 'approved', 'staging-pilot', 'staging-pilot',
  now(), now(), true
FROM public.dishes d
WHERE d.slug = 'moussaka-greek' AND d.status = 'published'
ON CONFLICT (slug) DO NOTHING;

-- ─── 2. the sentence ────────────────────────────────────────────────────
-- anchor_status and is_original are NOT NULL, and the CHECK
-- `recipe_sentences_original_source_check` requires that an original
-- sentence has NO source_sentence_id. 'full' + true satisfies both.
INSERT INTO public.recipe_sentences (
  id, recipe_id, field, locale, position, text,
  anchor_status, is_original, created_at, updated_at
)
SELECT
  gen_random_uuid(), r.id, 'step', 'en', 1,
  'Layer the aubergine, the minced meat and the béchamel, then bake until the top is golden.',
  'full', true, now(), now()
FROM public.recipes r
WHERE r.slug = 'moussaka-pilot-recipe'
  AND NOT EXISTS (
    SELECT 1 FROM public.recipe_sentences rs WHERE rs.recipe_id = r.id
  );

-- ─── 3. the statement, scoped to THIS recipe ───────────────────────────
--
-- The column shape is the one the existing published statements use:
-- a predicate_id (not a predicate string), a value_type of 'literal',
-- a non-empty qualifiers jsonb, a claim_class, and an evidence_status.
--
-- The predicate is the same one the atlas fixture statements use
-- (acb20804-6462-4d6a-9e64-4aa4750d7bca) -- it is a real predicate row
-- in this database, so the statement is well-formed rather than
-- pointing at nothing.
INSERT INTO public.statements (
  id, subject_type, subject_id, predicate_id,
  value_type, value_literal,
  qualifiers, claim_class, status, evidence_status,
  created_at, updated_at
)
SELECT
  gen_random_uuid(), 'recipe', r.id,
  'acb20804-6462-4d6a-9e64-4aa4750d7bca',
  'literal', 'a staging pilot record, not a published claim',
  '{"note": "A STAGING-ONLY demonstration record. It exists so the recipe detail route can be verified. It is not a historical claim about this dish, and it must not be published.", "isFixture": true, "provenance": "staging_pilot"}'::jsonb,
  'documented', 'published', 'provisional',
  now(), now()
FROM public.recipes r
WHERE r.slug = 'moussaka-pilot-recipe'
  AND NOT EXISTS (
    SELECT 1 FROM public.statements st
    WHERE st.subject_type = 'recipe' AND st.subject_id = r.id
  );

-- ─── 4. the claim linking the sentence to the statement ────────────────
INSERT INTO public.recipe_claims (recipe_sentence_id, statement_id, is_primary, created_at)
SELECT rs.id, st.id, true, now()
FROM public.recipes r
JOIN public.recipe_sentences rs ON rs.recipe_id = r.id
JOIN public.statements st
  ON st.subject_type = 'recipe' AND st.subject_id = r.id
WHERE r.slug = 'moussaka-pilot-recipe'
  AND NOT EXISTS (
    SELECT 1 FROM public.recipe_claims rc
    WHERE rc.recipe_sentence_id = rs.id AND rc.statement_id = st.id
  );

-- ─── the proof ──────────────────────────────────────────────────────────
\echo '--- the recipe_published view now sees:'
SELECT r.slug, r.title, r.servings, r.review_state, r.confidence
FROM public.recipe_published r
WHERE r.slug = 'moussaka-pilot-recipe';

\echo '--- the staging API should now list 1 recipe:'
\echo '--- (curl http://127.0.0.1:4004/api/recipes)'

-- ─── the cleanup ────────────────────────────────────────────────────────
-- To remove the pilot:
--
--   DELETE FROM public.recipes WHERE slug = 'moussaka-pilot-recipe';
--
-- (the sentence, claim and statement cascade from the recipe)
