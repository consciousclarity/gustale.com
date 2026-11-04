#!/usr/bin/env bash
# The gate for dropping a stray POSTGRES ROLE from the live cluster.
#
# ---------------------------------------------------------------------------
# WHY THIS EXISTS
# ---------------------------------------------------------------------------
# The live cluster is shared by the production API. A role that was
# created by accident, by a probe or by a diagnostic, is harmless on
# its own -- but it is also invisible: nothing lists "the roles that
# should exist", so a stray role sits in the cluster forever.
#
# Dropping a role on live is NOT something to do with a one-liner. A
# role can still be referenced by:
#
#   * another role's membership in it (GRANT role TO other)
#   * another role being a member of it
#   * objects it owns in ANY database in the cluster
#   * a default privilege or a SECURITY LABEL
#
# `DROP ROLE` fails if any of those hold, but "it failed" is not a
# plan. This script AUDITS first and refuses to drop a role that is
# still referenced, so the drop is either safe or it does not happen.
#
# ---------------------------------------------------------------------------
# USAGE
# ---------------------------------------------------------------------------
#   scripts/drop-stray-role.sh <role-name> [--apply]
#
# Without --apply it AUDITS and reports, and touches nothing.
# With --apply it drops the role -- but ONLY if every check below
# passes.
#
#   scripts/drop-stray-role.sh probe_issuer --apply
#
# ---------------------------------------------------------------------------
# THE CHECKS (all must pass before a drop)
# ---------------------------------------------------------------------------
#   1. The role exists.
#   2. It CANNOT LOG IN (rolcanlogin = false).
#   3. It has NO password (rolpassword IS NULL).
#   4. It is NOT a superuser / createdb / createrole / replication /
#      bypassrls.
#   5. It is a member of NO role and NO role is a member of it
#      (pg_auth_members is empty in both directions).
#   6. It owns NO object in ANY database in the cluster.
#   7. It has NO database-level grant.
#
# Check 5 is the one that matters most: `gustale_credential_issuer`
# is the role that owns `publish_credential` and issues credentials.
# A stray role that is a MEMBER of it would be a privilege-escalation
# path, and dropping it would change who can issue credentials.
#
# ---------------------------------------------------------------------------
# HOW IT REACHES THE DATABASE
# ---------------------------------------------------------------------------
# Same convention as scripts/delete-test-account.sh — one variable,
# read from the environment:
#
#   GUSTALE_PG_MODE=docker   -> docker exec -i -u postgres shared-postgres ...
#   GUSTALE_PG_MODE=host     -> psql on 127.0.0.1 (CI's service container)
#
set -euo pipefail

ROLE="${1:?usage: drop-stray-role.sh <role-name> [--apply]}"
APPLY=0
for arg in "$@"; do
  case "$arg" in
    --apply) APPLY=1 ;;
  esac
done

PG_MODE="${GUSTALE_PG_MODE:-docker}"
PGHOST="${GUSTALE_PGHOST:-127.0.0.1}"
PGPORT="${GUSTALE_PGPORT:-5432}"
PGUSER="${GUSTALE_PGUSER:-postgres}"
PGPASSWORD="${GUSTALE_PGPASSWORD:-gustale}"
PGCONTAINER="${GUSTALE_PG_CONTAINER:-shared-postgres}"

log() { echo "$*"; }
fail() { echo "::error::$*" >&2; exit 1; }

pg_admin() {
  if [ "$PG_MODE" = "host" ]; then
    PGPASSWORD="$PGPASSWORD" psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -tA "$@"
  else
    docker exec -i -u postgres "$PGCONTAINER" psql -U "$PGUSER" -tA "$@"
  fi
}
pg_admin_h() {
  if [ "$PG_MODE" = "host" ]; then
    PGPASSWORD="$PGPASSWORD" psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" "$@"
  else
    docker exec -i -u postgres "$PGCONTAINER" psql -U "$PGUSER" "$@"
  fi
}

log "=== stray role gate: '$ROLE' ==="
log "  mode:  $PG_MODE"
log "  apply: $APPLY"
log ""

# --- check 1: the role exists -------------------------------------------
EXISTS=$(pg_admin -d postgres -c "SELECT count(*) FROM pg_roles WHERE rolname = '$ROLE';")
if [ "$EXISTS" != "1" ]; then
  fail "the role '$ROLE' does not exist — nothing to do."
fi
log "  [1] the role exists"

# --- checks 2-4: it cannot log in, has no password, is not privileged ---
ATTRS=$(pg_admin -d postgres -c "
  SELECT concat_ws('|', rolcanlogin, (rolpassword IS NOT NULL), rolsuper,
                   rolcreatedb, rolcreaterole, rolreplication, rolbypassrls)
  FROM pg_authid WHERE rolname = '$ROLE';")
CANLOGIN="${ATTRS%%|*}"; REST="${ATTRS#*|}"
HAS_PW="${REST%%|*}"; REST2="${REST#*|}"; SUPER="${REST2%%|*}"; REST3="${REST2#*|}"
CREATEDB="${REST3%%|*}"; REST4="${REST3#*|}"; CREATEROLE="${REST4%%|*}"
REST5="${REST4#*|}"; REPL="${REST5%%|*}"; BYPASS="${REST5#*|}"

log "  [2] rolcanlogin=$CANLOGIN  has_password=$HAS_PW"
log "  [4] super=$SUPER createdb=$CREATEDB createrole=$CREATEROLE replication=$REPL bypassrls=$BYPASS"

if [ "$CANLOGIN" = "t" ]; then
  fail "the role '$ROLE' CAN LOG IN. A role that can log in may still be in use. Refusing."
fi
if [ "$HAS_PW" = "t" ]; then
  fail "the role '$ROLE' HAS A PASSWORD. It may be in use. Refusing."
fi
if [ "$SUPER" = "t" ] || [ "$CREATEDB" = "t" ] || [ "$CREATEROLE" = "t" ] \
   || [ "$REPL" = "t" ] || [ "$BYPASS" = "t" ]; then
  fail "the role '$ROLE' holds a privileged attribute. Refusing."
fi
log "  [3] no login, no password, no privileged attributes"

# --- check 5: memberships, BOTH directions ------------------------------
MEMB=$(pg_admin -d postgres -c "
  SELECT count(*) FROM pg_auth_members am
  JOIN pg_authid r ON r.oid = am.roleid
  JOIN pg_authid m ON m.oid = am.member
  WHERE r.rolname = '$ROLE' OR m.rolname = '$ROLE';")
if [ "$MEMB" != "0" ]; then
  log "  --- the memberships of '$ROLE' ---"
  pg_admin_h -d postgres -c "
    SELECT concat('    ', r.rolname, ' <- member: ', m.rolname)
    FROM pg_auth_members am
    JOIN pg_authid r ON r.oid = am.roleid
    JOIN pg_authid m ON m.oid = am.member
    WHERE r.rolname = '$ROLE' OR m.rolname = '$ROLE';"
  fail "the role '$ROLE' is in a membership. Dropping it would change who can act as whom. Refusing."
fi
log "  [5] no memberships in either direction"

# --- check 6: it owns no object in ANY database -------------------------
DATABASES=$(pg_admin -d postgres -c "SELECT datname FROM pg_database WHERE datallowconn ORDER BY datname;")
OWNED_TOTAL=0
for db in $DATABASES; do
  n=$(pg_admin -d "$db" -c "
    SELECT count(*) FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_roles r ON r.oid = c.relowner
    WHERE r.rolname = '$ROLE';")
  OWNED_TOTAL=$((OWNED_TOTAL + n))
  [ "$n" != "0" ] && log "    $db: $n object(s) owned by '$ROLE'"
done
if [ "$OWNED_TOTAL" != "0" ]; then
  fail "the role '$ROLE' owns $OWNED_TOTAL object(s). Refusing."
fi
log "  [6] owns no object in any of $(echo "$DATABASES" | wc -w) database(s)"

# --- check 7: no database-level grant -----------------------------------
DBGRANT=$(pg_admin -d postgres -c "
  SELECT count(*) FROM pg_database WHERE datacl::text LIKE '%$ROLE%';")
if [ "$DBGRANT" != "0" ]; then
  fail "the role '$ROLE' has a database-level grant. Refusing."
fi
log "  [7] no database-level grant"
log ""

if [ "$APPLY" != "1" ]; then
  log "AUDIT ONLY — nothing was changed. Re-run with --apply to drop the role."
  exit 0
fi

# --- the drop ------------------------------------------------------------
log "--- dropping '$ROLE' ---"
if ! pg_admin_h -d postgres -c "DROP ROLE IF EXISTS \"$ROLE\";"; then
  fail "the DROP ROLE failed. Inspect the error above."
fi

REMAIN=$(pg_admin -d postgres -c "SELECT count(*) FROM pg_roles WHERE rolname = '$ROLE';")
if [ "$REMAIN" != "0" ]; then
  fail "the role still exists after the DROP. Something recreated it."
fi
log "OK: the role '$ROLE' is gone."
