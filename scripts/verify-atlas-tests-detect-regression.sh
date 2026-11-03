#!/usr/bin/env bash
# Prove the atlas schema tests can DETECT a regression.
#
# A negative test that cannot detect a regression is not a test. So each
# constraint is dropped on a throwaway copy, the test suite is re-run, and
# the suite MUST FAIL. If the suite still passes with the constraint gone,
# the test is not actually testing that constraint.
#
# THE SCRIPT FAILS THE JOB WHEN A REGRESSION IS NOT DETECTED.
#
# The original version of this script printed "NOT DETECTED <name>" and
# carried on, and it ended with no `exit` statement at all — so it ALWAYS
# exited 0, whatever it found. Wired into the Nightly as it stood, it
# could not fail: the workflow would have gone green on a proof that
# nothing was proven. The counter now decides the exit code.
#
# Usage:
#   bash scripts/verify-atlas-tests-detect-regression.sh [dbname]
#
# Two modes, selected the same way scripts/ci-migration-chain.sh selects
# them, because "is the shared-postgres container there" is not the same
# question as "which host am I on":
#
#   - container mode (default, the live host): the `shared-postgres`
#     Docker container holds the database, and the scripts reach it with
#     `docker exec`.
#   - CHAIN_MODE=ci (the Nightly runner): Postgres is a SERVICE
#     container reachable at 127.0.0.1 with PGPASSWORD=gustale, and
#     there is NO `shared-postgres` container to exec into.
set -uo pipefail

cd "$(dirname "$0")/.."

DB="${1:-gustale_atlas_regress}"
SQL=scripts/test_atlas_schema.sql
MIGRATION_0036=db/migrations/0036_atlas_schema.sql
MARK_DISPOSABLE=scripts/mark_disposable_db.sql

# THE SNAPSHOT.
#
# The regression cases need a database that ALREADY has the atlas schema,
# because the case drops a constraint and then re-runs the suite against
# what is left. The snapshot is the schema as the chain leaves it.
#
# It is taken ONCE, at the start, from a database this script builds with
# the SAME chain the CI uses — so the snapshot and the chain cannot drift
# apart. The original script restored a dump from /tmp that nothing in
# the repository ever created, so on any machine that had not been
# prepared by hand the restore silently failed (`|| true`), and every case
# then measured a database with NO atlas schema at all — which passes
# trivially and "detects" nothing.
SNAPSHOT="${SNAPSHOT:-/tmp/gustale_atlas_snapshot.dump}"

# ── the psql helper ────────────────────────────────────────────────────
PSQL_BIN=""
if [ "${CHAIN_MODE:-}" = "ci" ]; then
  if command -v psql >/dev/null 2>&1; then
    PSQL_BIN="$(command -v psql)"
  else
    PSQL_BIN="$(ls -1 /usr/lib/postgresql/*/bin/psql 2>/dev/null | sort | tail -1)"
  fi
  if [ -z "$PSQL_BIN" ]; then
    echo "FAILED: no psql client found (looked on PATH and under /usr/lib/postgresql/*/bin)" >&2
    exit 1
  fi
  PG_HOST="${PG_HOST:-127.0.0.1}"
  PG_SUPERPASS="${PGPASSWORD:-gustale}"
fi

# psql against the ADMIN database, for CREATE/DROP DATABASE.
admin() {
  if [ "${CHAIN_MODE:-}" = "ci" ]; then
    PGPASSWORD="$PG_SUPERPASS" "$PSQL_BIN" -h "$PG_HOST" -U postgres -d postgres -v ON_ERROR_STOP=1 "$@"
  else
    docker exec -u postgres shared-postgres psql -U postgres -d postgres -v ON_ERROR_STOP=1 "$@"
  fi
}

# psql against a database, reading the script from STDIN.
#
# STDIN, NOT -f. `docker exec -f` reads the file from INSIDE the
# container, and the SQL files live on the HOST.
run_sql() {
  local db="$1"; shift
  if [ "${CHAIN_MODE:-}" = "ci" ]; then
    PGPASSWORD="$PG_SUPERPASS" "$PSQL_BIN" -h "$PG_HOST" -U postgres -d "$db" -v ON_ERROR_STOP=1 "$@"
  else
    docker exec -u postgres -i shared-postgres psql -U postgres -d "$db" -v ON_ERROR_STOP=1 "$@"
  fi
}

# Create the database and apply a file to it.
apply_file() {
  local db="$1" file="$2"
  if [ "${CHAIN_MODE:-}" = "ci" ]; then
    PGPASSWORD="$PG_SUPERPASS" "$PSQL_BIN" -h "$PG_HOST" -U postgres -d "$db" \
      -v ON_ERROR_STOP=1 -f "$file" >/dev/null 2>&1
  else
    docker exec -u postgres -i shared-postgres psql -U postgres -d "$db" -v ON_ERROR_STOP=1 \
      -f - < "$file" >/dev/null 2>&1
  fi
}

drop_create() {
  admin -c "DROP DATABASE IF EXISTS ${DB};" >/dev/null 2>&1
  admin -c "CREATE DATABASE ${DB};" >/dev/null 2>&1
}

echo "=== building the snapshot database and taking the dump ==="

# The chain builds the schema the way the CI builds it. It is the SAME
# script the CI workflow runs, so the snapshot cannot drift from the
# schema the tests actually run against.
CHAIN_DB="${DB}_chain"
CHAIN_MODE="${CHAIN_MODE:-}" bash scripts/ci-migration-chain.sh "$CHAIN_DB" >/tmp/atlas_regress_chain.log 2>&1
chain_rc=$?
if [ "$chain_rc" -ne 0 ]; then
  echo "FAILED: the migration chain did not complete" >&2
  tail -25 /tmp/atlas_regress_chain.log >&2
  exit 1
fi
echo "the chain is applied to $CHAIN_DB"

# Take the snapshot from it.
if [ "${CHAIN_MODE:-}" = "ci" ]; then
  PGPASSWORD="$PG_SUPERPASS" "$PSQL_BIN" -h "$PG_HOST" -U postgres -d "$CHAIN_DB" \
    -Fc -f "$SNAPSHOT" >/dev/null 2>&1
  dump_rc=$?
else
  docker exec -u postgres shared-postgres pg_dump -U postgres -d "$CHAIN_DB" -Fc \
    > "$SNAPSHOT" 2>/dev/null
  dump_rc=$?
fi
if [ "$dump_rc" -ne 0 ] || [ ! -s "$SNAPSHOT" ]; then
  echo "FAILED: could not take the snapshot at $SNAPSHOT" >&2
  exit 1
fi
echo "the snapshot is at $SNAPSHOT ($(wc -c < "$SNAPSHOT") bytes)"

# The chain's own database has served its purpose.
admin -c "DROP DATABASE IF EXISTS ${CHAIN_DB};" >/dev/null 2>&1

# Restore the snapshot into a fresh database.
restore_snapshot() {
  drop_create
  if [ "${CHAIN_MODE:-}" = "ci" ]; then
    PGPASSWORD="$PG_SUPERPASS" "$PSQL_BIN" -h "$PG_HOST" -U postgres -d "$DB" \
      -v ON_ERROR_STOP=1 -c "GRANT ALL ON SCHEMA public TO gustale;" \
      -c "GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO gustale;" \
      -c "GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO gustale;" >/dev/null 2>&1
    # pg_restore is a client tool; it reads the dump from the host.
    PGPASSWORD="$PG_SUPERPASS" "$PSQL_BIN" --version >/dev/null 2>&1
    if command -v pg_restore >/dev/null 2>&1; then
      PGPASSWORD="$PG_SUPERPASS" pg_restore -h "$PG_HOST" -U postgres -d "$DB" \
        --no-owner --no-privileges "$SNAPSHOT" >/dev/null 2>&1
    else
      local rbin
      rbin="$(ls -1 /usr/lib/postgresql/*/bin/pg_restore 2>/dev/null | sort | tail -1)"
      PGPASSWORD="$PG_SUPERPASS" "$rbin" -h "$PG_HOST" -U postgres -d "$DB" \
        --no-owner --no-privileges "$SNAPSHOT" >/dev/null 2>&1
    fi
  else
    docker exec -u postgres -i shared-postgres psql -U postgres -d "$DB" \
      -v ON_ERROR_STOP=1 -c "GRANT ALL ON SCHEMA public TO gustale;" \
      -c "GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO gustale;" \
      -c "GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO gustale;" >/dev/null 2>&1
    # pg_restore CANNOT READ FROM STDIN — it needs a real file. The dump
    # is on the HOST, so it is COPIED into the container first.
    #
    # The original script piped the dump into `docker exec ... pg_restore
    # ... -`, which fails with "could not open input file "-". The failure
    # was swallowed by `|| true`, so every regression case then ran
    # against a database with NO tables at all, and the suite errored
    # rather than testing anything. The proof was empty.
    docker cp "$SNAPSHOT" "shared-postgres:${SNAPSHOT}" >/dev/null 2>&1
    docker exec -u postgres shared-postgres pg_restore -U postgres -d "$DB" \
      --no-owner --no-privileges "${SNAPSHOT}" >/dev/null 2>&1
  fi

  # THE RESTORE MUST HAVE ACTUALLY RESTORED SOMETHING.
  #
  # Every failure in the restore path above is swallowed, so the only way
  # to know the copy is real is to LOOK at it. An empty database makes
  # every regression case "detect" a failure that is really just a
  # missing table.
  local tables
  tables="$(run_sql "$DB" -tAc \
    "SELECT count(*) FROM information_schema.tables WHERE table_schema='public';" 2>&1 | tr -dc '0-9')"
  if [ -z "$tables" ] || [ "$tables" -lt 10 ]; then
    echo "FAILED: the restore produced $tables public tables — the copy is empty" >&2
    return 1
  fi
  return 0
}

# Mark the copy DISPOSABLE. The atlas constraint tests refuse to run
# against a database that is not marked disposable, and the default is
# deny.
mark_disposable() {
  apply_file "$DB" "$MARK_DISPOSABLE"
}

echo ""
echo "=== the suite passes on the intact schema ==="
restore_snapshot || { echo "FAILED: the restore" >&2; exit 1; }
mark_disposable || { echo "FAILED: the disposable marker" >&2; exit 1; }

intact_out="$(run_sql "$DB" -f - < "$SQL" 2>&1)"
intact_summary="$(printf '%s\n' "$intact_out" | grep -oE 'ATLAS_SCHEMA_TESTS: [0-9]+ passed, [0-9]+ failed' | tail -1)"
if printf '%s\n' "$intact_out" | grep -qE 'ATLAS_SCHEMA_TESTS: [0-9]+ passed, 0 failed'; then
  echo "the intact schema passes: ${intact_summary:-see the log}"
else
  # The suite must pass on the INTACT schema. If it does not, every
  # regression below would "fail" for the wrong reason and the whole
  # proof is worthless.
  echo "FAILED: the suite does NOT pass on the intact schema" >&2
  printf '%s\n' "$intact_out" | grep -E 'ERROR|FAIL|ATLAS_SCHEMA_TESTS' | tail -20 >&2
  exit 1
fi

echo ""
echo "=== now: drop each constraint and prove the suite FAILS ==="

detected=0
missed=0
missed_names=""

run_case() {
  local name="$1"
  local drop_sql="$2"

  # restore the schema from a clean copy each time
  if ! restore_snapshot; then
    echo "NOT DETECTED  $name  <-- THE RESTORE FAILED, SO NOTHING WAS TESTED"
    missed=$((missed+1))
    missed_names="${missed_names}
  - $name (the restore failed)"
    return
  fi
  mark_disposable || { echo "NOT DETECTED  $name  <-- the disposable marker failed"; missed=$((missed+1)); return; }

  # the regression
  run_sql "$DB" -c "$drop_sql" >/dev/null 2>&1

  # the suite must now FAIL
  local out
  out="$(run_sql "$DB" -f - < "$SQL" 2>&1)"
  if printf '%s\n' "$out" | grep -qE 'ATLAS_SCHEMA_TESTS: [0-9]+ passed, [1-9][0-9]* failed'; then
    local n
    n="$(printf '%s\n' "$out" | grep -oE 'ATLAS_SCHEMA_TESTS: [0-9]+ passed, [0-9]+ failed' | tail -1)"
    echo "DETECTED  $name  (the suite reported: $n)"
    detected=$((detected+1))
  elif printf '%s\n' "$out" | grep -qE 'FAIL  '; then
    # The suite reported a failing case but the summary line was not
    # captured (the DO block raises, so psql may not reach it).
    local n
    n="$(printf '%s\n' "$out" | grep -cE 'FAIL  ')"
    echo "DETECTED  $name  (the suite reported $n failing case(s))"
    detected=$((detected+1))
  else
    echo "NOT DETECTED  $name  <-- THE TEST IS NOT TESTING THIS"
    missed=$((missed+1))
    missed_names="${missed_names}
  - $name"
  fi
}

# NOTE ON `IF EXISTS`
#
# Every DROP in the cases below is `IF EXISTS`. The regression copy is a
# pg_restore of a snapshot, and a trigger that was created AFTER the
# snapshot (or by a migration that ran only on live) is simply not there.
# Without `IF EXISTS`, the DROP raises, the psql call aborts, and the
# regression silently measures nothing — which is exactly the failure
# this script exists to catch.

run_case "the evidence_status CHECK" \
  "ALTER TABLE statements DROP CONSTRAINT statements_evidence_status_check;"
run_case "dispute_state CHECK" \
  "ALTER TABLE statements DROP CONSTRAINT statements_dispute_state_check;"
run_case "the statements.status gate trigger" \
  "DROP TRIGGER IF EXISTS statements_status_gate_trg ON statements;"
run_case "the claim_dates interval-order CHECK" \
  "ALTER TABLE claim_dates DROP CONSTRAINT claim_dates_interval_order_check;"
run_case "the dpa relationship-type CHECK" \
  "ALTER TABLE dish_place_associations DROP CONSTRAINT dpa_relationship_type_check;"
run_case "the dpa entity-kind guard trigger" \
  "DROP TRIGGER IF EXISTS dpa_entity_guard_trg ON dish_place_associations;"
# The symmetric-pair index and the variant cycle guard are SHADOWED by
# the pre-existing check_relation_direction() trigger, which refuses the
# exact inverse of a directional relation and requires from < to for a
# symmetric one. So to prove the NEW constraint is doing the work, the
# regression drops the OLD trigger as well — otherwise the old one refuses
# the bad write first and the new one is never exercised.
run_case "the symmetric-pair unique index (with the old direction trigger)" \
  "DROP INDEX IF EXISTS dish_relations_symmetric_pair_uniq; DROP TRIGGER IF EXISTS trg_b_check_relation_direction ON dish_relations;"
run_case "the regional_variant_of cycle trigger (with the old direction trigger)" \
  "DROP TRIGGER IF EXISTS trg_c_check_variant_cycle ON dish_relations; DROP TRIGGER IF EXISTS trg_b_check_relation_direction ON dish_relations;"
run_case "the family parent cycle trigger (with the old self-parent guard)" \
  "DROP TRIGGER IF EXISTS dish_families_parent_cycle_trg ON dish_families; DROP TRIGGER IF EXISTS trg_family_parent ON dish_families;"
run_case "the dish_identities kind CHECK" \
  "ALTER TABLE dish_identities DROP CONSTRAINT dish_identities_kind_check;"

echo ""
admin -c "DROP DATABASE IF EXISTS ${DB};" >/dev/null 2>&1
echo "the regression copy is dropped"
rm -f "$SNAPSHOT"

# ── THE EXIT CODE ──────────────────────────────────────────────────────
#
# The point of the script is the PROOF. A case that is not detected means
# the test suite does not test that constraint, and the suite must not be
# trusted to catch that regression. That is a failure of the Nightly and
# it says so here, with a non-zero exit, so the workflow fails.
echo ""
echo "=== the summary ==="
echo "detected: $detected    not detected: $missed"
if [ "$missed" -ne 0 ]; then
  echo ""
  echo "FAILED: these regressions were NOT detected by the atlas suite:$missed_names" >&2
  echo "The atlas tests cannot be relied on to catch them." >&2
  exit 1
fi
if [ "$detected" -eq 0 ]; then
  echo "" >&2
  echo "FAILED: no case was detected at all — the harness is measuring nothing." >&2
  exit 1
fi
echo "every injected regression was detected."
exit 0
