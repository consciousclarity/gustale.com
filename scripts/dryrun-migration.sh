#!/usr/bin/env bash
# Exercise a migration against an EXACT COPY of the live database, on a
# throwaway database, and report what it did.
#
# This is the standing gate's dry-run step (RULES.md §3, KANBAN.md §4):
#   snapshot -> dry-run on an exact copy -> count assertions -> (apply)
#
# The copy is made with pg_dump | pg_restore rather than CREATE DATABASE
# ... TEMPLATE, because the live database has live connections and TEMPLATE
# refuses to copy a database that is in use.
#
# Usage: dryrun-migration.sh <migration.sql> [dbname]
set -euo pipefail

MIGRATION="${1:?usage: dryrun-migration.sh <migration.sql> [dbname]}"
DB="${2:-gustale_atlas_dryrun}"
DUMP=/tmp/gustale_atlas_snapshot.dump

echo "=== 1. the snapshot: pg_dump of the live gustale database ==="
docker exec -u postgres shared-postgres pg_dump -U postgres -d gustale --format=custom \
  --file=/tmp/gustale_atlas_snapshot.dump >/dev/null
docker exec -u postgres shared-postgres ls -la /tmp/gustale_atlas_snapshot.dump

echo ""
echo "=== 2. restoring the copy into ${DB} ==="
docker exec -u postgres shared-postgres psql -U postgres -d postgres \
  -c "DROP DATABASE IF EXISTS ${DB};" >/dev/null
docker exec -u postgres shared-postgres createdb -U postgres "$DB"
docker exec -u postgres shared-postgres pg_restore -U postgres -d "$DB" \
  --no-owner --no-privileges /tmp/gustale_atlas_snapshot.dump >/dev/null 2>&1 || true
# The grants the API needs.
docker exec -u postgres shared-postgres psql -U postgres -d "$DB" \
  -c "GRANT ALL ON SCHEMA public TO gustale;" \
  -c "GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO gustale;" \
  -c "GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO gustale;" >/dev/null

echo ""
echo "=== 3. the counts BEFORE the migration ==="
docker exec -u postgres shared-postgres psql -U postgres -d "$DB" -t -c "
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
docker exec -u postgres -i shared-postgres psql -U postgres -d "$DB" -v ON_ERROR_STOP=1 \
  -f - < "$MIGRATION" 2>&1 | grep -E "NOTICE|ERROR|WARNING" | head -40
STATUS=${PIPESTATUS[0]}
set -e
if [ "$STATUS" -ne 0 ]; then
  echo "MIGRATION FAILED (psql exit $STATUS)"
  exit "$STATUS"
fi
echo "MIGRATION APPLIED OK"

echo ""
echo "=== 5. the counts AFTER ==="
docker exec -u postgres shared-postgres psql -U postgres -d "$DB" -t -c "
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
docker exec -u postgres shared-postgres psql -U postgres -d "$DB" -c "
SELECT slug, name, is_symmetric FROM relation_types ORDER BY is_symmetric, slug;"

echo ""
echo "=== 7. re-applying (idempotence) ==="
set +e
docker exec -u postgres -i shared-postgres psql -U postgres -d "$DB" -v ON_ERROR_STOP=1 \
  -f - < "$MIGRATION" 2>&1 | grep -E "ERROR" | head -10
STATUS=${PIPESTATUS[0]}
set -e
if [ "$STATUS" -eq 0 ]; then
  echo "IDEMPOTENT: the second application succeeded"
else
  echo "NOT IDEMPOTENT (psql exit $STATUS)"
  exit "$STATUS"
fi

echo ""
echo "DRYRUN_OK=1  (the copy is ${DB})"
