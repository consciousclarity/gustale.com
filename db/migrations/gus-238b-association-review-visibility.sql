-- =====================================================================
-- GUS-238b — hide unreviewed and unevidenced associations from the
--             public page.
--
-- OWNER'S RULE (2026-11-13):
--   "until reviewed, hide every association with an unevidenced or
--    unreviewed status from the live page. A dish with none left shows
--    'No association has been published for this dish yet.'"
--
-- WHY A FUNCTION AND NOT A COMPONENT
-- ----------------------------------
--
-- `published_associations_for_dish()` is THE definition of a publicly
-- visible typed association. ADR-004 D8.2 put it there so a claim
-- cannot be public on one surface and draft on another, and every
-- public read path goes through it or through a predicate written from
-- the same definition.
--
-- Filtering in a component would leave every OTHER read path — the
-- API, the map, the counts — still serving the unreviewed rows. That
-- is exactly the inconsistency the function exists to prevent, so the
-- rule goes in the function.
--
-- WHAT IT CHANGES
-- ----------------
--
-- An association is publicly visible only when it is:
--
--     publication_state = 'published'    (already required)
--     the dish itself is published        (already required)
--     evidence_status    = 'evidenced'    (NEW)
--     review_state       = 'accepted'     (NEW)
--
-- The evidence and review axes are checked TOGETHER: a row that has
-- evidence but has not been reviewed is still hidden, and a row that
-- has been reviewed but carries no evidence is still hidden. Both are
-- required.
--
-- WHAT IT DOES NOT DO
-- --------------------
--
-- It does not delete anything. The rows stay in
-- `dish_place_associations` with their state intact, so the review
-- work package can work on them and a later migration can widen the
-- predicate again as rows are accepted.
--
-- The rows that fall away are the DISCOVERY values — the legacy
-- country and cuisine fields migrated into the typed table. They are
-- still shown by the page's own legacy band, which is explicitly
-- labelled as discovery data and not a finding. Nothing is lost; it
-- is simply not presented as a claim.
--
-- ROLLBACK
-- ---------
--
-- The previous function body is kept in this file, so the rollback is
-- a single CREATE OR REPLACE with the old definition. No data
-- operation is involved.
--
-- MEASURED
-- --------
--
-- Against the review database, before this change: 13 association
-- rows, 8 with publication_state = 'published' on a published dish,
-- and EVERY ONE of those 8 is `unevidenced` + `unreviewed`. So this
-- change hides 8 of 8 published rows, and the four dishes that
-- currently show associations — chicken-tikka-masala, falafel, rendang
-- and tacos-al-pastor — would show the empty state instead.
--
-- The LIVE count must be measured on the VPS before this is applied
-- there; the live database is not reachable from the development host.

\set ON_ERROR_STOP on

BEGIN;

-- ---------------------------------------------------------------------
-- The new predicate.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.published_associations_for_dish(p_dish_id uuid)
RETURNS SETOF dish_place_associations
LANGUAGE sql
STABLE
PARALLEL SAFE
AS $$
  SELECT a.*
    FROM dish_place_associations a
    JOIN dishes d ON d.id = a.dish_id
   WHERE a.dish_id = p_dish_id
     AND a.publication_state = 'published'
     AND d.status = 'published'
     -- The review and evidence axes, per the owner's rule of
     -- 2026-11-13. Both are required.
     AND a.evidence_status = 'evidenced'
     AND a.review_state = 'accepted';
$$;

COMMENT ON FUNCTION public.published_associations_for_dish(uuid) IS
  'ADR-004 D8.2. THE definition of a publicly visible typed association. The dish own status is checked too, so a draft dish associations cannot leak through a route that forgot to check. GUS-238b (owner''s rule, 2026-11-13): an association is also hidden until it is EVIDENCED and REVIEWED. Nothing is deleted — the rows stay for the review work package.';

COMMIT;

-- =====================================================================
-- ROLLBACK
-- =====================================================================
--
-- Drop the two added conditions. The previous body was:
--
--   CREATE OR REPLACE FUNCTION public.published_associations_for_dish(p_dish_id uuid)
--   RETURNS SETOF dish_place_associations
--   LANGUAGE sql
--   STABLE
--   PARALLEL SAFE
--   AS $$
--     SELECT a.*
--       FROM dish_place_associations a
--       JOIN dishes d ON d.id = a.dish_id
--      WHERE a.dish_id = p_dish_id
--        AND a.publication_state = 'published'
--        AND d.status = 'published';
--   $$;
--
-- No data operation is involved in either direction.
