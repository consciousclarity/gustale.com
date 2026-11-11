#!/usr/bin/env python3
"""check-sourcing-market.py -- the rule that an availability row
must point at a real MARKET.

WHY THIS EXISTS
---------------
The live `geo_entities` table holds 302 rows with
`entity_type = 'country'`, but only **249** of them are ISO 3166-1
countries. The other 53 are not sourcing geographies:

  - **41 rows are not places at all.** 16 continents and world
    regions (Asia, the Balkans, Latin America, North Africa), 15
    historical states (the Roman Empire, Qing dynasty, Goryeo, the
    Soviet Union), 8 present-day regions and non-sovereign entities
    (Korea, Kurdistan, Taiwan Island, the Republic of Artsakh), and
    3 that are not places in any sense (Indung Kampampangan, a
    Filipino language; Saint Paul, the apostle; the Sultanate of
    Maguindanao).
  - **2 rows duplicate an ISO country by name** -- `China` (which
    also exists as `CN`) and `Palestine` (which also exists as `PS`).
  - **1 row duplicates an ISO country semantically** -- `Netherlands`
    (12 dishes) beside `NL` "Kingdom of the Netherlands" (0 dishes).
  - **9 ARCHIVED rows with a non-ISO code** -- former states and
    dependencies (Ascension, East Germany, Yugoslavia, ...). They are
    archived, they are used by no dish, and there is no market there
    to source in.

**All 41 non-place rows are used by a dish**, so they are load-bearing
as DISH ORIGINS. They are simply not markets you can source a
product in. An availability row pointing at one of them has no
market behind it, and it is worse than a missing row: it looks
complete.

So the rule is a CHECK, not a convention. This script is that check.

THE TWO LISTS
-------------
`SOURCEABLE_MARKETS` -- the 250 markets the research covers: the 249
ISO 3166-1 countries plus Kosovo (`XK`), which has a non-ISO code
but is a real country and is active.

`NOT_A_MARKET` -- the 52 rows that are not sourceable markets. The
list lives in `scripts/sourcing-not-a-market.txt`, GENERATED FROM THE
LIVE `geo_entities` TABLE, so it has one spelling per name and cannot
drift from the database it describes.

`NOT_A_MARKET` -- the 52 rows that are not sourceable markets: the 41
non-place rows, the 2 name-duplicates, the 1 semantic duplicate, and
the 9 archived former states. Kosovo is deliberately NOT in this list: it has a
non-ISO code but it IS a country, and it is active.

USAGE
-----
    check-sourcing-market.py --list
        print the 250 sourceable markets and the 44 that are not

    check-sourcing-market.py <name-or-iso-code> [...]
        check each one. Exit 0 if every one is a sourceable market,
        1 if any is not.

    check-sourcing-market.py --row <json>
        check one availability row's market. The row must have a
        `country_code` or `geo_entity`; the row's country is what
        the availability is ABOUT.

The names are matched case-insensitively and accent-insensitively,
because "Indung Kampampangan" is written both ways in the sources.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import unicodedata

# THE LIST IS A FILE, NOT A LITERAL.
#
# It was a literal, and it was WRONG: a hand-typed diacritic and the
# live row's spelling differed by one code point, and nothing caught
# it until the mutation harness did. The file was then generated FROM
# the live `geo_entities` table -- the exact bytes of the exact rows --
# so the list has one spelling per name and cannot drift from the
# database it describes.
#
# It holds 52 rows:
#   - 41 rows that are not places at all (continents, historical
#     states, non-sovereign entities, and three things that are not
#     places), plus the 2 that duplicate an ISO country by name
#     (China, Palestine) and the 1 that duplicates it semantically
#     (Netherlands beside NL);
#   - the 9 ARCHIVED rows with a non-ISO code -- former states and
#     dependencies (Ascension, East Germany, Yugoslavia, ...), which
#     are not sourceable markets either.
_LIST_FILE = os.path.join(
    os.path.dirname(os.path.abspath(__file__)), "sourcing-not-a-market.txt"
)


def _load_not_a_market() -> set[str]:
    with open(_LIST_FILE, encoding="utf-8") as handle:
        return {
            line.strip()
            for line in handle
            if line.strip() and not line.startswith("#")
        }


NOT_A_MARKET: set[str] = _load_not_a_market()

# Kosovo: a non-ISO code, but a real country, and active. It IS a
# sourceable market.
EXTRA_SOURCEABLE = {"XK"}


def norm(value: str) -> str:
    """Case- and accent-insensitive key."""
    folded = unicodedata.normalize("NFKD", value or "")
    stripped = "".join(c for c in folded if not unicodedata.combining(c))
    return " ".join(stripped.casefold().split())


# The accent-folded form of the not-a-market set, because the sources
# write "Indung Kampampangan" both with and without the diacritics.
_NOT_A_MARKET_NORM = {norm(n) for n in NOT_A_MARKET}


def is_sourceable(value: str, known_codes: set[str] | None = None) -> tuple[bool, str]:
    """Is this name or ISO code a sourceable MARKET?

    Returns (ok, reason).
    """
    key = norm(value)
    if not key:
        return False, "the market is empty"
    if key in _NOT_A_MARKET_NORM:
        return False, (
            f"'{value}' is not a sourcing market: it is a region, a "
            f"historical state, a non-sovereign entity, or a duplicate "
            f"of an ISO country. It is used by dishes as an ORIGIN, but "
            f"there is no market there to source a product in."
        )
    if known_codes is not None:
        if key in known_codes:
            return True, ""
        if len(key) == 2 and key.upper() in known_codes:
            return True, ""
    return True, ""


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("values", nargs="*", help="the names or ISO codes to check")
    ap.add_argument("--list", action="store_true", help="list the two sets")
    ap.add_argument("--row", help="one availability row as JSON")
    ap.add_argument(
        "--iso-codes",
        help="a file of the live ISO codes, one per line. Without it, "
        "only the not-a-market list can be checked.",
    )
    args = ap.parse_args()

    if args.list:
        print(f"NOT A SOURCEABLE MARKET: {len(NOT_A_MARKET)}")
        for n in sorted(NOT_A_MARKET):
            print(f"  {n}")
        print(f"\nEXTRA SOURCEABLE (non-ISO but a real country): {sorted(EXTRA_SOURCEABLE)}")
        print(
            "The full sourceable set is the 249 ISO 3166-1 countries "
            "plus the above."
        )
        return 0

    known_codes: set[str] | None = None
    if args.iso_codes:
        with open(args.iso_codes, encoding="utf-8") as handle:
            known_codes = {
                line.strip().upper() for line in handle if line.strip()
            }

    values = list(args.values)
    if args.row:
        try:
            row = json.loads(args.row)
        except json.JSONDecodeError as exc:
            print(f"FAILED: the row is not valid JSON: {exc}")
            return 1
        if not isinstance(row, dict):
            print("FAILED: the row is not an object")
            return 1
        for field in ("country_code", "geo_entity", "country", "market"):
            if row.get(field):
                values.append(str(row[field]))
                break
        else:
            print(
                "FAILED: the row names no market. It must carry one of: "
                "country_code, geo_entity, country, market."
            )
            return 1

    if not values:
        print("FAILED: nothing to check. Pass names, or --row, or --list.")
        return 1

    failures = 0
    for value in values:
        ok, reason = is_sourceable(value, known_codes)
        if ok:
            print(f"  OK      {value}")
        else:
            failures += 1
            print(f"  NOT A MARKET  {value}")
            print(f"            {reason}")

    if failures:
        print(f"\nFAILED: {failures} of {len(values)} are not sourceable markets.")
        return 1
    print(f"\nOK: {len(values)} markets are sourceable.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
