#!/usr/bin/env bash
#
# The systemd units must be installed ROOT-OWNED.
#
# WHY THIS IS A SECURITY TEST, NOT A STYLISTIC ONE
#
# A systemd unit file that is owned by a normal user is an escalation
# to root. systemd reads the unit as root and executes what it says, so
# anyone who can WRITE the unit can put
#
#     ExecStartPre=/bin/sh -c '...'
#
# in it and have root execute it. The unit's own `User=` directive does
# not protect the file, because the file is read and parsed as root
# BEFORE the privilege drop to `User=` happens.
#
# The service here runs as `gustale` — and `gustale` is also the
# account the operator logs in as. So "gustale can rewrite the unit"
# means "any write primitive that reaches gustale is root".
#
# WHAT THIS CHECKS
#
#  1. install-rebuild-timer.sh installs the two unit files as
#     root:root, NOT as $SVC_USER.
#  2. It ASSERTS the ownership after installing, rather than assuming
#     that `install -o root` did what it says.
#  3. The drop-in directories are root-owned too — a drop-in is a unit
#     file fragment and systemd executes what it says.
#
# The test is STATIC: it reads the installer and checks the install
# lines. It never writes to /etc/systemd and never needs root.
#
set -uo pipefail
cd "$(dirname "$0")/../.."

INSTALLER="scripts/hermes/install-rebuild-timer.sh"
PASS=0
FAIL=0

ok()  { printf '     PASS  %s\n' "$1"; PASS=$((PASS+1)); }
bad() { printf '     FAIL  %s\n' "$1"; FAIL=$((FAIL+1)); }

echo "  --- case 1: the installer exists and is readable ---"
if [ -r "$INSTALLER" ]; then
  ok "case 1: $INSTALLER is readable"
else
  bad "case 1: $INSTALLER is not readable"
  echo "  === $PASS passed, $FAIL failed ==="
  exit 1
fi

# The two unit files the installer writes.
UNITS="gustale-rebuild-web.service gustale-rebuild-web.timer"

echo ""
echo "  --- case 2: each unit is installed root:root ---"
for u in $UNITS; do
  # The line that installs it: `install ... <src> "$SERVICE_FILE"`.
  line=$(grep -n "gustale-rebuild-web\.\(service\|timer\)" "$INSTALLER" \
         | grep -E 'install ' | grep -vE '^\s*#' | head -1)
  if [ -z "$line" ]; then
    bad "case 2: no install line found for $u"
    continue
  fi
  if echo "$line" | grep -q -- '-o root -g root'; then
    ok "case 2: $u is installed with -o root -g root"
  else
    bad "case 2: $u is NOT installed root:root -- '$line'"
  fi
done

echo ""
echo "  --- case 3: NO unit is installed as the service user ---"
# The dangerous form: `install ... -o "$SVC_USER" ... <unit file>`.
if grep -nE 'install .*-o "\$SVC_USER".*gustale-rebuild-web\.(service|timer)' "$INSTALLER" \
     | grep -v '^\s*#' | grep -q .; then
  bad "case 3: a unit file is still installed as \$SVC_USER"
  grep -nE 'install .*-o "\$SVC_USER".*gustale-rebuild-web\.(service|timer)' "$INSTALLER" \
    | sed 's/^/           /'
else
  ok "case 3: no unit file is installed as \$SVC_USER"
fi

echo ""
echo "  --- case 4: the installer ASSERTS the ownership after installing ---"
# A stale unit left over from an earlier install with the wrong owner
# must be corrected or refused, not silently kept. So there must be a
# check that reads back the ownership.
if grep -qE 'stat -c .%U:%G' "$INSTALLER"; then
  ok "case 4: the installer reads back the ownership (stat)"
else
  bad "case 4: the installer never verifies the installed ownership"
fi
if grep -q 'root:root' "$INSTALLER"; then
  ok "case 4: the installer compares against root:root"
else
  bad "case 4: the installer does not compare against root:root"
fi
# And it must FAIL CLOSED, not just warn.
if grep -qE 'exit 1' "$INSTALLER"; then
  ok "case 4: the installer can fail closed"
else
  bad "case 4: the installer has no fail-closed path"
fi

echo ""
echo "  --- case 5: the drop-in directories are handled ---"
# A drop-in is a unit file fragment. If the directory is user-writable
# the user can add a fragment that systemd will execute as root.
if grep -q 'service\.d' "$INSTALLER"; then
  ok "case 5: the installer handles the .service.d drop-in directories"
else
  bad "case 5: the installer ignores the .service.d drop-in directories"
fi

echo ""
echo "  --- case 6: the service still RUNS as the service user ---"
# The fix must not accidentally make the service run as root. The
# unit's User= is what makes it run as gustale; the file ownership is
# a separate concern.
if grep -qE '^User=gustale$' scripts/hermes/gustale-rebuild-web.service; then
  ok "case 6: the .service still declares User=gustale"
else
  bad "case 6: the .service no longer declares User=gustale"
fi

echo ""
echo "  === $PASS passed, $FAIL failed ==="
[ "$FAIL" -eq 0 ] || exit 1
exit 0
