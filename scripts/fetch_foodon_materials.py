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
{ foodon_id, label, parent_foodon_id, definition }.
"""

import json
import pathlib
import sys
import urllib.request
import xml.etree.ElementTree as ET

OWL = "https://purl.obolibrary.org/obo/foodon.owl"
LOCAL = pathlib.Path("/tmp/foodon.owl")
ROOT = "FOODON_00002403"  # "food material"
RDF = "{http://www.w3.org/1999/02/22-rdf-syntax-ns#}"
OWL_NS = "{http://www.w3.org/2002/07/owl#}"
RDFS = "{http://www.w3.org/2000/01/rdf-schema#}"

# Only keep terms that are useful as an ingredient category: a named
# food material at a usable granularity. The whole branch has tens of
# thousands of terms, most of them species-level (which is the wrong
# granularity for a dish's ingredient axis).
MAX_DEPTH = 4


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


def local_name(iri):
    return iri.rsplit("/", 1)[-1].rsplit("#", 1)[-1]


def main():
    fetch()
    print("parsing...", file=sys.stderr)
    labels = {}
    definitions = {}
    parents = {}
    obsolete = set()

    for event, elem in ET.iterparse(LOCAL, events=("end",)):
        if elem.tag != OWL_NS + "Class":
            continue
        iri = elem.get(RDF + "about")
        if not iri:
            continue
        curie = local_name(iri)
        if not curie.startswith("FOODON_"):
            continue
        for child in elem:
            tag = child.tag
            if tag == RDFS + "label" and child.get("{http://www.w3.org/XML/1998/namespace}lang") in (None, "en"):
                labels[curie] = child.text
            elif tag == OWL_NS + "deprecated":
                obsolete.add(curie)
            elif tag == RDFS + "subClassOf":
                target = None
                if child.get(RDF + "resource"):
                    target = local_name(child.get(RDF + "resource"))
                elif child.get(RDF + "about"):
                    target = local_name(child.get(RDF + "about"))
                if target and target.startswith("FOODON_"):
                    parents.setdefault(curie, []).append(target)
            elif tag == IAO_DEF:
                definitions[curie] = child.text
        elem.clear()

    print(f"parsed {len(labels)} FoodOn classes", file=sys.stderr)

    # Walk down from the food-material root.
    children = {}
    for child, ps in parents.items():
        for p in ps:
            children.setdefault(p, []).append(child)

    out = []
    seen = set()
    frontier = [(ROOT, None, 0)]
    while frontier:
        node, parent, depth = frontier.pop()
        for child in children.get(node, []):
            if child in seen or child in obsolete:
                continue
            seen.add(child)
            label = labels.get(child)
            if not label:
                continue
            out.append({
                "foodon_id": child.replace("FOODON_", "FOODON:"),
                "label": label,
                "parent_foodon_id": parent.replace("FOODON_", "FOODON:") if parent else None,
                "definition": (definitions.get(child) or "").strip() or None,
                "depth": depth + 1,
            })
            if depth + 1 < MAX_DEPTH:
                frontier.append((child, node, depth))

    dest = pathlib.Path("/tmp/foodon_materials.json")
    dest.write_text(json.dumps(out, indent=1, ensure_ascii=False))
    with_def = sum(1 for t in out if t.get("definition"))
    print(f"wrote {len(out)} terms to {dest} ({with_def} with a definition)")
    for t in out[:12]:
        print(f"  {t['foodon_id']:<20} {t['label'][:44]:<46} d={t['depth']} def={bool(t.get('definition'))}")


IAO_DEF = "{http://purl.obolibrary.org/obo/IAO_0000115}"


if __name__ == "__main__":
    main()
