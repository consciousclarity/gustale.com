#!/usr/bin/env bash
# install.sh — install the gustale-atlas-writer skill into Hermes profiles on this machine.
#
# Usage: bash install.sh --work-dir /absolute/work/folder [profile ...]
#   --work-dir  absolute folder where each Atlas entity gets its workspace (source sheet, live copy, record, report).
#                  Use a folder inside the gustale project that git ignores.
#   profile        Hermes profiles that run the cards (default: gustale). Use "default" for ~/.hermes.
#
# What it does, and nothing else:
#   - copies this folder to <profile home>/skills/gustale/gustale-atlas-writer
#     (an existing copy is moved to <profile home>/skill-backups/, never deleted)
#   - fills in the skill's absolute path in SKILL.md
#   - writes scripts/atlas.env with the work folder and board name
#   - creates the Kanban board "gustale-atlas" if it doesn't exist
set -euo pipefail

SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NAME="gustale-atlas-writer"
BOARD="${GUSTALE_ATLAS_BOARD:-gustale-atlas}"
WORK_DIR=""
profiles=()

while [ $# -gt 0 ]; do
  case "$1" in
    --work-dir) WORK_DIR="${2:-}"; shift 2 ;;
    -h|--help) sed -n '2,15p' "$0"; exit 0 ;;
    *) profiles+=("$1"); shift ;;
  esac
done
[ ${#profiles[@]} -gt 0 ] || profiles=(gustale)
case "$WORK_DIR" in
  /*) ;;
  *) echo "--work-dir must be an absolute path (got '${WORK_DIR}')" >&2; exit 1 ;;
esac
command -v hermes >/dev/null || { echo "hermes is not on PATH" >&2; exit 1; }
mkdir -p "$WORK_DIR"

stamp="$(date +%Y%m%d-%H%M%S)"
first_dest=""
for p in "${profiles[@]}"; do
  if [ "$p" = "default" ]; then home="$HOME/.hermes"; else home="$HOME/.hermes/profiles/$p"; fi
  if [ ! -d "$home" ]; then echo "skip '$p': no profile folder at $home"; continue; fi

  dest="$home/skills/gustale/$NAME"
  if [ -e "$dest" ]; then
    mkdir -p "$home/skill-backups"
    mv "$dest" "$home/skill-backups/$NAME.$stamp"
    echo "previous copy kept at $home/skill-backups/$NAME.$stamp"
  fi
  mkdir -p "$(dirname "$dest")"
  cp -R "$SRC" "$dest"
  rm -f "$dest/install.sh"
  sed -i "s#__SKILL_DIR__#$dest#g" "$dest/SKILL.md"
  cat > "$dest/scripts/atlas.env" <<EOF
GUSTALE_ATLAS_DIR="$WORK_DIR"
GUSTALE_ATLAS_BOARD="$BOARD"
GUSTALE_RESEARCH_PROFILE="${GUSTALE_RESEARCH_PROFILE:-$p}"
GUSTALE_WRITE_PROFILE="${GUSTALE_WRITE_PROFILE:-$p}"
GUSTALE_VERIFY_PROFILE="${GUSTALE_VERIFY_PROFILE:-$p}"
EOF
  chmod +x "$dest/scripts/new-atlas-card.sh" "$dest/scripts/check_atlas.py"
  echo "installed $NAME for profile '$p' -> $dest"
  [ -n "$first_dest" ] || first_dest="$dest"

  if hermes -p "$p" skills list 2>/dev/null | grep -q "$NAME"; then
    echo "  hermes -p $p skills list: found"
  else
    echo "  WARNING: 'hermes -p $p skills list' does not show $NAME yet; check where this profile keeps skills"
  fi
done
[ -n "$first_dest" ] || { echo "nothing installed" >&2; exit 1; }

if hermes kanban boards list 2>/dev/null | grep -qw "$BOARD"; then
  echo "board '$BOARD' already exists"
else
  hermes kanban boards create "$BOARD" --name "Gustale atlas" && echo "created board '$BOARD'"
fi

python3 -c "import jsonschema" 2>/dev/null \
  || echo "NOTE: python3 jsonschema is missing; the checker will skip the schema. Install: sudo apt install python3-jsonschema"

cat <<EOF

Done. Next:
  1. Self-test:   for f in $first_dest/examples/*.json; do python3 $first_dest/scripts/check_atlas.py \$f | tail -1; done
  2. Pilot:       bash $first_dest/scripts/new-atlas-card.sh dish moussaka-greek
  3. Watch:       hermes kanban --board $BOARD list
EOF
