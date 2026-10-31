-- 0037 — ADR-004 P2: the backfill from the legacy fields into the typed
-- place associations, and the editorial queue for what cannot be decided.
--
-- WHAT THIS DOES
--
-- It migrates the LEGACY places & traditions data into
-- `dish_place_associations` (ADR-004 §1.5), and it records what it could
-- NOT decide in an editorial queue rather than guessing.
--
-- IT IS RESTARTABLE. Every insert is ON CONFLICT DO NOTHING, so running
-- it twice produces the same rows. The `reconciliation` output is what
-- proves it.
--
-- IT IS REVERSIBLE. Every row it creates has `provenance` set to one of
-- the four legacy sources, so a single DELETE removes exactly what this
-- migration created and nothing else:
--
--     DELETE FROM dish_place_associations
--      WHERE provenance IN ('legacy_dish_cuisines', 'legacy_dish_traditions',
--                           'legacy_origin_geo_id');
--
-- THE MAPPING, AND WHY IT IS WHAT IT IS
--
-- Three legacy sources. The brief's §11 defaults apply verbatim:
--
--   1. `dish_dish_cuisines`   a national cuisine → `established_tradition`
--                              where a matching tradition row exists,
--                              otherwise `legacy_unreviewed`.
--
--   2. `dish_dish_traditions` a culinary tradition → `established_tradition`,
--                              preserving the provenance and the publication
--                              state.
--
--   3. `dishes.origin_geo_id` a Wikidata "country of origin" value → it
--                              stays S6 DISCOVERY DATA. It becomes
--                              `legacy_unreviewed` with evidence
--                              `unevidenced`, and the original value and its
--                              provenance are preserved in `legacy_value`.
--                              It is NOT promoted to `historical_emergence`
--                              because no qualifying source supports that
--                              specific historical claim.
--
-- THE CUISINE -> TRADITION MATCHING RULE
--
-- The cuisine vocabulary is national (`afghan`, `albanian`, `algerian`)
-- and the tradition vocabulary is larger and mostly suffixed
-- (`afghan-cuisine`, `albanian-cuisine`). So the match is by the
-- `-cuisine` suffix:
--
--     dish_cuisines.slug = 'algerian'
--     dish_traditions.slug = 'algerian-cuisine'   → matched
--
-- Measured on live, 2026-10-31:
--
--     246 cuisines      156 have a `-cuisine` tradition    90 do not
--     433 traditions    156 are `-cuisine` suffixed       148 are not
--
-- The 148 unsuffixed traditions are REGIONAL OR CULTURAL — `maghrebi`,
-- `levantine`, `south-indian`, `caribbean`, `tibetan`, `minangkabau`.
-- They are the genuinely interesting ones: they are a community or a
-- tradition that is not a modern country, which is exactly what ADR-004's
-- D1.4 says a community is.
--
-- So the rule is:
--
--   - a cuisine that HAS a `-cuisine` tradition → `established_tradition`
--     pointing at that tradition, `legacy_unreviewed` is NOT needed
--   - a cuisine with NO tradition → `legacy_unreviewed` pointing at the
--     PLACE (the country's geo_entities row), because the national
--     cuisine and the country are the same fact here
--   - a tradition → `established_tradition` pointing at the COMMUNITY
--
-- A COMMUNITY IS NOT A PLACE. A tradition row is a people or a culinary
-- practice; a geo_entities row is a place. The `entity_kind` column
-- carries which one, and the database refuses a mismatch.
--
-- THE AMBIGUOUS MAPPINGS
--
-- The 90 cuisines with no `-cuisine` tradition are NOT errors and NOT
-- guesses: they are national cuisines whose tradition row was never
-- created. They become `legacy_unreviewed` with their original value
-- preserved, and the editorial queue lists them so a human can decide
-- whether each needs a tradition, a place association, or both.

-- =====================================================================
-- THE EDITORIAL QUEUE
-- =====================================================================
--
-- A small table, not a file: it has to be queryable and exportable, and
-- it has to survive a restart.

CREATE TABLE IF NOT EXISTS editorial_review_queue (
  id            uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at    timestamptz NOT NULL DEFAULT now(),
  -- what kind of thing needs a decision
  category      text NOT NULL,
  -- the subject the decision is about
  subject_type  text NOT NULL,
  subject_id    uuid,
  -- the value that could not be decided, verbatim
  subject_value text,
  -- why it could not be decided
  reason        text NOT NULL,
  -- the detail, so the reviewer does not have to go and look it up
  detail        jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- the state of the review
  status        text NOT NULL DEFAULT 'open',
  reviewed_by   text,
  reviewed_at   timestamptz,
  notes         text
);

CREATE INDEX IF NOT EXISTS editorial_review_queue_status_idx ON editorial_review_queue(status);
CREATE INDEX IF NOT EXISTS editorial_review_queue_category_idx ON editorial_review_queue(category);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'editorial_review_queue_category_check'
       AND conrelid = 'editorial_review_queue'::regclass
  ) THEN
    ALTER TABLE editorial_review_queue
      ADD CONSTRAINT editorial_review_queue_category_check
      CHECK (category IN (
        'cuisine_without_tradition',   -- a national cuisine with no tradition row
        'tradition_without_cuisine',   -- a regional tradition with no national cuisine
        'ambiguous_origin',            -- a legacy origin that could be several places
        'dish_without_association',    -- a dish with no place association at all
        'unmapped_legacy_value'        -- anything else the mapping could not place
      ));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'editorial_review_queue_status_check'
       AND conrelid = 'editorial_review_queue'::regclass
  ) THEN
    ALTER TABLE editorial_review_queue
      ADD CONSTRAINT editorial_review_queue_status_check
      CHECK (status IN ('open','in_review','resolved','wontfix'));
  END IF;
END $$;

COMMENT ON TABLE editorial_review_queue IS
  'The mappings the backfill could not decide. NOT a blocking queue: the backfill completes with these in place, and a reviewer works through them afterwards (the brief''s §11 "a 10% sample in a review queue that does not block").';

-- =====================================================================
-- 1. THE TRADITIONS → `established_tradition` (a COMMUNITY)
-- =====================================================================
--
-- provenance: legacy_dish_traditions
-- entity_kind: community (a tradition is a people or a practice, not a place)
-- evidence_status: unevidenced — a legacy join carries no source
-- publication_state: draft — the public must not see these until the
--   API reads them AND the publication rule is live (ADR-004 §8.5)

INSERT INTO dish_place_associations (
  dish_id, relationship_type, entity_kind, entity_id,
  explanation, qualifiers, provenance, legacy_value,
  evidence_status, dispute_state, research_outcome,
  review_state, publication_state, created_at, updated_at
)
SELECT
  dt.dish_id,
  'established_tradition',
  'community',
  dt.value_id,
  'Migrated from the legacy dish_traditions assignment. The original value is preserved in legacy_value; this is a legacy assignment, not a reviewed claim.',
  jsonb_build_object(
    'legacyProvenance', dt.provenance,
    'legacyStatus', dt.status
  ),
  'legacy_dish_traditions',
  t.slug,
  'unevidenced',
  NULL,
  NULL,
  'unreviewed',
  'draft',
  now(),
  now()
FROM dish_dish_traditions dt
JOIN dish_traditions t ON t.id = dt.value_id
ON CONFLICT (dish_id, relationship_type, entity_kind, entity_id) DO NOTHING;

-- =====================================================================
-- 2. THE CUISINES → `established_tradition` (a COMMUNITY) or
--    `legacy_unreviewed` (a PLACE)
-- =====================================================================
--
-- WHERE a matching `-cuisine` tradition exists, the cuisine becomes a
-- tradition association pointing at that tradition.
--
-- WHERE it does not, the cuisine becomes a legacy_unreviewed association
-- pointing at the PLACE — because the national cuisine and the country
-- are the same fact in this data, and the value stays unreviewed.

INSERT INTO dish_place_associations (
  dish_id, relationship_type, entity_kind, entity_id,
  explanation, qualifiers, provenance, legacy_value,
  evidence_status, dispute_state, research_outcome,
  review_state, publication_state, created_at, updated_at
)
SELECT
  dc.dish_id,
  'established_tradition',
  'community',
  t.id,
  'Migrated from the legacy dish_cuisines assignment. The cuisine ''<cuisine>'' has a matching tradition row ''<tradition>''; the original cuisine value is preserved in legacy_value.',
  jsonb_build_object(
    'legacyCuisine', c.slug,
    'legacyProvenance', dc.provenance,
    'legacyStatus', dc.status,
    'legacyIsPrimary', dc.is_primary
  ),
  'legacy_dish_cuisines',
  c.slug,
  'unevidenced',
  NULL,
  NULL,
  'unreviewed',
  'draft',
  now(),
  now()
FROM dish_dish_cuisines dc
JOIN dish_cuisines c ON c.id = dc.value_id
JOIN dish_traditions t ON t.slug = c.slug || '-cuisine'
ON CONFLICT (dish_id, relationship_type, entity_kind, entity_id) DO NOTHING;

-- The cuisines with no `-cuisine` tradition. The entity is the PLACE the
-- cuisine is named for — the country, where the country exists in
-- geo_entities. Where the country does not exist either, the row is NOT
-- created here; it goes to the editorial queue instead, because a
-- dangling reference to nothing is not an association.

INSERT INTO dish_place_associations (
  dish_id, relationship_type, entity_kind, entity_id,
  explanation, qualifiers, provenance, legacy_value,
  evidence_status, dispute_state, research_outcome,
  review_state, publication_state, created_at, updated_at
)
SELECT
  dc.dish_id,
  'legacy_unreviewed',
  'place',
  g.id,
  'Migrated from the legacy dish_cuisines assignment. There is no tradition row for this cuisine, so the association stays unreviewed and the original cuisine value is preserved in legacy_value. It is a legacy assignment, not a reviewed claim.',
  jsonb_build_object(
    'legacyCuisine', c.slug,
    'legacyProvenance', dc.provenance,
    'legacyStatus', dc.status,
    'legacyIsPrimary', dc.is_primary
  ),
  'legacy_dish_cuisines',
  c.slug,
  'unevidenced',
  NULL,
  NULL,
  'unreviewed',
  'draft',
  now(),
  now()
FROM dish_dish_cuisines dc
JOIN dish_cuisines c ON c.id = dc.value_id
JOIN geo_entities g ON g.name = c.name OR g.name = c.slug
WHERE NOT EXISTS (
  SELECT 1 FROM dish_traditions t WHERE t.slug = c.slug || '-cuisine'
)
ON CONFLICT (dish_id, relationship_type, entity_kind, entity_id) DO NOTHING;

-- =====================================================================
-- 3. THE LEGACY ORIGIN → `legacy_unreviewed` (a PLACE)
-- =====================================================================
--
-- The Wikidata "country of origin" value stays S6 DISCOVERY DATA. It is
-- NOT promoted to `historical_emergence`, because no qualifying source
-- supports that specific historical claim — and the brief's §11 says
-- explicitly: "Wikidata-discovered 'country of origin' values (Pool A)
-- stay S6 discovery data unless independently supported."
--
-- This is the change that makes the falafel page truthful. It stops
-- saying "Origin Israel" and starts saying "Associated with Israel
-- (unreviewed)".

INSERT INTO dish_place_associations (
  dish_id, relationship_type, entity_kind, entity_id,
  explanation, qualifiers, provenance, legacy_value,
  evidence_status, dispute_state, research_outcome,
  review_state, publication_state, created_at, updated_at
)
SELECT
  d.id,
  'legacy_unreviewed',
  'place',
  g.id,
  'Migrated from the legacy origin_geo_id. This is the Wikidata ''country of origin'' value — DISCOVERY DATA, not a reviewed historical claim. It is not promoted to historical_emergence because no qualifying source supports that specific claim. The original value is preserved in legacy_value.',
  jsonb_build_object(
    'legacyOriginGeoId', d.origin_geo_id,
    'legacyOriginName', g.name,
    'legacySourceClass', 'S6'
  ),
  'legacy_origin_geo_id',
  g.name,
  'unevidenced',
  NULL,
  NULL,
  'unreviewed',
  'draft',
  now(),
  now()
FROM dishes d
JOIN geo_entities g ON g.id = d.origin_geo_id
WHERE d.origin_geo_id IS NOT NULL
ON CONFLICT (dish_id, relationship_type, entity_kind, entity_id) DO NOTHING;

-- =====================================================================
-- 4. THE EDITORIAL QUEUE — what could not be decided
-- =====================================================================

-- 4a. The cuisines with no `-cuisine` tradition. These are national
-- cuisines whose tradition row was never created. They are NOT errors:
-- they are a vocabulary gap, and a human decides whether each needs a
-- tradition, a place association, or neither.
INSERT INTO editorial_review_queue (category, subject_type, subject_id, subject_value, reason, detail)
SELECT
  'cuisine_without_tradition',
  'cuisine',
  c.id,
  c.slug,
  'This national cuisine has no matching tradition row (the tradition vocabulary names it with a ''-cuisine'' suffix). It was migrated as a legacy_unreviewed place association; a reviewer decides whether it needs a tradition, a place association, or neither.',
  jsonb_build_object(
    'cuisineSlug', c.slug,
    'cuisineName', c.name,
    'expectedTraditionSlug', c.slug || '-cuisine',
    'dishesAffected', (SELECT count(*) FROM dish_dish_cuisines dc WHERE dc.value_id = c.id)
  )
FROM dish_cuisines c
WHERE NOT EXISTS (SELECT 1 FROM dish_traditions t WHERE t.slug = c.slug || '-cuisine')
  AND NOT EXISTS (
    SELECT 1 FROM editorial_review_queue q
     WHERE q.category = 'cuisine_without_tradition'
       AND q.subject_id = c.id
       AND q.status = 'open'
  );

-- 4b. The regional traditions with no national cuisine. These are the
-- communities — maghrebi, levantine, south-indian — and they are the
-- most interesting rows in the whole backfill, because they are the
-- ones that are NOT a country.
INSERT INTO editorial_review_queue (category, subject_type, subject_id, subject_value, reason, detail)
SELECT
  'tradition_without_cuisine',
  'tradition',
  t.id,
  t.slug,
  'This is a regional or cultural tradition with no national cuisine of the same name. It is already migrated as an established_tradition association; a reviewer confirms the community is right and checks whether a place association is also needed.',
  jsonb_build_object(
    'traditionSlug', t.slug,
    'traditionName', t.name,
    'dishesAffected', (SELECT count(*) FROM dish_dish_traditions dt WHERE dt.value_id = t.id)
  )
FROM dish_traditions t
WHERE t.slug NOT LIKE '%-cuisine'
  AND NOT EXISTS (
    SELECT 1 FROM editorial_review_queue q
     WHERE q.category = 'tradition_without_cuisine'
       AND q.subject_id = t.id
       AND q.status = 'open'
  );

-- 4c. The dishes with NO place association at all. Every published dish
-- should be associated with somewhere; a dish with none is either a gap
-- in the legacy data or a dish whose place is genuinely unknown.
INSERT INTO editorial_review_queue (category, subject_type, subject_id, subject_value, reason, detail)
SELECT
  'dish_without_association',
  'dish',
  d.id,
  d.slug,
  'This dish has no place association after the backfill. Either the legacy data has no place for it, or its place is genuinely unknown — which is a legitimate answer, but it should be a recorded one.',
  jsonb_build_object(
    'dishSlug', d.slug,
    'hasLegacyOrigin', d.origin_geo_id IS NOT NULL,
    'hasLegacyCuisine', EXISTS (SELECT 1 FROM dish_dish_cuisines dc WHERE dc.dish_id = d.id),
    'hasLegacyTradition', EXISTS (SELECT 1 FROM dish_dish_traditions dt WHERE dt.dish_id = d.id)
  )
FROM dishes d
WHERE d.status = 'published'
  AND NOT EXISTS (
    SELECT 1 FROM dish_place_associations a WHERE a.dish_id = d.id
  )
  AND NOT EXISTS (
    SELECT 1 FROM editorial_review_queue q
     WHERE q.category = 'dish_without_association'
       AND q.subject_id = d.id
       AND q.status = 'open'
  );

-- =====================================================================
-- THE RECONCILIATION REPORT
-- =====================================================================
--
-- Every number the brief's §11 asks for, read back from the database
-- after the writes. The EXPECTED values are asserted, so the migration
-- fails BEFORE it is trusted if the outcome is not what it should be.

DO $$
DECLARE
  v_traditions  bigint;
  v_cuisines_tr bigint;
  v_cuisines_pl bigint;
  v_origins     bigint;
  v_total       bigint;
  v_queue       bigint;
  v_dishes      bigint;
  v_with_assoc  bigint;
  v_without     bigint;
  v_expected_tr bigint;
  v_expected_ct bigint;
  v_expected_cp bigint;
  v_expected_or bigint;
BEGIN
  SELECT count(*) INTO v_traditions FROM dish_place_associations
   WHERE provenance = 'legacy_dish_traditions';
  SELECT count(*) INTO v_cuisines_tr FROM dish_place_associations
   WHERE provenance = 'legacy_dish_cuisines' AND relationship_type = 'established_tradition';
  SELECT count(*) INTO v_cuisines_pl FROM dish_place_associations
   WHERE provenance = 'legacy_dish_cuisines' AND relationship_type = 'legacy_unreviewed';
  SELECT count(*) INTO v_origins FROM dish_place_associations
   WHERE provenance = 'legacy_origin_geo_id';
  SELECT count(*) INTO v_total FROM dish_place_associations;
  SELECT count(*) INTO v_queue FROM editorial_review_queue WHERE status = 'open';

  SELECT count(*) INTO v_dishes FROM dishes WHERE status = 'published';
  -- the count of PUBLISHED dishes that have an association, so the
  -- comparison below is like for like (the draft dish has one too, and
  -- counting it made the difference go negative)
  SELECT count(*) INTO v_with_assoc FROM (
    SELECT DISTINCT a.dish_id
      FROM dish_place_associations a
      JOIN dishes d ON d.id = a.dish_id
     WHERE d.status = 'published'
  ) x;
  SELECT count(*) INTO v_without FROM editorial_review_queue
   WHERE category = 'dish_without_association' AND status = 'open';

  -- The expected counts, computed from the LEGACY tables.
  --
  -- The origin count is a DISTINCT (dish, entity) count, not a row count,
  -- because the identity of an association is (dish, relationship, kind,
  -- entity). Five dishes have a legacy origin that is ALSO the place of
  -- their legacy cuisine — Hong Kong (ham-and-egg-bun, snow-skin-
  -- mooncake), Luxembourg (verwurelter), Jersey (nier-beurre) and the
  -- Democratic Republic of the Congo (babute). Those are the SAME
  -- association seen twice, so the backfill keeps one, as it must.
  --
  -- The first version of this assertion counted rows and expected 1475,
  -- and the migration FAILED with "the legacy origin associations are
  -- 1470 but 1475 were expected". The assertion was wrong, not the data:
  -- a duplicate association is not a lost one.
  SELECT count(*) INTO v_expected_tr FROM dish_dish_traditions;
  SELECT count(*) INTO v_expected_ct FROM dish_dish_cuisines dc
   JOIN dish_cuisines c ON c.id = dc.value_id
   JOIN dish_traditions t ON t.slug = c.slug || '-cuisine';
  SELECT count(*) INTO v_expected_cp FROM dish_dish_cuisines dc
   JOIN dish_cuisines c ON c.id = dc.value_id
   JOIN geo_entities g ON g.name = c.name OR g.name = c.slug
   WHERE NOT EXISTS (SELECT 1 FROM dish_traditions t WHERE t.slug = c.slug || '-cuisine');
  --
  -- The origin rows that are actually INSERTED are the ones whose
  -- (dish, legacy_unreviewed, place, origin_geo_id) identity is not
  -- already taken by a cuisine-as-place row. The five dishes whose
  -- legacy origin is also the place of their legacy cuisine resolve to
  -- the same association, so the cuisine row wins (it was inserted
  -- first) and the origin row is a no-op.
  --
  -- So the expected count is the count of DISTINCT associations, which is
  -- what the ON CONFLICT clause actually produces.
  --
  -- The rows INSERTED with provenance 'legacy_origin_geo_id' are the
  -- origin (dish, entity) pairs whose identity is NOT already taken by a
  -- cuisine-as-place row. The five dishes whose legacy origin is also the
  -- place of their legacy cuisine resolve to the same association, so the
  -- cuisine row wins (it was inserted first) and the origin insert is a
  -- no-op.
  SELECT count(*) INTO v_expected_or
    FROM dishes d
   WHERE d.origin_geo_id IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM dish_dish_cuisines dc
         JOIN dish_cuisines c ON c.id = dc.value_id
         JOIN geo_entities g ON g.name = c.name OR g.name = c.slug
        WHERE dc.dish_id = d.id
          AND g.id = d.origin_geo_id
          AND NOT EXISTS (SELECT 1 FROM dish_traditions t WHERE t.slug = c.slug || '-cuisine')
     );

  RAISE NOTICE '=== the backfill ===';
  RAISE NOTICE '  traditions  -> established_tradition (community): % (expected %)',
    v_traditions, v_expected_tr;
  RAISE NOTICE '  cuisines    -> established_tradition (community): % (expected %)',
    v_cuisines_tr, v_expected_ct;
  RAISE NOTICE '  cuisines    -> legacy_unreviewed (place):        % (expected %)',
    v_cuisines_pl, v_expected_cp;
  RAISE NOTICE '  legacy origin -> legacy_unreviewed (place):      % (expected %)',
    v_origins, v_expected_or;
  RAISE NOTICE '    (the origin count is a DISTINCT (dish, entity) count: five dishes have a legacy origin that is also the place of their legacy cuisine — the same association seen twice, kept once)';
  RAISE NOTICE '  the dishes whose origin and cuisine resolve to the same place: %',
    (SELECT count(*) FROM dishes d
      WHERE d.origin_geo_id IS NOT NULL
        AND EXISTS (SELECT 1 FROM dish_place_associations a
                     WHERE a.dish_id = d.id AND a.entity_id = d.origin_geo_id
                       AND a.entity_kind = 'place'));
  RAISE NOTICE '  the total: %', v_total;
  RAISE NOTICE '';
  RAISE NOTICE '=== the reconciliation ===';
  RAISE NOTICE '  published dishes:      %', v_dishes;
  RAISE NOTICE '  with an association:   %', v_with_assoc;
  RAISE NOTICE '  without one (queued):  %', v_without;
  RAISE NOTICE '  the editorial queue:   % open', v_queue;
  RAISE NOTICE '';
  RAISE NOTICE '=== the assertions ===';

  IF v_traditions <> v_expected_tr THEN
    RAISE EXCEPTION 'the tradition associations are % but % were expected', v_traditions, v_expected_tr;
  END IF;
  IF v_cuisines_tr <> v_expected_ct THEN
    RAISE EXCEPTION 'the cuisine-as-tradition associations are % but % were expected', v_cuisines_tr, v_expected_ct;
  END IF;
  IF v_cuisines_pl <> v_expected_cp THEN
    RAISE EXCEPTION 'the cuisine-as-place associations are % but % were expected', v_cuisines_pl, v_expected_cp;
  END IF;
  IF v_origins <> v_expected_or THEN
    RAISE EXCEPTION 'the legacy origin associations are % but % were expected', v_origins, v_expected_or;
  END IF;
  -- EVERY published dish must have at least one association, OR be in the
  -- queue saying why it does not. A dish that is neither is a silent gap.
  IF v_without <> (v_dishes - v_with_assoc) THEN
    RAISE EXCEPTION
      'the queue says % dishes have no association, but % published dishes are unassociated',
      v_without, v_dishes - v_with_assoc;
  END IF;

  RAISE NOTICE '  every count matches the legacy tables';
  RAISE NOTICE '  every published dish has an association, or is queued saying why it does not';
  RAISE NOTICE '';
  RAISE NOTICE 'ATLAS_BACKFILL_OK=1';
END $$;
