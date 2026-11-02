#!/usr/bin/env python3
"""The seeder's safety tests.

WHAT THIS PROVES
----------------
The statement seeder (`scripts/seed_statements_from_dish_content.py`) had
three defects that all pointed the same way — at production:

1. **The `--dry-run` flag wrote to the database.** The `INSERT` ran
   unconditionally; `--apply` only changed the REPORTING. A dry run wrote
   30 statements, and the follow-up `--apply` wrote 26 more — 56 rows
   where 26 were intended.

2. **The `--db` flag was ignored.** `DB_NAME` was captured at import
   time; `main()` set `os.environ["GUSTALE_DB_NAME"]` later, and `db()`
   then overwrote the child environment with the import-time constant.
   The script always wrote to the import-time database WHILE PRINTING the
   `--db` value. So the output said "the database: <whatever you passed>"
   while writing somewhere else entirely.

3. **Nothing stopped it writing to live.** The default target was
   `gustale` — production.

Each test below fails on the old code and passes on the new.

USAGE
-----
    python3 scripts/test_seed_statements_safety.py
"""

from __future__ import annotations

import ast
import os
import re
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
SCRIPT = REPO / "scripts" / "seed_statements_from_dish_content.py"

FAILURES: list[str] = []
PASSES: list[str] = []


def check(name: str, condition: bool, detail: str = "") -> None:
    if condition:
        PASSES.append(name)
        print(f"  PASS: {name}")
    else:
        FAILURES.append(f"{name}{(' — ' + detail) if detail else ''}")
        print(f"  FAIL: {name}{(' — ' + detail) if detail else ''}")


def source() -> str:
    return SCRIPT.read_text(encoding="utf-8")


def main() -> int:
    if not SCRIPT.exists():
        print(f"  FAIL: {SCRIPT} does not exist")
        return 1

    src = source()

    # ── 1. the dry run must not write ─────────────────────────────────
    # The INSERT is inside an `if args.apply:` branch. We check this
    # STRUCTURALLY: find the INSERT statement's call site and confirm it
    # is guarded by args.apply.
    print("=== 1. the dry run must not write")

    insert_call = re.search(
        r"if args\.apply:\s*\n(?:.*\n)*?\s*out = db\(INSERT_STATEMENT",
        src,
    )
    check(
        "the INSERT is inside an `if args.apply:` branch",
        insert_call is not None,
        "the INSERT_STATEMENT call is not guarded by args.apply",
    )

    # And there must be NO unguarded INSERT call.
    all_inserts = [m for m in re.finditer(r"db\(INSERT_STATEMENT", src)]
    guarded = len(all_inserts) == len(re.findall(r"if args\.apply:", src)) or bool(
        insert_call
    )
    check(
        "there is exactly one INSERT call site",
        len(all_inserts) == 1,
        f"found {len(all_inserts)} INSERT call sites",
    )

    # The dry-run branch (the `else:` of the `if args.apply:`) must not
    # contain an INSERT. The branch is found by its position: the `else:`
    # that follows the `if args.apply:` guarding the INSERT.
    lines = src.splitlines()
    guard_idx = None
    for i, l in enumerate(lines):
        if re.match(r"\s*if args\.apply:\s*$", l):
            guard_idx = i
            break
    if guard_idx is None:
        check("the `if args.apply:` guard exists", False,
              "no `if args.apply:` line found")
    else:
        # Find the matching `else:` at the same indent.
        indent = len(lines[guard_idx]) - len(lines[guard_idx].lstrip())
        else_idx = None
        for i in range(guard_idx + 1, len(lines)):
            l = lines[i]
            if not l.strip():
                continue
            cur_indent = len(l) - len(l.lstrip())
            if cur_indent == indent and l.strip().startswith("else:"):
                else_idx = i
                break
            if cur_indent < indent:
                break
        if else_idx is None:
            check("the dry-run branch (the else) exists", False,
                  "no `else:` at the guard's indent")
        else:
            # The else-branch runs until the indent drops back.
            branch = []
            for i in range(else_idx + 1, len(lines)):
                l = lines[i]
                if not l.strip():
                    branch.append(l)
                    continue
                cur_indent = len(l) - len(l.lstrip())
                if cur_indent <= indent:
                    break
                branch.append(l)
            seg = "\n".join(branch)
            check(
                "the dry-run branch contains no INSERT",
                "INSERT_STATEMENT" not in seg,
                "the dry-run branch calls INSERT_STATEMENT",
            )
            # The dry-run branch MAY read (it checks that the predicate
            # exists) — it must not WRITE. Every db() call in the branch
            # must therefore be a SELECT.
            dry_db_calls = re.findall(r"db\(\s*(.*?)\s*,\s*\{", seg, re.S)
            writes = [
                c for c in dry_db_calls
                if re.search(r"\b(INSERT|UPDATE|DELETE|CREATE|DROP|ALTER|TRUNCATE)\b", c, re.I)
            ]
            check(
                "every db() call in the dry-run branch is a read",
                not writes,
                f"the dry-run branch issues a write: {writes[:1]}",
            )
            check(
                "the dry-run branch does not call INSERT_STATEMENT",
                "INSERT_STATEMENT" not in seg,
                "the dry-run branch calls INSERT_STATEMENT",
            )

    # ── 2. --db must be honoured ───────────────────────────────────────
    print("\n=== 2. the --db flag must be honoured")

    check(
        "the target is read at CALL time, not import time",
        "def db_name()" in src and "return os.environ.get(\"GUSTALE_DB_NAME\")" in src,
        "there is no db_name() resolver",
    )
    check(
        "db() uses the resolver, not a captured constant",
        'env["GUSTALE_DB_NAME"] = db_name()' in src,
        "db() still assigns a module-level constant",
    )
    check(
        "the module-level constant is not captured at import",
        not re.search(r"^DB_NAME\s*=\s*os\.environ\.get", src, re.M),
        "DB_NAME is still assigned at import time",
    )
    check(
        "the reported database is the RESOLVED target",
        'print(f"    the database: {target}")' in src
        and 'print(f"    the database: {os.environ.get(\'GUSTALE_DB_NAME\')}")' not in src,
        "the print still reads the raw environment",
    )

    # ── 3. a live write must be refused ────────────────────────────────
    print("\n=== 3. a write to live must be refused")

    check(
        "there is an explicit live-write refusal",
        "refusing to write to the LIVE database" in src,
        "no live-write refusal found",
    )
    check(
        "the refusal fires only on --apply",
        re.search(r"if args\.apply and target == \"gustale\":", src) is not None,
        "the refusal is not conditioned on args.apply",
    )
    check(
        "the refusal happens BEFORE any statement is read or written",
        src.index("refusing to write to the LIVE database")
        < src.index("dishes = db_rows(SELECT_DISHES"),
        "the refusal comes after the read",
    )

    # ── 4. the file must still parse ───────────────────────────────────
    print("\n=== 4. the script must still be valid Python")
    try:
        ast.parse(src)
        check("the script parses", True)
    except SyntaxError as exc:
        check("the script parses", False, str(exc))

    print()
    print(f"=== the seeder's safety tests: {len(PASSES)} passed, {len(FAILURES)} failed")
    for f in FAILURES:
        print(f"    !! {f}")
    return 1 if FAILURES else 0


if __name__ == "__main__":
    sys.exit(main())
