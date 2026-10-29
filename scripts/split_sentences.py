#!/usr/bin/env python3
"""Split a description into sentences — ADR-002 Q9's splitter.

THE RULE, stated as a rule rather than a regex (ADR-002 Q9):

  A sentence ends at a terminator (`.` `!` `?`) that is
    (a) not inside a quoted span,
    (b) not between digits,
    (c) not part of an abbreviation or initial, and
    (d) not part of an ellipsis;
  and that is followed by whitespace.

ONE IMPLEMENTATION serves both the population run and the boundary
check, so the check cannot pass against a different splitter than the
one that wrote the rows.

The boundary fixture set covers the five cases the live catalog
happens not to contain today:

  | case          | example                                    | why                                              |
  |---------------|--------------------------------------------|--------------------------------------------------|
  | quotes        | `"Babi" means pig and "panggang" means ...` | a terminator inside a quoted span must not end a sentence |
  | decimals      | `Simmered for 1.5 hours at 90 C`             | `.` between digits is not a sentence boundary     |
  | abbreviations | `St. Louis`, `Inc.`, `Ltd.`, `Dr.`, `vs.`   | a terminator after an abbreviation is not a boundary |
  | initials      | `J. R. R. Tolkien`, `A. USDA grade`         | a single capital + `.` is not a boundary         |
  | ellipses      | `The dish is... contested.`                  | `...` is not a terminator                        |

THE ESCAPE HATCH: a description that cannot be split reliably can be
stored as ONE sentence. `split_sentences` returns one sentence for
such a text, and the caller records it as a single unsplit sentence.
That is always correct — a one-sentence description is a valid
description.

Usage:
    python3 scripts/split_sentences.py --check       # the fixtures
    python3 scripts/split_sentences.py "Some text."   # ad hoc
"""

import re
import sys

# ── The abbreviations that end in a period but do not end a sentence ──
#
# The list is deliberately short and conservative: an abbreviation that
# IS the end of a sentence ("...the recipe was by Dr.") is rare, and
# the cost of treating it as one is a slightly long sentence, while
# the cost of treating a real boundary as an abbreviation is two
# sentences merged into one.
ABBREVIATIONS = {
    "st", "mr", "mrs", "ms", "dr", "prof", "sr", "jr",
    "inc", "ltd", "co", "corp", "dept", "univ",
    "vs", "etc", "e.g", "i.e", "approx", "no", "vol",
    "fig", "al", "cf", "ca", "circa",
}

# An INITIAL: a single capital letter followed by a period.
#
# "J. R. R. Tolkien" and "A. USDA grade" are initials, not sentence
# ends. The check is on the CONTEXT, not on a regex over the text —
# see `_is_initial`.
INITIAL_CAPITAL = re.compile(r"[A-Z]")

# An ellipsis: two or more periods in a row.
ELLIPSIS = re.compile(r"\.{2,}")

# A decimal: a period between two digits.
DECIMAL = re.compile(r"\d\.\d")

# A QUOTED SPAN. Double quotes, single quotes and the typographic
# variants. The span may not contain an escaped quote.
QUOTED = re.compile(r"[\"“”'‘’](?:[^\"“”'‘’\\]|\\.)*[\"“”'‘’]")


def _quoted_spans(text: str) -> list[tuple[int, int]]:
    """The character ranges covered by quoted spans."""
    return [(m.start(), m.end()) for m in QUOTED.finditer(text)]


def _in_spans(pos: int, spans: list[tuple[int, int]]) -> bool:
    return any(start <= pos < end for start, end in spans)


def _is_ellipsis(text: str, pos: int) -> bool:
    """True if the period at `pos` is part of a run of two or more."""
    m = ELLIPSIS.search(text, max(0, pos - 2), pos + 3)
    return m is not None


def _is_initial(text: str, pos: int) -> bool:
    """True if the period at `pos` follows a single capital letter.

    A single capital + period is an initial ("J. R. R. Tolkien") or an
    initialism ("A. USDA grade"), not a sentence end.

    The capital must be the WHOLE word: "90 C." is a unit, and that is
    a sentence end, so "C" followed by a period and then a space or
    the end of the text does NOT count as an initial when the capital
    is preceded by a digit or a lowercase letter — that makes it a
    unit or a surname, not an initial.
    """
    if pos < 1:
        return False
    capital = text[pos - 1]
    if not INITIAL_CAPITAL.match(capital):
        return False

    # The character BEFORE the capital decides whether this is an
    # initial or the tail of a word:
    #   "J. R. R. Tolkien" — a space before each initial -> initial
    #   "A. USDA grade"    — a space before the capital  -> initial
    #   "90 C."             — a digit before the capital  -> a unit
    #   "U.S.A."            — a letter before the capital -> a word
    before = text[pos - 2] if pos >= 2 else ""
    if before and (before.isdigit() or before.islower()):
        return False
    if before and before.isalpha() and before.isupper():
        return False

    # A UNIT is also a single capital preceded by a space: "90 C.",
    # "12 g.", "5 L.". The tell is the NUMBER before it, with only a
    # space between. An initial has no number in front of it.
    if before == " " and pos >= 3:
        # Walk back over spaces, then look for a digit.
        j = pos - 2
        while j >= 0 and text[j] == " ":
            j -= 1
        if j >= 0 and text[j].isdigit():
            return False

    # The character AFTER the period decides too: an initial is
    # followed by whitespace or a closing bracket, never by a letter
    # that continues a word.
    after = text[pos + 1] if pos + 1 < len(text) else ""
    if after and after.isalpha():
        return False

    return True


def _is_abbreviation(text: str, pos: int) -> bool:
    """True if the period at `pos` ends a known abbreviation."""
    # Walk back over the word before the period.
    start = pos
    while start > 0 and (text[start - 1].isalpha() or text[start - 1] == "."):
        start -= 1
    word = text[start:pos].lower().rstrip(".")
    return word in ABBREVIATIONS


def split_sentences(text: str) -> list[str]:
    """Split `text` into sentences, per ADR-002 Q9's rule.

    The whitespace that follows a terminator is consumed with the
    sentence it ends, so the concatenation of the result equals the
    input exactly. That equality is the consistency gate the ADR
    requires.
    """
    if not text or not text.strip():
        return []

    spans = _quoted_spans(text)
    sentences: list[str] = []
    start = 0
    i = 0
    n = len(text)

    while i < n:
        ch = text[i]
        if ch not in ".!?":
            i += 1
            continue

        # (a) not inside a quoted span
        if _in_spans(i, spans):
            i += 1
            continue

        # (d) not part of an ellipsis
        if ch == "." and _is_ellipsis(text, i):
            i += 1
            continue

        # (b) not between digits
        if ch == "." and DECIMAL.match(text, i - 1):
            i += 1
            continue

        # (c) not part of an abbreviation or initial
        if ch == "." and (_is_abbreviation(text, i) or _is_initial(text, i)):
            i += 1
            continue

        # The terminator must be followed by whitespace (or the end of
        # the text).
        j = i + 1
        if j < n and not text[j].isspace():
            i += 1
            continue

        # Consume the whitespace that follows.
        while j < n and text[j].isspace():
            j += 1

        sentence = text[start:j]
        if sentence.strip():
            sentences.append(sentence)
        start = j
        i = j

    if start < n:
        tail = text[start:]
        if tail.strip():
            sentences.append(tail)

    return sentences


# ── The boundary fixture set ────────────────────────────────────────────
#
# Each fixture is an (input, expected_splits) pair. The expected
# splits are the sentence TEXTS with their trailing whitespace
# stripped, so a fixture states the boundaries and not the spacing.
#
# The fixture set proves the rule is implemented correctly on the cases
# it names. It cannot prove the rule is RIGHT — that is what the human
# review of the pilot sentences is for.
FIXTURES: list[tuple[str, list[str]]] = [
    # The plain case.
    (
        "Rendang is a dry braise. It is served with rice.",
        ["Rendang is a dry braise.", "It is served with rice."],
    ),
    # QUOTES: a terminator inside a quoted span must not end a
    # sentence.
    (
        '"Babi" means pig and "panggang" means grilled. The dish is grilled.',
        [
            '"Babi" means pig and "panggang" means grilled.',
            "The dish is grilled.",
        ],
    ),
    # A quoted span that ENDS the sentence.
    (
        'The name means "mixed rice". It is a mixed plate.',
        ['The name means "mixed rice".', "It is a mixed plate."],
    ),
    # DECIMALS: a period between digits is not a boundary.
    (
        "Simmered for 1.5 hours at 90 C. Then it is served.",
        ["Simmered for 1.5 hours at 90 C.", "Then it is served."],
    ),
    # ABBREVIATIONS.
    (
        "From St. Louis, it is served with rice. Always.",
        ["From St. Louis, it is served with rice.", "Always."],
    ),
    (
        "By Dr. Yeo, as Inc. records. Indeed.",
        ["By Dr. Yeo, as Inc. records.", "Indeed."],
    ),
    (
        "Salt vs. pepper. Both matter.",
        ["Salt vs. pepper.", "Both matter."],
    ),
    # INITIALS.
    (
        "Named by J. R. R. Tolkien. It is served.",
        ["Named by J. R. R. Tolkien.", "It is served."],
    ),
    (
        "Grade A. USDA approved. Served hot.",
        ["Grade A. USDA approved.", "Served hot."],
    ),
    # ELLIPSES: "..." is not a terminator.
    (
        "The dish is... contested. It is served anyway.",
        ["The dish is... contested.", "It is served anyway."],
    ),
    # A single sentence with no terminator.
    (
        "A description with no full stop",
        ["A description with no full stop"],
    ),
    # A question mark IS a terminator.
    (
        "Is it served hot? Yes.",
        ["Is it served hot?", "Yes."],
    ),
    # An exclamation mark IS a terminator.
    (
        "It is delicious! It is served hot.",
        ["It is delicious!", "It is served hot."],
    ),
]


def check_fixtures() -> int:
    """Run the boundary fixture set. Returns the number of failures."""
    failures = 0
    for text, expected in FIXTURES:
        actual = [s.strip() for s in split_sentences(text)]
        if actual != expected:
            failures += 1
            print(f"FAIL: {text!r}")
            print(f"  expected: {expected}")
            print(f"  actual:   {actual}")
    print(
        f"[split_sentences] {len(FIXTURES) - failures}/{len(FIXTURES)} "
        f"boundary fixtures passed"
    )
    return failures


def main() -> int:
    args = sys.argv[1:]
    if not args or args[0] == "--check":
        return 1 if check_fixtures() else 0
    text = " ".join(args)
    for sentence in split_sentences(text):
        print(repr(sentence))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
