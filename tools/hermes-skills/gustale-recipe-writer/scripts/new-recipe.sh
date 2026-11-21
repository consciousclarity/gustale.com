#!/usr/bin/env bash
# new-recipe.sh — put one Gustale recipe on the Kanban board as three linked cards:
#   research: <recipe>  →  write: <recipe>  →  verify: <recipe>
#
# Usage: new-recipe.sh <dish-slug> [recipe-slug] [locales]
#   dish-slug    Atlas dish slug, e.g. moussaka-greek
#   recipe-slug  defaults to the dish slug; use another for a variation (joulutorttu-flower)
#   locales      comma list, the dish's own language first, e.g. "el,en"; default "auto"
#                (the researcher uses the dish's own language + en)
#
# Re-running for the same recipe does not create duplicates (idempotency keys).
# Settings come from recipes.env next to this script (written by install.sh).
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
[ -f "$HERE/recipes.env" ] && . "$HERE/recipes.env"

DISH="${1:?usage: new-recipe.sh <dish-slug> [recipe-slug] [locales]}"
RECIPE="${2:-$DISH}"; [ -n "$RECIPE" ] || RECIPE="$DISH"
LOCALES="${3:-auto}"

BOARD="${GUSTALE_RECIPES_BOARD:-gustale-recipes}"
ROOT="${GUSTALE_RECIPES_DIR:?GUSTALE_RECIPES_DIR is not set; run install.sh --recipes-dir /absolute/path}"
P_RESEARCH="${GUSTALE_RESEARCH_PROFILE:-gustale}"
P_WRITE="${GUSTALE_WRITE_PROFILE:-gustale}"
P_VERIFY="${GUSTALE_VERIFY_PROFILE:-gustale}"
SKILL="gustale-recipe-writer"

slug_re='^[a-z0-9]+(-[a-z0-9]+)*$'
[[ "$DISH" =~ $slug_re && "$RECIPE" =~ $slug_re ]] || { echo "slugs must be lowercase-with-hyphens" >&2; exit 1; }
case "$ROOT" in /*) ;; *) echo "GUSTALE_RECIPES_DIR must be an absolute path" >&2; exit 1 ;; esac

DIR="$ROOT/$RECIPE"
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

COMMON="Dish: $DISH · recipe: $RECIPE · locales: $LOCALES · workspace: $DIR
Follow skill $SKILL. House style: references/RECIPE-STYLE.md."

R=$(card "research: $RECIPE" "$P_RESEARCH" "gustale-recipe:$RECIPE:research" \
  "Stage 1 of 3 — RESEARCH.
$COMMON
Output: source-sheet.md and sources/<source-id>.txt (never published).")

W=$(card "write: $RECIPE" "$P_WRITE" "gustale-recipe:$RECIPE:write" \
  "Stage 2 of 3 — WRITE.
$COMMON
Output: $RECIPE.json, passing check_recipe.py --sources-dir sources/." "$R")

V=$(card "verify: $RECIPE" "$P_VERIFY" "gustale-recipe:$RECIPE:verify" \
  "Stage 3 of 3 — VERIFY and apply the publish gate.
$COMMON
Output: verify-report.md; then publish (HIGH), request review (MEDIUM) or block (LOW)." "$W")

echo "queued $RECIPE on board $BOARD: research=$R write=$W verify=$V"
echo "workspace: $DIR"
