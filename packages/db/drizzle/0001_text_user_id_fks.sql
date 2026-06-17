-- Gustale — change created_by/last_edited_by columns from uuid to text
-- Reason: better-auth's user.id is an opaque string (not a UUID). Trying to
-- insert better-auth user IDs into uuid columns raised
--   "invalid input syntax for type uuid"
-- at INSERT time. The FK references user.id (text) so the column type
-- must also be text.
--
-- Existing values are UUIDs (from the seed) which are valid text strings,
-- so the USING clause casts each existing row safely.
--
-- Each ALTER is wrapped in a DO block that checks the column type first,
-- making the migration idempotent: it's safe to run against a fresh DB
-- where the columns are already text (CI test job starts from clean schema
-- and drizzle regenerates from index.ts).
--
-- Generated: 2026-06-17
-- Applies via: psql -d gustale -f 0001_text_user_id_fks.sql

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'dishes' AND column_name = 'created_by'
      AND data_type = 'uuid'
  ) THEN
    ALTER TABLE "dishes" ALTER COLUMN "created_by" TYPE text USING "created_by"::text;
  END IF;
END $$;--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'dishes' AND column_name = 'last_edited_by'
      AND data_type = 'uuid'
  ) THEN
    ALTER TABLE "dishes" ALTER COLUMN "last_edited_by" TYPE text USING "last_edited_by"::text;
  END IF;
END $$;--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'dish_variants' AND column_name = 'created_by'
      AND data_type = 'uuid'
  ) THEN
    ALTER TABLE "dish_variants" ALTER COLUMN "created_by" TYPE text USING "created_by"::text;
  END IF;
END $$;--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'dish_variants' AND column_name = 'last_edited_by'
      AND data_type = 'uuid'
  ) THEN
    ALTER TABLE "dish_variants" ALTER COLUMN "last_edited_by" TYPE text USING "last_edited_by"::text;
  END IF;
END $$;--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'sources' AND column_name = 'created_by'
      AND data_type = 'uuid'
  ) THEN
    ALTER TABLE "sources" ALTER COLUMN "created_by" TYPE text USING "created_by"::text;
  END IF;
END $$;