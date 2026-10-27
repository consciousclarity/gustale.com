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
- **UNESCO intangible heritage** food inscriptions — not counted; a separate pass over `ich.unesco.org`
- the existing **36** `dish_traditions` values, which already include Minangkabau, Levantine, Maghrebi, Cantonese-adjacent and ethnic values

**This is the item with the most genuine research in it, and it is the one I would most want your steer on** — see "decisions I need" below.

---

## (4) FAMILY / TECHNIQUE / INGREDIENT — design once, cross-check against FoodOn

**FoodOn, measured:**

| | |
|---|---|
| release | **2026-09-20** (version string `2026-02-02`) |
| **owl:Class declarations** | **45,594** |
| classes with an English label | **29,175** |
| `food material` branch | **20,148** descendants |
| `food product` branch | **12,342** descendants |
| licence | **CC BY-SA 2.5** (from the ontology's own `dcterms:rightsHolder`) |
| download | `purl.obolibrary.org/obo/foodon.owl` — **40,779,019 bytes**. Note the **lowercase** URL; `FOODON` uppercase is **404**. |

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

**Measured discovery pool**

| | count |
|---|---|
| Wikidata items with P31 = dish (Q746549) | **3,318** |
| — including subclasses (P31/P279*) | **8,110** |
| all subclasses of dish (P279*) | **13,274** |
| dishes with P495 (country of origin) | **2,168** (65%) |
| dishes with P17 **or** P495 | **3,192** (96%) |
| dishes with P2012 (cuisine) | **1,213** (37%) |
| dishes with an English Wikipedia article | **1,127** |
| dishes with **P495 + P279 + English Wikipedia article** | **901** |
| Wikipedia dish articles under the 191 national-cuisine categories | **~9,236** |
| Wikidata P279 subclasses in use (the family vocabulary's raw material) | **524 distinct** |

**Top dish countries by P495:** Indonesia 523 · Spain 82 · Nigeria 76 · Italy 40 · Japan 23 · Algeria 17 · Mexico 13 · France 12 · United States 11 · Taiwan 11 · Germany 10 · Brazil 10 · Senegal 10 · Belgium 9 · China 8.

**SPARQL endpoint performance (measured):** aggregate counts completed in **0.2–2.2 s**; a P31/P279* closure in 1.1 s. **A bare unindexed `COUNT { ?x ?p ?o }` timed out at 60 s** — always constrain on `wdt:P31`/`wdt:P279` first. **Polite-pool etiquette:** descriptive UA with contact info, one query at a time per client, stay under ~60 s runtime, avoid peak hours. Observed fast times mean the endpoint was **not under load**, so these are best-case.

**So the pipeline's realistic throughput is ~1,100–9,000 candidate dishes** depending on whether Wikipedia articles alone are enough or Wikidata's unlinked items are included too.

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

**Measured: the automated tier is already measurable.** The GUS-231 check (every published dish × 7 dimensions has exactly one state) is a **single query** and currently passes with `missing_both=0, has_both=0`. The pre-flight assertion block in the GUS-241 migration is a second automated tier.

**Not yet researched (I did not get to it):**
- Wikidata reference-quality distributions, and the existing Scholia / Wikidata quality-report dashboards
- Wikipedia "citation needed" dynamics at scale
- **a realistic human-review throughput (dishes/hour)** — I have no measured basis for a number and will not invent one
- the standard sampling-based QA pattern for large dataset curation (the ANSI/ASQ Z1.4 acceptance-sampling standard is the usual reference, but I have not read it against this case)

**What I can say from the work just done:** the automated tier is cheap and effective — the GUS-241 assertions caught a real bug that no amount of eyeballing would have, because the expected counts were written down inline. **The human tier should therefore be reserved for the cases where judgement is genuinely required: disputed dimensions, and a random sample for drift detection.**

**A specific risk the sample tier should watch:** a dish whose dimension is *assigned* but *wrong* passes every automated check. That is the failure mode a sample is for.

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

## Decisions I need from you

1. **ISO data: do you accept the Wikidata route (CC0, no licence issue) over vendoring the ISO files (LGPL package, no rights in the standard)?** My recommendation: **Wikidata.**
2. **~3,590 first-level regions is a lot of rows for a reference site.** Do you want all of them, or only the regions that a dish actually cites (seeded on demand, like cities)? The former is "global from day one"; the latter is much smaller. **This is the one place where "seed the whole world" and "practical" genuinely conflict.**
3. **Cuisine naming**: bare demonym (`Indonesian`, matching the 21 existing) or Wikipedia's form (`Indonesian cuisine`)? I recommend **bare demonym**.
4. **Traditions: how deep?** My estimate is 400–600 top-level. Do you want a bigger, more granular list (the full 1,265 Wikidata set, with sub-regional values) or the leaner curated 400–600?
5. **Family vocabulary: ~120–180 proposed.** Is that the right order of magnitude, or do you want it smaller (a deliberately tight ~60–80) so that every family is unambiguously useful?
6. **Human review throughput** — you asked for realistic numbers and I don't have measured ones. Do you want me to do a dedicated research pass (Wikidata quality reports, Wikipedia citation-needed statistics) before I propose the review protocol, or should I propose the protocol with the numbers left explicitly open?

**One thing I want to flag as a risk, not a question:** with ~9,236 Wikipedia dish articles and only ~1,000 reachable through Wikidata's typed pipeline, **the discovery pool and the classification effort are not the same size.** Roughly 8,000 Wikipedia dish articles have no Wikidata type. Classifying those means the agent proposes dimensions from the article's own text, which is exactly the `description-derived` provenance case — defensible, but it is inference, and the `status='provisional'` marker on the dimension row is where that honesty lives. **If we want provenance to mean something, `description-derived` should be the majority provenance, not a minority.**
