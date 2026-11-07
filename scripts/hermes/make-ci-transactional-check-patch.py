#!/usr/bin/env python3
"""Build the CI patch for the transactional-migration check.

The GitHub App has no 'workflows' scope, so a change to
.github/workflows/ci.yml cannot be pushed by the agent. It ships as a
PATCH FILE that the owner applies, exactly as PR #189's
docs/ci-migrations-0050-0051.patch did.

The patch is generated (not hand-written) so it always matches the
workflow as it is at generation time, and so it can be regenerated
after the workflow moves.

Usage:
    python3 scripts/hermes/make-ci-transactional-check-patch.py
"""
from __future__ import annotations

import re
import subprocess
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent.parent
WORKFLOW = REPO / ".github" / "workflows" / "ci.yml"
OUT = REPO / "docs" / "ci-transactional-migration-check.patch"

ANCHOR = """      - name: No script may drop a database on the production cluster
        run: |
          python3 scripts/test-check-no-production-db-drops.py
          python3 scripts/check-no-production-db-drops.py
"""

STEP = """      # Every migration must be wrapped in a transaction.
      #
      # An unwrapped migration runs in AUTOCOMMIT: each statement is
      # its own transaction and commits the moment it succeeds. That is
      # fine when it works, and a data-loss event when it does not --
      # a failure part-way through leaves partial state that no
      # ROLLBACK can undo, and the only recovery is a restore from a
      # backup.
      #
      # 0050 is the case in point. It ran in AUTOCOMMIT on live on
      # 2026-11-07. It succeeded, so live is consistent -- but it
      # contains the word BEGIN twice, and both are PL/pgSQL BLOCK
      # openers, not transaction control. A `grep BEGIN` says it is
      # wrapped. It is not.
      #
      # So this check does not grep for the word: it tells a
      # transaction wrapper from a PL/pgSQL block, which is the check
      # that would have caught 0050. Thirteen migrations predate the
      # rule and are on a FROZEN, explicit grandfathered list, with
      # the reason for each.
      #
      # The test comes FIRST, and it is the point: the checker must be
      # able to FAIL. A gate that cannot fail is not a gate.
      - name: Every migration must be wrapped in a transaction
        run: |
          python3 scripts/test-check-migrations-are-transactional.py
          python3 scripts/check-migrations-are-transactional.py
"""

HEADER = """From 0000000000000000000000000000000000000000 Mon Sep 17 00:00:00 2001
From: Hermes Agent <hermes-agent@users.noreply.github.com>
Date: {date}
Subject: [PATCH] ci: every migration must be wrapped in a transaction

The CI step that runs the transactional-migration check.

THIS COMMIT NEEDS A HUMAN. The GitHub App has no 'workflows' scope and
cannot push it. Apply it with:

    git apply docs/ci-transactional-migration-check.patch

The check:

  * fails the build if any migration that is not explicitly
    grandfathered is not wrapped in BEGIN/COMMIT;
  * does NOT grep for the word BEGIN -- it tells a transaction wrapper
    from a PL/pgSQL block, because 0050 contains the word BEGIN twice
    and both of those are block openers. A grep-based check would have
    passed the exact file this rule exists for;
  * has a test that proves it can FAIL, and the test comes FIRST in
    the step, for the same reason the production-drop scanner's does.

The thirteen grandfathered migrations are named explicitly, each with
its reason, in scripts/check-migrations-are-transactional.py. The list
is frozen: it only ever shrinks.
"""


def main() -> int:
    text = WORKFLOW.read_text(encoding="utf-8")
    if ANCHOR not in text:
        print("FAIL: the anchor step was not found in the workflow.", file=sys.stderr)
        print("The workflow has moved; regenerate this patch against it.", file=sys.stderr)
        return 1
    if "check-migrations-are-transactional.py" in text:
        print("FAIL: the workflow already runs the transactional check.", file=sys.stderr)
        return 1

    new_text = text.replace(ANCHOR, ANCHOR + "\n" + STEP, 1)

    # Write the patched workflow to a temp file and let `git diff` make
    # the patch, so the hunks are real and `git apply` will accept it.
    import tempfile

    with tempfile.TemporaryDirectory() as tmp:
        tmp_path = Path(tmp) / "ci.yml"
        tmp_path.write_text(new_text, encoding="utf-8")
        result = subprocess.run(
            [
                "git",
                "diff",
                "--no-index",
                "--src-prefix=a/",
                "--dst-prefix=b/",
                "--",
                str(WORKFLOW.relative_to(REPO)),
                str(tmp_path),
            ],
            cwd=REPO,
            capture_output=True,
            text=True,
        )
        diff = result.stdout

    # `git diff --no-index` names the temp file on the b/ side. Rewrite
    # it to the real path so `git apply` works from the repo root.
    diff = re.sub(r"b/tmp/[^ \t\n]+/ci\.yml", "b/.github/workflows/ci.yml", diff)
    diff = diff.replace(
        "diff --git a/.github/workflows/ci.yml b/tmp/", "diff --git a/.github/workflows/ci.yml b/.github/workflows/ci.yml"
    )

    from datetime import datetime

    header = HEADER.format(date=datetime.now().strftime("%a %d %b %Y %H:%M:%S %z"))
    OUT.write_text(header + "\n" + diff, encoding="utf-8")

    print(f"wrote {OUT.relative_to(REPO)} ({OUT.stat().st_size} bytes)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
