-- GUS-242 / ADR-003 layer 3b — the sentence translations.
--
-- ADR-003 layer 3, the prose:
--
--   - The English description is the CANONICAL text.
--   - Evidence anchors stay on the ENGLISH sentence. A claim's
--     excerpt, anchor and stance belong to the English sentence they
--     were extracted from — they are not re-extracted per translation.
--   - The description is stored as SENTENCES, and each sentence is
--     translated individually.
--   - Translations INHERIT the source sentence's claim anchors: the
--     translated sentence references the same statement_id / claim as
--     its English source. The anchor text stays English (it is a
--     verbatim excerpt of the source); the surrounding sentence is
--     translated.
--   - Store a SOURCE HASH per translated sentence. When the English
--     source sentence changes, its hash changes, and the translation
--     is marked STALE. A stale translation is auto-retranslated on
--     change (queued, not blocking).
--   - Each translated sentence carries a status: draft -> machine ->
--     reviewed, with stale as an OVERLAY flag.
--   - Translated sentences are badged "machine-translated" in the UI
--     unless they are reviewed.
--   - Contributor corrections go through the existing moderation path
--     — a contributor proposes a correction, a moderator accepts it,
--     and the correction becomes the reviewed text.
--
-- WHY A NEW TABLE AND NOT `dish_translations`:
--
-- ADR-003 offered the choice: reuse `dish_translations` (after the
-- GUS-239 archive) or add a sentence-level table. The sentence-level
-- table wins, for a reason the ADR itself names: the translation has
-- to be a SENTENCE, because a sentence is what carries the claim
-- anchors and what carries the stale flag. `dish_translations` holds
-- one `description` per dish per language — a whole blob. A blob
-- cannot be marked stale for one changed sentence, cannot carry a
-- per-sentence status, and cannot be reviewed one sentence at a time.
--
-- So: `description_sentence_translations` is a NEW table, and
-- `dish_translations` is left alone. It is NOT archived as part of
-- this migration. The ADR said "reuse dish_translations (after
-- GUS-239 archive)"; GUS-239 is not in the backlog and its archive
-- has not happened, so archiving it here would destroy data that
-- something else may still depend on. The sentence table is
-- additive: it does not touch `dish_translations` at all.
--
-- The status machine:
--
--   draft    -> a translation exists but no engine has blessed it
--   machine  -> produced by the translation engine, not reviewed
--   reviewed -> a human has confirmed it
--
-- `stale` is NOT a status — it is an overlay flag, exactly as the
-- ADR says. A stale `reviewed` translation is still `reviewed`; it
-- is just flagged as needing re-translation. Making it a status would
-- lose the information about WHO last confirmed it.
--
-- The source hash:
--
-- The hash is of the ENGLISH SOURCE SENTENCE, not of the English
-- description. That is what makes staleness per-sentence: editing
-- sentence 3 of a description invalidates the translation of
-- sentence 3 and leaves sentences 1, 2 and 4 alone.

\set ON_ERROR_STOP on

BEGIN;

-- ── The enums ──────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'sentence_translation_status') THEN
    CREATE TYPE sentence_translation_status AS ENUM ('draft', 'machine', 'reviewed');
  END IF;
END
$$;

-- ── The translation table ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS description_sentence_translations (
  id                  uuid PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- the ENGLISH sentence this is a translation of. The claim
  -- anchors are inherited from this row.
  source_sentence_id  uuid NOT NULL REFERENCES description_sentences(id) ON DELETE CASCADE,

  -- the locale of the translation
  locale              text NOT NULL,

  -- the translated text
  text                text NOT NULL,

  -- the hash of the ENGLISH SOURCE SENTENCE at the time this
  -- translation was made. When the source changes, this no longer
  -- matches and the translation is stale.
  source_hash         text NOT NULL,

  -- the status machine: draft -> machine -> reviewed
  status              sentence_translation_status NOT NULL DEFAULT 'draft',

  -- the OVERLAY flag, not a status. A stale translation still
  -- remembers whether it was reviewed.
  is_stale            boolean NOT NULL DEFAULT false,

  -- the engine that produced this translation, for the audit trail
  translator          text,

  -- who reviewed it, and when
  reviewed_by         text REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at         timestamptz,

  -- the contributor correction, when one is proposed. The correction
  -- goes through moderation: it becomes the `text` only when it is
  -- accepted, at which point the status becomes 'reviewed'.
  proposed_text       text,
  proposed_by         text REFERENCES users(id) ON DELETE SET NULL,
  proposed_at         timestamptz,
  proposal_status     text,

  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),

  -- one translation per (source sentence, locale)
  CONSTRAINT description_sentence_translations_unique
    UNIQUE (source_sentence_id, locale),

  -- a translation is never in the source locale — that would be a
  -- second canonical text.
  CONSTRAINT description_sentence_translations_not_source
    CHECK (locale <> 'en')
);

CREATE INDEX IF NOT EXISTS description_sentence_translations_source_idx
  ON description_sentence_translations (source_sentence_id);

CREATE INDEX IF NOT EXISTS description_sentence_translations_locale_idx
  ON description_sentence_translations (locale);

-- the stale ones, for the re-translation queue
CREATE INDEX IF NOT EXISTS description_sentence_translations_stale_idx
  ON description_sentence_translations (is_stale, locale)
  WHERE is_stale;

-- ── The source hash function ───────────────────────────────────────────
--
-- The hash is of the source sentence's text, so it changes exactly
-- when the source changes. sha256 is used because it is in core
-- PostgreSQL (pgcrypto) and is collision-resistant enough here.
CREATE OR REPLACE FUNCTION description_sentence_source_hash(p_text text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT encode(sha256(convert_to(coalesce(p_text, ''), 'UTF8')), 'hex');
$$;

-- ── The staleness trigger ──────────────────────────────────────────────
--
-- "When the English source sentence changes, its hash changes, and
-- the translation is marked stale."
--
-- So when an ENGLISH sentence's text changes, every translation of
-- it is marked stale. A translation of a translation does not exist,
-- so the trigger only has to look one level up.
CREATE OR REPLACE FUNCTION description_sentences_mark_translations_stale()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- Only the CANONICAL (English) sentences have translations.
  IF NEW.locale <> 'en' THEN
    RETURN NEW;
  END IF;

  -- Only a TEXT change matters. A touch of updated_at does not
  -- invalidate the translation.
  IF NEW.text IS NOT DISTINCT FROM OLD.text THEN
    RETURN NEW;
  END IF;

  UPDATE description_sentence_translations
     SET is_stale = true,
         updated_at = now()
   WHERE source_sentence_id = NEW.id
     AND is_stale = false;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS description_sentences_mark_translations_stale_trg
  ON description_sentences;
CREATE TRIGGER description_sentences_mark_translations_stale_trg
  AFTER UPDATE OF text ON description_sentences
  FOR EACH ROW
  EXECUTE FUNCTION description_sentences_mark_translations_stale();

-- ── The moderation trigger: an accepted correction is reviewed ────────
--
-- "a contributor proposes a correction, a moderator accepts it, and
-- the correction becomes the reviewed text."
--
-- So when the proposal is marked accepted, the proposal's text
-- becomes the translation's text, the status becomes 'reviewed', and
-- the proposal is cleared.
CREATE OR REPLACE FUNCTION description_sentence_translations_apply_proposal()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.proposal_status IS DISTINCT FROM OLD.proposal_status
     AND NEW.proposal_status = 'accepted'
     AND NEW.proposed_text IS NOT NULL THEN
    NEW.text := NEW.proposed_text;
    NEW.status := 'reviewed';
    NEW.reviewed_at := now();
    NEW.proposed_text := NULL;
    NEW.proposed_by := NULL;
    NEW.proposed_at := NULL;
    NEW.proposal_status := NULL;
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS description_sentence_translations_apply_proposal_trg
  ON description_sentence_translations;
CREATE TRIGGER description_sentence_translations_apply_proposal_trg
  BEFORE UPDATE ON description_sentence_translations
  FOR EACH ROW
  EXECUTE FUNCTION description_sentence_translations_apply_proposal();

-- ── The assertions ─────────────────────────────────────────────────────
DO $$
DECLARE
  n integer;
BEGIN
  IF to_regclass('description_sentence_translations') IS NULL THEN
    RAISE EXCEPTION 'description_sentence_translations was not created';
  END IF;

  IF to_regprocedure('description_sentence_source_hash(text)') IS NULL THEN
    RAISE EXCEPTION 'the source hash function was not created';
  END IF;

  SELECT count(*) INTO n
    FROM pg_trigger
   WHERE tgname = 'description_sentences_mark_translations_stale_trg'
     AND NOT tgisinternal;
  IF n <> 1 THEN
    RAISE EXCEPTION 'the staleness trigger is missing';
  END IF;

  SELECT count(*) INTO n
    FROM pg_trigger
   WHERE tgname = 'description_sentence_translations_apply_proposal_trg'
     AND NOT tgisinternal;
  IF n <> 1 THEN
    RAISE EXCEPTION 'the moderation trigger is missing';
  END IF;

  -- The hash function must actually work.
  IF description_sentence_source_hash('abc') = description_sentence_source_hash('abd') THEN
    RAISE EXCEPTION 'the source hash function collides on different inputs';
  END IF;

  RAISE NOTICE 'description_sentence_translations is ready';
END
$$;

COMMIT;
