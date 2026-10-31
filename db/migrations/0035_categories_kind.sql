-- 0035 — `categories.kind`: the column that was live before it was in git.
--
-- WHAT THIS FIXES
--
-- `categories.kind` is a `text NOT NULL DEFAULT 'dish-type'` discriminator
-- that separates the four kinds of category row:
--
--     dish-type     the legacy flat set (Noodle soup, Stew, Curry…)
--     cuisine       a national cuisine (Indonesian cuisine, Italian cuisine…)
--     family        a food family (Noodle soups, Dumplings…)
--     course-group  a top-level course group (Appetizer, Main course…)
--
-- The API reads it in three places in `apps/api/src/routes/dishes.ts`:
--
--     :188  GET /api/dishes?family=…   → c4.kind = 'family'
--     :236  the search/list variant      → c4.kind = 'family'
--     :275  the dish-list query          → c.kind  = 'dish-type'
--
-- The column is in the LIVE `gustale` database. It is in NO committed
-- migration and NOT in the Drizzle schema. The complete account of how it
-- got there is in the PR description; the short version is that it was
-- added by the archived branch `feat-taxonomy-foundation`
-- (commit b977b85, 2026-06-25), whose migration
-- `packages/db/drizzle/0004_dark_rockslide.sql` was never merged to
-- `main` — but the migration WAS applied to live, together with the
-- taxonomy seed that backfilled the `kind` values.
--
-- THE CONSEQUENCE
--
-- A database built from the committed chain has no such column, so
-- `GET /api/dishes` returns HTTP 500:
--
--     ERROR: column c.kind does not exist
--
-- That is every environment built from scratch: the CI's ephemeral
-- database, the Nightly's ephemeral database, and any new developer
-- checkout. The LIVE database is the only one where the route works.
--
-- CI stayed green because NO TEST EVER GETS `/api/dishes`. Every
-- `/api/dishes` reference in `apps/api/test/` is a `POST` or a
-- `/api/dishes/:slug` call. The one route that breaks was the one route
-- that was never exercised. `apps/api/test/dishes-list.test.ts` closes
-- that hole; this migration is what makes it pass.
--
-- THE LIVE DEFINITION, COPIED EXACTLY
--
-- From `\d categories` on the live `gustale` database, 2026-10-31:
--
--     Column     |           Type           | Nullable |      Default
--     ------------+-------------------------+----------+--------------------
--     id          | uuid                    | not null | uuid_generate_v4()
--     parent_id   | uuid                    |          |
--     name        | text                    | not null |
--     slug        | text                    | not null |
--     description | text                    |          |
--     source      | text                    | not null | 'custom'::text
--     source_id   | text                    |          |
--     icon        | text                    |          |
--     display_order | integer                | not null | 0
--     created_at  | timestamp with time zone| not null | now()
--     kind        | text                    | not null | 'dish-type'::text
--
--     Indexes:
--         "categories_pkey" PRIMARY KEY, btree (id)
--         "categories_slug_unique" UNIQUE CONSTRAINT, btree (slug)
--
--     Foreign-key constraints:
--         "categories_parent_id_categories_id_fk"
--             FOREIGN KEY (parent_id) REFERENCES categories(id)
--         "category_translations_category_id_categories_id_fk"
--             FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE
--         "dish_categories_category_id_categories_id_fk"
--             FOREIGN KEY (category_id) REFERENCES categories(id)
--
-- The `kind` column itself:
--
--     column_name | data_type | is_nullable | column_default
--     ------------+-----------+-------------+----------------
--     kind        | text      | NO          | 'dish-type'::text
--
-- So: `text`, NOT NULL, DEFAULT 'dish-type'::text. There is NO CHECK
-- constraint on it (the four values are convention, not enforced), and
-- NO index on it. The two indexes and the three foreign keys above
-- predate this column and are untouched by it.
--
-- IDEMPOTENCE
--
-- `ADD COLUMN IF NOT EXISTS` — so this migration is safe on the live
-- database (where the column already exists, and where it is a no-op),
-- and safe to re-run on a fresh database.
--
-- The BACKFILL is deliberately NOT repeated here. The live values are
-- the seeded taxonomy from the archived branch, and they are correct:
--
--     family        77
--     cuisine       36
--     dish-type     28
--     course-group  11
--
-- 11 course groups and 77 families are exactly what that branch's
-- `seedTaxonomy()` created, and the 36 cuisines are the rows that
-- branch's backfill reclassified from the default 'dish-type'. The
-- values are DATA, and the data is already in live and correct. This
-- migration restores the SCHEMA so that a fresh build matches live; it
-- does not re-derive the data.
--
-- A fresh database built from the committed chain has no taxonomy rows
-- at all (the seed inserts them), so there is nothing to backfill
-- there either — the seed's own INSERTs are what create the rows, and
-- they will carry whatever `kind` the seed sets.
--
-- NOTE FOR THE SEED
--
-- `packages/db/src/seed.ts` on `main` does NOT set `kind` when it
-- inserts categories — that logic lived on the archived branch. On a
-- fresh database every seeded category therefore lands with the column
-- default 'dish-type', which is correct for the legacy dish-type set
-- but wrong for a cuisine row. That is a separate, pre-existing
-- content gap (the live cuisine rows were reclassified by the archived
-- branch's backfill), and it is tracked separately rather than fixed
-- here — this migration is about the schema, and mixing in a seed
-- rewrite would widen the blast radius of a change that is already
-- touching the live schema.
--
-- GUARD
--
-- This migration asserts nothing and writes nothing but the column. It
-- is safe to apply to live.

ALTER TABLE "categories"
  ADD COLUMN IF NOT EXISTS "kind" text DEFAULT 'dish-type'::text NOT NULL;

-- Report what the column now looks like, so the migration's own output
-- is the evidence that it landed as intended.
DO $$
DECLARE
  v_kind text;
  v_nullable text;
  v_default text;
BEGIN
  SELECT data_type, is_nullable, column_default
    INTO v_kind, v_nullable, v_default
    FROM information_schema.columns
   WHERE table_schema = 'public'
     AND table_name = 'categories'
     AND column_name = 'kind';

  IF v_kind IS NULL THEN
    RAISE EXCEPTION 'categories.kind is missing after the migration';
  END IF;

  RAISE NOTICE 'categories.kind: type=% nullable=% default=%', v_kind, v_nullable, v_default;

  IF v_kind <> 'text' OR v_nullable <> 'NO' OR v_default <> '''dish-type''::text' THEN
    RAISE EXCEPTION
      'categories.kind does not match the live definition (expected text/NOT NULL/''dish-type''::text, got %/%/%)',
      v_kind, v_nullable, v_default;
  END IF;
END $$;
