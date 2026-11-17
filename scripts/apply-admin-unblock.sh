#!/usr/bin/env bash
# Apply the /admin unblock to the LIVE gustale.com vhost.
#
# WHAT THIS DOES
# --------------
# The owner decided (2026-11-16) that admin moves to gustale.com:
#
#   * /admin AND /api/admin/* are unblocked on gustale.com ONLY
#     (same origin);
#   * /api/admin/* stays BLOCKED on api.gustale.com;
#   * logged out, every /api/admin/* route must return 401/403 and
#     the static admin shell must render no data;
#   * signed in as admin, the editor must load and save.
#
# This script makes the Caddyfile change on the VPS. It does NOT prove
# the four conditions above -- scripts/verify-admin-unblock.sh does that,
# and it runs against the DEPLOYED site.
#
# THE ORDER MATTERS
# -----------------
#   1. back up the live Caddyfile
#   2. install the new vhost file
#   3. replace the inline gustale.com block with an import
#   4. `caddy validate` -- if it fails, RESTORE and do not reload
#   5. reload Caddy
#   6. prove the site is still up
#
# A failed validate leaves Caddy running the OLD config, untouched.
# The reload is a RELOAD, not a restart: the listening sockets and the
# running containers are not disturbed.
#
# USAGE (on the VPS, as root):
#
#     bash scripts/apply-admin-unblock.sh
#
# The new vhost file must already be on the VPS at
# /etc/caddy/sites/gustale.com.caddy.
set -euo pipefail

CADDYFILE="/etc/caddy/Caddyfile"
VHOST="/etc/caddy/sites/gustale.com.caddy"
BACKUP="/etc/caddy/Caddyfile.bak-admin-unblock-$(date -u +%Y%m%dT%H%M%SZ)"
STATE="/var/lib/gustale-staging/admin-unblock.state"

fail() {
  echo "FAILED: $*" >&2
  exit 1
}

# ─── 0. preconditions ────────────────────────────────────────────────────
[ -f "$CADDYFILE" ] || fail "no Caddyfile at $CADDYFILE"
[ -f "$VHOST" ] || fail "no vhost file at $VHOST — copy infra/prod/caddy/sites/gustale.com.caddy there first"

command -v caddy >/dev/null 2>&1 || fail "caddy is not on PATH"

if grep -q 'import /etc/caddy/sites/gustale.com.caddy' "$CADDYFILE"; then
  echo "the gustale.com block is ALREADY imported — nothing to do"
  exit 0
fi

echo "=== the current gustale.com block ==="
grep -n -A4 '^gustale\.com,$' "$CADDYFILE" | head -10

# ─── 1. back up ──────────────────────────────────────────────────────────
cp -a "$CADDYFILE" "$BACKUP"
echo "the Caddyfile is backed up at $BACKUP"

# ─── 2. the vhost file must be in place ─────────────────────────────────
#
# The vhost is INSTALLED by the caller (from the repo's reviewed copy)
# BEFORE this script runs. This script does NOT copy it, because
# `install SRC DST` where SRC and DST are the same file is an ERROR
# ("are the same file") -- which would abort the script right here,
# before the Caddyfile was touched, so the Caddyfile would be left
# unmodified but the script would report a failure.
#
# So this step is a CHECK, not a copy: the file must exist, and it must
# be the reviewed one. The check compares it against the repo copy when
# one is supplied via GUSTALE_VHOST_SHA, which is how the operator
# proves the installed file is the reviewed file.
if [ -n "${GUSTALE_VHOST_SHA:-}" ]; then
  got=$(sha256sum "$VHOST" | cut -d' ' -f1)
  if [ "$got" != "$GUSTALE_VHOST_SHA" ]; then
    fail "the vhost at $VHOST has sha $got, expected $GUSTALE_VHOST_SHA"
  fi
  echo "the vhost file matches the reviewed copy (sha $got)"
else
  echo "the vhost file is in place at $VHOST"
fi

# ─── 3. replace the inline block with an import ──────────────────────────
#
# The inline block starts at the line "gustale.com," and ends at the
# FIRST line that is exactly "}" at column 0. Replacing it with an
# import keeps the Caddyfile's structure intact.
python3 - "$CADDYFILE" <<'PY'
import sys, re
path = sys.argv[1]
src = open(path).read()

# Find the block: a line "gustale.com," (possibly followed by
# "www.gustale.com {") through its closing brace at column 0.
m = re.search(
    r"(?m)^gustale\.com,\n(?:www\.gustale\.com \{\n)?(?:.*\n)*?^\}\n",
    src,
)
if not m:
    print("FAILED: could not find the inline gustale.com block", file=sys.stderr)
    sys.exit(1)

replacement = (
    "# gustale.com + www.gustale.com -- the ONE site.\n"
    "#\n"
    "# The block lives in its own file so the /admin change is reviewable\n"
    "# and so the site can be diffed against the repo. See\n"
    "# infra/prod/caddy/sites/gustale.com.caddy.\n"
    "import /etc/caddy/sites/gustale.com.caddy\n"
)

out = src[: m.start()] + replacement + src[m.end() :]
open(path, "w").write(out)
print("the inline block was replaced with an import")
PY

# ─── 4. validate BEFORE reloading ────────────────────────────────────────
if ! caddy validate --config "$CADDYFILE" --adapter caddyfile; then
  echo "the config does NOT validate — restoring the backup and NOT reloading" >&2
  cp -a "$BACKUP" "$CADDYFILE"
  echo "restored; Caddy is still running the old config" >&2
  exit 1
fi
echo "the config validates"

# ─── 5. reload ───────────────────────────────────────────────────────────
systemctl reload caddy
sleep 2
systemctl is-active --quiet caddy || fail "caddy is not active after the reload"
echo "caddy reloaded and active"

# ─── 6. the site is still up ─────────────────────────────────────────────
for p in / /dishes /recipes /ingredients /admin; do
  code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "https://gustale.com$p" || echo 000)
  printf '  %-14s %s\n' "$p" "$code"
  case "$p" in
    /|/dishes|/recipes|/ingredients)
      [ "$code" = "200" ] || fail "$p returned $code — the site is broken"
      ;;
  esac
done

mkdir -p "$(dirname "$STATE")"
cat > "$STATE" <<EOF
{
  "appliedAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "backup": "$BACKUP",
  "vhost": "$VHOST"
}
EOF

echo
echo "=== the /admin unblock is applied ==="
echo "  the backup is at $BACKUP"
echo "  the state is in $STATE"
echo "  now run scripts/verify-admin-unblock.sh to prove the four conditions"
