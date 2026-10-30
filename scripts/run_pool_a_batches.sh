#!/usr/bin/env bash
# Run the Pool A batches end to end: rewrite, then apply (publish).
#
# A batch is published ONLY if every one of its dishes passed. The
# apply script enforces that; this script just runs the two in order
# and records what happened, so the whole run can be audited after the
# fact.
#
#   ./scripts/run_pool_a_batches.sh 3 14
#
# Every log lands in /tmp/batch<N>.log and /tmp/apply<N>.log.
set -uo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO"

FIRST="${1:-3}"
LAST="${2:-14}"

for batch in $(seq "$FIRST" "$LAST"); do
  echo "=== batch $batch ==="
  python3 scripts/rewrite_pool_a_descriptions.py \
    --batch "$batch" --limit 100 --no-resume > "/tmp/batch${batch}.log" 2>&1
  rewrite_status=$?

  python3 - "$batch" <<'PY'
import json, sys, collections
batch = int(sys.argv[1])
recs = json.load(open("data/pool_a_descriptions.json"))
sel = [r for r in recs if r.get("batch") == batch]
counts = collections.Counter(r["status"] for r in sel)
print(f"    {len(sel)} proposals: {dict(counts)}")
PY

  if [ "$rewrite_status" -ne 0 ]; then
    # A non-zero exit means the batch has non-passes. That is not an
    # error: the apply script decides whether it is publishable.
    echo "    the batch has non-passes (exit $rewrite_status)"
  fi

  python3 scripts/apply_pool_a_descriptions.py \
    --batch "$batch" --apply > "/tmp/apply${batch}.log" 2>&1
  apply_status=$?

  if grep -q "NOT PUBLISHABLE" "/tmp/apply${batch}.log"; then
    echo "    NOT PUBLISHABLE — not published"
  else
    echo "    published: $(grep -o 'published [0-9]* dishes' "/tmp/apply${batch}.log" | tail -1)"
  fi
  echo "    apply exit: $apply_status"
done

echo "=== done ==="
