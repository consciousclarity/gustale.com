-- Gustale — raw-SQL seed for the VPS
-- One Moussaka dish with all relations populated.
-- Safe to re-run: every insert uses ON CONFLICT DO NOTHING.

BEGIN;

-- User (creator / last editor)
INSERT INTO users (id, email, display_name, role)
VALUES ('00000000-0000-0000-0000-000000000001'::uuid, 'alex@example.com', 'Alejandro Aguilar', 'admin')
ON CONFLICT (id) DO NOTHING;

-- Categories
INSERT INTO categories (slug, name, description) VALUES
  ('moussaka', 'Moussaka', 'Layered eggplant and meat dishes'),
  ('greek-cuisine', 'Greek cuisine', 'Cuisine of Greece')
ON CONFLICT (slug) DO NOTHING;

-- Preparation methods
INSERT INTO preparation_methods (slug, name, category) VALUES
  ('bake', 'Baking', 'dry-heat'),
  ('simmer', 'Simmering', 'moist-heat')
ON CONFLICT (slug) DO NOTHING;

-- Geo: Greece
INSERT INTO geo_entities (id, name, iso_code, entity_type)
VALUES ('00000000-0000-0000-0000-000000000010'::uuid, 'Greece', 'GR', 'country')
ON CONFLICT (id) DO NOTHING;

-- Ingredients
INSERT INTO ingredients (slug, canonical_name, status, created_by) VALUES
  ('eggplant',     'Eggplant',           'published', '00000000-0000-0000-0000-000000000001'::uuid),
  ('lamb-mince',   'Lamb, minced',       'published', '00000000-0000-0000-0000-000000000001'::uuid),
  ('tomato',       'Tomato',             'published', '00000000-0000-0000-0000-000000000001'::uuid),
  ('bechamel',     'Béchamel sauce',     'published', '00000000-0000-0000-0000-000000000001'::uuid)
ON CONFLICT (slug) DO NOTHING;

-- Dish: Moussaka
INSERT INTO dishes (
  id, slug, canonical_name, short_description, long_description,
  status, origin_geo_id, origin_date_earliest, origin_date_latest,
  created_by, last_edited_by
)
SELECT
  '00000000-0000-0000-0000-000000000020'::uuid,
  'moussaka-greek',
  'Moussaka',
  'A layered casserole of eggplant, minced meat, and béchamel sauce, baked until golden. The national dish of Greece.',
  'Greek moussaka combines fried or roasted eggplant layers with a spiced meat sauce (lamb or beef) and a thick, cheese-topped béchamel. The dish is baked until the top turns golden brown. Regional variants exist across the Balkans, Levant, and Egypt.',
  'published',
  '00000000-0000-0000-0000-000000000010'::uuid,
  1920, 1950,
  '00000000-0000-0000-0000-000000000001'::uuid,
  '00000000-0000-0000-0000-000000000001'::uuid
ON CONFLICT (slug) DO NOTHING;

-- Update origin_location (PostGIS)
UPDATE dishes
SET origin_location = ST_SetSRID(ST_MakePoint(23.7275, 37.9838), 4326)
WHERE id = '00000000-0000-0000-0000-000000000020'::uuid
  AND origin_location IS NULL;

-- Dish translation
INSERT INTO dish_translations (dish_id, language, name, description)
VALUES (
  '00000000-0000-0000-0000-000000000020'::uuid,
  'en',
  'Moussaka',
  'The Greek national casserole of eggplant, meat, and béchamel.'
)
ON CONFLICT (dish_id, language) DO NOTHING;

-- Dish categories
INSERT INTO dish_categories (dish_id, category_id, is_primary)
SELECT '00000000-0000-0000-0000-000000000020'::uuid, id, true
FROM categories WHERE slug = 'moussaka'
ON CONFLICT (dish_id, category_id) DO NOTHING;

INSERT INTO dish_categories (dish_id, category_id, is_primary)
SELECT '00000000-0000-0000-0000-000000000020'::uuid, id, false
FROM categories WHERE slug = 'greek-cuisine'
ON CONFLICT (dish_id, category_id) DO NOTHING;

-- Dish variant
INSERT INTO dish_variants (parent_dish_id, name, slug, description, status, creator_name)
VALUES (
  '00000000-0000-0000-0000-000000000020'::uuid,
  'Turkish Moussaka (Musakka)',
  'musakka-turkish',
  'A Turkish variant, often lighter, sometimes without béchamel, using green peppers and tomatoes.',
  'published',
  'Anonymous'
)
ON CONFLICT (parent_dish_id, slug) DO NOTHING;

-- Dish ingredients
INSERT INTO dish_ingredients (dish_id, ingredient_id, position, quantity, unit)
SELECT '00000000-0000-0000-0000-000000000020'::uuid, id, 0, '4', 'medium'
FROM ingredients WHERE slug = 'eggplant'
ON CONFLICT DO NOTHING;

INSERT INTO dish_ingredients (dish_id, ingredient_id, position, quantity, unit)
SELECT '00000000-0000-0000-0000-000000000020'::uuid, id, 1, '500', 'g'
FROM ingredients WHERE slug = 'lamb-mince'
ON CONFLICT DO NOTHING;

INSERT INTO dish_ingredients (dish_id, ingredient_id, position, quantity, unit)
SELECT '00000000-0000-0000-0000-000000000020'::uuid, id, 2, '400', 'g'
FROM ingredients WHERE slug = 'tomato'
ON CONFLICT DO NOTHING;

INSERT INTO dish_ingredients (dish_id, ingredient_id, position, quantity, unit)
SELECT '00000000-0000-0000-0000-000000000020'::uuid, id, 3, '500', 'ml'
FROM ingredients WHERE slug = 'bechamel'
ON CONFLICT DO NOTHING;

-- Preparations
INSERT INTO dish_preparations (dish_id, method_id, sequence_order, duration_minutes, difficulty, steps)
SELECT '00000000-0000-0000-0000-000000000020'::uuid, id, 0, 45, 2,
       'Brown the minced lamb with onion and garlic. Add tomatoes, cinnamon, and a pinch of allspice. Simmer 30 minutes until thickened.'
FROM preparation_methods WHERE slug = 'simmer'
ON CONFLICT DO NOTHING;

INSERT INTO dish_preparations (dish_id, method_id, sequence_order, duration_minutes, difficulty, steps)
SELECT '00000000-0000-0000-0000-000000000020'::uuid, id, 1, 60, 3,
       'Layer fried eggplant slices and the meat sauce in a baking dish. Pour béchamel on top, sprinkle with kefalotyri. Bake at 180°C for 45 minutes until golden.'
FROM preparation_methods WHERE slug = 'bake'
ON CONFLICT DO NOTHING;

-- Media (one cover image)
INSERT INTO media (
  id, storage_key, mime_type, byte_size, width, height,
  alt_text, credit, license, uploaded_by
)
VALUES (
  '00000000-0000-0000-0000-000000000100'::uuid,
  'dishes/moussaka-greek/cover.jpg',
  'image/jpeg',
  245678,
  1600, 1067,
  'A Greek moussaka fresh from the oven, golden béchamel on top.',
  'Photo by test seed',
  'CC-BY-SA-4.0',
  '00000000-0000-0000-0000-000000000001'::uuid
)
ON CONFLICT (id) DO NOTHING;

-- Media attachment
INSERT INTO media_attachments (media_id, target_type, target_id, role, position)
VALUES (
  '00000000-0000-0000-0000-000000000100'::uuid,
  'dish',
  '00000000-0000-0000-0000-000000000020'::uuid,
  'cover',
  0
)
ON CONFLICT DO NOTHING;

-- Source (Wikipedia: Moussaka)
INSERT INTO sources (
  id, source_type, title, authors, year, publisher, url, citation_text, language, reliability, created_by
)
VALUES (
  '00000000-0000-0000-0000-000000000200'::uuid,
  'web',
  'Moussaka',
  ARRAY['Wikipedia contributors'],
  2024,
  'Wikipedia, The Free Encyclopedia',
  'https://en.wikipedia.org/wiki/Moussaka',
  'Wikipedia. (2024). Moussaka. Retrieved from https://en.wikipedia.org/wiki/Moussaka',
  'en',
  'secondary',
  '00000000-0000-0000-0000-000000000001'::uuid
)
ON CONFLICT (id) DO NOTHING;

-- Citation
INSERT INTO citations (source_id, target_type, target_id, claim_text, location, added_by)
VALUES (
  '00000000-0000-0000-0000-000000000200'::uuid,
  'dish',
  '00000000-0000-0000-0000-000000000020'::uuid,
  'Moussaka is a dish popular in Greece, the Balkans, and the Levant.',
  'History section',
  '00000000-0000-0000-0000-000000000001'::uuid
)
ON CONFLICT DO NOTHING;

COMMIT;

-- Verify
SELECT 'dish_count' AS metric, count(*) AS value FROM dishes
UNION ALL
SELECT 'ingredient_count', count(*) FROM ingredients
UNION ALL
SELECT 'media_count', count(*) FROM media
UNION ALL
SELECT 'source_count', count(*) FROM sources
UNION ALL
SELECT 'preparation_count', count(*) FROM dish_preparations;
