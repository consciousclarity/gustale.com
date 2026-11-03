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
ATLAS_TRIGGER_ESCALATION_TEST=scripts/test_atlas_trigger_escalation.sql
MARK_DISPOSABLE=scripts/mark_disposable_db.sql
CI_MIGRATION_ROLE=scripts/ci-migration-role.sql

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

# 0040 is the PUBLICATION PREDICATE (ADR-004 D8.2).
#
# D8.2 says: "a single SQL function is the only thing that decides what
# the public may see", and it names
# published_claims_for_dish(p_dish_id uuid). That function DID NOT
# EXIST — the route wrote the filter out by hand, three times. This
# migration creates the three predicates and the route uses them, so a
# claim cannot be public on one surface and draft on another.
#
# It WRITES NO ROWS. The FIXTURES are a separate SEED (below), because
# the brief's §13 says fixtures never enter the live database, and a
# migration IS what the live chain runs.
MIGRATION_0040=db/migrations/0040_atlas_publication_predicate.sql

# The FIXTURES — a SEED, not a migration.
#
# The brief's §12: the model is "demonstrated with isolated fixtures".
# The brief's §13: "Fixtures never enter the live database or the
# production content pipeline."
#
# So this is a SEED and it lives OUTSIDE db/migrations/, which is what
# keeps the live migration chain from ever running it. It is applied by
# CI, by the Nightly and by the local reproduction — the three places
# that need a populated atlas — and by nothing else.
#
# (Alejandro's decision, 2026-10-31.)
ATLAS_FIXTURE_SEED=packages/db/seed-atlas-fixtures.sql

# 0041 is the ROLE SEPARATION for the publish credential.
#
# 0038's guard checked that the credential's ACCOUNT is real. It did not
# check WHO wrote the row — and the bot's role (gustale) could insert a
# valid credential for a real account, which IS a publish credential.
#
# 0041 takes the WRITE privilege away from the bot's role and gives it
# to a NOLOGIN issuer role that is granted to no login role. It also
# strengthens the trigger, so the check is on the WRITER and not only
# on the privilege.
MIGRATION_0042=db/migrations/0042_credential_trigger_revocation.sql
MIGRATION_0043=db/migrations/0043_taxonomy_canonicalisation.sql
MIGRATION_0044=db/migrations/0044_not_a_dish_queue.sql
MIGRATION_0045=db/migrations/0045_credential_guard_comment.sql
MIGRATION_0041=db/migrations/0041_credential_role_separation.sql

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
    # AS `postgres` — THE ADMIN — EXACTLY AS LIVE DOES.
    #
    # On live the migrations run as `postgres`, which owns the tables.
    # The chain does the same here, so the CI's schema arrangement is
    # the one live has.
    #
    # The chain must NOT run as the bot. The bot's role is an ordinary
    # role now — on live and in CI — and it does not own the tables the
    # atlas migrations ALTER. A chain that ran as the bot would fail
    # with "must be owner of table", which is the correct behaviour: it
    # is the proof that the bot is not an admin.
    PGPASSWORD="${PGPASSWORD:-gustale}" "$PSQL_BIN" -h "$PG_HOST" -U postgres -d "$DB" -v ON_ERROR_STOP=1 "$@"
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
  # AS `postgres`, THE SUPERUSER.
  #
  # The bot's role `gustale` is an ORDINARY role now, and it may not be
  # the owner of the database it is about to use. The service's
  # superuser is `postgres` — that is the arrangement live has.
  PGPASSWORD="${PGPASSWORD:-gustale}" "$PSQL_BIN" -h "$PG_HOST" -U postgres -d postgres \
    -v ON_ERROR_STOP=1 -c "DROP DATABASE IF EXISTS $DB;" -c "CREATE DATABASE $DB;" >/dev/null

else
  echo "=== creating $DB (container mode: shared-postgres) ==="
  docker exec -u postgres shared-postgres psql -U postgres -d postgres \
    -c "DROP DATABASE IF EXISTS $DB;" -c "CREATE DATABASE $DB;" >/dev/null
fi

# THE ROLE SETUP, IN THE CHAIN ITSELF — IN BOTH MODES.
#
# This step creates the cluster's roles: the migration role, the bot's
# ordinary role, and the issuer role. They are cluster-wide, so they
# persist across the chain's throwaway databases.
#
# It lives HERE, in the chain, rather than in a workflow, because the
# chain is what several different callers use — the CI workflow, the
# Nightly workflow, the devcontainer and the local reproduction — and
# only the CI workflow ran the role setup. The Nightly worked without it
# precisely because its bot was a superuser, and that is the
# arrangement being removed.
#
# It runs in BOTH modes, because the grants it sets are what give the
# bot its rights on the tables the chain is about to create. In CI mode
# the chain connects as the superuser `postgres`; in container mode it
# does the same, through `docker exec`.
#
# Doing it in the chain means every caller gets the same roles and the
# same grants by construction, and none of them can drift.
echo "--- the role setup"
if [ "${CHAIN_MODE:-}" = "ci" ]; then
  PGPASSWORD="${PGPASSWORD:-gustale}" "$PSQL_BIN" -h "$PG_HOST" -U postgres -d "$DB" \
    -v ON_ERROR_STOP=1 -f "$CI_MIGRATION_ROLE" >/tmp/ci_role_setup.log 2>&1 \
    || { echo "FAILED: the role setup"; grep -E 'ERROR|NOTICE' /tmp/ci_role_setup.log | tail -12; exit 1; }
else
  # STDIN, NOT -f.
  #
  # `docker exec -f` reads the file from inside the container, and the
  # chain's migration files live on the HOST. Every other migration in
  # this script is piped in with `-f -` for exactly that reason.
  docker exec -u postgres -i shared-postgres psql -U postgres -d "$DB" -v ON_ERROR_STOP=1 \
    -f - < "$CI_MIGRATION_ROLE" >/tmp/ci_role_setup.log 2>&1 \
    || { echo "FAILED: the role setup"; grep -E 'ERROR|NOTICE' /tmp/ci_role_setup.log | tail -12; exit 1; }
fi
grep -E 'CI_MIGRATION_ROLE_OK' /tmp/ci_role_setup.log | tail -1 || true

fail=0

# THE EXTENSIONS.
#
# The base schema needs `uuid-ossp` and `postgis`, and so does the GUS
# chain (the geo tables are PostGIS). The script creates the DATABASE
# above but never created the EXTENSIONS — in CI the workflow did it,
# and in container mode nothing did, so the first migration failed on a
# missing function.
#
# The script owns the database it creates, so it must own the
# extensions too. CREATE EXTENSION IF NOT EXISTS is idempotent, so this
# is safe whether or not they are already there.
echo "--- the extensions"
run_pg -c 'CREATE EXTENSION IF NOT EXISTS postgis;' >/dev/null 2>&1 \
  || { echo "FAILED: postgis extension"; fail=1; }
run_pg -c 'CREATE EXTENSION IF NOT EXISTS "uuid-ossp";' >/dev/null 2>&1 \
  || { echo "FAILED: uuid-ossp extension"; fail=1; }
[ $fail -eq 0 ] || exit 1

for f in "${DRIZZLE_FILES[@]}"; do
  echo "--- drizzle: $f"
  out=$(run_pg -f - < "$f" 2>&1) || { echo "FAILED: $f"; echo "$out" | grep -E 'ERROR' | tail -5; fail=1; break; }
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


# The database is a DISPOSABLE copy, and it says so.
#
# The atlas constraint tests refuse to run against a database that is
# not marked disposable (scripts/mark_disposable_db.sql). The default is
# deny: an unmarked database is refused, whatever its name.
#
# The mark is applied HERE, immediately after this script creates the
# database, and never to production.
echo "--- mark the database as disposable"
run_pg -f - < scripts/mark_disposable_db.sql >/dev/null 2>&1 \
  || { echo "FAILED: the disposable marker"; fail=1; }
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
#
# IT USED TO SIT AT THE TOP OF THIS FILE — before `run_pg` was defined
# and before the database was created — where it could not run at all.
# Bash treats an undefined command as a failure, so every run printed
# "FAILED: seed-atlas-references" and then exited before creating the
# database or applying a single migration. The chain was broken, and
# the failure looked like a data problem rather than a misplaced block.
echo "--- seed: the atlas reference dishes"
run_pg -f - < packages/db/seed-atlas-references.sql >/tmp/atlas_refs.log 2>&1 \
  || { echo "FAILED: seed-atlas-references"; tail -12 /tmp/atlas_refs.log; fail=1; }
[ $fail -eq 0 ] || exit 1
grep -E 'NOTICE|INSERT' /tmp/atlas_refs.log | head -4 || true

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

# 0040 — the publication predicate. It writes NO rows.
echo "--- the publication predicate"
run_pg -f - < "$MIGRATION_0040" >/tmp/m0040.log 2>&1 || { echo "FAILED: 0040"; grep -E 'ERROR|NOTICE' /tmp/m0040.log | tail -12; fail=1; }
[ $fail -eq 0 ] || exit 1
grep -E 'ATLAS_PUBLICATION_PREDICATE_OK' /tmp/m0040.log | tail -1 || true

# 0041 — the role separation for the publish credential.
#
# It comes FIRST, because it creates the roles the later ones need:
# 0042 revokes privileges from the bot's role on a table 0041 hands to
# the issuer role, and 0045 rewrites the guard function 0041 installs.
echo "--- the credential role separation"
run_pg -f - < "$MIGRATION_0041" >/tmp/m0041.log 2>&1 || { echo "FAILED: 0041"; grep -E 'ERROR|NOTICE' /tmp/m0041.log | tail -12; fail=1; }
[ $fail -eq 0 ] || exit 1
grep -E 'ATLAS_CREDENTIAL_SEPARATION_OK' /tmp/m0041.log | tail -1 || true

# 0042 — revokes the TRIGGER escalation on publish_credential.
echo "--- the credential trigger revocation"
run_pg -f - < "$MIGRATION_0042" >/tmp/m0042.log 2>&1 || { echo "FAILED: 0042"; grep -E 'ERROR|NOTICE' /tmp/m0042.log | tail -12; fail=1; }
[ $fail -eq 0 ] || exit 1
grep -E 'NOTICE' /tmp/m0042.log | head -4 || true

# The D10 ESCALATION CHECK — a separate step, run after 0042.
#
# It cannot live in the main constraint suite, because it asserts a
# GRANT state that only 0041 and 0042 establish: the bot holds SELECT on
# publish_credential (0041 grants it) and holds neither TRIGGER nor
# REFERENCES (0042 revokes them). The main suite runs before and after
# 0038 — before either of those.
#
# So the escalation check is its own file, its own step, and its own
# report line. It is the step that proves the bot cannot plant a trigger
# on the credential table.
echo "--- the credential escalation check"
# The disposable marker, first. The escalation test refuses to run
# against a database nobody marked for it — and the chain's database is
# created by the chain itself, so the chain marks it.
run_pg -f - < "$MARK_DISPOSABLE" >/tmp/mark_disposable.log 2>&1 \
  || { echo "FAILED: the disposable marker"; grep -E 'ERROR' /tmp/mark_disposable.log | head -6; fail=1; }
run_pg -v ON_ERROR_STOP=1 -f - < "$ATLAS_TRIGGER_ESCALATION_TEST" >/tmp/atlas_escalation.log 2>&1 \
  || { echo "FAILED: the credential escalation check"; grep -E 'FAIL|ERROR' /tmp/atlas_escalation.log | head -12; fail=1; }
[ $fail -eq 0 ] || exit 1
grep -E 'ATLAS_TRIGGER_ESCALATION' /tmp/atlas_escalation.log | tail -1 || true

# 0043 — the taxonomy canonicalisation.
echo "--- the taxonomy canonicalisation"
run_pg -f - < "$MIGRATION_0043" >/tmp/m0043.log 2>&1 || { echo "FAILED: 0043"; grep -E 'ERROR|NOTICE' /tmp/m0043.log | tail -12; fail=1; }
[ $fail -eq 0 ] || exit 1
grep -E 'NOTICE' /tmp/m0043.log | head -8 || true

# 0044 — the not-a-dish queue item.
echo "--- the not-a-dish queue item"
run_pg -f - < "$MIGRATION_0044" >/tmp/m0044.log 2>&1 || { echo "FAILED: 0044"; grep -E 'ERROR|NOTICE' /tmp/m0044.log | tail -12; fail=1; }
[ $fail -eq 0 ] || exit 1
grep -E 'NOTICE' /tmp/m0044.log | head -6 || true

# 0045 — corrects the guard function's comment.
echo "--- the credential guard comment"
run_pg -f - < "$MIGRATION_0045" >/tmp/m0045.log 2>&1 || { echo "FAILED: 0045"; grep -E 'ERROR|NOTICE' /tmp/m0045.log | tail -12; fail=1; }
[ $fail -eq 0 ] || exit 1
grep -E 'NOTICE' /tmp/m0045.log | head -8 || true

# The FIXTURES — a seed, and NOT part of the migration chain.
echo "--- the atlas fixtures (seed, never a migration)"
run_pg -f - < "$ATLAS_FIXTURE_SEED" >/tmp/atlas_fixtures.log 2>&1 || { echo "FAILED: the atlas fixtures"; grep -E 'ERROR|NOTICE' /tmp/atlas_fixtures.log | tail -12; fail=1; }
[ $fail -eq 0 ] || exit 1
grep -E 'ATLAS_FIXTURES_OK' /tmp/atlas_fixtures.log | tail -1 || true

# The constraint tests a THIRD time — against the FINAL schema.
#
# The first two runs (before 0038 and after 0038) test the schema at
# those two points. This one tests the schema a DEPLOYMENT ENDS UP WITH:
# every migration applied, including 0047 (the session binding) and 0048
# (the bot credential guard), plus the fixtures seed.
#
# WHY IT IS NEEDED — TWO REASONS, BOTH REAL
#
# 1. The D9 publish-credential cases are SESSION-BOUND. They present a
#    Better Auth session token, and only 0047's `statement_set_status`
#    accepts a session token — the pre-0047 function compares its third
#    argument against `publish_credential.actor` directly, so a session
#    token is compared as though it were an account id and the transition
#    is refused. The second suite run is BEFORE 0047, so on that database
#    the D9 credential cases CANNOT pass.
#
# 2. The fixtures seed creates statements with status 'published', and a
#    published statement makes the D8 case a NO-OP: the gate trigger
#    returns early when the status does not change, so "UPDATE status to
#    'published'" on an already-published statement is not a transition
#    and is (correctly) accepted. The suite's fixture selection now
#    avoids published statements, but the third run is what PROVES that
#    on the state a deployment really has.
#
# So the third run is the one that tests the final schema. Without it,
# the chain proves that the migrations APPLY and nothing more.
run_pg -v ON_ERROR_STOP=1 -f - < "$ATLAS_CONSTRAINT_TESTS" >/tmp/atlas_constraints3.log 2>&1 \
  || { echo "FAILED: the atlas constraint tests (against the final schema)"; grep -E 'FAIL|ERROR' /tmp/atlas_constraints3.log | head -12; fail=1; }
[ $fail -eq 0 ] || exit 1
grep -E 'ATLAS_SCHEMA_TESTS' /tmp/atlas_constraints3.log | tail -1 || true

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
