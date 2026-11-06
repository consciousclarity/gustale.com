#!/usr/bin/env bash
# Prove the accent checker can FAIL.
#
# A checker that always prints "PASS" is indistinguishable from a
# checker that is broken. So: take the CURRENT (correct) stylesheet,
# break it in two independent ways, and confirm the checker reports
# each one. Then restore.
#
# Break 1: revert one --accent-dark to --accent on an accent-soft
#          tint -> the "accent-coloured text on a tint" check must
#          fire.
# Break 2: set --accent to a colour that fails 4.5:1 on white
#          -> the ratio check must fire.
#
# The real stylesheet is restored from git at the end, and the
# restoration is asserted.

set -euo pipefail

cd /home/gustale/projects/gustale.com
CSS=apps/web/src/styles/recipes-island.css
CHECK=scripts/hermes/recipes-accent-verify.py
SAVED=$(mktemp)
cp "$CSS" "$SAVED"

restore() {
  cp "$SAVED" "$CSS"
  rm -f "$SAVED"
}
trap restore EXIT

fail() {
  echo "FAIL: $1"
  exit 1
}

echo "=== baseline (must be clean) ==="
python3 "$CHECK" >/tmp/acc-base.txt 2>&1 || true
grep -q "no accent-on-tint text exists" /tmp/acc-base.txt \
  || { cat /tmp/acc-base.txt; fail "baseline is not clean — fix that first"; }
grep -q "every text ratio passes" /tmp/acc-base.txt \
  || { cat /tmp/acc-base.txt; fail "baseline ratios are not passing"; }
echo "  OK: baseline is clean"

echo
echo "=== BREAK 1: accent-coloured text back on an accent-soft tint ==="
python3 - <<'PY'
p = "apps/web/src/styles/recipes-island.css"
s = open(p).read()
old = """.step .stime b {
  /* --accent-dark, not --accent: this sits on an --accent-soft tint. */
  color: var(--accent-dark);"""
new = """.step .stime b {
  color: var(--accent);"""
assert s.count(old) == 1, "the .step .stime b rule did not match"
open(p, "w").write(s.replace(old, new, 1))
print("  broke it")
PY
python3 "$CHECK" >/tmp/acc-b1.txt 2>&1 || true
if grep -q "accent-on-tint text EXISTS" /tmp/acc-b1.txt; then
  echo "  OK: the checker CAUGHT the tint defect"
  grep -A 3 "step .stime b" /tmp/acc-b1.txt | head -4
else
  cat /tmp/acc-b1.txt
  fail "the checker did NOT catch accent-coloured text on a tint"
fi
cp "$SAVED" "$CSS"

echo
echo "=== BREAK 2: an accent that fails contrast on white ==="
python3 - <<'PY'
p = "apps/web/src/styles/recipes-island.css"
s = open(p).read()
old = "  --accent: #327a2f;"
new = "  --accent: #a8c99a;"  # a pale green: fails 4.5:1 on white
assert s.count(old) == 1, "the --accent token did not match"
open(p, "w").write(s.replace(old, new, 1))
print("  broke it")
PY
python3 "$CHECK" >/tmp/acc-b2.txt 2>&1 || true
if grep -q "FAIL" /tmp/acc-b2.txt; then
  echo "  OK: the checker CAUGHT the contrast failure"
  grep "accent on white" /tmp/acc-b2.txt | head -2
else
  cat /tmp/acc-b2.txt
  fail "the checker did NOT catch a failing contrast ratio"
fi
cp "$SAVED" "$CSS"

echo
echo "=== restored ==="
if diff -q "$SAVED" "$CSS" >/dev/null; then
  echo "  OK: the stylesheet is byte-identical to the saved copy"
else
  fail "the stylesheet was not restored"
fi
python3 "$CHECK" >/tmp/acc-final.txt 2>&1 || true
grep -q "every text ratio passes AND no accent-on-tint text exists" /tmp/acc-final.txt \
  || { cat /tmp/acc-final.txt; fail "the restored stylesheet does not pass"; }
echo "  OK: the restored stylesheet passes"

echo
echo "ALL CHECKS PASSED — the accent gate can fail."
