#!/usr/bin/env python3
"""
Regression tests for scripts/hermes/validate-pilot-spec.py (gate V1).

The validator is the gate that stops the pilot from running against an
invalid spec. A validator that silently passes bad specs is worse than
no validator, so its ability to REJECT bad specs is tested here, not
just its ability to accept the good one.

Run:  python3 scripts/hermes/test-validate-pilot-spec.py
Exit 0 = all tests pass. Exit 1 = a test failed.
"""
import pathlib
import subprocess
import sys

REPO = pathlib.Path(__file__).resolve().parents[2]
SPEC = REPO / ".hermes" / "REPORTS" / "GUS-014-pilot-spec.md"
VALIDATOR = REPO / "scripts" / "hermes" / "validate-pilot-spec.py"

ORIGINAL = SPEC.read_text()


def run_spec(text: str) -> tuple[int, str]:
    SPEC.write_text(text)
    r = subprocess.run(
        [sys.executable, str(VALIDATOR)],
        cwd=REPO, capture_output=True, text=True,
    )
    return r.returncode, r.stdout


def restore() -> None:
    SPEC.write_text(ORIGINAL)


def check(name: str, ok: bool, detail: str = "") -> bool:
    print(f"  {'PASS' if ok else 'FAIL'}  {name}" + (f"  ({detail})" if detail else ""))
    return ok


def main() -> int:
    failures = 0

    # --- positive: the real spec must pass ---
    print("Positive")
    rc, out = run_spec(ORIGINAL)
    failures += not check("real spec validates clean", rc == 0, f"exit {rc}")
    failures += not check("21 dimension cells checked", "21 dimension cells" in out)

    # --- negative: each defect must be rejected ---
    print("\nNegative — each defect must be rejected")

    cases = [
        ("unknown vocabulary value",
         "| `ingredient_category` | multi | `beef`, `coconut` |",
         "| `ingredient_category` | multi | `beef`, `cocunut` |",
         "NOT in controlled vocabulary"),

        ("parenthetical modifier (D3e)",
         "| `dish_technique` | multi | `braising` |",
         "| `dish_technique` | multi | `braising (dry)` |",
         "parenthetical"),

        ("single-valued dimension given two values",
         "| `dish_family` | single | `curry` | §1.1 |",
         "| `dish_family` | single | `curry`, `taco` | §1.1 |",
         "single-valued dimension has multiple values"),

        ("'unset' mixed into a value list",
         "| `dish_context` | multi | `home`, `festival/ceremonial`, `restaurant` |",
         "| `dish_context` | multi | `home`, `unset` |",
         "must be the whole cell"),

        ("duplicate value in a cell",
         "| `dish_context` | multi | `home`, `festival/ceremonial`, `restaurant` |",
         "| `dish_context` | multi | `home`, `home` |",
         "duplicate values"),

        ("dimension cell not backticked / emptied",
         "| `dish_tradition` | multi | `minangkabau` | §1.6 |",
         "| `dish_tradition` | multi |  | §1.6 |",
         "not backticked"),

        ("parent category stored instead of leaf (leaf-only rule)",
         "| `ingredient_category` | multi | `beef`, `coconut` |",
         "| `ingredient_category` | multi | `beef`, `red-meat`, `coconut` |",
         "PARENT value"),

        ("another parent category (white-meat)",
         "| `ingredient_category` | multi | `chicken`, `dairy` |",
         "| `ingredient_category` | multi | `chicken`, `white-meat`, `dairy` |",
         "PARENT value"),
    ]

    for name, old, new, needle in cases:
        assert old in ORIGINAL, f"test fixture drifted: {name}"
        rc, out = run_spec(ORIGINAL.replace(old, new, 1))
        ok = rc == 1 and needle in out
        failures += not check(f"rejects {name}", ok, f"exit {rc}")

    # --- negative: a whole dimension row removed ---
    print("\nNegative — structural defects")
    row = "| `dish_tradition` | multi | `minangkabau` | §1.6 |"
    rc, out = run_spec(ORIGINAL.replace(row + "\n", "", 1))
    failures += not check("rejects a removed dimension row", rc == 1 and "missing dimension" in out, f"exit {rc}")

    # --- negative: a whole dish section removed ---
    print("\nNegative — missing dish")
    import re
    m = re.search(r"### 3\.2 `chicken-tikka-masala`.*?(?=### 3\.3)", ORIGINAL, re.S)
    assert m, "dish section not found"
    rc, out = run_spec(ORIGINAL.replace(m.group(0), "", 1))
    failures += not check("rejects a missing pilot dish", rc == 1 and "no spec table" in out, f"exit {rc}")

    restore()
    rc, _ = run_spec(ORIGINAL)
    failures += not check("spec restored and still validates", rc == 0, f"exit {rc}")

    print()
    if failures:
        print(f"FAIL — {failures} test(s) failed")
        return 1
    print("OK — all validator regression tests pass.")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    finally:
        restore()
