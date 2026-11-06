#!/usr/bin/env bash
# Prove the 0049 assertions FIRE, not just that they are syntactically valid.
#
# The CI chain passes with the nine absent. This script puts the nine
# on the throwaway database and re-runs 0049, so the exact-count
# assertions are actually exercised -- and then it breaks the data on
# purpose to prove the assertions REFUSE.
#
# THE DEDICATED TEST POSTGRES. NEVER `shared-postgres`.
#
# `DROP DATABASE` and `CREATE DATABASE` are CLUSTER-SCOPED: they act on
# a whole Postgres instance, not on one database. The production
# instance is the `shared-postgres` container, and it is shared with
# OTHER PROJECTS (bali, dewata, n8n, scribe) as well as with the live
# `gustale` database. On 2026-11-06 a `DROP DATABASE` aimed at that
# cluster destroyed the live database.
#
# So every throwaway database this script creates lives on the
# DEDICATED TEST POSTGRES (scripts/lib/test_pg.sh): its own container,
# `gustale-test-postgres`, on its own port, 5434. Production is on
# 5432, so a script that means "the test container" and a script that
# means "production" differ in their PORT as well as their container
# name, and a mistake in one is not a mistake in the other.
#
# `scripts/ci-migration-chain.sh` creates its throwaway database on the
# SAME container (it sources the same library), so the database this
# script seeds is the database the chain built.
#
# Throwaway database only. Never live.
set -euo pipefail
cd "$(dirname "$0")/.."

DB="${1:-gustale_pr3_assert_test}"

# THE LIVE DATABASE IS NOT A TARGET, AND THE NAME IS REFUSED ALWAYS.
#
# This script DROPs and recreates the database it is given, so the
# target must never be the live one. The guard refuses the live NAME
# unconditionally: no environment variable can widen that permission,
# because a flag that can turn a refusal OFF is not a safety control
# (that is exactly how the live database was dropped on 2026-11-06 --
# a stale `GUSTALE_DB_IS_THROWAWAY=1` in a production shell).
#
# The Python that runs the guard. Resolved before the guard is called,
# because the guard decides whether this script may touch the database
# it is about to DROP.
PYTHON_BIN="${PYTHON_BIN:-python3}"
command -v "$PYTHON_BIN" >/dev/null 2>&1 || {
  echo "::error::no python3 on PATH; cannot vet this script's target database."
  exit 1
}

GUSTALE_ASSERT_DB="$("$PYTHON_BIN" scripts/lib/db_guard.py prove-0049-assertions.sh "$DB")" || {
  echo "::error::the 0049 assertion prover refuses to target the live database."
  echo "::error::It DROPs and recreates its target, so live must never be one."
  echo "::error::Use a throwaway database on the test Postgres, or scripts/apply-migration-live.sh."
  exit 1
}
DB="$GUSTALE_ASSERT_DB"

# THE TEST POSTGRES. Sourced, not executed, so it must not set
# `errexit` in this shell: the functions here check their own
# preconditions and return 1, and this script has to be able to REPORT
# a refusal rather than abort on it.
# shellcheck source=scripts/lib/test_pg.sh
source scripts/lib/test_pg.sh

echo "=== the test Postgres ==="
test_pg_up

echo "=== create $DB on $TEST_PG_CONTAINER (127.0.0.1:$TEST_PG_PORT) ==="
# The test container's helper refuses the live NAME as well, so there
# are two independent refusals between this script and the live
# database: the guard above, and this one.
test_pg_create "$DB"

echo "=== run the chain (which builds $DB on the same test container) ==="
# The chain sources the same library, so its throwaway database is on
# the same container this script seeds. It recreates the database
# itself, so the create above is a redundant early check -- kept
# because it is the second refusal of the live name.
bash scripts/ci-migration-chain.sh "$DB" >/tmp/pr3_chain.log 2>&1 || {
  echo "chain failed; tail:"; tail -20 /tmp/pr3_chain.log; exit 1;
}
echo "chain OK"

echo
echo "=== seed the nine verified drinks + the drink family ==="
test_pg_run "$DB" <<'SQL'
-- The nine, published.
INSERT INTO dishes (id, slug, canonical_name, status, created_at, updated_at)
SELECT gen_random_uuid(), s.slug, s.name, 'published', now(), now()
FROM (VALUES
  ('bir-pletok','bir pletok'),
  ('buttermilk-koldskal','Buttermilk koldskål'),
  ('cendol','Cendol'),
  ('champurrado','Champurrado'),
  ('es-doger','es doger'),
  ('es-goyobod','es goyobod'),
  ('lassi','lassi'),
  ('neera','neera'),
  ('pelamushi','Pelamushi')
) AS s(slug, name)
ON CONFLICT (slug) DO NOTHING;

-- The 'drink' family, and its membership for the eight tagged ones
-- (the seven drinks plus Pelamushi, which the migration must untag).
INSERT INTO dish_families (id, slug, name, created_at)
SELECT gen_random_uuid(), 'drink', 'Drink', now()
WHERE NOT EXISTS (SELECT 1 FROM dish_families WHERE slug='drink');

-- The 'dessert' family, which Pelamushi must END UP in.
INSERT INTO dish_families (id, slug, name, created_at)
SELECT gen_random_uuid(), 'dessert', 'Dessert', now()
WHERE NOT EXISTS (SELECT 1 FROM dish_families WHERE slug='dessert');

INSERT INTO dish_dish_families (id, dish_id, value_id, is_primary, created_at, status)
SELECT gen_random_uuid(), d.id, f.id, true, now(), 'active'
FROM dishes d
CROSS JOIN dish_families f
WHERE f.slug='drink'
  AND d.slug IN ('bir-pletok','buttermilk-koldskal','cendol','champurrado',
                 'es-doger','es-goyobod','neera','pelamushi')
ON CONFLICT DO NOTHING;

SELECT slug, status FROM dishes WHERE slug IN ('bir-pletok','buttermilk-koldskal','cendol','champurrado','es-doger','es-goyobod','lassi','neera','pelamushi') ORDER BY slug;
SQL

echo
echo "=== drop content_type and re-run 0049 on the seeded database ==="
test_pg_run "$DB" -c "ALTER TABLE dishes DROP COLUMN IF EXISTS content_type;"
test_pg_run "$DB" -f - < db/migrations/0049_content_type.sql 2>&1 | sed 's/^/  /'

echo
echo "=== the resulting typing ==="
test_pg_run "$DB" -c "SELECT slug, content_type FROM dishes WHERE slug IN ('bir-pletok','buttermilk-koldskal','cendol','champurrado','es-doger','es-goyobod','lassi','neera','pelamushi') ORDER BY content_type, slug;"

echo
echo "=== Pelamushi's FAMILY tag: the drink link must be GONE ==="
test_pg_run "$DB" -c "
SELECT d.slug, f.slug AS family
FROM dishes d
JOIN dish_dish_families x ON x.dish_id = d.id
JOIN dish_families f ON f.id = x.value_id
WHERE d.slug = 'pelamushi' ORDER BY f.slug;
"

echo
echo "=== the drink family now holds exactly the 7 real drinks ==="
test_pg_run "$DB" -c "
SELECT count(*) AS published_in_drink_family
FROM dishes d
JOIN dish_dish_families x ON x.dish_id = d.id
JOIN dish_families f ON f.id = x.value_id
WHERE f.slug = 'drink' AND d.status = 'published';
"

echo
echo "=== NOW BREAK IT: a tenth drink that was never verified ==="
test_pg_run "$DB" <<'SQL'
INSERT INTO dishes (id, slug, canonical_name, status, created_at, updated_at)
VALUES (gen_random_uuid(), 'unverified-thing', 'Unverified Thing', 'published', now(), now());
INSERT INTO dish_dish_families (id, dish_id, value_id, is_primary, created_at, status)
SELECT gen_random_uuid(), d.id, f.id, true, now(), 'active'
FROM dishes d, dish_families f
WHERE d.slug='unverified-thing' AND f.slug='drink';
SQL
# Re-run just the backfill + proof portion by dropping and re-applying.
test_pg_run "$DB" -c "ALTER TABLE dishes DROP COLUMN IF EXISTS content_type;"
echo "--- re-running 0049; it MUST refuse ---"
if test_pg_run "$DB" -f - < db/migrations/0049_content_type.sql >/tmp/pr3_assert.log 2>&1; then
  echo "!!! FAILED: the migration ACCEPTED an unverified tenth drink"
  tail -5 /tmp/pr3_assert.log
  exit 1
else
  echo "GOOD: the migration refused. Its message:"
  grep -E 'ERROR|CONTENT_TYPE' /tmp/pr3_assert.log | sed 's/^/  /'
fi
