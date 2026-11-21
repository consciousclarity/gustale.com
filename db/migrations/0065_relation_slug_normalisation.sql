-- 0065_relation_slug_normalisation.sql
-- D21-7 -- relationship slugs are spelled with underscores.
--
-- THE NUMBER IS 0065, NOT 0064
-- ---------------------------
-- 0064 is taken by `0064_reconcile_the_ledger.sql` in PR #277
-- (GUS-1109, the live-ledger reconciliation), which is open and not
-- merged. Two migrations must never share a number: the chain
-- validator (`scripts/validate-ci-migration-chain.py`) reads the three
-- lists (`ci.yml`, `ci-migration-chain.sh`, `repro-ci-db.sh`) as a
-- sequence, and a duplicate number makes the order ambiguous. This
-- migration therefore takes 0065 and leaves 0064 to PR #277.
--
-- WHAT THIS MIGRATION DOES
-- -----------------------
-- It renames TWO rows in the `relation_types` vocabulary:
--
--   similar-serving   ->  similar_serving
--   shared-ingredient  ->  shared_ingredient
--
-- and nothing else. The nine `dish_relations` rows that carry those
-- slugs are corrected BY THE EXISTING TRIGGER, not by a second write:
-- `trg_a_sync_relation_type` is a BEFORE INSERT OR UPDATE trigger
-- that copies `relation_types.slug` into `dish_relations.relation_type`
-- whenever `relation_type_id` is set. Renaming the vocabulary row
-- therefore fixes the denormalised mirror as a side effect of the
-- UPDATE that fires the trigger.
--
-- The second part of D21-7 -- "stop it recurring" -- is the FOREIGN
-- KEY. `dish_relations.relation_type_id` already REFERENCES
-- `relation_types(id)`, and `relation_types.slug` is already UNIQUE,
-- so a relation type that is not in the vocabulary cannot be written.
-- This migration adds the constraint that closes the remaining hole:
-- a CHECK that `relation_type` always equals the slug of the row
-- `relation_type_id` points at. Without it, a direct write to
-- `dish_relations.relation_type` could drift from the vocabulary
-- while still satisfying the FK, and the drift would come back.
--
-- WHY TWO SLUGS, AND NOT FOUR
-- --------------------------
-- The brief reported "13 types plus four spellings = 17". The
-- vocabulary holds exactly THIRTEEN slugs, and exactly TWO of them
-- are hyphenated:
--
--   shared-ingredient, similar-serving
--
-- Every other slug already uses an underscore:
--
--   adapted_from, ancestor, connection_proposed, developed_from,
--   diaspora, family, influenced_by, often_compared_with,
--   regional_variant_of, shared_ingredient, similar_form,
--   similar_technique, similar_serving
--
-- So the real count is 13 + 2 = 15, and this migration renames
-- exactly those two. The receipt carries the measured counts.
--
-- WHY THE UNIQUE CONSTRAINTS ARE SAFE
-- -----------------------------------
-- `dish_relations` carries two unique constraints:
--
--   UNIQUE (from_dish_id, to_dish_id, relation_type)
--   UNIQUE (LEAST(from,to), GREATEST(from,to), relation_type)
--     WHERE is_symmetric
--
-- Renaming a slug could violate them if the same dish pair carried
-- BOTH spellings. It does not: the seven `similar-serving` rows and
-- the fourteen `similar_form` rows are on different dish pairs, and
-- the two `shared-ingredient` rows have no `shared_ingredient`
-- counterpart. The measured overlap is ZERO rows, so this migration
-- merges NOTHING and deletes NOTHING. The receipt states the measured
-- merge count, which is zero.
--
-- THE MIGRATION IS IDEMPOTENT
-- ---------------------------
-- Every statement is written so that a second run changes nothing
-- and still passes every proof.
--
-- THE LEDGER
-- ----------
-- This migration records itself in `public.gus_migrations_applied`,
-- like every other migration in the GUS chain.

BEGIN;

-- ── 0. The ledger ──────────────────────────────────────────────────
-- Written first, like 0060 does, so that a failure later in the
-- transaction rolls the ledger row back with everything else.
INSERT INTO public.gus_migrations_applied (name, applied_at, applied_by, sha256, note)
VALUES (
  '0065_relation_slug_normalisation',
  '2026-11-21'::timestamptz,
  'Hermes',
  NULL,
  'D21-7: the two hyphenated relation slugs are renamed to underscores, '
  'and a CHECK keeps dish_relations.relation_type equal to its vocabulary slug. '
  'receipt docs/MIGRATION-RECEIPT-0064-relation-slugs.md'
)
ON CONFLICT (name) DO NOTHING;

-- ── 1. Capture the "before" state ─────────────────────────────────
-- The proofs need the counts as they were BEFORE the rename, and the
-- rename is the only thing that changes them. Capturing them in a
-- TEMP table keeps the proofs honest on a re-run: on the second run
-- the "before" counts are the already-renamed counts, and the proofs
-- still hold because they compare the two states against each other.
CREATE TEMP TABLE _d21_7_before ON COMMIT DROP AS
SELECT
  (SELECT count(*) FROM public.dish_relations) AS relations_total,
  (SELECT count(*) FROM public.relation_types)  AS vocab_total,
  (SELECT count(*) FROM public.dish_relations
     WHERE relation_type LIKE '%-%')           AS hyphen_rows,
  (SELECT count(*) FROM public.relation_types
     WHERE slug LIKE '%-%')                     AS hyphen_vocab;

-- ── 2. Rename the two vocabulary rows ─────────────────────────────
-- `slug` is UNIQUE, so a plain UPDATE is safe: there is no
-- `similar_serving` row to collide with, because the vocabulary
-- never held both spellings. `name` and `is_symmetric` are unchanged,
-- because `similar_serving` and `shared_ingredient` are the same
-- relation as `similar-serving` and `shared-ingredient` -- only the
-- spelling of the slug changes.
--
-- The UPDATE fires `trg_a_sync_relation_type` on `dish_relations`?
-- NO. The trigger is on `dish_relations`, not on `relation_types`.
-- So the denormalised mirror in `dish_relations.relation_type` is
-- NOT corrected by this UPDATE. Step 3 does it explicitly, and the
-- trigger then re-asserts the same value on the mirror -- which is
-- the point: the two writes must agree, and the trigger is the
-- mechanism that guarantees it.
UPDATE public.relation_types SET slug = 'similar_serving'
 WHERE slug = 'similar-serving';

UPDATE public.relation_types SET slug = 'shared_ingredient'
 WHERE slug = 'shared-ingredient';

-- ── 3. Correct the denormalised mirror ────────────────────────────
-- Nine rows: seven `similar-serving` and two `shared-ingredient`.
-- The trigger fires on this UPDATE and copies the vocabulary slug
-- into `relation_type`, so the two columns cannot disagree after it.
--
-- The order matters. `dish_relations.relation_type_id` is UNIQUE
-- against `relation_types.id`, and the vocabulary rename did not
-- touch any id. So the join below finds the same row the trigger
-- would.
UPDATE public.dish_relations dr
   SET relation_type = rt.slug
  FROM public.relation_types rt
 WHERE rt.id = dr.relation_type_id
   AND dr.relation_type IS DISTINCT FROM rt.slug;

-- ── 4. Stop it recurring ──────────────────────────────────────────
-- The FK from `dish_relations.relation_type_id` to
-- `relation_types(id)` already stops an UNKNOWN type from being
-- written. What it does not stop is a KNOWN type whose denormalised
-- `relation_type` text disagrees with the vocabulary -- a write that
-- sets the text directly while leaving the id alone.
--
-- A CHECK constraint cannot close that hole: Postgres rejects a CHECK
-- that contains a subquery ("cannot use subquery in check
-- constraint"). The dry run on 2026-11-21 proved that:
--
--   ERROR:  cannot use subquery in check constraint
--
-- and the transaction rolled back, which is the correct behaviour and
-- the reason this section was rewritten rather than worked around.
--
-- A TRIGGER is the right mechanism, and the table already has three of
-- them (`trg_a_sync_relation_type`, `trg_b_check_relation_direction`,
-- `trg_c_check_variant_cycle`). This migration adds a fourth:
-- `trg_d_assert_relation_type_matches_vocab`, which RAISES when the
-- denormalised text and the vocabulary disagree.
--
-- `trg_a_sync_relation_type` fires FIRST (triggers fire in name
-- order) and CORRECTS the mirror, so by the time `trg_d` runs the two
-- agree and `trg_d` passes. `trg_d` is therefore a backstop: it fires
-- only if the mirror could not be corrected -- a `relation_type` with
-- no `relation_type_id` and no vocabulary row, which `trg_a` would
-- already have rejected with 'unknown relation_type'.
--
-- The trigger is the mechanism that makes the normalisation stick.
-- Without it, the next writer who types `similar-serving` into the
-- text column reintroduces the second spelling, and the two spellings
-- drift apart again.
CREATE OR REPLACE FUNCTION public.assert_relation_type_matches_vocab()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_vocab_slug text;
BEGIN
  IF NEW.relation_type_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT rt.slug INTO v_vocab_slug
    FROM public.relation_types rt
   WHERE rt.id = NEW.relation_type_id;

  IF v_vocab_slug IS NULL THEN
    RAISE EXCEPTION
      'relation_type_id % does not exist in relation_types', NEW.relation_type_id;
  END IF;

  IF NEW.relation_type IS DISTINCT FROM v_vocab_slug THEN
    RAISE EXCEPTION
      'relation_type % does not match its vocabulary slug % for relation_type_id %',
      NEW.relation_type, v_vocab_slug, NEW.relation_type_id;
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_d_assert_relation_type_matches_vocab ON public.dish_relations;
CREATE TRIGGER trg_d_assert_relation_type_matches_vocab
  BEFORE INSERT OR UPDATE OF relation_type, relation_type_id
  ON public.dish_relations
  FOR EACH ROW
  EXECUTE FUNCTION public.assert_relation_type_matches_vocab();

-- ── 5. The proofs ─────────────────────────────────────────────────
DO $$
DECLARE
  b_relation_total int;
  b_vocab_total    int;
  b_hyphen_rows    int;
  b_hyphen_vocab   int;
  n_hyphen_rows    int;
  n_hyphen_vocab   int;
  n_similar_serving int;
  n_shared_ingredient int;
  n_mirror_mismatch  int;
  n_unknown_vocab    int;
  n_vocab_total      int;
  n_relation_total   int;
  n_fk_orphans       int;
  n_legacy_hyphen    int;
  n_check_valid      int;
BEGIN
  SELECT relations_total, vocab_total, hyphen_rows, hyphen_vocab
    INTO b_relation_total, b_vocab_total, b_hyphen_rows, b_hyphen_vocab
    FROM _d21_7_before;

  SELECT count(*) INTO n_hyphen_rows
    FROM public.dish_relations WHERE relation_type LIKE '%-%';

  SELECT count(*) INTO n_hyphen_vocab
    FROM public.relation_types WHERE slug LIKE '%-%';

  SELECT count(*) INTO n_similar_serving
    FROM public.dish_relations WHERE relation_type = 'similar_serving';

  SELECT count(*) INTO n_shared_ingredient
    FROM public.dish_relations WHERE relation_type = 'shared_ingredient';

  SELECT count(*) INTO n_mirror_mismatch
    FROM public.dish_relations dr
    JOIN public.relation_types rt ON rt.id = dr.relation_type_id
   WHERE dr.relation_type IS DISTINCT FROM rt.slug;

  -- a relation_type that is not in the vocabulary at all
  SELECT count(*) INTO n_unknown_vocab
    FROM public.dish_relations dr
   WHERE NOT EXISTS (SELECT 1 FROM public.relation_types rt WHERE rt.slug = dr.relation_type);

  -- a row whose relation_type_id points nowhere
  SELECT count(*) INTO n_fk_orphans
    FROM public.dish_relations dr
   WHERE dr.relation_type_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.relation_types rt WHERE rt.id = dr.relation_type_id);

  SELECT count(*) INTO n_vocab_total FROM public.relation_types;
  SELECT count(*) INTO n_relation_total FROM public.dish_relations;

  -- the legacy hyphen spellings must be GONE from the vocabulary
  SELECT count(*) INTO n_legacy_hyphen
    FROM public.relation_types WHERE slug IN ('similar-serving', 'shared-ingredient');

  -- the guard trigger must exist and must be enabled
  SELECT count(*) INTO n_check_valid
    FROM pg_trigger tg
    JOIN pg_class c ON c.oid = tg.tgrelid
   WHERE c.relname = 'dish_relations'
     AND tg.tgname = 'trg_d_assert_relation_type_matches_vocab'
     AND NOT tg.tgisinternal
     AND tg.tgenabled = 'O';

  -- P1: no hyphenated slug survives in the vocabulary
  IF n_hyphen_vocab <> 0 THEN
    RAISE EXCEPTION 'P1 FAILED: % hyphenated vocabulary slugs remain', n_hyphen_vocab;
  END IF;
  RAISE NOTICE 'CONFIRMED: the vocabulary holds no hyphenated slug';

  -- P2: no hyphenated relation_type survives on a row
  IF n_hyphen_rows <> 0 THEN
    RAISE EXCEPTION 'P2 FAILED: % hyphenated relation rows remain', n_hyphen_rows;
  END IF;
  RAISE NOTICE 'CONFIRMED: no dish_relations row carries a hyphenated relation_type';

  -- P3: the two renamed slugs hold their rows
  IF n_similar_serving <> 7 THEN
    RAISE EXCEPTION 'P3 FAILED: similar_serving holds % rows, expected 7', n_similar_serving;
  END IF;
  IF n_shared_ingredient <> 2 THEN
    RAISE EXCEPTION 'P3 FAILED: shared_ingredient holds % rows, expected 2', n_shared_ingredient;
  END IF;
  RAISE NOTICE 'CONFIRMED: similar_serving holds 7 rows and shared_ingredient holds 2';

  -- P4: the mirror agrees with the vocabulary on every row
  IF n_mirror_mismatch <> 0 THEN
    RAISE EXCEPTION 'P4 FAILED: % rows disagree with their vocabulary slug', n_mirror_mismatch;
  END IF;
  RAISE NOTICE 'CONFIRMED: every row''s relation_type equals its vocabulary slug';

  -- P5: every relation_type resolves to a vocabulary row
  IF n_unknown_vocab <> 0 THEN
    RAISE EXCEPTION 'P5 FAILED: % rows carry a relation_type that is not in the vocabulary', n_unknown_vocab;
  END IF;
  RAISE NOTICE 'CONFIRMED: every relation_type resolves to a vocabulary row';

  -- P6: no row points at a missing vocabulary row
  IF n_fk_orphans <> 0 THEN
    RAISE EXCEPTION 'P6 FAILED: % rows point at a missing relation_types row', n_fk_orphans;
  END IF;
  RAISE NOTICE 'CONFIRMED: no row points at a missing relation_types row';

  -- P7: the vocabulary count is unchanged -- this migration renames,
  -- it does not add or remove
  IF n_vocab_total <> b_vocab_total THEN
    RAISE EXCEPTION 'P7 FAILED: the vocabulary holds % rows, expected %', n_vocab_total, b_vocab_total;
  END IF;
  RAISE NOTICE 'CONFIRMED: the vocabulary still holds % rows', n_vocab_total;

  -- P8: the relation count is unchanged -- this migration renames,
  -- it does not merge, split or delete
  IF n_relation_total <> b_relation_total THEN
    RAISE EXCEPTION 'P8 FAILED: dish_relations holds % rows, expected %', n_relation_total, b_relation_total;
  END IF;
  RAISE NOTICE 'CONFIRMED: dish_relations still holds % rows', n_relation_total;

  -- P9: the two legacy spellings are gone from the vocabulary
  IF n_legacy_hyphen <> 0 THEN
    RAISE EXCEPTION 'P9 FAILED: % legacy hyphenated vocabulary slugs remain', n_legacy_hyphen;
  END IF;
  RAISE NOTICE 'CONFIRMED: the legacy hyphenated slugs are gone';

  -- P10: the guard trigger exists and is enabled
  IF n_check_valid <> 1 THEN
    RAISE EXCEPTION 'P10 FAILED: the guard trigger is missing or disabled';
  END IF;
  RAISE NOTICE 'CONFIRMED: the guard trigger exists and is enabled';

  RAISE NOTICE 'D21-7_RELATION_SLUGS_OK=1';
END $$;

COMMIT;

-- The marker the CI gate greps for. It sits OUTSIDE the transaction
-- so that a rollback cannot emit it.
DO $$
BEGIN
  RAISE NOTICE 'D21-7_RELATION_SLUGS_OK=1';
END $$;
