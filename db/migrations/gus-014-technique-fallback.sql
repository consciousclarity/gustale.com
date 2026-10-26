-- =====================================================================
-- GUS-014 follow-up — technique values from the dish's own description
--
-- Nine dishes carry the preparation 'Small plates & preserves', which is
-- a SERVING FORMAT rather than a method, so the preparation alone left
-- them with no technique at all. Their own short_description carries the
-- method, so the technique is taken from there.
--
-- Each value below is recorded explicitly against the phrase in the
-- dish's own description - these are not keyword guesses.
--
--   baba-ganoush  roasting    "fire-roasted eggplant blended with tahini"
--   falafel       frying      "deep-fried balls or patties of ground chickpeas"
--   fattoush      frying      "tossed with toasted or fried pieces of pita"
--   gado-gado     blanching   "blanched and steamed vegetables, hard-boiled egg,
--                 steaming              fried tofu"
--                 boiling
--                 frying
--   hummus        boiling     "cooked, mashed chickpeas"
--   pempek        boiling     "boiled, sliced, and fried"
--                 frying
--
-- Idempotent: re-running finds nothing to change.
-- =====================================================================

BEGIN;

INSERT INTO dish_dish_techniques (dish_id, value_id)
SELECT d.id, v.id
FROM dishes d, dish_techniques v
WHERE (d.slug = 'baba-ganoush' AND v.slug = 'roasting')
   OR (d.slug = 'falafel'      AND v.slug = 'frying')
   OR (d.slug = 'fattoush'     AND v.slug = 'frying')
   OR (d.slug = 'gado-gado'    AND v.slug IN ('blanching', 'boiling', 'frying', 'steaming'))
   OR (d.slug = 'hummus'       AND v.slug = 'boiling')
   OR (d.slug = 'pempek'       AND v.slug IN ('boiling', 'frying'))
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------
-- Provenance - one edit_history row per touched dish, updated_at bump.
-- ---------------------------------------------------------------------
INSERT INTO edit_history (id, user_id, target_type, target_id, action, diff, comment)
SELECT gen_random_uuid(), 'hermes', 'dish', d.id, 'update',
       jsonb_build_object(
         'operation', 'GUS-014 technique fallback',
         'detail', 'technique taken from the dish description - the preparation names a serving format'
       ),
       'GUS-014 technique fallback'
FROM dishes d
WHERE d.slug IN ('baba-ganoush','falafel','fattoush','gado-gado','hummus','pempek')
  AND NOT EXISTS (
    SELECT 1 FROM edit_history e
    WHERE e.target_type='dish' AND e.target_id=d.id
      AND e.comment='GUS-014 technique fallback'
  );

UPDATE dishes
SET updated_at = now()
WHERE slug IN ('baba-ganoush','falafel','fattoush','gado-gado','hummus','pempek');

COMMIT;
