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
  db/migrations/0029_adr003_cjk_script_cleanup.sql
  db/migrations/0030_adr003_clear_test_residue.sql
  db/migrations/0031_pool_a_review_sample.sql
)

# 0032 is run SEPARATELY, after the sentence population below, because
# it asserts that every published dish has a 'short' description
# sentence — which is only true once the sentences exist. Running it
# inside the migration list made it fail in CI with "3 published
# dishes have no short description sentence": correct behaviour, wrong
# moment.
MIGRATION_0032=db/migrations/0032_gus239_archive_dish_translations.sql
MIGRATION_0033=db/migrations/0033_gus239_english_names.sql
MIGRATION_0034=db/migrations/0034_gus242_fix_corrupted_tradition.sql


# The FOUR REFERENCE DISHES — rendang, chicken-tikka-masala,
# tacos-al-pastor and falafel — with the EXACT legacy shape they have
# on live. Without this seed the backfill has almost nothing to read,
# and `ATLAS_BACKFILL_OK=1` proves only that the migration EXECUTES.
#
# IT RUNS HERE, AFTER the GUS-242 data migrations, after the sentence
# population, and after 0032 and 0033:
#
#   1. `dish_dish_cuisines.provenance` is added by
#      db/migrations/gus-242-schema-prep.sql. Seeded before it, the seed
#      fails and — being one transaction — silently discards the dishes
#      it had already inserted.
#   2. 0032 asserts that every PUBLISHED dish has a `dish_names` row and
#      a 'short' description sentence. Seeded before 0032, the four new
#      published dishes break that assertion.
#
# The per-dish assertions caught both misorderings.
echo "--- seed: the atlas reference dishes"
run_pg -f - < packages/db/seed-atlas-references.sql >/dev/null 2>&1 \
  || { echo "FAILED: seed-atlas-references"; fail=1; }
[ $fail -eq 0 ] || exit 1

# 0035 restores `categories.kind` — a column that was in the LIVE database
# since 2026-06-25 but in no committed migration. It is idempotent
# (ADD COLUMN IF NOT EXISTS) and touches nothing else, so it can run at
# any point in the chain; it goes here, with the other numbered migrations,
# so the chain stays in one place.
#
# It matters that it is in THIS list: without it, `GET /api/dishes`
# returns 500 on a database built from the committed chain, because the
# query reads `c.kind`. The regression test is
# apps/api/test/dishes-list.test.ts.
MIGRATION_0035=db/migrations/0035_categories_kind.sql

# 0036 is ADR-004's additive schema — the three evidence axes on
# `statements`, `claim_dates`, `dish_place_associations`, the relation_types
# vocabulary, the normalized-pair index, the cycle triggers and the two
# identity tables. Additive and idempotent: it drops, renames and retypes
# nothing, and it creates only what does not already exist.
#
# The constraint tests run right after it, because a schema that exists but
# does not hold is worse than no schema.
MIGRATION_0036=db/migrations/0036_atlas_schema.sql
ATLAS_CONSTRAINT_TESTS=scripts/test_atlas_schema.sql

# 0037 is the P2 backfill: the legacy places & traditions data moves into
# dish_place_associations, and what cannot be decided goes to the editorial
# queue. It is restartable (ON CONFLICT DO NOTHING) and reversible (every
# row carries a legacy provenance), and it asserts its own outcome.
MIGRATION_0037=db/migrations/0037_atlas_backfill.sql

# 0038 is the publish credential. The `verified` and `published`
# transitions used to be guarded by a NAME check — an actor matching
# `%agent%` or `%hermes%` was refused — which passes every other name.
# The rule is now positive: the actor must HOLD a verified
# `publish_credential` row, and the default is deny.
#
# It is additive and idempotent: it creates one table and replaces one
# function.
MIGRATION_0038=db/migrations/0038_publish_credential.sql

# 0039 queues the journey places that produced NO association.
#
# The P2 backfill read the legacy origin, cuisine and tradition fields.
# It did not read `dish_journey_beats` — so a place named only in a
# dish's journey produced no association and was silently dropped. On
# live that is 30 of 35 journey beats across all 12 dishes that have
# them. 0039 puts every one of them in the editorial queue, where a
# reviewer decides. It creates no association and decides nothing.
MIGRATION_0039=db/migrations/0039_journey_place_queue.sql

# The per-dish backfill assertions.
#
# 0037 asserts its outcome in AGGREGATE. Both sides of that comparison
# are computed from the same legacy tables, so a mapping that is wrong
# in the same way on both sides passes. This asserts the EXACT
# association rows the four reference dishes must have, and the
# count-snapshot guard with NON-ZERO baselines — so a backfill that
# produced nothing fails.
ATLAS_BACKFILL_ASSERTIONS=scripts/test_atlas_backfill.sql

# In CI mode the Postgres client must be FOUND, not assumed. On a
# Debian-family GitHub runner `psql` is /usr/bin/psql, but on some images
# the client lives under /usr/lib/postgresql/<version>/bin — and a script
# that only tries PATH fails on the second one. The same fallback is used
# by scripts/populate_description_sentences.py.
PSQL_BIN=""
if [ "${CHAIN_MODE:-}" = "ci" ]; then
  if command -v psql >/dev/null 2>&1; then
    PSQL_BIN="$(command -v psql)"
  else
    PSQL_BIN="$(ls -1 /usr/lib/postgresql/*/bin/psql 2>/dev/null | sort | tail -1)"
  fi
  if [ -z "$PSQL_BIN" ]; then
    echo "FAILED: no psql client found (looked on PATH and under /usr/lib/postgresql/*/bin)" >&2
    exit 1
  fi
  # A GitHub runner reaches the Postgres SERVICE container on 127.0.0.1
  # (the service is published to the runner's host). The variable is here
  # so a containerised simulation can point somewhere else; the default is
  # the runner's own arrangement.
  PG_HOST="${PG_HOST:-127.0.0.1}"
fi

run_pg() {
  if [ "${CHAIN_MODE:-}" = "ci" ]; then
    PGPASSWORD="${PGPASSWORD:-gustale}" "$PSQL_BIN" -h "$PG_HOST" -U gustale -d "$DB" -v ON_ERROR_STOP=1 "$@"
  else
    docker exec -u postgres -i shared-postgres psql -U postgres -d "$DB" -v ON_ERROR_STOP=1 "$@"
  fi
}

# The chain runs in THREE environments, and the one difference that
# actually breaks is whether the `shared-postgres` container exists:
#
#   - the live host / a dev box: the container holds the database
#   - the CI runner (and the Nightly runner): Postgres is a SERVICE
#     container reachable at 127.0.0.1, with PGPASSWORD=gustale, and
#     there is NO `shared-postgres` container to `docker exec` into
#
# The first version of this script only knew the first case, which is
# exactly why the Nightly could not use it: the Nightly's runner has no
# `shared-postgres` container. `CHAIN_MODE=ci` selects the service path.
# It is a variable rather than a guess because "is the container there" is
# not the same question as "which host do I run on" — the Nightly and the
# CI both run on a GitHub runner, and the live host is the one with the
# container.
if [ "${CHAIN_MODE:-}" = "ci" ]; then
  echo "=== creating $DB (CI mode: Postgres service on 127.0.0.1) ==="
  PGPASSWORD="${PGPASSWORD:-gustale}" "$PSQL_BIN" -h "$PG_HOST" -U gustale -d postgres \
    -v ON_ERROR_STOP=1 -c "DROP DATABASE IF EXISTS $DB;" -c "CREATE DATABASE $DB;" >/dev/null
else
  echo "=== creating $DB (container mode: shared-postgres) ==="
  docker exec -u postgres shared-postgres psql -U postgres -d postgres \
    -c "DROP DATABASE IF EXISTS $DB;" -c "CREATE DATABASE $DB;" >/dev/null
fi

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
echo "--- the GUS-239 archive (after the sentences exist)"
run_pg -f - < "$MIGRATION_0032" >/tmp/m0032.log 2>&1 || { echo "FAILED: 0032"; tail -12 /tmp/m0032.log; fail=1; }
[ $fail -eq 0 ] || exit 1
grep -E 'NOTICE' /tmp/m0032.log | head -2 || true

# 0033 adds the English name to dish_names for every dish that lacks
# one. It must run AFTER the archive, because the archive's assertion
# is about the coverage the API now depends on, and the English name
# is part of that coverage.
echo "--- the GUS-239 English names"
run_pg -f - < "$MIGRATION_0033" >/tmp/m0033.log 2>&1 || { echo "FAILED: 0033"; tail -12 /tmp/m0033.log; fail=1; }
[ $fail -eq 0 ] || exit 1
grep -E 'NOTICE' /tmp/m0033.log | head -2 || true

# 0034 fixes the one corrupted row in the 1e traditions load — a row
# whose Wikidata Q-id is for Algerian cuisine but which carried
# Tunisian text. It is a rename, so it must run AFTER the traditions
# exist (0019), which they do by this point in the chain.
echo "--- the corrupted tradition row"
run_pg -f - < "$MIGRATION_0034" >/tmp/m0034.log 2>&1 || { echo "FAILED: 0034"; tail -12 /tmp/m0034.log; fail=1; }
[ $fail -eq 0 ] || exit 1
grep -E 'NOTICE|GUS-242' /tmp/m0034.log | head -2 || true

# 0035 restores `categories.kind`. Idempotent, so it is safe here and
# safe on live (where the column already exists and this is a no-op).
echo "--- the categories.kind column"
run_pg -f - < "$MIGRATION_0035" >/tmp/m0035.log 2>&1 || { echo "FAILED: 0035"; tail -12 /tmp/m0035.log; fail=1; }
[ $fail -eq 0 ] || exit 1
grep -E 'NOTICE' /tmp/m0035.log | head -2 || true


# 0036 — ADR-004's additive schema. Idempotent, so it is safe here and
# safe on live (where it creates only what does not exist).
echo "--- the ADR-004 atlas schema"
run_pg -f - < "$MIGRATION_0036" >/tmp/m0036.log 2>&1 || { echo "FAILED: 0036"; tail -12 /tmp/m0036.log; fail=1; }
[ $fail -eq 0 ] || exit 1
grep -E 'NOTICE' /tmp/m0036.log | head -3 || true

# The constraint tests: every case asserts that a bad write is REFUSED.
#
# They run HERE, before 0038 — the D9 publish-credential cases need the
# 0038 table, so the suite is run AGAIN after 0038 below. The first run
# covers D1-D8; the second covers everything including D9.
echo "--- the ADR-004 atlas constraints"
run_pg -v ON_ERROR_STOP=1 -f - < "$ATLAS_CONSTRAINT_TESTS" >/tmp/atlas_constraints.log 2>&1 \
  || { echo "FAILED: the atlas constraint tests"; grep -E 'FAIL|ERROR' /tmp/atlas_constraints.log | head -12; fail=1; }
[ $fail -eq 0 ] || exit 1
grep -E 'ATLAS_SCHEMA_TESTS' /tmp/atlas_constraints.log | tail -1 || true

# 0037 — the P2 backfill. It asserts its own outcome, so a failure here
# means the backfill did not do what it says it does.
echo "--- the ADR-004 atlas backfill"
run_pg -f - < "$MIGRATION_0037" >/tmp/m0037.log 2>&1 || { echo "FAILED: 0037"; grep -E 'ERROR|NOTICE' /tmp/m0037.log | tail -12; fail=1; }
[ $fail -eq 0 ] || exit 1
grep -E 'ATLAS_BACKFILL_OK|reconciliation' /tmp/m0037.log | tail -2 || true

# 0038 — the publish credential. Additive and idempotent.
echo "--- the publish credential"
run_pg -f - < "$MIGRATION_0038" >/tmp/m0038.log 2>&1 || { echo "FAILED: 0038"; grep -E 'ERROR|NOTICE' /tmp/m0038.log | tail -12; fail=1; }
[ $fail -eq 0 ] || exit 1
grep -E 'PUBLISH_CREDENTIAL_OK' /tmp/m0038.log | tail -1 || true

# The constraint tests AGAIN, now with the D9 publish-credential cases.
echo "--- the atlas constraints (with the publish credential)"
run_pg -v ON_ERROR_STOP=1 -f - < "$ATLAS_CONSTRAINT_TESTS" >/tmp/atlas_constraints2.log 2>&1 \
  || { echo "FAILED: the atlas constraint tests (with the publish credential)"; grep -E 'FAIL|ERROR' /tmp/atlas_constraints2.log | head -12; fail=1; }
[ $fail -eq 0 ] || exit 1
grep -E 'ATLAS_SCHEMA_TESTS' /tmp/atlas_constraints2.log | tail -1 || true

# 0039 — the journey places that produced no association, queued rather
# than dropped.
echo "--- the journey place queue"
run_pg -f - < "$MIGRATION_0039" >/tmp/m0039.log 2>&1 || { echo "FAILED: 0039"; grep -E 'ERROR|NOTICE' /tmp/m0039.log | tail -12; fail=1; }
[ $fail -eq 0 ] || exit 1
grep -E 'ATLAS_JOURNEY_QUEUE_OK' /tmp/m0039.log | tail -1 || true

# The PER-DISH backfill assertions. LAST, because they assert the state
# the whole chain produces: the reference dishes' association rows AND
# the journey places in the editorial queue.
#
# 0037's own assertion is an AGGREGATE one: the counts against the
# legacy tables. Both sides come from the same tables, so a mapping that
# is wrong in the same way on both sides passes. This asserts the EXACT
# association rows the four reference dishes must have, and the
# count-snapshot guard with NON-ZERO baselines — a backfill that produced
# nothing FAILS it.
echo "--- the atlas backfill assertions"
run_pg -v ON_ERROR_STOP=1 -f - < "$ATLAS_BACKFILL_ASSERTIONS" >/tmp/atlas_backfill_assertions.log 2>&1 \
  || { echo "FAILED: the atlas backfill assertions"; grep -E 'FAIL|ERROR' /tmp/atlas_backfill_assertions.log | head -12; fail=1; }
[ $fail -eq 0 ] || exit 1
grep -E 'ATLAS_BACKFILL_ASSERTIONS|ATLAS_COUNT_GUARD' /tmp/atlas_backfill_assertions.log | tail -2 || true

echo ""
if [ $fail -eq 0 ]; then
  echo "FULL_CI_CHAIN_OK=1"
else
  echo "FULL_CI_CHAIN_OK=0"
  exit 1
fi
