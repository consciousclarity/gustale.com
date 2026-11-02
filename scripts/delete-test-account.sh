#!/usr/bin/env bash
# The gate for deleting a TEST ACCOUNT from the live database.
#
# WHY THIS EXISTS
# ---------------
# Deleting a user row is a HARD DELETE. RULES.md §2 puts hard deletes
# behind Alejandro's approval, and RULES.md §3 puts live database
# changes behind the standing gate:
#
#   backup SUCCESS -> snapshot -> dry-run on a copy -> count assertions
#   (any 0-row or mismatch = ABORT) -> apply -> verify
#
# This script is that gate for account deletion. It is deliberately
# narrow: it deletes ONLY the accounts it is given, by id, and it
# refuses to run at all if anything about the target is unexpected.
#
# WHAT IT GUARDS AGAINST
# ----------------------
# 1. An account that is REFERENCED by content is deleted anyway, leaving
#    a dangling author. The gate checks every column that can hold a
#    user id and reports each reference. If any reference exists, the
#    gate ABORTS unless the reference is explicitly allowed.
#
# 2. The wrong account is deleted. The gate requires the account's
#    email to match an expected pattern, so a production account
#    cannot be deleted by passing its id.
#
# 3. The live database is touched before the copy proved it. The gate
#    ALWAYS runs the delete on a copy first, asserts the outcome, and
#    only then applies it live.
#
# 4. The count assertions are satisfied by accident. The gate asserts
#    the BEFORE and AFTER counts of every table it touches, and a
#    zero-row result where rows were expected is a failure.
#
# USAGE
# -----
#   scripts/delete-test-account.sh <user-id> <expected-email-substring> [--apply] [--with-content]
#
# Without --apply it runs on a COPY and reports. With --apply it runs
# the copy first, and only if the copy behaved as asserted does it
# apply to live.
#
# --with-content
#   The account authored content (a dish, edit_history rows). This
#   option deletes that content TOO, in the same transaction, rather
#   than leaving it pointing at an account that no longer exists.
#   Without it, an account with content references is REFUSED -- the
#   gate will not create a dangling author.
#
# EXIT CODES
# ----------
#   0  the account was deleted (or would be, on the copy)
#   1  the gate aborted
set -uo pipefail

DB="${GUSTALE_DB_NAME:-gustale}"
TARGET_ID="${1:?usage: delete-test-account.sh <user-id> <expected-email-substring> [--apply]}"
EXPECT_EMAIL="${2:?usage: delete-test-account.sh <user-id> <expected-email-substring> [--apply]}"
APPLY=0
WITH_CONTENT=0
for arg in "${@:3}"; do
  case "$arg" in
    --apply)        APPLY=1 ;;
    --with-content) WITH_CONTENT=1 ;;
    *) fail "unknown option '$arg'" ;;
  esac
done

# The disposable copy's name. It is dropped at the end of the run that
# created it -- that is the standing rule for every copy.
COPY_DB="gustale_delacct_$$"

# The columns that can hold a user id. Every one is checked, because a
# missed column is exactly how an author becomes a dangling reference.
# (There are no foreign keys on most of these -- they are plain text
# columns -- so nothing else would catch it.)
REF_COLUMNS=(
  "account.user_id"
  "comments.user_id"
  "content_permissions.user_id"
  "description_sentence_translations.reviewed_by"
  "dishes.created_by"
  "edit_history.user_id"
  "editorial_review_queue.reviewed_by"
  "expert_credentials.user_id"
  "expert_credentials.verified_by"
  "ingredients.created_by"
  "passkey.user_id"
  "publish_credential.actor"
  "publish_credential.verified_by"
  "session.user_id"
  "sources.created_by"
  "statement_status_log.actor"
  "statements.verified_by"
  "watch_list.user_id"
)

log() { echo "[delete-test-account] $*"; }
fail() { echo "::error::$*" >&2; exit 1; }

psql_q() {
  docker exec -i -u postgres shared-postgres psql -U postgres -d "$1" -tAc "$2" 2>/dev/null | tail -1
}

# --- Step 1: the target must exist, and its email must match ---
EMAIL=$(psql_q "$DB" "SELECT email FROM \"user\" WHERE id = '$TARGET_ID'")
[ -n "$EMAIL" ] || fail "there is no account with the id '$TARGET_ID' in '$DB'"
log "the target: $EMAIL"

case "$EMAIL" in
  *"$EXPECT_EMAIL"*) log "the email matches the expected '$EXPECT_EMAIL'" ;;
  *) fail "the email '$EMAIL' does NOT contain the expected '$EXPECT_EMAIL' -- refusing to delete" ;;
esac

# --- Step 2: find every reference ---
log ""
log "--- the references to $TARGET_ID ---"
FOUND_REFS=0
for c in "${REF_COLUMNS[@]}"; do
  t="${c%%.*}"; col="${c##*.}"
  n=$(psql_q "$DB" "SELECT count(*) FROM $t WHERE $col = '$TARGET_ID'")
  if [ -n "$n" ] && [ "$n" != "0" ]; then
    echo "  $t.$col: $n"
    FOUND_REFS=$((FOUND_REFS + 1))
  fi
done
if [ "$FOUND_REFS" -eq 0 ]; then
  log "  NONE -- the account is referenced by nothing"
else
  log "  $FOUND_REFS tables reference this account"
  # The account's own auth rows are not content. Everything else IS.
  CONTENT_REFS=0
  for c in "${REF_COLUMNS[@]}"; do
    t="${c%%.*}"; col="${c##*.}"
    case "$t" in account|session|passkey) continue ;; esac
    n=$(psql_q "$DB" "SELECT count(*) FROM $t WHERE $col = '$TARGET_ID'")
    if [ -n "$n" ] && [ "$n" != "0" ]; then
      CONTENT_REFS=$((CONTENT_REFS + 1))
    fi
  done
  if [ "$CONTENT_REFS" -gt 0 ] && [ "$WITH_CONTENT" != "1" ]; then
    fail "the account authored CONTENT ($CONTENT_REFS content tables reference it). Deleting it now would leave a dangling author. Re-run with --with-content to delete the content too, deliberately."
  fi
  if [ "$CONTENT_REFS" -gt 0 ]; then
    log "  --with-content was given, so the content will be deleted with the account"
  fi
fi

# The account's own row and its auth rows are NOT content references --
# they ARE the account, and they are deleted with it (the auth tables
# cascade on delete). So they are counted separately.
log ""
log "--- the account's own auth rows (deleted WITH the account) ---"
for t in account session passkey; do
  n=$(psql_q "$DB" "SELECT count(*) FROM $t WHERE user_id = '$TARGET_ID'")
  echo "  $t: ${n:-0}"
done

# --- Step 3: the copy ---
log ""
log "--- making the copy $COPY_DB ---"
# The copy is made with pg_dump | pg_restore, NOT CREATE DATABASE ...
# TEMPLATE: the live database has live connections, and TEMPLATE refuses
# to copy a database that is in use.
DUMP=/tmp/gustale_delacct_snapshot_$$.dump
docker exec -u postgres shared-postgres pg_dump -U postgres -d "$DB" --format=custom \
  --file="$DUMP" >/dev/null 2>&1 || fail "could not dump $DB"
docker exec -i -u postgres shared-postgres psql -U postgres -d postgres -tAc \
  "DROP DATABASE IF EXISTS $COPY_DB;" >/dev/null 2>&1
docker exec -u postgres shared-postgres createdb -U postgres "$COPY_DB" 2>/dev/null \
  || fail "could not create the copy $COPY_DB"
docker exec -u postgres shared-postgres pg_restore -U postgres -d "$COPY_DB" \
  --no-owner --no-privileges "$DUMP" >/dev/null 2>&1 || true
docker exec -u postgres shared-postgres rm -f "$DUMP"

# Mark it disposable, so any test that touches it is allowed to write.
docker exec -i -u postgres shared-postgres psql -U postgres -d "$COPY_DB" -q \
  -f - < "$(dirname "$0")/mark_disposable_db.sql" >/dev/null 2>&1

# The counts that must change.
SESSIONS_HELD=$(psql_q "$COPY_DB" "SELECT count(*) FROM session WHERE user_id = '$TARGET_ID'")
BEFORE_USER=$(psql_q "$COPY_DB" "SELECT count(*) FROM \"user\"")
BEFORE_ACCOUNT=$(psql_q "$COPY_DB" "SELECT count(*) FROM account")
BEFORE_SESSION=$(psql_q "$COPY_DB" "SELECT count(*) FROM session")
BEFORE_EDIT=$(psql_q "$COPY_DB" "SELECT count(*) FROM edit_history")
BEFORE_DISH=$(psql_q "$COPY_DB" "SELECT count(*) FROM dishes")

# --- Step 4: the delete, on the copy ---
log ""
log "--- the delete, on the copy ---"

# The content the account authored. These are collected BEFORE the
# delete, because the delete must remove them FIRST (they point at
# the account) and because the assertions below need to know how
# many rows to expect.
CONTENT_DISHES=""
CONTENT_EDITS=0
if [ "$WITH_CONTENT" = "1" ]; then
  CONTENT_DISHES=$(psql_q "$COPY_DB" "SELECT string_agg(id::text, ',') FROM dishes WHERE created_by = '$TARGET_ID'")
  CONTENT_EDITS=$(psql_q "$COPY_DB" "SELECT count(*) FROM edit_history WHERE user_id = '$TARGET_ID'")
  log "  the content to delete: the dishes=[${CONTENT_DISHES:-none}] the edit_history rows=$CONTENT_EDITS"
  if [ -z "$CONTENT_DISHES" ] && [ "$CONTENT_EDITS" = "0" ]; then
    log "  (there is no content to delete -- --with-content is harmless here)"
  fi

  # The dish's children. Every foreign key to dishes cascades, so the
  # dish's own rows go with it. The tables that reference dishes
  # WITHOUT a foreign key do NOT cascade -- those are checked and
  # refused, because a dangling dish_id is exactly the failure the
  # gate exists to prevent.
  if [ -n "$CONTENT_DISHES" ]; then
    for c in "dish_relations_admin.from_dish_id" "dish_relations_admin.to_dish_id" \
             "dish_relations_archive.from_dish_id" "dish_relations_archive.to_dish_id" \
             "dish_relations_public.from_dish_id" "dish_relations_public.to_dish_id" \
             "dish_relations_symmetric.from_dish_id" "dish_relations_symmetric.to_dish_id"; do
      t="${c%%.*}"; col="${c##*.}"
      n=$(psql_q "$COPY_DB" "SELECT count(*) FROM $t WHERE $col IN ($CONTENT_DISHES)")
      if [ -n "$n" ] && [ "$n" != "0" ]; then
        fail "$t.$col has $n rows pointing at the dish(es) being deleted, and it has NO foreign key -- deleting the dish would leave a dangling reference"
      fi
    done
    nl=$(psql_q "$COPY_DB" "SELECT count(*) FROM lineages WHERE representative_dishes::text ~ ANY (ARRAY[$(printf "'%s'," $CONTENT_DISHES | sed 's/,$//')])")
    if [ -n "$nl" ] && [ "$nl" != "0" ]; then
      fail "lineages.representative_dishes references the dish(es) being deleted ($nl lineages) and it has NO foreign key"
    fi
    log "  the dish's children: every foreign key cascades, and the no-FK tables are empty"
  fi

  # One transaction: the content and the account go together, or
  # neither does.
  if [ -n "$CONTENT_DISHES" ]; then
    docker exec -i -u postgres shared-postgres psql -U postgres -d "$COPY_DB" -q \
      -c "BEGIN; DELETE FROM edit_history WHERE user_id = '$TARGET_ID'; DELETE FROM dishes WHERE created_by = '$TARGET_ID'; DELETE FROM \"user\" WHERE id = '$TARGET_ID'; COMMIT;" 2>&1 | tail -3
  else
    docker exec -i -u postgres shared-postgres psql -U postgres -d "$COPY_DB" -q \
      -c "BEGIN; DELETE FROM edit_history WHERE user_id = '$TARGET_ID'; DELETE FROM \"user\" WHERE id = '$TARGET_ID'; COMMIT;" 2>&1 | tail -3
  fi
else
  docker exec -i -u postgres shared-postgres psql -U postgres -d "$COPY_DB" -q \
    -c "DELETE FROM \"user\" WHERE id = '$TARGET_ID';" 2>&1 | tail -2
fi

# --- Step 5: the assertions ---
AFTER_USER=$(psql_q "$COPY_DB" "SELECT count(*) FROM \"user\"")
AFTER_ACCOUNT=$(psql_q "$COPY_DB" "SELECT count(*) FROM account")
AFTER_SESSION=$(psql_q "$COPY_DB" "SELECT count(*) FROM session")
AFTER_EDIT=$(psql_q "$COPY_DB" "SELECT count(*) FROM edit_history")
AFTER_DISH=$(psql_q "$COPY_DB" "SELECT count(*) FROM dishes")

log ""
log "--- the assertions ---"
FAILED=0
assert_eq() {
  local what="$1" before="$2" after="$3" expect_drop="$4"
  if [ "$before" = "$after" ]; then
    echo "  ::error::$what did not change ($before -> $after)" >&2
    FAILED=1
  elif [ "$expect_drop" = "1" ] && [ "$after" != "$((before - 1))" ]; then
    echo "  ::error::$what dropped by the wrong amount ($before -> $after, expected $((before - 1)))" >&2
    FAILED=1
  else
    echo "  $what: $before -> $after"
  fi
}
assert_eq "the user table"   "$BEFORE_USER"    "$AFTER_USER"    1
# The `account` table holds the OAuth/password rows. An account that
# has NONE of them (a freshly made test account) legitimately leaves
# the table unchanged -- there was nothing to cascade. Asserting a
# drop of one there failed the gate for the wrong reason: the delete
# was correct, the expectation was not.
if [ "$BEFORE_ACCOUNT" != "$AFTER_ACCOUNT" ]; then
  assert_eq "the account table" "$BEFORE_ACCOUNT" "$AFTER_ACCOUNT" 1
else
  echo "  the account table: $BEFORE_ACCOUNT -> $AFTER_ACCOUNT (the account held no linked row)"
fi
# The session table drops by the number of sessions the account HELD.
# It may be zero -- a test account that never logged in has no session,
# and asserting a drop of one would fail the gate for the wrong reason.
if [ "$BEFORE_SESSION" != "$AFTER_SESSION" ]; then
  if [ "$AFTER_SESSION" != "$((BEFORE_SESSION - SESSIONS_HELD))" ]; then
    echo "  ::error::the session table dropped by the wrong amount ($BEFORE_SESSION -> $AFTER_SESSION, expected $((BEFORE_SESSION - SESSIONS_HELD)))" >&2
    FAILED=1
  else
    echo "  the session table: $BEFORE_SESSION -> $AFTER_SESSION"
  fi
else
  echo "  the session table: $BEFORE_SESSION -> $AFTER_SESSION (the account held no session)"
fi
# The content tables. With --with-content they MUST drop by exactly
# the number of rows the account authored; without it they must NOT
# change at all. A silent change in either direction is the failure
# mode.
if [ "$WITH_CONTENT" = "1" ]; then
  if [ "$AFTER_EDIT" != "$((BEFORE_EDIT - CONTENT_EDITS))" ]; then
    echo "  ::error::the edit_history count did not drop by the account's own rows ($BEFORE_EDIT -> $AFTER_EDIT, expected $((BEFORE_EDIT - CONTENT_EDITS)))" >&2
    FAILED=1
  else
    echo "  the edit_history: $BEFORE_EDIT -> $AFTER_EDIT (dropped the account's $CONTENT_EDITS rows)"
  fi
  EXPECT_DISH_DROP=0
  if [ -n "$CONTENT_DISHES" ]; then
    EXPECT_DISH_DROP=$(printf '%s' "$CONTENT_DISHES" | tr ',' '\n' | grep -c .)
  fi
  if [ "$AFTER_DISH" != "$((BEFORE_DISH - EXPECT_DISH_DROP))" ]; then
    echo "  ::error::the dishes count did not drop by the account's own dishes ($BEFORE_DISH -> $AFTER_DISH, expected $((BEFORE_DISH - EXPECT_DISH_DROP)))" >&2
    FAILED=1
  else
    echo "  the dishes: $BEFORE_DISH -> $AFTER_DISH (dropped the account's $EXPECT_DISH_DROP dishes)"
  fi
else
  if [ "$BEFORE_EDIT" != "$AFTER_EDIT" ]; then
    echo "  ::error::the edit_history count changed ($BEFORE_EDIT -> $AFTER_EDIT) -- the account authored edits that were not handled" >&2
    FAILED=1
  else
    echo "  the edit_history: $BEFORE_EDIT -> $AFTER_EDIT (unchanged)"
  fi
  if [ "$BEFORE_DISH" != "$AFTER_DISH" ]; then
    echo "  ::error::the dishes count changed ($BEFORE_DISH -> $AFTER_DISH) -- the account created dishes" >&2
    FAILED=1
  else
    echo "  the dishes: $BEFORE_DISH -> $AFTER_DISH (unchanged)"
  fi
fi

# The target must be gone.
STILL=$(psql_q "$COPY_DB" "SELECT count(*) FROM \"user\" WHERE id = '$TARGET_ID'")
if [ "$STILL" != "0" ]; then
  echo "  ::error::the account still exists after the delete" >&2
  FAILED=1
else
  echo "  the account is gone"
fi

# ── THE DANGLING-REFERENCE ASSERTION ───────────────────────────────────
# This is the one that matters, and it is the reason the gate exists.
#
# `dishes.created_by` and `edit_history.user_id` carry NO FOREIGN KEY.
# Postgres does not enforce them, so the delete above SUCCEEDS even
# when the account authored a dish -- and the row is left pointing at
# an account that no longer exists.
#
# So the count assertions above are not sufficient: they showed the
# counts did NOT change, which is exactly the problem. This assertion
# checks the property that actually matters: after the delete, NOTHING
# references the deleted account.
#
log ""
log "--- the dangling-reference check ---"
DANGLING=0
for c in "${REF_COLUMNS[@]}"; do
  t="${c%%.*}"; col="${c##*.}"
  n=$(psql_q "$COPY_DB" "SELECT count(*) FROM $t WHERE $col = '$TARGET_ID'")
  if [ -n "$n" ] && [ "$n" != "0" ]; then
    echo "  ::error::$t.$col still references the deleted account ($n rows) -- the delete left a dangling reference" >&2
    DANGLING=$((DANGLING + 1))
  fi
done
if [ "$DANGLING" -eq 0 ]; then
  echo "  nothing references the deleted account -- the delete is clean"
else
  echo "  ::error::the delete left $DANGLING dangling references" >&2
  FAILED=1
fi

# --- Step 6: drop the copy (ALWAYS) ---
drop_copy() {
  docker exec -i -u postgres shared-postgres psql -U postgres -tAc \
    "DROP DATABASE IF EXISTS $COPY_DB;" >/dev/null 2>&1
  docker exec -u postgres shared-postgres rm -f "/tmp/gustale_delacct_snapshot_$$.dump" >/dev/null 2>&1
  log "the copy $COPY_DB dropped"
}
trap drop_copy EXIT

if [ "$FAILED" -ne 0 ]; then
  log ""
  log "the COPY's assertions FAILED -- nothing was applied to live"
  exit 1
fi

# --- Step 7: apply to live ---
if [ "$APPLY" -ne 1 ]; then
  log ""
  log "the copy behaved as asserted. Re-run with --apply to delete it from '$DB'."
  exit 0
fi

log ""
log "--- applying to $DB ---"
BEFORE_USER=$(psql_q "$DB" "SELECT count(*) FROM \"user\"")
BEFORE_USER_DISH=$(psql_q "$DB" "SELECT count(*) FROM dishes")
BEFORE_USER_EDIT=$(psql_q "$DB" "SELECT count(*) FROM edit_history")

if [ "$WITH_CONTENT" = "1" ]; then
  LIVE_DISHES=$(psql_q "$DB" "SELECT string_agg(id::text, ',') FROM dishes WHERE created_by = '$TARGET_ID'")
  LIVE_EDITS=$(psql_q "$DB" "SELECT count(*) FROM edit_history WHERE user_id = '$TARGET_ID'")
  log "  the live content to delete: the dishes=[${LIVE_DISHES:-none}] the edit_history rows=$LIVE_EDITS"
  if [ -n "$LIVE_DISHES" ]; then
    docker exec -i -u postgres shared-postgres psql -U postgres -d "$DB" -q \
      -c "BEGIN; DELETE FROM edit_history WHERE user_id = '$TARGET_ID'; DELETE FROM dishes WHERE created_by = '$TARGET_ID'; DELETE FROM \"user\" WHERE id = '$TARGET_ID'; COMMIT;" 2>&1 | tail -3
  else
    docker exec -i -u postgres shared-postgres psql -U postgres -d "$DB" -q \
      -c "BEGIN; DELETE FROM edit_history WHERE user_id = '$TARGET_ID'; DELETE FROM \"user\" WHERE id = '$TARGET_ID'; COMMIT;" 2>&1 | tail -3
  fi
  AFTER_DISH=$(psql_q "$DB" "SELECT count(*) FROM dishes")
  AFTER_EDIT=$(psql_q "$DB" "SELECT count(*) FROM edit_history")
  if [ "$AFTER_EDIT" != "$((BEFORE_USER_EDIT - LIVE_EDITS))" ]; then
    fail "the live edit_history did not drop by the account's own rows ($BEFORE_USER_EDIT -> $AFTER_EDIT, expected $((BEFORE_USER_EDIT - LIVE_EDITS)))"
  fi
  if [ -n "$LIVE_DISHES" ]; then
    EXPECT_DROP=$(printf '%s' "$LIVE_DISHES" | tr ',' '\n' | grep -c .)
    if [ "$AFTER_DISH" != "$((BEFORE_USER_DISH - EXPECT_DROP))" ]; then
      fail "the live dishes did not drop by the account's own dishes ($BEFORE_USER_DISH -> $AFTER_DISH, expected $((BEFORE_USER_DISH - EXPECT_DROP)))"
    fi
  fi
  log "  the dishes: $BEFORE_USER_DISH -> $AFTER_DISH | the edit_history: $BEFORE_USER_EDIT -> $AFTER_EDIT"
else
  docker exec -i -u postgres shared-postgres psql -U postgres -d "$DB" -q \
    -c "DELETE FROM \"user\" WHERE id = '$TARGET_ID';" 2>&1 | tail -2
fi
AFTER_USER=$(psql_q "$DB" "SELECT count(*) FROM \"user\"")

if [ "$AFTER_USER" != "$((BEFORE_USER - 1))" ]; then
  fail "the live delete did not drop exactly one user ($BEFORE_USER -> $AFTER_USER)"
fi
STILL=$(psql_q "$DB" "SELECT count(*) FROM \"user\" WHERE id = '$TARGET_ID'")
[ "$STILL" = "0" ] || fail "the account still exists in live"
log "  the user table: $BEFORE_USER -> $AFTER_USER"
log "  the account is gone from '$DB'"
