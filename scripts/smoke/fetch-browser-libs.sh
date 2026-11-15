#!/usr/bin/env bash
# Fetch the shared libraries headless Chromium needs, without root.
#
# WHY
# ---
# Playwright's bundled Chromium links against libnspr4 and libnss3. On
# this host (WSL2, no passwordless sudo) they are absent, so Chromium
# exits with:
#
#     error while loading shared libraries: libnspr4.so:
#     cannot open shared object file: No such file or directory
#
# The fix without root: download the Ubuntu .deb packages, extract them
# with dpkg-deb, and point LD_LIBRARY_PATH at the extracted directory for
# the smoke run only. Nothing is installed system-wide.
#
# The destination is scripts/smoke/.browser-libs/ — inside the repo, so
# it survives a /tmp wipe. It is gitignored.
#
# Usage: scripts/smoke/fetch-browser-libs.sh

set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEST="$HERE/.browser-libs"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

echo "→ downloading libnspr4 and libnss3"
cd "$WORK"
apt-get download libnspr4 libnss3 >/dev/null 2>&1

echo "→ extracting into $DEST"
rm -rf "$DEST"
mkdir -p "$DEST"
for deb in ./*.deb; do
  dpkg-deb -x "$deb" "$DEST"
done

LIB_DIR="$DEST/usr/lib/x86_64-linux-gnu"
if [ ! -f "$LIB_DIR/libnspr4.so" ] || [ ! -f "$LIB_DIR/libnss3.so" ]; then
  echo "ERROR: extraction did not produce the expected libraries." >&2
  exit 1
fi

echo "→ ok:"
ls -1 "$LIB_DIR" | sed 's/^/    /'
