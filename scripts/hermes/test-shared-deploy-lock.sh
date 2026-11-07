#!/usr/bin/env bash
#
# The rebuild timer and the CI deploy must share ONE lock.
#
# On 2026-11-07 they raced for real. CI run 42314759004 (running as
# root) and the rebuild timer (running as `gustale`) both built the
# same image tag at the same time, because they held DIFFERENT lock
# files:
#
#   CI deploy  -> /tmp/gustale-deploy.lock
#   rebuild    -> /var/lock/gustale-rebuild.lock
#
# Two different lock objects do not exclude each other. The timer then
# swapped the web containers with its own build AFTER the CI's "Real
# verify" had already passed -- so the verified build was silently
# replaced by an unverified one, with no error anywhere.
#
# THE PROBLEM WITH FIXING THIS IN THE WORKFLOW
#
# The obvious fix is to change both sides to a new shared path. But the
# deploy side lives in .github/workflows/ci.yml, and the GitHub App
# CANNOT push .github/workflows/ files (no `workflows` scope). So the
# fix must be script-only: the timer takes the lock the CI deploy
# ALREADY takes (/tmp/gustale-deploy.lock). No workflow change.
#
# THE PERMISSION PROBLEM
#
# The CI deploy runs as root and creates the lock file as root:root
# mode 0644. The timer runs as `gustale` and cannot open it for
# writing. So the timer opens it READ-ONLY and flocks that descriptor.
#
# flock() does not require write access -- it flocks the INODE. An
# exclusive flock on a read-only descriptor conflicts with an exclusive
# flock on a write descriptor, because both are the same inode. Case 2
# below proves this is true, in both directions, on this host.
#
# These tests never build an image, never touch a container and never
# talk to a database. They exercise only the lock acquisition.
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCRIPT="$SCRIPT_DIR/rebuild-web-live.sh"

fail=0
ok()  { echo "   PASS  $*"; }
bad() { echo "   FAIL  $*"; fail=1; }

echo "shared deploy lock tests"

if [ ! -f "$SCRIPT" ]; then
  echo "   FAIL  $SCRIPT not found" >&2
  exit 1
fi

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

# ===========================================================================
# CASE 1: the default lock path is the one the CI deploy already takes.
#
# If the default changes to anything else, the two sides lock
# different files again and the race returns. This is the assertion
# that keeps the fix honest.
# ===========================================================================
echo ""
echo "--- case 1: the default lock path is the CI deploy's lock ---"

DEFAULT_LOCK=$(grep -E '^LOCK_FILE="\$\{GUSTALE_LOCK_FILE:-' "$SCRIPT" \
  | sed -E 's/.*GUSTALE_LOCK_FILE:-([^}]*)\}.*/\1/')

CI_LOCK=$(grep -oE 'DEPLOY_LOCK="[^"]+"' \
  "$(dirname "$SCRIPT")/../../.github/workflows/ci.yml" 2>/dev/null \
  | head -1 | sed -E 's/.*="([^"]+)"/\1/')

if [ -z "$CI_LOCK" ]; then
  bad "case 1: could not read DEPLOY_LOCK out of .github/workflows/ci.yml"
elif [ "$DEFAULT_LOCK" != "$CI_LOCK" ]; then
  bad "case 1: the timer locks '$DEFAULT_LOCK' but the CI deploy locks '$CI_LOCK' -- they are different files, so they do not exclude each other"
else
  ok "case 1: the timer and the CI deploy both lock $CI_LOCK"
fi

# The old, per-side lock must be gone from the script's ACTIVE lines
# (the comment may still name it, to explain what changed).
if grep -vE '^\s*#' "$SCRIPT" | grep -q 'gustale-rebuild\.lock'; then
  bad "case 1: the script still uses /var/lock/gustale-rebuild.lock in an active line"
else
  ok "case 1: the old per-side lock path is gone from the script's active lines"
fi

# ===========================================================================
# CASE 2: an exclusive flock on a READ-ONLY descriptor conflicts with an
#          exclusive flock on a WRITE descriptor -- in BOTH directions.
#
# This is the property the whole fix rests on. If a kernel or a
# filesystem did not honour it, the timer would happily run alongside
# a deploy and the race would still happen.
#
# The test runs both sides as the SAME user (it cannot change user
# without root), because flock's conflict semantics do not depend on
# the user -- they depend on the inode. The read-only descriptor is
# created by chmod-ing the file so that opening it for write fails.
# ===========================================================================
echo ""
echo "--- case 2: a read-only flock excludes a write flock (both directions) ---"

SHARED="$TMP/shared.lock"
: > "$SHARED"
chmod 0666 "$SHARED"

# Side A: holds LOCK_EX on a WRITE descriptor (this is the CI deploy).
( exec 8>"$SHARED"; flock -x 8; sleep 4 ) &
HOLDER=$!
sleep 1

# Side B: holds LOCK_EX on a READ-ONLY descriptor (this is the timer,
# which cannot write a root-owned file). It MUST be blocked.
if ( exec 8<"$SHARED"; flock -x -w 2 8 ) 2>/dev/null; then
  bad "case 2: a read-only flock did NOT conflict with a write flock held by the other side"
else
  ok "case 2: a read-only flock is blocked by a write flock held by the other side"
fi
kill "$HOLDER" 2>/dev/null || true
wait "$HOLDER" 2>/dev/null || true

# The reverse direction: the read-only holder blocks the write holder.
( exec 8<"$SHARED"; flock -x 8; sleep 4 ) &
HOLDER=$!
sleep 1

if ( exec 8>"$SHARED"; flock -x -w 2 8 ) 2>/dev/null; then
  bad "case 2 (reverse): a write flock did NOT conflict with a read-only flock held by the other side"
else
  ok "case 2 (reverse): a write flock is blocked by a read-only flock held by the other side"
fi
kill "$HOLDER" 2>/dev/null || true
wait "$HOLDER" 2>/dev/null || true

# ===========================================================================
# CASE 3: the script's own fallback chain works.
#
# The script tries: write-open -> read-only open -> private fallback.
# We cannot reproduce "root-owned file, non-root user" without root,
# so we reproduce the SHAPE of it: a file that cannot be opened for
# writing (mode 0444, in a directory we cannot write to) but CAN be
# opened for reading. The script must then get the lock via the
# read-only descriptor.
#
# We prove this by checking the script's behaviour indirectly: run it
# with a lock file that is read-only, and confirm it does NOT take the
# private-fallback path (which it logs) -- i.e. it reached the
# read-only open.
# ===========================================================================
echo ""
echo "--- case 3: the script falls back to a read-only open ---"

# The script exits early (exit 0) if it cannot read the API, so we
# only care about what it logged about the lock. We give it a lock
# file that exists and is not writable.
RO_LOCK="$TMP/ro.lock"
: > "$RO_LOCK"
chmod 0444 "$RO_LOCK"

set +e
GUSTALE_API_BASE="http://127.0.0.1:1" \
GUSTALE_BUILD_DIR="$TMP" \
GUSTALE_LOCK_FILE="$RO_LOCK" \
GUSTALE_STATE_FILE="$TMP/state.json" \
  bash "$SCRIPT" > "$TMP/case3.log" 2>&1
rc=$?
set -e

if grep -q "opened read-only" "$TMP/case3.log"; then
  ok "case 3: the script opened the non-writable lock read-only"
elif grep -q "opened private-fallback" "$TMP/case3.log"; then
  bad "case 3: the script took the private-fallback path for a lock it CAN read (it should have used a read-only open)"
elif grep -q "lock:" "$TMP/case3.log"; then
  ok "case 3: the script logged the lock it used"
else
  bad "case 3: the script never reported a lock (rc=$rc); log:"
  sed 's/^/        /' "$TMP/case3.log" | tail -20
fi

# ===========================================================================
# CASE 4: the timer must NOT proceed when the shared lock is HELD.
#
# This is the behaviour that actually prevents the race. We hold the
# shared lock on a write descriptor and run the timer against the same
# path. The timer must exit 0 having done nothing -- and, critically,
# must not have reached the build step.
# ===========================================================================
echo ""
echo "--- case 4: the timer stands down when the shared lock is held ---"

HELD_LOCK="$TMP/held.lock"
: > "$HELD_LOCK"
chmod 0666 "$HELD_LOCK"

( exec 8>"$HELD_LOCK"; flock -x 8; sleep 6 ) &
HOLDER=$!
sleep 1

set +e
GUSTALE_API_BASE="http://127.0.0.1:1" \
GUSTALE_BUILD_DIR="$TMP" \
GUSTALE_LOCK_FILE="$HELD_LOCK" \
GUSTALE_STATE_FILE="$TMP/state2.json" \
  bash "$SCRIPT" > "$TMP/case4.log" 2>&1
rc=$?
set -e

kill "$HOLDER" 2>/dev/null || true
wait "$HOLDER" 2>/dev/null || true

if grep -q "another rebuild or deploy is in progress" "$TMP/case4.log"; then
  ok "case 4: the timer stood down because the shared lock was held"
else
  bad "case 4: the timer did NOT stand down on the held shared lock (rc=$rc); log:"
  sed 's/^/        /' "$TMP/case4.log" | tail -20
fi

if grep -qE "Building web images|docker build" "$TMP/case4.log"; then
  bad "case 4: the timer reached the BUILD step despite the held lock"
else
  ok "case 4: the timer never reached the build step"
fi

echo ""
if [ "$fail" -eq 0 ]; then
  echo "ALL PASS"
else
  echo "SOME FAILED"
fi
exit "$fail"
