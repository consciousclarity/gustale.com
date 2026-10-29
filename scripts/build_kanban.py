#!/usr/bin/env python3
"""Generate .hermes/KANBAN.md from .hermes/BACKLOG.yaml.

WHY A GENERATOR

A board that is written by hand drifts from the backlog the moment
one of them moves. The backlog is the STATE; the board is a VIEW. So
the board is generated, and the generator refuses to invent anything:
every number and every task id in the output comes from the backlog.

The prose — the roles, the columns, the gates, the loop — is a
template in this file. The numbers — the counts, the cards, the
priority and phase tables — are read from the backlog.

Usage:

    python3 scripts/build_kanban.py            # print the board
    python3 scripts/build_kanban.py --write    # write .hermes/KANBAN.md
"""

from __future__ import annotations

import argparse
import collections
import re
import sys
from datetime import date
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
BACKLOG = REPO / ".hermes" / "BACKLOG.yaml"
KANBAN = REPO / ".hermes" / "KANBAN.md"

# The prose is a template. The {placeholders} are filled from the
# backlog.
TEMPLATE = """# KANBAN — the board and the roles

**Adopted 2026-10-29 by Alejandro.** This file is the *view* of the work. The
*state* is `.hermes/BACKLOG.yaml` — {task_count} tasks, {id_range} — and this
board is generated from it by `scripts/build_kanban.py`, so the two cannot
disagree.

**Owner decision 2026-10-17:** `.hermes/ROADMAP.md` is the master roadmap.
`.hermes/BACKLOG.yaml` is the tracked task list. `.hermes/ROADMAP_EXECUTION.md`
says how to run it. `RULES.md` still wins on anything about approvals, secrets
and safety. This file adds the **board** and the **roles**.

---

## 1. The roles

There are four, and they are distinguished by **which credential can write the
row** — not by a written rule. A boundary enforced only by a rule is a boundary
that gets crossed under pressure; a boundary enforced by *who holds the key* is
not. (ADR-002, Q12.)

| role | who | can write | can never |
|---|---|---|---|
| **Owner** | Alejandro | anything, including the approval-only classes | — |
| **Reviewer** | Alejandro, or a moderator acting on his behalf | `statement.status → verified`; mark a translation `reviewed`; accept or reject a contributor's correction | publish, delete, or write credentials |
| **Publisher** | Alejandro | `statement.status → published`; `dishes.status → published`; retire a dish | change the evidence state of a claim |
| **Moderator** | the agent (`hermes-agent`) | create and classify; propose; write `machine` translations; add S6 discovery citations; flag a dispute | **`verified`, `published`, `reviewed`** — ever, under any circumstance |

**The agent's boundary is mechanical, not advisory.** ADR-002 Q12 put it in the
database: `statement_set_status()` refuses a `verified` transition by
`hermes-agent`, and a direct `UPDATE` on a status column is refused by a
trigger with the message *"the status of a statement may only change through
statement_set_status(), which checks the gates."* The gate tests are in
`scripts/test_claim_gates.sql` and run on live.

**The contributor role** is separate from all four: an outside contributor may
suggest a correction and may never write anything directly. Corrections arrive
as proposals and are moderated.

### What still needs a human

Not everything is a role — some things are simply *yours to decide*, because
they cost money, change DNS, or are irreversible. Those are in RULES.md §
Approval items and are not on this board.

---

## 2. The board

Five columns. A task is in **one** column, and a card moves right only when its
acceptance criteria are met.

| column | meaning | who moves a card in | who moves it out |
|---|---|---|---|
| **TODO** | not started | — | the agent, to *doing* |
| **DOING** | in progress, one branch, one PR | the agent | the agent, to *review* — or back to TODO |
| **REVIEW** | the PR is open, or the change needs a human's eye | the agent | a **Reviewer** — to *done*, or back to *doing* |
| **DONE** | merged, verified live, `status: done` with `evidence:` | a **Reviewer** | — |
| **BLOCKED** | waiting on something outside the work: a decision, a cost, a credential | the agent | whoever holds the unblock |

**Nothing goes straight from DOING to DONE.** A task passes through REVIEW, and
only a Reviewer can move it out. This is the same shape as the claims model,
and for the same reason.

**The board is not the backlog.** `BACKLOG.yaml` holds the priority, the phase,
the epic and the dependencies; the board holds *where the work actually is*.

---

## 3. The current board

_Generated {today} from BACKLOG.yaml — {task_count} tasks._

| column | count |
|---|---:|
| TODO | {todo} |
| DOING | {doing} |
| REVIEW | {review} |
| DONE | {done} |
| BLOCKED | {blocked} |

{doing_cards}
{done_cards}
### By priority and phase

| priority | tasks | | phase | tasks |
|---|---:|---|---|---:|
{priority_rows}
### The order

1. Anything broken **live** — always first.
2. The **first 15** in `first15_order` (ROADMAP §21), respecting `depends_on`.
3. Then by phase (0 → 6). Never start a task whose phase gate is not met,
   except read-only research and audit tasks, which may run ahead.
4. Image work already in flight continues in parallel.

**Phase gates** (ROADMAP §21):

| gate | required before moving on |
|---|---|
| 0 → 1 | GUS-001 report merged; GUS-002 closed with a test; GUS-005 deploy order fixed; GUS-011 integrity report exists |
| 1 → 2 | Entity model (GUS-014) + evidence policy (GUS-026) + claim citations (GUS-028) live on the 3 reference dishes |
| 2 → 3 | Rendang, Chicken Tikka Masala, Tacos al Pastor complete end to end (ROADMAP §22) |

**No bulk content generation** before gate 1 → 2. Images for existing dishes are
allowed.

---

## 4. The per-card loop

1. Set `status: in_progress` in BACKLOG.yaml. Write the acceptance criteria.
2. **Inspect before changing** — repo, schema, migrations, tests, live. Note
   what already exists. A card that assumes something is missing when it is
   already there is a card that breaks something.
3. Branch `gus-NNN-<slug>`, small PR, titled `GUS-NNN: …`. One task, or a
   tightly coupled pair, per PR.
4. Migrations: versioned, reversible where possible. `gustale-backup.service`
   first. Anything that drops or renames data → approval → ask Alejandro.
5. Merge on green CI. **Verify live**: the API, both domains, and the three
   reference dishes.
6. Set `status: done` with `evidence:` — the PR URL, the merge SHA, the test
   names, the live check output.
7. One line in TASKS.md.

### The live gate, in full

A change that touches the database gets the whole gate, in this order:

1. **Backup** — `pg_dump`, verified by `pg_restore -l`, and the dump's size
   and table count recorded.
2. **Snapshot** — the row counts of every table the change touches, recorded
   before anything is written.
3. **Dry-run on an exact copy** — `CREATE DATABASE … TEMPLATE gustale`, then
   the migration against the copy.
4. **Assert the expected counts** — and **abort on any zero-row or mismatch**.
   A deliberate wrong count must fail the migration *before* any write, so the
   transaction rolls back with nothing written. This is tested, not assumed.
5. **Apply.**
6. **Verify against live** — with independent queries, not the migration's own
   report.
7. **Roll back automatically on failure.**

A deploy is CI green → deploy → health-check both domains → revert on failure.

---

## 5. Reporting

- Short message per merged PR: task id, what changed, live proof. No essays.
- Daily summary when anything moved: **done / in progress / blocked / needs
  your decision.**
- Ask only for RULES.md approval items, and **batch** the questions.

### The credibility rules these roles exist to enforce

- Never invent citations. A source enters the registry only after the page was
  actually fetched and the claim found in it. Record URL + access date +
  locator.
- Wikipedia and Wikidata are **discovery only**; never the sole source for a
  contested origin claim.
- Disputed origins are written as disputed.
- `kitchen-tested` is set only by a human. The agent may use documented /
  adapted / reconstructed.
- AI images are labelled as such, with the provenance stored, and are never
  described as photography of a real place or event. Licensed photos keep their
  credit.
- The owner is displayed as "Alejandro" only; the surname is never published.

---

## 6. The reference dishes

`rendang`, `chicken-tikka-masala`, `tacos-al-pastor`. They are the acceptance
fixtures for every structural change: each schema and UI change must show these
three pages still rendering, and from Phase 1 on, must show the new capability
on them.

---

## 7. Where this file lives

`.hermes/` is **not** on `main`. As of 2026-10-29 the internal state is being
moved to a **private** repository (`gustale-state`), because a branch named
`private/state` inside a *public* repository is still public — and it was.
This file goes with it.
"""


def parse_backlog(text: str) -> list[dict]:
    """The tasks, from the backlog.

    A deliberately small parser: the backlog is a flat list of task
    mappings, and the fields the board needs are all at the top level
    of each block.
    """
    tasks = []
    for block in re.split(r"\n(?=\s*-\s+id:\s+GUS-)", text):
        m = re.search(r"id:\s*(GUS-[0-9a-z]+)", block)
        if not m:
            continue
        title = re.search(r'title:\s*"(.+?)"', block) or re.search(
            r"title:\s*'(.+?)'", block
        ) or re.search(r"title:\s*(.+)$", block, re.M)
        status = re.search(r"status:\s*(\w+)", block)
        priority = re.search(r"priority:\s*(\w+)", block)
        phase = re.search(r"phase:\s*(\d+)", block)
        tasks.append(
            {
                "id": m.group(1),
                "title": (title.group(1).strip() if title else "?").strip('"'),
                "status": status.group(1) if status else "todo",
                "priority": priority.group(1) if priority else "—",
                "phase": phase.group(1) if phase else "—",
            }
        )
    return tasks


def render(tasks: list[dict]) -> str:
    counts = collections.Counter(t["status"] for t in tasks)
    ids = [t["id"] for t in tasks]

    doing = [t for t in tasks if t["status"] == "in_progress"]
    done = [t for t in tasks if t["status"] == "done"]

    doing_cards = "### DOING — {}\n\n| id | pri | phase | task |\n|---|---|---:|---|\n".format(
        len(doing)
    )
    for t in doing:
        doing_cards += f"| {t['id']} | {t['priority']} | {t['phase']} | {t['title']} |\n"
    doing_cards += "\n"

    done_cards = "### DONE — {}\n\n| id | task |\n|---|---|\n".format(len(done))
    for t in done:
        done_cards += f"| {t['id']} | {t['title']} |\n"
    done_cards += "\n"

    pri_counts = collections.Counter(t["priority"] for t in tasks)
    phase_counts = collections.Counter(t["phase"] for t in tasks)
    pri_list = [p for p in ("P0", "P1", "P2", "P3") if pri_counts.get(p)]
    phase_list = sorted(
        (p for p in phase_counts if p.isdigit()), key=lambda x: int(x)
    )

    # Two independent columns side by side. The row count is the
    # LONGER of the two, and the shorter one is padded with blanks —
    # so a phase never lands in a priority row.
    pri_rows = ""
    for i in range(max(len(pri_list), len(phase_list))):
        pri = f"{pri_list[i]} | {pri_counts[pri_list[i]]}" if i < len(pri_list) else "| |"
        ph = f"{phase_list[i]} | {phase_counts[phase_list[i]]}" if i < len(phase_list) else "| |"
        pri_rows += f"| {pri} | | {ph} |\n"

    return TEMPLATE.format(
        task_count=len(tasks),
        id_range=f"{ids[0]}…{ids[-1]}" if ids else "—",
        today=date.today().isoformat(),
        todo=counts.get("todo", 0),
        doing=len(doing),
        review=counts.get("review", 0),
        done=len(done),
        blocked=counts.get("blocked", 0),
        doing_cards=doing_cards,
        done_cards=done_cards,
        priority_rows=pri_rows,
    )


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--write", action="store_true")
    args = parser.parse_args()

    if not BACKLOG.exists():
        print(f"[kanban] {BACKLOG} not found")
        return 1
    tasks = parse_backlog(BACKLOG.read_text())
    if not tasks:
        print("[kanban] no tasks parsed — refusing to write an empty board")
        return 1

    board = render(tasks)
    if args.write:
        KANBAN.write_text(board)
        print(f"[kanban] wrote {KANBAN} ({len(tasks)} tasks)")
    else:
        sys.stdout.write(board)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
