#!/usr/bin/env bash
# Install the systemd units for periodic web rebuilds.
# Run as root on the VPS.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVICE_FILE="/etc/systemd/system/gustale-rebuild-web.service"
TIMER_FILE="/etc/systemd/system/gustale-rebuild-web.timer"
install -m 0644 "$SCRIPT_DIR/gustale-rebuild-web.service" "$SERVICE_FILE"
install -m 0644 "$SCRIPT_DIR/gustale-rebuild-web.timer"    "$TIMER_FILE"
# Service file uses User=hermes; we need to set +x on the script so
# the systemd service can run it as hermes.
chmod +x /home/hermes/projects/gustale.com/scripts/hermes/rebuild-web-live.sh
systemctl daemon-reload
systemctl enable --now gustale-rebuild-web.timer
systemctl status gustale-rebuild-web.timer --no-pager
