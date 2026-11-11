#!/usr/bin/env python3
"""count-sourcing-rows.py -- COUNT the rows in a sourcing pilot document,
and compare them with what the document CLAIMS.

WHY THIS EXISTS
----------------
A pilot document's row count is its headline number, and a hand-written
count drifts. Batch 2 claimed 39 rows when the tables held 40: the
substitute table had gained a row and the count had not been updated.
The count was the kind of thing a reader trusts, so it has to be
MEASURED.

WHAT IT COUNTS
--------------
  country rows      a row whose first cell is **XX** -- one per
                    ingredient x country pair.
  form rows         a row whose first cell is `form_name` -- one per
                    product offered for a form.
  substitute rows   a row in the substitutes table, also first cell
                    **XX**.

The rows are counted from the tables themselves, by the SHAPE of the
first cell, so a new row is counted the moment it is written and a
deleted row stops being counted.

THE BY-COUNTRY SPLIT
--------------------
A form row does not name its country in the first cell; the country is
in its source link's domain. The split is therefore DERIVED from the
source, and a row whose source names no known retailer is reported as
`?` rather than being silently dropped.

USAGE
-----
    python3 scripts/count-sourcing-rows.py docs/SOURCING-PILOT-BATCH-2.md

Exit 0 when the document's claimed total matches the measured one.
Exit 1 when it does not -- so this can be a check, not a report.

    --no-claim-check   measure and print, but do not fail on a mismatch
"""
from __future__ import annotations

import argparse
import re
import sys

# Which source domain belongs to which country.
SOURCE_DOMAIN = {
    "asiatischer-lebensmittelladen.de": "DE",
    "migros.ch": "CH",
    "tokopedia.com": "ID",
    "worldmarket.com": "US",
}

# A country row's first cell is a two-letter code, bold or not.
COUNTRY_ROW = re.compile(r"^\|\s*\**([A-Z]{2})\**\s*\|")
# A form row's first cell names a form. It may be backticked
# (`paste_or_concentrate`), plain (`fresh`), or carry a gloss
# (`extract (juice)`).
FORM_ROW = re.compile(r"^\|\s*\**`?[a-z_]+`?(?:\s*\([^)]*\))?\**\s*\|")
# A header cell, which must never be counted as a row.
HEADER_CELLS = (
    "country", "form", "substitute", "ingredient", "product", "seller",
)


def sections(text: str):
    """The document split into its '## N.' sections, by heading."""
    out: dict[str, list[str]] = {}
    current = None
    for line in text.split("\n"):
        m = re.match(r"^##\s+(\d+)\.\s*(.*)$", line)
        if m:
            current = f"{m.group(1)}. {m.group(2)}"
            out[current] = []
            continue
        if current is not None:
            out[current].append(line)
    return out


def count(text: str):
    """The measured row counts."""
    secs = sections(text)
    country = form = substitute = 0
    by_country: dict[str, int] = {}

    for title, lines in secs.items():
        in_substitutes = "substitute" in title.lower()
        for line in lines:
            if re.match(r"^\|\s*-{2,}", line):
                continue
            cells = [c.strip() for c in line.strip().strip("|").split("|")]
            if cells and cells[0].lower().strip("*") in HEADER_CELLS:
                continue
            cm = COUNTRY_ROW.match(line)
            if cm:
                code = cm.group(1)
                if in_substitutes:
                    substitute += 1
                else:
                    country += 1
                by_country[code] = by_country.get(code, 0) + 1
                continue
            if FORM_ROW.match(line):
                # In the substitutes section, a row's first cell is a
                # SUBSTITUTE name (`coconut-cream`), not a form. It
                # belongs to the substitute count, not the form count.
                #
                # And a form row lives in THE ROWS section only: the
                # import section has registry tables whose first cell
                # happens to be a lowercase word, and they are not
                # sourcing rows at all.
                if in_substitutes or not title.startswith("1."):
                    continue
                form += 1
                domain = None
                for dom, code in SOURCE_DOMAIN.items():
                    if dom in line:
                        domain = code
                        break
                key = domain or "?"
                by_country[key] = by_country.get(key, 0) + 1
    return country, form, substitute, by_country


def claimed_total(text: str):
    """The total the document claims, and the breakdown it claims."""
    total = None
    parts: dict[str, int] = {}
    for line in text.split("\n"):
        m = re.match(r"^\|\s*(?:the rows in this document|table rows in this document)\s*\|\s*\*\*(\d+)\*\*", line)
        if m:
            total = int(m.group(1))
        m = re.match(r"^\|\s*—\s*(\w[\w ]*?)rows\s*\|\s*(\d+)\s*\|", line)
        if m:
            parts[m.group(1).strip()] = int(m.group(2))
    return total, parts


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("document")
    ap.add_argument("--no-claim-check", action="store_true",
                    help="measure and print, but do not fail on a mismatch")
    args = ap.parse_args(argv)

    text = open(args.document, encoding="utf-8").read()
    country, form, substitute, by_country = count(text)
    total = country + form + substitute
    claimed, parts = claimed_total(text)

    print(f"  the measured rows: {total}")
    print(f"    the country rows:    {country}")
    print(f"    the form rows:       {form}")
    print(f"    the substitute rows: {substitute}")
    print(f"    by country: {dict(sorted(by_country.items()))}")

    if claimed is None:
        print("  NOTE: the document claims no total row; nothing to compare.")
        return 0

    print(f"  the document claims: {claimed}")
    problems = []
    if claimed != total:
        problems.append(f"the claimed total is {claimed}, but the tables hold {total}")
    for key, value in parts.items():
        measured = {"country rows": country, "form rows": form,
                    "substitute rows": substitute}.get(key)
        if measured is not None and value != measured:
            problems.append(f"the claimed {key} is {value}, but the tables hold {measured}")

    if problems:
        for p in problems:
            print(f"  FAILED: {p}")
        return 1
    print("  OK: the document's counts match its tables.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
