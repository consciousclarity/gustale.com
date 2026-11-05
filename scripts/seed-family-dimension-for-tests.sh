#!/usr/bin/env bash
# Populate the family dimension on the throwaway test database.
#
# WHY THIS IS NEEDED
# ------------------
# The CI seed publishes 7 dishes and creates 28 rows in
# `dish_families` -- but it never creates a single row in
# `dish_dish_families`. The dimension is defined and empty.
#
# That means a test of the `family=` filter against the CI seed
# measures NOTHING: every slug returns zero because no dish is
# attached to any family, not because the filter is broken.
#
# So this script attaches families to the seeded dishes, using only
# family slugs that actually exist in the seeded dimension. It runs
# only against a throwaway database, and it is not a migration -- it
# is a fixture, and it is never applied to live.
set -euo pipefail
cd "$(dirname "$0")/.."

DB="${1:-gustale_pr3_vitest}"

echo "=== attach families to the seeded dishes on $DB ==="
docker exec -u postgres -i shared-postgres psql -U postgres -d "$DB" \
  -v ON_ERROR_STOP=1 <<'SQL'
-- The 'family = unset' rows must go FIRST. The ddu_guard_value
-- trigger refuses to let a dish that is recorded as having no family
-- be given one -- and every CI-seeded dish carries exactly such a
-- row, with reason 'no_evidence'.
--
-- This is the same order migration 0016_gus242_cuisines.sql uses for
-- the cuisine dimension: clear the stale unset rows, THEN insert the
-- links. It is a FIXTURE, so it is allowed to overrule the guard:
-- the point of the fixture is to give the filter something to find.
DELETE FROM dish_dimension_unset u
  USING dishes d
 WHERE u.dish_id = d.id
   AND u.dimension = 'family'
   AND u.reason = 'no_evidence';

-- The seeded dishes, each attached to the families a real dish of
-- that kind would carry. Only slugs that exist in the seeded
-- dimension are used, so the fixture never depends on a slug the
-- seed does not have.
INSERT INTO dish_dish_families (dish_id, value_id, status)
SELECT d.id, f.id, 'active'
FROM dishes d
JOIN (VALUES
    ('moussaka-greek',       'casserole'),
    ('chicken-tikka-masala', 'curry'),
    ('chicken-tikka-masala', 'stew'),
    ('falafel',              'salad'),
    ('gazpacho',             'soup'),
    ('rendang',              'stew'),
    ('rendang',              'curry'),
    ('tacos-al-pastor',      'salad'),
    ('vindaloo',             'curry'),
    ('vindaloo',             'stew'),
    ('test-fixture-drink',   'soup')
) AS m(dish_slug, family_slug)
  ON m.dish_slug = d.slug
JOIN dish_families f ON f.slug = m.family_slug
WHERE d.status = 'published'
ON CONFLICT DO NOTHING;

-- A DRINK, so content_type=drink has something to return. The CI
-- seed publishes none of the nine verified drinks, and the filter
-- needs a row to filter.
--
-- 'lassi' is one of the nine VERIFIED drinks -- a yogurt-based
-- drink -- so this is a realistic record, not a synthetic one.
INSERT INTO dishes (
  id, slug, canonical_name, short_description, status, content_type,
  created_at, updated_at
)
VALUES (
  '00000000-0000-0000-0000-0000000000d1', 'lassi', 'Lassi',
  'A yogurt-based drink, blended with water, sugar and sometimes spices.',
  'published', 'drink', now(), now()
)
ON CONFLICT (slug) DO UPDATE SET content_type = 'drink';

-- A DESSERT that carries the drink family tag -- the Pelamushi case,
-- which is the whole reason content_type is an editorial field and
-- not a derived one. The migration sets it to 'dish'.
INSERT INTO dishes (
  id, slug, canonical_name, short_description, status, content_type,
  created_at, updated_at
)
VALUES (
  '00000000-0000-0000-0000-0000000000d2', 'pelamushi', 'Pelamushi',
  'A Georgian milk porridge with plum and honey, served as a dessert.',
  'published', 'dish', now(), now()
)
ON CONFLICT (slug) DO UPDATE SET content_type = 'dish';
SQL

echo
echo "=== what the fixture produced ==="
docker exec -u postgres -i shared-postgres psql -U postgres -d "$DB" \
  -c "
SELECT d.slug, d.content_type, string_agg(f.slug, ', ' ORDER BY f.slug) AS families
FROM dishes d
LEFT JOIN dish_dish_families x ON x.dish_id = d.id AND x.status='active'
LEFT JOIN dish_families f ON f.id = x.value_id
WHERE d.status = 'published'
GROUP BY d.slug, d.content_type
ORDER BY d.slug;
"
