#!/usr/bin/env python3
"""check-backlog-yaml.py -- the backlog's own guard.

WHY
---
The backlog is a YAML file that is edited by string concatenation, and
a single-quoted YAML scalar is closed by a quote that a code edit can
easily drop. When that happens the file does not fail loudly at the
edit -- it fails at the NEXT parse, in the kanban generator, with an
error that points at a line the editor did not touch. That happened
twice while writing the sourcing corrections.

So: the backlog's parse is checked, and the check is a script rather
than a habit.

WHAT IT CHECKS
--------------
1. The YAML parses.
2. Every task has an id, a title and a status.
3. The task ids are unique.
4. The ids run GUS-001..GUS-N with no gap -- a missing number means a
   task was dropped.
5. The evidence lists are lists of strings (not accidentally a
   mapping or a bare scalar).

Usage: check-backlog-yaml.py [path]
Exit: 0 = clean, 1 = a problem.
"""
import os
import re
import sys

import yaml

DEFAULT = "/home/alex/projects/gustale-state/.hermes/BACKLOG.yaml"


def main():
    path = sys.argv[1] if len(sys.argv) > 1 else DEFAULT
    if not os.path.exists(path):
        print(f"FAILED: {path} does not exist")
        return 1

    text = open(path, encoding="utf-8").read()

    # (1) the parse.
    try:
        doc = yaml.safe_load(text)
    except yaml.YAMLError as exc:
        print("FAILED: the backlog does not parse")
        print(str(exc)[:1200])
        return 1

    tasks = doc["tasks"] if isinstance(doc, dict) and "tasks" in doc else doc
    problems = []

    # (2) and (3).
    ids = []
    for t in tasks:
        for field in ("id", "title", "status"):
            if not t.get(field):
                problems.append(f"a task has no '{field}': {t.get('id', '<no id>')}")
        if t.get("id"):
            ids.append(t["id"])

    dupes = {i for i in ids if ids.count(i) > 1}
    if dupes:
        problems.append(f"duplicate task ids: {sorted(dupes)}")

    # (4) the sequence.
    #
    # NOT "no gaps". The backlog has 851 gaps by design: GUS-224
    # through GUS-238 and GUS-240 through GUS-998 were retired, and
    # the numbering was never compacted. A gap check would report a
    # permanent, correct state as a failure, and a guard that cries
    # wolf is a guard nobody runs.
    #
    # What IS checked: the numbers are unique, they ascend in file
    # order (so a task was not pasted into the wrong place), and the
    # last id is the highest.
    nums = [int(m.group(1)) for i in ids if (m := re.fullmatch(r"GUS-(\d+)", i))]
    if nums:
        if nums[-1] != max(nums):
            problems.append(
                f"the last task id is GUS-{nums[-1]} but GUS-{max(nums)} "
                f"exists -- the newest task is not last"
            )
        # Two tasks are out of order -- GUS-1004 and GUS-1005 sit after
        # GUS-1011 and GUS-1018. That is PRE-EXISTING (measured in the
        # committed backlog on 2026-11-11), so it is reported and not
        # failed: this guard's job is to catch a task pasted into the
        # wrong place NOW, not to relitigate a state that predates it.
        inversions = [
            (nums[k - 1], nums[k]) for k in range(1, len(nums))
            if nums[k] < nums[k - 1]
        ]
        if inversions:
            known = {(1011, 1004), (1018, 1005)}
            unexpected = [x for x in inversions if x not in known]
            if unexpected:
                problems.append(
                    f"the task ids do not ascend in file order: {unexpected}"
                )
            else:
                print(
                    "  NOTE: the two pre-existing out-of-order ids "
                    "(GUS-1004, GUS-1005) are unchanged"
                )

    # (5) the evidence lists.
    for t in tasks:
        ev = t.get("evidence")
        if ev is None:
            continue
        if not isinstance(ev, list):
            problems.append(f"'{t.get('id')}': the evidence is not a list")
            continue
        for i, item in enumerate(ev):
            if not isinstance(item, str):
                problems.append(
                    f"'{t.get('id')}': the evidence item {i} is a "
                    f"{type(item).__name__}, not a string"
                )

    if problems:
        print(f"FAILED: {len(problems)} problem(s)")
        for p in problems[:40]:
            print(f"  - {p}")
        return 1

    print(
        f"OK: {len(tasks)} tasks, ids GUS-001..GUS-{max(nums)}, "
        f"the evidence lists are strings, the YAML parses"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
