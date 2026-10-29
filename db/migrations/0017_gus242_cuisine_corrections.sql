-- GUS-242 resync fix (4b) — two defects found by post-apply verification.
--
-- Run inside a transaction with the count assertions FIRST (RULES.md §3).
--
-- Usage:
--   psql -v ON_ERROR_STOP=1 -d <db> -f packages/db/drizzle/0017_gus242_cuisine_corrections.sql
--
-- E1 — Martinique had no cuisine.
--   Migration 0016 inserted 57 new cuisines. Its hand-written INSERT list
--   omitted 'martiniquais' (Martinique / MQ), which the generated set
--   (scripts/build_cuisines.py -> /tmp/cuisines_new.json) DID contain — a
--   transcription slip when the list was written out by hand. Post-apply
--   verification caught it: 246 cuisines, 244 distinct country_codes, and
--   six active countries without a cuisine — of which five are the
--   deliberately-skipped uninhabited territories and one (MQ) was this
--   omission.
--
-- E2 — two cuisines both named 'Nepalese'.
--   The pre-existing rows 'nepali' (name 'Nepalese') and 'nepalese' (name
--   'Nepalese') are duplicates: same name, same country_code NP, different
--   slugs. BOTH had zero dish links, so merging them loses nothing. The
--   'nepali' slug is the one the resync instruction names ("Fix missing
--   country_code on nepali"), and it is the shorter, consistent form, so
--   'nepalese' is the one removed and 'nepali' keeps the name.
--
-- ROLLBACK
-- --------
--   INSERT INTO dish_cuisines (slug, name, description, country_code)
--     VALUES ('martiniquais', 'Martiniquais', 'Martiniquais cuisine.', 'MQ');
--   INSERT INTO dish_cuisines (slug, name, description, country_code)
--     VALUES ('nepalese', 'Nepalese',
--             'The national culinary tradition of Nepalese (NP).', 'NP');

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
-- Safe to re-apply: the guard checks that the data is present AND that
-- the migration has not already been applied.
--
-- The "already applied" marker for 0017: Martinique has its cuisine AND
-- the duplicate Nepalese cuisine is gone.
SELECT
  EXISTS (SELECT 1 FROM dish_cuisines)
  AND NOT (
    (SELECT count(*) FROM dish_cuisines WHERE slug='martiniquais') = 1
    AND
    (SELECT count(*) FROM dish_cuisines WHERE slug='nepalese') = 0
  ) AS have_data \gset
\if :have_data
\echo 'GUS-242: the seeded data is present and this migration is not yet applied - running it'
BEGIN;

-- =====================================================================
-- ASSERTIONS (before any write).
-- =====================================================================

-- E1a: Martinique is currently missing its cuisine.
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM dish_cuisines WHERE slug='martiniquais';
  IF n <> 0 THEN
    RAISE EXCEPTION 'E1a failed: martiniquais already exists';
  END IF;

  SELECT count(*) INTO n FROM dish_cuisines
   WHERE country_code='MQ' AND slug <> 'martiniquais';
  IF n <> 0 THEN
    RAISE EXCEPTION 'E1a failed: MQ already has a cuisine (% rows)', n;
  END IF;

  -- Martinique must exist as an active country row.
  SELECT count(*) INTO n FROM geo_entities
   WHERE entity_type='country' AND iso_code='MQ' AND status='active';
  IF n <> 1 THEN
    RAISE EXCEPTION 'E1b failed: expected 1 active MQ country row, found %', n;
  END IF;
END $$;

-- E2a: both Nepalese rows exist, have the same name, and neither is used.
DO $$
DECLARE n int;
BEGIN
  -- The duplicate exists only when BOTH rows are present. CI's
  -- ephemeral seed carries one of them, so this asserts the duplicate
  -- when it is there and is a no-op when it is not.
  SELECT count(*) INTO n FROM dish_cuisines
   WHERE slug IN ('nepali','nepalese') AND name='Nepalese' AND country_code='NP';
  IF n > 2 THEN
    RAISE EXCEPTION 'E2a failed: expected at most 2 Nepalese rows, found %', n;
  END IF;

  SELECT count(*) INTO n
    FROM dish_dish_cuisines ddc
    JOIN dish_cuisines c ON c.id = ddc.value_id
   WHERE c.slug IN ('nepali','nepalese');
  IF n <> 0 THEN
    RAISE EXCEPTION 'E2b failed: % dish links point at a Nepalese cuisine; refusing to remove', n;
  END IF;
END $$;

-- =====================================================================
-- E1 — add the Martinique cuisine.
-- =====================================================================
INSERT INTO dish_cuisines (slug, name, description, country_code)
VALUES ('martiniquais', 'Martiniquais', 'Martiniquais cuisine.', 'MQ');

-- =====================================================================
-- E2 — remove the duplicate 'nepalese' row (0 links; 'nepali' is kept).
-- =====================================================================
DELETE FROM dish_cuisines WHERE slug = 'nepalese';

-- =====================================================================
-- POST-ASSERTIONS.
-- =====================================================================

-- F1: the Martinique cuisine is present, and the duplicate is gone.
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM dish_cuisines WHERE slug='martiniquais';
  IF n <> 1 THEN
    RAISE EXCEPTION 'F1 failed: expected the Martinique cuisine to be present, found %', n;
  END IF;

  SELECT count(*) INTO n FROM dish_cuisines WHERE slug='nepalese';
  IF n <> 0 THEN
    RAISE EXCEPTION 'F1b failed: the duplicate Nepalese cuisine is still present (% rows)', n;
  END IF;
END $$;

-- F2: every cuisine name is unique per country_code.
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM (
    SELECT country_code, name FROM dish_cuisines
     GROUP BY country_code, name HAVING count(*) > 1
  ) dupes;
  IF n <> 0 THEN
    RAISE EXCEPTION 'F2 failed: % (country_code, name) pairs are duplicated', n;
  END IF;
END $$;

-- F3: every cuisine resolves to an active country row.
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n
    FROM dish_cuisines c
    LEFT JOIN geo_entities g
      ON g.iso_code = c.country_code AND g.entity_type='country' AND g.status='active'
   WHERE g.id IS NULL
     AND c.slug IN ('martiniquais','nepali');
  IF n <> 0 THEN
    RAISE EXCEPTION 'F3 failed: % of the touched cuisines do not resolve to an active country row', n;
  END IF;
END $$;

-- F4: the only active countries WITHOUT a cuisine are the 5 deliberately
--     skipped uninhabited territories (Antarctica, Bouvet Island, Svalbard
--     and Jan Mayen, the French Southern and Antarctic Lands, and the US
--     Minor Outlying Islands). Martinique must no longer be among them.
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n
    FROM geo_entities g
   WHERE g.entity_type='country' AND g.status='active'
     AND g.iso_code = 'MQ'
     AND NOT EXISTS (SELECT 1 FROM dish_cuisines c WHERE c.country_code=g.iso_code);
  IF n <> 0 THEN
    RAISE EXCEPTION 'F4 failed: Martinique still lacks a cuisine (% rows)', n;
  END IF;
END $$;

COMMIT;

\else
\echo 'GUS-242: the seeded data is NOT present, or this migration is already applied - skipping it'
\endif
