-- GUS-242: the one corrupted row in the 1e traditions load.
--
-- WHAT HAPPENED
--
-- `dish_traditions` carries 433 traditions, 418 of them with a
-- Wikidata Q-id, a definition and a source. One of those 418 has
-- the WRONG label:
--
--     slug:   tunisian-cuisine-2
--     name:   tunisian cuisine
--     def:    culinary traditions of tunisia
--     source: wikidata:Q3006881
--
-- Q3006881 is NOT Tunisian. Wikidata calls it "Algerian cuisine",
-- with the description "culinary traditions of Algeria", the P17
-- country "Algeria", and the English Wikipedia sitelink
-- "Algerian_cuisine". The Tunisian cuisine is a DIFFERENT item,
-- Q1328433, which is already present as `tunisian-cuisine`.
--
-- So the row is an item for Algerian cuisine carrying Tunisian
-- text. There is no Algerian tradition in the vocabulary at all.
--
-- WHY IT HAPPENED
--
-- The 1e load fetched the label through a SPARQL query that joined
-- the cuisine item to its country. For this one item the join
-- returned the WRONG label — the stored JSON records the label as
-- "tunisian cuisine" while the same record carries country
-- "Algeria" and the Algerian_cuisine sitelink. The label and the
-- description were both mangled ("tunisisia"), which is the
-- signature of a bad join rather than a Wikidata change.
--
-- The scope is ONE row. The other 112 traditions whose definition
-- names a place other than their country are all legitimate
-- regional cuisines (Anhui, Awadhi, Brandenburg, the Brazilian
-- states, the Malaysian/Singaporean/Brunei grouping, and so on) —
-- each was checked.
--
-- WHY IT MATTERS
--
-- The tradition is the "which cuisine tradition does this dish
-- belong to" dimension. Eight Pool A dishes have an Algerian
-- cuisine; assigning them this tradition would label them Tunisian.
--
-- THE FIX
--
-- Rename the row to what its own source says it is, and give it the
-- slug that matches. The slug change is the load-bearing part: the
-- slug is what the API and the front end key on.
--
-- The row is REUSED rather than deleted-and-reinserted, so the id is
-- stable and nothing that already points at it breaks.

BEGIN;

-- ---------------------------------------------------------------------
-- ASSERTIONS (before any write).
-- ---------------------------------------------------------------------
DO $$
DECLARE n int;
BEGIN
  -- The corrupted row must exist, with exactly the wrong text.
  SELECT count(*) INTO n FROM dish_traditions
   WHERE slug = 'tunisian-cuisine-2'
     AND wikidata_id = 'Q3006881'
     AND name = 'tunisian cuisine';
  IF n <> 1 THEN
    RAISE EXCEPTION 'A1 failed: the tunisian-cuisine-2 row is not in the expected state (found % rows)', n;
  END IF;

  -- The slug we are about to free must not already be taken.
  SELECT count(*) INTO n FROM dish_traditions
   WHERE slug = 'algerian-cuisine';
  IF n <> 0 THEN
    RAISE EXCEPTION 'A2 failed: an algerian-cuisine tradition already exists';
  END IF;

  -- The genuine Tunisian tradition must be present and correct, or
  -- this row is not a duplicate of it.
  SELECT count(*) INTO n FROM dish_traditions
   WHERE slug = 'tunisian-cuisine'
     AND wikidata_id = 'Q1328433';
  IF n <> 1 THEN
    RAISE EXCEPTION 'A3 failed: the genuine tunisian-cuisine tradition is missing';
  END IF;

  -- Nothing may reference the old slug.
  SELECT count(*) INTO n FROM dish_dish_traditions
   WHERE value_id IN (
     SELECT id FROM dish_traditions WHERE slug = 'tunisian-cuisine-2'
   );
  IF n <> 0 THEN
    RAISE EXCEPTION 'A4 failed: % rows reference tunisian-cuisine-2', n;
  END IF;
END $$;

-- ---------------------------------------------------------------------
-- THE FIX.
-- ---------------------------------------------------------------------
UPDATE dish_traditions
   SET slug  = 'algerian-cuisine',
       name  = 'Algerian cuisine',
       definition = 'culinary traditions of Algeria',
       source = 'wikidata:Q3006881'
 WHERE slug = 'tunisian-cuisine-2'
   AND wikidata_id = 'Q3006881';

-- ---------------------------------------------------------------------
-- ASSERTIONS (after the write).
-- ---------------------------------------------------------------------
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM dish_traditions
   WHERE slug = 'algerian-cuisine'
     AND wikidata_id = 'Q3006881'
     AND name = 'Algerian cuisine'
     AND definition = 'culinary traditions of Algeria';
  IF n <> 1 THEN
    RAISE EXCEPTION 'P1 failed: the algerian-cuisine tradition is not correct (found % rows)', n;
  END IF;

  SELECT count(*) INTO n FROM dish_traditions
   WHERE slug = 'tunisian-cuisine-2';
  IF n <> 0 THEN
    RAISE EXCEPTION 'P2 failed: tunisian-cuisine-2 still exists';
  END IF;

  -- The total must not have moved: this is a rename, not an add.
  SELECT count(*) INTO n FROM dish_traditions;
  IF n <> 433 THEN
    RAISE EXCEPTION 'P3 failed: the tradition count is % , expected 433', n;
  END IF;

  -- Every tradition must still have a definition and a source.
  SELECT count(*) INTO n FROM dish_traditions
   WHERE definition IS NULL OR source IS NULL;
  IF n <> 0 THEN
    RAISE EXCEPTION 'P4 failed: % traditions have no definition or source', n;
  END IF;
END $$;

COMMIT;

\echo 'GUS-242: the corrupted tradition row is fixed — Algerian cuisine now says what its source says'
