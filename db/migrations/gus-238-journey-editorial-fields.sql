-- =====================================================================
-- GUS-238-journey-editorial-fields — additive extension for the dish
-- Journey presentation.
--
-- WHAT THIS IS
--   The dish Journey component already exists and renders journey beats
--   from `dish_journey_beats`. That table can hold a place, a point, an
--   approximate year, a label, a confidence value and one optional
--   source. It cannot hold the editorial distinctions a historical
--   chapter needs:
--
--     * the CHAPTER TITLE          ("A Korean name appears in an early text.")
--     * the DISPLAYED DATE         ("1810 · historical name record")
--     * the EVIDENCE TYPE          (primary record / scholarly
--                                  interpretation / reported account)
--     * the BIBLIOGRAPHIC LOCATOR  (page, recipe number, section)
--     * the AUTHORS of the source
--     * the PRECISION of the date  (exact / circa / range / century /
--                                  BCE / CE / unknown)
--     * the PLACE ROLE             (attestation / preparation context /
--                                  adaptation / reception)
--     * the SCOPE NOTE             (what the record does and does not
--                                  establish, and whether the primary
--                                  record was inspected)
--
--   Those are added here as NULLABLE columns, so every existing row and
--   every existing consumer keeps working untouched.
--
--   A second table holds TRANSMISSION EDGES: a claimed movement between
--   two chapters. This exists because chapter order and map proximity
--   must never imply a migration. An edge only exists if a historical
--   source supports it, and it carries its own claim, source and
--   confidence. There is no edge between two beats just because they are
--   adjacent in the list.
--
-- WHAT THIS DOES NOT DO
--   * It does NOT change the confidence enum. The existing CHECK
--     constraint ('documented','likely','possible','parallel') stays
--     exactly as it is; evidence type is carried by the new, separate
--     `evidence_kind` column so badge wording can be editorial without
--     touching the enum.
--   * It does NOT create a second journey store, a second lineage store
--     or a competing endpoint. Lineage already has a typed role,
--     explanation, changed_elements, confidence_level and sort_order in
--     `dish_lineages`; none of that is duplicated here.
--   * It does NOT create or promote any historical record. It is empty
--     structure only. Editorial data is a separate, reviewed decision.
--
-- Idempotent: re-running produces no changes.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1. dish_journey_beats: the editorial fields of a chapter.
-- ---------------------------------------------------------------------

ALTER TABLE "dish_journey_beats"
  ADD COLUMN IF NOT EXISTS "title" text;

ALTER TABLE "dish_journey_beats"
  ADD COLUMN IF NOT EXISTS "date_label" text;

-- The displayed date, kept separately from `year_approx` so that
-- "1810", "c. 1810", "1810-1820", "late 19th century", "1930s" and
-- "unknown" can all be represented without lying in an integer column.
-- `year_approx` stays the machine-readable anchor when one exists.
ALTER TABLE "dish_journey_beats"
  ADD COLUMN IF NOT EXISTS "date_precision" text;

-- What kind of evidence this chapter rests on. Deliberately separate
-- from `confidence`, which answers "how sure are we" while this
-- answers "what sort of record is this".
ALTER TABLE "dish_journey_beats"
  ADD COLUMN IF NOT EXISTS "evidence_kind" text;

ALTER TABLE "dish_journey_beats"
  ADD COLUMN IF NOT EXISTS "locator" text;

ALTER TABLE "dish_journey_beats"
  ADD COLUMN IF NOT EXISTS "authors" text;

-- The role the place plays in this chapter. NOT the dish's birthplace:
-- a book printed in London is not the origin of the dish it records.
ALTER TABLE "dish_journey_beats"
  ADD COLUMN IF NOT EXISTS "place_role" text;

-- What the record establishes, and what it does not. Also carries the
-- inspection status: whether the primary record was read directly or
-- reported through another author.
ALTER TABLE "dish_journey_beats"
  ADD COLUMN IF NOT EXISTS "scope_note" text;

-- Coarse geographic framing for broad regional evidence, as
-- [west, south, east, north]. Used instead of inventing a point.
ALTER TABLE "dish_journey_beats"
  ADD COLUMN IF NOT EXISTS "bounds" jsonb
  NOT NULL DEFAULT '[]'::jsonb;

-- Named regions this chapter refers to.
ALTER TABLE "dish_journey_beats"
  ADD COLUMN IF NOT EXISTS "regions" jsonb
  NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE "dish_journey_beats"
  ADD CONSTRAINT "dish_journey_beats_date_precision_check"
  CHECK ("date_precision" IS NULL OR "date_precision" IN (
    'exact', 'circa', 'range', 'century', 'decade', 'bce', 'ce', 'unknown'
  ));

ALTER TABLE "dish_journey_beats"
  ADD CONSTRAINT "dish_journey_beats_evidence_kind_check"
  CHECK ("evidence_kind" IS NULL OR "evidence_kind" IN (
    'primary_record', 'scholarly_interpretation', 'reported_account',
    'reference_work', 'archival_record', 'comparison'
  ));

ALTER TABLE "dish_journey_beats"
  ADD CONSTRAINT "dish_journey_beats_place_role_check"
  CHECK ("place_role" IS NULL OR "place_role" IN (
    'attestation', 'preparation_context', 'adaptation', 'reception',
    'circulation', 'regional_identity'
  ));

-- ---------------------------------------------------------------------
-- 2. dish_journey_movements — source-supported transmission edges.
--
--    One row = one claimed movement, with its own claim text, its own
--    source and its own confidence. Two chapters that are adjacent in
--    the list, or close on a map, do NOT produce a row here; only a
--    historical record does. A row may be drawn as a line; the absence
--    of a row means no line.
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "dish_journey_movements" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
	"dish_id" uuid NOT NULL,
	"from_beat_id" uuid NOT NULL,
	"to_beat_id" uuid NOT NULL,
	"label" text NOT NULL,
	"confidence" text NOT NULL,
	"source_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "dish_journey_movements_confidence_check"
	  CHECK ("confidence" IN ('documented', 'likely', 'possible', 'parallel')),
	CONSTRAINT "dish_journey_movements_distinct_beats_check"
	  CHECK ("from_beat_id" <> "to_beat_id")
);

ALTER TABLE "dish_journey_movements"
  ADD CONSTRAINT "dish_journey_movements_dish_id_dishes_id_fk"
  FOREIGN KEY ("dish_id") REFERENCES "dishes"("id") ON DELETE cascade ON UPDATE no action;

ALTER TABLE "dish_journey_movements"
  ADD CONSTRAINT "dish_journey_movements_source_id_sources_id_fk"
  FOREIGN KEY ("source_id") REFERENCES "sources"("id") ON DELETE set null ON UPDATE no action;

ALTER TABLE "dish_journey_movements"
  ADD CONSTRAINT "dish_journey_movements_from_beat_fk"
  FOREIGN KEY ("from_beat_id") REFERENCES "dish_journey_beats"("id") ON DELETE cascade ON UPDATE no action;

ALTER TABLE "dish_journey_movements"
  ADD CONSTRAINT "dish_journey_movements_to_beat_fk"
  FOREIGN KEY ("to_beat_id") REFERENCES "dish_journey_beats"("id") ON DELETE cascade ON UPDATE no action;

CREATE INDEX IF NOT EXISTS "dish_journey_movements_dish_idx"
  ON "dish_journey_movements" ("dish_id");

COMMIT;
