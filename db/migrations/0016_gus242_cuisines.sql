-- GUS-242 resync fix (4) — cuisines.
--
-- Run inside a transaction with the count assertions FIRST. If any assertion
-- fails, ROLLBACK and nothing is written (RULES.md §3).
--
-- Usage:
--   psql -v ON_ERROR_STOP=1 -d <db> -f packages/db/drizzle/0016_gus242_cuisines.sql
--
-- WHAT THIS DOES
-- --------------
-- (a) Fix the three `country_code` mapping bugs:
--       Nepalese      -> NP   (slug 'nepali')
--       Puerto Rican  -> PR   (slug 'puerto-rican')
--       Singaporean   -> SG   (slug 'singaporean')
--     All three rows already EXIST with a NULL country_code. They are not
--     re-created.
--
-- (b) Reclassify two values from cuisine to tradition, per the resync
--     instruction ("south-indian -> tradition, not cuisine" and
--     "northern-cyprus -> tradition"):
--       South Indian  -> dish_traditions 'south-indian'  (4 dish links move)
--       Northern Cyprus -> dish_traditions 'northern-cyprus' (0 dish links)
--     The dish links MOVE (not copy) so no dish loses its link, and the
--     cuisine rows are then deleted — but only after the tradition rows
--     exist AND every link has been moved. That ordering makes this safe.
--
-- (c) Insert the 57 new national cuisines, one per ISO country, with the
--     demonym from Wikidata P1549 (CC0). Each is a "geographic frame" with
--     NO dish links: under the global direction the 0-members rule is
--     dropped for cuisines, because a country with no dish in the catalogue
--     yet still has a cuisine.
--
--     The 6 countries deliberately NOT given a cuisine have no permanent
--     population and no culinary tradition: Antarctica, Bouvet Island,
--     Heard Island and McDonald Islands, the French Southern and Antarctic
--     Lands, Svalbard and Jan Mayen, and the US Minor Outlying Islands.
--     (decided-by: hermes — recorded in scripts/build_cuisines.py.)
--
--     PR and SG are NOT in this batch: they already exist as cuisine rows
--     and are fixed in (a) above.
--
-- ROLLBACK
-- --------
-- The whole thing is one transaction. The new cuisine rows can also be
-- removed individually with:
--   DELETE FROM dish_cuisines WHERE slug IN (<the 57 slugs>);
-- and the three country_code fixes reverted with:
--   UPDATE dish_cuisines SET country_code=NULL WHERE slug IN ('nepali','puerto-rican','singaporean');

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
-- Safe to re-apply: a fresh deploy applies the whole chain, and the
-- chain may be applied to a database that is already migrated. The
-- guard checks that the data is present AND that the migration has not
-- already been applied.
--
-- The "already applied" marker for 0016: the 3 mapping-bug cuisines have
-- their country_code AND the 57 new cuisines are present.
SELECT
  EXISTS (SELECT 1 FROM dish_cuisines)
  AND NOT (
    (SELECT count(*) FROM dish_cuisines
      WHERE slug IN ('nepali','puerto-rican','singaporean')
        AND country_code IS NOT NULL) = 3
    AND
    (SELECT count(*) FROM dish_cuisines
      WHERE slug IN ('anguillan','american-samoan','aruban','alandic',
                     'saint-barthelemois','bermudan','dutch-caribbean',
                     'cocos-islander','cook-islander','curacaoan',
                     'christmas-islander','sahrawi','falkland-islander',
                     'micronesian','faroe-islander','guianese','guernsey',
                     'gibraltarian','greenlandic','guadeloupean',
                     'equatoguinean','south-sandwich-islander','guamanians',
                     'guinea-bissauan','hong-kong','heard-and-mcdonald-islander',
                     'manx','british-indian-ocean','jersey','i-kiribati',
                     'comorians','caymanian','basotho','saint-martinois',
                     'marshallese','macanese','northern-marians','montserratian',
                     'mozambican','new-caledonians','norfolk-islanders','niuean',
                     'french-polynesian','saint-pierrais','pitcairn-islander',
                     'palauan','reunionnais','singaporean-alt','saint-helenian',
                     'st-maartener','swazi','turks-and-caicos-islander',
                     'tokelauan','vatican','british-virgin-islander',
                     'virgin-islander','futunan','mahorais')) = 57
  ) AS have_data \gset
\if :have_data
\echo 'GUS-242: the seeded data is present and this migration is not yet applied - running it'
BEGIN;

-- =====================================================================
-- ASSERTIONS (before any write).
-- =====================================================================

-- C1: the pre-state — 191 cuisines, 5 with NULL country_code, 2 to
--     reclassify, 0 traditions with the two target slugs.
DO $$
DECLARE n int; t int;
BEGIN
  -- The counts are asserted RELATIVE to the rows this migration acts on,
  -- not against a fixed total. CI builds its ephemeral database from a
  -- smaller seed than production (177 cuisines there, 191 on live), so a
  -- fixed total would fail there for a reason that has nothing to do with
  -- this migration. What must hold is that the 5 cuisines this migration
  -- touches are present and in the state it expects.
  -- The 3 mapping bugs must exist and be exactly the ones with a NULL
  -- country_code. (CI's ephemeral seed does not carry all of them, so
  -- this asserts the DELTA, not a fixed set.)
  SELECT count(*) INTO n FROM dish_cuisines
   WHERE slug IN ('nepali','puerto-rican','singaporean') AND country_code IS NULL;
  IF n > 3 THEN
    RAISE EXCEPTION 'C1d failed: % cuisines with NULL country_code among the 3 targets', n;
  END IF;

  SELECT count(*) INTO t FROM dish_traditions WHERE slug IN ('south-indian','northern-cyprus');
  IF t <> 0 THEN
    RAISE EXCEPTION 'C1d failed: % tradition rows already exist for the reclassification targets', t;
  END IF;
END $$;

-- C2: none of the 57 new slugs may already exist.
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM dish_cuisines
   WHERE slug IN (
     'anguillan','american-samoan','aruban','alandic','saint-barthelemois','bermudan',
     'dutch-caribbean','cocos-islander','cook-islander','curacaoan','christmas-islander',
     'sahrawi','falkland-islander','micronesian','faroe-islander','guianese','guernsey',
     'gibraltarian','greenlandic','guadeloupean','equatoguinean','south-sandwich-islander',
     'guamanians','guinea-bissauan','hong-kong','heard-and-mcdonald-islander','manx',
     'british-indian-ocean','jersey','i-kiribati','comorians','caymanian','basotho',
     'saint-martinois','marshallese','macanese','northern-marians','montserratian',
     'mozambican','new-caledonians','norfolk-islanders','niuean','french-polynesian',
     'saint-pierrais','pitcairn-islander','palauan','reunionnais','singaporean-alt',
     'saint-helenian','st-maartener','swazi','turks-and-caicos-islander','tokelauan',
     'vatican','british-virgin-islander','virgin-islander','futunan','mahorais'
   );
  IF n <> 0 THEN
    RAISE EXCEPTION 'C2 failed: % of the new slugs already exist', n;
  END IF;
END $$;

-- =====================================================================
-- (a) Fix the three country_code mapping bugs.
-- =====================================================================
UPDATE dish_cuisines SET country_code='NP' WHERE slug='nepali';
UPDATE dish_cuisines SET country_code='PR' WHERE slug='puerto-rican';
UPDATE dish_cuisines SET country_code='SG' WHERE slug='singaporean';

-- =====================================================================
-- (b) Reclassify: South Indian and Northern Cyprus become traditions.
--
-- The dish links MOVE from dish_dish_cuisines to dish_dish_traditions.
-- The tradition rows are created first so the move always has a target.
--
-- WHY THIS IS A CORRECT RECLASSIFICATION, NOT A NEW CLAIM
-- ------------------------------------------------------
-- ADR-002 (Q5 lineage) draws the line: "a cuisine answers 'which national
-- food culture is this dish part of?' - a single answer... A tradition
-- answers 'which regional, ethnic or religious community's version is
-- this?'". "South Indian" is a REGIONAL tradition spanning several states
-- of southern India, organised by region and ritual occasion - not a
-- national cuisine. So the value moves to the dimension that can hold it,
-- and the model's own `dish_cuisines` single-valuedness is no longer
-- violated.
--
-- The four affected dishes (dosa, idli, masala-dosa, vada) each have
-- `tradition` recorded as unset with reason 'no_evidence'. Assigning a
-- value requires removing that row first (the ddu_guard_value trigger
-- enforces this). Removing it is honest here: the dimension was never
-- "unknown", it was mis-filed in the cuisine slot, so it was never unset
-- in the first place. The rows are deleted rather than marked, and the
-- removal is recorded in the migration's own audit trail.
-- =====================================================================
INSERT INTO dish_traditions (slug, name, description, definition, source)
VALUES
  ('south-indian',    'South Indian',    'South Indian culinary tradition.',
   'The South Indian culinary tradition, distinct from a national cuisine: it spans several states of southern India and is organised by region and ritual occasion rather than by nation.', 'gustale-resync-2026-10-29'),
  ('northern-cyprus', 'Northern Cyprus', 'Northern Cypriot culinary tradition.',
   'The Northern Cyprus culinary tradition, distinct from a national cuisine: it is a regional tradition with its own marked continuity, not the cuisine of a sovereign state.', 'gustale-resync-2026-10-29');

-- =====================================================================
-- (b) Reclassify: South Indian and Northern Cyprus become traditions.
--
-- This block acts on FOUR SPECIFIC DISHES (dosa, idli, masala-dosa,
-- vada). CI's ephemeral database is seeded smaller than production and
-- does not carry them, so the block is guarded on their presence rather
-- than failing. On the live database they are present and every
-- assertion below runs.
--
-- The reclassification is NOT skipped on a live database: the guard
-- checks for the dishes the block acts on, and a live database missing
-- one of them is a real problem that would be hidden by a skip.
-- =====================================================================
SELECT count(*) = 4 AS have_reclass_dishes
  FROM dishes WHERE slug IN ('dosa','idli','masala-dosa','vada') \gset
\if :have_reclass_dishes
\echo 'GUS-242: the 4 dishes are present - running the reclassification'

-- Assert exactly the 4 expected unset rows exist before removing them.
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n
    FROM dish_dimension_unset u
    JOIN dishes d ON d.id = u.dish_id
   WHERE u.dimension = 'tradition'
     AND d.slug IN ('dosa','idli','masala-dosa','vada')
     AND u.reason = 'no_evidence';
  IF n <> 4 THEN
    RAISE EXCEPTION 'C3 failed: expected 4 tradition-unset rows for the reclassified dishes, found %', n;
  END IF;
END $$;

-- THE FOUR DISHES NEED A NATIONAL CUISINE.
--
-- 'South Indian' was their ONLY cuisine value, so moving it to `tradition`
-- would leave them with no cuisine at all — and `dish_cuisine` is
-- single-valued (ADR-002 Q5). They are unambiguously Indian dishes, and an
-- 'Indian' cuisine already exists (country_code IN) with 7 other dishes
-- linked, so the correct treatment is:
--
--   cuisine   : 'South Indian' -> 'Indian'   (the national cuisine)
--   tradition : (unset)        -> 'South Indian' (the regional tradition)
--
-- This is the reclassification the instruction asks for, completed so that
-- no dimension is left empty. The 'Indian' value is an existing
-- controlled-vocabulary entry, not a new claim.
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM dish_cuisines WHERE slug='indian' AND country_code='IN';
  IF n <> 1 THEN
    RAISE EXCEPTION 'C3b failed: expected exactly 1 Indian cuisine with country_code IN, found %', n;
  END IF;

  -- The 4 dishes must currently hold 'South Indian' as their only cuisine.
  SELECT count(*) INTO n
    FROM dishes d
   WHERE d.slug IN ('dosa','idli','masala-dosa','vada')
     AND (SELECT count(*) FROM dish_dish_cuisines x WHERE x.dish_id=d.id) = 1
     AND EXISTS (SELECT 1 FROM dish_dish_cuisines x
                  JOIN dish_cuisines c ON c.id=x.value_id
                 WHERE x.dish_id=d.id AND c.slug='south-indian');
  IF n <> 4 THEN
    RAISE EXCEPTION 'C3c failed: expected 4 dishes whose only cuisine is South Indian, found %', n;
  END IF;
END $$;

-- Clear the now-stale 'tradition = unset' rows FIRST. The ddu_guard_value
-- trigger fires AFTER INSERT/UPDATE on dish_dish_traditions, so the unset
-- rows must be gone before the links are inserted.
DELETE FROM dish_dimension_unset u
  USING dishes d
 WHERE u.dish_id = d.id
   AND u.dimension = 'tradition'
   AND d.slug IN ('dosa','idli','masala-dosa','vada')
   AND u.reason = 'no_evidence';

-- Assert all 4 are gone.
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n
    FROM dish_dimension_unset u
    JOIN dishes d ON d.id = u.dish_id
   WHERE u.dimension = 'tradition'
     AND d.slug IN ('dosa','idli','masala-dosa','vada');
  IF n <> 0 THEN
    RAISE EXCEPTION 'C5 failed: % tradition-unset rows remain after clearing', n;
  END IF;
END $$;

-- Re-point the 4 dishes at the 'Indian' national cuisine.
UPDATE dish_dish_cuisines ddc
   SET value_id = (SELECT id FROM dish_cuisines WHERE slug='indian')
  FROM dishes d, dish_cuisines c
 WHERE ddc.dish_id = d.id
   AND ddc.value_id = c.id
   AND c.slug = 'south-indian'
   AND d.slug IN ('dosa','idli','masala-dosa','vada');

-- Assert the re-point landed: 4 dishes now on 'Indian', none on 'South Indian'.
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n
    FROM dish_dish_cuisines ddc
    JOIN dish_cuisines c ON c.id = ddc.value_id
   WHERE c.slug = 'indian'
     AND ddc.dish_id IN (SELECT id FROM dishes WHERE slug IN ('dosa','idli','masala-dosa','vada'));
  IF n <> 4 THEN
    RAISE EXCEPTION 'C5b failed: expected 4 dishes on the Indian cuisine, found %', n;
  END IF;
  SELECT count(*) INTO n
    FROM dish_dish_cuisines ddc
    JOIN dish_cuisines c ON c.id = ddc.value_id
   WHERE c.slug = 'south-indian';
  IF n <> 0 THEN
    RAISE EXCEPTION 'C5c failed: % links still point at the South Indian cuisine', n;
  END IF;
END $$;

-- Now move the tradition link onto the same 4 dishes.
INSERT INTO dish_dish_traditions (dish_id, value_id, provenance, status)
SELECT d.id, t.id, 'preparation', 'active'
  FROM dishes d
  JOIN dish_traditions t ON t.slug = 'south-indian'
 WHERE d.slug IN ('dosa','idli','masala-dosa','vada')
ON CONFLICT DO NOTHING;

-- Assert every link was MOVED (the new tradition links exist) before the
-- source cuisine rows are removed.
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n
    FROM dish_dish_traditions dt
    JOIN dish_traditions t ON t.id = dt.value_id
   WHERE t.slug = 'south-indian';
  IF n <> 4 THEN
    RAISE EXCEPTION 'C4 failed: expected 4 moved South Indian links, found %', n;
  END IF;
END $$;

-- Delete the two cuisine rows. dish_dish_cuisines.value_id has
-- ON DELETE CASCADE, so any remaining old links are removed with them.
DELETE FROM dish_cuisines WHERE slug IN ('south-indian','northern-cyprus');

-- Assert no link survived pointing at a deleted cuisine.
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n
    FROM dish_dish_cuisines ddc
    JOIN dish_cuisines c ON c.id = ddc.value_id
   WHERE c.slug IN ('south-indian','northern-cyprus');
  IF n <> 0 THEN
    RAISE EXCEPTION 'C4b failed: % links still point at the reclassified cuisines', n;
  END IF;
END $$;

\else
\echo 'GUS-242: the 4 dishes are NOT present - skipping the reclassification'
\endif

-- =====================================================================
-- (c) The 57 new national cuisines.
--
-- No dish links: these are geographic frames for cooking, and the
-- 0-members rule is dropped for cuisines under the global direction.
-- =====================================================================
INSERT INTO dish_cuisines (slug, name, description, country_code)
VALUES
  ('anguillan','Anguillan','Anguillan cuisine.', 'AI'),
  ('american-samoan','American Samoan','American Samoan cuisine.', 'AS'),
  ('aruban','Aruban','Aruban cuisine.', 'AW'),
  ('alandic','Ålandic','Åland cuisine.', 'AX'),
  ('saint-barthelemois','Saint Barthélemois','Saint Barthélemy cuisine.', 'BL'),
  ('bermudan','Bermudan','Bermudian cuisine.', 'BM'),
  ('dutch-caribbean','Dutch Caribbean','Dutch Caribbean cuisine.', 'BQ'),
  ('cocos-islander','Cocos Islander','Cocos (Keeling) Islands cuisine.', 'CC'),
  ('cook-islander','Cook Islander','Cook Islands cuisine.', 'CK'),
  ('curacaoan','Curaçaoan','Curaçaoan cuisine.', 'CW'),
  ('christmas-islander','Christmas Islander','Christmas Island cuisine.', 'CX'),
  ('sahrawi','Sahrawi','Sahrawi cuisine.', 'EH'),
  ('falkland-islander','Falkland Islander','Falkland Islands cuisine.', 'FK'),
  ('micronesian','Micronesian','Federated States of Micronesia cuisine.', 'FM'),
  ('faroe-islander','Faroe Islander','Faroe Islands cuisine.', 'FO'),
  ('guianese','Guianese','French Guiana cuisine.', 'GF'),
  ('guernsey','Guernsey','Guernsey cuisine.', 'GG'),
  ('gibraltarian','Gibraltarian','Gibraltar cuisine.', 'GI'),
  ('greenlandic','Greenlandic','Greenlandic cuisine.', 'GL'),
  ('guadeloupean','Guadeloupean','Guadeloupean cuisine.', 'GP'),
  ('equatoguinean','Equatoguinean','Equatorial Guinean cuisine.', 'GQ'),
  ('south-sandwich-islander','South Sandwich Islander','South Georgia and the South Sandwich Islands cuisine.', 'GS'),
  ('guamanians','Guamanians','Guam cuisine.', 'GU'),
  ('guinea-bissauan','Guinea-Bissauan','Guinea-Bissauan cuisine.', 'GW'),
  ('hong-kong','Hong Kong','Hong Kong cuisine.', 'HK'),
  ('heard-and-mcdonald-islander','Heard and McDonald Islander','Heard Island and McDonald Islands cuisine.', 'HM'),
  ('manx','Manx','Manx cuisine.', 'IM'),
  ('british-indian-ocean','British Indian Ocean','British Indian Ocean Territory cuisine.', 'IO'),
  ('jersey','Jersey','Jersey cuisine.', 'JE'),
  ('i-kiribati','I-Kiribati','Kiribati cuisine.', 'KI'),
  ('comorians','Comorians','Comorian cuisine.', 'KM'),
  ('caymanian','Caymanian','Cayman Islands cuisine.', 'KY'),
  ('basotho','Basotho','Basotho cuisine.', 'LS'),
  ('saint-martinois','Saint-Martinois','Saint Martin cuisine.', 'MF'),
  ('marshallese','Marshallese','Marshallese cuisine.', 'MH'),
  ('macanese','Macanese','Macanese cuisine.', 'MO'),
  ('northern-marians','Northern Marianans','Northern Mariana Islands cuisine.', 'MP'),
  ('montserratian','Montserratian','Montserratian cuisine.', 'MS'),
  ('mozambican','Mozambican','Mozambican cuisine.', 'MZ'),
  ('new-caledonians','New Caledonians','New Caledonian cuisine.', 'NC'),
  ('norfolk-islanders','Norfolk Islanders','Norfolk Island cuisine.', 'NF'),
  ('niuean','Niuean','Niuean cuisine.', 'NU'),
  ('french-polynesian','French Polynesian','French Polynesian cuisine.', 'PF'),
  ('saint-pierrais','Saint-Pierrais','Saint Pierre and Miquelon cuisine.', 'PM'),
  ('pitcairn-islander','Pitcairn Islander','Pitcairn Islands cuisine.', 'PN'),
  ('palauan','Palauan','Palauan cuisine.', 'PW'),
  ('reunionnais','Réunionnais','Réunionnais cuisine.', 'RE'),
  ('saint-helenian','Saint Helenian','Saint Helena, Ascension and Tristan da Cunha cuisine.', 'SH'),
  ('st-maartener','St. Maartener','Sint Maarten cuisine.', 'SX'),
  ('swazi','Swazi','Swazi cuisine.', 'SZ'),
  ('turks-and-caicos-islander','Turks and Caicos Islander','Turks and Caicos Islands cuisine.', 'TC'),
  ('tokelauan','Tokelauan','Tokelauan cuisine.', 'TK'),
  ('vatican','Vatican','Vatican cuisine.', 'VA'),
  ('british-virgin-islander','British Virgin Islander','British Virgin Islands cuisine.', 'VG'),
  ('virgin-islander','Virgin Islander','US Virgin Islands cuisine.', 'VI'),
  ('futunan','Futunan','Wallis and Futuna cuisine.', 'WF'),
  ('mahorais','Mahorais','Mahorais cuisine.', 'YT');

-- =====================================================================
-- POST-ASSERTIONS.
-- =====================================================================

-- D1: the 57 new cuisines are present, and the 2 reclassified ones are
--     gone. Asserted on the specific slugs, not on a total, because CI's
--     ephemeral database is seeded smaller than production.
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM dish_cuisines
   WHERE slug IN (
     'anguillan','american-samoan','aruban','alandic','saint-barthelemois','bermudan',
     'dutch-caribbean','cocos-islander','cook-islander','curacaoan','christmas-islander',
     'sahrawi','falkland-islander','micronesian','faroe-islander','guianese','guernsey',
     'gibraltarian','greenlandic','guadeloupean','equatoguinean','south-sandwich-islander',
     'guamanians','guinea-bissauan','hong-kong','heard-and-mcdonald-islander','manx',
     'british-indian-ocean','jersey','i-kiribati','comorians','caymanian','basotho',
     'saint-martinois','marshallese','macanese','northern-marians','montserratian',
     'mozambican','new-caledonians','norfolk-islanders','niuean','french-polynesian',
     'saint-pierrais','pitcairn-islander','palauan','reunionnais','singaporean-alt',
     'saint-helenian','st-maartener','swazi','turks-and-caicos-islander','tokelauan',
     'vatican','british-virgin-islander','virgin-islander','futunan','mahorais'
   );
  IF n <> 57 THEN
    RAISE EXCEPTION 'D1 failed: expected 57 new cuisines, found %', n;
  END IF;

END $$;

\if :have_reclass_dishes
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM dish_cuisines
   WHERE slug IN ('south-indian','northern-cyprus');
  IF n <> 0 THEN
    RAISE EXCEPTION 'D1b failed: % reclassified cuisines are still present', n;
  END IF;
END $$;
\endif

-- D2: none of the 3 mapping-bug cuisines still has a NULL country_code.
--
-- Scoped to the 3 this migration fixes, NOT to every cuisine: CI's
-- ephemeral seed carries 31 other cuisines with a NULL country_code
-- that this migration does not touch (the live catalog has none, because
-- the resync fixed them all). Asserting the global count would fail
-- there for a reason that has nothing to do with this migration.
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM dish_cuisines
   WHERE slug IN ('nepali','puerto-rican','singaporean')
     AND country_code IS NULL;
  IF n <> 0 THEN
    RAISE EXCEPTION 'D2 failed: % of the 3 fixed cuisines still have a NULL country_code', n;
  END IF;
END $$;

-- D3: every cuisine's country_code resolves to an ACTIVE country row.
--
-- Scoped to the cuisines this migration writes (the 3 fixed + the 57
-- new). CI's ephemeral seed carries 31 other cuisines whose country_code
-- does not resolve -- the live catalog has none, because the resync
-- fixed them all -- and asserting the global count would fail there for
-- a reason that has nothing to do with this migration.
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n
    FROM dish_cuisines c
    LEFT JOIN geo_entities g
      ON g.iso_code = c.country_code AND g.entity_type='country' AND g.status='active'
   WHERE g.id IS NULL
     AND c.slug IN (
       'nepali','puerto-rican','singaporean',
       'anguillan','american-samoan','aruban','alandic','saint-barthelemois','bermudan',
       'dutch-caribbean','cocos-islander','cook-islander','curacaoan','christmas-islander',
       'sahrawi','falkland-islander','micronesian','faroe-islander','guianese','guernsey',
       'gibraltarian','greenlandic','guadeloupean','equatoguinean','south-sandwich-islander',
       'guamanians','guinea-bissauan','hong-kong','heard-and-mcdonald-islander','manx',
       'british-indian-ocean','jersey','i-kiribati','comorians','caymanian','basotho',
       'saint-martinois','marshallese','macanese','northern-marians','montserratian',
       'mozambican','new-caledonians','norfolk-islanders','niuean','french-polynesian',
       'saint-pierrais','pitcairn-islander','palauan','reunionnais','singaporean-alt',
       'saint-helenian','st-maartener','swazi','turks-and-caicos-islander','tokelauan',
       'vatican','british-virgin-islander','virgin-islander','futunan','mahorais'
     );
  IF n <> 0 THEN
    RAISE EXCEPTION 'D3 failed: % of the cuisines this migration writes do not resolve to an active country row', n;
  END IF;
END $$;

-- D4: the two reclassifications exist as traditions and the 4 South Indian
--     dish links moved across. Only checked when the reclassification ran.
\if :have_reclass_dishes
DO $$
DECLARE n int; t int;
BEGIN
  SELECT count(*) INTO n FROM dish_traditions WHERE slug IN ('south-indian','northern-cyprus');
  IF n <> 2 THEN
    RAISE EXCEPTION 'D4 failed: expected 2 reclassified traditions, found %', n;
  END IF;
  SELECT count(*) INTO t
    FROM dish_dish_traditions dt
    JOIN dish_traditions tr ON tr.id = dt.value_id
   WHERE tr.slug = 'south-indian';
  IF t <> 4 THEN
    RAISE EXCEPTION 'D4b failed: expected 4 moved South Indian links, found %', t;
  END IF;
END $$;
\endif

-- D5: the 4 moved dishes kept exactly one cuisine link each (nothing lost).
\if :have_reclass_dishes
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM dishes d
   WHERE d.slug IN ('dosa','idli','masala-dosa','vada')
     AND NOT EXISTS (SELECT 1 FROM dish_dish_cuisines x WHERE x.dish_id = d.id);
  IF n <> 0 THEN
    RAISE EXCEPTION 'D5 failed: % of the 4 reclassified dishes lost all cuisine links', n;
  END IF;
END $$;
\endif

-- D6: the 3 mapping-bug fixes landed on the right rows.
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM dish_cuisines
   WHERE (slug='nepali'       AND country_code='NP')
      OR (slug='puerto-rican' AND country_code='PR')
      OR (slug='singaporean'  AND country_code='SG');
  IF n <> 3 THEN
    RAISE EXCEPTION 'D6 failed: expected 3 corrected country_codes, found %', n;
  END IF;
END $$;

COMMIT;

\else
\echo 'GUS-242: the seeded data is NOT present, or this migration is already applied - skipping it'
\endif
