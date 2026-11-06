#!/usr/bin/env bash
# Test 0051 against the LIVE family shape.
#
# The CI seed database has 28 families. Live has 306, and the
# migration's assertions are about the 306 (the class split 83/21/4/15
# and the 123 with a published dish). So the test needs live's shape.
#
# The obstacle: `dish_families.parent_id` is a SELF-REFERENTIAL FK
# with NO ACTION, so DELETE FROM dish_families checks every row's
# parent and is pathologically slow. The way round it is to drop the
# constraint for the duration of the load and put it back after --
# which is safe here because this is a throwaway database.
set -uo pipefail
cd "$(dirname "$0")/../.."
DB=gustale_t51_live

run_pg() { docker exec -u postgres shared-postgres psql -U postgres -d "$DB" -v ON_ERROR_STOP=1 "$@" 2>&1; }

echo "=== 1. build the throwaway database ==="
bash scripts/ci-migration-chain.sh "$DB" >/tmp/chain51.log 2>&1 || { echo "  chain FAILED"; tail -8 /tmp/chain51.log; exit 1; }
echo "  built"

echo
echo "=== 2. load the LIVE family and dish rows ==="
# Break the self-reference so the load is fast, then restore it.
#
# The self-referential parent_id FK (NO ACTION) makes DELETE FROM
# dish_families check every row's parent, which is pathologically
# slow on 306 rows. Dropping the constraint for the duration of the
# load is safe here: this is a throwaway database.
run_pg -c "ALTER TABLE dish_families DROP CONSTRAINT dish_families_parent_id_fkey;" >/dev/null
run_pg -c "DELETE FROM dish_families;" >/dev/null
docker exec -u postgres -i shared-postgres psql -U postgres -d "$DB" -v ON_ERROR_STOP=0 \
  < /tmp/live_fam.sql > /tmp/restore51.log 2>&1
echo "  family restore errors: $(grep -ci error /tmp/restore51.log)"

# The published-dish count needs the dishes and the links.
run_pg -c "DELETE FROM dish_dish_families;" >/dev/null
run_pg -c "DELETE FROM dishes;" >/dev/null
docker exec -u postgres -i shared-postgres psql -U postgres -d "$DB" -v ON_ERROR_STOP=0 \
  < /tmp/live_dishes.sql > /tmp/restore51b.log 2>&1
echo "  dish restore errors: $(grep -ci error /tmp/restore51b.log)"

run_pg -c "ALTER TABLE dish_families ADD CONSTRAINT dish_families_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES dish_families(id);" >/dev/null

echo
echo "=== 3. the BEFORE state ==="
run_pg -c "SELECT count(*) AS families, count(*) FILTER (WHERE family_class IS NOT NULL) AS classified FROM dish_families;" | tail -5

echo
echo "=== 4. apply 0051 ==="
docker exec -u postgres -i shared-postgres psql -U postgres -d "$DB" -v ON_ERROR_STOP=1 \
  < db/migrations/0051_family_classification.sql 2>&1 | tail -6
rc=${PIPESTATUS[0]}
[ $rc -eq 0 ] || { echo "  FAILED: 0051 did not apply (rc=$rc)"; exit 1; }

echo
echo "=== 5. the AFTER state ==="
run_pg -c "SELECT family_class, count(*) FROM dish_families GROUP BY 1 ORDER BY 2 DESC;" | tail -8
echo
run_pg -c "SELECT count(*) AS unclassified FROM dish_families WHERE family_class IS NULL;" | tail -4
echo
echo "=== 5b. the ledger ==="
run_pg -c "SELECT count(*) AS ledger_rows FROM family_classification_ledger;" | tail -4

echo
echo "=== 6. IDEMPOTENCY: re-applying must not change anything ==="
before=$(run_pg -t -c "SELECT count(*) FROM family_classification_ledger;" | tr -d ' ')
docker exec -u postgres -i shared-postgres psql -U postgres -d "$DB" -v ON_ERROR_STOP=1 \
  < db/migrations/0051_family_classification.sql > /tmp/reapply51.log 2>&1
rc=$?
after=$(run_pg -t -c "SELECT count(*) FROM family_classification_ledger;" | tr -d ' ')
echo "  re-apply rc=$rc  ledger $before -> $after"
if [ "$before" = "$after" ]; then echo "  OK: 0051 is idempotent"; else echo "  NOTE: not idempotent"; tail -6 /tmp/reapply51.log; fi

echo
echo "=== 7. the CONSTRAINT must reject a bad class ==="
run_pg -c "UPDATE dish_families SET family_class='NONSENSE' WHERE slug='dish';" | tail -3

echo
echo "=== 8. cleanup ==="
docker exec -u postgres shared-postgres psql -U postgres -d postgres -c "DROP DATABASE IF EXISTS $DB;" >/dev/null 2>&1
echo "  dropped $DB"
