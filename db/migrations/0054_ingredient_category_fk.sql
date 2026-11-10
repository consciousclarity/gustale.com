-- 0054_ingredient_category_fk.sql
--
-- The ingredient-category vocabulary, enforced.
--
-- WHAT THIS MIGRATION DOES
-- -----------------------
-- It adds ONE foreign key:
--
--     ingredients.category -> ingredient_categories.slug
--
-- and the index that supports it. It changes no column, deletes nothing,
-- and writes no content rows. It is additive.
--
-- WHY IT IS NEEDED
-- ----------------
-- The vocabulary decision is settled: option A -- the 435-row
-- `ingredient_categories` table IS the vocabulary (Gate 0 of
-- docs/RECIPES-INGREDIENT-BACKFILL-PLAN.md, and the owner's own words:
-- "the 435-row FoodOn table. No 'other' bucket").
--
-- But until now that decision was only a DOCUMENT. `ingredients.category`
-- was free text with no foreign key, so:
--
--   * any string could be stored in it;
--   * the TypeScript union (`ingredientCategory`, 12 coarse values) was a
--     THIRD vocabulary, and it disagreed with the table -- 11 of its 12
--     values existed as category rows and `other` did not exist at all;
--   * a category slug that was never in the vocabulary was
--     indistinguishable from a valid one.
--
-- So the review rule in ADR-007-A1 §3.3 -- "the category is from the
-- existing category vocabulary" -- could not be checked mechanically. It
-- was a judgement call. This migration makes it a lookup.
--
-- WHY A FOREIGN KEY AND NOT A CHECK
-- ---------------------------------
-- A CHECK constraint would have to enumerate all 435 slugs as literals,
-- and it would have to be re-written every time the vocabulary grew --
-- and the vocabulary DOES grow: it is a table, deliberately, so that a
-- category can be added without a schema migration (the same reason
-- `relation_types` is a table and not a CHECK enum; see the GUS-224 note
-- in packages/db/src/schema/index.ts).
--
-- A foreign key to `ingredient_categories.slug` says the same thing
-- WITHOUT the duplication: the vocabulary stays in one place, and the
-- constraint follows it. It is also enforced by the database rather than
-- by the application, so a script, a migration, a psql session or a
-- future API route cannot write a category that does not exist.
--
-- WHY A FOREIGN KEY ON A TEXT COLUMN
-- ---------------------------------
-- `ingredients.category` stores a SLUG, not a uuid. A foreign key may
-- reference any UNIQUE column, and `ingredient_categories.slug` is UNIQUE
-- in the database (`ingredient_categories_slug_key`, a UNIQUE CONSTRAINT
-- created by the GUS-242 seed). So the key points at the slug directly,
-- and no uuid is stored on the ingredient side -- which matters, because
-- the ingredient row is read by humans and by URLs, and a slug is the
-- thing they can read.
--
-- ON UPDATE CASCADE / ON DELETE SET NULL
-- --------------------------------------
-- ON UPDATE CASCADE: if a category's slug is ever corrected, the
-- ingredients that point at it follow. The vocabulary's slugs have never
-- been renamed in this repository -- every migration that touches
-- `ingredient_categories` writes `parent_id` or `wikidata_id`, never
-- `slug` -- but the cascade means a rename cannot silently orphan the
-- ingredients that use it.
--
-- ON DELETE SET NULL: an ingredient whose category is deleted is NOT
-- deleted. It becomes uncategorised, which is the state the column is in
-- today for every existing row (all of them are NULL). The alternative --
-- ON DELETE CASCADE -- would delete published ingredients because someone
-- removed a vocabulary row, which is not a thing a vocabulary edit should
-- ever be able to do.
--
-- THE PRE-FLIGHT
-- --------------
-- The key can only be added if every EXISTING `ingredients.category`
-- value is already a vocabulary slug. So the migration asserts that
-- BEFORE it adds the key, and refuses if it is not true. Measured on the
-- test database: 4 ingredient rows, 4 with a NULL category, 0 with a
-- value outside the vocabulary. On live: 5 rows, 5 NULL, 0 outside.
--
-- A NULL category is fine -- NULL is not a value, and the constraint
-- does not fire on NULL.
--
-- THE PROOF
-- ---------
-- The migration carries its own proof, inside its own transaction, and
-- FAILS if any part of it does not hold:
--
--   1. the vocabulary is present and non-empty;
--   2. every existing category value resolves against it;
--   3. a VALID category is accepted;
--   4. an INVALID category is refused;
--   5. setting an ingredient's category to NULL is still allowed;
--   6. the proof left no rows behind.

\set ON_ERROR_STOP on

BEGIN;

-- ─────────────────────────────────────────────────────────────────────
-- PRE-FLIGHT
-- ─────────────────────────────────────────────────────────────────────

DO $preflight$
DECLARE
  v_categories int;
  v_bad       int;
BEGIN
  -- (1) The vocabulary must be present. It is created by the GUS-242
  -- seed (0020) and the project rows by gus-014-118-dimensions.sql.
  -- If it is missing, the vocabulary decision cannot be enforced and
  -- the migration must refuse rather than create an empty table.
  SELECT count(*) INTO v_categories
    FROM public.ingredient_categories;

  IF v_categories < 1 THEN
    RAISE EXCEPTION
      'P1 failed: ingredient_categories is empty -- the vocabulary seed did not run';
  END IF;
  RAISE NOTICE 'PREFLIGHT OK: % category rows', v_categories;

  -- (2) Every existing category value must already resolve. The
  -- constraint can only be added if this is true, and saying so here
  -- gives the operator the offending slugs rather than a bare
  -- "violates foreign key constraint" from the ALTER.
  SELECT count(*) INTO v_bad
    FROM public.ingredients i
   WHERE i.category IS NOT NULL
     AND NOT EXISTS (
           SELECT 1 FROM public.ingredient_categories c
            WHERE c.slug = i.category);

  IF v_bad > 0 THEN
    RAISE EXCEPTION
      'P2 failed: % ingredient row(s) carry a category that is not in ingredient_categories -- fix them before this migration runs',
      v_bad;
  END IF;
  RAISE NOTICE 'PREFLIGHT OK: every existing category resolves against the vocabulary';
END;
$preflight$;

-- ─────────────────────────────────────────────────────────────────────
-- THE FOREIGN KEY
-- ─────────────────────────────────────────────────────────────────────

-- The index that supports it. Without it, every insert and every
-- category lookup on `ingredients` is a sequential scan of the
-- ingredient table. The key's own index on the referenced side
-- (`ingredient_categories_slug_key`) already exists.
CREATE INDEX IF NOT EXISTS ingredients_category_idx
  ON public.ingredients (category);

-- The constraint itself.
--
-- `NOT VALID` is deliberately NOT used: the pre-flight above has already
-- proved that every existing row resolves, so validating the constraint
-- now costs one sequential scan and leaves the table with a fully
-- enforced key. A `NOT VALID` constraint would still refuse new and
-- updated rows but would leave the old ones unchecked -- which is the
-- half-enforced state this migration exists to end.
ALTER TABLE public.ingredients
  ADD CONSTRAINT ingredients_category_fk
  FOREIGN KEY (category) REFERENCES public.ingredient_categories (slug)
  ON UPDATE CASCADE
  ON DELETE SET NULL;

COMMENT ON CONSTRAINT ingredients_category_fk ON public.ingredients IS
'The ingredient category is a SLUG from `ingredient_categories` -- the 435-row FoodOn vocabulary (option A, Gate 0 of docs/RECIPES-INGREDIENT-BACKFILL-PLAN.md). A category that does not exist in the vocabulary cannot be stored; an ingredient that fits none goes to the owner''s review queue, NOT to an ''other'' bucket -- there is none. ON UPDATE CASCADE follows a category rename; ON DELETE SET NULL detaches the ingredient rather than deleting it.';

-- ─────────────────────────────────────────────────────────────────────
-- THE PROOF
-- ─────────────────────────────────────────────────────────────────────

DO $proof$
DECLARE
  v_slug       text;
  v_id         uuid;
  v_count      int;
  v_valid_ok   int;
BEGIN
  -- (3) A VALID category is accepted.
  SELECT slug INTO v_slug
    FROM public.ingredient_categories
   WHERE slug = 'solanacea';

  IF v_slug IS NULL THEN
    RAISE EXCEPTION 'P3 failed: the test category ''solanacea'' is not in the vocabulary';
  END IF;

  INSERT INTO public.ingredients (slug, canonical_name, category, status)
  VALUES ('proof-ingredient-valid', 'Proof ingredient (valid)', v_slug, 'draft')
  RETURNING id INTO v_id;

  SELECT count(*) INTO v_valid_ok
    FROM public.ingredients
   WHERE id = v_id
     AND category = 'solanacea';

  IF v_valid_ok <> 1 THEN
    RAISE EXCEPTION 'P3 failed: a valid category was not accepted';
  END IF;
  RAISE NOTICE 'CONFIRMED: a valid category is accepted';

  -- (4) An INVALID category is refused.
  BEGIN
    INSERT INTO public.ingredients (slug, canonical_name, category, status)
    VALUES ('proof-ingredient-invalid', 'Proof ingredient (invalid)',
            'not-a-real-category', 'draft');
    RAISE EXCEPTION 'P4 failed: an invalid category was ACCEPTED -- the constraint is not enforced';
  EXCEPTION
    WHEN foreign_key_violation THEN
      RAISE NOTICE 'CONFIRMED: an invalid category is refused';
  END;

  -- (5) A NULL category is still allowed. NULL means "not yet
  -- categorised", and every existing row is in that state.
  UPDATE public.ingredients SET category = NULL WHERE id = v_id;

  SELECT count(*) INTO v_count
    FROM public.ingredients
   WHERE id = v_id
     AND category IS NULL;

  IF v_count <> 1 THEN
    RAISE EXCEPTION 'P5 failed: NULL was refused as a category';
  END IF;
  RAISE NOTICE 'CONFIRMED: a NULL category is still allowed';

  -- (6) Nothing is left behind. The migration writes NO content rows.
  DELETE FROM public.ingredients WHERE id = v_id;

  IF EXISTS (SELECT 1 FROM public.ingredients WHERE slug LIKE 'proof-ingredient-%') THEN
    RAISE EXCEPTION 'P6 failed: the proof left an ingredient row behind -- the migration must write no content rows';
  END IF;
  RAISE NOTICE 'CONFIRMED: the migration left no content rows behind';
END;
$proof$;

-- The marker the CI checks for. The CI workflow asserts this line is
-- present, so a migration that silently did not run its proof cannot
-- pass.
DO $marker$
BEGIN
  RAISE NOTICE 'INGREDIENT_CATEGORY_FK_OK=1';
END;
$marker$;

COMMIT;
