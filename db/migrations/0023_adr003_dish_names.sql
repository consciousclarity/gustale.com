-- GUS-242 / ADR-003 layer 2 — the dish_names table.
--
-- ADR-003 layer 2: "A dish can have several names in one language
-- (endonym, exonym, romanization) and one canonical name per language.
-- The existing dishes.name cannot express that."
--
-- decided-by: hermes — the shape is the ADR's, with two additions the
-- implementation showed were needed:
--
--   - `script` is NOT NULL-able in practice but is allowed to be NULL,
--     because a name may have no known script (a Latin-script exonym
--     is 'Latn', but a name whose script is genuinely unknown should
--     say so rather than guess). The font selection and the
--     romanization detection read it.
--
--   - `kind` is a CHECK constraint rather than a free text column, so
--     a bad kind cannot be written.
--
-- SCRIPT: the ISO 15924 code, e.g. 'Latn', 'Cyrl', 'Arab', 'Hans',
-- 'Hant', 'Jpan', 'Deva'. Not a BCP-47 subtag: 'zh-Hans' is a
-- language with a script, but the SCRIPT here is the script alone.
--
-- KIND:
--   'endonym'       - the name in the language it belongs to
--   'exonym'       - the name in another language
--   'romanization' - a transliteration of the endonym
--
-- is_primary picks ONE name per (dish, language): the endonym when
-- there is one, else the exonym.

\set ON_ERROR_STOP on

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS dish_names (
  id          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),

  dish_id     uuid NOT NULL REFERENCES dishes(id) ON DELETE CASCADE,

  -- BCP-47. 'en' is the dish's canonical_name, which stays in the
  -- dishes table; this table holds the other languages.
  language    text NOT NULL,

  -- ISO 15924 script code: Latn, Cyrl, Arab, Hans, Hant, Jpan, Deva.
  -- Nullable because a name's script may genuinely be unknown.
  script      text,

  name        text NOT NULL,

  kind        text NOT NULL DEFAULT 'endonym'
                CHECK (kind IN ('endonym', 'exonym', 'romanization')),

  -- the canonical name for this (dish, language)
  is_primary  boolean NOT NULL DEFAULT false,

  -- 'wikidata' | 'project'
  source      text,

  -- the Wikidata QID the name came from
  source_ref  text,

  created_at  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT dish_names_unique UNIQUE (dish_id, language, script, name)
);

-- The API reads a dish's names for one language; the site resolves a
-- name's language across dishes.
CREATE INDEX IF NOT EXISTS dish_names_dish_lang_idx
  ON dish_names (dish_id, language);
CREATE INDEX IF NOT EXISTS dish_names_lang_idx
  ON dish_names (language);

-- =====================================================================
-- Post-assertions
-- =====================================================================

DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM information_schema.columns
   WHERE table_name = 'dish_names'
     AND column_name IN ('dish_id', 'language', 'script', 'name',
                         'kind', 'is_primary', 'source', 'source_ref');
  IF n <> 8 THEN
    RAISE EXCEPTION 'P1 failed: dish_names has % of the 8 expected columns', n;
  END IF;

  -- A dish may have only ONE primary name per language.
  SELECT count(*) INTO n FROM (
    SELECT dish_id, language FROM dish_names
     WHERE is_primary
     GROUP BY dish_id, language HAVING count(*) > 1) z;
  IF n <> 0 THEN
    RAISE EXCEPTION 'P2 failed: % dishes have more than one primary name in a language', n;
  END IF;

  -- No empty names.
  SELECT count(*) INTO n FROM dish_names WHERE btrim(name) = '';
  IF n <> 0 THEN
    RAISE EXCEPTION 'P3 failed: % names are blank', n;
  END IF;

  -- The language codes must be plausible BCP-47.
  SELECT count(*) INTO n FROM dish_names
   WHERE language !~ '^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$';
  IF n <> 0 THEN
    RAISE EXCEPTION 'P4 failed: % names have a malformed language code', n;
  END IF;

  -- The script codes must be plausible ISO 15924: a letter or two,
  -- then three or four letters.
  SELECT count(*) INTO n FROM dish_names
   WHERE script IS NOT NULL AND script !~ '^[A-Z][a-z]{3}$';
  IF n <> 0 THEN
    RAISE EXCEPTION 'P5 failed: % names have a malformed script code', n;
  END IF;

  -- Every name must point at a real dish.
  SELECT count(*) INTO n FROM dish_names d
   WHERE NOT EXISTS (SELECT 1 FROM dishes t WHERE t.id = d.dish_id);
  IF n <> 0 THEN
    RAISE EXCEPTION 'P6 failed: % names point at a missing dish', n;
  END IF;

  RAISE NOTICE 'dish_names: % rows across % dishes and % languages',
    (SELECT count(*) FROM dish_names),
    (SELECT count(DISTINCT dish_id) FROM dish_names),
    (SELECT count(DISTINCT language) FROM dish_names);
END $$;
