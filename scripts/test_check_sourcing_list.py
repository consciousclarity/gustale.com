#!/usr/bin/env python3
"""test_check_sourcing_list.py -- the mutation harness for the list
checker.

THE POINT
---------
A checker that only ever sees a correct list proves nothing. Each case
below breaks the list in one specific way and asserts the checker
SAYS SO. A case that does not fire is a hole in the checker, and a
hole in the checker is a hole in the list.

THE NEW RULES BEING PROVED
--------------------------
1. The MEANING comparison: a substitute that IS the row's own
   ingredient in a state the forms already claim is the same product
   and must be rejected -- even when the strings differ.
2. The seven-value form vocabulary: a label that is a part, a
   presentation, a variety or a grade is not a form.
3. The import-dependency column must not come back: an import
   dependency is a fact about a COUNTRY.
4. The split cheeses: both halves must be present.
5. The spec's verbatim limits: a paraphrase is a drift.
6. The prohibition: soy sauce must never be offered for fish sauce.
"""
import csv
import io
import os
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HERE)
CSV_PATH = os.path.join(REPO, "docs", "SOURCING-20-INGREDIENTS.csv")
CHECKER = os.path.join(HERE, "check_sourcing_list.py")


def load_rows():
    with open(CSV_PATH, newline="", encoding="utf-8") as fh:
        return list(csv.DictReader(fh))


def write_rows(rows, fields):
    buf = io.StringIO()
    w = csv.DictWriter(buf, fieldnames=fields, quoting=csv.QUOTE_ALL,
                       lineterminator="\n")
    w.writeheader()
    for r in rows:
        w.writerow({f: r.get(f, "") for f in fields})
    return buf.getvalue()


def run_checker(csv_text):
    with tempfile.NamedTemporaryFile("w", suffix=".csv", delete=False,
                                     encoding="utf-8") as fh:
        fh.write(csv_text)
        path = fh.name
    try:
        proc = subprocess.run(
            [sys.executable, CHECKER, path],
            capture_output=True, text=True, timeout=120,
        )
        return proc.stdout + proc.stderr
    finally:
        os.unlink(path)


# Each case: (name, mutate, must_mention)
def case_tamarind_paste_as_substitute(rows):
    """The owner's own example: tamarind's paste and concentrate were
    in BOTH the forms and the substitutes columns."""
    for r in rows:
        if r["slug"] == "tamarind":
            r["substitutes_to_research"] = "tamarind-paste;tamarind-block"
    return rows, "tamarind-paste"


def case_seedless_tamarind_as_substitute(rows):
    """Seedless tamarind IS tamarind -- same ingredient, same state."""
    for r in rows:
        if r["slug"] == "tamarind":
            r["substitutes_to_research"] = "seedless-tamarind"
    return rows, "seedless-tamarind"


def case_a_part_as_a_form(rows):
    """'pod' is a part of tamarind, not a state of it."""
    for r in rows:
        if r["slug"] == "tamarind":
            r["forms_to_research"] = "fresh;pod"
    return rows, "not one of the seven form states"


def case_a_variety_as_a_form(rows):
    """'parmigiano' is a VARIETY, not a state."""
    for r in rows:
        if r["slug"] == "parmigiano-reggiano":
            r["forms_to_research"] = "dried;parmigiano"
    return rows, "not one of the seven form states"


def case_the_import_column_returns(rows):
    """An import dependency is a fact about a COUNTRY."""
    rows[0]["import_dependency"] = "imported"
    return rows, "import_dependency"


def case_a_split_loses_a_half(rows):
    """Splitting 'Parmigiano Reggiano and Pecorino' must keep both."""
    rows[:] = [r for r in rows if r["slug"] != "pecorino"]
    return rows, "pecorino"


def case_the_limits_are_paraphrased(rows):
    """The spec's words are the spec's words."""
    for r in rows:
        if r["slug"] == "gochujang":
            r["substitution_limits_from_the_spec"] = (
                "Gochugaru is a pretty good substitute for gochujang."
            )
    return rows, "not the spec's words"


def case_soy_sauce_is_offered_as_a_substitute(rows):
    """The spec's PROHIBITION: soy sauce must never be a fish-sauce
    substitute."""
    for r in rows:
        if r["slug"] == "fish-sauce":
            r["substitutes_to_research"] = "soy-sauce"
    return rows, "soy-sauce"


def case_local_nashi_returns(rows):
    """'local-nashi' was removed: it is not a state."""
    for r in rows:
        if r["slug"] == "asian-pear":
            r["forms_to_research"] = "fresh;local-nashi"
    return rows, "not one of the seven form states"


def case_the_hint_count_drifts(rows):
    """A hint flipped from yes to no changes the count."""
    for r in rows:
        if r["slug"] == "saffron":
            r["typically_defines_the_dish_hint"] = "no"
    return rows, "hint counts"


CASES = [
    ("tamarind paste is a substitute as well as a form",
     case_tamarind_paste_as_substitute),
    ("seedless tamarind duplicates the fresh form",
     case_seedless_tamarind_as_substitute),
    ("a part is listed as a form",
     case_a_part_as_a_form),
    ("a variety is listed as a form",
     case_a_variety_as_a_form),
    ("the import-dependency column comes back",
     case_the_import_column_returns),
    ("the cheese split loses a half",
     case_a_split_loses_a_half),
    ("the spec's limits are paraphrased",
     case_the_limits_are_paraphrased),
    ("soy sauce is offered as a fish-sauce substitute",
     case_soy_sauce_is_offered_as_a_substitute),
    ("'local-nashi' returns as a form",
     case_local_nashi_returns),
    ("the hint count drifts",
     case_the_hint_count_drifts),
]


def main():
    base_rows = load_rows()
    fields = list(base_rows[0].keys())

    # The baseline must PASS, or the mutation results prove nothing.
    out = run_checker(write_rows(base_rows, fields))
    if "OK:" not in out:
        print("  FAILED: the BASELINE does not pass -- the mutations "
              "would prove nothing")
        print(out)
        return 1
    print("  the baseline passes")

    failures = 0
    for name, mutate in CASES:
        rows = [dict(r) for r in base_rows]
        rows, must = mutate(rows)
        # The column set can change (a mutation may add one), so the
        # writer takes the union.
        f2 = list(fields)
        for r in rows:
            for k in r:
                if k not in f2:
                    f2.append(k)
        out = run_checker(write_rows(rows, f2))
        if must.lower() in out.lower():
            print(f"  caught: {name}")
        else:
            failures += 1
            print(f"  MISSED: {name} -- the checker did not say "
                  f"'{must}'")
            for line in out.splitlines():
                if "FAILED" in line or "- '" in line:
                    print(f"      {line.strip()[:150]}")

    print(f"  {len(CASES) - failures}/{len(CASES)} mutations caught")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
