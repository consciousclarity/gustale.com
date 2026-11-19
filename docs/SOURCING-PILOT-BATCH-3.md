# Sourcing pilot — Batch 3 (PARTIAL): makrut lime leaves, pandan, doubanjiang — plus Batch 2's gaps

**Researched:** 2026-11-11 · **Stage A** (a research document for the owner's review — nothing is published)

**This batch is partial, and says so.** A previous run timed out and wrote
nothing; this run wrote the skeleton first and had a short budget. **One
pair is partly sourced (pandan × DE). Nothing else in Batch 3 is sourced.**
Every other cell below is an honest "not established", not an absence finding.

Family chosen: **makrut-lime-leaves, pandan, doubanjiang** — chosen because a
German import shop (Asia Shop) that the repo's extractor can certify carries
them. The choice was not validated for ID/CH/US; those countries were not reached.

**Evidence tiers used here.** *Tier 1* = `scripts/extract-retailer-price.py`
certified a top-level JSON-LD Product/Offer. *Tier M* = a marketplace page read
through the reader proxy; the extractor cannot certify it (Tokopedia publishes
no JSON-LD). Tier M proves `channel=online` and the product's listed price, nothing more.

## 1. The rows

### 1.1 Makrut lime leaves
| country | availability | price band | import dependency | source |
|---|---|---|---|---|
| DE | not established | — | — | see note |
| ID | not established | — | — | not reached |
| CH | not established | — | — | not reached |
| US | not established | — | — | not reached |

**DE note — a product that looks like the form but is NOT established as it.**
Asia Shop sells "Frische Limetten Blätter 100 g" at **€4,99** (Tier 1, extractor
certified, page says "Auf Lager"). **The page never says makrut or kaffir**
(grep for `kaffir|makrut` on the raw HTML: 0 hits). Whether "Limettenblätter" are
makrut leaves is an inference, so **no `fresh` form row is written for it.**
Forms (fresh, frozen) and substitutes (makrut-lime-zest, ordinary-lime-zest): not established anywhere.

### 1.2 Pandan
| country | availability | price band | import dependency | source |
|---|---|---|---|---|
| **DE** | specialty_only | not computed (no benchmark) | **imported** — sold via an Asian import shop only | [Asia Shop NANG FAH Pandan Blätter Extract](https://www.asiatischer-lebensmittelladen.de/produkt/konserven-fertiggerichten/konserven-gemuese/nang-fah-pandan-blaetter-extract-400g/) |
| ID | not established | — | see §2 | not reached |
| CH | not established | — | — | not reached |
| US | not established | — | — | not reached |

**DE forms** (CSV forms: `fresh`, `extract`; product categories fresh-leaves, juice, flavouring)

| form | product | size | price (Tier 1) | stock | source |
|---|---|---|---|---|---|
| extract (juice) | NANG FAH Pandan Blätter Extract | 400 g | **€2,59** | Auf Lager | [page](https://www.asiatischer-lebensmittelladen.de/produkt/konserven-fertiggerichten/konserven-gemuese/nang-fah-pandan-blaetter-extract-400g/) |
| extract (juice) | POR KWAN Pandan Leaves Extract | 400 ml | **€2,29** | Auf Lager | [page](https://www.asiatischer-lebensmittelladen.de/produkt/konserven-fertiggerichten/konserven-gemuese/por-kwan-pandan-leaves-extract-400ml/) |
| fresh (leaves) | **not found** — the shop's search for "pandan" returned no fresh-leaf product | — | not established | — | [search](https://www.asiatischer-lebensmittelladen.de/?s=pandan&post_type=product) |

Both prices came from `extract-retailer-price.py` on `raw.html` (exit 0). The
*Nang Fah* and *Por Kwan* products are Thai brands: imported. Substitutes: none in the CSV.
The spec's limit for the forms: *"Pandan extract or an approved pandan flavoring may work in many desserts, but it does not reproduce the aroma of fresh leaves."*

### 1.3 Doubanjiang
All four countries: **not established / not reached.** The Asia Shop search for
"doubanjiang" returned only unrelated products (fuzzy match), which is **not**
evidence the shop lacks it.

## 2. The import dependency, from the registry
`bash scripts/bpom-registry.sh "pandan" 100` returned 82 food (`MD`/`ML`) rows: **76 MD, 6 ML**. **Do not read this
as pandan's import dependency**: the rows are *products flavoured with* pandan
(pandan bread, bird's-nest drinks, ice lollies), not pandan the ingredient. A
proper count needs a filter to ingredient products; **not done, so no import
dependency is asserted for ID pandan.** Makrut ("daun jeruk purut") returned no usable rows.

## 3. The substitutes
Pandan: none in the CSV. Makrut: `makrut-lime-zest`, `ordinary-lime-zest` — not researched. Doubanjiang: `generic-chili-bean-paste` — not researched. **No substitute row is written.**

## 4. The counts the owner asked for
Measured from the tables above (a script counted the table rows):

| | rows |
|---|---|
| table rows in this document | **11** |
| — country rows | 8 (makrut ×4, pandan ×4; doubanjiang has no table, all four countries are prose "not established") |
| — form rows | 3 (2 sourced, 1 "not found") |
| — substitute rows | 0 |
| sourced rows (a source URL + Tier 1 price or a sourced country row) | **3** (pandan DE country row, 2 extract form rows) |
| held back / not established | **8** (7 country rows, 1 form row) plus all of doubanjiang |
| ingredient × country pairs completed | **0 complete**; 1 partial (pandan × DE); 11 not reached |
| URLs cited in this document | 3 linked + 1 unlinked below |

By ingredient: makrut 4 rows (0 sourced) · pandan 7 rows (3 sourced) · doubanjiang 0 rows.
By country: DE 4 rows (3 sourced) · ID 2 · CH 2 · US 2 (all not established).

## 5. What I could not source, and why
1. **Makrut lime leaves, all four countries** — the only German candidate does not name makrut on its page; ID/CH/US not reached (time budget).
2. **Pandan ID, CH, US; fresh pandan leaves in DE** — not reached / not found in the shop search.
3. **Doubanjiang, all four countries** — shop search was fuzzy and returned nothing relevant; nothing else reached.
4. **Registry import dependency for pandan** — query matches flavoured products; needs an ingredient-level filter.
5. **Price bands** — no local benchmark was computed this run, so none is asserted.
6. **All substitute rows** — not researched.

## 6. How this document was checked
- Both DE prices were produced by `scripts/extract-retailer-price.py --page raw.html --product "<name>"` on pages fetched with `scripts/fetch-retailer-page.py` (artefacts in `/tmp/b3/as_*`). Stock state read from the raw HTML (`instock`, "Auf Lager").
- The "Limetten Blätter" price is Tier 1 but the *identity* (makrut) is not on the page, so it was not turned into a row.
- The registry count was checked for what it counts (flavoured products), and rejected as an import-dependency figure.
- Batch 2's Indonesian findings are in `docs/SOURCING-PILOT-BATCH-2.md` §5 item 0 (partially closed) and the new §7.

## 7. Every URL cited
- https://www.asiatischer-lebensmittelladen.de/produkt/konserven-fertiggerichten/konserven-gemuese/nang-fah-pandan-blaetter-extract-400g/
- https://www.asiatischer-lebensmittelladen.de/produkt/konserven-fertiggerichten/konserven-gemuese/por-kwan-pandan-leaves-extract-400ml/
- https://www.asiatischer-lebensmittelladen.de/?s=pandan&post_type=product
- https://www.asiatischer-lebensmittelladen.de/produkt/frisches-obst-gemuese/kraeuter/frische-limetten-blaetter-100g/ (identity as makrut NOT established; no row written)
- Batch 2 additions: https://www.tokopedia.com/pamella-grosir ; https://www.tokopedia.com/sayurijojakarta ; https://www.tokopedia.com/sayurijojakarta/asam-jawa-tanpa-biji-cap-gunung-150-gram-pack-fresh-tamarind-seedless-dried-daging-asem-kawak-bumbu-rempah-dapur-masak-instant-sayur-buah-segar-1734390638283621774 ; https://www.tokopedia.com/pamella-grosir/tepung-tapioka-cap-gajah-laut-asli-500-gr-1730498134400272281 ; https://www.tokopedia.com/ladanglimaid/tepung-mocaf-apf-500g-tepung-singkong-gluten-free-ladang-lima ; https://www.tokopedia.com/sayurijojakarta/singkong-meledag-600-gram-pack-fresh-frozen-food-cemilan-instant-dapur-siap-di-goreng-beku-segar-halal-1735851918211384718
