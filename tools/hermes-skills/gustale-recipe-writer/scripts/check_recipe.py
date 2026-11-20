#!/usr/bin/env python3
"""check_recipe.py: check a Gustale recipe record (The Working Record v2).

Usage:
  python3 check_recipe.py RECORD.json [--schema recipe-record.schema.json] [--only-locale en]
                                      [--sources-dir DIR]

Runs the JSON Schema (when the jsonschema package is installed), then the
cross-field rules the schema cannot express: matching keys across locales,
timeline sums, key-moment count, cue inside step text, word budgets, banned
words, source references and the HIGH-confidence conditions.

Exit code 0 = no errors (warnings allowed). 1 = errors. 2 = unreadable input.
Word budgets are errors for "en" and warnings for other languages.
"""
import argparse
import json
import re
import sys
from pathlib import Path

# ---------------------------------------------------------------- budgets
BUDGETS = {                      # words per locale: (min, max)
    "record": (40, 80),
    "before_you_start": (30, 100),   # preconditions + key moments
    "method": (150, 400),            # step texts + failure clauses
    "failures": (40, 130),
    "variations": (20, 110),
    "storage": (0, 50),
    "evidence": (20, 70),            # per-source lines + note
}
STEP_MAX_WORDS = 40
STEP_MAX_SENTENCES = 2
FAILURE_CLAUSE_MAX = 15
KEY_MOMENT_MAX = 20
KEY_MOMENTS_RANGE = (2, 3)
MAX_STEP_IMAGES = 3

# ---------------------------------------------------------------- word lists
# Starter lists. Extend per language; patterns are case-insensitive.
BANNED = {
    "en": [
        r"\bsimply\b", r"\bjust\b", r"\beas(y|ily)\b", r"\bdelicious\b", r"\btasty\b",
        r"\bamazing\b", r"\bmouth-?watering\b", r"\bperfect(ly)?\b", r"\bfool-?proof\b",
        r"\bfail-?proof\b", r"\bguaranteed\b", r"\bwonderful\b", r"\bbeautiful(ly)?\b",
        r"\bbest[- ]ever\b", r"\bthe best\b", r"\byour favou?rite\b", r"\belevat(e|es|ed|ing)\b",
        r"\bgame[- ]changer\b", r"\bto die for\b", r"\blet'?s dive in\b", r"\bwhether you'?re\b",
        r"\bnestled\b", r"\bsymphony\b", r"\bnext level\b",
        r"\buntil (done|cooked( through)?|golden)\s*([.,;)]|$)", r"^\s*(note|tip)\s*:",
    ],
    "de": [r"\beinfach\b", r"\blecker\b", r"\bköstlich\b", r"\bperfekt\b", r"\bgelingsicher\b",
           r"\bkinderleicht\b", r"\bunwiderstehlich\b", r"\bsuper\b"],
    "es": [r"\bsimplemente\b", r"\bfácil(es)?\b", r"\bdelicios[oa]s?\b", r"\bperfect[oa]s?\b",
           r"\briquísim[oa]s?\b", r"\bexquisit[oa]s?\b"],
    "fi": [r"\bhelppo\b", r"\bhelposti\b", r"\bherkullinen\b", r"\btäydellinen\b", r"\bihana\b"],
    "id": [r"\bmudah\b", r"\blezat\b", r"\benak banget\b", r"\bsempurna\b", r"\bdijamin\b"],
}
ATTRIBUTE_ONLY = {   # allowed only when a cited source says so; flagged for the verifier
    "en": [r"\btraditional(ly)?\b", r"\bauthentic\b", r"\boriginal\b", r"\bhomemade\b"],
    "de": [r"\btraditionell\b", r"\bauthentisch\b", r"\boriginal\b", r"\bhausgemacht\b"],
    "es": [r"\btradicional\b", r"\baut[ée]ntic[oa]\b", r"\boriginal\b", r"\bcaser[oa]\b"],
}
SALT_PEPPER = re.compile(r"\b(salt|pepper|salz|pfeffer|sal|pimienta|suola|pippuri|garam|merica)\b", re.I)


class Report:
    def __init__(self):
        self.errors, self.warnings = [], []

    def err(self, where, msg):
        self.errors.append(f"ERROR {where}: {msg}")

    def warn(self, where, msg):
        self.warnings.append(f"WARN  {where}: {msg}")


def words(text):
    return len(re.findall(r"[\w°½¼¾⅛⅓⅔]+(?:[-'’][\w]+)*", text or ""))


def sentences(text):
    t = re.sub(r"\b(e\.g|i\.e|approx|ca|min|hr|no)\.", "x", text or "", flags=re.I)
    return max(1, len(re.findall(r"[.!?](?=\s|$)", t.strip())))


def keys(items, field="key"):
    return [i[field] for i in items]


def dupes(lst):
    seen, out = set(), set()
    for x in lst:
        (out if x in seen else seen).add(x)
    return out


def stem_words(name):
    return [w[:5] for w in re.findall(r"[^\W\d_]{3,}", name.lower())]


# ---------------------------------------------------------------- record-level checks
def check_record(rec, rep):
    secs = keys(rec["sections"])
    ings = keys(rec["ingredients"])
    steps = keys(rec["steps"])
    fails = keys(rec["failures"])
    vars_ = keys(rec["variations"])
    subs = keys(rec.get("substitutes", []))
    equip = keys(rec.get("equipment", []))
    imgs = keys(rec["images"])
    tl = keys(rec["timeline"])
    srcs = keys(rec["sources"], "id")

    for name, lst in [("sections", secs), ("ingredients", ings), ("steps", steps),
                      ("failures", fails), ("variations", vars_), ("substitutes", subs),
                      ("equipment", equip), ("images", imgs), ("timeline", tl), ("sources", srcs)]:
        for d in dupes(lst):
            rep.err(name, f"duplicate key '{d}'")

    src_set = set(srcs)

    def cite(where, ids, required=True):
        if required and not ids:
            rep.err(where, "no source_ids")
        for i in ids:
            if i not in src_set:
                rep.err(where, f"unknown source '{i}'")

    # sources
    bases = [s for s in rec["sources"] if s["role"] == "base"]
    if len(bases) != 1:
        rep.err("sources", f"exactly one base source required, found {len(bases)}")
    elif bases[0]["id"] != rec["base_source_id"]:
        rep.err("base_source_id", "does not match the source with role 'base'")
    for s in rec["sources"]:
        if not s.get("url") and not s.get("isbn"):
            rep.warn(f"sources.{s['id']}", "no url or isbn")

    # ingredients
    for i in rec["ingredients"]:
        w = f"ingredients.{i['key']}"
        if i["section"] not in secs:
            rep.err(w, f"unknown section '{i['section']}'")
        if (i["quantity"] is None) != (i["unit"] is None):
            rep.err(w, "quantity and unit go together (use unit 'piece' for countable items)")
        cite(w, i["source_ids"], required=i["quantity"] is not None)
        if i["ingredient_id"] is None:
            rep.warn(w, "no Atlas ingredient_id (blocks HIGH)")

    # substitutes
    for s in rec.get("substitutes", []):
        w = f"substitutes.{s['key']}"
        if s["for"] not in ings and s["for"] not in secs:
            rep.err(w, f"'for' must be an ingredient or section key, got '{s['for']}'")
        cite(w, s["source_ids"])

    # steps
    for s in rec["steps"]:
        w = f"steps.{s['key']}"
        if s["section"] not in secs:
            rep.err(w, f"unknown section '{s['section']}'")
        if "time_min" in s and "time_max" in s and s["time_min"] > s["time_max"]:
            rep.err(w, "time_min > time_max")
        if "time_max" in s and "time_min" not in s:
            rep.err(w, "time_max without time_min")
        if "image" in s and s["image"] not in imgs:
            rep.err(w, f"unknown image '{s['image']}'")
        if "dispute" in s:
            v = next((x for x in rec["variations"] if x["key"] == s["dispute"]), None)
            if not v or v["kind"] != "dispute":
                rep.err(w, f"'dispute' must name a variation of kind 'dispute', got '{s['dispute']}'")
        cite(w, s["source_ids"])

    km = [s["key"] for s in rec["steps"] if s["key_moment"]]
    lo, hi = KEY_MOMENTS_RANGE
    if not lo <= len(km) <= hi:
        rep.err("steps", f"{len(km)} key moments; need {lo}-{hi}")

    # failures, variations, storage
    for f in rec["failures"]:
        w = f"failures.{f['key']}"
        if "step" in f and f["step"] not in steps:
            rep.err(w, f"unknown step '{f['step']}'")
        cite(w, f["source_ids"])
    if len(rec["failures"]) < 2:
        rep.warn("failures", "only one entry: the recipe cannot be HIGH")

    kinds = [v["kind"] for v in rec["variations"]]
    if "none_recorded" in kinds and len(kinds) > 1:
        rep.err("variations", "'none_recorded' must be the only entry")
    for v in rec["variations"]:
        w = f"variations.{v['key']}"
        if v["kind"] == "filed_separately" and not v.get("recipe_slug"):
            rep.err(w, "filed_separately needs recipe_slug")
        cite(w, v["source_ids"], required=v["kind"] != "none_recorded")
    if "storage" in rec:
        cite("storage", rec["storage"]["source_ids"])

    # timeline and times
    t = rec["times"]
    total = sum(x["minutes"] for x in rec["timeline"])
    active = sum(x["minutes"] for x in rec["timeline"] if x["mode"] == "active")
    if total != t["total_min"]:
        rep.err("timeline", f"segments sum to {total} min, times.total_min is {t['total_min']}")
    if active != t["active_min"]:
        rep.err("timeline", f"active segments sum to {active} min, times.active_min is {t['active_min']}")
    if t.get("cook_min", 0) > t["total_min"]:
        rep.err("times", "cook_min exceeds total_min")

    # images
    heroes = [i for i in rec["images"] if i["role"] == "hero"]
    step_imgs = [i for i in rec["images"] if i["role"] == "step"]
    if len(heroes) != 1:
        rep.err("images", f"exactly one hero required, found {len(heroes)}")
    if len(step_imgs) > MAX_STEP_IMAGES:
        rep.err("images", f"{len(step_imgs)} step images; max {MAX_STEP_IMAGES}")
    step_by_key = {s["key"]: s for s in rec["steps"]}
    for i in rec["images"]:
        w = f"images.{i['key']}"
        if not i["reuse_atlas_image"] and not i["prompt"]:
            rep.err(w, "needs a prompt unless reuse_atlas_image is true")
        if i["role"] == "step":
            st = step_by_key.get(i.get("step"))
            if not st:
                rep.err(w, "step image must name an existing step")
            elif st.get("image") != i["key"]:
                rep.err(w, f"step '{st['key']}' does not point back to this image")
            elif not st["key_moment"]:
                rep.warn(w, "step image on a step that is not a key moment; keep only if words can't carry the cue")
        if i["role"] == "hero" and i.get("step"):
            rep.err(w, "hero image cannot belong to a step")

    # HIGH-confidence conditions
    if rec["agent"]["confidence"] == "HIGH":
        if any(s["cue_missing"] for s in rec["steps"]):
            rep.err("agent.confidence", "HIGH with a missing cue")
        if len(rec["failures"]) < 2:
            rep.err("agent.confidence", "HIGH with fewer than 2 failure entries")
        if sum(1 for s in rec["sources"] if s["independent"]) < 2:
            rep.err("agent.confidence", "HIGH needs at least 2 independent sources")
        if any(i["ingredient_id"] is None for i in rec["ingredients"]):
            rep.err("agent.confidence", "HIGH with an ingredient missing its Atlas id")
    for s in rec["steps"]:
        if s["cue_missing"] and not any(s["key"] in g for g in rec["agent"]["gaps"]):
            rep.warn(f"steps.{s['key']}", "cue_missing but the step is not named in agent.gaps")

    return dict(secs=secs, ings=ings, steps=steps, fails=fails, vars=vars_, subs=subs,
                equip=equip, imgs=imgs, tl=tl, srcs=srcs, km=km)


# ---------------------------------------------------------------- locale checks
def all_prose(L):
    yield "title", L["title"]
    yield "summary", L["summary"]
    yield "record", L["record"]
    for n, p in enumerate(L["preconditions"]):
        yield f"preconditions[{n}]", p
    for field in ("key_moments", "timeline", "sections", "equipment", "failures", "variations"):
        for k, v in (L.get(field) or {}).items():
            yield f"{field}.{k}", v
    for k, v in L["ingredients"].items():
        for f in ("name", "prep_note", "quantity_text"):
            if v.get(f):
                yield f"ingredients.{k}.{f}", v[f]
    for k, v in (L.get("substitutes") or {}).items():
        yield f"substitutes.{k}.name", v["name"]
        if v["note"]:
            yield f"substitutes.{k}.note", v["note"]
    for k, v in L["steps"].items():
        yield f"steps.{k}.text", v["text"]
        if v.get("failure"):
            yield f"steps.{k}.failure", v["failure"]
    if L.get("storage"):
        yield "storage", L["storage"]
    for k, v in L["evidence"]["sources"].items():
        yield f"evidence.sources.{k}", v
    yield "evidence.note", L["evidence"]["note"]
    for k, v in L["images"].items():
        yield f"images.{k}.alt", v["alt"]
        if v.get("caption"):
            yield f"images.{k}.caption", v["caption"]


def check_locale(rec, lang, L, K, rep):
    P = f"locales.{lang}"
    budget = rep.err if lang == "en" else rep.warn

    def need(field, expected):
        got = set((L.get(field) or {}).keys())
        exp = set(expected)
        for m in sorted(exp - got):
            rep.err(f"{P}.{field}", f"missing '{m}'")
        for x in sorted(got - exp):
            rep.err(f"{P}.{field}", f"'{x}' has no matching data item")

    need("sections", K["secs"])
    need("timeline", K["tl"])
    need("ingredients", K["ings"])
    need("substitutes", K["subs"])
    need("equipment", K["equip"])
    need("steps", K["steps"])
    need("key_moments", K["km"])
    need("failures", K["fails"])
    need("variations", K["vars"])
    need("images", K["imgs"])
    ev = set(L["evidence"]["sources"])
    for m in sorted(set(K["srcs"]) - ev):
        rep.err(f"{P}.evidence.sources", f"missing '{m}'")
    for x in sorted(ev - set(K["srcs"])):
        rep.err(f"{P}.evidence.sources", f"unknown source '{x}'")
    if ("storage" in rec) != bool(L.get("storage")):
        rep.err(f"{P}.storage", "storage text and storage data must appear together")

    # record
    first = L["title"].split("—")[0].split(",")[0].strip().lower()
    rec_text = L["record"].strip()
    if first and rec_text.lower().startswith(first):
        rep.warn(f"{P}.record", "opens with the dish name")
    if re.match(r"^(it\s+)?is\s+(a|an|the)\b", rec_text, re.I):
        rep.warn(f"{P}.record", "opens with 'is a/the'")
    n = sentences(rec_text)
    if not 2 <= n <= 4:
        budget(f"{P}.record", f"{n} sentences; need 2-4")

    def check_budget(name, count):
        lo, hi = BUDGETS[name]
        if not lo <= count <= hi:
            budget(f"{P}.{name}", f"{count} words; budget {lo}-{hi}")

    check_budget("record", words(rec_text))
    check_budget("before_you_start",
                 sum(words(p) for p in L["preconditions"]) + sum(words(v) for v in L["key_moments"].values()))
    for k, v in L["key_moments"].items():
        if words(v) > KEY_MOMENT_MAX:
            budget(f"{P}.key_moments.{k}", f"{words(v)} words; max {KEY_MOMENT_MAX}")

    # steps
    step_data = {s["key"]: s for s in rec["steps"]}
    method_words = 0
    for k, v in L["steps"].items():
        w = f"{P}.steps.{k}"
        text = v["text"]
        method_words += words(text) + words(v.get("failure", ""))
        if words(text) > STEP_MAX_WORDS:
            budget(w, f"{words(text)} words; max {STEP_MAX_WORDS}")
        if sentences(text) > STEP_MAX_SENTENCES:
            budget(w, f"{sentences(text)} sentences; max {STEP_MAX_SENTENCES}")
        if v.get("failure") and words(v["failure"]) > FAILURE_CLAUSE_MAX:
            budget(w, f"failure clause {words(v['failure'])} words; max {FAILURE_CLAUSE_MAX}")
        sd = step_data.get(k)
        if sd and sd["cue_missing"] and v["cue"] is not None:
            rep.err(w, "cue_missing is true but a cue is given")
        if v["cue"] is not None and v["cue"] not in text:
            rep.err(w, "cue is not an exact substring of text")
        if re.search(r"\bto taste\b", text, re.I):
            rep.err(w, "'to taste' belongs in the ingredient list, salt and pepper only")
    check_budget("method", method_words)

    # failures
    for k, v in L["failures"].items():
        if lang == "en" and not v.startswith("If "):
            rep.warn(f"{P}.failures.{k}", "should start 'If the ...'")
    check_budget("failures", sum(words(v) for v in L["failures"].values()))
    check_budget("variations", sum(words(v) for v in L["variations"].values()))
    if L.get("storage"):
        check_budget("storage", words(L["storage"]))
    check_budget("evidence", sum(words(v) for v in L["evidence"]["sources"].values()) + words(L["evidence"]["note"]))

    # ingredients: quantity_text, to taste, used in method
    ing_data = {i["key"]: i for i in rec["ingredients"]}
    method_text = " ".join(v["text"] for v in L["steps"].values()).lower()
    method_stems = " ".join(w[:5] for w in re.findall(r"[^\W\d_]{3,}", method_text))
    for k, v in L["ingredients"].items():
        w = f"{P}.ingredients.{k}"
        d = ing_data.get(k)
        if d and d["quantity"] is None and not v.get("quantity_text"):
            rep.err(w, "no quantity and no quantity_text")
        if d and d["quantity"] is not None and v.get("quantity_text"):
            rep.err(w, "quantity_text only where there is no number")
        qt = v.get("quantity_text", "")
        if re.search(r"to taste", qt, re.I) and not SALT_PEPPER.search(v["name"]):
            rep.err(w, "'to taste' only for salt and pepper")
        if not any(s in method_stems.split() for s in stem_words(v["name"])):
            rep.warn(w, f"'{v['name']}' not found in the method text (check it is used)")

    # banned words, attribution words, exclamation marks
    banned = [re.compile(p, re.I | re.M) for p in BANNED.get(lang, [])]
    attrib = [re.compile(p, re.I) for p in ATTRIBUTE_ONLY.get(lang, [])]
    if lang not in BANNED:
        rep.warn(P, f"no banned-word list for '{lang}'; add one to BANNED")
    for where, text in all_prose(L):
        if "!" in text or "¡" in text:
            rep.err(f"{P}.{where}", "exclamation mark")
        for rx in banned:
            m = rx.search(text)
            if m:
                rep.err(f"{P}.{where}", f"banned: '{m.group(0).strip()}'")
        for rx in attrib:
            m = rx.search(text)
            if m:
                rep.warn(f"{P}.{where}", f"'{m.group(0)}' is allowed only when a cited source says so")


# ---------------------------------------------------------------- originality
# Numbers and units are dropped before comparing, so shared facts ("220 °C",
# "10–12 minutes") never count as copying; only shared wording does.
UNIT_TOKENS = {"c", "f", "g", "kg", "ml", "l", "cm", "mm", "in", "inch", "inches", "tsp", "tbsp",
               "min", "mins", "minute", "minutes", "h", "hr", "hrs", "hour", "hours", "x"}
STOP = {"the", "a", "an", "and", "or", "of", "to", "in", "on", "for", "with", "until", "it", "is",
        "then", "into", "each", "at", "as", "by", "from", "over", "them", "they", "this", "that"}
COPY_ERROR_RUN = 8     # shared words in a row: error
COPY_WARN_RUN = 6      # shared words in a row with 3+ content words: warning


def wording_tokens(text):
    toks = re.findall(r"[^\W_]+", (text or "").lower())
    return [t for t in toks if not t.isdigit() and t not in UNIT_TOKENS and not re.fullmatch(r"[½¼¾⅛⅓⅔]+", t)]


def grams(toks, n):
    return {tuple(toks[i:i + n]) for i in range(len(toks) - n + 1)}


def check_originality(lang, L, sources_dir, rep):
    files = sorted(Path(sources_dir).glob("*.txt"))
    if not files:
        rep.warn("originality", f"no .txt source texts in {sources_dir}; originality not checked")
        return
    idx_err, idx_warn = {}, {}
    for f in files:
        toks = wording_tokens(f.read_text(encoding="utf-8", errors="ignore"))
        for g in grams(toks, COPY_ERROR_RUN):
            idx_err.setdefault(g, f.stem)
        for g in grams(toks, COPY_WARN_RUN):
            idx_warn.setdefault(g, f.stem)
    P = f"locales.{lang}"
    for where, text in all_prose(L):
        toks = wording_tokens(text)
        hit = next((g for g in grams(toks, COPY_ERROR_RUN) if g in idx_err), None)
        if hit:
            rep.err(f"{P}.{where}", f"copies wording from source '{idx_err[hit]}': \"{' '.join(hit)}\"; rewrite in Gustale's own words")
            continue
        hit = next((g for g in grams(toks, COPY_WARN_RUN)
                    if g in idx_warn and sum(t not in STOP for t in g) >= 3), None)
        if hit:
            rep.warn(f"{P}.{where}", f"close to source '{idx_warn[hit]}': \"{' '.join(hit)}\"; consider rewording")


# ---------------------------------------------------------------- main
def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("record")
    ap.add_argument("--schema", default=str(Path(__file__).with_name("recipe-record.schema.json")))
    ap.add_argument("--only-locale", help="check one locale and skip the 'source language and en present' rule")
    ap.add_argument("--sources-dir", help="folder of <source-id>.txt files (the sources' own text, never published); "
                                          "prose sharing 8+ words in a row with any of them is an error")
    a = ap.parse_args()

    try:
        rec = json.loads(Path(a.record).read_text(encoding="utf-8"))
    except Exception as e:  # noqa: BLE001
        print(f"ERROR cannot read {a.record}: {e}")
        return 2

    rep = Report()

    # 1. schema
    try:
        import jsonschema
        schema = json.loads(Path(a.schema).read_text(encoding="utf-8"))
        v = jsonschema.Draft202012Validator(schema, format_checker=jsonschema.FormatChecker())
        schema_errors = sorted(v.iter_errors(rec), key=lambda e: list(e.absolute_path))
        for e in schema_errors:
            path = ".".join(str(p) for p in e.absolute_path) or "(root)"
            rep.err(f"schema {path}", e.message)
        if schema_errors:
            print("\n".join(rep.errors))
            print(f"\n{len(rep.errors)} schema error(s); fix these before the cross-field checks run.")
            return 1
    except ImportError:
        rep.warn("schema", "jsonschema not installed (pip install jsonschema); schema not checked")
    except FileNotFoundError:
        rep.warn("schema", f"schema file not found: {a.schema}")

    # 2. cross-field
    K = check_record(rec, rep)
    locs = rec["locales"]
    if a.only_locale:
        if a.only_locale not in locs:
            rep.err("locales", f"no locale '{a.only_locale}'")
            targets = []
        else:
            targets = [a.only_locale]
    else:
        targets = list(locs)
        if rec["source_language"] not in locs:
            rep.err("locales", f"source language '{rec['source_language']}' is missing; it is written first")
        if "en" not in locs:
            rep.err("locales", "English locale is missing")
    for lang in targets:
        check_locale(rec, lang, locs[lang], K, rep)
        if a.sources_dir:
            check_originality(lang, locs[lang], a.sources_dir, rep)
    if not a.sources_dir:
        rep.warn("originality", "run with --sources-dir to check wording against the sources")

    for line in rep.errors + rep.warnings:
        print(line)
    status = "FAIL" if rep.errors else "PASS"
    print(f"\n{status}: {len(rep.errors)} error(s), {len(rep.warnings)} warning(s), "
          f"confidence proposed {rec['agent']['confidence']}")
    return 1 if rep.errors else 0


if __name__ == "__main__":
    sys.exit(main())
