#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────
# ci-apt-mirror.sh -- make apt use a reachable Ubuntu mirror.
#
# WHY THIS EXISTS
# ---------------
# The accessibility gate installs Playwright's Chromium with
# `--with-deps`, which shells out to `apt-get install`. On a GitHub
# Actions runner whose `/etc/apt/apt-mirrors.txt` points at
# `azure.archive.ubuntu.com` -- which the runner image does for some
# regions -- that host can fail to resolve:
#
#   W: Failed to fetch mirror+file:/etc/apt/apt-mirrors.txt/dists/noble/InRelease
#      Temporary failure resolving 'azure.archive.ubuntu.com'
#   E: Failed to fetch https://security.ubuntu.com/ubuntu/pool/.../fonts-....deb
#      Temporary failure resolving 'azure.archive.ubuntu.com'
#   Failed to install browsers
#   Error: Installation process exited with code: 100
#
# The whole `Install Chromium` step then fails, and the axe gate never
# runs. It has never produced a verdict.
#
# WHAT ACTUALLY FAILS
# -------------------
# Every Chromium *library* installs fine -- `libnss3`, `libnspr4`,
# `libatk`, `libgbm`, `libxkbcommon`, `xvfb` and the rest all report
# "already the newest version". What fails is the optional FONT
# bundle: `fonts-wqy-zenhei`, `fonts-tlwg-loma`, `fonts-freefont`,
# `xfonts-*`, `fonts-ipafont`.
#
# So the gate dies installing fonts it does not need. The axe rules
# this repo gates on (wcag2a, wcag2aa, wcag21a, wcag21aa, wcag22aa,
# best-practice) are DOM and ARIA rules. They read structure, names,
# roles and computed geometry. They never render a glyph.
#
# THE FIX
# -------
# Point apt at the canonical Ubuntu archive, which is a different host
# from the Azure mirror and resolves independently, and let
# `apt-get update` succeed. Then `--with-deps` completes normally.
#
# We do NOT drop `--with-deps`. On a fresh runner image the Chromium
# libraries genuinely are needed; dropping the flag would trade a
# broken install for a missing-library crash, and would make the gate
# depend on whatever the runner image happens to ship.
#
# We do NOT use `--no-install-deps` either, and we do not pass
# `--ignore-package-errors` to Playwright: a browser install that
# silently skips its libraries is a gate that fails for the wrong
# reason, which is the failure mode this whole repository keeps trying
# to avoid.
#
# USAGE
# -----
#   bash scripts/ci-apt-mirror.sh
#
# It is idempotent, it is a no-op when apt already works, and it never
# fails the build by itself: if apt cannot be fixed, it says so and
# exits 0, leaving the decision to the step that actually needs apt.
# ─────────────────────────────────────────────────────────────────────────
set -uo pipefail

# The canonical archive. Deliberately NOT the Azure mirror the runner
# image may point at: it is a different host, so it fails
# independently.
MIRROR="${CI_APT_MIRROR:-http://archive.ubuntu.com/ubuntu}"

# The security pocket is a separate suite on the same host.
SECURITY_MIRROR="${CI_APT_SECURITY_MIRROR:-http://security.ubuntu.com/ubuntu}"

log() { printf '%s\n' "$*" >&2; }

# ── Is apt already able to reach an index? ───────────────────────────
# If it is, this script has nothing to do and must not touch anything.
if apt-get update -qq >/dev/null 2>&1; then
  log "apt: already reachable, nothing to do"
  exit 0
fi

log "apt: the configured mirror is not reachable, repointing at ${MIRROR}"

# ── Back up the mirror list ─────────────────────────────────────────
# We do not overwrite it. We write a drop-in that runs BEFORE the
# runner image's own list, so the original file is still there if the
# owner wants to restore it.
BACKUP=""
if [ -f /etc/apt/apt-mirrors.txt ]; then
  BACKUP="/etc/apt/apt-mirrors.txt.hermes-backup"
  if [ ! -f "$BACKUP" ]; then
    cp -n /etc/apt/apt-mirrors.txt "$BACKUP" 2>/dev/null || BACKUP=""
    [ -n "$BACKUP" ] && log "apt: the original mirror list is backed up at ${BACKUP}"
  fi
fi

# ── Write the drop-in ───────────────────────────────────────────────
# `00-` sorts before the runner image's own file, so ours wins.
DROPIN_DIR="/etc/apt/sources.list.d"
if ! mkdir -p "$DROPIN_DIR" 2>/dev/null; then
  log "apt: cannot write ${DROPIN_DIR}, leaving apt alone"
  exit 0
fi

# shellcheck disable=SC2086
if ! printf '%s\n' \
    "deb ${MIRROR} noble main universe" \
    "deb ${MIRROR} noble-updates main universe" \
    "deb ${SECURITY_MIRROR} noble-security main universe" \
    > "${DROPIN_DIR}/00-hermes-ubuntu-mirror.list" 2>/dev/null; then
  log "apt: cannot write the drop-in, leaving apt alone"
  exit 0
fi

log "apt: drop-in written to ${DROPIN_DIR}/00-hermes-ubuntu-mirror.list"

# ── Now try again ───────────────────────────────────────────────────
if apt-get update -qq >/dev/null 2>&1; then
  log "apt: reachable through ${MIRROR}"
  exit 0
fi

# ── The drop-in did not help ────────────────────────────────────────
# We do not fail here. The step that needs apt will fail with its own
# error, which names the real problem. Failing here would hide it
# behind a generic mirror error.
log "apt: STILL not reachable through ${MIRROR}"
log "apt: the original list is at ${BACKUP:-<not found>}"
log "apt: leaving this to the step that needs apt, so the failure names the cause"
exit 0
