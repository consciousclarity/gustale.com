-- =====================================================================
-- GUS-224 — Option B: one directed row per relation, inverse derived.
--
-- Approved by Alejandro 2026-10-26. Plan:
--   .hermes/REPORTS/GUS-224-option-b-plan.md
-- Audit: .hermes/REPORTS/GUS-224-relations-audit.md
--
-- WHAT CHANGES
--   192 rows (96 bidirectionally-stored pairs) -> 96 rows (one per relation).
--   The 96 dropped inverse rows are MOVED to dish_relations_archive with
--   their ORIGINAL ids. Nothing is hard-deleted.
--
--   The 4 likely-wrong directional pairs collapse to their reason-matching
--   row, which is then quarantined (status='quarantined', excluded from
--   the public view). Their reason / from_dish_id / to_dish_id are NOT
--   edited - they are the audit trail.
--
--   The 5th directional pair (shawarma -> tacos-al-pastor, the GUS-014
--   pilot relation) stays LIVE, flagged as a single tertiary source.
--
-- IDEMPOTENT: safe to re-run.
--
-- PREREQUISITE: the pre-check confirmed that all 96 pairs have IDENTICAL
-- strength and reason on both rows (0 mismatches), so collapsing a pair to
-- one row loses no information.
--
-- NOTE ON SNAPSHOTS: the GUS-014 V3 snapshot (20261026T040610Z) was taken
-- BEFORE the GUS-014 pilot, so it holds 190 relations, not 192. A dry-run
-- against that snapshot yields 95 rows and 4 directional keep-rows, because
-- the pilot's relation pair is absent. Dry-runs and the live pre-flight
-- MUST use a fresh snapshot of the current database.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1. relation_types vocabulary table
--
-- A TABLE, not a CHECK enum: the `symmetric` flag is metadata, and a
-- vocabulary table can be extended without a schema migration.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS relation_types (
  id          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  slug        text NOT NULL UNIQUE,
  name        text NOT NULL,
  -- symmetric = the relation holds equally in both directions.
  -- FALSE for directional types: storing both directions would assert a
  -- contradiction ("A is the ancestor of B" AND "B is the ancestor of A").
  is_symmetric boolean NOT NULL,
  description text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

INSERT INTO relation_types (slug, name, is_symmetric, description) VALUES
  ('family',             'Family',              true,
   'Both dishes belong to the same dish family. Direction carries no claim.'),
  ('regional-cousin',    'Regional cousin',     true,
   'Related dishes from distinct regions. Direction carries no claim.'),
  ('shared-method',      'Shared method',       true,
   'Both dishes share a cooking technique. Direction carries no claim.'),
  ('similar-serving',    'Similar serving',     true,
   'Both dishes are eaten in similar contexts. Direction carries no claim.'),
  ('shared-ingredient',  'Shared ingredient',   true,
   'Both dishes share a defining ingredient. Direction carries no claim.'),
  ('ancestor',           'Ancestor',            false,
   'DIRECTIONAL: from_dish_id is the documented ancestor of to_dish_id.'),
  ('diaspora',           'Diaspora',            false,
   'DIRECTIONAL: from_dish_id is the origin, to_dish_id the diaspora.')
ON CONFLICT (slug) DO NOTHING;

-- ---------------------------------------------------------------------
-- 2. dish_relations gains relation_type_id, is_symmetric, status, quarantine_note
--
-- The legacy `relation_type` text column stays as a DENORMALIZED MIRROR of
-- the new FK, so existing readers and the UNIQUE(from,to,relation_type)
-- constraint keep working. The FK is authoritative: a trigger keeps the
-- text in sync, and a new row may supply either column (or both).
-- ---------------------------------------------------------------------
ALTER TABLE dish_relations
  ADD COLUMN IF NOT EXISTS relation_type_id uuid REFERENCES relation_types(id),
  ADD COLUMN IF NOT EXISTS is_symmetric       boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS status            text NOT NULL DEFAULT 'unverified',
  ADD COLUMN IF NOT EXISTS quarantine_note   text;

-- Backfill relation_type_id + is_symmetric from the vocabulary.
UPDATE dish_relations dr
SET relation_type_id = rt.id,
    is_symmetric = rt.is_symmetric
FROM relation_types rt
WHERE rt.slug = dr.relation_type;

-- Keep the legacy text column in sync with the FK, and let a write supply
-- EITHER the slug or the id. The text column keeps its NOT NULL.
CREATE OR REPLACE FUNCTION sync_relation_type() RETURNS trigger AS $$
BEGIN
  IF NEW.relation_type_id IS NULL AND NEW.relation_type IS NOT NULL THEN
    SELECT rt.id INTO NEW.relation_type_id FROM relation_types rt WHERE rt.slug = NEW.relation_type;
    IF NEW.relation_type_id IS NULL THEN
      RAISE EXCEPTION 'unknown relation_type %', NEW.relation_type;
    END IF;
  ELSIF NEW.relation_type_id IS NOT NULL THEN
    SELECT rt.slug INTO NEW.relation_type FROM relation_types rt WHERE rt.id = NEW.relation_type_id;
    SELECT rt.is_symmetric INTO NEW.is_symmetric FROM relation_types rt WHERE rt.id = NEW.relation_type_id;
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_a_sync_relation_type ON dish_relations;
DROP TRIGGER IF EXISTS trg_sync_relation_type ON dish_relations;
CREATE TRIGGER trg_a_sync_relation_type
  BEFORE INSERT OR UPDATE ON dish_relations
  FOR EACH ROW EXECUTE FUNCTION sync_relation_type();

-- ---------------------------------------------------------------------
-- 3. dish_relations_archive — the dropped inverse rows, ORIGINAL ids
--
-- No hard delete. The archive keeps the exact row (same id, same columns)
-- plus why it was archived.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS dish_relations_archive (
  id                uuid PRIMARY KEY,          -- the ORIGINAL dish_relations.id
  from_dish_id      uuid NOT NULL,
  to_dish_id        uuid NOT NULL,
  relation_type     text NOT NULL,
  reason            text,
  strength          integer NOT NULL,
  created_at        timestamptz NOT NULL,
  archived_at       timestamptz NOT NULL DEFAULT now(),
  archived_reason   text NOT NULL
);

-- ---------------------------------------------------------------------
-- 4. Collapse each pair to ONE row.
--
--    DIRECTIONAL pairs: keep the EXPLICIT reason-matching row. The ids
--    below are hard-coded from the 2026-10-26 audit - no auto-parsing.
--
--    SYMMETRIC pairs: keep the row where from_dish_id < to_dish_id.
--    (91 of 91 symmetric pairs have exactly one row in each direction.)
-- ---------------------------------------------------------------------

-- 4a. DIRECTIONAL - archive the inverse of each of the 5 keep-rows.
--     (the reverse of every explicit keep-row)
INSERT INTO dish_relations_archive
  (id, from_dish_id, to_dish_id, relation_type, reason, strength, created_at, archived_reason)
SELECT dr.id, dr.from_dish_id, dr.to_dish_id, dr.relation_type, dr.reason,
       dr.strength, dr.created_at,
       'GUS-224 Option B: inverse row of a directional relation - the pair asserted both directions'
FROM dish_relations dr
WHERE dr.id IN (
  -- inverse of shawarma -> tacos-al-pastor (the GUS-014 pilot relation)
  '78dd6076-08ca-4cd5-91a0-6d80f266aa39',
  -- inverse of bacalhau-a-bras -> vindaloo
  '55acfe66-13a1-53a2-94f0-fb2f5e3cb8ee',
  -- inverse of biryani-hyderabadi -> jollof-rice
  '2ded426c-c667-5b40-8e86-da52cb7a51f3',
  -- inverse of shawarma -> hamburger-american
  '11ff5b8d-eb5c-521f-a10a-d04058d4785f',
  -- inverse of tonkatsu -> wiener-schnitzel
  '01ef505e-75cc-433d-a6e4-5a65bfe5a515'
)
ON CONFLICT (id) DO NOTHING;

DELETE FROM dish_relations
WHERE id IN (
  '78dd6076-08ca-4cd5-91a0-6d80f266aa39',
  '55acfe66-13a1-53a2-94f0-fb2f5e3cb8ee',
  '2ded426c-c667-5b40-8e86-da52cb7a51f3',
  '11ff5b8d-eb5c-521f-a10a-d04058d4785f',
  '01ef505e-75cc-433d-a6e4-5a65bfe5a515'
);

-- 4b. SYMMETRIC - archive the row where from_dish_id > to_dish_id.
INSERT INTO dish_relations_archive
  (id, from_dish_id, to_dish_id, relation_type, reason, strength, created_at, archived_reason)
SELECT dr.id, dr.from_dish_id, dr.to_dish_id, dr.relation_type, dr.reason,
       dr.strength, dr.created_at,
       'GUS-224 Option B: inverse row of a symmetric relation - stored for provenance, inverse is now derived'
FROM dish_relations dr
JOIN relation_types rt ON rt.id = dr.relation_type_id
WHERE rt.is_symmetric = true
  AND dr.from_dish_id > dr.to_dish_id
  AND dr.status <> 'quarantined'
ON CONFLICT (id) DO NOTHING;

DELETE FROM dish_relations dr
USING relation_types rt
WHERE rt.id = dr.relation_type_id
  AND rt.is_symmetric = true
  AND dr.from_dish_id > dr.to_dish_id
  AND dr.status <> 'quarantined';

-- ---------------------------------------------------------------------
-- 5. Status + quarantine.
--
--    status: 'active' | 'quarantined'
--    (the pre-migration default 'unverified' is retained for rows that
--     are neither explicitly cleared nor quarantined - see below)
--
--    Q1: the pilot relation stays LIVE, flagged single_tertiary_source.
--    Q4: admins see quarantined rows with a label; the public view filters
--        them out.
-- ---------------------------------------------------------------------

-- 5a. The 4 likely-wrong pairs: their reason-matching row is quarantined.
UPDATE dish_relations
SET status = 'quarantined',
    quarantine_note = CASE
      WHEN relation_type = 'ancestor' AND from_dish_id = (SELECT id FROM dishes WHERE slug='bacalhau-a-bras')
        THEN 'GUS-224: wrong source dish. The vindaloo <- carne de vinha d''alhos derivation IS well sourced (Wikipedia Vindaloo, citing Collingham and BBC Food), but carne de vinha d''alhos is PORK in garlic wine vinegar while bacalhau a bras is SALT COD. The reason names the correct ancestor; the relation points at the wrong one. The correct ancestor dish is not in the catalog. No hand edit - reason/from/to preserved as the audit trail.'
      WHEN relation_type = 'ancestor'
        THEN 'GUS-224: unsupported. Wikipedia Jollof rice attributes the origin to the Wolof/Jolof Empire and thieboudienne in Senegal (McCann, Osseo-Asare, Dufumier); no biryani -> jollof derivation appears. No hand edit.'
      WHEN relation_type = 'diaspora' AND from_dish_id = (SELECT id FROM dishes WHERE slug='shawarma')
        THEN 'GUS-224: mis-wired. The claim (doner kebab 1970s West Berlin diaspora -> the hamburger-among-immigrants) is supported by one tertiary source, but the relation connects shawarma. doner-kebab exists as a dish and has ZERO relations. A rewire to doner-kebab would be a NEW CLAIM, not a correction, so no hand edit.'
      WHEN relation_type = 'diaspora'
        THEN 'GUS-224: unsupported pairing. The supporting quote (Wikipedia Tonkatsu) is for the French cote de veau; Wikipedia Wiener schnitzel traces a different lineage (Nuremberg 1691, 19th-century designation, Radetzky 1857 which Pohl says concerns veal Milanese). No hand edit.'
      ELSE 'GUS-224: quarantined.'
    END
WHERE id IN (
  '0afcdf4e-e05f-5315-8b24-67e3b8a15aa0',  -- bacalhau-a-bras -> vindaloo
  '7109f0e7-9d99-5858-9ee2-78e3a6fe1c90',  -- biryani-hyderabadi -> jollof-rice
  '27b97221-f85c-532c-9264-7899f34399b7',  -- shawarma -> hamburger-american
  'c212c598-0297-4597-aefa-6dc4bfc9e3a6'   -- tonkatsu -> wiener-schnitzel
);

-- 5b. The pilot relation stays LIVE (Q1), flagged as a single tertiary source.
UPDATE dish_relations
SET status = 'active',
    quarantine_note = 'GUS-224: single tertiary source (Wikipedia Al pastor). Not independently corroborated. Self-contradicting inverse row archived; the reason-matching row is retained.'
WHERE id = 'b7e468e0-16c5-4499-8bd4-ab2ecb95d677';  -- shawarma -> tacos-al-pastor

-- 5c. The remaining symmetric rows are ACTIVE (they are not quarantined;
--     their evidence status is "unverified" and is reported by the audit,
--     not encoded in `status`).
UPDATE dish_relations dr
SET status = 'active'
FROM relation_types rt
WHERE rt.id = dr.relation_type_id
  AND rt.is_symmetric = true
  AND dr.status <> 'quarantined';

-- ---------------------------------------------------------------------
-- 6. dish_relations_symmetric - the derived inverse view.
--
--    The inverse is emitted ONLY for symmetric types. For a directional
--    type the inverse is NOT a valid assertion - emitting it would
--    recreate exactly the contradiction this migration removes.
--
--    Quarantined rows are excluded from the PUBLIC view.
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW dish_relations_symmetric AS
SELECT r.id                AS source_row_id,
       r.from_dish_id,
       r.to_dish_id,
       r.relation_type_id,
       rt.slug             AS relation_type,
       rt.is_symmetric,
       r.reason,
       r.strength,
       r.status,
       r.quarantine_note
FROM dish_relations r
JOIN relation_types rt ON rt.id = r.relation_type_id
WHERE r.status <> 'quarantined'
UNION ALL
SELECT r.id                AS source_row_id,
       r.to_dish_id        AS from_dish_id,
       r.from_dish_id      AS to_dish_id,
       r.relation_type_id,
       rt.slug             AS relation_type,
       rt.is_symmetric,
       r.reason,
       r.strength,
       r.status,
       r.quarantine_note
FROM dish_relations r
JOIN relation_types rt ON rt.id = r.relation_type_id
WHERE r.status <> 'quarantined'
  AND rt.is_symmetric = true;

-- A public-facing view: active rows only, symmetric inverse derived.
CREATE OR REPLACE VIEW dish_relations_public AS
SELECT * FROM dish_relations_symmetric WHERE status = 'active';

-- An admin-facing view: ACTIVE + QUARANTINED rows, with their status and
-- quarantine note so a curator can see what was pulled and why (Q4).
-- Quarantined rows are excluded from the PUBLIC view only.
CREATE OR REPLACE VIEW dish_relations_admin AS
SELECT r.id                AS source_row_id,
       r.from_dish_id,
       r.to_dish_id,
       r.relation_type_id,
       rt.slug             AS relation_type,
       rt.is_symmetric,
       r.reason,
       r.strength,
       r.status,
       r.quarantine_note
FROM dish_relations r
JOIN relation_types rt ON rt.id = r.relation_type_id
UNION ALL
SELECT r.id                AS source_row_id,
       r.to_dish_id        AS from_dish_id,
       r.from_dish_id      AS to_dish_id,
       r.relation_type_id,
       rt.slug             AS relation_type,
       rt.is_symmetric,
       r.reason,
       r.strength,
       r.status,
       r.quarantine_note
FROM dish_relations r
JOIN relation_types rt ON rt.id = r.relation_type_id
WHERE rt.is_symmetric = true;

-- ---------------------------------------------------------------------
-- 7. Enforcement triggers.
--
--    7a. A DIRECTIONAL relation may not have its inverse present.
--        This is the rule that makes the self-contradiction impossible
--        to reintroduce by a future write.
--    7b. A SYMMETRIC relation must satisfy from_dish_id < to_dish_id,
--        so the canonical direction is a stored invariant, not a
--        convention that can drift.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION check_relation_direction() RETURNS trigger AS $$
DECLARE
  v_symmetric boolean;
BEGIN
  SELECT rt.is_symmetric INTO v_symmetric
  FROM relation_types rt WHERE rt.id = NEW.relation_type_id;

  IF v_symmetric IS NULL THEN
    RAISE EXCEPTION 'relation_type_id % does not resolve to a relation_type', NEW.relation_type_id;
  END IF;

  IF v_symmetric THEN
    -- 7b. canonical direction for symmetric types
    IF NEW.from_dish_id >= NEW.to_dish_id THEN
      RAISE EXCEPTION 'symmetric relation requires from_dish_id < to_dish_id (got % and %)',
        NEW.from_dish_id, NEW.to_dish_id;
    END IF;
  ELSE
    -- 7a. a directional relation may not have its inverse present
    IF EXISTS (
      SELECT 1 FROM dish_relations r
      JOIN relation_types rt ON rt.id = r.relation_type_id
      WHERE rt.is_symmetric = false
        AND r.from_dish_id = NEW.to_dish_id
        AND r.to_dish_id   = NEW.from_dish_id
        AND r.relation_type_id = NEW.relation_type_id
        AND r.id <> NEW.id
    ) THEN
      RAISE EXCEPTION 'directional relation % would assert both % -> % and % -> %',
        NEW.relation_type_id, NEW.from_dish_id, NEW.to_dish_id,
        NEW.to_dish_id, NEW.from_dish_id;
    END IF;
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_b_check_relation_direction ON dish_relations;
DROP TRIGGER IF EXISTS trg_check_relation_direction ON dish_relations;
CREATE TRIGGER trg_b_check_relation_direction
  BEFORE INSERT OR UPDATE ON dish_relations
  FOR EACH ROW EXECUTE FUNCTION check_relation_direction();

-- Trigger ORDER matters: PostgreSQL fires BEFORE triggers in ALPHABETICAL
-- order by trigger name. 'trg_check_...' sorts BEFORE 'trg_sync_...', so
-- the check would run before the sync and would not see is_symmetric.
-- Renaming so 'trg_a_sync' < 'trg_b_check' makes sync run first.

-- ---------------------------------------------------------------------
-- 8. Provenance - one edit_history row per touched dish, updated_at bump.
-- ---------------------------------------------------------------------
INSERT INTO edit_history (id, user_id, target_type, target_id, action, diff, comment)
SELECT gen_random_uuid(), 'hermes', 'dish', d.id, 'update',
       jsonb_build_object(
         'operation', 'GUS-224 relations Option B',
         'detail', 'relations collapsed to one directed row per relation; inverse rows archived; 4 likely-wrong pairs quarantined'
       ),
       'GUS-224 relations Option B'
FROM dishes d
WHERE d.id IN (
  SELECT DISTINCT from_dish_id FROM dish_relations_archive
  UNION
  SELECT DISTINCT to_dish_id FROM dish_relations_archive
  UNION
  SELECT DISTINCT from_dish_id FROM dish_relations
  UNION
  SELECT DISTINCT to_dish_id FROM dish_relations
)
  AND NOT EXISTS (
    SELECT 1 FROM edit_history e
    WHERE e.target_type='dish' AND e.target_id=d.id AND e.comment='GUS-224 relations Option B'
  );

UPDATE dishes
SET updated_at = now()
WHERE id IN (
  SELECT DISTINCT from_dish_id FROM dish_relations_archive
  UNION
  SELECT DISTINCT to_dish_id FROM dish_relations_archive
  UNION
  SELECT DISTINCT from_dish_id FROM dish_relations
  UNION
  SELECT DISTINCT to_dish_id FROM dish_relations
);

COMMIT;
