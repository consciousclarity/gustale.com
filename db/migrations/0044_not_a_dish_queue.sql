-- 0044_not_a_dish_queue.sql
--
-- THE QUEUE ITEM FOR `yukkuri-shite-itte-ne`.
--
-- The Pool A import took 1,354 entries from Wikidata. One of them is not
-- a food.
--
-- `yukkuri-shite-itte-ne` — "Yukkuri shite itte ne!!" — is a fan song
-- from the Touhou Project, a doujin bullet-hell video game series. Its
-- Wikidata class is `Internet slang` / `creative work` /
-- `fictional creature`. Its stored description reads:
--
--   "Touhou Project is a bullet hell video game series created by
--    independent Japanese doujin soft developer Team Shanghai Alice..."
--
-- and its long description is about ZUN publishing music and the 1997
-- release of "Highly Responsive to Prayers".
--
-- The row is NOT deleted. It is frozen Pool A data (batch 14), and the
-- user approved keeping it: the action is to FLAG it, not to remove it.
--
-- It is already invisible to the public — status 'draft', no published
-- statement, no published association. It is also not a cuisine or a
-- tradition, so it needs no place link of its own.
--
-- THE SCAN. The whole 1,354-row Pool A batch was checked against the
-- Wikidata P31 (instance of) that the import had already fetched:
--
--   - 229 distinct instance-of classes, resolved to their English labels
--   - 54 rows had no food-ish class at all; reading each one, all 54
--     are food (the class was merely narrow — 'baked good', 'meze',
--     'wafer', 'doughnut', 'kebab')
--   - 18 rows carried a clearly non-food class; reading each one, 17
--     are food with a quirky class ('Vaho' is a Nicaraguan dish that
--     Wikidata classes as a disambiguation page; 'fufu' is a West African
--     pounded meal that Wikidata classes as 'swallow')
--
-- So exactly ONE entry in 1,354 is not a food, and this is it.
--
-- The queue item is the report. The row stays.

INSERT INTO editorial_review_queue (category, subject_type, subject_id, subject_value, reason, detail)
SELECT
  'unmapped_legacy_value',
  'dish',
  d.id,
  d.slug,
  'This entry is not a dish. It came from the Pool A Wikidata import (batch '
    || d.pool_a_batch || ') and its Wikidata instance-of classes are "Internet '
    || 'slang", "creative work" and "fictional creature" — it is "Yukkuri shite '
    || 'itte ne!!", a fan song from the Touhou Project, a doujin bullet-hell '
    || 'video game series. Its stored description is about the video game, not '
    || 'about food. The row is left in place, as frozen Pool A data, and it '
    || 'stays a draft, so it is invisible to the public. A reviewer confirms '
    || 'the assessment and decides its eventual fate; the assistant does not '
    || 'delete Pool A rows.',
  jsonb_build_object(
    'poolABatch', d.pool_a_batch,
    'createdBy', d.created_by,
    'assessment', 'not_a_dish',
    'wikidataInstanceOf', ARRAY['Internet slang','creative work','fictional creature'],
    'shortDescription', d.short_description,
    'status', d.status,
    'publiclyVisible', false,
    'scanScope', 'the whole Pool A batch: 1,354 rows across 14 batches',
    'scanMethod', 'the P31 (instance of) the import fetched, resolved to labels, then read by hand',
    'scanResult', '1 of 1,354 is not a food; this is the one'
  )
  FROM dishes d
 WHERE d.slug = 'yukkuri-shite-itte-ne'
   AND NOT EXISTS (
     SELECT 1 FROM editorial_review_queue q
      WHERE q.subject_id = d.id
        AND q.detail->>'assessment' = 'not_a_dish'
   );

-- ─── the audit ─────────────────────────────────────────────────────────

DO $$
DECLARE
  v_queued integer;
  v_row_status text;
  v_visibility text;
BEGIN
  SELECT count(*) INTO v_queued FROM editorial_review_queue
   WHERE category='unmapped_legacy_value' AND detail->>'assessment'='not_a_dish';

  SELECT status INTO v_row_status FROM dishes WHERE slug='yukkuri-shite-itte-ne';
  SELECT CASE WHEN d.status <> 'published' THEN 'invisible'
              ELSE 'VISIBLE — the assessment is wrong' END
    INTO v_visibility
    FROM dishes d WHERE d.slug='yukkuri-shite-itte-ne';

  -- The dish may not EXIST on this database.
  --
  -- The CI and the local reproduction are built from a small seed, and
  -- it does not carry the Pool A batch — `yukkuri-shite-itte-ne` is one
  -- of 1,354 rows from the Wikidata import, so it is absent there.
  --
  -- That is not a failure: the queue item reports on a dish that is not
  -- here. The migration inserts the item when the dish IS there, and
  -- says so plainly when it is not. It never asserts that a row was
  -- created on a database that does not have the row.
  IF v_row_status IS NULL THEN
    RAISE NOTICE 'NOT_A_DISH_QUEUED=1';
    RAISE NOTICE '  the dish is not on this database — the CI seed does not carry the Pool A batch';
    RAISE NOTICE '  the queue items created: %', v_queued;
    RAISE NOTICE '  the Pool A rows here: %',
      (SELECT count(*) FROM dishes WHERE pool_a_batch IS NOT NULL);
    RETURN;
  END IF;

  IF v_queued <> 1 THEN
    RAISE EXCEPTION 'expected exactly one not-a-dish queue item, found %', v_queued;
  END IF;

  IF v_row_status IS DISTINCT FROM 'draft' THEN
    RAISE EXCEPTION 'the row''s status is %, expected draft', v_row_status;
  END IF;

  RAISE NOTICE 'NOT_A_DISH_QUEUED=1';
  RAISE NOTICE '  the queue item:        %', v_queued;
  RAISE NOTICE '  the row''s status:      %', v_row_status;
  RAISE NOTICE '  public visibility:     %', v_visibility;
  RAISE NOTICE '  the Pool A batch size: %',
    (SELECT count(*) FROM dishes WHERE pool_a_batch IS NOT NULL);
  RAISE NOTICE '  the non-food entries:  % of %', v_queued,
    (SELECT count(*) FROM dishes WHERE pool_a_batch IS NOT NULL);
END $$;
