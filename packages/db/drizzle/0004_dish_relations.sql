-- Migration: 0004_dish_relations
-- Adds the dish-genealogy network: explicit typed relations between dishes.
-- Powers the "Related Dishes" section on every dish page and the
-- /family/[slug] food-family pages.

CREATE TABLE IF NOT EXISTS "dish_relations" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
	"from_dish_id" uuid NOT NULL,
	"to_dish_id" uuid NOT NULL,
	"relation_type" text NOT NULL,
	"reason" text,
	"strength" integer DEFAULT 3 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

-- Prevent exact duplicates of the same directed edge + relation_type.
-- Symmetric relations (A→B as family, B→A as family) are deliberately
-- permitted and the UI de-duplicates them at render time.
CREATE UNIQUE INDEX IF NOT EXISTS "dish_relations_from_to_type_unique"
  ON "dish_relations"("from_dish_id", "to_dish_id", "relation_type");
--> statement-breakpoint

-- Bidirectional lookup: "show everything related to dish X" can come
-- from either side of the edge in a single index seek.
CREATE INDEX IF NOT EXISTS "dish_relations_from_idx"
  ON "dish_relations"("from_dish_id");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "dish_relations_to_idx"
  ON "dish_relations"("to_dish_id");
--> statement-breakpoint

-- Type-filtered lookups (e.g. "show me only diaspora adaptations of X").
CREATE INDEX IF NOT EXISTS "dish_relations_type_idx"
  ON "dish_relations"("relation_type");
--> statement-breakpoint

-- FK constraints — both sides reference dishes with cascade delete so
-- removing a dish also removes its relations (no orphaned edges).
ALTER TABLE "dish_relations"
  ADD CONSTRAINT "dish_relations_from_dish_id_dishes_id_fk"
  FOREIGN KEY ("from_dish_id") REFERENCES "public"."dishes"("id")
  ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint

ALTER TABLE "dish_relations"
  ADD CONSTRAINT "dish_relations_to_dish_id_dishes_id_fk"
  FOREIGN KEY ("to_dish_id") REFERENCES "public"."dishes"("id")
  ON DELETE cascade ON UPDATE no action;