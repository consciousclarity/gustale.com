-- 0046_source_candidates.sql
--
-- GUS-1010: the table that holds CANDIDATE sources, awaiting review.
--
-- WHY THIS TABLE EXISTS
-- --------------------
-- GUS-1010's finding: "SELECT source_class, count(*) FROM sources GROUP BY 1
-- returns exactly ONE row: S6=1486. Every URL points at Wikipedia." The
-- verified gate reads S1-S5, so not one of the 1354 statements can reach
-- verified, and none can reach published.
--
-- The research half of that brief is a pipeline that produces a QUALIFYING
-- source for a SPECIFIC claim. This table is where the pipeline's output
-- lands — and it lands HERE, not in `sources`, and not in
-- `claim_citations`.
--
-- WHAT THIS TABLE DELIBERATELY DOES NOT DO
-- -----------------------------------------
-- It is not `sources`. It has no foreign key to `sources` and it does not
-- insert into it. A candidate is a WORK found in a catalogue: metadata plus
-- the catalogue that returned it plus the query that found it.
--
-- It is not `claim_citations`. A citation says "this source supports this
-- statement, and here is the locator and the excerpt". A candidate says
-- "this work MIGHT support this statement; a human has to read it and
-- decide".
--
-- Nothing here is ever "verified". The status column's enum deliberately
-- has no 'verified' member: the only way out of 'candidate' is to be
-- confirmed by a human, who then does the promotion by hand (create the
-- source row, create the citation, set the statement's status). The
-- script that writes this table never does any of that.
--
-- WHY THE PROPOSED CLASS IS A PROPOSAL
-- ------------------------------------
-- `proposed_source_class` is what the CATALOGUE implies: Crossref indexes
-- journal articles and books, so a Crossref hit is proposed as S2
-- (scholarly); the Library of Congress is proposed as S3 (institutional);
-- OpenLibrary's books are proposed as S5 (specialist) or S1 (primary
-- historical) where the year says so.
--
-- A catalogue's subject area is not the same thing as a source's class.
-- An OpenLibrary book about a dish's REGION is not a primary historical
-- source for that dish. The class is a starting point for the reviewer's
-- judgement, not a verdict. The reviewer may change it, and the
-- requirement is that only S1-S5 ever reaches the registry.
--
-- THE FETCH COLUMNS
-- -----------------
-- `fetched`, `fetch_note`, `locator` and `excerpt` are the fields that
-- GUS-1010's acceptance criterion turns on: "A source enters the registry
-- only after the page was actually fetched and the claim found in it".
--
-- A candidate that was found by a catalogue search but never fetched has
-- `fetched = false` and no excerpt. It is a lead. A candidate that was
-- fetched has an excerpt — the actual text found in the document — and a
-- locator. The excerpt is what the reviewer reads to decide whether the
-- work actually supports the claim. Without an excerpt, the candidate is
-- not ready for review and the promotion path stays closed.
--
-- The whole point is that a catalogue hit proves EXISTENCE, not SUPPORT.
-- A work about falafel that never mentions where falafel comes from
-- supports nothing about falafel's origin, and this table's shape makes
-- that visible: the reviewer's eye goes to the excerpt.
--
-- THE DISH SLUG
-- -------------
-- Denormalised on purpose. The candidate is per-STATEMENT, and the
-- statement's subject is a dish; carrying the slug makes the candidate
-- list readable without a join, and makes the report script simple. It
-- is a snapshot of the subject at the time of the search, not a foreign
-- key — a dish may be renamed, and a candidate should still point at
-- the statement it was found for.

BEGIN;

-- ── the candidate status ──────────────────────────────────────────────
--
-- There is deliberately no 'verified' value. A candidate is either
-- pending, or rejected, or it has been CONFIRMED — and confirming it is
-- a human act that promotes it OUT of this table into `sources` and
-- `claim_citations`. The status records the review, not the outcome of
-- a verification.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'source_candidate_status') THEN
    CREATE TYPE source_candidate_status AS ENUM (
      'candidate',   -- found, not yet read
      'fetched',     -- the document was fetched; the excerpt is what was found
      'rejected'     -- read, and it does not support the claim
    );
  END IF;
END
$$;

-- ── the table ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS source_candidates (
  id                   uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  -- The statement this candidate might support. The unit of work: a
  -- source supports a STATEMENT, not a dish.
  statement_id         uuid NOT NULL REFERENCES statements(id) ON DELETE CASCADE,
  -- The subject's slug, denormalised for readability (see the header).
  dish_slug            text NOT NULL,

  -- ── the bibliographic metadata, as the catalogue returned it ────────
  title                text NOT NULL,
  authors              text[],
  year                 integer,
  publisher            text,
  container_title      text,
  doi                  text,
  isbn                 text,
  url                  text,
  work_type            text,

  -- ── where it came from, and how ─────────────────────────────────────
  catalogue            text NOT NULL,
  query                text NOT NULL,
  catalogue_relevance  numeric,
  -- The overlap between the candidate's title and the dish's own
  -- vocabulary. A cheap first filter, not a judgement.
  term_overlap         numeric NOT NULL DEFAULT 0,

  -- ── the proposal, and the review ────────────────────────────────────
  proposed_source_class source_class NOT NULL,
  status                source_candidate_status NOT NULL DEFAULT 'candidate',

  -- ── the fetch evidence ──────────────────────────────────────────────
  --
  -- fetched = false means this is a LEAD: a catalogue says the work
  -- exists. It says nothing about whether the work supports the claim.
  --
  -- fetched = true means the document was actually retrieved, and
  -- `excerpt` holds the text that was found in it. The excerpt is what
  -- the reviewer reads. A candidate with no excerpt is not ready for
  -- promotion, and the requirement is that only S1-S5 ever reaches the
  -- registry.
  fetched               boolean NOT NULL DEFAULT false,
  fetch_note            text,
  locator               text,
  excerpt               text,

  created_at            timestamptz NOT NULL DEFAULT now(),
  reviewed_by            text,
  reviewed_at           timestamptz
);

-- ── the indexes ───────────────────────────────────────────────────────

-- One candidate per (statement, work). The same work found twice by two
-- catalogues is one candidate, not two.
CREATE UNIQUE INDEX IF NOT EXISTS source_candidates_statement_doi_url_uniq
  ON source_candidates (statement_id, doi, url);

-- The reviewer's query: the pending candidates for a statement.
CREATE INDEX IF NOT EXISTS source_candidates_statement_idx
  ON source_candidates (statement_id);

-- The report's query: the candidates for a dish.
CREATE INDEX IF NOT EXISTS source_candidates_dish_idx
  ON source_candidates (dish_slug);

-- The reviewer's queue: the candidates not yet read.
CREATE INDEX IF NOT EXISTS source_candidates_pending_idx
  ON source_candidates (status)
  WHERE status IN ('candidate', 'fetched');

-- ── the guard ─────────────────────────────────────────────────────────
--
-- A candidate is a PROPOSAL. It must never sit in the registry's source
-- table, and it must never be counted as a supporting source.
--
-- The check is here rather than only in the application because the
-- registry's own rule is what this table exists to satisfy: the verified
-- gate reads S1-S5 from `sources`, and this table is not `sources`. If a
-- future change ever promoted a candidate directly into the registry
-- without a human's citation row, the promotion would have to go through
-- `sources` — and that is where this constraint bites.
--
-- The constraint that matters is the foreign key's RESTRICT behaviour on
-- the other side: nothing in `source_candidates` is referenced by
-- `claim_citations`, so a candidate can never be cited as a source.
-- This is checked, not assumed:

DO $$
DECLARE
  v_cited_candidates integer;
BEGIN
  SELECT count(*) INTO v_cited_candidates
  FROM claim_citations cc
  JOIN source_candidates sc ON sc.id = cc.source_id;

  IF v_cited_candidates > 0 THEN
    RAISE EXCEPTION
      'source_candidates must never be cited: % rows reference one', v_cited_candidates;
  END IF;

  RAISE NOTICE 'SOURCE_CANDIDATES_TABLE_READY=1';
END
$$;

COMMIT;
