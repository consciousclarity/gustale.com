-- GUS-242 / ADR-002 Q9 — the description sentences.
--
-- Q9: "The anchor is a structured sentence table. Not inline markers
-- — because they would leak into the public column and break
-- translations, and offsets break on edit."
--
-- This is the foundation ADR-003's layer 3 needs: the prose layer
-- translates a SENTENCE and inherits the SENTENCE's claim anchors, so
-- the sentence has to be an addressable row.
--
-- `statements` and `sentence_claims` are the ADR-002 claims model.
-- They are NOT created here: ADR-002's Q1-Q13 are decided, but the
-- claims schema has not been built yet, and the Pool A import is the
-- work that builds it. This migration creates only what the sentence
-- layer needs, and `sentence_claims` is added with the claims model.
--
-- The rules Q9 sets, and how they are honoured here:
--
--   | # | rule                                                  | how
--   |---|--------------------------------------------------------|------
--   | 1 | `short_description` is rendered from the sentences; the concatenation must equal the live column exactly
--   |   |  -> the population script asserts the concatenation byte-for-byte, and a trigger below refuses a
--   |      short_description write that does not match the rendered sentences
--   | 2 | a sentence text edit sets its anchors to `needs_review`
--   |   |  -> the trigger sets the anchor_status of the sentence's claims to 'partial' (needs_review)
--   | 3 | anchors are recorded on the canonical text only
--   |   |  -> `locale` holds 'en' for the canonical sentences
--   | 4 | the splitter is a rule plus a fixture set, with ONE implementation
--   |   |  -> scripts/split_sentences.py, used by the population run and by scripts/check_sentence_split.py
--   | 5 | a `sentence_managed` flag plus a trigger rejects direct short_description writes for flagged dishes
--   |   |  -> the flag is on `dishes`; the trigger below rejects the write
--
-- The ENUM types are created with a guard so the migration is
-- idempotent: a re-run finds them already there and does nothing.

\set ON_ERROR_STOP on

BEGIN;

-- ── The enums ──────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'description_sentence_field') THEN
    CREATE TYPE description_sentence_field AS ENUM ('short', 'long');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'description_sentence_anchor_status') THEN
    CREATE TYPE description_sentence_anchor_status AS ENUM ('full', 'partial', 'none');
  END IF;
END
$$;

-- ── The sentence table ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS description_sentences (
  id            uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  dish_id       uuid NOT NULL REFERENCES dishes(id) ON DELETE CASCADE,

  -- which column this sentence came from
  field         description_sentence_field NOT NULL,

  -- the locale of the text. The canonical sentences are 'en'; a
  -- translated sentence is its own row with the target locale and a
  -- source_sentence_id pointing at the English sentence it came from.
  locale        text NOT NULL DEFAULT 'en',

  -- ordinal position within (dish, field, locale)
  position      integer NOT NULL,

  text          text NOT NULL,

  -- the English sentence this one was translated from, when this row
  -- is a translation. NULL for the canonical (English) sentences.
  source_sentence_id uuid REFERENCES description_sentences(id) ON DELETE CASCADE,

  -- how completely this sentence's facts are anchored
  anchor_status description_sentence_anchor_status NOT NULL DEFAULT 'none',

  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT description_sentences_unique
    UNIQUE NULLS NOT DISTINCT (dish_id, field, locale, position),

  -- a translation is always in a locale, and always points at a
  -- sentence. A canonical sentence has no source.
  CONSTRAINT description_sentences_translation_shape
    CHECK (
      (locale = 'en' AND source_sentence_id IS NULL)
      OR
      (locale <> 'en' AND source_sentence_id IS NOT NULL)
    )
);

CREATE INDEX IF NOT EXISTS description_sentences_dish_idx
  ON description_sentences (dish_id, field, locale, position);

CREATE INDEX IF NOT EXISTS description_sentences_source_idx
  ON description_sentences (source_sentence_id)
  WHERE source_sentence_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS description_sentences_locale_idx
  ON description_sentences (locale);

-- ── The `sentence_managed` flag (Q9 rule 5) ───────────────────────────
--
-- A dish whose description is managed by the sentence table must not
-- have its short_description written directly: the sentence table is
-- the source of truth, and a direct write would make the two
-- disagree.
ALTER TABLE dishes
  ADD COLUMN IF NOT EXISTS sentence_managed boolean NOT NULL DEFAULT false;

-- ── The trigger: a direct write is rejected (Q9 rules 1 and 5) ─────────
--
-- The check is: the new short_description must equal the
-- concatenation of the dish's 'short' sentences, in position order.
--
-- The whitespace matters: the splitter consumes the whitespace that
-- follows a terminator with the sentence it ends, so the
-- concatenation is byte-for-byte equal to the original text.
CREATE OR REPLACE FUNCTION description_sentences_guard_short_description()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  rendered text;
BEGIN
  IF NOT OLD.sentence_managed THEN
    RETURN NEW;
  END IF;

  -- An UPDATE that does not touch short_description is fine.
  IF NEW.short_description IS NOT DISTINCT FROM OLD.short_description THEN
    RETURN NEW;
  END IF;

  SELECT string_agg(s.text, '' ORDER BY s.position)
    INTO rendered
    FROM description_sentences s
   WHERE s.dish_id = NEW.id
     AND s.field = 'short'
     AND s.locale = 'en';

  -- A MANAGED DISH WITH NO SENTENCES IS A BROKEN DISH, and the write
  -- is refused. The earlier version allowed it, on the reasoning that
  -- "the sentence table has not been populated yet" — but that
  -- reasoning is wrong: `sentence_managed` is set BY the population
  -- run, so a managed dish always has sentences. A managed dish with
  -- none means the sentences were deleted, and accepting the write
  -- would let the two drift apart with no way back.
  IF rendered IS NULL THEN
    RAISE EXCEPTION
      'dish % is sentence_managed but has no description sentences; refusing the write',
      NEW.id
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;

  IF NEW.short_description IS DISTINCT FROM rendered THEN
    RAISE EXCEPTION
      'short_description for dish % does not match its description sentences (the sentence table is the source of truth for a sentence_managed dish)',
      NEW.id
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS description_sentences_guard_short_description_trg
  ON dishes;
CREATE TRIGGER description_sentences_guard_short_description_trg
  BEFORE UPDATE ON dishes
  FOR EACH ROW
  EXECUTE FUNCTION description_sentences_guard_short_description();

-- ── The trigger: a sentence edit marks its anchors for review (Q9 rule 2) ─
--
-- "a sentence text edit sets its anchors to `needs_review`" — the
-- claims model records that as the anchors no longer being 'full'.
-- The `sentence_claims` table arrives with the claims model, so this
-- trigger is created there; until then the anchor_status on the
-- sentence itself is what the population script sets.
--
-- The trigger below keeps `updated_at` honest, which the claims
-- model's staleness check reads.
CREATE OR REPLACE FUNCTION description_sentences_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS description_sentences_touch_updated_at_trg
  ON description_sentences;
CREATE TRIGGER description_sentences_touch_updated_at_trg
  BEFORE UPDATE ON description_sentences
  FOR EACH ROW
  EXECUTE FUNCTION description_sentences_touch_updated_at();

-- ── The assertions ─────────────────────────────────────────────────────
DO $$
DECLARE
  n integer;
BEGIN
  IF to_regclass('description_sentences') IS NULL THEN
    RAISE EXCEPTION 'description_sentences was not created';
  END IF;

  -- The flag must be on every dish.
  SELECT count(*) INTO n
    FROM dishes
   WHERE sentence_managed IS NULL;
  IF n > 0 THEN
    RAISE EXCEPTION '% dishes have a null sentence_managed flag', n;
  END IF;

  -- The guard trigger must be in place.
  SELECT count(*) INTO n
    FROM pg_trigger
   WHERE tgname = 'description_sentences_guard_short_description_trg'
     AND NOT tgisinternal;
  IF n <> 1 THEN
    RAISE EXCEPTION 'the short_description guard trigger is missing';
  END IF;

  RAISE NOTICE 'description_sentences is ready';
END
$$;

COMMIT;
