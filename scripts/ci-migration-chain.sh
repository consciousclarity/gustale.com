#!/usr/bin/env bash
# Run the EXACT CI migration chain against a throwaway database.
#
# This proves that the CI workflow's migration order works end to end,
# including the GUS-242 data migrations that run after the seed. It is
# the local counterpart of the CI job, so a chain that passes here
# passes there.
#
# Usage: bash scripts/ci-migration-chain.sh [dbname]
set -euo pipefail

DB="${1:-gustale_cichain_test}"
cd "$(dirname "$0")/.."

DRIZZLE_FILES=()
while IFS= read -r f; do DRIZZLE_FILES+=("$f"); done < <(
  git ls-files 'packages/db/drizzle/*.sql' | sort
)

GUS_FILES=(
  db/migrations/gus-014-pilot-dimensions.sql
  db/migrations/gus-014-technique-fallback.sql
  db/migrations/gus-224-relations-option-b.sql
  db/migrations/gus-227-preparation-method-names.sql
  db/migrations/gus-242-seed-countries.sql
  db/migrations/gus-242-seed-country-names.sql
  db/migrations/gus-242-seed-cuisines.sql
  db/migrations/gus-242-seed-regions.sql
  db/migrations/gus-014-118-dimensions.sql
  db/migrations/gus-014-broadened-families.sql
  db/migrations/gus-014-broadened-family-corrections.sql
)

DATA_MIGRATIONS=(
  db/migrations/gus-241-taxonomy-and-unset-dimensions.sql
  db/migrations/gus-242-schema-prep.sql
  db/migrations/0015_gus242_resync.sql
  db/migrations/0016_gus242_cuisines.sql
  db/migrations/0017_gus242_cuisine_corrections.sql
  db/migrations/0018_gus242_vocab_1f.sql
  db/migrations/0019_gus242_traditions_1e.sql
  db/migrations/0020_gus242_ingredient_categories.sql
  db/migrations/0021_adr003_vocabulary_labels.sql
  db/migrations/0022_adr003_vocabulary_labels.sql
  db/migrations/0023_adr003_dish_names.sql
  db/migrations/0024_adr003_dish_names_data.sql
  db/migrations/0025_adr002_description_sentences.sql
  db/migrations/0026_adr003_sentence_translations.sql
  db/migrations/0027_adr002_claims_model.sql
  db/migrations/0028_adr003_translation_cleanup.sql
)

run_pg() {
  docker exec -u postgres -i shared-postgres psql -U postgres -d "$DB" -v ON_ERROR_STOP=1 "$@"
}

echo "=== creating $DB ==="
docker exec -u postgres shared-postgres psql -U postgres -d postgres \
  -c "DROP DATABASE IF EXISTS $DB;" -c "CREATE DATABASE $DB;" >/dev/null

fail=0
for f in "${DRIZZLE_FILES[@]}"; do
  echo "--- drizzle: $f"
  run_pg -f - < "$f" >/dev/null 2>&1 || { echo "FAILED: $f"; fail=1; break; }
done
[ $fail -eq 0 ] || exit 1

for f in "${GUS_FILES[@]}"; do
  echo "--- gus: $f"
  run_pg -f - < "$f" >/dev/null 2>&1 || { echo "FAILED: $f"; fail=1; break; }
done
[ $fail -eq 0 ] || exit 1

echo "--- seed (moussaka + journey, one psql session)"
run_pg -f - < packages/db/seed-moussaka.sql >/dev/null 2>&1 || { echo "FAILED: seed-moussaka"; fail=1; }
[ $fail -eq 0 ] || exit 1
run_pg -f - < packages/db/seed-journey.sql >/dev/null 2>&1 || { echo "FAILED: seed-journey"; fail=1; }
[ $fail -eq 0 ] || exit 1

for f in "${DATA_MIGRATIONS[@]}"; do
  echo "--- data: $f"
  out=$(run_pg -f - < "$f" 2>&1) || { echo "FAILED: $f"; echo "$out" | tail -5; fail=1; break; }
  echo "$out" | grep -E '^GUS-242:' | head -1 || true
done
[ $fail -eq 0 ] || exit 1

echo ""
echo "=== the resulting state ==="
run_pg -c "
  select 'tables' as what, count(*)::text as n from information_schema.tables
   where table_schema='public' and table_type='BASE TABLE'
  union all select 'dishes', count(*)::text from dishes
  union all select 'ingredient_categories', count(*)::text from ingredient_categories
  union all select 'dish_families', count(*)::text from dish_families
  union all select 'dish_techniques', count(*)::text from dish_techniques
  union all select 'dish_traditions', count(*)::text from dish_traditions
  union all select 'dish_cuisines', count(*)::text from dish_cuisines
  union all select 'countries', count(*)::text from geo_entities where entity_type='country'
  union all select 'geo_entities', count(*)::text from geo_entities;
"

# ── The sentence layer's own checks ─────────────────────────────────────
#
# ADR-002 Q9 requires TWO instruments: the boundary fixture set (the
# splitter puts boundaries in the right places) and the concat check
# (the sentence table and the live column agree byte-for-byte).
#
# The CI seed is smaller than live, so the population runs against
# whatever the seed produced. The fixture set is checked FIRST — it
# does not depend on the data at all.
echo ""
echo "--- the sentence boundary fixture set"
python3 scripts/split_sentences.py --check || { echo "FAILED: the boundary fixtures"; fail=1; }
[ $fail -eq 0 ] || exit 1

echo "--- the sentence population (against the CI seed)"
python3 scripts/populate_description_sentences.py --apply --db "$DB" >/tmp/sent_pop.log 2>&1 \
  || { echo "FAILED: the sentence population"; tail -12 /tmp/sent_pop.log; fail=1; }
[ $fail -eq 0 ] || exit 1
grep -E 'sentences' /tmp/sent_pop.log | head -2 || true

echo ""
if [ $fail -eq 0 ]; then
  echo "FULL_CI_CHAIN_OK=1"
else
  echo "FULL_CI_CHAIN_OK=0"
  exit 1
fi
