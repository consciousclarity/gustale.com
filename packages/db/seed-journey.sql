-- Gustale — minimal CI fixture for P1-1 Dish Journey tests.
-- Applied after seed-moussaka.sql. Idempotent (ON CONFLICT DO NOTHING).
-- Provides: published vindaloo (3 beats + source), published gazpacho (no beats).
-- Dish IDs are resolved by slug so this stays safe when a fuller seed already
-- inserted those dishes under different UUIDs.

BEGIN;

INSERT INTO geo_entities (id, name, iso_code, entity_type)
VALUES
  ('00000000-0000-0000-0000-000000000011'::uuid, 'India', 'IN', 'country'),
  ('00000000-0000-0000-0000-000000000012'::uuid, 'Spain', 'ES', 'country')
ON CONFLICT (id) DO NOTHING;

INSERT INTO dishes (
  id, slug, canonical_name, short_description, long_description,
  status, origin_geo_id, created_by, last_edited_by
)
VALUES (
  '00000000-0000-0000-0000-000000000030'::uuid,
  'vindaloo',
  'Vindaloo',
  'A Goan curry of Portuguese origin.',
  'CI fixture dish for journey beat tests.',
  'published',
  '00000000-0000-0000-0000-000000000011'::uuid,
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000001'
)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO dishes (
  id, slug, canonical_name, short_description, long_description,
  status, origin_geo_id, created_by, last_edited_by
)
VALUES (
  '00000000-0000-0000-0000-000000000031'::uuid,
  'gazpacho',
  'Gazpacho',
  'A cold Andalusian vegetable soup.',
  'CI fixture dish with an empty journey.',
  'published',
  '00000000-0000-0000-0000-000000000012'::uuid,
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000001'
)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO dish_translations (dish_id, language, name, description)
SELECT d.id, 'en', 'Vindaloo', 'A Goan curry of Portuguese origin.'
FROM dishes d
WHERE d.slug = 'vindaloo'
ON CONFLICT (dish_id, language) DO NOTHING;

INSERT INTO dish_translations (dish_id, language, name, description)
SELECT d.id, 'en', 'Gazpacho', 'A cold Andalusian vegetable soup.'
FROM dishes d
WHERE d.slug = 'gazpacho'
ON CONFLICT (dish_id, language) DO NOTHING;

INSERT INTO sources (
  id, source_type, title, authors, year, publisher, url, citation_text,
  language, reliability, created_by
)
VALUES (
  '00000000-0000-0000-0000-000000000210'::uuid,
  'web',
  'Vindaloo',
  ARRAY['Wikipedia contributors'],
  2024,
  'Wikipedia, The Free Encyclopedia',
  'https://en.wikipedia.org/wiki/Vindaloo',
  'Wikipedia. (2024). Vindaloo. https://en.wikipedia.org/wiki/Vindaloo',
  'en',
  'secondary',
  '00000000-0000-0000-0000-000000000001'
)
ON CONFLICT (id) DO NOTHING;

-- Skip beat insert when this dish already has journey rows (full seed).
INSERT INTO dish_journey_beats (
  id, dish_id, sequence, place_name, lat, lng, year_approx, label, confidence, source_id
)
SELECT
  '00000000-0000-0000-0000-000000000311'::uuid,
  d.id,
  1,
  'Portugal',
  38.7223,
  -9.1393,
  1500,
  'Carne de vinha d''alhos travels with Portuguese sailors.',
  'documented',
  '00000000-0000-0000-0000-000000000210'::uuid
FROM dishes d
WHERE d.slug = 'vindaloo'
  AND NOT EXISTS (
    SELECT 1 FROM dish_journey_beats b WHERE b.dish_id = d.id
  )
ON CONFLICT (id) DO NOTHING;

INSERT INTO dish_journey_beats (
  id, dish_id, sequence, place_name, lat, lng, year_approx, label, confidence, source_id
)
SELECT
  '00000000-0000-0000-0000-000000000312'::uuid,
  d.id,
  2,
  'Goa',
  15.4909,
  73.8278,
  1600,
  'In Portuguese Goa the marinade meets chilli and local spice.',
  'documented',
  '00000000-0000-0000-0000-000000000210'::uuid
FROM dishes d
WHERE d.slug = 'vindaloo'
  AND NOT EXISTS (
    SELECT 1
    FROM dish_journey_beats b
    WHERE b.dish_id = d.id AND b.sequence = 2
  )
ON CONFLICT (id) DO NOTHING;

INSERT INTO dish_journey_beats (
  id, dish_id, sequence, place_name, lat, lng, year_approx, label, confidence, source_id
)
SELECT
  '00000000-0000-0000-0000-000000000313'::uuid,
  d.id,
  3,
  'United Kingdom',
  51.5074,
  -0.1278,
  1970,
  'British curry-house vindaloo becomes a hotter, tomato-forward take.',
  'likely',
  NULL
FROM dishes d
WHERE d.slug = 'vindaloo'
  AND NOT EXISTS (
    SELECT 1
    FROM dish_journey_beats b
    WHERE b.dish_id = d.id AND b.sequence = 3
  )
ON CONFLICT (id) DO NOTHING;

COMMIT;
