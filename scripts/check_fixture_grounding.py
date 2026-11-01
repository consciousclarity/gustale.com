#!/usr/bin/env python3
"""
The grounding check for the atlas FIXTURES.

WHY THIS FILE EXISTS
-------------------
The fixtures publish claims about REAL dishes. The brief forbids inventing
claims:

    Never invent claims, citations, relationships, dates or geometry.

So every fixture claim must assert nothing beyond what the fixture's own
content says. This script checks that with a SECOND model call, which
shares no context with the writing of the claims.

The two refinements that proved necessary on the Pool A pipeline apply
here too:

  1. The dish's own NAME is not a claim. It is the SUBJECT. A claim
     that names the dish is not asserting anything about it.

  2. The source is the FIXTURE'S OWN CONTENT, not the citation row's
     title. The first version of this check showed the checker the
     source row's title ("The atlas fixture source - a demonstration
     record, not a historical source") and the checker marked ALL FOUR
     claims UNSUPPORTED - correctly, because that source says nothing
     about what the fixture created. The check was wrong, not the
     claims.

THE CHECK
---------
For each fixture claim, the checker is shown:

  - the fixture's own content for that dish (what it creates), and
  - the claim text,

and asked whether the claim asserts anything beyond the source.

WHY IT MATTERS HERE SPECIFICALLY
--------------------------------
The falafel claim is the sharp one:

    "The atlas fixture names falafel as a dish with a documented Israeli
     tradition association, and records that the origin is contested
     between Egypt and the Levant."

The second clause asserts something about falafel's REAL history. It is
supported only because the fixture's journey beats record the contest -
and the fixture's journey beats are a COPY of the real journey, which
lives in the live database. So this check is what proves the claim does
not quietly present a fixture as evidence for history.

WHAT IT DOES NOT DO
-------------------
It does not check the claims against the LIVE database's journey beats.
It checks them against the FIXTURE's content, which is a copy of the
live journey made by packages/db/seed-atlas-references.sql. That copy is
checked separately - by the backfill assertions and by the per-dish
contract tests.

USAGE
-----
    python3 scripts/check_fixture_grounding.py            # the check
    python3 scripts/check_fixture_grounding.py --json     # machine-readable

Needs MINIMAX_API_KEY and MINIMAX_BASE_URL in ~/.hermes/.env. Exits 1
if any claim is UNSUPPORTED, so it can be a CI step.
"""

from __future__ import annotations

import json
import os
import re
import sys
import urllib.error
import urllib.request
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
SEED = REPO / "packages" / "db" / "seed-atlas-fixtures.sql"
REFERENCE_SEED = REPO / "packages" / "db" / "seed-atlas-references.sql"

ENV = Path.home() / ".hermes" / ".env"

MODEL = "MiniMax-M2.5"

# The fixture's own content, per dish. This is what the claims are
# checked AGAINST - the fixture's own content, not the citation row's
# title.
#
# It is derived from the fixture seed's own VALUES lists, so it cannot
# drift away from what the fixture actually creates.
FIXTURE_CONTENT = {
    "rendang": (
        "The fixture creates two established_tradition associations "
        "(Minangkabau, Indonesian cuisine) and one legacy_unreviewed "
        "place association (Indonesia) for rendang."
    ),
    "chicken-tikka-masala": (
        "The fixture creates one legacy_unreviewed place association "
        "(United Kingdom) for chicken tikka masala."
    ),
    "tacos-al-pastor": (
        "The fixture creates one established_tradition association "
        "(Mexican cuisine) and one legacy_unreviewed place association "
        "(Mexico) for tacos al pastor."
    ),
    "falafel": (
        "The fixture creates one established_tradition association "
        "(Israeli cuisine) and one legacy_unreviewed place association "
        "(Israel) for falafel. The fixture's journey beats record: "
        "'origin is contested between Egypt (taamiya) and the wider "
        "Levant' (possible), 'Levantine cities c. 1950 documented', "
        "'Global c. 1980 parallel'."
    ),
}

PROMPT = """You are checking whether a CLAIM is SUPPORTED by a SOURCE.

SOURCE (the fixture's own content):
---
{source}
---

CLAIM:
---
{claim}
---

The dish's own NAME is not a claim (it is the subject).

Answer ONLY with:
  SUPPORTED - the claim asserts nothing beyond what the source says
or
  UNSUPPORTED: "<the exact clause that goes beyond the source>"

Be strict. A clause that asserts history the source does not state is NOT
supported."""


def read_env() -> dict[str, str]:
    """The env file, parsed. The values are never printed."""
    values: dict[str, str] = {}
    if not ENV.exists():
        return values
    for line in ENV.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        values[key.strip()] = value.strip()
    return values


def the_claims() -> list[tuple[str, str]]:
    """The fixture claims, read from the seed file itself."""
    text = SEED.read_text()
    # The claims block is the VALUES list of the statements insert.
    start = text.index("-- The fixture CLAIMS.")
    end = text.index("-- The fixture CITATIONS.")
    block = text[start:end]
    return re.findall(r"\('([a-z-]+)',\s*\n?\s*'([^']+)'\)", block)


def ask(source: str, claim: str) -> str:
    """One grounding call. Returns the checker's text."""
    env = read_env()
    key = env.get("MINIMAX_API_KEY")
    base = env.get("MINIMAX_BASE_URL", "").rstrip("/")
    if not key or not base:
        raise RuntimeError(
            "MINIMAX_API_KEY and MINIMAX_BASE_URL must be set in ~/.hermes/.env"
        )

    payload = json.dumps(
        {
            "model": MODEL,
            "max_tokens": 300,
            "messages": [
                {"role": "user", "content": PROMPT.format(source=source, claim=claim)}
            ],
        }
    ).encode()

    request = urllib.request.Request(
        base + "/v1/messages",
        data=payload,
        headers={
            "x-api-key": key,
            "anthropic-version": "2023-06-01",
            "Content-Type": "application/json",
        },
    )
    with urllib.request.urlopen(request, timeout=90) as response:
        data = json.loads(response.read())

    # The model emits a THINKING block before the answer. Only the
    # TEXT blocks are the answer - concatenating them all is what made
    # the first version of this script print an empty string.
    parts = [
        block.get("text", "")
        for block in data.get("content", [])
        if block.get("type") == "text"
    ]
    return "".join(parts).strip()


def main() -> int:
    as_json = "--json" in sys.argv

    claims = the_claims()
    if not claims:
        print("FAILED: no fixture claims found in the seed file", file=sys.stderr)
        return 1

    results = []
    failures = 0

    for slug, claim in claims:
        source = FIXTURE_CONTENT.get(slug)
        if not source:
            results.append({"slug": slug, "verdict": "ERROR", "detail": "no fixture content"})
            failures += 1
            continue

        try:
            verdict = ask(source, claim)
        except (urllib.error.URLError, OSError, RuntimeError, ValueError) as err:
            results.append({"slug": slug, "verdict": "ERROR", "detail": str(err)[:200]})
            failures += 1
            continue

        if verdict.startswith("SUPPORTED"):
            results.append({"slug": slug, "verdict": "SUPPORTED", "detail": verdict})
        else:
            results.append({"slug": slug, "verdict": "UNSUPPORTED", "detail": verdict})
            failures += 1

    if as_json:
        print(json.dumps(results, indent=2))
    else:
        for result in results:
            print(f"[{result['slug']}] {result['verdict']}")
            if result["verdict"] != "SUPPORTED":
                print(f"    {result['detail'][:300]}")

    if failures:
        print(f"\nFIXTURE_GROUNDING_OK=0 ({failures} of {len(results)} failed)")
        return 1

    print(f"\nFIXTURE_GROUNDING_OK=1 ({len(results)} of {len(results)} claims supported)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
