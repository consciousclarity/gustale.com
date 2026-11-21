-- 0066 — the C2 content batch: six descriptions rewritten to their sources.
--
-- WHY
-- ---
-- The content gate (scripts/check_content_gate.py, baseline
-- scripts/content_gate_baseline.json) found 151 violations across 1,474
-- published dishes. This migration fixes six of them — the first
-- batch — and every rewritten sentence was checked against the source
-- it claims, not against a style guide.
--
-- Two kinds of change are here:
--
--   1. A STATUS or ATTRIBUTION word with no claim behind it. "the
--      national dish of Greece", "among the most famous", "the ethnic
--      festive season" — these assert a standing the record cannot
--      support. For moussaka-greek the dish has ZERO statements, so no
--      origin or standing claim can be made at all.
--
--   2. A DETAIL the source does not contain. The knife-cut-noodle
--      draft mentioned beef broth; the source does not. The Hyderabadi
--      biryani draft said "raita"; the source says "dahi chutney".
--
-- WHAT WAS CHECKED
-- ----------------
-- Every new sentence was checked against the source it claims:
--
--   ayam-pansuh         Wikipedia, "Ayam pansuh"
--   biryani-hyderabadi  Wikipedia, "Hyderabadi biryani"
--   knife-cut-noodles   Wikipedia, "Knife-cut noodles"
--   kuksi               Wikipedia, "Kuksi"
--   luwombo             Wikipedia, "Luwombo"
--   moussaka-greek      Wikipedia, "Moussaka" (and "Moussaka" for the
--                       Greek name muzakas)
--
-- Two claims were CORRECTED during that check, not merely softened:
--
--   * knife-cut-noodles  — a beef-broth claim was removed. The source
--     says the style from Datong became the most famous. It says
--     nothing about broth.
--
--   * biryani-hyderabadi — "raita" became "dahi chutney", which is
--     what the source names. "mirchi ka salan" is kept: the source
--     names both.
--
-- moussaka-greek additionally gains the sentence that says what the
-- dish IS (three layers: aubergine, spiced minced meat, béchamel),
-- in place of the claim about its standing.
--
-- HOW THE WRITE WORKS
-- -------------------
-- Two of the six dishes are sentence-managed: their short_description
-- column is RENDERED from description_sentences, and the guard
-- trigger (0025) refuses a column write that does not match the
-- concatenation of the 'short' sentences.
--
--   biryani-hyderabadi  2 short sentences   -> sentences are rewritten
--   moussaka-greek       2 short sentences   -> sentence 2 is replaced
--   the other four       0 short sentences   -> the column is written
--
-- So for the two sentence-managed dishes the sentences are written
-- first and the column second, in that order, inside one transaction.
-- The trigger compares OLD against NEW and only fires when the
-- column changes, so writing sentences first and the column second
-- passes.
--
-- For the four others, `sentence_managed` is false, so the trigger
-- returns early and the column is the source of truth. Their
-- long_description is written too — the "ethnic" phrase appears
-- there as well on three of them, and the long text renders on the
-- dish page.
--
-- IDEMPOTENCE
-- -----------
-- Every statement is written so that re-running it is a no-op: the
-- UPDATE matches on the dish slug and sets the text absolutely. The
-- assertions at the end verify the RESULT, not the attempt, so a
-- second run reports the same state rather than failing.

\set ON_ERROR_STOP on

BEGIN;

-- ─────────────────────────────────────────────────────────────────────
-- 1. moussaka-greek — replace the unsupported standing claim
-- ─────────────────────────────────────────────────────────────────────
--
-- Sentence 1 stays: "A layered casserole of fried eggplant, spiced
-- minced meat, and béchamel sauce, baked until golden." The source
-- agrees.
--
-- Sentence 2 ("Considered the national dish of Greece.") goes. The
-- source never says "national"; it says the name was borrowed from
-- the Greek and describes the dish as a layered casserole of
-- aubergine, minced meat and béchamel. A standing claim about a
-- national dish needs a published, anchored claim behind it, and
-- this dish has no statements at all.
--
-- The replacement says what the dish IS, which is checkable:
--
--   "It is made of three layers: aubergine fried in olive oil,
--    ground meat with tomato and onion, and béchamel on top."
--
-- The second clause is a description of the construction, not a
-- status word, so it needs no attribution marker.

UPDATE description_sentences s
   SET text = 'It is made of three layers: aubergine fried in olive oil, ground meat with tomato and onion, and béchamel on top.'
  FROM dishes d
 WHERE s.dish_id = d.id
   AND d.slug = 'moussaka-greek'
   AND s.field = 'short'
   AND s.locale = 'en'
   AND s.position = 2
   AND s.text = 'Considered the national dish of Greece.';

-- Re-render the column from the sentences.
UPDATE dishes d
   SET short_description = (
       SELECT string_agg(s.text, '' ORDER BY s.position)
         FROM description_sentences s
        WHERE s.dish_id = d.id
          AND s.field = 'short'
          AND s.locale = 'en'
       )
 WHERE d.slug = 'moussaka-greek';

-- ─────────────────────────────────────────────────────────────────────
-- 2. biryani-hyderabadi — the two short sentences
-- ─────────────────────────────────────────────────────────────────────
--
-- The old pair said "marinated meat (typically chicken, mutton, or
-- goat)" and "The Hyderabadi version is among the most famous."
--
-- "Among the most famous" is a standing claim with nothing behind it.
-- The source's own comparison is with the Lucknowi style, and the
-- source names the accompaniments. The new pair says what the dish
-- is made of and what it is served with — both checkable.
--
-- The long description already names "mirchi ka salan" and "dahi
-- chutney" correctly, and is left alone.

UPDATE description_sentences s
   SET text = 'A mixed rice dish of layered basmati rice, marinated meat, fried onions, saffron and whole spices. '
  FROM dishes d
 WHERE s.dish_id = d.id
   AND d.slug = 'biryani-hyderabadi'
   AND s.field = 'short'
   AND s.locale = 'en'
   AND s.position = 1;

UPDATE description_sentences s
   SET text = 'The meat is usually goat, and sometimes chicken or beef. A biryani is usually served with dahi chutney and mirchi ka salan.'
  FROM dishes d
 WHERE s.dish_id = d.id
   AND d.slug = 'biryani-hyderabadi'
   AND s.field = 'short'
   AND s.locale = 'en'
   AND s.position = 2;

-- Re-render the column from the sentences.
UPDATE dishes d
   SET short_description = (
       SELECT string_agg(s.text, '' ORDER BY s.position)
         FROM description_sentences s
        WHERE s.dish_id = d.id
          AND s.field = 'short'
          AND s.locale = 'en'
       )
 WHERE d.slug = 'biryani-hyderabadi';

-- ─────────────────────────────────────────────────────────────────────
-- 3. The four dishes whose text lives in the column
-- ─────────────────────────────────────────────────────────────────────
--
-- None of these has a 'short' sentence, so `sentence_managed` is
-- false for them and the column is the source of truth.
--
-- The long_description is written for three of them too: "the ethnic
-- festive season" and "other ethnic groups" appear there as well,
-- and the long text renders on the dish page.

-- ayam-pansuh
UPDATE dishes
   SET short_description = 'A Malaysian chicken dish of Sarawak''s Dayaks, cooked in a water-filled bamboo stalk with seasonings and covered with leaves from the cassava plant. It is often served to guests during the festive season.',
       long_description  = 'It is the most common traditional food often served to guests in Sarawak, especially during the festive season.'
 WHERE slug = 'ayam-pansuh';

-- knife-cut-noodles
UPDATE dishes
   SET short_description = 'A Chinese noodle associated with Shanxi, made by thinly slicing a block of dough directly into boiling water. The resulting ribbons are fairly thick and chewy when cooked; among the knife-cut noodle variations in Shanxi, the style from Datong is the best known.',
       long_description  = 'As the name implies, unlike pulled noodles, they are prepared by thinly cutting a block of dough directly into boiling water. The resulting noodles are ribbon-shaped, fairly thick, and chewy when cooked. Among the knife-cut noodle variations in Shanxi, the style from Datong became the most famous.'
 WHERE slug = 'knife-cut-noodles';

-- kuksi
UPDATE dishes
   SET short_description = 'A cold, often spicy noodle dish with beef from the Koryo-saram cuisine of Koryo-saram communities in the former Soviet Union, a variation on janchi-guksu.',
       long_description  = 'It is served cold and often spicy with beef. It is the Koryo-saram version of janchi-guksu.'
 WHERE slug = 'kuksi';

-- luwombo
UPDATE dishes
   SET short_description = 'A Ugandan stew or sauce made with smoked young leaves of the Ndiizi banana plant. Reserved for Buganda''s kings and princes from 1887, it is now eaten by the Baganda generally and by other Ugandan communities.',
       long_description  = 'Starting in 1887 in pre-colonial Buganda, the dish was reserved for kings and princes, but has since become eaten by the general Baganda populace, and by other communities in Uganda.'
 WHERE slug = 'luwombo';

-- ─────────────────────────────────────────────────────────────────────
-- 4. The assertions
-- ─────────────────────────────────────────────────────────────────────
--
-- These check the RESULT, not the attempt. A migration that updated
-- zero rows would still pass every statement above; these would not.

DO $$
DECLARE
  rec record;
BEGIN
  -- The unsupported claim is gone.
  IF EXISTS (
    SELECT 1
      FROM description_sentences s
      JOIN dishes d ON d.id = s.dish_id
     WHERE d.slug = 'moussaka-greek'
       AND s.text LIKE '%national dish%'
  ) THEN
    RAISE EXCEPTION 'moussaka-greek still claims to be a national dish';
  END IF;

  -- The unsupported beef-broth claim is gone.
  IF EXISTS (
    SELECT 1 FROM dishes
     WHERE slug = 'knife-cut-noodles'
       AND (short_description ILIKE '%beef broth%' OR long_description ILIKE '%beef broth%')
  ) THEN
    RAISE EXCEPTION 'knife-cut-noodles still claims beef broth';
  END IF;

  -- "raita" was never in the source; "dahi chutney" is.
  IF EXISTS (
    SELECT 1 FROM dishes
     WHERE slug = 'biryani-hyderabadi'
       AND (short_description ILIKE '%raita%' OR long_description ILIKE '%raita%')
  ) THEN
    RAISE EXCEPTION 'biryani-hyderabadi still says raita';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM dishes
     WHERE slug = 'biryani-hyderabadi'
       AND short_description ILIKE '%dahi chutney%'
  ) THEN
    RAISE EXCEPTION 'biryani-hyderabadi is missing dahi chutney';
  END IF;

  -- The "ethnic" phrase is gone from all three of the dishes that had it.
  IF EXISTS (
    SELECT 1 FROM dishes
     WHERE slug IN ('ayam-pansuh', 'kuksi', 'luwombo')
       AND (short_description ILIKE '%ethnic%' OR long_description ILIKE '%ethnic%')
  ) THEN
    RAISE EXCEPTION 'the "ethnic" phrase is still present';
  END IF;

  -- Each sentence-managed column matches its sentences exactly. This is
  -- the same invariant the guard trigger enforces, asserted here so a
  -- failed run is visible in the migration's own output.
  FOR rec IN
    SELECT d.slug
      FROM dishes d
     WHERE d.slug IN ('moussaka-greek', 'biryani-hyderabadi')
  LOOP
    IF EXISTS (
      SELECT 1
        FROM dishes d
       WHERE d.slug = rec.slug
         AND d.short_description IS DISTINCT FROM (
               SELECT string_agg(s.text, '' ORDER BY s.position)
                 FROM description_sentences s
                WHERE s.dish_id = d.id
                  AND s.field = 'short'
                  AND s.locale = 'en'
              )
    ) THEN
      RAISE EXCEPTION 'short_description for % does not match its sentences', rec.slug;
    END IF;
  END LOOP;
END
$$;

COMMIT;
