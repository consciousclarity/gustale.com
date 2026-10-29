#!/usr/bin/env bash
# Reproduce the CI job's ephemeral database, exactly.
#
# The CI job's steps, in order:
#   1. Apply schema to ephemeral DB  (the extensions, the drizzle chain,
#      then the GUS-xxx chain)
#   2. Apply seed                    (seed-moussaka, seed-journey)
#   3. Apply the GUS-242 data migrations
#   4. Build db package
#   5. Populate the description sentences
#   6. Apply the GUS-239 archive
#   7. Run vitest
#
# The order was found empirically by scripts/find_migration_order.py, and
# it is NOT alphabetical — neither chain alone works.
#
# This script runs the database parts, so a CI failure can be reproduced
# and debugged on the host instead of by guessing.
#
# Usage: bash scripts/repro-ci-db.sh [database-name]

set -uo pipefail

DB="${1:-gustale_ci_repro}"
CONTAINER=shared-postgres

echo "=== creating $DB ==="
docker exec -u postgres "$CONTAINER" psql -U postgres -d postgres \
  -c "DROP DATABASE IF EXISTS $DB;" -c "CREATE DATABASE $DB;" >/dev/null

run_pg() {
  docker exec -u postgres -i "$CONTAINER" psql -U postgres -d "$DB" \
    -v ON_ERROR_STOP=1 "$@"
}

fail=0
step() { echo "--- $1"; }

step "the extensions"
run_pg -c 'CREATE EXTENSION IF NOT EXISTS postgis;' \
       -c 'CREATE EXTENSION IF NOT EXISTS "uuid-ossp";' >/dev/null || fail=1

# The CI runner creates the database as the gustale user, so gustale
# OWNS the tables. Here the database is created by the postgres
# superuser, so gustale has no grants — and every test query fails
# with "permission denied for table categories", which looks like a
# test failure and is not one.
step "the grants"
run_pg -c "GRANT ALL ON SCHEMA public TO gustale;" \
       -c "GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO gustale;" \
       -c "GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO gustale;" \
       -c "ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO gustale;" \
       -c "ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO gustale;" \
       >/dev/null || fail=1

step "the drizzle chain"
mapfile -t drizzle_files < <(cd "$(dirname "$0")/.." && git ls-files 'packages/db/drizzle/*.sql' | LC_ALL=C sort)
for f in "${drizzle_files[@]}"; do
  run_pg -f - < "$(dirname "$0")/../$f" >/dev/null 2>&1 || { echo "  FAILED: $f"; fail=1; break; }
done

step "the GUS-xxx chain"
gus_files=(
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
for f in "${gus_files[@]}"; do
  run_pg -f - < "$(dirname "$0")/../$f" >/dev/null 2>&1 || { echo "  FAILED: $f"; fail=1; break; }
done

step "the seed"
run_pg -f - < "$(dirname "$0")/../packages/db/seed-moussaka.sql" >/dev/null 2>&1 || { echo "  FAILED: seed-moussaka"; fail=1; }
run_pg -f - < "$(dirname "$0")/../packages/db/seed-journey.sql" >/dev/null 2>&1 || { echo "  FAILED: seed-journey"; fail=1; }

step "the GUS-242 data migrations"
data_migrations=(
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
  db/migrations/0029_adr003_cjk_script_cleanup.sql
  db/migrations/0030_adr003_clear_test_residue.sql
  db/migrations/0031_pool_a_review_sample.sql
)
for f in "${data_migrations[@]}"; do
  if ! run_pg -f - < "$(dirname "$0")/../$f" >/dev/null 2>&1; then
    echo "  FAILED: $f"
    run_pg -f - < "$(dirname "$0")/../$f" 2>&1 | grep -E 'ERROR' | head -3
    fail=1
  fi
done

step "the grants, again (the migrations and the seed created tables)"
run_pg -c "GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO gustale;" \
       -c "GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO gustale;" \
       >/dev/null || fail=1

step "the state before the population"
echo "  the dishes:            $(run_pg -tAc 'select count(*) from dishes;' 2>&1|tail -1)"
echo "  the sentences:         $(run_pg -tAc 'select count(*) from description_sentences;' 2>&1|tail -1)"
echo "  the sentence_managed:  $(run_pg -tAc 'select count(*) from dishes where sentence_managed;' 2>&1|tail -1)"

step "the sentence population"
python3 "$(dirname "$0")/populate_description_sentences.py" --apply --db "$DB" 2>&1 | tail -12
[ "${PIPESTATUS[0]}" -eq 0 ] || { echo "  FAILED: the population"; fail=1; }

step "the GUS-239 archive"
run_pg -f - < "$(dirname "$0")/../db/migrations/0032_gus239_archive_dish_translations.sql" 2>&1 | grep -E 'NOTICE|ERROR' | head -3
[ "${PIPESTATUS[0]}" -eq 0 ] || { echo "  FAILED: 0032"; fail=1; }

step "the GUS-239 English names"
run_pg -f - < "$(dirname "$0")/../db/migrations/0033_gus239_english_names.sql" 2>&1 | grep -E 'NOTICE|ERROR' | head -3
run_pg -f - < "$(dirname "$0")/../db/migrations/0033_gus239_english_names.sql" >/dev/null 2>&1 || { echo "  FAILED: 0033"; fail=1; }

echo ""
if [ $fail -eq 0 ]; then
  echo "CI_DB_REPRO_OK=1"
else
  echo "CI_DB_REPRO_OK=0"
fi
exit $fail
