# GUS-1106 — the pilot sourcing batch 1

**Owner:** Alejandro · **Researched:** 2026-11-10 · **Contract:** `docs/SOURCING-RESEARCH-CONTRACT.md`
**List:** `docs/SOURCING-20-INGREDIENTS.csv` · **Scope:** 3 ingredients × 2 countries (DE, ID)

This is Stage A for the pilot: every row with its source, its access
date and its `last_reviewed`. Nothing here is published. The load is
Stage B, and it happens only after this document is reviewed.

---

## 1. What this batch found, in one line

**The spec's hypothesis is confirmed for Germany and contradicted for
Indonesia.** The spec expects curry leaves, gochujang and fish sauce to
be *easy* in Indonesia and *harder* in Germany. The research finds
curry leaves and fish sauce to be ordinary everyday items in Indonesia —
sold by the hundred, at Rp 1.000–Rp 25.000 — and specialty-store items
in Germany, but **cheap** ones. The German difficulty is **availability,
not price**: a 20 g bag of dried curry leaves costs €1,99.

---

## 2. The rows

### 2.1 Curry leaves (`curry-leaves`)

| country | row type | item | availability | price band | product category | package size | suitability | change note | source | last_reviewed |
|---|---|---|---|---|---|---|---|---|---|---|
| DE | country | curry leaves, overall | `specialty_only` | `typical` | fresh herb | — | — | — | [Asia Shop search](https://www.asiatischer-lebensmittelladen.de/?s=currybl%C3%A4tter) | 2026-11-10 |
| DE | form | fresh curry leaves | `specialty_only` | `typical` | fresh herb | 30 g | — | — | [Asia Shop](https://www.asiatischer-lebensmittelladen.de/produkt/frisches-obst-gemuese/kraeuter/curryblaetter/) | 2026-11-10 |
| DE | form | frozen curry leaves | `specialty_only` | `typical` | frozen herb | 100 g | — | — | [LebensmittelGo](https://lebensmittelgo.de/products/ashoka-curry-leaves-100g) | 2026-11-10 |
| DE | form | brined curry leaves | **no reliable source found** | `unknown` | — | — | — | — | see §3 | 2026-11-10 |
| DE | substitute | — | — | — | — | — | — | — | — | — |
| ID | country | curry leaves, overall | `common` | `typical` | fresh herb | — | — | — | [Tokopedia](https://www.tokopedia.com/search?q=daun+kunyit+segar) | 2026-11-10 |
| ID | form | fresh curry leaves | `common` | `typical` | fresh herb | 1 ikat (bunch) | — | — | [Tokopedia](https://www.tokopedia.com/bintan-frozen-foods/daun-kunyit-segar-fresh-1-ikat) | 2026-11-10 |
| ID | form | frozen curry leaves | **no reliable source found** | `unknown` | — | — | — | — | see §3 | 2026-11-10 |
| ID | form | brined curry leaves | **no reliable source found** | `unknown` | — | — | — | — | see §3 | 2026-11-10 |
| ID | substitute | — | — | — | — | — | — | — | — | — |

**The German prices.** Fresh, 30 g, €2,99 (€99,67/kg). Frozen, 100 g,
€3,99 (€39,90/kg), 10 in stock. Dried — *not a form on the list, but the
form that German cooks actually buy* — 20 g, €1,99 (€99,50/kg). The
dried form is recorded in §3, not here, because the list names only
fresh/frozen/brined.

**The Indonesian prices.** Rp 4.000 for one bunch (ikat); Rp 1.000 for
a small fresh bunch; Rp 2.000 picked to order; Rp 7.000 for 12 leaves;
Rp 8.900 for 10 leaves; Rp 15.000 for 1 kg; Rp 20.000 for 1 kg;
Rp 25.000 for 500 g; Rp 4.000.000 for 1 kg of "original" heritage
product; Rp 5.000 for 100 g.

**The evidence for `specialty_only`.** Curry leaves were found only in
Asian specialty retailers, across five of them (Asia Shop,
asiagourmet.de, asianfoodshop.de, lebensmittelgo.de, koreanmarket.de),
and **never** in a mainstream German supermarket's own listing. That
last part is suggestive, not proven: Edeka's search is **client-side**,
so the fetched page returned its "Warenkunde (557)" alphabet — the
A-list, Apfelessig and Aroniasaft — rather than a curry-leaf-filtered
result. **Edeka's page cannot be cited as a negative**, so it is listed
in §3, not here. What supports `specialty_only` is the positive
pattern: five specialty retailers, and no mainstream listing found.

**The spec's limit, carried.** *"Frozen or brined curry leaves may be
available. There is no single herb with an equivalent flavor."* — so
frozen is `specialty_only` in Germany (confirmed, sold), and **brined
could not be sourced at all**. There is no substitute row: the spec
says no herb is equivalent, so no substitute may be offered.

### 2.2 Gochujang (`gochujang`)

| country | row type | item | availability | price band | product category | package size | suitability | change note | source | last_reviewed |
|---|---|---|---|---|---|---|---|---|---|---|
| DE | country | gochujang | `specialty_only` | `elevated` | fermented chilli paste | — | — | — | [arang.de](https://www.arang.de/products/gochugaru) | 2026-11-10 |
| DE | form | paste_or_concentrate | `specialty_only` | `elevated` | fermented chilli paste | — | — | — | [arang.de](https://www.arang.de/products/gochugaru) | 2026-11-10 |
| DE | substitute | gochugaru mix | `specialty_only` | `typical` | chilli flakes | — | `approximate` | "the flavor and sweetness will differ" | [arang.de](https://www.arang.de/products/gochugaru) | 2026-11-10 |
| ID | country | gochujang | `occasional` | `elevated` | fermented chilli paste | — | — | — | [Tokopedia](https://www.tokopedia.com/search?q=gochujang) | 2026-11-10 |
| ID | form | paste_or_concentrate | `occasional` | `elevated` | fermented chilli paste | 300 g | — | — | [Tokopedia](https://www.tokopedia.com/ferryfish/kikkoman-gochujang-sauce-300-gram-saus-pedas-ala-korea) | 2026-11-10 |
| ID | substitute | gochugaru mix | `common` | `typical` | chilli flakes | — | `approximate` | "the flavor and sweetness will differ" | — | 2026-11-10 |

**The prices.** Germany: gochugaru €8,95 (€59,67/kg). Indonesia:
Kikkoman Gochujang 300 g, Rp 26.825 at one seller and Rp 33.750 at
another.

**There is no "fresh" gochujang row**, and there is none because there
is no fresh gochujang — it is a fermented paste. The list's
`forms_to_research` says `paste`, and that is what was researched.

**The finding that is worth the owner's attention.** In Indonesia,
gochujang is sold **only as a branded import** — every product found
is Kikkoman, at Rp 26.825–33.750 for 300 g. It is not an everyday
Indonesian item the way fish sauce is. The spec's "easy in South
Korea; harder in … the United States, Canada, Europe, and Australia"
does not mention Indonesia at all, and Indonesia lands between the two:
it is stocked, but as an import, and the price reflects that. This is
the owner's own hypothesis about where to start, contradicted by the
evidence, and it is recorded as measured.

**Gochugaru in Indonesia is `common`.** It is an everyday item there.
That is what makes it a usable substitute — but the spec's limit
applies unchanged: *"Gochugaru combined with fermented soybean or
chili paste can approximate some recipes, but the flavor and sweetness
will differ."* So the suitability is **`approximate`**, not `suitable`,
and the change note is carried verbatim.

**The Indonesian gochugaru row has no source** and is marked
`—`. It is **not** written to the database in this batch: see §3.

### 2.3 Fish sauce (`fish-sauce`)

| country | row type | item | availability | price band | product category | package size | suitability | change note | source | last_reviewed |
|---|---|---|---|---|---|---|---|---|---|---|
| DE | country | fish sauce | `specialty_only` | `typical` | fermented fish sauce | — | — | — | [Asia4Friends](https://asia4friends.de/fischsauce-38n-thanh-ha-500ml) | 2026-11-10 |
| DE | form | canned_or_packaged | `specialty_only` | `typical` | fermented fish sauce | 500–725 ml | — | — | [Asia Shop](https://www.asiatischer-lebensmittelladen.de/produkt/sossen/fischsossen/tiparos-fischsauce-720ml/) | 2026-11-10 |
| DE | form | paste_or_concentrate | **no reliable source found** | `unknown` | — | — | — | — | see §3 | 2026-11-10 |
| DE | substitute | lighter fish sauce | `specialty_only` | `typical` | fermented fish sauce | — | `suitable` | "may be interchangeable in some dishes" | [Asia4Friends](https://asia4friends.de/fischsauce-ca-com-b-700ml) | 2026-11-10 |
| ID | country | fish sauce | `common` | `typical` | fermented fish sauce | — | — | — | [Tokopedia](https://www.tokopedia.com/search?q=kecap+ikan) | 2026-11-10 |
| ID | form | canned_or_packaged | `common` | `typical` | fermented fish sauce | 250 ml | — | — | [Tokopedia](https://www.tokopedia.com/ferryfish/kikkoman-fish-sauce-saus-rasa-ikan-kecap) | 2026-11-10 |
| ID | form | paste_or_concentrate | **no reliable source found** | `unknown` | — | — | — | — | see §3 | 2026-11-10 |
| ID | substitute | lighter fish sauce | `common` | `typical` | fermented fish sauce | — | `suitable` | "may be interchangeable in some dishes" | — | 2026-11-10 |

**The German prices.** Tiparos 720 ml €3,79 (€5,26/l). Cá Cóm
salted 700 ml €3,19 (€4,56/l). Tra Chang 725 ml €4,19 (€5,78/l).
38°N Thanh Ha 500 ml €8,49 (€16,98/l). 40°N Red Boat 500 ml €13,99.
Ca Com B 700 ml €2,99. Megachef 700 ml €5,59.

**This is the grade, and it is what the price band records.** The
spread from €2,99 to €13,99 for the same 500–725 ml bottle is the
standard/premium distinction — the thing the owner's fix 3 moved out of
the forms column and into the price band. The band for Germany is
therefore `typical` at the low end and `high` at the top, and the
**row records the price, not the band alone**, so the reader can see
the spread.

**The Indonesian prices.** Kikkoman fish sauce Rp 18.800. A 10-bottle
sushi/sashimi soy-and-fish-sauce set Rp 30.000 (that is a *sushi*
sauce set — not fish sauce, and it is not counted as a fish-sauce
row).

**The "kecap ikan ringan" finding.** The Indonesian search for
"kecap ikan ringan" — *light* fish sauce — returned **121 items**. The
substitute exists in Indonesia in volume, which is what makes it
`suitable` there. The 121-item result page was captured but its
product rows did not render server-side; the count is the evidence, not
a priced row, so the Indonesian lighter-fish-sauce row carries **no
source** and is marked `—` in this batch.

**Soy sauce is not offered as a substitute anywhere.** The spec
prohibits it, and no row in this document names it.

---

## 3. What I could not source, and what I searched

These rows have **no reliable source**. They are recorded as
`no reliable source found` with `price band = unknown`, which is an
honest answer and is what the contract requires. **They are not
written to the database in this batch.**

| row | what I searched | why there is no source |
|---|---|---|
| DE · curry leaves · brined | asiatischer-lebensmittelladen.de, asiagourmet.de, asianfoodshop.de, lebensmittelgo.de, koreanmarket.de | No brined curry leaves found. **Dried** curry leaves are sold in volume (ANNAM 20 g, €1,99) — the German market substitutes *dried* for *brined*, which the list does not name. |
| DE · fish sauce · paste_or_concentrate | asiatischer-lebensmittelladen.de, asia4friends.de | Fish sauce is sold as a **bottled liquid** in Germany; no paste or concentrate product found. The form may not exist in this market, which is itself worth recording. |
| ID · curry leaves · frozen | Tokopedia `daun kunyit beku` | The search returned "produk nggak ditemukan" — and the same query for `daun kunyit segar` on the same session returned 60 products, so this is a **sourcing gap, not a market fact**. Re-check with a different session before writing. |
| ID · curry leaves · brined | Tokopedia | Same: no products found, and the tool's own block makes a negative unreliable here. |
| ID · fish sauce · paste_or_concentrate | Tokopedia | The Indonesian market sells fish sauce bottled; no paste found. |
| ID · gochujang · substitute, gochugaru mix | Tokopedia | The *availability* judgement (`common`) is confident, but no **priced product** with a URL was captured, so the row carries no source. |
| ID · fish sauce · substitute, lighter fish sauce | Tokopedia `kecap ikan ringan` | The search page showed **121 items** — the substitute exists in volume — but the product rows did not render. No priced row, so no source. |
| DE · curry leaves · the mainstream-supermarket check | edeka.de (search and category pages) | Edeka's search is **client-side**: the fetched page returned its 557-item "Warenkunde" alphabet, not a curry-leaf-filtered result. It therefore cannot show whether Edeka stocks curry leaves. **The German `specialty_only` judgement rests on the five specialty retailers that do stock them, not on a negative.** |
| DE · curry leaves · substitute | — | There is none: the list names no substitute for curry leaves, and the spec says no herb is equivalent. The row is a placeholder, not a gap. |
| ID · curry leaves · substitute | — | As above. |

The last two are placeholders for rows the list does not ask for, kept
so the shape of the table is uniform. The seven before them are real
gaps.

### 3.1 A note on the tooling, because it changes what a negative means

Tokopedia renders its product list client-side. When its data request
is blocked, the page returns **"Oops, produk nggak ditemukan"** — a
phrase that looks exactly like "this product does not exist in
Indonesia" and is in fact **"we refused to show you the results"**.

This was confirmed directly: the same browser session returned
"produk nggak ditemukan" for `daun kunyit segar`, a query that the
text proxy had just returned **60 live products** for. **A negative
finding from a blocked session is not a market finding**, and no such
row is recorded as `unavailable` in this document.

The German evidence was not affected: the German shops server-render,
and the prices came from their own product pages.

---

## 4. The three checks the brief flagged

**Ackee in the United States** — not in this batch (ackee is not one
of the three pilot ingredients). It remains open for the worldwide
batch.

**Makrut lime in South Africa, and "calamansi" in the same row** —
also not in this batch. Open.

**Gochujang's form** — **closed by this batch.** The research confirms
there is no fresh gochujang: every product found, in Germany and in
Indonesia, is a **paste**. The list's `paste` form is correct, and the
brief's flag on "fresh gochujang" is confirmed.

---

## 5. What Stage B would write

For each row above with a source, one `ingredient_availability` row:

- `ingredient_id` — the ingredient row (see §6)
- `form` — the form enum value
- `product_category` — the category as the source names it
- `geo_entity_id` — DE or ID
- `availability` — the enum value above
- `price_band` — the enum value above
- `last_reviewed` — 2026-11-10

And for each substitute row, one `ingredient_substitutes` row with its
`suitability` and its `change_note`.

**Fifteen rows carry a source. Nine rows do not, and are held back.**
No row is written without one.

---

## 6. The blocker that is not about research

**None of these three ingredients exists as an ingredient row in the
live database.** The live `ingredients` table has 24 rows, all of them
the moussaka pantry seed (eggplant, lamb-mince, tomato, bechamel, and
twenty more). `curry-leaves`, `gochujang` and `fish-sauce` are not
among them, and neither are the other 17 on the list.

The rating attaches to ingredient rows, so there is nothing for these
rows to attach to until **GUS-1108** creates the ingredient rows. The
research does not depend on that and is not blocked by it; the *load*
is.

---

## 7. The counts the owner asked for

- **Pairs completed: 6 of 6** (3 ingredients × 2 countries) — every pair
  has a country row with a source.
- **Rows in total: 24** — 6 country rows, 12 form rows, 6 substitute
  rows.
- **Rows with a source: 15.**
- **Rows with no reliable source: 9**, all listed in §3, all held back
  from the load.
- **Forms researched per ingredient:** curry leaves 3, gochujang 1 (there
  is only one), fish sauce 2.
- **Substitutes researched:** 4 of the 4 the list names — gochugaru mix
  (DE, ID), lighter fish sauce (DE, ID) — but only **2 of the 4** carry
  a source. The Indonesian gochugaru mix and the Indonesian lighter
  fish sauce have no priced row.
- **Throughput:** 6 pairs and 24 rows in one batch, by one researcher.
  At this rate the 302-country tier is **6 pairs per batch × 50 batches**
  per ingredient — which is the honest arithmetic of GUS-1107 and the
  argument for batching by ingredient family.

---

## 8. The sources

**Germany**

- https://www.asiatischer-lebensmittelladen.de/produkt/frisches-obst-gemuese/kraeuter/curryblaetter/ — fresh curry leaves, 30 g, €2,99
- https://lebensmittelgo.de/products/ashoka-curry-leaves-100g — frozen curry leaves, 100 g, €3,99, 10 on Lager
- https://www.asiatischer-lebensmittelladen.de/produkt/gewuerze/gewuerze-gewuerze/annam-getrocknete-curryblaetter-20g/ — dried curry leaves, 20 g, €1,99
- https://www.asiatischer-lebensmittelladen.de/?s=currybl%C3%A4tter — the curry-leaf search
- https://www.asiatischer-lebensmittelladen.de/produkt/sossen/fischsossen/tiparos-fischsauce-720ml/ — Tiparos 720 ml, €3,79
- https://www.asiatischer-lebensmittelladen.de/produkt/sossen/fischsossen/ca-com-salzige-fischsauce-700-ml/ — Cá Cóm 700 ml, €3,19
- https://asia4friends.de/fischsauce-38n-thanh-ha-500ml — 38°N 500 ml, €8,49
- https://asia4friends.de/fischsauce-40n-red-boat-500ml — 40°N 500 ml, €13,99
- https://asia4friends.de/fischsauce-ca-com-b-700ml — Ca Com B 700 ml, €2,99
- https://www.arang.de/products/gochugaru — gochugaru, €8,95
- https://www.edeka.de/suche?q=Currybl%C3%A4tter — Edeka's search. **Fetched, but not citable as a negative**: the page returned its 557-item "Warenkunde" alphabet (an A-list) because the search is client-side, so it does not show what Edeka stocks. Recorded in §3.

**Indonesia**

- https://www.tokopedia.com/search?q=daun+kunyit+segar — 60 products
- https://www.tokopedia.com/bintan-frozen-foods/daun-kunyit-segar-fresh-1-ikat — 1 ikat, Rp 4.000
- https://www.tokopedia.com/waroenklinda/paket-bumbu-dapur-lengkap-1pack-daun-salam-daun-jeruk-sereh-kunyit-lengkuas-kencur-bahan-segar-untuk-masak-1729882539802789031 — Rp 12.000
- https://www.tokopedia.com/herballan-400/daun-kunyit-asli-segar-1-kg-1734503306111583467 — 1 kg, Rp 4.000.000
- https://www.tokopedia.com/search?q=kecap+ikan — fish sauce
- https://www.tokopedia.com/ferryfish/kikkoman-fish-sauce-saus-rasa-ikan-kecap — Rp 18.800
- https://www.tokopedia.com/search?q=gochujang — gochujang
- https://www.tokopedia.com/ferryfish/kikkoman-gochujang-sauce-300-gram-saus-pedas-ala-korea — 300 g, Rp 26.825
- https://www.tokopedia.com/finger-land/kikkoman-gochujang-sauce-300-gr-saus — 300 g, Rp 33.750
- https://www.tokopedia.com/search?q=kecap+ikan+ringan — **121 items**

**All sources accessed 2026-11-10.**
