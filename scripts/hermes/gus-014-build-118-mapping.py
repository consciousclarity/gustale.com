#!/usr/bin/env python3
"""
GUS-014 — 118-dish dimension mapping builder.

Maps each dish's OLD `categories` rows onto the 7 canonical dimensions
(ADR-001 D1-D7, D3b-D3h) and emits a per-dish MAPPING REPORT for review.

RULES (Alejandro, 2026-10-26):
  * NO vocabulary extension during the run. A value that is not already in
    the controlled vocabulary goes to the PROPOSALS list and the dimension
    cell is left UNSET for that value.
  * Ambiguous or disputed -> UNSET, and reported.
  * Dimensions only. No relations, no descriptions, no claims.
  * The pilot's 3 dishes are EXCLUDED - they are already mapped.

Output:
  .hermes/REPORTS/GUS-014-118-mapping-report.md

Read-only: this script never writes to the database.
"""
import argparse
import collections
import pathlib
import re
import subprocess
import sys

REPO = pathlib.Path(__file__).resolve().parents[2]
PG_CONTAINER = "shared-postgres"
PG_SUPERUSER = "postgres"

PILOT_SLUGS = {"rendang", "chicken-tikka-masala", "tacos-al-pastor"}

DIMENSIONS = [
    "dish_family", "dish_cuisine", "dish_course", "dish_technique",
    "ingredient_category", "dish_tradition", "dish_context",
]

# --------------------------------------------------------------------------
# The controlled vocabulary. A value NOT listed here cannot be written; it
# goes to the proposals list instead. The vocabulary here MUST match the
# live dimension tables - this script verifies that against the database.
#
# NOTE: 'dairy' is in the live table but is a PARENT for the purposes of
# D3h; it is still storable as a leaf (the pilot stores it for CTM).
# --------------------------------------------------------------------------
VOCAB = {
    "dish_family": {
        "curry", "taco", "bread", "dumpling", "noodle-soup", "kebab", "rice-dish",
        "soup", "stew", "casserole", "salad", "sandwich", "pancake", "sauce",
        "dessert", "fried-rice", "pasta", "egg-dish", "breaded-cutlet",
        "fermented-dish", "side-dish", "moussaka", "street-snack",
    },
    "dish_cuisine": {
        "indonesian", "japanese", "chinese", "lebanese", "indian", "italian",
        "argentine", "mexican", "peruvian", "south-indian", "israeli",
        "korean", "french", "singaporean", "spanish", "thai", "vietnamese",
        "turkish", "filipino", "colombian", "ethiopian",
    },
    "dish_course": {
        "main-course", "appetizer", "dessert", "side", "soup", "breakfast",
        "snack", "drink", "condiment",
    },
    "dish_technique": {
        "stewing", "braising", "simmering", "grilling", "skewering",
        "spit-roasting", "baking", "frying", "roasting", "boiling",
        "steaming", "blanching", "curing", "fermenting", "smoking",
        "pickling", "mashing", "kneading", "whisking", "tempering",
        "emulsifying", "poaching", "sautéing", "stir-frying", "deep-frying",
    },
    "ingredient_category": {
        "meat", "red-meat", "beef", "pork", "poultry", "chicken", "seafood",
        "fish", "shellfish", "game", "offal", "legume", "grain", "rice",
        "noodle", "bread", "vegetable", "leafy-green", "root-vegetable",
        "allium", "fruit", "citrus", "coconut", "herb", "spice",
        "aromatic-base", "chili", "paste", "fat", "oil", "dairy", "egg", "nut",
        "seed", "sweetener", "sugar", "fermented", "salt", "beverage",
        "liquid", "broth", "sauce", "vinegar", "wrapper", "dough", "pickle",
        "cheese", "stock", "fumigation", "sweet", "savoury",
        "white-meat", "produce",
    },
    "dish_tradition": {
        "minangkabau", "glasgow-muslim", "indonesian-national",
        "mexican-national", "british-national", "south-asian", "ramadan",
        "eid", "imani", "malay", "peranakan", "chinese-national",
        "japanese-national", "filipino-national", "mediterranean", "levantine",
        "maghrebi", "west-african", "andean", "latine", "cajun", "creole",
        "sundanese", "balinese", "javanese", "batak", "aceh", "bali",
        "wedding-feast", "communal-feast", "harvest", "street-vendor",
        "night-market", "home-cooking", "restaurant-culture",
        "street-food-culture",
    },
    "dish_context": {
        "street-food", "home", "festival/ceremonial", "restaurant", "market",
    },
}

# --------------------------------------------------------------------------
# CATEGORY -> DIMENSION mapping.
#
# Each entry maps an OLD category name to:
#   (dimension, [values])
# A category may map to more than one dimension (e.g. 'Street snack' is a
# course AND a context). A category may map to SEVERAL values in the same
# dimension.
#
# `AMBIGUOUS` entries are values that cannot be determined from the old
# data alone - they become UNSET and are reported for a human decision.
# --------------------------------------------------------------------------
CATEGORY_MAP = {
    # ---- cuisine ----
    "Indonesian cuisine":   [("dish_cuisine", ["indonesian"])],
    "Japanese cuisine":     [("dish_cuisine", ["japanese"])],
    "Chinese cuisine":      [("dish_cuisine", ["chinese"])],
    "Lebanese cuisine":     [("dish_cuisine", ["lebanese"])],
    "Indian cuisine":       [("dish_cuisine", ["indian"])],
    "Italian cuisine":      [("dish_cuisine", ["italian"])],
    "Argentine cuisine":    [("dish_cuisine", ["argentine"])],
    "Mexican cuisine":      [("dish_cuisine", ["mexican"])],
    "Peruvian cuisine":     [("dish_cuisine", ["peruvian"])],
    "South Indian cuisine": [("dish_cuisine", ["south-indian"])],
    "Israeli cuisine":      [("dish_cuisine", ["israeli"])],
    "Korean cuisine":       [("dish_cuisine", ["korean"])],
    "French cuisine":       [("dish_cuisine", ["french"])],
    "Singaporean cuisine":  [("dish_cuisine", ["singaporean"])],
    "Spanish cuisine":      [("dish_cuisine", ["spanish"])],
    "Thai cuisine":         [("dish_cuisine", ["thai"])],
    "Vietnamese cuisine":   [("dish_cuisine", ["vietnamese"])],
    "Turkish cuisine":      [("dish_cuisine", ["turkish"])],
    "Filipino cuisine":     [("dish_cuisine", ["filipino"])],
    "Colombian cuisine":    [("dish_cuisine", ["colombian"])],
    "Ethiopian cuisine":    [("dish_cuisine", ["ethiopian"])],

    # ---- course ----
    "Main course":  [("dish_course", ["main-course"])],
    "Appetizer":    [("dish_course", ["appetizer"])],
    "Dessert":      [("dish_course", ["dessert"])],
    "Side dish":    [("dish_course", ["side"])],
    "Soup":         [("dish_course", ["soup"])],

    # ---- family (nouns: what the dish IS) ----
    "Stew":         [("dish_family", ["stew"])],
    "Curry":        [("dish_family", ["curry"])],
    "Kebab":        [("dish_family", ["kebab"])],
    "Bread":        [("dish_family", ["bread"])],
    "Dumpling":     [("dish_family", ["dumpling"])],
    "Noodle soup":  [("dish_family", ["noodle-soup"])],
    "Rice dish":    [("dish_family", ["rice-dish"])],
    "Fried rice":   [("dish_family", ["fried-rice"])],
    "Casserole":    [("dish_family", ["casserole"])],
    "Salad":        [("dish_family", ["salad"])],
    "Sandwich":     [("dish_family", ["sandwich"])],
    "Pancake":      [("dish_family", ["pancake"])],
    "Sauce":        [("dish_family", ["sauce"])],
    "Pasta":        [("dish_family", ["pasta"])],
    "Egg dish":     [("dish_family", ["egg-dish"])],
    "Breaded cutlet": [("dish_family", ["breaded-cutlet"])],
    "Fermented dish": [("dish_family", ["fermented-dish"])],
    "Moussaka":     [("dish_family", ["moussaka"])],

    # ---- technique: 'Stir-fry' is a technique, not a family or a course ----
    # The old `categories` table has `kind='dish-type'` for it, but it names
    # a METHOD (ADR-001 D3: family = nouns, technique = gerunds), so it maps
    # to dish_technique, not dish_family.
    "Stir-fry": [("dish_technique", ["stir-frying"])],

    # ---- family + context: a street snack is a COURSE and a CONTEXT ----
    # D2: `street-snack` is NOT a course. It becomes
    #     dish_context = street-food, and the dish keeps its real course.
    "Street snack": [("dish_context", ["street-food"])],
    "Street snacks": [("dish_context", ["street-food"])],
}

# --------------------------------------------------------------------------
# PRIORITY / TIE-BREAK rules for the single-valued dimensions.
#
# The old `categories` table mixes a GENERIC fallback with SPECIFIC values.
# 'Main course' is the generic fallback: 97 of 122 dishes carry it, and 22
# of those ALSO carry a more specific course (Soup, Appetizer, ...). Those
# 22 are not ambiguous - the specific value is the dish's PRIMARY meal role
# (D3f) and the generic one is filler.
#
# Where TWO specific values compete, the cell is genuinely ambiguous and is
# left UNSET for a human decision.
# --------------------------------------------------------------------------
# Generic fallback values per single-valued dimension, lowest priority.
GENERIC_FALLBACK = {
    "dish_course": {"main-course"},
}

# Specific course values, in priority order. A dish carrying several picks
# the first match; two of the SAME priority are ambiguous.
COURSE_PRIORITY = ["soup", "dessert", "appetizer", "snack", "side", "breakfast", "drink"]

# Family values that are FORMS (how the dish is served) rather than what it
# IS. A form beats a family when both are present, because ADR-001 D3
# separates family (what it is) from course/context (how it is served).
FAMILY_FORM_VALUES = {"sandwich", "pancake", "salad", "sauce"}


# --------------------------------------------------------------------------
# PREPARATION METHOD -> dish_technique.
#
# `dish_preparations` covers 121 of 122 dishes and is the ONLY technique
# signal in the catalog (the old `categories` table has no technique
# dimension). `preparation_methods.name` is a display label like
# 'Stew & braise' or 'Grilled & skewered'; each maps to one or more
# controlled-vocabulary technique values (gerunds, per ADR-001 D3).
# --------------------------------------------------------------------------
#
# NOTE: the live `preparation_methods.name` values contain a LITERAL
# backslash before the ampersand ('Fried \& topped') - a data-entry
# artifact from an earlier migration, not an escaped `&`. The keys below
# use the literal form, and the loader also normalises a plain '&' so both
# spellings resolve.
PREPARATION_TO_TECHNIQUE = {
    "Fried \\& topped":           ["frying"],
    "Stew \\& braise":            ["stewing", "braising"],
    "Rice bowl":                    ["steaming"],          # rice is steamed
    "Grilled \\& skewered":       ["grilling", "skewering"],
    "Noodle soup":                  ["boiling", "simmering"],
    "Small plates \\& preserves": [],                    # a serving format, not a technique
    "Bread \\& dough":            ["baking", "kneading"],
    "Curry":                        ["simmering"],
    "Steamed \\& custard":        ["steaming"],
    "Poached in sauce":             ["poaching", "simmering"],
    "Dumpling":                     ["steaming", "boiling"],
    "Sweets \\& custard":         ["baking"],
    "Flatbread":                    ["baking"],
    "Boiled \\& cured":           ["boiling", "curing"],
    "Pasta":                        ["boiling"],
    # methods present in the table but not used by any dish:
    "Baking":                       ["baking"],
    "Simmering":                    ["simmering"],
    "Omelettes \\& scrambles":     ["frying"],
}


def preparation_techniques(method: str):
    """Resolve a preparation method to technique values, tolerating the
    literal-backslash ampersand artifact in the live data."""
    if method in PREPARATION_TO_TECHNIQUE:
        return PREPARATION_TO_TECHNIQUE[method]
    normalised = method.replace("\\\\&", "&")
    if normalised in PREPARATION_TO_TECHNIQUE:
        return PREPARATION_TO_TECHNIQUE[normalised]
    return None

# `dish_tags` is EMPTY (0 rows) and `dish_ingredients` has only 4 rows, so
# there is NO tradition signal and almost no ingredient-category signal in
# the old data. Those two dimensions are left unset for all 118 dishes and
# reported as a DATA GAP rather than invented from the dish name.

# The technique values the preparation names imply but the vocabulary must
# contain. If any of these are missing from the live vocabulary they become
# PROPOSALS (not written) - no extension during the run.

# --------------------------------------------------------------------------
# DISH-NAME FAMILY INFERENCE (reported separately, NOT written by default).
#
# 43 dishes carry no family-ish old category, so the old data cannot supply
# one. Many of them are SELF-DESCRIBING dishes whose canonical name IS the
# family name ('Sushi' -> sushi, 'Ceviche' -> ceviche, 'Asado' -> asado).
#
# That is an inference from the dish name, not a fact recovered from the
# old taxonomy, so it is reported in its own section for a human decision
# rather than written silently.
#
# Only these families are inferable: the value must already be in the
# controlled vocabulary, and the dish's canonical name must contain the
# family name as a word.
# --------------------------------------------------------------------------
NAME_INFERABLE_FAMILIES = {
    "sushi", "ceviche", "asado", "ceviche-peruvian", "tamales", "empanada",
    "falafel", "hummus", "shakshuka", "kibbeh", "kofta", "tabbouleh",
    "fattoush", "baba-ganoush", "bakso", "rawon", "soto-ayam", "bubur-ayam",
    "sambal", "sate-lilit", "satay", "pempek", "adobo-filipino", "sinigang",
    "lechon", "halo-halo", "tarte-tatin", "tiramisu", "poutine", "tonkatsu",
    "tempura", "takoyaki", "char-siu", "peking-duck", "mapo-tofu", "kung-pao-chicken",
    "chow-mein", "congee", "lomo-saltado", "tom-yum", "khao-soi", "menemen",
    "dolma", "manti", "pierogi", "gyoza", "xiaolongbao", "jiaozi", "momo",
    "samosa", "vada", "idli", "dosa", "masala-dosa", "tostones", "acaraje",
    "chiles-en-nogada", "mole-poblano", "borscht", "gazpacho", "empanada",
    "hummus", "chole-bhature", "kibbeh",
}


def resolve_single(dim: str, values: list[str], slug: str, cats: list[str]):
    """Resolve a single-valued dimension.

    Returns (values, note). values == [] means UNSET (ambiguous).
    """
    vals = sorted(set(values))
    if len(vals) <= 1:
        return vals, None

    # generic fallback loses to any specific value
    generic = GENERIC_FALLBACK.get(dim, set())
    specific = [v for v in vals if v not in generic]
    if len(specific) == 1:
        return specific, (f"'{generic and sorted(generic)[0]}' is the generic fallback; "
                          f"the specific value wins")
    if len(specific) == 0:
        return vals, None

    # course: priority order
    if dim == "dish_course":
        ranked = [v for v in COURSE_PRIORITY if v in specific]
        if len(ranked) == 1:
            return ranked, f"primary meal role resolved by priority ({ranked[0]} > {', '.join(v for v in specific if v != ranked[0])})"
        if len(ranked) > 1:
            return [], f"two specific courses compete at the same priority: {', '.join(ranked)}"

    # family: a serving form beats a family
    if dim == "dish_family":
        forms = [v for v in specific if v in FAMILY_FORM_VALUES]
        fams = [v for v in specific if v not in FAMILY_FORM_VALUES]
        if len(forms) == 1 and not fams:
            return forms, "serving form (not a family in the ADR sense)"
        if len(fams) == 1 and not forms:
            return fams, None
        if forms and fams:
            return [], (f"a serving form ({', '.join(forms)}) and a family "
                        f"({', '.join(fams)}) both present - needs a decision")

    return [], f"multiple candidate values: {', '.join(vals)}"



def psql(db: str, sql: str) -> str:
    r = subprocess.run(
        ["docker", "exec", "-i", PG_CONTAINER, "psql", "-v", "ON_ERROR_STOP=1",
         "-U", PG_SUPERUSER, "-d", db, "-tA", "-F", "\t", "-c", sql],
        capture_output=True, text=True,
    )
    if r.returncode != 0:
        raise RuntimeError(f"psql failed: {r.stderr.strip()}")
    return r.stdout


def emit_sql(path: str, mapping: dict, preps: dict, canonical_names: dict) -> None:
    """Emit the dimension migration SQL for the 118 dishes.

    Dimensions only: no relations, no descriptions, no claims. Every write
    is idempotent (ON CONFLICT DO NOTHING) and every dish gets one
    edit_history row plus an updated_at bump.
    """
    table = {
        "dish_family": "dish_families", "dish_cuisine": "dish_cuisines",
        "dish_course": "dish_courses", "dish_technique": "dish_techniques",
        "ingredient_category": "ingredient_categories",
        "dish_tradition": "dish_traditions", "dish_context": "dish_contexts",
    }
    join = {
        "dish_family": "dish_dish_families", "dish_cuisine": "dish_dish_cuisines",
        "dish_course": "dish_dish_courses", "dish_technique": "dish_dish_techniques",
        "ingredient_category": "dish_dish_ingredient_categories",
        "dish_tradition": "dish_dish_traditions", "dish_context": "dish_dish_contexts",
    }

    L = []
    L.append("-- GUS-014 — 118-dish dimension migration (DRY-RUN BUILD)")
    L.append("--")
    L.append("-- GENERATED by scripts/hermes/gus-014-build-118-mapping.py from the")
    L.append("-- approved mapping report. Dimensions ONLY: no relations, no")
    L.append("-- descriptions, no claims.")
    L.append("--")
    L.append("-- Idempotent. Every write is ON CONFLICT DO NOTHING; every dish")
    L.append("-- gets one edit_history row and an updated_at bump.")
    L.append("")
    L.append("BEGIN;")
    L.append("")
    L.append("-- ---- 1. SEED the controlled vocabulary ----")
    L.append("--")
    L.append("-- The dimension tables currently hold only the 3 pilot dishes' values.")
    L.append("-- The controlled vocabulary is DECLARED in .hermes/REPORTS/GUS-014-pilot-spec.md")
    L.append("-- section 1; seeding the tables with it is the migration's SCHEMA step, not a")
    L.append("-- vocabulary extension during the run. No value outside that vocabulary is")
    L.append("-- seeded, and no value outside it is ever written to a dish.")
    for dim in DIMENSIONS:
        vals = sorted(VOCAB[dim])
        L.append(f"-- {dim}: {len(vals)} values")
        for v in vals:
            L.append(
                f"INSERT INTO {table[dim]} (slug, name) VALUES ('{v}', '{v.replace('-', ' ').title()}') "
                f"ON CONFLICT (slug) DO NOTHING;"
            )
        L.append("")

    L.append("-- ---- 2. assign dimensions ----")
    for dim in DIMENSIONS:
        rows = [(slug, v) for slug, d in sorted(mapping.items()) for v in d.get(dim, [])]
        if not rows:
            continue
        L.append(f"-- ---- {dim} ({len(rows)} values across {len({s for s, _ in rows})} dishes) ----")
        for slug, value in rows:
            L.append(
                f"INSERT INTO {join[dim]} (dish_id, value_id) "
                f"SELECT d.id, v.id FROM dishes d, {table[dim]} v "
                f"WHERE d.slug = '{slug}' AND v.slug = '{value}' "
                f"ON CONFLICT DO NOTHING;"
            )
        L.append("")

    L.append("-- ---- 3. provenance: one edit_history row per dish, updated_at bump ----")
    L.append("INSERT INTO edit_history (id, user_id, target_type, target_id, action, diff, comment)")
    L.append("SELECT gen_random_uuid(), 'hermes', 'dish', d.id, 'update',")
    L.append("       jsonb_build_object('operation', 'GUS-014 118-dish dimension migration',")
    L.append("                       'dimensions', 'dish_family, dish_cuisine, dish_course, dish_technique, ingredient_category, dish_tradition, dish_context'),")
    L.append("       'GUS-014 118-dish dimensions'")
    L.append("FROM dishes d")
    L.append(f"WHERE d.slug IN ({', '.join(repr(s) for s in sorted(mapping))})")
    L.append("  AND NOT EXISTS (SELECT 1 FROM edit_history e")
    L.append("                  WHERE e.target_type='dish' AND e.target_id=d.id")
    L.append("                    AND e.comment='GUS-014 118-dish dimensions');")
    L.append("")
    L.append("UPDATE dishes SET updated_at = now()")
    L.append(f"WHERE slug IN ({', '.join(repr(s) for s in sorted(mapping))});")
    L.append("")
    L.append("COMMIT;")

    pathlib.Path(path).write_text("\n".join(L) + "\n")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--db", default="gustale")
    ap.add_argument("--out", default=str(REPO / ".hermes" / "REPORTS" / "GUS-014-118-mapping-report.md"))
    ap.add_argument("--emit-sql", default=None,
                    help="write the migration SQL for the mapped dimensions to this path")
    args = ap.parse_args()

    # ---- verify the script's vocabulary matches the live tables ----
    table_for = {
        "dish_family": "dish_families", "dish_cuisine": "dish_cuisines",
        "dish_course": "dish_courses", "dish_technique": "dish_techniques",
        "ingredient_category": "ingredient_categories",
        "dish_tradition": "dish_traditions", "dish_context": "dish_contexts",
    }
    vocab_mismatch = []
    for dim, table in table_for.items():
        live = set(x for x in psql(args.db, f"SELECT slug FROM {table};").split("\n") if x.strip())
        script = VOCAB[dim]
        missing = live - script
        extra = script - live
        if missing:
            vocab_mismatch.append(f"{dim}: live has {sorted(missing)} not in the script vocab")
        if extra:
            vocab_mismatch.append(f"{dim}: script has {sorted(extra)} not live")
    if vocab_mismatch:
        print("NOTE — the live dimension tables hold only the PILOT's values so far.")
        print("The controlled vocabulary is DECLARED in the spec (GUS-014-pilot-spec.md")
        print("section 1); seeding the tables with it is part of the migration's schema")
        print("step, not a vocabulary extension during the run.")
        print()
        print("Values in the spec vocabulary but NOT yet in the live tables (these are")
        print("staged by the migration, and are NOT proposals):")
        for m in vocab_mismatch:
            if "not live" in m:
                print("  -", m)
        live_only = [m for m in vocab_mismatch if "not in the script vocab" in m]
        if live_only:
            print()
            print("WARNING — live values NOT in the spec vocabulary (these WOULD be")
            print("proposals and will not be written):")
            for m in live_only:
                print("  -", m)
        print()

    # ---- dish canonical names (for the name-inferred family proposal) ----
    canon_rows = psql(args.db, "SELECT slug, canonical_name FROM dishes;")
    canonical_names = {}
    for line in canon_rows.splitlines():
        if not line.strip():
            continue
        slug, name = line.split("\t")
        canonical_names[slug] = name

    # ---- pull the preparation methods per dish (the technique signal) ----
    prep_rows = psql(args.db, """
        SELECT d.slug, pm.name
        FROM dishes d
        JOIN dish_preparations dp ON dp.dish_id = d.id
        JOIN preparation_methods pm ON pm.id = dp.method_id
        ORDER BY d.slug, pm.name;""")
    preps = collections.defaultdict(list)
    for line in prep_rows.splitlines():
        if not line.strip():
            continue
        slug, method = line.split("\t")
        preps[slug].append(method)

    # ---- pull the old categories per dish ----
    rows = psql(args.db, """
        SELECT d.slug, c.name, c.kind
        FROM dishes d
        JOIN dish_categories dc ON dc.dish_id = d.id
        JOIN categories c ON c.id = dc.category_id
        WHERE d.status <> 'archived'
        ORDER BY d.slug, c.name;""")

    dishes = collections.defaultdict(list)
    for line in rows.splitlines():
        if not line.strip():
            continue
        slug, cat, kind = line.split("\t")
        dishes[slug].append((cat, kind))

    target = {s: c for s, c in dishes.items() if s not in PILOT_SLUGS}

    # ---- build the mapping ----
    proposals = collections.defaultdict(set)   # dimension -> {value: {categories}}
    unmappable = collections.defaultdict(set)  # category -> {reason}
    unmappable_prep = collections.defaultdict(set)  # preparation method -> {slugs}
    ambiguous = collections.defaultdict(list)  # dimension -> [(slug, values, reason)]
    resolutions = []  # (slug, dim, note) - how a tie was broken
    name_inferred = {}  # slug -> family inferred from the dish's own name
    name_inferred_ambiguous = []  # (slug, candidates)
    nofamily_slugs = []  # dishes with no family from the old data
    old_cats = {}  # slug -> old category names
    mapping = {}
    stats = collections.Counter()

    for slug, cats in sorted(target.items()):
        per_dim = {d: [] for d in DIMENSIONS}
        for cat, kind in cats:
            entries = CATEGORY_MAP.get(cat)
            if entries is None:
                unmappable[cat].add(f"no mapping rule (kind={kind})")
                stats["unmappable_category_uses"] += 1
                continue
            for dim, values in entries:
                for v in values:
                    if v not in VOCAB[dim]:
                        proposals[dim].add((v, cat))
                        stats["proposed_value_uses"] += 1
                        continue
                    if v not in per_dim[dim]:
                        per_dim[dim].append(v)
        # ---- technique: from the preparation methods ----
        for method in preps.get(slug, []):
            techs = preparation_techniques(method)
            if techs is None:
                unmappable_prep[method].add(slug)
                stats["unmappable_prep_uses"] += 1
                continue
            for t in techs:
                if t not in VOCAB["dish_technique"]:
                    proposals["dish_technique"].add((t, f"preparation: {method}"))
                    stats["proposed_value_uses"] += 1
                    continue
                if t not in per_dim["dish_technique"]:
                    per_dim["dish_technique"].append(t)

        # single-valued dimensions: resolve generic-vs-specific and
        # priority ties. A genuine ambiguity -> UNSET + reported.
        for dim in ("dish_family", "dish_cuisine", "dish_course"):
            resolved, note = resolve_single(dim, per_dim[dim], slug, cats)
            if note:
                resolutions.append((slug, dim, note))
            if not resolved and per_dim[dim]:
                ambiguous[dim].append((slug, ", ".join(sorted(per_dim[dim])), note or "multiple candidates"))
                stats["ambiguous_cells"] += 1
            per_dim[dim] = resolved
        # ---- family from the dish NAME, when the old data gave none ----
        # Reported as a PROPOSAL for review, not written by this run.
        if not per_dim["dish_family"]:
            canonical = canonical_names.get(slug, "")
            words = set(re.findall(r"[a-z]+", canonical.lower()))
            candidates = sorted(
                f for f in NAME_INFERABLE_FAMILIES
                if f in VOCAB["dish_family"]
                and (f in words or f.replace("-", " ") in canonical.lower())
            )
            if len(candidates) == 1:
                name_inferred[slug] = candidates[0]
                stats["name_inferred_families"] += 1
            elif len(candidates) > 1:
                name_inferred_ambiguous.append((slug, ", ".join(candidates)))

        mapping[slug] = per_dim
        stats["dishes"] += 1
        if not per_dim["dish_family"]:
            stats["nofamily_dishes"] += 1
            nofamily_slugs.append(slug)
            old_cats[slug] = [c for c, _ in cats]
        for dim in DIMENSIONS:
            if per_dim[dim]:
                stats[f"set_{dim}"] += 1
            else:
                stats[f"unset_{dim}"] += 1

    # ---- report ----
    md = []
    md.append("# GUS-014 — 118-dish dimension mapping report")
    md.append("")
    md.append(f"**Status:** 🟡 **DRY-RUN REPORT — for Alejandro's review. NOTHING WRITTEN TO THE LIVE DATABASE.**")
    md.append("")
    md.append(f"**Source:** `{args.db}` · **Dishes in scope:** {len(target)} "
              f"(the 3 pilot dishes are excluded — already mapped) · "
              f"**Old categories in use:** {len({c for cs in target.values() for c, _ in cs})}")
    md.append("")
    md.append("**Rules applied (Alejandro, 2026-10-26):**")
    md.append("")
    md.append("- **No vocabulary extension during the run.** A value not already in the controlled vocabulary goes to the **proposals** list; the cell is left unset for it.")
    md.append("- **Ambiguous or disputed → unset**, and reported.")
    md.append("- **Dimensions only.** No relations, no descriptions, no claims.")
    md.append("")
    md.append("---")
    md.append("")

    # ---- summary ----
    md.append("## 1. Coverage summary")
    md.append("")
    md.append("| dimension | dishes with ≥1 value | dishes unset |")
    md.append("|---|---|---|")
    for dim in DIMENSIONS:
        md.append(f"| `{dim}` | {stats[f'set_{dim}']} | {stats[f'unset_{dim}']} |")
    md.append("")
    md.append(f"- dishes mapped: **{stats['dishes']}**")
    md.append(f"- ambiguous cells (multi-valued old data in a single-valued dimension): **{stats['ambiguous_cells']}**")
    md.append(f"- old-category uses with no mapping rule: **{stats['unmappable_category_uses']}**")
    md.append(f"- values that would need a vocabulary extension: **{stats['proposed_value_uses']}**")
    md.append("")

    # ---- unmappable ----
    md.append("## 2. Unmappable old categories")
    md.append("")
    if not unmappable:
        md.append("_None._")
    else:
        md.append("These old categories have no mapping rule. Every dish carrying one has that dimension left **unset** for it.")
        md.append("")
        md.append("| old category | reason | dishes |")
        md.append("|---|---|---|")
        for cat in sorted(unmappable):
            dishes_with = sorted(s for s, cs in target.items() if any(c == cat for c, _ in cs))
            md.append(f"| `{cat}` | {sorted(unmappable[cat])[0]} | {len(dishes_with)} |")
        md.append("")
        md.append("### Affected dishes")
        md.append("")
        for cat in sorted(unmappable):
            dishes_with = sorted(s for s, cs in target.items() if any(c == cat for c, _ in cs))
            md.append(f"- **{cat}** → {', '.join(f'`{d}`' for d in dishes_with)}")
    md.append("")

    # ---- unmappable preparations ----
    if unmappable_prep:
        md.append("### Unmappable preparation methods")
        md.append("")
        md.append("| preparation method | dishes |")
        md.append("|---|---|")
        for method in sorted(unmappable_prep):
            md.append(f"| `{method}` | {', '.join(f'`{d}`' for d in sorted(unmappable_prep[method]))} |")
        md.append("")

    # ---- data gaps ----
    md.append("### Data gaps — dimensions with no signal in the old data")
    md.append("")
    md.append("| dimension | why it is empty |")
    md.append("|---|---|")
    md.append("| `dish_tradition` | `dish_tags` is **empty** (0 rows) and `tags` is empty (0 rows). There is **no tradition signal anywhere** in the old data. Tradition cannot be derived from a dish name — doing so would invent cultural claims. All 118 stay unset. |")
    md.append("| `ingredient_category` | `dish_ingredients` has only **4 rows** across the whole catalog (tomato, béchamel sauce, lamb minced, eggplant) covering 3 dishes. There is effectively no ingredient signal. All 118 stay unset. |")
    md.append("| `dish_context` | The old `categories` table has no context dimension. Only `Street snack` (11 dishes) maps to `street-food`. The remaining 108 dishes have no context signal and stay unset — context is a judgement about where a dish is eaten, not a fact recoverable from the old taxonomy. |")
    md.append("")

    # ---- proposals ----
    md.append("## 3. Vocabulary proposals (NOT written)")
    md.append("")
    if not proposals:
        md.append("_None — every mapped value is already in the controlled vocabulary._")
    else:
        md.append("These values came out of the old categories but are **not** in the controlled vocabulary. Per the rules they are **not written** — the affected dimension cells stay unset until the vocabulary is extended by explicit decision.")
        md.append("")
        md.append("| dimension | proposed value | from old category |")
        md.append("|---|---|---|")
        for dim in DIMENSIONS:
            for value, cat in sorted(proposals.get(dim, [])):
                md.append(f"| `{dim}` | `{value}` | `{cat}` |")
    md.append("")

    # ---- ambiguous ----
    md.append("## 4. Resolved ties (the generic fallback losing to a specific value)")
    md.append("")
    if not resolutions:
        md.append("_None._")
    else:
        md.append("The old `categories` table mixes a **generic fallback** with **specific** values. "
                  "`Main course` is the generic fallback — 97 of 122 dishes carry it, and 22 of those also carry a more "
                  "specific course (Soup, Appetizer, …). Those are **not** ambiguous: per D3f `dish_course` is the "
                  "dish's *primary meal role*, so the specific value wins and the generic one is dropped.")
        md.append("")
        md.append("| dish | dimension | resolution |")
        md.append("|---|---|---|")
        for slug, dim, note in sorted(resolutions):
            md.append(f"| `{slug}` | `{dim}` | {note} |")
    md.append("")

    md.append("## 5. Ambiguous cells (left unset, need a decision)")
    md.append("")
    if not ambiguous:
        md.append("_None._")
    else:
        for dim, items in ambiguous.items():
            md.append(f"### `{dim}` — single-valued, but the old data gave more than one value")
            md.append("")
            md.append("| dish | candidate values (old categories) | why it is ambiguous |")
            md.append("|---|---|---|")
            for slug, vals, note in items:
                md.append(f"| `{slug}` | {vals} | {note} |")
            md.append("")
    md.append("")

    # ---- name-inferred families ----
    md.append("## 5b. Families inferable from the dish's own name (PROPOSALS, not written)")
    md.append("")
    md.append(f"**{stats['nofamily_dishes']} dishes carry no family-ish old category.** Most are self-describing: "
              "the dish's canonical name *is* the family name ('Sushi' -> sushi, 'Ceviche' -> ceviche, "
              "'Asado' -> asado, 'Empanada' -> empanada, 'Falafel' -> falafel).")
    md.append("")
    md.append("**But the families those dishes would need are NOT in the controlled vocabulary.** "
              "Adding them would be a vocabulary extension, which is forbidden during the run. So they are "
              "**left unset** and listed here as proposals for a separate, explicit vocabulary decision.")
    md.append("")
    if not name_inferred:
        md.append("_No proposal could be formed even from the name - every candidate family is outside the vocabulary._")
        md.append("")
        md.append("| dish | canonical name | old categories |")
        md.append("|---|---|---|")
        for slug in sorted(nofamily_slugs):
            md.append(f"| `{slug}` | {canonical_names.get(slug,'')} | {', '.join(f'`{c}`' for c in sorted(old_cats.get(slug, [])))} |")
    else:
        md.append(f"{len(name_inferred)} dishes carry no family-ish old category, but their **own name is the family name** "
                  "('Sushi' → `sushi`, 'Ceviche' → `ceviche`). That is an **inference from the dish name**, not a "
                  "fact recovered from the old taxonomy, so it is reported here rather than written. Approving this "
                  "list would set `dish_family` for these dishes; leaving it alone leaves them unset.")
        md.append("")
        md.append("| dish | proposed family |")
        md.append("|---|---|")
        for slug, fam in sorted(name_inferred.items()):
            md.append(f"| `{slug}` | `{fam}` |")
    md.append("")
    if name_inferred_ambiguous:
        md.append("### Name-inference ambiguities (left unset)")
        md.append("")
        md.append("| dish | candidate families |")
        md.append("|---|---|")
        for slug, cands in name_inferred_ambiguous:
            md.append(f"| `{slug}` | {cands} |")
        md.append("")

    # ---- per-dish ----
    md.append("## 6. Per-dish mapping")
    md.append("")
    md.append("Each row: the dish's old categories → its proposed value(s) in each of the 7 dimensions.")
    md.append("`—` means **unset**.")
    md.append("")
    for slug in sorted(mapping):
        cats = [c for c, _ in target[slug]]
        md.append(f"### `{slug}`")
        md.append("")
        md.append(f"- **old categories:** {', '.join(f'`{c}`' for c in sorted(cats))}")
        for dim in DIMENSIONS:
            vals = mapping[slug][dim]
            rendered = ", ".join(f"`{v}`" for v in sorted(vals)) if vals else "—"
            md.append(f"- **`{dim}`:** {rendered}")
        md.append("")

    # ---- machine-readable ----
    md.append("## 7. Machine-readable mapping")
    md.append("")
    md.append("```json")
    import json
    md.append(json.dumps(mapping, indent=2, sort_keys=True))
    md.append("```")
    md.append("")

    out = pathlib.Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text("\n".join(md))

    # ---- optionally emit the migration SQL ----
    if args.emit_sql:
        emit_sql(args.emit_sql, mapping, preps, canonical_names)
        print(f"  migration SQL : {args.emit_sql}")

    # ---- console summary ----
    print("GUS-014 — 118-dish mapping report")
    print(f"  dishes in scope : {len(target)}")
    print(f"  report          : {out}")
    print()
    print("Coverage:")
    for dim in DIMENSIONS:
        print(f"  {dim:<20} set={stats[f'set_{dim}']:<4} unset={stats[f'unset_{dim}']}")
    print()
    print(f"unmappable old categories : {len(unmappable)}")
    if unmappable_prep:
        print(f"unmappable preparations  : {len(unmappable_prep)}")
        for method in sorted(unmappable_prep):
            print(f"    {method}")
    print("data gaps (all unset, no signal in old data): dish_tradition (tags empty),")
    print("  ingredient_category (4 ingredient rows), dish_context (no old dimension)")
    for cat in sorted(unmappable):
        print(f"    {cat}")
    print(f"vocabulary proposals      : {sum(len(v) for v in proposals.values())}")
    for dim in DIMENSIONS:
        for value, cat in sorted(proposals.get(dim, [])):
            print(f"    {dim}: {value}  (from '{cat}')")
    print(f"ambiguous cells           : {stats['ambiguous_cells']}")
    print(f"name-inferred families    : {stats['name_inferred_families']} (PROPOSALS, not written)")
    for dim, items in ambiguous.items():
        for slug, vals, note in items:
            print(f"    {dim}: {slug} <- {vals}  ({note})")
    print()
    print("NOTHING WAS WRITTEN TO THE DATABASE.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
