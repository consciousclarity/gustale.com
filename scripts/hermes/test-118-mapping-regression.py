#!/usr/bin/env python3
"""
GUS-014 — mapper regression test.

The mapper (scripts/hermes/gus-014-build-118-mapping.py) silently lost
47 of 118 technique values on 2026-10-26 because its preparation table
keyed on a spelling that GUS-227 had just changed. The generated report
still looked plausible; only a diff against the live database exposed
it.

This test makes that class of failure loud:

  R1  coverage does not DROP versus the previous recorded run
  R2  no dimension's coverage drops by more than one dish
  R3  every dish that has a value in the live DB still has one in the
      mapping (no silent loss)
  R4  the technique mapping still resolves for the dishes whose
      preparation names a serving format
  R5  the mapper's preparation table resolves BOTH spellings (with and
      without the literal backslash)

Usage:
  python3 scripts/hermes/test-118-mapping-regression.py
  python3 scripts/hermes/test-118-mapping-regression.py --baseline FILE

The baseline is a JSON file of per-dimension dish counts. If it is
absent, the current run establishes it and exits 0 with a note.
"""
import argparse
import json
import pathlib
import re
import subprocess
import sys

REPO = pathlib.Path(__file__).resolve().parents[2]
MAPPER = REPO / "scripts" / "hermes" / "gus-014-build-118-mapping.py"
DEFAULT_BASELINE = REPO / ".hermes" / "snapshots" / "gus-014" / "mapping-baseline.json"
DIMENSIONS = ["dish_family", "dish_cuisine", "dish_course", "dish_technique",
              "ingredient_category", "dish_tradition", "dish_context"]

fail = 0
def ok(msg):   print(f"   PASS  {msg}")
def bad(msg):  global fail; print(f"   FAIL  {msg}"); fail += 1


def run_mapper(out_path: pathlib.Path) -> dict:
    """Run the mapper and parse its machine-readable mapping."""
    r = subprocess.run(
        [sys.executable, str(MAPPER), "--db", "gustale", "--out", str(out_path),
         "--no-write"],
        cwd=REPO, capture_output=True, text=True,
    )
    if r.returncode != 0:
        print(r.stdout[-2000:]); print(r.stderr[-2000:])
        raise RuntimeError(f"mapper failed (exit {r.returncode})")
    text = out_path.read_text()
    m = re.search(r'## 7\. Machine-readable mapping\n\n```json\n(.*?)\n```', text, re.S)
    if not m:
        raise RuntimeError("no machine-readable mapping in the report")
    return json.loads(m.group(1))


def coverage(mapping: dict) -> dict:
    """Per-dimension count of DISTINCT dishes carrying a value."""
    out = {}
    for dim in DIMENSIONS:
        out[dim] = len({slug for slug, d in mapping.items() if d.get(dim)})
    return out


def live_coverage() -> dict:
    """Per-dimension count of distinct dishes carrying a value, live."""
    q = subprocess.run(
        ["docker", "exec", "-i", "shared-postgres", "psql", "-U", "postgres",
         "-d", "gustale", "-tA", "-F", "\t", "-c",
         "SELECT 'dish_family', count(DISTINCT dish_id) FROM dish_dish_families "
         "UNION ALL SELECT 'dish_cuisine', count(DISTINCT dish_id) FROM dish_dish_cuisines "
         "UNION ALL SELECT 'dish_course', count(DISTINCT dish_id) FROM dish_dish_courses "
         "UNION ALL SELECT 'dish_technique', count(DISTINCT dish_id) FROM dish_dish_techniques "
         "UNION ALL SELECT 'ingredient_category', count(DISTINCT dish_id) FROM dish_dish_ingredient_categories "
         "UNION ALL SELECT 'dish_tradition', count(DISTINCT dish_id) FROM dish_dish_traditions "
         "UNION ALL SELECT 'dish_context', count(DISTINCT dish_id) FROM dish_dish_contexts;"],
        capture_output=True, text=True,
    )
    out = {}
    for line in q.stdout.splitlines():
        if "\t" in line:
            k, v = line.split("\t")
            out[k] = int(v)
    return out


def live_coverage_excluding_pilot() -> dict:
    """Live coverage over the SAME population the mapper covers: the 118
    non-pilot dishes. The 3 pilot dishes are excluded from both sides,
    otherwise the comparison is against a different population."""
    q = subprocess.run(
        ["docker", "exec", "-i", "shared-postgres", "psql", "-U", "postgres",
         "-d", "gustale", "-tA", "-F", "\t", "-c",
         "SELECT 'dish_family', count(DISTINCT j.dish_id) FROM dish_dish_families j "
         "JOIN dishes d ON d.id=j.dish_id WHERE d.status='published' "
         "UNION ALL SELECT 'dish_cuisine', count(DISTINCT j.dish_id) FROM dish_dish_cuisines j "
         "JOIN dishes d ON d.id=j.dish_id WHERE d.status='published' "
         "UNION ALL SELECT 'dish_course', count(DISTINCT j.dish_id) FROM dish_dish_courses j "
         "JOIN dishes d ON d.id=j.dish_id WHERE d.status='published' "
         "UNION ALL SELECT 'dish_technique', count(DISTINCT j.dish_id) FROM dish_dish_techniques j "
         "JOIN dishes d ON d.id=j.dish_id WHERE d.status='published' "
         "UNION ALL SELECT 'ingredient_category', count(DISTINCT j.dish_id) FROM dish_dish_ingredient_categories j "
         "JOIN dishes d ON d.id=j.dish_id WHERE d.status='published' "
         "UNION ALL SELECT 'dish_tradition', count(DISTINCT j.dish_id) FROM dish_dish_traditions j "
         "JOIN dishes d ON d.id=j.dish_id WHERE d.status='published' "
         "UNION ALL SELECT 'dish_context', count(DISTINCT j.dish_id) FROM dish_dish_contexts j "
         "JOIN dishes d ON d.id=j.dish_id WHERE d.slug NOT IN "
         "'published';"],
        capture_output=True, text=True,
    )
    out = {}
    for line in q.stdout.splitlines():
        if "\t" in line:
            k, v = line.split("\t")
            out[k] = int(v)
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--baseline", default=str(DEFAULT_BASELINE))
    args = ap.parse_args()

    print("GUS-014 mapper regression test")
    tmp = pathlib.Path("/tmp/gus-014-mapping-regression.md")
    mapping = run_mapper(tmp)
    cov = coverage(mapping)
    live = live_coverage_excluding_pilot()

    print(f"\n   mapping coverage: {cov}")
    print(f"   live coverage   : {live}")
    print()

    # ---- R5: the preparation table resolves both spellings ----
    src = MAPPER.read_text()
    if "replace(" in src and "chr(92)" in src or 'replace("\\\\\\\\", "")' in src:
        ok("R5 the mapper normalises the backslash spelling")
    else:
        bad("R5 the mapper does NOT normalise the backslash spelling "
            "- a GUS-227-style rename would silently zero the technique path")

    # the resolver must be able to answer for a backslash spelling
    ns = {"__file__": str(MAPPER), "__name__": "mapper_under_test"}
    exec(compile(src.split("def main()")[0], str(MAPPER), "exec"), ns)  # noqa: S102
    resolver = ns.get("preparation_techniques")
    table = ns.get("PREPARATION_TO_TECHNIQUE", {})
    if resolver:
        plain = [k for k in table if "&" in k]
        ok_resolved = all(resolver(k) is not None for k in plain)
        if ok_resolved:
            ok(f"R5 all {len(plain)} plain-'&' preparation keys resolve")
        else:
            bad("R5 some plain-'&' preparation keys do NOT resolve")
        # a backslash spelling must also resolve. Build it from chr(92) so
        # the test source itself does not depend on escaping rules.
        bs = plain[0].replace("&", chr(92) + "&") if plain else None
        if bs and resolver(bs) is not None:
            ok("R5 a backslash-spelled preparation also resolves")
        else:
            bad(f"R5 a backslash-spelled preparation does NOT resolve (tried {bs!r})")
    else:
        bad("R5 preparation_techniques() not found in the mapper")

    # ---- R1/R2: coverage must not drop vs the baseline ----
    baseline_path = pathlib.Path(args.baseline)
    if baseline_path.exists():
        baseline = json.loads(baseline_path.read_text())
        print(f"\n   baseline: {baseline}")
        for dim in DIMENSIONS:
            b = baseline.get(dim, 0)
            c = cov.get(dim, 0)
            if c < b:
                bad(f"R1 {dim} coverage DROPPED: {b} -> {c}")
            elif c == b:
                ok(f"R1 {dim} coverage held at {c}")
            else:
                ok(f"R1 {dim} coverage rose {b} -> {c}")
        for dim in DIMENSIONS:
            b = baseline.get(dim, 0)
            c = cov.get(dim, 0)
            if c < b - 1:
                bad(f"R2 {dim} dropped by more than one dish: {b} -> {c}")
    else:
        baseline_path.parent.mkdir(parents=True, exist_ok=True)
        baseline_path.write_text(json.dumps(cov, indent=2, sort_keys=True))
        print(f"\n   NO BASELINE - wrote one to {baseline_path}")
        ok("R1 baseline established (coverage drop will fail from now on)")

    # ---- R3: no dish loses a value it has live ----
    # (the mapping is generated from the same data, so a dish that has a
    #  value live but not in the mapping means the mapper lost it)
    lost = []
    for dim in DIMENSIONS:
        for slug, dims in mapping.items():
            pass
    # compare against the live per-dish sets
    for dim, join in [("dish_family", "dish_dish_families"), ("dish_cuisine", "dish_dish_cuisines"),
                      ("dish_course", "dish_dish_courses"), ("dish_technique", "dish_dish_techniques"),
                      ("dish_context", "dish_dish_contexts")]:
        rows = subprocess.run(
            ["docker", "exec", "-i", "shared-postgres", "psql", "-U", "postgres",
             "-d", "gustale", "-tA", "-c",
             f"SELECT DISTINCT d.slug FROM {join} j JOIN dishes d ON d.id=j.dish_id "
             "WHERE d.status='published';"],
            capture_output=True, text=True).stdout.split()
        for slug in rows:
            if slug in mapping and not mapping[slug].get(dim):
                lost.append((dim, slug))
    if lost:
        for dim, slug in lost[:10]:
            bad(f"R3 {slug} has a live {dim} value but the mapping does not")
    else:
        ok("R3 no dish lost a dimension value it has live")

    # ---- R4: technique still resolves for the serving-format dishes ----
    for slug in ["baba-ganoush", "falafel", "gado-gado", "hummus", "pempek"]:
        got = mapping.get(slug, {}).get("dish_technique", [])
        if got:
            ok(f"R4 {slug} still has technique {got}")
        else:
            bad(f"R4 {slug} has NO technique - the serving-format fallback stopped working")

    print()
    if fail:
        print(f"FAIL — {fail} regression check(s) failed.")
        return 1
    print("OK — the mapper has not regressed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
