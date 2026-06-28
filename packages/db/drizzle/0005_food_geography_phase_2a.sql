-- Migration: 0005_food_geography_phase_2a
-- Adds the food-geography foundation: regions, dish↔region relationships,
-- flexible per-dish point locations, and junction tables to the existing
-- `sources` table for first-class citations.
--
-- Geometry is metadata-only in Phase 2A: full polygons live in versioned
-- GeoJSON files (e.g. apps/web/public/data/regions/the-levant.geojson)
-- authored via the QGIS workflow documented at docs/gis-workflow.md.
-- PostGIS is intentionally NOT introduced in this phase.

-- =====================================================================
-- food_regions
-- =====================================================================

CREATE TABLE IF NOT EXISTS "food_regions" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"description" text,
	"country_codes" text[],
	"geojson_path" text NOT NULL,
	"bbox" jsonb,
	"centroid_latitude" numeric,
	"centroid_longitude" numeric,
	"parent_region_id" uuid,
	"confidence" integer,
	"source_notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "food_regions_slug_unique" UNIQUE("slug"),
	CONSTRAINT "food_regions_type_check" CHECK ("type" IN ('culinary', 'cultural', 'geographic', 'historical', 'diaspora', 'trade_route', 'ingredient_zone')),
	CONSTRAINT "food_regions_status_check" CHECK ("status" IN ('draft', 'reviewed', 'published', 'deprecated'))
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "food_regions_type_idx" ON "food_regions"("type");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "food_regions_status_idx" ON "food_regions"("status");
--> statement-breakpoint

ALTER TABLE "food_regions"
  ADD CONSTRAINT "food_regions_parent_region_id_food_regions_id_fk"
  FOREIGN KEY ("parent_region_id") REFERENCES "public"."food_regions"("id")
  ON DELETE set null ON UPDATE no action;
--> statement-breakpoint

-- =====================================================================
-- dish_regions
-- =====================================================================

CREATE TABLE IF NOT EXISTS "dish_regions" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
	"dish_id" uuid NOT NULL,
	"region_id" uuid NOT NULL,
	"relationship_type" text NOT NULL,
	"confidence" integer,
	"is_primary" boolean DEFAULT false NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "dish_regions_dish_region_type_unique" UNIQUE("dish_id", "region_id", "relationship_type"),
	CONSTRAINT "dish_regions_relationship_type_check" CHECK ("relationship_type" IN ('origin', 'core_region', 'variation_region', 'popularity_region', 'diaspora_region', 'disputed_origin', 'ingredient_origin', 'historical_spread'))
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "dish_regions_dish_id_idx" ON "dish_regions"("dish_id");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "dish_regions_region_id_idx" ON "dish_regions"("region_id");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "dish_regions_relationship_type_idx" ON "dish_regions"("relationship_type");
--> statement-breakpoint

ALTER TABLE "dish_regions"
  ADD CONSTRAINT "dish_regions_dish_id_dishes_id_fk"
  FOREIGN KEY ("dish_id") REFERENCES "public"."dishes"("id")
  ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint

ALTER TABLE "dish_regions"
  ADD CONSTRAINT "dish_regions_region_id_food_regions_id_fk"
  FOREIGN KEY ("region_id") REFERENCES "public"."food_regions"("id")
  ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint

-- =====================================================================
-- dish_locations
-- =====================================================================

CREATE TABLE IF NOT EXISTS "dish_locations" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
	"dish_id" uuid NOT NULL,
	"location_type" text NOT NULL,
	"latitude" numeric NOT NULL,
	"longitude" numeric NOT NULL,
	"label" text,
	"country_code" text,
	"admin_region" text,
	"confidence" integer,
	"is_primary" boolean DEFAULT false NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "dish_locations_location_type_check" CHECK ("location_type" IN ('origin_point', 'representative_point', 'popularity_point', 'variation_point', 'diaspora_point', 'market_point'))
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "dish_locations_dish_id_idx" ON "dish_locations"("dish_id");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "dish_locations_location_type_idx" ON "dish_locations"("location_type");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "dish_locations_country_code_idx" ON "dish_locations"("country_code");
--> statement-breakpoint

ALTER TABLE "dish_locations"
  ADD CONSTRAINT "dish_locations_dish_id_dishes_id_fk"
  FOREIGN KEY ("dish_id") REFERENCES "public"."dishes"("id")
  ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint

-- =====================================================================
-- Source junction tables — link geography records to the existing
-- `sources` table so citations remain first-class and reusable.
-- =====================================================================

CREATE TABLE IF NOT EXISTS "food_region_sources" (
	"region_id" uuid NOT NULL,
	"source_id" uuid NOT NULL,
	CONSTRAINT "food_region_sources_region_id_source_id_pk" PRIMARY KEY("region_id","source_id")
);
--> statement-breakpoint

ALTER TABLE "food_region_sources"
  ADD CONSTRAINT "food_region_sources_region_id_food_regions_id_fk"
  FOREIGN KEY ("region_id") REFERENCES "public"."food_regions"("id")
  ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint

ALTER TABLE "food_region_sources"
  ADD CONSTRAINT "food_region_sources_source_id_sources_id_fk"
  FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id")
  ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "dish_region_sources" (
	"dish_id" uuid NOT NULL,
	"region_id" uuid NOT NULL,
	"relationship_type" text NOT NULL,
	"source_id" uuid NOT NULL,
	CONSTRAINT "dish_region_sources_dish_region_type_source_pk" PRIMARY KEY("dish_id","region_id","relationship_type","source_id"),
	CONSTRAINT "dish_region_sources_relationship_type_check" CHECK ("relationship_type" IN ('origin', 'core_region', 'variation_region', 'popularity_region', 'diaspora_region', 'disputed_origin', 'ingredient_origin', 'historical_spread'))
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "dish_region_sources_source_id_idx" ON "dish_region_sources"("source_id");
--> statement-breakpoint

ALTER TABLE "dish_region_sources"
  ADD CONSTRAINT "dish_region_sources_dish_id_dishes_id_fk"
  FOREIGN KEY ("dish_id") REFERENCES "public"."dishes"("id")
  ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint

ALTER TABLE "dish_region_sources"
  ADD CONSTRAINT "dish_region_sources_region_id_food_regions_id_fk"
  FOREIGN KEY ("region_id") REFERENCES "public"."food_regions"("id")
  ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint

ALTER TABLE "dish_region_sources"
  ADD CONSTRAINT "dish_region_sources_source_id_sources_id_fk"
  FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id")
  ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "dish_location_sources" (
	"location_id" uuid NOT NULL,
	"source_id" uuid NOT NULL,
	CONSTRAINT "dish_location_sources_location_id_source_id_pk" PRIMARY KEY("location_id","source_id")
);
--> statement-breakpoint

ALTER TABLE "dish_location_sources"
  ADD CONSTRAINT "dish_location_sources_location_id_dish_locations_id_fk"
  FOREIGN KEY ("location_id") REFERENCES "public"."dish_locations"("id")
  ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint

ALTER TABLE "dish_location_sources"
  ADD CONSTRAINT "dish_location_sources_source_id_sources_id_fk"
  FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id")
  ON DELETE cascade ON UPDATE no action;