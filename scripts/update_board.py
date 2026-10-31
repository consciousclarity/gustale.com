#!/usr/bin/env python3
"""
Update the board's BACKLOG.yaml for the atlas cards.

The board STATE is `.hermes/BACKLOG.yaml`; `KANBAN.md` is a generated view.
This script sets the status and evidence for named tasks and rewrites the
file with the SAME YAML dumper the original used, so the format does not
drift.

Usage: update_board.py <task-id> <status> [evidence line ...]
"""

from __future__ import annotations

import pathlib
import sys

import yaml

BACKLOG = pathlib.Path("/home/gustale/gustale-state/.hermes/BACKLOG.yaml")
HEADER = """# Gustale backlog — generated from .hermes/ROADMAP.md (2026-10-17).
# Source of truth for roadmap work. Hermes updates status/evidence after every task.
# status: todo | in_progress | blocked | review | done | wontfix
# approval: true = needs Alejandro's OK before the destructive/schema/auth step (RULES.md §Approval)
"""


def main(argv: list[str]) -> int:
    if len(argv) < 3:
        print("usage: update_board.py <task-id> <status> [evidence line ...]")
        return 2

    task_id, status = argv[1], argv[2]
    evidence = argv[3:]

    doc = yaml.safe_load(BACKLOG.read_text())
    tasks = doc.get("tasks")
    if not isinstance(tasks, list):
        print("FAIL: BACKLOG.yaml has no `tasks:` list")
        return 2

    found = False
    for t in tasks:
        if t.get("id") == task_id:
            found = True
            t["status"] = status
            if evidence:
                existing = t.get("evidence") or []
                for line in evidence:
                    if line not in existing:
                        existing.append(line)
                t["evidence"] = existing
            break

    if not found:
        print(f"FAIL: {task_id} not found")
        return 2

    BACKLOG.write_text(
        HEADER + yaml.safe_dump({"tasks": tasks}, sort_keys=False, allow_unicode=True, width=100)
    )
    print(f"{task_id} -> {status} ({len(evidence)} evidence line(s) added)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
