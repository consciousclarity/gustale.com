#!/usr/bin/env bash
# Run the Gustale smoke test with a working headless Chromium.
#
# WHY THIS WRAPPER EXISTS
# -----------------------
# Playwright's Chromium needs libnspr4 and libnss3. This host (GEEKOBOT,
# WSL2) does not have them, and `sudo` needs a password, so they cannot
# be installed system-wide by the agent.
#
# `scripts/smoke/fetch-browser-libs.sh` downloads the two Ubuntu .deb
# packages and extracts them into `scripts/smoke/.browser-libs/` — a
# directory INSIDE the repo, so the dependency survives a /tmp wipe and
# is not tied to one machine's temporary files.
#
# Nothing here is installed system-wide, and nothing is escalated. The
# libraries are loaded only for this process tree, via LD_LIBRARY_PATH.
#
# Usage:
#   scripts/smoke/run-smoke.sh                          # all checks
#   scripts/smoke/run-smoke.sh --wp WP-01               # one package
#   scripts/smoke/run-smoke.sh --json reports/x.json    # write JSON
#
# Any extra arguments are passed straight to the smoke script.

set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$HERE/../.." && pwd)"
LIB_DIR="$HERE/.browser-libs/usr/lib/x86_64-linux-gnu"

if [ ! -d "$LIB_DIR" ] || [ ! -f "$LIB_DIR/libnspr4.so" ]; then
  echo "Fetching the browser libraries (first run only)…" >&2
  "$HERE/fetch-browser-libs.sh"
fi

export LD_LIBRARY_PATH="$LIB_DIR${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
cd "$REPO_ROOT"
exec node "$HERE/gustale-smoke.mjs" "$@"
