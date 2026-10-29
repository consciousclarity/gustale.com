#!/usr/bin/env python3
"""Fetch the ENGLISH demonym (Wikidata P1549) for each country.

Why the REST API and not SPARQL: query.wikidata.org is currently rate
limiting to 1 request/minute (outage 797a132), so the batched SPARQL route
is unusable. The REST API (wbgetclaims + wbgetentities) has no such limit.

Why the demonym ITEM and then its English label: P1549 points at an item
(e.g. Q172741 = 'Indonesian'). The default label service returns the
NATIVE-language label ('gernsies', '香港人'), but the existing 191 cuisines
use ENGLISH demonyms in Title Case ('Indonesian', 'Vietnamese'). So the
English label is fetched explicitly per item.

Wikidata is CC0 — labels including P1549 are free to use.

Usage:  python3 scripts/fetch_demonyms.py > /tmp/demonyms.json
"""
import json
import sys
import time
import urllib.request

UA = "gustale-reference-seed/1.0 (https://gustale.com)"
API = "https://www.wikidata.org/w/api.php"

COUNTRIES = [
    ("AI", "Anguilla", "Q25228"), ("AQ", "Antarctica", "Q51"),
    ("AS", "American Samoa", "Q16641"), ("AW", "Aruba", "Q21203"),
    ("AX", "Åland", "Q5689"), ("BL", "Saint Barthélemy", "Q25362"),
    ("BM", "Bermuda", "Q23635"), ("BQ", "Caribbean Netherlands", "Q27561"),
    ("BV", "Bouvet Island", "Q23408"), ("CC", "Cocos (Keeling) Islands", "Q36004"),
    ("CK", "Cook Islands", "Q26988"), ("CW", "Curaçao", "Q25279"),
    ("CX", "Christmas Island", "Q31063"), ("EH", "Western Sahara", "Q6250"),
    ("FK", "Falkland Islands", "Q9648"),
    ("FM", "Federated States of Micronesia", "Q702"),
    ("FO", "Faroe Islands", "Q4628"), ("GF", "French Guiana", "Q3769"),
    ("GG", "Guernsey", "Q25230"), ("GI", "Gibraltar", "Q1410"),
    ("GL", "Greenland", "Q223"), ("GP", "Guadeloupe", "Q17012"),
    ("GQ", "Equatorial Guinea", "Q983"),
    ("GS", "South Georgia and the South Sandwich Islands", "Q35086"),
    ("GU", "Guam", "Q16635"), ("GW", "Guinea-Bissau", "Q1007"),
    ("HK", "Hong Kong", "Q8646"),
    ("HM", "Heard Island and McDonald Islands", "Q131198"),
    ("IM", "Isle of Man", "Q9676"),
    ("IO", "British Indian Ocean Territory", "Q43448"),
    ("JE", "Jersey", "Q785"), ("KI", "Kiribati", "Q710"),
    ("KM", "Comoros", "Q970"), ("KY", "Cayman Islands", "Q5785"),
    ("LS", "Lesotho", "Q1013"), ("MF", "Saint-Martin", "Q126125"),
    ("MH", "Marshall Islands", "Q709"), ("MO", "Macau", "Q14773"),
    ("MP", "Northern Mariana Islands", "Q16644"),
    ("MQ", "Martinique", "Q17054"), ("MS", "Montserrat", "Q13353"),
    ("MZ", "Mozambique", "Q1029"), ("NC", "New Caledonia", "Q33788"),
    ("NF", "Norfolk Island", "Q31057"), ("NU", "Niue", "Q34020"),
    ("PF", "French Polynesia", "Q30971"),
    ("PM", "Saint Pierre and Miquelon", "Q34617"),
    ("PN", "Pitcairn Islands", "Q35672"), ("PR", "Puerto Rico", "Q1183"),
    ("PW", "Palau", "Q695"), ("RE", "Réunion", "Q17070"),
    ("SG", "Singapore", "Q334"),
    ("SH", "Saint Helena, Ascension and Tristan da Cunha", "Q192184"),
    ("SJ", "Svalbard and Jan Mayen", "Q842829"),
    ("SX", "Sint Maarten", "Q26273"), ("SZ", "Eswatini", "Q1050"),
    ("TC", "Turks and Caicos Islands", "Q18221"),
    ("TF", "French Southern and Antarctic Lands", "Q129003"),
    ("TK", "Tokelau", "Q36823"),
    ("UM", "United States Minor Outlying Islands", "Q16645"),
    ("VA", "Vatican City", "Q237"),
    ("VG", "British Virgin Islands", "Q25305"),
    ("VI", "United States Virgin Islands", "Q11703"),
    ("WF", "Wallis and Futuna", "Q35555"), ("YT", "Mayotte", "Q17063"),
]


def api(params: str) -> dict:
    req = urllib.request.Request(API + "?" + params, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=45) as resp:
        return json.loads(resp.read().decode())


def english_labels(ids: list[str]) -> dict:
    """Batch English labels for a list of Wikidata item ids."""
    if not ids:
        return {}
    out = {}
    for i in range(0, len(ids), 40):
        chunk = ids[i:i + 40]
        data = api(
            "action=wbgetentities&ids="
            + "|".join(chunk)
            + "&props=labels&languages=en&format=json"
        )
        for eid, ent in (data.get("entities") or {}).items():
            lab = ((ent.get("labels") or {}).get("en") or {}).get("value", "")
            if lab:
                out[eid] = lab.strip()
        time.sleep(0.25)
    return out


def demonym_items() -> dict:
    """Map country Q-id -> English demonym string.

    P1549 values are `monolingualtext` literals — a country carries the
    demonym in EVERY language it is used in ('amerikalik' in Uzbek,
    'người Mĩ' in Vietnamese, 'American' in English). The English entry is
    the one that matches the existing cuisine naming convention, so the
    `language == 'en'` value is selected. (Some P1549 claims point at an
    ITEM instead of a literal; those are resolved to their English label.)
    """
    out = {}
    for i in range(0, len(COUNTRIES), 25):
        chunk = COUNTRIES[i:i + 25]
        for iso, name, q in chunk:
            try:
                data = api(
                    f"action=wbgetclaims&entity={q}&property=P1549&format=json"
                )
                en_text = ""
                item_id = ""
                for c in (data.get("claims") or {}).get("P1549", []):
                    snak = c.get("mainsnak", {})
                    if snak.get("snaktype") != "value":
                        continue
                    dv = snak.get("datavalue", {}).get("value", {})
                    if isinstance(dv, dict):
                        if "text" in dv and dv.get("language") == "en":
                            en_text = str(dv["text"]).strip()
                        elif "id" in dv:
                            item_id = item_id or str(dv["id"])
                if en_text:
                    out[q] = en_text
                elif item_id:
                    out[q] = ("ITEM", item_id)
            except Exception as exc:
                print(f"    {iso} ({q}) claims failed: {exc}", file=sys.stderr)
            time.sleep(0.12)
    return out


def main() -> int:
    print("Fetching P1549 demonyms (wbgetclaims, language=en)...", file=sys.stderr)
    raw = demonym_items()
    print(f"  {len(raw)}/{len(COUNTRIES)} countries have an English P1549 demonym", file=sys.stderr)

    # Resolve any item-valued demonyms to their English label.
    item_ids = sorted({v[1] for v in raw.values() if isinstance(v, tuple)})
    labels = english_labels(item_ids)

    out = []
    for iso, name, q in COUNTRIES:
        v = raw.get(q, "")
        if isinstance(v, tuple):
            demonym = labels.get(v[1], "")
            demonym_item = v[1]
        else:
            demonym = v
            demonym_item = ""
        out.append({
            "iso": iso,
            "name": name,
            "qid": q,
            "demonym_item": demonym_item,
            "demonym": demonym,
        })

    missing = [o for o in out if not o["demonym"]]
    print(f"  final: {len(out) - len(missing)}/{len(out)} have an English demonym", file=sys.stderr)
    if missing:
        print("  MISSING (no English P1549 in Wikidata — needs a manual demonym):", file=sys.stderr)
        for o in missing:
            print(f"    {o['iso']} {o['name']} ({o['qid']})", file=sys.stderr)

    print(json.dumps(out, indent=2, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
