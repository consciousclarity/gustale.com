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

## 5. Import dependency

`import_dependency` is a fact about a **country**, not a state of the
ingredient: it says the country must import it. It is what drives the
price band up, and it is recorded on the row that carries the band.

The one ingredient with a declared import dependency in the list is
**huitlacoche** (`imported`), because the spec says it is "mainly
sold canned or imported" outside Mexico.

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
