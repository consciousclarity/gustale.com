#!/usr/bin/env bash
# Install the systemd units for periodic web rebuilds.
# Run as root on the VPS.
#
# This script pulls the latest service + timer files from a known git
# checkout on the VPS, then enables the timer. Run it after every
# rebuild-web-live.sh / service / timer change.
#
# ---------------------------------------------------------------------------
# OWNERSHIP MODEL — read this before changing anything
# ---------------------------------------------------------------------------
# The service runs as `gustale`. `gustale` owns EVERYTHING the rebuild
# touches:
#
#   /home/deploy/gustale-build          the CI deploy's build checkout
#   /home/gustale/gustale-rebuild-checkout   the TIMER's build checkout
#   /home/deploy/gustale-rebuild/        the installed scripts
#   /home/deploy/gustale-rebuild.env     the env file (mode 0600)
#   /var/lib/gustale-rebuild/            the state file
#
# `hermes` owns NOTHING in the deploy chain. That is deliberate.
#
# THE LOCK IS NOT IN THAT LIST, and that is deliberate too. The lock is
# /tmp/gustale-deploy.lock -- the SAME file the CI deploy (running as
# root) locks. It cannot be owned by `gustale` and it must not be a
# second, private lock: two different lock files do not exclude each
# other, and both sides swap the same two web containers. See
# scripts/hermes/rebuild-web-live.sh, Step 1.
#
# WHY THE TIMER GETS ITS OWN CHECKOUT
#
# The CI deploy and the rebuild timer used to share
# /home/deploy/gustale-build. The CI deploy runs as root and writes git
# objects as root; those land in .git/objects/<xx>/ owned by root, mode
# 0755. The timer, running as `gustale`, could then not write into them
# and every run died with:
#
#   error: insufficient permission for adding an object to repository
#          database .git/objects
#   fatal: failed to write object
#   fatal: unpack-objects failed
#
# It was worse than a failure: a failed `git fetch` FREEZES the
# origin/main ref at its old value, and the script's
# `git checkout --force origin/main` then SUCCEEDED against that stale
# ref — rolling the build dir BACKWARDS to an old commit. The timer
# was silently deploying a stale commit every 30 minutes.
#
# So the timer gets its own checkout, owned by `gustale`, and the CI
# deploy keeps the shared one. They cannot corrupt each other.
#
# The rebuild script honours GUSTALE_BUILD_DIR, so pointing the timer
# at its own checkout is a one-line change in the env file.
#
# ---------------------------------------------------------------------------
# Required git checkout (must be the working copy of gustale.com):
#   /home/deploy/gustale-build/  (default; the build dir, owned by
#                                  gustale; this is also the dir the
#                                  service reads scripts/hermes/ from)
#   or
#   ${GUSTALE_SRC_DIR}           (override for ops who keep the source
#                                  elsewhere)
#
# The service's ExecStart points at /home/deploy/gustale-rebuild/...
# so the script (and any updates) must be at that exact path. We copy
# the scripts/hermes/ tree from the source checkout to the deploy dir
# on every install, then reload systemd.
set -euo pipefail
SRC_DIR="${GUSTALE_SRC_DIR:-/home/deploy/gustale-build}"
DEST_DIR="/home/deploy/gustale-build"
DEPLOY_DIR="/home/deploy/gustale-rebuild"
# The timer builds from its OWN checkout, not from DEST_DIR.
TIMER_BUILD_DIR="${GUSTALE_TIMER_BUILD_DIR:-/home/gustale/gustale-rebuild-checkout}"
SERVICE_FILE="/etc/systemd/system/gustale-rebuild-web.service"
TIMER_FILE="/etc/systemd/system/gustale-rebuild-web.timer"
ENV_FILE="/home/deploy/gustale-rebuild.env"
HERMES_ENV="/home/hermes/.hermes/.env"
# The user the service runs as, and the only owner in the deploy chain.
SVC_USER="gustale"
SVC_GROUP="gustale"

if [ ! -d "$SRC_DIR/scripts/hermes" ]; then
  echo "ERROR: $SRC_DIR is not a gustale.com checkout (no scripts/hermes/)." >&2
  echo "  Either run this from the working repo at /home/gustale/projects/gustale.com" >&2
  echo "  or pass GUSTALE_SRC_DIR=/path/to/gustale.com." >&2
  exit 1
fi

# Install the script + service + timer into the deploy dir. The service
# ExecStart points at $DEPLOY_DIR/rebuild-web-live.sh, so the scripts
# must be at that exact path. The service runs as `gustale`, so the
# deploy dir must be owned by `gustale` — the script is not in the
# build dir any more, so a `git checkout --force` in the build dir can
# never clobber the script that is running.
install -d -o "$SVC_USER" -g "$SVC_GROUP" -m 0755 "$DEPLOY_DIR"
install -m 0755 -o "$SVC_USER" -g "$SVC_GROUP" "$SRC_DIR/scripts/hermes/rebuild-web-live.sh" "$DEPLOY_DIR/rebuild-web-live.sh"
install -m 0755 -o "$SVC_USER" -g "$SVC_GROUP" "$SRC_DIR/scripts/hermes/build-web-live.sh"    "$DEPLOY_DIR/build-web-live.sh"

# The post-deploy sitemap check (PR #163). The rebuild script looks for
# it at /home/deploy/gustale-rebuild/scripts/check-live-sitemaps.sh, so
# it must be installed under $DEPLOY_DIR/scripts/ — NOT next to the
# other two scripts. Installing it flat would make the rebuild abort
# with "the sitemap check script is missing" on every run.
install -d -o "$SVC_USER" -g "$SVC_GROUP" -m 0755 "$DEPLOY_DIR/scripts"
if [ -f "$SRC_DIR/scripts/check-live-sitemaps.sh" ]; then
  install -m 0755 -o "$SVC_USER" -g "$SVC_GROUP" "$SRC_DIR/scripts/check-live-sitemaps.sh" "$DEPLOY_DIR/scripts/check-live-sitemaps.sh"
fi

install -m 0644 -o "$SVC_USER" -g "$SVC_GROUP" "$SRC_DIR/scripts/hermes/gustale-rebuild-web.service" "$SERVICE_FILE"
install -m 0644 -o "$SVC_USER" -g "$SVC_GROUP" "$SRC_DIR/scripts/hermes/gustale-rebuild-web.timer"    "$TIMER_FILE"

# Lock + state dirs. The script uses flock on the SHARED deploy lock
# (/tmp/gustale-deploy.lock -- the same one the CI deploy takes) and
# writes state to /var/lib/gustale-rebuild/state.json. The state dir
# must be writable by the service user (gustale).
#
# The LOCK lives in /tmp, not here: it must be the SAME file the CI
# deploy (which runs as root) locks, and /tmp is where the deploy
# creates it. There is no lock file to install -- the timer creates it
# on first use, and falls back to a read-only open when the root-owned
# file is not writable by `gustale`.
install -d -o "$SVC_USER" -g "$SVC_GROUP" -m 0755 /var/lib/gustale-rebuild

# State file may be left over from a previous install with bad perms.
# Touch it as the service user so the first run can write to it.
[ -f /var/lib/gustale-rebuild/state.json ] || install -m 0644 -o "$SVC_USER" -g "$SVC_GROUP" /dev/null /var/lib/gustale-rebuild/state.json
chown -R "$SVC_USER:$SVC_GROUP" /var/lib/gustale-rebuild

# The CI deploy's build dir must stay writable by the deploy path
# (root) and by the service user, so that a `git fetch` from either
# side can write into .git/.
chown -R "$SVC_USER:$SVC_GROUP" "$DEST_DIR"

# The TIMER's build dir: a checkout owned by the service user. It must
# be a git checkout of the repo, because the rebuild script fetches
# origin/main from it and checks out the fetched commit.
if [ ! -d "$TIMER_BUILD_DIR/.git" ]; then
  echo "--- creating the timer's build checkout at $TIMER_BUILD_DIR ---"
  install -d -o "$SVC_USER" -g "$SVC_GROUP" -m 0755 "$TIMER_BUILD_DIR"
  git -C "$TIMER_BUILD_DIR" init -q
  git -C "$TIMER_BUILD_DIR" remote remove origin 2>/dev/null || true
  git -C "$TIMER_BUILD_DIR" remote add origin github-gustale:consciousclarity/gustale.com.git
fi
chown -R "$SVC_USER:$SVC_GROUP" "$TIMER_BUILD_DIR"

# The docker config dir the build uses. The service runs as `gustale`,
# so the docker credentials must live under gustale's HOME, not
# hermes's. The rebuild sets GUSTALE_NO_PUSH=1 and needs no login, but
# a manual run that pushes needs the credential file to be writable.
install -d -o "$SVC_USER" -g "$SVC_GROUP" -m 0755 "/home/$SVC_USER/.docker"

# Env file for the service. Holds GITHUB_TOKEN so build-web-live.sh can
# (optionally) push to ghcr.io. The rebuild script's design skips the
# push (GUSTALE_NO_PUSH=1), so this token is not required for the
# rebuild — we keep it for the deploy path.
#
# GUSTALE_BUILD_DIR is what points the timer at its OWN checkout. It
# is rewritten on every install so a re-install reproduces exactly the
# working setup, whatever the env file happened to contain before.
{
  if [ -f "$HERMES_ENV" ] && grep -q '^GITHUB_TOKEN=' "$HERMES_ENV"; then
    grep -E '^(GITHUB_TOKEN|GITHUB_ACTOR|GITHUB_REPOSITORY)=' "$HERMES_ENV" || true
  fi
  echo "GUSTALE_BUILD_DIR=$TIMER_BUILD_DIR"
} > "$ENV_FILE.tmp"
install -m 0600 -o "$SVC_USER" -g "$SVC_GROUP" "$ENV_FILE.tmp" "$ENV_FILE"
rm -f "$ENV_FILE.tmp"
echo "wrote $ENV_FILE (GUSTALE_BUILD_DIR=$TIMER_BUILD_DIR)"

# The service's User= must match the owner of everything above.
if ! grep -q "^User=$SVC_USER$" "$SERVICE_FILE"; then
  echo "ERROR: $SERVICE_FILE does not have User=$SVC_USER." >&2
  echo "  The service must run as the owner of the build dir, the state" >&2
  echo "  file and the env file, or the same permission bug returns." >&2
  exit 1
fi

systemctl daemon-reload
systemctl enable --now gustale-rebuild-web.timer
systemctl status gustale-rebuild-web.timer --no-pager
