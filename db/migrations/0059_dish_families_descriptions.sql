-- 0059_dish_families_descriptions.sql
--
-- WP-B1, part 2: THE DESCRIPTIONS THAT KEEP THE FAMILIES LISTED.
--
-- WHAT THIS DOES
-- --------------
-- Migration 0058 adds `dish_families.listed` and sets it true only for a
-- family that is BOTH a FORM and carries a description:
--
--     listed = (family_class = 'FORM' AND description IS NOT NULL
--                AND btrim(description) <> '')
--
-- A FORM family with no description says nothing. "Meat Dish", "Potato
-- Dish" and "Rice" would show a name and no explanation, so 0058 leaves
-- them unlisted -- which removes them from the published family
-- vocabulary AND takes the family off every dish that carries it.
--
-- 66 FORM families have no description. 56 of them carry a published
-- dish, so those 56 are the ones whose loss is visible. This migration
-- gives each one a single line of definition, so they stay listed and
-- their dishes keep a family.
--
-- MEASURED against the live database, 2026-11-16:
--
--   dish_families rows                          306
--   by class: FORM 172, COURSE 59, CUISINE 5, CONTENT TYPE 70
--   FORM families with no description              66
--   ... of which carry a published dish             56   <- this file
--   ... of which carry nothing                     10   <- untouched
--   FORM families with a description               106
--   non-FORM families                              134
--
-- WHAT THE 56 DESCRIPTIONS DO
-- ---------------------------
-- They are written in the project's voice: plain, specific, one line,
-- no marketing language. Each describes the FORM -- the shape or
-- category -- rather than a particular dish, except where the family
-- is itself a named dish (bibimbap, idli, brioche, goulash, cotoletta,
-- torte, fish-sauce, honey, surimi).
--
-- The full table, with the reason for each wording, is in
-- .hermes/REPORTS/FAMILY-DESCRIPTIONS-0059.md.
--
-- ORDERING
-- --------
-- Apply 0059 BEFORE 0058. 0059 supplies the descriptions that 0058's
-- backfill reads when it decides `listed`. Applying them in the other
-- order would mark the 56 unlisted and leave it that way.
--
-- IDEMPOTENT
-- ----------
-- The write is a plain UPDATE of `description`, so re-applying it sets
-- the same values again and changes nothing. The guard below skips the
-- whole body when the data is absent (CI's fresh, empty database) or
-- when it has already been applied.
--
-- =====================================================================
-- CI GUARD
--
-- This is a DATA migration: it asserts the state of the seeded catalog
-- and then fixes it. CI applies the whole committed chain to a FRESH,
-- EMPTY database, where there is nothing to fix.
--
-- So: if the data this migration acts on is not present, skip cleanly.
-- The guard checks for the SPECIFIC rows the migration acts on, not
-- merely "the database is non-empty", so a partially-migrated live
-- database would NOT skip -- it would run the assertions and fail
-- loudly, which is the intended behaviour.
--
-- The "already applied" marker for 0059: all 56 of the families it acts
-- on carry a non-empty description.
-- =====================================================================
SELECT
  EXISTS (SELECT 1 FROM dish_families
           WHERE family_class = 'FORM'
             AND (description IS NULL OR btrim(description) = ''))
  AND NOT (
    (SELECT count(*) FROM dish_families
      WHERE family_class = 'FORM'
        AND (description IS NULL OR btrim(description) = '')) = 66
    AND
    (SELECT count(*) FROM dish_families
      WHERE slug IN (
        'potato-dish', 'meat-dish', 'fish-dish', 'chicken-dish', 'beef-dish', 'pasta-dish',
        'pork-dish', 'egg-dish', 'lamb-dish', 'goat-meat-dish', 'seafood-dish', 'national-dish',
        'sweet-bread', 'vegetable-dish', 'offal-dish', 'stuffed-pasta', 'shrimp-dish', 'bibimbap',
        'clam-dish', 'rice', 'spread', 'tuna-dish', 'veal-dish', 'bun',
        'christmas-food', 'cooked-grain', 'holiday-dish', 'instant-noodles', 'live-seafood', 'surimi',
        'torte', 'ame', 'apple-turnover', 'breaded-cutlet', 'brioche', 'brittle',
        'buckwheat-pancake', 'chocolate-egg', 'cold-noodle', 'cotoletta', 'fermented-bean-paste', 'fish-sauce',
        'goulash', 'hedgehog-slice', 'honey', 'idli', 'leavened-bread', 'patty',
        'savoury-pie', 'scrambled-eggs', 'stuffed-pepper', 'sweet-potato-dish', 'taco', 'tripe-soup',
        'western-confection', 'white-bread'
      )
        AND description IS NOT NULL
        AND btrim(description) <> '') = 56
  ) AS have_data \gset
\if :have_data
\echo 'WP-B1: the 56 FORM families have no descriptions and this migration is not yet applied - running it'
BEGIN;

-- =====================================================================
-- THE 56 DESCRIPTIONS
--
-- The form is a VALUES list joined to the table by slug, so the UPDATE
-- touches exactly the rows named and nothing else.
-- =====================================================================
UPDATE dish_families AS f
   SET description = v.description
  FROM (VALUES
    ('potato-dish', 'A dish where potato is the main ingredient, boiled, fried, baked or mashed.'),
    ('meat-dish', 'A savoury dish built on a cut of red meat or game as its principal ingredient.'),
    ('fish-dish', 'A dish in which fish is the principal ingredient, whole, filleted or cut into steaks.'),
    ('chicken-dish', 'A dish in which chicken meat is the principal ingredient, roasted, fried, grilled or stewed.'),
    ('beef-dish', 'A savoury dish built on a cut of beef as its principal ingredient.'),
    ('pasta-dish', 'A dish of cooked pasta served with a sauce, in a bake, or with cheese.'),
    ('pork-dish', 'A savoury dish built on a cut of pork as its principal ingredient.'),
    ('egg-dish', 'A dish in which eggs are the principal ingredient, fried, boiled, poached or baked.'),
    ('lamb-dish', 'A dish in which lamb is the principal ingredient, usually roasted, grilled or braised.'),
    ('goat-meat-dish', 'A dish in which goat meat is the principal ingredient, commonly roasted or stewed.'),
    ('seafood-dish', 'A dish in which shellfish or other seafood is the principal ingredient.'),
    ('national-dish', 'A dish widely recognised as emblematic of one country''s cuisine.'),
    ('sweet-bread', 'A sweet, enriched loaf or cake leavened with yeast and often spiced or fruited.'),
    ('vegetable-dish', 'A dish in which vegetables are the principal ingredient rather than a garnish.'),
    ('offal-dish', 'A dish made from the edible organs of animals, such as liver, kidney, heart or tripe.'),
    ('stuffed-pasta', 'A pasta shape filled with a mixture, then baked or boiled in sauce.'),
    ('shrimp-dish', 'A dish in which shrimp or prawns are the principal ingredient.'),
    ('bibimbap', 'A Korean mixed bowl of rice topped with seasoned vegetables, meat, a fried egg and gochujang.'),
    ('clam-dish', 'A dish of clams or mussels, steamed or baked in broth, butter or tomato sauce.'),
    ('rice', 'A dish of rice, plain or mixed with other grains, vegetables, meat or beans.'),
    ('spread', 'A soft preparation meant to be spread on bread or toast rather than served on its own.'),
    ('tuna-dish', 'A dish in which tuna is the principal ingredient, raw, seared or canned.'),
    ('veal-dish', 'A dish in which veal is the principal ingredient, commonly pan-fried, roasted or braised.'),
    ('bun', 'A small, soft leavened bread roll, either sweet or savoury.'),
    ('christmas-food', 'A dish eaten as part of a Christmas meal, in a household or a tavern.'),
    ('cooked-grain', 'A dish of grain cooked until soft, such as rice, corn, millet or quinoa.'),
    ('holiday-dish', 'A dish associated with a particular seasonal or religious celebration.'),
    ('instant-noodles', 'Noodles dried with seasoning, rehydrated in hot water and eaten from the packet.'),
    ('live-seafood', 'Shellfish served raw, alive and unprepared, to be cooked or dressed at the table.'),
    ('surimi', 'Minced fish paste shaped and coloured to imitate crab, scallop or lobster.'),
    ('torte', 'A dense layer cake, usually chocolate, fruit or nut, with a firm crumb.'),
    ('ame', 'Small Japanese sweets of agar jelly, dusted with starch and coloured.'),
    ('apple-turnover', 'Pastry folded over spiced apple, baked and served warm or cold.'),
    ('breaded-cutlet', 'A slice or fillet of meat coated in breadcrumbs and fried or baked until crisp.'),
    ('brioche', 'A soft enriched bread dough raised with egg and butter.'),
    ('brittle', 'A hard confection of caramelised sugar set with nuts, seeds or dried fruit.'),
    ('buckwheat-pancake', 'A savoury crêpe of buckwheat flour, folded around cheese, ham or vegetables and fried.'),
    ('chocolate-egg', 'A hollow chocolate shell filled with a soft centre of custard or mousse.'),
    ('cold-noodle', 'Chilled wheat noodles dressed with vinegar, sesame or a broth and eaten cold.'),
    ('cotoletta', 'A breaded and fried cutlet of veal or chicken, served with rice or greens.'),
    ('fermented-bean-paste', 'A dark, salty paste of fermented beans used as a seasoning and base for soup.'),
    ('fish-sauce', 'A salty liquid seasoning made by fermenting anchovies in brine.'),
    ('goulash', 'A stew of beef and vegetables seasoned with paprika, often served with sour cream.'),
    ('hedgehog-slice', 'A novelty bake of pastry rolls arranged around a central slice to look spined.'),
    ('honey', 'The thick golden syrup bees make from flower nectar, used as a sweetener or glaze.'),
    ('idli', 'Steamed cakes of fermented rice and lentil batter, served with sambar and chutney.'),
    ('leavened-bread', 'Bread dough left to rise before baking, giving an open crumb and a crisp crust.'),
    ('patty', 'A flat round of minced meat, fish or vegetables, fried or grilled and served in a bun.'),
    ('savoury-pie', 'Pasty pastry with a filling of meat, vegetables or cheese, baked in a tin.'),
    ('scrambled-eggs', 'Beaten eggs stirred while cooking until they set into soft curds.'),
    ('stuffed-pepper', 'A pepper hollowed out, filled with rice, meat or vegetables and baked until soft.'),
    ('sweet-potato-dish', 'A dish in which sweet potato is roasted, mashed or baked and served as the main.'),
    ('taco', 'A corn or wheat tortilla folded around a filling of meat, salsa, cheese or salad.'),
    ('tripe-soup', 'Tripe slow-cooked until tender and served in broth with vegetables and herbs.'),
    ('western-confection', 'A Japanese sweet of chocolate, cream and biscuit, often cut into small squares.'),
    ('white-bread', 'A plain loaf of wheat flour and yeast, baked pale with a soft, even crumb.')
       ) AS v(slug, description)
 WHERE f.slug = v.slug;

-- The write must have landed on every row it named. A partial write
-- would leave some families unlisted and their dishes without a
-- family, so this fails loudly rather than half-applying.
DO $$
DECLARE
  the_count integer;
BEGIN
  SELECT count(*) INTO the_count
    FROM dish_families
   WHERE slug IN (
        'potato-dish', 'meat-dish', 'fish-dish', 'chicken-dish', 'beef-dish', 'pasta-dish',
        'pork-dish', 'egg-dish', 'lamb-dish', 'goat-meat-dish', 'seafood-dish', 'national-dish',
        'sweet-bread', 'vegetable-dish', 'offal-dish', 'stuffed-pasta', 'shrimp-dish', 'bibimbap',
        'clam-dish', 'rice', 'spread', 'tuna-dish', 'veal-dish', 'bun',
        'christmas-food', 'cooked-grain', 'holiday-dish', 'instant-noodles', 'live-seafood', 'surimi',
        'torte', 'ame', 'apple-turnover', 'breaded-cutlet', 'brioche', 'brittle',
        'buckwheat-pancake', 'chocolate-egg', 'cold-noodle', 'cotoletta', 'fermented-bean-paste', 'fish-sauce',
        'goulash', 'hedgehog-slice', 'honey', 'idli', 'leavened-bread', 'patty',
        'savoury-pie', 'scrambled-eggs', 'stuffed-pepper', 'sweet-potato-dish', 'taco', 'tripe-soup',
        'western-confection', 'white-bread'
     )
     AND description IS NOT NULL
     AND btrim(description) <> '';

  IF the_count <> 56 THEN
    RAISE EXCEPTION '0059: expected 56 family descriptions, got %', the_count;
  END IF;
END
$$;

\echo 'WP-B1: 0059: ok -- 56 FORM families now carry a description and stay listed'

COMMIT;
\else
\echo 'WP-B1: 0059: skipped -- the 56 descriptions are already present, or the seeded data is absent'
\endif
