#!/usr/bin/env python3
"""test-extract-retailer-price.py -- the mutation harness for the
retailer-price extractor.

THE POINT
---------
`scripts/extract-retailer-price.py` exists because a price was taken
from a RELATED-PRODUCTS CAROUSEL and was wrong: the Migros
coconut-milk page's own product is "Migros . Kokosnussmilch, 400 ml,
CHF 1.40", but the first extraction returned CHF 2.80 -- the Thai
Kitchen 250 ml from the carousel. The own-brand product was CHEAPER
and a DIFFERENT product, so the error changed the price band.

A checker that cannot be shown to FAIL is not a checker. This harness
mutates the fixtures in the ways the real failures happened, and
requires the tool to catch every one.

    python3 scripts/test-extract-retailer-price.py
"""

from __future__ import annotations

import importlib.util
import os
import re
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
CHECKER = os.path.join(HERE, "extract-retailer-price.py")

spec = importlib.util.spec_from_file_location("extractor", CHECKER)
assert spec and spec.loader
extractor = importlib.util.module_from_spec(spec)
# The module MUST be in sys.modules before it is executed: a @dataclass
# resolves its own module through sys.modules when it builds __init__,
# and it fails with "NoneType has no attribute __dict__" otherwise.
sys.modules[spec.name] = extractor
spec.loader.exec_module(extractor)


# --------------------------------------------------------------------------
# The fixtures. Each is the SHAPE of a real fetched page, reduced to
# the parts that matter, with the real numbers.
# --------------------------------------------------------------------------

MIGROS_COCONUT = """Title: Migros . Kokosnussmilch . Migros

URL Source: https://www.migros.ch/de/product/158586000000

Markdown Content:
[Zur Homepage](https://www.migros.ch/de)

![Image 2: Migros . Kokosnussmilch](https://image.migros.ch/d/d8e2caed.jpg)

Ein Franken 40 1.40

# Migros . Kokosnussmilch

400ml 400ml 35 Rappen pro 100 ml 0.35/100ml

Zur Einkaufsliste hinzufugen

## Ahnliche Produkte

* [![Image 3: Thai Kitchen](https://image.migros.ch/d/abc.jpg)](https://www.migros.ch/de/product/1)
2 Franken 80 2.80 Thai Kitchen Kokosnussmilch,Thai Kitchen Kokosnussmilch, 250ml 250ml ,Ein Franken 12 pro 100 ml
* [![Image 4: Alnatura](https://image.migros.ch/d/def.jpg)](https://www.migros.ch/de/product/2)
2 Franken 50 2.50 Alnatura Kokos Milch . vegan,Alnatura Kokos Milch . vegan, 400ml 400ml ,63 Rappen pro 100 ml 0.63/100ml
"""

MIGROS_TAMARIND = """Title: Migros . Tamarinden Paste . Migros

URL Source: https://www.migros.ch/de/product/158586800000

Markdown Content:
Ein Franken 90 2.90

# Tiger Kitchen . Tamarinden Paste

227 Gramm 227 Gramm 128 Rappen pro 100 g 1.28/100g

## Ahnliche Produkte

* Thai Kitchen Tamarindensauce
3 Franken 95 3.95 Thai Kitchen Tamarindensauce, 300ml
"""

ASIATISCHER_TRS = """Title: TRS Tamarinde Paste 200 g online bestellen . Asia Shop

URL Source: https://www.asiatischer-lebensmittelladen.de/produkt/pickels-pasten/tamarind-pasten/trs-tamarinde-paste-200g/

Markdown Content:
Datenschutz

# TRS Tamarinde Paste 200g

[![Image 32: TRS Tamarinde Paste](https://cdn.example.com/img.jpg)](https://cdn.example.com/img.jpg)

# TRS Tamarinde Paste 200g

Marke:

[TRS](https://www.asiatischer-lebensmittelladen.de/brand/trs/)

HINWEIS: Trockenware bitte separat bestellen.

[Zur Wunschliste hinzufugen](https://example.com/wishlist)

[Vergleichen](https://example.com/compare)

 8 schauen sich diesen Artikel derzeit an

Nicht vorratig

2,49 EUR inkl. MwSt.Grundpreis:12,45 EUR / kg

Versand & Verpackung

## Ahnliche Produkte

* COCK BRAND Tamarinde mit Kern
2,99 EUR inkl. MwSt.Grundpreis:6,59 EUR / kg
"""

TOKOPEDIA_PRODUCT = """Title: 250gr Asam Jawa Tamarind - Cap Sahabat Rempah

URL Source: https://www.tokopedia.com/capsahabat/250gr-asam-jawa-tamarind-1729645910981903799

Markdown Content:
## Rekomendasi

* Something Else
Rp 44.000

Terpilih: 250gr

Subtotal

Rp28.000

# 250gr Asam Jawa / Tamarind - 250gr

Terjual 750+

Rp28.000

## Pengiriman

Dikirim dari Kota Bandung

Ongkir Rp9.000
"""


def _fail(msg: str) -> None:
    raise AssertionError(msg)


def _expect_price(page: str, product: str, expected: str, label: str) -> None:
    r = extractor.extract(page, product)
    if r.price is None:
        _fail(f"{label}: expected the price {expected}, got a REFUSAL: {r.reason}")
    if r.price.replace(" ", "") != expected.replace(" ", ""):
        _fail(f"{label}: expected {expected}, got {r.price}")


# --------------------------------------------------------------------------
# The baseline. These must pass.
# --------------------------------------------------------------------------

def test_baseline() -> None:
    # Migros: the OWN product's price, NOT the carousel's.
    _expect_price(MIGROS_COCONUT, "Kokosnussmilch", "1.40", "the Migros own product")
    _expect_price(MIGROS_TAMARIND, "Tamarinden Paste", "2.90", "the Migros tamarind")

    # The German specialty shop.
    r = extractor.extract(ASIATISCHER_TRS, "TRS Tamarinde Paste")
    if r.price is None:
        _fail(f"the Asia Shop product: expected 2.49, got a REFUSAL: {r.reason}")
    if r.price.replace(",", ".") != "2.49":
        _fail(f"the Asia Shop product: expected 2.49, got {r.price}")
    if not r.unit_price:
        _fail("the Asia Shop product: the base-unit price was not read")

    # Tokopedia: the product's own price, not the "Ongkir" shipping
    # fee and not a sidebar's recommendation price.
    _expect_price(TOKOPEDIA_PRODUCT, "Asam Jawa Tamarind", "Rp28.000", "the Tokopedia product")
    r_toko = extractor.extract(TOKOPEDIA_PRODUCT, "Asam Jawa Tamarind")
    if r_toko.value == 9000.0:
        _fail("the tool took the SHIPPING fee as the price")


# --------------------------------------------------------------------------
# The mutations. Each is a way the real thing went wrong.
# --------------------------------------------------------------------------

def mut_carousel_price_wins() -> None:
    """THE BUG. If the tool takes the LAST price on the page instead of
    the one before the product's heading, it returns the carousel's."""
    r = extractor.extract(MIGROS_COCONUT, "Kokosnussmilch")
    if r.price and r.price.replace(" ", "") == "2.80":
        _fail("the tool took the CAROUSEL price 2.80 instead of the product's 1.40")
    # And the carousel price must not be the answer under ANY spelling.
    r2 = extractor.extract(MIGROS_COCONUT, "Thai Kitchen Kokosnussmilch")
    # Here the target IS the carousel item, so the tool should refuse
    # rather than invent a price for a related product.
    if r2.price is not None:
        _fail(f"the tool priced a RELATED product: {r2.price}")


def mut_wrong_target_is_refused() -> None:
    """A product that is not on the page must be REFUSED, never
    approximated with some other product's price."""
    r = extractor.extract(MIGROS_COCONUT, "Bananas")
    if r.price is not None:
        _fail(f"the tool priced a product that is not on the page: {r.price}")
    if "not found" not in r.reason:
        _fail(f"the refusal reason is unclear: {r.reason!r}")


def mut_no_price_block_is_refused() -> None:
    """A page with no price block must be refused, not guessed."""
    page = "Title: nothing\n\nURL Source: https://example.com/p\n\nMarkdown Content:\n# A Product\n\nno prices here\n"
    r = extractor.extract(page, "A Product")
    if r.price is not None:
        _fail(f"the tool invented a price: {r.price}")


def mut_search_page_is_refused() -> None:
    """A SEARCH page has no product's own price block. A price taken
    from a search result list belongs to SOME product, but not
    necessarily the target -- so the tool must refuse."""
    page = """Title: asam jawa kering - Tokopedia

URL Source: https://www.tokopedia.com/search?q=asam%20jawa%20kering

Markdown Content:
Rp 9.000
Rp 100.000
Rp 25.500
"""
    r = extractor.extract(page, "asam jawa kering")
    if r.price is not None:
        _fail(f"the tool took a price from a SEARCH page: {r.price}")


def mut_the_page_title_is_not_the_product() -> None:
    """The page's Title: line is often the SITE's title, not the
    product's. The tool must use the heading, not the title."""
    page = """Title: Asia Shop . All products

URL Source: https://www.asiatischer-lebensmittelladen.de/produkt/x

Markdown Content:
# TRS Tamarinde Paste 200 g

2,49 EUR inkl. MwSt.
"""
    r = extractor.extract(page, "TRS Tamarinde Paste")
    if r.product_title and "Asia Shop" in r.product_title:
        _fail("the tool used the page title as the product title")


def mut_carousel_before_heading_is_ignored() -> None:
    """If the related-products section appears BEFORE the heading,
    a price inside it must never be used."""
    page = """Title: Migros . Kokosnussmilch

URL Source: https://www.migros.ch/de/product/1

Markdown Content:
## Ahnliche Produkte

* Something 9.99 Something, 100g

Ein Franken 40 1.40

# Migros . Kokosnussmilch

400ml 400ml
"""
    r = extractor.extract(page, "Kokosnussmilch")
    if r.price and r.price.replace(" ", "") == "9.99":
        _fail("the tool took a price from a section that precedes the heading")
    if r.price and r.price.replace(" ", "") != "1.40":
        _fail(f"the wrong price: {r.price}")


def mut_price_value_normalisation() -> None:
    """'2,49' and '2.49' are the same number; 'Rp 28.000' is 28000."""
    if extractor._price_value("2,49") != 2.49:
        _fail("a European decimal did not parse")
    if extractor._price_value("2.49") != 2.49:
        _fail("a dot decimal did not parse")
    if extractor._price_value("Rp 28.000") != 28000.0:
        _fail(f"an Indonesian thousands figure did not parse: {extractor._price_value('Rp 28.000')}")
    if extractor._price_value("1.40") != 1.40:
        _fail("a trailing zero decimal did not parse")


def mut_the_cli_prints_a_refusal() -> None:
    """The CLI must exit NON-ZERO on a refusal, so a script that calls
    it cannot mistake a refusal for a price."""
    import subprocess

    with tempfile.NamedTemporaryFile("w", suffix=".md", delete=False, encoding="utf-8") as fh:
        fh.write("Title: x\n\nURL Source: https://example.com/p\n\nMarkdown Content:\n# A Product\n\nno price\n")
        path = fh.name
    try:
        r = subprocess.run(
            [sys.executable, CHECKER, "--page", path, "--product", "A Product"],
            capture_output=True, text=True, timeout=60,
        )
        if r.returncode == 0:
            _fail(f"the CLI exited 0 on a refusal: {r.stdout!r}")
        if "REFUSED" not in r.stderr:
            _fail(f"the CLI did not say REFUSED: {r.stderr!r}")
    finally:
        os.unlink(path)


def mut_shipping_fee_is_not_the_price() -> None:
    """Tokopedia shows an 'Ongkir Rp9.000' -- the SHIPPING fee. It is
    not the product's price, and taking it would be a price wrong by
    a factor of three."""
    r = extractor.extract(TOKOPEDIA_PRODUCT, "Asam Jawa Tamarind")
    if r.price and "9.000" in r.price.replace(" ", ""):
        _fail(f"the tool took the shipping fee as the price: {r.price}")
    if r.value == 9000.0:
        _fail("the tool took the shipping fee as the price")


MUTATIONS = [
    ("the shipping fee is not the price", mut_shipping_fee_is_not_the_price),
    ("the carousel price must not win", mut_carousel_price_wins),
    ("a product that is not on the page is refused", mut_wrong_target_is_refused),
    ("a page with no price block is refused", mut_no_price_block_is_refused),
    ("a search page is refused", mut_search_page_is_refused),
    ("the page title is not the product", mut_the_page_title_is_not_the_product),
    ("a carousel before the heading is ignored", mut_carousel_before_heading_is_ignored),
    ("the price values normalise", mut_price_value_normalisation),
    ("the CLI refuses with a non-zero exit", mut_the_cli_prints_a_refusal),
]


def main() -> int:
    failures: list[str] = []

    try:
        test_baseline()
        print("  [ok  ] the baseline: every fixture's own price is read")
    except AssertionError as exc:
        failures.append(f"the baseline: {exc}")
        print(f"  [FAIL] the baseline: {exc}")

    caught = 0
    for label, fn in MUTATIONS:
        try:
            fn()
        except AssertionError as exc:
            failures.append(f"{label}: {exc}")
            print(f"  [FAIL] {label}: {exc}")
            continue
        except Exception as exc:  # noqa: BLE001
            failures.append(f"{label}: raised {exc!r}")
            print(f"  [FAIL] {label}: raised {exc!r}")
            continue
        caught += 1
        print(f"  [ok  ] {label}")

    total = len(MUTATIONS)
    print(f"\n{caught}/{total} mutations caught")
    if failures:
        print(f"\nFAILED: {len(failures)} problem(s)")
        for f in failures:
            print(f"  - {f}")
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
