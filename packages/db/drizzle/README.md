# `@gustale/db` — the base schema, and how it is applied

## What is in this folder

```
0000_cloudy_satana.sql        ← the base schema: 33 tables
0001_text_user_id_fks.sql
0002_drop_user_fks.sql
0003_add_filter_indexes.sql
0004_dish_relations.sql
0005_food_geography_phase_2a.sql
0005_user_role_index.sql
0006_lineages.sql
0007_pg_trgm.sql
0008_dish_journey_beats.sql
0009_db_invariants.sql
0010_surrogate_pks.sql
0011_dish_ingredients_pk.sql
0012_media_variants.sql
0013_passkey_aaguid.sql
0014_geo_entity_provenance.sql
0015_pool_a_batch.sql
meta/
  0000_snapshot.json
  _journal.json
```

**These files are the BASE SCHEMA.** `0000_cloudy_satana.sql` creates the 33
core tables — `dishes`, `users`, `media`, `edit_history`, the auth tables.
The `db/migrations/*.sql` chain builds ON TOP of this and does not create
it.

That is not an accident of history; it is a hard dependency. `dishes` alone
is referenced by 26 of the GUS migration files, and the FIRST GUS migration
(`db/migrations/gus-014-pilot-dimensions.sql:103`) is literally:

```sql
dish_id uuid NOT NULL REFERENCES dishes(id) ON DELETE CASCADE,
```

Apply the GUS chain to a database with no base schema and it fails at once:

```
ERROR:  relation "dishes" does not exist
```

## HOW THEY ARE APPLIED

By `psql -f`, by name, in a fixed order — **not** by the drizzle-kit
migrator.

The single source of truth for the order is
`scripts/ci-migration-chain.sh`, which both `.github/workflows/ci.yml` and
`.github/workflows/nightly.yml` run:

```bash
DRIZZLE_FILES=(
  git ls-files 'packages/db/drizzle/*.sql' | sort
)
```

Then the GUS chain follows, in its own list.

## WHY THERE IS NO MIGRATOR

There used to be one: `packages/db/src/migrate.ts`, calling
`drizzle-orm/postgres-js/migrator` with `migrationsFolder: "./drizzle"`.
`packages/db/src/seed.ts` called it before seeding.

**It was removed** because it was not merely redundant — it was wrong.

The migrator applies what `meta/_journal.json` records. The journal
recorded only **10 of the 17** committed files:

```
IN    0000_cloudy_satana        MISS  0003_add_filter_indexes
IN    0001_text_user_id_fks     MISS  0005_food_geography_phase_2a
IN    0002_drop_user_fks        MISS  0007_pg_trgm
IN    0004_dish_relations       MISS  0012_media_variants
IN    0005_user_role_index      MISS  0013_passkey_aaguid
IN    0006_lineages             MISS  0014_geo_entity_provenance
IN    0008_dish_journey_beats   MISS  0015_pool_a_batch
IN    0009_db_invariants
IN    0010_surrogate_pks
IN    0011_dish_ingredients_pk
```

So the migrator built a schema **missing** the geography tables, the media
variants, the passkey column and the geo provenance. It was a second,
worse runner for the same files.

Two runners for one set of files is the duplication. The `psql`-by-name
runner applies every committed file, in order, every time. It is the only
one.

## THE `meta/` DIRECTORY

`meta/_journal.json` and `meta/0000_snapshot.json` are drizzle-kit's
bookkeeping. They are kept because the nightly runs
`pnpm --filter @gustale/db run generate` as a **drift check** — it diffs
the Drizzle schema (`src/schema/index.ts`) against the snapshot to catch
drift. That step is `continue-on-error: true`: the generation is
informational, and its output is never applied.

**Do not apply anything `drizzle-kit generate` produces.** The meta chain
is incomplete — snapshots for `0001`–`0005` are absent — so `generate`
produces an aggregate diff that tries to re-apply parts of `0001` (dropping
`users_id_fk`, altering `users.id` to text) and re-create `dish_relations`.
Applying that to a database that already has `0001`–`0004` would fail or
cause data loss.

Write new migrations as hand-written SQL in `db/migrations/`, and mirror the
schema in `src/schema/index.ts`.

## THE NUMBER COLLISION

`db/migrations/0015_gus242_resync.sql` and this folder's
`0015_pool_a_batch.sql` share the number `0015`. There is also a duplicate
`0005` here (`0005_food_geography_phase_2a.sql` and
`0005_user_role_index.sql`).

**These are documentation hazards, not execution ones.** Both chains are
applied by explicit path, in a fixed order, by name. The number in a
filename does not decide the order — the order is the hardcoded list in
`scripts/ci-migration-chain.sh`. `0015` in one directory does not mean
`0015` in the other.

The journal's drift is the same kind of hazard, and it is why the CI
applies the committed files rather than the journal.

## THE ONE CHAIN

There is one chain, applied in one order, by one script:

1. the base schema — this folder, by name
2. the GUS chain — `db/migrations/`, by name
3. the seed

`scripts/validate-ci-migration-chain.py` proves that `ci.yml`,
`ci-migration-chain.sh` and `scripts/repro-migration-chain.sh` name the
same `db/migrations/*.sql` files. Run it after changing any of them.
