-- =====================================================================
-- GUS-014 correction — the approved broader-family and technique fixes
--
-- Approved by Alejandro 2026-10-26. Applies the corrections to the
-- broader-family decisions.
--
-- FAMILY CORRECTIONS
--   filled-pastry  = empanada + samosa only.
--                     acaraje and takoyaki move to fritter; dolma is unset.
--   fritter        = acaraje + takoyaki + falafel + tempura + vada.
--                     tostones is unset.
--   dolma          -> family unset (a family of stuffed vegetables, not a
--                      single pastry form).
--   tostones       -> family unset.
--
-- TECHNIQUE CORRECTIONS
--   fattoush       -> technique unset. Its 'frying' was DESCRIPTION-DERIVED
--                      ('toasted or fried pieces of pita') - that is a
--                      guess, not an established method, so it is removed.
--   lechon         -> technique 'spit-roasting' instead of 'grilling'.
--                      A whole-roasted pig is spit-roasted over charcoal.
--
-- PROVENANCE
--   The description-derived technique rows are tagged
--   provenance = 'description-derived' and status = 'provisional', so
--   they can be told apart from technique values that came from the
--   preparation method (the catalog's own recorded method).
--
--   This is a TEMPORARY mechanism. ADR-002 (the claims model) will carry
--   provenance properly, and these columns are expected to be replaced
--   by a claim link then. The column is added to the TECHNIQUE join table
--   ONLY - no other dimension join table has a description-derived value.
--
-- Idempotent: re-running finds nothing to change.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1. A narrow provenance + status pair on the technique join table.
-- ---------------------------------------------------------------------
ALTER TABLE dish_dish_techniques
  ADD COLUMN IF NOT EXISTS provenance text NOT NULL DEFAULT 'preparation',
  ADD COLUMN IF NOT EXISTS status      text NOT NULL DEFAULT 'active';

COMMENT ON COLUMN dish_dish_techniques.provenance IS
  'How the technique was established: preparation (the catalog''s own recorded method) | description-derived (read from the dish short_description)';
COMMENT ON COLUMN dish_dish_techniques.status IS
  'active | provisional - a value inferred rather than evidenced, pending a claim';

-- ---------------------------------------------------------------------
-- 2. The description-derived technique rows: tag their provenance.
-- ---------------------------------------------------------------------
UPDATE dish_dish_techniques j
SET provenance = 'description-derived',
    status = 'provisional'
FROM dishes d
WHERE j.dish_id = d.id
  AND d.slug IN ('baba-ganoush','falafel','gado-gado','hummus','pempek');

-- ---------------------------------------------------------------------
-- 3. fattoush: remove the description-derived 'frying'.
-- ---------------------------------------------------------------------
DELETE FROM dish_dish_techniques j
USING dishes d, dish_techniques v
WHERE j.dish_id = d.id AND j.value_id = v.id
  AND d.slug = 'fattoush' AND v.slug = 'frying';

-- ---------------------------------------------------------------------
-- 4. lechon: spit-roasting instead of grilling.
-- ---------------------------------------------------------------------
DELETE FROM dish_dish_techniques j
USING dishes d, dish_techniques v
WHERE j.dish_id = d.id AND j.value_id = v.id
  AND d.slug = 'lechon' AND v.slug IN ('grilling', 'roasting');

INSERT INTO dish_dish_techniques (dish_id, value_id, provenance, status)
SELECT d.id, v.id, 'preparation', 'active'
FROM dishes d, dish_techniques v
WHERE d.slug = 'lechon' AND v.slug = 'spit-roasting'
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------
-- 5. Family moves.
-- ---------------------------------------------------------------------
-- filled-pastry: remove acaraje, takoyaki and dolma.
DELETE FROM dish_dish_families j
USING dishes d, dish_families v
WHERE j.dish_id = d.id AND j.value_id = v.id
  AND v.slug = 'filled-pastry'
  AND d.slug IN ('acaraje', 'takoyaki', 'dolma');

-- fritter: remove tostones; add acaraje and takoyaki.
DELETE FROM dish_dish_families j
USING dishes d, dish_families v
WHERE j.dish_id = d.id AND j.value_id = v.id
  AND v.slug = 'fritter' AND d.slug = 'tostones';

INSERT INTO dish_dish_families (dish_id, value_id)
SELECT d.id, v.id FROM dishes d, dish_families v
WHERE (d.slug = 'acaraje' AND v.slug = 'fritter')
   OR (d.slug = 'takoyaki' AND v.slug = 'fritter')
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------
-- 6. Provenance - one edit_history row per touched dish, updated_at bump.
-- ---------------------------------------------------------------------
INSERT INTO edit_history (id, user_id, target_type, target_id, action, diff, comment)
SELECT gen_random_uuid(), 'hermes', 'dish', d.id, 'update',
       jsonb_build_object(
         'operation', 'GUS-014 broader-family corrections',
         'detail', 'filled-pastry narrowed to empanada+samosa; acaraje+takoyaki to fritter; dolma and tostones unset; fattoush technique unset; lechon technique spit-roasting; description-derived techniques tagged provisional'
       ),
       'GUS-014 broader-family corrections'
FROM dishes d
WHERE d.slug IN ('acaraje','takoyaki','dolma','tostones','fattoush','lechon',
                 'baba-ganoush','falafel','gado-gado','hummus','pempek')
  AND NOT EXISTS (
    SELECT 1 FROM edit_history e
    WHERE e.target_type='dish' AND e.target_id=d.id
      AND e.comment='GUS-014 broader-family corrections'
  );

UPDATE dishes
SET updated_at = now()
WHERE slug IN ('acaraje','takoyaki','dolma','tostones','fattoush','lechon',
               'baba-ganoush','falafel','gado-gado','hummus','pempek');

COMMIT;
