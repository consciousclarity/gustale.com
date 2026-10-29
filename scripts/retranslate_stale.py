#!/usr/bin/env python3
"""Re-translate the stale translations — ADR-003 layer 3b, the upkeep.

WHAT THIS DOES

The ADR: "store the source hash → stale + auto-retranslate on change".

The DATABASE marks a translation stale when the English source
sentence changes — that is the `description_sentences_mark_translations_stale`
trigger, and it is per-sentence, so editing one sentence invalidates
exactly that translation and leaves the other 312 alone.

This script is the other half: it finds the stale translations and
re-translates them. The re-translated text is a MACHINE translation
again — it goes back to `status = 'machine'` and carries the
"machine-translated" badge — because a source edit can change the
meaning, and a human should look at it before it is trusted again.

A translation that a human REVIEWED stays reviewed: a stale reviewed
translation is re-translated into a SUGGESTION, but the reviewed text
is not silently replaced. Instead:

  - the re-translation is written to `proposed_text`
  - `proposal_status` is set to 'pending'
  - the reviewed TEXT stays as it is

so a moderator accepts the new wording or rejects it, and the reviewed
text is only replaced through the moderation path. That is the
difference between 'stale' as an overlay and 'stale' as a status, and
it is why the moderation path exists.

For a translation that was only MACHINE, the re-translation replaces
the text directly and clears the stale flag — there is nothing to
protect, because nothing was ever human-approved.

Usage:

    python3 scripts/retranslate_stale.py --dry-run
    python3 scripts/retranslate_stale.py
    python3 scripts/retranslate_stale.py --locale es --limit 20
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from translate_sentences import (  # noqa: E402
    LOCALES,
    source_hash,
    translate,
)

REPO = Path(__file__).resolve().parent.parent


def query(
    sql: str,
    db_name: str | None = None,
    vars: dict[str, str] | None = None,
) -> str:
    """Run a query and return its output."""
    env = dict(os.environ)
    if db_name:
        env["GUSTALE_DB_NAME"] = db_name
    else:
        env.pop("GUSTALE_DB_NAME", None)
    argv = ["bash", str(REPO / "scripts" / "dbq.sh")]
    for name, value in (vars or {}).items():
        argv += ["-v", f"{name}={value}"]
    argv.append(sql)
    out = subprocess.run(
        argv,
        capture_output=True,
        text=True,
        env=env,
        check=True,
    )
    return out.stdout


def rows(
    sql: str,
    db_name: str | None = None,
    vars: dict[str, str] | None = None,
) -> list[dict]:
    """The query rows, as a list of dicts.

    The query must SELECT a single json_build_object(...) column, and
    this reads it back as JSON. A pipe-separated row would break on a
    text field that contains a pipe — and a translated sentence can.
    """
    text = query(sql, db_name, vars)
    lines = [ln for ln in text.splitlines() if ln.strip()]
    if len(lines) < 3:
        return []
    out = []
    for ln in lines[2:]:
        ln = ln.strip()
        if not ln:
            continue
        try:
            out.append(json.loads(ln))
        except json.JSONDecodeError:
            continue
    return out


def stale_translations(
    locale: str | None = None, limit: int | None = None
) -> list[dict]:
    """The stale translations, with their current source text."""
    conditions = ["t.is_stale = true"]
    if locale:
        conditions.append("t.locale = :'LOCALE'")
    sql = (
        "select json_build_object("
        "'id', t.id, 'locale', t.locale, 'status', t.status, "
        "'text', t.text, 'sentence_id', t.source_sentence_id, "
        "'source_text', s.text) "
        "from description_sentence_translations t "
        "join description_sentences s on s.id = t.source_sentence_id "
        "where " + " and ".join(conditions) + " "
        "order by t.locale, t.id"
    )
    if limit:
        sql += f" limit {int(limit)}"
    if locale:
        return rows(sql, vars={"LOCALE": locale})
    return rows(sql)


def write_retranslation(
    translation_id: str,
    locale: str,
    new_text: str,
    source_text: str,
    dry_run: bool,
) -> str:
    """Apply the re-translation.

    Returns what was done: 'machine' (replaced) or 'proposal' (queued
    for a moderator).
    """
    status_rows = rows(
        "select json_build_object('status', status) "
        "from description_sentence_translations "
        f"where id = '{translation_id}'"
    )
    if not status_rows:
        raise RuntimeError(f"no such translation: {translation_id}")
    status = status_rows[0]["status"]

    if status == "reviewed":
        # Do NOT replace the reviewed text. Queue it as a proposal, so
        # a moderator decides — the same path a contributor's
        # correction takes.
        if dry_run:
            return "proposal"
        sql = (
            "update description_sentence_translations set "
            "proposed_text = :'TEXT', proposed_by = null, "
            "proposed_at = now(), proposal_status = 'pending', "
            "is_stale = false, updated_at = now() "
            f"where id = '{translation_id}'"
        )
        _run_sql(sql, new_text)
        return "proposal"

    # A machine translation: replace it outright and clear the stale
    # flag. Nothing human-approved is being overwritten.
    if dry_run:
        return "machine"
    sql = (
        "update description_sentence_translations set "
        "text = :'TEXT', source_hash = :'HASH', status = 'machine', "
        "is_stale = false, translator = 'auto-retranslate', "
        "updated_at = now() "
        f"where id = '{translation_id}'"
    )
    _run_sql(sql, new_text, source_hash(source_text))
    return "machine"


def _run_sql(sql: str, text: str = "", hsh: str = "") -> None:
    """Run a write through psql, with the text passed as a variable.

    The text goes through psql's `:'var'` quoting, so an apostrophe or
    a dollar sign in the translation cannot break the statement.
    """
    subprocess.run(
        [
            "bash",
            str(REPO / "scripts" / "dbq.sh"),
            "-v",
            "TEXT=" + text,
            "-v",
            "HASH=" + hsh,
            sql,
        ],
        capture_output=True,
        text=True,
        check=True,
    )


def load_token() -> str:
    """The MiniMax OAuth token, from the environment or .env."""
    token = os.environ.get("MINIMAX_OAUTH_MAX_TOKEN")
    if token:
        return token
    env_path = Path.home() / ".hermes" / ".env"
    if env_path.exists():
        for line in env_path.read_text().splitlines():
            if line.startswith("MINIMAX_OAUTH_MAX_TOKEN="):
                return line.split("=", 1)[1].strip()
    raise SystemExit(
        "No MiniMax OAuth token. Set MINIMAX_OAUTH_MAX_TOKEN in the "
        "environment or in ~/.hermes/.env."
    )


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--locale", help="only this locale")
    parser.add_argument("--limit", type=int, help="at most this many")
    parser.add_argument(
        "--dry-run", action="store_true", help="show what would happen"
    )
    args = parser.parse_args()

    if args.locale and args.locale not in LOCALES:
        raise SystemExit(
            f"Unknown locale {args.locale!r}. The core set is: "
            + ", ".join(LOCALES)
        )

    pending = stale_translations(args.locale, args.limit)
    print(f"[retranslate] {len(pending)} stale translation(s)")

    if not pending:
        return 0

    token = None if args.dry_run else load_token()
    counters = {"machine": 0, "proposal": 0, "failed": 0}

    for i, item in enumerate(pending, 1):
        src = item["source_text"]
        if args.dry_run:
            print(f"  [{i}/{len(pending)}] {item['locale']} {item['id'][:8]} "
                  f"({item['status']}) {src[:60]!r}")
            counters["machine"] += 1
            continue

        try:
            new_text = translate(token, src, item["locale"])
            if not new_text:
                raise RuntimeError("the model returned no text")
            outcome = write_retranslation(
                item["id"], item["locale"], new_text, src, False
            )
            counters[outcome] += 1
            print(
                f"  [{i}/{len(pending)}] {item['locale']} {item['id'][:8]} "
                f"→ {outcome}"
            )
        except Exception as exc:  # noqa: BLE001
            counters["failed"] += 1
            print(
                f"  [{i}/{len(pending)}] {item['locale']} {item['id'][:8]} "
                f"→ FAILED: {exc}",
                file=sys.stderr,
            )
        # Be gentle with the API — a short pause between the calls.
        time.sleep(0.2)

    print(
        "[retranslate] "
        f"replaced={counters['machine']} "
        f"queued-for-review={counters['proposal']} "
        f"failed={counters['failed']}"
    )
    return 1 if counters["failed"] else 0


if __name__ == "__main__":
    raise SystemExit(main())
