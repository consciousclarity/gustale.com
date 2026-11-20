#!/usr/bin/env bash
# new-atlas-card.sh — put one Gustale Atlas entity on the Kanban board as three linked cards:
#   research: <kind> <slug>  →  write: <kind> <slug>  →  verify: <kind> <slug>
#
# Usage: new-atlas-card.sh <dish|family|lineage> <slug>
#   dish     an Atlas dish page, with its places, history, connections and variants
#   family   a dish_families row (description and representative dishes)
#   lineage  a lineages row with its member dishes
#
# Re-running for the same entity does not create duplicates (idempotency keys).
# Settings come from atlas.env next to this script (written by install.sh).
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
[ -f "$HERE/atlas.env" ] && . "$HERE/atlas.env"

KIND="${1:?usage: new-atlas-card.sh <dish|family|lineage> <slug>}"
SLUG="${2:?usage: new-atlas-card.sh <dish|family|lineage> <slug>}"
case "$KIND" in dish|family|lineage) ;; *) echo "kind must be dish, family or lineage" >&2; exit 1 ;; esac
[[ "$SLUG" =~ ^[a-z0-9]+(-[a-z0-9]+)*$ ]] || { echo "slug must be lowercase-with-hyphens" >&2; exit 1; }

BOARD="${GUSTALE_ATLAS_BOARD:-gustale-atlas}"
ROOT="${GUSTALE_ATLAS_DIR:?GUSTALE_ATLAS_DIR is not set; run install.sh --work-dir /absolute/path}"
P_RESEARCH="${GUSTALE_RESEARCH_PROFILE:-gustale}"
P_WRITE="${GUSTALE_WRITE_PROFILE:-gustale}"
P_VERIFY="${GUSTALE_VERIFY_PROFILE:-gustale}"
SKILL="gustale-atlas-writer"
case "$ROOT" in /*) ;; *) echo "GUSTALE_ATLAS_DIR must be an absolute path" >&2; exit 1 ;; esac

DIR="$ROOT/$KIND-$SLUG"
mkdir -p "$DIR/sources"

task_id() {  # read `hermes kanban create --json` output, print the new task's id
  python3 -c '
import json, sys
raw = sys.stdin.read()
try:
    data = json.loads(raw)
except ValueError:
    sys.stderr.write(raw); sys.exit(1)
def find(o):
    if isinstance(o, dict):
        for k in ("id", "task_id"):
            if isinstance(o.get(k), (str, int)):
                return o[k]
        for v in o.values():
            r = find(v)
            if r is not None:
                return r
    elif isinstance(o, list):
        for v in o:
            r = find(v)
            if r is not None:
                return r
    return None
r = find(data)
if r is None:
    sys.stderr.write(raw); sys.exit(1)
print(r)'
}

card() {  # card <title> <assignee> <idempotency-key> <body> [parent-id]
  local args=(kanban --board "$BOARD" create "$1" --assignee "$2" --skill "$SKILL"
              --workspace "dir:$DIR" --idempotency-key "$3" --body "$4" --json)
  [ -n "${5:-}" ] && args+=(--parent "$5")
  hermes "${args[@]}" | task_id || { echo "could not read the new card id for '$1' (output above)" >&2; exit 1; }
}

COMMON="Entity: $KIND $SLUG · workspace: $DIR
Follow skill $SKILL. Style: references/ATLAS-STYLE.md."

R=$(card "research: $KIND $SLUG" "$P_RESEARCH" "gustale-atlas:$KIND:$SLUG:research" \
  "Stage 1 of 3 — RESEARCH.
$COMMON
Output: live.json, vocab.json, source-sheet.md, sources/<source-id>.txt (never published).")

W=$(card "write: $KIND $SLUG" "$P_WRITE" "gustale-atlas:$KIND:$SLUG:write" \
  "Stage 2 of 3 — WRITE.
$COMMON
Output: $KIND-$SLUG.json, passing check_atlas.py --sources-dir sources/." "$R")

V=$(card "verify: $KIND $SLUG" "$P_VERIFY" "gustale-atlas:$KIND:$SLUG:verify" \
  "Stage 3 of 3 — VERIFY, diff against live, apply the evidence gate.
$COMMON
Output: diff.md, verify-report.md; then apply (HIGH), request review (MEDIUM or any removed claim) or block (LOW)." "$W")

echo "queued $KIND $SLUG on board $BOARD: research=$R write=$W verify=$V"
echo "workspace: $DIR"
