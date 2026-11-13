#!/usr/bin/env bash
# Reproduce the CI `test` job's database build, so a CI failure can be
# reproduced locally.
#
# THE ORDER MATTERS, and the order is the WORKFLOW'S:
#
#   * some migrations act on the SEEDED catalog, so they run after the
#     seed step;
#   * `gus-241` adds `provenance` to the dimension tables, so the atlas
#     reference seed must run after it;
#   * 0032 asserts every published dish has a `dish_names` row, so the
#     English-names migration (0033) must run BEFORE it;
#   * the atlas fixtures call `published_associations_for_dish()`,
#     which 0040 creates, and 0050's pilot samples the rows they write.
#
# Usage:
#   bash scripts/repro-ci-test-job.sh [--with-0053]
#
#   --with-0053   apply migration 0053 as well -- which is what the
#                 ci.yml patch makes CI do, once the owner applies it
#
# WHY THIS EXISTS
#
# The CI's `test` job builds its database in a specific ORDER, and the
# order matters in ways that are not obvious from the file names: the
# data migrations act on the SEEDED catalog, 0032's assertion needs the
# names 0033 creates, the atlas fixtures call a function 0040 creates,
# and 0050's pilot samples the rows the fixtures write. Getting the
# order wrong produces a failure that looks like a code bug and is not.
#
# So this script is the CI's order, verbatim. A CI failure can be
# reproduced locally with:
#
#   bash scripts/repro-ci-test-job.sh            # CI's current state
#   bash scripts/repro-ci-test-job.sh --with-0053  # after the patch
#   bash scripts/run-api-tests-local.sh          # then the suite
#
# The build takes a few minutes; the suite takes about one.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

# shellcheck source=/dev/null
source "$REPO_ROOT/scripts/lib/test_pg.sh"

DB_NAME="${GUSTALE_TEST_DB_NAME:-gustale_t_5c002b54}"
WITH_0053=0
[ "${1:-}" = "--with-0053" ] && WITH_0053=1

# Apply a migration file to the test database.
#
# The SQL is piped in through STDIN, not passed with `-f`: psql runs
# INSIDE the test container (docker exec), so a `-f` path would resolve
# against the CONTAINER's filesystem and the file would not be found.
apply_sql() {
    local f="$1"
    echo "Applying $f"
    test_pg_run "$DB_NAME" < "$REPO_ROOT/$f" >/dev/null
}

echo "=== building $DB_NAME the way CI's 'test' job does ==="

test_pg_drop "$DB_NAME" >/dev/null 2>&1 || true
test_pg_create "$DB_NAME" >/dev/null 2>&1

test_pg_run "$DB_NAME" -c 'CREATE EXTENSION IF NOT EXISTS postgis;' >/dev/null
test_pg_run "$DB_NAME" -c 'CREATE EXTENSION IF NOT EXISTS "uuid-ossp";' >/dev/null

# ── 0. The ROLES and the default privileges ───────────────────────────
# This MUST run before the migrations, because it sets the DEFAULT
# PRIVILEGES that grant the bot DML on the tables the migrations create.
# Without it the bot has no rights on `recipe_claims` and the recipes
# tests fail with "permission denied for table recipe_claims".
echo "Applying scripts/ci-migration-role.sql"
test_pg_run "$DB_NAME" < "$REPO_ROOT/scripts/ci-migration-role.sql" >/dev/null

# ── 1. The drizzle-kit chain ────────────────────────────────────────────
mapfile -t drizzle_files < <(git ls-files 'packages/db/drizzle/*.sql' | LC_ALL=C sort)
for f in "${drizzle_files[@]}"; do apply_sql "$f"; done

# ── 2. The GUS-xxx chain, in dependency order ──────────────────────────
gus_files=(
    db/migrations/gus-014-pilot-dimensions.sql
    db/migrations/gus-014-technique-fallback.sql
    db/migrations/gus-224-relations-option-b.sql
    db/migrations/gus-227-preparation-method-names.sql
    db/migrations/gus-238-journey-editorial-fields.sql
    db/migrations/gus-242-seed-countries.sql
    db/migrations/gus-242-seed-country-names.sql
    db/migrations/gus-242-seed-cuisines.sql
    db/migrations/gus-242-seed-regions.sql
    db/migrations/gus-014-118-dimensions.sql
    db/migrations/gus-014-broadened-families.sql
    db/migrations/gus-014-broadened-family-corrections.sql
)
for f in "${gus_files[@]}"; do apply_sql "$f"; done

# ── 3. The seed ────────────────────────────────────────────────────────
echo "Applying the seed"
test_pg_run "$DB_NAME" < "$REPO_ROOT/packages/db/seed-moussaka.sql" >/dev/null
test_pg_run "$DB_NAME" < "$REPO_ROOT/packages/db/seed-journey.sql" >/dev/null

# ── 4. The GUS-242 data migrations ─────────────────────────────────────
# These act on the SEEDED catalog, so they run AFTER the seed step.
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
for f in "${data_migrations[@]}"; do apply_sql "$f"; done

# ── 5. Populate the description sentences ──────────────────────────────
# 0032 asserts every published dish has a 'short' description sentence,
# which is only true once the sentences exist.
echo "Populating the description sentences"
python3 scripts/populate_description_sentences.py --apply --db "$DB_NAME" \
    >/dev/null 2>&1 || true

# ── 6. The numbered chain, in the WORKFLOW's order ─────────────────────
# The English-names migration (0033) comes BEFORE the archive (0032),
# because 0032 asserts every published dish has a `dish_names` row.
# The GUS-239 archive (0032) then the English names (0033): the archive's
# assertion is about the name coverage the English names provide.
numbered=(
    db/migrations/0032_gus239_archive_dish_translations.sql
    db/migrations/0033_gus239_english_names.sql
)
for f in "${numbered[@]}"; do apply_sql "$f"; done

# The atlas reference seed. It writes `provenance`, which gus-241 (step 3)
# adds to the dimension tables, and it must run BEFORE 0037 -- the
# backfill -- because the backfill reads the rows it writes.
echo "Applying the atlas reference seed"
test_pg_run "$DB_NAME" < "$REPO_ROOT/packages/db/seed-atlas-references.sql" >/dev/null

numbered=(
    db/migrations/0034_gus242_fix_corrupted_tradition.sql
    db/migrations/0035_categories_kind.sql
    db/migrations/0036_atlas_schema.sql
    db/migrations/0037_atlas_backfill.sql
    db/migrations/0038_publish_credential.sql
    db/migrations/0039_journey_place_queue.sql
    db/migrations/0040_atlas_publication_predicate.sql
    db/migrations/gus-238b-association-review-visibility.sql
    db/migrations/0041_credential_role_separation.sql
    db/migrations/0042_credential_trigger_revocation.sql
    db/migrations/0043_taxonomy_canonicalisation.sql
    db/migrations/0044_not_a_dish_queue.sql
    db/migrations/0045_credential_guard_comment.sql
    db/migrations/0046_source_candidates.sql
    db/migrations/0047_publish_credential_session_binding.sql
    db/migrations/0048_bot_credential_guard.sql
    db/migrations/0049_content_type.sql
)
for f in "${numbered[@]}"; do apply_sql "$f"; done

# ── 7. The atlas fixtures ──────────────────────────────────────────────
# They call `published_associations_for_dish()` (0040) and 0050's pilot
# samples the association rows they write.
echo "Applying the atlas fixtures"
test_pg_run "$DB_NAME" < "$REPO_ROOT/packages/db/seed-atlas-fixtures.sql" >/dev/null

# ── 8. The tail of the chain ───────────────────────────────────────────
tail_chain=(
    db/migrations/0050_association_review_ledger.sql
    db/migrations/0051_family_classification.sql
    db/migrations/0052_recipes_schema.sql
)
for f in "${tail_chain[@]}"; do apply_sql "$f"; done

if [ "$WITH_0053" = "1" ]; then
    echo "Applying db/migrations/0053_recipes_published_view.sql"
    # psql writes NOTICE to STDERR, so both streams are captured --
    # exactly as the CI step does with `2>&1 | tee`.
    test_pg_run "$DB_NAME" < "$REPO_ROOT/db/migrations/0053_recipes_published_view.sql" \
        > /tmp/m0053_repro.log 2>&1
    bash scripts/check-ci-markers.sh "the recipes published view" \
        "RECIPES_PUBLISHED_VIEW_OK" /tmp/m0053_repro.log
fi

echo "=== the database is ready ==="
