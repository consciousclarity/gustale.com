-- STAGE B -- the moussaka-greek pantry list, as draft ingredient rows.
--
-- GENERATED FILE -- do not hand-edit. Regenerate with:
--   python3 scripts/generate_pantry_seed.py \
--     docs/PANTRY-LIST-moussaka-greek.csv \
--     packages/db/seed-moussaka-ingredients.sql
--
-- SOURCE OF TRUTH: docs/PANTRY-LIST-moussaka-greek.csv
-- (the Stage A pantry list the owner approved at Gate A)
--
-- 24 rows in the approved list: 20 new, 4 reused.
--
-- EVERY row is status='draft' with an EMPTY description. A
-- description is a claim, and a claim needs a source
-- (ADR-007-A1 4.3). Publication is Gate C and is a separate step.
--
-- The `category` of every row is a slug from the 435-row
-- `ingredient_categories` vocabulary, which migration 0054 now
-- enforces with the `ingredients_category_fk` foreign key. A
-- category that is not a vocabulary row cannot be stored.

BEGIN;

-- ── The 4 rows that already exist ─────────────────────────────
--
-- These are already pointed at by `dish_ingredients`, so they are
-- NOT re-inserted (that would duplicate them). Their `category`
-- is NULL today; this fills it in. The WHERE clause makes each
-- statement idempotent: re-running the seed does not touch a row
-- whose category is already correct.

-- eggplant
UPDATE public.ingredients
   SET category = 'solanacea',
       updated_at = now()
 WHERE slug = 'eggplant'
   AND category IS DISTINCT FROM 'solanacea';

-- lamb-mince
UPDATE public.ingredients
   SET category = 'mammals-meat',
       updated_at = now()
 WHERE slug = 'lamb-mince'
   AND category IS DISTINCT FROM 'mammals-meat';

-- tomato
UPDATE public.ingredients
   SET category = 'other-fruiting-vegetables',
       updated_at = now()
 WHERE slug = 'tomato'
   AND category IS DISTINCT FROM 'other-fruiting-vegetables';

-- bechamel
UPDATE public.ingredients
   SET category = 'savoury-sauces',
       updated_at = now()
 WHERE slug = 'bechamel'
   AND category IS DISTINCT FROM 'savoury-sauces';

-- ── The new rows ─────────────────────────────────────────────
--
-- ON CONFLICT (slug) DO NOTHING: the slug is the identity, so
-- re-running the seed is a no-op rather than an error.

-- onion  (onions-and-similar)
INSERT INTO public.ingredients (canonical_name, slug, category, status)
VALUES ('Onion', 'onion', 'onions-and-similar', 'draft')
ON CONFLICT (slug) DO NOTHING;

-- garlic  (garlic-and-similar)
INSERT INTO public.ingredients (canonical_name, slug, category, status)
VALUES ('Garlic', 'garlic', 'garlic-and-similar', 'draft')
ON CONFLICT (slug) DO NOTHING;

-- potato  (potatoes-and-similar)
INSERT INTO public.ingredients (canonical_name, slug, category, status)
VALUES ('Potato', 'potato', 'potatoes-and-similar', 'draft')
ON CONFLICT (slug) DO NOTHING;

-- carrot  (carrots-and-similar)
INSERT INTO public.ingredients (canonical_name, slug, category, status)
VALUES ('Carrot', 'carrot', 'carrots-and-similar', 'draft')
ON CONFLICT (slug) DO NOTHING;

-- whole-egg  (whole-eggs)
INSERT INTO public.ingredients (canonical_name, slug, category, status)
VALUES ('Egg', 'whole-egg', 'whole-eggs', 'draft')
ON CONFLICT (slug) DO NOTHING;

-- whole-milk  (milk)
INSERT INTO public.ingredients (canonical_name, slug, category, status)
VALUES ('Milk', 'whole-milk', 'milk', 'draft')
ON CONFLICT (slug) DO NOTHING;

-- wheat-flour  (cereal-and-cereal-like-flours)
INSERT INTO public.ingredients (canonical_name, slug, category, status)
VALUES ('Flour', 'wheat-flour', 'cereal-and-cereal-like-flours', 'draft')
ON CONFLICT (slug) DO NOTHING;

-- plain-butter  (butter)
INSERT INTO public.ingredients (canonical_name, slug, category, status)
VALUES ('Butter', 'plain-butter', 'butter', 'draft')
ON CONFLICT (slug) DO NOTHING;

-- olive-oil  (vegetable-fats-and-oils-edible)
INSERT INTO public.ingredients (canonical_name, slug, category, status)
VALUES ('Olive oil', 'olive-oil', 'vegetable-fats-and-oils-edible', 'draft')
ON CONFLICT (slug) DO NOTHING;

-- table-salt  (seasonings)
INSERT INTO public.ingredients (canonical_name, slug, category, status)
VALUES ('Salt', 'table-salt', 'seasonings', 'draft')
ON CONFLICT (slug) DO NOTHING;

-- black-pepper  (fruit-spices)
INSERT INTO public.ingredients (canonical_name, slug, category, status)
VALUES ('Black pepper', 'black-pepper', 'fruit-spices', 'draft')
ON CONFLICT (slug) DO NOTHING;

-- bay-leaf  (dried-herbs)
INSERT INTO public.ingredients (canonical_name, slug, category, status)
VALUES ('Bay leaf', 'bay-leaf', 'dried-herbs', 'draft')
ON CONFLICT (slug) DO NOTHING;

-- nutmeg  (seed-spices)
INSERT INTO public.ingredients (canonical_name, slug, category, status)
VALUES ('Nutmeg', 'nutmeg', 'seed-spices', 'draft')
ON CONFLICT (slug) DO NOTHING;

-- cinnamon  (bark-spices)
INSERT INTO public.ingredients (canonical_name, slug, category, status)
VALUES ('Cinnamon', 'cinnamon', 'bark-spices', 'draft')
ON CONFLICT (slug) DO NOTHING;

-- allspice  (fruit-spices)
INSERT INTO public.ingredients (canonical_name, slug, category, status)
VALUES ('Allspice', 'allspice', 'fruit-spices', 'draft')
ON CONFLICT (slug) DO NOTHING;

-- kefalotyri  (ripened-cheese)
INSERT INTO public.ingredients (canonical_name, slug, category, status)
VALUES ('Kefalotyri', 'kefalotyri', 'ripened-cheese', 'draft')
ON CONFLICT (slug) DO NOTHING;

-- red-wine  (beverage)
INSERT INTO public.ingredients (canonical_name, slug, category, status)
VALUES ('Red wine', 'red-wine', 'beverage', 'draft')
ON CONFLICT (slug) DO NOTHING;

-- tomato-paste  (processed-tomato-products)
INSERT INTO public.ingredients (canonical_name, slug, category, status)
VALUES ('Tomato paste', 'tomato-paste', 'processed-tomato-products', 'draft')
ON CONFLICT (slug) DO NOTHING;

-- parsley  (aromatic-herbs)
INSERT INTO public.ingredients (canonical_name, slug, category, status)
VALUES ('Parsley', 'parsley', 'aromatic-herbs', 'draft')
ON CONFLICT (slug) DO NOTHING;

-- beef-mince  (beef)
INSERT INTO public.ingredients (canonical_name, slug, category, status)
VALUES ('Beef, minced (lamb alternative)', 'beef-mince', 'beef', 'draft')
ON CONFLICT (slug) DO NOTHING;

-- ── The dish's own ingredient rows ───────────────────────────
--
-- The pantry list is a list of INGREDIENTS, but a dish is what
-- actually uses them. This section writes the `dish_ingredients`
-- rows for `moussaka-greek`, and it is where `is_optional` from
-- the approved list becomes real: the schema column
-- `dish_ingredients.is_optional` is what says an ingredient is
-- a variation rather than a requirement.
--
-- The 4 rows that already exist are UPDATED to carry their
-- `is_optional`; the other 20 are INSERTed. `position` continues
-- the existing 0..3, so the seed does not renumber what is
-- already published.
--
-- `variant_id` is NULL for every row: a variant would mean the
-- ingredient is a PREPARED FORM of a base ingredient
-- (ADR-007-A1 3.5), and the pantry list treats the béchamel as
-- its own ingredient row rather than a variant of milk+flour.

-- ── The existing 4 rows: set their is_optional ──────────────
-- eggplant  (is_optional = false)
UPDATE public.dish_ingredients di
   SET is_optional = false
  FROM public.dishes d, public.ingredients i
 WHERE di.dish_id = d.id
   AND di.ingredient_id = i.id
   AND d.slug = 'moussaka-greek'
   AND i.slug = 'eggplant'
   AND di.is_optional IS DISTINCT FROM false;

-- lamb-mince  (is_optional = false)
UPDATE public.dish_ingredients di
   SET is_optional = false
  FROM public.dishes d, public.ingredients i
 WHERE di.dish_id = d.id
   AND di.ingredient_id = i.id
   AND d.slug = 'moussaka-greek'
   AND i.slug = 'lamb-mince'
   AND di.is_optional IS DISTINCT FROM false;

-- tomato  (is_optional = false)
UPDATE public.dish_ingredients di
   SET is_optional = false
  FROM public.dishes d, public.ingredients i
 WHERE di.dish_id = d.id
   AND di.ingredient_id = i.id
   AND d.slug = 'moussaka-greek'
   AND i.slug = 'tomato'
   AND di.is_optional IS DISTINCT FROM false;

-- bechamel  (is_optional = false)
UPDATE public.dish_ingredients di
   SET is_optional = false
  FROM public.dishes d, public.ingredients i
 WHERE di.dish_id = d.id
   AND di.ingredient_id = i.id
   AND d.slug = 'moussaka-greek'
   AND i.slug = 'bechamel'
   AND di.is_optional IS DISTINCT FROM false;

-- ── The new rows: the dish's ingredient list ───────────────
-- onion  (position 4, is_optional = false)
INSERT INTO public.dish_ingredients
       (dish_id, ingredient_id, position, is_optional)
SELECT d.id, i.id, 4, false
  FROM public.dishes d
  JOIN public.ingredients i ON i.slug = 'onion'
 WHERE d.slug = 'moussaka-greek'
ON CONFLICT (dish_id, ingredient_id, variant_id) DO NOTHING;

-- garlic  (position 5, is_optional = false)
INSERT INTO public.dish_ingredients
       (dish_id, ingredient_id, position, is_optional)
SELECT d.id, i.id, 5, false
  FROM public.dishes d
  JOIN public.ingredients i ON i.slug = 'garlic'
 WHERE d.slug = 'moussaka-greek'
ON CONFLICT (dish_id, ingredient_id, variant_id) DO NOTHING;

-- potato  (position 6, is_optional = false)
INSERT INTO public.dish_ingredients
       (dish_id, ingredient_id, position, is_optional)
SELECT d.id, i.id, 6, false
  FROM public.dishes d
  JOIN public.ingredients i ON i.slug = 'potato'
 WHERE d.slug = 'moussaka-greek'
ON CONFLICT (dish_id, ingredient_id, variant_id) DO NOTHING;

-- carrot  (position 7, is_optional = true)
INSERT INTO public.dish_ingredients
       (dish_id, ingredient_id, position, is_optional)
SELECT d.id, i.id, 7, true
  FROM public.dishes d
  JOIN public.ingredients i ON i.slug = 'carrot'
 WHERE d.slug = 'moussaka-greek'
ON CONFLICT (dish_id, ingredient_id, variant_id) DO NOTHING;

-- whole-egg  (position 8, is_optional = false)
INSERT INTO public.dish_ingredients
       (dish_id, ingredient_id, position, is_optional)
SELECT d.id, i.id, 8, false
  FROM public.dishes d
  JOIN public.ingredients i ON i.slug = 'whole-egg'
 WHERE d.slug = 'moussaka-greek'
ON CONFLICT (dish_id, ingredient_id, variant_id) DO NOTHING;

-- whole-milk  (position 9, is_optional = false)
INSERT INTO public.dish_ingredients
       (dish_id, ingredient_id, position, is_optional)
SELECT d.id, i.id, 9, false
  FROM public.dishes d
  JOIN public.ingredients i ON i.slug = 'whole-milk'
 WHERE d.slug = 'moussaka-greek'
ON CONFLICT (dish_id, ingredient_id, variant_id) DO NOTHING;

-- wheat-flour  (position 10, is_optional = false)
INSERT INTO public.dish_ingredients
       (dish_id, ingredient_id, position, is_optional)
SELECT d.id, i.id, 10, false
  FROM public.dishes d
  JOIN public.ingredients i ON i.slug = 'wheat-flour'
 WHERE d.slug = 'moussaka-greek'
ON CONFLICT (dish_id, ingredient_id, variant_id) DO NOTHING;

-- plain-butter  (position 11, is_optional = false)
INSERT INTO public.dish_ingredients
       (dish_id, ingredient_id, position, is_optional)
SELECT d.id, i.id, 11, false
  FROM public.dishes d
  JOIN public.ingredients i ON i.slug = 'plain-butter'
 WHERE d.slug = 'moussaka-greek'
ON CONFLICT (dish_id, ingredient_id, variant_id) DO NOTHING;

-- olive-oil  (position 12, is_optional = false)
INSERT INTO public.dish_ingredients
       (dish_id, ingredient_id, position, is_optional)
SELECT d.id, i.id, 12, false
  FROM public.dishes d
  JOIN public.ingredients i ON i.slug = 'olive-oil'
 WHERE d.slug = 'moussaka-greek'
ON CONFLICT (dish_id, ingredient_id, variant_id) DO NOTHING;

-- table-salt  (position 13, is_optional = false)
INSERT INTO public.dish_ingredients
       (dish_id, ingredient_id, position, is_optional)
SELECT d.id, i.id, 13, false
  FROM public.dishes d
  JOIN public.ingredients i ON i.slug = 'table-salt'
 WHERE d.slug = 'moussaka-greek'
ON CONFLICT (dish_id, ingredient_id, variant_id) DO NOTHING;

-- black-pepper  (position 14, is_optional = false)
INSERT INTO public.dish_ingredients
       (dish_id, ingredient_id, position, is_optional)
SELECT d.id, i.id, 14, false
  FROM public.dishes d
  JOIN public.ingredients i ON i.slug = 'black-pepper'
 WHERE d.slug = 'moussaka-greek'
ON CONFLICT (dish_id, ingredient_id, variant_id) DO NOTHING;

-- bay-leaf  (position 15, is_optional = false)
INSERT INTO public.dish_ingredients
       (dish_id, ingredient_id, position, is_optional)
SELECT d.id, i.id, 15, false
  FROM public.dishes d
  JOIN public.ingredients i ON i.slug = 'bay-leaf'
 WHERE d.slug = 'moussaka-greek'
ON CONFLICT (dish_id, ingredient_id, variant_id) DO NOTHING;

-- nutmeg  (position 16, is_optional = false)
INSERT INTO public.dish_ingredients
       (dish_id, ingredient_id, position, is_optional)
SELECT d.id, i.id, 16, false
  FROM public.dishes d
  JOIN public.ingredients i ON i.slug = 'nutmeg'
 WHERE d.slug = 'moussaka-greek'
ON CONFLICT (dish_id, ingredient_id, variant_id) DO NOTHING;

-- cinnamon  (position 17, is_optional = false)
INSERT INTO public.dish_ingredients
       (dish_id, ingredient_id, position, is_optional)
SELECT d.id, i.id, 17, false
  FROM public.dishes d
  JOIN public.ingredients i ON i.slug = 'cinnamon'
 WHERE d.slug = 'moussaka-greek'
ON CONFLICT (dish_id, ingredient_id, variant_id) DO NOTHING;

-- allspice  (position 18, is_optional = false)
INSERT INTO public.dish_ingredients
       (dish_id, ingredient_id, position, is_optional)
SELECT d.id, i.id, 18, false
  FROM public.dishes d
  JOIN public.ingredients i ON i.slug = 'allspice'
 WHERE d.slug = 'moussaka-greek'
ON CONFLICT (dish_id, ingredient_id, variant_id) DO NOTHING;

-- kefalotyri  (position 19, is_optional = false)
INSERT INTO public.dish_ingredients
       (dish_id, ingredient_id, position, is_optional)
SELECT d.id, i.id, 19, false
  FROM public.dishes d
  JOIN public.ingredients i ON i.slug = 'kefalotyri'
 WHERE d.slug = 'moussaka-greek'
ON CONFLICT (dish_id, ingredient_id, variant_id) DO NOTHING;

-- red-wine  (position 20, is_optional = true)
INSERT INTO public.dish_ingredients
       (dish_id, ingredient_id, position, is_optional)
SELECT d.id, i.id, 20, true
  FROM public.dishes d
  JOIN public.ingredients i ON i.slug = 'red-wine'
 WHERE d.slug = 'moussaka-greek'
ON CONFLICT (dish_id, ingredient_id, variant_id) DO NOTHING;

-- tomato-paste  (position 21, is_optional = true)
INSERT INTO public.dish_ingredients
       (dish_id, ingredient_id, position, is_optional)
SELECT d.id, i.id, 21, true
  FROM public.dishes d
  JOIN public.ingredients i ON i.slug = 'tomato-paste'
 WHERE d.slug = 'moussaka-greek'
ON CONFLICT (dish_id, ingredient_id, variant_id) DO NOTHING;

-- parsley  (position 22, is_optional = true)
INSERT INTO public.dish_ingredients
       (dish_id, ingredient_id, position, is_optional)
SELECT d.id, i.id, 22, true
  FROM public.dishes d
  JOIN public.ingredients i ON i.slug = 'parsley'
 WHERE d.slug = 'moussaka-greek'
ON CONFLICT (dish_id, ingredient_id, variant_id) DO NOTHING;

-- beef-mince  (position 23, is_optional = true)
INSERT INTO public.dish_ingredients
       (dish_id, ingredient_id, position, is_optional)
SELECT d.id, i.id, 23, true
  FROM public.dishes d
  JOIN public.ingredients i ON i.slug = 'beef-mince'
 WHERE d.slug = 'moussaka-greek'
ON CONFLICT (dish_id, ingredient_id, variant_id) DO NOTHING;

COMMIT;
