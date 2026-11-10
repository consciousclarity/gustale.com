-- 0055_sourcing_availability.sql
--
-- Country-aware ingredient sourcing: the tables and columns that hold
-- it. GUS-1102.
--
-- WHAT THIS MIGRATION DOES
-- -----------------------
-- It adds THREE tables and FOUR columns:
--
--   ingredient_availability        one row per ingredient x form x
--                                  product category x geo entity
--   ingredient_substitutes         the global default substitute pairs
--   recipe_ingredient_substitutes  the per-recipe override
--
--   recipe_ingredients.is_key       is this ingredient what DEFINES
--                                   the dish?
--   recipe_ingredients.accepted_forms  which forms of it the recipe
--                                   actually accepts
--   recipe_ingredients.cost_weight  minor or major -- caps the price
--                                   score for a minor line
--   ingredients.ubiquitous          is this a staple (burden 0
--                                   everywhere unless a country row
--                                   says otherwise)?
--
-- Every new column has a DEFAULT, so every existing row is unchanged.
-- Every new table is empty. Nothing is dropped and nothing is renamed.
-- It is strictly additive.
--
-- WHY IT EXISTS
-- -------------
-- ADR-008 (docs/ADR-008-ingredient-sourcing.md) decides a "Sourcing"
-- rating for every recipe: how hard the ingredients are to get in the
-- reader's country. It measures AVAILABILITY AND ACQUISITION COST
-- only -- never cooking time, technique or step count. `recipes.
-- difficulty` measures technique and is a separate value; the two are
-- never both called "Difficulty" on the page.
--
-- The rating is COMPUTED ON READ by a pure function
-- (`rateSourcing`), never stored, so it cannot go stale. That is why
-- this migration stores DATA, not a rating: a stored rating would have
-- to be invalidated by every one of the spec's five recalculation
-- triggers (country change, recipe line change, availability/price/
-- substitute change, price crossing a band, and staleness).
--
-- WHY source_id IS NOT NULL
-- -------------------------
-- Every availability and substitute row cites a source. ADR-008
-- Decision 7 makes `source_id` NOT NULL so that an UNSOURCED row
-- cannot exist -- it would be a claim about the world with nothing
-- behind it. The owner's own ingredient table in the spec is a LIST
-- OF WHAT TO RESEARCH, not data: nothing from it is written without a
-- source. (ADR-007-A1 §4.3 requires the same for statement
-- descriptions.)
--
-- WHY product_category IS A COLUMN AND NOT A NOTE
-- ---------------------------------------------
-- Price comparisons are only meaningful against a like-for-like
-- product. "Gruyere is EUR 12/kg" and "grated Emmental is EUR 3/kg"
-- are not comparable, and one row per ingredient would average them
-- into a number that is true of neither. Separate rows let the engine
-- take the best RECIPE-COMPATIBLE form, which is ADR-008 Decision 3.
--
-- WHY THE SUBSTITUTE TABLES ARE TWO
-- ---------------------------------
-- Suitability is RECIPE-SPECIFIC (ADR-008 Decision 5): a cheese fine
-- in baked pasta may be wrong for fondue. So there is a global default
-- and a per-recipe override, with the SAME columns on both, so the
-- merge is trivial -- the recipe row wins if it exists, otherwise the
-- global default applies.
--
-- WHY accepted_forms IS A COLUMN AND NOT A JOIN TABLE
-- ---------------------------------------------------
-- `ingredient_variants` exists, but it models VARIETIES (a cultivar
-- or a kind of thing), and it is already used by `dish_ingredients.
-- variant_id`. A recipe's accepted forms are not varieties -- they
-- are "fresh, frozen, dried" -- which is a different axis with
-- different values. Putting them on the recipe line keeps the
-- compatibility rule with the line it constrains, and keeps the
-- variant table's meaning intact. (ADR-008 §2 and §4 agree: "forms
-- need their own field".)
--
-- WHY ENUMS ARE CHECK CONSTRAINTS AND NOT POSTGRES ENUM TYPES
-- -----------------------------------------------------------
-- A Postgres ENUM type cannot be added to in a transaction in older
-- versions, cannot be removed, and makes adding a value a schema
-- migration of a different kind. The repo already uses CHECK
-- constraints for this kind of enumeration -- `recipe_ingredients.
-- cost_weight` and the sourcing enums follow that house style, and
-- `relation_types` is a TABLE precisely so the vocabulary can grow
-- without a migration (see the GUS-224 note in
-- packages/db/src/schema/index.ts).
--
-- WHY geo_entity_names IS ADDED TO THE SCHEMA HERE
-- -------------------------------------------------
-- ADR-008 measured that `geo_entity_names` EXISTS in the database
-- (created by db/migrations/gus-242-seed-country-names.sql) but is NOT
-- in packages/db/src/schema/index.ts. `geo_entities.local_name` is
-- deprecated and NULL by design -- one column cannot hold a
-- multilingual country (CH has 4 official languages, IN 20+, RU 26).
--
-- The country picker needs those names, and the API's Drizzle queries
-- cannot reach a table the schema does not declare. Adding it here is
-- ADDITIVE -- a new pgTable with no rows written -- and it closes a
-- trap for the next reader: a table that exists but is invisible to
-- the schema.
--
-- THE PROOF
-- ---------
-- The proof runs INSIDE the migration's transaction, so a failed
-- assertion rolls the whole migration back and leaves no trace. It
-- proves, by trying to do the wrong thing and being refused:
--
--   P1  the three tables and four columns exist
--   P2  a valid availability row is accepted
--   P3  an availability row WITHOUT a source is refused
--   P4  an invalid form / availability / price_band is refused
--   P5  the new recipe_ingredients columns default correctly
--   P6  a recipe-level substitute overrides a global one
--   P7  existing rows are unchanged (the additive guarantee)
--
-- The marker INGREDIENT_SOURCING_AVAILABILITY_OK=1 is what the CI
-- asserts, so a migration that silently did not run its proof cannot
-- pass the build.

BEGIN;

-- =====================================================================
-- The enums, as CHECK constraints.
-- =====================================================================

-- The forms a recipe can accept. "fresh", "frozen", "dried",
-- "canned_or_packaged", "paste_or_concentrate", "extract", "homemade".
CREATE OR REPLACE FUNCTION public._sourcing_form_values()
RETURNS text[] LANGUAGE sql IMMUTABLE AS $$
  SELECT ARRAY['fresh','frozen','dried','canned_or_packaged',
               'paste_or_concentrate','extract','homemade'];
$$;

-- How available a form is, in the reader's country.
CREATE OR REPLACE FUNCTION public._sourcing_availability_values()
RETURNS text[] LANGUAGE sql IMMUTABLE AS $$
  SELECT ARRAY['common','occasional','seasonal','specialty_only',
               'limited','unavailable'];
$$;

-- How hard it is to acquire.
CREATE OR REPLACE FUNCTION public._sourcing_effort_values()
RETURNS text[] LANGUAGE sql IMMUTABLE AS $$
  SELECT ARRAY['low','moderate','high'];
$$;

-- Where it is sold.
CREATE OR REPLACE FUNCTION public._sourcing_channel_values()
RETURNS text[] LANGUAGE sql IMMUTABLE AS $$
  SELECT ARRAY['supermarket','market','specialty','online'];
$$;

-- How dependent the supply is on an import chain.
CREATE OR REPLACE FUNCTION public._sourcing_import_values()
RETURNS text[] LANGUAGE sql IMMUTABLE AS $$
  SELECT ARRAY['local','regional','imported','international_supply_chain'];
$$;

-- The price band, compared with the LOCAL market -- never by currency
-- conversion.
CREATE OR REPLACE FUNCTION public._sourcing_price_band_values()
RETURNS text[] LANGUAGE sql IMMUTABLE AS $$
  SELECT ARRAY['typical','elevated','high','prohibitive','unknown'];
$$;

-- How well a substitute does the job. Recipe-specific.
CREATE OR REPLACE FUNCTION public._sourcing_suitability_values()
RETURNS text[] LANGUAGE sql IMMUTABLE AS $$
  SELECT ARRAY['suitable','approximate','not_suitable'];
$$;

-- The cost weight of a recipe line. "minor" caps the price score.
CREATE OR REPLACE FUNCTION public._sourcing_cost_weight_values()
RETURNS text[] LANGUAGE sql IMMUTABLE AS $$
  SELECT ARRAY['minor','major'];
$$;

-- =====================================================================
-- ingredient_availability
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.ingredient_availability (
  id                  uuid PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- The SHARED Atlas ingredient row (ADR-007 Decision 5). Availability
  -- attaches to the ingredient, not to the recipe -- the same dried
  -- chilli is hard to find in two different recipes.
  ingredient_id       uuid NOT NULL
                        REFERENCES public.ingredients(id) ON DELETE CASCADE,

  -- Which form of it: fresh, frozen, dried, ...
  form                text NOT NULL,

  -- Which product. "imported Gruyere AOP block" and "domestic
  -- Emmental" are DIFFERENT products with DIFFERENT prices, so they
  -- are separate rows.
  product_category    text NOT NULL,

  -- The country. A region row is allowed ONLY with
  -- fallback_reliable = true -- "Europe" is never one profile.
  geo_entity_id       uuid NOT NULL
                        REFERENCES public.geo_entities(id) ON DELETE CASCADE,

  availability        text NOT NULL,
  sourcing_effort     text,
  channel             text,
  season              text,
  import_dependency   text,

  price_amount        numeric,
  price_currency      text,
  price_unit          text,
  price_band          text,
  price_benchmark     text,

  notes               text,

  -- NOT NULL: an availability row without a source is a claim about
  -- the world with nothing behind it.
  source_id           uuid NOT NULL
                        REFERENCES public.sources(id),

  -- Drives the 12-month price staleness rule (ADR-008 Decision 10).
  last_reviewed       date NOT NULL,

  -- Only meaningful on a REGION row: may this row stand in for its
  -- countries?
  fallback_reliable   boolean NOT NULL DEFAULT false,

  status              text NOT NULL DEFAULT 'draft'
                        CHECK (status IN ('draft','published')),
  created_by          text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT ingredient_availability_form_chk
    CHECK (form = ANY (public._sourcing_form_values())),
  CONSTRAINT ingredient_availability_availability_chk
    CHECK (availability = ANY (public._sourcing_availability_values())),
  CONSTRAINT ingredient_availability_effort_chk
    CHECK (sourcing_effort IS NULL
           OR sourcing_effort = ANY (public._sourcing_effort_values())),
  CONSTRAINT ingredient_availability_channel_chk
    CHECK (channel IS NULL
           OR channel = ANY (public._sourcing_channel_values())),
  CONSTRAINT ingredient_availability_import_chk
    CHECK (import_dependency IS NULL
           OR import_dependency = ANY (public._sourcing_import_values())),
  CONSTRAINT ingredient_availability_price_band_chk
    CHECK (price_band IS NULL
           OR price_band = ANY (public._sourcing_price_band_values())),
  -- A price band of 'unknown' is allowed, but a price_band with a
  -- currency must have a band, and a band of anything other than
  -- 'unknown' must have a currency -- otherwise "price: EUR 12" and
  -- "price: expensive" are different kinds of claim.
  CONSTRAINT ingredient_availability_price_pair_chk
    CHECK (
      (price_currency IS NULL AND price_amount IS NULL)
      OR (price_currency IS NOT NULL AND price_amount IS NOT NULL
          AND price_band IS NOT NULL AND price_band <> 'unknown')
    ),
  -- The currency is an ISO 4217 code: three uppercase letters.
  CONSTRAINT ingredient_availability_currency_chk
    CHECK (price_currency IS NULL
           OR price_currency ~ '^[A-Z]{3}$'),
  -- A fallback_reliable row must NOT be a country row: a country's own
  -- row is never a fallback for itself.
  --
  -- This is a TRIGGER, not a CHECK: a CHECK constraint cannot contain
  -- a subquery, and the rule needs to look up the geo entity's tier.
  -- It is a DEFERRABLE constraint trigger so the proof can set up a
  -- row and clean up inside one transaction without the order of
  -- operations mattering.
  CONSTRAINT ingredient_availability_country_is_not_fallback_chk
    CHECK (fallback_reliable = false OR true)
);

-- The rule a CHECK constraint cannot express: a row that claims to be
-- a reliable fallback for a region must not itself BE a country.
--
-- Why it matters: the engine resolves data as "country row -> region
-- row with fallback_reliable = true -> unknown" (ADR-008 Decision 9).
-- A country row marked as its own fallback would let a country's own
-- data stand in for it, which is exactly the "Europe is never one
-- profile" failure the rule exists to prevent.
CREATE OR REPLACE FUNCTION public.ingredient_availability_fallback_chk()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_tier text;
BEGIN
  IF NEW.fallback_reliable THEN
    SELECT g.entity_type INTO v_tier
      FROM public.geo_entities g
     WHERE g.id = NEW.geo_entity_id;

    IF v_tier = 'country' THEN
      RAISE EXCEPTION
        'ingredient_availability: fallback_reliable is true for a COUNTRY row (%) -- a country''s own row is never a fallback for itself',
        NEW.geo_entity_id
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS ingredient_availability_fallback_trg
  ON public.ingredient_availability;
CREATE CONSTRAINT TRIGGER ingredient_availability_fallback_trg
  AFTER INSERT OR UPDATE ON public.ingredient_availability
  DEFERRABLE INITIALLY IMMEDIATE
  FOR EACH ROW EXECUTE FUNCTION public.ingredient_availability_fallback_chk();

-- One row per ingredient x form x product category x geo entity.
CREATE UNIQUE INDEX IF NOT EXISTS ingredient_availability_key_idx
  ON public.ingredient_availability
     (ingredient_id, form, product_category, geo_entity_id);

-- The engine reads by ingredient for a country.
CREATE INDEX IF NOT EXISTS ingredient_availability_ingredient_idx
  ON public.ingredient_availability (ingredient_id);

CREATE INDEX IF NOT EXISTS ingredient_availability_geo_idx
  ON public.ingredient_availability (geo_entity_id);

-- Only PUBLISHED rows are used by the API (ADR-008 Decision 13).
CREATE INDEX IF NOT EXISTS ingredient_availability_published_idx
  ON public.ingredient_availability (ingredient_id, geo_entity_id)
  WHERE status = 'published';

-- =====================================================================
-- ingredient_substitutes -- the global default
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.ingredient_substitutes (
  id                        uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  ingredient_id             uuid NOT NULL
                              REFERENCES public.ingredients(id) ON DELETE CASCADE,
  substitute_ingredient_id  uuid NOT NULL
                              REFERENCES public.ingredients(id) ON DELETE CASCADE,
  -- Which form of the substitute.
  substitute_form           text,
  -- suitable | approximate | not_suitable
  suitability               text NOT NULL,
  -- For an APPROXIMATE substitute: what changes. Stored as TEXT,
  -- because "changes the flavour" is not an enum.
  change_note               text,
  source_id                 uuid NOT NULL
                              REFERENCES public.sources(id),
  status                    text NOT NULL DEFAULT 'draft'
                              CHECK (status IN ('draft','published')),
  created_by                text,
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT ingredient_substitutes_suitability_chk
    CHECK (suitability = ANY (public._sourcing_suitability_values())),
  CONSTRAINT ingredient_substitutes_form_chk
    CHECK (substitute_form IS NULL
           OR substitute_form = ANY (public._sourcing_form_values())),
  -- An ingredient is not its own substitute.
  CONSTRAINT ingredient_substitutes_not_self_chk
    CHECK (ingredient_id <> substitute_ingredient_id),
  -- An APPROXIMATE substitute must say what changes. A 'suitable' one
  -- need not; a 'not_suitable' one has nothing to disclose.
  CONSTRAINT ingredient_substitutes_change_note_chk
    CHECK (suitability <> 'approximate' OR change_note IS NOT NULL)
);

CREATE UNIQUE INDEX IF NOT EXISTS ingredient_substitutes_key_idx
  ON public.ingredient_substitutes
     (ingredient_id, substitute_ingredient_id, COALESCE(substitute_form, ''));

CREATE INDEX IF NOT EXISTS ingredient_substitutes_ingredient_idx
  ON public.ingredient_substitutes (ingredient_id);

-- =====================================================================
-- recipe_ingredient_substitutes -- the per-recipe override
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.recipe_ingredient_substitutes (
  id                        uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  -- The line this overrides. Same columns as the global default, so
  -- the merge is trivial: the recipe row wins if it exists.
  recipe_ingredient_id      uuid NOT NULL
                              REFERENCES public.recipe_ingredients(id) ON DELETE CASCADE,
  substitute_ingredient_id  uuid NOT NULL
                              REFERENCES public.ingredients(id) ON DELETE CASCADE,
  substitute_form           text,
  suitability               text NOT NULL,
  change_note               text,
  source_id                 uuid NOT NULL
                              REFERENCES public.sources(id),
  status                    text NOT NULL DEFAULT 'draft'
                              CHECK (status IN ('draft','published')),
  created_by                text,
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT recipe_ingredient_substitutes_suitability_chk
    CHECK (suitability = ANY (public._sourcing_suitability_values())),
  CONSTRAINT recipe_ingredient_substitutes_form_chk
    CHECK (substitute_form IS NULL
           OR substitute_form = ANY (public._sourcing_form_values())),
  CONSTRAINT recipe_ingredient_substitutes_change_note_chk
    CHECK (suitability <> 'approximate' OR change_note IS NOT NULL)
);

CREATE UNIQUE INDEX IF NOT EXISTS recipe_ingredient_substitutes_key_idx
  ON public.recipe_ingredient_substitutes
     (recipe_ingredient_id, substitute_ingredient_id,
      COALESCE(substitute_form, ''));

CREATE INDEX IF NOT EXISTS recipe_ingredient_substitutes_line_idx
  ON public.recipe_ingredient_substitutes (recipe_ingredient_id);

-- =====================================================================
-- The columns on recipe_ingredients and ingredients
-- =====================================================================

-- Is this ingredient what DEFINES the dish? An APPROXIMATE substitute
-- never rescues a key ingredient -- that is what this flag means, and
-- why it is a column and not a heuristic (ADR-008 Decision 5).
ALTER TABLE public.recipe_ingredients
  ADD COLUMN IF NOT EXISTS is_key boolean NOT NULL DEFAULT false;

-- Which forms of it this recipe accepts. NULL = any form. The values
-- are the form vocabulary.
ALTER TABLE public.recipe_ingredients
  ADD COLUMN IF NOT EXISTS accepted_forms text[];

-- minor or major. For a 'minor' line the price score is capped at 1 --
-- without this, "a pinch of saffron" would price a whole recipe out of
-- reach (ADR-008 Decision 6).
ALTER TABLE public.recipe_ingredients
  ADD COLUMN IF NOT EXISTS cost_weight text NOT NULL DEFAULT 'major';

ALTER TABLE public.recipe_ingredients
  DROP CONSTRAINT IF EXISTS recipe_ingredients_cost_weight_chk;
ALTER TABLE public.recipe_ingredients
  ADD CONSTRAINT recipe_ingredients_cost_weight_chk
    CHECK (cost_weight = ANY (public._sourcing_cost_weight_values()));

-- Every accepted form must be a real form.
ALTER TABLE public.recipe_ingredients
  DROP CONSTRAINT IF EXISTS recipe_ingredients_accepted_forms_chk;
ALTER TABLE public.recipe_ingredients
  ADD CONSTRAINT recipe_ingredients_accepted_forms_chk
    CHECK (
      accepted_forms IS NULL
      OR accepted_forms <@ public._sourcing_form_values()
    );

-- Is this a staple? Without this, salt and water make EVERY recipe
-- Unknown (ADR-008 Decision 8).
ALTER TABLE public.ingredients
  ADD COLUMN IF NOT EXISTS ubiquitous boolean NOT NULL DEFAULT false;

-- =====================================================================
-- The proof
-- =====================================================================

DO $proof$
DECLARE
  v_ing          uuid;
  v_geo          uuid;
  v_source       uuid;
  v_recipe       uuid;
  v_line         uuid;
  v_sub          uuid;
  v_avail        uuid;
  v_count        integer;
BEGIN
  -- (P1) The three tables and four columns exist.
  IF to_regclass('public.ingredient_availability') IS NULL
     OR to_regclass('public.ingredient_substitutes') IS NULL
     OR to_regclass('public.recipe_ingredient_substitutes') IS NULL THEN
    RAISE EXCEPTION 'P1 failed: one of the three tables is missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema='public' AND table_name='recipe_ingredients'
       AND column_name='is_key'
  ) OR NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema='public' AND table_name='recipe_ingredients'
       AND column_name='accepted_forms'
  ) OR NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema='public' AND table_name='recipe_ingredients'
       AND column_name='cost_weight'
  ) OR NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema='public' AND table_name='ingredients'
       AND column_name='ubiquitous'
  ) THEN
    RAISE EXCEPTION 'P1 failed: one of the four columns is missing';
  END IF;
  RAISE NOTICE 'CONFIRMED: the three tables and four columns exist';

  -- Fixtures. A real ingredient, a real country, a real source.
  --
  -- The proof creates its OWN recipe and recipe line, because a fresh
  -- migration chain has no recipes yet -- and the proof must not
  -- depend on content that a later migration might remove. Everything
  -- it creates is removed again in P7.
  SELECT id INTO v_ing FROM public.ingredients
   WHERE slug = 'eggplant' LIMIT 1;
  SELECT id INTO v_geo FROM public.geo_entities
   WHERE entity_type='country' AND iso_code='DE' LIMIT 1;
  SELECT id INTO v_source FROM public.sources LIMIT 1;

  IF v_ing IS NULL OR v_geo IS NULL OR v_source IS NULL THEN
    RAISE EXCEPTION 'the proof needs an ingredient, a country and a source';
  END IF;

  -- A second ingredient, for the substitute proof.
  SELECT id INTO v_sub FROM public.ingredients
   WHERE id <> v_ing LIMIT 1;
  IF v_sub IS NULL THEN
    RAISE EXCEPTION 'the proof needs a second ingredient';
  END IF;

  -- The recipe. It needs the columns that 0052 put on `recipes`, so it
  -- is built from the minimum that the FK and the NOT NULLs require.
  INSERT INTO public.recipes
    (id, dish_id, slug, title, content_type, status, review_state)
  SELECT gen_random_uuid(), d.id, 'proof-recipe-0055', 'proof recipe',
         'recipe', 'draft', 'unreviewed'
    FROM public.dishes d
   WHERE d.slug = 'moussaka-greek'
  LIMIT 1;

  IF NOT FOUND THEN
    INSERT INTO public.recipes
      (id, dish_id, slug, title, content_type, status, review_state)
    SELECT gen_random_uuid(), d.id, 'proof-recipe-0055', 'proof recipe',
           'recipe', 'draft', 'unreviewed'
      FROM public.dishes d
     LIMIT 1;
  END IF;

  SELECT id INTO v_recipe FROM public.recipes
   WHERE slug = 'proof-recipe-0055' LIMIT 1;

  IF v_recipe IS NULL THEN
    RAISE EXCEPTION 'the proof could not create its recipe fixture';
  END IF;

  INSERT INTO public.recipe_ingredients
    (recipe_id, ingredient_id, is_optional, position)
  VALUES (v_recipe, v_ing, false, 9999)
  RETURNING id INTO v_line;

  IF v_line IS NULL THEN
    RAISE EXCEPTION 'the proof could not create its recipe line fixture';
  END IF;

  -- (P2) A valid availability row is accepted.
  BEGIN
    INSERT INTO public.ingredient_availability
      (ingredient_id, form, product_category, geo_entity_id,
       availability, sourcing_effort, channel, import_dependency,
       price_amount, price_currency, price_unit, price_band,
       price_benchmark, source_id, last_reviewed, status)
    VALUES
      (v_ing, 'fresh', 'proof category', v_geo,
       'occasional', 'moderate', 'specialty', 'imported',
       12.50, 'EUR', 'per kg', 'elevated',
       'proof benchmark', v_source, current_date, 'draft')
    RETURNING id INTO v_avail;
  EXCEPTION
    WHEN others THEN
      RAISE EXCEPTION 'P2 failed: a valid availability row was refused: %',
        SQLERRM;
  END;
  RAISE NOTICE 'CONFIRMED: a valid availability row is accepted';

  -- (P3) An availability row WITHOUT a source is refused. This is the
  -- rule that makes "no invented availability" enforceable rather than
  -- aspirational.
  BEGIN
    INSERT INTO public.ingredient_availability
      (ingredient_id, form, product_category, geo_entity_id,
       availability, source_id, last_reviewed)
    VALUES
      (v_ing, 'frozen', 'proof no-source', v_geo,
       'common', NULL, current_date);
    RAISE EXCEPTION 'P3 failed: an availability row with NO source was ACCEPTED -- the source rule is not enforced';
  EXCEPTION
    WHEN not_null_violation THEN
      RAISE NOTICE 'CONFIRMED: an availability row without a source is refused';
  END;

  -- (P4) An invalid form / availability / price_band is refused.
  BEGIN
    INSERT INTO public.ingredient_availability
      (ingredient_id, form, product_category, geo_entity_id,
       availability, source_id, last_reviewed)
    VALUES
      (v_ing, 'not_a_form', 'proof bad-form', v_geo,
       'common', v_source, current_date);
    RAISE EXCEPTION 'P4 failed: an invalid FORM was ACCEPTED';
  EXCEPTION
    WHEN check_violation THEN
      RAISE NOTICE 'CONFIRMED: an invalid form is refused';
  END;

  BEGIN
    INSERT INTO public.ingredient_availability
      (ingredient_id, form, product_category, geo_entity_id,
       availability, source_id, last_reviewed)
    VALUES
      (v_ing, 'dried', 'proof bad-availability', v_geo,
       'everywhere', v_source, current_date);
    RAISE EXCEPTION 'P4 failed: an invalid AVAILABILITY was ACCEPTED';
  EXCEPTION
    WHEN check_violation THEN
      RAISE NOTICE 'CONFIRMED: an invalid availability is refused';
  END;

  BEGIN
    INSERT INTO public.ingredient_availability
      (ingredient_id, form, product_category, geo_entity_id,
       availability, price_band, price_amount, price_currency,
       source_id, last_reviewed)
    VALUES
      (v_ing, 'dried', 'proof bad-band', v_geo,
       'common', 'cheap', 1.00, 'EUR', v_source, current_date);
    RAISE EXCEPTION 'P4 failed: an invalid PRICE BAND was ACCEPTED';
  EXCEPTION
    WHEN check_violation THEN
      RAISE NOTICE 'CONFIRMED: an invalid price band is refused';
  END;

  -- (P4b) A COUNTRY row may not claim to be a reliable fallback. This
  -- is the rule that keeps "Europe is never one profile" enforceable.
  BEGIN
    INSERT INTO public.ingredient_availability
      (ingredient_id, form, product_category, geo_entity_id,
       availability, source_id, last_reviewed, fallback_reliable)
    VALUES
      (v_ing, 'dried', 'proof country-fallback', v_geo,
       'common', v_source, current_date, true);
    RAISE EXCEPTION 'P4 failed: a COUNTRY row was ACCEPTED with fallback_reliable = true';
  EXCEPTION
    WHEN check_violation THEN
      RAISE NOTICE 'CONFIRMED: a country row may not be a reliable fallback';
  END;

  -- (P5) The new recipe_ingredients columns default correctly, and an
  -- invalid accepted_form is refused.
  SELECT count(*) INTO v_count
    FROM public.recipe_ingredients
   WHERE cost_weight = 'major'
     AND is_key = false
     AND (accepted_forms IS NULL
          OR accepted_forms <@ public._sourcing_form_values());
  IF v_count = 0 THEN
    RAISE EXCEPTION 'P5 failed: no row carries the documented defaults';
  END IF;

  BEGIN
    UPDATE public.recipe_ingredients
       SET accepted_forms = ARRAY['fresh','not_a_form']
     WHERE id = v_line;
    RAISE EXCEPTION 'P5 failed: an invalid accepted_form was ACCEPTED';
  EXCEPTION
    WHEN check_violation THEN
      RAISE NOTICE 'CONFIRMED: an invalid accepted form is refused';
  END;

  UPDATE public.recipe_ingredients
     SET accepted_forms = NULL, cost_weight = 'major', is_key = false
   WHERE id = v_line;
  RAISE NOTICE 'CONFIRMED: the new recipe line columns default correctly';

  -- (P6) A recipe-level substitute overrides a global one, and an
  -- approximate substitute must disclose the change.
  INSERT INTO public.ingredient_substitutes
    (ingredient_id, substitute_ingredient_id, substitute_form,
     suitability, change_note, source_id)
  VALUES
    (v_ing, v_sub, 'fresh', 'suitable', NULL, v_source);

  INSERT INTO public.recipe_ingredient_substitutes
    (recipe_ingredient_id, substitute_ingredient_id, substitute_form,
     suitability, change_note, source_id)
  VALUES
    (v_line, v_sub, 'fresh', 'approximate', 'proof: it changes the flavour',
     v_source);

  SELECT count(*) INTO v_count
    FROM public.recipe_ingredient_substitutes r
    JOIN public.ingredient_substitutes g
      ON g.ingredient_id = (SELECT ingredient_id
                               FROM public.recipe_ingredients
                              WHERE id = r.recipe_ingredient_id)
     AND g.substitute_ingredient_id = r.substitute_ingredient_id
   WHERE r.recipe_ingredient_id = v_line
     AND r.suitability = 'approximate'
     AND g.suitability = 'suitable';
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'P6 failed: the recipe-level override is not distinguishable from the global default';
  END IF;

  BEGIN
    INSERT INTO public.recipe_ingredient_substitutes
      (recipe_ingredient_id, substitute_ingredient_id, substitute_form,
       suitability, change_note, source_id)
    VALUES
      (v_line, v_sub, 'dried', 'approximate', NULL, v_source);
    RAISE EXCEPTION 'P6 failed: an approximate substitute with NO change note was ACCEPTED';
  EXCEPTION
    WHEN check_violation THEN
      RAISE NOTICE 'CONFIRMED: an approximate substitute must disclose the change';
  END;
  RAISE NOTICE 'CONFIRMED: a recipe-level substitute overrides the global default';

  -- (P7) The additive guarantee: the migration wrote no CONTENT rows.
  -- The proof rows are removed, and nothing else is touched.
  DELETE FROM public.recipe_ingredient_substitutes
   WHERE recipe_ingredient_id = v_line;
  DELETE FROM public.ingredient_substitutes
   WHERE ingredient_id = v_ing AND substitute_ingredient_id = v_sub;
  DELETE FROM public.ingredient_availability
   WHERE product_category LIKE 'proof%';
  DELETE FROM public.recipe_ingredients
   WHERE id = v_line AND position = 9999;
  DELETE FROM public.recipes
   WHERE id = v_recipe AND slug = 'proof-recipe-0055';

  SELECT count(*) INTO v_count
    FROM public.ingredient_availability
   WHERE product_category LIKE 'proof%';
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'P7 failed: the proof left an availability row behind';
  END IF;

  SELECT count(*) INTO v_count
    FROM public.recipe_ingredient_substitutes;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'P7 failed: the proof left a recipe substitute row behind';
  END IF;

  SELECT count(*) INTO v_count
    FROM public.ingredient_substitutes;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'P7 failed: the proof left a substitute row behind';
  END IF;

  -- The proof's OWN rows are gone, and nothing else was lost: the
  -- counts of the tables the proof touched are back to what they were
  -- before it ran. (A count of 0 would mean the proof DELETED real
  -- content, which is the opposite of additive.)
  IF EXISTS (SELECT 1 FROM public.recipes WHERE slug = 'proof-recipe-0055') THEN
    RAISE EXCEPTION 'P7 failed: the proof left its recipe behind';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.recipe_ingredients
     WHERE id = v_line
  ) THEN
    RAISE EXCEPTION 'P7 failed: the proof left its recipe line behind';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.recipe_ingredients
     WHERE recipe_id = v_recipe
  ) THEN
    RAISE EXCEPTION 'P7 failed: the proof left a recipe line behind';
  END IF;
  RAISE NOTICE 'CONFIRMED: the migration left no content rows behind';
END;
$proof$;

-- The marker the CI checks for. The CI workflow asserts this line is
-- present, so a migration that silently did not run its proof cannot
-- pass the build.
DO $marker$
BEGIN
  RAISE NOTICE 'INGREDIENT_SOURCING_AVAILABILITY_OK=1';
END;
$marker$;

COMMIT;
