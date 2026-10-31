-- Gustale — CI fixture for the four REFERENCE dishes (ADR-004, KANBAN.md §6)
--
-- WHY THIS FILE EXISTS
--
-- The CI database is built from the committed migration chain plus a
-- SMALL seed: moussaka-greek, vindaloo and gazpacho. That seed exercises
-- the SCHEMA, but it does not exercise the BACKFILL, because:
--
--   - the three seed dishes produce FIVE associations in total;
--   - the CI output showed "statements: 0 total", which is the giveaway:
--     there is no catalog for the backfill to read.
--
-- So `ATLAS_BACKFILL_OK=1` in CI proved only that migration 0037 EXECUTES.
-- It did not prove that it produces the right associations for the dishes
-- the project actually cares about. A backfill that produced ZERO
-- associations would have passed the same gate.
--
-- The four reference dishes are the acceptance fixtures for every
-- structural change:
--
--   rendang               two traditions + one origin  -> 3 associations
--   chicken-tikka-masala  no tradition, one origin      -> 1 association
--   tacos-al-pastor      one tradition + one origin    -> 2 associations
--   falafel               one tradition + one origin    -> 2 associations
--
-- These are the EXACT shapes they have on live, reproduced here from the
-- legacy fields the backfill reads:
--
--   dishes.origin_geo_id        -> the `legacy_unreviewed` (place) row
--   dish_dish_cuisines          -> the `established_tradition` row, when
--                                  a tradition row matches the cuisine
--                                  slug with a '-cuisine' suffix
--   dish_dish_traditions        -> the `established_tradition` row
--
-- falafel is included on purpose: it is the brief's §12 acceptance case,
-- and the one where the journey text and the legacy origin DISAGREE.
--
-- Applied after seed-moussaka.sql and seed-journey.sql. Idempotent
-- (ON CONFLICT DO NOTHING throughout), so it is safe to re-run.
--
-- The dish ids are resolved BY SLUG, so this stays safe when a fuller
-- seed has already inserted these dishes under different UUIDs.

BEGIN;

-- ---------------------------------------------------------------------
-- The countries. The GUS-242 country seed creates its own rows for
-- these with ids derived from the Wikidata Q-id, so the ids are
-- RESOLVED rather than hard-coded — the same fix seed-moussaka.sql makes
-- for Greece. A hard-coded id would create a second row with the same
-- iso_code and break the unique constraint on it.
-- ---------------------------------------------------------------------
DO $$
DECLARE
  -- The country codes, and the geo_entities id used when the row has to
  -- be created from scratch.
  v_countries text[] := ARRAY['ID','MX','IL','GB'];
  v_codes     text[] := ARRAY['ID','MX','IL','GB'];
  v_ids       uuid[] := ARRAY[
    '00000000-0000-0000-0000-000000000041'::uuid,
    '00000000-0000-0000-0000-000000000042'::uuid,
    '00000000-0000-0000-0000-000000000043'::uuid,
    '00000000-0000-0000-0000-000000000044'::uuid
  ];
  v_names     text[] := ARRAY['Indonesia','Mexico','Israel','United Kingdom'];
  i int;
  v_id uuid;
BEGIN
  DROP TABLE IF EXISTS _seed_atlas_geo_ids;
  CREATE TEMP TABLE _seed_atlas_geo_ids (iso_code text PRIMARY KEY, id uuid);

  FOR i IN 1..array_length(v_codes, 1) LOOP
    SELECT id INTO v_id FROM geo_entities WHERE iso_code = v_codes[i] LIMIT 1;

    IF v_id IS NULL THEN
      INSERT INTO geo_entities (id, name, iso_code, entity_type)
      VALUES (v_ids[i], v_names[i], v_codes[i], 'country')
      ON CONFLICT (id) DO NOTHING;
      SELECT id INTO v_id FROM geo_entities WHERE iso_code = v_codes[i] LIMIT 1;
    END IF;

    INSERT INTO _seed_atlas_geo_ids (iso_code, id)
    VALUES (v_codes[i], v_id)
    ON CONFLICT (iso_code) DO UPDATE SET id = EXCLUDED.id;
  END LOOP;
END $$;

-- ---------------------------------------------------------------------
-- The dishes.
--
-- `chicken-tikka-masala` carries NO legacy cuisine and NO legacy
-- tradition on live — its only legacy field is the origin. That is
-- deliberate: it is the case that proves the backfill does NOT invent a
-- tradition where the legacy data has none.
-- ---------------------------------------------------------------------
INSERT INTO dishes (
  id, slug, canonical_name, short_description, long_description,
  status, origin_geo_id, created_by, last_edited_by
)
VALUES
  ('00000000-0000-0000-0000-000000000040'::uuid,
   'rendang',
   'Rendang',
   'A slow-cooked spiced meat dish from West Sumatra.',
   'CI fixture dish: two legacy traditions and one legacy origin.',
   'published',
   (SELECT id FROM _seed_atlas_geo_ids WHERE iso_code = 'ID'),
   '00000000-0000-0000-0000-000000000001',
   '00000000-0000-0000-0000-000000000001'),
  ('00000000-0000-0000-0000-000000000041'::uuid,
   'chicken-tikka-masala',
   'Chicken tikka masala',
   'A British dish of marinated chicken in a spiced tomato sauce.',
   'CI fixture dish: no legacy tradition and no legacy cuisine, only a legacy origin.',
   'published',
   (SELECT id FROM _seed_atlas_geo_ids WHERE iso_code = 'GB'),
   '00000000-0000-0000-0000-000000000001',
   '00000000-0000-0000-0000-000000000001'),
  ('00000000-0000-0000-0000-000000000042'::uuid,
   'tacos-al-pastor',
   'Tacos al pastor',
   'Marinated pork tacos folded with pineapple.',
   'CI fixture dish: one legacy cuisine and one legacy origin.',
   'published',
   (SELECT id FROM _seed_atlas_geo_ids WHERE iso_code = 'MX'),
   '00000000-0000-0000-0000-000000000001',
   '00000000-0000-0000-0000-000000000001'),
  ('00000000-0000-0000-0000-000000000043'::uuid,
   'falafel',
   'Falafel',
   'Deep-fried chickpea or fava fritters.',
   'CI fixture dish: one legacy cuisine and one legacy origin, and a journey that contradicts the origin.',
   'published',
   (SELECT id FROM _seed_atlas_geo_ids WHERE iso_code = 'IL'),
   '00000000-0000-0000-0000-000000000001',
   '00000000-0000-0000-0000-000000000001')
ON CONFLICT (slug) DO NOTHING;

-- ---------------------------------------------------------------------
-- The cuisines. The GUS-242 cuisine seed creates these, so the rows are
-- resolved by slug and only created if they are missing.
-- ---------------------------------------------------------------------
DO $$
DECLARE
  v_cuisines text[] := ARRAY['indonesian','mexican','israeli'];
  v_names    text[] := ARRAY['Indonesian','Mexican','Israeli'];
  v_ids      uuid[] := ARRAY[
    '00000000-0000-0000-0000-000000000051'::uuid,
    '00000000-0000-0000-0000-000000000052'::uuid,
    '00000000-0000-0000-0000-000000000053'::uuid
  ];
  i int;
  v_id uuid;
BEGIN
  FOR i IN 1..array_length(v_cuisines, 1) LOOP
    SELECT id INTO v_id FROM dish_cuisines WHERE slug = v_cuisines[i] LIMIT 1;

    IF v_id IS NULL THEN
      INSERT INTO dish_cuisines (id, slug, name)
      VALUES (v_ids[i], v_cuisines[i], v_names[i])
      ON CONFLICT (id) DO NOTHING;
      SELECT id INTO v_id FROM dish_cuisines WHERE slug = v_cuisines[i] LIMIT 1;
    END IF;
  END LOOP;
END $$;

-- The dish -> cuisine assignments. `is_primary` is true, because on live
-- these are each the dish's single cuisine.
--
-- chicken-tikka-masala is deliberately ABSENT: on live it has no legacy
-- cuisine row at all.
INSERT INTO dish_dish_cuisines (dish_id, value_id, is_primary, provenance, status)
SELECT d.id, c.id, true, 'preparation', 'active'
  FROM dishes d
  JOIN dish_cuisines c ON c.slug IN ('indonesian','mexican','israeli')
 WHERE d.slug = CASE c.slug
                 WHEN 'indonesian' THEN 'rendang'
                 WHEN 'mexican'    THEN 'tacos-al-pastor'
                 WHEN 'israeli'    THEN 'falafel'
               END
ON CONFLICT (dish_id) DO NOTHING;

-- ---------------------------------------------------------------------
-- The traditions. `minangkabau` is rendang's own legacy tradition; the
-- other three are the '-cuisine' traditions the backfill matches by
-- slug.
-- ---------------------------------------------------------------------
DO $$
DECLARE
  v_traditions text[] := ARRAY['minangkabau','indonesian-cuisine','mexican-cuisine','israeli-cuisine'];
  v_names      text[] := ARRAY['Minangkabau','Indonesian cuisine','Mexican cuisine','Israeli cuisine'];
  v_ids        uuid[] := ARRAY[
    '00000000-0000-0000-0000-000000000061'::uuid,
    '00000000-0000-0000-0000-000000000062'::uuid,
    '00000000-0000-0000-0000-000000000063'::uuid,
    '00000000-0000-0000-0000-000000000064'::uuid
  ];
  i int;
  v_id uuid;
BEGIN
  FOR i IN 1..array_length(v_traditions, 1) LOOP
    SELECT id INTO v_id FROM dish_traditions WHERE slug = v_traditions[i] LIMIT 1;

    IF v_id IS NULL THEN
      INSERT INTO dish_traditions (id, slug, name)
      VALUES (v_ids[i], v_traditions[i], v_names[i])
      ON CONFLICT (id) DO NOTHING;
      SELECT id INTO v_id FROM dish_traditions WHERE slug = v_traditions[i] LIMIT 1;
    END IF;
  END LOOP;
END $$;

-- rendang's own legacy tradition. This is the row that becomes the
-- `established_tradition` (community) association with provenance
-- 'legacy_dish_traditions'.
INSERT INTO dish_dish_traditions (dish_id, value_id, provenance, status)
SELECT d.id, t.id, 'preparation', 'active'
  FROM dishes d
  JOIN dish_traditions t ON t.slug = 'minangkabau'
 WHERE d.slug = 'rendang'
ON CONFLICT (dish_id, value_id) DO NOTHING;

-- ---------------------------------------------------------------------
-- The journey beats for falafel.
--
-- These are the ones that make the falafel case real: the journey says
-- the origin is CONTESTED between Egypt and the Levant, while the legacy
-- origin field says Israel. The backfill reads the legacy field, so the
-- journey text is the thing that produced NO association — which is
-- exactly what the editorial queue is for.
--
-- The beats are marked `possible` / `documented` / `parallel`, which are
-- the values the column's CHECK constraint allows.
-- ---------------------------------------------------------------------
INSERT INTO dish_journey_beats (
  dish_id, sequence, place_name, year_approx, label, confidence
)
SELECT d.id, 1, 'Egypt / Levant', 1800,
       'Deep-fried chickpea or fava fritters — origin is contested between Egypt (ta''amiya) and the wider Levant.',
       'possible'
  FROM dishes d WHERE d.slug = 'falafel'
ON CONFLICT (dish_id, sequence) DO NOTHING;

INSERT INTO dish_journey_beats (
  dish_id, sequence, place_name, year_approx, label, confidence
)
SELECT d.id, 2, 'Levantine cities', 1950,
       'Street falafel in pita with tahini and salad becomes everyday Levantine fast food.',
       'documented'
  FROM dishes d WHERE d.slug = 'falafel'
ON CONFLICT (dish_id, sequence) DO NOTHING;

INSERT INTO dish_journey_beats (
  dish_id, sequence, place_name, year_approx, label, confidence
)
SELECT d.id, 3, 'Global', 1980,
       'Vegetarian and street-food waves carry falafel worldwide; regional rivalries over authentic origin continue.',
       'parallel'
  FROM dishes d WHERE d.slug = 'falafel'
ON CONFLICT (dish_id, sequence) DO NOTHING;

COMMIT;
