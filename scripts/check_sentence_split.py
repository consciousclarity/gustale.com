#!/usr/bin/env python3
"""Check the splitter against the live descriptions — ADR-002 Q9's gate.

ADR-002 Q9 requires TWO different instruments, and this script is one
of them:

  | instrument        | what it proves                                    |
  |-------------------|---------------------------------------------------|
  | concat check      | the sentence table and the live column agree, byte-for-byte |
  | boundary fixtures | the splitter puts boundaries in the right places   |

The concat check is a table<->column consistency gate. A zero-width
split rejoins exactly BY CONSTRUCTION — it never removes a character —
so it reconstructs the input whether the boundaries are right or
wrong. It proves agreement, NOT correctness. The boundary fixture set
proves the boundaries, and human review proves the rule.

This script runs the splitter over every live description and checks:

  1. the concatenation of the sentences equals the source EXACTLY;
  2. no sentence is empty or whitespace-only;
  3. the sentence count is plausible (a description is not 90
     sentences of three words each);
  4. no sentence ENDS with a known abbreviation or a stray initial —
     the symptoms of a boundary the splitter got wrong.

Usage:  python3 scripts/check_sentence_split.py
"""

import subprocess
import sys

sys.path.insert(0, __file__.rsplit("/", 1)[0])

from split_sentences import (  # noqa: E402
    ABBREVIATIONS,
    split_sentences,
)


def fetch_descriptions() -> list[tuple[str, str, str]]:
    """(slug, short_description, long_description) for every published dish.

    The descriptions are read as JSON so a pipe in the prose cannot
    corrupt the parse — which it did with the tabular psql output.
    """
    sql = """
    select json_agg(row_to_json(t))
    from (
      select slug, short_description, long_description
      from dishes
      where status = 'published'
      order by slug
    ) t;
    """
    out = subprocess.run(
        ["bash", "scripts/dbq.sh", sql],
        capture_output=True,
        text=True,
        check=True,
    ).stdout
    # dbq.sh prints the JSON after the psql banner; take the first
    # line that starts with a '['.
    for line in out.splitlines():
        line = line.strip()
        if line.startswith("[{"):
            import json

            return json.loads(line)
    raise SystemExit("could not parse the descriptions out of dbq.sh")


def main() -> int:
    rows = fetch_descriptions()
    print(f"[check] {len(rows)} published dishes")

    failures = 0
    total_sentences = 0
    longest = 0
    longest_slug = ""

    for row in rows:
        slug = row["slug"]
        for field in ("short_description", "long_description"):
            text = row.get(field)
            if not text or not text.strip():
                continue

            sentences = split_sentences(text)
            total_sentences += len(sentences)

            # 1. the concat check — byte-for-byte.
            rejoined = "".join(sentences)
            if rejoined != text:
                failures += 1
                print(f"  CONCAT MISMATCH  {slug} [{field}]")
                print(f"    original : {text[:90]!r}")
                print(f"    rejoined : {rejoined[:90]!r}")
                continue

            # 2. no empty sentences.
            for s in sentences:
                if not s.strip():
                    failures += 1
                    print(f"  EMPTY SENTENCE  {slug} [{field}]")
                    break

            # 3. a plausible count.
            if len(sentences) > 30:
                failures += 1
                print(
                    f"  TOO MANY SENTENCES  {slug} [{field}]: {len(sentences)}"
                )

            # 4. the symptom of a wrong boundary.
            for s in sentences:
                body = s.strip()
                if not body:
                    continue
                last = body.rstrip('."!?\'"”’').split()
                if not last:
                    continue
                tail = last[-1].lower().rstrip(".")
                if tail in ABBREVIATIONS:
                    failures += 1
                    print(
                        f"  SENTENCE ENDS WITH AN ABBREVIATION  {slug} "
                        f"[{field}]: {body[-60:]!r}"
                    )
                    break

            if len(text) > longest:
                longest = len(text)
                longest_slug = slug

    print(
        f"[check] {total_sentences} sentences across "
        f"{len(rows)} dishes; the longest description is "
        f"{longest} chars ({longest_slug})"
    )
    print(f"[check] {'PASS' if failures == 0 else f'FAIL: {failures} problems'}")
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
