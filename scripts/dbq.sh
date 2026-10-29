#!/usr/bin/env bash
# Read-only psql against the live gustale database.
#
# Usage:  ./dbq.sh "SELECT ..."
#         ./dbq.sh -c "SELECT ..."      (same thing)
#
# The password is read from the file and passed via PGPASSWORD on the
# environment of the psql child process. It is never echoed, never stored in
# the repo, and never printed.
set -euo pipefail

DB_PASSWORD_FILE="/home/deploy/gustale.com/.db-password"
DB_NAME="${GUSTALE_DB_NAME:-gustale}"
DB_USER="${GUSTALE_DB_USER:-gustale}"
DB_HOST="${GUSTALE_DB_HOST:-127.0.0.1}"
DB_PORT="${GUSTALE_DB_PORT:-5432}"

if [[ ! -r "$DB_PASSWORD_FILE" ]]; then
  echo "ERROR: cannot read $DB_PASSWORD_FILE" >&2
  exit 1
fi

export PGPASSWORD
PGPASSWORD="$(cat "$DB_PASSWORD_FILE")"

# Usage:  ./dbq.sh "SELECT ..."
#
# The query is always passed with -c so psql never mistakes it for one of
# its own options.
QUERY="${1:-}"
if [[ -z "$QUERY" ]]; then
  echo "usage: dbq.sh \"<sql>\"" >&2
  exit 2
fi

exec docker exec -e PGPASSWORD="$PGPASSWORD" -i shared-postgres \
  psql -v ON_ERROR_STOP=1 -X \
       -U "$DB_USER" -d "$DB_NAME" -h 127.0.0.1 -p 5432 \
       -c "$QUERY"
