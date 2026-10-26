#!/usr/bin/env python3
"""
GUS-014 pilot spec validator (pre-flight gate V1).

Reads .hermes/REPORTS/GUS-014-pilot-spec.md and verifies that:
  - every expected value in the per-dish spec tables exists in the
    dimension's controlled vocabulary (§1 of the spec)
  - no dimension cell contains free text, a parenthetical, or a modifier
  - every one of the 3 pilot dishes specifies all 7 dimensions
  - the "unset" token is used literally and only where intended

Exit code 0 = spec is internally valid. Exit code 1 = spec has an error.
"""
import re
import sys
import pathlib

SPEC = pathlib.Path(__file__).resolve().parents[2] / ".hermes" / "REPORTS" / "GUS-014-pilot-spec.md"
DIMENSIONS = [
    "dish_family",
    "dish_cuisine",
    "dish_course",
    "dish_technique",
    "ingredient_category",
    "dish_tradition",
    "dish_context",
]
PILOT_DISHES = ["rendang", "chicken-tikka-masala", "tacos-al-pastor"]
UNSET = "unset"

# Parent categories are DERIVED at query time and never stored on a dish.
# A dish's ingredient_category cell must contain leaf values only.
PARENT_VALUES = {
    "red-meat", "white-meat", "produce", "dairy",
}
# `dairy` is a leaf for the pilot (the claim says "dairy base", not "cream"),
# so it is allowed. Everything else in PARENT_VALUES is a strict parent.
STRICT_PARENTS = {"red-meat", "white-meat", "produce"}


def parse_vocab(text: str) -> dict[str, list[str]]:
    """Parse §1 vocabulary blocks: '### 1.N `dim`' then lines of `a` · `b` · `c`"""
    vocab: dict[str, list[str]] = {}
    current = None
    in_vocab = False
    for line in text.splitlines():
        if line.startswith("## "):
            in_vocab = False
        m = re.match(r"^### 1\.\d+ `(\w+)`", line)
        if m:
            current = m.group(1)
            vocab.setdefault(current, [])
            in_vocab = True
            continue
        if not in_vocab or current is None:
            continue
        # vocabulary value lines: backticked tokens separated by ·
        if line.startswith("`") and "·" in line:
            for tok in line.split("·"):
                tok = tok.strip().strip("`").strip()
                if tok and re.fullmatch(r"[a-z][a-z0-9\-/ ]*", tok):
                    if tok not in vocab[current]:
                        vocab[current].append(tok)
    return vocab


def parse_parents(text: str) -> set[str]:
    """Parse the '**PARENT VALUES (derived - never stored on a dish):**' block."""
    parents: set[str] = set()
    in_block = False
    for line in text.splitlines():
        if line.startswith("**PARENT VALUES"):
            in_block = True
            continue
        if in_block:
            if line.startswith("`"):
                for tok in line.split("·"):
                    tok = tok.strip().strip("`").strip()
                    if tok and re.fullmatch(r"[a-z][a-z0-9\- ]*", tok):
                        parents.add(tok)
                break
            if line.strip() and not line.startswith("**"):
                continue
    return parents


def parse_expected(text: str) -> dict[str, dict[str, str]]:
    """Parse §3 per-dish tables into {dish: {dimension: raw_cell}}."""
    expected: dict[str, dict[str, str]] = {}
    dish = None
    in_tables = False
    for line in text.splitlines():
        if line.startswith("## 3."):
            in_tables = True
            continue
        if in_tables and line.startswith("## 4."):
            in_tables = False
            continue
        if not in_tables:
            continue
        md = re.match(r"^### 3\.\d+ `([\w-]+)`", line)
        if md:
            dish = md.group(1)
            expected[dish] = {}
            continue
        if dish is None:
            continue
        # table row: | `dim` | card | `value` | note |
        mr = re.match(r"^\|\s*`(\w+)`\s*\|\s*([\w-]+)\s*\|\s*(.+?)\s*\|", line)
        if mr:
            dim, _card, cell = mr.groups()
            if dim in DIMENSIONS:
                expected[dish][dim] = cell.strip()
    return expected


def main() -> int:
    if not SPEC.exists():
        print(f"FAIL: spec not found: {SPEC}")
        return 1
    text = SPEC.read_text()
    vocab = parse_vocab(text)
    expected = parse_expected(text)
    declared_parents = parse_parents(text)
    # The effective strict-parent set is the union of the hard-coded set and
    # whatever the spec declares, minus any value the spec also lists as a
    # storable leaf (dairy is both a parent in the abstract and a leaf here).
    global STRICT_PARENTS
    strict_parents = set(STRICT_PARENTS) | declared_parents
    for dim in ("ingredient_category",):
        strict_parents -= set(vocab.get(dim, [])) - {"dairy"}
    STRICT_PARENTS = strict_parents

    errors: list[str] = []
    warnings: list[str] = []

    # --- vocab presence ---
    for dim in DIMENSIONS:
        if dim not in vocab or not vocab[dim]:
            errors.append(f"vocab missing or empty for dimension '{dim}'")

    # --- dishes present, all 7 dimensions ---
    for dish in PILOT_DISHES:
        if dish not in expected:
            errors.append(f"pilot dish '{dish}' has no spec table")
            continue
        missing = [d for d in DIMENSIONS if d not in expected[dish]]
        if missing:
            errors.append(f"'{dish}' missing dimension(s): {', '.join(missing)}")
        extra = [d for d in expected[dish] if d not in DIMENSIONS]
        if extra:
            errors.append(f"'{dish}' has unknown dimension(s): {', '.join(extra)}")

    # --- per-cell validation ---
    for dish, dims in expected.items():
        for dim, cell in dims.items():
            if dim not in DIMENSIONS:
                continue
            if cell == f"`{UNSET}`":
                continue
            # cell must be one or more backticked values, comma separated
            if not (cell.startswith("`") and cell.endswith("`")):
                errors.append(f"'{dish}'.{dim}: cell not backticked: {cell!r}")
                continue
            inner = cell.strip("`")
            if "(" in inner or ")" in inner:
                errors.append(
                    f"'{dish}'.{dim}: parenthetical/modifier in value: {inner!r} "
                    "(D3e: qualifiers belong in claims, not dimension cells)"
                )
                continue
            vals = [v.strip().strip("`") for v in inner.split(",")]
            for v in vals:
                if v == UNSET:
                    errors.append(f"'{dish}'.{dim}: 'unset' must be the whole cell, not part of a list")
                    continue
                # Parent check FIRST: a parent is rejected for the more
                # specific reason (leaf-only rule), not the generic
                # "not in vocabulary" one.
                if dim == "ingredient_category" and v in STRICT_PARENTS:
                    errors.append(
                        f"'{dish}'.{dim}: PARENT value '{v}' must not be stored "
                        "(leaf-only storage; parents are derived at query time)"
                    )
                    continue
                if v not in vocab.get(dim, []):
                    errors.append(f"'{dish}'.{dim}: value '{v}' NOT in controlled vocabulary")
                    continue
            if len(vals) != len(set(vals)):
                errors.append(f"'{dish}'.{dim}: duplicate values in cell: {vals}")

    # --- cardinality sanity (single-valued dims must not have >1 value) ---
    single = {"dish_family", "dish_cuisine", "dish_course"}
    for dish, dims in expected.items():
        for dim in single & set(dims):
            cell = dims[dim]
            if cell == f"`{UNSET}`":
                continue
            inner = cell.strip("`")
            if "," in inner:
                errors.append(f"'{dish}'.{dim}: single-valued dimension has multiple values: {inner!r}")

    # --- report ---
    print("GUS-014 pilot spec validation")
    print(f"  spec: {SPEC}")
    print()
    print("Controlled vocabularies:")
    for dim in DIMENSIONS:
        print(f"  {dim:<20} {len(vocab.get(dim, []))} values")
    print()
    print(f"  ingredient_category parents (derived, never stored): {', '.join(sorted(STRICT_PARENTS))}")
    print()
    print("Pilot dishes:")
    for dish in PILOT_DISHES:
        dims = expected.get(dish, {})
        assigned = sum(1 for d in DIMENSIONS if dims.get(d, "").strip("`") not in ("", UNSET))
        unset = sum(1 for d in DIMENSIONS if dims.get(d, "").strip("`") == UNSET)
        total_vals = 0
        for d in DIMENSIONS:
            c = dims.get(d, "")
            if c and c.strip("`") not in ("", UNSET):
                total_vals += len([x for x in c.strip("`").split(",") if x.strip()])
        print(f"  {dish:<22} {len(dims)}/7 dims | {assigned} assigned | {unset} unset | {total_vals} values")
    print()

    if warnings:
        print("WARNINGS:")
        for w in warnings:
            print(f"  - {w}")
        print()
    if errors:
        print(f"FAIL — {len(errors)} error(s):")
        for e in errors:
            print(f"  - {e}")
        return 1
    print("OK — spec is internally valid.")
    print(f"  {len(PILOT_DISHES)} dishes x {len(DIMENSIONS)} dimensions = "
          f"{len(PILOT_DISHES) * len(DIMENSIONS)} dimension cells checked.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
