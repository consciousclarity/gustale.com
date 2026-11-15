# MIGRATION RECEIPT — `gus-238c-constraint-idempotence-and-ledger.sql`

**Applied to live on 2026-11-15 at 05:27:13 UTC (13:27:13 WITA), by Hermes
Agent, over SSH to `root@62.72.7.218`, by direct `psql`.**

**`RC=0`. Zero ERROR lines. `GUS_238C_OK=1`. `BEGIN` / `CREATE FUNCTION` /
`DO` / `CREATE TABLE` / `COMMENT` / `INSERT 0 5` / `DROP FUNCTION` / `DO` /
`COMMIT` — the transaction committed.**

---

## Rule 11 — this migration is now frozen

`gus-238c` has run on live. It is **immutable**.

- A correction to it requires a **new** migration number.
- The **apply line** is authoritative, not the commit.
- `drizzle.__drizzle_migrations` on live does **not** record it — verified:
  the table still holds **13** rows, unchanged by this apply. It records the
  Drizzle migrator's own chain and no hand-written migration. `0052`, `0053`,
  `0054` and `0055` are absent from it too, for the same reason.
- **`public.gus_migrations_applied` is the GUS chain's own ledger.** It is a
  **record, not a mechanism**: nothing reads it to decide whether to run a
  migration. The authoritative record of each apply is the receipt in
  `docs/MIGRATION-RECEIPT-*.md`.

What is now on live, verified by querying it directly:

| object | kind | state |
|---|---|---|
| `public.gus_migrations_applied` | table | **CREATED** — 7 rows (5 seeded + 2 added, see below) |
| `public._gus238c_check_constraint_ok(...)` | function | **DROPPED** at the end of the migration, as designed — it is a migration-time utility with no caller |
| the 3 GUS-238 CHECK constraints | constraints | **VERIFIED PRESENT AND CORRECT** — nothing to do |

---

## The apply

```bash
docker exec shared-postgres psql -U postgres -d gustale \
  -v ON_ERROR_STOP=1 -f /tmp/gus-238c.sql
```

- The **postgres** role, not `gustale`.
- **`ON_ERROR_STOP=1`** — aborts on the first error.
- **The file was byte-identical to the reviewed one.** SHA-256 of
  `db/migrations/gus-238c-constraint-idempotence-and-ledger.sql` at
  `origin/main` (`2205f67`):

  ```
  6332c4f2b2e0336ba42b960b4a7f4a3eb5af1068ec936bb5c153d39b74a5f7e1
  ```

  The same digest was computed on the **reviewing host** before the apply and
  again on the **VPS** immediately before it.

---

## The backup

Taken immediately before the apply, on the VPS.

| | |
|---|---|
| path | `/home/gustale/backups/pre-238c-20261115T052601Z.dump` |
| bytes | `4,514,597` |
| sha256 | `ee43b76f31e477e5188740f75ad5502260bb3a003cb095b2d699c3a329777623` |
| container copy sha256 | **identical** — `ee43b76f31e4…` |
| format | `pg_dump --format=custom` |

Written **inside** the container and copied out with `docker cp` — plain `cp`
cannot cross the host/container `/tmp` boundary.

### The backup is RESTORABLE, not merely present

- restored into `gus238c_restore_verify` on the **dedicated test Postgres**
  (port 5434), never on the production cluster;
- `pg_restore` exit code captured **without a pipe**: `RC=0`, **0 error
  lines**, 0 log lines;
- compared against live:

| measure | restored copy | live | match |
|---|---|---|---|
| dishes (published / total) | 1474 / 1475 | 1474 / 1475 | yes |
| statements | 1354 | 1354 | yes |
| categories | 152 | 152 | yes |
| dish_families | 306 | 306 | yes |
| dish_place_associations (published / total) | 0 / 2713 | 0 / 2713 | yes |
| dish_journey_beats | 36 | 36 | yes |
| tables | 106 | 106 | yes |
| functions | 904 | 904 | yes |
| constraints | 377 | 377 | yes |
| **238b's new function body** | present | present | yes |

The restored copy therefore also **proves 238b was already applied** before
238c ran — the backup was taken at 05:26:01 UTC, 238b at 04:56:24 UTC.

The verification database was dropped in the same session that created it.
**The production cluster's database list was unchanged** — no copy was ever
created there:

```
bali_business  bali_day  dewata  gustale  n8n  postgres  scribe  template0  template1
```

---

## The dry run

`gus-238c` was applied to the **restored copy** on the test container before
it was applied to live.

- `psql RC=0`, **0 ERROR lines** (the 8 matched lines are `NOTICE:`).
- The migration's own proofs were emitted:

```
NOTICE: GUS-238c: dish_journey_beats_date_precision_check is present and correct -- nothing to do
NOTICE: GUS-238c: dish_journey_beats_evidence_kind_check is present and correct -- nothing to do
NOTICE: GUS-238c: dish_journey_beats_place_role_check is present and correct -- nothing to do
NOTICE: CONFIRMED: the three GUS-238 CHECK constraints are present
NOTICE: CONFIRMED: the migration helper was dropped
NOTICE: CONFIRMED: gus_migrations_applied holds 0052_recipes_schema, 0053_recipes_published_view, 0054_ingredients_category_fk, 0055_sourcing_availability, gus-238-journey-editorial-fields
NOTICE: CONFIRMED: drizzle.__drizzle_migrations was not written to
NOTICE: GUS_238C_OK=1
```

- **Idempotent:** a second run also returned `RC=0` with `GUS_238C_OK=1`.
- The ledger stayed at **5 rows** after the second run (`ON CONFLICT DO
  NOTHING`), the helper stayed dropped, and the content counts stayed
  `1475|1354|152|306|2713|36`.

### The constraint comparison is SEMANTIC, not textual

`gus-238c` does not compare `pg_get_constraintdef()` output against a
hand-written string. PostgreSQL renders every array element with its own
`::text` cast, so a textual comparison reports a false difference on every
correct database. The migration instead asks PostgreSQL whether the
constraint is violated by a row it must **accept** and by one it must
**refuse** — the question that actually matters, answered by the database
itself. That is why all three constraints report *"present and correct --
nothing to do"* rather than a spurious mismatch.

---

## The ledger rows added after the apply

### The problem

`gus-238c` creates the ledger table **and seeds it** with the migrations that
were known to be applied at the time it was written. Its seed list stops at
`gus-238-journey-editorial-fields`:

```sql
INSERT INTO public.gus_migrations_applied (name, applied_at, applied_by, sha256, note)
VALUES
  ('0052_recipes_schema', ...), ('0053_recipes_published_view', ...),
  ('0054_ingredients_category_fk', ...), ('0055_sourcing_availability', ...),
  ('gus-238-journey-editorial-fields', ...)
ON CONFLICT (name) DO NOTHING;
```

**As written, it records NEITHER `gus-238b` NOR `gus-238c`** — the two
migrations applied after it was written. The ledger would have claimed the
GUS chain's state while omitting the function replacement that actually
changed the public surface.

### The fix

Two rows were added in a separate, idempotent transaction. The digests are
of the migration **files**, computed on the reviewing host and re-computed on
the applying host; they match.

| name | applied_at | applied_by | sha256 |
|---|---|---|---|
| `gus-238b-association-review-visibility` | 2026-11-15 | Hermes | `d0eee4a8321706cfcec1187b2e517af83d96811b9bd1d7f70d2bb06fab35591b` |
| `gus-238c-constraint-idempotence-and-ledger` | 2026-11-15 | Hermes | `6332c4f2b2e0336ba42b960b4a7f4a3eb5af1068ec936bb5c153d39b74a5f7e1` |

The insert ran with `ON CONFLICT (name) DO NOTHING`, and the same statement
was re-run afterwards: **`INSERT 0 0`**, still **7 rows**. It is idempotent.

### The ledger, read from a NEW session

| name | applied_at | applied_by | sha256 |
|---|---|---|---|
| `0052_recipes_schema` | 2026-11-08 | owner | *(null)* |
| `0053_recipes_published_view` | 2026-11-09 | owner | *(null)* |
| `0054_ingredients_category_fk` | 2026-11-10 | Hermes | *(null)* |
| `0055_sourcing_availability` | 2026-11-10 | Hermes | `5822536a0ecf8123…` |
| `gus-238-journey-editorial-fields` | 2026-11-14 | Hermes | `453d279897f56fd1…` |
| **`gus-238b-association-review-visibility`** | **2026-11-15** | **Hermes** | **`d0eee4a8321706cf…`** |
| **`gus-238c-constraint-idempotence-and-ledger`** | **2026-11-15** | **Hermes** | **`6332c4f2b2e0336b…`** |

**(7 rows)**

The three rows with a null sha256 are the **pre-existing** seed rows — they
were written before the digest convention was established and were left
untouched, because changing an existing ledger row is a different operation
from adding the two the owner asked for.

### The in-session proof

The insert carried its own proof block, which runs **inside** the
transaction and raises on any failure — so a partial insert rolls back:

```
NOTICE: CONFIRMED: the GUS ledger holds 7 rows
NOTICE: CONFIRMED: 0052_recipes_schema, 0053_recipes_published_view,
         0054_ingredients_category_fk, 0055_sourcing_availability,
         gus-238-journey-editorial-fields, gus-238b-association-review-visibility,
         gus-238c-constraint-idempotence-and-ledger
NOTICE: GUS_LEDGER_238BC_OK=1
```

---

## What the migration changes — and what it does NOT

It is **additive plus a verification**. It:

1. creates `public.gus_migrations_applied` (the GUS chain's own ledger);
2. re-declares the three GUS-238 CHECK constraints under a guard, so the
   migration is **re-runnable** — on a database that already has them it is a
   no-op, and on one that does not it adds them;
3. seeds the ledger with the five migrations known to be applied at the time
   it was written;
4. drops its own helper function, so it does not become a permanent public
   function with no caller.

### The measured effect on live

All three constraints **already existed** (they came from
`gus-238-journey-editorial-fields`, applied on 2026-11-14), so the migration
found nothing to do for them. **The only thing it changed on live was
creating the ledger table.**

It did **not**:

- change any column, row, table or default;
- drop or re-declare any existing constraint — it **verified** them;
- write any editorial content;
- modify `gus-238-journey-editorial-fields.sql` (which is immutable under
  Rule 11 — the fix went into this **new** migration number);
- write to `drizzle.__drizzle_migrations` (still 13 rows, unchanged);
- leave its helper function behind (verified `ABSENT`).

The content counts are **identical** before and after:

```
dishes|statements|categories|families|assoc|beats
1475|1354|152|306|2713|36
```

---

## The end state, read from a NEW session

```
the ledger table exists, 7 rows                                    OK
the helper function is ABSENT (dropped, as designed)                OK
the 3 GUS-238 CHECK constraints are present                         OK
drizzle.__drizzle_migrations still 13 rows (not written to)         OK
238b's function STILL carries the evidence filter (1)               OK
dishes|statements|categories|families|assoc|beats = 1475|1354|152|306|2713|36  OK
```

---

## The API log, window pinned to the apply

```bash
docker logs --since 2026-11-15T05:27:13Z gustale-api
```

- **No errors.** No "does not exist", no exception.
- Status distribution since the apply: **7 × 200**, and nothing else.

---

## The five live URLs, after the apply

```
200  https://gustale.com/
200  https://gustale.recipes/
200  https://api.gustale.com/health
200  https://api.gustale.com/api/dishes/bibimbap/journey
200  https://api.gustale.com/api/dishes/bibimbap/atlas
```

Containers, all healthy: `gustale-api`, `gustale-web-recipes`, `gustale-web-geo`.

---

## The rollback

`gus-238c` is **additive**, so its rollback is a `DROP`:

```sql
BEGIN;
DROP TABLE IF EXISTS public.gus_migrations_applied;
COMMIT;
```

The three CHECK constraints are **not** rolled back — they predate this
migration and were only verified, never re-declared, so dropping them would
destroy state this migration did not create. The helper function is already
dropped by the migration itself.

The two ledger rows added afterwards are removed with:

```sql
DELETE FROM public.gus_migrations_applied
 WHERE name IN ('gus-238b-association-review-visibility',
                'gus-238c-constraint-idempotence-and-ledger');
```

Verify a rollback landed by asserting on the **catalogue**, not on a string:

```sql
SELECT to_regclass('public.gus_migrations_applied');
-- NULL = the table is gone
```
