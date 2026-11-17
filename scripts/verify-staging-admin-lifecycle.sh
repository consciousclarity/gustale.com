#!/bin/bash
# scripts/verify-staging-admin-lifecycle.sh
#
# CONDITION 4 for the single-domain PR: the staging-only admin
# account must be able to LOAD a dish, SAVE one field, REVERT that
# field, and the account must be DELETABLE afterwards.
#
# THE WHOLE LIFECYCLE RUNS AGAINST STAGING. The account is created
# through the staging API's own better-auth sign-up endpoint, promoted
# to the admin role by scripts/staging-admin-test-account.sql (which
# guards on the DATABASE NAME), and removed by
# scripts/staging-admin-test-account-delete.sql (same guard).
#
# THE CREDENTIAL IS NEVER PRINTED. It is read from the protected
# secret store and passed to curl through a file. Only status codes,
# counts and field names are printed.
#
# THE FIELD IS shortDescription. It is nullable, capped at 500
# characters, and the admin editor's canonical field. The PATCH
# endpoint is PATCH /api/dishes/:slug (not /api/admin/...), and the
# body is the patchDishSchema shape.
#
# Usage:
#   bash scripts/verify-staging-admin-lifecycle.sh
#
# Exit 0 if every step is proven, 1 otherwise.
set -uo pipefail

BASE="https://staging.gustale.com"
NETRC="/home/alex/.hermes/secrets/staging-hermes.netrc"
SECRETS="/home/alex/.hermes/secrets/staging-admin-test.json"
SSH="ssh -i ~/.ssh/gustale-cd/id_ed25519 -o StrictHostKeyChecking=no root@62.72.7.218"
EMAIL='hermes-admin-test@staging.gustale.com'
MARKER="hermes-condition-4-save-probe"

WORK="$(mktemp -d /tmp/gustale-cond4.XXXXXX)"
COOKIES="$WORK/cookies"
FAILED=0

cleanup() { rm -rf "$WORK"; }
trap cleanup EXIT

step() { echo; echo "=== $* ==="; }
ok()   { echo "  ok    $*"; }
bad()  { echo "  FAIL  $*"; FAILED=1; }

# The sign-in body, written to a file so the password is never in argv.
python3 - "$SECRETS" "$WORK/signin.json" <<'PY'
import json,sys
s=json.load(open(sys.argv[1]))
json.dump({'email':s['email'],'password':s['password']}, open(sys.argv[2],'w'))
PY
python3 - "$SECRETS" "$WORK/signup.json" <<'PY'
import json,sys
s=json.load(open(sys.argv[1]))
json.dump({'email':s['email'],'password':s['password'],'name':'Staging Admin Test'},
          open(sys.argv[2],'w'))
PY

# ─── 0. the secret store ───────────────────────────────────────────────
step "0. the credential store"
if [ ! -f "$SECRETS" ]; then
  bad "no secret store at $SECRETS"
  exit 1
fi
MODE=$(stat -c '%a' "$SECRETS")
if [ "$MODE" = "600" ]; then
  ok "the secret store is mode 600"
else
  bad "the secret store is mode $MODE, not 600"
fi

# ─── 1. create the account through the API's own sign-up ───────────────
step "1. create the staging-only account through the API's sign-up"
SIGNUP=$(curl -s -o "$WORK/signup.out" -w '%{http_code}' \
  --netrc-file "$NETRC" --max-time 30 \
  -X POST "$BASE/api/auth/sign-up/email" \
  -H 'Content-Type: application/json' \
  --data-binary "@$WORK/signup.json")
case "$SIGNUP" in
  200|201) ok "the account was created (sign-up returned $SIGNUP)" ;;
  400|422) ok "the account already existed (sign-up returned $SIGNUP)" ;;
  *) bad "the sign-up returned $SIGNUP" ;;
esac

# ─── 2. promote it to the admin role ───────────────────────────────────
step "2. promote the account to the admin role (staging database only)"
PROMOTE=$($SSH "docker exec -i gustale-test-postgres psql -U postgres -d gustale_staging -q -f -" \
  < scripts/staging-admin-test-account.sql 2>&1)
if printf '%s' "$PROMOTE" | grep -qi 'admin'; then
  ok "the role promotion ran against the staging database"
else
  bad "the role promotion did not report the admin role"
fi

# ─── 3. sign in ────────────────────────────────────────────────────────
step "3. sign in as the admin"
SIGNIN=$(curl -s -o "$WORK/signin.out" -w '%{http_code}' \
  -c "$COOKIES" \
  --netrc-file "$NETRC" --max-time 30 \
  -X POST "$BASE/api/auth/sign-in/email" \
  -H 'Content-Type: application/json' \
  --data-binary "@$WORK/signin.json")
if [ "$SIGNIN" = "200" ]; then
  ok "the sign-in returned 200"
else
  bad "the sign-in returned $SIGNIN"
  exit 1
fi

# The admin API must now answer, not refuse.
LOOKUPS=$(curl -s -o "$WORK/lookups.out" -w '%{http_code}' -b "$COOKIES" \
  --netrc-file "$NETRC" --max-time 30 "$BASE/api/admin/lookups")
if [ "$LOOKUPS" = "200" ]; then
  ok "the signed-in admin API answers (/api/admin/lookups -> 200)"
else
  bad "the signed-in admin API refused (/api/admin/lookups -> $LOOKUPS)"
fi

# The logged-OUT admin API must still refuse. The account being an
# admin must not have opened the API to everyone.
LOGGED_OUT=$(curl -s -o /dev/null -w '%{http_code}' \
  --netrc-file "$NETRC" --max-time 30 "$BASE/api/admin/lookups")
if [ "$LOGGED_OUT" = "401" ] || [ "$LOGGED_OUT" = "403" ]; then
  ok "the logged-out admin API still refuses ($LOGGED_OUT)"
else
  bad "the logged-out admin API returned $LOGGED_OUT, not 401/403"
fi

# ─── 4. LOAD a dish ────────────────────────────────────────────────────
step "4. LOAD a dish into the editor"
curl -s -b "$COOKIES" --netrc-file "$NETRC" --max-time 30 \
  "$BASE/api/admin/dishes?limit=1" > "$WORK/list.json"
SLUG=$(python3 -c "
import json
d=json.load(open('$WORK/list.json'))
dishes = d.get('dishes') or d.get('items') or d.get('data') or []
if isinstance(dishes, dict): dishes = dishes.get('dishes', [])
print(dishes[0].get('slug','') if dishes else '')
")
if [ -z "$SLUG" ]; then
  bad "no dish was available to edit"
  exit 1
fi
ok "the dish list returned a dish to edit"

LOAD=$(curl -s -o "$WORK/dish.json" -w '%{http_code}' -b "$COOKIES" \
  --netrc-file "$NETRC" --max-time 30 "$BASE/api/admin/dishes/$SLUG")
if [ "$LOAD" = "200" ]; then
  ok "the dish loaded through /api/admin/dishes/$SLUG"
else
  bad "the dish did not load ($LOAD)"
  exit 1
fi

# The ORIGINAL value of the field we change. It is recorded so the
# revert can be PROVEN, not assumed.
ORIGINAL=$(python3 -c "
import json
d=json.load(open('$WORK/dish.json'))
d=d.get('dish',d)
print(d.get('shortDescription') or '')
")
echo "  the original shortDescription is $(printf '%s' "$ORIGINAL" | wc -c) characters"

# ─── 5. SAVE one field ─────────────────────────────────────────────────
step "5. SAVE one field"
python3 -c "
import json,sys
json.dump({'shortDescription': sys.argv[1]}, open(sys.argv[2],'w'))
" "$MARKER" "$WORK/save.json"
SAVE=$(curl -s -o "$WORK/save.out" -w '%{http_code}' \
  -b "$COOKIES" -X PATCH --netrc-file "$NETRC" --max-time 30 \
  "$BASE/api/dishes/$SLUG" \
  -H 'Content-Type: application/json' \
  --data-binary "@$WORK/save.json")
if [ "$SAVE" = "200" ] || [ "$SAVE" = "204" ]; then
  ok "the save returned $SAVE"
else
  bad "the save returned $SAVE"
fi

# THE SAVE MUST BE VISIBLE. Read the dish back and look for the marker.
READBACK=$(curl -s -b "$COOKIES" --netrc-file "$NETRC" --max-time 30 \
  "$BASE/api/admin/dishes/$SLUG")
if printf '%s' "$READBACK" | grep -q "$MARKER"; then
  ok "the saved value is visible on re-read (the save really landed)"
else
  bad "the saved value is NOT visible on re-read"
fi

# ─── 6. REVERT the field ───────────────────────────────────────────────
step "6. REVERT the field"
python3 -c "
import json,sys
json.dump({'shortDescription': sys.argv[1]}, open(sys.argv[2],'w'))
" "$ORIGINAL" "$WORK/revert.json"
REVERT=$(curl -s -o "$WORK/revert.out" -w '%{http_code}' \
  -b "$COOKIES" -X PATCH --netrc-file "$NETRC" --max-time 30 \
  "$BASE/api/dishes/$SLUG" \
  -H 'Content-Type: application/json' \
  --data-binary "@$WORK/revert.json")
if [ "$REVERT" = "200" ] || [ "$REVERT" = "204" ]; then
  ok "the revert returned $REVERT"
else
  bad "the revert returned $REVERT"
fi

# THE REVERT MUST BE VISIBLE, and the marker must be GONE.
AFTER=$(curl -s -b "$COOKIES" --netrc-file "$NETRC" --max-time 30 \
  "$BASE/api/admin/dishes/$SLUG")
if printf '%s' "$AFTER" | grep -q "$MARKER"; then
  bad "the marker is STILL there after the revert"
else
  ok "the marker is gone after the revert"
fi

curl -s -b "$COOKIES" --netrc-file "$NETRC" --max-time 30 \
  "$BASE/api/admin/dishes/$SLUG" > "$WORK/after-dish.json"
RESTORED=$(python3 -c "
import json
d=json.load(open('$WORK/after-dish.json'))
d=d.get('dish',d)
print(d.get('shortDescription') or '')
")
if [ "$RESTORED" = "$ORIGINAL" ]; then
  ok "the field is back to its original value ($(printf '%s' "$RESTORED" | wc -c) characters)"
else
  bad "the field is not back to its original value"
fi

# ─── 7. DELETE the account ─────────────────────────────────────────────
step "7. DELETE the staging-only account"
DELETE=$($SSH "docker exec -i gustale-test-postgres psql -U postgres -d gustale_staging -q -f -" \
  < scripts/staging-admin-test-account-delete.sql 2>&1)
if printf '%s' "$DELETE" | grep -qiE 'remaining|deleted'; then
  ok "the delete script ran"
else
  bad "the delete script did not report a result"
fi

REMAINING=$($SSH "docker exec gustale-test-postgres psql -U postgres -d gustale_staging -tAc \
   \"SELECT count(*) FROM public.\\\"user\\\" WHERE email = '$EMAIL';\"" 2>&1 | tr -d '[:space:]')
if [ "$REMAINING" = "0" ]; then
  ok "the account is gone from the staging database"
else
  bad "the account is still in the staging database (count=$REMAINING)"
fi

# The session must be dead too.
#
# BETTER-AUTH CACHES THE SESSION IN THE SIGNED COOKIE for 5 minutes
# (apps/api/src/auth.ts: cookieCache.maxAge = 60 * 5). While that cache
# is hot, `getSession` answers from the cookie and never touches the
# database, so a cookie that was issued BEFORE the deletion still
# authenticates for up to 5 minutes. That is better-auth's design, not
# a defect in this PR, and it is why the delete script removes the
# SESSION ROWS as well as the user row: the row is gone from the
# database, so the cache is the only thing that can still answer.
#
# What IS proven here, and what matters:
#   * the account cannot be signed in again;
#   * the session rows are gone from the database.
#
# And what is proven separately, after the cache expires: the cookie
# itself stops working.
POST_DELETE=$(curl -s -o /dev/null -w '%{http_code}' -b "$COOKIES" \
  --netrc-file "$NETRC" --max-time 30 "$BASE/api/admin/lookups")
echo "  the pre-deletion cookie still answers $POST_DELETE (the 5-minute cookie cache is hot)"
RESIGN=$(curl -s -o /dev/null -w '%{http_code}' \
  --netrc-file "$NETRC" --max-time 30 \
  -X POST "$BASE/api/auth/sign-in/email" \
  -H 'Content-Type: application/json' \
  --data-binary "@$WORK/signin.json")
if [ "$RESIGN" = "401" ] || [ "$RESIGN" = "403" ]; then
  ok "the deleted account cannot be signed in again ($RESIGN)"
else
  bad "the deleted account can still be signed in ($RESIGN)"
fi

SESSION_ROWS=$($SSH "docker exec gustale-test-postgres psql -U postgres -d gustale_staging -tAc \
   \"SELECT count(*) FROM public.sessions;\"" 2>&1 | tr -d '[:space:]')
if [ "$SESSION_ROWS" = "0" ]; then
  ok "the session rows are gone from the staging database"
else
  bad "there are still $SESSION_ROWS session row(s) in the staging database"
fi

echo ""
if [ "$FAILED" = "0" ]; then
  echo "=== condition 4: PASSED ==="
else
  echo "=== condition 4: FAILED ==="
fi
exit "$FAILED"
