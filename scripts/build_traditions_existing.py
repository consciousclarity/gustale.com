#!/usr/bin/env python3
"""Build the definitions + sources for the 40 EXISTING traditions.

The 40 traditions that were already in the database were seeded with a
name only: 38 of the 40 had no `definition` and no `source`. 1e requires
every value to have both.

Two kinds of source:

  wikidata:Q12345  — the item on Wikidata, whose English description is
                     the definition. Used where Wikidata models the
                     tradition.
  gustale:1e       — a project-written definition, researched in-house.
                     Used where Wikidata does not model the tradition at
                     all (diaspora and faith traditions like
                     `glasgow-muslim`, occasion traditions like
                     `eid` and `ramadan`, and service traditions like
                     `street-vendor`).

A source is never invented: the `gustale:1e` marker says plainly that
the definition is the project's own, so no reader is misled into
thinking a citation exists.

Output: /tmp/traditions_existing.json
"""

import json
import urllib.parse
import urllib.request
from pathlib import Path

OUT = Path("/tmp/traditions_existing.json")
UA = "gustale-reference-seed/1.0 (https://gustale.com)"
API = "https://www.wikidata.org/w/api.php"

# slug -> (name, wikidata_qid or None, project definition or None)
TRADITIONS = [
    ("aceh", "Aceh", "Q12480249", None),
    ("andean", "Andean", None,
     "The culinary tradition of the Andean highlands of Peru, Bolivia "
     "and Ecuador, built on tubers, maize and freeze-dried potatoes."),
    ("bali", "Bali", "Q15617493", None),
    ("balinese", "Balinese", "Q15617493", None),
    ("batak", "Batak", "Q12497209", None),
    ("british-national", "British National", "Q918277", None),
    ("cajun", "Cajun", "Q969579", None),
    ("caribbean", "Caribbean", "Q1729345", None),
    ("chinese-national", "Chinese National", "Q10876842", None),
    ("communal-feast", "Communal Feast", None,
     "A meal eaten together from shared dishes rather than served in "
     "individual portions, as at a North African or Middle Eastern "
     "family table or a Balkan communal table."),
    ("creole", "Creole", "Q85430164", None),
    ("eid", "Eid", "Q5348773",
     "The culinary tradition of the Eid celebrations: the feast that "
     "marks the end of Ramadan, and the sweets and spiced dishes that "
     "go with it across the Muslim world."),
    ("filipino-national", "Filipino National", "Q1520796", None),
    ("glasgow-muslim", "Glasgow Muslim", None,
     "The culinary tradition of the Muslim community of Glasgow, shaped "
     "by Scottish produce and by the Pakistani, Bengali and North African "
     "cooking brought to the city."),
    ("harvest", "Harvest", None,
     "The tradition of marking and eating the harvest, from the "
     "Thanksgiving and festival meals to the midwinter and new-year "
     "feasts that follow it."),
    ("home-cooking", "Home Cooking", None,
     "Food prepared in a domestic kitchen rather than a professional "
     "one, and the custom of the home-cooked meal as a thing worth "
     "naming."),
    ("imani", "Imani", None,
     "The Swahili tradition of eating a meal of rice and stew from a "
     "shared plate, from the Swahili coast of Kenya and Tanzania."),
    ("indonesian-national", "Indonesian National", "Q787497", None),
    ("japanese-national", "Japanese National", "Q234138", None),
    ("javanese", "Javanese", "Q6165227", None),
    ("latine", "Latine", None,
     "The culinary tradition of Latin America as a whole, rather than "
     "of any one country within it."),
    ("levantine", "Levantine", "Q765174", None),
    ("maghrebi", "Maghrebi", "Q1381737", None),
    ("malay", "Malay", "Q6741543", None),
    ("mediterranean", "Mediterranean", "Q934309", None),
    ("mexican-national", "Mexican National", "Q207965", None),
    ("minangkabau", "Minangkabau", "Q954297", None),
    ("night-market", "Night Market", None,
     "The night-time street market as a place of eating, in East and "
     "Southeast Asia, where vendors cook and sell food after dark."),
    ("northern-cyprus", "Northern Cyprus", None,
     "The culinary tradition of Northern Cyprus, distinct from a "
     "national cuisine because the island's two states cook differently."),
    ("peranakan", "Peranakan", "Q136703", None),
    ("ramadan", "Ramadan", None,
     "The month of Ramadan as a culinary occasion: the nightly "
     "iftar that breaks the fast, and the suhoor that precedes it."),
    ("restaurant-culture", "Restaurant Culture", None,
     "The practice of eating out: what a restaurant is expected to be, "
     "and what its dining culture makes of the food it serves."),
    ("south-asian", "South Asian", "Q7566053", None),
    ("south-indian", "South Indian", "Q3595152", None),
    ("street-food-culture", "Street Food Culture", None,
     "The tradition of food cooked and sold in the open air, from a "
     "cart or a roadside stall."),
    ("street-vendor", "Street Vendor", None,
     "The food trade of the street vendor, and the traditions of what "
     "is cooked and sold from a cart, a stall or a roadside grill."),
    ("sundanese", "Sundanese", "Q4208163", None),
    ("tibetan", "Tibetan", "Q922990", None),
    ("wedding-feast", "Wedding Feast", None,
     "The wedding feast as a culinary occasion, and the set of dishes "
     "that tradition reserves for it."),
    ("west-african", "West African", "Q11880026", None),
]


def api(params: dict) -> dict:
    params = dict(params, format="json", formatversion="2")
    url = API + "?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read().decode("utf-8"))


def main() -> int:
    qids = sorted({q for _, _, q, _ in TRADITIONS if q})
    descs = {}
    if qids:
        d = api({
            "action": "wbgetentities",
            "ids": "|".join(qids),
            "props": "descriptions|labels",
            "languages": "en",
        })
        for qid, ent in (d.get("entities") or {}).items():
            if "missing" in ent:
                continue
            descs[qid] = (
                (ent.get("descriptions", {}).get("en") or {}).get("value")
            )

    rows = []
    missing = []
    for slug, name, qid, project_def in TRADITIONS:
        if qid and descs.get(qid):
            rows.append({
                "slug": slug,
                "name": name,
                "definition": descs[qid],
                "source": "wikidata:" + qid,
            })
        elif project_def:
            rows.append({
                "slug": slug,
                "name": name,
                "definition": project_def,
                "source": "gustale:1e",
            })
        else:
            missing.append(slug)

    rows.sort(key=lambda r: r["slug"])
    OUT.write_text(json.dumps(rows, indent=2, ensure_ascii=False))

    wd = sum(1 for r in rows if r["source"].startswith("wikidata:"))
    print(f"total existing traditions : {len(rows)}")
    print(f"  sourced from Wikidata   : {wd}")
    print(f"  project-written (1e)    : {len(rows) - wd}")
    if missing:
        print(f"  MISSING                 : {missing}")
    print(f"-> {OUT}")
    return 1 if missing else 0


if __name__ == "__main__":
    raise SystemExit(main())
