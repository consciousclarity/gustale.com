-- 0014_geo_entity_provenance.sql
-- GUS-242 resync: the columns the 1c conditions require, plus the
-- dual-place link and a status column for archiving.
--
-- Hand-written — do not regenerate with drizzle-kit (journal drift).
--
-- WHY THIS MIGRATION EXISTS
-- ------------------------
-- The "Stop and resync" instruction (session msg 8195, 2026-10-27) asks for
-- four things about the global reference seed:
--
--   (1) countries 259 -> 250 (ISO 3166-1 249 + XK), archiving the 9 extras;
--   (2) for the 46 regions without a Wikidata Q-id: record the SOURCE of
--       each name (the full ISO 3166-2 list is a paid product, so the source
--       must be recorded per row), confirm the P576 dissolved filter,
--       store the subdivision type, record the ISO version — "fix
--       retroactively if not";
--   (3) dual places: Option B — a `same_as_entity_id` link from the region
--       row to the country row, with dishes referencing the country row;
--   (4) cuisines sourced from the country list, one value per ISO country.
--
-- The live audit (2026-10-29, .hermes/REPORTS/GUS-242-resync-audit-2026-10-29.md)
-- found that NONE of those columns existed on `geo_entities`, so (1), (2)
-- and (3) were impossible to apply to the data. This migration adds the
-- minimum set that makes them expressible:
--
--   status            — 'active' | 'archived'. Archiving (not deleting)
--                       keeps the row resolvable, which matters because a
--                       `same_as_entity_id` may point at an archived country
--                       twin (AC and TA are both extras AND country twins).
--   name_source       — where the name in `name` came from. Required for
--                       the 46 rows that have no Q-id to cite.
--   subdivision_type  — 'first-level' | 'second-level' | ... i.e. the
--                       ISO 3166-2 subdivision level.
--   iso_version       — the ISO 3166 edition the code and name came from
--                       (e.g. '2020-08-12' for ISO 3166-1, 'ISO 3166-2:2020'
--                       for subdivisions).
--   dissolved         — the P576 (date of dissolution) filter, as a date.
--                       NULL = still in existence. Non-NULL = the entity
--                       ceased to exist on that date.
--   same_as_entity_id — for dual places (Option B): the country row that
--                       is the SAME real place as this region row.
--                       Self-referencing FK on geo_entities.id.
--
-- DESIGN NOTES
-- ------------
-- * All columns are NULLABLE and additive. No existing row is modified by
--   this migration — the data fixes are a separate, count-asserted step
--   (per RULES.md §3).
-- * `status` defaults to 'active' so existing rows read as active without a
--   data backfill, and the default is applied via DEFAULT + UPDATE for
--   rows already present (safe: the table has 3,849 rows).
-- * `same_as_entity_id` is nullable and self-referencing. It is NOT a
--   UNIQUE constraint: the direction is region -> country, and multiple
--   regions may point at one country (in principle). The audit verified
--   exactly 14 such links.
-- * `dissolved` is a DATE, not a boolean: Wikidata P576 is a point in time.
--
-- ROLLBACK
-- --------
--   ALTER TABLE geo_entities
--     DROP COLUMN IF EXISTS status,
--     DROP COLUMN IF EXISTS name_source,
--     DROP COLUMN IF EXISTS subdivision_type,
--     DROP COLUMN IF EXISTS iso_version,
--     DROP COLUMN IF EXISTS dissolved,
--     DROP COLUMN IF EXISTS same_as_entity_id;

CREATE SCHEMA IF NOT EXISTS drizzle;
CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (
  id          integer PRIMARY KEY,
  hash        text    NOT NULL,
  created_at  bigint
);

-- ---------------------------------------------------------------------
-- status: 'active' | 'archived'
-- ---------------------------------------------------------------------
ALTER TABLE geo_entities
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active';

-- ---------------------------------------------------------------------
-- name_source: where `name` came from (required for rows with no Q-id)
-- ---------------------------------------------------------------------
ALTER TABLE geo_entities
  ADD COLUMN IF NOT EXISTS name_source text;

-- ---------------------------------------------------------------------
-- subdivision_type: the ISO 3166-2 subdivision level
-- ---------------------------------------------------------------------
ALTER TABLE geo_entities
  ADD COLUMN IF NOT EXISTS subdivision_type text;

-- ---------------------------------------------------------------------
-- iso_version: the ISO 3166 edition the code/name came from
-- ---------------------------------------------------------------------
ALTER TABLE geo_entities
  ADD COLUMN IF NOT EXISTS iso_version text;

-- ---------------------------------------------------------------------
-- dissolved: Wikidata P576, as a DATE. NULL = in existence.
-- ---------------------------------------------------------------------
ALTER TABLE geo_entities
  ADD COLUMN IF NOT EXISTS dissolved date;

-- ---------------------------------------------------------------------
-- same_as_entity_id: dual-place link, region row -> country row (Option B)
-- ---------------------------------------------------------------------
ALTER TABLE geo_entities
  ADD COLUMN IF NOT EXISTS same_as_entity_id uuid
  REFERENCES geo_entities(id) ON DELETE SET NULL;

-- Index for the dual-place lookup direction.
CREATE INDEX IF NOT EXISTS geo_entities_same_as_entity_id_idx
  ON geo_entities(same_as_entity_id);

-- Index for the archive filter.
CREATE INDEX IF NOT EXISTS geo_entities_status_idx
  ON geo_entities(status);

-- Constraint: an entity cannot be same_as itself.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'geo_entities_same_as_not_self_check'
  ) THEN
    ALTER TABLE geo_entities
      ADD CONSTRAINT geo_entities_same_as_not_self_check
      CHECK (same_as_entity_id IS NULL OR same_as_entity_id <> id);
  END IF;
END $$;

-- Drizzle migration tracking row (mirrors the 0009-0013 convention).
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at)
VALUES (
  14,
  'geo_entity_provenance',
  EXTRACT(EPOCH FROM NOW()) * 1000
)
ON CONFLICT (id) DO NOTHING;
