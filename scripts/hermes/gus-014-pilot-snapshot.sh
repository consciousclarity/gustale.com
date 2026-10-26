#!/usr/bin/env bash
#
# GUS-014 pilot — V3 snapshot / V4 rollback tooling.
#
#   snapshot.sh   create a restorable pre-pilot snapshot (live -> file)
#   restore.sh    restore a snapshot into a TARGET database (never the live one)
#   verify.sh     compare a database against the snapshot baseline
#
# SAFETY: restore.sh REFUSES to target the live database (`gustale`).
# The rollback test (V4) runs against a throwaway copy, never live.
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
SNAPSHOT_DIR="${GUS014_SNAPSHOT_DIR:-$REPO_ROOT/.hermes/snapshots/gus-014}"
PG_CONTAINER="${PG_CONTAINER:-shared-postgres}"
PG_SUPERUSER="${PG_SUPERUSER:-postgres}"
LIVE_DB="${LIVE_DB:-gustale}"
PILOT_SLUGS="'rendang','chicken-tikka-masala','tacos-al-pastor'"

# The live DB must never be a restore target.
# Guard rules:
#   - the exact live DB name is refused
#   - postgres / template / default maintenance DBs are refused
#   - the target must look like an explicit throwaway (contains '_pilot' or
#     '_test' or '_staging' or '_copy'), so an accidental typo can never
#     target something that looks production
forbidden_target() {
  local t="$1"
  if [ "$t" = "$LIVE_DB" ]; then
    echo "REFUSED: '$t' IS the live database." >&2
    echo "Restore into a separate database only." >&2
    exit 2
  fi
  case "$t" in
    postgres|template0|template1)
      echo "REFUSED: '$t' is a PostgreSQL system database." >&2; exit 2 ;;
  esac
  case "$t" in
    *_pilot*|*_test*|*_staging*|*_copy*|*_rollback*) : ;; # explicit throwaway - allowed
    *)
      echo "REFUSED: '$t' does not look like a throwaway database." >&2
      echo "A restore target must contain one of: _pilot _test _staging _copy _rollback" >&2
      echo "(the live database is '$LIVE_DB')." >&2
      exit 2 ;;
  esac
}

psql_run() {
  local db="$1"; shift
  docker exec -i "$PG_CONTAINER" psql -v ON_ERROR_STOP=1 -U "$PG_SUPERUSER" -d "$db" "$@"
}

# Canonical per-dish content digest. Covers every table the pilot touches:
# categories, both description columns, translations, citations, ingredients,
# and relations. Any change to any of these changes the digest.
cat_digest_sql() {
cat <<'SQL'
WITH per_dish AS (
  SELECT d.id, d.slug,
    coalesce((
      SELECT string_agg('cat:'||c.name||':'||coalesce(dc.is_primary::text,''), ' ~ ' ORDER BY c.name)
      FROM dish_categories dc JOIN categories c ON c.id=dc.category_id
      WHERE dc.dish_id=d.id
    ), '') || '|' ||
    coalesce(d.short_description,'') || '|' ||
    coalesce(d.long_description,'') || '|' ||
    coalesce((
      SELECT string_agg('tr:'||dt.language||':'||coalesce(dt.description,'')||':'||coalesce(dt.name,''), ' ~ ' ORDER BY dt.language)
      FROM dish_translations dt WHERE dt.dish_id=d.id
    ), '') || '|' ||
    coalesce((
      SELECT string_agg('cite:'||coalesce(cit.claim_text,'')||':'||coalesce(s.url,''), ' ~ ' ORDER BY cit.id)
      FROM citations cit LEFT JOIN sources s ON s.id=cit.source_id
      WHERE cit.target_type='dish' AND cit.target_id=d.id
    ), '') || '|' ||
    coalesce((
      SELECT string_agg('ing:'||coalesce(i.canonical_name,'')||':'||coalesce(di.quantity,'')||':'||coalesce(di.unit,''), ' ~ ' ORDER BY i.canonical_name)
      FROM dish_ingredients di LEFT JOIN ingredients i ON i.id=di.ingredient_id
      WHERE di.dish_id=d.id
    ), '') || '|' ||
    coalesce((
      SELECT string_agg('rel:'||dr.relation_type||':'||coalesce(dr.reason,''), ' ~ ' ORDER BY dr.id)
      FROM dish_relations dr WHERE dr.from_dish_id=d.id OR dr.to_dish_id=d.id
    ), '') AS content_digest
  FROM dishes d
)
SELECT id, slug, md5(content_digest) FROM per_dish ORDER BY slug;
SQL
}

# Canonical per-pilot-dish baseline (readable, one row per pilot dish).
pilot_baseline_sql() {
cat <<SQL
SELECT d.id, d.slug, d.canonical_name, d.status, d.created_at, d.updated_at, d.edit_count,
  coalesce(d.short_description,''),
  coalesce(d.long_description,''),
  (SELECT string_agg(c.name, '|' ORDER BY c.name) FROM dish_categories dc JOIN categories c ON c.id=dc.category_id WHERE dc.dish_id=d.id),
  (SELECT string_agg(dt.language||':'||coalesce(dt.name,'')||':'||coalesce(dt.description,''), ' ~ ' ORDER BY dt.language) FROM dish_translations dt WHERE dt.dish_id=d.id),
  (SELECT count(*) FROM citations c WHERE c.target_type='dish' AND c.target_id=d.id),
  (SELECT count(*) FROM edit_history e WHERE e.target_id=d.id),
  (SELECT count(*) FROM dish_ingredients di WHERE di.dish_id=d.id),
  (SELECT count(*) FROM dish_relations dr WHERE dr.from_dish_id=d.id OR dr.to_dish_id=d.id)
FROM dishes d WHERE d.slug IN ($PILOT_SLUGS)
ORDER BY d.slug;
SQL
}

# ---------------------------------------------------------------- snapshot ---
cmd_snapshot() {
  local label="${1:-$(date -u +%Y%m%dT%H%M%SZ)}"
  local dir="$SNAPSHOT_DIR/$label"
  mkdir -p "$dir"

  echo "==> snapshot '$label'"

  echo "    dumping database '$LIVE_DB'..."
  docker exec "$PG_CONTAINER" pg_dump -U "$PG_SUPERUSER" -Fc "$LIVE_DB" > "$dir/db.dump"
  echo "    -> $dir/db.dump ($(du -h "$dir/db.dump" | cut -f1))"

  echo "    dumping schema..."
  docker exec "$PG_CONTAINER" pg_dump -U "$PG_SUPERUSER" --schema-only --no-owner --no-privileges "$LIVE_DB" > "$dir/schema.sql"

  echo "    capturing pilot-dish baseline..."
  psql_run "$LIVE_DB" -tA -F $'\t' -c "$(pilot_baseline_sql)" > "$dir/pilot-baseline.tsv"
  echo "    -> $dir/pilot-baseline.tsv ($(wc -l < "$dir/pilot-baseline.tsv") rows)"

  echo "    capturing full-catalog baseline..."
  psql_run "$LIVE_DB" -tA -F $'\t' -c "$(cat_digest_sql)" > "$dir/catalog-baseline.tsv"
  echo "    -> $dir/catalog-baseline.tsv ($(wc -l < "$dir/catalog-baseline.tsv") dishes)"

  echo "    capturing edit_history high-water mark..."
  psql_run "$LIVE_DB" -tA -F $'\t' -c "SELECT coalesce(max(created_at)::text,'none') FROM edit_history;" > "$dir/edit-history-max-created-at.txt"

  ( cd "$dir" && sha256sum db.dump schema.sql pilot-baseline.tsv catalog-baseline.tsv edit-history-max-created-at.txt > SHA256SUMS )
  cat > "$dir/MANIFEST.txt" <<EOF
GUS-014 pilot snapshot
label:        $label
created_utc:  $(date -u +%Y-%m-%dT%H:%M:%SZ)
live_db:      $LIVE_DB (read-only source)
restore_to:   ANY database except '$LIVE_DB'
contents:
  db.dump                       full logical dump (pg_dump -Fc) - the restore source
  schema.sql                    schema-only dump, human-readable
  pilot-baseline.tsv            per-pilot-dish baseline (3 rows)
  catalog-baseline.tsv          all-dish content digests ($(wc -l < "$dir/catalog-baseline.tsv") rows)
  edit-history-max-created-at.txt  edit_history high-water mark at snapshot time
  SHA256SUMS                    checksums
EOF
  echo "    manifest written"
  echo "==> snapshot complete: $dir"
  echo
  echo "RESTORE (into a non-live database):"
  echo "  $SCRIPT_DIR/gus-014-pilot-snapshot.sh restore $dir gustale_pilot_restore"
}

# ---------------------------------------------------------------- restore ---
cmd_restore() {
  local dir="${1:?usage: restore <snapshot-dir> <target-db>}"
  local target="${2:?usage: restore <snapshot-dir> <target-db>}"
  forbidden_target "$target"
  [ -f "$dir/db.dump" ] || { echo "REFUSED: no db.dump in $dir" >&2; exit 2; }

  echo "==> restoring '$dir' into '$target'"

  psql_run postgres -c "DROP DATABASE IF EXISTS \"$target\" WITH (FORCE);"
  psql_run postgres -c "CREATE DATABASE \"$target\";"

  echo "    pg_restore..."
  docker cp "$dir/db.dump" "$PG_CONTAINER":/tmp/gus014_restore.dump
  docker exec "$PG_CONTAINER" pg_restore -U "$PG_SUPERUSER" -d "$target" --no-owner --no-privileges --exit-on-error /tmp/gus014_restore.dump
  docker exec "$PG_CONTAINER" rm -f /tmp/gus014_restore.dump

  echo "    verifying row counts..."
  local restored
  restored="$(psql_run "$target" -tAc "SELECT count(*) FROM dishes;")"
  echo "    dishes in '$target': $restored"
  echo "==> restore complete: '$target'"
}

# ----------------------------------------------------------------- verify ---
cmd_verify() {
  local dir="${1:?usage: verify <snapshot-dir> <target-db>}"
  local target="${2:?usage: verify <snapshot-dir> <target-db>}"
  # verify is READ-ONLY (it only SELECTs), so it MAY target the live database.
  # It must never be used to restore.
  [ -f "$dir/pilot-baseline.tsv" ] || { echo "no pilot-baseline.tsv in $dir" >&2; exit 2; }

  echo "==> verifying '$target' against '$dir' (READ-ONLY: SELECTs only, no writes)"
  local rc=0

  if [ -f "$dir/SHA256SUMS" ]; then
    echo "-- snapshot checksum"
    ( cd "$dir" && sha256sum -c SHA256SUMS ) || rc=1
  fi

  echo "-- pilot dish baseline"
  psql_run "$target" -tA -F $'\t' -c "$(pilot_baseline_sql)" > "$dir/pilot-verify.tsv"
  if diff -u "$dir/pilot-baseline.tsv" "$dir/pilot-verify.tsv" > "$dir/pilot-diff.txt"; then
    echo "   pilot baseline: IDENTICAL"
  else
    echo "   pilot baseline: DIFFERS -> $dir/pilot-diff.txt"; rc=1
  fi

  echo "-- catalog digest"
  psql_run "$target" -tA -F $'\t' -c "$(cat_digest_sql)" > "$dir/catalog-verify.tsv"
  if diff -u "$dir/catalog-baseline.tsv" "$dir/catalog-verify.tsv" > "$dir/catalog-diff.txt"; then
    echo "   catalog digest: IDENTICAL ($(wc -l < "$dir/catalog-verify.tsv") dishes)"
  else
    echo "   catalog digest: DIFFERS -> $dir/catalog-diff.txt"; rc=1
  fi

  [ $rc -eq 0 ] && echo "==> VERIFY OK" || echo "==> VERIFY FAILED"
  return $rc
}

case "${1:-}" in
  snapshot) shift; cmd_snapshot "$@" ;;
  restore)  shift; cmd_restore "$@" ;;
  verify)   shift; cmd_verify "$@" ;;
  *) echo "usage: $0 {snapshot|restore|verify} ..." >&2; exit 1 ;;
esac
