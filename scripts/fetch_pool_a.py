#!/usr/bin/env python3
"""Fetch Pool A — the dishes that are typed and locatable.

WHAT POOL A IS

From the global reference plan, measured 2026-10-27 on the Wikidata
subclass path:

    | pool | size | what it needs |
    |------|------|---------------|
    | A — typed, locatable | 1,565 | import as-is; the type is already decided |

Pool A is the set of dishes that have ALL THREE of:

  1. a Wikipedia article (an `enwiki` sitelink),
  2. a country of origin (P495), and
  3. a dish-subclass type — a `P31` whose target sits under "dish"
     (Q7366) via the `P279*` subclass path.

The third one is the point. The direct `wdt:P31 = dish` count is
3,318, but the subclass path `wdt:P31/wdt:P279* dish` gives 8,110,
because most dishes are instances of *soup* / *dumpling* / *curry*
and so on, not of "dish" itself. Every query here uses the subclass
path.

Pool B (394) — on Wikidata, with an article, but typed NEITHER way —
is a CLASSIFICATION workload and is NOT fetched here. Pool C
(article but not a Wikidata dish) is excluded entirely.

WHY THE API AND NOT SPARQL

The Wikidata SPARQL endpoint was rate-limited to roughly one request
a minute during the 1e traditions work, and the P31/P279* closure is
expensive. The REST API is used instead, with pacing, because it is
reliable and the fetch is a one-off.

Usage:

    python3 scripts/fetch_pool_a.py --limit 200
    python3 scripts/fetch_pool_a.py            # the whole pool
"""

from __future__ import annotations

import argparse
import json
import time
import urllib.parse
import urllib.request
from pathlib import Path

WIKIDATA_API = "https://www.wikidata.org/w/api.php"
USER_AGENT = "gustale-pool-a/1.0 (https://gustale.com; hello@gustale.com)"

# The dish subclass root. P31/wdt:P279* Q7366 is the type test.
DISH_ROOT = "Q7366"

OUT = Path("/tmp/pool_a.json")

# How many Wikidata items to ask for per API call. The API caps
# ids-per-request at 50 for most endpoints; 50 is the safe number.
BATCH = 50


def api_get(params: dict[str, str]) -> dict:
    """One Wikidata REST API call."""
    url = f"{WIKIDATA_API}?{urllib.parse.urlencode(params)}"
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(request, timeout=60) as response:
        return json.loads(response.read())


def sparql(query: str) -> list[dict]:
    """One SPARQL query, via the query service.

    Used only for the initial candidate list — the expensive part. The
    per-item detail comes from the REST API.
    """
    url = "https://query.wikidata.org/sparql"
    params = {"query": query, "format": "json"}
    request = urllib.request.Request(
        url,
        data=urllib.parse.urlencode(params).encode(),
        headers={
            "User-Agent": USER_AGENT,
            "Accept": "application/sparql-results+json",
        },
    )
    with urllib.request.urlopen(request, timeout=120) as response:
        payload = json.loads(response.read())
    return payload["results"]["bindings"]


# The sitelink is a SEPARATE node — ?article — joined to the dish with
# schema:about. Writing schema:about/schema:isPartOf on the DISH node
# itself is a contradiction (an article cannot be about itself while
# also being part of Wikipedia) and it returns ZERO rows silently.
CANDIDATE_QUERY = """
SELECT DISTINCT ?dish ?article WHERE {
  ?dish wdt:P31/wdt:P279* wd:Q7366 ;
        wdt:P495 ?country .
  ?article schema:about ?dish ;
           schema:isPartOf <https://en.wikipedia.org/> .
}
LIMIT __LIMIT__
"""


def fetch_candidates(limit: int) -> list[dict]:
    """The Pool A candidate list: a QID and its English article title."""
    print(f"[pool-a] asking for up to {limit} candidates from SPARQL", flush=True)
    rows = sparql(CANDIDATE_QUERY.replace("__LIMIT__", str(limit)))
    out = []
    for row in rows:
        out.append(
            {
                "qid": row["dish"]["value"].rsplit("/", 1)[-1],
                "article": row["article"]["value"].rsplit("/", 1)[-1],
            }
        )
    print(f"[pool-a] {len(out)} candidates", flush=True)
    return out


def fetch_details(qids: list[str]) -> dict[str, dict]:
    """The full detail for a batch of QIDs.

    One `wbgetentities` call per batch, asking for the properties
    Pool A needs: P495 (country of origin), P31 (instance of), P279
    (subclass of), P18 (image), P17 (country), P1705 (native label)
    and P571 (inception).
    """
    out: dict[str, dict] = {}
    for i in range(0, len(qids), BATCH):
        chunk = qids[i : i + BATCH]
        payload = api_get(
            {
                "action": "wbgetentities",
                "ids": "|".join(chunk),
                "props": "labels|claims|sitelinks",
                "languages": "en",
                "sitefilter": "enwiki",
                "format": "json",
            }
        )
        for qid, entity in payload.get("entities", {}).items():
            if "missing" in entity:
                continue
            out[qid] = {
                "qid": qid,
                "label": entity.get("labels", {})
                .get("en", {})
                .get("value"),
                "description": entity.get("descriptions", {})
                .get("en", {})
                .get("value"),
                "article": entity.get("sitelinks", {})
                .get("enwiki", {})
                .get("title"),
                "country_of_origin": _first_item(entity, "P495"),
                "instance_of": _all_qids(entity, "P31"),
                "subclass_of": _all_qids(entity, "P279"),
                "image": _first_string(entity, "P18"),
                "inception": _first_time(entity, "P571"),
                "native_label": _first_mono(entity, "P1705"),
            }
        # Pace it: the API is a public service.
        time.sleep(0.4)
    return out


def _first_qid(entity: dict, prop: str) -> str | None:
    claims = entity.get("claims", {}).get(prop, [])
    for claim in claims:
        snak = claim.get("mainsnak", {})
        if snak.get("snaktype") == "value":
            return snak.get("datavalue", {}).get("value", {}).get("id")
    return None


def _all_qids(entity: dict, prop: str) -> list[str]:
    out = []
    for claim in entity.get("claims", {}).get(prop, []):
        snak = claim.get("mainsnak", {})
        if snak.get("snaktype") == "value":
            qid = snak.get("datavalue", {}).get("value", {}).get("id")
            if qid:
                out.append(qid)
    return out


def _first_string(entity: dict, prop: str) -> str | None:
    """A STRING value — P18 (image filename), P1705 is different."""
    for claim in entity.get("claims", {}).get(prop, []):
        snak = claim.get("mainsnak", {})
        if snak.get("snaktype") == "value":
            value = snak.get("datavalue", {}).get("value")
            if isinstance(value, str):
                return value
    return None


def _first_item(entity: dict, prop: str) -> str | None:
    """An ITEM value — a QID.

    P495 (country of origin) is a wikibase-item, NOT a string, so
    reading it with _first_string always returned None and every
    candidate looked incomplete. That is exactly the kind of bug that
    looks like an empty dataset.
    """
    return _first_qid(entity, prop)


def _first_time(entity: dict, prop: str) -> str | None:
    for claim in entity.get("claims", {}).get(prop, []):
        snak = claim.get("mainsnak", {})
        if snak.get("snaktype") == "value":
            value = snak.get("datavalue", {}).get("value", {})
            if isinstance(value, dict) and "time" in value:
                return value["time"]
    return None


def _first_mono(entity: dict, prop: str) -> str | None:
    """A monolingual text value (P1705 is monolingualtext)."""
    for claim in entity.get("claims", {}).get(prop, []):
        snak = claim.get("mainsnak", {})
        if snak.get("snaktype") == "value":
            value = snak.get("datavalue", {}).get("value")
            if isinstance(value, dict) and "text" in value:
                return value["text"]
    return None


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--limit", type=int, default=1565)
    parser.add_argument("--out", default=str(OUT))
    args = parser.parse_args()

    candidates = fetch_candidates(args.limit)
    if not candidates:
        print("[pool-a] no candidates — the endpoint may be rate-limited")
        return 1

    qids = sorted({c["qid"] for c in candidates})
    print(f"[pool-a] fetching the details for {len(qids)} items", flush=True)
    details = fetch_details(qids)

    # Keep only the ones that really are Pool A: a country of origin,
    # an article, and a type.
    pool = []
    for qid, detail in details.items():
        if not detail.get("article"):
            continue
        if not detail.get("country_of_origin"):
            continue
        if not detail.get("instance_of"):
            continue
        pool.append(detail)

    print(f"[pool-a] {len(pool)} of {len(details)} are complete Pool A rows")
    Path(args.out).write_text(json.dumps(pool, indent=1, ensure_ascii=False))
    print(f"-> {args.out}")

    with_cn = sum(1 for p in pool if p.get("country_of_origin"))
    print(f"  with a country of origin: {with_cn}")
    print(f"  with an image:           {sum(1 for p in pool if p.get('image'))}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
