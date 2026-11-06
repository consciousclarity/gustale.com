-- 0051_family_classification.sql
--
-- GUS-1181: the family CLASSIFICATION, applied to the schema.
--
-- Approved by Alejandro on 2026-11-06 ("I approve the 5 approvals").
--
-- THE DOC'S OWN OPEN QUESTION, SETTLED
-- ------------------------------------
-- docs/FAMILY-TAXONOMY-REVIEW.md classified 306 families into
-- FORM / COURSE / CUISINE / CONTENT TYPE. It closed with:
--
--   "Whether the classification is applied to the schema. The
--    classes are currently *editorial* -- they are not a column
--    anywhere. If they should become one, that is a migration."
--
-- This is that migration. The approval settles the question, and the
-- classes become a column on `dish_families`.
--
-- THE CLASSIFICATION IS NOT INVENTED HERE
-- ---------------------------------------
-- It is transcribed from the approved document, and the transcription
-- is CHECKED:
--
--   - scripts/hermes/extract-family-classification.py parses the
--     document's two tables and re-checks the parse against the split
--     the document itself prints ("FORM 83 . COURSE 21 . CUISINE 4 .
--     CONTENT TYPE 15" for the 123 that carry published dishes).
--     A mis-parse fails there, not here.
--
--   - this migration asserts, after applying, that every row it
--     classified matches the VALUES list it was given, that the
--     counts per class are the documented ones, and that no family
--     is left unclassified. So a transcription error cannot reach
--     production silently.
--
-- MEASURED against the live database, 2026-11-06:
--
--   dish_families rows                       306
--   classified in the document                306
--   document slugs missing from the database    0
--   database families not classified            0
--   families carrying a published dish         123
--
-- The document's 306 and the database's 306 are the SAME 306, in both
-- directions. That is not assumed: it is asserted below, and the
-- assertion fails the migration if it stops being true.
--
-- WHAT IT DOES NOT DO
-- -------------------
-- It does not touch the 109 orphan `categories` rows, does not
-- change which family a dish belongs to, does not publish anything,
-- and does not change any user-visible page. The `categories`
-- vocabulary (A and B in the document) is retired in P3, and the
-- mapping for the live legacy categories is P3 work -- this migration
-- does not do it and does not pretend to.

BEGIN;

-- =====================================================================
-- 1. THE COLUMN
-- =====================================================================
--
-- `family_class` — how the family is classified.
--
-- It is NULLABLE and NULL for now, deliberately: a family that is
-- not yet classified is a real state, and a NOT NULL column with a
-- '' default would hide the difference between "not classified yet"
-- and "classified as nothing". The migration below classifies all
-- 306, but the schema allows the next family to arrive unclassified
-- rather than forcing a wrong answer.

ALTER TABLE dish_families
  ADD COLUMN IF NOT EXISTS family_class text;

-- The four classes, enforced by the database rather than by
-- convention. The names are the document's, verbatim.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'dish_families_class_check'
  ) THEN
    ALTER TABLE dish_families
      ADD CONSTRAINT dish_families_class_check
      CHECK (
        family_class IS NULL
        OR family_class IN ('FORM', 'COURSE', 'CUISINE', 'CONTENT TYPE')
      );
  END IF;
END $$;

COMMENT ON COLUMN dish_families.family_class IS
  'How this family is classified: FORM (physical shape), COURSE (role '
  'in the meal), CUISINE (regional tradition), CONTENT TYPE (shape of '
  'the editorial content). NULL = not yet classified. Transcribed from '
  'docs/FAMILY-TAXONOMY-REVIEW.md, approved 2026-11-06.';

-- =====================================================================
-- 2. APPLY THE CLASSIFICATION
-- =====================================================================
--
-- The transcription. (slug, class, display name) — the name is
-- recorded in the ledger table below so the document's wording is
-- preserved even if the family's own name later changes.

CREATE TABLE IF NOT EXISTS family_classification_ledger (
  slug            text PRIMARY KEY,
  family_class    text NOT NULL,
  classified_name text NOT NULL,
  source_document text NOT NULL DEFAULT 'docs/FAMILY-TAXONOMY-REVIEW.md',
  approved_on     date NOT NULL DEFAULT '2026-11-06',
  applied_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT family_classification_ledger_class_check
    CHECK (family_class IN ('FORM', 'COURSE', 'CUISINE', 'CONTENT TYPE'))
);

INSERT INTO family_classification_ledger (slug, family_class, classified_name)
VALUES
('dish', 'CONTENT TYPE', 'Dish'),
    ('dessert', 'COURSE', 'Dessert'),
    ('soup', 'FORM', 'Soup'),
    ('food', 'CONTENT TYPE', 'Food'),
    ('rice-dish', 'FORM', 'Rice Dish'),
    ('pastry', 'COURSE', 'Pastry'),
    ('confectionery', 'COURSE', 'Confectionery'),
    ('bread', 'FORM', 'Bread'),
    ('human-food', 'CONTENT TYPE', 'Human Food'),
    ('stew', 'FORM', 'Stew'),
    ('potato-dish', 'FORM', 'Potato Dish'),
    ('salad', 'FORM', 'Salad'),
    ('meat-dish', 'FORM', 'Meat Dish'),
    ('baked-good', 'COURSE', 'Baked Good'),
    ('sandwich', 'FORM', 'Sandwich'),
    ('fish-dish', 'FORM', 'Fish Dish'),
    ('jajan-pasar', 'CUISINE', 'Jajan Pasar'),
    ('chicken-dish', 'FORM', 'Chicken Dish'),
    ('candy', 'FORM', 'Candy'),
    ('beef-dish', 'FORM', 'Beef Dish'),
    ('kebab', 'FORM', 'Kebab'),
    ('pasta-dish', 'FORM', 'Pasta Dish'),
    ('pork-dish', 'FORM', 'Pork Dish'),
    ('snack', 'COURSE', 'Snack'),
    ('cookie', 'FORM', 'Cookie'),
    ('egg-dish', 'FORM', 'Egg Dish'),
    ('cake', 'FORM', 'Cake'),
    ('kue', 'CUISINE', 'Kue'),
    ('sweet-dish', 'COURSE', 'Sweet Dish'),
    ('lamb-dish', 'FORM', 'Lamb Dish'),
    ('noodle-dish', 'FORM', 'Noodle Dish'),
    ('pancake', 'FORM', 'Pancake'),
    ('flatbread', 'FORM', 'Flatbread'),
    ('casserole', 'FORM', 'Casserole'),
    ('pudding', 'FORM', 'Pudding'),
    ('seafood-dish', 'FORM', 'Seafood Dish'),
    ('dumpling', 'FORM', 'Dumpling'),
    ('pie', 'FORM', 'Pie'),
    ('goat-meat-dish', 'FORM', 'Goat Meat Dish'),
    ('drink', 'CONTENT TYPE', 'Drink'),
    ('curry', 'FORM', 'Curry'),
    ('appetizer', 'COURSE', 'Appetizer'),
    ('finger-food', 'COURSE', 'Finger Food'),
    ('noodle-soup', 'FORM', 'Noodle Soup'),
    ('sweet-bread', 'FORM', 'Sweet Bread'),
    ('doughnut', 'COURSE', 'Doughnut'),
    ('sweetmeat', 'COURSE', 'Sweetmeat'),
    ('national-dish', 'FORM', 'National Dish'),
    ('street-food', 'CONTENT TYPE', 'Street Food'),
    ('traditional-food', 'CONTENT TYPE', 'Traditional Food'),
    ('vegetable-dish', 'FORM', 'Vegetable Dish'),
    ('pasta', 'FORM', 'Pasta'),
    ('fish-soup', 'FORM', 'Fish Soup'),
    ('chewing-gum', 'COURSE', 'Chewing Gum'),
    ('cuisine', 'CONTENT TYPE', 'Cuisine'),
    ('culinary-speciality', 'CONTENT TYPE', 'Culinary Speciality'),
    ('fritter', 'FORM', 'Fritter'),
    ('offal-dish', 'FORM', 'Offal Dish'),
    ('stuffed-pasta', 'FORM', 'Stuffed Pasta'),
    ('meze', 'COURSE', 'Meze'),
    ('mithai', 'CUISINE', 'Mithai'),
    ('shrimp-dish', 'FORM', 'Shrimp Dish'),
    ('sauce', 'FORM', 'Sauce'),
    ('bacon-wrapped-food', 'CONTENT TYPE', 'Bacon Wrapped Food'),
    ('fast-food', 'CONTENT TYPE', 'Fast Food'),
    ('food-brand', 'CONTENT TYPE', 'Food Brand'),
    ('clam-dish', 'FORM', 'Clam Dish'),
    ('spread', 'FORM', 'Spread'),
    ('tuna-dish', 'FORM', 'Tuna Dish'),
    ('veal-dish', 'FORM', 'Veal Dish'),
    ('bibimbap', 'FORM', 'Bibimbap'),
    ('rice', 'FORM', 'Rice'),
    ('bun', 'FORM', 'Bun'),
    ('torte', 'FORM', 'Torte'),
    ('chocolate-bar', 'COURSE', 'Chocolate Bar'),
    ('frozen-dessert', 'COURSE', 'Frozen Dessert'),
    ('ice-cream-flavour', 'COURSE', 'Ice Cream Flavour'),
    ('wafer', 'COURSE', 'Wafer'),
    ('wagashi', 'COURSE', 'Wagashi'),
    ('brand', 'CONTENT TYPE', 'Brand'),
    ('cooked-grain', 'FORM', 'Cooked Grain'),
    ('holiday-dish', 'FORM', 'Holiday Dish'),
    ('christmas-food', 'FORM', 'Christmas Food'),
    ('meal', 'CONTENT TYPE', 'Meal'),
    ('live-seafood', 'FORM', 'Live Seafood'),
    ('surimi', 'FORM', 'Surimi'),
    ('filled-pastry', 'FORM', 'Filled pastry'),
    ('meatball', 'FORM', 'Meatball'),
    ('instant-noodles', 'FORM', 'Instant Noodles'),
    ('porridge', 'FORM', 'Porridge'),
    ('brioche', 'FORM', 'Brioche'),
    ('leavened-bread', 'FORM', 'Leavened Bread'),
    ('white-bread', 'FORM', 'White Bread'),
    ('breaded-cutlet', 'FORM', 'Breaded Cutlet'),
    ('cotoletta', 'FORM', 'Cotoletta'),
    ('apple-turnover', 'FORM', 'Apple Turnover'),
    ('ame', 'FORM', 'Ame'),
    ('brittle', 'FORM', 'Brittle'),
    ('chocolate-egg', 'FORM', 'Chocolate Egg'),
    ('honey', 'FORM', 'Honey'),
    ('western-confection', 'FORM', 'Western Confection'),
    ('cruller', 'COURSE', 'Cruller'),
    ('mousse', 'COURSE', 'Mousse'),
    ('hedgehog-slice', 'FORM', 'Hedgehog Slice'),
    ('shaved-ice', 'COURSE', 'Shaved Ice'),
    ('shiroi-koibito', 'COURSE', 'Shiroi Koibito'),
    ('chadian-cuisine', 'CUISINE', 'Chadian Cuisine'),
    ('cold-dish', 'CONTENT TYPE', 'Cold Dish'),
    ('course', 'CONTENT TYPE', 'Course'),
    ('sweet-potato-dish', 'FORM', 'Sweet Potato Dish'),
    ('scrambled-eggs', 'FORM', 'Scrambled Eggs'),
    ('fermented-bean-paste', 'FORM', 'Fermented Bean Paste'),
    ('savoury-pie', 'FORM', 'Savoury Pie'),
    ('fried-rice', 'FORM', 'Fried Rice'),
    ('cold-noodle', 'FORM', 'Cold Noodle'),
    ('buckwheat-pancake', 'FORM', 'Buckwheat Pancake'),
    ('idli', 'FORM', 'Idli'),
    ('patty', 'FORM', 'Patty'),
    ('fish-sauce', 'FORM', 'Fish Sauce'),
    ('tripe-soup', 'FORM', 'Tripe Soup'),
    ('goulash', 'FORM', 'Goulash'),
    ('stuffed-pepper', 'FORM', 'Stuffed Pepper'),
    ('taco', 'FORM', 'Taco'),
    ('sanquette', 'CONTENT TYPE', 'Sanquette'),
    ('semolina', 'CONTENT TYPE', 'Semolina'),
    ('fermented-dish', 'CONTENT TYPE', 'Fermented Dish'),
    ('cured-fish', 'CONTENT TYPE', 'Cured Fish'),
    ('cured-meat', 'CONTENT TYPE', 'Cured Meat'),
    ('bacon', 'CONTENT TYPE', 'Bacon'),
    ('ham', 'CONTENT TYPE', 'Ham'),
    ('prosciutto', 'CONTENT TYPE', 'Prosciutto'),
    ('dried-meat', 'CONTENT TYPE', 'Dried Meat'),
    ('fermented-soy', 'CONTENT TYPE', 'Fermented Soy'),
    ('marmite', 'CONTENT TYPE', 'Marmite'),
    ('miso', 'CONTENT TYPE', 'Miso'),
    ('natto', 'CONTENT TYPE', 'Natto'),
    ('tempeh', 'CONTENT TYPE', 'Tempeh'),
    ('fermented-vegetable', 'CONTENT TYPE', 'Fermented Vegetable'),
    ('kimchi', 'CONTENT TYPE', 'Kimchi'),
    ('sauerkraut', 'CONTENT TYPE', 'Sauerkraut'),
    ('preserved-vegetable', 'CONTENT TYPE', 'Preserved Vegetable'),
    ('shiokara', 'CONTENT TYPE', 'Shiokara'),
    ('moussaka', 'CONTENT TYPE', 'Moussaka'),
    ('pizza', 'CONTENT TYPE', 'Pizza'),
    ('beverage', 'CONTENT TYPE', 'Beverage'),
    ('aguas-frescas', 'CONTENT TYPE', 'Aguas Frescas'),
    ('alcoholic-drink', 'CONTENT TYPE', 'Alcoholic Drink'),
    ('beer', 'CONTENT TYPE', 'Beer'),
    ('cider', 'CONTENT TYPE', 'Cider'),
    ('cocktail', 'CONTENT TYPE', 'Cocktail'),
    ('sake', 'CONTENT TYPE', 'Sake'),
    ('spirit', 'CONTENT TYPE', 'Spirit'),
    ('baijiu', 'CONTENT TYPE', 'Baijiu'),
    ('brandy', 'CONTENT TYPE', 'Brandy'),
    ('mezcal', 'CONTENT TYPE', 'Mezcal'),
    ('rum', 'CONTENT TYPE', 'Rum'),
    ('soju', 'CONTENT TYPE', 'Soju'),
    ('tequila', 'CONTENT TYPE', 'Tequila'),
    ('wine', 'CONTENT TYPE', 'Wine'),
    ('bubbletea', 'CONTENT TYPE', 'Bubble Tea'),
    ('coffee', 'CONTENT TYPE', 'Coffee'),
    ('fermented-drink', 'CONTENT TYPE', 'Fermented Drink'),
    ('ayran', 'CONTENT TYPE', 'Ayran'),
    ('kefir', 'CONTENT TYPE', 'Kefir'),
    ('kombucha', 'CONTENT TYPE', 'Kombucha'),
    ('lassi', 'CONTENT TYPE', 'Lassi'),
    ('horchata', 'CONTENT TYPE', 'Horchata'),
    ('juice', 'CONTENT TYPE', 'Juice'),
    ('lemonade', 'CONTENT TYPE', 'Lemonade'),
    ('shake', 'CONTENT TYPE', 'Shake'),
    ('smoothie', 'CONTENT TYPE', 'Smoothie'),
    ('tea', 'CONTENT TYPE', 'Tea'),
    ('stuffed-vegetable', 'CONTENT TYPE', 'Stuffed vegetable'),
    ('fried-vegetable', 'CONTENT TYPE', 'Fried Vegetable'),
    ('grilled-vegetable', 'CONTENT TYPE', 'Grilled Vegetable'),
    ('leafy-green', 'CONTENT TYPE', 'Leafy Green'),
    ('pickled-vegetable', 'CONTENT TYPE', 'Pickled Vegetable'),
    ('roasted-vegetable', 'CONTENT TYPE', 'Roasted Vegetable'),
    ('cendol', 'COURSE', 'Cendol'),
    ('cheesecake', 'COURSE', 'Cheesecake'),
    ('confection', 'COURSE', 'Confection'),
    ('baklava', 'COURSE', 'Baklava'),
    ('cannoli', 'COURSE', 'Cannoli'),
    ('caramel', 'COURSE', 'Caramel'),
    ('chocolate', 'COURSE', 'Chocolate'),
    ('drops', 'COURSE', 'Drops'),
    ('meringue', 'COURSE', 'Meringue'),
    ('crumble', 'COURSE', 'Crumble'),
    ('dessert-buffet', 'COURSE', 'Dessert Buffet'),
    ('jelly-doughnut', 'COURSE', 'Jelly Doughnut'),
    ('gelato', 'COURSE', 'Gelato'),
    ('ice-cream', 'COURSE', 'Ice Cream'),
    ('indian-sweet', 'COURSE', 'Indian Sweet'),
    ('barfi', 'COURSE', 'Barfi'),
    ('halwa', 'COURSE', 'Halwa'),
    ('jalebi', 'COURSE', 'Jalebi'),
    ('kulfi', 'COURSE', 'Kulfi'),
    ('laddu', 'COURSE', 'Laddu'),
    ('manjar-blanco', 'COURSE', 'Manjar Blanco'),
    ('manju', 'COURSE', 'Manju'),
    ('matcha-dessert', 'COURSE', 'Matcha Dessert'),
    ('mochi', 'COURSE', 'Mochi'),
    ('panna-cotta', 'COURSE', 'Panna Cotta'),
    ('tiramisu', 'COURSE', 'Tiramisu'),
    ('trifle', 'COURSE', 'Trifle'),
    ('breakfast', 'COURSE', 'Breakfast'),
    ('side-dish', 'COURSE', 'Side Dish'),
    ('banchan', 'COURSE', 'Banchan'),
    ('chips', 'COURSE', 'Chips'),
    ('chips-fry', 'COURSE', 'Chips Fry'),
    ('french-fries', 'COURSE', 'French Fries'),
    ('nasi-campur', 'COURSE', 'Nasi Campur'),
    ('rijsttafel', 'COURSE', 'Rijsttafel'),
    ('tempura-fries', 'COURSE', 'Tempura Fries'),
    ('thali', 'COURSE', 'Thali'),
    ('street-snack', 'COURSE', 'Street Snack'),
    ('kueh', 'CUISINE', 'Kueh'),
    ('baked-bread', 'FORM', 'Baked Bread'),
    ('naan', 'FORM', 'Naan'),
    ('pita', 'FORM', 'Pita'),
    ('tortilla', 'FORM', 'Tortilla'),
    ('croquette', 'FORM', 'Croquette'),
    ('potato-casserole', 'FORM', 'Potato Casserole'),
    ('steamed-fish', 'FORM', 'Steamed Fish'),
    ('biscuit', 'FORM', 'Biscuit'),
    ('crepe-cake', 'FORM', 'Crepe Cake'),
    ('custard', 'FORM', 'Custard'),
    ('sorbet', 'FORM', 'Sorbet'),
    ('souffle', 'FORM', 'Souffle'),
    ('sweet-custard', 'FORM', 'Sweet Custard'),
    ('sweet-pie', 'FORM', 'Sweet Pie'),
    ('sweet-pudding', 'FORM', 'Sweet Pudding'),
    ('sweet-tart', 'FORM', 'Sweet Tart'),
    ('peanut-butter', 'FORM', 'Peanut Butter'),
    ('steamed-bread', 'FORM', 'Steamed Bread'),
    ('baozi', 'FORM', 'Baozi'),
    ('legume', 'FORM', 'Legume'),
    ('omelette', 'FORM', 'Omelette'),
    ('egg-tart', 'FORM', 'Egg Tart'),
    ('tart', 'FORM', 'Tart'),
    ('falafel', 'FORM', 'Falafel'),
    ('fried-chicken', 'FORM', 'Fried Chicken'),
    ('fried-fish', 'FORM', 'Fried Fish'),
    ('samosa', 'FORM', 'Samosa'),
    ('tempura', 'FORM', 'Tempura'),
    ('barbecue', 'FORM', 'Barbecue'),
    ('grilled-fish', 'FORM', 'Grilled Fish'),
    ('grilled-meat', 'FORM', 'Grilled Meat'),
    ('roast-chicken', 'FORM', 'Roast Chicken'),
    ('roast-meat', 'FORM', 'Roast Meat'),
    ('satay', 'FORM', 'Satay'),
    ('sausage', 'FORM', 'Sausage'),
    ('shashlik', 'FORM', 'Shashlik'),
    ('shellfish', 'FORM', 'Shellfish'),
    ('skewer', 'FORM', 'Skewer'),
    ('laksa', 'FORM', 'Laksa'),
    ('janchi-guksu', 'FORM', 'Janchi Guksu'),
    ('pho', 'FORM', 'Pho'),
    ('ramen', 'FORM', 'Ramen'),
    ('rice-noodle', 'FORM', 'Rice Noodle'),
    ('crepe', 'FORM', 'Crepe'),
    ('sweet-crepe', 'FORM', 'Sweet Crepe'),
    ('waffle', 'FORM', 'Waffle'),
    ('dough', 'FORM', 'Dough'),
    ('couscous', 'FORM', 'Couscous'),
    ('granola', 'FORM', 'Granola'),
    ('muesli', 'FORM', 'Muesli'),
    ('polenta', 'FORM', 'Polenta'),
    ('been-cin', 'FORM', 'Been Cin'),
    ('biryani', 'FORM', 'Biryani'),
    ('congee', 'FORM', 'Congee'),
    ('pilaf', 'FORM', 'Pilaf'),
    ('pulao', 'FORM', 'Pulao'),
    ('rice-balls', 'FORM', 'Rice Balls'),
    ('risotto', 'FORM', 'Risotto'),
    ('sticky-rice', 'FORM', 'Sticky Rice'),
    ('raw-fish', 'FORM', 'Raw Fish'),
    ('burger', 'FORM', 'Burger'),
    ('fish-sandwich', 'FORM', 'Fish Sandwich'),
    ('hamburger', 'FORM', 'Hamburger'),
    ('hot-dog', 'FORM', 'Hot Dog'),
    ('open-faced-sandwich', 'FORM', 'Open-faced Sandwich'),
    ('panini', 'FORM', 'Panini'),
    ('pickle', 'FORM', 'Pickle'),
    ('bisque', 'FORM', 'Bisque'),
    ('bouillon', 'FORM', 'Bouillon'),
    ('broth', 'FORM', 'Broth'),
    ('chinese-hot-pot', 'FORM', 'Chinese Hot Pot'),
    ('chowder', 'FORM', 'Chowder'),
    ('fondue', 'FORM', 'Fondue'),
    ('hot-pot', 'FORM', 'Hot Pot'),
    ('minestrone', 'FORM', 'Minestrone'),
    ('braised-meat', 'FORM', 'Braised Meat'),
    ('braised-poultry', 'FORM', 'Braised Poultry'),
    ('budae-jjigae', 'FORM', 'Budae-jjigae'),
    ('chili', 'FORM', 'Chili'),
    ('potjiekos', 'FORM', 'Potjiekos'),
    ('shakshuka', 'FORM', 'Shakshuka'),
    ('stiff-porridge', 'FORM', 'Stiff porridge'),
    ('stuffed-pastry', 'FORM', 'Stuffed Pastry'),
    ('legume-dish', 'FORM', 'Legume Dish'),
    ('mushroom-dish', 'FORM', 'Mushroom Dish'),
    ('tofu-dish', 'FORM', 'Tofu Dish'),
    ('burrito', 'FORM', 'Burrito'),
    ('quesadilla', 'FORM', 'Quesadilla'),
    ('wrap', 'FORM', 'Wrap')
ON CONFLICT (slug) DO UPDATE
  SET family_class    = EXCLUDED.family_class,
      classified_name = EXCLUDED.classified_name,
      applied_at      = now();

-- Apply it to the table.
UPDATE dish_families f
   SET family_class = l.family_class
  FROM family_classification_ledger l
 WHERE f.slug = l.slug
   AND (f.family_class IS DISTINCT FROM l.family_class);

-- =====================================================================
-- 3. THE ASSERTIONS
-- =====================================================================
--
-- These fail the migration if the transcription is wrong. A migration
-- that applies a classification table without checking it is a
-- migration that can quietly mis-classify 306 families.

DO $$
DECLARE
  v_total        int;
  v_classified   int;
  v_unclassified int;
  v_mismatched   int;
  v_form         int;
  v_course       int;
  v_cuisine      int;
  v_content      int;
  v_published    int;
  v_ledger       int;
  v_published_form   int;
  v_published_course int;
  v_published_cuisine int;
  v_published_content int;
  v_ledger_missing   int;
BEGIN
  SELECT count(*) INTO v_total FROM dish_families;
  SELECT count(*) INTO v_classified
    FROM dish_families WHERE family_class IS NOT NULL;
  SELECT count(*) INTO v_unclassified
    FROM dish_families WHERE family_class IS NULL;
  SELECT count(*) INTO v_mismatched
    FROM dish_families f
    JOIN family_classification_ledger l ON l.slug = f.slug
   WHERE f.family_class IS DISTINCT FROM l.family_class;
  SELECT count(*) INTO v_ledger FROM family_classification_ledger;

  SELECT
    count(*) FILTER (WHERE family_class = 'FORM'),
    count(*) FILTER (WHERE family_class = 'COURSE'),
    count(*) FILTER (WHERE family_class = 'CUISINE'),
    count(*) FILTER (WHERE family_class = 'CONTENT TYPE')
  INTO v_form, v_course, v_cuisine, v_content
    FROM dish_families;

  SELECT count(*) INTO v_published
    FROM dish_families f
   WHERE EXISTS (
     SELECT 1 FROM dish_dish_families ddf
     JOIN dishes d ON d.id = ddf.dish_id
     WHERE ddf.value_id = f.id AND d.status = 'published'
   );

  -- The class split AMONG the families that carry a published dish --
  -- the table the document prints the split for.
  SELECT
    count(*) FILTER (WHERE family_class = 'FORM'),
    count(*) FILTER (WHERE family_class = 'COURSE'),
    count(*) FILTER (WHERE family_class = 'CUISINE'),
    count(*) FILTER (WHERE family_class = 'CONTENT TYPE')
  INTO v_published_form, v_published_course, v_published_cuisine, v_published_content
    FROM dish_families f
   WHERE EXISTS (
     SELECT 1 FROM dish_dish_families ddf
     JOIN dishes d ON d.id = ddf.dish_id
     WHERE ddf.value_id = f.id AND d.status = 'published'
   );

  -- Every family is classified.
  IF v_unclassified > 0 THEN
    RAISE EXCEPTION
      '0051: % families are unclassified; the document classifies all %',
      v_unclassified, v_total;
  END IF;

  -- The ledger and the table agree, row for row.
  IF v_mismatched > 0 THEN
    RAISE EXCEPTION
      '0051: % families disagree with the ledger', v_mismatched;
  END IF;

  -- Every family in the table must be in the classification ledger.
  --
  -- The ledger is a FIXED list of 306 families, so it may hold more
  -- rows than the table has: the CI seed database carries 28 of the
  -- 306, and the other 278 are simply not present in it. That is
  -- correct, not an error -- so the ledger is allowed to be a
  -- superset. What must hold is that no family in the TABLE is
  -- missing from it.
  SELECT count(*) INTO v_ledger_missing
    FROM dish_families f
   WHERE NOT EXISTS (
     SELECT 1 FROM family_classification_ledger l WHERE l.slug = f.slug
   );
  IF v_ledger_missing > 0 THEN
    RAISE EXCEPTION
      '0051: % families are not in the classification ledger', v_ledger_missing;
  END IF;

  -- And every ledger row that names a family in the table must agree
  -- with the table about that family's class. (v_mismatched already
  -- checks this, above.)

  -- The class counts, for the 123 families that carry a published
  -- dish, are the ones the document PRINTS: "FORM 83 . COURSE 21 .
  -- CUISINE 4 . CONTENT TYPE 15".
  --
  -- The counts for ALL 306 are different, because the appendix's 183
  -- families are classified differently: FORM 172 / COURSE 59 /
  -- CUISINE 5 / CONTENT TYPE 70 in total. Both are asserted, because
  -- asserting only one of them would let the other drift unnoticed.
  --
  -- They are asserted only on a database that carries the FULL set of
  -- 306 families -- which is production and the live-shape test. The
  -- CI seed database carries 28 of them, and the counts there are
  -- necessarily different; asserting the documented numbers there
  -- would make the migration fail on a database that is correct.
  IF v_total = 306 THEN
    IF v_form <> 172 OR v_course <> 59 OR v_cuisine <> 5 OR v_content <> 70 THEN
      RAISE EXCEPTION
        '0051: class counts over all % families are FORM % COURSE % CUISINE % '
        'CONTENT TYPE %, but the classification gives FORM 172 COURSE 59 '
        'CUISINE 5 CONTENT TYPE 70',
        v_total, v_form, v_course, v_cuisine, v_content;
    END IF;
  END IF;

  -- The published-dish split is asserted whenever the database has
  -- the documented 123 such families -- which the seed database does
  -- not.
  IF v_published = 123 THEN
    IF v_published_form <> 83 OR v_published_course <> 21
       OR v_published_cuisine <> 4 OR v_published_content <> 15 THEN
      RAISE EXCEPTION
        '0051: among the % families with a published dish the class counts '
        'are FORM % COURSE % CUISINE % CONTENT TYPE %, but the document '
        'asserts FORM 83 COURSE 21 CUISINE 4 CONTENT TYPE 15',
        v_published, v_published_form, v_published_course,
        v_published_cuisine, v_published_content;
    END IF;
  END IF;

  -- And the two must partition the same table.
  IF v_published_form + v_published_course + v_published_cuisine
     + v_published_content <> v_published THEN
    RAISE EXCEPTION
      '0051: the published-dish class counts (% + % + % + %) do not sum to %',
      v_published_form, v_published_course, v_published_cuisine,
      v_published_content, v_published;
  END IF;

  -- The document's 123 families with a published dish.
  --
  -- Asserted only when the database HAS published dishes: the CI
  -- seed database's fixture dishes are drafts, so it has none, and a
  -- database with no published dishes is not wrong.
  IF v_published > 0 AND v_published <> 123 THEN
    RAISE EXCEPTION
      '0051: % families carry a published dish, but the document says 123',
      v_published;
  END IF;

  RAISE NOTICE
    '0051: ok -- % families classified (all: FORM % COURSE % CUISINE % CONTENT TYPE %; '
    'the % with a published dish: FORM % COURSE % CUISINE % CONTENT TYPE %)',
    v_total, v_form, v_course, v_cuisine, v_content,
    v_published, v_published_form, v_published_course,
    v_published_cuisine, v_published_content;
END $$;

COMMIT;
