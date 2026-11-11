# The CI database has no family relations — and why

**Date:** 2026-11-11. Found while WP-02b's test failed in CI and passed locally.

## The symptom

A new API test asserted:

```ts
expect(expected.some((row) => row.slug !== null)).toBe(true);
```

— "at least one published dish has an active family relation". It
passed against live (1,445 of 1,474 dishes have one) and failed in CI,
every time.

## The cause

CI's `dish_dish_families` table is **EMPTY**.

`db/migrations/gus-014-118-dimensions.sql` assigns the families with
one `INSERT ... SELECT` per family:

```sql
INSERT INTO dish_dish_families (dish_id, value_id)
SELECT d.id, v.id FROM dishes d, dish_families v
 WHERE d.slug = 'acaraje' AND v.slug = 'fritter' ON CONFLICT DO NOTHING;
```

— 93 such rows, keyed by **dish slug**.

In `.github/workflows/ci.yml` that migration is in the `gus_files`
array at **line 547**. The step that creates the 93 dishes,
`packages/db/seed-atlas-references.sql`, is at **line 742**.

**The migration runs before the dishes exist.** The `INSERT ... SELECT`
matches no dish, and inserts nothing. The migration still exits 0 —
a `SELECT` that matches zero rows is not an error.

CI's database therefore holds **7 dishes** — `rendang`,
`tacos-al-pastor`, `chicken-tikka-masala`, `gazpacho`, `falafel`,
`vindaloo`, `moussaka-greek` — and **no family relations at all**.

## Why it is a trap

* The migration *succeeds*. There is no warning. The failure surfaces
  hundreds of lines later, in an unrelated test.
* The failure message is `expected false to be true` — it says nothing
  about the database being empty.
* The same data is present on live, so the test passes locally against
  live and fails in CI, which reads as "the CI database is broken" or
  "the test is flaky". It is neither.

## The rule

**A test that asserts on DATA must not assume data that CI's fixture
does not contain.** The property under test must hold in CI's state.

The fix that was applied to WP-02b: drop the "at least one" assertion —
it is a fixture precondition, not the property — and keep the property
that actually matters, which holds in both states:

> for every published dish, the API's `familySlug`/`familyName` equals
> the canonical active relation's slug/name, **including the null case**.

The null case is the strong half. It proves the API does not fall back
to the legacy vocabulary for a dish with no canonical relation. If it
did, every such dish would come back with a non-null `familySlug` and
the comparison would fail.

A separate test asserts that the *vocabulary* is populated, so the null
case is not vacuous.

## How to check what CI's database actually contains

Do not guess. Build it:

```bash
# The SANCTIONED test postgres. Rule 3: docker is allowed ONLY for
# gustale-test-postgres.
source scripts/lib/test_pg.sh
test_pg_up
test_pg_match_ci_roles
```

CI's exact migration order is in `.github/workflows/ci.yml` — it is
**not** alphabetical and **not** the same in the two chains:

1. `packages/db/drizzle/*.sql`, sorted.
2. The `gus_files` array (line ~539) — the vocabulary tables.
3. The seeds: `packages/db/seed-moussaka.sql`, `seed-journey.sql`.
4. `scripts/mark_disposable_db.sql`.
5. The `data_migrations` array (line ~635).
6. `scripts/populate_description_sentences.py --apply --db <db>`.
7. `0032`, `0033`, then `packages/db/seed-atlas-references.sql`.

**The order matters and the migrations assert it.** `0032` fails with
*"the archive is empty"* if it runs twice, and fails with *"4 published
dishes have no dish_names row"* if the atlas seed ran before it. Those
assertions are the reason the order is written down.

## The live numbers, for reference

Measured read-only on 2026-11-11:

| | |
|---|---:|
| published dishes | 1,474 |
| with an active canonical family | 1,445 |
| with none | 29 |
| distinct canonical families in use | 123 |
| legacy dish-type categories in use | 25 |
| the union of both | 130 |
