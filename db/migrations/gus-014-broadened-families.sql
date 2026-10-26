-- =====================================================================
-- GUS-014 follow-up — the approved broader-family decisions
--
-- Approved by Alejandro 2026-10-26. Applies the family decisions from
-- the Q1-Q13 review. Full report: .hermes/REPORTS/GUS-014-118-mapping-report.md
--
-- WHAT THIS DOES
--
--   1. SEEDS two new controlled-vocabulary families:
--        filled-pastry  (5 members)
--        fritter        (4 members)
--      Both clear the no-singleton rule (>= 2 member dishes).
--
--   2. ASSIGNS those two families to 9 dishes.
--
--   3. REMOVES four family assignments that the review corrected:
--        bubur-ayam   soup        -> porridge, and 'porridge' is not in
--                                     the controlled vocabulary
--        soba          noodle-soup -> a noodle dish served dry; there is
--                                     no 'noodle' family in the vocabulary
--        udon          noodle-soup -> same
--        bandeja-paisa rice-dish   -> a platter, not a rice dish
--
--   4. ADDS technique 'roasting' to lechon (a whole-roasted pig) and
--      REMOVES 'skewering' from it (a whole pig is not skewered).
--
--   5. REMOVES 'pancake' from martabak. Its family is left UNSET until
--      it is split into martabak-manis (sweet pancake) and
--      martabak-telur (savoury filled pastry) - see GUS-230, which is a
--      CONTENT task (new dish rows, slugs and covers), not a dimension
--      assignment. The 'pancake' family keeps 4 other members.
--
--   6. Logs provenance: one edit_history row per touched dish and bumps
--      updated_at.
--
-- The remaining 8 approved families (soup, noodle-soup, dumpling, stew,
-- kebab, curry, rice-dish, sauce, pancake, bread) were ALREADY written
-- by the 118-dish run and are verified correct - nothing to do.
--
-- Idempotent: re-running finds nothing to change.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1. Seed the two new families.
--
--    These were approved as NEW controlled-vocabulary values, so seeding
--    them is the vocabulary decision, not an extension during a mapping
--    run.
-- ---------------------------------------------------------------------
INSERT INTO dish_families (slug, name, description) VALUES
  ('filled-pastry', 'Filled pastry',
   'Dough enclosing a filling, baked or fried. Sits between a dumpling (a boiled or steamed parcel) and a flatbread.'),
  ('fritter', 'Fritter',
   'A batter-coated or twice-fried item: falafel, tostones, tempura, vada.')
ON CONFLICT (slug) DO NOTHING;

-- ---------------------------------------------------------------------
-- 2. Assign the two new families.
-- ---------------------------------------------------------------------
INSERT INTO dish_dish_families (dish_id, value_id)
SELECT d.id, v.id FROM dishes d, dish_families v
WHERE (d.slug = 'acaraje'  AND v.slug = 'filled-pastry')
   OR (d.slug = 'dolma'    AND v.slug = 'filled-pastry')
   OR (d.slug = 'empanada' AND v.slug = 'filled-pastry')
   OR (d.slug = 'samosa'   AND v.slug = 'filled-pastry')
   OR (d.slug = 'takoyaki' AND v.slug = 'filled-pastry')
   OR (d.slug = 'falafel'  AND v.slug = 'fritter')
   OR (d.slug = 'tostones' AND v.slug = 'fritter')
   OR (d.slug = 'tempura'  AND v.slug = 'fritter')
   OR (d.slug = 'vada'     AND v.slug = 'fritter')
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------
-- 3. Remove the corrected family assignments.
-- ---------------------------------------------------------------------
DELETE FROM dish_dish_families j
USING dishes d, dish_families v
WHERE j.dish_id = d.id AND j.value_id = v.id
  AND ( (d.slug = 'bubur-ayam'   AND v.slug = 'soup')
     OR (d.slug = 'soba'          AND v.slug = 'noodle-soup')
     OR (d.slug = 'udon'          AND v.slug = 'noodle-soup')
     OR (d.slug = 'bandeja-paisa' AND v.slug = 'rice-dish')
     OR (d.slug = 'martabak'      AND v.slug = 'pancake') );

-- ---------------------------------------------------------------------
-- 4. lechon: a whole-roasted pig is roasted, not skewered.
-- ---------------------------------------------------------------------
DELETE FROM dish_dish_techniques j
USING dishes d, dish_techniques v
WHERE j.dish_id = d.id AND j.value_id = v.id
  AND d.slug = 'lechon' AND v.slug = 'skewering';

INSERT INTO dish_dish_techniques (dish_id, value_id)
SELECT d.id, v.id FROM dishes d, dish_techniques v
WHERE d.slug = 'lechon' AND v.slug = 'roasting'
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------
-- 5. Provenance - one edit_history row per touched dish, updated_at bump.
-- ---------------------------------------------------------------------
INSERT INTO edit_history (id, user_id, target_type, target_id, action, diff, comment)
SELECT gen_random_uuid(), 'hermes', 'dish', d.id, 'update',
       jsonb_build_object(
         'operation', 'GUS-014 broader-family decisions',
         'detail', 'assigned filled-pastry / fritter; removed corrected family assignments; lechon roasting'
       ),
       'GUS-014 broader-family decisions'
FROM dishes d
WHERE d.slug IN (
  -- assigned
  'acaraje','dolma','empanada','samosa','takoyaki',
  'falafel','tostones','tempura','vada',
  -- family assignment removed
  'bubur-ayam','soba','udon','bandeja-paisa','martabak',
  -- technique changed
  'lechon'
)
  AND NOT EXISTS (
    SELECT 1 FROM edit_history e
    WHERE e.target_type='dish' AND e.target_id=d.id
      AND e.comment='GUS-014 broader-family decisions'
  );

UPDATE dishes
SET updated_at = now()
WHERE slug IN (
  'acaraje','dolma','empanada','samosa','takoyaki',
  'falafel','tostones','tempura','vada',
  'bubur-ayam','soba','udon','bandeja-paisa','martabak',
  'lechon'
);

COMMIT;
