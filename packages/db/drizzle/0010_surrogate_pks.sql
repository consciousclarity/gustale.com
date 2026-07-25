-- 0010_surrogate_pks.sql
-- ADR-002 Amendment 1 / Phase 2b: surrogate primary keys for Directus visibility.
-- Hand-written — do not regenerate with drizzle-kit (journal drift).
--
-- Eleven tables currently use composite PKs with no surrogate `id`. Directus
-- ignores them at startup. This migration:
--   1. Adds `id uuid NOT NULL DEFAULT uuid_generate_v4()`
--   2. Drops the composite PRIMARY KEY (real names verified on seeded DB)
--   3. Makes `id` the PRIMARY KEY
--   4. Re-asserts the former composite key as UNIQUE (seeder onConflict)
--
-- Idempotent: safe if 0009 already converted the three empty translation
-- tables. Apply AFTER 0009_db_invariants.sql.
--
-- Preflight row counts on seeded `gustale` @ 2026-07-25:
--   dish_categories 353 | dish_translations 120 | dish_lineages 34
--   all others 0. None >50k.

-- Helper pattern per table (DO blocks avoid "already exists" failures).

-- ─── 1. category_translations (may already be done in 0009) ───────────────

ALTER TABLE "category_translations"
  ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT uuid_generate_v4() NOT NULL;
ALTER TABLE "category_translations"
  DROP CONSTRAINT IF EXISTS "category_translations_category_id_language_pk";
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'category_translations_pkey'
  ) THEN
    ALTER TABLE "category_translations"
      ADD CONSTRAINT "category_translations_pkey" PRIMARY KEY ("id");
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'category_translations_category_id_language_unique'
  ) THEN
    ALTER TABLE "category_translations"
      ADD CONSTRAINT "category_translations_category_id_language_unique"
      UNIQUE ("category_id", "language");
  END IF;
END $$;

-- ─── 2. ingredient_translations (may already be done in 0009) ─────────────

ALTER TABLE "ingredient_translations"
  ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT uuid_generate_v4() NOT NULL;
ALTER TABLE "ingredient_translations"
  DROP CONSTRAINT IF EXISTS "ingredient_translations_ingredient_id_language_pk";
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ingredient_translations_pkey'
  ) THEN
    ALTER TABLE "ingredient_translations"
      ADD CONSTRAINT "ingredient_translations_pkey" PRIMARY KEY ("id");
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ingredient_translations_ingredient_id_language_unique'
  ) THEN
    ALTER TABLE "ingredient_translations"
      ADD CONSTRAINT "ingredient_translations_ingredient_id_language_unique"
      UNIQUE ("ingredient_id", "language");
  END IF;
END $$;

-- ─── 3. preparation_method_translations (may already be done in 0009) ─────

ALTER TABLE "preparation_method_translations"
  ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT uuid_generate_v4() NOT NULL;
ALTER TABLE "preparation_method_translations"
  DROP CONSTRAINT IF EXISTS "preparation_method_translations_method_id_language_pk";
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'preparation_method_translations_pkey'
  ) THEN
    ALTER TABLE "preparation_method_translations"
      ADD CONSTRAINT "preparation_method_translations_pkey" PRIMARY KEY ("id");
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'preparation_method_translations_method_id_language_unique'
  ) THEN
    ALTER TABLE "preparation_method_translations"
      ADD CONSTRAINT "preparation_method_translations_method_id_language_unique"
      UNIQUE ("method_id", "language");
  END IF;
END $$;

-- ─── 4. dish_translations (had rows; deferred from 0009) ──────────────────

ALTER TABLE "dish_translations"
  ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT uuid_generate_v4() NOT NULL;
ALTER TABLE "dish_translations"
  DROP CONSTRAINT IF EXISTS "dish_translations_dish_id_language_pk";
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'dish_translations_pkey'
  ) THEN
    ALTER TABLE "dish_translations"
      ADD CONSTRAINT "dish_translations_pkey" PRIMARY KEY ("id");
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'dish_translations_natural_key'
  ) THEN
    ALTER TABLE "dish_translations"
      ADD CONSTRAINT "dish_translations_natural_key"
      UNIQUE ("dish_id", "language");
  END IF;
END $$;

-- ─── 5. dish_categories ───────────────────────────────────────────────────

ALTER TABLE "dish_categories"
  ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT uuid_generate_v4() NOT NULL;
ALTER TABLE "dish_categories"
  DROP CONSTRAINT IF EXISTS "dish_categories_dish_id_category_id_pk";
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'dish_categories_pkey'
  ) THEN
    ALTER TABLE "dish_categories"
      ADD CONSTRAINT "dish_categories_pkey" PRIMARY KEY ("id");
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'dish_categories_natural_key'
  ) THEN
    ALTER TABLE "dish_categories"
      ADD CONSTRAINT "dish_categories_natural_key"
      UNIQUE ("dish_id", "category_id");
  END IF;
END $$;

-- ─── 6. dish_tags ─────────────────────────────────────────────────────────

ALTER TABLE "dish_tags"
  ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT uuid_generate_v4() NOT NULL;
ALTER TABLE "dish_tags"
  DROP CONSTRAINT IF EXISTS "dish_tags_dish_id_tag_id_pk";
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'dish_tags_pkey'
  ) THEN
    ALTER TABLE "dish_tags"
      ADD CONSTRAINT "dish_tags_pkey" PRIMARY KEY ("id");
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'dish_tags_natural_key'
  ) THEN
    ALTER TABLE "dish_tags"
      ADD CONSTRAINT "dish_tags_natural_key"
      UNIQUE ("dish_id", "tag_id");
  END IF;
END $$;

-- ─── 7. dish_lineages ─────────────────────────────────────────────────────

ALTER TABLE "dish_lineages"
  ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT uuid_generate_v4() NOT NULL;
ALTER TABLE "dish_lineages"
  DROP CONSTRAINT IF EXISTS "dish_lineages_dish_id_lineage_id_pk";
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'dish_lineages_pkey'
  ) THEN
    ALTER TABLE "dish_lineages"
      ADD CONSTRAINT "dish_lineages_pkey" PRIMARY KEY ("id");
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'dish_lineages_natural_key'
  ) THEN
    ALTER TABLE "dish_lineages"
      ADD CONSTRAINT "dish_lineages_natural_key"
      UNIQUE ("dish_id", "lineage_id");
  END IF;
END $$;

-- ─── 8–10. Food-geography citation junctions ──────────────────────────────
-- These tables come from 0005_food_geography_phase_2a.sql, which is present
-- on disk but historically absent from the Drizzle journal on some DBs.
-- Skip cleanly when the relation does not exist.

DO $geo$ BEGIN
  IF to_regclass('public.food_region_sources') IS NULL THEN
    RAISE NOTICE '0010: skipping food_region_sources (table missing)';
  ELSE
    ALTER TABLE "food_region_sources"
      ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT uuid_generate_v4() NOT NULL;
    ALTER TABLE "food_region_sources"
      DROP CONSTRAINT IF EXISTS "food_region_sources_region_id_source_id_pk";
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint WHERE conname = 'food_region_sources_pkey'
    ) THEN
      ALTER TABLE "food_region_sources"
        ADD CONSTRAINT "food_region_sources_pkey" PRIMARY KEY ("id");
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'food_region_sources_natural_key'
    ) THEN
      ALTER TABLE "food_region_sources"
        ADD CONSTRAINT "food_region_sources_natural_key"
        UNIQUE ("region_id", "source_id");
    END IF;
  END IF;

  IF to_regclass('public.dish_region_sources') IS NULL THEN
    RAISE NOTICE '0010: skipping dish_region_sources (table missing)';
  ELSE
    ALTER TABLE "dish_region_sources"
      ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT uuid_generate_v4() NOT NULL;
    ALTER TABLE "dish_region_sources"
      DROP CONSTRAINT IF EXISTS "dish_region_sources_dish_region_type_source_pk";
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint WHERE conname = 'dish_region_sources_pkey'
    ) THEN
      ALTER TABLE "dish_region_sources"
        ADD CONSTRAINT "dish_region_sources_pkey" PRIMARY KEY ("id");
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'dish_region_sources_natural_key'
    ) THEN
      ALTER TABLE "dish_region_sources"
        ADD CONSTRAINT "dish_region_sources_natural_key"
        UNIQUE ("dish_id", "region_id", "relationship_type", "source_id");
    END IF;
  END IF;

  IF to_regclass('public.dish_location_sources') IS NULL THEN
    RAISE NOTICE '0010: skipping dish_location_sources (table missing)';
  ELSE
    ALTER TABLE "dish_location_sources"
      ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT uuid_generate_v4() NOT NULL;
    ALTER TABLE "dish_location_sources"
      DROP CONSTRAINT IF EXISTS "dish_location_sources_location_id_source_id_pk";
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint WHERE conname = 'dish_location_sources_pkey'
    ) THEN
      ALTER TABLE "dish_location_sources"
        ADD CONSTRAINT "dish_location_sources_pkey" PRIMARY KEY ("id");
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'dish_location_sources_natural_key'
    ) THEN
      ALTER TABLE "dish_location_sources"
        ADD CONSTRAINT "dish_location_sources_natural_key"
        UNIQUE ("location_id", "source_id");
    END IF;
  END IF;
END $geo$;

-- ─── 11. watch_list ───────────────────────────────────────────────────────

ALTER TABLE "watch_list"
  ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT uuid_generate_v4() NOT NULL;
ALTER TABLE "watch_list"
  DROP CONSTRAINT IF EXISTS "watch_list_user_id_target_type_target_id_pk";
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'watch_list_pkey'
  ) THEN
    ALTER TABLE "watch_list"
      ADD CONSTRAINT "watch_list_pkey" PRIMARY KEY ("id");
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'watch_list_natural_key'
  ) THEN
    ALTER TABLE "watch_list"
      ADD CONSTRAINT "watch_list_natural_key"
      UNIQUE ("user_id", "target_type", "target_id");
  END IF;
END $$;
