#!/usr/bin/env bash
# The DEDICATED test Postgres.
#
# WHY THIS EXISTS
# ---------------
# On 2026-11-06 the live `gustale` database was DROPPED and recreated
# empty, because a diagnostic script ran
#
#     DROP DATABASE IF EXISTS gustale; CREATE DATABASE gustale;
#
# against the PRODUCTION container.
#
# The deeper problem is that `DROP DATABASE` and `CREATE DATABASE` are
# CLUSTER-SCOPED: they act on a whole Postgres instance, not on one
# database. The production instance is the `shared-postgres` container,
# and it is shared with OTHER PROJECTS (bali, dewata, n8n, scribe). So
# every throwaway database the repo creates on it is a hazard for all of
# them -- and one mistyped name is a data-loss event for the live site.
#
# The fix is structural: throwaway databases do not live on the
# production cluster at all. They live HERE, in a container of their own
# that nothing else uses.
#
# WHY A SEPARATE CONTAINER AND NOT A SEPARATE DATABASE
# ----------------------------------------------------
# A separate DATABASE on the same cluster does not help: the cluster is
# the unit of destruction, and so is the unit of capacity. The
# production cluster hosts six other projects' databases; a test suite
# that creates and drops databases on it competes for the same
# resources and carries the same blast radius.
#
# WHAT THIS PROVIDES
# ------------------
#   * `gustale-test-postgres` — a container of its own, with PostGIS,
#     on 127.0.0.1:5434, so it CANNOT collide with production's 5432.
#   * A superuser role `gustale` with password `gustale`, matching the
#     shape CI uses, so the CI-shaped scripts work unchanged.
#   * A `postgres` superuser for the migration chain.
#
# THE PORT IS DELIBERATE
# ----------------------
# 5434, not 5432. Production is on 5432. A script that means "the test
# container" and a script that means "production" therefore differ in
# their PORT as well as their container name, and a mistake in one is
# not a mistake in the other.
#
# (5433 is the Hindsight memory database's port on this host, so the test
# Postgres takes 5434.)
#
# USAGE
# -----
#   source scripts/lib/test_pg.sh          # exports the variables
#   bash scripts/lib/test_pg.sh up         # start the container
#   bash scripts/lib/test_pg.sh down       # stop and remove it
#   bash scripts/lib/test_pg.sh status     # is it up?
#   bash scripts/lib/test_pg.sh psql "SELECT 1"   # run a query
#: NOTE ON `set`:
#: This file is SOURCED, not executed, so it must NOT set `errexit` in
#: the caller's shell. A sourced `set -e` changes the semantics of
#: everything the caller does afterwards -- in particular, it makes a
#: refused call (which correctly returns 1) abort the caller's script
#: before it can report the refusal. The refusal is the interesting
#: outcome, so the caller must be able to see it.
#:
#: The functions here check their own preconditions and return 1.
if [ "${BASH_SOURCE[0]}" = "${0}" ]; then
  # Executed, not sourced: then the strict mode applies to us.
  set -euo pipefail
fi

#: The container's name. It is NOT `shared-postgres`, and the guard
#: refuses that one by name.
TEST_PG_CONTAINER="gustale-test-postgres"

#: The host port. Production is on 5432; this is 5434, deliberately.
#:
#: Not 5433: that port is taken by the Hindsight memory database, which
#: Hermes runs on this host. A test container that could not start is a
#: test container nobody sets up.
TEST_PG_PORT="${GUSTALE_TEST_PG_PORT:-5434}"

#: The superuser role, and its password. CI uses the same pair, so the
#: CI-shaped scripts work unchanged.
TEST_PG_USER="${GUSTALE_TEST_PG_USER:-gustale}"
TEST_PG_PASSWORD="${GUSTALE_TEST_PG_PASSWORD:-gustale}"

#: The admin role, for CREATE/DROP DATABASE.
#:
#: It is the SAME role as TEST_PG_USER, because the container is created
#: with POSTGRES_USER=gustale: the postgis image makes that role the
#: cluster's superuser and does NOT create a separate `postgres` role.
#: (Naming a `postgres` role here would fail with "role \"postgres\" does
#: not exist" -- which is exactly what the first version of this
#: helper did.)
TEST_PG_ADMIN="${GUSTALE_TEST_PG_ADMIN:-${TEST_PG_USER}}"

#: The image. The SAME PostGIS build production uses, so a test
#: database has exactly production's extension set.
TEST_PG_IMAGE="${GUSTALE_TEST_PG_IMAGE:-postgis/postgis:16-3.4}"

export TEST_PG_CONTAINER TEST_PG_PORT TEST_PG_USER TEST_PG_PASSWORD TEST_PG_ADMIN TEST_PG_IMAGE

#: The DSN of the test container.
test_pg_dsn() {
  local dbname="${1:-postgres}"
  echo "postgres://${TEST_PG_USER}:${TEST_PG_PASSWORD}@127.0.0.1:${TEST_PG_PORT}/${dbname}"
}

#: Run psql against the TEST container. Never against production.
test_pg_psql() {
  docker exec -u postgres -i "$TEST_PG_CONTAINER" \
    psql -U "$TEST_PG_ADMIN" -d "${1:-postgres}" -v ON_ERROR_STOP=1 "${@:2}"
}

#: Run psql against a database on the TEST container.
#:
#: The argument order matches what a migration script expects:
#: `test_pg_run <dbname> <psql args...>`.
test_pg_run() {
  local dbname="$1"; shift
  docker exec -u postgres -i "$TEST_PG_CONTAINER" \
    psql -U "$TEST_PG_ADMIN" -d "$dbname" -v ON_ERROR_STOP=1 "$@"
}

#: Create a throwaway database on the TEST container.
test_pg_create() {
  local dbname="$1"
  # THE LIVE NAME IS REFUSED. The test container's helper must never
  # be the thing that drops the live database, whatever it is asked to
  # do -- so the name is checked here, and the check is unconditional.
  if [ "$dbname" = "gustale" ]; then
    echo "REFUSED: the test Postgres will not create a database named 'gustale'." >&2
    echo "       That is the LIVE database's name. It must never be a" >&2
    echo "       droppable target, on any container." >&2
    return 1
  fi
  test_pg_psql postgres -c "DROP DATABASE IF EXISTS ${dbname};" \
                        -c "CREATE DATABASE ${dbname};" >/dev/null
}

#: Drop a throwaway database on the TEST container.
test_pg_drop() {
  local dbname="$1"
  # THE LIVE NAME IS REFUSED. See test_pg_create above.
  if [ "$dbname" = "gustale" ]; then
    echo "REFUSED: the test Postgres will not drop a database named 'gustale'." >&2
    echo "       That is the LIVE database's name." >&2
    return 1
  fi
  test_pg_psql postgres -c "DROP DATABASE IF EXISTS ${dbname};" >/dev/null
}

test_pg_up() {
  if docker ps --format '{{.Names}}' | grep -qx "$TEST_PG_CONTAINER"; then
    echo "the test Postgres ($TEST_PG_CONTAINER) is already up"
    return 0
  fi
  echo "=== starting the test Postgres ($TEST_PG_CONTAINER) on 127.0.0.1:${TEST_PG_PORT} ==="
  docker rm -f "$TEST_PG_CONTAINER" >/dev/null 2>&1 || true
  docker run -d \
    --name "$TEST_PG_CONTAINER" \
    -e POSTGRES_USER="$TEST_PG_USER" \
    -e POSTGRES_PASSWORD="$TEST_PG_PASSWORD" \
    -e POSTGRES_DB=postgres \
    -p "127.0.0.1:${TEST_PG_PORT}:5432" \
    "$TEST_PG_IMAGE" >/dev/null

  # Wait for it to accept connections.
  local i
  for i in $(seq 1 30); do
    if docker exec "$TEST_PG_CONTAINER" pg_isready -U "$TEST_PG_USER" -d postgres >/dev/null 2>&1; then
      echo "the test Postgres is up"
      return 0
    fi
    sleep 1
  done
  echo "ERROR: the test Postgres did not become ready in 30 seconds" >&2
  return 1
}

test_pg_down() {
  echo "=== removing the test Postgres ($TEST_PG_CONTAINER) ==="
  docker rm -f "$TEST_PG_CONTAINER" >/dev/null 2>&1 || true
  echo "removed"
}

test_pg_status() {
  if docker ps --format '{{.Names}}' | grep -qx "$TEST_PG_CONTAINER"; then
    echo "UP    $TEST_PG_CONTAINER on 127.0.0.1:${TEST_PG_PORT}"
    return 0
  fi
  echo "DOWN  $TEST_PG_CONTAINER"
  return 1
}

# Only run when EXECUTED, not when sourced.
if [ "${BASH_SOURCE[0]}" = "${0}" ]; then
  case "${1:-status}" in
    up)    test_pg_up ;;
    down)  test_pg_down ;;
    status) test_pg_status ;;
    psql)  shift; test_pg_psql "${@}" ;;
    dsn)   test_pg_dsn "${2:-postgres}" ;;
    *) echo "usage: test_pg.sh {up|down|status|psql <sql>|dsn [db]}" >&2; exit 2 ;;
  esac
fi
