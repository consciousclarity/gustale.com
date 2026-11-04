#!/usr/bin/env bash
# The regression test for the CI marker checker.
#
# WHAT THIS PROVES
# ----------------
# Several gates print a MARKER when they succeed. Nothing in the
# workflow grepped for any of them, so the markers were read by a human
# and by nothing else.
#
# The marker checker closes that gap, and it has to be RIGHT -- because
# a marker check that passes when it should fail is worse than no
# marker check at all.
#
# The cases that matter:
#
#   1. The marker IS present and reports success  -> pass
#   2. The marker IS present but reports a FAILURE -> fail
#   3. The marker is ABSENT entirely               -> fail
#   4. The file does not exist at all              -> fail
#   5. The marker appears in the middle of noise  -> still found
#   6. A marker for a DIFFERENT gate does not satisfy the check
#
# Usage:
#     bash scripts/test-check-ci-markers.sh
set -uo pipefail

SCRIPT="$(dirname "$0")/check-ci-markers.sh"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

PASSED=0
FAILED=0

assert() {
  local what="$1" expected="$2" actual="$3"
  if [ "$expected" = "$actual" ]; then
    PASSED=$((PASSED + 1))
    echo "  PASS: $what"
  else
    FAILED=$((FAILED + 1))
    echo "  FAIL: $what -- the exit was $actual, expected $expected"
  fi
}

echo "=== the CI marker checker's tests ==="

# ── 1. the marker is present and reports success ──────────────────────
cat > "$TMP/good.log" <<'EOF'
psql:<stdin>:1260: NOTICE:  ATLAS_SCHEMA_TESTS: 47 passed, 0 failed
EOF
bash "$SCRIPT" "the atlas schema" "ATLAS_SCHEMA_TESTS" "$TMP/good.log" >/dev/null 2>&1
assert "a marker that reports success PASSES" 0 $?

# ── 2. the marker is present but reports a FAILURE ────────────────────
cat > "$TMP/bad.log" <<'EOF'
psql:<stdin>:1260: NOTICE:  ATLAS_SCHEMA_TESTS: 47 passed, 3 failed
EOF
bash "$SCRIPT" "the atlas schema" "ATLAS_SCHEMA_TESTS" "$TMP/bad.log" >/dev/null 2>&1
assert "a marker that reports a FAILURE FAILS" 1 $?

# ── 3. the marker is absent ───────────────────────────────────────────
cat > "$TMP/other.log" <<'EOF'
psql:<stdin>:214: NOTICE:  ATLAS_COUNT_GUARD: 8 passed, 0 failed
EOF
bash "$SCRIPT" "the atlas schema" "ATLAS_SCHEMA_TESTS" "$TMP/other.log" >/dev/null 2>&1
assert "an ABSENT marker FAILS" 1 $?

# ── 4. the file does not exist ────────────────────────────────────────
bash "$SCRIPT" "the atlas schema" "ATLAS_SCHEMA_TESTS" "$TMP/nope.log" >/dev/null 2>&1
assert "a MISSING file FAILS" 1 $?

# ── 5. no file at all ─────────────────────────────────────────────────
bash "$SCRIPT" "the atlas schema" "ATLAS_SCHEMA_TESTS" >/dev/null 2>&1
assert "no file to search FAILS" 1 $?

# ── 6. the marker is buried in noise ──────────────────────────────────
cat > "$TMP/noisy.log" <<'EOF'
some other output entirely
  ATLAS_TRIGGER_ESCALATION: 7 passed, 0 failed
more noise
EOF
bash "$SCRIPT" "the trigger gate" "ATLAS_TRIGGER_ESCALATION" "$TMP/noisy.log" >/dev/null 2>&1
assert "a marker buried in noise is still FOUND" 0 $?

# ── 7. the FULL_CI_CHAIN_OK=1 form ────────────────────────────────────
cat > "$TMP/chain.log" <<'EOF'
FULL_CI_CHAIN_OK=1
EOF
bash "$SCRIPT" "the chain" "FULL_CI_CHAIN_OK" "$TMP/chain.log" >/dev/null 2>&1
assert "the FULL_CI_CHAIN_OK=1 marker PASSES" 0 $?

# ── 8. a marker for a DIFFERENT gate does not satisfy the check ──────
cat > "$TMP/wrong.log" <<'EOF'
ATLAS_COUNT_GUARD: 8 passed, 0 failed
EOF
bash "$SCRIPT" "the chain" "FULL_CI_CHAIN_OK" "$TMP/wrong.log" >/dev/null 2>&1
assert "a DIFFERENT gate's marker does not satisfy the check" 1 $?

# ── 9. the error message says the gate did not run ───────────────────
MSG=$(bash "$SCRIPT" "the atlas schema" "ATLAS_SCHEMA_TESTS" "$TMP/other.log" 2>&1)
case "$MSG" in
  *"did not run"*) PASSED=$((PASSED + 1)); echo "  PASS: the failure says the gate did not run" ;;
  *) FAILED=$((FAILED + 1)); echo "  FAIL: the failure says the gate did not run -- the message was: $MSG" ;;
esac

echo ""
echo "=== the CI marker checker's tests: $PASSED passed, $FAILED failed ==="
[ "$FAILED" -eq 0 ] || exit 1
exit 0
