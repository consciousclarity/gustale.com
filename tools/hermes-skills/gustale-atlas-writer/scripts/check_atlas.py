#!/usr/bin/env python3
"""check_atlas.py: check a Gustale Atlas record (dish, family or lineage), The Working Record, Atlas 1.0.

Usage:
  python3 check_atlas.py RECORD.json [--schema atlas-record.schema.json] [--sources-dir DIR]

Runs the JSON Schema (when jsonschema is installed), then the rules the schema
cannot express:
  - every dish sentence is anchored to a statement; every statement has a supporting citation
  - family and lineage sentences cite sources
  - wording follows the evidence (origin words need an origin claim; "Documented" needs S1/S2)
  - a family is a classification: no ancestry wording
  - resemblance connections carry no history; directional ones carry a source and a direction
  - word budgets, banned words, exclamation marks
  - originality against the sources' own text (--sources-dir)
Exit code 0 = no errors (warnings allowed), 1 = errors, 2 = unreadable input.
"""
import argparse
import json
import re
import sys
from pathlib import Path

# ---------------------------------------------------------------- budgets (English words)
B = {
    "dish.intro": (35, 70), "dish.intro.sentences": (2, 3),
    "dish.about": (80, 250),
    "place.explanation": 25,
    "chapter.title": 8, "chapter.label": 45, "chapter.scope_note": 30,
    "movement.label": 20,
    "connection.reason": 20,
    "variant.explanation": 20,
    "family.description": (25, 60),
    "lineage.short": 30, "lineage.concept": (30, 70), "lineage.origin": (0, 70),
    "lineage.long": (120, 300), "lineage.uncertainty": 50, "lineage.cultural": 50,
    "member.explanation": 30,
    "excerpt": 25,
}

BANNED = [
    r"\bsimply\b", r"\bjust\b", r"\beas(y|ily)\b", r"\bdelicious\b", r"\btasty\b", r"\bamazing\b",
    r"\bmouth-?watering\b", r"\bperfect(ly)?\b", r"\bwonderful\b", r"\bbeautiful(ly)?\b",
    r"\bbest[- ]ever\b", r"\bthe best\b", r"\byour favou?rite\b", r"\belevat(e|es|ed|ing)\b",
    r"\bgame[- ]changer\b", r"\bto die for\b", r"\blet'?s dive in\b", r"\bwhether you'?re\b",
    r"\bnestled\b", r"\bsymphony\b", r"\bnext level\b",
    # Atlas: exoticising, ownership and folklore framing
    r"\bexotic\b", r"\bethnic\b", r"\bquintessential\b", r"\biconic\b", r"\bbeloved\b",
    r"\bworld[- ]famous\b", r"\bmost famous\b", r"\bsince time immemorial\b", r"\blegend has it\b",
    r"\bit is said\b", r"\bfor centuries\b", r"\bfor millennia\b", r"\bage-old\b",
]
ATTRIBUTE_ONLY = [r"\btraditional(ly)?\b", r"\bauthentic\b", r"\boriginal\b", r"\bhomemade\b",
                  r"\bnational dish\b", r"\bthe oldest\b", r"\bancient\b"]
ORIGIN_WORDS = re.compile(r"\b(originat\w*|invent\w*|birthplace|created by|first (made|created|cooked|recorded|appeared))\b", re.I)
HISTORY_WORDS = re.compile(r"\b(descend\w*|derived?|ancestor\w*|originat\w*|influenc\w*|spread|introduc\w*|"
                           r"brought|migrat\w*|evolved|invent\w*|birthplace|came from|predecessor)\b", re.I)
DIRECTION_WORDS = re.compile(r"\b(from|into|led to|gave rise|spread to|became|evolved)\b", re.I)
FAKE_HISTORY_IMAGE = re.compile(r"\b(historical photo\w*|period photo\w*|vintage photo\w*|engraving|manuscript|"
                                r"old document|archival|sepia|daguerreotype|woodcut|antique print)\b", re.I)
ORIGIN_PREDICATES = {"originated_in", "originated_at", "created_by"}
DIRECTIONAL = {"ancestor", "developed_from", "adapted_from", "influenced_by", "regional_variant_of", "diaspora"}
# Symmetric (undirected) relation types. `family` is a CLASSIFICATION, not a
# resemblance, but it carries no direction claim, so it is grouped with the
# undirected types here. The vocabulary spells itself two ways — two slugs use
# a hyphen where the rest use an underscore — and the live data uses both, so
# both are accepted (apps/web/src/lib/relationship-grammar.ts says the same).
RESEMBLANCE = {
    "similar_form", "similar_technique", "often_compared_with", "family",
    "shared-ingredient", "shared_ingredient", "similar-serving", "similar_serving",
    "regional-cousin", "shared-method",
}
TRANSMISSION_ROLES = {"ancestor", "descendant", "adaptation", "fusion", "diaspora_adaptation",
                      "trade_route_spread", "colonial_spread", "regional_variant"}
RESEMBLANCE_ROLES = {"cousin", "technique_relative", "ingredient_relative", "parallel_evolution"}
QUALIFYING_TIERS = {"S1", "S2", "S3", "S4", "S5"}
PRIMARY_OR_SCHOLARLY = {"S1", "S2"}


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
    t = re.sub(r"\b(e\.g|i\.e|c|ca|approx|no|St|Dr|Mr|Mrs)\.", "x", text or "")
    return max(1, len(re.findall(r"[.!?](?=\s|$)", t.strip())))


def dupes(lst):
    seen, out = set(), set()
    for x in lst:
        (out if x in seen else seen).add(x)
    return out


def span(rep, where, n, rng):
    lo, hi = rng if isinstance(rng, tuple) else (0, rng)
    if not lo <= n <= hi:
        rep.err(where, f"{n} words; budget {lo}-{hi}" if lo else f"{n} words; max {hi}")


# ---------------------------------------------------------------- shared
def check_sources(rec, rep):
    ids = [s["id"] for s in rec["sources"]]
    for d in dupes(ids):
        rep.err("sources", f"duplicate id '{d}'")
    for s in rec["sources"]:
        if not s.get("url") and not s.get("isbn"):
            rep.warn(f"sources.{s['id']}", "no url or isbn")
    return {s["id"]: s for s in rec["sources"]}


def cite(rep, where, ids, src, required=True):
    if required and not ids:
        rep.err(where, "no source_ids")
    for i in ids or []:
        if i not in src:
            rep.err(where, f"unknown source '{i}'")


def qualifying(ids, src):
    return [i for i in ids if i in src and src[i]["tier"] in QUALIFYING_TIERS]


def prose_items(rec):
    """(where, text) for every piece of prose in the record."""
    k = rec["kind"]
    if k == "dish":
        for s in rec["intro"]:
            yield f"intro.{s['key']}", s["text"]
        for s in rec.get("about", []):
            yield f"about.{s['key']}", s["text"]
        for p in rec["places"]:
            yield f"places.{p['key']}", p["explanation"]
        for c in rec["history"]["chapters"]:
            for f in ("title", "label", "scope_note"):
                yield f"history.{c['key']}.{f}", c[f]
        for m in rec["history"]["movements"]:
            yield f"movements.{m['key']}", m["label"]
        for c in rec["connections"]:
            yield f"connections.{c['key']}", c["reason"]
        for v in rec["variants"]:
            yield f"variants.{v['key']}", v["explanation"]
    elif k == "family":
        for s in rec["description"]:
            yield f"description.{s['key']}", s["text"]
    else:
        yield "short_description", rec["short_description"]["text"]
        for f in ("concept_summary", "origin_summary", "long_description"):
            for s in rec[f]:
                yield f"{f}.{s['key']}", s["text"]
        for f in ("uncertainty_note", "cultural_practice_note"):
            if rec.get(f):
                yield f, rec[f]["text"]
        for m in rec["members"]:
            yield f"members.{m['key']}", m["explanation"]
    for i in rec.get("images", []):
        yield f"images.{i['key']}.alt", i["alt"]


def check_words(rec, rep):
    banned = [re.compile(p, re.I) for p in BANNED]
    attrib = [re.compile(p, re.I) for p in ATTRIBUTE_ONLY]
    for where, text in prose_items(rec):
        if "!" in text:
            rep.err(where, "exclamation mark")
        for rx in banned:
            m = rx.search(text)
            if m:
                rep.err(where, f"banned: '{m.group(0)}'")
        for rx in attrib:
            m = rx.search(text)
            if m:
                rep.warn(where, f"'{m.group(0)}' only when a cited source says so, and attributed")


def check_images(rec, rep, allowed_reuse=None):
    for i in rec.get("images", []):
        w = f"images.{i['key']}"
        if rec["kind"] == "dish":
            if not i["reuse"] and not i["prompt"]:
                rep.err(w, "needs a prompt unless an existing cover is reused")
        else:
            if i["prompt"]:
                rep.err(w, "families and lineages never get a generated image; reuse a representative dish's cover")
            if allowed_reuse is not None and i["reuse"] not in allowed_reuse:
                rep.err(w, "reuse must be one of the representative dishes")
        if i.get("prompt") and FAKE_HISTORY_IMAGE.search(i["prompt"]):
            rep.err(w, "never generate an image that looks like a historical record, period photograph or artefact")


# ---------------------------------------------------------------- dish
def check_dish(rec, src, rep):
    st = {s["key"]: s for s in rec["statements"]}
    for d in dupes([s["key"] for s in rec["statements"]]):
        rep.err("statements", f"duplicate key '{d}'")
    for s in rec["statements"]:
        w = f"statements.{s['key']}"
        srcs = [c["source"] for c in s["citations"]]
        cite(rep, w, srcs, src)
        supports = [c["source"] for c in s["citations"] if c["stance"] == "supports"]
        if not supports:
            rep.err(w, "no citation with stance 'supports'")
        if s.get("dispute_state") == "disputed" and len(set(srcs)) < 2:
            rep.err(w, "a disputed claim shows at least two sources' accounts")
        for c in s["citations"]:
            if c.get("excerpt") and words(c["excerpt"]) > B["excerpt"]:
                rep.err(w, f"excerpt {words(c['excerpt'])} words; max {B['excerpt']}")
        if s["value"]["kind"] == "entity" and not s["value"].get("ref"):
            rep.err(w, "entity value needs ref")
        if s["value"]["kind"] == "literal" and not s["value"].get("literal"):
            rep.err(w, "literal value needs literal")

    def anchored(where, sent):
        # A sentence is anchored to a statement where a predicate exists for what it says
        # (origin, naming, creator, dates); every other sentence cites its sources directly.
        if not sent.get("claims") and not sent.get("source_ids"):
            rep.err(where, "every dish sentence needs a statement (claims) or a source (source_ids)")
            return
        for k in sent.get("claims", []):
            if k not in st:
                rep.err(where, f"unknown statement '{k}'")
        if ORIGIN_WORDS.search(sent["text"]) and not any(
                st.get(k, {}).get("predicate") in ORIGIN_PREDICATES for k in sent.get("claims", [])):
            rep.err(where, "origin wording needs an anchored originated_in / originated_at / created_by claim; "
                           "otherwise write 'is associated with'")
        cite(rep, where, sent.get("source_ids", []), src, required=False)

    intro = rec["intro"]
    lo, hi = B["dish.intro.sentences"]
    if not lo <= len(intro) <= hi:
        rep.err("intro", f"{len(intro)} sentences; need {lo}-{hi}")
    span(rep, "intro", sum(words(s["text"]) for s in intro), B["dish.intro"])
    first = rec["slug"].split("-")[0]
    if intro and intro[0]["text"].lower().startswith(first):
        rep.warn("intro", "opens with the dish name; open with the thing itself")
    for s in intro:
        anchored(f"intro.{s['key']}", s)
        if sentences(s["text"]) > 1:
            rep.warn(f"intro.{s['key']}", "one sentence per entry (description_sentences are stored one by one)")
    if rec.get("about"):
        span(rep, "about", sum(words(s["text"]) for s in rec["about"]), B["dish.about"])
        for s in rec["about"]:
            anchored(f"about.{s['key']}", s)

    names = {n["key"]: n for n in rec["names"]}
    for n in rec["names"]:
        cite(rep, f"names.{n['key']}", n["source_ids"], src, required=False)
        if not n["source_ids"]:
            rep.warn(f"names.{n['key']}", "no source for this name")
    places = {p["key"]: p for p in rec["places"]}
    for p in rec["places"]:
        w = f"places.{p['key']}"
        span(rep, w, words(p["explanation"]), B["place.explanation"])
        cite(rep, w, p["source_ids"], src)
        if ORIGIN_WORDS.search(p["explanation"]) and "origin" not in p["relationship_type"]:
            rep.err(w, "an association is not a birthplace claim; say what the source establishes")

    f = rec["facts"]
    for k in f["associated_with"]:
        if k not in places:
            rep.err("facts.associated_with", f"unknown place '{k}'")
    for k in f["also_called"]:
        if k not in names:
            rep.err("facts.also_called", f"unknown name '{k}'")
    for row in ("associated_with", "family", "served_as", "technique", "also_called"):
        if not f[row]:
            rep.warn(f"facts.{row}", "empty: the page shows 'No evidence' for this row")

    ch = rec["history"]["chapters"]
    seqs = [c["sequence"] for c in ch]
    for d in dupes(seqs):
        rep.err("history", f"duplicate sequence {d}")
    if ch and sorted(seqs) != list(range(1, len(seqs) + 1)):
        rep.warn("history", "sequences should run 1..n without gaps")
    chk = {c["key"] for c in ch}
    for c in ch:
        w = f"history.{c['key']}"
        span(rep, f"{w}.title", words(c["title"]), B["chapter.title"])
        span(rep, f"{w}.label", words(c["label"]), B["chapter.label"])
        span(rep, f"{w}.scope_note", words(c["scope_note"]), B["chapter.scope_note"])
        cite(rep, w, [c["source"]], src)
        if not c.get("locator"):
            rep.warn(w, "no locator (page, recipe number or section)")
        if c["confidence"] == "documented" and src.get(c["source"], {}).get("tier") not in PRIMARY_OR_SCHOLARLY:
            rep.err(w, "'documented' needs a primary or scholarly source (S1 or S2)")
        if ORIGIN_WORDS.search(c["label"]) and c["place_role"] != "attestation":
            rep.warn(w, "origin wording in a chapter that is not an attestation")
    for m in rec["history"]["movements"]:
        w = f"movements.{m['key']}"
        if m["from"] not in chk or m["to"] not in chk:
            rep.err(w, "from/to must be chapter keys")
        if m["from"] == m["to"]:
            rep.err(w, "from and to are the same chapter")
        span(rep, w, words(m["label"]), B["movement.label"])
        cite(rep, w, [m["source"]], src)

    seen = set()
    for c in rec["connections"]:
        w = f"connections.{c['key']}"
        if c["target"] == rec["slug"]:
            rep.err(w, "a dish cannot connect to itself")
        if (c["type"], c["target"]) in seen:
            rep.err(w, "duplicate connection")
        seen.add((c["type"], c["target"]))
        span(rep, w, words(c["reason"]), B["connection.reason"])
        cite(rep, w, c["source_ids"], src, required=False)
        if c["type"] in DIRECTIONAL:
            if not c["source_ids"]:
                rep.err(w, f"'{c['type']}' asserts history: it needs at least one source")
            if "this_dish_is" not in c:
                rep.err(w, "directional type needs this_dish_is (source = predecessor/broader, target = derived/variant)")
            if not c["direction_known"]:
                rep.err(w, f"'{c['type']}' is directional; use connection_proposed when the direction is unknown")
        elif c["type"] == "connection_proposed":
            if c["direction_known"] and "this_dish_is" not in c:
                rep.err(w, "direction_known is true: say which end this dish is")
            if not c["direction_known"]:
                if "this_dish_is" in c:
                    rep.err(w, "direction unknown: no this_dish_is, and no arrow anywhere")
                m = DIRECTION_WORDS.search(c["reason"])
                if m:
                    rep.warn(w, f"'{m.group(0)}' may imply a direction the data does not have")
        else:
            if "this_dish_is" in c:
                rep.err(w, f"'{c['type']}' has no direction")
            m = HISTORY_WORDS.search(c["reason"])
            if m:
                rep.err(w, f"'{c['type']}' states a resemblance, not history: remove '{m.group(0)}'")
    for v in rec["variants"]:
        w = f"variants.{v['key']}"
        if v["target"] == rec["slug"]:
            rep.err(w, "a dish cannot be its own variant")
        span(rep, w, words(v["explanation"]), B["variant.explanation"])
        cite(rep, w, v["source_ids"], src)
        if not v["changed_elements"]:
            rep.warn(w, "name what changes (changed_elements)")
    check_images(rec, rep)

    if rec["agent"]["confidence"] == "HIGH":
        for s in rec["statements"]:
            if not qualifying([c["source"] for c in s["citations"] if c["stance"] == "supports"], src):
                rep.err("agent.confidence", f"HIGH, but statement '{s['key']}' has no S1-S5 supporting source")
        for s in rec["intro"] + rec.get("about", []):
            if not s.get("claims") and not qualifying(s.get("source_ids", []), src):
                rep.err("agent.confidence", f"HIGH, but sentence '{s['key']}' cites no S1-S5 source")
        if not f["family"]:
            rep.err("agent.confidence", "HIGH needs a family")


# ---------------------------------------------------------------- family
def check_family(rec, src, rep):
    d = rec["description"]
    span(rep, "description", sum(words(s["text"]) for s in d), B["family.description"])
    for s in d:
        w = f"description.{s['key']}"
        cite(rep, w, s["source_ids"], src)
        m = HISTORY_WORDS.search(s["text"])
        if m:
            rep.err(w, f"a family is a classification, not ancestry: remove '{m.group(0)}' (history belongs in a lineage)")
        if s.get("claims"):
            rep.err(w, "family prose cites sources, not statements")
    if rec["nearest_family"] and rec["nearest_family"] == rec["slug"]:
        rep.err("nearest_family", "cannot be the family itself")
    check_images(rec, rep, set(rec["representative_dishes"]))
    if rec["agent"]["confidence"] == "HIGH":
        for s in d:
            if not qualifying(s["source_ids"], src):
                rep.err("agent.confidence", f"HIGH, but '{s['key']}' cites no S1-S5 source")


# ---------------------------------------------------------------- lineage
def check_lineage(rec, src, rep):
    L = rec["lineage"]
    sd = rec["short_description"]
    span(rep, "short_description", words(sd["text"]), B["lineage.short"])
    if sentences(sd["text"]) != 1:
        rep.err("short_description", "one sentence")
    span(rep, "concept_summary", sum(words(s["text"]) for s in rec["concept_summary"]), B["lineage.concept"])
    span(rep, "origin_summary", sum(words(s["text"]) for s in rec["origin_summary"]), B["lineage.origin"])
    span(rep, "long_description", sum(words(s["text"]) for s in rec["long_description"]), B["lineage.long"])
    paras = {s.get("paragraph", 1) for s in rec["long_description"]}
    if not 2 <= len(paras) <= 4:
        rep.warn("long_description", f"{len(paras)} paragraph(s); 2-4 reads best")
    all_sents = [("short_description", sd)] + [
        (f"{f}.{s['key']}", s) for f in ("concept_summary", "origin_summary", "long_description") for s in rec[f]]
    for f in ("uncertainty_note", "cultural_practice_note"):
        if rec.get(f):
            all_sents.append((f, rec[f]))
            span(rep, f, words(rec[f]["text"]), B["lineage.uncertainty" if f == "uncertainty_note" else "lineage.cultural"])
    for where, s in all_sents:
        cite(rep, where, s["source_ids"], src)
    if L["confidence_level"] != "documented" and not rec.get("uncertainty_note"):
        rep.err("uncertainty_note", f"required when confidence is '{L['confidence_level']}': say what is not known")
    if L["confidence_level"] == "documented" and not any(s["tier"] in PRIMARY_OR_SCHOLARLY for s in src.values()):
        rep.err("lineage.confidence_level", "'documented' needs at least one primary or scholarly source (S1 or S2)")
    if "parallel_evolution" in L["historical_forces"] and L["confidence_level"] == "documented":
        rep.warn("lineage", "parallel evolution with 'documented' confidence: check the wording")

    for dd in dupes([m["dish"] for m in rec["members"]]):
        rep.err("members", f"dish '{dd}' listed twice (one row per dish and lineage)")
    for m in rec["members"]:
        w = f"members.{m['key']}"
        span(rep, w, words(m["explanation"]), B["member.explanation"])
        cite(rep, w, m["source_ids"], src, required=False)
        if m["role"] in TRANSMISSION_ROLES and not m["source_ids"]:
            rep.err(w, f"role '{m['role']}' claims transmission: it needs a source")
        if m["role"] in RESEMBLANCE_ROLES:
            h = HISTORY_WORDS.search(m["explanation"])
            if h:
                rep.err(w, f"role '{m['role']}' is resemblance, not transmission: remove '{h.group(0)}'")
        if m["role"] in ("possible_influence", "uncertain") and m["confidence_level"] in ("documented", "likely"):
            rep.err(w, f"role '{m['role']}' cannot carry confidence '{m['confidence_level']}'")
        if m["role"] in (TRANSMISSION_ROLES - {"ancestor"}) | {"cousin"} and not m["changed_elements"]:
            rep.warn(w, "name what changed (changed_elements)")
    reps = set(L["representative_dishes"])
    for d in reps - {m["dish"] for m in rec["members"]}:
        rep.warn("lineage.representative_dishes", f"'{d}' is not a member")
    check_images(rec, rep, reps)
    if rec["agent"]["confidence"] == "HIGH":
        for where, s in all_sents:
            if not qualifying(s["source_ids"], src):
                rep.err("agent.confidence", f"HIGH, but {where} cites no S1-S5 source")


# ---------------------------------------------------------------- originality
UNIT_TOKENS = {"c", "f", "g", "kg", "ml", "l", "cm", "mm", "in", "x", "bce", "ce", "ad", "bc"}
STOP = {"the", "a", "an", "and", "or", "of", "to", "in", "on", "for", "with", "it", "is", "was", "were",
        "as", "by", "from", "at", "its", "this", "that", "which", "are", "be"}


def wtoks(text):
    toks = re.findall(r"[^\W_]+", (text or "").lower())
    return [t for t in toks if not t.isdigit() and t not in UNIT_TOKENS]


def grams(toks, n):
    return {tuple(toks[i:i + n]) for i in range(len(toks) - n + 1)}


def check_originality(rec, d, rep):
    files = sorted(Path(d).glob("*.txt"))
    if not files:
        rep.warn("originality", f"no .txt source texts in {d}; originality not checked")
        return
    i8, i6 = {}, {}
    for f in files:
        t = wtoks(f.read_text(encoding="utf-8", errors="ignore"))
        for g in grams(t, 8):
            i8.setdefault(g, f.stem)
        for g in grams(t, 6):
            i6.setdefault(g, f.stem)
    for where, text in prose_items(rec):
        t = wtoks(text)
        hit = next((g for g in grams(t, 8) if g in i8), None)
        if hit:
            rep.err(where, f"copies wording from source '{i8[hit]}': \"{' '.join(hit)}\"; rewrite from the facts")
            continue
        hit = next((g for g in grams(t, 6) if g in i6 and sum(x not in STOP for x in g) >= 3), None)
        if hit:
            rep.warn(where, f"close to source '{i6[hit]}': \"{' '.join(hit)}\"")


# ---------------------------------------------------------------- main
def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("record")
    ap.add_argument("--schema", default=str(Path(__file__).with_name("atlas-record.schema.json")))
    ap.add_argument("--sources-dir", help="folder of <source-id>.txt (the sources' own text, never published)")
    a = ap.parse_args()
    try:
        rec = json.loads(Path(a.record).read_text(encoding="utf-8"))
    except Exception as e:  # noqa: BLE001
        print(f"ERROR cannot read {a.record}: {e}")
        return 2
    rep = Report()
    try:
        import jsonschema
        schema = json.loads(Path(a.schema).read_text(encoding="utf-8"))
        v = jsonschema.Draft202012Validator(schema, format_checker=jsonschema.FormatChecker())
        errs = sorted(v.iter_errors(rec), key=lambda e: list(e.absolute_path))
        if errs:
            for e in errs:
                path = ".".join(str(p) for p in e.absolute_path) or "(root)"
                msg = e.message
                if e.validator == "oneOf" and e.context:
                    best = sorted(e.context, key=lambda c: len(list(c.absolute_path)))[-1]
                    msg = f"{best.message} (at {'.'.join(str(p) for p in best.absolute_path) or 'root'})"
                print(f"ERROR schema {path}: {msg}")
            print(f"\n{len(errs)} schema error(s); fix these before the cross-field checks run.")
            return 1
    except ImportError:
        rep.warn("schema", "jsonschema not installed; schema not checked")
    except FileNotFoundError:
        rep.warn("schema", f"schema file not found: {a.schema}")

    src = check_sources(rec, rep)
    {"dish": check_dish, "family": check_family, "lineage": check_lineage}[rec["kind"]](rec, src, rep)
    check_words(rec, rep)
    if a.sources_dir:
        check_originality(rec, a.sources_dir, rep)
    else:
        rep.warn("originality", "run with --sources-dir to check wording against the sources")
    independent = {s["id"] for s in rec["sources"] if s["independent"] and s["tier"] in QUALIFYING_TIERS}
    if rec["agent"]["confidence"] == "HIGH" and len(independent) < 2:
        rep.err("agent.confidence", "HIGH needs at least 2 independent S1-S5 sources")

    for line in rep.errors + rep.warnings:
        print(line)
    print(f"\n{'FAIL' if rep.errors else 'PASS'}: {len(rep.errors)} error(s), {len(rep.warnings)} warning(s), "
          f"{rec['kind']} '{rec['slug']}', confidence proposed {rec['agent']['confidence']}")
    return 1 if rep.errors else 0


if __name__ == "__main__":
    sys.exit(main())
