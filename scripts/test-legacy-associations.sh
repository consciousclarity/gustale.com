#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────
# test-legacy-associations.sh — WP-B2, the proof that the legacy
# associations reach the public API and are labelled honestly.
#
# WHAT IT PROVES
#
# The blueprint's rule is one sentence: "Every dish shows where it
# belongs, honestly." Two halves, and this script proves both against
# a COPY of the production shape:
#
#   1. EVERY DISH SHOWS WHERE IT BELONGS. Before WP-B2 the answer was
#      no: all 2,713 rows sat at publication_state = 'draft', so
#      /api/places served nothing and /api/places/greece served empty
#      groups. After the migration the place route's predicate returns
#      rows.
#
#   2. HONESTLY. The rows are typed `legacy_unreviewed`, their evidence
#      status is still `unevidenced`, the reviewed rule still says
#      "no" to all of them, and a REJECTED row stays rejected.
#
# WHY IT RUNS AGAINST A COPY
#
# The proof must never touch production. The copy is restored from the
# dump the WP-B2 baseline was taken from, so the row counts are the
# production ones and not a fixture's.
#
# USAGE
#
#   scripts/test-legacy-associations.sh <dump-file> [db-name]
#
# The dump file is required: without the production shape the row
# counts are not the ones the migration asserts, and a test that
# proves nothing is worse than no test.
# ─────────────────────────────────────────────────────────────────────────
set -uo pipefail

REPO="$(cd "$(dirname "$0")/.." && pwd)"
DUMP="${1:-}"
DB_NAME="${2:-gustale_wp_b2_proof}"

if [ -z "$DUMP" ]; then
  echo "FAIL: no dump file given."
  echo "  usage: scripts/test-legacy-associations.sh <dump-file> [db-name]"
  exit 2
fi
if [ ! -f "$DUMP" ]; then
  echo "FAIL: the dump '$DUMP' does not exist."
  exit 2
fi

# The container that holds the test databases. It is the ONLY docker
# container this project may touch (RULE 3).
CONTAINER="${GUSTALE_TEST_PG_CONTAINER:-gustale-test-postgres}"

pass=0
fail=0
ok()   { echo "  ok   $1"; pass=$((pass+1)); }
bad()  { echo "  FAIL $1"; fail=$((fail+1)); }

echo "── the legacy associations, published as Unverified (WP-B2)"

# ── 1. the copy ───────────────────────────────────────────────────────
echo "  restoring the production shape into $DB_NAME"
docker exec "$CONTAINER" psql -U postgres -q -c "DROP DATABASE IF EXISTS $DB_NAME;" >/dev/null 2>&1
docker exec "$CONTAINER" psql -U postgres -q -c "CREATE DATABASE $DB_NAME;" >/dev/null 2>&1 || {
  echo "  FAIL could not create $DB_NAME"; exit 1;
}
docker exec -i "$CONTAINER" pg_restore -U postgres -d "$DB_NAME" < "$DUMP" >/tmp/wp_b2_restore.log 2>&1
if [ $? -ne 0 ]; then
  # pg_restore warns about the objects that already exist, which is
  # expected on a fresh database with the extensions pre-created.
  if ! grep -qiE "already exists" /tmp/wp_b2_restore.log; then
    echo "  FAIL the restore did not succeed"
    grep -E "error" /tmp/wp_b2_restore.log | head -5
    exit 1
  fi
fi
ok "the production shape is restored"

q() { docker exec "$CONTAINER" psql -U postgres -d "$DB_NAME" -Atc "$1"; }

# ── 2. the BASELINE, before the migration ─────────────────────────────
BASE_TOTAL=$(q "SELECT count(*) FROM dish_place_associations")
BASE_LEGACY=$(q "SELECT count(*) FROM dish_place_associations WHERE relationship_type = 'legacy_unreviewed'")
BASE_ESTAB=$(q "SELECT count(*) FROM dish_place_associations WHERE relationship_type = 'established_tradition'")
BASE_PUB=$(q "SELECT count(*) FROM dish_place_associations WHERE publication_state = 'published'")
BASE_EV=$(q "SELECT count(*) FROM dish_place_associations WHERE evidence_status = 'evidenced'")
BASE_REJ=$(q "SELECT count(*) FROM dish_place_associations WHERE review_state = 'rejected'")

echo "  the baseline: $BASE_TOTAL rows ($BASE_LEGACY legacy, $BASE_ESTAB established), $BASE_PUB published"

if [ "$BASE_TOTAL" -gt 0 ] && [ "$BASE_PUB" -eq 0 ]; then
  ok "the baseline is the pre-WP-B2 state: rows exist and NONE is published"
else
  bad "the baseline is not the pre-WP-B2 state ($BASE_TOTAL rows, $BASE_PUB published)"
fi

# ── 3. apply the migration ───────────────────────────────────────────
echo "  applying 0060"
docker exec -i "$CONTAINER" psql -U postgres -d "$DB_NAME" -v ON_ERROR_STOP=1 \
  -f - < "$REPO/db/migrations/0060_legacy_associations_published.sql" >/tmp/wp_b2_m0060.log 2>&1
MIGRATE_RC=$?
if [ $MIGRATE_RC -ne 0 ]; then
  bad "the migration failed (rc=$MIGRATE_RC)"
  grep -E "ERROR|FATAL" /tmp/wp_b2_m0060.log | head -5
  exit 1
fi
grep -qE "0060: ok" /tmp/wp_b2_m0060.log && ok "the migration ran and proved itself" \
  || bad "the migration did not print its ok marker"

# ── 4. every dish shows where it belongs ──────────────────────────────
AFTER_PUB=$(q "SELECT count(*) FROM dish_place_associations WHERE publication_state = 'published'")
if [ "$AFTER_PUB" -eq "$BASE_TOTAL" ]; then
  ok "every row is published ($AFTER_PUB)"
else
  bad "only $AFTER_PUB of $BASE_TOTAL rows are published"
fi

# The place route's predicate must now return rows. This is the whole
# point: /api/places served NOTHING before.
#
# The predicate is SETOF, so it cannot be called in a scalar context.
# It is called as a LATERAL join — the same way the route calls it.
COUNT_PLACES=$(q "SELECT count(*) FROM geo_entities g
                   WHERE g.entity_type IN ('country','region','area')
                     AND EXISTS (SELECT 1 FROM public.visible_place_associations_for_place(g.id) v)")
if [ "$COUNT_PLACES" -gt 0 ]; then
  ok "the place route's predicate returns $COUNT_PLACES places (it returned 0 before)"
else
  bad "the place route's predicate still returns nothing"
fi

# Greece — the blueprint's acceptance criterion names it.
GREECE=$(q "SELECT count(*) FROM geo_entities g
             WHERE g.name = 'Greece'
               AND EXISTS (SELECT 1 FROM public.visible_place_associations_for_place(g.id) v)")
if [ "$GREECE" -gt 0 ]; then
  ok "Greece has visible associations"
else
  bad "Greece still has none"
fi

# ── 5. and HONESTLY ───────────────────────────────────────────────────
AFTER_LEGACY=$(q "SELECT count(*) FROM dish_place_associations WHERE relationship_type = 'legacy_unreviewed'")
if [ "$AFTER_LEGACY" -eq "$BASE_TOTAL" ]; then
  ok "every row is typed legacy_unreviewed — none claims to be an established tradition"
else
  bad "only $AFTER_LEGACY of $BASE_TOTAL rows are legacy_unreviewed"
fi

# ── 5b. THE LEGACY-ROW DEFINITION FINDS EVERY LEGACY ROW ───────────────
#
# The definition accepts a row as legacy when its provenance is one of
# the three the backfill writes, OR when any of its qualifiers is named
# 'legacy...'.
#
# The second half is not decoration. On production 1,235 rows carry
# ONLY the 'legacyStatus' and 'legacyProvenance' qualifiers — a legacy
# TRADITION row has no 'legacyCuisine' and no 'legacyOriginGeoId'. A
# definition that only looked for those two would leave those 1,235
# rows typed 'established_tradition', which is exactly the claim WP-B2
# forbids. This assertion proves the definition catches them.
LEGACY_BY_DEF=$(q "SELECT count(*) FROM dish_place_associations WHERE public.association_is_legacy_row(provenance, qualifiers)")
if [ "$LEGACY_BY_DEF" -eq "$BASE_TOTAL" ]; then
  ok "the legacy-row definition recognises all $BASE_TOTAL rows — including the tradition rows whose only marker is 'legacyStatus'"
else
  bad "the definition recognises only $LEGACY_BY_DEF of $BASE_TOTAL rows"
fi

# A row that is NOT legacy must not be recognised as one. There is no
# such row on production, so the check is on the FUNCTION, against a
# made-up pair of values: a row with a non-legacy provenance and no
# legacy qualifier.
NOT_LEGACY=$(q "SELECT public.association_is_legacy_row('atlas_fixture', '{\"other\": 1}'::jsonb)")
if [ "$NOT_LEGACY" = "f" ]; then
  ok "a row with no legacy provenance and no legacy qualifier is NOT legacy"
else
  bad "the definition recognised a non-legacy row as legacy"
fi

# A row whose qualifier is named 'legacy...' IS legacy, whatever its
# provenance says — the CI fixture labels its rows 'atlas_fixture' and
# they are legacy rows all the same.
QUAL_LEGACY=$(q "SELECT public.association_is_legacy_row('atlas_fixture', '{\"legacyStatus\": \"active\"}'::jsonb)")
if [ "$QUAL_LEGACY" = "t" ]; then
  ok "a row with a 'legacy...' qualifier is legacy whatever its provenance says"
else
  bad "the definition missed a row whose only legacy marker is a qualifier"
fi

AFTER_EV=$(q "SELECT count(*) FROM dish_place_associations WHERE evidence_status = 'evidenced'")
if [ "$AFTER_EV" -eq "$BASE_EV" ]; then
  ok "no row gained evidence it does not have ($AFTER_EV evidenced, as before)"
else
  bad "the evidence count moved from $BASE_EV to $AFTER_EV — this migration must not invent evidence"
fi

AFTER_REJ=$(q "SELECT count(*) FROM dish_place_associations WHERE review_state = 'rejected'")
if [ "$AFTER_REJ" -eq "$BASE_REJ" ]; then
  ok "no row's review state moved ($AFTER_REJ rejected, as before)"
else
  bad "the rejected count moved from $BASE_REJ to $AFTER_REJ"
fi

# The reviewed rule must still say NO to all of them. That is the
# owner's rule of 2026-11-13 and WP-B2 must not weaken it.
#
# The count is over the DISHES that have associations, so it is the
# number of dishes the reviewed rule says something about.
REVIEWED_TOTAL=$(q "SELECT count(*) FROM dishes d
                       WHERE EXISTS (SELECT 1 FROM public.published_associations_for_dish(d.id) v)")
if [ "$REVIEWED_TOTAL" -eq 0 ]; then
  ok "the reviewed rule still returns nothing — it was NOT weakened"
else
  bad "the reviewed rule now returns $REVIEWED_TOTAL rows — it was weakened"
fi

# A rejected row must not come back through the legacy path either.
REJ_VISIBLE=$(q "SELECT count(*) FROM dish_place_associations a
                  WHERE a.review_state = 'rejected'
                    AND EXISTS (SELECT 1 FROM public.published_legacy_associations_for_dish(a.dish_id) v)")
if [ "$REJ_VISIBLE" -eq 0 ]; then
  ok "no rejected row is visible through the legacy path"
else
  bad "$REJ_VISIBLE rejected rows are visible"
fi

# ── 6. the pilot survives ─────────────────────────────────────────────
PILOT=$(q "SELECT count(*) FROM dish_place_associations WHERE review_state = 'in_review'")
if [ "$PILOT" -ge 50 ]; then
  ok "the #186 pilot's $PILOT in_review rows are intact"
else
  bad "the pilot's in_review rows fell to $PILOT"
fi

# ── 7. and the ledger ─────────────────────────────────────────────────
LEDGER=$(q "SELECT count(*) FROM public.gus_migrations_applied WHERE name LIKE '%0060%'")
if [ "$LEDGER" -ge 1 ]; then
  ok "the migration recorded itself in the ledger"
else
  bad "the migration did not record itself in the ledger"
fi

# ── 8. it is restartable ──────────────────────────────────────────────
docker exec -i "$CONTAINER" psql -U postgres -d "$DB_NAME" -v ON_ERROR_STOP=1 \
  -f - < "$REPO/db/migrations/0060_legacy_associations_published.sql" >/tmp/wp_b2_m0060_again.log 2>&1
if [ $? -eq 0 ]; then
  ok "a second run is a no-op — the migration is restartable"
else
  bad "a second run failed — the migration is not restartable"
  grep -E "ERROR|FATAL" /tmp/wp_b2_m0060_again.log | head -5
fi

REPUB=$(q "SELECT count(*) FROM dish_place_associations WHERE publication_state = 'published'")
if [ "$REPUB" -eq "$BASE_TOTAL" ]; then
  ok "the second run published nothing extra"
else
  bad "the second run changed the published count to $REPUB"
fi

# ── the result ────────────────────────────────────────────────────────
echo
echo "  $pass passed, $fail failed"
if [ "$fail" -gt 0 ]; then
  echo "  WP-B2: the proof FAILED"
  exit 1
fi
echo "  WP-B2: the proof passed"
exit 0
