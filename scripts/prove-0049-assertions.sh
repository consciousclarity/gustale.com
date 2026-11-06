#!/usr/bin/env bash
# Prove the 0049 assertions FIRE, not just that they are syntactically valid.
#
# The CI chain passes with the nine absent. This script puts the nine
# on the throwaway database and re-runs 0049, so the exact-count
# assertions are actually exercised -- and then it breaks the data on
# purpose to prove the assertions REFUSE.
#
# Throwaway database only. Never live.
set -euo pipefail
cd "$(dirname "$0")/.."

DB="${1:-gustale_pr3_assert_test}"

# THE LIVE DATABASE IS NOT A TARGET.
#
# This script DROPs the database it is given and recreates it:
#
#     DROP DATABASE IF EXISTS $DB; CREATE DATABASE $DB;
#
# So `bash scripts/prove-0049-assertions.sh gustale` would DROP THE LIVE
# DATABASE AND RECREATE IT EMPTY. The default is a disposable database,
# but the default is not the guard -- the guard is the guard.
#
# This is the SAME guard, in the SAME shape, as scripts/ci-migration-chain.sh
# uses. The shared guard decides: it refuses the live database by name on
# the live host, and it knows that the CI's service container is
# deliberately named `gustale` too (the workflow sets
# GUSTALE_DB_IS_THROWAWAY=1 to say that one is disposable).
#
# Live is only reachable with the explicit per-invocation opt-in, and
# even then this script's DROP makes it a terrible idea -- use
# scripts/apply-migration-live.sh, which goes through the live-approval
# gate.
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
  echo "::error::Use a throwaway database, or scripts/apply-migration-live.sh."
  exit 1
}
DB="$GUSTALE_ASSERT_DB"

run_psql() {
  docker exec -u postgres -i shared-postgres psql -U postgres -d "$DB" \
    -v ON_ERROR_STOP=1 "$@"
}

echo "=== recreate $DB ==="
docker exec -u postgres shared-postgres psql -U postgres -d postgres \
  -c "DROP DATABASE IF EXISTS $DB;" -c "CREATE DATABASE $DB;" >/dev/null

echo "=== run the chain up to (but not including) 0049 ==="
# Run the chain's own setup, then 0049 on top.
bash scripts/ci-migration-chain.sh "$DB" >/tmp/pr3_chain.log 2>&1 || {
  echo "chain failed; tail:"; tail -20 /tmp/pr3_chain.log; exit 1;
}
echo "chain OK"

echo
echo "=== seed the nine verified drinks + the drink family ==="
run_psql <<'SQL'
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
run_psql -c "ALTER TABLE dishes DROP COLUMN IF EXISTS content_type;"
docker exec -u postgres -i shared-postgres psql -U postgres -d "$DB" -v ON_ERROR_STOP=1 \
  < db/migrations/0049_content_type.sql 2>&1 | sed 's/^/  /'

echo
echo "=== the resulting typing ==="
run_psql -c "SELECT slug, content_type FROM dishes WHERE slug IN ('bir-pletok','buttermilk-koldskal','cendol','champurrado','es-doger','es-goyobod','lassi','neera','pelamushi') ORDER BY content_type, slug;"

echo
echo "=== Pelamushi's FAMILY tag: the drink link must be GONE ==="
run_psql -c "
SELECT d.slug, f.slug AS family
FROM dishes d
JOIN dish_dish_families x ON x.dish_id = d.id
JOIN dish_families f ON f.id = x.value_id
WHERE d.slug = 'pelamushi' ORDER BY f.slug;
"

echo
echo "=== the drink family now holds exactly the 7 real drinks ==="
run_psql -c "
SELECT count(*) AS published_in_drink_family
FROM dishes d
JOIN dish_dish_families x ON x.dish_id = d.id
JOIN dish_families f ON f.id = x.value_id
WHERE f.slug = 'drink' AND d.status = 'published';
"

echo
echo "=== NOW BREAK IT: a tenth drink that was never verified ==="
run_psql <<'SQL'
INSERT INTO dishes (id, slug, canonical_name, status, created_at, updated_at)
VALUES (gen_random_uuid(), 'unverified-thing', 'Unverified Thing', 'published', now(), now());
INSERT INTO dish_dish_families (id, dish_id, value_id, is_primary, created_at, status)
SELECT gen_random_uuid(), d.id, f.id, true, now(), 'active'
FROM dishes d, dish_families f
WHERE d.slug='unverified-thing' AND f.slug='drink';
SQL
# Re-run just the backfill + proof portion by dropping and re-applying.
run_psql -c "ALTER TABLE dishes DROP COLUMN IF EXISTS content_type;"
echo "--- re-running 0049; it MUST refuse ---"
if docker exec -u postgres -i shared-postgres psql -U postgres -d "$DB" -v ON_ERROR_STOP=1 \
    < db/migrations/0049_content_type.sql >/tmp/pr3_assert.log 2>&1; then
  echo "!!! FAILED: the migration ACCEPTED an unverified tenth drink"
  tail -5 /tmp/pr3_assert.log
  exit 1
else
  echo "GOOD: the migration refused. Its message:"
  grep -E 'ERROR|CONTENT_TYPE' /tmp/pr3_assert.log | sed 's/^/  /'
fi
