-- Migration: 0006_lineages
-- Adds the Lineages domain: first-class entities that describe how a dish
-- idea travels, adapts, and influences across cultures and generations.
-- Distinct from families (form) and cuisines (region). Lineages are graph-
-- shaped (chains, clusters, cousins, fusions) and support explicit
-- uncertainty via a confidence_level enum on both the lineage itself and
-- each dish-lineage edge.

CREATE TABLE IF NOT EXISTS "lineages" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"short_description" text NOT NULL,
	"long_description" text,
	"concept_summary" text,
	"origin_summary" text,
	-- jsonb arrays so the taxonomy can evolve without schema migrations
	"origin_regions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"related_regions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"historical_forces" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"primary_technique" text,
	"techniques" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"base_ingredients" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"course_groups" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"related_families" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"representative_dishes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"confidence_level" text DEFAULT 'likely' NOT NULL,
	"uncertainty_note" text,
	"cultural_practice_note" text,
	"route_hints" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"source_notes" text,
	"display_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

-- Slug is the canonical URL handle — must be unique for /lineages/<slug>.
CREATE UNIQUE INDEX IF NOT EXISTS "lineages_slug_idx_unique"
  ON "lineages"("slug");
--> statement-breakpoint

-- Ordering in the index page is display_order ascending, then a fallback
-- tiebreaker. A non-unique index keeps inserts cheap.
CREATE INDEX IF NOT EXISTS "lineages_slug_idx"
  ON "lineages"("slug");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "lineages_display_order_idx"
  ON "lineages"("display_order");
--> statement-breakpoint

-- ─── Dish ↔ Lineage relationship ─────────────────────────────────────────
-- The editorial claim: is this dish an ancestor, descendant, regional
-- variant, diaspora adaptation, parallel invention, or uncertain cousin?
-- (dish_id, lineage_id) is the primary key — same dish can map to many
-- lineages but each pairing is a single editorial decision.

CREATE TABLE IF NOT EXISTS "dish_lineages" (
	"dish_id" uuid NOT NULL,
	"lineage_id" uuid NOT NULL,
	"role" text NOT NULL,
	"explanation" text,
	"changed_elements" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"confidence_level" text DEFAULT 'likely' NOT NULL,
	"sort_order" integer DEFAULT 5 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "dish_lineages_dish_id_lineage_id_pk" PRIMARY KEY("dish_id","lineage_id")
);
--> statement-breakpoint

-- Foreign keys to the canonical domain tables. ON DELETE CASCADE so removing
-- a dish or a lineage cleans up the join automatically.
ALTER TABLE "dish_lineages"
  ADD CONSTRAINT "dish_lineages_dish_id_dishes_id_fk"
  FOREIGN KEY ("dish_id") REFERENCES "dishes"("id") ON DELETE CASCADE;
--> statement-breakpoint

ALTER TABLE "dish_lineages"
  ADD CONSTRAINT "dish_lineages_lineage_id_lineages_id_fk"
  FOREIGN KEY ("lineage_id") REFERENCES "lineages"("id") ON DELETE CASCADE;
--> statement-breakpoint

-- "Show all dishes in this lineage" — primary lookup direction.
CREATE INDEX IF NOT EXISTS "dish_lineages_lineage_idx"
  ON "dish_lineages"("lineage_id");
--> statement-breakpoint

-- "Show all lineages for this dish" + "filter cards by role".
CREATE INDEX IF NOT EXISTS "dish_lineages_role_idx"
  ON "dish_lineages"("role");
--> statement-breakpoint