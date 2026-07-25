-- 0011_dish_ingredients_pk.sql
-- ADR-002 Amendment 2 / Phase 2b follow-up: give dish_ingredients a primary key.
-- Hand-written — do not regenerate with drizzle-kit (journal drift).
-- Do NOT fold into 0010 — that file's SHA-256 is already published to Hermes.
--
-- Natural key decision: UNIQUE NULLS NOT DISTINCT (dish_id, ingredient_id, variant_id)
--
-- Why not (dish_id, ingredient_id) alone?
--   `variant_id` optionally pins an ingredient_variants row (cultivar / regional
--   form of the same ingredient). A dish may list the same ingredient twice in
--   different variant forms (e.g. generic eggplant + a specific cultivar). A
--   two-column UNIQUE would silently block that.
--
-- Why NULLS NOT DISTINCT?
--   `variant_id` is nullable. Plain UNIQUE treats each NULL as distinct, so
--   duplicate (dish, ingredient, NULL) rows would still be insertable — the
--   exact defect Amendment 2 calls out. Postgres 16 supports NULLS NOT DISTINCT.
--
-- Preflight: 4 rows on seeded gustale (moussaka-greek only; all variant_id NULL).
-- No duplicate (dish_id, ingredient_id, variant_id) triples.

ALTER TABLE "dish_ingredients"
  ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT uuid_generate_v4() NOT NULL;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'dish_ingredients_pkey'
  ) THEN
    ALTER TABLE "dish_ingredients"
      ADD CONSTRAINT "dish_ingredients_pkey" PRIMARY KEY ("id");
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'dish_ingredients_natural_key'
  ) THEN
    ALTER TABLE "dish_ingredients"
      ADD CONSTRAINT "dish_ingredients_natural_key"
      UNIQUE NULLS NOT DISTINCT ("dish_id", "ingredient_id", "variant_id");
  END IF;
END $$;
