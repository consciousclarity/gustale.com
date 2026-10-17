-- 0012_media_variants.sql
-- Add JSONB `variants` column to `media` to support pre-rendered derivatives
-- (e.g. 800w + 1536w WebP) for fast, same-origin public delivery via Caddy.
--
-- See packages/db/src/schema/index.ts for the JSON shape (`{"<width>": "<key>"}`).
-- Existing rows get `'{}'::jsonb`, so the application falls back to `storage_key`.
--
-- The `drizzle.__drizzle_migrations` table is normally created by the
-- drizzle-kit journal, NOT by any of our committed SQL migrations
-- (0000..0011 don't reference it). It's created lazily when the journal
-- runs, but in the CI ephemeral DB we apply *only* the committed SQL
-- files via `git ls-files` + `psql -f` — so neither the schema nor
-- the table exists here unless we create them. `IF NOT EXISTS` makes
-- the migration idempotent against any future setup that pre-creates
-- the table (e.g. a real Drizzle journal run).
CREATE SCHEMA IF NOT EXISTS drizzle;
CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (
  id          integer PRIMARY KEY,
  hash        text    NOT NULL,
  created_at  bigint
);

ALTER TABLE media
  ADD COLUMN IF NOT EXISTS variants jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Drizzle migration tracking row (mirrors the existing convention; the
-- 0009-0011 migrations used the same hardcoded id scheme).
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at)
VALUES (
  12,
  'media_variants',
  EXTRACT(EPOCH FROM NOW()) * 1000
)
ON CONFLICT (id) DO NOTHING;
