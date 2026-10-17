#!/usr/bin/env bash
# Install the systemd units for periodic web rebuilds.
# Run as root on the VPS.
#
# This script pulls the latest service + timer files from a known git
# checkout on the VPS, then enables the timer. Run it after every
# rebuild-web-live.sh / service / timer change.
#
# Required git checkout (must be the working copy of gustale.com):
#   /home/deploy/gustale-build/  (default; the build dir, owned by
#                                  hermes; this is also the dir the
#                                  service reads scripts/hermes/ from)
#   or
#   ${GUSTALE_SRC_DIR}           (override for ops who keep the source
#                                  elsewhere)
#
# The service's ExecStart points at /home/deploy/gustale-build/scripts/hermes/...
# so the script (and any updates) must be at that exact path. We copy
# the scripts/hermes/ tree from the source checkout to the build dir
# on every install, then reload systemd.
set -euo pipefail
SRC_DIR="${GUSTALE_SRC_DIR:-/home/deploy/gustale-build}"
DEST_DIR="/home/deploy/gustale-build"
SERVICE_FILE="/etc/systemd/system/gustale-rebuild-web.service"
TIMER_FILE="/etc/systemd/system/gustale-rebuild-web.timer"
ENV_FILE="/home/deploy/gustale-rebuild.env"
HERMES_ENV="/home/hermes/.hermes/.env"

if [ ! -d "$SRC_DIR/scripts/hermes" ]; then
  echo "ERROR: $SRC_DIR is not a gustale.com checkout (no scripts/hermes/)." >&2
  echo "  Either run this from the working repo at /home/hermes/projects/gustale.com" >&2
  echo "  or pass GUSTALE_SRC_DIR=/path/to/gustale.com." >&2
  exit 1
fi

# Install the script + service + timer into the build dir. The service
# reads scripts/hermes/* from $DEST_DIR, so the build dir MUST have
# the latest version of these. If SRC_DIR == DEST_DIR, the scripts
# are already in place (the install script itself lives there).
if [ "$SRC_DIR" != "$DEST_DIR" ]; then
  install -d -m 0755 "$DEST_DIR/scripts/hermes"
  install -m 0755 "$SRC_DIR/scripts/hermes/rebuild-web-live.sh" "$DEST_DIR/scripts/hermes/rebuild-web-live.sh"
  install -m 0755 "$SRC_DIR/scripts/hermes/build-web-live.sh"    "$DEST_DIR/scripts/hermes/build-web-live.sh"
fi
install -m 0644 "$SRC_DIR/scripts/hermes/gustale-rebuild-web.service" "$SERVICE_FILE"
install -m 0644 "$SRC_DIR/scripts/hermes/gustale-rebuild-web.timer"    "$TIMER_FILE"

# Lock + state dirs. The script uses flock on /var/lock/gustale-rebuild.lock
# and writes state to /var/lib/gustale-rebuild/state.json. Both must be
# writable by the hermes user (the service runs as hermes).
install -d -o hermes -g hermes -m 0755 /var/lock/gustale-rebuild 2>/dev/null || \
  install -d /var/lock/gustale-rebuild
install -d -o hermes -g hermes -m 0755 /var/lib/gustale-rebuild 2>/dev/null || \
  install -d /var/lib/gustale-rebuild

# State file may be left over from a previous install with bad perms.
# Touch it as hermes so the first run can write to it.
[ -f /var/lib/gustale-rebuild/state.json ] || touch /var/lib/gustale-rebuild/state.json
chown -R hermes:hermes /var/lock/gustale-rebuild /var/lib/gustale-rebuild

# Build dir must be writable by the rebuild user (hermes, per the
# service file's User=). The deploy path runs as root and writes
# directly. The rebuild path runs as hermes and does `git fetch` +
# `git checkout`; both need write access to .git/.
chown -R hermes:hermes "$DEST_DIR"

# The docker config dir is /home/hermes/.docker/ — it must be hermes-owned
# so the docker login in build-web-live.sh can write the credentials file.
chown -R hermes:hermes /home/hermes/.docker/ 2>/dev/null || \
  install -d -o hermes -g hermes /home/hermes/.docker

# Env file for the service. Holds GITHUB_TOKEN so build-web-live.sh
# can (optionally) push to ghcr.io. The rebuild script's design now
# skips the push (GUSTALE_NO_PUSH=1), so this token is no longer
# required for the rebuild — we keep it for the deploy path. Owned
# by hermes:hermes, mode 0600.
if [ -f "$HERMES_ENV" ] && grep -q '^GITHUB_TOKEN=' "$HERMES_ENV"; then
  TMP_ENV=$(mktemp)
  grep -E '^(GITHUB_TOKEN|GITHUB_ACTOR|GITHUB_REPOSITORY)=' "$HERMES_ENV" > "$TMP_ENV" || true
  install -m 0600 -o hermes -g hermes "$TMP_ENV" "$ENV_FILE"
  rm -f "$TMP_ENV"
  echo "wrote $ENV_FILE (GITHUB_TOKEN set)"
else
  echo "WARNING: $HERMES_ENV is missing GITHUB_TOKEN. The service will start; the rebuild script (which sets GUSTALE_NO_PUSH=1) does not need it. The deploy path needs it; populate it then re-run."
  install -m 0600 -o hermes -g hermes /dev/null "$ENV_FILE"
fi

systemctl daemon-reload
systemctl enable --now gustale-rebuild-web.timer
systemctl status gustale-rebuild-web.timer --no-pager
