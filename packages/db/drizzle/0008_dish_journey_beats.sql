-- Migration: 0008_dish_journey_beats
-- P1-1 Dish Journey UI: ordered origin → adaptation beats per dish, with
-- optional source citation and a narrow confidence enum.
-- Hand-written (drizzle journal is out of sync — see TASKS "Drizzle journal
-- reconcile"). This file only creates dish_journey_beats; it does not touch
-- existing tables.

CREATE TABLE IF NOT EXISTS "dish_journey_beats" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
	"dish_id" uuid NOT NULL,
	"sequence" integer NOT NULL,
	"place_name" text NOT NULL,
	"lat" double precision,
	"lng" double precision,
	"year_approx" integer,
	"label" text NOT NULL,
	"confidence" text NOT NULL,
	"source_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "dish_journey_beats_confidence_check"
	  CHECK ("confidence" IN ('documented', 'likely', 'possible', 'parallel'))
);
--> statement-breakpoint

ALTER TABLE "dish_journey_beats"
  ADD CONSTRAINT "dish_journey_beats_dish_id_dishes_id_fk"
  FOREIGN KEY ("dish_id") REFERENCES "dishes"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint

ALTER TABLE "dish_journey_beats"
  ADD CONSTRAINT "dish_journey_beats_source_id_sources_id_fk"
  FOREIGN KEY ("source_id") REFERENCES "sources"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "dish_journey_beats_dish_seq_idx"
  ON "dish_journey_beats" ("dish_id", "sequence");
