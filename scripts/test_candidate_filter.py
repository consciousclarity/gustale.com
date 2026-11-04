#!/usr/bin/env python3
"""The candidate filter's own tests.

The filter decides which catalogue hits become candidates. It is a
cheap first filter, not a judgement — but it still has to be right
about the obvious cases, because everything downstream is a human's
time.

THE CASE THAT MATTERS
---------------------
The first real run matched the dish "10 Won Bread" to the work "Why
Labor Won: Tactical Innovation, Failed Repression, and the Origins of
the Modern Economy". The dish's name tokenises to {"won", "bread"} and
"won" is a perfectly good English word. A single common word is not
evidence that a work is about the dish.

Usage:
    python3 scripts/test_candidate_filter.py
"""

import importlib.util
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location(
    "fsc", os.path.join(HERE, "find_source_candidates.py")
)
fsc = importlib.util.module_from_spec(spec)
spec.loader.exec_module(fsc)

# (the candidate's title, the dish's name, the predicate, must_pass, why)
CASES = [
    (
        "Baklava ve Kadayıf",
        "Baklava",
        "Originated in",
        True,
        "the dish's own name is in the title",
    ),
    (
        "From Kebabs To Baklava: An Examination Of Food-Related Language",
        "Baklava",
        "Originated in",
        True,
        "the dish's own name is in the title",
    ),
    (
        "Why Labor Won: Tactical Innovation, Failed Repression",
        "10 Won Bread",
        "Originated in",
        False,
        "THE MEASURED FALSE POSITIVE: 'won' is a common word and 'bread' is missing",
    ),
    (
        "Why Labor Won: Tactical Innovation, Failed Repression, and Turning Points in the "
        "Bread and Roses Strike",
        "10 Won Bread",
        "Originated in",
        False,
        "THE HARDER FALSE POSITIVE: BOTH name tokens match ('won' and 'bread'), but the dish's "
        "name is entirely ordinary English, so the title cannot tell us it is about the dish",
    ),
    (
        "BREAD - HOLY FOOD (SLAVS BELIEFS)",
        "10 Won Bread",
        "Originated in",
        False,
        "'bread' alone is not enough; 'won' is missing",
    ),
    (
        "Salad for the solitary and the social",
        "African Salad",
        "Originated in",
        False,
        "'salad' is a common word and 'african' is missing",
    ),
    (
        "African cattle originated in Middle East",
        "African Salad",
        "Originated in",
        False,
        "'african' matches but 'salad' does not",
    ),
    (
        "Characteristics of Instant Baby Porridge With a Pre-Cooked",
        "beans and corn porridge",
        "Originated in",
        False,
        "'porridge' matches but 'beans' and 'corn' are missing — the work is about a "
        "different dish, and the penalty is what catches it",
    ),
    (
        "Mineral concentrations of grain of bread wheat landraces",
        "10 Won Bread",
        "Originated in",
        False,
        "a wheat-paper is not about the dish",
    ),
    (
        "Baklava",
        "baklava",
        "Originated in",
        True,
        "an exact match on a single-token name",
    ),
    (
        "Sodium reduction technologies applied to bread products",
        "10 Won Bread",
        "Originated in",
        False,
        "'bread' alone is not enough",
    ),
    # ── THE FALSE-NEGATIVE GUARD ──
    #
    # A dish whose name is a DISTINCTIVE culinary word must still match
    # on its name. These are the acceptance cases and the ones a reader
    # would be upset to lose, so they get their own cases: putting
    # "hummus" or "falafel" in the common-word list would silently
    # stop the pipeline from ever proposing a source for them.
    (
        "Hummus: A Global History",
        "hummus",
        "Originated in",
        True,
        "a distinctive culinary name must still match",
    ),
    (
        "Falafel: A History of the Middle Eastern Dish",
        "falafel",
        "Originated in",
        True,
        "a distinctive culinary name must still match",
    ),
    (
        "Sushi: The Cuisine of Japan",
        "sushi",
        "Originated in",
        True,
        "a distinctive culinary name must still match",
    ),
    (
        "Kebab: The Global History of the Grilled Meat",
        "kebab",
        "Originated in",
        True,
        "a distinctive culinary name must still match",
    ),
]

# The threshold the script runs with.
THRESHOLD = 0.34


def main() -> int:
    failures = []
    for title, dish, predicate, must_pass, why in CASES:
        score = fsc.term_overlap(title, dish, predicate)
        passes = score >= THRESHOLD
        ok = passes == must_pass
        status = "ok  " if ok else "FAIL"
        print(f"  {status}  score={score:.3f}  {dish!r} <- {title[:44]!r}")
        if not ok:
            print(f"          expected {'pass' if must_pass else 'reject'} — {why}")
            failures.append((title, dish, why))

    print()
    if failures:
        print(f"FAILED: {len(failures)} of {len(CASES)} cases")
        return 1
    print(f"the candidate filter: {len(CASES)}/{len(CASES)} cases pass")
    return 0


if __name__ == "__main__":
    sys.exit(main())
