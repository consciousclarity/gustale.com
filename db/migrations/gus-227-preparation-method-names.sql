-- =====================================================================
-- GUS-227 — fix the literal backslash in preparation_methods.name
--
-- The live `preparation_methods.name` values contain a LITERAL backslash
-- before the ampersand:
--
--     'Fried \& topped'   ->  should be  'Fried & topped'
--     'Stew \& braise'    ->  should be  'Stew & braise'
--     ... 8 more
--
-- This is a data-entry artifact from an earlier migration (the ampersand
-- was escaped as if it were shell input). It affects 9 method rows, 8 of
-- which are in use by 79 dish_preparations rows.
--
-- Scope check (2026-10-26): the literal backslash appears ONLY in
-- preparation_methods.name. categories, dishes, ingredients, sources and
-- tags are all clean, so this is a single-table fix.
--
-- The fix replaces the two-character sequence  \ &  with  & .
-- Idempotent: re-running finds nothing to change.
--
-- Provenance: every affected dish gets one edit_history row and an
-- updated_at bump, so the change is auditable and the I15 checker can
-- explain it.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1. Snapshot the "before" state so the change is auditable.
-- ---------------------------------------------------------------------
CREATE TEMP TABLE gus227_before ON COMMIT DROP AS
SELECT id, name FROM preparation_methods WHERE position(chr(92) in name) > 0;

-- ---------------------------------------------------------------------
-- 2. The fix: replace every literal backslash with nothing.
--
--    replace(name, chr(92), '') turns  'Fried \& topped'  into
--    'Fried & topped'. Using replace() with chr(92) avoids every
--    escaping question that a literal backslash in SQL would raise.
-- ---------------------------------------------------------------------
UPDATE preparation_methods
SET name = replace(name, chr(92), '')
WHERE position(chr(92) in name) > 0;

-- ---------------------------------------------------------------------
-- 3. Provenance - one edit_history row per affected dish, updated_at bump.
--
--    The affected dishes are those whose preparation used a method that
--    had the artifact.
-- ---------------------------------------------------------------------
INSERT INTO edit_history (id, user_id, target_type, target_id, action, diff, comment)
SELECT gen_random_uuid(), 'hermes', 'dish', d.id, 'update',
       jsonb_build_object(
         'operation', 'GUS-227 preparation method name cleanup',
         'detail', 'removed a literal backslash before an ampersand in preparation_methods.name',
         'method', pm.name
       ),
       'GUS-227 preparation method name cleanup'
FROM dishes d
JOIN dish_preparations dp ON dp.dish_id = d.id
JOIN preparation_methods pm ON pm.id = dp.method_id
WHERE pm.id IN (SELECT id FROM gus227_before)
  AND NOT EXISTS (
    SELECT 1 FROM edit_history e
    WHERE e.target_type='dish' AND e.target_id=d.id
      AND e.comment='GUS-227 preparation method name cleanup'
  );

UPDATE dishes
SET updated_at = now()
WHERE id IN (
  SELECT DISTINCT dp.dish_id
  FROM dish_preparations dp
  JOIN preparation_methods pm ON pm.id = dp.method_id
  WHERE pm.id IN (SELECT id FROM gus227_before)
);

COMMIT;
