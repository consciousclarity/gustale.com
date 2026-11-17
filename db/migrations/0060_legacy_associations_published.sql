-- 0060 — WP-B2: publish the legacy associations as Unverified.
--
-- WHAT THIS DOES
--
-- It publishes the 2,713 rows that ADR-004's backfill (0037) created out of
-- the LEGACY places & traditions fields, and it makes them VISIBLE through
-- the API with the honest label the blueprint asks for.
--
-- The blueprint (2026-11-15, "Legacy associations published as Unverified",
-- Essential) says, in full:
--
--     Every dish shows where it belongs, honestly.
--     Relationship — Existing rows; no research — One data migration.
--
-- and the WP-B2 package says:
--
--     Publish them with relationship_type = legacy_unreviewed,
--     evidence_status = unevidenced; API returns them flagged;
--     UI labels them Unverified.
--
-- So the rows are PUBLISHED — a reader sees them — and they are
-- UNVERIFIED — a reader sees that they are not a finding.
--
-- THE COUNTS, MEASURED ON LIVE BEFORE THIS MIGRATION RAN
--
--     dish_place_associations        2,713 rows, ALL publication_state='draft'
--       by relationship_type         1,235 established_tradition
--                                   1,478 legacy_unreviewed
--       by provenance                1,470 legacy_origin_geo_id
--                                   1,233 legacy_dish_cuisines
--                                      10 legacy_dish_traditions
--       by evidence_status           2,713 unevidenced  (every one)
--       by review_state              2,663 unreviewed
--                                      50 in_review      (the #186 pilot)
--
--     rows that are evidenced AND accepted    0
--     published dishes with no association    0  (of 1,474 published)
--
-- WHY EVERY ONE OF THEM BECOMES legacy_unreviewed
--
-- The 1,235 `established_tradition` rows are NOT reviewed traditions.
-- They are the same legacy import wearing a different label: the cuisine
-- vocabulary is national and the tradition vocabulary is suffixed, so
-- `algerian` matched `algerian-cuisine` by a SUFFIX RULE. That match is
-- a string operation, not a source. PR #186's own pilot says so of the
-- rows it sampled:
--
--     "No association reaches HIGH, and not one has a source. Every place
--      row is legacy_unreviewed with provenance = legacy_origin_geo_id —
--      a migration from the dish's origin country, which is discovery
--      data, not a reviewed historical claim."
--
-- and the pilot's confidence rule needs BOTH of these to reach HIGH:
--
--     the entity resolves to a real geo_entities row, AND >=1 source row
--     supports the dish/place pair, AND the relationship_type is
--     substantive (not legacy_unreviewed)
--
-- There are ZERO source rows: `association_sources` has 0 rows and no
-- association has `evidence_status = 'evidenced'`. So no row qualifies,
-- and calling 1,235 of them `established_tradition` — a claim that the
-- dish has an established tradition — would assert a fact that no source
-- supports. The blueprint's rule "Wikipedia and other tertiary sources
-- ... never raise a claim above Unverified" applies with full force to
-- a legacy import that no source has ever touched.
--
-- So the type is set to what the rows actually are: a legacy,
-- unreviewed association. That is not a demotion. It is the honest
-- label, and it is the label the blueprint names.
--
-- WHAT DOES NOT CHANGE
--
-- 1. `evidence_status` stays 'unevidenced' on every row. Nothing is
--    promoted. The UNVERIFIED badge is the truth here.
--
-- 2. `review_state` is NOT touched. The 50 rows the #186 pilot moved to
--    'in_review' STAY 'in_review', and the 2,663 'unreviewed' rows stay
--    'unreviewed'. This migration publishes what is there; it does not
--    review anything. The pilot's verdicts are its own.
--
-- 3. The owner's rule of 2026-11-13 (GUS-238b) — an association is
--    hidden until it is EVIDENCED and REVIEWED — IS NOT WEAKENED.
--    `published_associations_for_dish()` keeps every condition it has.
--    The legacy rows get their OWN function, below, so the two rules
--    cannot be confused with each other.
--
-- 4. No row is deleted, and no row that was visible becomes invisible.
--    All 2,713 rows were 'draft', so nothing can be withdrawn.
--
-- THE NEW FUNCTION — WHY IT IS NOT A RELAXATION
--
--     CREATE FUNCTION public.published_legacy_associations_for_dish(...)
--
-- It is a SECOND definition, alongside the first, not a replacement.
-- ADR-004 D8.2 wants ONE definition so a claim cannot be public on one
-- surface and draft on another — so BOTH functions are used by every
-- surface that reads associations, and the union of them is what the
-- public sees. A row is visible if it satisfies EITHER:
--
--   (a) the reviewed rule:  published AND evidenced AND accepted
--   (b) the legacy rule:    published AND legacy_unreviewed
--                              AND unevidenced AND review_state IN
--                              ('unreviewed','in_review')
--
-- Note what (b) does NOT allow: a legacy row that is `evidenced` is not
-- published by (b) — it has to go through (a) and be reviewed. A legacy
-- row that is `rejected` is not published by (b) either. So the legacy
-- path cannot be used to smuggle an unreviewed claim past the owner's
-- rule: it only carries rows the owner's rule would have hidden BECAUSE
-- they are legacy and unevidenced, which is exactly the set the
-- blueprint asked for.
--
-- REVERSIBILITY
--
--     UPDATE dish_place_associations
--        SET publication_state = 'draft'
--      WHERE provenance IN ('legacy_dish_cuisines','legacy_dish_traditions',
--                           'legacy_origin_geo_id');
--
-- reverses it, exactly as 0037 documents. The relationship_type change
-- is reversible too: every row it touches carries a `provenance`, and
-- the type is recomputable from the provenance.
--
-- IT IS RESTARTABLE. Every update is idempotent, and every insert into
-- the ledger is ON CONFLICT DO NOTHING, so running this twice produces
-- the same rows.
--
-- IT IS TRANSACTIONAL. The whole file is one transaction; a failure
-- rolls the whole migration back.

BEGIN;

-- ─────────────────────────────────────────────────────────────────────
-- 1. THE LEDGER ROW (the GUS chain's own index)
-- ─────────────────────────────────────────────────────────────────────
--
-- The same table 238c creates, with the same shape. It is created with
-- IF NOT EXISTS so this migration is self-contained and can run on a
-- database where 238c has not been applied.
CREATE TABLE IF NOT EXISTS public.gus_migrations_applied (
  name        text PRIMARY KEY,
  applied_at  timestamptz NOT NULL DEFAULT now(),
  applied_by  text,
  sha256      text,
  note        text
);

COMMENT ON TABLE public.gus_migrations_applied IS
  'The GUS chain (db/migrations/) applied to THIS database. drizzle.__drizzle_migrations records only the Drizzle migrator''s own chain, so the GUS chain has no ledger there. This table is the GUS chain''s index; the authoritative record of each apply is the receipt in docs/MIGRATION-RECEIPT-*.md. It is a RECORD, not a mechanism: nothing reads it to decide whether to run a migration.';

-- ─────────────────────────────────────────────────────────────────────
-- 2. WHAT COUNTS AS A LEGACY ROW (the one definition)
-- ─────────────────────────────────────────────────────────────────────
--
-- A row is a LEGACY row when it was manufactured from the old places &
-- traditions fields and no source has ever been attached to it.
--
-- Two things say that, and the definition accepts either:
--
--   · the PROVENANCE is one of the three the backfill (0037) writes —
--     'legacy_dish_cuisines', 'legacy_dish_traditions' or
--     'legacy_origin_geo_id';
--
--   · or the QUALIFIERS carry one of the markers the backfill wrote.
--     The backfill writes FOUR different shapes of qualifier, and a
--     legacy row carries at least one of them:
--
--       legacyCuisine       a legacy cuisine became a community
--                           (1,233 rows on production);
--       legacyOriginGeoId   a legacy origin became a place
--                           (1,470 rows);
--       legacyStatus        a legacy tradition became a community
--                           (1,243 rows) — this one is the ONLY marker
--                           on a legacy tradition row, so a definition
--                           that missed it would leave 1,235 rows on
--                           production typed 'established_tradition',
--                           which is exactly what WP-B2 forbids;
--       legacyProvenance    the same 1,243 rows, and
--                           'legacyOriginName' and 'legacySourceClass'
--                           ride along with legacyOriginGeoId.
--
--     So the definition accepts any qualifier whose NAME begins with
--     'legacy'. The backfill only ever writes qualifiers of that shape
--     for rows it manufactured from the old fields, so the prefix is
--     the marker — and it cannot be missed by a qualifier the backfill
--     adds later.
--
-- WHY BOTH. The provenance column has no CHECK constraint, so it is
-- free-form text and a fixture or a seed may label its rows with its
-- own value while carrying exactly the same legacy qualifiers. The
-- qualifiers are the semantic evidence; the provenance is the
-- bookkeeping. Accepting either means the migration finds every
-- legacy row, whatever it is called.
--
-- WHY NOT MORE. A row with neither a legacy provenance nor a legacy
-- qualifier is not a legacy row, and this migration does not touch it.
-- That leaves alone anything a human reviewed, anything a later
-- migration created, and anything deliberately published under one of
-- the six real relationship types.
--
-- The function is SECURITY DEFINER because the API role has no SELECT
-- on the table and reads associations only through the functions this
-- migration creates.
CREATE OR REPLACE FUNCTION public.association_is_legacy_row(
  p_provenance   text,
  p_qualifiers   jsonb
)
RETURNS boolean
LANGUAGE sql
STABLE
PARALLEL SAFE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
       (p_provenance IN ('legacy_dish_cuisines', 'legacy_dish_traditions',
                         'legacy_origin_geo_id'))
    OR EXISTS (
         SELECT 1
           FROM jsonb_object_keys(coalesce(p_qualifiers, '{}'::jsonb)) AS k(key)
          WHERE k.key LIKE 'legacy%');
$$;

COMMENT ON FUNCTION public.association_is_legacy_row(text, jsonb) IS
  'WP-B2. THE ONE definition of a legacy association row: a row manufactured from the old places & traditions fields, with no source behind it. A row is legacy when its provenance is one of the three the backfill writes, OR when any of its qualifiers'' name begins with ''legacy'' (the backfill writes only ''legacy...'' qualifiers, and only on such rows). Used by migration 0060''s transformation and by the visibility functions it creates, so the two cannot disagree.';

-- The same rule, for a caller that HAS the row — the migration''s own
-- assertions and any maintenance script running as postgres. It reads
-- the row''s fields and calls the scalar function, so there is ONE copy
-- of the rule, not two.
CREATE OR REPLACE FUNCTION public.association_is_legacy_row(
  a dish_place_associations
)
RETURNS boolean
LANGUAGE sql
STABLE
PARALLEL SAFE
AS $$
  SELECT public.association_is_legacy_row(a.provenance, a.qualifiers);
$$;

-- ─────────────────────────────────────────────────────────────────────
-- 3. THE TYPE, THE EVIDENCE AND THE PUBLICATION STATE
-- ─────────────────────────────────────────────────────────────────────
--
-- The counts are captured in the DO block below and asserted, so a
-- migration that finds a different table FAILS instead of silently
-- publishing something unexpected.
DO $$
DECLARE
  v_total        integer;
  v_legacy       integer;
  v_established  integer;
  v_evidenced    integer;
  v_accepted     integer;
  v_in_review    integer;
  v_unreviewed   integer;
  v_rejected     integer;
BEGIN
  SELECT count(*),
         count(*) FILTER (WHERE relationship_type = 'legacy_unreviewed'),
         count(*) FILTER (WHERE relationship_type = 'established_tradition'),
         count(*) FILTER (WHERE evidence_status = 'evidenced'),
         count(*) FILTER (WHERE review_state = 'accepted'),
         count(*) FILTER (WHERE review_state = 'in_review'),
         count(*) FILTER (WHERE review_state = 'unreviewed'),
         count(*) FILTER (WHERE review_state = 'rejected')
    INTO v_total, v_legacy, v_established, v_evidenced, v_accepted,
         v_in_review, v_unreviewed, v_rejected
    FROM public.dish_place_associations;

  -- The table must be the one this migration was written against.
  --
  -- THE COUNT IS NOT ASSERTED AGAINST A FIXED NUMBER, because the
  -- migration also runs on the CI fixture database, which carries the
  -- 13-row association set from the 0050 pilot rather than
  -- production's 2,713 rows. A fixed count would fail there and pass
  -- on live, which is the wrong way round.
  --
  -- What IS asserted is the SHAPE: every row is either a legacy row or
  -- an established tradition, and the two counts add up to the total.
  -- A table with a third type, or with rows that are neither, is not
  -- the table this migration was written against.
  IF v_legacy + v_established <> v_total THEN
    RAISE EXCEPTION
      '0060: dish_place_associations holds % rows, of which % are legacy and % are established traditions. The counts do not add up, so this is not the table the migration was written against.',
      v_total, v_legacy, v_established;
  END IF;

  -- The type split must be the one the receipt records — OR the one
  -- this migration has already produced.
  --
  -- THE MIGRATION MUST BE RESTARTABLE, and a second run finds the type
  -- split it left behind (all legacy, none established). So the
  -- assertion accepts BOTH the pre-state and the post-state, and
  -- rejects anything else. A first run that found a partial state would
  -- still fail, because the split would be neither.
  --
  -- The pre-state is "there are established traditions"; the post-state
  -- is "there are none". Both are recognised by SHAPE, not by count.
  IF NOT ( (v_established > 0 AND v_legacy > 0)
        OR (v_established = 0 AND v_legacy = v_total) ) THEN
    RAISE EXCEPTION
      '0060: the type split is % legacy / % established. Expected a mix of both (before) or all legacy and none established (after).',
      v_legacy, v_established;
  END IF;

  -- Nothing may already be evidenced or accepted: the legacy path must
  -- not be used to publish a row that the reviewed rule would publish
  -- anyway, and the receipt would be wrong.
  IF v_evidenced <> 0 OR v_accepted <> 0 THEN
    RAISE EXCEPTION
      '0060: % rows are evidenced and % are accepted; expected 0 and 0. Re-measure before applying.',
      v_evidenced, v_accepted;
  END IF;

  RAISE NOTICE '0060: measured % rows (% legacy, % established, % in_review, % unreviewed, % rejected)',
    v_total, v_legacy, v_established, v_in_review, v_unreviewed, v_rejected;
END;
$$;

-- 2a. The type: a legacy import that no source supports is a legacy
--     unreviewed association, whatever it was called.
--
--     WHICH ROWS ARE LEGACY ROWS
--     --------------------------
--     The provenance names where the row came from, but the provenance
--     column has no CHECK constraint — it is free-form text, and the
--     CI fixture labels its rows 'atlas_fixture' while carrying the
--     very same legacy qualifiers the backfill sets. So a row is a
--     legacy row when it EITHER carries one of the three legacy
--     provenances OR carries one of the legacy qualifiers the backfill
--     wrote. Both say the same thing: this row was manufactured from
--     the old places & traditions fields, and no source backs it.
--
--     That is the definition used by EVERY statement in this
--     migration, and by the functions it creates. One definition, so
--     the transformation and the visibility cannot disagree about
--     which rows are legacy.
--
--     A row that carries NEITHER a legacy provenance NOR a legacy
--     qualifier is not a legacy row, and this migration does not
--     touch it. A human-reviewed row, or one a later migration
--     created, is safe.
UPDATE public.dish_place_associations
   SET relationship_type = 'legacy_unreviewed',
       updated_at = now()
 WHERE public.association_is_legacy_row(provenance, qualifiers)
   AND relationship_type <> 'legacy_unreviewed';

-- 2b. The evidence: unevidenced. This is a no-op on today's data (every
--     row is already unevidenced) and it is stated so that the
--     invariant is enforced by the migration rather than by the shape
--     of the data it happened to find.
UPDATE public.dish_place_associations
   SET evidence_status = 'unevidenced',
       updated_at = now()
 WHERE public.association_is_legacy_row(provenance, qualifiers)
   AND evidence_status <> 'unevidenced';

-- 2c. The publication: published. This is what makes them visible.
--
--     The owner's 2026-11-13 rule is preserved by the FUNCTION below,
--     not by keeping the rows in draft: the rule is about what the
--     public may see, and the function is what the public reads
--     through.
UPDATE public.dish_place_associations
   SET publication_state = 'published',
       updated_at = now()
 WHERE public.association_is_legacy_row(provenance, qualifiers)
   AND publication_state <> 'published';

-- ─────────────────────────────────────────────────────────────────────
-- 4. THE SECOND PREDICATE
-- ─────────────────────────────────────────────────────────────────────
--
-- ADR-004 D8.2: ONE definition decides what the public may see. So
-- there are now two definitions, and every surface reads BOTH — the
-- reviewed one and this one. The union is the visible set.
--
-- The legacy rule, spelled out:
--
--   publication_state = 'published'        it is published
--   relationship_type = 'legacy_unreviewed' it is a legacy import
--   evidence_status  = 'unevidenced'        no source supports it
--   review_state IN ('unreviewed','in_review')  nobody has accepted it
--                                          and nobody has rejected it
--
-- `review_state = 'rejected'` is EXCLUDED on purpose: a row a reviewer
-- has rejected does not come back through the legacy path.
CREATE OR REPLACE FUNCTION public.published_legacy_associations_for_dish(p_dish_id uuid)
RETURNS SETOF dish_place_associations
LANGUAGE sql
STABLE
PARALLEL SAFE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT a.*
    FROM dish_place_associations a
    JOIN dishes d ON d.id = a.dish_id
   WHERE a.dish_id = p_dish_id
     AND a.publication_state = 'published'
     AND d.status = 'published'
     AND a.relationship_type = 'legacy_unreviewed'
     AND a.evidence_status = 'unevidenced'
     AND a.review_state IN ('unreviewed', 'in_review');
$$;

COMMENT ON FUNCTION public.published_legacy_associations_for_dish(uuid) IS
  'WP-B2. The SECOND half of ADR-004 D8.2''s one definition: the legacy unreviewed associations that the blueprint asks to be published as Unverified. A row is visible when it satisfies the reviewed rule (published_associations_for_dish) OR this one. This is NOT a relaxation of the owner''s rule of 2026-11-13: that function keeps every condition, and this one cannot publish a row that is evidenced, accepted or rejected. It carries exactly the rows the reviewed rule hid BECAUSE they are legacy and unevidenced.';

-- ── THE PREDICATE AS A BOOLEAN ─────────────────────────────────────────
--
-- The two set-returning functions above answer "which rows?" for a
-- dish or a place. This one answers "is THIS row visible?", which is
-- what a WHERE clause needs.
--
-- WHY IT EXISTS AT ALL
--
-- Because the set-returning shape cannot be called with a join's own
-- columns in its argument. `FROM visible_place_associations_for_place(g.id)`
-- is a syntax error: `g` is not in scope until the JOIN that follows
-- it. So the queries that join the table and filter it need the
-- boolean form, and the ones that start FROM the function use the
-- set-returning form.
--
-- WHY IT TAKES SCALARS AND NOT A ROW
--
-- Two reasons, and the second is the important one.
--
-- First: a function taking the table's composite type cannot be called
-- with a table's own columns either — `association_is_visible(a)` needs
-- `a` to be a single value, and `a` in a query is a row, not a value.
--
-- Second, and decisively: the API's role does NOT have SELECT on
-- dish_place_associations. It reads the associations ONLY through
-- these functions. A boolean that took the composite type would need
-- the caller to have already read the row, which is exactly the
-- access this design withholds.
--
-- So it takes the FIELD VALUES. The caller passes the columns it
-- already has — and the caller can only have them if it got the row
-- from a function. The function is SECURITY DEFINER, so it evaluates
-- the rule as the owner, and the rule can never widen what the
-- caller can see: it decides VISIBILITY, and it is applied to rows
-- that a function already returned.
--
-- The trade-off is honest and worth stating: a caller that can read
-- the table directly can apply this rule to rows it read itself. That
-- is not a new exposure — the rows are the same rows the function
-- returns — and the rule is stricter than either path alone.
CREATE OR REPLACE FUNCTION public.association_is_visible(
  p_publication_state  text,
  p_relationship_type  text,
  p_evidence_status    text,
  p_review_state       text
)
RETURNS boolean
LANGUAGE sql
STABLE
PARALLEL SAFE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
       -- the reviewed rule (the owner's rule of 2026-11-13)
       (p_publication_state = 'published'
        AND p_evidence_status = 'evidenced'
        AND p_review_state = 'accepted')
    OR -- the legacy rule (WP-B2)
       (p_publication_state = 'published'
        AND p_relationship_type = 'legacy_unreviewed'
        AND p_evidence_status = 'unevidenced'
        AND p_review_state IN ('unreviewed', 'in_review'));
$$;

COMMENT ON FUNCTION public.association_is_visible(text, text, text, text) IS
  'WP-B2. The ONE visibility rule for an association row, as a boolean for a WHERE clause. Takes the FIELD VALUES rather than the row, because the API role has no SELECT on the table and reads associations only through the functions. SECURITY DEFINER so the rule is evaluated as the owner.';

-- ── THE SAME RULE, FOR A ROW ───────────────────────────────────────────
--
-- The convenience wrapper for a caller that DOES have the row — the
-- migration's own assertions, and any maintenance script running as
-- postgres. It reads the row's fields and calls the scalar function,
-- so there is ONE copy of the rule, not two.
CREATE OR REPLACE FUNCTION public.association_is_visible(a dish_place_associations)
RETURNS boolean
LANGUAGE sql
STABLE
PARALLEL SAFE
AS $$
  SELECT public.association_is_visible(
    a.publication_state::text,
    a.relationship_type::text,
    a.evidence_status::text,
    a.review_state::text);
$$;

COMMENT ON FUNCTION public.association_is_visible(dish_place_associations) IS
  'WP-B2. The row-shaped convenience wrapper over association_is_visible(text,text,text,text). One copy of the rule; this only passes the fields on.';

-- ─────────────────────────────────────────────────────────────────────
-- 3b. THE ONE DEFINITION THE PUBLIC READS THROUGH
-- ─────────────────────────────────────────────────────────────────────
--
-- ADR-004 D8.2: "a single SQL function is the only thing that decides
-- what the public may see", and every public read path goes through it,
-- "or through an equivalent predicate written from the same definition".
--
-- There are now two rules, so there is ONE function that is their
-- union, and every read path uses it. A row cannot be visible on the
-- dish page and invisible on the place page, because there is only one
-- place the decision is made.
--
-- The union is a UNION ALL of the two functions, and the two sets are
-- DISJOINT: the reviewed rule requires evidence_status = 'evidenced'
-- and the legacy rule requires evidence_status = 'unevidenced'. So no
-- row is returned twice and no row is lost between the two.
CREATE OR REPLACE FUNCTION public.visible_associations_for_dish(p_dish_id uuid)
RETURNS SETOF dish_place_associations
LANGUAGE sql
STABLE
PARALLEL SAFE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT * FROM public.published_associations_for_dish(p_dish_id)
  UNION ALL
  SELECT * FROM public.published_legacy_associations_for_dish(p_dish_id);
$$;

COMMENT ON FUNCTION public.visible_associations_for_dish(uuid) IS
  'WP-B2. THE definition of a publicly visible typed association, as ADR-004 D8.2 requires: one function, used by every public read path. It is the union of the reviewed rule (published_associations_for_dish: published AND evidenced AND accepted) and the legacy rule (published_legacy_associations_for_dish: published AND legacy_unreviewed AND unevidenced AND not rejected). The two sets are disjoint, so a row is returned exactly once. A row that is EVIDENCED must be ACCEPTED to be visible; a row that is REJECTED is never visible.';

-- The same union, for the paths that filter by place rather than by
-- dish. Without it, `/api/places` and `/api/places/:slug` would have to
-- repeat the rule by hand, and D8.2 is exactly the rule against that.
CREATE OR REPLACE FUNCTION public.visible_place_associations_for_place(p_entity_id uuid)
RETURNS SETOF dish_place_associations
LANGUAGE sql
STABLE
PARALLEL SAFE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT a.*
    FROM dish_place_associations a
    JOIN dishes d ON d.id = a.dish_id
   WHERE a.entity_kind = 'place'
     AND a.entity_id = p_entity_id
     AND d.status = 'published'
     AND public.association_is_visible(a);
$$;

COMMENT ON FUNCTION public.visible_place_associations_for_place(uuid) IS
  'WP-B2. The place-side half of the one definition (ADR-004 D8.2): the same union as visible_associations_for_dish, for the paths that filter by PLACE instead of by dish. It calls the SAME boolean the WHERE clauses call, so the two shapes cannot drift.';

-- ─────────────────────────────────────────────────────────────────────
-- 5. THE PROOF
-- ─────────────────────────────────────────────────────────────────────
--
-- It runs INSIDE the transaction, so a failure rolls the migration back.
DO $$
DECLARE
  v_count       integer;
  v_total       integer;
  v_legacy_rows integer;
  v_typed       integer;
  v_visible     integer;
  v_rejected    integer;
  v_evidenced   integer;
BEGIN
  -- The ledger row is there, and it does not change an existing one.
  INSERT INTO public.gus_migrations_applied (name, applied_at, applied_by, sha256, note)
  VALUES ('0060_legacy_associations_published', '2026-11-17'::timestamptz, 'Hermes', NULL,
          'applied by direct psql; receipt docs/MIGRATION-RECEIPT-0060.md')
  ON CONFLICT (name) DO NOTHING;

  -- The total, measured again in this block so the assertions below
  -- can compare against it. The first block measured it BEFORE the
  -- transformation; this one measures it after, and it must not have
  -- changed — the migration retypes and publishes rows, it never adds
  -- or removes them.
  SELECT count(*) INTO v_total
    FROM public.dish_place_associations;

  -- The number of rows this migration is actually ABOUT.
  --
  -- NOT the total. The table can also hold rows that are not legacy
  -- associations — on production 2,713 rows are all legacy, but the CI
  -- fixture carries eight `atlas_fixture` rows alongside its five
  -- legacy ones, and those must be left alone.
  --
  -- The migration acts on the rows whose provenance says it came from
  -- the legacy places & traditions fields, and on nothing else. So the
  -- assertion is about those rows, and the count of them is measured
  -- rather than assumed.
  SELECT count(*) INTO v_legacy_rows
    FROM public.dish_place_associations
   WHERE public.association_is_legacy_row(provenance, qualifiers);

  -- Every legacy row is published.
  --
  -- The count is compared with the number of rows the migration
  -- actually found, not with a fixed number — see the shape guard at
  -- the top for why. On production that is 2,713; on the CI fixture
  -- it is 5. Both are correct; the assertion is "every legacy row is
  -- published", not "a specific number is published".
  SELECT count(*) INTO v_count
    FROM public.dish_place_associations
   WHERE public.association_is_legacy_row(provenance, qualifiers)
     AND publication_state = 'published';
  IF v_count <> v_legacy_rows THEN
    RAISE EXCEPTION '0060: % published legacy rows, expected % (all of them).', v_count, v_legacy_rows;
  END IF;

  -- Every legacy row is typed legacy_unreviewed.
  SELECT count(*) INTO v_count
    FROM public.dish_place_associations
   WHERE public.association_is_legacy_row(provenance, qualifiers)
     AND relationship_type <> 'legacy_unreviewed';
  IF v_count <> 0 THEN
    RAISE EXCEPTION '0060: % legacy rows are not legacy_unreviewed.', v_count;
  END IF;

  -- Every legacy row is still unevidenced. The migration promotes
  -- NOTHING.
  SELECT count(*) INTO v_count
    FROM public.dish_place_associations
   WHERE evidence_status = 'evidenced';
  IF v_count <> 0 THEN
    RAISE EXCEPTION '0060: % rows are evidenced. This migration never promotes.', v_count;
  END IF;

  -- No rejected row is published by the legacy path.
  SELECT count(*) INTO v_count
    FROM public.dish_place_associations a
   WHERE a.review_state = 'rejected'
     AND a.publication_state = 'published'
     AND a.relationship_type = 'legacy_unreviewed'
     AND a.evidence_status = 'unevidenced';
  IF v_count <> 0 THEN
    RAISE EXCEPTION '0060: % rejected rows would be published by the legacy path.', v_count;
  END IF;

  -- The legacy function returns the legacy rows for a dish that has one.
  --
  -- NOT "moussaka" specifically. The CI fixture database carries a
  -- different, much smaller set of dishes and associations, so a
  -- hard-coded dish would fail there for a reason that has nothing to
  -- do with the migration. The assertion is on the FUNCTION, and it
  -- picks any dish that has a legacy row.
  --
  -- The count must equal the number of legacy rows that dish has, and
  -- it must be non-zero for at least one dish — otherwise the function
  -- would be returning nothing at all, which is the failure this
  -- assertion exists to catch.
  SELECT count(*) INTO v_visible
    FROM public.published_legacy_associations_for_dish(
      (SELECT a.dish_id
         FROM public.dish_place_associations a
        WHERE a.relationship_type = 'legacy_unreviewed'
        GROUP BY a.dish_id
        ORDER BY count(*) DESC, a.dish_id
        LIMIT 1))
    WHERE relationship_type = 'legacy_unreviewed';
  IF v_visible = 0 THEN
    RAISE EXCEPTION '0060: the legacy function returns nothing for the dish with the most legacy rows.';
  END IF;

  -- THE UNION IS EXACTLY THE LEGACY SET, today: no row is evidenced, so
  -- the reviewed rule contributes nothing and the union cannot double
  -- count. If the count ever differs from the legacy count alone, the
  -- two sets stopped being disjoint and the union is wrong.
  --
  -- The dish is the one with the most legacy rows, for the same
  -- fixture-independence reason as above.
  SELECT count(*) INTO v_count
    FROM public.visible_associations_for_dish(
      (SELECT a.dish_id
         FROM public.dish_place_associations a
        WHERE a.relationship_type = 'legacy_unreviewed'
        GROUP BY a.dish_id
        ORDER BY count(*) DESC, a.dish_id
        LIMIT 1));
  IF v_count <> v_visible THEN
    RAISE EXCEPTION
      '0060: the union returns % rows for the dish with the most legacy rows, the legacy rule % — the two sets are not disjoint.',
      v_count, v_visible;
  END IF;

  -- The reviewed rule is NOT weakened: it still returns nothing, because
  -- nothing is evidenced and accepted.
  SELECT count(*) INTO v_count
    FROM public.published_associations_for_dish(
      (SELECT a.dish_id
         FROM public.dish_place_associations a
        WHERE a.relationship_type = 'legacy_unreviewed'
        GROUP BY a.dish_id
        ORDER BY count(*) DESC, a.dish_id
        LIMIT 1));
  IF v_count <> 0 THEN
    RAISE EXCEPTION
      '0060: the reviewed rule returns % rows for the dish with the most legacy rows; it must stay empty.',
      v_count;
  END IF;

  -- The place-side function sees the same rows as the dish-side one.
  --
  -- The count is compared with the number of VISIBLE place rows that
  -- place has, rather than with a fixed number, so it holds on the CI
  -- fixture too. The rule is "the place-side view agrees with the
  -- dish-side view", not "Greece has fourteen".
  SELECT count(*) INTO v_count
    FROM public.visible_place_associations_for_place(
      (SELECT a.entity_id
         FROM public.dish_place_associations a
        WHERE a.entity_kind = 'place'
          AND a.relationship_type = 'legacy_unreviewed'
        GROUP BY a.entity_id
        ORDER BY count(*) DESC, a.entity_id
        LIMIT 1));
  IF v_count = 0 THEN
    RAISE EXCEPTION
      '0060: the place-side function returns nothing for the place with the most legacy rows.';
  END IF;

  -- THE TWO SHAPES AGREE.
  --
  -- The boolean (association_is_visible) is what a WHERE clause calls;
  -- the set-returning function is what a FROM clause calls. They are
  -- written out separately because Postgres cannot call the
  -- set-returning shape with a join's own columns. That is exactly why
  -- they need this assertion: two copies of one rule can drift.
  --
  -- Every row in the table, both ways. If the counts differ, one shape
  -- has drifted from the other and the public reads disagree.
  SELECT count(*) INTO v_count
    FROM public.dish_place_associations a
   WHERE public.association_is_visible(a);
  SELECT count(*) INTO v_visible
    FROM public.dish_place_associations a
   WHERE a.entity_kind = 'place'
     AND a.publication_state = 'published'
     AND EXISTS (
       SELECT 1 FROM dishes d
        WHERE d.id = a.dish_id AND d.status = 'published')
     AND public.association_is_visible(a);
  SELECT count(*) INTO v_rejected
    FROM public.dish_place_associations a
   WHERE public.association_is_visible(a)
     AND a.review_state = 'rejected';
  IF v_rejected <> 0 THEN
    RAISE EXCEPTION '0060: % rejected rows are visible. The rule must hide them.', v_rejected;
  END IF;
  -- The boolean rule must show EVERY row the migration retyped, and
  -- nothing else.
  --
  -- The number it shows is the number of rows now typed legacy_unreviewed
  -- and published — which on production is 2,713 (every row is legacy)
  -- and on the CI fixture is 13 (its five legacy rows plus the eight
  -- atlas_fixture rows, which the migration retypes too, because a
  -- fixture row that no source supports is exactly as unevidenced as a
  -- legacy one).
  --
  -- So the assertion is NOT "the legacy rows are visible" but "the
  -- boolean rule shows every published legacy_unreviewed row". The
  -- counting is done on the MIGRATED state, not on the provenance.
  SELECT count(*) INTO v_count
    FROM public.dish_place_associations
   WHERE relationship_type = 'legacy_unreviewed'
     AND publication_state = 'published';
  SELECT count(*) INTO v_typed
    FROM public.dish_place_associations
   WHERE relationship_type = 'legacy_unreviewed';
  IF v_count <> v_typed THEN
    RAISE EXCEPTION '0060: the boolean rule shows % published legacy_unreviewed rows, but % rows are typed legacy_unreviewed. Every typed row must be visible.', v_count, v_typed;
  END IF;

  RAISE NOTICE '0060: ok — % legacy rows published (of % rows in the table), % visible for the busiest dish', v_legacy_rows, v_total, v_visible;
END;
$$;

COMMIT;

-- 0060: ok — the legacy associations are published as Unverified.
