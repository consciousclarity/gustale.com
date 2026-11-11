#!/usr/bin/env python3
"""extract-retailer-price.py -- read a product's OWN price from its
OWN page, and refuse a related-product price.

THE PROBLEM THIS SOLVES
------------------------
A retailer product page usually shows the target product's price AND
a list of related products, each with its own price. Two separate
research passes took the WRONG one:

  - the Spice House "tamarind" search reported "5 results found" and
    none of the five was tamarind; the prices in the grid belonged to
    unrelated trending products;
  - the Migros coconut-milk page's OWN product is "Migros .
    Kokosnussmilch, 400 ml, CHF 1.40", but the first extraction took
    CHF 2.80 -- the Thai Kitchen 250 ml from the related-products
    carousel. The own-brand product was CHEAPER and a DIFFERENT
    product, so the error changed the price band.

So the price is not "a number near a currency symbol". The price is
the one that belongs to THIS product, and the tool has to be able to
say which one that is -- or refuse.

WHAT THIS DOES
--------------
It extracts the price for a NAMED product from a fetched retailer
page, using the site's own price-block structure, and it reports a
price only when it can tie it to the target product.

    python3 scripts/extract-retailer-price.py --page page.md \\
        --product "Migros · Kokosnussmilch"

Site profiles are declared in SITES below. Each profile says where a
product's own price sits relative to the product's own NAME, and where
the related-products section begins. The default rule is the safe
one:

    THE OWN-PRICE BLOCK IS THE ONE IMMEDIATELY BEFORE THE PRODUCT'S
    OWN HEADING.

A price that appears AFTER the related-products marker is never the
target's.

EXIT CODES
----------
    0  a price was extracted and tied to the target product
    1  no price, or the page shape is not understood -- REFUSED, and
       the reason is printed
    2  a bad invocation

THE CONTRACT
------------
A price that this tool cannot tie to the product is NOT ESTIMATED.
The caller records "not established" and moves on. A category page's
price, a carousel's price, or a guessed unit price is worse than a
missing price: it looks like evidence.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from dataclasses import dataclass, field
from typing import Callable

# --------------------------------------------------------------------------
# The site profiles.
#
# Each profile is a set of regexes over the fetched markdown. The
# fetch helper writes the page as:
#
#     Title: <page title>
#
#     URL Source: <the url>
#
#     Markdown Content:
#     <the rendered page>
#
# A profile declares:
#   own_price    a regex whose FIRST capture group is the price, whose
#                match must sit immediately BEFORE the product name
#   related_from the regex that starts the related-products section;
#                a price after it is never the target's
#   product_re   a regex matching the target product's own heading
#   unit_re      an optional regex for the base-unit price
# --------------------------------------------------------------------------

NUMBER = r"(\d{1,4}(?:[.,]\d{2})?)\s*(?:€|CHF|EUR|Rp|USD|\$)?\s*"


@dataclass(frozen=True)
class SiteProfile:
    """How one retailer's product page is laid out.

    The price's position is per-site, because retailers differ: Migros
    puts the price immediately BEFORE the product's heading, while the
    Asia Shop puts it immediately AFTER (right after the stock line).
    The shared principle is not "before" or "after" -- it is:

        THE PRICE MUST BE NEAR THE PRODUCT'S OWN HEADING, AND IT MUST
        COME BEFORE THE RELATED-PRODUCTS SECTION.

    So each profile declares a window: how far either side of the
    heading a price may sit. A price outside the window, or after the
    related-products section, is never the target's.
    """

    name: str
    # The product's own price block: capture group 1 = the price.
    own_price: re.Pattern[str]
    # The heading that names the product, so the price can be tied to it.
    product_re: re.Pattern[str]
    # Where the related-products (carousel) section starts.
    related_from: re.Pattern[str]
    # The base-unit price, if the site shows one.
    unit_re: re.Pattern[str] | None = None
    # How many LINES before the heading a price may sit.
    before_window: int = 12
    # How many LINES after the heading a price may sit.
    after_window: int = 25
    # A note about the site's shape, for the docs.
    note: str = ""

    def related_start(self, page: str) -> int:
        """The offset where the related-products section begins, or the
        end of the page."""
        m = self.related_from.search(page)
        return m.start() if m else len(page)


# The German specialty shop: "<price>€inkl. MwSt." then the name.
ASIATISCHER = SiteProfile(
    name="asiatischer-lebensmittelladen.de",
    own_price=re.compile(
        r"(?P<price>\d{1,4}[.,]\d{2})\s*(?:€|EUR)\s*inkl\.?\s*MwSt",
        re.IGNORECASE,
    ),
    product_re=re.compile(r"^# (?!#)(?P<title>.+?)\s*$", re.MULTILINE),
    related_from=re.compile(r"^##\s*(?:Ähnliche|Ähnliche Produkte|Bewertungen)", re.MULTILINE | re.IGNORECASE),
    unit_re=re.compile(r"Grundpreis:\s*(?P<unit>\d{1,4}[.,]\d{2})\s*(?:€|EUR)\s*/\s*(?P<per>kg|l)", re.IGNORECASE),
    before_window=6,
    after_window=30,
    note="the price sits AFTER the H1, right after the stock line ('Nicht vorrätig'), with the base-unit price beside it",
)

# Migros: "Ein Franken 40 1.40" then the H1. The decimal before the
# heading is the price; the words are the francs and cents.
MIGROS = SiteProfile(
    name="migros.ch",
    own_price=re.compile(
        r"(?:Ein\s+)?Franken\s*\d+\s+(?P<price>\d{1,3}\.\d{2})",
        re.IGNORECASE,
    ),
    product_re=re.compile(r"^# (?!#)(?P<title>.+?)\s*$", re.MULTILINE),
    related_from=re.compile(r"^##\s*(?:Ähnliche Produkte|Ähnliche Artikel|Weitere)", re.MULTILINE | re.IGNORECASE),
    unit_re=re.compile(r"(?P<unit>\d{1,3}[.,]\d{2})\s*pro\s*100\s*(?P<per>ml|g)\b", re.IGNORECASE),
    before_window=12,
    after_window=12,
    note="the price block is '<francs> Franken <cents> <decimal>' immediately BEFORE the H1",
)

# Tokopedia: the product page's own price block.
TOKOPEDIA = SiteProfile(
    name="tokopedia.com",
    own_price=re.compile(
        r"(?:Subtotal|Harga)?\s*(?P<price>Rp\s*[\d.]+)",
        re.IGNORECASE,
    ),
    product_re=re.compile(r"^# (?!#)(?P<title>.+?)\s*$", re.MULTILINE),
    related_from=re.compile(r"^\s*(?:Rekomendasi|Lainnya|Produk lainnya)", re.MULTILINE | re.IGNORECASE),
    unit_re=None,
    before_window=6,
    after_window=20,
    note="the product's own price block reads 'Subtotal Rp...' or a bare 'Rp...' under the title; a search page has no price block at all",
)

# A plain price block, for a simple shop.
SIMPLE = SiteProfile(
    name="simple",
    own_price=re.compile(r"(?P<price>\d{1,4}[.,]\d{2})\s*(?:€|CHF|USD|\$|EUR)", re.IGNORECASE),
    product_re=re.compile(r"^# (?!#)(?P<title>.+?)\s*$", re.MULTILINE),
    related_from=re.compile(r"^\s*(?:Ähnliche Produkte|Related products|You may also like|Andere Kunden)", re.MULTILINE | re.IGNORECASE),
    unit_re=None,
    note="a plain price followed by a currency symbol, immediately before the product's H1",
)

SITES: dict[str, SiteProfile] = {
    "asiatischer-lebensmittelladen.de": ASIATISCHER,
    "migros.ch": MIGROS,
    "tokopedia.com": TOKOPEDIA,
    "simple": SIMPLE,
}


def site_for(page: str) -> SiteProfile:
    """The profile for a fetched page, chosen by its URL Source line."""
    m = re.search(r"^URL Source:\s*(\S+)", page, re.MULTILINE)
    url = m.group(1) if m else ""
    for key, profile in SITES.items():
        if key != "simple" and key in url:
            return profile
    return SIMPLE


def _norm(text: str) -> str:
    """A comparable form of a product name: case-folded, accents
    stripped, punctuation and whitespace collapsed."""
    import unicodedata

    folded = unicodedata.normalize("NFKD", text)
    folded = "".join(ch for ch in folded if not unicodedata.combining(ch))
    folded = folded.replace("·", " ").replace("•", " ")
    folded = re.sub(r"[^0-9a-zA-Z]+", " ", folded)
    return re.sub(r"\s+", " ", folded).strip().lower()


def _price_value(raw: str) -> float | None:
    """The numeric value of a price string, in its own currency.
    '1.40' -> 1.40; '2,49' -> 2.49; 'Rp 28.000' -> 28000.0."""
    s = raw.strip()
    if s.lower().startswith("rp"):
        s = s[2:]
    s = re.sub(r"[^\d.,]", "", s)
    if not s:
        return None
    # Indonesian thousands: a dot between 3-digit groups.
    if re.fullmatch(r"[\d.]+", s) and "." in s:
        parts = s.split(".")
        if len(parts) > 1 and all(len(p) == 3 for p in parts[1:]):
            return float(s.replace(".", ""))
    # European decimal: a comma before one or two trailing digits.
    if "," in s:
        s = s.replace(".", "").replace(",", ".")
    try:
        return float(s)
    except ValueError:
        return None


@dataclass
class Extraction:
    """What the tool concluded about one page."""

    price: str | None = None
    value: float | None = None
    currency: str | None = None
    product_title: str | None = None
    unit_price: str | None = None
    size: str | None = None
    site: str = ""
    matched_target: bool = False
    reason: str = ""
    notes: list[str] = field(default_factory=list)

    def as_dict(self) -> dict[str, object]:
        return {
            "price": self.price,
            "value": self.value,
            "currency": self.currency,
            "product_title": self.product_title,
            "unit_price": self.unit_price,
            "size": self.size,
            "site": self.site,
            "matched_target": self.matched_target,
            "reason": self.reason,
            "notes": self.notes,
        }


def _currency_of(raw: str, page: str) -> str | None:
    if raw.strip().lower().startswith("rp"):
        return "IDR"
    m = re.search(r"[€$]", raw)
    if m:
        return "EUR" if m.group(0) == "€" else "USD"
    if re.search(r"\bCHF\b", raw, re.IGNORECASE):
        return "CHF"
    # Fall back to the page's own domain.
    u = re.search(r"^URL Source:\s*(\S+)", page, re.MULTILINE)
    if u:
        host = u.group(1)
        for key, cur in (
            ("migros.ch", "CHF"),
            ("asiatischer-lebensmittelladen.de", "EUR"),
            ("tokopedia.com", "IDR"),
        ):
            if key in host:
                return cur
    return None


def extract(
    page: str,
    product: str | None = None,
    site: SiteProfile | None = None,
) -> Extraction:
    """The price for `product` on `page`, or a refusal with a reason."""
    profile = site or site_for(page)
    out = Extraction(site=profile.name)

    # The page's own product title, from its Title: line.
    t = re.search(r"^Title:\s*(?P<title>.+?)\s*$", page, re.MULTILINE)
    page_title = t.group("title") if t else None

    # The product headings on the page, in order.
    headings = [(m.start(), m.group("title").strip()) for m in profile.product_re.finditer(page)]
    if not headings:
        out.reason = "the page has no product heading, so no price can be tied to a product"
        return out

    # A heading that is a markdown LINK is a cross-reference, not the
    # product's own name. The Asia Shop repeats its H1 as a link to a
    # sibling product, and that link must not win.
    def _is_link(title: str) -> bool:
        return title.lstrip().startswith("[") or "](" in title

    # Which heading is the target's?
    target_idx: int | None = None
    if product:
        want = _norm(product)
        # A page may repeat the product's heading -- a table of
        # contents repeats it -- and the price belongs to the LAST
        # occurrence, which is the one the price block sits beside.
        # So collect every candidate and take the last.
        candidates = [
            i
            for i, (_, title) in enumerate(headings)
            if want and not _is_link(title) and (want in _norm(title) or _norm(title) in want)
        ]
        if candidates:
            target_idx = candidates[-1]
        if target_idx is None:
            out.reason = (
                f"the product {product!r} was not found on the page; "
                f"the page's headings are {[h[1] for h in headings[:6]]}"
            )
            out.product_title = page_title
            return out
        out.matched_target = True
        out.product_title = headings[target_idx][1]
    else:
        target_idx = 0
        out.product_title = headings[0][1]

    heading_start = headings[target_idx][0]

    # The related-products section. A price after it is never the
    # target's, whatever its distance from the heading.
    #
    # IMPORTANT: a marker BEFORE the heading does not bound the
    # window. Tokopedia's page has a "Rekomendasi" block in its
    # sidebar, well ABOVE the product's H1, and the product's own
    # price sits below the heading. Truncating at that marker would
    # throw the real price away.
    rel = profile.related_start(page)
    if rel and rel < heading_start:
        rel = 0

    # The window: a band around the product's own heading. The price
    # sits either just before it (Migros) or just after it (the Asia
    # Shop puts it after the stock line; Tokopedia after the title).
    # Both are within a few hundred characters.
    # The window is measured in LINES, from the heading's own line.
    head_line = page.count("\n", 0, heading_start)
    lines = page.split("\n")
    win_start_line = max(0, head_line - profile.before_window)
    win_end_line = min(len(lines), head_line + profile.after_window + 1)
    win_start = sum(len(l) + 1 for l in lines[:win_start_line])
    win_end = sum(len(l) + 1 for l in lines[:win_end_line])
    if rel and rel > win_start:
        win_end = min(win_end, rel)

    # The window must not reach back over the PREVIOUS product's
    # heading, or a neighbouring product's price could leak in.
    if target_idx > 0:
        prev_start = headings[target_idx - 1][0]
        win_start = max(win_start, prev_start + len(headings[target_idx - 1][1]))

    window = page[win_start:win_end]
    matches = list(profile.own_price.finditer(window))
    if not matches:
        out.reason = (
            f"no price block of the {profile.name} shape sits within "
            f"{profile.before_window} lines before / {profile.after_window} "
            f"lines after the product's heading"
        )
        return out

    # The NEAREST price to the heading is the product's own. A page
    # puts the price immediately above or below the name it belongs to;
    # anything further away belongs to something else.
    best = min(
        matches,
        key=lambda mm: abs((win_start + mm.start()) - heading_start),
    )
    raw = best.group("price")
    out.price = raw.strip()
    out.value = _price_value(raw)
    out.currency = _currency_of(raw, page)

    # The unit price, if the site shows one.
    if profile.unit_re:
        # The unit price sits in the size line beside the heading.
        after = page[heading_start : heading_start + 600]
        um = profile.unit_re.search(after)
        if um:
            per = um.group("per") or ""
            out.unit_price = f"{um.group('unit')} / 100{per}"

    # The size: a quantity with a unit, right after the heading.
    sm = re.search(r"\b(\d{1,4}(?:[.,]\d{1,3})?)\s*(ml|l\b|g\b|Gramm|Milliliter|Karton|cl)", page[heading_start : heading_start + 300])
    if sm:
        out.size = f"{sm.group(1)}{sm.group(2)}"

    # A price inside the related-products section is never the
    # target's, whatever the window said.
    price_pos = win_start + best.start()
    if rel and price_pos > rel:
        out.reason = "the only price found sits inside the related-products section"
        out.price = None
        out.value = None

    return out


def _read_page(path: str) -> str:
    with open(path, encoding="utf-8", errors="replace") as fh:
        return fh.read()


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--page", required=True, help="the fetched page (markdown)")
    ap.add_argument("--product", help="the target product's name, as it appears on the page")
    ap.add_argument("--site", help="force a site profile (one of: " + ", ".join(SITES) + ")")
    ap.add_argument("--json", action="store_true", help="print the result as JSON")
    args = ap.parse_args(argv)

    try:
        page = _read_page(args.page)
    except OSError as exc:
        print(f"REFUSED: cannot read the page: {exc}", file=sys.stderr)
        return 1

    profile = SITES.get(args.site) if args.site else None
    if args.site and profile is None:
        print(f"REFUSED: unknown site profile {args.site!r}", file=sys.stderr)
        return 2

    result = extract(page, args.product, profile)

    if args.json:
        print(json.dumps(result.as_dict(), indent=2, ensure_ascii=False))
    elif result.price:
        unit = f"  ({result.unit_price})" if result.unit_price else ""
        print(f"{result.price}{unit}  [{result.currency}]  {result.product_title}")
    else:
        print(f"REFUSED: {result.reason}", file=sys.stderr)

    return 0 if result.price else 1


if __name__ == "__main__":
    raise SystemExit(main())
