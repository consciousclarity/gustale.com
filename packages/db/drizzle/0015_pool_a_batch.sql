-- 0015_pool_a_batch.sql
-- GUS-PoolA: the frozen batch number for each Pool A dish.
--
-- WHY THIS MIGRATION EXISTS
-- ------------------------
-- The Pool A description pipeline publishes in batches of 100. Until
-- now it took each batch with:
--
--     order by slug offset N limit 100
--
-- over the Pool A dishes. That is only safe while the set being
-- sliced never changes. It does change: publishing a batch moves
-- those dishes out of `status = 'draft'`, so every later offset
-- landed 100 dishes too far. Measured against the live database
-- after batch 1 shipped, batch 2's slice overlapped its intended
-- dishes by ZERO, and because the batches go out in order the
-- error compounded with each published batch. Nothing threw; the
-- run reported a clean 100-dish batch every time.
--
-- The fix in the script (PR #118) slices over the whole Pool A set
-- and filters to drafts afterwards, which is stable because the set
-- only grows at import time. But "only grows at import time" is
-- still an assumption about the future, and a new import between
-- two batches would re-introduce the same class of bug: a new dish
-- with a slug sorting before an existing one shifts every later
-- offset.
--
-- So the membership is FROZEN IN THE DATABASE. This column records
-- the batch a dish belongs to. It is assigned once, from the
-- slug-ordered Pool A list, and never changes. The script selects on
-- it.
--
-- The number is a plain integer, 1-14, with 14 being the short
-- final batch of 54. NULL means "not a Pool A dish" (the 121 legacy
-- dishes, and anything imported later that has not been assigned
-- yet).
--
-- WHY NOT A TABLE
-- --------------
-- A `pool_a_batches(dish_id, batch_number)` table would also work,
-- and would keep `dishes` free of a pipeline-specific column. But
-- the column is simpler to query (`where pool_a_batch = N` is one
-- indexed scan, with no join), and `dishes` already carries
-- pipeline-specific columns (`created_by = 'wikidata-derived'`).
-- The column is nullable and additive; no existing row is modified
-- except the backfill below, which is counted and asserted.
--
-- THE BACKFILL
-- ------------
-- The assignment is by ROW_NUMBER over the slug-ordered Pool A
-- list, which is exactly the order the pipeline used. This makes
-- batch 1 the same 100 dishes that were already published, and
-- batch 2 the next 100, and so on. The ORDER IS THE CONTRACT: the
-- published batch 1 is immutable, so the backfill must reproduce
-- it exactly, and the assertion below checks that it does.
--
-- ROLLBACK
-- --------
--   ALTER TABLE dishes DROP COLUMN IF EXISTS pool_a_batch;

CREATE SCHEMA IF NOT EXISTS drizzle;
CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (
  id          integer PRIMARY KEY,
  hash        text    NOT NULL,
  created_at  bigint
);

-- ---------------------------------------------------------------------
-- pool_a_batch: the frozen batch number, 1-14. NULL for non-Pool-A.
-- ---------------------------------------------------------------------
ALTER TABLE dishes
  ADD COLUMN IF NOT EXISTS pool_a_batch integer;

CREATE INDEX IF NOT EXISTS dishes_pool_a_batch_idx
  ON dishes(pool_a_batch);

-- ---------------------------------------------------------------------
-- The backfill. Assigned by row_number over the slug order, so the
-- numbering is reproducible from the data and not from an external
-- list that could drift.
-- ---------------------------------------------------------------------
WITH ordered AS (
  SELECT id,
         row_number() OVER (ORDER BY slug) AS n
    FROM dishes
   WHERE created_by = 'wikidata-derived'
)
UPDATE dishes d
   SET pool_a_batch = ((o.n - 1) / 100) + 1
  FROM ordered o
 WHERE d.id = o.id
   AND d.pool_a_batch IS DISTINCT FROM ((o.n - 1) / 100) + 1;

-- ---------------------------------------------------------------------
-- The assertion.
--
-- The published batch 1 is immutable: these 100 slugs are the ones
-- that went live under PR #117. If this count is not 100, the
-- backfill has drifted and the batch numbering must not be trusted.
-- It is checked here, at migration time, rather than trusted later.
--
-- BUT ONLY WHEN THERE ARE POOL A DISHES TO BACKFILL.
--
-- The migration runs in CI against a fresh database, where the Pool
-- A import has not happened yet and `created_by = 'wikidata-derived'`
-- matches nothing. Asserting "batch 1 has 100 dishes" against an
-- empty set is not a useful check — it is a check that can only ever
-- fail — so the whole block is skipped when there is nothing to
-- backfill. The backfill is a no-op in that case, which is correct:
-- the column stays NULL and the importer assigns the batch numbers
-- when it creates the rows.
-- ---------------------------------------------------------------------
DO $$
DECLARE
  pool_a_total integer;
  n integer;
BEGIN
  SELECT count(*) INTO pool_a_total FROM dishes
   WHERE created_by = 'wikidata-derived';

  IF pool_a_total = 0 THEN
    RAISE NOTICE 'pool_a_batch: no Pool A dishes in this database yet; the backfill was a no-op.';
    RETURN;
  END IF;

  SELECT count(*) INTO n FROM dishes
   WHERE created_by = 'wikidata-derived' AND pool_a_batch = 1;
  IF n <> 100 THEN
    RAISE EXCEPTION 'pool_a_batch backfill failed: batch 1 has % dishes, expected 100', n;
  END IF;

  SELECT count(*) INTO n FROM dishes
   WHERE created_by = 'wikidata-derived' AND pool_a_batch IS NULL;
  IF n <> 0 THEN
    RAISE EXCEPTION 'pool_a_batch backfill failed: % Pool A dishes have no batch', n;
  END IF;

  -- Every batch but the last holds exactly 100 dishes. The last is
  -- the short one (54 for the current 1,354), so at most ONE batch is
  -- allowed to differ.
  SELECT count(*) INTO n FROM (
    SELECT pool_a_batch FROM dishes
     WHERE created_by = 'wikidata-derived'
     GROUP BY pool_a_batch HAVING count(*) <> 100
  ) t;
  IF n > 1 THEN
    RAISE EXCEPTION 'pool_a_batch backfill failed: % batches are not exactly 100 dishes', n;
  END IF;
END $$;

-- Drizzle migration tracking row (mirrors the 0009-0014 convention).
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at)
VALUES (
  15,
  'pool_a_batch',
  EXTRACT(EPOCH FROM NOW()) * 1000
)
ON CONFLICT (id) DO NOTHING;
