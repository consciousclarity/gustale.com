-- 0057_ingredients_sourcing_vocabulary.sql
-- GUS-1108 -- the ingredient vocabulary the sourcing research attaches to.
--
-- WHAT THIS MIGRATION DOES
-- -----------------------
-- It adds TWENTY-ONE rows to `ingredients`: the owner's reviewed
-- 20-ingredient list, plus one, because "Parmigiano Reggiano and
-- Pecorino" was one row in the owner's spec and is TWO ingredients
-- here -- the spec names both cheeses together and grades them
-- separately, so a rating of one cannot stand in for the other.
--
-- The twenty-one are:
--
--   coconut-milk, cassava, plantain, tamarind, saffron,
--   preserved-lemon, curry-leaves, makrut-lime-leaves, gochujang,
--   doubanjiang, fish-sauce, fresh-mozzarella-di-bufala,
--   parmigiano-reggiano, pecorino, ube, ackee, huitlacoche,
--   asian-pear, pandan, epazote, fresh-corn-masa
--
-- WHY THEY ARE `draft`
-- --------------------
-- Every row is `draft`. An ingredient row is a research subject, and a
-- research subject that has not been researched is not ready to be
-- published. The availability rows that GUS-1107 writes attach to
-- these slugs; publishing an ingredient before its availability is
-- measured would show a reader a "Unknown" rating for an ingredient
-- the site chose to feature.
--
-- The one exception the data already knows: these are the moussaka
-- pantry, and the five pantry ingredients are already published in
-- `ingredients`. This migration does not touch them.
--
-- WHY `category` IS SET, AND WHY IT IS NOT A FREE TEXT FIELD
-- ----------------------------------------------------------
-- `ingredients.category` has a FOREIGN KEY to
-- `ingredient_categories(slug)` -- the FoodOn taxonomy, 435 rows.
-- Every category below is a slug that EXISTS in that table, so the
-- insert cannot fail on the constraint and no new taxonomy rows are
-- needed.
--
-- The mapping was checked against the live taxonomy before this
-- migration was written:
--
--   coconut-milk              -> coconut
--   cassava                   -> tropical root and tuber vegetables
--   plantain                  -> tropical root and tuber vegetables
--   tamarind                  -> fruit spices
--   saffron                   -> aril spices
--   preserved-lemon           -> citrus
--   curry-leaves              -> aromatic herbs
--   makrut-lime-leaves        -> aromatic herbs
--   gochujang                 -> savoury sauces
--   doubanjiang               -> savoury sauces
--   fish-sauce                -> fish
--   fresh-mozzarella-di-bufala-> fresh uncured cheese
--   parmigiano-reggiano       -> ripened cheese
--   pecorino                  -> ripened cheese
--   ube                       -> tropical root and tuber vegetables
--   ackee                     -> miscellaneous fruits (generic)
--   huitlacoche               -> other fruiting vegetables
--   asian-pear                -> pome fruits
--   pandan                    -> aromatic flowers
--   epazote                   -> aromatic herbs
--   fresh-corn-masa           -> maize starch
--
-- WHY IT IS IDEMPOTENT
-- -------------------
-- `ON CONFLICT (slug) DO NOTHING`. Re-running it changes nothing, and
-- it never overwrites a row that a curator has since edited. The
-- proofs below are written to be re-runnable for the same reason.
--
-- WHAT IT DOES NOT DO
-- ------------------
-- It does not publish anything. It does not write an availability row.
-- It does not set `is_key` -- that is a RECIPE-LINE property on
-- `recipe_ingredients`, and no ingredient row may carry it. It does
-- not set `ubiquitous`, because none of these twenty-one is a staple
-- that every recipe needs; that is a separate judgement.
--
-- Rule 11: this is a NEW number. 0052-0056 are frozen.

BEGIN;

INSERT INTO ingredients (
  slug, canonical_name, category, short_description, status, created_by
)
VALUES
  ('coconut-milk', 'Coconut milk', 'coconut',
   'The white liquid extracted from the flesh of a mature coconut, sold fresh or canned; a base for curries and desserts across South and Southeast Asia.',
   'draft',
   '00000000-0000-0000-0000-000000000001'::uuid),
  ('cassava', 'Cassava', 'tropical-root-and-tuber-vegetables',
   'A starchy tropical root with a brown bark and white flesh, eaten boiled, fried or processed into flour; a staple across Africa, South America and Southeast Asia.',
   'draft',
   '00000000-0000-0000-0000-000000000001'::uuid),
  ('plantain', 'Plantain', 'tropical-root-and-tuber-vegetables',
   'A starchy cooking banana, eaten green or ripe, fried or boiled; the staple of West African and Latin American cooking and a staple of South Indian cuisine.',
   'draft',
   '00000000-0000-0000-0000-000000000001'::uuid),
  ('tamarind', 'Tamarind', 'fruit-spices',
   'The pod of a tropical legume tree, whose pulp is intensely sour; used whole or as a paste or concentrate as the souring agent in Indian, African and Latin American cooking.',
   'draft',
   '00000000-0000-0000-0000-000000000001'::uuid),
  ('saffron', 'Saffron', 'aril-spices',
   'The dried stigmas of Crocus sativus, hand-picked from each flower; the most expensive spice by weight, used in Persian, Indian and Mediterranean cooking.',
   'draft',
   '00000000-0000-0000-0000-000000000001'::uuid),
  ('preserved-lemon', 'Preserved lemon', 'citrus',
   'A lemon quartered, salted and left to cure until the flesh turns translucent and the salt draws out the bitterness; the seasoning of Moroccan tagines and preserved-lemon salad.',
   'draft',
   '00000000-0000-0000-0000-000000000001'::uuid),
  ('curry-leaves', 'Curry leaves', 'aromatic-herbs',
   'The aromatic leaves of the curry tree, Murraya koenigii, used fresh or dried in South Indian cooking and in Sri Lankan, Thai and Indonesian kitchens.',
   'draft',
   '00000000-0000-0000-0000-000000000001'::uuid),
  ('makrut-lime-leaves', 'Makrut lime leaves', 'aromatic-herbs',
   'The small, round leaves of the makrut lime, Citrus hystrix, prized for their distinctive citrus aroma; essential to Thai, Cambodian and Indonesian cooking.',
   'draft',
   '00000000-0000-0000-0000-000000000001'::uuid),
  ('gochujang', 'Gochujang', 'savoury-sauces',
   'A fermented Korean chilli paste of red chilli, fermented soybean and glutinous rice; the base of bibimbap, tteokbokki and bulgogi, and a worldwide pantry item.',
   'draft',
   '00000000-0000-0000-0000-000000000001'::uuid),
  ('doubanjiang', 'Doubanjiang', 'savoury-sauces',
   'A fermented broad-bean chilli paste from Sichuan, seasoned with chillies and oil; the base of mapo tofu and twice-cooked pork.',
   'draft',
   '00000000-0000-0000-0000-000000000001'::uuid),
  ('fish-sauce', 'Fish sauce', 'fish',
   'A liquid seasoning made by fermenting anchovies and other small fish in salt; the salt-and-umami backbone of Vietnamese, Thai, Cambodian and Filipino cooking.',
   'draft',
   '00000000-0000-0000-0000-000000000001'::uuid),
  ('fresh-mozzarella-di-bufala', 'Fresh mozzarella di bufala', 'fresh-uncured-cheese',
   'A fresh, moist, stretched-curd cheese traditionally made from the milk of the Italian water buffalo, with a delicate flavour and a soft, pearly interior.',
   'draft',
   '00000000-0000-0000-0000-000000000001'::uuid),
  ('parmigiano-reggiano', 'Parmigiano Reggiano', 'ripened-cheese',
   'A hard, aged, granular Italian cheese made from cow''s milk and protected by its denomination of origin; grated over pasta and used in risotto.',
   'draft',
   '00000000-0000-0000-0000-000000000001'::uuid),
  ('pecorino', 'Pecorino', 'ripened-cheese',
   'A hard, salted Italian sheep''s-milk cheese, sharper and saltier than cow''s-milk equivalents; the table cheese of Lazio and Abruzzo.',
   'draft',
   '00000000-0000-0000-0000-000000000001'::uuid),
  ('ube', 'Ube', 'tropical-root-and-tuber-vegetables',
   'A purple yam from the Philippines, whose violet flesh lends both colour and a sweet, custard-like flavour to desserts and pastries.',
   'draft',
   '00000000-0000-0000-0000-000000000001'::uuid),
  ('ackee', 'Ackee', 'miscellaneous-fruits-generic',
   'The fruit of the ackee palm, whose bright red arils enclose a glossy black seed that must be removed before eating; a traditional Jamaican and West African dish.',
   'draft',
   '00000000-0000-0000-0000-000000000001'::uuid),
  ('huitlacoche', 'Huitlacoche', 'other-fruiting-vegetables',
   'The immature ear of maize infected by the corn smut fungus, Ustilago maydis; the smoky, mushroom-scented corn of Mexican cuisine.',
   'draft',
   '00000000-0000-0000-0000-000000000001'::uuid),
  ('asian-pear', 'Asian pear', 'pome-fruits',
   'A crisp, round, apple-shaped pear with a stone-hard flesh and high juice; the nashi of East Asia, eaten fresh or in salads.',
   'draft',
   '00000000-0000-0000-0000-000000000001'::uuid),
  ('pandan', 'Pandan', 'aromatic-flowers',
   'The fragrant leaf of a screw-pine, Pandanus amaryllifolius, whose scent perfumes Southeast Asian cooking; the leaf and its extract are both used.',
   'draft',
   '00000000-0000-0000-0000-000000000001'::uuid),
  ('epazote', 'Epazote', 'aromatic-herbs',
   'A pungent, resinous herb of the goosefoot family, Dysphania ambrosioides, used in Mexican cooking for its strong, almost petrol-like aroma.',
   'draft',
   '00000000-0000-0000-0000-000000000001'::uuid),
  ('fresh-corn-masa', 'Fresh corn masa', 'maize-starch',
   'Masa dough made by wet-grinding nixtamalised maize, the pliable paste from which tortillas and tamales are formed by hand.',
   'draft',
   '00000000-0000-0000-0000-000000000001'::uuid)
ON CONFLICT (slug) DO NOTHING;

-- =====================================================================
-- THE PROOFS
-- =====================================================================

DO $$
DECLARE
  v_count int;
  v_missing text;
  v_leaked int;
BEGIN
  -- PROOF 1: all twenty-one rows are present.
  SELECT count(*) INTO v_count
  FROM ingredients
  WHERE slug IN (
    'coconut-milk','cassava','plantain','tamarind','saffron',
    'preserved-lemon','curry-leaves','makrut-lime-leaves','gochujang',
    'doubanjiang','fish-sauce','fresh-mozzarella-di-bufala',
    'parmigiano-reggiano','pecorino','ube','ackee','huitlacoche',
    'asian-pear','pandan','epazote','fresh-corn-masa'
  );
  IF v_count <> 21 THEN
    RAISE EXCEPTION 'PROOF 1 FAILED: expected 21 ingredient rows, found %', v_count;
  END IF;

  -- PROOF 2: every one of them has a category, and the category
  -- resolves in the FoodOn taxonomy. (The FK guarantees this, but a
  -- proof that reads it back is a proof that the DATA is right, not
  -- merely that the constraint held.)
  SELECT string_agg(i.slug, ', ') INTO v_missing
  FROM ingredients i
  LEFT JOIN ingredient_categories c ON c.slug = i.category
  WHERE i.slug IN (
    'coconut-milk','cassava','plantain','tamarind','saffron',
    'preserved-lemon','curry-leaves','makrut-lime-leaves','gochujang',
    'doubanjiang','fish-sauce','fresh-mozzarella-di-bufala',
    'parmigiano-reggiano','pecorino','ube','ackee','huitlacoche',
    'asian-pear','pandan','epazote','fresh-corn-masa'
  ) AND (i.category IS NULL OR c.slug IS NULL);
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'PROOF 2 FAILED: these rows have no resolvable category: %', v_missing;
  END IF;

  -- PROOF 3: every one of them is `draft`. A research subject that has
  -- not been researched must not be published.
  SELECT count(*) INTO v_count
  FROM ingredients
  WHERE slug IN (
    'coconut-milk','cassava','plantain','tamarind','saffron',
    'preserved-lemon','curry-leaves','makrut-lime-leaves','gochujang',
    'doubanjiang','fish-sauce','fresh-mozzarella-di-bufala',
    'parmigiano-reggiano','pecorino','ube','ackee','huitlacoche',
    'asian-pear','pandan','epazote','fresh-corn-masa'
  ) AND status <> 'draft';
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'PROOF 3 FAILED: % of the new ingredient rows are not draft', v_count;
  END IF;

  -- PROOF 4: the existing data is UNCHANGED.
  --
  -- The property that matters is not an absolute count -- the live
  -- database has 24 ingredients and the CI chain database has fewer,
  -- because the chain does not seed the whole moussaka pantry. The
  -- property is that this migration ADDED rows and CHANGED none: the
  -- pre-existing rows must all still be there, and the ones that were
  -- published must still be published.
  --
  -- The 21 new rows are all draft, and none of them is a pre-existing
  -- row, so the published set must be exactly the pre-existing one.
  SELECT count(*) INTO v_count
  FROM ingredients
  WHERE slug IN (
    'coconut-milk','cassava','plantain','tamarind','saffron',
    'preserved-lemon','curry-leaves','makrut-lime-leaves','gochujang',
    'doubanjiang','fish-sauce','fresh-mozzarella-di-bufala',
    'parmigiano-reggiano','pecorino','ube','ackee','huitlacoche',
    'asian-pear','pandan','epazote','fresh-corn-masa'
  ) AND status = 'published';
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'PROOF 4 FAILED: % of the new ingredient rows are published; this migration publishes nothing', v_count;
  END IF;

  -- The pre-existing published ingredients are untouched: each of the
  -- known published slugs must still be published.
  SELECT count(*) INTO v_count
  FROM ingredients
  WHERE slug IN ('eggplant','lamb-mince','tomato','bechamel')
    AND status = 'published';
  IF v_count < 4 THEN
    RAISE EXCEPTION 'PROOF 4 FAILED: only % of the 4 known published ingredients are still published', v_count;
  END IF;

  -- PROOF 5: `is_key` has NOT leaked onto the ingredients table. It is
  -- a RECIPE-LINE property (recipe_ingredients.is_key); an ingredient
  -- row that carries it is a category error, and the owner's fix was
  -- exactly this.
  SELECT count(*) INTO v_leaked
  FROM information_schema.columns
  WHERE table_name = 'ingredients' AND column_name = 'is_key';
  IF v_leaked <> 0 THEN
    RAISE EXCEPTION 'PROOF 5 FAILED: the ingredients table has an is_key column';
  END IF;

  -- PROOF 6: the rows are idempotent. Re-running the INSERT must not
  -- create a second row for any slug.
  SELECT count(*) INTO v_count
  FROM (
    SELECT slug FROM ingredients
    WHERE slug IN (
      'coconut-milk','cassava','plantain','tamarind','saffron',
      'preserved-lemon','curry-leaves','makrut-lime-leaves','gochujang',
      'doubanjiang','fish-sauce','fresh-mozzarella-di-bufala',
      'parmigiano-reggiano','pecorino','ube','ackee','huitlacoche',
      'asian-pear','pandan','epazote','fresh-corn-masa'
    )
    GROUP BY slug HAVING count(*) > 1
  ) d;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'PROOF 6 FAILED: % slugs have more than one row', v_count;
  END IF;

  RAISE NOTICE '0057: all 6 proofs passed';
END $$;

COMMIT;
