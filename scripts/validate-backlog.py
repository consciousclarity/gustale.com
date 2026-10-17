#!/usr/bin/env python3
"""
Strict YAML parser for .hermes/BACKLOG.yaml.

Rejects:
  - duplicate keys at any indentation (PyYAML silently keeps the last one
    and discards earlier values; this is the bug that bit us when
    `status: todo` (from the template) survived behind a later
    `status: done`)
  - tasks missing `id`, `title`, `phase`, or `status`
  - status values outside the allowed enum

Exit code 0 = clean; 1 = violations (printed as a numbered list).
"""
from __future__ import annotations

import argparse
import pathlib
import sys

import yaml

# Allowed status values, per the comment on line 3 of BACKLOG.yaml.
ALLOWED_STATUS = {"todo", "in_progress", "blocked", "review", "done", "wontfix"}

# Required keys on every task item.
REQUIRED_TASK_KEYS = {"id", "title", "phase", "status"}


class StrictLoader(yaml.SafeLoader):
    """SafeLoader subclass that raises on duplicate keys at any mapping."""


def _construct_mapping_strict(loader: StrictLoader, node, deep: bool = False):
    seen: set[str] = set()
    for key_node, _ in node.value:
        key = loader.construct_object(key_node, deep=deep)
        if key in seen:
            mark = key_node.start_mark
            raise yaml.YAMLError(
                f"duplicate key {key!r} at line {mark.line + 1} column {mark.column + 1}"
            )
        seen.add(key)
    return loader.construct_mapping_orig(node, deep=deep)


# Wrap SafeLoader.construct_mapping to call our strict version.
StrictLoader.construct_mapping_orig = StrictLoader.construct_mapping  # type: ignore[attr-defined]
StrictLoader.add_constructor(  # type: ignore[arg-type]
    yaml.resolver.BaseResolver.DEFAULT_MAPPING_TAG,
    _construct_mapping_strict,
)


def _validate_task(task: dict, source: pathlib.Path) -> list[str]:
    errs: list[str] = []
    for required in REQUIRED_TASK_KEYS:
        if required not in task:
            errs.append(f"  task {task.get('id', '?')!r}: missing required key {required!r}")
    if "status" in task and task["status"] not in ALLOWED_STATUS:
        errs.append(
            f"  task {task['id']!r}: invalid status {task['status']!r} "
            f"(allowed: {sorted(ALLOWED_STATUS)})"
        )
    return errs


def check(path: pathlib.Path) -> list[str]:
    errors: list[str] = []
    try:
        with path.open() as f:
            doc = yaml.load(f, Loader=StrictLoader)
    except yaml.YAMLError as e:
        return [f"YAML parse error: {e}"]

    if not isinstance(doc, dict):
        return [f"{path}: top-level must be a mapping; got {type(doc).__name__}"]

    tasks = doc.get("tasks")
    if tasks is None:
        return [f"{path}: missing top-level `tasks:` list"]
    if not isinstance(tasks, list):
        return [f"{path}: `tasks:` must be a list; got {type(tasks).__name__}"]

    seen_ids: set[str] = set()
    for task in tasks:
        if not isinstance(task, dict):
            errors.append(f"  task entry is not a mapping: {task!r}")
            continue
        if "id" in task:
            if task["id"] in seen_ids:
                errors.append(
                    f"  duplicate task id {task['id']!r} in the `tasks:` list"
                )
            seen_ids.add(task["id"])
        errors.extend(_validate_task(task, path))
    return errors


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "path",
        nargs="?",
        default=".hermes/BACKLOG.yaml",
        help="Path to BACKLOG.yaml (default: .hermes/BACKLOG.yaml)",
    )
    args = parser.parse_args(argv)

    path = pathlib.Path(args.path)
    if not path.exists():
        print(f"FAIL: {path} not found", file=sys.stderr)
        return 2

    errs = check(path)
    if errs:
        print(f"BACKLOG.yaml validation FAILED ({len(errs)} issue{'s' if len(errs) != 1 else ''}):", file=sys.stderr)
        for e in errs:
            print(e, file=sys.stderr)
        return 1
    print(f"BACKLOG.yaml OK ({path})")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
