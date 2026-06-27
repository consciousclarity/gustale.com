-- Migration: 0005_user_role_index
-- Adds a partial index on users.role for fast admin-gate lookups.
-- The role column itself was added in 0000_cloudy_satana.sql.
-- This migration only adds the index used by the /admin auth middleware
-- (apps/web/src/middleware.ts) which checks role = 'admin' on every
-- /admin/* request.

CREATE INDEX IF NOT EXISTS "users_role_admin_idx"
  ON "users"("role")
  WHERE "role" = 'admin';