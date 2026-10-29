-- The translation-data cleanup.
--
-- Two defects, both found by measuring the live data rather than by
-- guessing:
--
-- 1. A RUNAWAY GENERATION. One Indonesian translation is 16,022
--    characters for a 194-character source — a ratio of 82. The model
--    looped and the output passed every check, because the old length
--    rule had a FLOOR but no CEILING. That sentence is deleted and
--    re-translated; the corrected rule catches a ratio above 3.0.
--
-- 2. THE CITATION LINES. Four Spanish translations exist for the
--    "[Source: Wikipedia — ...]" metadata sentences. They were
--    written before the skip rule was added. They are metadata, not
--    prose, and they are removed.
--
-- The DELETE is idempotent: running it twice deletes nothing the
-- second time.

BEGIN;

DELETE FROM description_sentence_translations t
  USING description_sentences s
 WHERE t.source_sentence_id = s.id
   AND length(t.text) > 3 * length(s.text);

DELETE FROM description_sentence_translations t
  USING description_sentences s
 WHERE t.source_sentence_id = s.id
   AND s.text LIKE '[Source:%';

COMMIT;
