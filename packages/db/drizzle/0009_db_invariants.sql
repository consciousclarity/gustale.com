-- 0009_db_invariants.sql
-- ADR-002 Phase 2 (partial): move expressible invariants into Postgres.
-- Hand-written — do not regenerate with drizzle-kit (journal drift).
--
-- Scope:
--   1. Surrogate PKs on EMPTY translation tables only
--      (category / ingredient / preparation_method). dish_translations has
--      121 seeded rows — left composite-PK; separate migration later.
--   2. Geometry bounds + SRID 4326 on three geometry columns (NULL ok).
--   3. Status / confidence / journey sequence / no self-relations CHECKs.
--
-- Preflight on seeded gustale_ci_sim @ 2026-07-25: zero violations for all
-- new CHECKs/UNIQUEs. Spike DB had 2 artificial POINT(999 999) rows from the
-- Directus evaluation — deleted before applying.

-- ─── 1. Translation tables (empty only) ─────────────────────────────────

ALTER TABLE "category_translations"
  DROP CONSTRAINT IF EXISTS "category_translations_category_id_language_pk";
ALTER TABLE "category_translations"
  ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT uuid_generate_v4() NOT NULL;
ALTER TABLE "category_translations"
  ADD CONSTRAINT "category_translations_pkey" PRIMARY KEY ("id");
ALTER TABLE "category_translations"
  ADD CONSTRAINT "category_translations_category_id_language_unique"
  UNIQUE ("category_id", "language");

ALTER TABLE "ingredient_translations"
  DROP CONSTRAINT IF EXISTS "ingredient_translations_ingredient_id_language_pk";
ALTER TABLE "ingredient_translations"
  ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT uuid_generate_v4() NOT NULL;
ALTER TABLE "ingredient_translations"
  ADD CONSTRAINT "ingredient_translations_pkey" PRIMARY KEY ("id");
ALTER TABLE "ingredient_translations"
  ADD CONSTRAINT "ingredient_translations_ingredient_id_language_unique"
  UNIQUE ("ingredient_id", "language");

ALTER TABLE "preparation_method_translations"
  DROP CONSTRAINT IF EXISTS "preparation_method_translations_method_id_language_pk";
ALTER TABLE "preparation_method_translations"
  ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT uuid_generate_v4() NOT NULL;
ALTER TABLE "preparation_method_translations"
  ADD CONSTRAINT "preparation_method_translations_pkey" PRIMARY KEY ("id");
ALTER TABLE "preparation_method_translations"
  ADD CONSTRAINT "preparation_method_translations_method_id_language_unique"
  UNIQUE ("method_id", "language");

-- ─── 2. Geometry bounds (NULL remains allowed) ──────────────────────────

ALTER TABLE "dishes"
  ADD CONSTRAINT "dishes_origin_location_bounds_check" CHECK (
    "origin_location" IS NULL
    OR (
      ST_X("origin_location"::geometry) >= -180
      AND ST_X("origin_location"::geometry) <= 180
      AND ST_Y("origin_location"::geometry) >= -90
      AND ST_Y("origin_location"::geometry) <= 90
      AND ST_SRID("origin_location"::geometry) = 4326
    )
  );

ALTER TABLE "geo_entities"
  ADD CONSTRAINT "geo_entities_centroid_bounds_check" CHECK (
    "centroid" IS NULL
    OR (
      ST_X("centroid"::geometry) >= -180
      AND ST_X("centroid"::geometry) <= 180
      AND ST_Y("centroid"::geometry) >= -90
      AND ST_Y("centroid"::geometry) <= 90
      AND ST_SRID("centroid"::geometry) = 4326
    )
  );

ALTER TABLE "dish_variants"
  ADD CONSTRAINT "dish_variants_region_location_bounds_check" CHECK (
    "region_location" IS NULL
    OR (
      ST_X("region_location"::geometry) >= -180
      AND ST_X("region_location"::geometry) <= 180
      AND ST_Y("region_location"::geometry) >= -90
      AND ST_Y("region_location"::geometry) <= 90
      AND ST_SRID("region_location"::geometry) = 4326
    )
  );

-- ─── 3. Status / journey / relations ────────────────────────────────────

ALTER TABLE "dishes"
  ADD CONSTRAINT "dishes_status_check" CHECK (
    "status" IN ('draft', 'published', 'archived')
  );

ALTER TABLE "dish_variants"
  ADD CONSTRAINT "dish_variants_status_check" CHECK (
    "status" IN ('draft', 'published', 'archived')
  );

-- confidence CHECK already exists as dish_journey_beats_confidence_check
-- (added in 0008). Left untouched.

ALTER TABLE "dish_journey_beats"
  ADD CONSTRAINT "dish_journey_beats_sequence_positive_check" CHECK (
    "sequence" >= 1
  );

-- Promote the existing (dish_id, sequence) index intent to UNIQUE.
-- A non-unique index dish_journey_beats_dish_seq_idx may already exist;
-- drop it if present so the unique constraint can own the index.
DROP INDEX IF EXISTS "dish_journey_beats_dish_seq_idx";
ALTER TABLE "dish_journey_beats"
  ADD CONSTRAINT "dish_journey_beats_dish_id_sequence_unique"
  UNIQUE ("dish_id", "sequence");

ALTER TABLE "dish_relations"
  ADD CONSTRAINT "dish_relations_no_self_check" CHECK (
    "from_dish_id" <> "to_dish_id"
  );
