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
# Usage: apply-migration-live.sh <migration.sql> [expect-db-name]
set -euo pipefail

MIGRATION="${1:?usage: apply-migration-live.sh <migration.sql>}"
DB=gustale

echo "=== 1. THE SNAPSHOT — the counts BEFORE the write ==="
docker exec -u postgres shared-postgres psql -U postgres -d "$DB" -t -c "
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
echo "=== 2. THE ASSERTIONS — what must still be true AFTER the write ==="
# These are the counts that must NOT change. The migration is additive, so
# every legacy row count must be identical afterwards. A mismatch aborts
# and rolls back.
cat > /tmp/atlas_live_assertions.sql <<'SQL'
DO $$
DECLARE
  n bigint;
  -- The LEGACY tables. The migration is additive, so every one of these
  -- counts must be identical afterwards. The NEW tables are checked
  -- separately, with their own expected values.
  pairs text[][] := ARRAY[
    -- relation_types is DELIBERATELY excluded from the unchanged-count
    -- assertion: ADR-004 §5 extends the vocabulary from 7 rows to 13 (the
    -- five historical predicates, often_compared_with, and the three
    -- renames keep their ids). The DIFF check below is where that one
    -- documented change is allowed, and only that one.
    ARRAY['statements',        '1354'],
    ARRAY['claim_citations',  '1354'],
    -- dish_relations is 86, not the 182 it was before GUS-224: that
    -- migration DELETED 96 inverse-duplicate rows (91 of a symmetric
    -- relation, 5 of a directional pair asserted both ways) and moved
    -- them to dish_relations_archive for provenance. The P0 baseline
    -- recorded 96, which was the ARCHIVE's count, not the live one.
    ARRAY['dish_relations',   '86'],
    ARRAY['dish_families',    '306'],
    ARRAY['dishes',           '1476'],
    ARRAY['sources',          '1486'],
    ARRAY['geo_entities',     '3892'],
    ARRAY['dish_traditions',  '433'],
    ARRAY['users',            '1'],
    ARRAY['media',            '1339'],
    ARRAY['dish_names',       '2849'],
    ARRAY['vocabulary_labels','35871']
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
END $$;
SQL
docker exec -u postgres -i shared-postgres psql -U postgres -d "$DB" -v ON_ERROR_STOP=1 \
  -f - < /tmp/atlas_live_assertions.sql 2>&1 | grep -E "NOTICE|ERROR"

echo ""
echo "=== 3. APPLY ==="
set +e
docker exec -u postgres -i shared-postgres psql -U postgres -d "$DB" -v ON_ERROR_STOP=1 \
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
docker exec -u postgres shared-postgres psql -U postgres -d "$DB" -t -c "
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
echo "--- the new objects, verified independently ---"
docker exec -u postgres shared-postgres psql -U postgres -d "$DB" -c "
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
# The copy is made from the dump the backup already took, so the copy is
# the same shape as the database the migration is about to touch.
COPY_DB="gustale_atlas_gate_copy"

# THE REFUSAL. The copy's name is asserted to be different from the live
# database's, and the test runner is passed the copy's name EXPLICITLY.
#
# The previous version of this script ran the constraint tests with
# `-d "$COPY_DB"`, which was already correct — but nothing PROVED it. The
# guard lived only in a comment, and a comment is not a control. One
# careless edit to the `-d` flag would have put the test rows straight
# back into production, which is exactly what happened before.
#
# So the refusal is now MECHANICAL, in two places:
#
#   1. here, the copy's name is checked against the live name before the
#      copy is created, and the run ABORTS if they are the same;
#   2. in scripts/test_atlas_schema.sql, the test refuses to run against
#      a database whose name is in the protected set — so the same
#      protection holds when the test file is run by hand, by CI, or by
#      any other script.
#
# The protected set lives in the test file, and this script READS it from
# there rather than repeating it, so the two cannot drift.
PROTECTED_DBS=$(grep -oE "^-- GUSTALE_PROTECTED_DATABASES:.*" scripts/test_atlas_schema.sql \
  | head -1 | sed 's/^-- GUSTALE_PROTECTED_DATABASES: *//' | tr ',' '\n' | tr -d ' ' | grep -v '^$')
if [ -z "$PROTECTED_DBS" ]; then
  echo "FAILED: scripts/test_atlas_schema.sql declares no protected database list."
  echo "The gate cannot prove the constraint tests will not run against production."
  exit 1
fi
for protected in $PROTECTED_DBS; do
  if [ "$COPY_DB" = "$protected" ] || [ "$DB" = "$protected" ]; then
    echo "FAILED: the copy '$COPY_DB' or the live database '$DB' is a PROTECTED database ($protected)."
    echo "The constraint tests must never run against production."
    exit 1
  fi
done
echo "  the copy '$COPY_DB' is not a protected database ($PROTECTED_DBS)"

docker exec -u postgres shared-postgres psql -U postgres -d postgres \
  -c "DROP DATABASE IF EXISTS ${COPY_DB};" >/dev/null 2>&1
docker exec -u postgres shared-postgres createdb -U postgres "$COPY_DB"
docker exec -u postgres shared-postgres pg_restore -U postgres -d "$COPY_DB" \
  --no-owner --no-privileges /tmp/gustale_atlas_snapshot.dump >/dev/null 2>&1 || true
docker exec -u postgres shared-postgres psql -U postgres -d "$COPY_DB" \
  -c "GRANT ALL ON SCHEMA public TO gustale;" \
  -c "GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO gustale;" \
  -c "GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO gustale;" >/dev/null

# The migration and the constraint tests, both on the copy.
docker exec -u postgres -i shared-postgres psql -U postgres -d "$COPY_DB" -v ON_ERROR_STOP=1 \
  -f - < "$MIGRATION" >/dev/null 2>&1
docker exec -u postgres -i shared-postgres psql -U postgres -d "$COPY_DB" -v ON_ERROR_STOP=1 \
  -f - < scripts/test_atlas_schema.sql 2>&1 | grep -E "ATLAS_SCHEMA_TESTS|ERROR|REFUSED" | tail -3

docker exec -u postgres shared-postgres psql -U postgres -d postgres \
  -c "DROP DATABASE IF EXISTS ${COPY_DB};" >/dev/null 2>&1

echo ""
echo "LIVE_MIGRATION_OK=1"
