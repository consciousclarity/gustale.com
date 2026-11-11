#!/usr/bin/env python3
"""Independent adversarial ownership/ambiguity mutations; no network required."""
import copy
import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import tempfile

TOOL = Path(__file__).with_name('extract-retailer-price.py')
spec = importlib.util.spec_from_file_location('extractor', TOOL)
m = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = m
spec.loader.exec_module(m)
URL = 'https://www.migros.ch/de/product/158586000000'
NAME = 'Migros · Kokosnussmilch 400 ml'
BASE = {'@type': 'Product', 'name': NAME, 'url': URL,
        'offers': {'@type': 'Offer', 'price': '1.40', 'priceCurrency': 'CHF', 'url': URL}}


def page(data):
    return f'URL Source: {URL}\n<script type="application/ld+json">{json.dumps(data)}</script>'




# ── Tier 1 fixtures ──────────────────────────────────────────────
#
# The publisher's own product record, as captured from the real
# pages. These are the strongest evidence available: the price is a
# FIELD OF THE PRODUCT OBJECT, not a number near a name.

MOLLIE_PAGE = """URL Source: https://www.asiatischer-lebensmittelladen.de/produkt/x
<title>TRS Tamarinde Paste 200 g online bestellen | Asia Shop</title>
<script>
var mollieApplePayDirectData = {"product":{"needShipping":true,"id":9721,"price":"2.49","isVariation":false,"stock":"outofstock"},"shop":{"countryCode":"DE","currencyCode":"EUR","totalLabel":"Asiatischer Lebensmittelladen"},"ajaxUrl":"https://example.com/wp-admin/admin-ajax.php"};
</script>
"""

TOKOPEDIA_PAGE = """URL Source: https://www.tokopedia.com/capsahabat/x
<script>
{"query": {"components": {"0": {"data": {"0": {"children": {"0": {"productID":"103193106824","alias":"250gr-asam-jawa-tamarind","shopName":"Cap Sahabat Rempah","price":28000,"slashPriceFmt":"","discPercentage":"","optionID":{"type":"json","json":[2]},"optionName":{"type":"json","json":["250gr"]},"productName":"250gr Asam Jawa / Tamarind - 250gr","priceFmt":"Rp28.000"}}}}}}}
</script>
"""


def test_tier1_baseline():
    """The publisher's own record gives the price, and reports its
    tier."""
    r = m.extract(MOLLIE_PAGE, 'TRS Tamarinde Paste 200 g')
    assert r.price == '2.49', f'the mollie carrier: {r.price} {r.reason}'
    assert r.value == 2.49, r.value
    assert r.currency == 'EUR', r.currency
    assert r.tier == '1', f'the tier was {r.tier!r}'
    assert r.carrier == 'mollie', r.carrier

    r2 = m.extract(TOKOPEDIA_PAGE, '250gr Asam Jawa / Tamarind')
    assert r2.price == 'Rp28.000', f'the tokopedia carrier: {r2.price} {r2.reason}'
    assert r2.value == 28000.0, r2.value
    assert r2.currency == 'IDR', r2.currency
    assert r2.tier == '1', f'the tier was {r2.tier!r}'
    assert r2.carrier == 'tokopedia-hydration', r2.carrier


def mut_tier1_wrong_product_is_refused():
    """A carrier record that names a DIFFERENT product must not answer
    for the requested one."""
    r = m.extract(TOKOPEDIA_PAGE, 'Something Else Entirely')
    assert r.price is None, f'the carrier answered for another product: {r.price}'
    assert r.tier == '', r.tier


def mut_tier1_a_second_record_does_not_win():
    """A page with two product records: the FIRST one is the page's
    product, and a later record must not answer for it."""
    page = TOKOPEDIA_PAGE.replace(
        '"productName":"250gr Asam Jawa / Tamarind - 250gr"',
        '"productName":"250gr Asam Jawa / Tamarind - 250gr"',
    ) + '<script>{"productID":"999","price":1000,"productName":"A Different Product"}</script>'
    r = m.extract(page, '250gr Asam Jawa / Tamarind')
    assert r.price == 'Rp28.000', f'the wrong record won: {r.price}'


def mut_tier1_a_zero_price_is_refused():
    """A zero or negative price in the publisher's record is not a
    price."""
    bad = MOLLIE_PAGE.replace('"price":"2.49"', '"price":"0"')
    r = m.extract(bad, 'TRS Tamarinde Paste 200 g')
    assert r.price is None, f'a zero price was accepted: {r.price}'


def mut_tier1_a_missing_currency_is_refused():
    """The record must carry an explicit ISO 4217 currency."""
    bad = MOLLIE_PAGE.replace('"currencyCode":"EUR"', '"currencyCode":""')
    r = m.extract(bad, 'TRS Tamarinde Paste 200 g')
    assert r.price is None, f'a currency-less price was accepted: {r.price}'


def mut_tier1_the_carrier_is_host_scoped():
    """A carrier must not fire on another site's page."""
    other = MOLLIE_PAGE.replace(
        'URL Source: https://www.asiatischer-lebensmittelladen.de/produkt/x',
        'URL Source: https://www.tokopedia.com/capsahabat/x',
    )
    r = m.extract(other, 'TRS Tamarinde Paste 200 g')
    assert r.price is None, f'the carrier fired on the wrong host: {r.price}'


def main():
    result = m.extract(page(BASE), NAME)
    assert result.price == '1.40' and result.currency == 'CHF' and result.value == 1.4
    # Unrelated structured products and visually closer prices must not win.
    related = copy.deepcopy(BASE)
    related.update(url=URL + '-related', name='Thai Kitchen Kokosnussmilch')
    related['offers'].update(url=URL + '-related', price='2.80')
    assert m.extract(page({'@graph': [related, BASE]}), NAME).price == '1.40'
    print('  baseline passes: exact URL/name offer; unrelated Product ignored')
    test_tier1_baseline()
    print('  baseline passes: the publisher\'s own product record (tier 1)')
    # The standalone Tier 1 checks are CALLED, not merely defined. They
    # were dead code before, and dead code is how the two carrier
    # defects below survived.
    for check in (mut_tier1_wrong_product_is_refused,
                  mut_tier1_a_second_record_does_not_win,
                  mut_tier1_a_zero_price_is_refused,
                  mut_tier1_a_missing_currency_is_refused,
                  mut_tier1_the_carrier_is_host_scoped):
        check()
    print('  the standalone Tier 1 checks all pass')
    cases = []
    def mutant(label, change):
        data = copy.deepcopy(BASE)
        change(data)
        cases.append((label, page(data), NAME))
    mutant('related product URL', lambda p: p.update(url=URL + '/related'))
    mutant('substring of a longer product', lambda p: p.update(name=NAME + ' Thai Kitchen'))
    mutant('shorter name than target', lambda p: p.update(name='Kokosnussmilch'))
    mutant('absent product name', lambda p: p.pop('name'))
    mutant('offer URL identifies another variant', lambda p: p['offers'].update(url=URL + '?size=250'))
    mutant('sale and original offers', lambda p: p.update(offers=[p['offers'], dict(p['offers'], price='2.80')]))
    mutant('aggregate range', lambda p: p['offers'].update({'@type': 'AggregateOffer', 'lowPrice': '1.40'}))
    mutant('missing currency', lambda p: p['offers'].pop('priceCurrency'))
    mutant('unknown currency', lambda p: p['offers'].update(priceCurrency='ZZZ'))
    mutant('membership price', lambda p: p['offers'].update(eligibleCustomerType='Member'))
    mutant('expired offer', lambda p: p['offers'].update(priceValidUntil='2000-01-01'))
    mutant('comma price', lambda p: p['offers'].update(price='1,40'))
    mutant('NaN price', lambda p: p['offers'].update(price='NaN'))
    mutant('boolean price', lambda p: p['offers'].update(price=True))
    mutant('negative price', lambda p: p['offers'].update(price='-1.40'))
    mutant('zero price', lambda p: p['offers'].update(price=0))
    mutant('additional price specification', lambda p: p['offers'].update(priceSpecification={'price': '2.80'}))
    mutant('variant group', lambda p: p.update(hasVariant=[{}]))
    # The Tier 1 cases: the publisher's own record must not answer for
    # another product, must not be reachable from another host, and
    # must reject an invalid price or a missing currency.
    cases.extend([
        ('tier 1: a record for another product',
         TOKOPEDIA_PAGE.replace('"productName":"250gr Asam Jawa / Tamarind - 250gr"',
                                '"productName":"A Completely Different Product"'),
         '250gr Asam Jawa / Tamarind'),
        ('tier 1: the carrier on the wrong host',
         MOLLIE_PAGE.replace('asiatischer-lebensmittelladen.de', 'tokopedia.com'),
         'TRS Tamarinde Paste 200 g'),
        ('tier 1: a zero price in the publisher record',
         MOLLIE_PAGE.replace('"price":"2.49"', '"price":"0"'),
         'TRS Tamarinde Paste 200 g'),
        ('tier 1: a negative price in the publisher record',
         MOLLIE_PAGE.replace('"price":"2.49"', '"price":"-2.49"'),
         'TRS Tamarinde Paste 200 g'),
        ('tier 1: a missing currency in the publisher record',
         MOLLIE_PAGE.replace('"currencyCode":"EUR"', '"currencyCode":""'),
         'TRS Tamarinde Paste 200 g'),
        ('tier 1: a malformed publisher record',
         MOLLIE_PAGE.replace('"price":"2.49"', '"price":"two-fifty"'),
         'TRS Tamarinde Paste 200 g'),
        # DEFECT 1 (found by Codex): the mollie carrier carries no
        # product name, so it answered for ANY requested name. The
        # page must now name the product.
        ('tier 1: a name the page does not carry',
         MOLLIE_PAGE.replace(
             '<title>TRS Tamarinde Paste 200 g online bestellen | Asia Shop</title>',
             '<title>Asia Shop</title>'),
         'Completely Unrelated Product'),
        # DEFECT 2 (found by Codex): the tokopedia carrier used a
        # character window, so the name and the price could come from
        # two different objects, and the display price and the numeric
        # value could disagree.
        # The name in one object and the price in another. The record
        # must not be assembled across two objects. The pattern
        # requires the fields IN ORDER (productID, then price, then
        # productName) and refuses to cross a nested object boundary,
        # so neither a sibling mix nor a nested mix can be assembled.
        ('tier 1: the name and the price from two objects',
         TOKOPEDIA_PAGE.replace(
             '"productID":"103193106824","alias":"250gr-asam-jawa-tamarind","shopName":"Cap Sahabat Rempah","price":28000',
             '"productID":"1","alias":"x","shopName":"y","price":999,"filler":"'
             + ('z' * 1500) + '"')
         .replace('"productName":"250gr Asam Jawa / Tamarind - 250gr"',
                  '"productName":"250gr Asam Jawa / Tamarind - 250gr","priceFmt":"Rp999.000"'),
         '250gr Asam Jawa / Tamarind'),
        ('tier 1: the name and the price in two sibling objects',
         TOKOPEDIA_PAGE.replace(
             '"productID":"103193106824","alias":"250gr-asam-jawa-tamarind","shopName":"Cap Sahabat Rempah","price":28000',
             '"productID":"1","alias":"x"')
         .replace('"productName":"250gr Asam Jawa / Tamarind - 250gr"',
                  '"otherName":"250gr Asam Jawa / Tamarind - 250gr"'),
         '250gr Asam Jawa / Tamarind'),
        ('tier 1: a display price that disagrees with the value',
         TOKOPEDIA_PAGE.replace('"priceFmt":"Rp28.000"', '"priceFmt":"Rp99.000"'),
         '250gr Asam Jawa / Tamarind'),
        ('duplicate price keys', page(BASE).replace('"price": "1.40"', '"price": "2.80", "price": "1.40"'), NAME),
        ('duplicate matching products', page([BASE, BASE]), NAME),
        ('missing target argument', page(BASE), None),
        ('wrong target', page(BASE), 'Bananas'),
        ('unidentified nested recommendation', page({'@type':'WebPage', 'related':BASE}), NAME),
        ('malformed structured data', f'URL Source: {URL}\n<script type="application/ld+json">{{bad}}</script>', NAME),
        ('missing URL Source', page(BASE).replace('URL Source:', 'Source:'), NAME),
        ('lookalike domain', page(BASE).replace('URL Source: '+URL, 'URL Source: https://migros.ch.evil.test/product'), NAME),
    ])
    for heading in ('#', '##'):
        for body in ('1.40 CHF\n~~2.80 CHF~~', '## Related products\n# '+NAME+'\n2.80 CHF', 'Ongkir Rp9.000'):
            cases.append((f'unsafe markdown {heading} {body!r}', f'URL Source: {URL}\n{heading} {NAME}\n{body}', NAME))
    caught = 0
    with tempfile.TemporaryDirectory() as tmp:
        for label, text, name in cases:
            result = m.extract(text, name)
            assert result.price is None and result.reason, (label, result)
            path = Path(tmp) / 'page'
            path.write_text(text)
            proc = subprocess.run([sys.executable, str(TOOL), '--page', str(path), '--product', name or '', '--json'], capture_output=True, text=True)
            assert proc.returncode != 0 and json.loads(proc.stdout)['price'] is None, label
            caught += 1
            print('  caught:', label)
    print(f'{caught}/{len(cases)} mutations caught')
    return 0


if __name__ == '__main__':
    sys.exit(main())
