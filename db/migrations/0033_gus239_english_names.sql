-- GUS-239, part 2 — the English name moves into `dish_names`.
--
-- THE BUG THIS FIXES
--
-- The read-path migration removed the fallback to
-- `dish_translations.name`. The assumption behind that was that
-- `dish_names` already carried the English name, because
-- `availableNameLanguages` was derived from it.
--
-- It does not. ADR-003 layer 2's `dish_names` was seeded from
-- Wikidata, and Wikidata's English label is not what the catalogue
-- uses as the dish's English name — the catalogue's own
-- `dishes.canonical_name` is. So on live, at the moment of the
-- migration:
--
--     the published dishes: 121
--     with NO row in `dish_names` for language 'en': 121
--
-- ALL of them. Every one of the 121 dish pages would have lost its
-- English name, and the API would have fallen back to
-- `canonical_name` — which is the same string, so the page still
-- rendered — but `availableLanguages` would no longer list 'en', and
-- the name the API reports would no longer come from the table that
-- is supposed to be the name source.
--
-- It was caught by the CI test `availableLanguages lists en`, and it
-- was caught AFTER the migration had already been applied to live.
-- The migration was reverted by fixing this, not by rolling back:
-- the archive is correct, and the missing thing was the English
-- name.
--
-- THE FIX
--
-- Each published dish gets an English name in `dish_names`, taken
-- from its own `canonical_name`, as the primary name for 'en'. The
-- canonical name IS the catalogue's English name — it is what the
-- page shows, what the slug is derived from, and what the legacy
-- table held.
--
-- The `kind` is 'endonym' for a name that is the dish's own name in
-- English, and 'exonym' is deliberately NOT used: an exonym is a
-- name a language gives to something from elsewhere, and this is
-- the dish's name in the language the catalogue is written in.
--
-- The `source` is 'canonical_name' — not 'wikidata' — because it did
-- not come from Wikidata. That distinction matters: `dish_names`
-- rows sourced from Wikidata and rows sourced from the catalogue's
-- own canonical name are different kinds of evidence, and the
-- source_ref is NULL for these because there is no QID behind them.
--
-- The same rows are added for the Pool A dishes, so that every dish
-- in the catalogue has an English name in the table that is now the
-- name source.

BEGIN;

-- The English name for every dish that lacks one.
--
-- The WHERE clause is the whole point: it must not overwrite an
-- existing name, and it must not add a second primary.
INSERT INTO dish_names
  (id, dish_id, language, script, name, kind, is_primary, source,
   source_ref, created_at)
SELECT
  gen_random_uuid(),
  d.id,
  'en',
  'Latn',
  d.canonical_name,
  'endonym',
  true,
  'canonical_name',
  NULL,
  now()
  FROM dishes d
 WHERE d.canonical_name IS NOT NULL
   AND d.canonical_name <> ''
   AND NOT EXISTS (
     SELECT 1 FROM dish_names n
      WHERE n.dish_id = d.id
        AND n.language = 'en'
   )
   AND NOT EXISTS (
     -- A dish that already has a PRIMARY name in another language
     -- still needs its English name; this clause only guards
     -- against adding a duplicate primary for 'en', which the
     -- NOT EXISTS above already does.
     SELECT 1 FROM dish_names n
      WHERE n.dish_id = d.id
        AND n.is_primary
        AND n.language = 'en'
   );

-- The assertion: every published dish must now have an English name
-- in dish_names, and it must be the canonical name.
DO $$
DECLARE
  v_missing integer;
  v_wrong integer;
  v_added integer;
BEGIN
  SELECT count(*) INTO v_missing
    FROM dishes d
   WHERE d.status = 'published'
     AND NOT EXISTS (
       SELECT 1 FROM dish_names n
        WHERE n.dish_id = d.id
          AND n.language = 'en'
     );
  IF v_missing <> 0 THEN
    RAISE EXCEPTION
      '% published dishes still have no English name in dish_names', v_missing;
  END IF;

  -- The English name must BE the canonical name. If Wikidata supplied
  -- an English name that differs from the catalogue's, the catalogue
  -- wins — it is what the page shows and what the slug is built
  -- from — and this assertion says so.
  SELECT count(*) INTO v_wrong
    FROM dishes d
    JOIN dish_names n ON n.dish_id = d.id AND n.language = 'en'
   WHERE d.status = 'published'
     AND n.is_primary
     AND n.name IS DISTINCT FROM d.canonical_name;
  IF v_wrong <> 0 THEN
    RAISE EXCEPTION
      '% published dishes have an English name that is not the canonical name',
      v_wrong;
  END IF;

  SELECT count(*) INTO v_added
    FROM dish_names n
   WHERE n.language = 'en'
     AND n.source = 'canonical_name';
  RAISE NOTICE
    'the English names are in place: % rows carry source=canonical_name', v_added;
END
$$;

COMMIT;
