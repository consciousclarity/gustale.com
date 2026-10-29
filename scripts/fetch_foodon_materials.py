#!/usr/bin/env python3
"""Extract the FoodOn food-material branch from the FoodOn OWL file.

The GUS-242 plan sources the ingredient axis from FoodOn: "~250-400
values, FoodOn food-material branch (EFSA FOodex2 groups)", and
"cross-checked against FoodOn + Wikidata P279, identifiers only — our own
labels and definitions".

The OWL file is the authoritative source and avoids the OLS4 API's
unreliable hierarchy endpoints. It is large (~40MB), so it is parsed
with a streaming XML reader rather than loaded into memory.

Output: /tmp/foodon_materials.json — a list of
{ foodon_id, label, parent_foodon_id, definition, depth }.

The hierarchy in the OWL comes from `owl:subClassOf` with an
`rdf:resource`. Some classes ALSO carry an `owl:Restriction` /
`someValuesFrom` (the "has part" relation), which is NOT a class
parent and is ignored.

Two key-form traps this script exists to avoid:
  - the class IRIs are `.../obo/FOODON_00002403` (underscore) but the
    FoodOn IDs we publish are `FOODON:00002403` (colon);
  - the children map is keyed by the underscore form, so the walk must
    stay in that form throughout and only convert on output.
"""

import json
import pathlib
import sys
import urllib.request
import xml.etree.ElementTree as ET

OWL = "https://purl.obolibrary.org/obo/foodon.owl"
LOCAL = pathlib.Path("/tmp/foodon.owl")
ROOT = "FOODON_00002403"  # "food material"
MAX_DEPTH = 14

RDF = "{http://www.w3.org/1999/02/22-rdf-syntax-ns#}"
OWL_NS = "{http://www.w3.org/2002/07/owl#}"
RDFS = "{http://www.w3.org/2000/01/rdf-schema#}"
XMLNS = "{http://www.w3.org/XML/1998/namespace}"
OBO = "http://purl.obolibrary.org/obo/"


def fetch():
    if LOCAL.exists() and LOCAL.stat().st_size > 10_000_000:
        print(f"using the cached {LOCAL} ({LOCAL.stat().st_size // 1024 // 1024}MB)", file=sys.stderr)
        return
    print(f"downloading {OWL}", file=sys.stderr)
    req = urllib.request.Request(OWL, headers={"User-Agent": "gustale-reference-seed/1.0"})
    with urllib.request.urlopen(req, timeout=600) as r, LOCAL.open("wb") as f:
        while True:
            chunk = r.read(1 << 20)
            if not chunk:
                break
            f.write(chunk)
    print(f"downloaded {LOCAL.stat().st_size // 1024 // 1024}MB", file=sys.stderr)


def main():
    fetch()
    print("parsing...", file=sys.stderr)

    labels = {}
    definitions = {}
    parents = {}
    obsolete = set()

    for _event, elem in ET.iterparse(LOCAL, events=("end",)):
        if elem.tag != OWL_NS + "Class":
            continue
        iri = elem.get(RDF + "about")
        if not iri or not iri.startswith(OBO + "FOODON_"):
            continue
        curie = iri.rsplit("/", 1)[-1]
        for child in elem:
            tag = child.tag
            if tag == RDFS + "label" and (child.get(XMLNS + "lang") or "en") == "en":
                labels[curie] = child.text
            elif tag == RDFS + "comment" and (child.get(XMLNS + "lang") or "en") == "en":
                definitions[curie] = child.text
            elif tag == OWL_NS + "deprecated":
                obsolete.add(curie)
            elif tag == RDFS + "subClassOf":
                target = child.get(RDF + "resource")
                # A Restriction has no rdf:resource on the subClassOf
                # itself; its someValuesFrom is a PROPERTY relation
                # ("has part"), not a class parent. Skip those.
                if target and target.startswith(OBO + "FOODON_"):
                    parents.setdefault(curie, []).append(target.rsplit("/", 1)[-1])
        elem.clear()

    print(f"parsed {len(labels)} FoodOn classes", file=sys.stderr)

    children = {}
    for child, ps in parents.items():
        for p in ps:
            children.setdefault(p, []).append(child)

    out = []
    seen = set()
    frontier = [(ROOT, None, 0)]
    while frontier:
        node, parent, depth = frontier.pop(0)
        for child in children.get(node, []):
            if child in seen or child in obsolete:
                continue
            seen.add(child)
            label = labels.get(child)
            if not label:
                continue
            out.append({
                "foodon_id": "FOODON:" + child.split("_", 1)[1],
                "label": label,
                "parent_foodon_id": ("FOODON:" + parent.split("_", 1)[1]) if parent else None,
                "definition": (definitions.get(child) or "").strip() or None,
                "depth": depth + 1,
            })
            if depth + 1 < MAX_DEPTH:
                frontier.append((child, node, depth + 1))

    dest = pathlib.Path("/tmp/foodon_materials.json")
    dest.write_text(json.dumps(out, indent=1, ensure_ascii=False))
    with_def = sum(1 for t in out if t.get("definition"))
    depths = {}
    for t in out:
        depths[t["depth"]] = depths.get(t["depth"], 0) + 1
    print(f"wrote {len(out)} terms to {dest} ({with_def} with a definition)")
    print(f"depth histogram: {dict(sorted(depths.items()))}")
    for t in out[:8]:
        print(f"  {t['foodon_id']:<20} {t['label'][:44]:<46} d={t['depth']} def={bool(t.get('definition'))}")


if __name__ == "__main__":
    main()
