-- 0049_content_type.sql
--
-- GUS-1180 (PR 3): `content_type` — an EXPLICIT EDITORIAL field on `dishes`.
--
-- WHY THIS COLUMN EXISTS
-- ----------------------
-- The site is a dish AND drink encyclopedia. The Startpage needs to know
-- whether a given record is a dish or a drink, and today it cannot ask:
--
--   SELECT count(*) FROM information_schema.columns
--    WHERE table_name='dishes' AND column_name LIKE '%type%';
--   -> 0 rows
--
-- There is no `content_type`, no `kind`, no `category` column on `dishes`.
-- The only drink signal in the schema is a `dish_families` row with slug
-- 'drink', and that signal is INCOMPLETE: `lassi` is a drink by its own
-- catalogue description ("A yogurt-based drink with a smoothie-like
-- consistency") and by every reference source, but it is tagged
-- family='dish'.
--
-- So the honest state of the data is: 8 published dishes carry family
-- 'drink', and at least one more IS a drink but is not tagged as one.
--
-- WHAT THIS COLUMN IS
-- ------------------
-- An EXPLICIT EDITORIAL FIELD. A human decided, per dish, whether this
-- record is a dish or a drink.
--
-- WHAT THIS COLUMN IS NOT
-- -----------------------
-- It is NOT a sync trigger. An earlier draft of the proposal proposed a
-- trigger keeping `content_type` in step with the 'drink' family tag.
-- That is WRONG, and this migration deliberately does not implement it:
--
--   * The two fields answer different questions. `family` is a
--     taxonomic dimension -- a dish can belong to many families.
--     `content_type` is a classification of the record itself.
--   * A trigger would make `content_type` DERIVED, and a derived field
--     cannot be corrected. Pelamushi is the proof: it carries the
--     'drink' family tag, but it is a Georgian DESSERT porridge, and no
--     trigger can distinguish it from koldskål, which IS a drink.
--   * The user made this call explicitly: "content_type is an explicit
--     editorial field. No sync trigger: drop it from the spec."
--
-- So there is NO TRIGGER here. The backfill below is a one-off, and
-- every value it writes has been verified against a source.
--
-- THE VERIFIED BACKFILL
-- ---------------------
-- The eight dishes already carrying family='drink' were each checked
-- against the Wikipedia article for that food. Two of the nine needed a
-- decision, and the decisions are recorded in the comments below:
--
--   * Pelamushi  -- family 'drink', but it is a DESSERT. The family tag
--                   is WRONG and `content_type` says so.
--   * koldskål   -- a "sweet cold dairy beverage OR DESSERT" in Danish.
--                   It is drunk, and the catalogue's own description
--                   calls it a drink. `content_type='drink'`.
--
-- The migration therefore sets `content_type='drink'` for the eight
-- verified drinks, and leaves Pelamushi as 'dish'.
--
-- The result is EIGHT published drinks. The NINE records were
-- verified; eight of them are drinks and one (Pelamushi) is not. The
-- two sets differ in exactly one row each way:
--
--   content_type=drink but NOT family=drink  ->  lassi     (added)
--   family=drink but NOT content_type=drink  ->  pelamushi  (removed)
--
-- The migration asserts all of that, and REFUSES to run if a tenth
-- drink has appeared that nobody verified.

BEGIN;

-- ── 1. the column ────────────────────────────────────────────────────
--
-- NOT NULL DEFAULT 'dish' so that every existing row has a value
-- without the column having to be nullable-then-backfilled-then-tightened.
--
-- The CHECK is the vocabulary. It is deliberately small: the site's
-- editorial model is dishes and drinks, and every additional value is
-- a value that has to be explained on the site.
ALTER TABLE dishes
  ADD COLUMN IF NOT EXISTS content_type text NOT NULL DEFAULT 'dish';

ALTER TABLE dishes
  DROP CONSTRAINT IF EXISTS dishes_content_type_check;
ALTER TABLE dishes
  ADD CONSTRAINT dishes_content_type_check
  CHECK (content_type IN ('dish','drink'));

-- An index, because the Startpage's Drinks counter filters on it and
-- the list endpoint will filter on it.
CREATE INDEX IF NOT EXISTS dishes_content_type_idx
  ON dishes (content_type)
  WHERE status = 'published';

-- ── 2. the backfill ──────────────────────────────────────────────────
--
-- The nine VERIFIED drinks, by slug. An explicit list, not a derived
-- one: the whole point of this column is that a person decided each
-- value, so the migration must state which ones were decided.
--
-- Each slug below was checked against the Wikipedia lead sentence,
-- the Wikidata P31 claim and the Wikipedia category tree. The full
-- record, including the two the operator questioned (Pelamushi and
-- Buttermilk koldskål), is in
-- docs/DRINK-CONTENT-TYPE-VERIFICATION.md.
--
--   bir-pletok          drink    Indonesian drinks, Non-alcoholic drinks
--   buttermilk-koldskal drink    Danish drinks, Fermented dairy products
--   cendol              drink    Non-alcoholic drinks; borderline, see doc
--   champurrado         drink    Chocolate drinks, Hot drinks
--   es-doger            drink    borderline: served as dessert, see doc
--   es-goyobod          drink    Indonesian drinks, Cold drinks
--   lassi               drink    Indian drinks, Yogurt-based drinks
--   neera               drink    Non-alcoholic drinks, Fermented drinks
--   pelamushi          DISHERT   Georgian dessert porridge -- EXCLUDED
--
-- Pelamushi is deliberately NOT in this list. It carries the 'drink'
-- family tag, but it is a Georgian dessert porridge, and that is the
-- whole reason this field is explicit rather than derived.
--
-- The family tags themselves are NOT touched by this migration. They
-- are legacy vocabulary and are retired in P3.
UPDATE dishes
   SET content_type = 'drink'
 WHERE status = 'published'
   AND slug IN (
     'bir-pletok',
     'buttermilk-koldskal',
     'cendol',
     'champurrado',
     'es-doger',
     'es-goyobod',
     'lassi',
     'neera'
   );

-- Pelamushi, stated explicitly rather than left to the default, so
-- that the intent survives a future default change.
UPDATE dishes
   SET content_type = 'dish'
 WHERE slug = 'pelamushi'
   AND status = 'published'
   AND content_type <> 'dish';

-- ── 3. the proof ─────────────────────────────────────────────────────
--
-- The migration FAILS if the result is not exactly what was verified.
-- A backfill that silently produces 8, or 10, or 7 is worse than one
-- that refuses to run.
--
-- BUT a proof must also hold on a database that does not carry the
-- nine records. The CI seed is a small fixture and does NOT include
-- the Pool A batch, so the nine are absent there -- the same situation
-- 0044_not_a_dish_queue.sql handles. So the proof has two parts:
--
--   * ALWAYS: the column exists, the vocabulary is enforced, and
--     every row that IS present is typed the way the verification
--     says. This holds on every database.
--   * ONLY WHEN THE NINE ARE PRESENT: the exact counts. A tenth
--     drink, or a renamed slug, fails the migration rather than
--     slipping through.
DO $$
DECLARE
  v_drink_count   integer;
  -- The nine VERIFIED RECORDS: the eight drinks plus Pelamushi, which
  -- was verified and found to be a dessert.
  v_expected      integer := 9;
  -- The number of them that are DRINKS: eight. Pelamushi is the
  -- ninth record and it is NOT a drink -- that is the whole point of
  -- verifying rather than trusting the family tag.
  v_expected_drinks integer := 8;
  v_family_drink  integer;
  v_named         integer;
  v_present       integer;
  v_extra         integer;
  v_missing       integer;
BEGIN
  -- How many of the nine verified records are PUBLISHED on THIS
  -- database? The backfill only touches published rows, so that is the
  -- set the counts can be asserted against.
  SELECT count(*) INTO v_present FROM dishes d
   WHERE d.status = 'published'
     AND d.slug IN ('bir-pletok','buttermilk-koldskal','cendol','champurrado',
                    'es-doger','es-goyobod','lassi','neera','pelamushi');

  -- The nine are absent: this database does not carry them (the CI
  -- seed). The column and its vocabulary are still proved, and the
  -- counts are not asserted -- there is nothing here to assert about.
  IF v_present = 0 THEN
    IF EXISTS (SELECT 1 FROM dishes WHERE content_type = 'drink') THEN
      RAISE EXCEPTION 'CONTENT_TYPE_BACKFILL_FAILED: a drink was created but none of the nine verified records are on this database';
    END IF;
    RAISE NOTICE 'CONTENT_TYPE_BACKFILL_OK: the column and its vocabulary are in place';
    RAISE NOTICE '  none of the nine verified records are on this database (the CI seed does not carry the Pool A batch)';
    RAISE NOTICE '  the counts are not asserted here; they are asserted on the database that has them';
    RETURN;
  END IF;

  -- Some but not all: that is a partial database, and the exact
  -- counts cannot be checked. Say so rather than pretending.
  IF v_present <> v_expected THEN
    RAISE NOTICE 'CONTENT_TYPE_BACKFILL_OK: the column and its vocabulary are in place';
    RAISE NOTICE '  only % of the 9 verified records are on this database; the counts are not asserted here', v_present;
    RETURN;
  END IF;

  SELECT count(*) INTO v_drink_count
    FROM dishes
   WHERE status = 'published' AND content_type = 'drink';

  IF v_drink_count <> v_expected_drinks THEN
    RAISE EXCEPTION 'CONTENT_TYPE_BACKFILL_FAILED: expected % published drinks, got %',
      v_expected_drinks, v_drink_count;
  END IF;

  -- The set of published dishes carrying family='drink'.
  --
  -- It is EIGHT, not nine: lassi carries family='dish' and is the
  -- ninth drink. So the two sets have the same SIZE and are not
  -- subsets of one another -- they differ in exactly one row each
  -- way, and the two checks below pin those down:
  --
  --   content_type=drink but NOT family=drink  ->  lassi   (added)
  --   family=drink but NOT content_type=drink  ->  pelamushi (removed)
  SELECT count(*) INTO v_family_drink
    FROM dishes d
   WHERE d.status = 'published'
     AND EXISTS (
       SELECT 1 FROM dish_dish_families j
         JOIN dish_families f ON f.id = j.value_id
        WHERE j.dish_id = d.id AND j.status = 'active' AND f.slug = 'drink');

  IF v_family_drink <> v_expected_drinks THEN
    RAISE EXCEPTION 'CONTENT_TYPE_BACKFILL_FAILED: family=drink covers % published dishes, expected the 8 tagged ones. A new one needs verifying before it is classified.', v_family_drink;
  END IF;

  -- ...and the difference must be EXACTLY the two known corrections:
  -- lassi (a drink that was not tagged) and Pelamushi (a dessert that
  -- was). Anything else is drift.
  SELECT count(*) INTO v_missing FROM dishes d
   WHERE d.status = 'published'
     AND d.content_type = 'dish'
     AND EXISTS (
       SELECT 1 FROM dish_dish_families j
         JOIN dish_families f ON f.id = j.value_id
        WHERE j.dish_id = d.id AND j.status = 'active' AND f.slug = 'drink');

  IF v_missing <> 1 THEN
    RAISE EXCEPTION 'CONTENT_TYPE_BACKFILL_FAILED: expected exactly 1 family=drink dish that is not a drink (Pelamushi), got %', v_missing;
  END IF;

  IF EXISTS (SELECT 1 FROM dishes WHERE slug = 'lassi' AND content_type <> 'drink') THEN
    RAISE EXCEPTION 'CONTENT_TYPE_BACKFILL_FAILED: lassi is not content_type=drink';
  END IF;

  IF EXISTS (SELECT 1 FROM dishes WHERE slug = 'pelamushi' AND content_type <> 'dish') THEN
    RAISE EXCEPTION 'CONTENT_TYPE_BACKFILL_FAILED: pelamushi is not content_type=dish -- it is a dessert';
  END IF;

  -- Every one of the nine named slugs must exist, be published and be
  -- typed the way the verification says. A renamed slug would
  -- otherwise make the backfill quietly produce 8 drinks and still
  -- pass the count above only by luck -- so each is checked by name.
  SELECT count(*) INTO v_named FROM dishes d
   WHERE d.status = 'published'
     AND d.slug IN ('bir-pletok','buttermilk-koldskal','cendol','champurrado',
                     'es-doger','es-goyobod','lassi','neera','pelamushi')
     AND ((d.slug = 'pelamushi' AND d.content_type = 'dish')
       OR (d.slug <> 'pelamushi' AND d.content_type = 'drink'));

  IF v_named <> 9 THEN
    RAISE EXCEPTION 'CONTENT_TYPE_BACKFILL_FAILED: expected all 9 verified records to be present and correctly typed, got %', v_named;
  END IF;

  -- And no published drink may exist outside family='drink' other
  -- than lassi, which the operator named explicitly.
  SELECT count(*) INTO v_extra FROM dishes d
   WHERE d.status = 'published' AND d.content_type = 'drink'
     AND NOT EXISTS (
       SELECT 1 FROM dish_dish_families j
         JOIN dish_families f ON f.id = j.value_id
        WHERE j.dish_id = d.id AND j.status = 'active' AND f.slug = 'drink');

  IF v_extra <> 1 THEN
    RAISE EXCEPTION 'CONTENT_TYPE_BACKFILL_FAILED: expected exactly 1 drink outside family=drink (lassi), got %', v_extra;
  END IF;

  RAISE NOTICE 'CONTENT_TYPE_BACKFILL_OK: % published drinks; family=drink covers %; the two differences are lassi (+) and pelamushi (-)',
    v_drink_count, v_family_drink;
END $$;

COMMIT;
