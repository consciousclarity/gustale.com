#!/usr/bin/env bash
# prove-0057.sh -- the proof-mutant test for migration 0057.
#
# It builds a copy of live on the DEDICATED TEST postgres, applies
# 0057, then applies MUTANTS of it and asserts that each mutant is
# REFUSED by its own proofs.
#
# A proof that never fails is not a proof. Each mutant below breaks
# one thing the migration claims, and the mutation must be caught.
set -uo pipefail

REPO=/tmp/dryrun0057
source "$REPO/scripts/lib/test_pg.sh"

DB=gustale_0057_mutants
MIG=$REPO/db/migrations/0057_ingredients_sourcing_vocabulary.sql

echo "=== 0. the test Postgres ==="
test_pg_up || { echo "FAILED: the test postgres is not up"; exit 1; }

echo "=== 1. the copy of live ==="
CONTAINER_SNAPSHOT=/tmp/m57_snapshot.dump
docker exec shared-postgres pg_dump -U postgres -d gustale > /tmp/m57_host.dump
docker cp shared-postgres:$CONTAINER_SNAPSHOT /tmp/m57_out.dump >/dev/null 2>&1 || cp /tmp/m57_host.dump /tmp/m57_out.dump

test_pg_create "$DB" >/dev/null
cat /tmp/m57_out.dump | test_pg_run "$DB" >/dev/null 2>&1
echo "   the copy is made"

echo "=== 2. the baseline: 0057 applies and proves ==="
test_pg_run "$DB" -f - < "$MIG" >/tmp/m57_base.log 2>&1
if ! grep -q "0057: all 6 proofs passed" /tmp/m57_base.log; then
  echo "FAILED: the baseline did not pass"; tail -6 /tmp/m57_base.log; exit 1
fi
echo "   the baseline passes"

# The counts, read back independently.
COUNT=$(test_pg_run "$DB" -tAc "SELECT count(*) FROM ingredients")
NEW=$(test_pg_run "$DB" -tAc "SELECT count(*) FROM ingredients WHERE slug IN ('coconut-milk','cassava','plantain','tamarind','saffron','preserved-lemon','curry-leaves','makrut-lime-leaves','gochujang','doubanjiang','fish-sauce','fresh-mozzarella-di-bufala','parmigiano-reggiano','pecorino','ube','ackee','huitlacoche','asian-pear','pandan','epazote','fresh-corn-masa')")
PUB=$(test_pg_run "$DB" -tAc "SELECT count(*) FROM ingredients WHERE status='published'")
NOCAT=$(test_pg_run "$DB" -tAc "SELECT count(*) FROM ingredients i LEFT JOIN ingredient_categories c ON c.slug=i.category WHERE c.slug IS NULL")
echo "   the ingredients: $COUNT total, $NEW new, $PUB published, $NOCAT without a resolvable category"

fails=0

# rebuild_copy -- a FRESH copy of live for each mutant.
#
# The migration is idempotent, so a mutant applied to a database where
# the rows already exist changes nothing: `ON CONFLICT (slug) DO
# NOTHING` skips every row, and the proof has nothing to fire on. Each
# mutant therefore needs its own clean copy.
rebuild_copy() {
  test_pg_drop "$DB" >/dev/null 2>&1
  test_pg_create "$DB" >/dev/null
  cat /tmp/m57_out.dump | test_pg_run "$DB" >/dev/null 2>&1
}

# --- MUTANT 1: one row is published instead of draft.
echo "=== mutant 1: a new row published ==="
rebuild_copy
sed "s/'draft',\n/'published',\n/" "$MIG" > /tmp/m57_mut1.sql
# The simplest reliable mutation: change the status of the FIRST row.
python3 - <<'PY'
import re
s = open('/tmp/dryrun0057/db/migrations/0057_ingredients_sourcing_vocabulary.sql').read()
i = s.index("VALUES\n")
head, tail = s[:i], s[i:]
tail = tail.replace("'draft',", "'published',", 1)
open('/tmp/m57_mut1.sql','w').write(head + tail)
PY
test_pg_run "$DB" -f - < /tmp/m57_mut1.sql >/tmp/m57_mut1.log 2>&1
if grep -qi "PROOF 3 FAILED\|PROOF 4 FAILED" /tmp/m57_mut1.log; then
  echo "   CAUGHT: the published row was refused"
else
  echo "   MISSED: the published row was accepted"; fails=$((fails+1))
fi

# --- MUTANT 2: a category that does not exist in the taxonomy.
echo "=== mutant 2: a category that is not in the taxonomy ==="
rebuild_copy
python3 - <<'PY'
s = open('/tmp/dryrun0057/db/migrations/0057_ingredients_sourcing_vocabulary.sql').read()
s = s.replace("'coconut',", "'no-such-category',", 1)
open('/tmp/m57_mut2.sql','w').write(s)
PY
test_pg_run "$DB" -f - < /tmp/m57_mut2.sql >/tmp/m57_mut2.log 2>&1
if grep -qi "PROOF 2 FAILED\|foreign key\|violates" /tmp/m57_mut2.log; then
  echo "   CAUGHT: the bad category was refused"
else
  echo "   MISSED: the bad category was accepted"; fails=$((fails+1))
fi

# --- MUTANT 3: only 20 of the 21 rows are inserted.
echo "=== mutant 3: one row missing ==="
rebuild_copy
python3 - <<'PY'
s = open('/tmp/dryrun0057/db/migrations/0057_ingredients_sourcing_vocabulary.sql').read()
i = s.index("  ('epazote'")
j = s.index("),", s.index("'00000000-0000-0000-0000-000000000001'::uuid)", i)) + 2
# remove the whole epazote row
s = s[:i] + s[j:]
open('/tmp/m57_mut3.sql','w').write(s)
PY
test_pg_run "$DB" -f - < /tmp/m57_mut3.sql >/tmp/m57_mut3.log 2>&1
if grep -qi "PROOF 1 FAILED" /tmp/m57_mut3.log; then
  echo "   CAUGHT: the missing row was caught"
else
  echo "   MISSED: the missing row was accepted"; fails=$((fails+1))
fi

# --- MUTANT 4: the is_key leak check, inverted -- the proof must
# catch an ingredients table that HAS an is_key column.
echo "=== mutant 4: an is_key column on ingredients ==="
rebuild_copy
test_pg_run "$DB" -tAc "ALTER TABLE ingredients ADD COLUMN IF NOT EXISTS is_key boolean" >/dev/null 2>&1
test_pg_run "$DB" -f - < "$MIG" >/tmp/m57_mut4.log 2>&1
if grep -qi "PROOF 5 FAILED" /tmp/m57_mut4.log; then
  echo "   CAUGHT: the is_key leak was caught"
else
  echo "   MISSED: the is_key leak was accepted"; fails=$((fails+1))
fi
test_pg_run "$DB" -tAc "ALTER TABLE ingredients DROP COLUMN IF EXISTS is_key" >/dev/null 2>&1

# --- MUTANT 5: idempotence -- a duplicate row must not appear.
echo "=== mutant 5: a duplicate row ==="
test_pg_run "$DB" -tAc "INSERT INTO ingredients (slug, canonical_name, status) VALUES ('coconut-milk','Duplicate','draft')" >/dev/null 2>&1
DUP=$(test_pg_run "$DB" -tAc "SELECT count(*) FROM ingredients WHERE slug='coconut-milk'")
if [ "$DUP" = "1" ]; then
  echo "   CAUGHT: the unique constraint refused the duplicate ($DUP row)"
else
  echo "   MISSED: the duplicate was accepted ($DUP rows)"; fails=$((fails+1))
fi
test_pg_run "$DB" -tAc "DELETE FROM ingredients WHERE slug='coconut-milk' AND canonical_name='Duplicate'" >/dev/null 2>&1

echo "=== cleaning up ==="
test_pg_drop "$DB" >/dev/null 2>&1
rm -f /tmp/m57_out.dump /tmp/m57_host.dump

if [ $fails -eq 0 ]; then
  echo "ALL_MUTANTS_CAUGHT=1"
  exit 0
fi
echo "MUTANTS_MISSED=$fails"
exit 1
