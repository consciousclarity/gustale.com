-- Gustale — change all user-referencing columns from uuid to text
-- Reason: better-auth's user.id is an opaque string (not a UUID).
-- The domain `users.id` (singular `user.id` is better-auth's table) was
-- previously uuid, and every FK column referencing it was uuid. Trying to
-- insert a better-auth user ID into any of these columns raised
--   "invalid input syntax for type uuid"
-- at INSERT time.
--
-- Strategy: change `users.id` to text first, then change every FK column
-- that references it. Existing UUID values cast losslessly to text.
--
-- All changes are wrapped in DO blocks checking current data_type, making
-- the migration idempotent: safe against fresh DBs where drizzle already
-- generated the schema as text.
--
-- Applies via:
--   docker exec -u postgres shared-postgres psql -d gustale -f /tmp/0001_text_user_id_fks.sql
--
-- Generated: 2026-06-17

-- Step 1: drop FK constraints that reference users.id so we can change types.
-- We need to drop before altering the parent or child column type.

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT conname, conrelid::regclass AS tbl
    FROM pg_constraint
    WHERE confrelid = 'users'::regclass
      AND contype = 'f'
  LOOP
    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', r.tbl, r.conname);
  END LOOP;
END $$;--> statement-breakpoint

-- Step 2: convert users.id from uuid to text.
DO $$
BEGIN
  IF (SELECT data_type FROM information_schema.columns
      WHERE table_name = 'users' AND column_name = 'id') = 'uuid' THEN
    ALTER TABLE "users" ALTER COLUMN "id" TYPE text USING "id"::text;
  END IF;
END $$;--> statement-breakpoint

-- Step 3: convert every FK column that was previously typed uuid to text.
-- Each is idempotent (checks data_type first).

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name = 'sessions' AND column_name = 'user_id'
               AND data_type = 'uuid') THEN
    ALTER TABLE "sessions" ALTER COLUMN "user_id" TYPE text USING "user_id"::text;
  END IF;
END $$;--> statement-breakpoint

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name = 'dishes' AND column_name = 'created_by'
               AND data_type = 'uuid') THEN
    ALTER TABLE "dishes" ALTER COLUMN "created_by" TYPE text USING "created_by"::text;
  END IF;
END $$;--> statement-breakpoint

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name = 'dishes' AND column_name = 'last_edited_by'
               AND data_type = 'uuid') THEN
    ALTER TABLE "dishes" ALTER COLUMN "last_edited_by" TYPE text USING "last_edited_by"::text;
  END IF;
END $$;--> statement-breakpoint

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name = 'dish_variants' AND column_name = 'created_by'
               AND data_type = 'uuid') THEN
    ALTER TABLE "dish_variants" ALTER COLUMN "created_by" TYPE text USING "created_by"::text;
  END IF;
END $$;--> statement-breakpoint

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name = 'dish_variants' AND column_name = 'last_edited_by'
               AND data_type = 'uuid') THEN
    ALTER TABLE "dish_variants" ALTER COLUMN "last_edited_by" TYPE text USING "last_edited_by"::text;
  END IF;
END $$;--> statement-breakpoint

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name = 'sources' AND column_name = 'created_by'
               AND data_type = 'uuid') THEN
    ALTER TABLE "sources" ALTER COLUMN "created_by" TYPE text USING "created_by"::text;
  END IF;
END $$;--> statement-breakpoint

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name = 'citations' AND column_name = 'added_by'
               AND data_type = 'uuid') THEN
    ALTER TABLE "citations" ALTER COLUMN "added_by" TYPE text USING "added_by"::text;
  END IF;
END $$;--> statement-breakpoint

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name = 'ingredients' AND column_name = 'created_by'
               AND data_type = 'uuid') THEN
    ALTER TABLE "ingredients" ALTER COLUMN "created_by" TYPE text USING "created_by"::text;
  END IF;
END $$;--> statement-breakpoint

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name = 'ingredients' AND column_name = 'last_edited_by'
               AND data_type = 'uuid') THEN
    ALTER TABLE "ingredients" ALTER COLUMN "last_edited_by" TYPE text USING "last_edited_by"::text;
  END IF;
END $$;--> statement-breakpoint

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name = 'edit_history' AND column_name = 'user_id'
               AND data_type = 'uuid') THEN
    ALTER TABLE "edit_history" ALTER COLUMN "user_id" TYPE text USING "user_id"::text;
  END IF;
END $$;--> statement-breakpoint

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name = 'watch_list' AND column_name = 'user_id'
               AND data_type = 'uuid') THEN
    ALTER TABLE "watch_list" ALTER COLUMN "user_id" TYPE text USING "user_id"::text;
  END IF;
END $$;--> statement-breakpoint

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name = 'comments' AND column_name = 'user_id'
               AND data_type = 'uuid') THEN
    ALTER TABLE "comments" ALTER COLUMN "user_id" TYPE text USING "user_id"::text;
  END IF;
END $$;--> statement-breakpoint

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name = 'content_permissions' AND column_name = 'user_id'
               AND data_type = 'uuid') THEN
    ALTER TABLE "content_permissions" ALTER COLUMN "user_id" TYPE text USING "user_id"::text;
  END IF;
END $$;--> statement-breakpoint

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name = 'content_permissions' AND column_name = 'granted_by'
               AND data_type = 'uuid') THEN
    ALTER TABLE "content_permissions" ALTER COLUMN "granted_by" TYPE text USING "granted_by"::text;
  END IF;
END $$;--> statement-breakpoint

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name = 'expert_credentials' AND column_name = 'user_id'
               AND data_type = 'uuid') THEN
    ALTER TABLE "expert_credentials" ALTER COLUMN "user_id" TYPE text USING "user_id"::text;
  END IF;
END $$;--> statement-breakpoint

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name = 'expert_credentials' AND column_name = 'verified_by'
               AND data_type = 'uuid') THEN
    ALTER TABLE "expert_credentials" ALTER COLUMN "verified_by" TYPE text USING "verified_by"::text;
  END IF;
END $$;--> statement-breakpoint

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name = 'media' AND column_name = 'uploaded_by'
               AND data_type = 'uuid') THEN
    ALTER TABLE "media" ALTER COLUMN "uploaded_by" TYPE text USING "uploaded_by"::text;
  END IF;
END $$;--> statement-breakpoint

-- Step 4: recreate FK constraints to users.id (now text).
-- Only create if missing (so the migration is idempotent).

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'sessions_user_id_users_id_fk'
  ) THEN
    ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk"
      FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;
  END IF;
END $$;--> statement-breakpoint

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'dishes_created_by_users_id_fk'
  ) THEN
    ALTER TABLE "dishes" ADD CONSTRAINT "dishes_created_by_users_id_fk"
      FOREIGN KEY ("created_by") REFERENCES "users"("id");
  END IF;
END $$;--> statement-breakpoint

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'dishes_last_edited_by_users_id_fk'
  ) THEN
    ALTER TABLE "dishes" ADD CONSTRAINT "dishes_last_edited_by_users_id_fk"
      FOREIGN KEY ("last_edited_by") REFERENCES "users"("id");
  END IF;
END $$;--> statement-breakpoint

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'dish_variants')
     AND EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'dish_variants' AND column_name = 'created_by') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint WHERE conname = 'dish_variants_created_by_users_id_fk'
    ) THEN
      ALTER TABLE "dish_variants" ADD CONSTRAINT "dish_variants_created_by_users_id_fk"
        FOREIGN KEY ("created_by") REFERENCES "users"("id");
    END IF;
  END IF;
END $$;--> statement-breakpoint

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'dish_variants')
     AND EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'dish_variants' AND column_name = 'last_edited_by') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint WHERE conname = 'dish_variants_last_edited_by_users_id_fk'
    ) THEN
      ALTER TABLE "dish_variants" ADD CONSTRAINT "dish_variants_last_edited_by_users_id_fk"
        FOREIGN KEY ("last_edited_by") REFERENCES "users"("id");
    END IF;
  END IF;
END $$;--> statement-breakpoint

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'sources_created_by_users_id_fk'
  ) THEN
    ALTER TABLE "sources" ADD CONSTRAINT "sources_created_by_users_id_fk"
      FOREIGN KEY ("created_by") REFERENCES "users"("id");
  END IF;
END $$;--> statement-breakpoint

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'citations_added_by_users_id_fk'
  ) THEN
    ALTER TABLE "citations" ADD CONSTRAINT "citations_added_by_users_id_fk"
      FOREIGN KEY ("added_by") REFERENCES "users"("id");
  END IF;
END $$;--> statement-breakpoint

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ingredients_created_by_users_id_fk'
  ) THEN
    ALTER TABLE "ingredients" ADD CONSTRAINT "ingredients_created_by_users_id_fk"
      FOREIGN KEY ("created_by") REFERENCES "users"("id");
  END IF;
END $$;--> statement-breakpoint

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ingredients_last_edited_by_users_id_fk'
  ) THEN
    ALTER TABLE "ingredients" ADD CONSTRAINT "ingredients_last_edited_by_users_id_fk"
      FOREIGN KEY ("last_edited_by") REFERENCES "users"("id");
  END IF;
END $$;--> statement-breakpoint

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'edit_history_user_id_users_id_fk'
  ) THEN
    ALTER TABLE "edit_history" ADD CONSTRAINT "edit_history_user_id_users_id_fk"
      FOREIGN KEY ("user_id") REFERENCES "users"("id");
  END IF;
END $$;--> statement-breakpoint

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'watch_list_user_id_users_id_fk'
  ) THEN
    ALTER TABLE "watch_list" ADD CONSTRAINT "watch_list_user_id_users_id_fk"
      FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;
  END IF;
END $$;--> statement-breakpoint

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'comments_user_id_users_id_fk'
  ) THEN
    ALTER TABLE "comments" ADD CONSTRAINT "comments_user_id_users_id_fk"
      FOREIGN KEY ("user_id") REFERENCES "users"("id");
  END IF;
END $$;--> statement-breakpoint

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'content_permissions_user_id_users_id_fk'
  ) THEN
    ALTER TABLE "content_permissions" ADD CONSTRAINT "content_permissions_user_id_users_id_fk"
      FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;
  END IF;
END $$;--> statement-breakpoint

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'content_permissions_granted_by_users_id_fk'
  ) THEN
    ALTER TABLE "content_permissions" ADD CONSTRAINT "content_permissions_granted_by_users_id_fk"
      FOREIGN KEY ("granted_by") REFERENCES "users"("id");
  END IF;
END $$;--> statement-breakpoint

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'expert_credentials_user_id_users_id_fk'
  ) THEN
    ALTER TABLE "expert_credentials" ADD CONSTRAINT "expert_credentials_user_id_users_id_fk"
      FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;
  END IF;
END $$;--> statement-breakpoint

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'expert_credentials_verified_by_users_id_fk'
  ) THEN
    ALTER TABLE "expert_credentials" ADD CONSTRAINT "expert_credentials_verified_by_users_id_fk"
      FOREIGN KEY ("verified_by") REFERENCES "users"("id");
  END IF;
END $$;--> statement-breakpoint

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'media_uploaded_by_users_id_fk'
  ) THEN
    ALTER TABLE "media" ADD CONSTRAINT "media_uploaded_by_users_id_fk"
      FOREIGN KEY ("uploaded_by") REFERENCES "users"("id");
  END IF;
END $$;