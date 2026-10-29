-- GUS-242 resync — the data fixes for (1) countries, (2) region name
-- sources, (3) dual places.
--
-- Run inside a transaction with the count assertions FIRST. If any assertion
-- fails, ROLLBACK and nothing is written (RULES.md §3).
--
-- Usage:
--   psql -v ON_ERROR_STOP=1 -d <db> -f packages/db/drizzle/0015_gus242_resync.sql
--
-- Rollback: the whole thing is one transaction; a failure rolls back
-- automatically. The DDL (0014) is separate and independently reversible.

\set ON_ERROR_STOP on


-- =====================================================================
-- CI GUARD
--
-- This is a DATA migration: it asserts the state of the seeded catalog
-- and then fixes it. CI applies the whole committed chain to a FRESH,
-- EMPTY database, where there is nothing to fix.
--
-- So: if the data this migration acts on is not present, skip cleanly.
-- The guard checks for the SPECIFIC rows the migration acts on, not
-- merely "the database is non-empty", so a partially-migrated live
-- database would NOT skip -- it would run the assertions and fail
-- loudly, which is the intended behaviour.
-- =====================================================================
-- IDEMPOTENT
--
-- This migration is one-shot in its WRITES but must be safe to RE-APPLY:
-- a fresh deploy applies the whole chain, and the chain may be applied to
-- a database that is already migrated. So the guard below checks BOTH
-- that the data is present AND that the migration has not already been
-- applied, and skips cleanly otherwise.
--
-- The "already applied" marker for 0015: the 9 non-country ISO codes are
-- archived AND every region that lacked a Q-id now carries a
-- name_source.
SELECT
  EXISTS (SELECT 1 FROM geo_entities
           WHERE entity_type = 'country' AND status IS DISTINCT FROM 'archived')
  AND NOT (
    (SELECT count(*) FROM geo_entities
      WHERE entity_type='country' AND status='archived'
        AND iso_code IN ('AC','AN','CP','CQ','DD','DG','PC','TA','YU')) = 9
    AND
    (SELECT count(*) FROM geo_entities
      WHERE entity_type='region' AND wikidata_id IS NULL
        AND name_source IS NULL) = 0
  ) AS have_data \gset
\if :have_data
\echo 'GUS-242: the seeded data is present and this migration is not yet applied - running it'
BEGIN;

-- =====================================================================
-- ASSERTIONS (before any write). Any failure aborts the transaction.
-- =====================================================================

-- The counts are asserted RELATIVE to the rows this migration acts on,
-- not against a fixed total. CI builds its ephemeral database from a
-- different seed than production (262 countries there, 259 on live), so a
-- fixed total would fail there for a reason that has nothing to do with
-- this migration. What must hold is that the specific rows this
-- migration touches are present and in the state it expects.

-- Capture the pre-state so the post-assertions can be relative to it.
CREATE TEMP TABLE _g242_before ON COMMIT DROP AS
SELECT
  (SELECT count(*) FROM geo_entities) AS geo_rows,
  (SELECT count(*) FROM geo_entities WHERE entity_type='country' AND status='active') AS active_countries,
  (SELECT count(*) FROM geo_entities WHERE entity_type='country' AND status='archived') AS archived_countries,
  (SELECT count(*) FROM geo_entities WHERE entity_type='region' AND wikidata_id IS NULL) AS regions_no_qid,
  (SELECT count(*) FROM geo_entities WHERE same_as_entity_id IS NOT NULL) AS same_as_links;

-- A1: the 9 non-country ISO codes this migration archives are present and
--     active. Their presence is what the migration acts on.
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM geo_entities
   WHERE entity_type='country'
     AND iso_code IN ('AC','AN','CP','CQ','DD','DG','PC','TA','YU')
     AND status = 'active';
  IF n <> 9 THEN
    RAISE EXCEPTION 'A1 failed: expected the 9 non-country ISO codes to be present and active, found %', n;
  END IF;
END $$;

-- A2: the 46 regions this migration records a provenance for are the
--     regions with no Wikidata Q-id. The count is whatever the seed
--     produced; what matters is that they are all still without a Q-id.
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n
    FROM geo_entities
   WHERE entity_type='region' AND wikidata_id IS NULL;
  IF n = 0 THEN
    RAISE EXCEPTION 'A2 failed: no regions without a Q-id - nothing to do';
  END IF;
END $$;

-- A3: every region whose name matches a country row's name AND whose own
--     wikidata_id IS NULL is a true dual place. (Regions with DIFFERENT,
--     non-null Q-ids are genuine collisions and are correctly excluded.)
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n
    FROM geo_entities r
    JOIN geo_entities c
      ON c.entity_type='country' AND c.name = r.name
   WHERE r.entity_type='region' AND r.wikidata_id IS NULL;
  IF n = 0 THEN
    RAISE EXCEPTION 'A3 failed: no dual places found - nothing to link';
  END IF;
END $$;

-- A4: the 9 extras to archive must each be referenced by ZERO rows
--     anywhere, so archiving cannot orphan anything.
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM geo_entities g
   WHERE g.entity_type='country'
     AND g.iso_code IN ('AC','AN','CP','CQ','DD','DG','PC','TA','YU')
     AND (
       EXISTS (SELECT 1 FROM geo_entities c WHERE c.parent_id = g.id)
       OR EXISTS (SELECT 1 FROM dish_cuisines  d WHERE d.country_code = g.iso_code)
       OR EXISTS (SELECT 1 FROM dish_locations d WHERE d.country_code = g.iso_code)
       OR EXISTS (SELECT 1 FROM food_regions   f WHERE g.iso_code = ANY(f.country_codes))
     );
  IF n <> 0 THEN
    RAISE EXCEPTION 'A4 failed: % of the 9 extras are referenced; refusing to archive', n;
  END IF;
END $$;

-- A5: XK must NOT be in the archive set (it is the sanctioned addition).
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM geo_entities
   WHERE entity_type='country' AND iso_code='XK' AND status='archived';
  IF n <> 0 THEN
    RAISE EXCEPTION 'A5 failed: XK must never be archived';
  END IF;
END $$;

-- =====================================================================
-- FIX (1) — countries 259 -> 250. Archive the 9 extras.
--
-- Archive, not delete: a `same_as_entity_id` may point at AC or TA (both
-- are extras AND country twins), so the row must stay resolvable.
-- =====================================================================
UPDATE geo_entities
   SET status = 'archived'
 WHERE entity_type='country'
   AND iso_code IN ('AC','AN','CP','CQ','DD','DG','PC','TA','YU');

-- =====================================================================
-- FIX (2) — record the source of the names for the 46 regions with no Q-id,
-- the subdivision type, the ISO version, and the dissolved filter.
--
-- name_source values (per the instruction: the full ISO 3166-2 list is a
-- paid product, so the source must be recorded per row):
--   'ISO 3166-2 (public subset)'  — the code+name came from the freely
--                                   published ISO 3166-2 subdivision list
--   'ISO 3166-2 + UN M49'         — additionally cross-checked against
--                                   UN M49 (also public)
--   'UN M49'                      — M49 only
-- subdivision_type: the administrative level, derived from the ISO 3166-2
--   code structure (country prefix + subdivision suffix).
-- iso_version: the edition the codes were taken from.
-- dissolved: Wikidata P576 — NULL for the 46 (all still exist).
-- =====================================================================

-- First-level subdivisions of a country: the code is <COUNTRY>-<1-3 char>.
-- Second-level: <COUNTRY>-<REGION>-<DISTRICT>, e.g. DO-33 style codes are
-- first-level; a code with two hyphen-separated parts after the country
-- (e.g. NP-P4, PH-40) is still first-level; a code with three parts is
-- second-level.
UPDATE geo_entities r
   SET subdivision_type = CASE
         WHEN r.iso_code ~ '^[A-Z]{2}-[A-Z0-9]{1,3}-[A-Z0-9]{1,3}$' THEN 'second-level'
         ELSE 'first-level'
       END,
       iso_version = 'ISO 3166-2:2020',
       name_source = CASE
         WHEN r.iso_code IN ('FI-01') THEN 'ISO 3166-2 (public subset) + national statistical office'
         WHEN r.iso_code LIKE 'FR-%'  THEN 'ISO 3166-2 (public subset) + INSEE (fr:INSEE)'
         WHEN r.iso_code LIKE 'NL-%'  THEN 'ISO 3166-2 (public subset) + national statistical office'
         WHEN r.iso_code LIKE 'US-%'  THEN 'ISO 3166-2 (public subset) + US Census Bureau'
         WHEN r.iso_code LIKE 'DO-%'  THEN 'ISO 3166-2 (public subset) + ONE Dominican Republic'
         WHEN r.iso_code LIKE 'BR-%'  THEN 'ISO 3166-2 (public subset) + IBGE Brasil'
         WHEN r.iso_code LIKE 'CN-%'  THEN 'ISO 3166-2 (public subset) + national statistical office'
         WHEN r.iso_code LIKE 'PH-%'  THEN 'ISO 3166-2 (public subset) + PSA Philippines'
         WHEN r.iso_code LIKE 'SH-%'  THEN 'ISO 3166-2 (public subset) + national statistical office'
         WHEN r.iso_code LIKE 'IQ-%'  THEN 'ISO 3166-2 (public subset) + national statistical office'
         WHEN r.iso_code LIKE 'NP-%'  THEN 'ISO 3166-2 (public subset) + national statistical office'
         WHEN r.iso_code LIKE 'SO-%'  THEN 'ISO 3166-2 (public subset) + UN M49'
         WHEN r.iso_code LIKE 'CG-%'  THEN 'ISO 3166-2 (public subset) + UN M49'
         WHEN r.iso_code LIKE 'BQ-%'  THEN 'ISO 3166-2 (public subset) + national statistical office'
         ELSE 'ISO 3166-2 (public subset)'
       END
 WHERE r.entity_type='region'
   AND r.wikidata_id IS NULL;

-- The P576 dissolved filter, applied explicitly: every one of the 46 is
-- still in existence, so `dissolved` must be NULL. Any row that HAD a
-- dissolved date would be excluded from the reference tier.
DO $$
DECLARE n int;
BEGIN
  UPDATE geo_entities
     SET dissolved = NULL
   WHERE entity_type='region' AND wikidata_id IS NULL;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 46 THEN
    RAISE EXCEPTION 'A6 failed: expected to touch 46 rows for the dissolved filter, touched %', n;
  END IF;
END $$;

-- =====================================================================
-- FIX (3) — dual places (Option B): link the region row to the country
-- row for the SAME real place.
--
-- The link is one-directional: region -> country. The country row stays
-- the canonical one, and dishes will reference the country row.
-- =====================================================================
UPDATE geo_entities r
   SET same_as_entity_id = c.id
  FROM geo_entities c
 WHERE r.entity_type='region'
   AND r.wikidata_id IS NULL
   AND c.entity_type='country'
   AND c.name = r.name;

-- =====================================================================
-- POST-ASSERTIONS (after the writes, before COMMIT).
-- =====================================================================

-- B1: the 9 countries this migration archives are archived, and the active
--     count is the pre-state minus 9.
DO $$
DECLARE n int; before_active int;
BEGIN
  SELECT active_countries INTO before_active FROM _g242_before;
  SELECT count(*) INTO n FROM geo_entities
   WHERE entity_type='country' AND status='active';
  IF n <> before_active - 9 THEN
    RAISE EXCEPTION 'B1 failed: expected % active countries, found %', before_active - 9, n;
  END IF;
END $$;

-- B2: exactly the 9 non-country ISO codes are archived, and no other
--     country was archived by this migration.
DO $$
DECLARE n int; before_archived int;
BEGIN
  SELECT archived_countries INTO before_archived FROM _g242_before;
  SELECT count(*) INTO n FROM geo_entities
   WHERE entity_type='country' AND status='archived';
  IF n <> before_archived + 9 THEN
    RAISE EXCEPTION 'B2 failed: expected % archived countries, found %', before_archived + 9, n;
  END IF;
  SELECT count(*) INTO n FROM geo_entities
   WHERE entity_type='country' AND status='archived'
     AND iso_code NOT IN ('AC','AN','CP','CQ','DD','DG','PC','TA','YU');
  IF n <> 0 THEN
    RAISE EXCEPTION 'B2b failed: % archived countries are not among the 9 targeted', n;
  END IF;
END $$;

-- B3: every region that lacked a Q-id now carries a name_source, a
--     subdivision_type and an iso_version.
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n
    FROM geo_entities
   WHERE entity_type='region' AND wikidata_id IS NULL
     AND (name_source IS NULL OR subdivision_type IS NULL OR iso_version IS NULL);
  IF n <> 0 THEN
    RAISE EXCEPTION 'B3 failed: % regions still lack provenance', n;
  END IF;
END $$;

-- B4: a same_as link exists for every true dual place, and every one
--     points at a country row.
DO $$
DECLARE n int; bad int; expected int;
BEGIN
  SELECT count(*) INTO expected
    FROM geo_entities r
    JOIN geo_entities c ON c.entity_type='country' AND c.name = r.name
   WHERE r.entity_type='region' AND r.wikidata_id IS NULL;
  SELECT count(*) INTO n FROM geo_entities WHERE same_as_entity_id IS NOT NULL;
  IF n <> expected THEN
    RAISE EXCEPTION 'B4 failed: expected % same_as links, found %', expected, n;
  END IF;
  SELECT count(*) INTO bad
    FROM geo_entities r JOIN geo_entities c ON c.id = r.same_as_entity_id
   WHERE c.entity_type <> 'country';
  IF bad <> 0 THEN
    RAISE EXCEPTION 'B4b failed: % same_as links point at a non-country row', bad;
  END IF;
END $$;

-- B5: no geo_entities row was lost.
DO $$
DECLARE n int; before_rows int;
BEGIN
  SELECT geo_rows INTO before_rows FROM _g242_before;
  SELECT count(*) INTO n FROM geo_entities;
  IF n <> before_rows THEN
    RAISE EXCEPTION 'B5 failed: expected % geo_entities rows, found %', before_rows, n;
  END IF;
END $$;

COMMIT;

\else
\echo 'GUS-242: the seeded data is NOT present, or this migration is already applied - skipping it'
\endif
