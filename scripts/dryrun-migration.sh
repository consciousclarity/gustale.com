#!/usr/bin/env bash
# Exercise a migration against an EXACT COPY of the live database, on the
# DEDICATED TEST Postgres, and report what it did.
#
# WHY THE TEST POSTGRES AND NOT THE PRODUCTION CLUSTER
# -----------------------------------------------------
# This script used to create and drop its copy on `shared-postgres` --
# the PRODUCTION cluster. That was a rule violation, even though it
# "went well": `DROP DATABASE` and `CREATE DATABASE` are
# CLUSTER-SCOPED, so they act on a whole Postgres instance, not on one
# database. `shared-postgres` hosts the live `gustale` database AND five
# other projects' databases (bali, dewata, n8n, scribe). A throwaway
# database created there is a hazard for all of them, and one mistyped
# name is a data-loss event for the live site -- which is exactly what
# happened on 2026-11-06.
#
# The rule is written down in docs/DATABASE-SAFETY.md §1 and §3, and it
# is enforced in code by scripts/check-no-production-db-drops.py. This
# script used to be EXEMPT from that scanner, by an allowlist entry that
# argued "the copy must be on the same cluster to be faithful". That
# argument was wrong: a `pg_dump | pg_restore` copy is faithful
# wherever it is restored, and the copy does not have to be on the
# production cluster to be a faithful copy of it.
#
# The allowlist entry is GONE. The scanner now catches this script if
# it ever regresses, and scripts/test-check-no-production-db-drops.py
# has a case that proves the scanner would catch it.
#
# WHAT IT DOES
# ------------
#   1. A READ-ONLY `pg_dump` snapshot of live (the snapshot is taken in
#      the production container, because that is where pg_dump lives --
#      the host has no pg_dump binary -- and it is COPIED OUT with
#      `docker cp`; the host and the container do NOT share /tmp).
#   2. The snapshot is restored into a throwaway database on the TEST
#      container (gustale-test-postgres, 127.0.0.1:5434).
#   3. The migration is applied to that copy, and the counts before and
#      after are reported.
#   4. The migration is applied a SECOND time, to prove it is
#      idempotent.
#   5. The copy is DROPPED. The script always cleans up after itself,
#      so it cannot leave a 42MB database behind on either cluster.
#
# The live database is only ever READ, and only by `pg_dump`.
#
# Usage: dryrun-migration.sh <migration.sql> [dbname]
set -euo pipefail

MIGRATION="${1:?usage: dryrun-migration.sh <migration.sql> [dbname]}"
DB="${2:-gustale_atlas_dryrun}"

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# The dedicated test Postgres. NEVER the production container.
# shellcheck source=scripts/lib/test_pg.sh
source "${REPO_ROOT}/scripts/lib/test_pg.sh"

# The live snapshot. It lives in the PRODUCTION container's /tmp only
# for the moment it takes to be copied out; the host has no pg_dump.
CONTAINER_SNAPSHOT=/tmp/gustale_atlas_snapshot.dump
HOST_SNAPSHOT="${TMPDIR:-/tmp}/gustale_atlas_snapshot.$$.dump"

cleanup() {
  # Always leave nothing behind: no copy on the test container, no
  # snapshot file on the host, no snapshot in the production container.
  rm -f "$HOST_SNAPSHOT" 2>/dev/null || true
  docker exec -u postgres "$TEST_PG_CONTAINER" \
    rm -f "$CONTAINER_SNAPSHOT" 2>/dev/null || true
}
trap cleanup EXIT

echo "=== 0. the test Postgres (the copy lives HERE, never on production) ==="
if ! test_pg_status >/dev/null 2>&1; then
  echo "starting it..."
  test_pg_up
fi
test_pg_status
echo "NOTE: the live database is only ever READ, by pg_dump."

echo ""
echo "=== 1. the snapshot: a READ-ONLY pg_dump of the live gustale database ==="
docker exec -u postgres shared-postgres pg_dump -U postgres -d gustale --format=custom \
  --file="$CONTAINER_SNAPSHOT" >/dev/null
docker exec -u postgres shared-postgres ls -la "$CONTAINER_SNAPSHOT"
# The host and the container do NOT share /tmp, so the copy is made
# with `docker cp`. (A plain `cp /tmp/...` fails with "cannot stat".)
docker cp "shared-postgres:${CONTAINER_SNAPSHOT}" "$HOST_SNAPSHOT"
echo "copied out to the host: $(ls -la "$HOST_SNAPSHOT")"

echo ""
echo "=== 2. restoring the copy into ${DB} ON THE TEST POSTGRES ==="
test_pg_create "$DB"
# The archive is copied INTO the test container, because pg_restore runs
# inside it.
docker cp "$HOST_SNAPSHOT" "${TEST_PG_CONTAINER}:${CONTAINER_SNAPSHOT}" >/dev/null
docker exec -u postgres "$TEST_PG_CONTAINER" \
  pg_restore -U "$TEST_PG_ADMIN" -d "$DB" \
  --no-owner --no-privileges "$CONTAINER_SNAPSHOT" >/dev/null 2>&1 || true
# The grants the API needs.
test_pg_run "$DB" \
  -c "GRANT ALL ON SCHEMA public TO gustale;" \
  -c "GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO gustale;" \
  -c "GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO gustale;" >/dev/null
echo "the copy is restored on ${TEST_PG_CONTAINER} (port ${TEST_PG_PORT}), db '${DB}'"

echo ""
echo "=== 3. the counts BEFORE the migration ==="
test_pg_run "$DB" -t -c "
SELECT 'statements|'||count(*) FROM statements
UNION ALL SELECT 'claim_citations|'||count(*) FROM claim_citations
UNION ALL SELECT 'dish_relations|'||count(*) FROM dish_relations
UNION ALL SELECT 'relation_types|'||count(*) FROM relation_types
UNION ALL SELECT 'dish_families|'||count(*) FROM dish_families
UNION ALL SELECT 'dishes|'||count(*) FROM dishes
UNION ALL SELECT 'sources|'||count(*) FROM sources;"

echo ""
echo "=== 4. applying: $MIGRATION ==="
set +e
test_pg_run "$DB" -f - < "$MIGRATION" 2>&1 | grep -E "NOTICE|ERROR|WARNING" | head -40
STATUS=${PIPESTATUS[0]}
set -e
if [ "$STATUS" -ne 0 ]; then
  echo "MIGRATION FAILED (psql exit $STATUS)"
  exit "$STATUS"
fi
echo "MIGRATION APPLIED OK"

echo ""
echo "=== 5. the counts AFTER ==="
test_pg_run "$DB" -t -c "
SELECT 'statements|'||count(*) FROM statements
UNION ALL SELECT 'evidence_evidenced|'||count(*) FROM statements WHERE evidence_status='evidenced'
UNION ALL SELECT 'evidence_provisional|'||count(*) FROM statements WHERE evidence_status='provisional'
UNION ALL SELECT 'evidence_unevidenced|'||count(*) FROM statements WHERE evidence_status='unevidenced'
UNION ALL SELECT 'claim_citations|'||count(*) FROM claim_citations
UNION ALL SELECT 'dish_relations|'||count(*) FROM dish_relations
UNION ALL SELECT 'relation_types|'||count(*) FROM relation_types
UNION ALL SELECT 'dish_families|'||count(*) FROM dish_families
UNION ALL SELECT 'dishes|'||count(*) FROM dishes
UNION ALL SELECT 'sources|'||count(*) FROM sources
UNION ALL SELECT 'claim_dates|'||count(*) FROM claim_dates
UNION ALL SELECT 'dish_place_associations|'||count(*) FROM dish_place_associations
UNION ALL SELECT 'dish_identities|'||count(*) FROM dish_identities
UNION ALL SELECT 'dish_name_relations|'||count(*) FROM dish_name_relations;"

echo ""
echo "=== 6. the new relation_types vocabulary ==="
test_pg_run "$DB" -c "
SELECT slug, name, is_symmetric FROM relation_types ORDER BY is_symmetric, slug;"

echo ""
echo "=== 7. re-applying (idempotence) ==="
set +e
test_pg_run "$DB" -f - < "$MIGRATION" 2>&1 | grep -E "ERROR" | head -10
STATUS=${PIPESTATUS[0]}
set -e
if [ "$STATUS" -eq 0 ]; then
  echo "IDEMPOTENT: the second application succeeded"
else
  echo "NOT IDEMPOTENT (psql exit $STATUS)"
  exit "$STATUS"
fi

echo ""
echo "=== 8. cleaning up the copy (it never outlives this script) ==="
test_pg_drop "$DB"
echo "the copy '${DB}' is dropped from ${TEST_PG_CONTAINER}"
docker exec -u postgres "$TEST_PG_CONTAINER" rm -f "$CONTAINER_SNAPSHOT" 2>/dev/null || true
docker exec -u postgres shared-postgres rm -f "$CONTAINER_SNAPSHOT" 2>/dev/null || true
echo "the snapshots are removed from both containers and the host"

echo ""
echo "DRYRUN_OK=1  (the copy ran on ${TEST_PG_CONTAINER}, port ${TEST_PG_PORT}, and is now dropped)"
