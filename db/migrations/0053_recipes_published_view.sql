-- 0053_recipes_published_view.sql
--
-- Item 4 of the recipes task: the API's read model.
--
-- WHAT THIS MIGRATION DOES
-- ------------------------
-- It creates ONE view, `recipe_published`, and the indexes the API's
-- queries need. It writes NO content rows, and it changes NO existing
-- object. It is additive.
--
-- WHY A VIEW IS NEEDED AT ALL
-- ----------------------------
-- ADR-007-A1 §8.4 says the auto-publish function "does not update
-- `recipes.status` directly. The recipe becomes published because its
-- STATEMENTS are published".
--
-- That is right, and it is what 0052 implements: `recipe_auto_publish()`
-- transitions the recipe's STATEMENTS through `statement_set_status()`,
-- and it never writes `recipes.status`.
--
-- But 0052 also created the `recipe_publishable` view, whose predicate
-- requires `r.status = 'published'` AND `r.review_state = 'approved'` --
-- and NOTHING EVER SETS `recipes.status` to 'published'. The auto-publish
-- function does not, and the API must not (the API never publishes;
-- see below). So `recipe_publishable` is a view over a column that no
-- code path writes, and it is empty forever.
--
-- So there are TWO DIFFERENT FACTS, and only one of them was stored:
--
--   * the recipe's EDITORIAL state (`recipes.status`, `review_state`) --
--     what a human sets through the review queue. Real, and stored.
--
--   * the recipe's PUBLISHEDNESS -- whether the recipe's own content is
--     live to a reader. That is a fact about the STATEMENTS, and it was
--     never stored at all.
--
-- This migration stores the second one as a DERIVED VIEW, and the API
-- reads it. `recipes.status` stays what it has always been: the
-- editorial state, and the API does not write it.
--
-- WHY NOT A COLUMN
-- ----------------
-- A column would be a third copy of a derived fact, and it could
-- disagree with the statements. The whole point of the direction of
-- dependency -- statements published -> recipe published -- is that
-- there is exactly ONE fact, and it is the statements' status. A view
-- cannot drift.
--
-- THE PREDICATE
-- -------------
-- A recipe is published when ALL of these hold:
--
--   1. the dish is published (ADR-007 Decision 3, condition 1);
--   2. the recipe has at least one sentence;
--   3. EVERY sentence of the recipe carries a claim whose statement is
--      at 'verified' or 'published'  (ADR-007's publish gate: "a recipe
--      sentence with no verified statement cannot be published");
--   4. EVERY one of those statements is ABOUT THIS RECIPE --
--      `st.subject_type = 'recipe' AND st.subject_id = r.id`.
--
-- Condition 4 is the SCOPE CLAUSE, and it is the one that matters
-- here. `statements` is SHARED with the Atlas (ADR-007-A1 §8.5): the
-- Atlas dish and place statements live in the same table as the recipe
-- statements. Without condition 4, an Atlas statement could make a
-- recipe look published -- and the 0052 proof block reproduces exactly
-- that exploit (a recipe claim naming an Atlas dish statement, carried
-- from 'draft' to 'published'). The trigger on `recipe_claims` refuses
-- the bad LINK, but a view must not depend on a trigger being present:
-- a superuser, `session_replication_role = replica`, or a later
-- migration can drop a trigger. So the view carries the rule itself.
--
-- Condition 3 is the SAME predicate 0052's `recipe_publishable` uses,
-- and it is the same predicate the Atlas dish route uses to derive its
-- "unevidenced" badge (`apps/api/src/routes/dishes.ts`): a statement at
-- 'verified' or 'published'. Using the same test means a recipe and a
-- dish cannot disagree about what "evidenced" means.
--
-- WHY `r.status` IS NOT IN THE PREDICATE
-- ---------------------------------------
-- Because the API does not publish, and the auto-publish function does
-- not publish it either (ADR-007-A1 §8.4). If the predicate required
-- `r.status = 'published'`, the view would be empty forever -- which
-- is exactly what `recipe_publishable` is today.
--
-- The EDITORIAL state is still enforced, one level up: a recipe whose
-- review_state is 'rejected' must not be served. So the view filters
-- `r.review_state <> 'rejected'` -- a rejection is an editorial act and
-- it is honoured. `recipes.status = 'archived'` is likewise honoured:
-- an archived recipe is not served.
--
-- So the predicate is:
--
--   the dish is published
--   AND the recipe is not archived
--   AND the recipe is not rejected
--   AND the recipe has a sentence
--   AND every sentence has a verified-or-published statement
--   AND every such statement is about THIS recipe
--
-- THE CONFIDENCE COLUMN
-- ---------------------
-- `confidence` is the COMPUTED level, from `recipe_confidence`. It is
-- NULL when the recipe has never been through the publish path -- and
-- NULL means "not computed", NOT "low". The API reports it as such.
--
-- The confidence is a JOIN to `recipe_confidence`, not a
-- re-computation: the computation lives in `recipe_compute_confidence()`
-- (0052), and the publish path, the UI and this view must read the SAME
-- number (ADR-007-A1 §8.3).
--
-- `published_at` is the moment the recipe's LAST statement reached a
-- published state, so the API can sort by it and the sitemap can order
-- by it. It is NULL for a recipe whose statements are only 'verified'.
--
-- THE INDEXES
-- -----------
-- The API's three queries are:
--
--   * the FEED: published recipes, newest first, paginated.
--   * the HUB: a dish's published recipes.
--   * the DETAIL: one recipe by slug.
--
-- So the indexes are on `recipes(slug)` (the detail), on
-- `recipes(dish_id)` (the hub), and on `recipe_sentences(recipe_id)`
-- and `recipe_claims(recipe_sentence_id)` (the joins the view makes).
-- 0052 created NO index on the recipe tables at all, so these are
-- added here.

BEGIN;

-- ─────────────────────────────────────────────────────────────────────
-- THE VIEW
-- ─────────────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW public.recipe_published AS
SELECT r.id,
       r.slug,
       r.title,
       r.dish_id,
       r.content_type,
       r.servings,
       r.prep_minutes,
       r.cook_minutes,
       r.review_state,
       -- THE COMPUTED CONFIDENCE. NULL when the recipe has never been
       -- through the publish path.
       rc.level AS confidence,
       -- WHEN THE RECIPE WENT LIVE: the moment its last statement
       -- reached 'published'.
       (SELECT max(st.published_at)
          FROM public.recipe_sentences rs2
          JOIN public.recipe_claims rc2 ON rc2.recipe_sentence_id = rs2.id
          JOIN public.statements st ON st.id = rc2.statement_id
         WHERE rs2.recipe_id = r.id
           AND st.subject_type = 'recipe'
           AND st.subject_id = r.id
           AND st.status = 'published') AS published_at
  FROM public.recipes r
  JOIN public.dishes d ON d.id = r.dish_id
  LEFT JOIN public.recipe_confidence rc ON rc.recipe_id = r.id
 WHERE d.status = 'published'
   -- THE EDITORIAL STATE IS HONOURED. An archived or rejected recipe
   -- is not served -- but its 'published' status is NOT what makes it
   -- live, and it is NOT set by the publish path.
   AND r.status <> 'archived'
   AND r.review_state <> 'rejected'
   -- (2) IT HAS A SENTENCE.
   AND EXISTS (SELECT 1 FROM public.recipe_sentences rs
                WHERE rs.recipe_id = r.id)
   -- (3) EVERY SENTENCE HAS A VERIFIED-OR-PUBLISHED STATEMENT.
   --
   -- The `NOT EXISTS` shape is 0052's `recipe_publishable` shape, and
   -- it is the right one: a recipe with NO sentence at all would pass
   -- a bare `NOT EXISTS` (there is no offending row), so condition (2)
   -- above is what carries that case.
   AND NOT EXISTS (
         SELECT 1
           FROM public.recipe_sentences rs
           LEFT JOIN public.recipe_claims rcx ON rcx.recipe_sentence_id = rs.id
           LEFT JOIN public.statements st ON st.id = rcx.statement_id
          WHERE rs.recipe_id = r.id
            AND (st.id IS NULL
                 OR st.status NOT IN ('verified','published')
                 -- (4) THE SCOPE CLAUSE. An Atlas statement can never
                 -- make a recipe look published.
                 OR st.subject_type IS DISTINCT FROM 'recipe'
                 OR st.subject_id IS DISTINCT FROM r.id));

COMMENT ON VIEW public.recipe_published IS
'The DERIVED published-ness of a recipe (ADR-007-A1 §8.4): a recipe is live because its STATEMENTS are published, not because a column says so. The scope clause -- every statement must be about THIS recipe -- is what keeps a shared Atlas statement from making a recipe look published (ADR-007-A1 §8.5). `confidence` is the COMPUTED level and is NULL when the recipe has never been through the publish path.';

-- ─────────────────────────────────────────────────────────────────────
-- THE INDEXES
-- ─────────────────────────────────────────────────────────────────────

-- The DETAIL: one recipe by slug. 0052 created the UNIQUE constraint
-- on `recipes.slug`, which is the index for THIS table's own lookups,
-- but the view's join to `dishes` and the confidence join both need
-- the recipe row by id, and the slug index does not help there.
CREATE INDEX IF NOT EXISTS recipes_slug_idx
  ON public.recipes (slug);

-- The HUB: a dish's recipes. The view filters on `dish_id` and the
-- editorial state, so the index carries both.
CREATE INDEX IF NOT EXISTS recipes_dish_status_idx
  ON public.recipes (dish_id, status);

-- The view's joins. `recipe_sentences(recipe_id)` is walked once per
-- recipe (the EXISTS) and once per recipe (the published_at
-- subquery); `recipe_claims(recipe_sentence_id)` is the link between
-- them.
CREATE INDEX IF NOT EXISTS recipe_sentences_recipe_idx
  ON public.recipe_sentences (recipe_id);

CREATE INDEX IF NOT EXISTS recipe_claims_sentence_idx
  ON public.recipe_claims (recipe_sentence_id);

-- The FEED: published recipes, newest first. The view sorts by
-- `published_at`, which is a computed column of the view, so the
-- index that helps is on the underlying statements.
CREATE INDEX IF NOT EXISTS recipe_publish_log_recipe_idx
  ON public.recipe_publish_log (recipe_id);

CREATE INDEX IF NOT EXISTS statements_subject_idx_recipe
  ON public.statements (subject_type, subject_id)
  WHERE subject_type = 'recipe';

-- ═══════════════════════════════════════════════════════════════════════
-- THE PROOF
-- ═══════════════════════════════════════════════════════════════════════
--
-- The migration must be PROVEN, not merely applied: it carries its own
-- proof inside its transaction, so a failed proof rolls the migration
-- back and leaves no trace.
--
-- WHAT IS PROVEN
-- --------------
--
--   (1) the view exists, and its columns are the ones the API reads;
--
--   (2) THE CONTROL -- a recipe whose sentence carries its OWN
--       published statement IS in the view. Without this, every other
--       case would be vacuously true;
--
--   (3) a recipe whose statement is only 'draft' is NOT in the view;
--
--   (4) THE SCOPE CASE -- a recipe whose sentence carries an ATLAS
--       statement (published) is NOT in the view. This is the case
--       that matters: it is the exploit 0052's proof block reproduces,
--       and the view must refuse it on its own, without depending on
--       the trigger on `recipe_claims`;
--
--   (5) the editorial state is honoured -- a rejected recipe is not in
--       the view, even though its statements are published;
--
--   (6) the confidence is the COMPUTED one, and it is NULL for a recipe
--       that has never been through the publish path;
--
--   (7) the migration leaves NO content rows behind.
--
-- THE FIXTURE
-- -----------
-- The proof builds a small world and then DELETES it. The statements
-- are moved to 'published' with the trigger's own gate bypassed -- the
-- proof runs as the migration role, which owns the tables, and the
-- `statements_status_gate_trg` trigger is disabled for the duration of
-- the fixture ONLY. That is deliberate: the proof is about the VIEW's
-- predicate, not about the publish path, and the publish path has its
-- own proof in 0052.
--
-- The alternative -- driving the real `statement_set_status()` -- would
-- require a verified publish credential for a human account, which does
-- not exist in the chain's database, and it would make the view's proof
-- depend on the credential path. The view's predicate is what is under
-- test here, so the fixture sets the statement status directly.

DO $proof$
DECLARE
  v_dish        uuid;
  v_predicate   uuid;
  v_recipe      uuid;
  v_other       uuid;
  v_sentence    uuid;
  v_stmt_own    uuid;
  v_stmt_atlas  uuid;
  v_stmt_draft  uuid;
  v_sent_other  uuid;
  v_in_view     integer;
  v_level       text;
BEGIN
  -- ── THE FIXTURE ────────────────────────────────────────────────────
  SELECT id INTO v_dish FROM public.dishes WHERE status = 'published' LIMIT 1;
  IF v_dish IS NULL THEN
    RAISE EXCEPTION 'the proof needs a published dish -- there is none';
  END IF;
  SELECT id INTO v_predicate FROM public.predicates LIMIT 1;

  INSERT INTO public.recipes (id, dish_id, slug, title)
  VALUES ('e3000000-0000-0000-0000-000000000001', v_dish,
          'the-0053-proof-recipe', 'the 0053 proof recipe')
  RETURNING id INTO v_recipe;

  -- A second recipe on the same dish, for the "not in the view" cases.
  INSERT INTO public.recipes (id, dish_id, slug, title)
  VALUES ('e3000000-0000-0000-0000-000000000002', v_dish,
          'the-0053-proof-other', 'the 0053 proof other')
  RETURNING id INTO v_other;

  INSERT INTO public.recipe_sentences (id, recipe_id, field, locale, position, text, is_original)
  VALUES ('e3000000-0000-0000-0000-000000000003', v_recipe, 'step', 'en', 1,
          'the 0053 proof sentence', true)
  RETURNING id INTO v_sentence;

  INSERT INTO public.recipe_sentences (id, recipe_id, field, locale, position, text, is_original)
  VALUES ('e3000000-0000-0000-0000-000000000004', v_other, 'step', 'en', 1,
          'the 0053 proof other sentence', true)
  RETURNING id INTO v_sent_other;

  -- THE RECIPE'S OWN STATEMENT -- about the recipe.
  INSERT INTO public.statements (
    id, subject_type, subject_id, predicate_id, value_type, value_literal,
    value_literal_type, claim_class, status
  ) VALUES (
    'e3000000-0000-0000-0000-000000000005', 'recipe', v_recipe, v_predicate,
    'literal', 'the recipe own value', 'text', 'documented', 'draft'
  )
  RETURNING id INTO v_stmt_own;

  -- AN ATLAS STATEMENT -- about the DISH, so it belongs to the Atlas.
  INSERT INTO public.statements (
    id, subject_type, subject_id, predicate_id, value_type, value_literal,
    value_literal_type, claim_class, status
  ) VALUES (
    'e3000000-0000-0000-0000-000000000006', 'dish', v_dish, v_predicate,
    'literal', 'an atlas value', 'text', 'documented', 'draft'
  )
  RETURNING id INTO v_stmt_atlas;

  -- A DRAFT statement about the second recipe.
  INSERT INTO public.statements (
    id, subject_type, subject_id, predicate_id, value_type, value_literal,
    value_literal_type, claim_class, status
  ) VALUES (
    'e3000000-0000-0000-0000-000000000007', 'recipe', v_other, v_predicate,
    'literal', 'a draft value', 'text', 'documented', 'draft'
  )
  RETURNING id INTO v_stmt_draft;

  -- THE CLAIMS. The recipe's own sentence claims the recipe's own
  -- statement. The Atlas claim is forced in LATER -- after the control
  -- case -- because the control case is about the recipe being
  -- published on its OWN evidence, and an Atlas claim on the same
  -- sentence legitimately makes it NOT published.
  INSERT INTO public.recipe_claims (recipe_sentence_id, statement_id)
  VALUES (v_sentence, v_stmt_own);

  INSERT INTO public.recipe_claims (recipe_sentence_id, statement_id)
  VALUES (v_sent_other, v_stmt_draft);

  -- THE STATUSES. The statements are moved directly, because this proof
  -- is about the VIEW's predicate and not about the publish path (which
  -- has its own proof in 0052).
  --
  -- The gate trigger is NOT disabled with `ALTER TABLE`, because that
  -- is refused here: `statements` carries a DEFERRABLE INITIALLY
  -- DEFERRED constraint trigger, so the statement inserts above left
  -- pending trigger events, and PostgreSQL refuses to ALTER a table
  -- with pending events ("cannot ALTER TABLE statements because it has
  -- pending trigger events").
  --
  -- The gate has a SANCTIONED bypass, and it is the right one: the
  -- transaction-local GUC `gustale.statement_gate`, which 0027's
  -- `statement_set_status()` and 0052's `statement_set_status()` both
  -- set around their own writes. `set_config(..., true)` is
  -- transaction-local, so the flag cannot leak past the migration's
  -- COMMIT.
  PERFORM set_config('gustale.statement_gate', 'on', true);
  UPDATE public.statements SET status = 'published', published_at = now()
   WHERE id IN (v_stmt_own, v_stmt_atlas);
  PERFORM set_config('gustale.statement_gate', 'off', true);

  -- ── (1) THE VIEW EXISTS ───────────────────────────────────────────
  IF to_regclass('public.recipe_published') IS NULL THEN
    RAISE EXCEPTION 'public.recipe_published does not exist';
  END IF;

  -- ── (2) THE CONTROL ───────────────────────────────────────────────
  --
  -- The recipe whose OWN statement is published MUST be in the view.
  -- Without this, every "not in the view" case below would be
  -- vacuously true.
  SELECT count(*) INTO v_in_view
    FROM public.recipe_published
   WHERE id = v_recipe;

  IF v_in_view <> 1 THEN
    RAISE EXCEPTION
      'the control failed: a recipe whose OWN published statement it carries is NOT in recipe_published (% rows). Every "not in the view" case below would be vacuously true.', v_in_view;
  END IF;
  RAISE NOTICE 'CONFIRMED: the control -- a recipe with its own published statement IS published';

  -- ── (3) A DRAFT STATEMENT IS NOT PUBLISHED ────────────────────────
  SELECT count(*) INTO v_in_view
    FROM public.recipe_published
   WHERE id = v_other;

  IF v_in_view <> 0 THEN
    RAISE EXCEPTION
      'a recipe whose statement is still a DRAFT is in recipe_published (% rows) -- the evidence predicate is not in force', v_in_view;
  END IF;
  RAISE NOTICE 'CONFIRMED: a recipe whose statement is a draft is NOT published';

  -- ── (4) THE SCOPE CASE ────────────────────────────────────────────
  --
  -- Now the recipe's sentence ALSO carries a claim on an ATLAS
  -- statement -- the statement is about the DISH, not about the
  -- recipe. The Atlas statement is published too.
  --
  -- The recipe must NOT be in the view. Its OWN statement is
  -- published, so by the evidence predicate alone it WOULD be
  -- published; the SCOPE CLAUSE is what stops it, because the sentence
  -- now carries a claim whose statement is not about this recipe.
  --
  -- THE ATLAS CLAIM IS FORCED IN WITH THE TRIGGER DISABLED, because the
  -- trigger refuses it -- which is correct, and is 0052's proof. The
  -- view must refuse it too, WITHOUT the trigger, because a trigger
  -- can be dropped by a superuser, by `session_replication_role =
  -- replica`, or by a later migration.
  --
  -- The trigger is disabled the way 0052's own proof disables it --
  -- `ALTER TABLE ... DISABLE TRIGGER` -- which works here because
  -- `recipe_claims_subject_trg` is DEFERRABLE INITIALLY IMMEDIATE, so
  -- it leaves no pending events.
  EXECUTE 'ALTER TABLE public.recipe_claims DISABLE TRIGGER recipe_claims_subject_trg';
  BEGIN
    INSERT INTO public.recipe_claims (recipe_sentence_id, statement_id)
    VALUES (v_sentence, v_stmt_atlas);
  EXCEPTION WHEN OTHERS THEN
    -- The statements-side guard may still refuse it. That is fine --
    -- but then the bad row is not there, and the case below would be
    -- vacuous. The assertion on the row catches it.
    NULL;
  END;
  EXECUTE 'ALTER TABLE public.recipe_claims ENABLE TRIGGER recipe_claims_subject_trg';

  -- The bad link MUST be there, or this case proves nothing.
  IF NOT EXISTS (
    SELECT 1 FROM public.recipe_claims
     WHERE recipe_sentence_id = v_sentence AND statement_id = v_stmt_atlas
  ) THEN
    RAISE EXCEPTION
      'the Atlas claim could not be forced in even with the trigger disabled -- the scope case cannot run';
  END IF;

  SELECT count(*) INTO v_in_view
    FROM public.recipe_published
   WHERE id = v_recipe;

  IF v_in_view <> 0 THEN
    RAISE EXCEPTION
      'a recipe carrying a claim on an ATLAS published statement IS in recipe_published (% rows) -- the scope clause is not in force, and an Atlas statement can make a recipe look published', v_in_view;
  END IF;
  RAISE NOTICE 'CONFIRMED: the scope clause -- an Atlas statement cannot make a recipe look published';

  -- ── (5) THE EDITORIAL STATE IS HONOURED ───────────────────────────
  --
  -- Remove the Atlas claim, so the recipe's own statement alone
  -- carries it, and the recipe is in the view again. Then REJECT it:
  -- a rejected recipe must not be served, even though its statements
  -- are published.
  DELETE FROM public.recipe_claims
   WHERE recipe_sentence_id = v_sentence AND statement_id = v_stmt_atlas;

  SELECT count(*) INTO v_in_view
    FROM public.recipe_published
   WHERE id = v_recipe;

  IF v_in_view <> 1 THEN
    RAISE EXCEPTION
      'the recipe left the view after the Atlas claim was removed (% rows) -- the control no longer holds', v_in_view;
  END IF;

  UPDATE public.recipes SET review_state = 'rejected' WHERE id = v_recipe;

  SELECT count(*) INTO v_in_view
    FROM public.recipe_published
   WHERE id = v_recipe;

  IF v_in_view <> 0 THEN
    RAISE EXCEPTION
      'a REJECTED recipe is in recipe_published (% rows) -- the editorial state is not honoured', v_in_view;
  END IF;
  RAISE NOTICE 'CONFIRMED: the editorial state is honoured -- a rejected recipe is not published';

  -- And an ARCHIVED one is not served either.
  UPDATE public.recipes SET review_state = 'unreviewed', status = 'archived' WHERE id = v_recipe;

  SELECT count(*) INTO v_in_view
    FROM public.recipe_published
   WHERE id = v_recipe;

  IF v_in_view <> 0 THEN
    RAISE EXCEPTION
      'an ARCHIVED recipe is in recipe_published (% rows) -- the editorial state is not honoured', v_in_view;
  END IF;
  RAISE NOTICE 'CONFIRMED: the editorial state is honoured -- an archived recipe is not published';

  -- Put it back, for the confidence case.
  UPDATE public.recipes SET status = 'draft' WHERE id = v_recipe;

  -- ── (6) THE CONFIDENCE IS THE COMPUTED ONE ────────────────────────
  --
  -- The recipe has never been through the publish path, so it has no
  -- row in `recipe_confidence` -- and the view reports NULL. NULL means
  -- "not computed", NOT "low".
  SELECT rc.level INTO v_level
    FROM public.recipe_published p
    LEFT JOIN public.recipe_confidence rc ON rc.recipe_id = p.id
   WHERE p.id = v_recipe;

  IF v_level IS NOT NULL THEN
    RAISE EXCEPTION
      'the confidence of a recipe that has never been published is % -- it must be NULL, meaning "not computed"', v_level;
  END IF;
  RAISE NOTICE 'CONFIRMED: the confidence is NULL for a recipe that has never been through the publish path';

  -- Now the other direction: a stored confidence IS reported. The
  -- stored row is the COMPUTED one -- 0052's `recipe_auto_publish()`
  -- writes it, and it writes the level the computation returned, not a
  -- hand-set value.
  INSERT INTO public.recipe_confidence (recipe_id, level, conditions_met, computed_at)
  VALUES (v_recipe, 'medium', '{}'::jsonb, now());

  SELECT p.confidence INTO v_level
    FROM public.recipe_published p
   WHERE p.id = v_recipe;

  IF v_level IS DISTINCT FROM 'medium' THEN
    RAISE EXCEPTION
      'the view reports the confidence as % -- it must report the stored computed level', coalesce(v_level, '(null)');
  END IF;
  RAISE NOTICE 'CONFIRMED: the view reports the computed confidence';

  -- ── (7) NOTHING IS LEFT BEHIND ────────────────────────────────────
  --
  -- The migration writes NO content rows. The fixture is removed, and
  -- the count is asserted -- not assumed.
  --
  -- `SET CONSTRAINTS ALL IMMEDIATE` FIRST. `statements_subject_exists_trg`
  -- is a DEFERRABLE INITIALLY DEFERRED CONSTRAINT TRIGGER, so it fires
  -- at COMMIT, not at the delete. Without this, the recipe is deleted
  -- in the same transaction and the deferred check runs at COMMIT,
  -- finds no recipe, and the WHOLE TRANSACTION FAILS with "no recipe
  -- with id ...".
  --
  -- Firing the deferred checks NOW -- while the recipe still exists --
  -- makes them pass on the rows as they stand, and leaves nothing
  -- pending for the commit.
  --
  -- It is issued inside an inner DO block, because `SET CONSTRAINTS` is
  -- a transaction-control command and plpgsql requires such commands to
  -- run with EXECUTE. The inner block uses its OWN dollar-quote tag:
  -- a nested plain two-dollar tag would TERMINATE the enclosing block.
  DO $inner$
  BEGIN
    EXECUTE 'SET CONSTRAINTS ALL IMMEDIATE';
  END;
  $inner$;

  DELETE FROM public.recipe_publish_log WHERE recipe_id IN (v_recipe, v_other);
  DELETE FROM public.recipe_confidence WHERE recipe_id IN (v_recipe, v_other);
  DELETE FROM public.recipe_claims
   WHERE recipe_sentence_id IN (v_sentence, v_sent_other);
  DELETE FROM public.claim_citations WHERE statement_id IN (v_stmt_own, v_stmt_atlas, v_stmt_draft);
  DELETE FROM public.statement_status_log WHERE statement_id IN (v_stmt_own, v_stmt_atlas, v_stmt_draft);
  DELETE FROM public.statements WHERE id IN (v_stmt_own, v_stmt_atlas, v_stmt_draft);
  DELETE FROM public.recipe_ingredients WHERE recipe_id IN (v_recipe, v_other);
  DELETE FROM public.recipe_sentences WHERE recipe_id IN (v_recipe, v_other);
  DELETE FROM public.recipe_translations WHERE recipe_id IN (v_recipe, v_other);
  DELETE FROM public.recipes WHERE id IN (v_recipe, v_other);

  IF EXISTS (SELECT 1 FROM public.recipes WHERE id IN (v_recipe, v_other)) THEN
    RAISE EXCEPTION 'the proof left a recipe row behind -- the migration must write no content rows';
  END IF;
  IF EXISTS (SELECT 1 FROM public.statements WHERE id IN (v_stmt_own, v_stmt_atlas, v_stmt_draft)) THEN
    RAISE EXCEPTION 'the proof left a statement row behind -- the migration must write no content rows';
  END IF;

  RAISE NOTICE 'CONFIRMED: the migration left no content rows behind';
END;
$proof$;

-- The marker the CI checks for. The CI workflow asserts this line is
-- present, so a migration that silently did not run its proof cannot
-- pass.
DO $marker$
BEGIN
  RAISE NOTICE 'RECIPES_PUBLISHED_VIEW_OK=1';
END;
$marker$;

COMMIT;
