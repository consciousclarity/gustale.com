# GUS-242 — the global reference-data plan (items 1–6)

**Status:** 🟡 DRAFT for Alejandro's review · **Date:** 2026-10-27 · **Nothing implemented. No schema change.**

The direction change: **structure and reference data are seeded for the whole world from day one.** Only the *evidenced* label is gated by sources — not dish entry. A dish enters the catalogue classified but unevidenced; non-Wikipedia sources are required only for a *statement* to count as evidenced.

**Withdrawn:** the earlier "≥1 non-Wikipedia source per new dish" requirement. A dish with no source is a legitimate, classified, unevidenced catalogue entry. What needs a source is a *claim about it*.

---

## Every number below was measured on 2026-10-27

| source | method |
|---|---|
| Wikidata | live SPARQL at `query.wikidata.org/sparql`, `curl -4`, descriptive UA |
| Wikipedia | MediaWiki action API, `curl -4`, paced |
| ISO 3166 | `iso-codes` 4.20.1 release, parsed locally |
| FoodOn | `purl.obolibrary.org/obo/foodon.owl` (40.8 MB), parsed with ElementTree |

### Three corrections to identifiers I had wrong

Recorded because they invalidate any query run with the wrong ids:

| I said | actually is | correct id |
|---|---|---|
| dish = Q1259274 | **Sechelt**, a town in BC | **Q746549** = "dish" |
| country of origin = P17 | P17 = "country" | **P495** = "country of origin" |
| cuisine = P4952 | P4952 = "safety classification" (chemical hazard) | **P2012** = "cuisine" |

With the wrong ids, every count returns 0 and looks like "no data". The subagent hit the same trap independently.

---

## (1) PLACES — all countries + all first-level regions

**Measured**

| | count | source |
|---|---|---|
| ISO 3166-1 countries (officially assigned) | **249** | iso-codes 4.20.1 |
| ISO 3166-2 subdivision records, total | **5,046** | iso-codes 4.20.1 |
| — of which **first-level** | **3,590** | (3,590 records have no `parent`) |
| — of which second-level | **1,456** | (1,456 have a `parent`) |
| countries covered by 3166-2 | **200** | |
| countries with **no** first-level subdivisions | **49** | mostly territories |
| largest first-level sets | Slovenia **212**, Russia **83**, Türkiye **81**, N. Macedonia **80**, Thailand **78**, Japan **47**, Vietnam **63**, US **57**, India **36**, China **34**, Mexico **32**, Brazil **27** | |
| Indonesia | **7** (province-level, but ISO's set is minimal) | |
| Philippines | **17** | |
| Wikidata items with P297 (ISO 3166-1 alpha-2) | **261** | |
| Wikidata items with P300 (ISO 3166-2) | **5,458** | |
| Wikidata items with both | **33** | |
| Wikidata items with P131 (located in) → a country | **93,088** | |

**The licensing problem, stated plainly.** **ISO 3166 is not freely redistributable.** ISO sells it as a priced standard and the ISO OBP is a paid viewing service; iso.org returned **HTTP 403** to this host. The `iso-codes` Debian package redistributes ISO-derived data under **LGPL-2.1-or-later**, but that covers the *package*, not the underlying standard, and it is not an official ISO channel.

**So: do not vendor the ISO data.** Use **Wikidata** instead — it is **CC0**, requires no ISO licence, and already carries the codes:

- `geo_entities.iso_code` — **already exists**, and all 36 current rows already populate it (alpha-2)
- `geo_entities.wikidata_id` — **already exists, 0 of 36 populated** → **GUS-232**
- `geo_entities.entity_type` — `country` / `region` / `city` — already exists
- `geo_entities.parent_id` — already exists
- `geo_entities.centroid` — **already exists, 0 of 36 populated**

**Recommendation:** seed from **Wikidata P297/P300 + P17/P131 + P150**, never from the ISO files. The ISO counts above are for *sizing* the work, not for populating it.

**Sizes to seed**

| tier | rows | source |
|---|---|---|
| countries | **249** | Wikidata items with P297 |
| first-level regions | **~3,590** | Wikidata items with P300 at level 1, or P131 whose parent is a country |
| cities | **on demand** | only when a researched dish needs one |

**Folding in GUS-232 and GUS-237.** GUS-232 (populate `wikidata_id`) becomes part of this — every seeded place gets its Q-id from the same Wikidata pass, so there is no separate, later, 36-row task. GUS-237 (`place_spans`, the n:m for Punjab spanning India and Pakistan) becomes a *data* question rather than a schema question: with `P17` (country) and `P131` (located in) both available, a transnational place is modelled as **one place with two countries**, and `place_spans` is derivable. **Recommend GUS-237 be dropped or reduced to a view** rather than a new table.

**One thing I need to flag:** the `geo_entities` table currently has **no unique constraint** on `iso_code` or `wikidata_id`. Seeding 249 countries plus 3,590 regions without one will accumulate duplicates exactly the way `sources` accumulated 21 duplicate URLs (GUS-238). **Add `UNIQUE (wikidata_id)` and `UNIQUE (iso_code)` as part of this** — that is the GUS-238 lesson applied pre-emptively.

---

## (2) CUISINES — one national value per country

**The 0-members rule is dropped** for cuisines (it stays for families). That was the right call: a cuisine is a *geographic frame*, and a country with no dish in the catalogue yet still has a cuisine.

**Measured — English Wikipedia already has exactly this taxonomy:**

| | count |
|---|---|
| `Category:Cuisine by country` | **212** direct subcategories |
| — of which **national-cuisine** branches | **191** |
| — of which by-*axis* branches (Breads, Condiments, Desserts, Drinks, Rice dishes, Soups and stews, …) | **21** |
| dish articles under the national branches | **~9,236** (extrapolated from a paced 25-branch sample; the sample's own total was 1,209) |

**191 national cuisines**, including ones no food publication would list: Beninese, Burkinabe, Chadian, Cape Verdean, Bhutanese, Malawian, São Toméan, Saint Lucian. That is the "not expected" coverage you asked for, and it is *already written*.

**Source recommendation: Wikipedia's category names, cross-checked against Wikidata's cuisine items.**

| | count |
|---|---|
| Wikidata items that are instances/subclasses of Q1778821 "cuisine" | **1,265** |
| Wikidata items carrying P2012 (cuisine) | **6,336** |
| distinct cuisine values used via P2012 | (from 6,336) |

**Practical source for the 191 national values: the Wikipedia category names** (they are already the conventional demonyms — "Indonesian cuisine", "Cape Verdean cuisine"). **Wikidata P2012 is too sparse to be the seed** — only 1,213 of 3,318 dishes have it.

**Estimated size: ~200 national cuisine values** (191 from Wikipedia + the handful of Wikipedia branches that are not plain demonyms, e.g. "Cuisine of Luxembourg", "Cuisine of Northern Cyprus", "Cuisine of São Tomé and Príncipe", "Cuisine of the Central African Republic"). Plus **Tunisian, Nepalese, Puerto Rican** — which were dropped from the earlier batch because they had 0 members, and which the new rule says to create anyway.

**Naming decision needed:** the Wikipedia convention is `"<Demonym> cuisine"`; the live `dish_cuisines` rows are bare demonyms (`Indonesian`, `Mexican`). **Recommend keeping the bare demonym** for consistency with the 21 existing values, and treating the Wikipedia category names as the *source list*, not the stored form.

---

## (3) TRADITIONS — one global research pass

**Measured**

| | count | confidence |
|---|---|---|
| Wikidata cuisine items (the ceiling) | **1,265** | verified |
| Distinct cuisine values used via P2012 | ~1,000 | verified (6,336 uses) |
| Distinct **regional/transnational** traditions | **not a single well-defined number** | — |

**Why "regional traditions" has no clean count:** the examples span three different granularities — supranational (Levantine, Maghrebi), regional-national (Cantonese, Andalusian, Abruzzo), subnational-regional (Kerala, Hunan, Sichuan, Teochew), and diaspora (Creole, Ottoman, Punjabi, Mughlai). A flat count is not well-defined.

**Recommendation: a two-tier model, not a flat list.**
- **Tier 1 — national cuisine** (item 2): ~200 values, one per country.
- **Tier 2 — regional/ethnic/religious tradition**: a curated list, target **400–600**, expandable to ~1,265.

**Suggested source set for the Tier-2 research (none fully counted yet):**
- the **1,265 Wikidata Q1778821** items — the ceiling, and the best single source
- English Wikipedia's **`Category:Cuisine by region`** and the by-axis branches
- **UNESCO intangible heritage** food inscriptions — see the measured figure below
- the existing **36** `dish_traditions` values, which already include Minangkabau, Levantine, Maghrebi, Cantonese-adjacent and ethnic values

**UNESCO intangible heritage — measured, and it is smaller than expected.** The English Wikipedia hub article *"Lists of Intangible Cultural Heritage elements"* states directly: **"All lists combined totalled 676 elements, corresponding to 140 countries as of April 2023"**, with the Urgent Safeguarding List at **35 elements** and the 2001–2005 "Proclaimed Masterpieces" at **90**.

So the entire UNESCO intangible-heritage corpus is **676 elements across 140 countries**. Even if *every* food-related inscription were a tradition value, the UNESCO list could not be the source for a 400–600-value tradition vocabulary — **it is a supplement, not a backbone.** (The food subset was not counted: UNESCO's own site loads its list over an AJAX endpoint whose parameter set could not be determined from the page source, and Wikidata models the corpus thinly — only **117 items** carry `P31 = intangible cultural heritage` (Q59544) and only **4** of those match a food keyword in their label. The 676 figure above is from the Wikipedia hub article and is the reliable one.)

**This is the item with the most genuine research in it, and it is the one I would most want your steer on** — see "decisions I need" below.

---

## (4) FAMILY / TECHNIQUE / INGREDIENT — design once, cross-check against FoodOn

**FoodOn:** release **2026-09-20**, **45,594** `owl:Class` declarations, **29,175** with an English label, **food material 20,148** descendants, **food product 12,342** descendants, licence **CC BY-SA 2.5** (from the ontology's own `dcterms:rightsHolder`). Download: `purl.obolibrary.org/obo/foodon.owl` — **40,779,019 bytes**. Note the **lowercase** URL; `FOODON` uppercase is **404**.

**LanguaL:** FoodOn's own homepage states it "was based largely on LanguaL, a descriptive food indexing system that has **14 facets**", and positions FoodOn as a superset ("gone one step further than LanguaL"). **LanguaL's own term count was not verified** — the Wikidata-side measurement was attempted and returned nothing usable, so it is left open rather than guessed.

**What FoodOn is good for, and what it is not:**

| Gustale dimension | FoodOn fit |
|---|---|
| **dish_technique** | **STRONG** — "food process" is a first-class branch covering curing, fermenting, roasting, frying. The closest existing vocabulary to `dish_technique`. |
| **dish_ingredient_category** | **STRONG** — "food material" is the largest branch (20,148), and it carries the EFSA FOodex2 food-group hierarchy, so the existing 53 `ingredient_categories` can be cross-checked against it directly. |
| **dish_family** | **WEAK — must be designed.** FoodOn's "food product hierarchy" is *generic food product categories* ("a can of kidney beans"), explicitly not named preparations. There is no existing controlled vocabulary of dish families to lift. |
| cuisine / tradition | **ABSENT** — FoodOn does not model cuisine. |

**So the honest answer to "is there an existing dish-family vocabulary?" is no — it has to be designed.** But it does not have to be designed blind:

**Cross-check set**
1. **FoodOn** — ingredient and process terms; `food product category` alignment for the family axis
2. **Wikidata Q746549's subclass tree** — **13,274** items under `wdt:P279*` (8,110 instances) — the dish-family terms already in use by the world
3. **Wikidata P186** (made from material) on **5,644** dishes, **P527** (has part) on **1,976**, **P361** (part of) on **1,096** — the existing technique/ingredient edges
4. **Wikipedia's by-axis categories** (the 21 above) — the prose-level family taxonomy
5. **LanguaL** — the 14-facet structure FoodOn inherited

**Estimated sizes for the designed vocabularies**

| vocabulary | current | target | source of truth |
|---|---|---|---|
| family | 25 | **~120–180** | designed, cross-checked against FoodOn product categories + Wikidata P279 |
| technique | 25 | **~60–90** | FoodOn food-process branch |
| ingredient_category | 53 | **~250–400** | FoodOn food-material branch (EFSA FOodex2 groups) |

---

## (5) CATALOGUE GROWTH AS A PIPELINE

**The pipeline**

```
Wikidata / Wikipedia  ──▶  classify  ──▶  enter the catalogue  ──▶  research
   (S6 = discovery)        (dimensions)     (unevidenced)            (S1–S5)
```

### Discovery pool, measured — and the direct-`P31` count was wrong

**The first count used `wdt:P31 = dish` and was 3,318. The subclass path `wdt:P31/wdt:P279* dish` gives 8,110.** Alejandro was right that most dishes are instances of *soup* / *dumpling* / *curry* and so on, not of "dish" itself. **Every figure below uses the subclass path.**

| population | direct `P31` | **`P31/P279*`** | delta |
|---|---|---|---|
| dishes (all) | 3,318 | **8,110** | +4,792 |
| …with country of origin (P495) | 2,168 | **4,192** | +2,024 |
| …with P17 or P495 | 3,192 | **7,413** | +4,221 |
| …with a cuisine (P2012) | 1,213 | **1,723** | +510 |
| …with an English Wikipedia article | 1,127 | **2,168** | +1,041 |
| …with a Wikipedia article AND country | 895 | **1,633** | +738 |
| …with a Wikipedia article AND ≥1 reference | 862 | **1,475** | +613 |
| …with any P279 subclass | 1,917 | **3,111** | +1,194 |

**And the "untyped" claim was also wrong.** A dish is typed by **`P31` pointing at a dish subclass** — "soup", "dumpling", "curry" — and a `P279` link is a *different* thing (a taxonomic parent). Measured:

| | count |
|---|---|
| dishes (subclass path) | 8,110 |
| …whose `P31` target is a **dish subclass** | **8,164** |
| …that have a `P279` | 3,111 |
| …with **neither** a dish-subclass `P31` nor a `P279` | **1,595** |
| dishes with a Wikipedia article | 2,168 |
| …of which typed via a dish-subclass `P31` | **1,985 (92%)** |
| …of which typed via `P279` | 1,488 |
| …of which typed **neither** way | **394 (18%)** |
| …with a Wikipedia article, country of origin, and a dish-subclass `P31` | **1,565** |

**So the earlier flag was materially wrong.** The claim "~8,000 Wikipedia dish articles have no Wikidata type" was based on the direct-`P31` count and on treating `P279` as the type signal. **The real numbers:**

- **~9,236** Wikipedia dish articles under the 191 national-cuisine categories (measured separately)
- **2,168** of them are Wikidata dishes on the subclass path
- **1,985 of those are typed** (92% — via `P31` to a dish subclass)
- **1,565** have a Wikipedia article, a country of origin, *and* a dish-subclass type

**The genuinely untyped pool is ~394 dishes, not ~8,000.** The remaining gap between 9,236 and 2,168 is Wikipedia articles that are **not Wikidata dishes at all** — they are articles without a `P31`/`P279` path to "dish". Those are a *different* population: they need a type assigned, which is a classification task, not a discovery task.

**Two pools, not one:**

| pool | size | what it needs |
|---|---|---|
| **A — typed, locatable** | **1,565** (article + country + dish-subclass type) | import as-is; the type is already decided |
| **B — untyped but on Wikidata** | **394** (article, no type either way) | a type must be assigned — the classification task |
| **C — article but not a Wikidata dish** | the rest of the ~9,236 | discovery + classification, highest cost |

**And the distinct `P279` classes in use rose from 524 to 787** on the subclass path — the raw material for the family vocabulary is **50% larger** than I reported.

**SPARQL endpoint performance (measured):** aggregate counts completed in **0.2–2.2 s**; a P31/P279* closure in 1.1 s. **A bare unindexed `COUNT { ?x ?p ?o }` timed out at 60 s** — always constrain on `wdt:P31`/`wdt:P279` first. **Polite-pool etiquette:** descriptive UA with contact info, one query at a time per client, stay under ~60 s runtime, avoid peak hours. Observed fast times mean the endpoint was **not under load**, so these are best-case.

**Wikimedia Commons image coverage** (measured 2026-10-27, via the Commons API):

| category | subcategories | files (first page) |
|---|---|---|
| `Category:Food` | **93** | 142 |
| `Category:Cuisine` | **18** | 108 |
| `Category:Dishes` | 2 | 3 |
| `Category:Foods` | 0 | — |

**The file counts above are one API page each, not totals** — the category tree is deep (93 subcategories under `Category:Food` alone) and a full recursive count was not run. What the shape tells us: **Commons' food imagery is organised by ingredient and by category, not by dish**, and the top-level categories are thin on files while the mass sits in the subcategories. **Practical consequence:** an image pipeline cannot assume a per-dish Commons file exists, and the existing GUS-153 work (110 dishes still without covers) is the live measure of that gap. Commons is a *discovery* source for images under the same S6 rule as Wikipedia text, not a guarantee of coverage.

**So the discovery pipeline's realistic throughput is ~1,100–9,000 candidate dishes** depending on whether Wikipedia articles alone are enough or Wikidata's unlinked items are included too.

**What "enter classified but unevidenced" means operationally**

| | |
|---|---|
| dish row | created, `status='published'` |
| description | written in the catalogue's own words |
| dimensions | **assigned or explicitly unset** — never neither |
| `statement_id` | **NULL** on every dimension row → `unevidenced` |
| `dish_dimension_unset` | where a dimension is unset, with its reason |
| `provenance` | `preparation` (the catalogue's own method) or `description-derived` |
| `status` on the dimension row | `active` or `provisional` |

**And the withdrawn rule, stated in the ADR:** a dish does **not** need a non-Wikipedia source to exist. It needs one for its *origin claim* to count as evidenced. That is a smaller, more honest bar than "every dish must be sourced", and it is the rule GUS-026 §3.1 actually writes.

---

## (6) REVIEW TIERS — automated on every dish, human on disputed + samples

**The automated tier is already measurable and working.** The GUS-231 check (every published dish × 7 dimensions has exactly one state) is a **single query** and currently passes with `missing_both=0, has_both=0`. The pre-flight assertion block in the GUS-241 migration is a second automated tier — and it caught a real bug that no amount of eyeballing would have, because the expected counts were written down inline.

### The reference-quality baseline (measured 2026-10-27) — this is what the tiers have to cope with

| population | total | with ≥1 reference | with none |
|---|---|---|---|
| all Wikidata dishes (P31=dish) | **3,318** | **1,569** (47%) | 1,749 (53%) |
| …with an English Wikipedia article | **1,127** | **862** (76%) | **265** (24%) |
| …with a reference on the P31 statement | | **122** (11%) | |
| …with a reference on the country-of-origin (P495) | | **569** (50%) | |
| **the importable pool**: Wikipedia article **and** country of origin | **895** | **686** (77%) | 209 (23%) |

**Three things this says, and they shape the review protocol.**

**First: a Wikipedia article is a strong filter.** Of the 1,127 dishes with an English article, **76% already carry a Wikidata reference** — against **47%** for dishes generally. The article is doing most of the quality work.

**Second: the reference sits on the origin claim, not on the type.** For the Wikipedia-linked set, **569 have a reference on the country-of-origin statement** but only **122 have one on the "is a dish" statement**. That is exactly the shape of the problem: *what kind of thing is this* is nearly self-evident, while *where does it come from* is the contested part. **It also means the GUS-026 §3.1 rule — an origin claim needs a non-Wikipedia source — is the rule that carries the weight, and everything else is comparatively cheap.**

**Third: roughly a quarter of the pool arrives unreferenced.** 209 of 895 importable dishes have no Wikidata reference at all. Under the new direction those enter the catalogue **classified but unevidenced** — which is precisely the state they are already in on Wikidata, so the catalogue's honest labelling is not a downgrade of the source data, it is a faithful rendering of it.

### What the automated tier checks (all measurable, all cheap)

| check | cost | catches |
|---|---|---|
| every published dish × 7 dimensions has exactly one state | 1 query | a dimension with neither a value nor an unset |
| a value and an unset never coexist for the same (dish, dimension) | trigger, always on | a contradictory pair |
| every dimension row's `provenance`/`status` are in the allowed set | 1 query | an unlabelled inference |
| every dish with a dimension row has a source-backed or unset-with-reason dimension | 1 query | silent evidence gaps |
| expected-vs-actual counts on every bulk write | assertion block | a 0-row insert that should have matched |

### What the human tier is for — and what it is not for

**Reserved for the cases where judgement is genuinely required:**
1. **Disputed dimensions** — `dish_dimension_unset.reason = 'disputed'`. Every one needs a human to decide which position the catalogue takes, or explicitly to take none.
2. **A random sample of the rest**, for drift detection.

**Not for:** reading every dish to check it. The automated tier catches structural defects comprehensively, and a reference-free dish is *not* a defect — it is correctly labelled.

**The specific failure a sample must catch:** a dimension that is **assigned but wrong** passes every automated check. A sample is the only instrument for it. This is the single strongest argument for keeping a human tier at all, and it argues for it being small and random rather than large and targeted.

### Still not researched — and deliberately not guessed

- **A realistic human-review throughput (dishes/hour).** I have no measured basis for a number. The subagent also reached its iteration budget before this. **The ANSI/ASQ Z1.4 acceptance-sampling standard** is the usual reference for the *sampling pattern* (it defines AQL-based acceptance sampling for inspecting lots) but it does not tell us how fast a person reviews a dish, and I have not read it against this case. **I will not put a number in the plan that I cannot source.**
- **Wikipedia's "citation needed" dynamics at scale**, and the existing **Scholia / Wikidata quality-report dashboards** — named as sources, not measured.

**Consequence for the plan:** the review *protocol* is specified above and is complete enough to implement. The review *throughput* — which determines how large a sample is affordable, and therefore the confidence interval of the sample — is the one open number. **That is why it is decision 6 in the list below.**

---

## Order of work

| # | step | size | depends on |
|---|---|---|---|
| 1 | **schema prep**: unique constraints on `geo_entities` (wikidata_id, iso_code); `unset_reason` already live | — | — |
| 2 | **places tier 1**: 249 countries from Wikidata P297 + P17 + Q-id | 249 rows | 1 |
| 3 | **places tier 2**: first-level regions from P300/P131 + P150 | ~3,590 rows | 1, 2 |
| 4 | **cuisines**: ~200 national values from Wikipedia's 191 + the extras | ~200 rows | — |
| 5 | **traditions**: one research pass → Tier-2 list | 400–600 rows | 4 |
| 6 | **vocabularies**: family / technique / ingredient designed once, cross-checked against FoodOn + Wikidata P279 | ~120–180 / ~60–90 / ~250–400 | — |
| 7 | **pipeline**: the discovery → classify → enter loop, in tranches of 10 | unbounded | 2–6 |
| 8 | **review tiers**: automated checks (live) + the human sample protocol | — | 7 |

**Steps 1–6 are reference data and can be done before the claims model.** Step 7 needs the claims model for `statement_id` to be meaningful — but the *pipeline* can be built against `statement_id IS NULL` (unevidenced) and switch to evidenced rows once GUS-027/028 lands.

---

## Schema work the decisions require (nothing applied yet)

Measured against the live schema, 2026-10-27 — these are the changes decisions 1, 3 and 5 need, and none of them has been applied.

| table | has today | needs |
|---|---|---|
| `dish_families` | `id, slug, name, description, created_at` — **no `parent_id`** | **`parent_id`** (decision 5's hierarchy), and a `foodon_id` cross-reference column |
| `dish_cuisines` | `id, slug, name, description, created_at` — no `parent_id` | a **`dish_cuisine_translations`** table (decision 3's localised display label — the schema already has this pattern for `categories`, `ingredients`, `preparation_methods`) |
| `dish_traditions` | `id, slug, name, description, created_at` | the **definition + source** columns decision 4 requires per value |
| `dish_techniques` | `id, slug, name, description, created_at` | a `foodon_id` cross-reference column |
| `ingredient_categories` | `id, slug, name, parent_id, description` — **already has `parent_id`** | a `foodon_id` cross-reference column |
| `geo_entities` | `id, iso_code, name, local_name, entity_type, parent_id, centroid, population, area_km2, wikidata_id, created_at` | **UNIQUE (wikidata_id)** and **UNIQUE (iso_code)** — decision 1 makes both the key, and without them a 3,590-row seed repeats the GUS-238 duplicate-URLs lesson |
| `dish_dish_*` | `provenance` + `status` added by GUS-241 | `provenance` gains **`article-derived`**, which must always pair with `status='provisional'` |

**The `provenance` domain, as decided:**

| value | meaning | paired status |
|---|---|---|
| `preparation` | the catalogue's own recorded method or value | `active` |
| `description-derived` | read from the dish's own `short_description` | `active` or `provisional` |
| **`article-derived`** | **read from a source article's text** | **always `provisional`** |

**And a constraint worth writing down, because it is a rule the database can enforce:** `article-derived` ⇒ `status='provisional'`. That is a CHECK constraint, not a convention — and it is the same shape as the trigger that already stops a value and an unset coexisting.

---

## Decisions — ALL SIX TAKEN (Alejandro, 2026-10-27)

| # | decision | consequence for the plan |
|---|---|---|
| **1** | **Wikidata route, with ISO codes as the keys** (P297 / P300) | seed places from Wikidata (CC0), never from the ISO data files (licensed). `geo_entities.iso_code` holds the ISO code as the **key**; `wikidata_id` holds the Q-id. Both get UNIQUE constraints. |
| **2** | **all ~3,590 first-level regions now; cities on demand** | step 3 of the order of work is a 3,590-row seed. `geo_entities.entity_type` takes `country` / `region` / `city` — the tier 3 stays `city` and is seeded when a researched dish needs one. |
| **3** | **slug = bare demonym; display label localised** | `dish_cuisines.slug` = `indonesian`, `portuguese`, `puerto-rican`; the **display name** comes from a localised label table (the schema already has `*_translations` for `categories`, `ingredients`, `preparation_methods` — the same pattern applies). Wikipedia's `"Indonesian cuisine"` is the **source list**, not the stored form. |
| **4** | **traditions 400–600, researched, each with a definition + source; extend by decision** | the research pass must produce a **definition and a source per value**, not just a name. Extension is by explicit decision, like every other vocabulary. |
| **5** | **families 120–180 with a `parent_id` hierarchy** | `dish_families` gains `parent_id` — so `stew` → `soup` → `noodle-soup` can nest, and `stuffed-vegetable` can sit under a broader form. This is the hierarchy ADR-001 D3i was already gesturing at. |
| **6** | **no research pass: 10% sample per batch + 100% of disputed; Alejandro measures his review time on batch 1 and we adjust** | the sample size is **adaptive**, not fixed in advance. Batch 1's measured review time sets the rate for every batch after it. |

**The review protocol, now fixed:**

| tier | what | how much |
|---|---|---|
| automated | every dish, every batch | the GUS-231 state check, the coexistence trigger, the provenance/status domain check, the expected-vs-actual assertion block |
| human, judgement | **100% of disputed** dimensions | every `dish_dimension_unset.reason = 'disputed'` — the catalogue must take a position or explicitly take none |
| human, sampling | **10% random per batch** | catches the dimension that is *assigned but wrong*, which no automated check can see |

**Batch 1's measured review time is the input to every later batch's sample size.** That is the adaptation mechanism, and it means decision 6 is answered by *doing* batch 1, not by more research.

---

## Licensing — the rule, and what it means concretely

**FoodOn is CC BY-SA; Wikipedia text is CC BY-SA. Store external identifiers as CROSS-REFERENCES only, and write our own labels and definitions.**

| we store | we do NOT store |
|---|---|
| `foodon_id` — a `FOODON_0012345` cross-reference | FoodOn's `rdfs:label` text |
| `wikidata_id` — a `Q123456` cross-reference | Wikipedia's article prose |
| `iso_code` — the ISO code as a key | the ISO file's rows |
| **our own label and definition, written by us** | any imported description |

**Why this is the right rule and not a technicality.** The cross-reference is a *pointer*: it says "there is an authoritative term for this concept, identified as FOODON_0012345." The label and definition are *ours*, which is what the catalogue actually publishes. That keeps the licences where they belong — the identifiers are facts, and facts are not copyrightable — while the prose is unambiguously our own.

**Practical effect on the vocabulary work:** the family/technique/ingredient cross-check against FoodOn tells us *which concepts exist* and *how they relate*; the labels and definitions we publish are written from scratch. Same for Wikipedia: the article is the discovery source and the excerpt source (Q7's `claim_citations` already stores the **verbatim excerpt** with attribution, which is a quotation, not a copy).

**And it extends to the catalogue's own content:** every dish description is written in our own words — never copied from Wikipedia. That was already the project rule (the content rules in `SHARED_STATE.md`); this makes it explicit for the reference vocabularies too.

**One thing I want to flag as a risk, not a question — and it is now much smaller than I said.** My earlier flag was "~8,000 Wikipedia dish articles have no Wikidata type, so classifying them is inference". **That was based on the direct-`P31` count and on treating `P279` as the type signal, and it was wrong.** On the subclass path, **92% of Wikipedia-linked dishes are typed** via `P31` to a dish subclass, and the genuinely untyped pool is **~394**, not ~8,000.

**So the risk is restated accurately:** the inference-heavy population is **pool C** — Wikipedia articles that are not Wikidata dishes at all (the gap between 9,236 and 2,168). Those need a type *and* a place assigned. **If `description-derived` is to be the majority provenance, pool C is where it happens** — and that is a deliberate choice, not a defect, provided the `status='provisional'` marker says so.

**Provenance, as decided:** article-text classification is **`article-derived` + provisional** — **distinct from `description-derived`**. That is a third value, and it is the right one: a classification inferred from a *source article's* text is a weaker inference than one read from the *catalogue's own description*, and the two must not be conflated in a column that has to say how a value was established. The vocabulary becomes:

| `provenance` | meaning |
|---|---|
| `preparation` | the catalogue's own recorded method or value — a stated fact |
| `description-derived` | read from the dish's own `short_description` |
| **`article-derived`** | **read from a source article's text — always paired with `status='provisional'`** |
