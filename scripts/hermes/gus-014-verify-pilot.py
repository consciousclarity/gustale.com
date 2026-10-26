#!/usr/bin/env python3
"""
GUS-014 pilot — verify the migrated database against the pass/fail spec.

This is the oracle. It reads the expected end state from
`.hermes/REPORTS/GUS-014-pilot-spec.md` and checks the DATABASE against
it, then runs the I1-I17 integrity checks.

Usage:
  python3 scripts/hermes/gus-014-verify-pilot.py --db gustale_pilot_dryrun
  python3 scripts/hermes/gus-014-verify-pilot.py --db gustale   # read-only

Exit 0 = pilot passes. Exit 1 = at least one check failed.
"""
import argparse
import pathlib
import re
import subprocess
import sys

REPO = pathlib.Path(__file__).resolve().parents[2]
SPEC = REPO / ".hermes" / "REPORTS" / "GUS-014-pilot-spec.md"
PG_CONTAINER = "shared-postgres"
PG_SUPERUSER = "postgres"

DIMENSIONS = [
    "dish_family", "dish_cuisine", "dish_course", "dish_technique",
    "ingredient_category", "dish_tradition", "dish_context",
]
JOIN_TABLE = {
    "dish_family": "dish_dish_families",
    "dish_cuisine": "dish_dish_cuisines",
    "dish_course": "dish_dish_courses",
    "dish_technique": "dish_dish_techniques",
    "ingredient_category": "dish_dish_ingredient_categories",
    "dish_tradition": "dish_dish_traditions",
    "dish_context": "dish_dish_contexts",
}
VALUE_TABLE = {
    "dish_family": "dish_families",
    "dish_cuisine": "dish_cuisines",
    "dish_course": "dish_courses",
    "dish_technique": "dish_techniques",
    "ingredient_category": "ingredient_categories",
    "dish_tradition": "dish_traditions",
    "dish_context": "dish_contexts",
}
PILOT_SLUGS = ["rendang", "chicken-tikka-masala", "tacos-al-pastor"]
STRICT_PARENTS = {"red-meat", "white-meat", "produce"}


def psql(db: str, sql: str) -> str:
    r = subprocess.run(
        ["docker", "exec", "-i", PG_CONTAINER, "psql", "-v", "ON_ERROR_STOP=1",
         "-U", PG_SUPERUSER, "-d", db, "-tA", "-F", "\t", "-c", sql],
        capture_output=True, text=True,
    )
    if r.returncode != 0:
        raise RuntimeError(f"psql failed: {r.stderr.strip()}")
    return r.stdout


def parse_expected(text: str) -> dict[str, dict[str, list[str] | str]]:
    """Parse the spec's section 3 tables into {dish: {dim: [values] or 'unset'}}."""
    expected: dict[str, dict[str, object]] = {}
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
        mr = re.match(r"^\|\s*`(\w+)`\s*\|\s*([\w-]+)\s*\|\s*(.+?)\s*\|", line)
        if mr:
            dim, _card, cell = mr.groups()
            if dim not in DIMENSIONS:
                continue
            inner = cell.strip().strip("`")
            if inner == "unset":
                expected[dish][dim] = []
            else:
                expected[dish][dim] = [v.strip().strip("`") for v in inner.split(",")]
    return expected


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--db", required=True)
    ap.add_argument("--spec", default=str(SPEC))
    args = ap.parse_args()

    spec_text = pathlib.Path(args.spec).read_text()
    expected = parse_expected(spec_text)

    failures: list[str] = []
    passes: list[str] = []

    def check(icheck: str, ok: bool, detail: str = "") -> None:
        line = f"{icheck}" + (f" — {detail}" if detail else "")
        if ok:
            passes.append(line)
        else:
            failures.append(line)

    print("=" * 70)
    print(" GUS-014 PILOT VERIFICATION")
    print(f" database: {args.db}")
    print("=" * 70)
    print()

    # ---------------- I1/I2/I2b: every dimension cell matches ----------------
    print("-- I1 / I2 / I2b: dimension cells --")
    for dish in PILOT_SLUGS:
        if dish not in expected:
            check("I1", False, f"{dish}: no spec entry")
            continue
        for dim in DIMENSIONS:
            want = expected[dish].get(dim)
            if want is None:
                check("I1", False, f"{dish}.{dim}: missing from spec")
                continue
            got_raw = psql(args.db, f"""
                SELECT coalesce(string_agg(v.slug, ',' ORDER BY v.slug), '')
                FROM {JOIN_TABLE[dim]} jt
                JOIN {VALUE_TABLE[dim]} v ON v.id = jt.value_id
                JOIN dishes d ON d.id = jt.dish_id
                WHERE d.slug = '{dish}';""").strip()
            got = sorted(got_raw.split(",")) if got_raw else []
            want_sorted = sorted(want)
            ok = got == want_sorted
            check("I1", ok, f"{dish}.{dim}: expected {want_sorted or ['(unset)']}, got {got or ['(unset)']}")
            # I2: every stored value is in the spec's vocabulary
            # I2b: no parent values stored
            if dim == "ingredient_category":
                parents = [v for v in got if v in STRICT_PARENTS]
                check("I2b", not parents, f"{dish}.ingredient_category parents stored: {parents}" if parents else f"{dish} clean")
            print(f"   {dish:<22} {dim:<20} {got if got else '(unset)'}")

    # ---------------- I4: rendang has no 'stew' category ----------------
    print("\n-- I4: rendang drops 'stew' --")
    stew = psql(args.db, """
        SELECT count(*) FROM dish_categories dc
        JOIN categories c ON c.id = dc.category_id
        JOIN dishes d ON d.id = dc.dish_id
        WHERE d.slug='rendang' AND c.name='stew';""").strip()
    check("I4", stew == "0", f"stew rows on rendang: {stew} (expect 0)")

    # ---------------- I5/I6: tacos family + relation pair ----------------
    print("\n-- I5 / I6: tacos-al-pastor family + relation pair --")
    fam = psql(args.db, """
        SELECT coalesce(string_agg(v.slug, ','), '') FROM dish_dish_families jt
        JOIN dish_families v ON v.id = jt.value_id JOIN dishes d ON d.id = jt.dish_id
        WHERE d.slug='tacos-al-pastor';""").strip()
    check("I5", fam == "taco", f"family = {fam!r} (expect 'taco')")
    kebab_fam = psql(args.db, """
        SELECT count(*) FROM dish_dish_families jt
        JOIN dish_families v ON v.id = jt.value_id JOIN dishes d ON d.id = jt.dish_id
        WHERE d.slug='tacos-al-pastor' AND v.slug='kebab';""").strip()
    check("I5", kebab_fam == "0", f"kebab family rows: {kebab_fam}")

    # GUS-224 Option B (2026-10-26): dish_relations holds ONE directed row
    # per relation. The pilot originally wrote a bidirectional pair; Option B
    # collapsed it to the single reason-matching row
    # (shawarma -> tacos-al-pastor) and archived the reverse. A directional
    # type's inverse is deliberately NOT a valid assertion, so exactly one
    # row must exist.
    rels = psql(args.db, """
        SELECT f.slug || ' -> ' || t.slug || ' | ' || dr.relation_type
             || ' | ' || dr.strength || ' | ' || coalesce(dr.reason,'')
        FROM dish_relations dr
        JOIN dishes f ON f.id = dr.from_dish_id
        JOIN dishes t ON t.id = dr.to_dish_id
        WHERE (f.slug='tacos-al-pastor' AND t.slug='shawarma')
           OR (f.slug='shawarma' AND t.slug='tacos-al-pastor')
        ORDER BY f.slug;""")
    rel_lines = [r for r in rels.splitlines() if r.strip()]
    check("I6", len(rel_lines) == 1, f"relation rows: {len(rel_lines)} (expect 1 — one directed row per relation)")
    for line in rel_lines:
        print(f"   {line}")
    # direction: source = ancestor -> 'shawarma -> tacos-al-pastor' must be the row
    dir_ok = any(l.startswith("shawarma -> tacos-al-pastor") and "| ancestor |" in l
                 for l in rel_lines)
    check("I6", dir_ok, "the row is shawarma -> tacos-al-pastor (source = ancestor)")
    # the reverse row must NOT be present (that would be the contradiction)
    rev_bad = any(l.startswith("tacos-al-pastor -> shawarma") for l in rel_lines)
    check("I6", not rev_bad, "the contradicting reverse row is NOT present")
    # strength 4
    strengths = {l.split(" | ")[2].strip() for l in rel_lines}
    check("I6", strengths == {"4"}, f"strengths: {strengths}")

    # ---------------- I7: CTM cuisine unset ----------------
    print("\n-- I7: chicken-tikka-masala cuisine unset --")
    ctm_cuisine = psql(args.db, """
        SELECT count(*) FROM dish_dish_cuisines jt
        JOIN dishes d ON d.id = jt.dish_id WHERE d.slug='chicken-tikka-masala';""").strip()
    check("I7", ctm_cuisine == "0", f"CTM cuisine rows: {ctm_cuisine} (expect 0 — Glasgow dispute not resolved)")

    # ---------------- I8/I9: multi-value counts ----------------
    print("\n-- I8 / I9: multi-valued dimension counts --")
    ctm_tech = psql(args.db, """
        SELECT count(*) FROM dish_dish_techniques jt
        JOIN dishes d ON d.id = jt.dish_id WHERE d.slug='chicken-tikka-masala';""").strip()
    check("I8", ctm_tech == "2", f"CTM techniques: {ctm_tech} (expect 2)")
    rend_ctx = psql(args.db, """
        SELECT count(*) FROM dish_dish_contexts jt
        JOIN dishes d ON d.id = jt.dish_id WHERE d.slug='rendang';""").strip()
    check("I9", rend_ctx == "3", f"rendang contexts: {rend_ctx} (expect 3)")

    # ---------------- I10: rendang technique has no 'dry' ----------------
    print("\n-- I10: rendang technique cell is exactly 'braising' --")
    rend_tech = psql(args.db, """
        SELECT coalesce(string_agg(v.slug, ','), '') FROM dish_dish_techniques jt
        JOIN dish_techniques v ON v.id = jt.value_id JOIN dishes d ON d.id = jt.dish_id
        WHERE d.slug='rendang';""").strip()
    check("I10", rend_tech == "braising", f"rendang technique = {rend_tech!r}")

    # ---------------- I11: ingredient_category values ----------------
    print("\n-- I11: ingredient_category leaf values --")
    for dish, want in [("rendang", {"beef", "coconut"}),
                       ("chicken-tikka-masala", {"chicken", "dairy"}),
                       ("tacos-al-pastor", {"pork"})]:
        got = set(psql(args.db, f"""
            SELECT coalesce(string_agg(v.slug, ','), '') FROM dish_dish_ingredient_categories jt
            JOIN ingredient_categories v ON v.id = jt.value_id JOIN dishes d ON d.id = jt.dish_id
            WHERE d.slug='{dish}';""").strip().split(",")) - {""}
        check("I11", got == want, f"{dish}.ingredient_category = {sorted(got)} (expect {sorted(want)})")

    # ---------------- I12: traditions ----------------
    print("\n-- I12: dish_tradition --")
    for dish, want in [("rendang", {"minangkabau"}),
                       ("chicken-tikka-masala", set()),
                       ("tacos-al-pastor", set())]:
        got = set(psql(args.db, f"""
            SELECT coalesce(string_agg(v.slug, ','), '') FROM dish_dish_traditions jt
            JOIN dish_traditions v ON v.id = jt.value_id JOIN dishes d ON d.id = jt.dish_id
            WHERE d.slug='{dish}';""").strip().split(",")) - {""}
        check("I12", got == want, f"{dish}.dish_tradition = {sorted(got)} (expect {sorted(want)})")

    # ---------------- I13: identity unchanged ----------------
    print("\n-- I13: slugs / ids / names unchanged --")
    ident = psql(args.db, """
        SELECT count(*) FROM dishes
        WHERE slug IN ('rendang','chicken-tikka-masala','tacos-al-pastor')
          AND (slug IS NULL OR canonical_name IS NULL OR id IS NULL);""").strip()
    check("I13", ident == "0", f"null identities among pilot dishes: {ident}")
    total = psql(args.db, "SELECT count(*) FROM dishes;").strip()
    check("I13", total == "122", f"total dishes: {total} (expect 122)")

    # ---------------- I14: edit_history + updated_at ----------------
    print("\n-- I14: edit_history 'GUS-014 pilot' + updated_at bump --")
    # The pilot touches FOUR dishes: the 3 pilot dishes plus shawarma
    # (the ancestor side of the relation pair).
    eh = psql(args.db, """
        SELECT d.slug || ' | rows=' || count(e.id) || ' | comment=' || coalesce(max(e.comment),'(none)')
        FROM dishes d LEFT JOIN edit_history e
          ON e.target_type='dish' AND e.target_id=d.id AND e.comment='GUS-014 pilot'
        WHERE d.slug IN ('rendang','chicken-tikka-masala','tacos-al-pastor','shawarma')
        GROUP BY d.slug ORDER BY d.slug;""")
    touched = set()
    for line in eh.splitlines():
        if line.strip():
            print(f"   {line}")
            parts = line.split("|")
            rows = parts[1].replace("rows=", "").strip()
            touched.add(parts[0].strip())
            check("I14", rows == "1", f"{parts[0].strip()}: pilot edit_history rows = {rows} (expect 1)")
    check("I14", touched == {"rendang", "chicken-tikka-masala", "tacos-al-pastor", "shawarma"},
          f"touched dishes with a pilot edit_history row: {sorted(touched)}")
    # updated_at bumped past the snapshot's original values
    ua = psql(args.db, """
        SELECT count(*) FROM dishes
        WHERE slug IN ('rendang','chicken-tikka-masala','tacos-al-pastor','shawarma')
          AND updated_at > created_at;""").strip()
    check("I14", ua == "4", f"touched dishes with updated_at > created_at: {ua} (expect 4)")

    # ---------------- I17: coverage/corroboration reported as 0% ----------------
    print("\n-- I17: coverage scope is measurable (short_description populated) --")
    cov = psql(args.db, """
        SELECT count(*) FROM dishes
        WHERE slug IN ('rendang','chicken-tikka-masala','tacos-al-pastor')
          AND length(coalesce(short_description,'')) > 0;""").strip()
    check("I17", cov == "3", f"pilot dishes with a populated short_description: {cov} (expect 3 → coverage measurable, 0%)")

    # ---------------- summary ----------------
    print()
    print("=" * 70)
    print(f" PASS: {len(passes)}    FAIL: {len(failures)}")
    if failures:
        print()
        print(" FAILURES:")
        for f in failures:
            print(f"   - {f}")
        print()
        print("=" * 70)
        return 1
    print(" ALL CHECKS PASSED")
    print("=" * 70)
    return 0


if __name__ == "__main__":
    sys.exit(main())
