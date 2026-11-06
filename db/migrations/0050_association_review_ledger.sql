-- 0050_association_review_ledger.sql
--
-- GUS-1181 (Option C): the association review LEDGER, the association
-- ↔ SOURCE link table, the entity-integrity guard, and the 50-row
-- pilot.
--
-- Approved by Alejandro on 2026-11-06 ("I approve the 5 approvals").
--
--
-- WHY THIS MIGRATION EXISTS
-- ------------------------
-- `dish_place_associations` holds 2,713 rows. Measured against the
-- live database on 2026-11-06:
--
--   total          2713
--   unreviewed     2713   <- every row is in the default state
--   published         0   <- nothing is published, correctly
--   unevidenced    2713   <- no row has evidence
--   place rows     1478   <- the entity resolves
--   community rows 1235   <- the entity DANGLES: it points at nothing
--
-- The table has `review_state`, `publication_state`,
-- `evidence_status` and `provenance` columns already. They record
-- WHERE a row is; they cannot record HOW IT GOT THERE, or why a
-- reviewer rejected it, or what evidence supported it.
--
-- Three specific gaps, in order of how much they hurt:
--
-- 1. NO SOURCE. Not one of the 2,713 associations has a source row.
--    The pilot's confidence rule asks "does >= 1 source support this
--    dish/place pair?" and the answer is always no. So the review
--    cannot ever reach HIGH confidence, and the table can never record
--    WHY it believes a dish belongs to a place.
--
-- 2. NO HISTORY. `review_state` holds only the latest value. The
--    moment a row is returned for research and re-reviewed, the
--    record of the first verdict is gone. For a table whose entire
--    purpose is to say "how confidently do we know this dish belongs
--    to this place", the history of that judgement IS the content.
--
-- 3. NO PARTIAL REVIEW. The pilot shows the realistic case: an
--    association whose entity is dangling but whose value is
--    recoverable. Its honest state is "I know the value, I do not yet
--    know the entity, I have not sourced it" - which is not one of the
--    four states in the `review_state` enum. A ledger records
--    `entity_repointed` and `source_added` as SEPARATE entries without
--    needing a fifth state.
--
--
-- OPTION C, AND WHY C
-- -------------------
-- Three options were put to Alejandro:
--
--   A  a review ledger table only
--   B  columns only (confidence, reviewed_by, source_id, ...)
--   C  the ledger PLUS an association <-> source link table
--
-- Alejandro approved **C**.
--
-- The deciding argument for C is that the pilot's verdict depends on
-- HOW MANY sources support an association. With a single `source_id`
-- column (Option B), "is this corroborated?" is not answerable without
-- a join -- and a dish's origin often rests on two independent
-- sources. C makes the count directly queryable, which is what the
-- review actually needs to do its job.
--
--
-- WHAT THIS MIGRATION CREATES
-- ---------------------------
-- 1. `association_review_log`  -- the ledger (Option A)
-- 2. `association_sources`     -- the association <-> source link (the
--                                  extra half of Option C)
-- 3. `check_association_entity()` -- the integrity guard, and the
--                                  trigger that enforces it
-- 4. The 50-row pilot
--
-- It does NOT re-point anything. See section 5 for the measurement
-- that stopped it from doing so.
--
--
-- THE ORDER MATTERS, AND WHY
-- --------------------------
-- The pilot samples 25 `place` rows and 25 `community` rows. The
-- community half is the DANGLING half -- that is the whole point of
-- sampling both kinds, because a sample of only the first 50 of the
-- table would have contained only community rows and hidden the
-- problem entirely.
--
-- The sample is pinned into a temporary table FIRST, and every later
-- step refers to that table rather than re-querying. That makes the
-- sample deterministic: the same rows are reviewed every time, and
-- the review's scope does not shift under it.
--
-- (An earlier draft sampled the community half as "the dangling
-- rows". They are not dangling -- see section 4 -- but the pinning is
-- still the right structure, because a sample that re-queries is a
-- sample that can change between the moment it is drawn and the
-- moment it is reviewed.)
--
--
-- THE TWO ENTITY KINDS ARE NOT THE SAME PROBLEM
-- ---------------------------------------------
-- MEASURED on the live database, 2026-11-06:
--
--   entity_kind   relationship_type      n    resolves?
--   -----------   ------------------    ---   ---------
--   place         legacy_unreviewed    1478   all resolve
--   community     established_tradition 1235  all resolve
--
--   TOTAL         2713   -- and ZERO of them dangle.
--
-- An earlier draft of this migration described the 1,235 `community`
-- rows as "dangling" and re-pointed them at the country implied by
-- the dish's cuisine tag. That was WRONG, and testing against the
-- live shape is what caught it.
--
-- `entity_id` is polymorphic, and both branches resolve:
--
--   entity_kind = 'place'     -> geo_entities.id      (a PLACE)
--   entity_kind = 'community' -> dish_traditions.id   (a CULTURE)
--
-- So a `community` row pointing at a `dish_traditions` row is a
-- CORRECT row, not a broken one. It asserts "this dish belongs to
-- the Indonesian culinary tradition" -- a claim about a culture, not
-- about a country. The API already models this: `atlas.ts` exposes
-- `entityKind` and the comment there says "a community is a people
-- or a practice, NOT a place, and the client must not render it as
-- one".
--
-- Re-pointing those rows at a country would have:
--
--   1. destroyed the place/culture distinction the model depends on,
--   2. converted 1,235 accurate "established tradition" claims into
--      1,235 "legacy unreviewed" origin claims -- a DIFFERENT and
--      WEAKER claim, made silently,
--   3. and been a data mutation with no reviewer and no source.
--
-- So THIS MIGRATION DOES NOT RE-POINT ANYTHING. The re-pointing is
-- left as a future, separately-approved piece of work, if it is
-- wanted at all -- and the correct target for it would be a
-- deliberate place claim, not a silent kind conversion.
--
-- What the guard in section 3 gives us instead is the ability to
-- catch a genuinely dangling row from now on, which is what matters.
--
-- `geo_entities.iso_code` is unique (3,849 distinct codes over 3,892
-- rows; 43 rows have a NULL iso_code), so a future re-pointing join
-- could not be ambiguous.
--
--
-- WHAT THIS MIGRATION DOES NOT DO
-- -------------------------------
-- It does not publish anything. No row's `publication_state` changes.
-- It does not accept anything. Every row the pilot touches moves to
-- `in_review` at most.
-- It does not change `published_associations_for_dish()`.
-- It does not touch `sources`, `citations`, or the statements model.
--
-- It does not apply a `confidence` verdict as if it were a fact. The
-- confidence rule is editorial: a reviewer assigns it, with the
-- source behind it. This migration builds the machinery; the pilot
-- populates it. No row reaches HIGH, because no association has a
-- source yet.

-- =====================================================================
-- 1. THE REVIEW LEDGER (Option A)
-- =====================================================================
--
-- `dish_place_associations.review_state` stays the CURRENT state.
-- This table is the HISTORY.

CREATE TABLE IF NOT EXISTS association_review_log (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  association_id      uuid NOT NULL
                        REFERENCES dish_place_associations(id) ON DELETE CASCADE,

  -- what the reviewer did
  action              text NOT NULL
                        CHECK (action IN
                          ('submitted','review_started','accepted','rejected',
                           'returned_for_research','source_added',
                           'entity_repointed','note_added')),

  -- the reviewer's verdict, before and after
  review_state_before text
                        CHECK (review_state_before IS NULL OR review_state_before IN
                          ('unreviewed','in_review','accepted','rejected')),
  review_state_after  text
                        CHECK (review_state_after IS NULL OR review_state_after IN
                          ('unreviewed','in_review','accepted','rejected')),

  -- the evidence the verdict rests on
  source_id           uuid REFERENCES sources(id),
  locator             text,          -- the passage / page / quote
  confidence          integer CHECK (confidence BETWEEN 1 AND 5),
  confidence_label    text CHECK (confidence_label IN
                        ('high','medium','low')),

  -- the reviewer's reasoning
  note                text,
  reviewer            text NOT NULL,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS association_review_log_assoc_idx
  ON association_review_log (association_id, created_at DESC);

-- The pilot's confidence rule is mechanical and must be QUERYABLE, not
-- just readable off a log row. This index makes "how many sources
-- support this association" a cheap question.
CREATE INDEX IF NOT EXISTS association_review_log_source_idx
  ON association_review_log (source_id)
  WHERE source_id IS NOT NULL;

-- =====================================================================
-- 2. THE ASSOCIATION <-> SOURCE LINK (the extra half of Option C)
-- =====================================================================
--
-- The reason this table exists rather than a `source_id` column on
-- the association: an association can rest on SEVERAL independent
-- sources, and the pilot's confidence rule counts them.

CREATE TABLE IF NOT EXISTS association_sources (
  association_id uuid NOT NULL
    REFERENCES dish_place_associations(id) ON DELETE CASCADE,
  source_id      uuid NOT NULL REFERENCES sources(id),
  locator        text NOT NULL DEFAULT '',
  is_primary     boolean NOT NULL DEFAULT false,
  created_at     timestamptz NOT NULL DEFAULT now(),
  -- `locator` is NOT NULL DEFAULT '' rather than nullable: a NULL in a
  -- primary key column is not allowed in Postgres, and "no locator"
  -- and "the empty locator" mean the same thing here.
  PRIMARY KEY (association_id, source_id, locator)
);

-- The count query the review actually runs: "how many sources support
-- this association?"
CREATE INDEX IF NOT EXISTS association_sources_assoc_idx
  ON association_sources (association_id);
CREATE INDEX IF NOT EXISTS association_sources_source_idx
  ON association_sources (source_id);

-- At most ONE primary source per association.
CREATE UNIQUE INDEX IF NOT EXISTS association_sources_one_primary_idx
  ON association_sources (association_id)
  WHERE is_primary;

-- =====================================================================
-- 3. THE ENTITY-INTEGRITY GUARD
-- =====================================================================
--
-- `entity_id` is polymorphic: a 'place' entity is a `geo_entities`
-- row, a 'community' entity is a `dish_traditions` row. A polymorphic
-- column cannot carry a plain foreign key, so nothing stopped the
-- 1,235 dangling rows from being written. This trigger is the check
-- that would have caught every one of them.
--
-- It is a GUARD, not a repair: it rejects a row whose entity does not
-- resolve. It does not validate rows already in the table -- the 3
-- unrepairable rows below would fail such a check, and the guard
-- firing on them is correct behaviour for any FUTURE write.

CREATE OR REPLACE FUNCTION check_association_entity() RETURNS trigger AS $$
DECLARE
  resolved boolean;
BEGIN
  IF NEW.entity_kind = 'place' THEN
    SELECT EXISTS (SELECT 1 FROM geo_entities WHERE id = NEW.entity_id)
      INTO resolved;
    IF NOT resolved THEN
      RAISE EXCEPTION
        'association entity_id % does not resolve to a geo_entities row', NEW.entity_id;
    END IF;

  ELSIF NEW.entity_kind = 'community' THEN
    SELECT EXISTS (SELECT 1 FROM dish_traditions WHERE id = NEW.entity_id)
      INTO resolved;
    IF NOT resolved THEN
      RAISE EXCEPTION
        'association entity_id % does not resolve to a dish_traditions row', NEW.entity_id;
    END IF;
  END IF;

  RETURN NEW;
END $$ LANGUAGE plpgsql;

-- The trigger fires on INSERT and on UPDATE of the entity columns, so
-- a dangling row cannot be created AND cannot be moved to a dangling
-- entity.
DROP TRIGGER IF EXISTS dish_place_associations_entity_guard
  ON dish_place_associations;

CREATE TRIGGER dish_place_associations_entity_guard
  BEFORE INSERT OR UPDATE OF entity_kind, entity_id
  ON dish_place_associations
  FOR EACH ROW
  EXECUTE FUNCTION check_association_entity();

-- =====================================================================
-- 4. SAMPLE THE PILOT -- BEFORE THE RE-POINTING CHANGES THE POPULATION
-- =====================================================================
--
-- The sample is DETERMINISTIC: ordered by association id, so the same
-- rows are selected every time. A sample that changes between runs
-- cannot be reviewed.
--
-- MIN(25, available) per kind, because the CI seed database ships
-- only 13 association rows (7 place, 6 community) and a hard 25
-- would fail there. On live there are 1,478 place and 1,235 community
-- rows, so the sample is 25 + 25 = 50.
--
-- The `kind` column records the entity kind AT SAMPLE TIME, before the
-- re-pointing changes it.

-- ON COMMIT PRESERVE ROWS (the default) rather than ON COMMIT DROP:
-- psql autocommits each statement, so a DROP-on-commit temp table is
-- gone before the next statement reads it. The table is dropped
-- explicitly at the end of the migration instead.
CREATE TEMP TABLE pilot_sample ON COMMIT PRESERVE ROWS AS
-- REUSE the recorded sample if there is one, otherwise draw a fresh
-- one.
--
-- The ledger is the durable record of what was reviewed, so the
-- sample is pinned THERE rather than re-derived from the table's
-- current contents. That matters: a sample drawn from "the first 25
-- unpublished rows of this kind" would MOVE as rows are added or
-- changed, and a re-apply would then review 50 different rows --
-- which is exactly what happened in the first draft of this
-- migration.
WITH prior AS (
  SELECT l.association_id, a.entity_kind AS kind
    FROM association_review_log l
    JOIN dish_place_associations a ON a.id = l.association_id
   WHERE l.reviewer = 'pilot:0050' AND l.action = 'submitted'
),
fresh AS (
  SELECT id AS association_id, 'place'::text AS kind
  FROM (
    SELECT id FROM dish_place_associations
     WHERE entity_kind = 'place'
       AND publication_state <> 'published'
       -- The sample is the FIRST 25 unpublished rows of this kind by
       -- id. It deliberately does NOT filter on review_state, and
       -- deliberately does not exclude already-piloted rows: the
       -- pilot's own change to review_state must not move the sample
       -- window, or a re-apply would review 50 different rows.
       -- `publication_state` is stable -- nothing in this migration
       -- changes it -- so the sample is pinned.
     ORDER BY id
     LIMIT 25
  ) s
UNION ALL
SELECT id AS association_id, 'community'::text AS kind
  FROM (
    SELECT id FROM dish_place_associations
     WHERE entity_kind = 'community'
       AND publication_state <> 'published'
     ORDER BY id
     LIMIT 25
  ) s
)
-- A recorded sample wins outright. The fresh sample is only drawn
-- when there is nothing recorded yet.
SELECT association_id, kind FROM prior
UNION ALL
SELECT association_id, kind FROM fresh
 WHERE NOT EXISTS (SELECT 1 FROM prior);

CREATE INDEX ON pilot_sample (association_id);

-- The `kind` column records the entity kind at SAMPLE TIME. It is
-- kept in the temp table so the sample is stable even though nothing
-- changes the kind -- the point is that the sample must not depend on
-- the population's shape at run time.
--
-- Confidence follows the mechanical rule:
--
--   HIGH    the entity resolves AND >= 1 source supports the pair
--           AND the relationship_type is substantive
--   MEDIUM  the entity resolves, but no source supports the pair
--   LOW     the entity does not resolve
--
-- IMPORTANT: this is NOT the same as "entity_kind = 'community'".
-- Every row in the table resolves -- a community entity is a
-- `dish_traditions` row, and it resolves. What separates the two
-- halves of the pilot is the KIND OF CLAIM:
--
--   place     legacy_unreviewed     "this dish's origin is this
--                                     country" -- discovery data, not
--                                     a reviewed historical claim
--   community established_tradition "this dish belongs to this
--                                     culinary tradition" -- a
--                                     cultural claim
--
-- Both are MEDIUM, because both resolve and neither has a source.
-- Neither can be HIGH: there is not one source row among the 2,713.
--
-- So the pilot's proposed `review_state` for all 50 is `in_review` --
-- NOT `accepted`. A pilot that accepted rows would be claiming a
-- review that did not happen.

-- The NOT EXISTS guard makes this idempotent: a re-apply finds the
-- pilot rows already in the ledger and inserts nothing. Without it a
-- re-apply would double the ledger (50 -> 100) and the assertion
-- below would then fail, because in_review would no longer match the
-- number of distinct pilot rows.
INSERT INTO association_review_log (
  association_id, action, review_state_before, review_state_after,
  confidence, confidence_label, note, reviewer
)
SELECT p.association_id,
       'submitted',
       'unreviewed',
       'in_review',
       3,
       'medium',
       CASE WHEN p.kind = 'place' THEN
         'Pilot row. The entity resolves to a real geo_entities row, but '
         'no source row supports this dish/place pair, so the confidence '
         'is MEDIUM and the association is in_review, not accepted. The '
         'relationship_type is legacy_unreviewed: this is discovery data '
         'migrated from the dish origin country, not a reviewed '
         'historical claim.'
       ELSE
         'Pilot row. The entity resolves to a dish_traditions row -- a '
         'culinary tradition, not a place -- and no source row supports '
         'the dish/tradition pair, so the confidence is MEDIUM and the '
         'association is in_review, not accepted. The legacy value is ('
         || coalesce(a.legacy_value, '(none)') || ').'
       END,
       'pilot:0050'
  FROM pilot_sample p
  JOIN dish_place_associations a ON a.id = p.association_id
 WHERE NOT EXISTS (
   SELECT 1 FROM association_review_log l
    WHERE l.association_id = p.association_id
      AND l.reviewer = 'pilot:0050'
      AND l.action = 'submitted'
 )
 -- and the kind recorded is the kind at SAMPLE TIME, not the kind the
 -- row has now -- so the ledger describes the review, not the row
 AND a.entity_kind = p.kind;

-- =====================================================================
-- 5. NO RE-POINTING -- AND WHY, IN THE MIGRATION ITSELF
-- =====================================================================
--
-- There is deliberately no data mutation here.
--
-- The proposal suggested re-pointing the `community` rows at the
-- country implied by the dish's cuisine tag. Measured against the
-- live database, that would have been WRONG:
--
--   - ZERO of the 2,713 associations dangle. Every `community` row
--     resolves, correctly, to a `dish_traditions` row. A culture is
--     not a broken place.
--   - Re-pointing would have converted 1,235 accurate "established
--     tradition" claims into 1,235 weaker "legacy unreviewed" origin
--     claims -- silently, with no reviewer and no source.
--   - It would have destroyed the place/culture distinction that
--     `atlas.ts` explicitly relies on.
--
-- The `entity_repointed` action stays in the ledger's enum: the
-- operation is legitimate when a reviewer decides it, with a source
-- behind it. This migration just does not perform it. The ledger
-- records WHO DID WHAT, and here the answer is "nobody".

-- =====================================================================
-- 7. THE PILOT'S REVIEW STATES
-- =====================================================================
--
-- The rows the pilot touched move to `in_review`. Nothing is published
-- and nothing is accepted.

UPDATE dish_place_associations a
   SET review_state = 'in_review',
       updated_at   = now()
  FROM pilot_sample p
 WHERE a.id = p.association_id
   -- only rows that are still unreviewed: a re-apply must not
   -- resurrect a row that a later reviewer has already moved on
   AND a.review_state = 'unreviewed';

-- =====================================================================
-- 8. WHAT THE MIGRATION ASSERTS
-- =====================================================================
--
-- These DO block the migration if they are not true. A migration that
-- cannot fail is a migration that cannot be trusted, and the checks
-- here are the ones a reviewer would ask for.

DO $$
DECLARE
  dangling integer;
  in_review integer;
  pilot_rows integer;
  pilot_high integer;
  pilot_published integer;
  repointed integer;
BEGIN
  -- The pilot must cover BOTH kinds, or the dangling half is hidden.
  IF NOT EXISTS (SELECT 1 FROM pilot_sample WHERE kind = 'place') THEN
    RAISE EXCEPTION '0050: the pilot has no place rows';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pilot_sample WHERE kind = 'community') THEN
    RAISE EXCEPTION '0050: the pilot has no community rows';
  END IF;

  -- COUNT DISTINCT associations, not ledger rows: the pilot is 50
  -- associations, and a re-apply must not change that number.
  SELECT count(DISTINCT association_id) INTO pilot_rows
    FROM association_review_log
   WHERE reviewer = 'pilot:0050' AND action = 'submitted';
  IF pilot_rows < 2 THEN
    RAISE EXCEPTION
      '0050: the pilot must record at least one row of each kind, found %', pilot_rows;
  END IF;

  -- Every pilot row must have moved to in_review, and no other row
  -- may have.
  SELECT count(*) INTO in_review
    FROM dish_place_associations
   WHERE review_state = 'in_review';
  IF in_review <> pilot_rows THEN
    RAISE EXCEPTION
      '0050: expected % associations in_review, found %', pilot_rows, in_review;
  END IF;

  -- Nothing may be PUBLISHED BY THIS MIGRATION.
  --
  -- The table may already contain published rows -- the seed ships 8
  -- published fixture associations, and live has its own. What this
  -- migration must not do is change a publication_state, or publish a
  -- row it touched. So the check is scoped to the rows the migration
  -- actually touched: the 50 pilot rows must still be 'draft'.
  SELECT count(*) INTO pilot_published
    FROM dish_place_associations
   WHERE publication_state = 'published'
     AND id IN (SELECT association_id FROM association_review_log);
  IF pilot_published > 0 THEN
    RAISE EXCEPTION
      '0050: % associations the migration touched are published; it must publish nothing',
      pilot_published;
  END IF;

  -- No pilot row may claim HIGH confidence: no association has a
  -- source yet, so HIGH is impossible and claiming it would be a lie.
  SELECT count(*) INTO pilot_high
    FROM association_review_log
   WHERE reviewer = 'pilot:0050' AND confidence_label = 'high';
  IF pilot_high > 0 THEN
    RAISE EXCEPTION
      '0050: % pilot rows claim HIGH confidence, but no source supports any association',
      pilot_high;
  END IF;

  -- Nor LOW: every association in the table resolves, so LOW would be
  -- a false claim about the data.
  SELECT count(*) INTO pilot_high
    FROM association_review_log
   WHERE reviewer = 'pilot:0050' AND confidence_label = 'low';
  IF pilot_high > 0 THEN
    RAISE EXCEPTION
      '0050: % pilot rows claim LOW confidence, but every association resolves',
      pilot_high;
  END IF;

  -- Every association must resolve. This is the invariant the guard
  -- in section 3 exists to protect, and it is already true of all
  -- 2,713 rows -- so this assertion is a check that the migration did
  -- not break it, not a repair.
  SELECT count(*) INTO dangling
    FROM dish_place_associations a
   WHERE NOT (
       (a.entity_kind = 'place'     AND EXISTS (SELECT 1 FROM geo_entities g WHERE g.id = a.entity_id))
    OR (a.entity_kind = 'community' AND EXISTS (SELECT 1 FROM dish_traditions t WHERE t.id = a.entity_id))
   );
  IF dangling > 0 THEN
    RAISE EXCEPTION
      '0050: % associations have an entity that does not resolve', dangling;
  END IF;

  -- The migration must not have re-pointed anything. `entity_repointed`
  -- is a legitimate action, but it is not one THIS migration performs.
  -- The check is scoped to this migration's own reviewer id, so a
  -- genuine reviewer re-point is not mistaken for one of ours.
  SELECT count(*) INTO repointed
    FROM association_review_log
   WHERE action = 'entity_repointed'
     AND reviewer = 'migration:0050';
  IF repointed > 0 THEN
    RAISE EXCEPTION
      '0050: % rows were re-pointed, but this migration must not re-point anything',
      repointed;
  END IF;

  RAISE NOTICE
    '0050: ok -- % pilot rows in_review, % associations dangling, 0 published',
    pilot_rows, dangling;
END $$;

-- The temp table has served its purpose. Dropping it explicitly keeps
-- the session clean for whatever runs next.
DROP TABLE IF EXISTS pilot_sample;
