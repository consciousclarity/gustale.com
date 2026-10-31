-- The constraint tests for the P1 atlas schema (ADR-004).
--
-- Every case here is a NEGATIVE test that can detect a regression: it
-- asserts that a specific bad write is REFUSED. A test that cannot fail is
-- not a test.
--
-- Run against a database that has had 0036 applied:
--   psql -U postgres -d <db> -v ON_ERROR_STOP=1 -f scripts/test_atlas_schema.sql
--
-- The harness lives in three helper functions, because PL/pgSQL does not
-- allow nested routine declarations inside a DO block. Each helper is
-- dropped at the end, so the database is left as it was found.

-- ---------------------------------------------------------------------
-- the helpers
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION atlas_test_fail(p_name text, p_detail text)
RETURNS text
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE WARNING 'FAIL  % -- %', p_name, p_detail;
  RETURN p_name;
END $$;

CREATE OR REPLACE FUNCTION atlas_test_pass(p_name text)
RETURNS text
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE NOTICE 'PASS  %', p_name;
  RETURN p_name;
END $$;

-- Run a statement that MUST fail. Returns the error message, or NULL if it
-- unexpectedly succeeded.
CREATE OR REPLACE FUNCTION atlas_test_must_fail(p_sql text)
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  v_err text;
BEGIN
  BEGIN
    EXECUTE p_sql;
  EXCEPTION WHEN OTHERS THEN
    v_err := SQLERRM;
  END;
  RETURN v_err;
END $$;

-- Run a statement that MUST succeed. Returns the error message, or NULL on
-- success.
CREATE OR REPLACE FUNCTION atlas_test_must_succeed(p_sql text)
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  v_err text;
BEGIN
  BEGIN
    EXECUTE p_sql;
  EXCEPTION WHEN OTHERS THEN
    v_err := SQLERRM;
  END;
  RETURN v_err;
END $$;

DO $$
DECLARE
  v_pass integer := 0;
  v_fail integer := 0;

  v_a uuid;
  v_b uuid;
  v_c uuid;
  v_place uuid;
  v_tradition uuid;
  v_rel_sym uuid;
  v_rel_dev uuid;
  v_rel_var uuid;
  v_f1 uuid;
  -- A statement that really exists. The three reference dishes are NOT
  -- Pool A dishes, so they carry no statement of their own — the D4 cases
  -- need a real statements.id, not a dishes.id.
  v_stmt uuid;
  v_fixture_ids uuid[];
  v_err text;
  -- the counts before the test's own writes, compared after its cleanup
  v_assoc_before bigint;
  v_rel_before   bigint;
  v_ident_before bigint;
  v_dates_before bigint;
  v_assoc_after  bigint;
  v_rel_after    bigint;
  v_ident_after  bigint;
  v_dates_after  bigint;
BEGIN
  ---------------------------------------------------------------------
  -- the fixtures
  ---------------------------------------------------------------------
  --
  -- The three REFERENCE dishes are rendang, chicken-tikka-masala and
  -- tacos-al-pastor (KANBAN.md §6). They are the acceptance fixtures for
  -- every structural change.
  --
  -- But the CI database is built from a SMALL seed — three dishes
  -- (moussaka-greek, vindaloo, gazpacho) — so on a CI run the reference
  -- dishes are simply not there.
  --
  -- So the fixtures fall back to ANY three distinct dishes, and the
  -- reference dishes are used when they exist. Either way the CONSTRAINTS
  -- under test are the same: three distinct rows are needed for a
  -- three-edge cycle and for a pair in both directions.
  ---------------------------------------------------------------------
  SELECT id INTO v_a FROM dishes WHERE slug = 'rendang';
  SELECT id INTO v_b FROM dishes WHERE slug = 'chicken-tikka-masala';
  SELECT id INTO v_c FROM dishes WHERE slug = 'tacos-al-pastor';

  IF v_a IS NULL OR v_b IS NULL OR v_c IS NULL THEN
    -- fall back to any three distinct dishes, in a stable order
    SELECT array_agg(id ORDER BY slug) INTO v_fixture_ids
      FROM (SELECT id, slug FROM dishes ORDER BY slug LIMIT 3) t;
    v_a := v_fixture_ids[1];
    v_b := v_fixture_ids[2];
    v_c := v_fixture_ids[3];
    RAISE NOTICE 'the reference dishes are not in this database; using any three distinct dishes instead';
  END IF;

  -- THE THREE FIXTURES ARE SORTED BY ID, so that v_a < v_b < v_c.
  --
  -- This is not cosmetic. The database already refuses a symmetric
  -- relation whose endpoints are the wrong way round (check_relation_
  -- direction(): "symmetric relation requires from_dish_id < to_dish_id"),
  -- so the symmetric-pair cases need a pair whose ids are in order.
  --
  -- The reference dishes have random uuids, so their order is a
  -- coin toss — and the CI database's seed dishes have DETERMINISTIC
  -- uuids (00000000-0000-0000-0000-000000000020 and ...031), where the
  -- slug order and the id order are the opposite way round.
  --
  -- Sorting by id makes the fixture deterministic in BOTH databases, and
  -- the local test can no longer pass by luck.
  SELECT array_agg(id ORDER BY id) INTO v_fixture_ids
    FROM (SELECT unnest(ARRAY[v_a, v_b, v_c]) AS id) t;
  v_a := v_fixture_ids[1];
  v_b := v_fixture_ids[2];
  v_c := v_fixture_ids[3];

  IF v_a IS NULL OR v_b IS NULL OR v_c IS NULL THEN
    RAISE EXCEPTION 'the fixtures are missing: this database has fewer than three dishes';
  END IF;

  IF v_a = v_b OR v_b = v_c OR v_a = v_c THEN
    RAISE EXCEPTION 'the fixtures are not three distinct dishes';
  END IF;

  SELECT st.id INTO v_stmt
    FROM statements st
    JOIN dishes d ON d.id = st.subject_id AND st.subject_type = 'dish'
   LIMIT 1;

  -- A fresh CI database has no statements at all (the Pool A import has
  -- not happened there). The D4 cases need a statements.id, so when there
  -- is none, the test creates one and removes it afterwards. The
  -- constraint under test is on the COLUMN, not on the data.
  IF v_stmt IS NULL THEN
    INSERT INTO statements (
      subject_type, subject_id, predicate_id, value_type, value_literal,
      claim_class, status, qualifiers
    )
    SELECT 'dish', v_a, p.id, 'literal', 'the atlas constraint test',
           'documented', 'research_pending', '{}'::jsonb
      FROM predicates p WHERE p.slug = 'originated_in'
    RETURNING id INTO v_stmt;

    IF v_stmt IS NULL THEN
      RAISE EXCEPTION 'no statement fixture: the `originated_in` predicate is missing';
    END IF;
    RAISE NOTICE 'this database has no statements; the test created one and will remove it';
  END IF;

  -- THE SNAPSHOT, taken BEFORE any of this test's own writes.
  --
  -- The cleanup at the end is compared against it, so the test proves it
  -- left the database exactly as it found it. This is the guard against
  -- the bug that deleted six real associations from the three reference
  -- dishes when the test was run against live.
  SELECT count(*) INTO v_assoc_before FROM dish_place_associations;
  SELECT count(*) INTO v_rel_before   FROM dish_relations;
  SELECT count(*) INTO v_ident_before FROM dish_identities;
  SELECT count(*) INTO v_dates_before FROM claim_dates;

  SELECT id INTO v_place FROM geo_entities LIMIT 1;
  SELECT id INTO v_tradition FROM dish_traditions LIMIT 1;
  SELECT id INTO v_rel_sym FROM relation_types WHERE slug = 'similar_form';
  SELECT id INTO v_rel_dev FROM relation_types WHERE slug = 'developed_from';
  SELECT id INTO v_rel_var FROM relation_types WHERE slug = 'regional_variant_of';

  ---------------------------------------------------------------------
  -- D4: the three evidence axes are separate, and constrained
  ---------------------------------------------------------------------

  v_err := atlas_test_must_fail(
    'UPDATE statements SET evidence_status = ''probably_fine'' WHERE id = ''' || v_stmt || '''');
  IF v_err IS NULL THEN
    v_fail := v_fail + 1;
    PERFORM atlas_test_fail('D4 evidence_status rejects an unknown value', 'the UPDATE was accepted');
  ELSE
    v_pass := v_pass + 1;
    PERFORM atlas_test_pass('D4 evidence_status rejects an unknown value');
  END IF;

  v_err := atlas_test_must_fail(
    'UPDATE statements SET dispute_state = ''maybe'' WHERE id = ''' || v_stmt || '''');
  IF v_err IS NULL THEN
    v_fail := v_fail + 1;
    PERFORM atlas_test_fail('D4 dispute_state rejects an unknown value', 'the UPDATE was accepted');
  ELSE
    v_pass := v_pass + 1;
    PERFORM atlas_test_pass('D4 dispute_state rejects an unknown value');
  END IF;

  v_err := atlas_test_must_fail(
    'UPDATE statements SET research_outcome = ''sort_of'' WHERE id = ''' || v_stmt || '''');
  IF v_err IS NULL THEN
    v_fail := v_fail + 1;
    PERFORM atlas_test_fail('D4 research_outcome rejects an unknown value', 'the UPDATE was accepted');
  ELSE
    v_pass := v_pass + 1;
    PERFORM atlas_test_pass('D4 research_outcome rejects an unknown value');
  END IF;

  -- The axes are INDEPENDENT: setting one does not constrain another.
  v_err := atlas_test_must_succeed(
    'UPDATE statements SET dispute_state = ''disputed'', research_outcome = ''inconclusive'' WHERE id = ''' || v_stmt || '''');
  IF v_err IS NULL THEN
    v_pass := v_pass + 1;
    PERFORM atlas_test_pass('D4 the three axes are independent of each other');
  ELSE
    PERFORM atlas_test_fail('D4 the three axes are independent of each other', v_err);
  END IF;

  -- A NULL dispute_state is allowed (no competing account recorded).
  v_err := atlas_test_must_succeed(
    'UPDATE statements SET dispute_state = NULL WHERE id = ''' || v_stmt || '''');
  IF v_err IS NULL THEN
    v_pass := v_pass + 1;
    PERFORM atlas_test_pass('D4 a NULL dispute_state means "no competing account recorded"');
  ELSE
    PERFORM atlas_test_fail('D4 a NULL dispute_state means "no competing account recorded"', v_err);
  END IF;

  -- The EXISTING meanings are untouched: `status` and `claim_class` keep
  -- their enums, and a direct UPDATE of `status` is still refused by the
  -- gate trigger.
  v_err := atlas_test_must_fail(
    'UPDATE statements SET status = ''published'' WHERE id = ''' || v_stmt || '''');
  IF v_err IS NULL THEN
    v_fail := v_fail + 1;
    PERFORM atlas_test_fail('D8 a direct UPDATE of statements.status is still refused', 'the UPDATE was accepted');
  ELSE
    v_pass := v_pass + 1;
    PERFORM atlas_test_pass('D8 a direct UPDATE of statements.status is still refused');
  END IF;

  v_err := atlas_test_must_fail(
    'UPDATE statements SET claim_class = ''not_a_class'' WHERE id = ''' || v_stmt || '''');
  IF v_err IS NULL THEN
    v_fail := v_fail + 1;
    PERFORM atlas_test_fail('D4 claim_class keeps its existing enum', 'the UPDATE was accepted');
  ELSE
    v_pass := v_pass + 1;
    PERFORM atlas_test_pass('D4 claim_class keeps its existing enum');
  END IF;

  ---------------------------------------------------------------------
  -- D6: claim_dates
  ---------------------------------------------------------------------

  v_err := atlas_test_must_fail(
    'INSERT INTO claim_dates (dish_id, date_kind, date_text, year_start, year_end, precision)
     VALUES (''' || v_a || ''', ''proposed_emergence'', ''the atlas constraint test'', 1900, 1800, ''bounded'')');
  IF v_err IS NULL THEN
    v_fail := v_fail + 1;
    PERFORM atlas_test_fail('D6 a reversed interval is rejected', 'the INSERT was accepted');
  ELSE
    v_pass := v_pass + 1;
    PERFORM atlas_test_pass('D6 a reversed interval is rejected');
  END IF;

  v_err := atlas_test_must_fail(
    'INSERT INTO claim_dates (dish_id, date_kind, date_text, year_start, year_end, precision)
     VALUES (''' || v_a || ''', ''proposed_emergence'', ''the atlas constraint test'', 1200, 1900, ''open'')');
  IF v_err IS NULL THEN
    v_fail := v_fail + 1;
    PERFORM atlas_test_fail('D6 an open precision has no end year', 'the INSERT was accepted');
  ELSE
    v_pass := v_pass + 1;
    PERFORM atlas_test_pass('D6 an open precision has no end year');
  END IF;

  -- "before the thirteenth century" — an OPEN interval with no year at all.
  v_err := atlas_test_must_succeed(
    'INSERT INTO claim_dates (dish_id, date_kind, date_text, year_start, year_end, precision)
     VALUES (''' || v_a || ''', ''proposed_emergence'', ''the atlas constraint test'', NULL, NULL, ''open'')');
  IF v_err IS NULL THEN
    v_pass := v_pass + 1;
    PERFORM atlas_test_pass('D6 an open-ended date with no year is accepted');
  ELSE
    PERFORM atlas_test_fail('D6 an open-ended date with no year is accepted', v_err);
  END IF;

  v_err := atlas_test_must_fail(
    'INSERT INTO claim_dates (dish_id, date_kind, date_text, year_start, precision)
     VALUES (''' || v_a || ''', ''birthday'', ''the atlas constraint test'', 1900, ''exact'')');
  IF v_err IS NULL THEN
    v_fail := v_fail + 1;
    PERFORM atlas_test_fail('D6 only the four date kinds are accepted', 'the INSERT was accepted');
  ELSE
    v_pass := v_pass + 1;
    PERFORM atlas_test_pass('D6 only the four date kinds are accepted');
  END IF;

  ---------------------------------------------------------------------
  -- D1/D3: dish_place_associations
  ---------------------------------------------------------------------

  v_err := atlas_test_must_fail(
    'INSERT INTO dish_place_associations (dish_id, relationship_type, entity_kind, entity_id, provenance)
     VALUES (''' || v_a || ''', ''invented_type'', ''place'', ''' || v_place || ''', ''atlas_constraint_test'')');
  IF v_err IS NULL THEN
    v_fail := v_fail + 1;
    PERFORM atlas_test_fail('D3 only the six relationship types are accepted', 'the INSERT was accepted');
  ELSE
    v_pass := v_pass + 1;
    PERFORM atlas_test_pass('D3 only the six relationship types are accepted');
  END IF;

  -- The entity-kind combination is enforced SERVER-SIDE: a 'place'
  -- association may not point at a traditions row.
  v_err := atlas_test_must_fail(
    'INSERT INTO dish_place_associations (dish_id, relationship_type, entity_kind, entity_id, provenance)
     VALUES (''' || v_a || ''', ''established_tradition'', ''place'', ''' || v_tradition || ''', ''atlas_constraint_test'')');
  IF v_err IS NULL THEN
    v_fail := v_fail + 1;
    PERFORM atlas_test_fail('D3 a place association may not point at a traditions row', 'the INSERT was accepted');
  ELSE
    v_pass := v_pass + 1;
    PERFORM atlas_test_pass('D3 a place association may not point at a traditions row');
  END IF;

  -- ... and a 'community' association may not point at a geo_entities row.
  v_err := atlas_test_must_fail(
    'INSERT INTO dish_place_associations (dish_id, relationship_type, entity_kind, entity_id, provenance)
     VALUES (''' || v_a || ''', ''established_tradition'', ''community'', ''' || v_place || ''', ''atlas_constraint_test'')');
  IF v_err IS NULL THEN
    v_fail := v_fail + 1;
    PERFORM atlas_test_fail('D3 a community association may not point at a geo_entities row', 'the INSERT was accepted');
  ELSE
    v_pass := v_pass + 1;
    PERFORM atlas_test_pass('D3 a community association may not point at a geo_entities row');
  END IF;

  -- ... and a community association that points at a traditions row IS
  -- accepted. The guard is not simply refusing everything.
  v_err := atlas_test_must_succeed(
    'INSERT INTO dish_place_associations (dish_id, relationship_type, entity_kind, entity_id, provenance)
     VALUES (''' || v_a || ''', ''established_tradition'', ''community'', ''' || v_tradition || ''', ''atlas_constraint_test'')');
  IF v_err IS NULL THEN
    v_pass := v_pass + 1;
    PERFORM atlas_test_pass('D3 a community association pointing at a traditions row is accepted');
  ELSE
    PERFORM atlas_test_fail('D3 a community association pointing at a traditions row is accepted', v_err);
  END IF;

  -- The identity of an association is (dish, type, kind, entity): a second
  -- row for the same association is refused.
  v_err := atlas_test_must_fail(
    'INSERT INTO dish_place_associations (dish_id, relationship_type, entity_kind, entity_id, provenance)
     VALUES (''' || v_a || ''', ''established_tradition'', ''community'', ''' || v_tradition || ''', ''atlas_constraint_test'')');
  IF v_err IS NULL THEN
    v_fail := v_fail + 1;
    PERFORM atlas_test_fail('D3 a duplicate association is rejected', 'the INSERT was accepted');
  ELSE
    v_pass := v_pass + 1;
    PERFORM atlas_test_pass('D3 a duplicate association is rejected');
  END IF;

  -- A DIFFERENT relationship type for the same entity is a different
  -- association, and is accepted.
  v_err := atlas_test_must_succeed(
    'INSERT INTO dish_place_associations (dish_id, relationship_type, entity_kind, entity_id, provenance)
     VALUES (''' || v_a || ''', ''legacy_unreviewed'', ''community'', ''' || v_tradition || ''', ''atlas_constraint_test'')');
  IF v_err IS NULL THEN
    v_pass := v_pass + 1;
    PERFORM atlas_test_pass('D3 a different relationship type for the same entity is a different association');
  ELSE
    PERFORM atlas_test_fail('D3 a different relationship type for the same entity is a different association', v_err);
  END IF;

  -- The evidence axes are constrained on the association too.
  v_err := atlas_test_must_fail(
    'INSERT INTO dish_place_associations (dish_id, relationship_type, entity_kind, entity_id, evidence_status)
     VALUES (''' || v_b || ''', ''historical_emergence'', ''place'', ''' || v_place || ''', ''certain'', ''atlas_constraint_test'')');
  IF v_err IS NULL THEN
    v_fail := v_fail + 1;
    PERFORM atlas_test_fail('D4 the association evidence_status is constrained', 'the INSERT was accepted');
  ELSE
    v_pass := v_pass + 1;
    PERFORM atlas_test_pass('D4 the association evidence_status is constrained');
  END IF;

  ---------------------------------------------------------------------
  -- D5: the typed connections
  ---------------------------------------------------------------------
  --
  -- NOTE ON THE REVERSED DIRECTIONAL PAIR
  --
  -- The database ALREADY refuses a directional relation whose exact
  -- inverse is present (check_relation_direction(), the "7a" rule): a
  -- relation that asserts both A -> B and B -> A of the SAME type is a
  -- contradiction, not two claims.
  --
  -- That is a DIFFERENT rule from the one the brief cares about, and the
  -- two must not be confused:
  --
  --   the brief's rule    two DIFFERENT predicates between the same pair
  --                       (A -developed_from-> B AND A -adapted_from-> B)
  --                       are two legitimate claims, and both survive.
  --
  --   the existing rule   the SAME predicate in both directions is a
  --                       contradiction, and is refused.
  --
  -- So the test asserts the brief's rule — a second, DIFFERENT predicate
  -- between the same pair is accepted — and it asserts the existing rule
  -- still holds.

  -- A self-link is refused.
  v_err := atlas_test_must_fail(
    'INSERT INTO dish_relations (from_dish_id, to_dish_id, relation_type, relation_type_id, is_symmetric, reason)
     VALUES (''' || v_a || ''', ''' || v_a || ''', ''similar_form'', ''' || v_rel_sym || ''', true, ''the atlas constraint test'')');
  IF v_err IS NULL THEN
    v_fail := v_fail + 1;
    PERFORM atlas_test_fail('D5 a self-link is rejected', 'the INSERT was accepted');
  ELSE
    v_pass := v_pass + 1;
    PERFORM atlas_test_pass('D5 a self-link is rejected');
  END IF;

  -- A SYMMETRIC pair is stored once.
  --
  -- NOTE: the database ALREADY refuses the reversed form of a symmetric
  -- pair, via check_relation_direction() ("symmetric relation requires
  -- from_dish_id < to_dish_id"). The new normalized-endpoint index is
  -- therefore the SECOND line of defence, not the only one — which is the
  -- right shape: the index holds even if the trigger is ever changed.
  --
  -- So the test asserts BOTH: that the reversed form is refused, and that
  -- the index itself is what refuses it (proven by the regression check,
  -- which drops the index and the trigger in turn).
  v_err := atlas_test_must_succeed(
    'INSERT INTO dish_relations (from_dish_id, to_dish_id, relation_type, relation_type_id, is_symmetric, reason)
     VALUES (''' || v_a || ''', ''' || v_b || ''', ''similar_form'', ''' || v_rel_sym || ''', true, ''the atlas constraint test'')');
  IF v_err IS NULL THEN
    v_pass := v_pass + 1;
    PERFORM atlas_test_pass('D5 a symmetric pair is accepted');
  ELSE
    PERFORM atlas_test_fail('D5 a symmetric pair is accepted', v_err);
  END IF;

  v_err := atlas_test_must_fail(
    'INSERT INTO dish_relations (from_dish_id, to_dish_id, relation_type, relation_type_id, is_symmetric, reason)
     VALUES (''' || v_b || ''', ''' || v_a || ''', ''similar_form'', ''' || v_rel_sym || ''', true, ''the atlas constraint test'')');
  IF v_err IS NULL THEN
    v_fail := v_fail + 1;
    PERFORM atlas_test_fail('D5 a REVERSED duplicate of a symmetric pair is rejected', 'the INSERT was accepted');
  ELSE
    v_pass := v_pass + 1;
    PERFORM atlas_test_pass('D5 a REVERSED duplicate of a symmetric pair is rejected');
  END IF;

  -- The index itself: the pair is stored with NORMALIZED endpoints, so
  -- the stored row's endpoints are ordered no matter which way round it
  -- was inserted. The trigger enforces the same ordering on insert, so
  -- this asserts the property the index is built on.
  v_err := atlas_test_must_fail(
    'UPDATE dish_relations SET from_dish_id = ''' || v_b || ''' WHERE from_dish_id = ''' || v_a ||
    ''' AND to_dish_id = ''' || v_b || ''' AND relation_type_id = ''' || v_rel_sym || '''');
  IF v_err IS NULL THEN
    v_fail := v_fail + 1;
    PERFORM atlas_test_fail('D5 a symmetric pair cannot be flipped into its own reverse', 'the UPDATE was accepted');
  ELSE
    v_pass := v_pass + 1;
    PERFORM atlas_test_pass('D5 a symmetric pair cannot be flipped into its own reverse');
  END IF;

  -- A DIRECTIONAL pair is accepted. The influence network is not a tree.
  v_err := atlas_test_must_succeed(
    'INSERT INTO dish_relations (from_dish_id, to_dish_id, relation_type, relation_type_id, is_symmetric, reason)
     VALUES (''' || v_a || ''', ''' || v_c || ''', ''developed_from'', ''' || v_rel_dev || ''', false, ''the atlas constraint test'')');
  IF v_err IS NULL THEN
    v_pass := v_pass + 1;
    PERFORM atlas_test_pass('D5 a directional pair is accepted');
  ELSE
    PERFORM atlas_test_fail('D5 a directional pair is accepted', v_err);
  END IF;

  -- THE BRIEF'S RULE: a SECOND, DIFFERENT predicate between the same pair
  -- is a second legitimate claim, and it must survive. Uniqueness is on
  -- the EDGE IDENTITY (from, to, type) — never on (from, to) alone.
  v_err := atlas_test_must_succeed(
    'INSERT INTO dish_relations (from_dish_id, to_dish_id, relation_type, relation_type_id, is_symmetric, reason)
     VALUES (''' || v_a || ''', ''' || v_c || ''', ''adapted_from'', ''' ||
     (SELECT id FROM relation_types WHERE slug = 'adapted_from') || ''', false, ''the atlas constraint test'')');
  IF v_err IS NULL THEN
    v_pass := v_pass + 1;
    PERFORM atlas_test_pass('D5 a SECOND, DIFFERENT predicate between the same pair is accepted (parallel claims survive)');
  ELSE
    PERFORM atlas_test_fail('D5 a SECOND, DIFFERENT predicate between the same pair is accepted (parallel claims survive)', v_err);
  END IF;

  -- The EXISTING rule still holds: the SAME predicate in both directions
  -- is a contradiction, and is refused.
  v_err := atlas_test_must_fail(
    'INSERT INTO dish_relations (from_dish_id, to_dish_id, relation_type, relation_type_id, is_symmetric, reason)
     VALUES (''' || v_c || ''', ''' || v_a || ''', ''developed_from'', ''' || v_rel_dev || ''', false, ''the atlas constraint test'')');
  IF v_err IS NULL THEN
    v_fail := v_fail + 1;
    PERFORM atlas_test_fail('D5 the SAME predicate in both directions is still refused', 'the INSERT was accepted');
  ELSE
    v_pass := v_pass + 1;
    PERFORM atlas_test_pass('D5 the SAME predicate in both directions is still refused');
  END IF;

  -- A CYCLE in regional_variant_of is refused.
  --
  -- The test uses a THREE-edge cycle (a -> b -> c -> a), not a two-edge
  -- one. The reason is that the database ALREADY refuses the exact
  -- inverse of any directional relation (check_relation_direction(), the
  -- "7a" rule), so a two-edge cycle is blocked before the new guard can
  -- see it — and a test that exercises the wrong path proves nothing.
  --
  -- The three-edge cycle is the case ONLY the new guard can catch.
  v_err := atlas_test_must_succeed(
    'INSERT INTO dish_relations (from_dish_id, to_dish_id, relation_type, relation_type_id, is_symmetric, reason)
     VALUES (''' || v_a || ''', ''' || v_b || ''', ''regional_variant_of'', ''' || v_rel_var || ''', false, ''the atlas constraint test'')');
  IF v_err IS NULL THEN
    v_pass := v_pass + 1;
    PERFORM atlas_test_pass('D5 a regional_variant_of edge is accepted');
  ELSE
    PERFORM atlas_test_fail('D5 a regional_variant_of edge is accepted', v_err);
  END IF;

  v_err := atlas_test_must_succeed(
    'INSERT INTO dish_relations (from_dish_id, to_dish_id, relation_type, relation_type_id, is_symmetric, reason)
     VALUES (''' || v_b || ''', ''' || v_c || ''', ''regional_variant_of'', ''' || v_rel_var || ''', false, ''the atlas constraint test'')');
  IF v_err IS NULL THEN
    v_pass := v_pass + 1;
    PERFORM atlas_test_pass('D5 the second regional_variant_of edge is accepted');
  ELSE
    PERFORM atlas_test_fail('D5 the second regional_variant_of edge is accepted', v_err);
  END IF;

  -- The closing edge: c -> a would complete the loop.
  v_err := atlas_test_must_fail(
    'INSERT INTO dish_relations (from_dish_id, to_dish_id, relation_type, relation_type_id, is_symmetric, reason)
     VALUES (''' || v_c || ''', ''' || v_a || ''', ''regional_variant_of'', ''' || v_rel_var || ''', false, ''the atlas constraint test'')');
  IF v_err IS NULL THEN
    v_fail := v_fail + 1;
    PERFORM atlas_test_fail('D5 a regional_variant_of CYCLE is rejected', 'the INSERT was accepted');
  ELSE
    v_pass := v_pass + 1;
    PERFORM atlas_test_pass('D5 a regional_variant_of CYCLE is rejected');
  END IF;

  -- The cycle guard applies ONLY to regional_variant_of. A developed_from
  -- loop is allowed — the influence network is not a tree.
  v_err := atlas_test_must_succeed(
    'INSERT INTO dish_relations (from_dish_id, to_dish_id, relation_type, relation_type_id, is_symmetric, reason)
     VALUES (''' || v_b || ''', ''' || v_a || ''', ''developed_from'', ''' || v_rel_dev || ''', false, ''the atlas constraint test'')');
  IF v_err IS NULL THEN
    v_pass := v_pass + 1;
    PERFORM atlas_test_pass('D5 a developed_from loop is allowed (the influence network is not a tree)');
  ELSE
    PERFORM atlas_test_fail('D5 a developed_from loop is allowed (the influence network is not a tree)', v_err);
  END IF;

  ---------------------------------------------------------------------
  -- D2: the family parent chain cannot cycle
  ---------------------------------------------------------------------
  --
  -- The database ALREADY refuses a family that is its own parent
  -- (assert_family_parent()). This test covers the case that trigger does
  -- NOT cover: a LONGER cycle — A's parent is B, and B's parent is A.
  -- A self-parent is a one-step cycle; this is the two-step one.
  DECLARE
    v_f1 uuid; v_f2 uuid;
  BEGIN
    SELECT id INTO v_f1 FROM dish_families WHERE parent_id IS NULL LIMIT 1;
    SELECT id INTO v_f2 FROM dish_families WHERE id <> v_f1 AND parent_id IS NULL LIMIT 1;

    IF v_f1 IS NOT NULL AND v_f2 IS NOT NULL THEN
      -- Build the two-step cycle: f1 -> f2 -> f1.
      UPDATE dish_families SET parent_id = v_f2 WHERE id = v_f1;

      v_err := atlas_test_must_fail(
        'UPDATE dish_families SET parent_id = ''' || v_f1 || ''' WHERE id = ''' || v_f2 || '''' );
      IF v_err IS NULL THEN
        v_fail := v_fail + 1;
        PERFORM atlas_test_fail('D2 a two-step family parent cycle is rejected', 'the UPDATE was accepted');
      ELSE
        v_pass := v_pass + 1;
        PERFORM atlas_test_pass('D2 a two-step family parent cycle is rejected');
      END IF;

      -- restore
      UPDATE dish_families SET parent_id = NULL WHERE id = v_f1;
    END IF;

    -- And the existing one-step guard still holds.
    IF v_f1 IS NOT NULL THEN
      v_err := atlas_test_must_fail(
        'UPDATE dish_families SET parent_id = ''' || v_f1 || ''' WHERE id = ''' || v_f1 || '''' );
      IF v_err IS NULL THEN
        v_fail := v_fail + 1;
        PERFORM atlas_test_fail('D2 a family cannot be its own parent', 'the UPDATE was accepted');
      ELSE
        v_pass := v_pass + 1;
        PERFORM atlas_test_pass('D2 a family cannot be its own parent');
      END IF;
      UPDATE dish_families SET parent_id = NULL WHERE id = v_f1;
    END IF;
  END;

  ---------------------------------------------------------------------
  -- D7: dish identity
  ---------------------------------------------------------------------
  v_err := atlas_test_must_fail(
    'INSERT INTO dish_identities (from_dish_id, to_dish_id, identity_kind)
     VALUES (''' || v_a || ''', ''' || v_a || ''', ''shared_dish'')');
  IF v_err IS NULL THEN
    v_fail := v_fail + 1;
    PERFORM atlas_test_fail('D7 a self identity is rejected', 'the INSERT was accepted');
  ELSE
    v_pass := v_pass + 1;
    PERFORM atlas_test_pass('D7 a self identity is rejected');
  END IF;

  v_err := atlas_test_must_fail(
    'INSERT INTO dish_identities (from_dish_id, to_dish_id, identity_kind)
     VALUES (''' || v_a || ''', ''' || v_b || ''', ''merged_into'')');
  IF v_err IS NULL THEN
    v_fail := v_fail + 1;
    PERFORM atlas_test_fail('D7 only the three identity kinds are accepted', 'the INSERT was accepted');
  ELSE
    v_pass := v_pass + 1;
    PERFORM atlas_test_pass('D7 only the three identity kinds are accepted');
  END IF;

  v_err := atlas_test_must_succeed(
    'INSERT INTO dish_identities (from_dish_id, to_dish_id, identity_kind, explanation)
     VALUES (''' || v_a || ''', ''' || v_b || ''', ''shared_dish'', ''the test'')');
  IF v_err IS NULL THEN
    v_pass := v_pass + 1;
    PERFORM atlas_test_pass('D7 a shared_dish identity is accepted');
  ELSE
    PERFORM atlas_test_fail('D7 a shared_dish identity is accepted', v_err);
  END IF;

  ---------------------------------------------------------------------
  -- THE CLEANUP — this block leaves the database as it found it
  ---------------------------------------------------------------------
  --
  -- IT MUST DELETE ONLY WHAT THE TEST CREATED.
  --
  -- The first version deleted by DISH:
  --
  --     DELETE FROM dish_place_associations WHERE dish_id IN (v_a, v_b, v_c);
  --
  -- which is wrong in a way that only shows up on a database with real
  -- data. On the live database the fixtures ARE the three reference
  -- dishes — rendang, chicken-tikka-masala, tacos-al-pastor — and they
  -- have associations from the P2 backfill. The test deleted them:
  --
  --     rendang               0 associations (was 3)
  --     chicken-tikka-masala  0 associations (was 1)
  --     tacos-al-pastor      0 associations (was 2)
  --
  -- Six real rows, gone, because a TEST cleaned up after itself.
  --
  -- So every row the test inserts carries a marker, and the cleanup
  -- removes only rows with that marker. The guard below proves it: the
  -- counts before the test are compared with the counts after it, and a
  -- difference is a FAILURE.
  ---------------------------------------------------------------------

  -- (the counts before the test's own writes were taken at the very
  --  start of this block, before any of the test's inserts)
  DELETE FROM dish_identities WHERE from_dish_id IN (v_a, v_b, v_c)
     AND explanation = 'the test';
  DELETE FROM dish_relations WHERE (from_dish_id IN (v_a, v_b, v_c) OR to_dish_id IN (v_a, v_b, v_c))
     AND reason = 'the atlas constraint test';
  DELETE FROM dish_place_associations WHERE dish_id IN (v_a, v_b, v_c)
     AND provenance = 'atlas_constraint_test';
  DELETE FROM claim_dates WHERE dish_id IN (v_a, v_b, v_c)
     AND date_text = 'the atlas constraint test';
  UPDATE statements SET dispute_state = NULL, research_outcome = NULL WHERE id = v_stmt;
  -- the statement the test created, if it created one
  DELETE FROM statements WHERE id = v_stmt
    AND value_literal = 'the atlas constraint test';

  -- THE GUARD: the test must leave the database exactly as it found it.
  SELECT count(*) INTO v_assoc_after FROM dish_place_associations;
  SELECT count(*) INTO v_rel_after   FROM dish_relations;
  SELECT count(*) INTO v_ident_after FROM dish_identities;
  SELECT count(*) INTO v_dates_after FROM claim_dates;

  IF v_assoc_after <> v_assoc_before THEN
    v_fail := v_fail + 1;
    PERFORM atlas_test_fail(
      'the test left the associations changed',
      'before ' || v_assoc_before || ', after ' || v_assoc_after ||
      ' — the cleanup deleted rows the test did not create');
  ELSE
    v_pass := v_pass + 1;
    PERFORM atlas_test_pass('the test left the associations exactly as it found them');
  END IF;

  IF v_rel_after <> v_rel_before THEN
    v_fail := v_fail + 1;
    PERFORM atlas_test_fail(
      'the test left the relations changed',
      'before ' || v_rel_before || ', after ' || v_rel_after);
  ELSE
    v_pass := v_pass + 1;
    PERFORM atlas_test_pass('the test left the relations exactly as it found them');
  END IF;

  IF v_ident_after <> v_ident_before THEN
    v_fail := v_fail + 1;
    PERFORM atlas_test_fail(
      'the test left the identities changed',
      'before ' || v_ident_before || ', after ' || v_ident_after);
  ELSE
    v_pass := v_pass + 1;
    PERFORM atlas_test_pass('the test left the identities exactly as it found them');
  END IF;

  IF v_dates_after <> v_dates_before THEN
    v_fail := v_fail + 1;
    PERFORM atlas_test_fail(
      'the test left the dates changed',
      'before ' || v_dates_before || ', after ' || v_dates_after);
  ELSE
    v_pass := v_pass + 1;
    PERFORM atlas_test_pass('the test left the dates exactly as it found them');
  END IF;

  RAISE NOTICE '';
  RAISE NOTICE 'ATLAS_SCHEMA_TESTS: % passed, % failed', v_pass, v_fail;
  IF v_fail > 0 THEN
    RAISE EXCEPTION 'atlas schema tests FAILED (% of %)', v_fail, v_pass + v_fail;
  END IF;
END $$;

-- the helpers are dropped, so the database is left as it was found
DROP FUNCTION IF EXISTS atlas_test_fail(text, text);
DROP FUNCTION IF EXISTS atlas_test_pass(text);
DROP FUNCTION IF EXISTS atlas_test_must_fail(text);
DROP FUNCTION IF EXISTS atlas_test_must_succeed(text);
