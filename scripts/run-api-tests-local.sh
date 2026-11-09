#!/usr/bin/env bash
# Run the API test suite against the TEST CONTAINER's database.
#
# The EXISTING `scripts/run-api-tests.sh` runs against the local dev
# Postgres on port 5432, reading the password out of `.env`. This one
# runs against the dedicated test container on port 5434, and builds the
# DSN from that container's own variables -- so no secret is written
# into this file and none is printed.
#
# Usage: bash scripts/run-api-tests-local.sh [vitest args...]
#
# The database name comes from GUSTALE_TEST_DB_NAME and defaults to the
# card's database. Build it with scripts/repro-ci-test-job.sh first.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

# shellcheck source=/dev/null
source "$REPO_ROOT/scripts/lib/test_pg.sh"

DB_NAME="${GUSTALE_TEST_DB_NAME:-gustale_t_5c002b54}"

export DATABASE_URL="postgres://${TEST_PG_USER}:${TEST_PG_PASSWORD}@127.0.0.1:${TEST_PG_PORT}/${DB_NAME}"

# The same non-secret values CI uses. The server boots through env
# validation before the tests run, so these must be present -- they are
# safe because nothing here talks to a real MinIO or auth provider.
export SESSION_SECRET="ci-session-secret-do-not-use-anywhere-real"
export AUTH_SECRET="ci-auth-secret-do-not-use-anywhere-real"
export BETTER_AUTH_SECRET="ci-auth-secret-do-not-use-anywhere-real"
export MINIO_ENDPOINT="http://127.0.0.1:9000"
export MINIO_ACCESS_KEY="minioadmin"
export MINIO_SECRET_KEY="minioadmin"
export MINIO_BUCKET_PUBLIC="gustale-media"
export MINIO_BUCKET_PRIVATE="gustale-media-private"
export NODE_ENV="test"

cd "$REPO_ROOT/apps/api"
exec npx vitest run "$@"
