# GUS-1106 / GUS-1107 — the sourcing research contract

**Owner:** Alejandro · **Written:** 2026-11-10 · **List:** `docs/SOURCING-20-INGREDIENTS.csv`

This is the contract the researcher and the verifier work to. It exists
because the *shape* of a row is what makes the rating honest, and the
shape is easy to get wrong in a way that looks fine.

---

## 1. What one ingredient in one country produces

For each **ingredient** in each **country**, the research produces:

| output | one row per | columns |
|---|---|---|
| a **country row** | ingredient × country | availability, sourcing effort, price band, **source**, **last_reviewed** |
| a **form row** | ingredient × country × **form** | availability, price band, product category, package size, **source**, **last_reviewed** |
| a **substitute row** | ingredient × country × **substitute** | the substitute's own availability, its own price band, its **suitability**, the **change note** for an approximate one, **source**, **last_reviewed** |

**A substitute is never a form row.** They are different products with
different availability, different price and different suitability, and
the rating reads them differently.

---

## 2. Forms versus substitutes

A **form** is the same ingredient in another state:

`fresh` · `frozen` · `dried` · `canned_or_packaged` ·
`paste_or_concentrate` · `extract` · `homemade`

A **substitute** is a different product that may serve in its place,
and it has **its own suitability**, which must be researched:

- `suitable` — replaces it without materially changing the dish
- `approximate` — changes flavour, texture, appearance or cooking
  behaviour; **the change is disclosed as text**
- `not suitable` — **stored and shown**, never silently dropped

The list's `substitutes_to_research` column names them. The list's
`forms_to_research` column names the forms. **Do not move anything
between them**: the checker refuses a substitute in the forms column,
and a form that names a different product is not in the form
vocabulary at all.

### The spec's limit travels with the substitute

The owner's spec already states the limits, and they are **the spec's
words** — carry them, do not paraphrase them:

| ingredient | the limit |
|---|---|
| Coconut milk | "Coconut cream is richer and is not always a direct replacement." |
| Cassava | "Cassava flour and tapioca starch should not be treated as interchangeable with fresh cassava." |
| Preserved lemon | "it does not reproduce preserved-lemon texture" |
| Makrut lime leaves | "Ordinary lime zest is a weaker approximation." |
| Gochujang | "the flavor and sweetness will differ" |
| Fresh mozzarella di bufala | "Low-moisture mozzarella or provolone is suitable only when melted rather than served fresh." |
| Asian pear | "sweetness and texture will differ" |
| Fresh corn masa | "depending on whether the recipe requires tortillas, masa, or a specific texture" |

And the **seven prohibitions** — these are not substitutes and must
never be offered as one:

| ingredient | not a substitute |
|---|---|
| Saffron | safflower |
| Fish sauce | soy sauce |
| Huitlacoche | corn and mushroom |
| Epazote | parsley and cilantro |
| Makrut lime leaves | ordinary lime zest as an *equivalent* |
| Ube | purple sweet potato |
| Ackee | — there is **no generally suitable substitute** |

---

## 3. The evidence rule

**Every row cites a fetched source** — a retail listing, a market
survey, a national statistics office, an editorial source — with the
access date. `last_reviewed` drives the 12-month staleness rule: price
data older than 12 months counts as **unknown** for the price score.
Availability data has no expiry in v1.

**No invented availability.** The owner's spec table is a *list of
what to research*, not data. Nothing from it is written without a
source.

**The country's own market, not a continent.** "Europe is never one
profile" — Europe is 44 countries, each with its own row. A row may
say "no reliable source was found" and that is an acceptable, honest
answer. It is **not** acceptable to infer a country from a
neighbouring one or from the continent.

---

## 4. Prices

A price row carries: **currency**, **unit**, **product category**,
**package size**, **benchmark**, **last_reviewed**, and the **price
band**.

The product category and package size are not decoration:
**imported Gruyère block ≠ domestic Emmental ≠ grated cheese**. A
price is compared with the local market, **not by currency
conversion**.

The price bands: `typical` · `elevated` · `high` · `prohibitive` ·
`unknown`.

---

### Capture retailer prices from raw HTML

Use the direct fetch tool for price evidence. Reader proxies such as
`r.jina.ai` can strip both JSON-LD and the publisher's product objects,
so their Markdown cannot reach the extractor's Tier 1 carriers.

```bash
scripts/fetch-retailer-page.py \
  'https://www.asiatischer-lebensmittelladen.de/produkt/pickels-pasten/tamarind-pasten/trs-tamarinde-paste-200g/' \
  --output ./trs-tamarind-capture
python3 scripts/extract-retailer-price.py \
  --page ./trs-tamarind-capture/raw.html \
  --product 'TRS Tamarinde Paste 200 g' --json
```

Choose a new output directory under an existing parent. The fetcher saves:

- `response.html`: original response bytes, retaining publisher scripts;
- `raw.html`: HTML with the exact `URL Source:` metadata the extractor needs;
- `rendered.md`: locally rendered server HTML for reading, with scripts omitted;
- `manifest.json`: requested/final URLs, UTC access time, byte count and SHA-256.

The local renderer does not execute JavaScript or fetch a separate Jina
render. Use `raw.html` for extraction. Keep the capture and report the
extractor's `tier` and `carrier` alongside the price; inspect the page's
product, package and availability before citing it. After redirects,
`URL Source` identifies the final HTTPS URL. Failed HTTP requests, DNS,
empty/incomplete HTML, and recognized challenge/error pages cause a
non-zero exit without publishing a capture. A blocked fetch is not
market evidence. This is a conservative fetcher, not a bot-block bypass;
unrecognized blocks still require researcher review.

Offline verification: `python3 scripts/test-fetch-retailer-page.py`.
Its carrier fixtures are recorded excerpts, not fresh price observations.

---

## 5. Import dependency

**An import dependency is a fact about a COUNTRY, not about the
ingredient.** It answers: *must this country import this ingredient?*
It is recorded on the country row, and it is different for every
country — the same ingredient can be locally made in one country and
imported in the next.

The ingredient-level `import_dependency` column is gone. Huitlacoche
is the worked example: "imported" was never a property of huitlacoche,
it was a property of a market that has to bring it in from Mexico.

**How to decide it, for Indonesia.** The regulator's own registry is
the authority, not a marketplace listing and not a brand's marketing.
BPOM (`cekbpom.pom.go.id`) registers every food product, and the
registration number says which it is:

| the registration | what it means | the import answer |
|---|---|---|
| `MD` with **no importer recorded** | registered to an **Indonesian maker** | **locally made** |
| `ML` with an **importer ID** | the maker is registered abroad (`ML` = Makers List) | **imported** |

The registry also names the manufacturer, so a locally-made product's
provenance is a fact, not an inference:

- Kikkoman's *Saus Pedas Ala Korea (Gochujang)* — `MD`, **PT. KIKKOMAN
  AKUFOOD INDONESIA**. Kikkoman's *Saus Rasa Ikan* (fish sauce) — `MD`,
  the same maker. **Kikkoman's Indonesian gochujang and fish sauce are
  locally made**, even though Kikkoman's *soy sauce* is `ML`/imported.
  The brand is Japanese; the products are not.
- Mamasuka — `MD`, **PT. DAESANG FOOD INDONESIA**.
- Red1 — `MD`, **PT. SPARINDO FOOD**.
- Sempio, O'Food, Chung Jung One, Jinmi, Haechandle — `ML` with an
  importer. **Imported.**

So a researcher must not write "Kikkoman, therefore imported" or "a
Korean brand, therefore imported". **Check the registration, and
record the MD or ML number and the manufacturer in the row.**

**The tool.** `scripts/bpom-registry.sh` queries the registry in one
call and prints the MD/ML number, the manufacturer and the importer:

```
bash scripts/bpom-registry.sh gochujang 80
```

It gets a CSRF token and a session cookie first, because the endpoint
is a POST behind Laravel's CSRF middleware. Without this the answer
costs eleven hand-built queries — and the wrong answer, because a
retailer page cannot say where a product was made.

**The registry helper URL-encodes its query, so multi-word terms
work.** `bash scripts/bpom-registry.sh "asam jawa" 20` is correct.
(A version of the helper that did not encode it failed on every
multi-word term, with a message that looked like the registry being
unreachable rather than a malformed URL — worth knowing if you ever
see `REFUSED: could not read the CSRF token`.)

**AND THE REGISTRY SEARCH MATCHES COSMETICS AS WELL AS FOOD.**
"tamarind" returns body scrubs, perfume and hair serum; "santan"
returns hair serum. **Only the registrations whose number starts `MD`
or `ML` are food.** Filter to those first, and only then count —
otherwise the numbers are nonsense.

### The availability score needs ORDINARY RETAIL evidence

**A marketplace listing proves `channel = online` and nothing else.**
It proves the product is sold on a marketplace; it does not prove the
product is ordinary in that country. Tokopedia carries a thousand
specialist sellers' listings of a thing that is in no supermarket in
the country, and one of them is usually the brand's own store.

So the availability score is graded by the **channel**, and an
availability of 0 — `common` or `occasional` — requires evidence of
**ordinary retail**:

| the channel | what it supports |
|---|---|
| a mainstream supermarket's own catalogue, or its store on a marketplace | `common` / `occasional` |
| a neighbourhood grocer (`pasar swalayan`), a wet market | `common` / `occasional` |
| an ethnic or specialist shop, a brand's own online store, a marketplace seller | `specialty_only` / `limited` |

**The seller is the evidence.** A listing whose seller is a
supermarket or a neighbourhood grocer is ordinary-retail evidence; the
same product from a specialist shop is not.

**A bot block is not a negative.** A search that returns "produk nggak
ditemukan", or a page that renders client-side and shows nothing, proves
nothing about the market. It proves the fetch failed. The same query
through a different route can return sixty live products. Record "no
reliable source found" and say what you searched; never record
`unavailable` from a block.

**A negative finding must be reproducible.** If a mainstream chain's
search returns no product, that is a real, citable fact about that
chain — but it is a fact about the chain's ONLINE catalogue, not about
the country's shops, and it cannot carry `unavailable` on its own.

### The market must be a MARKET

The live `geo_entities` table holds **302** rows with
`entity_type = 'country'`, but only **250** of them are sourceable
markets: the **249** ISO 3166-1 countries plus **Kosovo** (`XK`).

The other **52** names are not markets: 9 archived former states,
**41** non-place rows (continents, historical states, non-sovereign
entities, and three things that are not places at all), and **2**
duplicates of ISO countries (`China` and `Palestine`). They are **54
live rows**, because China and Palestine each have two.

**All 41 non-place rows are used by a dish**, so they are load-bearing
as dish *origins*. They are simply not places you can source a product
in. **A row pointing at one of them is worse than a missing row** — it
looks complete.

**The check is `scripts/check-sourcing-market.py`, and it is not
optional:**

```bash
python3 scripts/check-sourcing-market.py "Germany"      # OK
python3 scripts/check-sourcing-market.py "Netherlands"  # rejected
python3 scripts/check-sourcing-market.py "Asia"         # rejected
python3 scripts/check-sourcing-market.py --row '{"country_code":"DE"}'
```

Run it over every market you write a row for, before the row is
published.

---

## 6. The three lines the research must check first

The brief's §5.4 flags these; the list and the owner's review agree:

1. **Ackee in the United States.** The spec expects **Hard**. Checked
   2026-11-10: fresh ackee may not be imported, but canned/frozen
   ackee from processors on the FDA Import Alert 21-11 "Green List" is
   legally sold (FDA, "Hypoglycin A and Ackee Fruit"). So the US is
   most likely **Moderate** (canned, Caribbean/specialty stores), not
   Hard. **Verify against the FDA source, do not assume.**
2. **Makrut lime in South Africa, and "calamansi" in the same row.**
   Calamansi is a **different citrus**. Re-research the whole row.
3. **Gochujang's form.** There is **no fresh gochujang** — it is a
   fermented paste. The form is `paste_or_concentrate`.

---

## 7. The order

**GUS-1106** (pilot): the moussaka-greek and nasi goreng lines in
**ID, DE, CH, US**. Same Stage A / Stage B flow — a Stage A document
listing every row with its source, access date and `last_reviewed`,
merged before the load; then the load, published directly.

**GUS-1107** (worldwide): every ingredient in **every** country of the
country tier. **302 countries are in the live database** — 293 active,
9 archived (measured 2026-11-10; the brief assumed ~250). Order: the
named countries first, then by population. Batches by ingredient
family, each publishable on its own. **Throughput (pairs/day) is
reported to the owner after the first batch.**

---

## 8. The roles

- **Researcher** — finds the sources and writes the rows.
- **Verifier** — checks each row against its source: is the
  availability what the source says, is the price the product and
  package the row names, is the substitute's suitability the spec's
  limit supports.

**No row is published without a source.** The Stage A document is the
record, and it is reviewed before the load.
