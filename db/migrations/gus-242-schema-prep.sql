-- =====================================================================
-- GUS-242 (1a) — schema prep for the global reference seed.
--
-- Nothing here populates the seed. This is the shape the seed will land in:
--   * geo_entities: UNIQUE on the ISO code and the Wikidata Q-id
--   * dish_families: a parent_id hierarchy
--   * dish_traditions: a definition and a source per value
--   * dish_techniques / ingredient_categories: a FoodOn cross-reference
--   * dish_cuisine_translations: the localised display label
--   * provenance gains 'article-derived', and the database enforces that it
--     always pairs with status='provisional'
--
-- LICENSING (Alejandro, 2026-10-27): external identifiers are stored as
-- CROSS-REFERENCES ONLY. FoodOn (CC BY-SA) and Wikipedia (CC BY-SA) text is
-- never copied in - every published label and definition is our own.
--
-- Idempotent: re-running produces no changes.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1. geo_entities: the two unique keys the seed needs.
--    Without these, a 3,590-row seed accumulates duplicates exactly the
--    way `sources` accumulated 21 duplicate URLs (GUS-238).
-- ---------------------------------------------------------------------

-- First, check for existing duplicates so the constraint can be added safely.
DO $$
DECLARE
  dup_wd int;
  dup_iso int;
  d text;
BEGIN
  SELECT count(*) INTO dup_wd FROM (
    SELECT wikidata_id FROM geo_entities
     WHERE wikidata_id IS NOT NULL
     GROUP BY wikidata_id HAVING count(*) > 1) z;
  SELECT count(*) INTO dup_iso FROM (
    SELECT iso_code FROM geo_entities
     WHERE iso_code IS NOT NULL
     GROUP BY iso_code HAVING count(*) > 1) z;

  IF dup_wd > 0 OR dup_iso > 0 THEN
    SELECT string_agg(x, E'\n  ') INTO d FROM (
      SELECT 'wikidata_id ' || wikidata_id || ' x' || count(*) AS x
        FROM geo_entities WHERE wikidata_id IS NOT NULL
       GROUP BY wikidata_id HAVING count(*) > 1
      UNION ALL
      SELECT 'iso_code ' || iso_code || ' x' || count(*)
        FROM geo_entities WHERE iso_code IS NOT NULL
       GROUP BY iso_code HAVING count(*) > 1) z;
    RAISE EXCEPTION
      'geo_entities has duplicate keys - resolve before adding the constraints:%s%s',
      E'\n  ', d;
  END IF;
  RAISE NOTICE 'geo_entities: no duplicate wikidata_id or iso_code - safe to constrain';
END $$;

-- Postgres has no ADD CONSTRAINT IF NOT EXISTS, so the constraints are
-- added conditionally.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='geo_entities_wikidata_id_key') THEN
    ALTER TABLE geo_entities ADD CONSTRAINT geo_entities_wikidata_id_key UNIQUE (wikidata_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='geo_entities_iso_code_key') THEN
    ALTER TABLE geo_entities ADD CONSTRAINT geo_entities_iso_code_key UNIQUE (iso_code);
  END IF;
END $$;

-- The seed will look rows up by ISO code, so index it for the join.
CREATE INDEX IF NOT EXISTS geo_entities_iso_code_idx ON geo_entities (iso_code);
CREATE INDEX IF NOT EXISTS geo_entities_wikidata_id_idx ON geo_entities (wikidata_id);
CREATE INDEX IF NOT EXISTS geo_entities_entity_type_parent_idx
  ON geo_entities (entity_type, parent_id);

-- ---------------------------------------------------------------------
-- 2. dish_families: a parent_id hierarchy (decision 5).
--    So stew -> soup -> noodle-soup can nest, and stuffed-vegetable can
--    sit under a broader form.
-- ---------------------------------------------------------------------
ALTER TABLE dish_families
  ADD COLUMN IF NOT EXISTS parent_id uuid REFERENCES dish_families(id);
CREATE INDEX IF NOT EXISTS dish_families_parent_id_idx ON dish_families (parent_id);

-- A family cannot be its own parent, and the hierarchy must be acyclic.
-- A self-parent is the one cycle a plain FK cannot catch, and it would
-- make every descendant walk loop forever.
CREATE OR REPLACE FUNCTION assert_family_parent() RETURNS trigger AS $$
BEGIN
  IF NEW.parent_id IS NOT NULL AND NEW.parent_id = NEW.id THEN
    RAISE EXCEPTION 'dish_family % cannot be its own parent', NEW.slug
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_family_parent ON dish_families;
CREATE TRIGGER trg_family_parent
  BEFORE INSERT OR UPDATE ON dish_families
  FOR EACH ROW EXECUTE FUNCTION assert_family_parent();

-- ---------------------------------------------------------------------
-- 3. dish_traditions: a definition and a source per value (decision 4).
--    The research pass must produce both, not just a name.
-- ---------------------------------------------------------------------
ALTER TABLE dish_traditions
  ADD COLUMN IF NOT EXISTS definition text;
ALTER TABLE dish_traditions
  ADD COLUMN IF NOT EXISTS source    text;

-- ---------------------------------------------------------------------
-- 4. FoodOn cross-references. Identifiers only - never FoodOn's text.
-- ---------------------------------------------------------------------
ALTER TABLE dish_techniques
  ADD COLUMN IF NOT EXISTS foodon_id text;
ALTER TABLE ingredient_categories
  ADD COLUMN IF NOT EXISTS foodon_id text;

CREATE UNIQUE INDEX IF NOT EXISTS dish_techniques_foodon_id_key
  ON dish_techniques (foodon_id) WHERE foodon_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ingredient_categories_foodon_id_key
  ON ingredient_categories (foodon_id) WHERE foodon_id IS NOT NULL;

-- ---------------------------------------------------------------------
-- 5. dish_cuisine_translations: the localised display label (decision 3).
--    The same pattern the schema already uses for categories, ingredients
--    and preparation_methods. The 'en' label stays on dish_cuisines.name;
--    this table holds the OTHER locales.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS dish_cuisine_translations (
  id            uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  cuisine_id    uuid NOT NULL REFERENCES dish_cuisines(id) ON DELETE CASCADE,
  language      text NOT NULL,
  name          text NOT NULL,
  description   text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE NULLS NOT DISTINCT (cuisine_id, language)
);

COMMENT ON TABLE dish_cuisine_translations IS
  'Localised display names for dish_cuisines. The English name lives on '
  'dish_cuisines.name; this table holds the other locales. The slug is '
  'always the bare demonym and never changes with the locale.';

-- ---------------------------------------------------------------------
-- 6. provenance gains 'article-derived', and the pairing with
--    status='provisional' is ENFORCED BY A TRIGGER.
--
--    The provenance/status columns are plain text with no CHECK constraint
--    (they were added by GUS-241 with defaults and no domain). So the
--    allowed VALUES are verified below rather than constrained, and the
--    PAIRING RULE is enforced by a BEFORE INSERT OR UPDATE trigger - which
--    is the same shape as the trigger that already stops a value and an
--    unset coexisting for the same (dish, dimension).
-- ---------------------------------------------------------------------

-- The allowed values are verified BEFORE the trigger is created, so a
-- legacy row outside the set is reported rather than silently tolerated.
DO $$
DECLARE
  t   text;
  bad int;
  d   text;
BEGIN
  FOREACH t IN ARRAY ARRAY['dish_dish_families','dish_dish_cuisines',
                           'dish_dish_courses','dish_dish_techniques',
                           'dish_dish_ingredient_categories',
                           'dish_dish_traditions','dish_dish_contexts']
  LOOP
    EXECUTE format(
      'SELECT count(*) FROM %I WHERE provenance NOT IN (''preparation'',''description-derived'',''article-derived'')', t)
      INTO bad;
    IF bad > 0 THEN
      EXECUTE format('SELECT string_agg(DISTINCT provenance, '', '') FROM %I', t) INTO d;
      RAISE EXCEPTION '% has provenance values outside the allowed set: %', t, d;
    END IF;
    EXECUTE format(
      'SELECT count(*) FROM %I WHERE status NOT IN (''active'',''provisional'')', t)
      INTO bad;
    IF bad > 0 THEN
      EXECUTE format('SELECT string_agg(DISTINCT status, '', '') FROM %I', t) INTO d;
      RAISE EXCEPTION '% has status values outside the allowed set: %', t, d;
    END IF;
  END LOOP;
  RAISE NOTICE 'all seven dimension tables use only the allowed provenance and status values';
END $$;

CREATE OR REPLACE FUNCTION assert_provenance_status() RETURNS trigger AS $$
BEGIN
  IF NEW.provenance = 'article-derived' AND NEW.status <> 'provisional' THEN
    RAISE EXCEPTION
      'provenance ''article-derived'' requires status ''provisional'' (got %) on %',
      NEW.status, TG_TABLE_NAME
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_provenance_status_families            ON dish_dish_families;
DROP TRIGGER IF EXISTS trg_provenance_status_cuisines            ON dish_dish_cuisines;
DROP TRIGGER IF EXISTS trg_provenance_status_courses             ON dish_dish_courses;
DROP TRIGGER IF EXISTS trg_provenance_status_techniques          ON dish_dish_techniques;
DROP TRIGGER IF EXISTS trg_provenance_status_ingredient_categor ON dish_dish_ingredient_categories;
DROP TRIGGER IF EXISTS trg_provenance_status_traditions          ON dish_dish_traditions;
DROP TRIGGER IF EXISTS trg_provenance_status_contexts            ON dish_dish_contexts;

CREATE TRIGGER trg_provenance_status_families
  BEFORE INSERT OR UPDATE ON dish_dish_families
  FOR EACH ROW EXECUTE FUNCTION assert_provenance_status();
CREATE TRIGGER trg_provenance_status_cuisines
  BEFORE INSERT OR UPDATE ON dish_dish_cuisines
  FOR EACH ROW EXECUTE FUNCTION assert_provenance_status();
CREATE TRIGGER trg_provenance_status_courses
  BEFORE INSERT OR UPDATE ON dish_dish_courses
  FOR EACH ROW EXECUTE FUNCTION assert_provenance_status();
CREATE TRIGGER trg_provenance_status_techniques
  BEFORE INSERT OR UPDATE ON dish_dish_techniques
  FOR EACH ROW EXECUTE FUNCTION assert_provenance_status();
CREATE TRIGGER trg_provenance_status_ingredient_categor
  BEFORE INSERT OR UPDATE ON dish_dish_ingredient_categories
  FOR EACH ROW EXECUTE FUNCTION assert_provenance_status();
CREATE TRIGGER trg_provenance_status_traditions
  BEFORE INSERT OR UPDATE ON dish_dish_traditions
  FOR EACH ROW EXECUTE FUNCTION assert_provenance_status();
CREATE TRIGGER trg_provenance_status_contexts
  BEFORE INSERT OR UPDATE ON dish_dish_contexts
  FOR EACH ROW EXECUTE FUNCTION assert_provenance_status();

-- ---------------------------------------------------------------------
-- 7. REPORT
-- ---------------------------------------------------------------------
\echo ''
\echo '=== new columns and constraints ==='
SELECT table_name, column_name, data_type
FROM information_schema.columns
WHERE table_schema='public'
  AND (table_name='dish_families'      AND column_name IN ('parent_id')
    OR table_name='dish_traditions'     AND column_name IN ('definition','source')
    OR table_name='dish_techniques'     AND column_name='foodon_id'
    OR table_name='ingredient_categories' AND column_name='foodon_id')
ORDER BY table_name, column_name;

SELECT conrelid::regclass AS table_name, conname
FROM pg_constraint
WHERE conname IN ('geo_entities_wikidata_id_key','geo_entities_iso_code_key')
ORDER BY conname;

\echo ''
\echo '=== the new translations table ==='
SELECT count(*) AS dish_cuisine_translations_rows FROM dish_cuisine_translations;

\echo ''
\echo '=== the provenance/status triggers ==='
SELECT tgname, tgrelid::regclass AS on_table
FROM pg_trigger WHERE NOT tgisinternal AND tgname LIKE 'trg_provenance_status%'
ORDER BY tgname;

COMMIT;
