#!/usr/bin/env python3
"""Generate the Stage B seed SQL from the approved Stage A pantry list.

The SQL is DERIVED from `docs/PANTRY-LIST-moussaka-greek.csv` -- the
list the owner approved -- so the rows written can never drift from the
list that was reviewed. This is a generator, not a second hand-written
copy of the list.

Usage:
    generate_pantry_seed.py <csv> <out.sql>
"""

import csv
import os
import sys

# The columns Stage B writes. `status` is 'draft' and both description
# columns are EMPTY, because a description is a claim and a claim needs
# a source (ADR-007-A1 4.3). Gate B's pass condition includes "no
# description text was written".
COLUMNS = "canonical_name, slug, category, status"

# The rows that already exist and must be REUSED, not re-inserted.
# The pantry list reuses four of them (they are already pointed at by
# dish_ingredients). For those, Stage B only fills in the `category`,
# which is NULL today.
EXISTING = {
    "eggplant",
    "lamb-mince",
    "tomato",
    "bechamel",
}


def sql_str(v):
    if v is None:
        return "NULL"
    return "'" + str(v).replace("'", "''") + "'"


def main():
    if len(sys.argv) != 3:
        print(__doc__, file=sys.stderr)
        return 2
    csv_path, out_path = sys.argv[1], sys.argv[2]
    with open(csv_path, newline="", encoding="utf-8") as f:
        rows = list(csv.DictReader(f))

    new_rows = [r for r in rows if r["slug"] not in EXISTING]
    reused = [r for r in rows if r["slug"] in EXISTING]

    out = []
    w = out.append
    w("-- STAGE B -- the moussaka-greek pantry list, as draft ingredient rows.")
    w("--")
    w("-- GENERATED FILE -- do not hand-edit. Regenerate with:")
    w("--   python3 scripts/generate_pantry_seed.py \\")
    w("--     docs/PANTRY-LIST-moussaka-greek.csv \\")
    w("--     packages/db/seed-moussaka-ingredients.sql")
    w("--")
    w("-- SOURCE OF TRUTH: docs/PANTRY-LIST-moussaka-greek.csv")
    w("-- (the Stage A pantry list the owner approved at Gate A)")
    w("--")
    w(f"-- {len(rows)} rows in the approved list: {len(new_rows)} new, {len(reused)} reused.")
    w("--")
    w("-- EVERY row is status='draft' with an EMPTY description. A")
    w("-- description is a claim, and a claim needs a source")
    w("-- (ADR-007-A1 4.3). Publication is Gate C and is a separate step.")
    w("--")
    w("-- The `category` of every row is a slug from the 435-row")
    w("-- `ingredient_categories` vocabulary, which migration 0054 now")
    w("-- enforces with the `ingredients_category_fk` foreign key. A")
    w("-- category that is not a vocabulary row cannot be stored.")
    w("")
    w("BEGIN;")
    w("")
    w("-- ── The 4 rows that already exist ─────────────────────────────")
    w("--")
    w("-- These are already pointed at by `dish_ingredients`, so they are")
    w("-- NOT re-inserted (that would duplicate them). Their `category`")
    w("-- is NULL today; this fills it in. The WHERE clause makes each")
    w("-- statement idempotent: re-running the seed does not touch a row")
    w("-- whose category is already correct.")
    w("")
    for r in reused:
        w("-- " + r["slug"])
        w("UPDATE public.ingredients")
        w(f"   SET category = {sql_str(r['category'])},")
        w("       updated_at = now()")
        w(f" WHERE slug = {sql_str(r['slug'])}")
        w(f"   AND category IS DISTINCT FROM {sql_str(r['category'])};")
        w("")
    w("-- ── The new rows ─────────────────────────────────────────────")
    w("--")
    w("-- ON CONFLICT (slug) DO NOTHING: the slug is the identity, so")
    w("-- re-running the seed is a no-op rather than an error.")
    w("")
    for r in new_rows:
        vals = ", ".join([
            sql_str(r["name"]),
            sql_str(r["slug"]),
            sql_str(r["category"]),
            "'draft'",
        ])
        w(f"-- {r['slug']}  ({r['category']})")
        w("INSERT INTO public.ingredients (" + COLUMNS + ")")
        w("VALUES (" + vals + ")")
        w("ON CONFLICT (slug) DO NOTHING;")
        w("")

    w("-- ── The dish's own ingredient rows ───────────────────────────")
    w("--")
    w("-- The pantry list is a list of INGREDIENTS, but a dish is what")
    w("-- actually uses them. This section writes the `dish_ingredients`")
    w("-- rows for `moussaka-greek`, and it is where `is_optional` from")
    w("-- the approved list becomes real: the schema column")
    w("-- `dish_ingredients.is_optional` is what says an ingredient is")
    w("-- a variation rather than a requirement.")
    w("--")
    w("-- The 4 rows that already exist are UPDATED to carry their")
    w("-- `is_optional`; the other 20 are INSERTed. `position` continues")
    w("-- the existing 0..3, so the seed does not renumber what is")
    w("-- already published.")
    w("--")
    w("-- `variant_id` is NULL for every row: a variant would mean the")
    w("-- ingredient is a PREPARED FORM of a base ingredient")
    w("-- (ADR-007-A1 3.5), and the pantry list treats the béchamel as")
    w("-- its own ingredient row rather than a variant of milk+flour.")
    w("")
    w("-- ── The existing 4 rows: set their is_optional ──────────────")
    for r in reused:
        opt = "true" if r.get("is_optional") == "true" else "false"
        w(f"-- {r['slug']}  (is_optional = {opt})")
        w("UPDATE public.dish_ingredients di")
        w(f"   SET is_optional = {opt}")
        w("  FROM public.dishes d, public.ingredients i")
        w(" WHERE di.dish_id = d.id")
        w("   AND di.ingredient_id = i.id")
        w("   AND d.slug = 'moussaka-greek'")
        w(f"   AND i.slug = {sql_str(r['slug'])}")
        w(f"   AND di.is_optional IS DISTINCT FROM {opt};")
        w("")
    w("-- ── The new rows: the dish's ingredient list ───────────────")
    pos = len(reused)
    for r in new_rows:
        opt = "true" if r.get("is_optional") == "true" else "false"
        w(f"-- {r['slug']}  (position {pos}, is_optional = {opt})")
        w("INSERT INTO public.dish_ingredients")
        w("       (dish_id, ingredient_id, position, is_optional)")
        w("SELECT d.id, i.id, " + str(pos) + f", {opt}")
        w("  FROM public.dishes d")
        w("  JOIN public.ingredients i ON i.slug = " + sql_str(r["slug"]))
        w(" WHERE d.slug = 'moussaka-greek'")
        w("ON CONFLICT (dish_id, ingredient_id, variant_id) DO NOTHING;")
        w("")
        pos += 1

    w("COMMIT;")
    w("")

    with open(out_path, "w", encoding="utf-8") as f:
        f.write("\n".join(out))
    print(f"  wrote {out_path}: {len(new_rows)} INSERTs, {len(reused)} UPDATEs")
    return 0


if __name__ == "__main__":
    sys.exit(main())
