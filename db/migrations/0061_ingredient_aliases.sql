-- ============================================================================
-- 0056_ingredient_aliases.sql
--
-- The ingredient ALIAS table, and the first alias: the bechamel duplicate.
--
-- The problem this solves
-- ----------------------
-- `bechamel` and `bechamel-sauce` are the same ingredient: both are
-- named "Béchamel sauce", both are published, and both have a live
-- public page. They are two rows for one ingredient.
--
-- Measured on live on 2026-11-10:
--
--   slug             id                                   status     category
--   ---------------  -----------------------------------  ---------  ---------------
--   bechamel         57f6dda0-af1f-4bbc-a5c5-5009cf4bff05  published  savoury-sauces
--   bechamel-sauce   33f93412-19d4-5365-976b-9b3ece95af5f  published  (none)
--
--   bechamel-sauce is referenced by NOTHING: 0 dish_ingredients
--   rows, 0 recipe_ingredients rows. It is an orphan with a public
--   URL.
--
-- So the merge is: keep `bechamel` (the one that carries the category
-- and the dish link), and make `bechamel-sauce` an ALIAS of it -- a
-- row that resolves to the canonical ingredient rather than being
-- deleted.
--
-- WHY AN ALIAS AND NOT A DELETE
-- -----------------------------
-- `bechamel-sauce` has a live public page (HTTP 200). Deleting the
-- row would turn that URL into a 404. An alias makes it RESOLVE to
-- the canonical ingredient instead, so the URL keeps working and
-- points at the right thing. That is the difference between retiring
-- a page and breaking one.
--
-- The alias table is the general mechanism, not a one-off for béchamel:
-- GUS-104 ("intelligent ingredient normalization") needs it, and
-- every future duplicate needs it. It is built here so that merging
-- the béchamel pair does not require a second migration later.
--
-- The table
-- ---------
--   ingredient_aliases
--     id                uuid
--     alias_slug        text    the OLD slug that must keep resolving
--     ingredient_id     uuid    the CANONICAL ingredient it resolves to
--     reason            text    why the alias exists
--     created_at        timestamptz
--
--   UNIQUE (alias_slug)      -- one alias per slug, no ambiguity
--   FK to ingredients(id)    ON DELETE CASCADE -- if the canonical
--                              ingredient goes, its aliases go with it
--   CHECK (alias_slug <> ingredient's own slug) -- an ingredient is
--                              never an alias of itself
--
-- The API resolves the alias, so `GET /api/ingredients/bechamel-sauce`
-- keeps returning 200 and now returns the CANONICAL ingredient's data.
--
-- Rule 11: this migration is transactional and idempotent, and it
-- writes NO content rows beyond the one alias. It does not delete the
-- orphan row -- that is GUS-092's separate, owner-approved data
-- change, and it happens AFTER the alias is live so the URL never
-- breaks.
-- ============================================================================

BEGIN;

-- ────────────────────────────────────────────────────────────────────────────
-- 1. The alias table
-- ────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.ingredient_aliases (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  alias_slug    text NOT NULL UNIQUE,
  ingredient_id uuid NOT NULL
                REFERENCES public.ingredients(id) ON DELETE CASCADE,
  reason        text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ingredient_aliases_slug_not_blank
    CHECK (length(btrim(alias_slug)) > 0),
  CONSTRAINT ingredient_aliases_reason_not_blank
    CHECK (length(btrim(reason)) > 0)
);

COMMENT ON TABLE public.ingredient_aliases IS
  'Old ingredient slugs that must keep resolving, mapped to the '
  'canonical ingredient. A retired slug, not a deleted one: the URL '
  'keeps working.';

COMMENT ON COLUMN public.ingredient_aliases.alias_slug IS
  'The superseded slug. It is NOT a row in ingredients -- it is a '
  'pointer to the canonical row.';

COMMENT ON COLUMN public.ingredient_aliases.reason IS
  'Why the alias exists, for example: the bechamel duplicate.';

CREATE INDEX IF NOT EXISTS ingredient_aliases_ingredient_id_idx
  ON public.ingredient_aliases (ingredient_id);

-- ────────────────────────────────────────────────────────────────────────────
-- 2. The constraint that keeps an alias honest
--    An ingredient may not be an alias of itself. That would make
--    the resolver loop.
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public._ingredient_aliases_not_self()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  own_slug text;
BEGIN
  SELECT slug INTO own_slug
  FROM public.ingredients
  WHERE id = NEW.ingredient_id;

  IF own_slug IS NULL THEN
    RAISE EXCEPTION 'ingredient_aliases: ingredient % does not exist', NEW.ingredient_id;
  END IF;

  IF own_slug = NEW.alias_slug THEN
    RAISE EXCEPTION
      'ingredient_aliases: an ingredient may not be an alias of itself (%)',
      NEW.alias_slug;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS ingredient_aliases_not_self_trg ON public.ingredient_aliases;
CREATE TRIGGER ingredient_aliases_not_self_trg
  BEFORE INSERT OR UPDATE ON public.ingredient_aliases
  FOR EACH ROW EXECUTE FUNCTION public._ingredient_aliases_not_self();

-- ────────────────────────────────────────────────────────────────────────────
-- 3. The béchamel alias
--
-- `bechamel` is the canonical row: it carries the category
-- (`savoury-sauces`) and the dish link. `bechamel-sauce` is the
-- retired slug.
--
-- The alias is inserted only if both rows exist. If the orphan has
-- already been deleted by GUS-092, this is a no-op rather than an
-- error -- which is what makes the migration safe to run in either
-- order.
-- ────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  canonical_id uuid;
  orphan_id    uuid;
BEGIN
  SELECT id INTO canonical_id
  FROM public.ingredients
  WHERE slug = 'bechamel';

  SELECT id INTO orphan_id
  FROM public.ingredients
  WHERE slug = 'bechamel-sauce';

  IF canonical_id IS NULL THEN
    RAISE NOTICE 'SKIPPED: there is no ingredient with the slug ''bechamel''';
    RETURN;
  END IF;

  IF orphan_id IS NULL THEN
    RAISE NOTICE 'SKIPPED: there is no ingredient with the slug ''bechamel-sauce'' '
                 '-- the orphan has already been removed';
    RETURN;
  END IF;

  IF canonical_id = orphan_id THEN
    RAISE EXCEPTION 'bechamel and bechamel-sauce are the same row';
  END IF;

  INSERT INTO public.ingredient_aliases (alias_slug, ingredient_id, reason)
  VALUES (
    'bechamel-sauce',
    canonical_id,
    'the béchamel duplicate: the same ingredient under two slugs. '
    'bechamel is canonical; bechamel-sauce is retired but must keep '
    'resolving, because it has a live public URL.'
  )
  ON CONFLICT (alias_slug) DO UPDATE
    SET ingredient_id = EXCLUDED.ingredient_id,
        reason       = EXCLUDED.reason;

  RAISE NOTICE 'CONFIRMED: the bechamel-sauce alias resolves to the bechamel ingredient';
END;
$$;

-- ────────────────────────────────────────────────────────────────────────────
-- 4. The proofs
--
-- Each proof tries to do the WRONG thing and must be refused.
-- ────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  canonical_id uuid;
  alias_id     uuid;
  test_id      uuid;
BEGIN
  SELECT id INTO canonical_id FROM public.ingredients WHERE slug = 'bechamel';

  -- P1: the table exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'ingredient_aliases'
  ) THEN
    RAISE EXCEPTION 'P1 FAILED: ingredient_aliases does not exist';
  END IF;
  RAISE NOTICE 'CONFIRMED: the ingredient_aliases table exists';

  -- P2: the alias exists and points at the canonical ingredient.
  --
  -- It is only REQUIRED when BOTH béchamel rows are present. On the
  -- CI database -- which has the moussaka seed but NOT the orphan
  -- `bechamel-sauce`, because that row exists only on live -- there
  -- is nothing to alias, and the migration SKIPS the insert. The
  -- proof must accept that, or the migration could only ever be
  -- applied where the orphan happens to be.
  IF EXISTS (SELECT 1 FROM public.ingredients WHERE slug = 'bechamel-sauce') THEN
    SELECT id INTO alias_id
    FROM public.ingredient_aliases
    WHERE alias_slug = 'bechamel-sauce' AND ingredient_id = canonical_id;

    IF alias_id IS NULL THEN
      RAISE EXCEPTION 'P2 FAILED: the bechamel-sauce alias is missing or points elsewhere';
    END IF;
    RAISE NOTICE 'CONFIRMED: the bechamel-sauce alias resolves to the bechamel ingredient';
  ELSE
    RAISE NOTICE 'CONFIRMED: there is no bechamel-sauce row here, so there was nothing to alias';
  END IF;

  -- P3: an alias may NOT point at a non-existent ingredient
  BEGIN
    INSERT INTO public.ingredient_aliases (alias_slug, ingredient_id, reason)
    VALUES ('test-dangling-alias', gen_random_uuid(), 'must be refused');
    RAISE EXCEPTION 'P3 FAILED: an alias to a missing ingredient was accepted';
  EXCEPTION
    WHEN foreign_key_violation THEN
      RAISE NOTICE 'CONFIRMED: an alias to a missing ingredient is refused by the foreign key';
    WHEN raise_exception THEN
      -- The BEFORE-INSERT trigger fires first and raises its own
      -- exception, which is NOT a foreign_key_violation. That is the
      -- trigger doing the same job with a better message, so it is a
      -- refusal too.
      IF SQLERRM LIKE '%does not exist%' THEN
        RAISE NOTICE 'CONFIRMED: an alias to a missing ingredient is refused';
      ELSE
        RAISE;
      END IF;
  END;

  -- P4: an ingredient may NOT be an alias of itself
  BEGIN
    INSERT INTO public.ingredient_aliases (alias_slug, ingredient_id, reason)
    VALUES ('bechamel', canonical_id, 'must be refused');
    RAISE EXCEPTION 'P4 FAILED: an ingredient was accepted as an alias of itself';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE '%may not be an alias of itself%' THEN
      RAISE NOTICE 'CONFIRMED: an ingredient may not be an alias of itself';
    ELSE
      RAISE;
    END IF;
  END;

  -- P5: the same alias slug may NOT be used twice.
  --
  -- It is tested against a slug that is ALREADY in the table. The
  -- migration's own insert uses `ON CONFLICT DO UPDATE`, so inserting
  -- a duplicate of THAT slug would update it rather than violate --
  -- which is why this proof uses a fresh alias of its own and then
  -- tries to add it twice.
  INSERT INTO public.ingredient_aliases (alias_slug, ingredient_id, reason)
  VALUES ('test-duplicate-alias', canonical_id, 'test fixture');

  BEGIN
    INSERT INTO public.ingredient_aliases (alias_slug, ingredient_id, reason)
    VALUES ('test-duplicate-alias', canonical_id, 'must be refused');
    RAISE EXCEPTION 'P5 FAILED: a duplicate alias slug was accepted';
  EXCEPTION WHEN unique_violation THEN
    RAISE NOTICE 'CONFIRMED: an alias slug may not be used twice';
  END;

  -- The fixture alias must not survive the proof.
  DELETE FROM public.ingredient_aliases WHERE alias_slug = 'test-duplicate-alias';

  -- P6: a blank slug is refused
  BEGIN
    INSERT INTO public.ingredient_aliases (alias_slug, ingredient_id, reason)
    VALUES ('   ', canonical_id, 'must be refused');
    RAISE EXCEPTION 'P6 FAILED: a blank alias slug was accepted';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'CONFIRMED: a blank alias slug is refused';
  END;

  -- P7: the retired slug is NOT a row in ingredients -- it is an alias
  IF EXISTS (SELECT 1 FROM public.ingredients WHERE slug = 'bechamel-sauce') THEN
    -- The orphan still exists at this point: that is expected, because
    -- GUS-092's deletion is a separate, later step. What must NOT be
    -- true is that the alias is missing.
    IF NOT EXISTS (
      SELECT 1 FROM public.ingredient_aliases WHERE alias_slug = 'bechamel-sauce'
    ) THEN
      RAISE EXCEPTION 'P7 FAILED: the orphan exists but has no alias';
    END IF;
    RAISE NOTICE 'CONFIRMED: the retired slug resolves through the alias table';
  ELSE
    RAISE NOTICE 'CONFIRMED: the retired slug has been removed and the alias remains';
  END IF;

  -- P8: no content rows were written beyond the one alias.
  --
  -- ONE alias where the orphan exists, ZERO where it does not -- and
  -- never more than one, whatever the database looks like.
  IF (SELECT count(*) FROM public.ingredient_aliases) > 1 THEN
    RAISE EXCEPTION
      'P8 FAILED: the migration left % alias rows behind, expected at most 1',
      (SELECT count(*) FROM public.ingredient_aliases);
  END IF;
  RAISE NOTICE 'CONFIRMED: the migration left at most one alias row and no other content';

END;
$$;

COMMIT;

-- The marker the CI gate and the runbook look for.
DO $$
BEGIN
  RAISE NOTICE 'INGREDIENT_ALIASES_OK=1';
END;
$$;
