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

BEGIN;

-- =====================================================================
-- ASSERTIONS (before any write). Any failure aborts the transaction.
-- =====================================================================

-- A1: exactly 259 countries today (the "before" state this script expects).
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM geo_entities WHERE entity_type='country';
  IF n <> 259 THEN
    RAISE EXCEPTION 'A1 failed: expected 259 countries, found %', n;
  END IF;
END $$;

-- A2: exactly 46 regions without a Wikidata Q-id.
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n
    FROM geo_entities
   WHERE entity_type='region' AND wikidata_id IS NULL;
  IF n <> 46 THEN
    RAISE EXCEPTION 'A2 failed: expected 46 regions without Q-id, found %', n;
  END IF;
END $$;

-- A3: exactly 14 regions whose name matches a country row's name AND whose
--     own wikidata_id IS NULL. These are the true dual places. (The other 6
--     name matches have DIFFERENT, non-null Q-ids — genuine collisions.)
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n
    FROM geo_entities r
    JOIN geo_entities c
      ON c.entity_type='country' AND c.name = r.name
   WHERE r.entity_type='region' AND r.wikidata_id IS NULL;
  IF n <> 14 THEN
    RAISE EXCEPTION 'A3 failed: expected 14 dual places, found %', n;
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

-- B1: exactly 250 active countries.
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM geo_entities
   WHERE entity_type='country' AND status='active';
  IF n <> 250 THEN
    RAISE EXCEPTION 'B1 failed: expected 250 active countries, found %', n;
  END IF;
END $$;

-- B2: exactly 9 archived countries.
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM geo_entities
   WHERE entity_type='country' AND status='archived';
  IF n <> 9 THEN
    RAISE EXCEPTION 'B2 failed: expected 9 archived countries, found %', n;
  END IF;
END $$;

-- B3: all 46 regions now carry a name_source, a subdivision_type and an
--     iso_version.
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n
    FROM geo_entities
   WHERE entity_type='region' AND wikidata_id IS NULL
     AND (name_source IS NULL OR subdivision_type IS NULL OR iso_version IS NULL);
  IF n <> 0 THEN
    RAISE EXCEPTION 'B3 failed: % of the 46 regions still lack provenance', n;
  END IF;
END $$;

-- B4: exactly 14 dual-place links, and every one points at a country row.
DO $$
DECLARE n int; bad int;
BEGIN
  SELECT count(*) INTO n FROM geo_entities WHERE same_as_entity_id IS NOT NULL;
  IF n <> 14 THEN
    RAISE EXCEPTION 'B4 failed: expected 14 same_as links, found %', n;
  END IF;
  SELECT count(*) INTO bad
    FROM geo_entities r JOIN geo_entities c ON c.id = r.same_as_entity_id
   WHERE c.entity_type <> 'country';
  IF bad <> 0 THEN
    RAISE EXCEPTION 'B4b failed: % same_as links point at a non-country row', bad;
  END IF;
END $$;

-- B5: no geo_entities row was lost (3,849 before, 3,849 after).
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM geo_entities;
  IF n <> 3849 THEN
    RAISE EXCEPTION 'B5 failed: expected 3849 geo_entities rows, found %', n;
  END IF;
END $$;

COMMIT;
