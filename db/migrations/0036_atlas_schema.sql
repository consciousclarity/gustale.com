-- 0036 — ADR-004: the shared culinary atlas, phase P1 (the additive schema).
--
-- WHAT THIS IS
--
-- The schema half of the shared culinary atlas. Six additive changes, in the
-- order ADR-004 §11 sets out:
--
--   1. statements gains the three evidence axes (D4)
--   2. claim_dates (D6)
--   3. dish_place_associations + the entity-kind trigger (D1, D3)
--   4. the relation_types vocabulary additions and renames (D5)
--   5. the dish_relations normalized-pair index + the cycle trigger (D5)
--   6. dish_identities + dish_name_relations (D7)
--
-- EVERYTHING HERE IS ADDITIVE. No legacy column is dropped, renamed or
-- retyped. No legacy row is deleted or rewritten. The legacy tables keep
-- their readers until the removal project, which is a separate, later piece
-- of work (the brief's §2).
--
-- IDEMPOTENCE
--
-- Every statement is IF NOT EXISTS, every INSERT is ON CONFLICT DO NOTHING,
-- and every constraint is added with a guard that checks for its own
-- existence first. So this migration is safe on the live database (where it
-- creates what does not exist), safe to re-run, and safe on a database built
-- from the committed chain.
--
-- THE THREE AXES, AND WHY THEY ARE THREE COLUMNS
--
-- The brief asks for four evidence values (`unevidenced`, `research_pending`,
-- `provisional`, `evidenced`) plus `disputed` and `unresolved`, and says
-- "Prefer separate dispute and research-outcome fields over overloading the
-- evidence status."
--
-- The live schema has NEITHER. `statements.status` is the
-- verification_state ENUM, and it is the PUBLICATION / MODERATION state —
-- it is enforced by statement_set_status() and by the statements_status_gate_trg
-- trigger, which refuses a direct UPDATE. `statements.claim_class` is the
-- EPISTEMIC KIND of the claim (documented, scholarly_interpretation,
-- oral_tradition, disputed, hypothesis, unsupported).
--
-- Both keep their existing meanings. ADR-002's semantics are not rewritten
-- here, because the brief itself says to keep them.
--
-- So three new, separate columns:
--
--   evidence_status   how well evidenced the claim is
--   dispute_state     whether competing accounts exist
--   research_outcome  what the research found
--
-- The third one is deliberately named `dispute_state` and not `status` or
-- `disputed`, precisely so it cannot be confused with the `disputed` value
-- that verification_state and claim_class already have. Those are three
-- different concepts and three different columns now.
--
-- `evidenced` is a PROJECT STATE, not proof that a claim is uncontested:
-- it means qualifying non-Wikipedia sources are attached. Whether accounts
-- compete is `dispute_state`'s business.
--
-- NOTE ON THE DEFAULT
--
-- `evidence_status` defaults to 'unevidenced', and the migration BACKFILLS
-- the existing rows from what is actually true of them:
--
--   - a row with a claim_citations row whose source is S1..S5 -> 'evidenced'
--   - a row with any citation at all                     -> 'provisional'
--   - a row with no citation                             -> 'unevidenced'
--
-- The live database has 1486 sources and EVERY ONE of them is S6
-- (Wikipedia). So every existing statement lands on 'provisional' or
-- 'unevidenced' — which is the truth. Nothing is upgraded to 'evidenced'
-- by this migration, and nothing claims to be.

-- =====================================================================
-- 1. THE THREE EVIDENCE AXES ON `statements`
-- =====================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'statements'
       AND column_name = 'evidence_status'
  ) THEN
    ALTER TABLE statements
      ADD COLUMN evidence_status text NOT NULL DEFAULT 'unevidenced';
    COMMENT ON COLUMN statements.evidence_status IS
      'How well evidenced this claim is: unevidenced | research_pending | provisional | evidenced. Separate from `status` (publication) and `claim_class` (epistemic kind).';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'statements'
       AND column_name = 'dispute_state'
  ) THEN
    ALTER TABLE statements
      ADD COLUMN dispute_state text;
    COMMENT ON COLUMN statements.dispute_state IS
      'Whether competing sourced accounts exist: NULL (none recorded) | disputed (competing accounts) | unresolved (researched, genuinely unknown). NOT the same as the `disputed` value of status or claim_class.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'statements'
       AND column_name = 'research_outcome'
  ) THEN
    ALTER TABLE statements
      ADD COLUMN research_outcome text;
    COMMENT ON COLUMN statements.research_outcome IS
      'What the research found: NULL (no research recorded) | completed (answer found) | inconclusive (researched, answer genuinely unknown).';
  END IF;
END $$;

-- The CHECK constraints, added only when they are not already there.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'statements_evidence_status_check'
       AND conrelid = 'statements'::regclass
  ) THEN
    ALTER TABLE statements
      ADD CONSTRAINT statements_evidence_status_check
      CHECK (evidence_status IN ('unevidenced','research_pending','provisional','evidenced'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'statements_dispute_state_check'
       AND conrelid = 'statements'::regclass
  ) THEN
    ALTER TABLE statements
      ADD CONSTRAINT statements_dispute_state_check
      CHECK (dispute_state IS NULL OR dispute_state IN ('disputed','unresolved'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'statements_research_outcome_check'
       AND conrelid = 'statements'::regclass
  ) THEN
    ALTER TABLE statements
      ADD CONSTRAINT statements_research_outcome_check
      CHECK (research_outcome IS NULL OR research_outcome IN ('completed','inconclusive'));
  END IF;
END $$;

-- The BACKFILL, from what is actually true of each statement.
--
-- 'evidenced' requires a qualifying (S1..S5) citation. Today there is
-- none, so nothing is upgraded to it — the backfill states the truth
-- rather than the intention.
UPDATE statements s
   SET evidence_status = CASE
         WHEN EXISTS (
           SELECT 1 FROM claim_citations cc
             JOIN sources src ON src.id = cc.source_id
            WHERE cc.statement_id = s.id
              AND cc.stance = 'supports'
              AND src.source_class IN ('S1','S2','S3','S4','S5')
         ) THEN 'evidenced'
         WHEN EXISTS (
           SELECT 1 FROM claim_citations cc
            WHERE cc.statement_id = s.id
         ) THEN 'provisional'
         ELSE 'unevidenced'
       END
 WHERE s.evidence_status = 'unevidenced'
   AND EXISTS (SELECT 1 FROM claim_citations cc WHERE cc.statement_id = s.id);

-- =====================================================================
-- 2. `claim_dates` — a date qualifies a SPECIFIC claim (D6)
-- =====================================================================
--
-- Four kinds, kept distinct:
--
--   surviving_record    the date of the earliest surviving record
--   proposed_emergence  a period, not a point
--   introduction        when the dish arrived somewhere else
--   adaptation          when a local adaptation was made
--
-- The machine-readable value AND the human-readable expression are both
-- stored, because they are not derivable from each other: "before the
-- thirteenth century" has no year, and "c. 1800" is not "1800".
--
-- `year_start` NULL with precision 'open' is the "before the thirteenth
-- century" case. The human expression is NEVER parsed into an invented
-- year by anything in this migration.

CREATE TABLE IF NOT EXISTS claim_dates (
  id           uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  statement_id uuid REFERENCES statements(id) ON DELETE CASCADE,
  dish_id      uuid REFERENCES dishes(id) ON DELETE CASCADE,
  date_kind    text NOT NULL,
  -- the machine-readable value
  year_start   integer,
  year_end     integer,
  precision    text,
  -- the human-readable expression
  date_text    text NOT NULL,
  -- an optional place qualifier: the date may belong to a place, not to
  -- the dish (an introduction date belongs to the arrival, not the dish)
  place_id     uuid REFERENCES geo_entities(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT claim_dates_one_subject_check
    CHECK (statement_id IS NOT NULL OR dish_id IS NOT NULL),
  CONSTRAINT claim_dates_kind_check
    CHECK (date_kind IN ('surviving_record','proposed_emergence','introduction','adaptation')),
  CONSTRAINT claim_dates_precision_check
    CHECK (precision IS NULL OR precision IN ('exact','approximate','bounded','open')),
  -- an interval is ordered: the start is never after the end
  CONSTRAINT claim_dates_interval_order_check
    CHECK (year_start IS NULL OR year_end IS NULL OR year_start <= year_end),
  -- an 'open' precision has no end year, and a bounded one has both
  CONSTRAINT claim_dates_open_precision_check
    CHECK (precision IS DISTINCT FROM 'open' OR year_end IS NULL),
  CONSTRAINT claim_dates_bounded_precision_check
    CHECK (precision IS DISTINCT FROM 'bounded' OR (year_start IS NOT NULL AND year_end IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS claim_dates_statement_idx ON claim_dates(statement_id);
CREATE INDEX IF NOT EXISTS claim_dates_dish_idx      ON claim_dates(dish_id);
CREATE INDEX IF NOT EXISTS claim_dates_place_idx     ON claim_dates(place_id);
CREATE INDEX IF NOT EXISTS claim_dates_kind_idx      ON claim_dates(date_kind);

COMMENT ON TABLE claim_dates IS
  'Dated claims. A date qualifies a specific claim, never a dish as a whole. The machine-readable value (year_start, year_end, precision) and the human-readable expression (date_text) are both stored, because neither is derivable from the other.';

-- =====================================================================
-- 3. `dish_place_associations` — typed places & traditions (D1, D3)
-- =====================================================================
--
-- The six relationship types, and no others:
--
--   historical_emergence    where the dish is understood to have emerged
--   established_tradition   a tradition the dish is established within
--   regional_adaptation     a local adaptation of the dish
--   later_introduction      where the dish arrived later
--   earliest_documentation  where the earliest surviving record is
--   legacy_unreviewed       MIGRATION ONLY — a legacy value not yet reviewed
--
-- `legacy_unreviewed` exists so that a backfill never has to guess. The
-- editor never creates it.
--
-- The entity reference is POLYMORPHIC, because a place, a historical
-- region and a community are three different kinds of thing:
--
--   entity_kind = 'place'     -> geo_entities.id   (a modern place, a
--                                historical region, a cross-border area)
--   entity_kind = 'community' -> dish_traditions.id (a people, a culinary
--                                tradition — the community side of D1.4)
--
-- A community is a group of people, NOT a place: it has no geometry and no
-- ISO code, and the place it lives in is a separate, optional association.

CREATE TABLE IF NOT EXISTS dish_place_associations (
  id                uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  dish_id           uuid NOT NULL REFERENCES dishes(id) ON DELETE CASCADE,
  relationship_type text NOT NULL,
  entity_kind       text NOT NULL,
  entity_id         uuid NOT NULL,
  -- the human explanation of THIS association, and why it holds
  explanation       text,
  -- qualifiers: the free-form, structured extras (the period, the
  -- population, the name in the local language)
  qualifiers        jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- where the row came from: 'editorial' | 'legacy_dish_cuisines' |
  -- 'legacy_dish_traditions' | 'legacy_origin_geo_id' | 'import'
  provenance        text NOT NULL DEFAULT 'editorial',
  -- the ORIGINAL legacy value, preserved verbatim, so a reviewer can see
  -- exactly what the row was derived from and reverse it
  legacy_value      text,
  -- the three evidence axes, as on `statements`
  evidence_status   text NOT NULL DEFAULT 'unevidenced',
  dispute_state     text,
  research_outcome  text,
  -- the review state of the ROW: 'unreviewed' | 'in_review' | 'accepted'
  -- | 'rejected'. Distinct from the evidence axes and from publication.
  review_state      text NOT NULL DEFAULT 'unreviewed',
  -- the publication state: 'draft' | 'published' | 'withdrawn'.
  -- D8: the public only ever reads published rows.
  publication_state text NOT NULL DEFAULT 'draft',
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT dpa_relationship_type_check
    CHECK (relationship_type IN (
      'historical_emergence','established_tradition','regional_adaptation',
      'later_introduction','earliest_documentation','legacy_unreviewed')),
  CONSTRAINT dpa_entity_kind_check
    CHECK (entity_kind IN ('place','community')),
  CONSTRAINT dpa_evidence_status_check
    CHECK (evidence_status IN ('unevidenced','research_pending','provisional','evidenced')),
  CONSTRAINT dpa_dispute_state_check
    CHECK (dispute_state IS NULL OR dispute_state IN ('disputed','unresolved')),
  CONSTRAINT dpa_research_outcome_check
    CHECK (research_outcome IS NULL OR research_outcome IN ('completed','inconclusive')),
  CONSTRAINT dpa_review_state_check
    CHECK (review_state IN ('unreviewed','in_review','accepted','rejected')),
  CONSTRAINT dpa_publication_state_check
    CHECK (publication_state IN ('draft','published','withdrawn'))
);

-- The identity of an association: the dish, the relationship, and the
-- entity. One association per (dish, type, entity) — a second claim about
-- the SAME association is a competing statement, not a second row.
CREATE UNIQUE INDEX IF NOT EXISTS dpa_identity_uniq
  ON dish_place_associations (dish_id, relationship_type, entity_kind, entity_id);

CREATE INDEX IF NOT EXISTS dpa_dish_idx        ON dish_place_associations (dish_id);
CREATE INDEX IF NOT EXISTS dpa_entity_idx      ON dish_place_associations (entity_kind, entity_id);
CREATE INDEX IF NOT EXISTS dpa_type_idx        ON dish_place_associations (relationship_type);
CREATE INDEX IF NOT EXISTS dpa_publication_idx ON dish_place_associations (publication_state);
CREATE INDEX IF NOT EXISTS dpa_review_idx      ON dish_place_associations (review_state);

COMMENT ON TABLE dish_place_associations IS
  'Typed place and tradition associations (ADR-004 D1/D3). The three concepts stay separate: this table is PLACES & TRADITIONS, not classification and not history. A place association never implies exclusive ownership.';
COMMENT ON COLUMN dish_place_associations.relationship_type IS
  'historical_emergence | established_tradition | regional_adaptation | later_introduction | earliest_documentation | legacy_unreviewed. The last is migration-only.';
COMMENT ON COLUMN dish_place_associations.legacy_value IS
  'The original legacy value this row was derived from, preserved verbatim. Nothing is lost by the migration and everything is reversible.';
COMMENT ON COLUMN dish_place_associations.provenance IS
  'Where the row came from: editorial | legacy_dish_cuisines | legacy_dish_traditions | legacy_origin_geo_id | import.';

-- The valid entity combinations, enforced SERVER-SIDE (the brief's §5 D3).
--
-- A 'place' association must point at a geo_entities row; a 'community'
-- association must point at a dish_traditions row. The check is on the
-- referenced row's existence, which is why it is a trigger and not a CHECK
-- constraint: a CHECK cannot look at another table.
CREATE OR REPLACE FUNCTION dish_place_association_entity_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_kind text;
BEGIN
  IF NEW.entity_kind = 'place' THEN
    SELECT entity_type INTO v_kind FROM geo_entities WHERE id = NEW.entity_id;
    IF v_kind IS NULL THEN
      RAISE EXCEPTION
        'a place association must point at an existing geo_entities row (entity_id %)',
        NEW.entity_id;
    END IF;
  ELSIF NEW.entity_kind = 'community' THEN
    IF NOT EXISTS (SELECT 1 FROM dish_traditions WHERE id = NEW.entity_id) THEN
      RAISE EXCEPTION
        'a community association must point at an existing dish_traditions row (entity_id %)',
        NEW.entity_id;
    END IF;
  ELSE
    RAISE EXCEPTION 'unknown entity_kind %', NEW.entity_kind;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS dpa_entity_guard_trg ON dish_place_associations;
CREATE TRIGGER dpa_entity_guard_trg
  BEFORE INSERT OR UPDATE OF entity_kind, entity_id ON dish_place_associations
  FOR EACH ROW EXECUTE FUNCTION dish_place_association_entity_guard();

-- =====================================================================
-- 4. THE relation_types VOCABULARY (D5)
-- =====================================================================
--
-- The five historical predicates and the three resemblance predicates.
--
-- The existing rows are NOT deleted: `regional-cousin`, `shared-method` and
-- `shared-serving` are RENAMED to the brief's names, and their ids are
-- kept, so every existing dish_relations row keeps its relation_type_id.
-- `ancestor`, `diaspora` and `family` keep their rows and their meaning.
--
-- The direction convention, stated once and used everywhere:
--
--   source = predecessor / influence / broader dish
--   target = derived / influenced / variant dish
--
-- An `adapted_from` edge means "target was adapted from source".

INSERT INTO relation_types (id, slug, name, is_symmetric, description)
VALUES
  ('11111111-1111-4111-8111-000000000001', 'developed_from', 'Developed from', false,
   'DIRECTIONAL: from_dish_id is the predecessor, to_dish_id is the dish developed from it. "target was developed from source".'),
  ('11111111-1111-4111-8111-000000000002', 'adapted_from', 'Adapted from', false,
   'DIRECTIONAL: from_dish_id is the source dish, to_dish_id is the adaptation. "target was adapted from source".'),
  ('11111111-1111-4111-8111-000000000003', 'influenced_by', 'Influenced by', false,
   'DIRECTIONAL: from_dish_id is the dish that influenced, to_dish_id is the dish influenced. "target was influenced by source".'),
  ('11111111-1111-4111-8111-000000000004', 'regional_variant_of', 'Regional variant of', false,
   'DIRECTIONAL: from_dish_id is the broader dish, to_dish_id is the regional variant. "target is a regional variant of source". Acyclic.'),
  ('11111111-1111-4111-8111-000000000005', 'connection_proposed', 'Connection proposed', false,
   'A proposed connection whose direction may or may not be known. When direction_known is false, NO arrow is rendered anywhere.'),
  ('11111111-1111-4111-8111-000000000006', 'often_compared_with', 'Often compared with', true,
   'SYMMETRIC: both dishes are often compared. Direction carries no claim. Stored once, with normalized endpoints.')
ON CONFLICT (slug) DO UPDATE
  SET name = EXCLUDED.name,
      is_symmetric = EXCLUDED.is_symmetric,
      description = EXCLUDED.description;

-- The three renames, keeping the existing ids so no relation is orphaned.
UPDATE relation_types SET slug = 'similar_form', name = 'Similar form'
 WHERE slug = 'regional-cousin';
UPDATE relation_types SET slug = 'similar_technique', name = 'Similar technique'
 WHERE slug = 'shared-method';
UPDATE relation_types SET slug = 'often_compared_with', name = 'Often compared with'
 WHERE slug = 'shared-serving';

-- The mirror column on dish_relations is kept in step by the existing
-- trigger, but the three renames need the mirror updated too.
UPDATE dish_relations dr
   SET relation_type = rt.slug
  FROM relation_types rt
 WHERE dr.relation_type_id = rt.id
   AND dr.relation_type <> rt.slug;

-- The new vocabulary rows need their mirror values for the new types.
UPDATE dish_relations dr
   SET relation_type = rt.slug
  FROM relation_types rt
 WHERE rt.slug IN ('developed_from','adapted_from','influenced_by',
                   'regional_variant_of','connection_proposed','often_compared_with')
   AND dr.relation_type_id = rt.id
   AND dr.relation_type <> rt.slug;

-- `connection_proposed` records whether the direction is known. Without
-- this, a proposed connection would have to be rendered as an arrow, and
-- an arrow asserts a direction the data does not have.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'dish_relations'
       AND column_name = 'direction_known'
  ) THEN
    ALTER TABLE dish_relations
      ADD COLUMN direction_known boolean NOT NULL DEFAULT true;
    COMMENT ON COLUMN dish_relations.direction_known IS
      'For connection_proposed: whether the direction of the connection is known. When false, NO arrow is rendered — in the page, in the graph, or in the API. Defaults to true for the existing directional types.';
  END IF;
END $$;

-- A proposed connection with an unknown direction is exactly the case the
-- column exists for, so it defaults to false for that type and true for
-- the rest.
UPDATE dish_relations dr
   SET direction_known = false
  FROM relation_types rt
 WHERE dr.relation_type_id = rt.id
   AND rt.slug = 'connection_proposed';

-- =====================================================================
-- 5. THE NORMALIZED-PAIR INDEX AND THE CYCLE TRIGGER (D5)
-- =====================================================================
--
-- A symmetric pair is stored ONCE, with normalized endpoints. So a
-- reversed duplicate of a symmetric pair must be rejected — while a
-- reversed DIRECTIONAL pair is two different, equally legitimate claims
-- and must be allowed.
--
-- The index is therefore partial: it covers only the symmetric types.
-- The expression uses LEAST/GREATEST on the uuid pair, which is stable
-- regardless of insertion order.

CREATE UNIQUE INDEX IF NOT EXISTS dish_relations_symmetric_pair_uniq
  ON dish_relations (
    LEAST(from_dish_id, to_dish_id),
    GREATEST(from_dish_id, to_dish_id),
    relation_type
  )
  WHERE is_symmetric = true;

COMMENT ON INDEX dish_relations_symmetric_pair_uniq IS
  'A symmetric pair is stored once, with normalized endpoints. A reversed duplicate is rejected. Directional types are excluded, because for them a reversed pair is a different claim.';

-- The cycle guard for regional_variant_of.
--
-- "A is a regional variant of B" and "B is a regional variant of A" is a
-- contradiction, and a longer loop is the same contradiction with more
-- steps. The trigger walks the chain from the new edge's target and
-- refuses the write if it reaches the new edge's source.
--
-- The influence network is NOT a tree, and this constraint does NOT make
-- it one: it applies ONLY to regional_variant_of. `developed_from`,
-- `adapted_from` and `influenced_by` remain free to form parallel claims.

CREATE OR REPLACE FUNCTION dish_relations_variant_cycle_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_type_slug text;
  v_loop_found boolean;
BEGIN
  -- Only the variant predicate is acyclic.
  SELECT slug INTO v_type_slug
    FROM relation_types
   WHERE id = NEW.relation_type_id;

  IF v_type_slug IS DISTINCT FROM 'regional_variant_of' THEN
    RETURN NEW;
  END IF;

  IF NEW.from_dish_id = NEW.to_dish_id THEN
    RAISE EXCEPTION 'a relation may not link a dish to itself (dish %)',
      NEW.from_dish_id;
  END IF;

  -- Walk forward from the new target: if the chain ever reaches the new
  -- source, the new edge closes a loop.
  WITH RECURSIVE chain(dish_id) AS (
    SELECT NEW.to_dish_id
    UNION
    SELECT dr.to_dish_id
      FROM dish_relations dr
      JOIN relation_types rt ON rt.id = dr.relation_type_id
      JOIN chain c ON c.dish_id = dr.from_dish_id
     WHERE rt.slug = 'regional_variant_of'
       AND dr.status <> 'quarantined'
  )
  SELECT EXISTS (SELECT 1 FROM chain WHERE dish_id = NEW.from_dish_id)
    INTO v_loop_found;

  IF v_loop_found THEN
    RAISE EXCEPTION
      'regional_variant_of would create a cycle (from % to %)',
      NEW.from_dish_id, NEW.to_dish_id;
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_c_check_variant_cycle ON dish_relations;
CREATE TRIGGER trg_c_check_variant_cycle
  BEFORE INSERT OR UPDATE OF from_dish_id, to_dish_id, relation_type_id ON dish_relations
  FOR EACH ROW EXECUTE FUNCTION dish_relations_variant_cycle_guard();

-- The family parent cycle guard (D2: "Parent links stay within one
-- dimension and cannot form cycles").
CREATE OR REPLACE FUNCTION dish_families_parent_cycle_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_loop_found boolean;
BEGIN
  IF NEW.parent_id IS NULL OR NEW.parent_id = NEW.id THEN
    RETURN NEW;
  END IF;

  WITH RECURSIVE chain(id) AS (
    SELECT NEW.parent_id
    UNION
    SELECT f.parent_id
      FROM dish_families f
      JOIN chain c ON c.id = f.id
     WHERE f.parent_id IS NOT NULL
  )
  SELECT EXISTS (SELECT 1 FROM chain WHERE id = NEW.id) INTO v_loop_found;

  IF v_loop_found THEN
    RAISE EXCEPTION
      'the family parent chain would form a cycle (family % -> parent %)',
      NEW.id, NEW.parent_id;
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS dish_families_parent_cycle_trg ON dish_families;
CREATE TRIGGER dish_families_parent_cycle_trg
  BEFORE INSERT OR UPDATE OF parent_id ON dish_families
  FOR EACH ROW EXECUTE FUNCTION dish_families_parent_cycle_guard();

-- =====================================================================
-- 6. `dish_identities` AND `dish_name_relations` (D7)
-- =====================================================================

CREATE TABLE IF NOT EXISTS dish_identities (
  id            uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  from_dish_id  uuid NOT NULL REFERENCES dishes(id) ON DELETE CASCADE,
  to_dish_id    uuid NOT NULL REFERENCES dishes(id) ON DELETE CASCADE,
  identity_kind text NOT NULL,
  explanation   text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT dish_identities_no_self_check CHECK (from_dish_id <> to_dish_id),
  CONSTRAINT dish_identities_kind_check
    CHECK (identity_kind IN ('shared_dish','regional_variant','historically_related'))
);

CREATE UNIQUE INDEX IF NOT EXISTS dish_identities_pair_uniq
  ON dish_identities (from_dish_id, to_dish_id, identity_kind);

CREATE INDEX IF NOT EXISTS dish_identities_from_idx ON dish_identities (from_dish_id);
CREATE INDEX IF NOT EXISTS dish_identities_to_idx   ON dish_identities (to_dish_id);

COMMENT ON TABLE dish_identities IS
  'How two dish rows relate (ADR-004 D7). shared_dish = one preparation with two rows; regional_variant = a named local form; historically_related = related by documented history, not identity. Identifiers are preserved until editorial review resolves identity — nothing is merged by name and nothing is split by national association.';

CREATE TABLE IF NOT EXISTS dish_name_relations (
  id            uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  from_dish_id  uuid NOT NULL REFERENCES dishes(id) ON DELETE CASCADE,
  to_dish_id    uuid NOT NULL REFERENCES dishes(id) ON DELETE CASCADE,
  relation_kind text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT dish_name_relations_no_self_check CHECK (from_dish_id <> to_dish_id),
  CONSTRAINT dish_name_relations_kind_check
    CHECK (relation_kind IN ('alias','translation','transliteration'))
);

CREATE UNIQUE INDEX IF NOT EXISTS dish_name_relations_pair_uniq
  ON dish_name_relations (from_dish_id, to_dish_id, relation_kind);

CREATE INDEX IF NOT EXISTS dish_name_relations_from_idx ON dish_name_relations (from_dish_id);
CREATE INDEX IF NOT EXISTS dish_name_relations_to_idx   ON dish_name_relations (to_dish_id);

COMMENT ON TABLE dish_name_relations IS
  'How two dish rows relate by NAME (ADR-004 D7): an alias, a translation or a transliteration. dish_names already carries the names themselves; this table carries the link between two dishes when the same name denotes two of them.';

-- =====================================================================
-- THE REPORT — what the migration found
-- =====================================================================

DO $$
DECLARE
  v_stmt      bigint;
  v_evidenced bigint;
  v_prov      bigint;
  v_unev      bigint;
  v_types     bigint;
  v_sym       bigint;
BEGIN
  SELECT count(*) INTO v_stmt FROM statements;
  SELECT count(*) INTO v_evidenced FROM statements WHERE evidence_status = 'evidenced';
  SELECT count(*) INTO v_prov      FROM statements WHERE evidence_status = 'provisional';
  SELECT count(*) INTO v_unev      FROM statements WHERE evidence_status = 'unevidenced';
  SELECT count(*) INTO v_types     FROM relation_types;
  SELECT count(*) INTO v_sym       FROM relation_types WHERE is_symmetric;

  RAISE NOTICE 'statements: % total — evidenced % / provisional % / unevidenced %',
    v_stmt, v_evidenced, v_prov, v_unev;
  RAISE NOTICE 'relation_types: % rows, % symmetric', v_types, v_sym;
  RAISE NOTICE 'evidence_status is a PROJECT STATE: evidenced means qualifying non-Wikipedia sources are attached, NOT that the claim is uncontested.';
END $$;
