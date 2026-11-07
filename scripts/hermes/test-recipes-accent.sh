#!/usr/bin/env bash
#
# The recipes accent gate.
#
# WHAT IT PROVES
#
# 1. The approved accent's contrast ratios pass
#    (scripts/hermes/recipes-accent-verify.py).
#
# 2. No accent-coloured text sits on an accent-soft tint.
#
# 3. The SHIPPED theme (recipes-theme.css) matches the APPROVED accent
#    (recipes-island.css). These are two files that can drift, and
#    nothing else in the build would notice: both are individually
#    valid CSS, so a drift only shows up as "the site is a slightly
#    different green than the one that was approved".
#
# 4. The gate can FAIL. A checker that always passes is
#    indistinguishable from a broken checker, so the selftest breaks
#    the stylesheet three independent ways and confirms the checker
#    reports each one.
#
# WHY THIS EXISTS AS A SEPARATE SCRIPT
#
# So CI can run it without editing .github/workflows/ — the GitHub App
# has no `workflows` scope, so a workflow change would have to ship as
# a patch file for the owner to apply. The steps here are invoked from
# scripts/hermes/test-rebuild-fail-closed.sh, the step CI already runs.
#
set -uo pipefail
cd "$(dirname "$0")/../.."

VERIFY="scripts/hermes/recipes-accent-verify.py"
SELFTEST="scripts/hermes/recipes-accent-selftest.sh"
FAIL=0

echo "--- the accent contrast gate ---"
if python3 "$VERIFY" >/tmp/accent-verify.log 2>&1; then
  echo "  OK: the accent's contrast ratios pass and no accent-on-tint text exists"
  grep -E "^    OK   --|^    --   --" /tmp/accent-verify.log | sed 's/^/  /'
else
  echo "  FAIL: the accent gate did not pass"
  tail -25 /tmp/accent-verify.log | sed 's/^/    /'
  FAIL=1
fi

echo ""
echo "--- the accent gate can FAIL ---"
if bash "$SELFTEST" >/tmp/accent-selftest.log 2>&1; then
  echo "  OK: the gate catches a tint defect, a contrast failure, and a theme drift"
  grep -E "CAUGHT" /tmp/accent-selftest.log | sed 's/^/  /'
else
  echo "  FAIL: the accent selftest did not pass"
  tail -25 /tmp/accent-selftest.log | sed 's/^/    /'
  FAIL=1
fi

echo ""
if [ "$FAIL" -eq 0 ]; then
  echo "  ALL PASS"
else
  echo "  SOMETHING FAILED"
fi
exit "$FAIL"
