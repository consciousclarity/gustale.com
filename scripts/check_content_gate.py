#!/usr/bin/env python3
"""The Atlas content gate: lint every published description against the house rules.

WHAT THIS IS
------------

ATLAS_STYLE.md states three rules that a published description must obey:

  1. The BANNED WORDS. Never: exotic, ethnic, iconic, beloved,
     quintessential, world-famous, most famous, since time immemorial,
     for centuries, for millennia, age-old, legend has it, it is said.

  2. The ORIGIN-WORD RULE. "Origin words (originated, invented,
     birthplace, first made, created by) appear only in a sentence
     anchored to an `originated_in`, `originated_at` or `created_by`
     statement. Otherwise write 'is associated with'."

  3. The LABEL-VERSUS-WORDING RULE. "Wording follows the evidence.
     The sentence carries the same strength as the label the reader
     will see next to it." A status word that asserts a DISH'S STATUS
     -- "the national dish of Jordan", "a traditional X" -- is a
     claim, and ATLAS_STYLE allows it only with attribution to a cited
     source. Use these only with attribution: traditional, authentic,
     original, homemade, national dish, the oldest, ancient.

This script checks all three, reports a count and a list, and FAILS on
violations that are not in the baseline.

WHY A BASELINE
--------------

The site has 1474 published dishes and they were written before this
gate existed. Failing CI on all of them would mean the gate is red
from its first run and stays red, and a gate that is always red is a
gate nobody reads. So the gate compares against a BASELINE FILE: the
known violations are listed there, and only NEW ones fail.

That is a deliberate, and honest, arrangement. It is not the same as
"fixed": every violation in the baseline is a live defect on the
public site. The baseline is the work list, and the count is reported
on every run so the backlog cannot quietly grow.

HOW IT IS DIFFERENT FROM A PLAGIARISM DETECTOR
----------------------------------------------

Same reasoning as `check_description_similarity.py`: a plagiarism
detector is tuned to find attribution-worthy copying, it flags short
legitimate technical terms, and it cannot tell a description that
mentions the source's phrasing because that IS the dish's name from
one that IS the source's prose. It would produce noise, and noise in a
publication gate is a gate that gets ignored.

USAGE
-----

    # lint a local snapshot of the published descriptions
    python3 scripts/check_content_gate.py --input published.json

    # fetch from the live API and lint
    python3 scripts/check_content_gate.py --fetch

    # report only, never fail (for a nightly count)
    python3 scripts/check_content_gate.py --input published.json --no-fail

    # write the current violation set as the new baseline
    python3 scripts/check_content_gate.py --input published.json --write-baseline

The input file is a JSON array of objects with at least:
    {"slug": str, "shortDescription": str}
and optionally "canonicalName", "status", "contentType".

EXIT CODES
----------

    0  no new violations
    1  new violations found
    2  the input could not be read or is malformed
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import urllib.request
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
BASELINE_PATH = REPO_ROOT / "scripts" / "content_gate_baseline.json"

# ─────────────────────────────────────────────────────────────────────
# THE RULES
# ─────────────────────────────────────────────────────────────────────

# Rule 1 -- the banned words. Never used, with no exceptions.
BANNED_WORDS = [
    "exotic",
    "ethnic",
    "iconic",
    "beloved",
    "quintessential",
    "world-famous",
    "most famous",
    "since time immemorial",
    "for centuries",
    "for millennia",
    "age-old",
    "legend has it",
    "it is said",
]

# Rule 3 -- status words. These assert something ABOUT THE DISH, so
# they are allowed only with an attribution to a cited source.
#
# The pattern list is deliberately narrow. The naive rule "the word
# 'traditional' appears" produces 221 hits, of which the large
# majority are things like "traditionally served with a slice of
# lemon" -- a descriptive adverbial about a serving custom, not a
# claim that the dish is traditional. Flagging those would be noise,
# and noise in a publication gate is a gate that gets ignored.
#
# So the pattern asks: does this word ASSERT THE STATUS? "A traditional
# Indonesian snack" asserts. "Traditionally served" describes.
STATUS_CLAIM_PATTERNS = [
    (r"\b(?:the\s+)?national\s+dish\b", "national dish"),
    (r"\bthe\s+oldest\b", "the oldest"),
    (r"\bancient\b", "ancient"),
    (
        r"\b(?:a|an|the)\s+traditional\s+\w+",
        "traditional (attributive)",
    ),
    (
        r"\btraditional\s+(?:dish|snack|cake|meal|fare|food|recipe|cuisine|dessert"
        r"|breakfast|stew|soup|pie|bread|cheese|drink|beverage|sauce|noodle"
        r"|pastry|biscuit|cookie|candy|sweet|salad|rice|meat|curry)\b",
        "traditional (noun)",
    ),
    (r"\bauthentic\s+\w+", "authentic"),
    (r"\boriginal\s+(?:recipe|dish|version|form)\b", "original"),
    (r"\bhome\s?made\b", "homemade"),
]

# Rule 2 -- origin words. These are only legal when the sentence is
# anchored to an `originated_in` / `originated_at` / `created_by`
# statement. The anchor is checked separately; this list finds them.
ORIGIN_WORD_PATTERNS = [
    (r"\boriginated\b", "originated"),
    (r"\binvented\b", "invented"),
    (r"\bbirthplace\b", "birthplace"),
    (r"\bfirst made\b", "first made"),
    (r"\bcreated by\b", "created by"),
]

# An attribution is language that cites a source for the claim.
ATTRIBUTION_MARKER = re.compile(
    r"(?:"
    r"sources?\s+(?:agree|say|state|report|describe|record|credit)"
    r"|according\s+to"
    r"|(?:is|are|was|were|has\s+been|have\s+been)\s+(?:usually\s+|commonly\s+)?credited"
    r"|attributed\s+to"
    r"|(?:is|are|was|were|has\s+been|have\s+been)\s+(?:generally\s+|widely\s+|commonly\s+)?regarded\s+as"
    r"|(?:is|are|was|were|has\s+been|have\s+been)\s+considered\s+by"
    r"|reported\s+by"
    r"|documented\s+by"
    r"|recorded\s+by"
    r"|described\s+by"
    r"|as\s+described\s+in"
    r"|it\s+is\s+said"
    r"|is\s+said\s+to\s+have"
    r"|scholars?\s+(?:say|state|believe)"
    r"|accounts?\s+(?:say|give|state|trace)"
    r"|per\s+(?:the\s+)?\w+"
    r"|on\s+the\s+authority\s+of"
    r")",
    re.IGNORECASE,
)


def _compile(patterns):
    return [(re.compile(p, re.IGNORECASE), label) for p, label in patterns]


BANNED_RE = [(re.compile(r"\b" + re.escape(w) + r"\b", re.IGNORECASE), w) for w in BANNED_WORDS]
STATUS_RE = _compile(STATUS_CLAIM_PATTERNS)
ORIGIN_RE = _compile(ORIGIN_WORD_PATTERNS)


def check_text(text: str, has_origin_anchor: bool = False) -> list[dict]:
    """Return every violation in one description.

    `has_origin_anchor` says whether this dish has a QUALIFYING
    origin statement -- one with a predicate of `originated_in`,
    `originated_at` or `created_by`, that is documented rather than
    pending, and that carries a value. Only then may an origin word
    appear. See `origin_anchor_qualifies` for what "qualifying" means
    and why a pending statement does not count.
    """
    if not text or not text.strip():
        return []

    out: list[dict] = []

    # Rule 1 -- banned words.
    for rx, word in BANNED_RE:
        m = rx.search(text)
        if m:
            out.append({"rule": "banned-word", "detail": word, "match": m.group(0)})

    # Rule 3 -- label-versus-wording: a status claim needs attribution.
    attributed = bool(ATTRIBUTION_MARKER.search(text))
    for rx, label in STATUS_RE:
        m = rx.search(text)
        if m and not attributed:
            out.append({"rule": "status-word", "detail": label, "match": m.group(0)})

    # Rule 2 -- the origin-word rule. The anchor is a STATEMENT, so
    # the sentence alone cannot satisfy it. Without a qualifying
    # anchor, ATLAS_STYLE says to write "is associated with" instead.
    for rx, label in ORIGIN_RE:
        m = rx.search(text)
        if m and not has_origin_anchor:
            out.append({"rule": "origin-word", "detail": label, "match": m.group(0)})

    return out


# ─────────────────────────────────────────────────────────────────────
# INPUT
# ─────────────────────────────────────────────────────────────────────

API_BASE = os.environ.get("GUSTALE_API_BASE", "https://api.gustale.com")


def fetch_published() -> list[dict]:
    """Fetch every published dish from the live API.

    The list endpoint caps `limit` at 100, so this pages. The response
    is written to a file rather than parsed from a pipe, because a
    large JSON body can arrive with raw control characters inside
    string values -- the API emits a literal newline in some alt
    text -- and it must not be truncated on its way in.
    """
    import tempfile

    dishes: list[dict] = []
    offset = 0
    limit = 100
    with tempfile.TemporaryDirectory() as tmp:
        page = Path(tmp) / "page.json"
        while True:
            url = f"{API_BASE}/api/dishes?limit={limit}&offset={offset}"
            with urllib.request.urlopen(url, timeout=90) as resp:
                raw = resp.read()
            page.write_bytes(raw)
            data = json.loads(page.read_text(errors="replace"), strict=False)
            batch = data.get("dishes", [])
            if not batch:
                break
            dishes.extend(batch)
            offset += limit
            if not data.get("hasMore"):
                break
    return dishes


def load_input(path: str | None, do_fetch: bool) -> list[dict]:
    if do_fetch:
        return fetch_published()
    if not path:
        raise SystemExit("check_content_gate: pass --input FILE or --fetch")
    raw = Path(path).read_text(errors="replace")
    data = json.loads(raw, strict=False)
    if isinstance(data, dict):
        data = data.get("dishes", [])
    return data


# ─────────────────────────────────────────────────────────────────────
# THE ORIGIN ANCHOR
# ─────────────────────────────────────────────────────────────────────

ORIGIN_PREDICATES = ("originated_in", "originated_at", "created_by")

# A statement qualifies as an origin anchor only if it is DOCUMENTED
# and it CARRIES A VALUE.
#
# A pending statement does not qualify. ATLAS_STYLE says an origin
# word may appear "in a sentence anchored to an `originated_in`,
# `originated_at` or `created_by` statement" -- and the point of an
# anchor is that the claim is established. A `research_pending`
# statement with a null value is a PLACEHOLDER for a claim that has
# not been made yet, so anchoring to it asserts what the record does
# not support. That is the same "a place association is never a
# birthplace claim" rule, applied to the evidence rather than the
# wording.
#
# At the time of writing, every statement on the site is
# `research_pending` / `provisional` with a null value, so in practice
# no origin word is currently anchored. The check is written to
# recognise a qualifying one the moment it exists, so the gate does
# not have to be rewritten when the evidence lands.
QUALIFYING_STATEMENT_STATUSES = ("documented", "likely", "verified", "published")


def origin_anchors(db_name: str) -> set[str]:
    """The slugs that have a QUALIFYING origin statement.

    Returns an empty set if the database cannot be read. An empty set
    means "no anchor could be shown", which is the safe reading: it
    reports the origin word rather than waving it through.
    """
    import subprocess

    sql = f"""
    SELECT DISTINCT d.slug
    FROM statements s
    JOIN dishes d ON d.id = s.subject_id
    JOIN predicates p ON p.id = s.predicate_id
    WHERE p.slug IN ({','.join(repr(x) for x in ORIGIN_PREDICATES)})
      AND s.status::text IN ({','.join(repr(x) for x in QUALIFYING_STATEMENT_STATUSES)})
      AND s.value_literal IS NOT NULL
      AND s.value_literal <> ''
    """
    try:
        out = subprocess.run(
            [
                "docker", "exec", "gustale-test-postgres",
                "psql", "-U", "postgres", "-d", db_name, "-tAc", sql,
            ],
            capture_output=True,
            text=True,
            timeout=120,
        )
    except Exception:  # noqa: BLE001
        return set()
    if out.returncode != 0:
        return set()
    return {line.strip() for line in out.stdout.splitlines() if line.strip()}


def statement_census(db_name: str) -> dict:
    """How many statements qualify, and how many do not.

    This is reported alongside the gate so the number of origin-word
    violations can be read against the evidence rather than in
    isolation.
    """
    import subprocess

    sql = """
    SELECT s.status::text, s.evidence_status,
           count(*) FILTER (WHERE s.value_literal IS NOT NULL AND s.value_literal <> '') AS with_value,
           count(*) AS total
    FROM statements s GROUP BY 1,2
    """
    try:
        out = subprocess.run(
            [
                "docker", "exec", "gustale-test-postgres",
                "psql", "-U", "postgres", "-d", db_name, "-tAc", sql,
            ],
            capture_output=True,
            text=True,
            timeout=120,
        )
    except Exception:  # noqa: BLE001
        return {}
    if out.returncode != 0:
        return {}
    census = {}
    for line in out.stdout.splitlines():
        parts = [p.strip() for p in line.split("|")]
        if len(parts) == 4:
            census[f"{parts[0]}/{parts[1]}"] = {"with_value": int(parts[2]), "total": int(parts[3])}
    return census


# ─────────────────────────────────────────────────────────────────────
# BASELINE
# ─────────────────────────────────────────────────────────────────────


def baseline_keys() -> set[tuple[str, str, str]]:
    """The known violations, as (slug, rule, detail) triples."""
    if not BASELINE_PATH.exists():
        return set()
    data = json.loads(BASELINE_PATH.read_text())
    return {(v["slug"], v["rule"], v["detail"]) for v in data.get("violations", [])}


def load_baseline_records() -> list[dict]:
    if not BASELINE_PATH.exists():
        return []
    data = json.loads(BASELINE_PATH.read_text())
    return data.get("violations", [])


# ─────────────────────────────────────────────────────────────────────
# MAIN
# ─────────────────────────────────────────────────────────────────────


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--input", help="a JSON file of published dishes")
    ap.add_argument("--fetch", action="store_true", help="fetch from the live API")
    ap.add_argument(
        "--statements-db",
        help=(
            "a Postgres database to read the origin statements from, e.g. "
            "gustale_live_shape_0059. Without it, every origin word is "
            "reported as unanchored, because no anchor can be shown."
        ),
    )
    ap.add_argument("--no-fail", action="store_true", help="report only; never exit 1")
    ap.add_argument(
        "--write-baseline",
        action="store_true",
        help="write the current violation set as the baseline",
    )
    ap.add_argument("--json", action="store_true", help="emit the report as JSON")
    args = ap.parse_args()

    try:
        dishes = load_input(args.input, args.fetch)
    except Exception as exc:  # noqa: BLE001
        print(f"check_content_gate: could not read the input: {exc}", file=sys.stderr)
        return 2

    violations: list[dict] = []
    anchors = origin_anchors(args.statements_db) if args.statements_db else set()
    census = statement_census(args.statements_db) if args.statements_db else {}

    for dish in dishes:
        slug = dish.get("slug") or "<no-slug>"
        text = dish.get("shortDescription") or ""
        for v in check_text(text, has_origin_anchor=slug in anchors):
            violations.append(
                {
                    "slug": slug,
                    "name": dish.get("canonicalName") or "",
                    "rule": v["rule"],
                    "detail": v["detail"],
                    "match": v["match"],
                    "text": text,
                }
            )

    violations.sort(key=lambda v: (v["rule"], v["slug"]))

    if args.write_baseline:
        payload = {
            "generated": "check_content_gate.py --write-baseline",
            "dishes_checked": len(dishes),
            "violations": [
                {k: v[k] for k in ("slug", "name", "rule", "detail", "match", "text")}
                for v in violations
            ],
        }
        BASELINE_PATH.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n")
        print(f"wrote the baseline: {len(violations)} known violations over {len(dishes)} dishes")
        return 0

    known = baseline_keys()
    new = [v for v in violations if (v["slug"], v["rule"], v["detail"]) not in known]
    # A baseline entry whose dish has been fixed is reported, so the
    # baseline can be pruned. A violation that DISAPPEARS is progress.
    still_known = [v for v in violations if (v["slug"], v["rule"], v["detail"]) in known]
    resolved = known - {(v["slug"], v["rule"], v["detail"]) for v in still_known}

    by_rule: dict[str, int] = {}
    for v in violations:
        by_rule[v["rule"]] = by_rule.get(v["rule"], 0) + 1

    if args.json:
        print(
            json.dumps(
                {
                    "dishes_checked": len(dishes),
                    "total_violations": len(violations),
                    "known": len(still_known),
                    "new": len(new),
                    "resolved_since_baseline": len(resolved),
                    "by_rule": by_rule,
                    "new_violations": new,
                },
                indent=2,
                ensure_ascii=False,
            )
        )
    else:
        print(f"Content gate: {len(dishes)} published dishes checked")
        print(f"  violations in total : {len(violations)}")
        for rule, n in sorted(by_rule.items()):
            print(f"      {rule:14s} {n}")
        print(f"  known (in baseline) : {len(still_known)}")
        print(f"  NEW (not baselined) : {len(new)}")
        if census:
            print()
            print("  the evidence behind the origin-word rule:")
            for k, v in sorted(census.items()):
                print(f"      {k:32s} {v['with_value']}/{v['total']} carry a value")
            print(f"      qualifying origin anchors: {len(anchors)}")
        if resolved:
            print(f"  resolved since baseline: {len(resolved)}")
        if new:
            print()
            print("NEW violations:")
            for v in new:
                print(f"  [{v['rule']}/{v['detail']}] {v['slug']}: {v['match']!r}")
                print(f"      {v['text'][:160]}")
        elif not args.json:
            print()
            print("No new violations.")

    if new and not args.no_fail:
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
