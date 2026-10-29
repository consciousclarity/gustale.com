-- The Pool A review sample.
--
-- THE RULE
--
-- ADR-002's decision log and the global reference plan both say the
-- review queue is 10% of each batch and NON-BLOCKING: the sampled ten
-- go to review, the other ninety proceed, and the review does not
-- gate the batch.
--
-- THE TENSION, AND HOW IT IS RESOLVED
--
-- "The other 90% proceeds to published" and "the dishes enter
-- classified-but-unevidenced, with the origin statement at
-- research_pending" cannot both be literally true of the STATEMENT.
--
-- They are both true of different things:
--
--   - The DISH proceeds. It lands in the catalogue, with its place,
--     its description, its classification and its provenance.
--   - The STATEMENT does not proceed to published. It is at
--     research_pending, because it has no evidence, and the ADR-002
--     gate refuses to publish an unevidenced origin claim — for the
--     agent AND for a human, with no way round it.
--
-- "Proceeds" therefore means the dish is admitted and its origin
-- statement is queued for research, not that the statement is
-- published. A statement that has not been researched cannot be
-- published; publishing it would make the gate meaningless.
--
-- WHAT THIS TABLE DOES
--
-- It records WHICH 10% of each batch goes to hand review. Without it,
-- every research_pending statement would sit in the review queue,
-- which is a work queue, not a sample — and a queue of 1,381 items
-- is not reviewable.
--
-- The sample is DETERMINISTIC: the same dishes are sampled on every
-- re-run of the import, so a batch can be re-imported without
-- reshuffling which ten need review. The batch number and the
-- position within the batch are the key.
--
-- The 90% that is not sampled is NOT in this table, and so does not
-- appear in the review queue view. It is still research_pending, and
-- it still needs research — it is simply not part of this sampling
-- round.

BEGIN;

CREATE TABLE IF NOT EXISTS pool_a_review_samples (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_number integer NOT NULL,
  position_in_batch integer NOT NULL,
  statement_id uuid NOT NULL REFERENCES statements(id) ON DELETE CASCADE,
  dish_id uuid NOT NULL REFERENCES dishes(id) ON DELETE CASCADE,
  locale text NOT NULL DEFAULT 'en',
  sampled_at timestamptz NOT NULL DEFAULT now(),
  -- The sample is a sample: it is either pending, looked at, or
  -- dismissed. It never blocks the dish.
  review_status text NOT NULL DEFAULT 'pending'
    CHECK (review_status IN ('pending', 'reviewed', 'dismissed')),
  UNIQUE (batch_number, position_in_batch)
);

COMMENT ON TABLE pool_a_review_samples IS
  'The 10% of each Pool A batch that goes to hand review. '
  'NON-BLOCKING: the review gates those statements, not the dishes. '
  'The other 90% are not sampled and do not appear in the review '
  'queue, but they remain research_pending and still need research.';

COMMENT ON COLUMN pool_a_review_samples.review_status IS
  'pending = not yet looked at. reviewed = a human looked at it. '
  'dismissed = a human decided it needs no review. None of these '
  'affects the dish''s status.';

CREATE INDEX IF NOT EXISTS pool_a_review_samples_statement_idx
  ON pool_a_review_samples (statement_id);

CREATE INDEX IF NOT EXISTS pool_a_review_samples_pending_idx
  ON pool_a_review_samples (review_status)
  WHERE review_status = 'pending';

-- The review queue view now EXCLUDES the unsampled statements: they
-- are not part of this sampling round. The pilot's own claims are
-- unaffected — they are not Pool A statements.
--
-- The view is DROPPED and recreated, not replaced: the new columns
-- are inserted in the middle, and CREATE OR REPLACE VIEW cannot
-- change a column's name or move it.
DROP VIEW IF EXISTS statement_review_queue;

CREATE VIEW statement_review_queue AS
SELECT
  s.id,
  s.subject_type,
  s.subject_id,
  s.predicate_id,
  p.slug AS predicate_slug,
  p.name AS predicate_name,
  s.value_type,
  s.value_ref,
  s.value_literal,
  s.claim_class,
  s.status,
  s.independence,
  s.created_at,
  s.updated_at,
  -- Whether this statement is one of the sampled Pool A reviews.
  (r.statement_id IS NOT NULL) AS is_sampled_review,
  -- Which batch and which position within it.
  r.batch_number,
  r.position_in_batch,
  -- How many sources, and how many INDEPENDENT class-sufficient ones.
  (SELECT count(*) FROM claim_citations c WHERE c.statement_id = s.id) AS citation_count,
  (SELECT count(*)
     FROM claim_citations c
     JOIN sources src ON src.id = c.source_id
    WHERE c.statement_id = s.id
      AND c.stance = 'supports'
      AND src.source_class IN ('S1','S2','S3','S4','S5')) AS supporting_class_sufficient_count,
  -- The GUS-026 §3.1 rule: an origin claim needs a non-S6 source.
  CASE WHEN p.slug IN ('originated_in','originated_at','created_by','named_after')
    THEN EXISTS (
      SELECT 1 FROM claim_citations c
        JOIN sources src ON src.id = c.source_id
       WHERE c.statement_id = s.id
         AND c.stance = 'supports'
         AND src.source_class IN ('S1','S2','S3','S5')
    )
    ELSE true
  END AS origin_evidence_ok
FROM statements s
JOIN predicates p ON p.id = s.predicate_id
LEFT JOIN pool_a_review_samples r
  ON r.statement_id = s.id
 AND r.review_status = 'pending'
WHERE s.status IN ('draft','research_pending','under_review')
  -- A statement is in the queue if it was SAMPLED for review, or if
  -- it is not a Pool A statement at all.
  --
  -- The unsampled Pool A statements are research_pending but outside
  -- this round's sample, so they are EXCLUDED. The test for that is
  -- "it IS a Pool A statement" AND "it was NOT sampled" — note the
  -- direction: a statement with NO row in pool_a_review_samples is
  -- unsampled, not exempt.
  AND (
       r.statement_id IS NOT NULL
    OR NOT EXISTS (
         SELECT 1 FROM dishes d
          WHERE d.id = s.subject_id
            AND d.created_by = 'wikidata-derived'
       )
  );

COMMENT ON VIEW statement_review_queue IS
  'The review queue. A VIEW, not a table: a queue that stores its own '
  'copy of the thing it is queueing goes stale. '
  'For Pool A it holds only the sampled 10% — the unsampled 90% are '
  'research_pending but outside this sampling round.';

COMMIT;
