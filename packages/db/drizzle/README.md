# `@gustale/db` Migrations

## Current state (as of Phase 2A)

This folder uses **Drizzle ORM** for schema definitions and **hand-written SQL** for migrations.

### Files on disk

```
0000_cloudy_satana.sql
0001_text_user_id_fks.sql
0002_drop_user_fks.sql
0003_add_filter_indexes.sql
0004_dish_relations.sql
0005_food_geography_phase_2a.sql     ← Phase 2A (food geography foundation)
meta/
  0000_snapshot.json                 ← tracked in git
  _journal.json                      ← tracked in git
```

### Known repo-state issue: incomplete Drizzle meta chain

Only `meta/0000_snapshot.json` is checked in. Snapshots for migrations `0001` through `0005` are **not present** in git and are not generated on demand.

**Consequence:** Running `drizzle-kit generate` against the current schema will not produce a single-migration diff for just Phase 2A. Instead it will produce an aggregate diff that tries to re-apply parts of `0001` (e.g. dropping `users_id_fk` constraints, altering `users.id` to text) and re-create `dish_relations`. Applying such a generated file to a database that already has migrations `0001`–`0004` applied would fail or cause data loss.

### Why we still hand-write migrations

- The repo has consistently used hand-written SQL for migrations (`0001` through `0005`).
- The Drizzle migrator (`packages/db/src/migrate.ts`) is wired up but is **not** the authoritative path for this repo right now.
- Production migrations appear to be applied via `psql -f drizzle/000N_*.sql`, not via the Drizzle migrator. The meta folder is informational only.

### Validation policy for new migrations (until meta is repaired)

For every new migration in this folder:

1. **Write the SQL by hand**, matching the style of `0004_dish_relations.sql`:
   - `CREATE TABLE IF NOT EXISTS` for new tables
   - `--> statement-breakpoint` separators between statements
   - Inline `CONSTRAINT` clauses inside `CREATE TABLE` where possible
   - `ALTER TABLE … ADD CONSTRAINT … FOREIGN KEY` for FKs (with explicit `ON DELETE`)
   - `CREATE INDEX IF NOT EXISTS …` for indexes
2. **Mirror the schema in `packages/db/src/schema/index.ts`** using `pgTable` (Drizzle ORM).
3. **Validation commands that are reliable today:**
   - `pnpm --filter @gustale/db typecheck`
   - `pnpm --filter @gustale/db build`
4. **Validation commands that are NOT reliable today:**
   - `pnpm --filter @gustale/db generate` — produces unsafe aggregate diffs because of the missing meta snapshots.
5. **Manual review** of the SQL file against the schema definition before commit.

### Future work (separate task)

A future task should:

- Backfill snapshots `0001_snapshot.json` through `0005_snapshot.json` against the live database (e.g. via `drizzle-kit pull` against the current VPS Postgres).
- Once the meta chain is complete, re-evaluate whether to switch back to `drizzle-kit generate` as the primary migration tool.

Until that work is done, do not run `drizzle-kit generate` as a success gate for new migrations.