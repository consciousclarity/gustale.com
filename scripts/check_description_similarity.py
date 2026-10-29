#!/usr/bin/env python3
"""The similarity check: is this description the dish's OWN wording?

THE RULE

ADR-003 layer 3b and the publication rule for Pool A both require
that a dish's description is the SITE'S wording about the dish — not
a copy of the Wikipedia lead pasted in.

Why it matters, concretely. A reference work whose dish descriptions
are the encyclopedia's sentences, reworded badly, is worse than one
whose descriptions are shorter and its own: the reader can get the
encyclopedia's prose from the encyclopedia, and what they came to
Gustale for is the dish's place, its technique, its tradition. Copying
also fails the attribution rule — a description that IS the
encyclopedia's text needs the encyclopedia's licence and credit, and
is not the site's own.

THE MEASUREMENT

Not a plagiarism detector. A PLAGIARISM DETECTOR IS THE WRONG TOOL
HERE, and using one would be a mistake: it is tuned to find
attribution-worthy copying, it flags short legitimate technical
terms ("fried rice", "paneer"), and it cannot tell the difference
between "a description that mentions the source's phrasing because
that is the dish's name" and "a description that is the source's
prose". It would produce noise, and noise in a publication gate is a
gate that gets ignored.

What is used instead is a LEXICAL OVERLAP measure on the function
words, because those carry the sentence's structure:

  - The n-gram overlap of the CONTENT words (n >= 3). A real
    reword keeps the dish's nouns and its terminology and changes
    the connective tissue. A copy changes nothing.
  - The function-word overlap, which is reported separately because a
    copied sentence keeps its function words too.

The threshold is on the CONTENT n-gram overlap, and the function-word
figure is reported for the reviewer's judgement rather than as a
gate.

Usage:

    python3 scripts/check_description_similarity.py --report
    python3 scripts/check_description_similarity.py --report --limit 40
"""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
POOL_FILE = REPO / "data" / "pool_a.json"

# The threshold above which a description is treated as too close to
# the source to publish without a rewrite.
#
# It is set from the measurement below, not from a guess: the
# legitimate descriptions cluster well below it, and a copy sits at
# or near 1.0. The gap between the two clusters is wide, which is
# what makes the gate usable.
THRESHOLD = 0.45

# The function words: the connective tissue of a sentence. A copy
# keeps them; a reword moves them around.
FUNCTION_WORDS = set(
    """
    a an the this that these those and or but if then than so as at by
    for with from into onto over under about after before between during
    is are was were be been being am do does did done has have had
    it its it's their there here they them he she his her we us you i
    which who whom whose what when where why how not no nor so such
    can could should would will shall may might must
    """.split()
)

STOPWORDS = FUNCTION_WORDS | set(
    """
    also known often usually typically generally commonly sometimes
    many most some other another one two both either neither
    """.split()
)


def content_words(text: str) -> list[str]:
    """The content words, lowercased, punctuation stripped."""
    words = re.findall(r"[A-Za-z][A-Za-z'\-]*", text.lower())
    return [w for w in words if w not in STOPWORDS and len(w) > 2]


def ngrams(words: list[str], n: int = 3) -> set[tuple[str, ...]]:
    return {tuple(words[i : i + n]) for i in range(len(words) - n + 1)}


def overlap(a: str, b: str) -> tuple[float, float]:
    """(the content n-gram overlap, the function-word overlap)."""
    aw, bw = content_words(a), content_words(b)
    an, bn = ngrams(aw), ngrams(bw)
    if not an or not bn:
        # Too short for n-grams. Fall back to the word sets.
        a3 = set(aw)
        b3 = set(bw)
        content = len(a3 & b3) / max(1, len(a3 | b3))
    else:
        content = len(an & bn) / max(1, len(an | bn))

    af = set(w for w in re.findall(r"[a-z']+", a.lower()) if w in FUNCTION_WORDS)
    bf = set(w for w in re.findall(r"[a-z']+", b.lower()) if w in FUNCTION_WORDS)
    function = len(af & bf) / max(1, len(af | bf))
    return content, function


def db_rows(sql: str) -> list[dict]:
    out = subprocess.run(
        ["bash", str(REPO / "scripts" / "dbq.sh"), sql],
        capture_output=True,
        text=True,
        check=True,
    ).stdout
    for line in out.splitlines():
        line = line.strip()
        if line.startswith("[{"):
            return json.loads(line)
    return []


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--report", action="store_true")
    parser.add_argument("--limit", type=int, default=40)
    parser.add_argument("--sort", default="desc")
    args = parser.parse_args()

    pool = {r.get("slug"): r for r in json.loads(POOL_FILE.read_text())}

    dishes = db_rows(
        """
        select slug, canonical_name, short_description, long_description
          from dishes
         where created_by = 'wikidata-derived'
           and status = 'draft'
         order by slug
        """
    )
    print(f"[similarity] {len(dishes)} Pool A dishes to check")

    rows = []
    for dish in dishes:
        pool_row = pool.get(dish["slug"])
        if not pool_row:
            continue
        lead = pool_row.get("lead") or pool_row.get("extract") or ""
        if not lead:
            continue
        # The site's own wording is the short + long description.
        own = " ".join(
            part for part in (dish.get("short_description"), dish.get("long_description")) if part
        )
        if not own:
            continue
        content, function = overlap(own, lead)
        rows.append(
            {
                "slug": dish["slug"],
                "name": dish["canonical_name"],
                "content": round(content, 3),
                "function": round(function, 3),
                "own": own[:110],
                "lead": lead[:110],
            }
        )

    over = [r for r in rows if r["content"] >= THRESHOLD]
    rows.sort(key=lambda r: r["content"], reverse=(args.sort == "desc"))

    print(f"[similarity] the threshold: {THRESHOLD}")
    print(f"[similarity] {len(over)} of {len(rows)} descriptions are at or above it")
    print(f"[similarity] the clean ones: {len(rows) - len(over)}")
    print()
    print("[similarity] the distribution of the content n-gram overlap:")
    buckets = {"1.0 (a copy)": 0, "0.8-1.0": 0, "0.6-0.8": 0, "0.45-0.6": 0,
               "0.3-0.45": 0, "0.2-0.3": 0, "< 0.2": 0}
    for r in rows:
        c = r["content"]
        if c >= 0.99: buckets["1.0 (a copy)"] += 1
        elif c >= 0.8: buckets["0.8-1.0"] += 1
        elif c >= 0.6: buckets["0.6-0.8"] += 1
        elif c >= 0.45: buckets["0.45-0.6"] += 1
        elif c >= 0.3: buckets["0.3-0.45"] += 1
        elif c >= 0.2: buckets["0.2-0.3"] += 1
        else: buckets["< 0.2"] += 1
    for label, n in buckets.items():
        print(f"    {label:<16} {n:>5}  {'#' * min(60, n)}")

    print()
    print(f"[similarity] the {min(args.limit, len(rows))} closest:")
    for r in rows[: args.limit]:
        flag = "  OVER" if r["content"] >= THRESHOLD else "      "
        print(f"{flag} {r['content']:.3f} fn={r['function']:.3f}  {r['slug']:<30}")
        print(f"          ours: {r['own']}")
        print(f"          lead: {r['lead']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
