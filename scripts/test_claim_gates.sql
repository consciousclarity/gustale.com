-- The ADR-002 Q12 gate tests, against a migration-applied copy.
--
-- Every test asserts that a transition is REFUSED or ALLOWED. The
-- point is not that the function works; it is that the GATES hold —
-- and especially that a direct UPDATE cannot walk around them.

\set ON_ERROR_STOP on

-- A clean slate: a previous run of this script left rows behind, and
-- the gate tests are about what is REFUSED, so the state has to be
-- reset or the second run proves nothing.
DELETE FROM claim_citations WHERE statement_id = '22222222-2222-2222-2222-222222222222';
DELETE FROM sentence_claims   WHERE statement_id = '22222222-2222-2222-2222-222222222222';
DELETE FROM statement_status_log WHERE statement_id = '22222222-2222-2222-2222-222222222222';
DELETE FROM statements WHERE id = '22222222-2222-2222-2222-222222222222';

-- A test dish.
INSERT INTO dishes (id, slug, canonical_name, status)
  VALUES ('11111111-1111-1111-1111-111111111111', 'gate-test-dish', 'Gate Test Dish', 'draft')
  ON CONFLICT (id) DO NOTHING;

-- A source, class S2 (scholarly — class-sufficient for a documented
-- claim, and not S6).
INSERT INTO sources (id, source_type, title, language, url, source_class, source_classed_at)
  VALUES ('33333333-3333-3333-3333-333333333333', 'web', 'A scholarly paper', 'en',
          'https://example.org/paper', 'S2', now())
  ON CONFLICT (id) DO NOTHING;

-- A documented statement with a created_by literal.
INSERT INTO statements (id, subject_type, subject_id, predicate_id, value_type,
                        value_literal, value_literal_type, qualifiers, claim_class, status)
  SELECT '22222222-2222-2222-2222-222222222222', 'dish',
         '11111111-1111-1111-1111-111111111111', p.id, 'literal',
         'someone', 'person_name', '{}'::jsonb, 'documented', 'draft'
    FROM predicates p WHERE p.slug = 'created_by'
  ON CONFLICT DO NOTHING;

\echo ''
\echo '=== TEST 1: draft -> research_pending WORKS (no evidence needed) ==='
SELECT statement_set_status('22222222-2222-2222-2222-222222222222', 'research_pending', 'hermes-agent') AS result;

\echo ''
\echo '=== TEST 2: research_pending -> under_review is REFUSED without a validated citation ==='
DO $$
BEGIN
  PERFORM statement_set_status('22222222-2222-2222-2222-222222222222', 'under_review', 'hermes-agent');
  RAISE EXCEPTION 'TEST FAILED: the transition should have been refused';
EXCEPTION WHEN OTHERS THEN
  IF SQLERRM = 'TEST FAILED: the transition should have been refused' THEN RAISE; END IF;
  RAISE NOTICE 'PASS — refused: %', SQLERRM;
END $$;

\echo ''
\echo '=== TEST 3: a DIRECT UPDATE of status is REFUSED (the gate bypass) ==='
DO $$
BEGIN
  UPDATE statements SET status = 'published'
   WHERE id = '22222222-2222-2222-2222-222222222222';
  RAISE EXCEPTION 'TEST FAILED: the direct UPDATE should have been refused';
EXCEPTION WHEN OTHERS THEN
  IF SQLERRM = 'TEST FAILED: the direct UPDATE should have been refused' THEN RAISE; END IF;
  RAISE NOTICE 'PASS — refused: %', SQLERRM;
END $$;

\echo ''
\echo '=== TEST 4: the status is unchanged after the refused bypass ==='
DO $$
DECLARE v_status verification_state;
BEGIN
  SELECT status INTO v_status FROM statements WHERE id = '22222222-2222-2222-2222-222222222222';
  IF v_status <> 'research_pending' THEN
    RAISE EXCEPTION 'TEST FAILED: the status is %, expected research_pending', v_status;
  END IF;
  RAISE NOTICE 'PASS — the status is still %', v_status;
END $$;

\echo ''
\echo '=== TEST 5: a validated citation unlocks under_review ==='
INSERT INTO claim_citations (statement_id, source_id, stance, locator, excerpt,
                             revision_id, retrieved_at, excerpt_validated)
  VALUES ('22222222-2222-2222-2222-222222222222',
          '33333333-3333-3333-3333-333333333333',
          'supports', 'para 1', 'someone', 'r1', now(), true)
  ON CONFLICT DO NOTHING;
SELECT statement_set_status('22222222-2222-2222-2222-222222222222', 'under_review', 'hermes-agent') AS result;

\echo ''
\echo '=== TEST 6: the AGENT is REFUSED the verified transition ==='
DO $$
BEGIN
  PERFORM statement_set_status('22222222-2222-2222-2222-222222222222', 'verified', 'hermes-agent');
  RAISE EXCEPTION 'TEST FAILED: the agent should have been refused';
EXCEPTION WHEN OTHERS THEN
  IF SQLERRM = 'TEST FAILED: the agent should have been refused' THEN RAISE; END IF;
  RAISE NOTICE 'PASS — refused: %', SQLERRM;
END $$;

\echo ''
\echo '=== TEST 7: a HUMAN may verify ==='
SELECT statement_set_status('22222222-2222-2222-2222-222222222222', 'verified', 'alejandro') AS result;

\echo ''
\echo '=== TEST 8: published is REFUSED without a sentence anchor ==='
DO $$
BEGIN
  PERFORM statement_set_status('22222222-2222-2222-2222-222222222222', 'published', 'alejandro');
  RAISE EXCEPTION 'TEST FAILED: the transition should have been refused';
EXCEPTION WHEN OTHERS THEN
  IF SQLERRM = 'TEST FAILED: the transition should have been refused' THEN RAISE; END IF;
  RAISE NOTICE 'PASS — refused: %', SQLERRM;
END $$;

\echo ''
\echo '=== TEST 9: the AGENT is REFUSED the published transition ==='
DO $$
BEGIN
  PERFORM statement_set_status('22222222-2222-2222-2222-222222222222', 'published', 'hermes-agent');
  RAISE EXCEPTION 'TEST FAILED: the agent should have been refused';
EXCEPTION WHEN OTHERS THEN
  IF SQLERRM = 'TEST FAILED: the agent should have been refused' THEN RAISE; END IF;
  RAISE NOTICE 'PASS — refused: %', SQLERRM;
END $$;

\echo ''
\echo '=== TEST 10: a sentence anchor unlocks published for a human ==='
-- The sentence_managed flag is on DISHES, not on description_sentences
-- (migration 0025 puts it there): a dish whose description is managed
-- by the sentence table must not have its description written
-- directly.
INSERT INTO description_sentences (id, dish_id, field, locale, position, text)
  SELECT '44444444-4444-4444-4444-444444444444', '11111111-1111-1111-1111-111111111111',
         'short', 'en', 1, 'A test sentence.'
  ON CONFLICT (id) DO NOTHING;
INSERT INTO sentence_claims (sentence_id, statement_id, is_primary)
  VALUES ('44444444-4444-4444-4444-444444444444', '22222222-2222-2222-2222-222222222222', true)
  ON CONFLICT DO NOTHING;
SELECT statement_set_status('22222222-2222-2222-2222-222222222222', 'published', 'alejandro') AS result;

\echo ''
\echo '=== TEST 11: every transition is logged, with its actor ==='
SELECT from_status, to_status, actor FROM statement_status_log
 WHERE statement_id = '22222222-2222-2222-2222-222222222222'
 ORDER BY created_at;

\echo ''
\echo '=== TEST 12: the review queue view sees the unverified statements ==='
SELECT count(*) AS in_the_queue FROM statement_review_queue
 WHERE id = '22222222-2222-2222-2222-222222222222';

\echo ''
\echo '=== ALL GATE TESTS COMPLETE ==='
