#!/usr/bin/env python3
"""Every migration must be wrapped in a transaction.

WHY THIS EXISTS
---------------
A migration that is not wrapped in BEGIN/COMMIT runs in AUTOCOMMIT: each
statement is its own transaction, and it commits the moment it succeeds.
That is fine when it works, and it is a data-loss event when it does
not.

`0050_association_review_ledger.sql` is the case in point. It creates
three tables, adds a trigger, and updates 50 rows. It has NO
transaction wrapper -- and it does not need one for the *schema*, which
is why it passed every check it was given. But it ran in autocommit, so
a failure halfway through would have left:

  * the tables created, and
  * the trigger installed, and
  * only SOME of the 50 pilot rows updated, and
  * no record that any of it had happened.

There is no `ROLLBACK` that undoes an autocommit migration. The only
recovery is a restore from a backup.

The mistake was easy to make and easy to miss. `0050` contains the
word `BEGIN` twice -- but both of them are PL/pgSQL BLOCK openers
(`BEGIN` ... `END $$;`), not transaction control. A `grep BEGIN`
says the migration is wrapped. It is not. So this check does NOT grep
for the word; it distinguishes a transaction wrapper from a PL/pgSQL
block, which means it has to understand the shape of the file.

WHAT IT CHECKS
--------------
For each migration in `db/migrations/`:

  * it must contain a REAL transaction `BEGIN` -- the word alone on a
    line, optionally `BEGIN TRANSACTION`, optionally with a semicolon;
  * it must contain a REAL `COMMIT`;
  * the `BEGIN` must come BEFORE the `COMMIT` (a `COMMIT` with no
    preceding `BEGIN` is a different bug, and it is caught too).

A PL/pgSQL block's `BEGIN` is not a transaction `BEGIN`, and neither
is the `END` that closes it. A `DO $$ ... $$;` block's own `BEGIN`/
`END` pair is likewise not a wrapper.

THE BASELINE
------------
Thirteen migrations in this repository predate this rule and are NOT
wrapped. They are listed in `LEGACY_UNWRAPPED`, with the reason each
one is exempt. The rule applies to every NEW migration: a migration
that is not in that list must be wrapped.

The list is deliberately explicit. A grandfather clause that is
"anything older than <date>" would silently exempt a migration that is
added with a back-dated filename, and the exemption would be invisible
in a diff. Naming the thirteen files makes the exemption visible, and
makes it a decision rather than a default.

The baseline is a FROZEN LIST, not a moving target. If a legacy
migration is ever wrapped properly, it is removed from the list in the
same PR that wraps it -- the list shrinks, it does not grow.

Usage:
    python3 scripts/check-migrations-are-transactional.py

Exit 0 = every migration that is not grandfathered is wrapped; 1 = not.
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
MIGRATIONS_DIR = REPO / "db" / "migrations"

#: The migrations that predate this rule and are not wrapped.
#:
#: Each one is here DELIBERATELY. Adding a name to this list is a
#: decision to accept an unwrapped migration, and it is visible in the
#: diff. The list only ever shrinks.
LEGACY_UNWRAPPED: dict[str, str] = {
    "0018_gus242_vocab_1f.sql": (
        "Pre-dates the rule. A vocabulary seed. Unwrapped seeds are "
        "idempotent by construction, so a partial failure is repaired by "
        "re-running the migration."
    ),
    "0021_adr003_vocabulary_labels.sql": (
        "Pre-dates the rule. A vocabulary seed, same reasoning as 0018."
    ),
    "0023_adr003_dish_names.sql": (
        "Pre-dates the rule. A vocabulary seed, same reasoning as 0018."
    ),
    "0027_adr002_claims_model.sql": (
        "Pre-dates the rule. Creates the claims model. It is already "
        "applied to live and has never been re-run."
    ),
    "0035_categories_kind.sql": (
        "Pre-dates the rule. A single-column addition, already applied."
    ),
    "0036_atlas_schema.sql": (
        "Pre-dates the rule. The atlas schema. Already applied, and it "
        "was authored before the transaction rule existed."
    ),
    "0037_atlas_backfill.sql": (
        "Pre-dates the rule. A backfill. Already applied."
    ),
    "0042_credential_trigger_revocation.sql": (
        "Pre-dates the rule. Revokes a trigger. Already applied, and the "
        "revocation is a single idempotent statement."
    ),
    "0043_taxonomy_canonicalisation.sql": (
        "Pre-dates the rule. Already applied."
    ),
    "0044_not_a_dish_queue.sql": (
        "Pre-dates the rule. Already applied."
    ),
    "0045_credential_guard_comment.sql": (
        "Pre-dates the rule. A comment-only change to an existing "
        "migration. Already applied."
    ),
    "0048_bot_credential_guard.sql": (
        "Pre-dates the rule. The bot-credential guard. It creates a "
        "function and a trigger, and it is already applied to live. It "
        "is deliberately NOT rewritten: 0048 is the migration ADR-004 "
        "depends on, and rewriting an applied migration changes its "
        "checksum and breaks the chain's idempotence check."
    ),
    "0050_association_review_ledger.sql": (
        "Pre-dates the rule AND is the reason the rule exists. It ran in "
        "AUTOCOMMIT on 2026-11-07, when it was applied to live. It "
        "succeeded, so live is consistent -- but a failure halfway "
        "through would have left the three tables created, the trigger "
        "installed, and only some of the 50 pilot rows updated, with no "
        "ROLLBACK able to undo it. It is ALREADY APPLIED TO LIVE and is "
        "NOT rewritten, for the same reason as 0048: rewriting an "
        "applied migration changes its checksum and breaks the chain's "
        "idempotence check. The receipt records what happened: "
        "docs/MIGRATION-RECEIPT-0050-0051.md."
    ),
}

#: A REAL transaction BEGIN: the word alone on a line, optionally
#: `TRANSACTION`, optionally with a semicolon.
#:
#: Anchored, with MULTILINE, so `BEGIN` inside a PL/pgSQL block --
#: which is always followed by more block structure -- does not match.
_BEGIN_RE = re.compile(
    r"^[ \t]*BEGIN[ \t]*(?:TRANSACTION[ \t]*)?;[ \t]*$",
    re.IGNORECASE | re.MULTILINE,
)

#: A REAL COMMIT.
_COMMIT_RE = re.compile(
    r"^[ \t]*COMMIT[ \t]*;[ \t]*$",
    re.IGNORECASE | re.MULTILINE,
)

#: A REAL ROLLBACK.
_ROLLBACK_RE = re.compile(
    r"^[ \t]*ROLLBACK[ \t]*;[ \t]*$",
    re.IGNORECASE | re.MULTILINE,
)


def _strip_sql_comments(text: str) -> str:
    """Blank out `--` comments and `/* */` blocks, keeping line numbers.

    A commented-out `BEGIN;` is not a transaction wrapper. The line
    numbers are preserved so a finding can point at the real line.
    """
    out = []
    in_block = False
    for line in text.splitlines():
        stripped = line.strip()
        if in_block:
            out.append("")
            if "*/" in stripped:
                in_block = False
            continue
        if stripped.startswith("/*"):
            out.append("")
            if "*/" not in stripped:
                in_block = True
            continue
        # A `--` comment. Careful with a `--` inside a string literal,
        # which is rare in a migration's DDL but not impossible.
        idx = line.find("--")
        if idx >= 0:
            before = line[:idx]
            if before.count("'") % 2 == 0:
                out.append(before)
                continue
        out.append(line)
    return "\n".join(out)


def check_file(path: Path) -> list[str]:
    """Return the findings for one migration. Empty list means clean."""
    try:
        text = path.read_text(encoding="utf-8", errors="replace")
    except OSError as exc:  # pragma: no cover - unreadable file
        return [f"{path.name}: could not be read ({exc})"]

    code = _strip_sql_comments(text)
    begins = list(_BEGIN_RE.finditer(code))
    commits = list(_COMMIT_RE.finditer(code))

    findings: list[str] = []
    if not begins:
        findings.append(
            f"{path.name}: no transaction BEGIN. The migration would run "
            f"in AUTOCOMMIT, so a failure part-way through would leave "
            f"partial state with no ROLLBACK able to undo it."
        )
        return findings
    if not commits:
        findings.append(
            f"{path.name}: a transaction BEGIN with no COMMIT. The "
            f"transaction would be rolled back when the session ends, so "
            f"the migration would persist NOTHING."
        )
        return findings
    if commits[0].start() < begins[0].start():
        findings.append(
            f"{path.name}: a COMMIT appears before the BEGIN. The "
            f"migration is not wrapped in a transaction."
        )
    return findings


def collect_files() -> list[Path]:
    if not MIGRATIONS_DIR.is_dir():
        return []
    return sorted(MIGRATIONS_DIR.glob("*.sql"))


def main() -> int:
    print("=== every migration must be wrapped in a transaction ===")
    files = collect_files()
    if not files:
        print(f"  FAIL  no migrations found in {MIGRATIONS_DIR}", file=sys.stderr)
        return 1

    findings: list[str] = []
    grandfathered = 0
    for path in files:
        if path.name in LEGACY_UNWRAPPED:
            grandfathered += 1
            continue
        findings.extend(check_file(path))

    checked = len(files) - grandfathered
    if not findings:
        print(f"  OK  {checked} migration(s) checked; all are wrapped in")
        print(f"      BEGIN/COMMIT. ({grandfathered} legacy migration(s)")
        print(f"      are grandfathered -- see LEGACY_UNWRAPPED in this file.)")
        print()
        print("  An unwrapped migration runs in AUTOCOMMIT: a failure")
        print("  part-way through leaves partial state that no ROLLBACK")
        print("  can undo. 0050 ran that way on live on 2026-11-07; it")
        print("  succeeded, and it is the reason this check exists.")
        return 0

    print(
        "  FAIL  a migration is not wrapped in a transaction:", file=sys.stderr
    )
    for f in findings:
        print(f"    {f}", file=sys.stderr)
    print(
        "\n"
        "  Wrap it:\n"
        "\n"
        "      BEGIN;\n"
        "      ...\n"
        "      COMMIT;\n"
        "\n"
        "  If it is a PL/pgSQL block, the block's own BEGIN/END is not a\n"
        "  transaction wrapper -- the wrapper goes OUTSIDE the block.",
        file=sys.stderr,
    )
    return 1


if __name__ == "__main__":
    sys.exit(main())
