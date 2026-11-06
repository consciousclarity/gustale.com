#!/usr/bin/env bash
# ── THE PROOF'S OWN REGRESSION TEST ──────────────────────────────────
#
# The behavioural proof inside 0047 is only worth what it can DETECT.
# This script builds deliberately BROKEN versions of the function and
# runs the proof against each one, asserting that the proof refuses
# them.
#
# It exists because the proof was, for a while, testing the wrong thing:
# it checked whether a call raised, and the `statement_status_gate_trg`
# trigger raises for ANY status change that did not come through the
# gate. So a function with NO credential check at all also raised, and
# the proof passed against it. The proof now discriminates on the return
# value, and this script is what proves that claim.
#
# Each variant replaces the function body in 0047 and then applies the
# WHOLE migration — proof included — to a fresh copy of the chain
# database. The migration must FAIL for every one of them.
#
# USAGE:  bash scripts/test_publish_proof_detects.sh
# EXIT:   0 if every broken version is caught; 1 otherwise.

set -uo pipefail

# The DEDICATED TEST POSTGRES, never `shared-postgres`.
#
# `DROP DATABASE` and `CREATE DATABASE` are CLUSTER-SCOPED, and the
# production cluster hosts the live database and five other projects'
# databases. On 2026-11-06 a `DROP DATABASE` aimed at this cluster
# destroyed the live database.
# shellcheck source=scripts/lib/test_pg.sh
source scripts/lib/test_pg.sh

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

MIGRATION="db/migrations/0047_publish_credential_session_binding.sql"
CHAIN="scripts/ci-migration-chain.sh"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

pass=0
fail=0

note() { printf '  %s\n' "$*"; }

# ── the variants ─────────────────────────────────────────────────────
#
# Each is the function body that replaces the real one. The KEY is the
# defect; everything else is left as the migration has it.

variant_permissive() {
  cat <<'SQL'
-- THE DEFECT: the token is never checked against the session table.
-- Any caller may pass any string and the transition goes through.
CREATE OR REPLACE FUNCTION statement_set_status(
  p_statement_id uuid,
  p_to verification_state,
  p_session_token text
) RETURNS verification_state
LANGUAGE plpgsql
AS $$
DECLARE
  v_from verification_state;
BEGIN
  SELECT s.status INTO v_from FROM statements s WHERE s.id = p_statement_id;
  UPDATE statements SET status = p_to, updated_at = now() WHERE id = p_statement_id;
  RETURN p_to;
END
$$
SQL
}

variant_no_credential() {
  cat <<'SQL'
-- THE DEFECT: the session IS resolved, but there is no credential
-- check at all. Any logged-in user may verify or publish.
CREATE OR REPLACE FUNCTION statement_set_status(
  p_statement_id uuid,
  p_to verification_state,
  p_session_token text
) RETURNS verification_state
LANGUAGE plpgsql
AS $$
DECLARE
  v_actor text;
BEGIN
  v_actor := session_actor(p_session_token);
  PERFORM set_config('gustale.statement_gate', 'on', true);
  UPDATE statements SET status = p_to, updated_at = now() WHERE id = p_statement_id;
  PERFORM set_config('gustale.statement_gate', 'off', true);
  RETURN p_to;
END
$$
SQL
}

variant_caller_actor() {
  cat <<'SQL'
-- THE DEFECT: the actor is taken from the caller's THIRD ARGUMENT as
-- if it were an identity. The caller names whoever it likes, and the
-- credential check is then made against that name.
CREATE OR REPLACE FUNCTION statement_set_status(
  p_statement_id uuid,
  p_to verification_state,
  p_session_token text
) RETURNS verification_state
LANGUAGE plpgsql
AS $$
DECLARE
  v_actor text;
  v_role text;
BEGIN
  v_actor := p_session_token;

  SELECT pc.credential_role INTO v_role
    FROM publish_credential pc WHERE pc.actor = v_actor;

  IF v_role IS NULL THEN
    RAISE EXCEPTION 'the % transition is refused: % holds no publish credential.', p_to, v_actor;
  END IF;

  PERFORM set_config('gustale.statement_gate', 'on', true);
  UPDATE statements SET status = p_to, updated_at = now() WHERE id = p_statement_id;
  PERFORM set_config('gustale.statement_gate', 'off', true);
  RETURN p_to;
END
$$
SQL
}

variant_actor_from_token() {
  cat <<'SQL'
-- THE DEFECT: the credential IS checked, but the actor it is checked
-- against is the caller's third argument rather than the session's
-- user. The credential table is honoured; the BINDING is not.
CREATE OR REPLACE FUNCTION statement_set_status(
  p_statement_id uuid,
  p_to verification_state,
  p_session_token text
) RETURNS verification_state
LANGUAGE plpgsql
AS $$
DECLARE
  v_actor text;
  v_role text;
  v_cred_verified boolean;
BEGIN
  v_actor := p_session_token;

  SELECT pc.credential_role, (pc.verified_at IS NOT NULL)
    INTO v_role, v_cred_verified
    FROM publish_credential pc WHERE pc.actor = v_actor;

  IF v_role IS NULL THEN
    RAISE EXCEPTION 'the % transition is refused: % holds no publish credential.', p_to, v_actor;
  END IF;

  IF NOT v_cred_verified THEN
    RAISE EXCEPTION 'the publish credential of % has not been verified.', v_actor;
  END IF;

  PERFORM set_config('gustale.statement_gate', 'on', true);
  UPDATE statements SET status = p_to, updated_at = now() WHERE id = p_statement_id;
  PERFORM set_config('gustale.statement_gate', 'off', true);
  RETURN p_to;
END
$$
SQL
}

# ── build a broken copy of the migration ──────────────────────────────
#
# The variant's body replaces the real one in the migration file, so the
# proof that follows it is exercised against the broken function.

make_broken_migration() {
  local variant_fn="$1" out="$2"

  "$variant_fn" > "$WORK/body.sql"

  python3 - "$MIGRATION" "$out" "$WORK/body.sql" <<'PY'
import sys
src = open(sys.argv[1], encoding="utf-8").read()
out_path, body_path = sys.argv[2], sys.argv[3]
body = open(body_path, encoding="utf-8").read()

i = src.find("CREATE OR REPLACE FUNCTION statement_set_status")
if i < 0:
    sys.exit("the function was not found in the migration")

# The region to replace is the WHOLE function, from the CREATE to the
# "$$;" that closes it. The variant carries its own
# "CREATE ... AS $$ ... $$", so the replacement is: the variant, then
# the original's "$$;", then the rest of the file.
#
# Getting this wrong leaves two "$$" in the file and psql reports a
# syntax error — which is not the proof catching anything, so the
# verdict below refuses it.
close_delim = src.find("$$;", i)
if close_delim < 0:
    sys.exit("the end of the function body was not found")

if not body.rstrip().endswith("$$"):
    sys.exit("the variant body does not end with $$")

# The variant's trailing "$$" is DROPPED, because the original's
# "$$;" follows and is the terminator that stays. Keeping both gives
# the file two of them.
open(out_path, "w", encoding="utf-8").write(
    src[:i] + body.rstrip()[:-2].rstrip() + "\n" + src[close_delim:])
PY
}

# ── run the chain once to get a database with the schema in place ───
#
# The chain applies the REAL migration, which is what creates the
# tables the broken versions need. Then each broken version is applied
# OVER the top, and the proof that comes with it must fail.
#
# THE TARGET IS A DISPOSABLE DATABASE, AND THIS TEST DROPS IT TWICE.
#
# The base name comes from GUSTALE_SCRATCH_DB -- the same variable every
# other diagnostic in this repo uses for its disposable target -- and the
# test's own database is a DEDICATED name derived from it, so this test
# never drops the shared scratch database that something else may be
# using.
#
# The base name is resolved through the shared guard, which refuses the
# live database. Then, because this script DROPs its target twice, there
# is an explicit refusal that holds even with the guard's opt-in set:
# dropping the live database is never acceptable here.
DB_BASE="${GUSTALE_SCRATCH_DB:-gustale_dev}"

PYTHON_BIN="$(command -v python3 || true)"
if [ -z "$PYTHON_BIN" ]; then
  echo "::error::no python3 on PATH; cannot vet the test's target database."
  exit 1
fi
RESOLVED_BASE="$("$PYTHON_BIN" scripts/lib/db_guard.py test_publish_proof_detects.sh "$DB_BASE")" || {
  echo "::error::the test refuses to target the live database."
  echo "::error::This test DROPs its target, so live must never be one."
  echo "::error::Set GUSTALE_SCRATCH_DB to a disposable database."
  exit 1
}

DB="${RESOLVED_BASE}_proofdetect_test"

# Belt and braces. The guard permits live when GUSTALE_LIVE_DB_ALLOW=1 is
# set -- which is right for a diagnostic that only READS -- but this
# script DROPs its target twice, so a live target is never acceptable
# here, opt-in or not. Both the base name and the derived name are
# checked.
for CANDIDATE in "$RESOLVED_BASE" "$DB"; do
  if [ "$CANDIDATE" = "gustale" ]; then
    echo "::error::the test database must never be the live database."
    echo "::error::Refusing to run: this script DROPs '$CANDIDATE'."
    exit 1
  fi
done

run_chain() {
  docker exec -i -u postgres "$TEST_PG_CONTAINER" psql -U postgres -d postgres -tAc \
    "DROP DATABASE IF EXISTS ${DB};" >/dev/null 2>&1
  bash "$CHAIN" "$DB" > "$WORK/chain.log" 2>&1
  local code=$?
  if [ $code -ne 0 ]; then
    note "the chain FAILED on a clean database — the test cannot run"
    tail -20 "$WORK/chain.log" | sed 's/^/    /'
    exit 1
  fi
  if ! grep -q "the behavioural proof RAN" "$WORK/chain.log"; then
    note "the chain passed but the proof did NOT RUN — the test cannot run"
    exit 1
  fi
  note "the chain is green and the proof ran"
}

# ── the test ─────────────────────────────────────────────────────────

check_variant() {
  local name="$1" variant_fn="$2"
  local broken="$WORK/broken_${name}.sql"
  local log="$WORK/apply_${name}.log"

  make_broken_migration "$variant_fn" "$broken"

  docker exec -i -u postgres "$TEST_PG_CONTAINER" psql -U postgres -d "$DB" \
    -v ON_ERROR_STOP=1 -f - < "$broken" > "$log" 2>&1
  local code=$?

  if [ $code -eq 0 ]; then
    note "NOT CAUGHT: the '$name' defect was ACCEPTED by the proof"
    fail=$((fail + 1))
    return
  fi

  # The failure must come from the PROOF, not from a syntax error or a
  # missing table. So the message must be one of the proof's own.
  # A syntax error is explicitly NOT a catch: it would mean the broken
  # file was malformed rather than the proof having detected the
  # defect, and a test that accepts it proves nothing.
  if grep -qiE "syntax error" "$log"; then
    note "MALFORMED: the '$name' variant is not valid SQL, so nothing was tested"
    grep -iE "syntax error" "$log" | head -1 | sed 's/^/    /'
    fail=$((fail + 1))
    return
  fi

  if ! grep -qiE "PROOF FAILED|actor-as-token|credential|caller holding" "$log"; then
    note "WRONG FAILURE: the '$name' defect failed for the wrong reason"
    grep -iE "ERROR" "$log" | head -2 | sed 's/^/    /'
    fail=$((fail + 1))
    return
  fi

  note "caught: the '$name' defect"
  grep -oiE "ERROR:  [^;]{0,120}" "$log" | head -1 | sed 's/^/    /'
  pass=$((pass + 1))
}

echo "=== the proof's own regression test"
echo
echo "--- the chain, on a clean database"
run_chain
echo
echo "--- the broken versions, each applied over the good schema"
check_variant "permissive"    variant_permissive
check_variant "no-credential" variant_no_credential
check_variant "caller-actor"  variant_caller_actor
check_variant "actor-from-token" variant_actor_from_token

echo
echo "--- the clean-up"
docker exec -i -u postgres "$TEST_PG_CONTAINER" psql -U postgres -d postgres -tAc \
  "DROP DATABASE IF EXISTS ${DB};" >/dev/null 2>&1
note "the test database is dropped"

echo
if [ "$fail" -eq 0 ]; then
  echo "=== ALL ${pass} BROKEN VERSIONS CAUGHT"
  exit 0
else
  echo "=== ${pass} caught, ${fail} NOT CAUGHT"
  exit 1
fi
