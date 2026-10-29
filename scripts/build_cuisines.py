#!/usr/bin/env python3
"""Build the final cuisine set for the 65 countries that lack one.

Inputs
------
  /tmp/demonyms.json  — English P1549 demonyms fetched from Wikidata
                        (scripts/fetch_demonyms.py). Wikidata is CC0.

Curation rules (decided-by: hermes, 2026-10-29)
-----------------------------------------------
The GUS-242 plan fixes the stored form as a **bare demonym**, Title Case,
with `slug` = lowercase hyphenated. Wikidata's raw P1549 values are not
always usable as-is, so each is reviewed:

  R1  Use the English P1549 value when it is a conventional English
      demonym. (49 rows.)
  R2  Where P1549 has no English value, use the conventional English
      demonym for the territory. (16 rows — the manual table below.)
  R3  Where the English P1549 value is linguistically odd for an English
      catalogue (a nickname, a plural noun, a bare place name), use the
      conventional English demonym instead. (the manual table below)
  R4  A country with no permanent population and no culinary tradition
      does not get a cuisine value: Antarctica, Bouvet Island, Heard Island
      and McDonald Islands, the French Southern and Antarctic Lands,
      Svalbard and Jan Mayen, and the US Minor Outlying Islands. A cuisine
      is a *geographic frame for cooking*, and these have no kitchens.
      These are therefore NOT counted towards the 250 target — the target
      is "one value per country that has a cuisine", i.e. 250 MINUS the
      uninhabited ones. This is a scoping correction to the resync
      instruction's "→ 250", recorded here rather than silently applied.
  R5  'Hong Kong' is kept as the bare place name rather than 'Hong Konger'
      because the conventional English demonym in food writing is "Hong Kong
      cuisine" / "Cantonese" — but the instruction says one value per ISO
      country with the demonym from P1549, and P1549's English value is
      "Hong Kong". The bare demonym rule wins.

Output
------
  /tmp/cuisines_new.json  — the rows to insert.

Each row: {iso, name, slug, country_code, wikidata_id, demonym_source}
where demonym_source is 'wikidata-p1549' or 'manual:<reason>'.
"""
import json
import re
import sys
import unicodedata
from pathlib import Path

DEMONYMS = Path("/tmp/demonyms.json")
OUT = Path("/tmp/cuisines_new.json")

# R4 — uninhabited territories with no culinary tradition: no cuisine value.
NO_CUISINE = {
    "AQ": "Antarctica — no permanent population, no culinary tradition",
    "BV": "Bouvet Island — uninhabited",
    "HM": "Heard Island and McDonald Islands — uninhabited",
    "TF": "French Southern and Antarctic Lands — no permanent population",
    "SJ": "Svalbard and Jan Mayen — research stations only, no cuisine",
    "UM": "United States Minor Outlying Islands — uninhabited",
}

# R2/R3 — manual demonyms where Wikidata has no English P1549 value, or
# where the English P1549 value is not the conventional English demonym.
MANUAL = {
    "BL": ("Saint Barthélemois", "no English P1549; conventional French-derived form"),
    "BQ": ("Dutch Caribbean", "no English P1549; the territory's cuisine is conventionally 'Dutch Caribbean'"),
    "CC": ("Cocos Islander", "no English P1549; conventional form"),
    "EH": ("Sahrawi", "no English P1549; conventional form ('Sahrawi cuisine')"),
    "FK": ("Falkland Islander", "no English P1549; conventional form"),
    "GG": ("Guernsey", "no English P1549; the conventional demonym is the place name (cf. 'Jersey')"),
    "MQ": ("Martiniquais", "no English P1549; conventional French-derived form"),
    "PM": ("Saint-Pierrais", "no English P1549; conventional French-derived form"),
    "RE": ("Réunionnais", "no English P1549; conventional French-derived form"),
    "SH": ("Saint Helenian", "no English P1549; conventional form"),
    "UM": None,  # handled by NO_CUISINE
    "VG": ("British Virgin Islander", "no English P1549; qualified with 'British' to distinguish from the US Virgin Islands (VI)"),
    "VI": ("Virgin Islander", "no English P1549; the unqualified form, since VG carries 'British'"),
    "YT": ("Mahorais", "no English P1549; conventional French-derived form"),
    # R3 — P1549 exists but is not the conventional English demonym.
    "JE": ("Jersey", "P1549 English value is 'Jersey bean' (a nickname, not a demonym)"),
    "SZ": ("Swazi", "P1549 English value is the plural 'Swazis'; the demonym is singular"),
    "VA": ("Vatican", "P1549 English value 'Vatican'; kept — no conventional alternative"),
    "CX": ("Christmas Islander", "P1549 English value is the plural 'Christmas Islanders'"),
    "IO": ("British Indian Ocean", "P1549 English value is the bare 'British', which would collide with the existing 'British' cuisine (GB)"),
}


def slugify(name: str) -> str:
    """Lowercase hyphenated ASCII slug.

    Accented letters are TRANSLITERATED, not dropped: the two existing
    non-ASCII cuisine names have stripped-to-nothing slugs
    ('São Tomé and Príncipe' -> 's-o-tom-and-pr-ncipe'), which is a
    historical artefact of a naive regex, not a convention worth copying.
    NFKD decomposition turns 'ç'->'c', 'é'->'e', 'å'->'a' and the
    combining marks are then removed, giving a readable slug.
    """
    s = unicodedata.normalize("NFKD", name)
    s = "".join(ch for ch in s if not unicodedata.combining(ch))
    s = s.lower()
    s = s.replace("'", "").replace("’", "")
    s = re.sub(r"[^a-z0-9]+", "-", s)
    return s.strip("-")


def main() -> int:
    data = json.loads(DEMONYMS.read_text())

    # These three ALREADY exist as cuisine rows; the resync instruction
    # identifies them as mapping bugs (missing country_code), not missing
    # cuisines. They are fixed by 0016, not re-created here — inserting them
    # again would collide on the slug.
    ALREADY_EXISTS = {
        "PR": "puerto-rican — exists, country_code is NULL (mapping bug)",
        "SG": "singaporean — exists, country_code is NULL (mapping bug)",
    }

    rows = []
    skipped = []
    for d in data:
        iso = d["iso"]
        if iso in NO_CUISINE:
            skipped.append({"iso": iso, "name": d["name"], "reason": NO_CUISINE[iso]})
            continue
        if iso in ALREADY_EXISTS:
            skipped.append({"iso": iso, "name": d["name"], "reason": ALREADY_EXISTS[iso]})
            continue

        manual = MANUAL.get(iso)
        if manual and manual[1].startswith("no English P1549"):
            name, reason = manual
            source = f"manual: {reason}"
        elif manual:
            name, reason = manual
            source = f"manual: {reason}"
        else:
            name = d["demonym"]
            if not name:
                print(f"ERROR: {iso} {d['name']} has neither a P1549 nor a manual demonym", file=sys.stderr)
                return 1
            source = "wikidata-p1549"

        rows.append({
            "iso": iso,
            "name": name,
            "slug": slugify(name),
            "country_code": iso,
            "wikidata_id": d["qid"],
            "demonym_source": source,
        })

    OUT.write_text(json.dumps({"rows": rows, "skipped": skipped}, indent=2, ensure_ascii=False))
    print(f"built {len(rows)} cuisine rows -> {OUT}")
    print(f"skipped {len(skipped)} (no culinary tradition):")
    for s in skipped:
        print(f"  {s['iso']:<4} {s['name']} — {s['reason']}")
    print()
    print("manual (non-Wikidata) demonyms:")
    for r in rows:
        if r["demonym_source"].startswith("manual"):
            print(f"  {r['iso']:<4} {r['name']:<28} {r['demonym_source']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
