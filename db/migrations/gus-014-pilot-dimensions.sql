-- =====================================================================
-- GUS-014 pilot migration — canonical dish dimensions
--
-- Scope: the 3 reference dishes ONLY (rendang, chicken-tikka-masala,
--         tacos-al-pastor). The 118-dish run is a separate task and
--         requires Alejandro's explicit go.
--
-- Spec:  .hermes/REPORTS/GUS-014-pilot-spec.md
-- ADR:   .hermes/REPORTS/ADR-001-canonical-entity-model.md (D1-D7, D3b-D3h, D4a)
--
-- Creates the 7 dimension tables + their joins, populates them for the
-- 3 pilot dishes, and records every write in edit_history with the
-- comment 'GUS-014 pilot'.
--
-- Safe to re-run: every write is guarded by NOT EXISTS / ON CONFLICT.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1. Dimension value tables
--
-- Each dimension has:
--   - its own value table (the controlled vocabulary)
--   - its own join table (dish -> value)
--
-- Single-valued dimensions (D7b): dish_family, dish_cuisine, dish_course
--   -> the join has a UNIQUE (dish_id) constraint, so a second value
--      cannot be written.
-- Multi-valued dimensions (D7b): dish_technique, ingredient_category,
--   dish_tradition, dish_context
--   -> the join has a UNIQUE (dish_id, value_id) constraint.
--
-- ingredient_category carries a `parent_id` so PARENT categories can be
-- DERIVED at query time and are never stored on a dish (D3h).
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS dish_families (
  id          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  slug        text NOT NULL UNIQUE,
  name        text NOT NULL,
  description text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS dish_cuisines (
  id          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  slug        text NOT NULL UNIQUE,
  name        text NOT NULL,
  description text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS dish_courses (
  id          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  slug        text NOT NULL UNIQUE,
  name        text NOT NULL,
  description text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS dish_techniques (
  id          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  slug        text NOT NULL UNIQUE,
  name        text NOT NULL,
  description text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ingredient_categories (
  id          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  slug        text NOT NULL UNIQUE,
  name        text NOT NULL,
  -- D3h: parent categories are DERIVED, never stored on a dish.
  parent_id   uuid REFERENCES ingredient_categories(id),
  description text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS dish_traditions (
  id          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  slug        text NOT NULL UNIQUE,
  name        text NOT NULL,
  description text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS dish_contexts (
  id          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  slug        text NOT NULL UNIQUE,
  name        text NOT NULL,
  description text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------
-- 2. Join tables
-- ---------------------------------------------------------------------

-- Single-valued: UNIQUE (dish_id) enforces one value per dimension.
CREATE TABLE IF NOT EXISTS dish_dish_families (
  id         uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  dish_id    uuid NOT NULL REFERENCES dishes(id) ON DELETE CASCADE,
  value_id   uuid NOT NULL REFERENCES dish_families(id) ON DELETE CASCADE,
  is_primary boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT dish_dish_families_single UNIQUE (dish_id)
);

CREATE TABLE IF NOT EXISTS dish_dish_cuisines (
  id         uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  dish_id    uuid NOT NULL REFERENCES dishes(id) ON DELETE CASCADE,
  value_id   uuid NOT NULL REFERENCES dish_cuisines(id) ON DELETE CASCADE,
  is_primary boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT dish_dish_cuisines_single UNIQUE (dish_id)
);

CREATE TABLE IF NOT EXISTS dish_dish_courses (
  id         uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  dish_id    uuid NOT NULL REFERENCES dishes(id) ON DELETE CASCADE,
  value_id   uuid NOT NULL REFERENCES dish_courses(id) ON DELETE CASCADE,
  is_primary boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT dish_dish_courses_single UNIQUE (dish_id)
);

-- Multi-valued: UNIQUE (dish_id, value_id) allows several values, no duplicates.
CREATE TABLE IF NOT EXISTS dish_dish_techniques (
  id         uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  dish_id    uuid NOT NULL REFERENCES dishes(id) ON DELETE CASCADE,
  value_id   uuid NOT NULL REFERENCES dish_techniques(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT dish_dish_techniques_unique UNIQUE (dish_id, value_id)
);

CREATE TABLE IF NOT EXISTS dish_dish_ingredient_categories (
  id         uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  dish_id    uuid NOT NULL REFERENCES dishes(id) ON DELETE CASCADE,
  value_id   uuid NOT NULL REFERENCES ingredient_categories(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT dish_dish_ingredient_categories_unique UNIQUE (dish_id, value_id)
);

CREATE TABLE IF NOT EXISTS dish_dish_traditions (
  id         uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  dish_id    uuid NOT NULL REFERENCES dishes(id) ON DELETE CASCADE,
  value_id   uuid NOT NULL REFERENCES dish_traditions(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT dish_dish_traditions_unique UNIQUE (dish_id, value_id)
);

CREATE TABLE IF NOT EXISTS dish_dish_contexts (
  id         uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  dish_id    uuid NOT NULL REFERENCES dishes(id) ON DELETE CASCADE,
  value_id   uuid NOT NULL REFERENCES dish_contexts(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT dish_dish_contexts_unique UNIQUE (dish_id, value_id)
);

-- ---------------------------------------------------------------------
-- 3. Seed the controlled vocabulary for the pilot
--
-- Only the values the pilot needs are seeded. The full vocabularies
-- live in the spec (GUS-014-pilot-spec.md section 1) and are populated
-- as each dish is migrated.
--
-- ingredient_categories parents (red-meat, white-meat, produce) are
-- seeded so the derivation works, but are NEVER assigned to a dish (D3h).
-- ---------------------------------------------------------------------

INSERT INTO dish_families (slug, name) VALUES
  ('curry', 'Curry'),
  ('taco',  'Taco')
ON CONFLICT (slug) DO NOTHING;

INSERT INTO dish_cuisines (slug, name) VALUES
  ('indonesian', 'Indonesian'),
  ('mexican',    'Mexican')
ON CONFLICT (slug) DO NOTHING;

INSERT INTO dish_courses (slug, name) VALUES
  ('main-course', 'Main course')
ON CONFLICT (slug) DO NOTHING;

INSERT INTO dish_techniques (slug, name) VALUES
  ('braising',       'Braising'),
  ('grilling',       'Grilling'),
  ('simmering',      'Simmering'),
  ('spit-roasting',  'Spit-roasting')
ON CONFLICT (slug) DO NOTHING;

INSERT INTO dish_traditions (slug, name) VALUES
  ('minangkabau', 'Minangkabau')
ON CONFLICT (slug) DO NOTHING;

INSERT INTO dish_contexts (slug, name) VALUES
  ('home',                'Home'),
  ('festival/ceremonial', 'Festival / ceremonial'),
  ('restaurant',          'Restaurant'),
  ('street-food',         'Street food')
ON CONFLICT (slug) DO NOTHING;

-- ingredient_categories: leaves + parents.
INSERT INTO ingredient_categories (slug, name) VALUES
  ('beef',     'Beef'),
  ('chicken',  'Chicken'),
  ('pork',     'Pork'),
  ('coconut',  'Coconut'),
  ('dairy',    'Dairy')
ON CONFLICT (slug) DO NOTHING;

-- Parents (D3h) — derived only, never assigned to a dish.
INSERT INTO ingredient_categories (slug, name) VALUES
  ('red-meat',   'Red meat'),
  ('white-meat', 'White meat'),
  ('produce',    'Produce')
ON CONFLICT (slug) DO NOTHING;

-- Wire the parent relationships.
UPDATE ingredient_categories c SET parent_id = p.id
FROM ingredient_categories p
WHERE c.slug = 'beef'     AND p.slug = 'red-meat'
  AND c.parent_id IS DISTINCT FROM p.id;

UPDATE ingredient_categories c SET parent_id = p.id
FROM ingredient_categories p
WHERE c.slug = 'pork'     AND p.slug = 'red-meat'
  AND c.parent_id IS DISTINCT FROM p.id;

UPDATE ingredient_categories c SET parent_id = p.id
FROM ingredient_categories p
WHERE c.slug = 'chicken'  AND p.slug = 'white-meat'
  AND c.parent_id IS DISTINCT FROM p.id;

UPDATE ingredient_categories c SET parent_id = p.id
FROM ingredient_categories p
WHERE c.slug = 'coconut'  AND p.slug = 'produce'
  AND c.parent_id IS DISTINCT FROM p.id;

-- ---------------------------------------------------------------------
-- 4. Assign dimensions to the 3 pilot dishes
--
-- Every value here comes verbatim from the spec's section 3 tables.
-- ingredient_category stores LEAVES ONLY (D3h).
-- ---------------------------------------------------------------------

-- rendang: family curry / cuisine indonesian / course main-course
--          technique braising / ingredient beef + coconut
--          tradition minangkabau / context home + festival/ceremonial + restaurant
INSERT INTO dish_dish_families (dish_id, value_id, is_primary)
SELECT d.id, v.id, true
FROM dishes d, dish_families v
WHERE d.slug = 'rendang' AND v.slug = 'curry'
ON CONFLICT (dish_id) DO NOTHING;

INSERT INTO dish_dish_cuisines (dish_id, value_id, is_primary)
SELECT d.id, v.id, true
FROM dishes d, dish_cuisines v
WHERE d.slug = 'rendang' AND v.slug = 'indonesian'
ON CONFLICT (dish_id) DO NOTHING;

INSERT INTO dish_dish_courses (dish_id, value_id, is_primary)
SELECT d.id, v.id, true
FROM dishes d, dish_courses v
WHERE d.slug = 'rendang' AND v.slug = 'main-course'
ON CONFLICT (dish_id) DO NOTHING;

INSERT INTO dish_dish_techniques (dish_id, value_id)
SELECT d.id, v.id
FROM dishes d, dish_techniques v
WHERE d.slug = 'rendang' AND v.slug = 'braising'
ON CONFLICT (dish_id, value_id) DO NOTHING;

INSERT INTO dish_dish_ingredient_categories (dish_id, value_id)
SELECT d.id, v.id
FROM dishes d, ingredient_categories v
WHERE d.slug = 'rendang' AND v.slug IN ('beef', 'coconut')
ON CONFLICT (dish_id, value_id) DO NOTHING;

INSERT INTO dish_dish_traditions (dish_id, value_id)
SELECT d.id, v.id
FROM dishes d, dish_traditions v
WHERE d.slug = 'rendang' AND v.slug = 'minangkabau'
ON CONFLICT (dish_id, value_id) DO NOTHING;

INSERT INTO dish_dish_contexts (dish_id, value_id)
SELECT d.id, v.id
FROM dishes d, dish_contexts v
WHERE d.slug = 'rendang' AND v.slug IN ('home', 'festival/ceremonial', 'restaurant')
ON CONFLICT (dish_id, value_id) DO NOTHING;

-- chicken-tikka-masala: family curry / cuisine UNSET (Glasgow dispute —
--   the migration must NOT resolve it) / course main-course
--   technique grilling + simmering / ingredient chicken + dairy
--   tradition UNSET / context restaurant
INSERT INTO dish_dish_families (dish_id, value_id, is_primary)
SELECT d.id, v.id, true
FROM dishes d, dish_families v
WHERE d.slug = 'chicken-tikka-masala' AND v.slug = 'curry'
ON CONFLICT (dish_id) DO NOTHING;

-- NOTE: no dish_dish_cuisines row for CTM — cuisine deliberately unset.

INSERT INTO dish_dish_courses (dish_id, value_id, is_primary)
SELECT d.id, v.id, true
FROM dishes d, dish_courses v
WHERE d.slug = 'chicken-tikka-masala' AND v.slug = 'main-course'
ON CONFLICT (dish_id) DO NOTHING;

INSERT INTO dish_dish_techniques (dish_id, value_id)
SELECT d.id, v.id
FROM dishes d, dish_techniques v
WHERE d.slug = 'chicken-tikka-masala' AND v.slug IN ('grilling', 'simmering')
ON CONFLICT (dish_id, value_id) DO NOTHING;

INSERT INTO dish_dish_ingredient_categories (dish_id, value_id)
SELECT d.id, v.id
FROM dishes d, ingredient_categories v
WHERE d.slug = 'chicken-tikka-masala' AND v.slug IN ('chicken', 'dairy')
ON CONFLICT (dish_id, value_id) DO NOTHING;

-- NOTE: no dish_dish_traditions row for CTM — tradition unset.

INSERT INTO dish_dish_contexts (dish_id, value_id)
SELECT d.id, v.id
FROM dishes d, dish_contexts v
WHERE d.slug = 'chicken-tikka-masala' AND v.slug = 'restaurant'
ON CONFLICT (dish_id, value_id) DO NOTHING;

-- tacos-al-pastor: family taco / cuisine mexican / course main-course
--   technique spit-roasting / ingredient pork
--   tradition UNSET / context street-food
INSERT INTO dish_dish_families (dish_id, value_id, is_primary)
SELECT d.id, v.id, true
FROM dishes d, dish_families v
WHERE d.slug = 'tacos-al-pastor' AND v.slug = 'taco'
ON CONFLICT (dish_id) DO NOTHING;

INSERT INTO dish_dish_cuisines (dish_id, value_id, is_primary)
SELECT d.id, v.id, true
FROM dishes d, dish_cuisines v
WHERE d.slug = 'tacos-al-pastor' AND v.slug = 'mexican'
ON CONFLICT (dish_id) DO NOTHING;

INSERT INTO dish_dish_courses (dish_id, value_id, is_primary)
SELECT d.id, v.id, true
FROM dishes d, dish_courses v
WHERE d.slug = 'tacos-al-pastor' AND v.slug = 'main-course'
ON CONFLICT (dish_id) DO NOTHING;

INSERT INTO dish_dish_techniques (dish_id, value_id)
SELECT d.id, v.id
FROM dishes d, dish_techniques v
WHERE d.slug = 'tacos-al-pastor' AND v.slug = 'spit-roasting'
ON CONFLICT (dish_id, value_id) DO NOTHING;

INSERT INTO dish_dish_ingredient_categories (dish_id, value_id)
SELECT d.id, v.id
FROM dishes d, ingredient_categories v
WHERE d.slug = 'tacos-al-pastor' AND v.slug = 'pork'
ON CONFLICT (dish_id, value_id) DO NOTHING;

-- NOTE: no dish_dish_traditions row for tacos — tradition unset.

INSERT INTO dish_dish_contexts (dish_id, value_id)
SELECT d.id, v.id
FROM dishes d, dish_contexts v
WHERE d.slug = 'tacos-al-pastor' AND v.slug = 'street-food'
ON CONFLICT (dish_id, value_id) DO NOTHING;

-- ---------------------------------------------------------------------
-- 5. The shawarma <-> tacos-al-pastor ancestor PAIR (D3g)
--
-- Source = ancestor: shawarma -> tacos-al-pastor, and the reverse.
-- Every relation in the live catalog is bidirectionally paired
-- (190 rows = 95 pairs, zero unpaired), and paired rows carry the SAME
-- reason string.
-- ---------------------------------------------------------------------
INSERT INTO dish_relations (id, from_dish_id, to_dish_id, relation_type, reason, strength)
SELECT gen_random_uuid(), a.id, b.id, 'ancestor',
       'Al pastor derives from Levantine shawarma, adapted in Mexico with achiote and a vertical spit',
       4
FROM dishes a, dishes b
WHERE a.slug = 'shawarma' AND b.slug = 'tacos-al-pastor'
  AND NOT EXISTS (
    SELECT 1 FROM dish_relations r
    WHERE r.from_dish_id = a.id AND r.to_dish_id = b.id AND r.relation_type = 'ancestor'
  );

INSERT INTO dish_relations (id, from_dish_id, to_dish_id, relation_type, reason, strength)
SELECT gen_random_uuid(), b.id, a.id, 'ancestor',
       'Al pastor derives from Levantine shawarma, adapted in Mexico with achiote and a vertical spit',
       4
FROM dishes a, dishes b
WHERE a.slug = 'shawarma' AND b.slug = 'tacos-al-pastor'
  AND NOT EXISTS (
    SELECT 1 FROM dish_relations r
    WHERE r.from_dish_id = b.id AND r.to_dish_id = a.id AND r.relation_type = 'ancestor'
  );

-- ---------------------------------------------------------------------
-- 6. Provenance: one edit_history row per pilot dish + updated_at bump
--
-- Comment is exactly 'GUS-014 pilot' (I14).
-- ---------------------------------------------------------------------
-- The pilot touches FOUR dishes, not three: the 3 pilot dishes, plus
-- `shawarma`, which is the ancestor side of the new relation pair. A
-- relation is part of a dish's content digest, so shawarma's content
-- genuinely changed and the change must be logged like any other edit —
-- otherwise I15 reports an unexplained change and the check would have
-- to be weakened to hide it.
INSERT INTO edit_history (id, user_id, target_type, target_id, action, diff, comment)
SELECT gen_random_uuid(), 'hermes', 'dish', d.id, 'update',
       jsonb_build_object(
         'operation', 'GUS-014 pilot',
         'dimensions', CASE WHEN d.slug = 'shawarma'
           THEN 'dish_relations (ancestor pair with tacos-al-pastor)'
           ELSE 'dish_family, dish_cuisine, dish_course, dish_technique, ingredient_category, dish_tradition, dish_context'
         END
       ),
       'GUS-014 pilot'
FROM dishes d
WHERE d.slug IN ('rendang', 'chicken-tikka-masala', 'tacos-al-pastor', 'shawarma')
  AND NOT EXISTS (
    SELECT 1 FROM edit_history e
    WHERE e.target_type = 'dish' AND e.target_id = d.id AND e.comment = 'GUS-014 pilot'
  );

UPDATE dishes
SET updated_at = now()
WHERE slug IN ('rendang', 'chicken-tikka-masala', 'tacos-al-pastor', 'shawarma');

COMMIT;
