#!/usr/bin/env bash
# Regenerate the Kanban board from BACKLOG.yaml and validate it.
#
# The generator (scripts/build_kanban.py) lives in the PUBLIC repo and
# resolves `.hermes/BACKLOG.yaml` relative to ITS OWN repo root (the
# `REPO = Path(__file__).resolve().parent.parent` line). The board STATE
# lives in the PRIVATE repo (gustale-state) — the public repo has no
# `.hermes/` at all, because `.hermes/` is gitignored there.
#
# So the script is copied INTO the private repo's scripts/ directory, run
# there (where `REPO` resolves to the private repo root and `.hermes/` is
# the real board), and then removed.
#
# Usage: rebuild-board.sh
set -euo pipefail

PUB=/home/gustale/projects/gustale.com
PRIV=/home/gustale/gustale-state

mkdir -p "$PRIV/scripts"
cp "$PUB/scripts/build_kanban.py" "$PRIV/scripts/build_kanban.py"
cd "$PRIV"
python3 scripts/build_kanban.py --write
rm -f "$PRIV/scripts/build_kanban.py"
rmdir "$PRIV/scripts" 2>/dev/null || true

python3 "$PUB/scripts/validate-backlog.py" "$PRIV/.hermes/BACKLOG.yaml"

echo ""
echo "=== the board summary ==="
sed -n '/^## 3. The current board/,/^### By priority/p' "$PRIV/.hermes/KANBAN.md"
