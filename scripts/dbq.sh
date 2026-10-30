#!/usr/bin/env bash
# psql against the gustale database.
#
# Usage:
#   ./dbq.sh "SELECT ..."                 — run one read-only query
#   ./dbq.sh -c "SELECT ..."             — the same
#   ./dbq.sh -v NAME=value -v N2=v2 "SELECT :'NAME'"   — with variables
#
# The variables use psql's own `:'name'` quoting, so a value that
# contains an apostrophe, a dollar sign or a newline is passed
# SAFELY — psql quotes and escapes it. That is the only safe way to
# put a translated sentence into an UPDATE.
#
# The password is read from the file and passed via PGPASSWORD on the
# environment of the psql child process. It is never echoed, never
# stored in the repo, and never printed.
set -euo pipefail

# The password comes from the environment when it is set (the VPS, and
# the GitHub Actions job that SSHes in), and from the local file
# otherwise. The file is only readable by the deploy user locally.
DB_PASSWORD_FILE="${GUSTALE_DB_PASSWORD_FILE:-/home/deploy/gustale.com/.db-password}"
DB_NAME="${GUSTALE_DB_NAME:-gustale}"
DB_USER="${GUSTALE_DB_USER:-gustale}"
DB_HOST="${GUSTALE_DB_HOST:-127.0.0.1}"
DB_PORT="${GUSTALE_DB_PORT:-5432}"

export PGPASSWORD
if [[ -n "${GUSTALE_DB_PASSWORD:-}" ]]; then
  # From the environment. Use it as-is.
  PGPASSWORD="$GUSTALE_DB_PASSWORD"
elif [[ -r "$DB_PASSWORD_FILE" ]]; then
  # The file holds `GUSTALE_DB_PASSWORD=<value>`. Take only the VALUE —
  # sending the whole line would send "GUSTALE_DB_PASSWORD=..." as the
  # password.
  _pw_raw="$(cat "$DB_PASSWORD_FILE")"
  if [[ "$_pw_raw" == *"="* ]]; then
    PGPASSWORD="${_pw_raw#*=}"
  else
    PGPASSWORD="$_pw_raw"
  fi
  unset _pw_raw
else
  echo "ERROR: no database password. Set GUSTALE_DB_PASSWORD, or make" >&2
  echo "       $DB_PASSWORD_FILE readable." >&2
  exit 1
fi

# Parse the flags. -c is accepted for compatibility and ignored — the
# query always goes to psql with -c, so psql never mistakes it for
# one of its own options.
VARS=()
QUERY=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    -c)
      shift
      ;;
    -v)
      if [[ $# -lt 2 ]]; then
        echo "ERROR: -v needs a NAME=value argument" >&2
        exit 2
      fi
      VARS+=("-v" "$2")
      shift 2
      ;;
    --)
      shift
      QUERY="$*"
      break
      ;;
    *)
      QUERY="$1"
      shift
      ;;
  esac
done

if [[ -z "$QUERY" ]]; then
  # No query was given as an argument — read it from STDIN. This is
  # how a large generated statement is passed: as an argument it would
  # overflow the exec argument list.
  if [[ ! -t 0 ]]; then
    QUERY="$(cat)"
  fi
fi

if [[ -z "$QUERY" ]]; then
  echo "usage: dbq.sh [-v NAME=value] \"<sql>\"" >&2
  echo "       (or pipe the SQL on stdin)" >&2
  exit 2
fi

# The query goes through STDIN, not -c. psql only interpolates its
# :'name' variables in script input — with -c, the variables are
# passed but NOT substituted. So a value containing an apostrophe
# would be injected as raw SQL.
#
# The query is ALSO written to a temporary file rather than being
# passed as a command-line argument to this script. A generated
# statement can run to tens of kilobytes, and a single argument that
# long overflows the exec argument list ("Argument list too long").
# The file keeps the interface the same — the SQL still arrives as an
# argument to dbq.sh — while the ARGUMENT TO PSQL stays short.
QUERY_FILE="$(mktemp)"
trap 'rm -f "$QUERY_FILE"' EXIT
printf '%s\n' "$QUERY" > "$QUERY_FILE"

cat "$QUERY_FILE" | docker exec -e PGPASSWORD="$PGPASSWORD" -i shared-postgres \
  psql -v ON_ERROR_STOP=1 -X \
       "${VARS[@]+"${VARS[@]}"}" \
       -U "$DB_USER" -d "$DB_NAME" -h 127.0.0.1 -p 5432
