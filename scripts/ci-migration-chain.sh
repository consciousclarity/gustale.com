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

# THE LIVE DATABASE IS NOT A CHAIN TARGET.
#
# This script DROPs the database it is given and recreates it:
#
#     DROP DATABASE IF EXISTS $DB; CREATE DATABASE $DB;
#
# So `bash scripts/ci-migration-chain.sh gustale` would DROP THE LIVE
# DATABASE AND RECREATE IT EMPTY. That is the single most destructive
# command in the repository, and it used to be one typo away.
#
# The default (gustale_cichain_test) is a disposable database, and the
# chain is meant to run against throwaway databases. Live is only
# reachable with the explicit per-invocation opt-in, and even then the
# chain's own DROP makes it a terrible idea -- use
# scripts/apply-migration-live.sh, which goes through the live-approval
# gate.
#
# The guard refuses the live NAME (`gustale`) outright, with no
# environment-variable escape. That was not always so: the CI's service
# container used to be named `gustale` too, so the guard had to ask
# WHICH SERVER it was talking to -- and a stale GUSTALE_DB_IS_THROWAWAY=1
# in a production shell let it hand out the live name, which this
# script then DROPPED on 2026-11-06.
#
# The CI's database is now named `gustale_ci`, so the live NAME is
# unique on every host and can be refused by name alone.
# The Python that runs the guard. Resolved before the guard is called,
# because the guard decides whether this script may touch the database
# it is about to DROP.
PYTHON_BIN="${PYTHON_BIN:-python3}"
command -v "$PYTHON_BIN" >/dev/null 2>&1 || {
  echo "::error::no python3 on PATH; cannot vet the chain's target database."
  exit 1
}

GUSTALE_CHAIN_DB="$("$PYTHON_BIN" scripts/lib/db_guard.py ci-migration-chain.sh "$DB")" || {
  echo "::error::the migration chain refuses to target the live database."
  echo "::error::It DROPs and recreates its target, so live must never be one."
  echo "::error::Use a throwaway database, or scripts/apply-migration-live.sh."
  exit 1
}
DB="$GUSTALE_CHAIN_DB"

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
MIGRATION_0046=db/migrations/0046_source_candidates.sql
MIGRATION_0047=db/migrations/0047_publish_credential_session_binding.sql
# 0048 refuses a publish credential for a BOT account. It is a
# function and a trigger; it writes NO content rows.
MIGRATION_0048=db/migrations/0048_bot_credential_guard.sql
# 0050 is the association review ledger (Option C): the ledger table,
# the association <-> source link table, the entity-integrity trigger
# and the 50-row pilot. It writes no published rows.
MIGRATION_0050=db/migrations/0050_association_review_ledger.sql
# 0051 is the family CLASSIFICATION: the class becomes a column on
# dish_families. It writes no content rows.
MIGRATION_0051=db/migrations/0051_family_classification.sql
# 0052 is the RECIPES schema (item 2 of the recipes task): the five
# recipes tables, the system actors, the kill switch, the confidence
# computation and the auto-publish function. It writes NO content rows.
MIGRATION_0052=db/migrations/0052_recipes_schema.sql
# 0053 is the recipes PUBLISHED view (item 4 of the recipes task): the
# API's read model. A recipe is live because its STATEMENTS are
# published, not because a column says so, so the published-ness is a
# DERIVED VIEW. It writes NO content rows.
MIGRATION_0053=db/migrations/0053_recipes_published_view.sql
# 0054 is the INGREDIENT CATEGORY vocabulary, enforced: the foreign key
# from `ingredients.category` to `ingredient_categories.slug`. The
# vocabulary itself is the 435-row table that the GUS-242 seed created
# long ago; this migration only makes the database refuse a category
# that is not in it. It writes NO content rows.
MIGRATION_0054=db/migrations/0054_ingredient_category_fk.sql
# 0055 is the SOURCING AVAILABILITY tables and columns (ADR-008,
# GUS-1102): ingredient_availability, ingredient_substitutes,
# recipe_ingredient_substitutes, plus recipe_ingredients.is_key /
# accepted_forms / cost_weight and ingredients.ubiquitous. It is
# strictly ADDITIVE -- every new column has a DEFAULT, every new table
# starts empty -- and it writes NO content rows. It comes after 0052
# (the recipes schema), because recipe_ingredient_substitutes
# references recipe_ingredients.
MIGRATION_0055=db/migrations/0055_sourcing_availability.sql

# 0056 is the INGREDIENT ALIASES table (migration 0056). It is the
# mechanism behind the béchamel merge: a retired slug that must keep
# resolving because it has a live public URL.
MIGRATION_0056=db/migrations/0056_ingredient_aliases.sql
MIGRATION_0041=db/migrations/0041_credential_role_separation.sql
# 0049 adds `dishes.content_type` -- an EXPLICIT EDITORIAL field, with
# no sync trigger (Alejandro's decision), and a verified backfill of the
# nine drinks. It writes CONTENT rows (it backfills a column), so it
# runs in the chain and not in the fixture seed.
MIGRATION_0049=db/migrations/0049_content_type.sql

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
  # The port is configurable for the same reason the host is: PostgreSQL
  # is not always on 5432. The default is unchanged, so the runner's
  # arrangement — the service published on 5432 — is what runs.
  PG_PORT="${PG_PORT:-5432}"
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
    PGPASSWORD="${PGPASSWORD:-gustale}" "$PSQL_BIN" -h "$PG_HOST" -p "$PG_PORT" -U postgres -d "$DB" -v ON_ERROR_STOP=1 "$@"
  else
    # The DEDICATED TEST POSTGRES, never `shared-postgres`.
    # `DROP DATABASE` is cluster-scoped, and the production cluster
    # hosts the live database and five other projects' databases.
    test_pg_run "$DB" "$@"
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
# The DEDICATED TEST POSTGRES. Sourced here so both modes can use it:
# the CI mode does NOT need it (it has a service container), but the
# container mode does, and the container mode's container is NEVER
# `shared-postgres`.
# shellcheck source=scripts/lib/test_pg.sh
source scripts/lib/test_pg.sh

if [ "${CHAIN_MODE:-}" = "ci" ]; then
  echo "=== creating $DB (CI mode: Postgres service on 127.0.0.1) ==="
  # AS `postgres`, THE SUPERUSER.
  #
  # The bot's role `gustale` is an ORDINARY role now, and it may not be
  # the owner of the database it is about to use. The service's
  # superuser is `postgres` — that is the arrangement live has.
  PGPASSWORD="${PGPASSWORD:-gustale}" "$PSQL_BIN" -h "$PG_HOST" -p "$PG_PORT" -U postgres -d postgres \
    -v ON_ERROR_STOP=1 -c "DROP DATABASE IF EXISTS $DB;" -c "CREATE DATABASE $DB;" >/dev/null

else
  # THE PRODUCTION CONTAINER IS NOT A TEST TARGET.
  #
  # `DROP DATABASE` and `CREATE DATABASE` are CLUSTER-SCOPED, and
  # `shared-postgres` hosts the LIVE database and five other projects'
  # databases. On 2026-11-06 a `DROP DATABASE` aimed at this cluster
  # destroyed the live database.
  #
  # So the chain's local mode uses the DEDICATED TEST POSTGRES
  # (scripts/lib/test_pg.sh) on its own port. Production is not an
  # option here, and there is no environment variable that can make it
  # one.
  echo "=== creating $DB (container mode: the dedicated test Postgres) ==="
  test_pg_up
  test_pg_create "$DB"
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
  # STDIN, NOT -f <path>.
  #
  # `psql -f <path>` reads the file relative to psql's OWN working
  # directory, which is not necessarily the shell's. On the runner it
  # is the same, so it works there — but it is the only step in this
  # script that reads a file by path, and it is the one step that
  # breaks when psql's cwd is not the repo root (a containerised psql,
  # for instance, where the file is on the host and not in the
  # container).
  #
  # Every other step here pipes the file in with `-f -`. This one now
  # does the same, so the whole script behaves identically no matter
  # where psql runs.
  PGPASSWORD="${PGPASSWORD:-gustale}" "$PSQL_BIN" -h "$PG_HOST" -p "$PG_PORT" -U postgres -d "$DB" \
    -v ON_ERROR_STOP=1 -f - < "$CI_MIGRATION_ROLE" >/tmp/ci_role_setup.log 2>&1 \
    || { echo "FAILED: the role setup"; grep -E 'ERROR|NOTICE' /tmp/ci_role_setup.log | tail -12; exit 1; }
else
  # STDIN, NOT -f.
  #
  # `docker exec -f` reads the file from inside the container, and the
  # chain's migration files live on the HOST. Every other migration in
  # this script is piped in with `-f -` for exactly that reason.
  test_pg_run "$DB" -f - \
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

# ── 0046: the candidate-source table (GUS-1010) ─────────────────────
#
# The table that holds CANDIDATE sources, awaiting review. It is NOT
# `sources` and NOT `claim_citations`, and nothing in it is ever
# verified.
run_pg -f - < "$MIGRATION_0046" >/tmp/m0046.log 2>&1 || { echo "FAILED: 0046"; grep -E 'ERROR|NOTICE' /tmp/m0046.log | tail -12; fail=1; }
[ $fail -eq 0 ] || exit 1
grep -E 'NOTICE' /tmp/m0046.log | head -8 || true

# ── 0047: the publish credential is bound to the session ────────────
#
# The publisher is derived from the Better Auth session, never supplied
# by the caller. The migration carries its own behavioural proof and
# FAILS if the caller-supplied actor is still accepted.
run_pg -f - < "$MIGRATION_0047" >/tmp/m0047.log 2>&1 || { echo "FAILED: 0047"; grep -E 'ERROR|NOTICE' /tmp/m0047.log | tail -12; fail=1; }
[ $fail -eq 0 ] || exit 1
grep -E 'NOTICE' /tmp/m0047.log | head -8 || true

# ── 0048: the bot credential guard ─────────────────────────────────
#
# It comes AFTER 0047, because 0047 REPLACES the guard function and
# 0048 amends the replacement. Run 0048 first and 0047 would undo it.
#
# It writes NO content rows -- only a function and a trigger.
echo "--- the bot credential guard"
run_pg -f - < "$MIGRATION_0048" >/tmp/m0048.log 2>&1 || { echo "FAILED: 0048"; grep -E 'ERROR|NOTICE' /tmp/m0048.log | tail -12; fail=1; }
[ $fail -eq 0 ] || exit 1
grep -E 'BOT_CREDENTIAL_GUARD_OK' /tmp/m0048.log | tail -1 || true

# The bot guard's REGRESSION TEST. It proves the bot's credential is
# REFUSED and a human's is ALLOWED -- and it FAILS when the guard is
# absent.
echo "--- the bot credential guard's regression test"
run_pg -f - < "$(dirname "$0")/test_bot_credential_guard.sql" >/tmp/bot_guard_test.log 2>&1 || { echo "FAILED: the bot credential guard's test"; grep -E 'ERROR|NOTICE' /tmp/bot_guard_test.log | tail -12; fail=1; }
[ $fail -eq 0 ] || exit 1
grep -E 'BOT_CREDENTIAL_GUARD_TEST_OK' /tmp/bot_guard_test.log | tail -1 || true
[ $fail -eq 0 ] || exit 1
grep -E 'NOTICE' /tmp/m0047.log | head -8 || true

# ── 0049: the content_type column and its verified backfill ───────────
#
# It comes LAST, because it reads `dish_dish_families` and
# `dish_families` -- the taxonomy the earlier migrations establish --
# and because it backfills a column on `dishes`, which the atlas
# fixtures seed also touches.
#
# It carries its own behavioural proof and FAILS if the backfill is not
# exactly the nine verified drinks.
echo "--- the content_type column and its verified drink backfill"
run_pg -f - < "$MIGRATION_0049" >/tmp/m0049.log 2>&1 || { echo "FAILED: 0049"; grep -E 'ERROR|NOTICE' /tmp/m0049.log | tail -12; fail=1; }
[ $fail -eq 0 ] || exit 1
grep -E 'CONTENT_TYPE_BACKFILL_OK' /tmp/m0049.log | tail -1 || true

# The FIXTURES — a seed, and NOT part of the migration chain.
echo "--- the atlas fixtures (seed, never a migration)"
run_pg -f - < "$ATLAS_FIXTURE_SEED" >/tmp/atlas_fixtures.log 2>&1 || { echo "FAILED: the atlas fixtures"; grep -E 'ERROR|NOTICE' /tmp/atlas_fixtures.log | tail -12; fail=1; }
[ $fail -eq 0 ] || exit 1
grep -E 'ATLAS_FIXTURES_OK' /tmp/atlas_fixtures.log | tail -1 || true

# ── 0050: the association review ledger (Option C) ─────────────────
#
# It comes AFTER the seed, because the pilot samples the association
# table and the seed is what creates the fixture associations. Run it
# before the seed and the pilot would have nothing to sample.
#
# It writes no published rows and re-points nothing.
echo "--- the association review ledger"
run_pg -f - < "$MIGRATION_0050" >/tmp/m0050.log 2>&1 || { echo "FAILED: 0050"; grep -E 'ERROR|NOTICE' /tmp/m0050.log | tail -12; fail=1; }
[ $fail -eq 0 ] || exit 1
grep -E '0050: ok' /tmp/m0050.log | tail -1 || true

# ── 0051: the family classification ────────────────────────────────
#
# It comes AFTER the seed, because its assertions count the families
# that carry a published dish, and the seed is what creates the
# fixture dishes and their family links.
echo "--- the family classification"
run_pg -f - < "$MIGRATION_0051" >/tmp/m0051.log 2>&1 || { echo "FAILED: 0051"; grep -E 'ERROR|NOTICE' /tmp/m0051.log | tail -12; fail=1; }
[ $fail -eq 0 ] || exit 1
grep -E '0051: ok' /tmp/m0051.log | tail -1 || true

# ── 0052: the recipes schema (item 2) ─────────────────────────────
#
# It comes AFTER 0051, because it amends the `statements` subject-type
# CHECK and the 0048 credential guard -- both of which must be in their
# FINAL shape before 0052 widens them. And it comes after the seed,
# because its proof asserts against a real statement and a real dish.
#
# It writes NO content rows: no recipe, no ingredient, no statement.
# The kill switch it creates ships `disabled`, so the auto-publish path
# is dormant on arrival.
echo "--- the recipes schema"
run_pg -f - < "$MIGRATION_0052" >/tmp/m0052.log 2>&1 || { echo "FAILED: 0052"; grep -E 'ERROR|NOTICE' /tmp/m0052.log | tail -12; fail=1; }
[ $fail -eq 0 ] || exit 1
grep -E 'RECIPES_SCHEMA_OK' /tmp/m0052.log | tail -1 || true

# ── 0053: the recipes published view (item 4) ──────────────────────
#
# It comes AFTER 0052, because it reads the tables 0052 creates -- the
# recipes, their sentences, their claims, the statements and the
# confidence. It is a VIEW plus the indexes the API's three queries
# need; it writes NO content rows.
#
# Its proof runs inside its own transaction, so a failed proof rolls it
# back and leaves no trace.
echo "--- the recipes published view"
run_pg -f - < "$MIGRATION_0053" >/tmp/m0053.log 2>&1 || { echo "FAILED: 0053"; grep -E 'ERROR|NOTICE' /tmp/m0053.log | tail -12; fail=1; }
[ $fail -eq 0 ] || exit 1
grep -E 'RECIPES_PUBLISHED_VIEW_OK' /tmp/m0053.log | tail -1 || true

# ── 0054: the ingredient category vocabulary, enforced ──────────────
#
# It comes AFTER 0020 (the GUS-242 vocabulary seed) and after
# gus-014-118-dimensions.sql (the 55 project rows), because the
# foreign key points at the table they create. Both are applied long
# before this point in the chain.
#
# It adds ONE foreign key -- `ingredients.category` ->
# `ingredient_categories.slug` -- so the database refuses a category
# that is not in the 435-row vocabulary. It writes NO content rows.
#
# Its proof runs inside its own transaction, so a failed proof rolls it
# back and leaves no trace.
echo "--- the ingredient category vocabulary"
run_pg -f - < "$MIGRATION_0054" >/tmp/m0054.log 2>&1 || { echo "FAILED: 0054"; grep -E 'ERROR|NOTICE' /tmp/m0054.log | tail -12; fail=1; }
[ $fail -eq 0 ] || exit 1
grep -E 'INGREDIENT_CATEGORY_FK_OK' /tmp/m0054.log | tail -1 || true

# ── 0055: the sourcing availability tables and columns ──────────────
#
# ADR-008's data model. Three tables, four columns, all additive.
# The proof runs inside the migration's own transaction, so a failed
# proof rolls it back and leaves no trace.
echo "--- the sourcing availability tables"
run_pg -f - < "$MIGRATION_0055" >/tmp/m0055.log 2>&1 || { echo "FAILED: 0055"; grep -E 'ERROR|NOTICE' /tmp/m0055.log | tail -12; fail=1; }

# ── 0056: the ingredient aliases table ──────────────────────────────
run_pg -f - < "$MIGRATION_0056" >/tmp/m0056.log 2>&1 || { echo "FAILED: 0056"; grep -E 'ERROR|NOTICE' /tmp/m0056.log | tail -12; fail=1; }
[ $fail -eq 0 ] || exit 1
grep -E 'INGREDIENT_SOURCING_AVAILABILITY_OK' /tmp/m0055.log | tail -1 || true
grep -E 'INGREDIENT_ALIASES_OK' /tmp/m0056.log | tail -1 || true

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
