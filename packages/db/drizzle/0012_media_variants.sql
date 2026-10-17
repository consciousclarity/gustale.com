-- 0012_media_variants.sql
-- Add JSONB `variants` column to `media` to support pre-rendered derivatives
-- (e.g. 800w + 1536w WebP) for fast, same-origin public delivery via Caddy.
--
-- See packages/db/src/schema/index.ts for the JSON shape (`{"<width>": "<key>"}`).
-- Existing rows get `'{}'::jsonb`, so the application falls back to `storage_key`.
ALTER TABLE media
  ADD COLUMN IF NOT EXISTS variants jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Drizzle migration tracking row (mirrors the existing 0009-0011 convention).
-- Uses the same hardcoded id scheme as the prior tracking rows.
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at)
VALUES (
  12,
  'media_variants',
  EXTRACT(EPOCH FROM NOW()) * 1000
)
ON CONFLICT (id) DO NOTHING;
