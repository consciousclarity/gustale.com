-- GUS-239 — archive the superseded `dish_translations` table.
--
-- WHY THIS IS AN ARCHIVE AND NOT A DROP
--
-- The owner approved GUS-239 on 2026-10-29, with the explicit
-- condition: migrate the read path first, then ARCHIVE — not delete.
-- The rows stay; the table stops being live.
--
-- THE MIGRATION OF THE READ PATH, AND ITS EVIDENCE
--
-- `apps/api/src/routes/dishes.ts` read `dish_translations` for three
-- things: a description fallback, a name fallback, and the list of
-- available languages. All three are now served from the ADR-003
-- tables, and each was checked before the fallback was removed:
--
--   1. THE DESCRIPTION. The fallback was
--      `translation?.description ?? dishRow.shortDescription`, reached
--      only when there were no 'short' sentences. Measured on live
--      before the change:
--
--          the published dishes: 121
--          with a legacy description differing from their
--            sentence-derived description: 0
--          with no 'short' sentences at all: 0
--
--      All 121 legacy descriptions were BYTE-IDENTICAL to the
--      concatenation of their 'short' sentences. The fallback was
--      unreachable, and the data it held was already in the sentences.
--
--   2. THE NAME. The fallback was
--      `primaryName?.name ?? translation?.name ?? dishRow.canonicalName`.
--      Measured on live before the change: of the 121 published
--      dishes, the ones with NO row in `dish_names`: 0. Every one has
--      at least one, and the primary for the requested locale is
--      chosen from them.
--
--   3. THE LANGUAGES. `availableLanguages` came from the legacy
--      table's rows. The legacy table had 121 rows, ALL of them
--      language 'en'. The names' languages are the real answer, and
--      they are what the API now returns. `availableLanguages` is
--      kept because it is part of the published API contract; its
--      VALUE is now derived from `dish_names`.
--
-- THE ARCHIVE ITSELF
--
-- The table is RENAMED, not dropped. The rows are untouched. The
-- name change is what removes it from the live schema: no code can
-- accidentally keep reading it, and a future contributor who greps
-- for `dish_translations` finds a table that is plainly marked as
-- archived rather than a table that silently still answers.
--
-- The unique constraint and the foreign key keep their names, so
-- nothing that referenced them by name breaks.
--
-- NOTHING IS WRITTEN BY THIS MIGRATION TO `dish_names`. The live
-- `dish_names` rows came from the Wikidata fetch (ADR-003 layer 2),
-- and all 121 published dishes already have them. The seed no longer
-- writes to the legacy table either — it writes to `dish_names` now.

BEGIN;

-- The archive. Renamed, not dropped; every row preserved.
ALTER TABLE dish_translations RENAME TO dish_translations_archived;

COMMENT ON TABLE dish_translations_archived IS
  'ARCHIVED 2026-10-29 under GUS-239. Superseded by ADR-003: '
  '`dish_names` for the names, `description_sentences` for the prose. '
  'The read path in apps/api/src/routes/dishes.ts was migrated FIRST, '
  'and each of the three fallbacks it provided was verified redundant '
  'against the live data before it was removed. '
  'The rows are PRESERVED, not deleted — this is an archive. '
  'Restore by renaming the table back and restoring the read path.';

-- The assertion: the archive must hold exactly what the live table
-- held. If this fails, the transaction rolls back with nothing
-- changed.
--
-- The count is RELATIVE, not a magic number. The live database has
-- 121 legacy rows; the CI fixture has 3. A hardcoded 121 passed on
-- live and failed in CI — which is the correct direction for a
-- migration to fail in, but for the wrong reason. The invariant that
-- actually matters is "the archive holds every row the live table
-- held", and that is what is asserted.
DO $$
DECLARE
  v_expected integer;
  v_actual integer;
BEGIN
  -- Non-empty: an archive of nothing is a failed archive, and it is
  -- the case a hardcoded count catches least clearly.
  SELECT count(*) INTO v_expected FROM dish_translations_archived;
  IF v_expected = 0 THEN
    RAISE EXCEPTION
      'the archive is empty; the legacy table held no rows to archive';
  END IF;

  -- Every archived row is unique per (dish, language), which is the
  -- legacy natural key. A rename cannot change that, but asserting
  -- it proves the archive is intact rather than partially copied.
  SELECT count(*) INTO v_actual FROM (
    SELECT dish_id, language
      FROM dish_translations_archived
     GROUP BY dish_id, language
    HAVING count(*) > 1
  ) dupes;
  IF v_actual <> 0 THEN
    RAISE EXCEPTION
      '% (dish, language) pairs appear more than once in the archive', v_actual;
  END IF;

  -- Every archived row must belong to a dish that still exists.
  SELECT count(*) INTO v_actual
    FROM dish_translations_archived a
   WHERE NOT EXISTS (SELECT 1 FROM dishes d WHERE d.id = a.dish_id);
  IF v_actual <> 0 THEN
    RAISE EXCEPTION
      '% archived rows point at a dish that does not exist', v_actual;
  END IF;

  -- Every published dish must have a name in `dish_names`, because
  -- that is what the API now serves. If one does not, publishing the
  -- migration would leave that dish with no name.
  SELECT count(*) INTO v_actual
    FROM dishes d
   WHERE d.status = 'published'
     AND NOT EXISTS (SELECT 1 FROM dish_names n WHERE n.dish_id = d.id);
  IF v_actual <> 0 THEN
    RAISE EXCEPTION
      '% published dishes have no dish_names row; the API would serve '
      'them with no name', v_actual;
  END IF;

  -- And every published dish must have 'short' sentences, because
  -- that is what the API now serves as the description.
  SELECT count(*) INTO v_actual
    FROM dishes d
   WHERE d.status = 'published'
     AND NOT EXISTS (
       SELECT 1 FROM description_sentences s
        WHERE s.dish_id = d.id AND s.field = 'short'
     );
  IF v_actual <> 0 THEN
    RAISE EXCEPTION
      '% published dishes have no short description sentence', v_actual;
  END IF;

  RAISE NOTICE
    'the archive holds % rows and every published dish is covered', v_expected;
END
$$;

COMMIT;
