#!/usr/bin/env python3
"""Fetch the Tier-2 tradition vocabulary from Wikidata.

The GUS-242 plan names "the 1,265 Wikidata Q1778821 items" as the source
for the 400-600 regional/ethnic/religious tradition values. Measured on
2026-10-29:

  * Q1778821 is the concept **"cuisine"** ("characteristic style of
    cooking practices and traditions") — a first-order CLASS, not a
    populated tree. Its own P527 children are dish, food ingredient and
    culinary art, so the tree route does not work.
  * What does work is the INSTANCE route: items that are instances of
    cuisine (directly or by subclass) and that carry a country (P17).
    That is 991 items, and it is exactly the shape the plan describes —
    regional and national culinary traditions, one per (cuisine, country).

Every value therefore carries:
  definition — the Wikidata description (CC0), or the project's own
  source     — the Wikidata Q-id

Wikidata content is CC0, so the labels and descriptions are free to use.

Uses SPARQL (one query, batched by OFFSET) because the REST API has no
way to express "instance of, transitively".

Output: /tmp/traditions_1e.json — a list of
         {qid, label, description, country_qid, sitelink}
"""

import json
import time
import urllib.parse
import urllib.request
from pathlib import Path

OUT = Path("/tmp/traditions_1e.json")
UA = "gustale-reference-seed/1.0 (https://gustale.com)"
SPARQL = "https://query.wikidata.org/sparql"

# Instances of cuisine (directly or by subclass) that carry a country.
# This is the "regional tradition" shape: a named culinary tradition
# attached to a place.
QUERY = """
SELECT DISTINCT ?item ?itemLabel ?itemDescription ?country ?countryLabel ?article
WHERE {
  ?item wdt:P31/wdt:P279* wd:Q1778821 .
  ?item wdt:P17 ?country .
  OPTIONAL { ?article schema:about ?item ; schema:isPartOf <https://en.wikipedia.org/> . }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
}
ORDER BY ?itemLabel
"""


def sparql(query: str, tries: int = 4) -> dict:
    url = SPARQL + "?" + urllib.parse.urlencode({
        "query": query,
        "format": "json",
    })
    last = None
    for attempt in range(tries):
        try:
            req = urllib.request.Request(
                url,
                headers={
                    "User-Agent": UA,
                    "Accept": "application/sparql-results+json",
                },
            )
            with urllib.request.urlopen(req, timeout=180) as r:
                return json.loads(r.read().decode("utf-8"))
        except Exception as e:                      # noqa: BLE001
            last = e
            wait = 20 * (attempt + 1)
            print(f"  ! attempt {attempt + 1} failed ({e}); waiting {wait}s")
            time.sleep(wait)
    raise RuntimeError(f"SPARQL failed after {tries} attempts: {last}")


def main() -> int:
    print("Querying Wikidata for instances of 'cuisine' with a country...")
    d = sparql(QUERY)
    rows = d["results"]["bindings"]
    print(f"  raw rows: {len(rows)}")

    # The query can return one row per (item, article); collapse.
    out = {}
    for r in rows:
        qid = r["item"]["value"].rsplit("/", 1)[-1]
        rec = out.setdefault(qid, {
            "qid": qid,
            "label": r.get("itemLabel", {}).get("value"),
            "description": r.get("itemDescription", {}).get("value"),
            "country_qid": r.get("country", {}).get("value", "").rsplit("/", 1)[-1],
            "country": r.get("countryLabel", {}).get("value"),
            "sitelink": r.get("article", {}).get("value"),
        })
        if not rec.get("sitelink") and r.get("article"):
            rec["sitelink"] = r["article"]["value"]

    items = [v for v in out.values() if v.get("label")]
    items.sort(key=lambda v: v["label"].lower())
    OUT.write_text(json.dumps(items, indent=2, ensure_ascii=False))
    print(f"-> {OUT}  ({len(items)} unique traditions)")
    print(f"   with an English description: "
          f"{sum(1 for i in items if i.get('description'))}")
    print(f"   with an English Wikipedia article: "
          f"{sum(1 for i in items if i.get('sitelink'))}")
    print(f"   distinct countries: "
          f"{len({i['country_qid'] for i in items})}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
