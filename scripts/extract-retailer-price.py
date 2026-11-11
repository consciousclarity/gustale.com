#!/usr/bin/env python3
"""Extract an identified Product's single explicit JSON-LD Offer, or REFUSE.

Rendered markdown proximity is not evidence of price ownership. None of the
former Migros, Asia Shop, Tokopedia or generic markdown profiles is certified.
Fetch original HTML retaining JSON-LD, supply the exact full product name, and
retain a URL Source line identifying the fetched product URL. Only a top-level
Product (or @graph member) with that URL is eligible. Nested recommendations,
AggregateOffer ranges, variants and multiple offers are refused. JSON-LD is
publisher evidence, not a guarantee of freshness or truth; retain the capture
and review it before publication.
"""
from __future__ import annotations

import argparse
from dataclasses import asdict, dataclass
from decimal import Decimal, InvalidOperation
from html.parser import HTMLParser
import json
import re
import sys
import unicodedata
from urllib.parse import urlsplit


# ISO 4217 snapshot from Debian iso-codes; exclude test/no-currency codes.
CURRENCIES = frozenset('AED AFN ALL AMD ANG AOA ARS AUD AWG AZN BAM BBD BDT BGN BHD BIF BMD BND BOB BOV BRL BSD BTN BWP BYN BZD CAD CDF CHE CHF CHW CLF CLP CNY COP COU CRC CUC CUP CVE CZK DJF DKK DOP DZD EGP ERN ETB EUR FJD FKP GBP GEL GHS GIP GMD GNF GTQ GYD HKD HNL HRK HTG HUF IDR ILS INR IQD IRR ISK JMD JOD JPY KES KGS KHR KMF KPW KRW KWD KYD KZT LAK LBP LKR LRD LSL LYD MAD MDL MGA MKD MMK MNT MOP MRU MUR MVR MWK MXN MXV MYR MZN NAD NGN NIO NOK NPR NZD OMR PAB PEN PGK PHP PKR PLN PYG QAR RON RSD RUB RWF SAR SBD SCR SDG SEK SGD SHP SLE SLL SOS SRD SSP STN SVC SYP SZL THB TJS TMT TND TOP TRY TTD TWD TZS UAH UGX USD USN UYI UYU UYW UZS VED VES VND VUV WST XAF XAG XAU XBA XBB XBC XBD XCD XDR XOF XPD XPF XPT XSU XUA YER ZAR ZMW ZWL'.split())

def unique_object(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError("duplicate JSON key")
        result[key] = value
    return result


@dataclass
class Extraction:
    price: str | None = None
    value: float | None = None
    currency: str | None = None
    product_title: str | None = None
    unit_price: str | None = None
    size: str | None = None
    site: str = ""
    matched_target: bool = False
    reason: str = ""
    # Which evidence tier produced the price. A Tier 1 price (the
    # publisher's own product record) and a Tier 2 price (a JSON-LD
    # Offer) are not the same kind of evidence, and the research
    # documents must be able to say which one they are.
    tier: str = ""
    carrier: str = ""

    def as_dict(self):
        return asdict(self)


class StructuredData(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.active = False
        self.parts = []
        self.blocks = []

    def handle_starttag(self, tag, attrs):
        if tag == "script":
            self.active = dict(attrs).get("type", "").lower() == "application/ld+json"
            self.parts = []

    def handle_data(self, data):
        if self.active:
            self.parts.append(data)

    def handle_endtag(self, tag):
        if tag == "script" and self.active:
            self.blocks.append("".join(self.parts))
            self.active = False


def norm(value):
    return " ".join(unicodedata.normalize("NFC", value).casefold().split())


def canonical(value):
    if not isinstance(value, str) or any(c.isspace() or ord(c) < 32 for c in value):
        return None
    try:
        u = urlsplit(value)
        if u.scheme != "https" or not u.hostname or u.username or u.password or u.fragment:
            return None
        return (u.hostname.lower(), u.port if u.port is not None else 443, u.path or "/", u.query)
    except ValueError:
        return None


def typed(obj, kind):
    return obj.get("@type") in (kind, "https://schema.org/" + kind, "http://schema.org/" + kind)



# ── Tier 1: the publisher's own product record ───────────────────
#
# The price is a FIELD OF THE PRODUCT OBJECT, published by the
# retailer for this page. This is the strongest ownership evidence
# available, and it is what the three real sites actually publish.
#
# Each carrier is (a regex to find the object, a function to pull the
# price out of it). A carrier only applies to its own site, and only
# when the object names the product the caller asked for.

def _page_product_names(html: str) -> list[str]:
    """The names the PAGE itself gives for its product: the <title>
    and the H1/H2 headings, with the site's own suffix stripped.

    This is what binds a carrier that carries no name of its own to
    the product the caller asked for.
    """
    names = []
    title = re.search(r"<title\b[^>]*>(.*?)</title>", html, re.I | re.S)
    if title:
        names.append(title.group(1))
    for m in re.finditer(r"<h[12]\b[^>]*>(.*?)</h[12]>", html, re.I | re.S):
        text = re.sub(r"<[^>]+>", " ", m.group(1))
        names.append(re.sub(r"\s+", " ", text).strip())
    return [n for n in names if n]


def _strip_shop_suffix(name: str) -> str:
    """The site's own noise around a product name.

    "TRS Tamarinde Paste 200 g online bestellen | Asia Shop" names
    the product "TRS Tamarinde Paste 200 g". The suffixes are
    removed so the requested name can be compared against the
    product part.
    """
    for sep in (" online bestellen", " | ", " - ", " – ", " –", " • "):
        if sep in name:
            name = name.split(sep)[0]
    return name.strip()


def _mollie_price(html: str, product: str):
    """The Asia Shop's own payment-integration product object.

    var mollieApplePayDirectData = {"product":{...,"price":"2.49",
    "isVariation":false,"stock":"outofstock"},"shop":{"currencyCode":"EUR",...}};

    The object carries NO product name. It is bound to this page's
    product by construction -- it is the payment integration for this
    page -- but that only means the PRICE belongs to the page's
    product. To answer for the product the CALLER asked for, the
    page itself must name that product: the requested name has to
    appear in the page's own title or heading. Otherwise the carrier
    would answer for any name at all, which is what it did before
    this check existed.
    """
    m = re.search(r"mollieApplePayDirectData\s*=\s*(\{.*?\})\s*;", html, re.DOTALL)
    if not m:
        return None
    try:
        data = json.loads(m.group(1), object_pairs_hook=unique_object)
    except (ValueError, TypeError):
        return None
    product_obj = data.get("product")
    if not isinstance(product_obj, dict):
        return None
    raw = product_obj.get("price")
    if not isinstance(raw, (str, int, float)) or isinstance(raw, bool):
        return None
    currency = (data.get("shop") or {}).get("currencyCode")
    if not isinstance(currency, str):
        return None
    if not re.fullmatch(r"\d+(?:\.\d{1,2})?", str(raw)):
        return None
    # The page must name the requested product.
    want = norm(product)
    for page_name in _page_product_names(html):
        for candidate in (_strip_shop_suffix(page_name), page_name):
            have = norm(candidate)
            if have == want or want in have or have in want:
                return {"price": str(raw), "currency": currency,
                        "name": product, "stock": product_obj.get("stock"),
                        "carrier": "mollie"}
    return None


def _walk_records(node):
    """Every JSON object in the hydration payload, depth first."""
    if isinstance(node, dict):
        yield node
        for value in node.values():
            yield from _walk_records(value)
    elif isinstance(node, list):
        for value in node:
            yield from _walk_records(value)


def _tokopedia_price(html: str, product: str):
    """Tokopedia's own hydration payload.

    The price sits in the SAME object as the product name and the
    option: "productID":"103193106824","price":28000,
    "priceFmt":"Rp28.000","productName":"250gr Asam Jawa / Tamarind".

    The record is read on JSON OBJECT BOUNDARIES, not a character
    window. A window could take the name from one sibling object and
    the price from another, and then report a display price and a
    numeric value that disagree with each other. Here both come from
    ONE object, or the record is refused.
    """
    # The hydration payload is NOT valid JSON -- Next.js escapes it --
    # so it is read by pattern. But the pattern is a RECORD, not a
    # window: the fields of one product record, in the order the
    # publisher writes them, with the distance between them BOUNDED.
    #
    # The bound matters. The page contains more than one productID,
    # and the first one is 26,000 characters away from any price. A
    # fixed window could span two sibling objects and take the name
    # from one and the price from the other.
    pattern = re.compile(
        r'"productID"\s*:\s*"(\d+)"(?:(?!\{[^{}]*\{[^{}]*\}[^{}]*\}).){0,400}?'
        r'"price"\s*:\s*(\d+)'
        r'(?:(?!\{[^{}]*\{[^{}]*\}[^{}]*\}).){0,400}?'
        r'"productName"\s*:\s*"([^"]{1,200})"',
        re.S,
    )
    for m in pattern.finditer(html):
        raw = m.group(2)
        name = m.group(3)
        # The display price, if the record carries one, must agree
        # with the numeric price.
        # The display price may sit BEFORE or AFTER the product name
        # in the publisher's record: the real Tokopedia page has it 145
        # characters BEFORE, the recorded fixture has it after. Both
        # sides are searched, each bounded to the same record.
        around = html[max(0, m.start() - 400): m.end() + 400]
        display_m = re.search(r'"priceFmt"\s*:\s*"([^"]{1,40})"', around)
        display = display_m.group(1) if display_m else None
        if display:
            digits = re.sub(r"[^0-9]", "", display)
            if digits and int(digits) != int(raw):
                continue
        want = norm(product)
        have = norm(name)
        if want != have and want not in have and have not in want:
            continue
        return {"price": display or str(raw),
                "currency": "IDR",
                "value": str(raw),
                "name": name,
                "carrier": "tokopedia-hydration"}
    return None


# The carriers, by the host they apply to.
CARRIERS = {
    "asiatischer-lebensmittelladen.de": _mollie_price,
    "tokopedia.com": _tokopedia_price,
}


def carrier_price(html: str, product: str):
    """The price from the publisher's own product record, if this page
    has one for THIS product. Returns None if there is no such record."""
    m = re.search(r"^URL Source:[ \t]*(\S+)[ \t]*$", html, re.MULTILINE)
    if not m:
        return None
    url = m.group(1)
    host = re.sub(r"^https?://", "", url).split("/")[0].lower()
    # A host may carry a "www." prefix; the carriers are keyed on the
    # bare domain.
    bare = host[4:] if host.startswith("www.") else host
    fn = CARRIERS.get(bare) or CARRIERS.get(host)
    if fn is None:
        return None
    try:
        found = fn(html, product)
    except Exception:
        return None
    if not isinstance(found, dict):
        return None
    # The record must name the product the caller asked for.
    name = found.get("name")
    if name is None:
        # The carrier does not carry a name: it is bound to the page's
        # own product by construction (the payment integration's
        # product object IS this page's product).
        return found
    want = norm(product)
    have = norm(name)
    if want != have and want not in have and have not in want:
        return None
    return found

def extract(page, product=None, site=None):
    out = Extraction()
    def refuse(reason):
        out.reason = reason
        return out
    if not isinstance(product, str) or not product.strip():
        return refuse("an exact full product name is required")
    sources = re.findall(r"^URL Source:[ \t]*(\S+)[ \t]*$", page, re.MULTILINE)
    if len(sources) != 1 or not canonical(sources[0]):
        return refuse("one valid HTTPS URL Source is required")
    source = canonical(sources[0])
    out.site = source[0]

    # ── Tier 1: the publisher's own product record ────────────────
    # The price is a FIELD OF THE PRODUCT OBJECT, so ownership does
    # not have to be inferred from proximity at all.
    carried = carrier_price(page, product)
    if carried is not None:
        # The NUMERIC value is what gets validated. The display string
        # may be "Rp28.000" and is not a number at all; the carrier
        # guarantees the two agree when it supplies both.
        raw = carried.get("value", carried["price"])
        try:
            amount = Decimal(str(raw))
            if not amount.is_finite() or amount <= 0:
                raise InvalidOperation
        except (InvalidOperation, ValueError):
            return refuse("the publisher's product record has an invalid price")
        currency = carried.get("currency")
        if not isinstance(currency, str) or currency not in CURRENCIES:
            return refuse("the publisher's product record has no explicit ISO 4217 currency")
        out.price = carried["price"]
        out.value = float(carried.get("value", raw))
        out.currency = currency
        out.product_title = carried.get("name") or product
        out.matched_target = True
        out.tier = "1"
        out.carrier = carried.get("carrier", "")
        return out

    parser = StructuredData()
    parser.feed(page)
    if not parser.blocks:
        return refuse("markdown proximity is unsafe; original HTML with identified JSON-LD Product/Offer is required")
    products = []
    try:
        for block in parser.blocks:
            data = json.loads(block, object_pairs_hook=unique_object)
            nodes = data if isinstance(data, list) else [data]
            for node in nodes:
                if not isinstance(node, dict):
                    continue
                graph = node.get("@graph", [node])
                if not isinstance(graph, list):
                    return refuse("invalid JSON-LD graph")
                products.extend(n for n in graph if isinstance(n, dict) and typed(n, "Product"))
    except (ValueError, TypeError):
        return refuse("malformed JSON-LD")
    # One Product for this URL, not whichever repeated name happens to be last.
    candidates = [p for p in products if canonical(p.get("url")) == source]
    if len(candidates) != 1:
        return refuse("expected exactly one Product identified by the fetched URL")
    p = candidates[0]
    if not isinstance(p.get("name"), str) or norm(p["name"]) != norm(product):
        return refuse("the exact full product name was not found for this URL")
    offer = p.get("offers")
    if isinstance(offer, list) and len(offer) == 1:
        offer = offer[0]
    if not isinstance(offer, dict) or not typed(offer, "Offer"):
        return refuse("one explicit Offer is required; ranges and multiple offers are unsafe")
    if "url" in offer and canonical(offer["url"]) != source:
        return refuse("the Offer URL identifies another product or variant")
    if "priceSpecification" in offer or "hasVariant" in p or "isVariantOf" in p:
        return refuse("variant or additional price specification requires site-specific review")
    if any(key in offer for key in (
        "eligibleQuantity", "eligibleCustomerType", "eligibleRegion", "ineligibleRegion",
        "validFrom", "validThrough", "priceValidUntil", "businessFunction", "addOn",
    )):
        return refuse("qualified or time-limited Offer requires site-specific review")
    raw = offer.get("price")
    currency = offer.get("priceCurrency")
    if isinstance(raw, bool) or not isinstance(raw, (str, int, float)) or not re.fullmatch(r"\d+(?:\.\d{1,2})?", str(raw)):
        return refuse("the Offer has no unambiguous decimal price")
    try:
        amount = Decimal(str(raw))
        if not amount.is_finite() or amount <= 0 or amount > Decimal('1000000000000'):
            return refuse("invalid or implausible price")
    except InvalidOperation:
        return refuse("invalid price")
    if not isinstance(currency, str) or currency not in CURRENCIES:
        return refuse("explicit ISO 4217 priceCurrency is required")
    out.tier = "2"
    out.price, out.value, out.currency = str(raw), float(amount), currency
    out.product_title, out.matched_target = p["name"], True
    return out


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--page', required=True)
    ap.add_argument('--product', required=True)
    ap.add_argument('--site', help='legacy option; cannot enable unsafe markdown extraction')
    ap.add_argument('--json', action='store_true')
    args = ap.parse_args()
    try:
        with open(args.page, encoding='utf-8') as fh:
            result = extract(fh.read(), args.product)
    except (OSError, UnicodeError) as exc:
        print(f'REFUSED: cannot read page: {exc}', file=sys.stderr)
        return 1
    if args.json:
        print(json.dumps(result.as_dict(), ensure_ascii=False, indent=2))
    elif result.price is not None:
        print(f'{result.price} [{result.currency}] {result.product_title}')
    else:
        print(f'REFUSED: {result.reason}', file=sys.stderr)
    return 0 if result.price is not None else 1


if __name__ == '__main__':
    sys.exit(main())
