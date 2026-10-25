-- 0013_passkey_aaguid.sql
-- Add the `aaguid` column to `passkey`.
--
-- better-auth 1.7.x added a strict runtime schema check. When the
-- `@better-auth/passkey` plugin declares a model field that has no
-- matching column, better-auth throws SchemaMismatchError on EVERY
-- request that touches the session — including `POST
-- /api/auth/sign-in/email`, which then returns HTTP 500. Sign-in on
-- gustale.com / gustale.recipes / api.gustale.recipes was broken from
-- the better-auth 1.7.12 deploy (PR #96) until this migration.
--
-- The `@better-auth/passkey` plugin declares `aaguid` as
-- `type: "string", required: false` — the authenticator AAGUID, used
-- to label a passkey with its vendor ("Google Password Manager",
-- "Touch ID", ...). It was already declared in 1.6.18, but 1.6.x did
-- not validate the schema, so the column was never required.
--
-- Nullable text: existing passkey rows keep a NULL aaguid, which the
-- plugin already handles (`aaguid?.trim().toLowerCase()`).
--
-- `IF NOT EXISTS` keeps the migration idempotent, matching the pattern
-- used by 0012_media_variants.sql.
ALTER TABLE passkey
  ADD COLUMN IF NOT EXISTS aaguid text;

-- Drizzle migration tracking row (mirrors the 0009-0012 convention).
CREATE SCHEMA IF NOT EXISTS drizzle;
CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (
  id          integer PRIMARY KEY,
  hash        text    NOT NULL,
  created_at  bigint
);

INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at)
VALUES (
  13,
  'passkey_aaguid',
  EXTRACT(EPOCH FROM NOW()) * 1000
)
ON CONFLICT (id) DO NOTHING;
