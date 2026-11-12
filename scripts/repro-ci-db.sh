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

# The DEDICATED TEST POSTGRES, never `shared-postgres`.
#
# `DROP DATABASE` is CLUSTER-SCOPED, and the production cluster hosts
# the live database and five other projects' databases. On 2026-11-06
# a `DROP DATABASE` aimed at this cluster destroyed the live database.
# The CI reproduction runs on the test container, which is exactly what
# the CI runner does (its own Postgres service).
# shellcheck source=scripts/lib/test_pg.sh
source scripts/lib/test_pg.sh
CONTAINER="$TEST_PG_CONTAINER"

echo "=== creating $DB ==="
test_pg_up
test_pg_create "$DB"

# The ATLAS migrations run as the `postgres` SUPERUSER, exactly as they
# run on live.
#
# The CI's PostgreSQL service container creates the database with
# POSTGRES_USER=gustale, so the migrations used to run as gustale — and
# the publish_credential table was OWNED BY gustale. An owner cannot
# have its own privileges revoked, so the credential role separation
# (0041) could not take effect there, and its own assertion caught it:
#
#     ERROR: the bot role may still INSERT into publish_credential
#
# Running as postgres makes the CI's arrangement IDENTICAL to live's:
# the table is owned by postgres, the REVOKE is real, and the
# separation is proved where it will actually run.
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

# The database is a DISPOSABLE copy, and it says so.
#
# The atlas constraint tests refuse to run against a database that is
# not marked disposable (scripts/mark_disposable_db.sql). The default is
# deny: an unmarked database is refused, whatever its name.
#
# The mark is applied HERE, immediately after this script creates the
# database, and never to production.
run_pg -f - < "$(dirname "$0")/mark_disposable_db.sql" >/dev/null 2>&1 \
  || { echo "  FAILED: the disposable marker"; fail=1; }
step "the CI migration role setup"
#
# This step was MISSING, and it made the local reproduction drift from
# CI.
#
# The CI's migration chain runs `scripts/ci-migration-role.sql` before
# the migrations. That file creates the `gustale_migrator` role, the
# `gustale_credential_issuer` role, and the bot's role as an ORDINARY
# login (not a superuser) -- and it asserts that arrangement.
#
# Without it, this script failed at migration 0045 with:
#
#     ERROR:  role "gustale_migrator" does not exist
#
# The failure was a setup gap, not a migration bug, and it made the
# local reproduction unusable for the migrations that follow.
#
# IT RUNS BEFORE THE MIGRATIONS, because the migrations depend on the
# arrangement it establishes. It is idempotent, so a re-run is safe.
run_pg -f - < "$(dirname "$0")/ci-migration-role.sql" > /tmp/repro_ci_migration_role.log 2>&1 \
  || { echo "  FAILED: the CI migration role setup"; grep -E 'ERROR' /tmp/repro_ci_migration_role.log | head -6; fail=1; }
grep -E 'CI_MIGRATION_ROLE_OK' /tmp/repro_ci_migration_role.log | tail -1 || true

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
  db/migrations/gus-238-journey-editorial-fields.sql
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

# The FOUR REFERENCE DISHES — rendang, chicken-tikka-masala,
# tacos-al-pastor and falafel.
#
# This seed is what makes the backfill testable. Without it the CI
# database holds three dishes, the backfill produces five associations,
# and `ATLAS_BACKFILL_OK=1` proves only that migration 0037 EXECUTES on
# a nearly-empty database. A backfill that produced ZERO associations
# would have passed the same gate.
#
# With it, the CI database holds the acceptance fixtures with the EXACT
# legacy shape they have on live, and the per-dish assertions can check
# the association rows themselves rather than a total.
#
# IT RUNS HERE, AFTER the GUS-242 data migrations, and not with the
# other seed files. The reason is `dish_dish_cuisines.provenance`: that
# column is added by db/migrations/gus-242-schema-prep.sql, so a seed
# that writes the column runs BEFORE the schema has it and fails with
#
#     ERROR: column "provenance" of relation "dish_dish_cuisines" does not exist
#
# The seed file is one transaction, so that error discards the four
# dishes it had already inserted — and the failure is SILENT, because
# the script only reports "FAILED: seed-atlas-references" at the end.
#
# The first run of this seed was in exactly that position, and the
# symptom was the per-dish assertions reporting that all four reference
# dishes had ZERO associations. The assertions caught it.
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

# 0034 fixes the one corrupted row in the 1e traditions load. It must run
# AFTER the traditions exist (0019), which they do by this point.
step "the corrupted-tradition fix"
run_pg -f - < "$(dirname "$0")/../db/migrations/0034_gus242_fix_corrupted_tradition.sql" 2>&1 | grep -E 'NOTICE|ERROR' | head -3
run_pg -f - < "$(dirname "$0")/../db/migrations/0034_gus242_fix_corrupted_tradition.sql" >/dev/null 2>&1 || { echo "  FAILED: 0034"; fail=1; }

# The FOUR REFERENCE DISHES — rendang, chicken-tikka-masala,
# tacos-al-pastor and falafel.
#
# This seed is what makes the backfill testable. Without it the CI
# database holds three dishes, the backfill produces five associations,
# and `ATLAS_BACKFILL_OK=1` proves only that migration 0037 EXECUTES on
# a nearly-empty database. A backfill that produced ZERO associations
# would have passed the same gate.
#
# With it, the CI database holds the acceptance fixtures with the EXACT
# legacy shape they have on live, and the per-dish assertions can check
# the association rows themselves rather than a total.
#
# WHERE IT RUNS, AND WHY
#
# It runs HERE — after the GUS-242 data migrations, after the sentence
# population, and after 0032 and 0033 — for three reasons, each of which
# cost a build:
#
#   1. `dish_dish_cuisines.provenance` is added by
#      db/migrations/gus-242-schema-prep.sql. Seeded before it, the seed
#      fails with "column provenance of relation dish_dish_cuisines does
#      not exist", and — being one transaction — that discards the four
#      dishes it had already inserted. The failure is SILENT.
#
#   2. 0032 asserts that every PUBLISHED dish has a `dish_names` row and
#      a 'short' description sentence. Seeded before 0032, the four new
#      published dishes break that assertion and 0032 fails.
#
#   3. The sentence population refuses to append to a table that already
#      holds rows, so the four dishes must be seeded BEFORE it to be
#      covered by it — which then requires 0032 to run after them.
#      0032 runs after the population and before 0033, so the reference
#      dishes sit between the population and 0033.
#
# The order that satisfies all three is: population -> 0032 -> 0033 ->
# reference dishes -> 0034 onwards. And 0032/0033 must tolerate the
# reference dishes' absence, which they do — 0032's assertion counts
# only the dishes that exist at the time it runs.
#
# The per-dish assertions caught every one of these misorderings. That
# is what they are for.
step "the atlas reference dishes"
run_pg -f - < "$(dirname "$0")/../packages/db/seed-atlas-references.sql" >/dev/null 2>&1 \
  || { echo "  FAILED: seed-atlas-references"; fail=1; }

# 0035 restores `categories.kind` — the column that was in the LIVE
# database since 2026-06-25 but in no committed migration. Without it,
# `GET /api/dishes` returns 500 on a database built from the committed
# chain.
step "the categories.kind column"
run_pg -f - < "$(dirname "$0")/../db/migrations/0035_categories_kind.sql" 2>&1 | grep -E 'NOTICE|ERROR' | head -3
run_pg -f - < "$(dirname "$0")/../db/migrations/0035_categories_kind.sql" >/dev/null 2>&1 || { echo "  FAILED: 0035"; fail=1; }

# 0036 is ADR-004's additive schema: the three evidence axes on
# `statements`, `claim_dates`, `dish_place_associations`, the
# relation_types vocabulary, the normalized-pair index, the cycle triggers
# and the two identity tables. Additive and idempotent.
step "the ADR-004 atlas schema"
run_pg -f - < "$(dirname "$0")/../db/migrations/0036_atlas_schema.sql" 2>&1 | grep -E 'NOTICE|ERROR' | head -4
run_pg -f - < "$(dirname "$0")/../db/migrations/0036_atlas_schema.sql" >/dev/null 2>&1 || { echo "  FAILED: 0036"; fail=1; }

# The constraint tests: every case asserts that a bad write is REFUSED. A
# schema that exists but does not hold is worse than no schema, so the
# tests are part of the reproduction, not an afterthought.
#
# They run HERE, before 0038 — the D9 publish-credential cases need the
# 0038 table, so the suite is run AGAIN after 0038 below. The first run
# covers D1-D8; the second covers everything including D9.
step "the ADR-004 atlas constraints"
run_pg -v ON_ERROR_STOP=1 -f - < "$(dirname "$0")/test_atlas_schema.sql" > /tmp/repro_atlas_constraints.log 2>&1 \
  || { echo "  FAILED: the atlas constraint tests"; grep -E 'FAIL|ERROR' /tmp/repro_atlas_constraints.log | head -12; fail=1; }
grep -E 'ATLAS_SCHEMA_TESTS' /tmp/repro_atlas_constraints.log | tail -1 || true

# 0037 is the P2 backfill: the legacy places & traditions data moves into
# dish_place_associations, and what cannot be decided goes to the editorial
# queue. It asserts its own outcome.
step "the ADR-004 atlas backfill"
run_pg -f - < "$(dirname "$0")/../db/migrations/0037_atlas_backfill.sql" > /tmp/repro_atlas_backfill.log 2>&1 \
  || { echo "  FAILED: 0037"; grep -E 'ERROR' /tmp/repro_atlas_backfill.log | head -6; fail=1; }
grep -E 'ATLAS_BACKFILL_OK' /tmp/repro_atlas_backfill.log | tail -1 || true

# 0038 is the publish credential: the `verified` and `published`
# transitions now require an actor that HOLDS a verified
# `publish_credential` row, instead of an actor whose NAME does not
# contain "agent" or "hermes". It is additive and idempotent.
step "the publish credential"
run_pg -f - < "$(dirname "$0")/../db/migrations/0038_publish_credential.sql" > /tmp/repro_publish_credential.log 2>&1 \
  || { echo "  FAILED: 0038"; grep -E 'ERROR' /tmp/repro_publish_credential.log | head -6; fail=1; }
grep -E 'PUBLISH_CREDENTIAL_OK' /tmp/repro_publish_credential.log | tail -1 || true

# The D9 constraint cases — the publish credential is proved here, so the
# constraint tests run AFTER 0038, not before it.
step "the publish credential constraints"
run_pg -v ON_ERROR_STOP=1 -f - < "$(dirname "$0")/test_atlas_schema.sql" > /tmp/repro_atlas_constraints2.log 2>&1 \
  || { echo "  FAILED: the atlas constraint tests (with the publish credential)"; grep -E 'FAIL|ERROR' /tmp/repro_atlas_constraints2.log | head -12; fail=1; }
grep -E 'ATLAS_SCHEMA_TESTS' /tmp/repro_atlas_constraints2.log | tail -1 || true

# 0039 queues the journey places that produced NO association.
#
# The backfill read the legacy origin, cuisine and tradition fields. It
# did not read `dish_journey_beats` — so a place named only in a dish's
# journey produced no association, and was silently dropped. On live
# that is 30 of 35 journey beats across all 12 dishes that have them.
#
# 0039 puts every one of them in the editorial queue, where a reviewer
# decides. It creates no association and decides nothing.
step "the journey place queue"
run_pg -f - < "$(dirname "$0")/../db/migrations/0039_journey_place_queue.sql" > /tmp/repro_journey_queue.log 2>&1 \
  || { echo "  FAILED: 0039"; grep -E 'ERROR' /tmp/repro_journey_queue.log | head -6; fail=1; }
grep -E 'ATLAS_JOURNEY_QUEUE_OK' /tmp/repro_journey_queue.log | tail -1 || true

# 0040 is the PUBLICATION PREDICATE (ADR-004 D8.2). It writes NO rows.
#
# D8.2 says "a single SQL function is the only thing that decides what
# the public may see", and it names published_claims_for_dish(). That
# function did not exist — the route wrote the filter out by hand,
# three times. This creates the three predicates.
step "the publication predicate"
run_pg -f - < "$(dirname "$0")/../db/migrations/0040_atlas_publication_predicate.sql" > /tmp/repro_publication.log 2>&1 \
  || { echo "  FAILED: 0040"; grep -E 'ERROR' /tmp/repro_publication.log | head -6; fail=1; }
grep -E 'ATLAS_PUBLICATION_PREDICATE_OK' /tmp/repro_publication.log | tail -1 || true

# The FIXTURES — a SEED, not a migration.
#
# The brief's §12: the model is "demonstrated with isolated fixtures".
# The brief's §13: "Fixtures never enter the live database or the
# production content pipeline."
#
# So it is a SEED and it lives OUTSIDE db/migrations/, which is what
# keeps the live migration chain from ever running it. Applied by CI,
# the Nightly and the local reproduction — the three places that need a
# populated atlas — and by nothing else.
step "the credential role separation"
run_pg -f - < "$(dirname "$0")/../db/migrations/0041_credential_role_separation.sql" > /tmp/repro_credsep.log 2>&1 \
  || { echo "  FAILED: 0041"; grep -E 'ERROR' /tmp/repro_credsep.log | head -6; fail=1; }
grep -E 'ATLAS_CREDENTIAL_SEPARATION_OK' /tmp/repro_credsep.log | tail -1 || true

# 0042 — revokes the TRIGGER escalation on publish_credential. It comes
# after 0041 because 0041 creates the roles it works on.
step "the credential trigger revocation"
run_pg -f - < "$(dirname "$0")/../db/migrations/0042_credential_trigger_revocation.sql" > /tmp/repro_0042.log 2>&1 \
  || { echo "  FAILED: 0042"; grep -E 'ERROR' /tmp/repro_0042.log | head -6; fail=1; }
grep -E 'PUBLISH_CREDENTIAL_TRIGGER_REVOKED' /tmp/repro_0042.log | tail -1 || true

# The escalation check — a separate file, run after 0042. It asserts a
# GRANT state that only 0041 and 0042 establish.
step "the credential escalation check"
run_pg -f - < "$(dirname "$0")/mark_disposable_db.sql" > /tmp/repro_mark.log 2>&1 \
  || { echo "  FAILED: the disposable marker"; grep -E 'ERROR' /tmp/repro_mark.log | head -4; fail=1; }
run_pg -v ON_ERROR_STOP=1 -f - < "$(dirname "$0")/test_atlas_trigger_escalation.sql" > /tmp/repro_escalation.log 2>&1 \
  || { echo "  FAILED: the credential escalation check"; grep -E 'FAIL|ERROR' /tmp/repro_escalation.log | head -8; fail=1; }
grep -E 'ATLAS_TRIGGER_ESCALATION' /tmp/repro_escalation.log | tail -1 || true

# 0043 — the taxonomy canonicalisation.
step "the taxonomy canonicalisation"
run_pg -f - < "$(dirname "$0")/../db/migrations/0043_taxonomy_canonicalisation.sql" > /tmp/repro_0043.log 2>&1 \
  || { echo "  FAILED: 0043"; grep -E 'ERROR' /tmp/repro_0043.log | head -6; fail=1; }
grep -E 'TAXONOMY_CANONICALISED' /tmp/repro_0043.log | tail -1 || true

# 0044 — the not-a-dish queue item.
step "the not-a-dish queue item"
run_pg -f - < "$(dirname "$0")/../db/migrations/0044_not_a_dish_queue.sql" > /tmp/repro_0044.log 2>&1 \
  || { echo "  FAILED: 0044"; grep -E 'ERROR' /tmp/repro_0044.log | head -6; fail=1; }
grep -E 'NOT_A_DISH_QUEUED' /tmp/repro_0044.log | tail -1 || true

# 0045 — corrects the credential guard function's comment.
step "the credential guard comment"
run_pg -f - < "$(dirname "$0")/../db/migrations/0045_credential_guard_comment.sql" > /tmp/repro_0045.log 2>&1 \
  || { echo "  FAILED: 0045"; grep -E 'ERROR' /tmp/repro_0045.log | head -6; fail=1; }
grep -E 'CREDENTIAL_GUARD_COMMENT_CORRECTED' /tmp/repro_0045.log | tail -1 || true

# 0046 — the candidate-source table (GUS-1010). NOT `sources`, NOT
# `claim_citations`, and nothing in it is ever verified.
step "the source candidates table"
run_pg -f - < "$(dirname "$0")/../db/migrations/0046_source_candidates.sql" > /tmp/repro_0046.log 2>&1 \
  || { echo "  FAILED: 0046"; grep -E 'ERROR' /tmp/repro_0046.log | head -6; fail=1; }
grep -E 'SOURCE_CANDIDATES_TABLE_READY' /tmp/repro_0046.log | tail -1 || true

# 0047 — the publish credential is bound to the Better Auth session. The
# publisher is derived from the session, never supplied by the caller.
# The migration carries its own behavioural proof and FAILS if the
# caller-supplied actor is still accepted.
step "the publish credential session binding"
run_pg -f - < "$(dirname "$0")/../db/migrations/0047_publish_credential_session_binding.sql" > /tmp/repro_0047.log 2>&1 \
  || { echo "  FAILED: 0047"; grep -E 'ERROR' /tmp/repro_0047.log | head -6; fail=1; }
grep -E 'SESSION_BINDING_PROOF_OK' /tmp/repro_0047.log | tail -1 || true

# 0048 — refuses a publish credential for a BOT account.
# It must run AFTER 0047: 0047 REPLACES the guard function, 0048 amends it.
step "the bot credential guard"
run_pg -f - < "$(dirname "$0")/../db/migrations/0048_bot_credential_guard.sql" > /tmp/repro_0048.log 2>&1 \
  || { echo "  FAILED: 0048"; grep -E 'ERROR' /tmp/repro_0048.log | head -6; fail=1; }
grep -E 'BOT_CREDENTIAL_GUARD_OK' /tmp/repro_0048.log | tail -1 || true

step "the bot credential guard's regression test"
run_pg -f - < "$(dirname "$0")/../scripts/test_bot_credential_guard.sql" > /tmp/repro_bot_guard.log 2>&1 \
  || { echo "  FAILED: the bot credential guard's test"; grep -E 'ERROR' /tmp/repro_bot_guard.log | head -6; fail=1; }
grep -E 'BOT_CREDENTIAL_GUARD_TEST_OK' /tmp/repro_bot_guard.log | tail -1 || true

# 0049 — adds `dishes.content_type`, an EXPLICIT EDITORIAL field with
# a verified backfill, and re-points Pelamushi's family from 'drink' to
# 'dessert'.
#
# It must run BEFORE the API tests: `GET /api/dishes` and
# `GET /api/dishes/:slug` both SELECT `dishes.content_type`, so
# without this column every dish query returns 500:
#
#     ERROR: column "content_type" does not exist
#
# The migration carries its own behavioural proof and FAILS if the
# backfill does not land.
step "the content_type column and its verified backfill"
run_pg -f - < "$(dirname "$0")/../db/migrations/0049_content_type.sql" > /tmp/repro_0049.log 2>&1 \
  || { echo "  FAILED: 0049"; grep -E 'ERROR' /tmp/repro_0049.log | head -6; fail=1; }
grep -E 'CONTENT_TYPE_BACKFILL_OK' /tmp/repro_0049.log | tail -1 || true

step "the atlas fixtures"
run_pg -f - < "$(dirname "$0")/../packages/db/seed-atlas-fixtures.sql" > /tmp/repro_fixtures.log 2>&1 \
  || { echo "  FAILED: the atlas fixtures"; grep -E 'ERROR' /tmp/repro_fixtures.log | head -6; fail=1; }
grep -E 'ATLAS_FIXTURES_OK' /tmp/repro_fixtures.log | tail -1 || true

# 0050 — the association review ledger (Option C). It runs AFTER the
# atlas fixtures, because the pilot samples the association table and
# the fixtures are what create those rows.
step "the association review ledger"
run_pg -f - < "$(dirname "$0")/../db/migrations/0050_association_review_ledger.sql" > /tmp/repro_0050.log 2>&1 \
  || { echo "  FAILED: 0050"; grep -E 'ERROR' /tmp/repro_0050.log | head -6; fail=1; }
grep -E '0050: ok' /tmp/repro_0050.log | tail -1 || true

# 0051 — the family classification. It runs AFTER the seed, because
# its assertions count the families carrying a published dish.
step "the family classification"
run_pg -f - < "$(dirname "$0")/../db/migrations/0051_family_classification.sql" > /tmp/repro_0051.log 2>&1 \
  || { echo "  FAILED: 0051"; grep -E 'ERROR' /tmp/repro_0051.log | head -6; fail=1; }
grep -E '0051: ok' /tmp/repro_0051.log | tail -1 || true

# 0052 — the RECIPES schema (ADR-007 + ADR-007-A1 §8).
#
# It is the recipes property's schema: the five recipe tables, the
# service accounts, the confidence function, the auto-publish function
# and its authorisation token table.
#
# It runs LAST, because it amends `statement_set_status()` -- the
# function 0047 wrote and 0048 amended -- and it widens the
# `statements_subject_type_check` constraint to accept 'recipe'.
#
# It carries its own behavioural proof and FAILS if any of it does not
# hold: the system actor has no credential, a forged token is refused,
# a real HIGH recipe is published, and the migration leaves no content
# rows behind.
step "the recipes schema"
run_pg -f - < "$(dirname "$0")/../db/migrations/0052_recipes_schema.sql" > /tmp/repro_0052.log 2>&1 \
  || { echo "  FAILED: 0052"; grep -E 'ERROR' /tmp/repro_0052.log | head -6; fail=1; }
grep -E 'RECIPES_SCHEMA_OK' /tmp/repro_0052.log | tail -1 || true

# 0053 — the recipes PUBLISHED VIEW (ADR-007-A1 §8.4).
#
# It is the API's read model: a recipe is live because its STATEMENTS
# are published, not because a column says so, so the published-ness is
# a derived view. The view also carries the SCOPE clause -- every
# statement must be about THIS recipe -- so a shared Atlas statement
# can never make a recipe look published.
#
# It runs after 0052, because it reads the tables 0052 creates. It is a
# view plus indexes; it writes no content rows, and its proof runs
# inside its own transaction.
step "the recipes published view"
run_pg -f - < "$(dirname "$0")/../db/migrations/0053_recipes_published_view.sql" > /tmp/repro_0053.log 2>&1 \
  || { echo "  FAILED: 0053"; grep -E 'ERROR' /tmp/repro_0053.log | head -6; fail=1; }
grep -E 'RECIPES_PUBLISHED_VIEW_OK' /tmp/repro_0053.log | tail -1 || true

# 0054 — the INGREDIENT CATEGORY vocabulary, enforced.
#
# The vocabulary is the 435-row `ingredient_categories` table that the
# GUS-242 seed created long ago; this migration adds the foreign key
# that makes `ingredients.category` a value FROM that table rather than
# free text. The database then refuses a category that does not exist,
# so ADR-007-A1 §3.3's "the category is from the existing category
# vocabulary" becomes a lookup rather than a judgement.
#
# It writes no content rows, and its proof runs inside its own
# transaction.
step "the ingredient category vocabulary"
run_pg -f - < "$(dirname "$0")/../db/migrations/0054_ingredient_category_fk.sql" > /tmp/repro_0054.log 2>&1 \
  || { echo "  FAILED: 0054"; grep -E 'ERROR' /tmp/repro_0054.log | head -6; fail=1; }
grep -E 'INGREDIENT_CATEGORY_FK_OK' /tmp/repro_0054.log | tail -1 || true

# 0055 — the SOURCING AVAILABILITY tables and columns (ADR-008).
#
# Three tables (ingredient_availability, ingredient_substitutes,
# recipe_ingredient_substitutes) and four columns
# (recipe_ingredients.is_key / accepted_forms / cost_weight, and
# ingredients.ubiquitous). Strictly additive: every new column has a
# DEFAULT and every new table starts empty. It writes no content rows,
# and its proof runs inside its own transaction.
step "the sourcing availability tables"
run_pg -f - < "$(dirname "$0")/../db/migrations/0055_sourcing_availability.sql" > /tmp/repro_0055.log 2>&1 \
  || { echo "  FAILED: 0055"; grep -E 'ERROR' /tmp/repro_0055.log | head -6; fail=1; }
grep -E 'INGREDIENT_SOURCING_AVAILABILITY_OK' /tmp/repro_0055.log | tail -1 || true

# The PER-DISH backfill assertions. LAST, because they assert the state
# the whole chain produces: the reference dishes' association rows AND
# the journey places in the editorial queue.
#
# 0037 asserts its outcome in AGGREGATE — the counts against the legacy
# tables. That is a good check and it is not enough: both sides are
# computed from the same legacy tables, so a mapping that is wrong in the
# same way on both sides passes.
#
# This asserts the EXACT association rows the four reference dishes must
# have — the relationship type, the entity kind, the entity and the
# provenance — and the count-snapshot guard with NON-ZERO baselines. A
# backfill that produced nothing would fail it.
step "the atlas backfill assertions"
run_pg -v ON_ERROR_STOP=1 -f - < "$(dirname "$0")/test_atlas_backfill.sql" > /tmp/repro_atlas_backfill_assertions.log 2>&1 \
  || { echo "  FAILED: the atlas backfill assertions"; grep -E 'FAIL|ERROR' /tmp/repro_atlas_backfill_assertions.log | head -12; fail=1; }
grep -E 'ATLAS_BACKFILL_ASSERTIONS|ATLAS_COUNT_GUARD' /tmp/repro_atlas_backfill_assertions.log | tail -2 || true

echo ""
if [ $fail -eq 0 ]; then
  echo "CI_DB_REPRO_OK=1"
else
  echo "CI_DB_REPRO_OK=0"
fi
exit $fail
