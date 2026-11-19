#!/usr/bin/env python3
"""Validate sourcing markets against a closed ISO 3166-1 + Kosovo allowlist.

The rejection file preserves ambiguous duplicate names and known dish origins.
It is not an allowlist. New/unknown rows must fail until reviewed. ISO code
identity is required to distinguish China/Palestine/Netherlands duplicates.
Every supplied market field must be nonempty and identify the same country.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import unicodedata

# Database-derived denylist preserves exact origin/duplicate spellings. It can
# become stale; the independent ISO allowlist below closes that gap.
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

# The live table's NAME for each ISO market.
#
# The geo_entities table spells some countries differently from the
# ISO 3166-1 list: "Turkey" for TR, "Russia" for RU, "Ivory Coast" for
# CI, "Aland" for AX. A closed allowlist keyed on the ISO NAMES alone
# would REJECT those real markets -- the opposite error, and the worse
# one, because it refuses a market you can source in. So the live
# spellings are accepted too, mapped to their code.
#
# Like the deny-list, this file is GENERATED FROM THE LIVE TABLE, so
# it cannot drift from the database it describes.
_ALIAS_FILE = os.path.join(
    os.path.dirname(os.path.abspath(__file__)),
    "sourcing-market-name-aliases.txt",
)


def _load_name_aliases() -> dict[str, str]:
    """The live table's name for each ISO market: name -> ISO code."""
    aliases: dict[str, str] = {}
    with open(_ALIAS_FILE, encoding="utf-8") as handle:
        for line in handle:
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            name, _, code = line.partition("|")
            if name.strip() and code.strip():
                aliases[name.strip()] = code.strip()
    return aliases


NAME_ALIASES: dict[str, str] = _load_name_aliases()

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


# ISO snapshot: Debian iso-codes /usr/share/iso-codes/json/iso_3166-1.json, 249 entries.
MARKETS = {'AD': ['Andorra', 'Principality of Andorra'],
 'AE': ['United Arab Emirates'],
 'AF': ['Afghanistan', 'Islamic Republic of Afghanistan'],
 'AG': ['Antigua and Barbuda'],
 'AI': ['Anguilla'],
 'AL': ['Albania', 'Republic of Albania'],
 'AM': ['Armenia', 'Republic of Armenia'],
 'AO': ['Angola', 'Republic of Angola'],
 'AQ': ['Antarctica'],
 'AR': ['Argentina', 'Argentine Republic'],
 'AS': ['American Samoa'],
 'AT': ['Austria', 'Republic of Austria'],
 'AU': ['Australia'],
 'AW': ['Aruba'],
 'AX': ['Åland Islands'],
 'AZ': ['Azerbaijan', 'Republic of Azerbaijan'],
 'BA': ['Bosnia and Herzegovina', 'Republic of Bosnia and Herzegovina'],
 'BB': ['Barbados'],
 'BD': ['Bangladesh', "People's Republic of Bangladesh"],
 'BE': ['Belgium', 'Kingdom of Belgium'],
 'BF': ['Burkina Faso'],
 'BG': ['Bulgaria', 'Republic of Bulgaria'],
 'BH': ['Bahrain', 'Kingdom of Bahrain'],
 'BI': ['Burundi', 'Republic of Burundi'],
 'BJ': ['Benin', 'Republic of Benin'],
 'BL': ['Saint Barthélemy'],
 'BM': ['Bermuda'],
 'BN': ['Brunei Darussalam'],
 'BO': ['Bolivia, Plurinational State of', 'Plurinational State of Bolivia', 'Bolivia'],
 'BQ': ['Bonaire, Sint Eustatius and Saba'],
 'BR': ['Brazil', 'Federative Republic of Brazil'],
 'BS': ['Bahamas', 'Commonwealth of the Bahamas'],
 'BT': ['Bhutan', 'Kingdom of Bhutan'],
 'BV': ['Bouvet Island'],
 'BW': ['Botswana', 'Republic of Botswana'],
 'BY': ['Belarus', 'Republic of Belarus'],
 'BZ': ['Belize'],
 'CA': ['Canada'],
 'CC': ['Cocos (Keeling) Islands'],
 'CD': ['Congo, The Democratic Republic of the'],
 'CF': ['Central African Republic'],
 'CG': ['Congo', 'Republic of the Congo'],
 'CH': ['Switzerland', 'Swiss Confederation'],
 'CI': ["Côte d'Ivoire", "Republic of Côte d'Ivoire"],
 'CK': ['Cook Islands'],
 'CL': ['Chile', 'Republic of Chile'],
 'CM': ['Cameroon', 'Republic of Cameroon'],
 'CN': ['China', "People's Republic of China"],
 'CO': ['Colombia', 'Republic of Colombia'],
 'CR': ['Costa Rica', 'Republic of Costa Rica'],
 'CU': ['Cuba', 'Republic of Cuba'],
 'CV': ['Cabo Verde', 'Republic of Cabo Verde'],
 'CW': ['Curaçao'],
 'CX': ['Christmas Island'],
 'CY': ['Cyprus', 'Republic of Cyprus'],
 'CZ': ['Czechia', 'Czech Republic'],
 'DE': ['Germany', 'Federal Republic of Germany'],
 'DJ': ['Djibouti', 'Republic of Djibouti'],
 'DK': ['Denmark', 'Kingdom of Denmark'],
 'DM': ['Dominica', 'Commonwealth of Dominica'],
 'DO': ['Dominican Republic'],
 'DZ': ['Algeria', "People's Democratic Republic of Algeria"],
 'EC': ['Ecuador', 'Republic of Ecuador'],
 'EE': ['Estonia', 'Republic of Estonia'],
 'EG': ['Egypt', 'Arab Republic of Egypt'],
 'EH': ['Western Sahara'],
 'ER': ['Eritrea', 'the State of Eritrea'],
 'ES': ['Spain', 'Kingdom of Spain'],
 'ET': ['Ethiopia', 'Federal Democratic Republic of Ethiopia'],
 'FI': ['Finland', 'Republic of Finland'],
 'FJ': ['Fiji', 'Republic of Fiji'],
 'FK': ['Falkland Islands (Malvinas)'],
 'FM': ['Micronesia, Federated States of', 'Federated States of Micronesia'],
 'FO': ['Faroe Islands'],
 'FR': ['France', 'French Republic'],
 'GA': ['Gabon', 'Gabonese Republic'],
 'GB': ['United Kingdom', 'United Kingdom of Great Britain and Northern Ireland'],
 'GD': ['Grenada'],
 'GE': ['Georgia'],
 'GF': ['French Guiana'],
 'GG': ['Guernsey'],
 'GH': ['Ghana', 'Republic of Ghana'],
 'GI': ['Gibraltar'],
 'GL': ['Greenland'],
 'GM': ['Gambia', 'Republic of the Gambia'],
 'GN': ['Guinea', 'Republic of Guinea'],
 'GP': ['Guadeloupe'],
 'GQ': ['Equatorial Guinea', 'Republic of Equatorial Guinea'],
 'GR': ['Greece', 'Hellenic Republic'],
 'GS': ['South Georgia and the South Sandwich Islands'],
 'GT': ['Guatemala', 'Republic of Guatemala'],
 'GU': ['Guam'],
 'GW': ['Guinea-Bissau', 'Republic of Guinea-Bissau'],
 'GY': ['Guyana', 'Republic of Guyana'],
 'HK': ['Hong Kong', 'Hong Kong Special Administrative Region of China'],
 'HM': ['Heard Island and McDonald Islands'],
 'HN': ['Honduras', 'Republic of Honduras'],
 'HR': ['Croatia', 'Republic of Croatia'],
 'HT': ['Haiti', 'Republic of Haiti'],
 'HU': ['Hungary'],
 'ID': ['Indonesia', 'Republic of Indonesia'],
 'IE': ['Ireland'],
 'IL': ['Israel', 'State of Israel'],
 'IM': ['Isle of Man'],
 'IN': ['India', 'Republic of India'],
 'IO': ['British Indian Ocean Territory'],
 'IQ': ['Iraq', 'Republic of Iraq'],
 'IR': ['Iran, Islamic Republic of', 'Islamic Republic of Iran', 'Iran'],
 'IS': ['Iceland', 'Republic of Iceland'],
 'IT': ['Italy', 'Italian Republic'],
 'JE': ['Jersey'],
 'JM': ['Jamaica'],
 'JO': ['Jordan', 'Hashemite Kingdom of Jordan'],
 'JP': ['Japan'],
 'KE': ['Kenya', 'Republic of Kenya'],
 'KG': ['Kyrgyzstan', 'Kyrgyz Republic'],
 'KH': ['Cambodia', 'Kingdom of Cambodia'],
 'KI': ['Kiribati', 'Republic of Kiribati'],
 'KM': ['Comoros', 'Union of the Comoros'],
 'KN': ['Saint Kitts and Nevis'],
 'KP': ["Korea, Democratic People's Republic of",
        "Democratic People's Republic of Korea",
        'North Korea'],
 'KR': ['Korea, Republic of', 'South Korea'],
 'KW': ['Kuwait', 'State of Kuwait'],
 'KY': ['Cayman Islands'],
 'KZ': ['Kazakhstan', 'Republic of Kazakhstan'],
 'LA': ["Lao People's Democratic Republic", 'Laos'],
 'LB': ['Lebanon', 'Lebanese Republic'],
 'LC': ['Saint Lucia'],
 'LI': ['Liechtenstein', 'Principality of Liechtenstein'],
 'LK': ['Sri Lanka', 'Democratic Socialist Republic of Sri Lanka'],
 'LR': ['Liberia', 'Republic of Liberia'],
 'LS': ['Lesotho', 'Kingdom of Lesotho'],
 'LT': ['Lithuania', 'Republic of Lithuania'],
 'LU': ['Luxembourg', 'Grand Duchy of Luxembourg'],
 'LV': ['Latvia', 'Republic of Latvia'],
 'LY': ['Libya'],
 'MA': ['Morocco', 'Kingdom of Morocco'],
 'MC': ['Monaco', 'Principality of Monaco'],
 'MD': ['Moldova, Republic of', 'Republic of Moldova', 'Moldova'],
 'ME': ['Montenegro'],
 'MF': ['Saint Martin (French part)'],
 'MG': ['Madagascar', 'Republic of Madagascar'],
 'MH': ['Marshall Islands', 'Republic of the Marshall Islands'],
 'MK': ['North Macedonia', 'Republic of North Macedonia'],
 'ML': ['Mali', 'Republic of Mali'],
 'MM': ['Myanmar', 'Republic of Myanmar'],
 'MN': ['Mongolia'],
 'MO': ['Macao', 'Macao Special Administrative Region of China'],
 'MP': ['Northern Mariana Islands', 'Commonwealth of the Northern Mariana Islands'],
 'MQ': ['Martinique'],
 'MR': ['Mauritania', 'Islamic Republic of Mauritania'],
 'MS': ['Montserrat'],
 'MT': ['Malta', 'Republic of Malta'],
 'MU': ['Mauritius', 'Republic of Mauritius'],
 'MV': ['Maldives', 'Republic of Maldives'],
 'MW': ['Malawi', 'Republic of Malawi'],
 'MX': ['Mexico', 'United Mexican States'],
 'MY': ['Malaysia'],
 'MZ': ['Mozambique', 'Republic of Mozambique'],
 'NA': ['Namibia', 'Republic of Namibia'],
 'NC': ['New Caledonia'],
 'NE': ['Niger', 'Republic of the Niger'],
 'NF': ['Norfolk Island'],
 'NG': ['Nigeria', 'Federal Republic of Nigeria'],
 'NI': ['Nicaragua', 'Republic of Nicaragua'],
 'NL': ['Netherlands', 'Kingdom of the Netherlands'],
 'NO': ['Norway', 'Kingdom of Norway'],
 'NP': ['Nepal', 'Federal Democratic Republic of Nepal'],
 'NR': ['Nauru', 'Republic of Nauru'],
 'NU': ['Niue'],
 'NZ': ['New Zealand'],
 'OM': ['Oman', 'Sultanate of Oman'],
 'PA': ['Panama', 'Republic of Panama'],
 'PE': ['Peru', 'Republic of Peru'],
 'PF': ['French Polynesia'],
 'PG': ['Papua New Guinea', 'Independent State of Papua New Guinea'],
 'PH': ['Philippines', 'Republic of the Philippines'],
 'PK': ['Pakistan', 'Islamic Republic of Pakistan'],
 'PL': ['Poland', 'Republic of Poland'],
 'PM': ['Saint Pierre and Miquelon'],
 'PN': ['Pitcairn'],
 'PR': ['Puerto Rico'],
 'PS': ['Palestine, State of', 'the State of Palestine'],
 'PT': ['Portugal', 'Portuguese Republic'],
 'PW': ['Palau', 'Republic of Palau'],
 'PY': ['Paraguay', 'Republic of Paraguay'],
 'QA': ['Qatar', 'State of Qatar'],
 'RE': ['Réunion'],
 'RO': ['Romania'],
 'RS': ['Serbia', 'Republic of Serbia'],
 'RU': ['Russian Federation'],
 'RW': ['Rwanda', 'Rwandese Republic'],
 'SA': ['Saudi Arabia', 'Kingdom of Saudi Arabia'],
 'SB': ['Solomon Islands'],
 'SC': ['Seychelles', 'Republic of Seychelles'],
 'SD': ['Sudan', 'Republic of the Sudan'],
 'SE': ['Sweden', 'Kingdom of Sweden'],
 'SG': ['Singapore', 'Republic of Singapore'],
 'SH': ['Saint Helena, Ascension and Tristan da Cunha'],
 'SI': ['Slovenia', 'Republic of Slovenia'],
 'SJ': ['Svalbard and Jan Mayen'],
 'SK': ['Slovakia', 'Slovak Republic'],
 'SL': ['Sierra Leone', 'Republic of Sierra Leone'],
 'SM': ['San Marino', 'Republic of San Marino'],
 'SN': ['Senegal', 'Republic of Senegal'],
 'SO': ['Somalia', 'Federal Republic of Somalia'],
 'SR': ['Suriname', 'Republic of Suriname'],
 'SS': ['South Sudan', 'Republic of South Sudan'],
 'ST': ['Sao Tome and Principe', 'Democratic Republic of Sao Tome and Principe'],
 'SV': ['El Salvador', 'Republic of El Salvador'],
 'SX': ['Sint Maarten (Dutch part)'],
 'SY': ['Syrian Arab Republic', 'Syria'],
 'SZ': ['Eswatini', 'Kingdom of Eswatini'],
 'TC': ['Turks and Caicos Islands'],
 'TD': ['Chad', 'Republic of Chad'],
 'TF': ['French Southern Territories'],
 'TG': ['Togo', 'Togolese Republic'],
 'TH': ['Thailand', 'Kingdom of Thailand'],
 'TJ': ['Tajikistan', 'Republic of Tajikistan'],
 'TK': ['Tokelau'],
 'TL': ['Timor-Leste', 'Democratic Republic of Timor-Leste'],
 'TM': ['Turkmenistan'],
 'TN': ['Tunisia', 'Republic of Tunisia'],
 'TO': ['Tonga', 'Kingdom of Tonga'],
 'TR': ['Türkiye', 'Republic of Türkiye'],
 'TT': ['Trinidad and Tobago', 'Republic of Trinidad and Tobago'],
 'TV': ['Tuvalu'],
 'TW': ['Taiwan, Province of China', 'Taiwan'],
 'TZ': ['Tanzania, United Republic of', 'United Republic of Tanzania', 'Tanzania'],
 'UA': ['Ukraine'],
 'UG': ['Uganda', 'Republic of Uganda'],
 'UM': ['United States Minor Outlying Islands'],
 'US': ['United States', 'United States of America'],
 'UY': ['Uruguay', 'Eastern Republic of Uruguay'],
 'UZ': ['Uzbekistan', 'Republic of Uzbekistan'],
 'VA': ['Holy See (Vatican City State)'],
 'VC': ['Saint Vincent and the Grenadines'],
 'VE': ['Venezuela, Bolivarian Republic of', 'Bolivarian Republic of Venezuela', 'Venezuela'],
 'VG': ['Virgin Islands, British', 'British Virgin Islands'],
 'VI': ['Virgin Islands, U.S.', 'Virgin Islands of the United States'],
 'VN': ['Viet Nam', 'Socialist Republic of Viet Nam', 'Vietnam'],
 'VU': ['Vanuatu', 'Republic of Vanuatu'],
 'WF': ['Wallis and Futuna'],
 'WS': ['Samoa', 'Independent State of Samoa'],
 'XK': ['Kosovo'],
 'YE': ['Yemen', 'Republic of Yemen'],
 'YT': ['Mayotte'],
 'ZA': ['South Africa', 'Republic of South Africa'],
 'ZM': ['Zambia', 'Republic of Zambia'],
 'ZW': ['Zimbabwe', 'Republic of Zimbabwe']}
_MARKET_KEYS = {norm(name): code for code, names in MARKETS.items() for name in [code, *names]}

def is_sourceable(value: str, known_codes: set[str] | None = None) -> tuple[bool, str]:
    """Is this name or ISO code a sourceable MARKET?

    Returns (ok, reason).
    """
    if not isinstance(value, str) or not norm(value):
        return False, "the market must be a nonempty string"
    key = norm(value)
    if key in _NOT_A_MARKET_NORM:
        return False, f"{value!r} is not a sourcing market (or is an ambiguous duplicate name); use an ISO code for a real market"
    code = _MARKET_KEYS.get(key)
    if code is None:
        # The live table's own spelling for an ISO market.
        for live_name, live_code in NAME_ALIASES.items():
            if norm(live_name) == key:
                code = live_code
                break
    if code is None:
        return False, f"{value!r} is not in the ISO + Kosovo market allowlist"
    if known_codes is not None and code not in {str(c).upper().strip() for c in known_codes} | EXTRA_SOURCEABLE:
        return False, f"{value!r} is absent from the supplied ISO codes"
    return True, ""



def unique_row(pairs):
    row = {}
    for key, value in pairs:
        if key in row:
            raise ValueError(f"duplicate JSON field: {key}")
        row[key] = value
    return row

def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("values", nargs="*", help="the names or ISO codes to check")
    ap.add_argument("--list", action="store_true", help="list the two sets")
    ap.add_argument("--row", help="one availability row as JSON")
    ap.add_argument(
        "--iso-codes",
        help="optional code subset, one per line; cannot expand the built-in ISO + Kosovo allowlist",
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
    if args.row is not None:
        try:
            row = json.loads(args.row, object_pairs_hook=unique_row)
        except ValueError as exc:
            print(f"FAILED: the row is not valid JSON: {exc}")
            return 1
        if not isinstance(row, dict):
            print("FAILED: the row is not an object")
            return 1
        present = [row[field] for field in ("country_code", "geo_entity", "country", "market") if field in row]
        if not present:
            print("FAILED: the row names no market")
            return 1
        for value in present:
            ok, reason = is_sourceable(value, known_codes)
            if not ok:
                print(f"FAILED: {reason}")
                return 1
        if len({_MARKET_KEYS[norm(v)] for v in present}) != 1:
            print("FAILED: conflicting market identities")
            return 1
        values.extend(present)

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
