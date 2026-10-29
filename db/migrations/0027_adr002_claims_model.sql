-- GUS-242 / ADR-002 — the claims model.
--
-- ADR-002 Q1–Q13 are ALL DECIDED. This migration builds the schema
-- those decisions describe. Nothing in here is speculative: every
-- column and every constraint traces to a numbered decision.
--
-- WHAT THIS BUILDS
--
--   predicates             the vocabulary — exactly one per dimension
--   statements             the claim: subject + predicate + value
--   statement_readings     an optional, NON-AUTHORITATIVE rendering
--   claim_citations        the evidence link: passage + anchor + stance
--   sentence_claims        which sentence states which claim
--   sources                the source registry, with its class
--
-- THE THREE AXES, KEPT SEPARATE
--
-- Q8: independence is STORED and tri-state — not computed.
-- Q12: verification state (draft → research_pending → under_review →
--   verified → published) and claim_class are SEPARATE axes, so "no
--   evidence" never reads as "not yet checked".
--
-- Q10: a statement is an INDEPENDENT entity. It has no owner and no
--   dish_id. The subject reference is the only link from a statement
--   to the world, so the same fact asserted by several dishes is ONE
--   statement with several evidence chains.
--
-- THE AGENT BOUNDARY (Q12)
--
-- The `verified` and `published` transitions must not be writable by
-- the agent's own credential. This migration creates the ROLES that
-- make that separation real; the grants live in the deployment, not
-- here, because a role's privileges are a property of the deployment
-- and not of the schema. What the schema does is make the boundary
-- OBSERVABLE: every transition is recorded, with who did it.

-- ─────────────────────────────────────────────────────────────────────
-- The source registry
--
-- Q6: sources are classified by URL domain, individually. The class
-- (S1–S7) is what the evidence policy keys off, so it is stored.
-- ─────────────────────────────────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'source_class' AND n.nspname = 'public'
  ) THEN
    CREATE TYPE source_class AS ENUM (
      'S1',  -- primary historical
      'S2',  -- scholarly
      'S3',  -- institutional
      'S4',  -- practitioner
      'S5',  -- specialist
      'S6',  -- reference (Wikipedia, Wikidata, general publications)
      'S7'   -- unverified (blogs, AI-generated, unattributed)
    );
  END IF;
END
$$;

-- The source class lives on the EXISTING sources table rather than a
-- new one — Q6 classified the 142 existing catalog sources by URL
-- domain, and a second registry would split the same sources in two.
ALTER TABLE sources
  ADD COLUMN IF NOT EXISTS source_class source_class,
  ADD COLUMN IF NOT EXISTS source_classed_at timestamptz,
  ADD COLUMN IF NOT EXISTS source_classed_by text;

-- A source with no class cannot support a claim. The column is
-- nullable because 142 existing rows are unclassified; the
-- classification pass fills them.
COMMENT ON COLUMN sources.source_class IS
  'GUS-026 §3 source class. S6 = reference (Wikipedia/Wikidata) — '
  'discovery only, never the sole basis for a contested origin claim.';

-- ─────────────────────────────────────────────────────────────────────
-- The predicate vocabulary
--
-- Q4: the vocabulary is DERIVED from the seven dimensions, not
-- assembled opportunistically. A dimension without a predicate is a
-- gap in the vocabulary, and visible as one.
-- ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS predicates (
  id          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  slug        text NOT NULL UNIQUE,
  name        text NOT NULL,
  value_kind  text NOT NULL CHECK (value_kind IN ('entity','vocabulary','literal')),
  value_type  text,
  description text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS predicates_value_type_idx
  ON predicates (value_type)
  WHERE value_type IS NOT NULL;

COMMENT ON TABLE predicates IS
  'ADR-002 Q4. Exactly one predicate per dimension. The vocabulary is '
  'derived from the dimensions, so a missing dimension shows up as a '
  'missing predicate.';

-- ─────────────────────────────────────────────────────────────────────
-- The statements
--
-- Q1: the structure IS the claim. There is no authoritative text
-- column — a reading is a separate, optional, explicitly
-- non-authoritative annotation (statement_readings, below).
--
-- Q3: the subject is an entity reference — 'dish' or 'place' for the
-- pilot. There is no owner column and no dish_id (Q10).
--
-- Q5: one fact is one statement. The uniqueness key covers the
-- subject, the predicate, the value AND the qualifiers, so two
-- statements cannot assert the same thing twice.
-- ─────────────────────────────────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'claim_class' AND n.nspname = 'public'
  ) THEN
    CREATE TYPE claim_class AS ENUM (
      'documented',
      'scholarly_interpretation',
      'oral_tradition',
      'disputed',
      'hypothesis',
      'unsupported'
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'verification_state' AND n.nspname = 'public'
  ) THEN
    CREATE TYPE verification_state AS ENUM (
      'draft',
      'research_pending',
      'under_review',
      'verified',
      'published',
      'disputed',
      'needs_revision'
    );
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS statements (
  id            uuid PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Q3: the SUBJECT of the statement. An entity reference, typed by
  -- kind because the pilot's two kinds live in different tables.
  subject_type  text NOT NULL CHECK (subject_type IN ('dish','place')),
  subject_id    uuid NOT NULL,

  -- Q4: the predicate.
  predicate_id  uuid NOT NULL REFERENCES predicates(id),

  -- The VALUE. Q4/Q5: exactly one of the three forms is set.
  value_type    text NOT NULL CHECK (value_type IN ('entity','vocabulary','literal')),
  value_ref     uuid,
  value_literal text,
  -- Q4 Amendment 3: the literal types are pinned.
  value_literal_type text CHECK (
    value_literal_type IS NULL OR value_literal_type IN (
      'person_name', 'date', 'duration', 'quantity', 'temperature',
      'measurement', 'place_name', 'text'
    )
  ),

  -- Q1/Q4: the qualifiers.
  qualifiers    jsonb NOT NULL DEFAULT '{}'::jsonb,

  -- GUS-026 §4: the class. What the claim IS.
  claim_class   claim_class NOT NULL,

  -- Q12: the state. What has happened to it. A SEPARATE axis from
  -- the class, so "no evidence" never reads as "not yet checked".
  status        verification_state NOT NULL DEFAULT 'draft',

  -- Q8: independence is STORED, tri-state, and never defaulted.
  --   'single'      one source, no corroboration sought or found
  --   'corroborated' two or more INDEPENDENT class-sufficient sources
  --   'dependent'   two or more sources that are NOT independent
  -- There is NO default: an unset value means "not assessed", which
  -- is different from "single" and must not be read as it.
  independence  text CHECK (independence IN ('single','corroborated','dependent')),
  independence_checked_at timestamptz,

  -- Q12: the agent boundary. The verified/published transitions
  -- must not be writable by the agent's own credential — a boundary
  -- enforced only by a written rule gets crossed under pressure.
  -- The schema cannot enforce WHO writes; it records WHO DID, so a
  -- breach is visible after the fact.
  verified_by   text,
  verified_at   timestamptz,
  published_by  text,
  published_at  timestamptz,

  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),

  -- ONE FACT IS ONE STATEMENT. Q5: the qualifiers are part of the
  -- identity — the same subject/predicate/value with different
  -- qualifiers is a DIFFERENT fact.
  CONSTRAINT statements_one_value CHECK (
    (value_type = 'literal' AND value_literal IS NOT NULL AND value_ref IS NULL)
    OR
    (value_type IN ('entity','vocabulary') AND value_ref IS NOT NULL AND value_literal IS NULL)
  )
);

-- The subject must EXIST, and it must exist in the table its type
-- names. A CHECK constraint cannot contain a subquery, so this is a
-- trigger. It is DEFERRABLE INITIALLY DEFERRED so a statement may be
-- inserted in the same transaction that creates its subject.
CREATE OR REPLACE FUNCTION statements_check_subject()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.subject_type = 'dish' THEN
    IF NOT EXISTS (SELECT 1 FROM dishes d WHERE d.id = NEW.subject_id) THEN
      RAISE EXCEPTION 'statement %: no dish with id %', NEW.id, NEW.subject_id;
    END IF;
  ELSIF NEW.subject_type = 'place' THEN
    IF NOT EXISTS (SELECT 1 FROM geo_entities g WHERE g.id = NEW.subject_id) THEN
      RAISE EXCEPTION 'statement %: no place with id %', NEW.id, NEW.subject_id;
    END IF;
  ELSE
    RAISE EXCEPTION 'statement %: unknown subject_type %', NEW.id, NEW.subject_type;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS statements_subject_exists_trg ON statements;
CREATE CONSTRAINT TRIGGER statements_subject_exists_trg
  AFTER INSERT OR UPDATE OF subject_type, subject_id ON statements
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION statements_check_subject();

-- The uniqueness key. Postgres 15+ has NULLS NOT DISTINCT; the
-- database is 16, so it is available.
CREATE UNIQUE INDEX IF NOT EXISTS statements_one_fact_uniq
  ON statements (
    subject_type, subject_id, predicate_id, value_type,
    value_ref, value_literal, value_literal_type, qualifiers
  ) NULLS NOT DISTINCT;

CREATE INDEX IF NOT EXISTS statements_subject_idx
  ON statements (subject_type, subject_id);

CREATE INDEX IF NOT EXISTS statements_predicate_idx
  ON statements (predicate_id);

CREATE INDEX IF NOT EXISTS statements_status_idx
  ON statements (status);

CREATE INDEX IF NOT EXISTS statements_class_idx
  ON statements (claim_class);

-- The review queue's index: the machine/unreviewed statements, so
-- the 10% sample is a cheap query and not a full scan.
CREATE INDEX IF NOT EXISTS statements_review_queue_idx
  ON statements (status, claim_class, updated_at)
  WHERE status IN ('draft','research_pending','under_review');

COMMENT ON TABLE statements IS
  'ADR-002 Q1/Q10. The structure IS the claim — there is no '
  'authoritative text column. A statement is an independent entity: no '
  'owner, no dish_id; the subject is the only link to the world.';

COMMENT ON COLUMN statements.independence IS
  'ADR-002 Q8. Stored, tri-state, never defaulted. NULL means '
  '''not assessed'', which is NOT the same as ''single''.';

-- ─────────────────────────────────────────────────────────────────────
-- The readings — optional, editorial, NON-AUTHORITATIVE
--
-- Q1: the structure is the claim; a reading is a convenience. When a
-- reading drifts from the structure, nothing breaks — because nothing
-- measures the reading. A reading may be hand-edited (kind =
-- 'editorial'); it may never be the basis of a metric, and it may
-- never be the sole carrier of a fact.
-- ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS statement_readings (
  id           uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  statement_id uuid NOT NULL REFERENCES statements(id) ON DELETE CASCADE,
  text         text NOT NULL,
  locale       text NOT NULL DEFAULT 'en',
  -- 'plain' = generated from the structure; 'editorial' = hand-written.
  kind         text NOT NULL DEFAULT 'plain' CHECK (kind IN ('plain','editorial')),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (statement_id, locale, kind)
);

COMMENT ON TABLE statement_readings IS
  'ADR-002 Q1. Optional and NON-AUTHORITATIVE. A reading may never be '
  'the basis of a metric and may never be the sole carrier of a fact.';

-- ─────────────────────────────────────────────────────────────────────
-- The evidence link
--
-- Q7: one row per (statement, source, revision, locator). It carries
-- the VERBATIM excerpt, the retrieval anchor, and a stance that
-- separates support from refutation from context.
-- ─────────────────────────────────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'citation_stance' AND n.nspname = 'public'
  ) THEN
    CREATE TYPE citation_stance AS ENUM ('supports','refutes','context');
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS claim_citations (
  id           uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  statement_id uuid NOT NULL REFERENCES statements(id) ON DELETE CASCADE,
  source_id    uuid NOT NULL REFERENCES sources(id),

  -- Q7: the stance. 'context' counts as NEITHER support nor
  -- refutation (Amendment 3).
  stance       citation_stance NOT NULL,

  -- WHERE in the source the passage sits.
  locator      text,

  -- The EXACT text that supports the statement, quoted verbatim.
  excerpt      text,

  -- The retrieval anchor: which VERSION of the document was read.
  revision_id  text,

  -- WHEN the passage was read. The single timestamp (Amendment 2).
  retrieved_at timestamptz NOT NULL,

  -- Q12: was this excerpt validated against the stated revision? A
  -- fetched citation needs a VALIDATED excerpt before the claim may
  -- move to under_review.
  excerpt_validated boolean NOT NULL DEFAULT false,

  created_at   timestamptz NOT NULL DEFAULT now(),

  -- Q7 Amendment 1: the uniqueness key is (statement, source,
  -- revision, locator). Multiple passages from one source on one
  -- revision are distinct rows; the same passage re-read on a
  -- different revision is a NEW row, and the history is kept.
  CONSTRAINT claim_citations_one_passage_uniq
    UNIQUE NULLS NOT DISTINCT (statement_id, source_id, revision_id, locator)
);

CREATE INDEX IF NOT EXISTS claim_citations_statement_idx
  ON claim_citations (statement_id);

CREATE INDEX IF NOT EXISTS claim_citations_source_idx
  ON claim_citations (source_id);

-- The 'context' stance is neither support nor refutation, so it must
-- not be counted as either.
CREATE INDEX IF NOT EXISTS claim_citations_supports_idx
  ON claim_citations (statement_id, source_id)
  WHERE stance = 'supports';

COMMENT ON TABLE claim_citations IS
  'ADR-002 Q7. One row per (statement, source, revision, locator). '
  'The excerpt is verbatim; the stance ''context'' counts as neither '
  'support nor refutation.';

-- ─────────────────────────────────────────────────────────────────────
-- The sentence anchors
--
-- Q9: a sentence is a place where a fact is asserted; the sentence's
-- dish and the statement's subject are INDEPENDENT. A tacos-al-pastor
-- sentence may assert something about Puebla, and that statement's
-- subject is 'place', not 'dish'.
--
-- The description_sentences table already exists (migration 0025).
-- ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS sentence_claims (
  sentence_id  uuid NOT NULL REFERENCES description_sentences(id) ON DELETE CASCADE,
  statement_id uuid NOT NULL REFERENCES statements(id) ON DELETE CASCADE,
  -- Whether this sentence is the statement's PRIMARY anchor.
  is_primary   boolean NOT NULL DEFAULT false,
  created_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (sentence_id, statement_id)
);

CREATE INDEX IF NOT EXISTS sentence_claims_statement_idx
  ON sentence_claims (statement_id);

COMMENT ON TABLE sentence_claims IS
  'ADR-002 Q9. The sentence anchor. The sentence''s dish and the '
  'statement''s subject are independent — a sentence may state a fact '
  'about a different subject.';

-- ─────────────────────────────────────────────────────────────────────
-- The predicate seed — the seven dimensions
--
-- Q4: exactly one predicate per dimension.
-- ─────────────────────────────────────────────────────────────────────

INSERT INTO predicates (slug, name, value_kind, value_type, description)
VALUES
  ('is_a',                'Is a',                'vocabulary', 'dish_families',
   'The dish''s family. Q4: exactly one predicate per dimension.'),
  ('belongs_to_cuisine',  'Belongs to cuisine',  'vocabulary', 'dish_cuisines',
   'The dish''s cuisine.'),
  ('served_as_course',    'Served as course',    'vocabulary', 'dish_courses',
   'The course the dish is served as.'),
  ('cooked_by',           'Cooked by',           'vocabulary', 'dish_techniques',
   'The technique the dish is cooked by.'),
  ('contains_ingredient', 'Contains ingredient', 'vocabulary', 'ingredient_categories',
   'The ingredient category the dish contains. Q4 Amendment 1: points at '
   'the controlled vocabulary for now; GUS-233 widens it to the ingredient '
   'entities.'),
  ('part_of_tradition',   'Part of tradition',   'vocabulary', 'dish_traditions',
   'The tradition the dish belongs to.'),
  ('eaten_in_context',    'Eaten in context',    'vocabulary', 'dish_contexts',
   'The context the dish is eaten in.'),
  -- Q4 Amendment 2: created_by is a MARKED EXCEPTION — it takes a
  -- typed literal, because a person entity is backlogged.
  ('created_by',          'Created by',          'literal',   NULL,
   'Who created the dish. A marked exception: the value is a '
   'person_name literal, because a person entity is backlogged.'),
  ('originated_in',       'Originated in',       'entity',    'geo_entities',
   'The place the dish originated in. An origin claim needs a non-S6 '
   'source (GUS-026 §3.1).'),
  ('named_after',         'Named after',         'entity',    NULL,
   'The thing the dish is named after.'),
  ('originated_at',       'Originated at',       'literal',   NULL,
   'When the dish originated. A date literal.')
ON CONFLICT (slug) DO UPDATE
  SET name        = EXCLUDED.name,
      value_kind  = EXCLUDED.value_kind,
      value_type  = COALESCE(EXCLUDED.value_type, predicates.value_type),
      description = EXCLUDED.description,
      updated_at  = now();

-- ─────────────────────────────────────────────────────────────────────
-- The review queue
--
-- The user asked for a NON-BLOCKING 10% review queue: a sample of
-- each import batch is reviewed, and the rest proceeds. The queue is
-- a VIEW over the statements, not a separate table — a queue that
-- stores its own copy of the thing it is queueing goes stale.
-- ─────────────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW statement_review_queue AS
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
WHERE s.status IN ('draft','research_pending','under_review');

COMMENT ON VIEW statement_review_queue IS
  'The review queue. A VIEW, not a table: a queue that stores its own '
  'copy of the thing it is queueing goes stale.';

-- ─────────────────────────────────────────────────────────────────────
-- The claim lifecycle — the transitions, and who made them
--
-- Q12: the lifecycle is GUS-026 §6's seven states exactly, with
-- explicit gates. The gates are in the FUNCTION, so they cannot be
-- bypassed by writing the column directly... which means the write
-- path must go through this function. The trigger below refuses a
-- direct write to status that the function did not authorise.
-- ─────────────────────────────────────────────────────────────────────





-- ─────────────────────────────────────────────────────────────────────
-- The gate bypass — CLOSED
--
-- A gate is only as strong as the write path. `statement_set_status`
-- checks every transition, but a direct
--   UPDATE statements SET status = 'published'
-- would skip every check — and the pilot's whole point is that a
-- claim cannot reach `published` without its gates met.
--
-- So the function sets a transaction-local flag while it writes, and
-- a trigger refuses any status change made WITHOUT it. The flag is
-- transaction-local (set_config with true = local), so it cannot leak
-- into another transaction.
-- ─────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION statement_status_gate_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  -- TEXT, not boolean. current_setting(..., true) returns an EMPTY
  -- STRING when the setting is unset, and assigning '' to a boolean
  -- raises 'invalid input syntax for type boolean' — which happens
  -- BEFORE the comparison, so the guard raised a confusing error
  -- instead of its own message. The setting is a flag string, so
  -- text is the honest type for it.
  v_authorised text;
BEGIN
  -- A status change that is not a change is not a transition.
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  v_authorised := current_setting('gustale.statement_gate', true);

  IF coalesce(v_authorised, '') IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION
      'the status of a statement may only change through '
      'statement_set_status(), which checks the gates. '
      '(statement %, % -> %)',
      NEW.id, OLD.status, NEW.status;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS statements_status_gate_trg ON statements;
CREATE TRIGGER statements_status_gate_trg
  BEFORE UPDATE OF status ON statements
  FOR EACH ROW EXECUTE FUNCTION statement_status_gate_guard();

-- The function sets the flag around its own write.
CREATE OR REPLACE FUNCTION statement_set_status(
  p_statement_id uuid,
  p_to verification_state,
  p_actor text
) RETURNS verification_state
LANGUAGE plpgsql
AS $$
DECLARE
  v_from verification_state;
  v_class claim_class;
  v_ok boolean := false;
BEGIN
  SELECT status, claim_class INTO v_from, v_class
    FROM statements WHERE id = p_statement_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'statement % does not exist', p_statement_id;
  END IF;

  -- The gates, from Q12.
  CASE p_to
    WHEN 'research_pending' THEN
      v_ok := true;

    WHEN 'under_review' THEN
      v_ok := EXISTS (
        SELECT 1 FROM claim_citations c
         WHERE c.statement_id = p_statement_id
           AND c.excerpt_validated
      );

    WHEN 'verified' THEN
      v_ok := CASE v_class
        WHEN 'documented' THEN
          EXISTS (SELECT 1 FROM claim_citations c JOIN sources src ON src.id = c.source_id
                   WHERE c.statement_id = p_statement_id AND c.stance = 'supports'
                     AND src.source_class IN ('S1','S2','S3','S4','S5'))
        WHEN 'scholarly_interpretation' THEN
          EXISTS (SELECT 1 FROM claim_citations c JOIN sources src ON src.id = c.source_id
                   WHERE c.statement_id = p_statement_id AND c.stance = 'supports'
                     AND src.source_class IN ('S1','S2','S3'))
        WHEN 'oral_tradition' THEN
          EXISTS (SELECT 1 FROM claim_citations c JOIN sources src ON src.id = c.source_id
                   WHERE c.statement_id = p_statement_id AND c.stance = 'supports'
                     AND src.source_class = 'S4')
        WHEN 'disputed' THEN
          (SELECT count(DISTINCT src.source_class) FROM claim_citations c JOIN sources src ON src.id = c.source_id
            WHERE c.statement_id = p_statement_id AND c.stance = 'supports'
              AND src.source_class IN ('S1','S2','S3')) >= 2
        WHEN 'hypothesis' THEN
          EXISTS (SELECT 1 FROM claim_citations c JOIN sources src ON src.id = c.source_id
                   WHERE c.statement_id = p_statement_id AND c.stance = 'supports'
                     AND src.source_class IN ('S2','S5'))
        ELSE false
      END;

      IF v_ok THEN
        v_ok := EXISTS (
          SELECT 1 FROM claim_citations c JOIN sources src ON src.id = c.source_id
           WHERE c.statement_id = p_statement_id AND c.stance = 'supports'
             AND src.source_class IN ('S1','S2','S3','S4','S5')
        );
      END IF;

    WHEN 'published' THEN
      v_ok := EXISTS (
        SELECT 1 FROM sentence_claims sc WHERE sc.statement_id = p_statement_id
      );

    WHEN 'disputed' THEN
      v_ok := EXISTS (
        SELECT 1 FROM claim_citations c JOIN sources src ON src.id = c.source_id
         WHERE c.statement_id = p_statement_id AND c.stance = 'supports'
           AND src.source_class IN ('S1','S2','S3')
      ) AND EXISTS (
        SELECT 1 FROM claim_citations c JOIN sources src ON src.id = c.source_id
         WHERE c.statement_id = p_statement_id AND c.stance = 'refutes'
           AND src.source_class IN ('S1','S2','S3')
      );

    WHEN 'needs_revision' THEN
      v_ok := true;

    WHEN 'draft' THEN
      v_ok := true;

    ELSE
      v_ok := false;
  END CASE;

  IF NOT v_ok THEN
    RAISE EXCEPTION
      'the gate for % -> % is not met for statement % (class %)',
      v_from, p_to, p_statement_id, v_class;
  END IF;

  -- The agent boundary: the verified and published transitions must
  -- not be writable by the agent's own credential.
  IF p_to IN ('verified','published') THEN
    IF p_actor IS NULL OR p_actor = '' OR p_actor ILIKE '%agent%' OR p_actor ILIKE '%hermes%' THEN
      RAISE EXCEPTION
        'the % transition must be made by a human credential, not %',
        p_to, COALESCE(p_actor, '(null)');
    END IF;
  END IF;

  -- Authorise THIS write only. The setting is transaction-local, so
  -- it cannot leak into another transaction.
  PERFORM set_config('gustale.statement_gate', 'on', true);

  UPDATE statements
     SET status = p_to,
         updated_at = now(),
         verified_by = CASE WHEN p_to = 'verified' THEN p_actor ELSE verified_by END,
         verified_at = CASE WHEN p_to = 'verified' THEN now() ELSE verified_at END,
         published_by = CASE WHEN p_to = 'published' THEN p_actor ELSE published_by END,
         published_at = CASE WHEN p_to = 'published' THEN now() ELSE published_at END
   WHERE id = p_statement_id;

  PERFORM set_config('gustale.statement_gate', 'off', true);

  -- The transition log. Every transition is recorded.
  INSERT INTO statement_status_log (statement_id, from_status, to_status, actor, gate_ok)
  VALUES (p_statement_id, v_from, p_to, COALESCE(p_actor, '(null)'), true);

  RETURN p_to;
END;
$$;

COMMENT ON FUNCTION statement_set_status(uuid, verification_state, text) IS
  'ADR-002 Q12. The lifecycle gates live HERE, so they hold for every '
  'writer. The verified/published transitions refuse an actor whose '
  'name marks it as the agent, and every transition is logged.';

COMMENT ON FUNCTION statement_status_gate_guard() IS
  'ADR-002 Q12. A gate is only as strong as the write path: a direct '
  'UPDATE of a statement''s status is refused. The status may only '
  'change through statement_set_status(), which checks the gates.';

-- ─────────────────────────────────────────────────────────────────────
-- The transition log
--
-- Q12: every transition is recorded. The lifecycle is auditable, and
-- a move that skipped a gate is visible.
-- ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS statement_status_log (
  id           uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  statement_id uuid NOT NULL REFERENCES statements(id) ON DELETE CASCADE,
  from_status  verification_state,
  to_status    verification_state NOT NULL,
  actor        text NOT NULL,
  -- Whether the gate for this transition was satisfied.
  gate_ok      boolean NOT NULL DEFAULT true,
  note         text,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS statement_status_log_statement_idx
  ON statement_status_log (statement_id, created_at);

-- ─────────────────────────────────────────────────────────────────────
-- The post-assertions
-- ─────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  n_predicates integer;
  dim_slug text;
BEGIN
  SELECT count(*) INTO n_predicates FROM predicates;
  IF n_predicates < 7 THEN
    RAISE EXCEPTION 'expected at least the seven dimension predicates, got %', n_predicates;
  END IF;

  -- The seven dimensions each have exactly one predicate.
  FOR dim_slug IN
    SELECT unnest(ARRAY[
      'is_a','belongs_to_cuisine','served_as_course','cooked_by',
      'contains_ingredient','part_of_tradition','eaten_in_context'
    ])
  LOOP
    IF NOT EXISTS (SELECT 1 FROM predicates WHERE slug = dim_slug) THEN
      RAISE EXCEPTION 'the dimension predicate % is missing', dim_slug;
    END IF;
  END LOOP;

  RAISE NOTICE 'the claims model is ready: % predicates', n_predicates;
END
$$;
