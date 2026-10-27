#!/usr/bin/env bash
# Run each trigger test in ISOLATION so a failure does not abort the rest.
# Against the COPY only.
DB=gustale_gus241_test
run() {
  echo "--- $1 ---"
  docker exec -i shared-postgres psql -v ON_ERROR_STOP=1 -U postgres -d "$DB" 2>&1 | grep -E "^ERROR|^INSERT|^UPDATE|^DETAIL" | head -3
  echo ""
}

run "TEST 1  value into a cell recorded as unset  -> MUST REJECT" <<'SQL'
INSERT INTO dish_dish_cuisines (dish_id, value_id, is_primary)
SELECT d.id, c.id, true FROM dishes d, dish_cuisines c
WHERE d.slug='momo' AND c.slug='nepalese';
SQL

run "TEST 2  unset for a cell that HAS a value     -> MUST REJECT" <<'SQL'
INSERT INTO dish_dimension_unset (dish_id, dimension, reason, note)
SELECT id, 'cuisine', 'no_evidence', 'should be rejected' FROM dishes WHERE slug='borscht';
SQL

run "TEST 3  unset for a cell with neither state   -> MUST SUCCEED" <<'SQL'
INSERT INTO dish_dimension_unset (dish_id, dimension, reason, note)
SELECT id, 'technique', 'not_applicable', 'sambal: no cooking technique'
FROM dishes WHERE slug='sambal' AND NOT EXISTS (
  SELECT 1 FROM dish_dimension_unset u WHERE u.dish_id=dishes.id AND u.dimension='technique');
SQL

run "TEST 4  invalid reason                        -> MUST REJECT" <<'SQL'
INSERT INTO dish_dimension_unset (dish_id, dimension, reason, note)
SELECT id, 'course', 'because', 'invalid' FROM dishes WHERE slug='sambal';
SQL

run "TEST 5  invalid dimension                     -> MUST REJECT" <<'SQL'
INSERT INTO dish_dimension_unset (dish_id, dimension, reason, note)
SELECT id, 'vibes', 'no_evidence', 'invalid' FROM dishes WHERE slug='sambal';
SQL

run "TEST 6  duplicate (dish, dimension)           -> MUST REJECT" <<'SQL'
INSERT INTO dish_dimension_unset (dish_id, dimension, reason, note)
SELECT id, 'technique', 'no_evidence', 'dup' FROM dishes WHERE slug='sambal';
SQL

run "TEST 7  unset -> then value                   -> MUST REJECT (value side)" <<'SQL'
-- sambal.technique is now unset; try to add a technique value
INSERT INTO dish_dish_techniques (dish_id, value_id)
SELECT d.id, t.id FROM dishes d, dish_techniques t
WHERE d.slug='sambal' AND t.slug='frying';
SQL

run "TEST 8  value -> then unset                   -> MUST REJECT (unset side)" <<'SQL'
-- moqueca has technique; try to unset it
INSERT INTO dish_dimension_unset (dish_id, dimension, reason, note)
SELECT d.id, 'technique', 'no_evidence', 'should be rejected'
FROM dishes d WHERE d.slug='moqueca';
SQL

echo "=== FINAL: the GUS-231 check still holds ==="
docker exec -i shared-postgres psql -U postgres -d "$DB" -tA <<'SQL'
WITH dims AS (
  SELECT 'family' AS dim, dish_id FROM dish_dish_families
  UNION ALL SELECT 'cuisine', dish_id FROM dish_dish_cuisines
  UNION ALL SELECT 'course', dish_id FROM dish_dish_courses
  UNION ALL SELECT 'technique', dish_id FROM dish_dish_techniques
  UNION ALL SELECT 'ingredient_category', dish_id FROM dish_dish_ingredient_categories
  UNION ALL SELECT 'tradition', dish_id FROM dish_dish_traditions
  UNION ALL SELECT 'context', dish_id FROM dish_dish_contexts
), alldim AS (SELECT unnest(ARRAY['family','cuisine','course','technique',
                                'ingredient_category','tradition','context']) AS dim),
pub AS (SELECT id FROM dishes WHERE status='published')
SELECT 'missing_both=' || count(*) FILTER (WHERE NOT has_val AND NOT has_unset)
    || ' has_both=' || count(*) FILTER (WHERE has_val AND has_unset)
    || ' value_only=' || count(*) FILTER (WHERE has_val)
    || ' unset_only=' || count(*) FILTER (WHERE has_unset)
FROM (
  SELECT alldim.dim, pub.id,
    EXISTS (SELECT 1 FROM dims x WHERE x.dim=alldim.dim AND x.dish_id=pub.id) AS has_val,
    EXISTS (SELECT 1 FROM dish_dimension_unset u WHERE u.dish_id=pub.id AND u.dimension=alldim.dim) AS has_unset
  FROM pub CROSS JOIN alldim
) q;
SQL
