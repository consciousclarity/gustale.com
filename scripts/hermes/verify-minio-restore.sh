#!/usr/bin/env bash
#
# GUS-012 — MinIO (object storage) offsite backup restore verification.
#
# The Postgres side of the offsite backup was proven restorable on
# 2026-10-16 (offsite .dump.gpg -> throwaway postgis container ->
# 121/121 published dishes matched the live API).
#
# The MinIO side had NOT been verified. This script proves it.
#
# What backup.py does (read 2026-10-25 from /home/deploy/gustale.com/
# backups/backup.py): `backup_media()` runs
#
#   rclone sync minio:<bucket> gdrive-crypt:media/<bucket>
#     --backup-dir gdrive-crypt:media/deleted/<day>/<bucket>
#
# for BOTH buckets (gustale-public, gustale-media). So the objects
# live on the encrypted rclone remote, one file per object, NOT in a
# local tarball. This script pulls them back and compares.
#
# Method (read-only with respect to live data):
#   1. Inventory the live MinIO buckets (what MUST survive a restore).
#   2. Pull the offsite (encrypted) copies into a staging dir.
#   3. Compare: every live key present offsite, byte size identical,
#      and sha256 identical for EVERY object (not a sample — the
#      total is ~1.5 MB, so hashing everything is cheap).
#   4. Load the staged objects into a THROWAWAY MinIO container and
#      verify it actually serves them (the same way Caddy serves
#      /media/* in production).
#   5. Tear the throwaway container down. Live is never touched.
#
# Usage (on the VPS, as the deploy user):
#   bash scripts/hermes/verify-minio-restore.sh
#
# Env:
#   MINIO_ENDPOINT       default http://127.0.0.1:9000
#   MINIO_ACCESS_KEY     from /home/deploy/gustale.com/.env
#   MINIO_SECRET_KEY     from /home/deploy/gustale.com/.env
#   MINIO_BUCKET_PUBLIC  default gustale-public
#   MINIO_BUCKET_PRIVATE default gustale-media
#   REMOTE_MEDIA_ROOT    default gdrive-crypt:media
#   RESTORE_PORT         default 19000
#
# Exit 0 = the object backup is proven restorable; 1 = NOT proven.

set -euo pipefail

DEPLOY_DIR="${DEPLOY_DIR:-/home/deploy/gustale.com}"
ENV_FILE="${ENV_FILE:-$DEPLOY_DIR/.env}"
PUBLIC_BUCKET="${MINIO_BUCKET_PUBLIC:-gustale-public}"
PRIVATE_BUCKET="${MINIO_BUCKET_PRIVATE:-gustale-media}"
REMOTE_MEDIA_ROOT="${REMOTE_MEDIA_ROOT:-gdrive-crypt:media}"
RESTORE_PORT="${RESTORE_PORT:-19000}"
RESTORE_IMAGE="${RESTORE_IMAGE:-minio/minio:latest}"
WORK="$(mktemp -d /tmp/gus012-minio-restore.XXXXXX)"

log()  { printf '%s\n' "$*"; }
fail() { printf 'FAIL: %s\n' "$*" >&2; exit 1; }

cleanup() {
  log "--- teardown ---"
  docker rm -f gus012-minio-restore >/dev/null 2>&1 || true
  docker network rm gus012-minio-restore-net >/dev/null 2>&1 || true
  rm -rf "$WORK"
}
trap cleanup EXIT

# ── 0. Credentials (never printed) ────────────────────────────────────
if [ -f "$ENV_FILE" ]; then
  set -a
  # shellcheck disable=SC1091
  . "$ENV_FILE"
  set +a
fi
: "${MINIO_ACCESS_KEY:?MINIO_ACCESS_KEY not set and not in $ENV_FILE}"
: "${MINIO_SECRET_KEY:?MINIO_SECRET_KEY not set and not in $ENV_FILE}"
MINIO_ENDPOINT="${MINIO_ENDPOINT:-http://127.0.0.1:9000}"

export RCLONE_CONFIG_MINIO_TYPE=s3
export RCLONE_CONFIG_MINIO_PROVIDER=Minio
export RCLONE_CONFIG_MINIO_ENV_AUTH=false
export RCLONE_CONFIG_MINIO_ACCESS_KEY_ID="$MINIO_ACCESS_KEY"
export RCLONE_CONFIG_MINIO_SECRET_ACCESS_KEY="$MINIO_SECRET_KEY"
export RCLONE_CONFIG_MINIO_ENDPOINT="$MINIO_ENDPOINT"
export RCLONE_CONFIG_MINIO_ACL=private

command -v rclone >/dev/null 2>&1 || fail "rclone not installed"
rclone listremotes 2>/dev/null | grep -qx 'gdrive-crypt:' \
  || fail "missing the gdrive-crypt: rclone remote"

# ── 1. Inventory the LIVE buckets ─────────────────────────────────────
log "=== 1. inventorying live buckets at $MINIO_ENDPOINT ==="
mkdir -p "$WORK/live" "$WORK/offsite"
for b in "$PUBLIC_BUCKET" "$PRIVATE_BUCKET"; do
  rclone lsf -R --files-only "minio:$b" > "$WORK/live/$b.keys" 2>/dev/null || true
  # One lsjson for the whole bucket -> "key<TAB>size" table.
  rclone lsjson -R --files-only "minio:$b" 2>/dev/null \
    | sed -n 's/.*"Path":"\([^"]*\)".*"Size":\([0-9]*\).*/\1\t\2/p' \
    > "$WORK/live/$b.sizes" || true
  n=$(wc -l < "$WORK/live/$b.keys" | tr -d ' ')
  log "  $b: $n objects"
done

# ── 2. Pull the OFFSITE copies ────────────────────────────────────────
log "=== 2. pulling the offsite (encrypted) object copies ==="
for b in "$PUBLIC_BUCKET" "$PRIVATE_BUCKET"; do
  rclone lsf -R --files-only "$REMOTE_MEDIA_ROOT/$b" > "$WORK/offsite/$b.keys" 2>/dev/null || true
  rclone lsjson -R --files-only "$REMOTE_MEDIA_ROOT/$b" 2>/dev/null \
    | sed -n 's/.*"Path":"\([^"]*\)".*"Size":\([0-9]*\).*/\1\t\2/p' \
    > "$WORK/offsite/$b.sizes" || true
  n=$(wc -l < "$WORK/offsite/$b.keys" | tr -d ' ')
  log "  $REMOTE_MEDIA_ROOT/$b: $n objects"
  log "  downloading $b -> $WORK/restored/$b"
  mkdir -p "$WORK/restored/$b"
  rclone copy "$REMOTE_MEDIA_ROOT/$b" "$WORK/restored/$b" --no-traverse 2>&1 | tail -2 | sed 's/^/    /'
  # Pull the LIVE objects too, so the hash comparison is disk-to-disk
  # instead of one rclone cat per object (which is ~100x slower).
  mkdir -p "$WORK/livecopy/$b"
  rclone copy "minio:$b" "$WORK/livecopy/$b" --no-traverse 2>&1 | tail -1 | sed 's/^/    /'
done

# ── 3. Compare live vs offsite ────────────────────────────────────────
log "=== 3. comparing live vs offsite (keys, sizes, sha256) ==="
TOTAL=0
MISSING=0
SIZE_BAD=0
HASH_BAD=0
for b in "$PUBLIC_BUCKET" "$PRIVATE_BUCKET"; do
  [ -s "$WORK/live/$b.keys" ] || continue
  while IFS= read -r key; do
    [ -n "$key" ] || continue
    TOTAL=$((TOTAL + 1))

    if ! grep -qxF "$key" "$WORK/offsite/$b.keys"; then
      log "  MISSING offsite: $b/$key"
      MISSING=$((MISSING + 1))
      continue
    fi

    # Size comparison uses the pre-built size tables (one lsjson -R per
    # bucket) rather than two rclone calls per object — the per-object
    # version was ~100x slower over the encrypted remote.
    live_size=$(awk -F'	' -v k="$key" '$1==k {print $2; exit}' "$WORK/live/$b.sizes")
    off_size=$(awk -F'	' -v k="$key" '$1==k {print $2; exit}' "$WORK/offsite/$b.sizes")
    if [ -n "$live_size" ] && [ -n "$off_size" ] && [ "$live_size" != "$off_size" ]; then
      log "  SIZE MISMATCH: $b/$key live=$live_size offsite=$off_size"
      SIZE_BAD=$((SIZE_BAD + 1))
      continue
    fi

    # Content hash: sha256 of the live object vs the offsite copy,
    # both read from disk (both were downloaded in step 2).
    live_hash=$(sha256sum "$WORK/livecopy/$b/$key" 2>/dev/null | cut -d' ' -f1)
    off_hash=$(sha256sum "$WORK/restored/$b/$key" 2>/dev/null | cut -d' ' -f1)
    if [ -z "$live_hash" ] || [ -z "$off_hash" ]; then
      log "  HASH UNAVAILABLE: $b/$key (live=$live_hash offsite=$off_hash)"
      HASH_BAD=$((HASH_BAD + 1))
    elif [ "$live_hash" != "$off_hash" ]; then
      log "  HASH MISMATCH: $b/$key live=$live_hash offsite=$off_hash"
      HASH_BAD=$((HASH_BAD + 1))
    fi
  done < "$WORK/live/$b.keys"
done

log "  compared $TOTAL objects"
log "  missing offsite  : $MISSING"
log "  size mismatches : $SIZE_BAD"
log "  hash mismatches : $HASH_BAD"

# ── 4. Prove the restored objects actually SERVE ───────────────────────
log "=== 4. loading the restored objects into a throwaway MinIO ==="
docker network rm gus012-minio-restore-net >/dev/null 2>&1 || true
docker network create gus012-minio-restore-net >/dev/null
docker run -d --rm --name gus012-minio-restore \
  --network gus012-minio-restore-net --network-alias restored-minio \
  -p "127.0.0.1:${RESTORE_PORT}:9000" \
  -e MINIO_ROOT_USER=gustalerestore \
  -e MINIO_ROOT_PASSWORD=gustalerestore2026 \
  "$RESTORE_IMAGE" server /data --console-address ":9001" >/dev/null

for i in $(seq 1 40); do
  if curl -fsS "http://127.0.0.1:${RESTORE_PORT}/minio/health/live" >/dev/null 2>&1; then break; fi
  sleep 1
done
curl -fsS "http://127.0.0.1:${RESTORE_PORT}/minio/health/live" >/dev/null 2>&1 \
  || fail "throwaway MinIO did not become healthy"

# The restored objects must be loadable into a fresh bucket, then served.
export RCLONE_CONFIG_RESTORE_TYPE=s3
export RCLONE_CONFIG_RESTORE_PROVIDER=Minio
export RCLONE_CONFIG_RESTORE_ENV_AUTH=false
export RCLONE_CONFIG_RESTORE_ACCESS_KEY_ID=gustalerestore
export RCLONE_CONFIG_RESTORE_SECRET_ACCESS_KEY=gustalerestore2026
export RCLONE_CONFIG_RESTORE_ENDPOINT="http://127.0.0.1:${RESTORE_PORT}"
export RCLONE_CONFIG_RESTORE_ACL=private

SERVED=0
SERVED_FAIL=0
for b in "$PUBLIC_BUCKET" "$PRIVATE_BUCKET"; do
  [ -d "$WORK/restored/$b" ] || continue
  rclone mb --ignore-existing "restore:$b" >/dev/null 2>&1 || true
  rclone copy "$WORK/restored/$b" "restore:$b" --no-traverse >/dev/null 2>&1 \
    || fail "could not load $b into the throwaway MinIO"
  log "  loaded $b into the throwaway instance"

  # Read one object back OUT of the throwaway instance, the way Caddy
  # reads /media/* in production. Note: MinIO requires AWS4-HMAC-SHA256
  # signing, so a plain curl with basic auth gets
  # "InvalidRequest ... please use AWS4-HMAC-SHA256" — rclone already
  # speaks that protocol, so we read through rclone.
  first_key=$(head -1 "$WORK/live/$b.keys" 2>/dev/null || true)
  if [ -n "$first_key" ]; then
    if rclone cat "restore:$b/$first_key" > /tmp/gus012-served.bin 2>/dev/null; then
      served_bytes=$(wc -c < /tmp/gus012-served.bin | tr -d ' ')
      served_hash=$(sha256sum /tmp/gus012-served.bin | cut -d' ' -f1)
      expected_hash=$(sha256sum "$WORK/restored/$b/$first_key" 2>/dev/null | cut -d' ' -f1)
      if [ "${served_bytes:-0}" -gt 0 ] && [ "$served_hash" = "$expected_hash" ]; then
        log "  served $b/$first_key ($served_bytes bytes, sha256 matches the offsite copy)"
        SERVED=$((SERVED + 1))
      else
        log "  FAILED to serve $b/$first_key correctly ($served_bytes bytes, sha256 $served_hash vs $expected_hash)"
        SERVED_FAIL=$((SERVED_FAIL + 1))
      fi
    else
      log "  FAILED to read $b/$first_key from the throwaway instance"
      SERVED_FAIL=$((SERVED_FAIL + 1))
    fi
  fi
done
rm -f /tmp/gus012-served.bin

# ── 5. Verdict ────────────────────────────────────────────────────────
log ""
log "=== RESULT ==="
if [ "$TOTAL" -gt 0 ] && [ "$MISSING" -eq 0 ] && [ "$SIZE_BAD" -eq 0 ] \
   && [ "$HASH_BAD" -eq 0 ] && [ "$SERVED_FAIL" -eq 0 ] && [ "$SERVED" -gt 0 ]; then
  log "PASS — the MinIO object backup is proven restorable."
  log "  $TOTAL objects compared: 0 missing, 0 size mismatches, 0 hash mismatches."
  log "  $SERVED object(s) served from a throwaway instance built only from the offsite copy."
  exit 0
fi

log "FAIL — the MinIO object backup is NOT proven restorable." >&2
log "  $TOTAL compared, $MISSING missing, $SIZE_BAD size mismatches, $HASH_BAD hash mismatches, $SERVED served, $SERVED_FAIL failed to serve." >&2
exit 1
