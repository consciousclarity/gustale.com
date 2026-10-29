-- GUS-242 / ADR-003 layer 1 — the vocabulary-label table.
--
-- ADR-003 layer 1: "Translate every controlled-vocabulary label once per
-- locale, not per use. Every vocabulary table gets a sibling
-- *_translations table..."
--
-- decided-by: hermes — ONE table, not eleven siblings.
--
-- Reason: the query is identical for every vocabulary ("give me the
-- label for this value in this locale"), so one shape means one query
-- in the API, the web layer and the SEO code instead of eleven. The
-- four sibling tables the project already has (category_translations,
-- dish_cuisine_translations, ingredient_translations,
-- preparation_method_translations) are all EMPTY, so this is the
-- forward shape rather than a fifth copy of an unused one. And
-- "translate once per locale" becomes one pass over one table.
--
-- The four existing tables are left in place: they are empty, they may
-- be referenced by API code, and removing published schema needs the
-- user's approval.
--
-- The base tables keep their English name. English is NOT duplicated
-- here — vocabulary_labels holds only non-English locales.
--
-- 'language' rather than 'locale': the project's existing translation
-- tables and dish_translations all use 'language', so this matches the
-- established shape. Locale variants are valid BCP-47 ('es-MX',
-- 'zh-Hans').

\set ON_ERROR_STOP on

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =====================================================================
-- The table
-- =====================================================================
CREATE TABLE IF NOT EXISTS vocabulary_labels (
  id          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- which controlled vocabulary this labels:
  --   family | technique | tradition | cuisine | context |
  --   ingredient_category | place | predicate | ingredient |
  --   category | preparation_method
  vocabulary  text NOT NULL,

  -- the row's id in its own table
  value_id    uuid NOT NULL,

  -- BCP-47. 'en' lives in the base table, so this holds the others.
  language    text NOT NULL,

  name        text NOT NULL,

  -- a value can have several labels in one language (an endonym and a
  -- romanization); this marks the one to show.
  is_primary  boolean NOT NULL DEFAULT false,

  -- 'wikidata' | 'project' | 'machine'
  source      text,

  -- the Wikidata QID the label came from, so it can be re-checked
  source_ref  text,

  created_at  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT vocabulary_labels_unique UNIQUE (vocabulary, value_id, language)
);

-- The API reads by (vocabulary, language); the web layer resolves a
-- value's labels by value_id.
CREATE INDEX IF NOT EXISTS vocabulary_labels_vocab_lang_idx
  ON vocabulary_labels (vocabulary, language);
CREATE INDEX IF NOT EXISTS vocabulary_labels_value_idx
  ON vocabulary_labels (value_id);

-- =====================================================================
-- The vocabulary labels need to know their Wikidata QID.
--
-- Only geo_entities had one. The rest of the vocabularies get a
-- wikidata_id column so the label job can look the value up.
-- =====================================================================

ALTER TABLE dish_families          ADD COLUMN IF NOT EXISTS wikidata_id text;
ALTER TABLE dish_techniques        ADD COLUMN IF NOT EXISTS wikidata_id text;
ALTER TABLE dish_traditions        ADD COLUMN IF NOT EXISTS wikidata_id text;
ALTER TABLE dish_cuisines          ADD COLUMN IF NOT EXISTS wikidata_id text;
ALTER TABLE dish_contexts          ADD COLUMN IF NOT EXISTS wikidata_id text;
ALTER TABLE ingredient_categories  ADD COLUMN IF NOT EXISTS wikidata_id text;
ALTER TABLE relation_types         ADD COLUMN IF NOT EXISTS wikidata_id text;

-- One QID per row, where there is one.
CREATE UNIQUE INDEX IF NOT EXISTS dish_families_wikidata_id_key
  ON dish_families (wikidata_id) WHERE wikidata_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS dish_techniques_wikidata_id_key
  ON dish_techniques (wikidata_id) WHERE wikidata_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS dish_traditions_wikidata_id_key
  ON dish_traditions (wikidata_id) WHERE wikidata_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS dish_cuisines_wikidata_id_key
  ON dish_cuisines (wikidata_id) WHERE wikidata_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS dish_contexts_wikidata_id_key
  ON dish_contexts (wikidata_id) WHERE wikidata_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ingredient_categories_wikidata_id_key
  ON ingredient_categories (wikidata_id) WHERE wikidata_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS relation_types_wikidata_id_key
  ON relation_types (wikidata_id) WHERE wikidata_id IS NOT NULL;

-- =====================================================================
-- Post-assertions
-- =====================================================================

DO $$
DECLARE n int;
BEGIN
  -- The table exists with the shape the API and the label job expect.
  SELECT count(*) INTO n FROM information_schema.columns
   WHERE table_name = 'vocabulary_labels'
     AND column_name IN ('vocabulary', 'value_id', 'language', 'name',
                         'is_primary', 'source', 'source_ref');
  IF n <> 7 THEN
    RAISE EXCEPTION 'P1 failed: vocabulary_labels has % of the 7 expected columns', n;
  END IF;

  -- English is never stored here: it stays in the base table.
  SELECT count(*) INTO n FROM vocabulary_labels WHERE language = 'en';
  IF n <> 0 THEN
    RAISE EXCEPTION 'P2 failed: % English labels are in vocabulary_labels; English belongs in the base table', n;
  END IF;

  -- A value may have only ONE primary label per language.
  SELECT count(*) INTO n FROM (
    SELECT vocabulary, value_id, language FROM vocabulary_labels
     WHERE is_primary
     GROUP BY vocabulary, value_id, language HAVING count(*) > 1) z;
  IF n <> 0 THEN
    RAISE EXCEPTION 'P3 failed: % values have more than one primary label in a language', n;
  END IF;

  -- No empty labels.
  SELECT count(*) INTO n FROM vocabulary_labels WHERE btrim(name) = '';
  IF n <> 0 THEN
    RAISE EXCEPTION 'P4 failed: % labels are blank', n;
  END IF;

  -- The language codes must be plausible BCP-47.
  SELECT count(*) INTO n FROM vocabulary_labels
   WHERE language !~ '^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$';
  IF n <> 0 THEN
    RAISE EXCEPTION 'P5 failed: % labels have a malformed language code', n;
  END IF;

  RAISE NOTICE 'vocabulary_labels: % rows, % languages',
    (SELECT count(*) FROM vocabulary_labels),
    (SELECT count(DISTINCT language) FROM vocabulary_labels);
END $$;
