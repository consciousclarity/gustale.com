#!/usr/bin/env python3
"""Resolve Wikidata QIDs for the vocabulary values that lack one.

ADR-003 layer 1 sources labels from Wikidata (CC0). A label can only be
fetched for an item, so every vocabulary value needs its QID.

Some already have one:
  - geo_entities.wikidata_id          3,803 of 3,849
  - dish_traditions.source            418 of 433  ('wikidata:Q...')

The rest need one. The matching is deliberately conservative, because
a wrong QID means a wrong label in every locale at once.

Three things make the matching safe:

1. THE SEARCH IS SCOPED BY SUFFIX, not by label alone. A search for
   "Thai" returns the country, the language and the script - never the
   cuisine. A search for "Thai cuisine" returns exactly one right
   answer. So each vocabulary has a suffix that is appended to the
   label before searching: ' cuisine', ' (cooking technique)',
   ' (dish)', and so on.

2. THE CANDIDATE'S CLASS IS CONFIRMED, and the check accepts P31 OR
   P279, because "Thai cuisine" is not P31 'cuisine' - it is P31
   'national cuisine' (Q1968435) and P279 'Southeast Asian cuisine'.
   Matching on P31 alone would reject every cuisine.

3. A CANDIDATE THAT FAILS THE CHECK IS REJECTED and the value is left
   without a QID. An absent QID is honest; a wrong one is not.

The class QIDs below were looked up rather than guessed - a first
attempt guessed them and got back 'Zygmunt Vogel' for 'cooking method'.

Output: /tmp/vocab_qids.json — { vocabulary: { key: "Q123" } }
"""

import json
import pathlib
import re
import subprocess
import time
import urllib.error
import urllib.parse
import urllib.request

OUT_PATH = pathlib.Path("/tmp/vocab_qids.json")
UA = "gustale-reference-seed/1.0 (https://gustale.com)"

# vocabulary -> (search suffix, acceptable P31/P279 classes)
#
# The classes were resolved by searching Wikidata for the class NAME
# and reading the result, not by guessing a QID.
VOCABULARIES = {
    "country": ("", ["Q3624078", "Q6256", "Q515"]),
    "region": ("", ["Q56061", "Q15042037", "Q3957"]),
    # 'cuisine by ethnic group' (Q18291645) and 'cuisine by humans'
    # (Q33115883) are the classes on the newer cuisine items - for
    # instance 'Basotho cuisine' (Q134961316). Without them the
    # matching rejected items that were exactly right.
    "cuisine": (" cuisine", ["Q1968435", "Q1718821", "Q4189165",
                             "Q18291645", "Q33115883"]),
    "family": ("", ["Q746549", "Q2095", "Q1968435", "Q2424752"]),
    # 'food preparation technique' (Q1039303) is the class the cooking
    # techniques actually use. The first attempt used
    # 'cooking technique' (Q11795121) and rejected 53 of the 65
    # techniques, because items like 'boiling' (Q20074315) and
    # 'baking' (Q720398) are P31 'food preparation technique' and
    # 'process' - not 'cooking technique'. Q38695 'cooking' and
    # Q2695280 'technique' are kept as siblings.
    "technique": ("", ["Q1039303", "Q10843872", "Q38695", "Q2695280"]),
    "tradition": (" cuisine", ["Q1968435", "Q1718821", "Q18291645"]),
    # A context is a course of a meal, an occasion, or an eating
    # situation. 'appetizer' (Q1628963) and 'meal' (Q6460735) are the
    # useful anchors.
    "context": ("", ["Q1628963", "Q6460735", "Q74817647", "Q1190554",
                      "Q1656682", "Q20076499"]),
    "ingredient_category": ("", ["Q25403900", "Q2095", "Q1762189", "Q2424752"]),
    "predicate": ("", []),
}


def api(**params):
    params = dict(params, format="json")
    url = f"https://www.wikidata.org/w/api.php?{urllib.parse.urlencode(params)}"
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    for attempt in range(4):
        try:
            with urllib.request.urlopen(req, timeout=45) as resp:
                return json.loads(resp.read().decode())
        except urllib.error.HTTPError as exc:
            if exc.code in (429, 503):
                time.sleep(5 * (attempt + 1))
                continue
            return None
        except Exception:
            time.sleep(3 * (attempt + 1))
    return None


def normalize(text):
    text = (text or "").lower().strip()
    text = re.sub(r"[^a-z0-9 ]+", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def search_for(label):
    data = api(action="wbsearchentities", search=label, language="en",
               uselang="en", type="item", limit="12")
    return (data or {}).get("search") or []


def class_matches(candidate_id, allowed):
    """True when the candidate is a P31 or P279 instance of a class."""
    if not allowed:
        return True
    data = api(action="wbgetentities", ids=candidate_id, props="claims")
    if not data:
        return False
    entity = (data.get("entities") or {}).get(candidate_id) or {}
    claims = entity.get("claims") or {}
    for prop in ("P31", "P279"):
        for claim in claims.get(prop, []):
            value = (claim.get("mainsnak") or {}).get("datavalue") or {}
            if value.get("type") == "wikibase-entityid":
                if value.get("value", {}).get("id") in allowed:
                    return True
    return False


def label_of(candidate):
    return normalize(candidate.get("label"))


def aliases_of(candidate):
    return [normalize(a) for a in (candidate.get("aliases") or [])]


def main():
    def q(sql):
        out = subprocess.run(["bash", "scripts/dbq.sh", sql],
                             capture_output=True, text=True, timeout=180)
        rows = []
        for line in out.stdout.splitlines():
            line = line.strip()
            if not line or "|" not in line:
                continue
            parts = [p.strip() for p in line.split("|")]
            # Skip the header row (the column names) and the separator
            # row (dashes and pluses), which are not data.
            if set(parts[0]) <= {"-", " ", "+"}:
                continue
            if parts[0] == "slug" or parts[0] == "count":
                continue
            rows.append(parts)
        return rows

    values = {}

    # geo_entities: QIDs already present.
    for etype in ("country", "region"):
        rows = q("select coalesce(iso_code, name), name, wikidata_id "
                 f"from geo_entities where entity_type='{etype}' "
                 "and wikidata_id is not null order by 1;")
        values[etype] = [{"key": r[0], "name": r[1], "qid": r[2]} for r in rows]

    for vocab, table in (("cuisine", "dish_cuisines"),
                          ("family", "dish_families"),
                          ("technique", "dish_techniques"),
                          ("tradition", "dish_traditions"),
                          ("context", "dish_contexts"),
                          ("ingredient_category", "ingredient_categories"),
                          ("predicate", "relation_types")):
        rows = q(f"select slug, name from {table} order by slug;")
        values[vocab] = [{"key": r[0], "name": r[1], "qid": None} for r in rows]

    # dish_traditions already has a QID in `source`.
    for slug, src in q("select slug, source from dish_traditions "
                       "where source like 'wikidata:%';"):
        for v in values["tradition"]:
            if v["key"] == slug:
                v["qid"] = src.split(":", 1)[1]

    total = sum(len(v) for v in values.values())
    have = sum(1 for v in values.values() for x in v if x["qid"])
    print(f"{total} vocabulary values, {have} already have a QID, "
          f"{total - have} to resolve\n")

    resolved = {}
    stats = {"accepted": 0, "rejected": 0, "no_match": 0}

    # RESUME: if a previous run already resolved some values, keep
    # them and only try the ones still missing. The first run's
    # classes were too narrow, so retrying just the misses is much
    # cheaper than re-resolving everything.
    previous = {}
    if OUT_PATH.exists():
        try:
            previous = json.loads(OUT_PATH.read_text())
        except Exception:
            previous = {}

    for vocab, items in values.items():
        suffix, allowed = VOCABULARIES.get(vocab, ("", []))
        out = {}
        prev = previous.get(vocab, {})
        for item in items:
            if item["qid"]:
                out[item["key"]] = item["qid"]
                continue
            if item["key"] in prev:
                out[item["key"]] = prev[item["key"]]
                continue
            want = normalize(item["name"])
            candidates = search_for(f"{item['name']}{suffix}")
            found = None
            for cand in candidates:
                label = label_of(cand)
                aliases = aliases_of(cand)
                # With a suffix, the candidate's label must be the
                # wanted label plus that suffix (or an alias of it).
                target = normalize(f"{item['name']}{suffix}")
                if label != target and want not in aliases:
                    continue
                if not class_matches(cand["id"], allowed):
                    stats["rejected"] += 1
                    continue
                found = cand["id"]
                stats["accepted"] += 1
                break
            if found:
                out[item["key"]] = found
            else:
                stats["no_match"] += 1
        resolved[vocab] = out
        kept = sum(1 for k in out if k in prev)
        print(f"  {vocab}: {len(out)}/{len(items)} with a QID "
              f"({kept} carried over from the previous run)")

    OUT_PATH.write_text(json.dumps(resolved, indent=1, ensure_ascii=False))
    print(f"\nstats: {stats}")
    print(f"-> {OUT_PATH}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
