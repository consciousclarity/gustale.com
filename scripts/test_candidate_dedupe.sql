-- The 0046 candidate dedupe's regression test.
--
-- WHAT THIS PROVES
-- ----------------
-- 0046 created the unique index
--
--     source_candidates_statement_doi_url_uniq
--     ON source_candidates (statement_id, doi, url)
--
-- and the candidate pipeline inserted with
--
--     ON CONFLICT (statement_id, doi, url) DO NOTHING
--
-- The index does NOT dedupe the candidate set, for two independent
-- reasons:
--
--   1. NULLs never collide. A unique index treats NULLs as DISTINCT,
--      so the same work with a NULL doi can be inserted any number of
--      times. The OpenAlex candidates all have a NULL doi.
--
--   2. The same DOI in two forms is two keys. One catalogue returns
--      "https://doi.org/10.5219/1985" and another returns
--      "10.5219/1985" -- the same work, two index entries.
--
-- The work's identity is its TITLE and YEAR (and its type), not its
-- DOI. So 0046 now indexes
--
--     source_candidates_statement_work_uniq
--     ON source_candidates (statement_id, work_type, title, year, url)
--     NULLS NOT DISTINCT
--
-- and the pipeline inserts with that same conflict target.
--
-- This test builds a throwaway table with BOTH indexes and proves
-- the old one lets a duplicate through while the new one refuses it.
-- It writes nothing to source_candidates and reads nothing from it.

\set ON_ERROR_STOP on

CREATE TEMP TABLE dedupe_probe (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  statement_id  uuid NOT NULL,
  dish_slug     text NOT NULL,
  work_type     text NOT NULL,
  title         text,
  year          int,
  doi           text,
  url           text,
  catalogue     text NOT NULL,
  query         text NOT NULL,
  status        text NOT NULL
);

-- The OLD index, exactly as 0046 first created it.
CREATE UNIQUE INDEX probe_old_key
  ON dedupe_probe (statement_id, doi, url);

-- The NEW index, exactly as 0046 now creates it.
CREATE UNIQUE INDEX probe_new_key
  ON dedupe_probe (statement_id, work_type, title, year, url)
  NULLS NOT DISTINCT;

DO $$
DECLARE
  v_stmt    uuid := gen_random_uuid();
  v_slug    text := 'probe-dish';
  v_title   text := 'A Work With No DOI';
  v_year    int  := 1982;
  v_url     text := 'https://openlibrary.org/works/OL1W';
  v_before  bigint;
  v_after   bigint;
  v_fail    int := 0;
BEGIN
  -- ── 1. THE OLD KEY ALONE LETS THE DUPLICATE THROUGH ────────────────
  -- Drop the new index so only the old key can act.
  EXECUTE 'DROP INDEX probe_new_key';

  INSERT INTO dedupe_probe
    (statement_id, dish_slug, work_type, title, year, doi, url, catalogue, query, status)
  VALUES
    (v_stmt, v_slug, 'book', v_title, v_year, NULL, v_url, 'probe', 'q', 'candidate');

  SELECT count(*) INTO v_before FROM dedupe_probe;

  -- The SAME work again, the same NULL doi. Under the old key this
  -- must SUCCEED -- that is the defect.
  INSERT INTO dedupe_probe
    (statement_id, dish_slug, work_type, title, year, doi, url, catalogue, query, status)
  VALUES
    (v_stmt, v_slug, 'book', v_title, v_year, NULL, v_url, 'probe', 'q', 'candidate');

  SELECT count(*) INTO v_after FROM dedupe_probe;

  IF v_after <> v_before + 1 THEN
    RAISE EXCEPTION 'the old key unexpectedly refused the duplicate -- the test''s premise is wrong';
  END IF;
  RAISE NOTICE 'CONFIRMED: the old key (statement_id, doi, url) accepts a duplicate work with a NULL doi';

  -- Clean up for the next phase.
  TRUNCATE dedupe_probe;

  -- ── 2. THE NEW KEY REFUSES THE DUPLICATE ──────────────────────────
  EXECUTE 'CREATE UNIQUE INDEX probe_new_key
    ON dedupe_probe (statement_id, work_type, title, year, url)
    NULLS NOT DISTINCT';

  INSERT INTO dedupe_probe
    (statement_id, dish_slug, work_type, title, year, doi, url, catalogue, query, status)
  VALUES
    (v_stmt, v_slug, 'book', v_title, v_year, NULL, v_url, 'probe', 'q', 'candidate');

  BEGIN
    INSERT INTO dedupe_probe
      (statement_id, dish_slug, work_type, title, year, doi, url, catalogue, query, status)
    VALUES
      (v_stmt, v_slug, 'book', v_title, v_year, NULL, v_url, 'probe', 'q', 'candidate');
    RAISE EXCEPTION 'the new key accepted a duplicate work -- the dedupe is broken';
  EXCEPTION WHEN unique_violation THEN
    NULL;  -- this is the expected outcome
  END;

  SELECT count(*) INTO v_after FROM dedupe_probe;
  IF v_after <> 1 THEN
    RAISE EXCEPTION 'expected exactly 1 row after the refused duplicate, got %', v_after;
  END IF;
  RAISE NOTICE 'CONFIRMED: the new key refuses a duplicate work with a NULL doi';

  -- ── 3. THE SAME DOI IN TWO FORMS IS ONE WORK ─────────────────────
  -- "https://doi.org/10.1/2" and "10.1/2" are the same work.
  TRUNCATE dedupe_probe;

  INSERT INTO dedupe_probe
    (statement_id, dish_slug, work_type, title, year, doi, url, catalogue, query, status)
  VALUES
    (v_stmt, v_slug, 'article', 'A Paper', 2020, 'https://doi.org/10.1/2',
     'https://doi.org/10.1/2', 'probe', 'q', 'candidate');

  BEGIN
    INSERT INTO dedupe_probe
      (statement_id, dish_slug, work_type, title, year, doi, url, catalogue, query, status)
    VALUES
      (v_stmt, v_slug, 'article', 'A Paper', 2020, '10.1/2',
       'https://doi.org/10.1/2', 'probe', 'q', 'candidate');
    RAISE EXCEPTION 'the new key accepted the same DOI in two forms -- the dedupe is broken';
  EXCEPTION WHEN unique_violation THEN
    NULL;  -- this is the expected outcome
  END;
  RAISE NOTICE 'CONFIRMED: the new key treats one DOI in two forms as one work';

  -- ── 4. BUT TWO GENUINELY DIFFERENT WORKS ARE BOTH KEPT ───────────
  -- Same title, same year, DIFFERENT DOI: two different works (a
  -- chapter and a book with the same title). Both must survive.
  TRUNCATE dedupe_probe;

  INSERT INTO dedupe_probe
    (statement_id, dish_slug, work_type, title, year, doi, url, catalogue, query, status)
  VALUES
    (v_stmt, v_slug, 'article', 'Gazpacho', 2013, '10.5/aaa',
     'https://doi.org/10.5/aaa', 'probe', 'q', 'candidate');

  INSERT INTO dedupe_probe
    (statement_id, dish_slug, work_type, title, year, doi, url, catalogue, query, status)
  VALUES
    (v_stmt, v_slug, 'article', 'Gazpacho', 2013, '10.5/bbb',
     'https://doi.org/10.5/bbb', 'probe', 'q', 'candidate');

  SELECT count(*) INTO v_after FROM dedupe_probe;
  IF v_after <> 2 THEN
    RAISE EXCEPTION 'the new key collapsed two genuinely different works into % rows -- it is too aggressive', v_after;
  END IF;
  RAISE NOTICE 'CONFIRMED: the new key keeps two genuinely different works';

  IF v_fail > 0 THEN
    RAISE EXCEPTION 'the dedupe probe found % failures', v_fail;
  END IF;

  RAISE NOTICE 'CANDIDATE_DEDUPE_PROOF_OK=1';
END $$;

DROP TABLE dedupe_probe;
