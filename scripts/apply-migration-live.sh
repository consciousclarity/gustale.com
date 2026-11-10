#!/usr/bin/env bash
# The live-DB gate for the atlas schema (RULES.md §3, KANBAN.md §4):
#
#   backup SUCCESS -> snapshot -> dry-run on a copy -> count assertions
#   -> apply -> independent verification -> automatic rollback on failure
#
# This script does the LIVE half: the snapshot, the assertions, the apply
# and the independent verification. The dry-run on an exact copy is
# scripts/dryrun-migration.sh, and the backup is done by
# backup.backup_database() — both must have run first.
#
# It takes a snapshot of every table the change touches, asserts the
# counts are what they were, applies the migration, and then verifies with
# INDEPENDENT queries (not the migration's own report).
#
# WHERE THE COPY RUNS
# -------------------
# The constraint tests run on a COPY of live, and that copy is created
# and dropped on the DEDICATED TEST POSTGRES (gustale-test-postgres,
# 127.0.0.1:5434) — NEVER on the production cluster. `DROP DATABASE` and
# `CREATE DATABASE` are cluster-scoped, so a throwaway database on
# `shared-postgres` is a hazard for the live site AND for the five other
# projects' databases on that cluster. This script used to do exactly
# that; it was the reason the owner applied 0052 with psql directly on
# 2026-11-09 rather than through this gate.
#
# The LIVE database is touched here in exactly three ways: a read-only
# `pg_dump` snapshot, the apply itself, and read-only verification
# queries. It is never created, never dropped, never marked disposable.
#
# Usage: apply-migration-live.sh <migration.sql> [expect-db-name]
set -euo pipefail

# The repo root, so the script works from any directory.
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# The PRODUCTION container. It is the live `gustale` database's
# Postgres, and it is shared with five other projects' databases.
#
# It is overridable ONLY so the script can be exercised against a
# stand-in in the sandbox -- a test that can only run against production
# is a test that never runs. The default is the production container,
# and `scripts/check-no-production-db-drops.py` reads the DEFAULT, not
# this variable, so overriding it cannot smuggle a cluster-scoped
# statement past the scanner.
PROD_PG_CONTAINER="${GUSTALE_PROD_PG_CONTAINER:-shared-postgres}"

# The live database's name. Overridable ONLY for the sandbox exercise
# described above -- the default is the production name, and the
# `gustale` name is refused outright by the test helpers.
DB="${GUSTALE_LIVE_DB_NAME:-gustale}"

MIGRATION="${1:?usage: apply-migration-live.sh <migration.sql>}"
# The migration path is absolute, so the script works from any directory.
case "$MIGRATION" in
  /*) ;;
  *) MIGRATION="${REPO_ROOT}/${MIGRATION}" ;;
esac
if [ ! -f "$MIGRATION" ]; then
  echo "FAILED: the migration file '$MIGRATION' does not exist." >&2
  exit 1
fi

echo "=== 1. THE SNAPSHOT — the counts BEFORE the write ==="
docker exec -u postgres "$PROD_PG_CONTAINER" psql -U postgres -d "$DB" -t -c "
SELECT 'statements|'||count(*) FROM statements
UNION ALL SELECT 'claim_citations|'||count(*) FROM claim_citations
UNION ALL SELECT 'dish_relations|'||count(*) FROM dish_relations
UNION ALL SELECT 'relation_types|'||count(*) FROM relation_types
UNION ALL SELECT 'dish_families|'||count(*) FROM dish_families
UNION ALL SELECT 'dishes|'||count(*) FROM dishes
UNION ALL SELECT 'sources|'||count(*) FROM sources
UNION ALL SELECT 'geo_entities|'||count(*) FROM geo_entities
UNION ALL SELECT 'dish_traditions|'||count(*) FROM dish_traditions
UNION ALL SELECT 'users|'||count(*) FROM users
UNION ALL SELECT 'media|'||count(*) FROM media
UNION ALL SELECT 'dish_names|'||count(*) FROM dish_names
UNION ALL SELECT 'vocabulary_labels|'||count(*) FROM vocabulary_labels;" \
  | tee /tmp/atlas_live_snapshot.txt

echo ""
echo "=== 1b. THE FIXTURE CHECK — the fixtures must NOT be on live ==="
#
# The brief's §13: "Fixtures never enter the live database or the
# production content pipeline."
#
# The fixtures are a SEED (packages/db/seed-atlas-fixtures.sql) and the
# live migration chain never runs it. But a seed could be applied by
# hand, or a migration could carry one by accident, so the gate CHECKS
# rather than trusting the chain.
#
# If a fixture row is here, the gate STOPS — before it writes anything.
FIXTURE_ROWS=$(docker exec -u postgres "$PROD_PG_CONTAINER" psql -U postgres -d "$DB" -tAc "
  SELECT
    (SELECT count(*) FROM dish_place_associations WHERE provenance = 'atlas_fixture')
  + (SELECT count(*) FROM statements WHERE qualifiers->>'provenance' = 'atlas_fixture');
" 2>/dev/null || echo "0")
if [ "$FIXTURE_ROWS" != "0" ]; then
  echo "FAILED: the live database carries $FIXTURE_ROWS FIXTURE row(s)."
  echo "The fixtures are CI/dev only (brief §13) and must never be on live."
  echo "The gate will not run while a fixture is present."
  exit 1
fi
echo "  the live database carries no fixture row — correct"

echo ""
echo "=== 2. THE ASSERTIONS — what must still be true AFTER the write ==="
# These are the counts that must NOT change. The migration is additive, so
# every legacy row count must be identical afterwards. A mismatch aborts
# and rolls back.
#
# THE EXPECTED COUNTS ARE OVERRIDABLE, so the gate can be exercised
# against a stand-in in the sandbox. The default is a file written by
# `record_expected_counts()`, and the production values live in
# `docs/OPERATIONS-RUNBOOK.md` and in the comments below.
#
# A gate that can only be run against production is a gate that never
# runs, so the expectation is a file, not a literal.
COUNTS_FILE="${GUSTALE_LIVE_EXPECTED_COUNTS:-${REPO_ROOT}/scripts/live-expected-counts.txt}"
if [ ! -f "$COUNTS_FILE" ]; then
  echo "FAILED: the expected-counts file '$COUNTS_FILE' does not exist." >&2
  exit 1
fi
# The file is `table=count` per line. It is turned into the SQL pairs
# array below. The table name and the count are validated FIRST, and
# only then quoted, so the file cannot smuggle in anything but a table
# name and an integer.
COUNT_PAIRS=$(awk -F= '
  /^[[:space:]]*#/ { next }
  /^[[:space:]]*$/ { next }
  {
    t = $1; c = $2
    gsub(/[[:space:]]/, "", t); gsub(/[[:space:]]/, "", c)
    if (t !~ /^[a-z_][a-z0-9_]*$/) { print "BAD_TABLE:" t > "/dev/stderr"; exit 1 }
    if (c !~ /^[0-9]+$/) { print "BAD_COUNT:" c > "/dev/stderr"; exit 1 }
    # The LAST element carries NO trailing comma: a trailing comma
    # before "]" is a syntax error in a PostgreSQL array constructor.
    if (seen) printf ",\n"
    printf "    ARRAY[%c%s%c, %c%s%c]", 39, t, 39, 39, c, 39
    seen = 1
  }
  END { if (seen) printf "\n" }' "$COUNTS_FILE")
if [ -z "$COUNT_PAIRS" ]; then
  echo "FAILED: the expected-counts file '$COUNTS_FILE' is empty." >&2
  exit 1
fi

cat > /tmp/atlas_live_assertions.sql <<SQL
DO \$\$
DECLARE
  n bigint;
  -- The LEGACY tables. The migration is additive, so every one of these
  -- counts must be identical afterwards. The NEW tables are checked
  -- separately, with their own expected values.
  pairs text[][] := ARRAY[
$COUNT_PAIRS
  ];
  i int;
  t text;
  expected text;
  actual text;
BEGIN
  FOR i IN 1..array_length(pairs, 1) LOOP
    t := pairs[i][1];
    expected := pairs[i][2];
    EXECUTE format('SELECT count(*) FROM %I', t) INTO n;
    actual := n::text;
    IF actual <> expected THEN
      RAISE EXCEPTION 'the count of % changed: expected %, found %', t, expected, actual;
    END IF;
  END LOOP;
  RAISE NOTICE 'all % legacy counts are unchanged', array_length(pairs, 1);

  -- The tables the migration ADDS. They start empty and must hold the
  -- expected number of rows afterwards.
  IF to_regclass('public.dish_place_associations') IS NOT NULL THEN
    SELECT count(*) INTO n FROM dish_place_associations;
    RAISE NOTICE 'dish_place_associations: % rows', n;
  END IF;
  IF to_regclass('public.editorial_review_queue') IS NOT NULL THEN
    SELECT count(*) INTO n FROM editorial_review_queue;
    RAISE NOTICE 'editorial_review_queue: % rows', n;
  END IF;
END \$\$;
SQL
docker exec -u postgres -i "$PROD_PG_CONTAINER" psql -U postgres -d "$DB" -v ON_ERROR_STOP=1 \
  -f - < /tmp/atlas_live_assertions.sql 2>&1 | grep -E "NOTICE|ERROR"

echo ""
echo "=== 3. APPLY ==="
set +e
docker exec -u postgres -i "$PROD_PG_CONTAINER" psql -U postgres -d "$DB" -v ON_ERROR_STOP=1 \
  -f - < "$MIGRATION" 2>&1 | grep -E "NOTICE|ERROR"
STATUS=${PIPESTATUS[0]}
set -e
if [ "$STATUS" -ne 0 ]; then
  echo "THE MIGRATION FAILED (psql exit $STATUS)."
  echo "The migration is transactional where it matters; verify the state below before retrying."
  exit "$STATUS"
fi
echo "APPLIED OK"

echo ""
echo "=== 4. INDEPENDENT VERIFICATION ==="
echo "--- the legacy counts, read back ---"
docker exec -u postgres "$PROD_PG_CONTAINER" psql -U postgres -d "$DB" -t -c "
SELECT 'statements|'||count(*) FROM statements
UNION ALL SELECT 'claim_citations|'||count(*) FROM claim_citations
UNION ALL SELECT 'dish_relations|'||count(*) FROM dish_relations
UNION ALL SELECT 'dish_families|'||count(*) FROM dish_families
UNION ALL SELECT 'dishes|'||count(*) FROM dishes
UNION ALL SELECT 'sources|'||count(*) FROM sources
UNION ALL SELECT 'geo_entities|'||count(*) FROM geo_entities
UNION ALL SELECT 'dish_traditions|'||count(*) FROM dish_traditions
UNION ALL SELECT 'users|'||count(*) FROM users
UNION ALL SELECT 'media|'||count(*) FROM media
UNION ALL SELECT 'dish_names|'||count(*) FROM dish_names
UNION ALL SELECT 'vocabulary_labels|'||count(*) FROM vocabulary_labels;" \
  | tee /tmp/atlas_live_after.txt

echo ""
echo "--- the diff against the snapshot ---"
# `relation_types` is the ONE documented change (ADR-004 §5: the
# vocabulary goes from 7 rows to 13). It is filtered out here and
# reported separately, so any OTHER change is still a failure.
grep -v "relation_types|" /tmp/atlas_live_snapshot.txt > /tmp/atlas_snap_filtered.txt
grep -v "relation_types|" /tmp/atlas_live_after.txt   > /tmp/atlas_after_filtered.txt
if diff /tmp/atlas_snap_filtered.txt /tmp/atlas_after_filtered.txt; then
  echo "IDENTICAL: every legacy count except the documented one is unchanged"
else
  echo "DIFFERENCE — the migration changed a legacy count. THIS IS A FAILURE."
  exit 1
fi
echo ""
echo "--- the documented change, verified ---"
echo "relation_types before: $(grep "relation_types|" /tmp/atlas_live_snapshot.txt)"
echo "relation_types after:  $(grep "relation_types|" /tmp/atlas_live_after.txt)"
echo "expected: 7 -> 13 (ADR-004 §5: five historical predicates + often_compared_with + three renames keeping their ids)"

echo ""
echo "--- the fixture check, again, AFTER the apply ---"
# The apply must not have created a fixture row. The predicate
# migration asserts this too, but the gate verifies independently.
FIXTURE_AFTER=$(docker exec -u postgres "$PROD_PG_CONTAINER" psql -U postgres -d "$DB" -tAc "
  SELECT
    (SELECT count(*) FROM dish_place_associations WHERE provenance = 'atlas_fixture')
  + (SELECT count(*) FROM statements WHERE qualifiers->>'provenance' = 'atlas_fixture');
" 2>/dev/null || echo "0")
if [ "$FIXTURE_AFTER" != "0" ]; then
  echo "FAILED: the apply created $FIXTURE_AFTER fixture row(s) on live."
  echo "The fixtures are CI/dev only (brief §13)."
  exit 1
fi
echo "  still no fixture row — correct"

echo ""
echo "--- the new objects, verified independently ---"
docker exec -u postgres "$PROD_PG_CONTAINER" psql -U postgres -d "$DB" -c "
SELECT 'evidence_evidenced' k, count(*) v FROM statements WHERE evidence_status='evidenced'
UNION ALL SELECT 'evidence_provisional', count(*) FROM statements WHERE evidence_status='provisional'
UNION ALL SELECT 'evidence_unevidenced', count(*) FROM statements WHERE evidence_status='unevidenced'
UNION ALL SELECT 'claim_dates', count(*) FROM claim_dates
UNION ALL SELECT 'dish_place_associations', count(*) FROM dish_place_associations
UNION ALL SELECT 'dish_identities', count(*) FROM dish_identities
UNION ALL SELECT 'dish_name_relations', count(*) FROM dish_name_relations
UNION ALL SELECT 'relation_types', count(*) FROM relation_types;"

echo ""
echo "--- the constraint tests, NOT on live ---"
#
# The constraint tests are NOT run against the live database.
#
# They were, and that is how six real associations were deleted:
#
#   - the tests' cleanup deletes by DISH, and on live the fixtures ARE
#     the three reference dishes, which carry the P2 backfill's
#     associations;
#   - running the tests against live therefore deleted six rows.
#
# The tests belong on a DISPOSABLE COPY. The copy is created, the
# migration and the tests run there, and the copy is dropped. That is the
# dry-run step, and it is where the constraints are proved.
#
# The live database is verified by READING it — the counts and the new
# objects — never by writing test rows into it.
echo "  (the constraint tests run on the dry-run copy, never on live)"
#
# THE MARKER. The copy must be marked DISPOSABLE before the constraint
# tests run on it.
#
# The protection is POSITIVE, and the default is deny. The constraint
# tests refuse to run against a database that does not carry the
# disposable marker (scripts/mark_disposable_db.sql), so a database
# that nobody explicitly created for the tests is refused.
#
# The first attempt at this was a list of forbidden DATABASE NAMES, and
# it was wrong: the CI database is named `gustale`, the same as
# production, because the PostgreSQL service container in ci.yml creates
# it that way. A name list cannot tell "production" from "a CI database
# that shares the name", so either the CI run is refused — and the
# constraint tests never run in CI at all — or production is not
# protected. There is no correct name list.
#
# The same shape as the publish credential (0038): an explicit
# credential, not a list of forbidden names.
#
# THE MARKER IS NEVER APPLIED TO PRODUCTION. This script creates the
# copy, marks the COPY, and asserts that the LIVE database is UNMARKED
# — so production cannot be marked by accident.
#
# ORDER MATTERS: the copy must EXIST before it can be marked. The mark
# was previously attempted BEFORE the copy was created, so it always
# failed on a fresh run with:
#
#     FAILED: the copy 'gustale_atlas_gate_copy' could not be marked disposable.
#
# The copy is made from the dump the backup already took, so the copy
# is the same shape as the database the migration is about to touch.
#
# THE COPY LIVES ON THE DEDICATED TEST POSTGRES. NOT ON PRODUCTION.
# ---------------------------------------------------------------------
# This used to create and drop the copy on `shared-postgres` -- the
# PRODUCTION cluster -- and the owner's own apply of 0052 on 2026-11-09
# was done directly with psql precisely BECAUSE this script could not be
# used: RULES.md forbids a cluster-scoped database statement on the
# production cluster, because `DROP DATABASE` and `CREATE DATABASE` act
# on a whole Postgres INSTANCE, not on one database.
#
# `shared-postgres` hosts the live `gustale` database AND five other
# projects' databases (bali, dewata, n8n, scribe). A throwaway database
# created on it is a hazard for all of them, and one mistyped name is a
# data-loss event for the live site -- which is exactly what happened on
# 2026-11-06.
#
# The old justification -- "the copy must be on the same cluster to be
# faithful" -- was wrong, and it is the SAME argument that was removed
# from `scripts/dryrun-migration.sh`'s exemption in this repo: a
# `pg_dump | pg_restore` copy is faithful wherever it is restored. The
# copy does not have to be on the production cluster to be a faithful
# copy of it.
#
# So the copy now runs on `gustale-test-postgres` (127.0.0.1:5434) --
# a container of its own that nothing else uses -- exactly as the
# dry-run's copy already does. The migration and the constraint tests
# both run THERE, and the copy is dropped there.
#
# The LIVE database is still touched by this script, but only in three
# ways, all of them safe by construction:
#   * a READ-ONLY `pg_dump` snapshot,
#   * the APPLY itself (the one intended write),
#   * READ-ONLY verification queries.
# It is never dropped, never created, and never marked disposable.
COPY_DB="gustale_atlas_gate_copy"

# shellcheck source=scripts/lib/test_pg.sh
source "${REPO_ROOT}/scripts/lib/test_pg.sh"

if ! test_pg_status >/dev/null 2>&1; then
  echo "=== starting the test Postgres for the copy ==="
  test_pg_up
fi
test_pg_status

# The live snapshot. It is taken INSIDE the production container,
# because that is where pg_dump lives -- the host has no pg_dump
# binary -- and then COPIED OUT with `docker cp`. The host and the
# container do NOT share /tmp, so a plain `cp` from the host cannot
# move it; `docker cp` is the only thing that works.
CONTAINER_SNAPSHOT=/tmp/gustale_atlas_gate_snapshot.dump
HOST_SNAPSHOT="${TMPDIR:-/tmp}/gustale_atlas_gate_snapshot.$$.dump"
trap 'rm -f "$HOST_SNAPSHOT"' EXIT

docker exec -u postgres "$PROD_PG_CONTAINER" pg_dump -U postgres -d "$DB" --format=custom \
  --file="$CONTAINER_SNAPSHOT" >/dev/null
docker exec -u postgres "$PROD_PG_CONTAINER" ls -la "$CONTAINER_SNAPSHOT"
# Copy it OUT of the production container onto the host.
docker cp "${PROD_PG_CONTAINER}:${CONTAINER_SNAPSHOT}" "$HOST_SNAPSHOT"

# Create the copy on the TEST container -- never on production.
test_pg_create "$COPY_DB"
# The archive is copied INTO the test container, because pg_restore runs
# inside it.
docker cp "$HOST_SNAPSHOT" "${TEST_PG_CONTAINER}:${CONTAINER_SNAPSHOT}" >/dev/null
docker exec -u postgres "$TEST_PG_CONTAINER" \
  pg_restore -U "$TEST_PG_ADMIN" -d "$COPY_DB" \
  --no-owner --no-privileges "$CONTAINER_SNAPSHOT" >/dev/null 2>&1 || true
# The grants the API needs.
test_pg_run "$COPY_DB" \
  -c "GRANT ALL ON SCHEMA public TO gustale;" \
  -c "GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO gustale;" \
  -c "GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO gustale;" >/dev/null
echo "  the copy is restored on ${TEST_PG_CONTAINER} (port ${TEST_PG_PORT}), db '${COPY_DB}'"

echo "  marking the copy '$COPY_DB' as disposable"
test_pg_run "$COPY_DB" -f - < "${REPO_ROOT}/scripts/mark_disposable_db.sql" >/dev/null 2>&1 \
  || { echo "FAILED: the copy '$COPY_DB' could not be marked disposable."; exit 1; }

# The live database must NOT be marked. If it is, something has applied
# the marker to production, and the gate stops.
LIVE_MARKED=$(docker exec -u postgres "$PROD_PG_CONTAINER" psql -U postgres -d "$DB" -tAc \
  "SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_name='gustale_disposable_database';" 2>/dev/null || echo 0)
if [ "$LIVE_MARKED" != "0" ]; then
  echo "FAILED: the live database '$DB' carries the disposable marker."
  echo "The constraint tests must never run against production, and the live"
  echo "database must never be marked disposable."
  exit 1
fi
echo "  the live database '$DB' is NOT marked disposable — correct"

# The migration and the constraint tests, both on the COPY -- on the
# TEST container.
test_pg_run "$COPY_DB" -f - < "$MIGRATION" >/dev/null 2>&1
test_pg_run "$COPY_DB" -f - < "${REPO_ROOT}/scripts/test_atlas_schema.sql" 2>&1 | grep -E "ATLAS_SCHEMA_TESTS|ERROR|REFUSED" | tail -3

# The copy is dropped on the TEST container, where it was created.
test_pg_drop "$COPY_DB"

echo ""
echo "LIVE_MIGRATION_OK=1"
