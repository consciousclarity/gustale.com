#!/usr/bin/env bash
# Verify the Stage B seed against a test database.
#
# Gate B's pass conditions (docs/RECIPES-INGREDIENT-BACKFILL-PLAN.md):
#   * the row count equals the approved list's length
#   * every slug is unique
#   * every category resolves against the vocabulary
#   * no description text was written
#   * status is 'draft'
#
# Usage: verify-pantry-seed.sh <database> [csv] [seed.sql]
set -uo pipefail

DB="${1:?usage: verify-pantry-seed.sh <database> [csv] [seed.sql]}"
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CSV="${2:-$REPO/docs/PANTRY-LIST-moussaka-greek.csv}"
SEED="${3:-$REPO/packages/db/seed-moussaka-ingredients.sql}"
CONTAINER="${TEST_PG_CONTAINER:-gustale-test-postgres}"

q() {
  docker exec -u postgres "$CONTAINER" \
    psql -U postgres -d "$DB" -tAc "$1" 2>/dev/null | tr -d ' '
}

fail=0
note() { echo "  $1"; }
bad()  { echo "  FAIL: $1"; fail=1; }

echo "── applying the seed to $DB ─────────────────────────────────"
if docker exec -u postgres -i "$CONTAINER" psql -U postgres -d "$DB" \
      -v ON_ERROR_STOP=1 -q < "$SEED" >/tmp/pantry_seed_apply.log 2>&1; then
  note "the seed applied cleanly"
else
  bad "the seed FAILED to apply"
  tail -12 /tmp/pantry_seed_apply.log
  exit 1
fi

echo "── the approved list ────────────────────────────────────────"
expected=$(($(wc -l < "$CSV") - 1))
note "the approved list has $expected rows"

echo "── 1. the row count ─────────────────────────────────────────"
# Only the rows this seed is responsible for.
slugs=$(python3 - "$CSV" <<'PY'
import csv, sys
with open(sys.argv[1], newline="", encoding="utf-8") as f:
    for r in csv.DictReader(f):
        print(r["slug"])
PY
)
in_list=$(q "SELECT count(*) FROM ingredients WHERE slug IN ($(printf "'%s'," $slugs | sed 's/,$//'))")
if [ "$in_list" = "$expected" ]; then
  note "PASS — $in_list/$expected rows present"
else
  bad "expected $expected rows, found $in_list"
fi

echo "── 2. every slug is unique ──────────────────────────────────"
dupes=$(q "SELECT count(*) FROM (SELECT slug FROM ingredients GROUP BY slug HAVING count(*) > 1) d")
if [ "$dupes" = "0" ]; then
  note "PASS — no duplicate slugs"
else
  bad "$dupes duplicated slug(s)"
fi

echo "── 3. every category resolves against the vocabulary ─────────"
unresolved=$(q "SELECT count(*) FROM ingredients i WHERE i.slug IN ($(printf "'%s'," $slugs | sed 's/,$//')) AND i.category IS NOT NULL AND NOT EXISTS (SELECT 1 FROM ingredient_categories c WHERE c.slug = i.category)")
if [ "$unresolved" = "0" ]; then
  note "PASS — every category resolves"
else
  bad "$unresolved row(s) carry a category that is not in the vocabulary"
fi

echo "── 4. no description text was written ────────────────────────"
described=$(q "SELECT count(*) FROM ingredients WHERE slug IN ($(printf "'%s'," $slugs | sed 's/,$//')) AND (coalesce(short_description,'') <> '' OR coalesce(long_description,'') <> '')")
if [ "$described" = "0" ]; then
  note "PASS — every row has an empty description"
else
  bad "$described row(s) carry a description"
fi

echo "── 5. every NEW row is draft ─────────────────────────────────"
# Gate B's "status='draft'" applies to the rows this backfill WRITES.
# The four REUSED rows (eggplant, lamb-mince, tomato, bechamel) were
# created 'published' by packages/db/seed-moussaka.sql and have live
# pages (gustale.recipes/ingredients/<slug> -> HTTP 200). Stage B
# only fills in their `category`; it must NOT demote them, because
# demoting published content is publication (Gate C), not a
# backfill.
#
# So: the NEW rows must be draft, and the REUSED rows must be left
# exactly as they were.
new_slugs=$(python3 - "$CSV" <<'PY'
import csv, sys
EXISTING = {"eggplant", "lamb-mince", "tomato", "bechamel"}
with open(sys.argv[1], newline="", encoding="utf-8") as f:
    for r in csv.DictReader(f):
        if r["slug"] not in EXISTING:
            print(r["slug"])
PY
)
in_new=$(q "SELECT count(*) FROM ingredients WHERE slug IN ($(printf "'%s'," $new_slugs | sed 's/,$//'))")
notdraft=$(q "SELECT count(*) FROM ingredients WHERE slug IN ($(printf "'%s'," $new_slugs | sed 's/,$//')) AND status <> 'draft'")
if [ "$notdraft" = "0" ]; then
  note "PASS — all $in_new new rows are status='draft'"
else
  bad "$notdraft of the new row(s) are not draft"
fi

echo "── 5b. the 4 reused rows were NOT demoted ────────────────────"
demoted=$(q "SELECT count(*) FROM ingredients WHERE slug IN ('eggplant','lamb-mince','tomato','bechamel') AND status <> 'published'")
if [ "$demoted" = "0" ]; then
  note "PASS — the reused rows are still published"
else
  bad "$demoted reused row(s) were demoted away from published"
fi

echo "── 6. is_optional matches the approved list ───────────────────"
mismatch=$(python3 - "$CSV" "$DB" <<'PY'
import csv, subprocess, sys
csv_path, db = sys.argv[1], sys.argv[2]
want = {}
with open(csv_path, newline="", encoding="utf-8") as f:
    for r in csv.DictReader(f):
        want[r["slug"]] = r.get("is_optional", "false")
slugs = ",".join("'%s'" % s for s in want)
sql = ("SELECT i.slug||'='||di.is_optional FROM dish_ingredients di "
       "JOIN public.ingredients i ON i.id = di.ingredient_id "
       "JOIN public.dishes d ON d.id = di.dish_id "
       "WHERE d.slug = 'moussaka-greek' AND i.slug IN (%s)" % slugs)
out = subprocess.run(
    ["docker", "exec", "-u", "postgres", "gustale-test-postgres",
     "psql", "-U", "postgres", "-d", db, "-tAc", sql],
    capture_output=True, text=True).stdout
got = {}
for line in out.splitlines():
    if "=" in line:
        s, v = line.strip().split("=", 1)
        got[s] = v
bad = []
for slug, w in want.items():
    if slug not in got:
        bad.append("%s: no dish_ingredients row" % slug)
    elif got[slug] != w:
        bad.append("%s: is_optional=%s, the list says %s" % (slug, got[slug], w))
if bad:
    for b in bad:
        print("   -", b)
    sys.exit(1)
PY
)
if [ $? -eq 0 ]; then
  note "PASS — every is_optional matches the approved list"
else
  bad "the is_optional flags do not match the approved list"
fi

echo "── 7. the FK holds (0054) ───────────────────────────────────"
fk=$(q "SELECT count(*) FROM pg_constraint WHERE conname = 'ingredients_category_fk'")
if [ "$fk" -ge 1 ] 2>/dev/null; then
  note "PASS — the ingredients_category_fk constraint is present"
else
  note "NOTE — no ingredients_category_fk constraint in this database (0054 not applied here)"
fi

echo "── 8. idempotent re-apply ──────────────────────────────────"
before=$(q "SELECT count(*) FROM ingredients WHERE slug IN ($(printf "'%s'," $slugs | sed 's/,$//'))")
if docker exec -u postgres -i "$CONTAINER" psql -U postgres -d "$DB" \
      -v ON_ERROR_STOP=1 -q < "$SEED" >/tmp/pantry_seed_reapply.log 2>&1; then
  after=$(q "SELECT count(*) FROM ingredients WHERE slug IN ($(printf "'%s'," $slugs | sed 's/,$//'))")
  if [ "$before" = "$after" ]; then
    note "PASS — re-applying changed nothing ($after rows)"
  else
    bad "re-apply changed the row count: $before -> $after"
  fi
else
  bad "the re-apply FAILED"
  tail -8 /tmp/pantry_seed_reapply.log
fi

echo "── 9. a failed seed rolls back completely ───────────────────"
# The seed runs in ONE transaction, so a failure anywhere leaves no
# trace. This is proved on a THROWAWAY database that is built from the
# PRE-SEED state -- a clone of the current database would already
# contain the seed's rows, and the proof would measure nothing.
PRE_DB="${DB}_preseed"
ROLLBACK_DB="${DB}_rollback"
docker exec -u postgres "$CONTAINER" psql -U postgres -d postgres \
  -c "DROP DATABASE IF EXISTS ${PRE_DB}" >/dev/null 2>&1
docker exec -u postgres "$CONTAINER" psql -U postgres -d postgres \
  -c "DROP DATABASE IF EXISTS ${ROLLBACK_DB}" >/dev/null 2>&1
# Rebuild a clean pre-seed database: the chain plus the four original
# ingredient rows, with none of the seed applied.
if bash "$REPO/scripts/ci-migration-chain.sh" "$PRE_DB" >/tmp/pantry_preseed_chain.log 2>&1; then
  docker exec -u postgres -i "$CONTAINER" psql -U postgres -d "$PRE_DB" \
    -v ON_ERROR_STOP=1 -q < "$REPO/packages/db/seed-moussaka.sql" \
    >/tmp/pantry_preseed_seed.log 2>&1
  pre_count=$(docker exec -u postgres "$CONTAINER" psql -U postgres -d "$PRE_DB" \
    -tAc "SELECT count(*) FROM ingredients")
  if [ "$pre_count" != "4" ]; then
    bad "the pre-seed database has $pre_count ingredients (expected 4)"
  fi
else
  bad "could not build the pre-seed database"
  tail -6 /tmp/pantry_preseed_chain.log
fi

if [ "$pre_count" = "4" ]; then
  # Inject a deliberate failure AFTER the inserts, so the rollback has
  # something to undo.
  broken="${TMPDIR:-/tmp}/pantry_seed_broken.sql"
  cat "$SEED" > "$broken"
  python3 - "$broken" <<'PY'
import sys
p = sys.argv[1]
s = open(p).read()
s = s.replace("COMMIT;", "DO $$ BEGIN RAISE EXCEPTION 'DELIBERATE FAILURE - the seed must roll back'; END $$;", 1)
open(p, 'w').write(s)
PY
  if docker exec -u postgres -i "$CONTAINER" psql -U postgres -d "$PRE_DB" \
        -v ON_ERROR_STOP=1 -q < "$broken" >/tmp/pantry_seed_rollback.log 2>&1; then
    bad "the broken seed SUCCEEDED — the transaction did not roll back"
  else
    # The failed seed ran against the PRE-SEED database.
    after=$(docker exec -u postgres "$CONTAINER" psql -U postgres -d "$PRE_DB" \
      -tAc "SELECT count(*) FROM ingredients WHERE slug IN ($(printf "'%s'," $slugs | sed 's/,$//'))")
    if [ "$after" = "4" ]; then
      note "PASS — the failed seed left only the 4 pre-existing rows (no trace)"
    else
      bad "the failed seed left $after rows behind (expected 4)"
    fi
  fi
fi
docker exec -u postgres "$CONTAINER" psql -U postgres -d postgres \
  -c "DROP DATABASE IF EXISTS ${PRE_DB}" >/dev/null 2>&1
docker exec -u postgres "$CONTAINER" psql -U postgres -d postgres \
  -c "DROP DATABASE IF EXISTS ${ROLLBACK_DB}" >/dev/null 2>&1

echo
if [ "$fail" = "0" ]; then
  echo "  ALL CHECKS PASS"
else
  echo "  THERE ARE FAILURES"
fi
exit $fail
