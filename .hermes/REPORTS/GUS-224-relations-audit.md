# GUS-224 — dish_relations audit (READ-ONLY)

**Task:** GUS-224 · **Database:** `gustale` · **Rows:** 192 · **Pairs:** 96 · **Date:** 2026-10-26

> Read-only audit. **No fixes applied.** Awaiting Alejandro's review.

## Summary

| relation_type | pairs | type-inconsistent | reversed | indeterminate | sourced | unsourced | likely_wrong |
|---|---|---|---|---|---|---|---|
| `family` | 52 | 0 | 0 | 52 | 0 | 52 | 0 |
| `regional-cousin` | 15 | 0 | 0 | 15 | 0 | 15 | 0 |
| `shared-method` | 14 | 0 | 0 | 14 | 0 | 14 | 0 |
| `similar-serving` | 7 | 0 | 0 | 7 | 0 | 7 | 0 |
| `ancestor` | 3 | 0 | 0 | 0 | 1 | 0 | 2 |
| `shared-ingredient` | 3 | 0 | 0 | 3 | 0 | 3 | 0 |
| `diaspora` | 2 | 0 | 1 | 0 | 1 | 0 | 1 |
| **TOTAL** | **96** | **0** | **1** | **91** | **2** | **91** | **3** |

## Per-pair detail

### `ancestor` — bacalhau-a-bras ↔ vindaloo

- **rows:** 2 · **relation_type of each row:** ['ancestor'] · **type-consistent:** True
- **stored from-row:** `bacalhau-a-bras -> vindaloo`
- **stored reverse-row:** `vindaloo -> bacalhau-a-bras`
- **reason:** Portuguese carne de vinha d'alhos is the direct ancestor of vindaloo
- **reason subject:** `Portuguese carne de vinha d'alhos`
- **direction vs reason:** OK
- **factual status:** **likely_wrong**
- **note:** The vindaloo<-carne de vinha d'alhos derivation is well sourced (Wikipedia Vindaloo: 'Vindaloo's name derives from the famous Portuguese Goan dish carne de vinha d'alhos'; Carne de vinha d'alhos: 'vindaloo is an Indian interpretation of carne de vinha d'alhos'). BUT carne de vinha d'alhos is PORK in garlic wine vinegar - it is NOT bacalhau a bras (salt cod). The relation is wired to the wrong source dish; the reason names the correct one.
- **dish sources:** {'bacalhau-a-bras': 1, 'vindaloo': 1} · **strength:** [5] · **created:** ['2026-06-25']

### `ancestor` — biryani-hyderabadi ↔ jollof-rice

- **rows:** 2 · **relation_type of each row:** ['ancestor'] · **type-consistent:** True
- **stored from-row:** `biryani-hyderabadi -> jollof-rice`
- **stored reverse-row:** `jollof-rice -> biryani-hyderabadi`
- **reason:** Biryani's Persian-layered rice tradition is the documented ancestor of jollof
- **reason subject:** `Biryani`
- **direction vs reason:** OK
- **factual status:** **likely_wrong**
- **note:** Not corroborated. Wikipedia Jollof rice attributes jollof's origin to the Wolof/Jolof Empire and thieboudienne in Senegal (McCann, Osseo-Asare, Dufumier). The article presents no biryani->jollof derivation; 'biryani's Persian-layered rice tradition' is not sourced there.
- **dish sources:** {'biryani-hyderabadi': 1, 'jollof-rice': 1} · **strength:** [4] · **created:** ['2026-06-25']

### `ancestor` — shawarma ↔ tacos-al-pastor

- **rows:** 2 · **relation_type of each row:** ['ancestor'] · **type-consistent:** True
- **stored from-row:** `shawarma -> tacos-al-pastor`
- **stored reverse-row:** `tacos-al-pastor -> shawarma`
- **reason:** Al pastor derives from Levantine shawarma, adapted in Mexico with achiote and a vertical spit
- **reason subject:** `Levantine shawarma`
- **direction vs reason:** OK
- **factual status:** **sourced**
- **note:** Corroborated. Wikipedia Al pastor: 'The method of preparing and cooking al pastor is based on the lamb shawarma brought by Lebanese immigrants to the region' and 'The Levantine version, called shawarma, was brought to Mexico in the late 19th and early 20th centuries by a wave of Lebanese immigrants'.
- **dish sources:** {'shawarma': 1, 'tacos-al-pastor': 1} · **strength:** [4] · **created:** ['2026-10-26']

### `diaspora` — hamburger-american ↔ shawarma

- **rows:** 2 · **relation_type of each row:** ['diaspora'] · **type-consistent:** True
- **stored from-row:** `hamburger-american -> shawarma`
- **stored reverse-row:** `shawarma -> hamburger-american`
- **reason:** Doner kebab's diaspora to Berlin inspired the hamburger-among-immigrants
- **reason subject:** `Doner kebab`
- **direction vs reason:** **REVERSED**
- **factual status:** **likely_wrong**
- **note:** The CLAIM is correct but the WIRING is wrong. Wikipedia Döner kebab: 'The modern sandwich variant of doner kebab originated and was popularized in 1970s West Berlin by Turkish immigrants.' The reason describes doner-kebab -> hamburger-american, but the relation connects shawarma -> hamburger-american. doner-kebab exists as a dish and has ZERO relations.
- **dish sources:** {'hamburger-american': 1, 'shawarma': 1} · **strength:** [2] · **created:** ['2026-06-25']

### `diaspora` — tonkatsu ↔ wiener-schnitzel

- **rows:** 2 · **relation_type of each row:** ['diaspora'] · **type-consistent:** True
- **stored from-row:** `tonkatsu -> wiener-schnitzel`
- **stored reverse-row:** `wiener-schnitzel -> tonkatsu`
- **reason:** Tonkatsu is the Japanese adaptation of European breaded cutlets
- **reason subject:** `Tonkatsu`
- **direction vs reason:** OK
- **factual status:** **sourced**
- **note:** Corroborated. Wikipedia Tonkatsu: 'Tonkatsu originated in Japan during the Meiji era... derived from a French dish known as cote de veau'; the pork version was created in 1899 at Rengatei in Tokyo; katsuretsu is a loanword from French cotelette.
- **dish sources:** {'tonkatsu': 1, 'wiener-schnitzel': 1} · **strength:** [4] · **created:** ['2026-07-25']

### `family` — acaraje ↔ feijoada

- **rows:** 2 · **relation_type of each row:** ['family'] · **type-consistent:** True
- **stored from-row:** `acaraje -> feijoada`
- **stored reverse-row:** `feijoada -> acaraje`
- **reason:** Both Brazilian national dishes with deep Afro-Brazilian roots
- **reason subject:** `None`
- **direction vs reason:** indeterminate
- **factual status:** **unsourced**
- **note:** no relation-level source exists - dish_relations has no source column and there are 0 relation-level citations
- **dish sources:** {'acaraje': 1, 'feijoada': 1} · **strength:** [5] · **created:** ['2026-06-25']

### `family` — acaraje ↔ vada

- **rows:** 2 · **relation_type of each row:** ['family'] · **type-consistent:** True
- **stored from-row:** `acaraje -> vada`
- **stored reverse-row:** `vada -> acaraje`
- **reason:** Both deep-fried legume fritters of Afro-Brazilian and South Indian cuisines
- **reason subject:** `None`
- **direction vs reason:** indeterminate
- **factual status:** **unsourced**
- **note:** no relation-level source exists - dish_relations has no source column and there are 0 relation-level citations
- **dish sources:** {'acaraje': 1, 'vada': 1} · **strength:** [4] · **created:** ['2026-07-25']

### `family` — baba-ganoush ↔ hummus

- **rows:** 2 · **relation_type of each row:** ['family'] · **type-consistent:** True
- **stored from-row:** `baba-ganoush -> hummus`
- **stored reverse-row:** `hummus -> baba-ganoush`
- **reason:** Both Levantine dips at the heart of the meze table
- **reason subject:** `None`
- **direction vs reason:** indeterminate
- **factual status:** **unsourced**
- **note:** no relation-level source exists - dish_relations has no source column and there are 0 relation-level citations
- **dish sources:** {'baba-ganoush': 1, 'hummus': 1} · **strength:** [5] · **created:** ['2026-07-25']

### `family` — babi-guling ↔ lechon

- **rows:** 2 · **relation_type of each row:** ['family'] · **type-consistent:** True
- **stored from-row:** `babi-guling -> lechon`
- **stored reverse-row:** `lechon -> babi-guling`
- **reason:** Both spit-roasted whole pigs of Southeast Asia
- **reason subject:** `None`
- **direction vs reason:** indeterminate
- **factual status:** **unsourced**
- **note:** no relation-level source exists - dish_relations has no source column and there are 0 relation-level citations
- **dish sources:** {'babi-guling': 1, 'lechon': 1} · **strength:** [5] · **created:** ['2026-07-25']

### `family` — bacalhau-a-bras ↔ ikan-bakar

- **rows:** 2 · **relation_type of each row:** ['family'] · **type-consistent:** True
- **stored from-row:** `bacalhau-a-bras -> ikan-bakar`
- **stored reverse-row:** `ikan-bakar -> bacalhau-a-bras`
- **reason:** Both salt-cured or grilled fish dishes of maritime cuisines
- **reason subject:** `None`
- **direction vs reason:** indeterminate
- **factual status:** **unsourced**
- **note:** no relation-level source exists - dish_relations has no source column and there are 0 relation-level citations
- **dish sources:** {'bacalhau-a-bras': 1, 'ikan-bakar': 1} · **strength:** [3] · **created:** ['2026-07-25']

### `family` — bacalhau-a-bras ↔ paella-valenciana

- **rows:** 2 · **relation_type of each row:** ['family'] · **type-consistent:** True
- **stored from-row:** `bacalhau-a-bras -> paella-valenciana`
- **stored reverse-row:** `paella-valenciana -> bacalhau-a-bras`
- **reason:** Both Iberian dishes built around salt cod or seafood on the Iberian peninsula
- **reason subject:** `None`
- **direction vs reason:** indeterminate
- **factual status:** **unsourced**
- **note:** no relation-level source exists - dish_relations has no source column and there are 0 relation-level citations
- **dish sources:** {'bacalhau-a-bras': 1, 'paella-valenciana': 1} · **strength:** [4] · **created:** ['2026-06-25']

### `family` — banh-mi ↔ hamburger-american

- **rows:** 2 · **relation_type of each row:** ['family'] · **type-consistent:** True
- **stored from-row:** `banh-mi -> hamburger-american`
- **stored reverse-row:** `hamburger-american -> banh-mi`
- **reason:** Both sandwich form, banh-mi is the baguette cousin of the bun
- **reason subject:** `None`
- **direction vs reason:** indeterminate
- **factual status:** **unsourced**
- **note:** no relation-level source exists - dish_relations has no source column and there are 0 relation-level citations
- **dish sources:** {'banh-mi': 1, 'hamburger-american': 1} · **strength:** [3] · **created:** ['2026-06-25']

### `family` — bibimbap ↔ japchae

- **rows:** 2 · **relation_type of each row:** ['family'] · **type-consistent:** True
- **stored from-row:** `bibimbap -> japchae`
- **stored reverse-row:** `japchae -> bibimbap`
- **reason:** Both Korean dishes combining noodles/rice with vegetables and sesame oil
- **reason subject:** `None`
- **direction vs reason:** indeterminate
- **factual status:** **unsourced**
- **note:** no relation-level source exists - dish_relations has no source column and there are 0 relation-level citations
- **dish sources:** {'bibimbap': 1, 'japchae': 1} · **strength:** [4] · **created:** ['2026-06-25']

### `family` — biryani-hyderabadi ↔ chicken-tikka-masala

- **rows:** 2 · **relation_type of each row:** ['family'] · **type-consistent:** True
- **stored from-row:** `biryani-hyderabadi -> chicken-tikka-masala`
- **stored reverse-row:** `chicken-tikka-masala -> biryani-hyderabadi`
- **reason:** Both pillars of restaurant-style South Asian cuisine
- **reason subject:** `None`
- **direction vs reason:** indeterminate
- **factual status:** **unsourced**
- **note:** no relation-level source exists - dish_relations has no source column and there are 0 relation-level citations
- **dish sources:** {'biryani-hyderabadi': 1, 'chicken-tikka-masala': 1} · **strength:** [4] · **created:** ['2026-06-25']

### `family` — biryani-hyderabadi ↔ dosa

- **rows:** 2 · **relation_type of each row:** ['family'] · **type-consistent:** True
- **stored from-row:** `biryani-hyderabadi -> dosa`
- **stored reverse-row:** `dosa -> biryani-hyderabadi`
- **reason:** Both South Indian classics, dosa for breakfast and biryani for celebration
- **reason subject:** `None`
- **direction vs reason:** indeterminate
- **factual status:** **unsourced**
- **note:** no relation-level source exists - dish_relations has no source column and there are 0 relation-level citations
- **dish sources:** {'biryani-hyderabadi': 1, 'dosa': 1} · **strength:** [4] · **created:** ['2026-06-25']

### `family` — biryani-hyderabadi ↔ nasi-goreng

- **rows:** 2 · **relation_type of each row:** ['family'] · **type-consistent:** True
- **stored from-row:** `biryani-hyderabadi -> nasi-goreng`
- **stored reverse-row:** `nasi-goreng -> biryani-hyderabadi`
- **reason:** Both layered or fried rice dishes of Muslim-majority regions
- **reason subject:** `None`
- **direction vs reason:** indeterminate
- **factual status:** **unsourced**
- **note:** no relation-level source exists - dish_relations has no source column and there are 0 relation-level citations
- **dish sources:** {'biryani-hyderabadi': 1, 'nasi-goreng': 1} · **strength:** [3] · **created:** ['2026-06-25']

### `family` — biryani-hyderabadi ↔ vindaloo

- **rows:** 2 · **relation_type of each row:** ['family'] · **type-consistent:** True
- **stored from-row:** `biryani-hyderabadi -> vindaloo`
- **stored reverse-row:** `vindaloo -> biryani-hyderabadi`
- **reason:** Both Goan-Persian legacies in Indian cooking
- **reason subject:** `None`
- **direction vs reason:** indeterminate
- **factual status:** **unsourced**
- **note:** no relation-level source exists - dish_relations has no source column and there are 0 relation-level citations
- **dish sources:** {'biryani-hyderabadi': 1, 'vindaloo': 1} · **strength:** [3] · **created:** ['2026-06-25']

### `family` — boeuf-bourguignon ↔ goulash-hungarian

- **rows:** 2 · **relation_type of each row:** ['family'] · **type-consistent:** True
- **stored from-row:** `boeuf-bourguignon -> goulash-hungarian`
- **stored reverse-row:** `goulash-hungarian -> boeuf-bourguignon`
- **reason:** Both beef braises of continental Europe with red wine or paprika
- **reason subject:** `None`
- **direction vs reason:** indeterminate
- **factual status:** **unsourced**
- **note:** no relation-level source exists - dish_relations has no source column and there are 0 relation-level citations
- **dish sources:** {'boeuf-bourguignon': 1, 'goulash-hungarian': 1} · **strength:** [4] · **created:** ['2026-06-25']

### `family` — borscht ↔ goulash-hungarian

- **rows:** 2 · **relation_type of each row:** ['family'] · **type-consistent:** True
- **stored from-row:** `borscht -> goulash-hungarian`
- **stored reverse-row:** `goulash-hungarian -> borscht`
- **reason:** Both Central/Eastern European paprika-and-onion comfort dishes
- **reason subject:** `None`
- **direction vs reason:** indeterminate
- **factual status:** **unsourced**
- **note:** no relation-level source exists - dish_relations has no source column and there are 0 relation-level citations
- **dish sources:** {'borscht': 1, 'goulash-hungarian': 1} · **strength:** [4] · **created:** ['2026-06-25']

### `family` — borscht ↔ rawon

- **rows:** 2 · **relation_type of each row:** ['family'] · **type-consistent:** True
- **stored from-row:** `borscht -> rawon`
- **stored reverse-row:** `rawon -> borscht`
- **reason:** Both deep-coloured national soups with deep historical roots
- **reason subject:** `None`
- **direction vs reason:** indeterminate
- **factual status:** **unsourced**
- **note:** no relation-level source exists - dish_relations has no source column and there are 0 relation-level citations
- **dish sources:** {'borscht': 1, 'rawon': 1} · **strength:** [3] · **created:** ['2026-06-25']

### `family` — bulgur ↔ couscous

- **rows:** 2 · **relation_type of each row:** ['family'] · **type-consistent:** True
- **stored from-row:** `bulgur -> couscous`
- **stored reverse-row:** `couscous -> bulgur`
- **reason:** Both processed-wheat staples of the Eastern Mediterranean
- **reason subject:** `None`
- **direction vs reason:** indeterminate
- **factual status:** **unsourced**
- **note:** no relation-level source exists - dish_relations has no source column and there are 0 relation-level citations
- **dish sources:** {'bulgur': 1, 'couscous': 1} · **strength:** [4] · **created:** ['2026-07-25']

### `family` — cacio-e-pepe ↔ pizza-margherita

- **rows:** 2 · **relation_type of each row:** ['family'] · **type-consistent:** True
- **stored from-row:** `cacio-e-pepe -> pizza-margherita`
- **stored reverse-row:** `pizza-margherita -> cacio-e-pepe`
- **reason:** Both pillars of Roman-Neapolitan home cooking
- **reason subject:** `None`
- **direction vs reason:** indeterminate
- **factual status:** **unsourced**
- **note:** no relation-level source exists - dish_relations has no source column and there are 0 relation-level citations
- **dish sources:** {'cacio-e-pepe': 1, 'pizza-margherita': 1} · **strength:** [4] · **created:** ['2026-06-25']

### `family` — congee ↔ risotto-alla-milanese

- **rows:** 2 · **relation_type of each row:** ['family'] · **type-consistent:** True
- **stored from-row:** `congee -> risotto-alla-milanese`
- **stored reverse-row:** `risotto-alla-milanese -> congee`
- **reason:** Both slow-stirred rice dishes that release starch for a creamy texture
- **reason subject:** `None`
- **direction vs reason:** indeterminate
- **factual status:** **unsourced**
- **note:** no relation-level source exists - dish_relations has no source column and there are 0 relation-level citations
- **dish sources:** {'congee': 1, 'risotto-alla-milanese': 1} · **strength:** [4] · **created:** ['2026-06-25']

### `family` — congee ↔ soto-ayam

- **rows:** 2 · **relation_type of each row:** ['family'] · **type-consistent:** True
- **stored from-row:** `congee -> soto-ayam`
- **stored reverse-row:** `soto-ayam -> congee`
- **reason:** Both thin-broth rice-based dishes, Asian rice porridge family
- **reason subject:** `None`
- **direction vs reason:** indeterminate
- **factual status:** **unsourced**
- **note:** no relation-level source exists - dish_relations has no source column and there are 0 relation-level citations
- **dish sources:** {'congee': 1, 'soto-ayam': 1} · **strength:** [4] · **created:** ['2026-06-25']

### `family` — couscous ↔ tagine-moroccan

- **rows:** 2 · **relation_type of each row:** ['family'] · **type-consistent:** True
- **stored from-row:** `couscous -> tagine-moroccan`
- **stored reverse-row:** `tagine-moroccan -> couscous`
- **reason:** Both Maghrebi staples, served together in Morocco and Tunisia
- **reason subject:** `None`
- **direction vs reason:** indeterminate
- **factual status:** **unsourced**
- **note:** no relation-level source exists - dish_relations has no source column and there are 0 relation-level citations
- **dish sources:** {'couscous': 1, 'tagine-moroccan': 1} · **strength:** [5] · **created:** ['2026-06-25']

### `family` — dosa ↔ idli

- **rows:** 2 · **relation_type of each row:** ['family'] · **type-consistent:** True
- **stored from-row:** `dosa -> idli`
- **stored reverse-row:** `idli -> dosa`
- **reason:** Both share a fermented rice-and-lentil batter
- **reason subject:** `None`
- **direction vs reason:** indeterminate
- **factual status:** **unsourced**
- **note:** no relation-level source exists - dish_relations has no source column and there are 0 relation-level citations
- **dish sources:** {'dosa': 1, 'idli': 1} · **strength:** [5] · **created:** ['2026-07-25']

### `family` — dosa ↔ vindaloo

- **rows:** 2 · **relation_type of each row:** ['family'] · **type-consistent:** True
- **stored from-row:** `dosa -> vindaloo`
- **stored reverse-row:** `vindaloo -> dosa`
- **reason:** Both coastal Indian preparations of the Konkan-Goan sphere
- **reason subject:** `None`
- **direction vs reason:** indeterminate
- **factual status:** **unsourced**
- **note:** no relation-level source exists - dish_relations has no source column and there are 0 relation-level citations
- **dish sources:** {'dosa': 1, 'vindaloo': 1} · **strength:** [3] · **created:** ['2026-06-25']

### `family` — empanada ↔ samosa

- **rows:** 2 · **relation_type of each row:** ['family'] · **type-consistent:** True
- **stored from-row:** `empanada -> samosa`
- **stored reverse-row:** `samosa -> empanada`
- **reason:** Both filled pastry turnovers, Iberian via colonial trade to South Asia
- **reason subject:** `None`
- **direction vs reason:** indeterminate
- **factual status:** **unsourced**
- **note:** no relation-level source exists - dish_relations has no source column and there are 0 relation-level citations
- **dish sources:** {'empanada': 1, 'samosa': 1} · **strength:** [3] · **created:** ['2026-07-25']

### `family` — empanada ↔ tamales

- **rows:** 2 · **relation_type of each row:** ['family'] · **type-consistent:** True
- **stored from-row:** `empanada -> tamales`
- **stored reverse-row:** `tamales -> empanada`
- **reason:** Both filled-dough parcels of the Latin American tradition
- **reason subject:** `None`
- **direction vs reason:** indeterminate
- **factual status:** **unsourced**
- **note:** no relation-level source exists - dish_relations has no source column and there are 0 relation-level citations
- **dish sources:** {'empanada': 1, 'tamales': 1} · **strength:** [4] · **created:** ['2026-06-25']

### `family` — falafel ↔ hummus

- **rows:** 2 · **relation_type of each row:** ['family'] · **type-consistent:** True
- **stored from-row:** `falafel -> hummus`
- **stored reverse-row:** `hummus -> falafel`
- **reason:** The hummus-falafel duo defines modern Middle Eastern street food
- **reason subject:** `None`
- **direction vs reason:** indeterminate
- **factual status:** **unsourced**
- **note:** no relation-level source exists - dish_relations has no source column and there are 0 relation-level citations
- **dish sources:** {'falafel': 1, 'hummus': 1} · **strength:** [5] · **created:** ['2026-06-25']

### `family` — falafel ↔ shakshuka

- **rows:** 2 · **relation_type of each row:** ['family'] · **type-consistent:** True
- **stored from-row:** `falafel -> shakshuka`
- **stored reverse-row:** `shakshuka -> falafel`
- **reason:** Both core Levantine street foods, often eaten in the same meal
- **reason subject:** `None`
- **direction vs reason:** indeterminate
- **factual status:** **unsourced**
- **note:** no relation-level source exists - dish_relations has no source column and there are 0 relation-level citations
- **dish sources:** {'falafel': 1, 'shakshuka': 1} · **strength:** [4] · **created:** ['2026-06-25']

### `family` — focaccia ↔ pizza-margherita

- **rows:** 2 · **relation_type of each row:** ['family'] · **type-consistent:** True
- **stored from-row:** `focaccia -> pizza-margherita`
- **stored reverse-row:** `pizza-margherita -> focaccia`
- **reason:** Both flat Italian breads, pizza adds tomato topping
- **reason subject:** `None`
- **direction vs reason:** indeterminate
- **factual status:** **unsourced**
- **note:** no relation-level source exists - dish_relations has no source column and there are 0 relation-level citations
- **dish sources:** {'focaccia': 1, 'pizza-margherita': 1} · **strength:** [4] · **created:** ['2026-07-25']

### `family` — goulash-hungarian ↔ rendang

- **rows:** 2 · **relation_type of each row:** ['family'] · **type-consistent:** True
- **stored from-row:** `goulash-hungarian -> rendang`
- **stored reverse-row:** `rendang -> goulash-hungarian`
- **reason:** Both paprika-and-onion spiced meat stews
- **reason subject:** `None`
- **direction vs reason:** indeterminate
- **factual status:** **unsourced**
- **note:** no relation-level source exists - dish_relations has no source column and there are 0 relation-level citations
- **dish sources:** {'goulash-hungarian': 1, 'rendang': 1} · **strength:** [4] · **created:** ['2026-06-25']

### `family` — humita ↔ tamales

- **rows:** 2 · **relation_type of each row:** ['family'] · **type-consistent:** True
- **stored from-row:** `humita -> tamales`
- **stored reverse-row:** `tamales -> humita`
- **reason:** Both Mesoamerican corn-based parcels, tamales in dough, humitas looser
- **reason subject:** `None`
- **direction vs reason:** indeterminate
- **factual status:** **unsourced**
- **note:** no relation-level source exists - dish_relations has no source column and there are 0 relation-level citations
- **dish sources:** {'humita': 1, 'tamales': 1} · **strength:** [4] · **created:** ['2026-07-25']

### `family` — hummus ↔ mansaf

- **rows:** 2 · **relation_type of each row:** ['family'] · **type-consistent:** True
- **stored from-row:** `hummus -> mansaf`
- **stored reverse-row:** `mansaf -> hummus`
- **reason:** Both Levantine cultural icons, central to hospitality
- **reason subject:** `None`
- **direction vs reason:** indeterminate
- **factual status:** **unsourced**
- **note:** no relation-level source exists - dish_relations has no source column and there are 0 relation-level citations
- **dish sources:** {'hummus': 1, 'mansaf': 1} · **strength:** [3] · **created:** ['2026-06-25']

### `family` — hummus ↔ shakshuka

- **rows:** 2 · **relation_type of each row:** ['family'] · **type-consistent:** True
- **stored from-row:** `hummus -> shakshuka`
- **stored reverse-row:** `shakshuka -> hummus`
- **reason:** Both Levantine brunch staples, served together across the Eastern Mediterranean
- **reason subject:** `None`
- **direction vs reason:** indeterminate
- **factual status:** **unsourced**
- **note:** no relation-level source exists - dish_relations has no source column and there are 0 relation-level citations
- **dish sources:** {'hummus': 1, 'shakshuka': 1} · **strength:** [4] · **created:** ['2026-06-25']

### `family` — jiaozi ↔ momo

- **rows:** 2 · **relation_type of each row:** ['family'] · **type-consistent:** True
- **stored from-row:** `jiaozi -> momo`
- **stored reverse-row:** `momo -> jiaozi`
- **reason:** Same filled-dough form, traded along the Silk Road
- **reason subject:** `None`
- **direction vs reason:** indeterminate
- **factual status:** **unsourced**
- **note:** no relation-level source exists - dish_relations has no source column and there are 0 relation-level citations
- **dish sources:** {'jiaozi': 1, 'momo': 1} · **strength:** [5] · **created:** ['2026-06-25']

### `family` — jollof-rice ↔ paella-valenciana

- **rows:** 2 · **relation_type of each row:** ['family'] · **type-consistent:** True
- **stored from-row:** `jollof-rice -> paella-valenciana`
- **stored reverse-row:** `paella-valenciana -> jollof-rice`
- **reason:** Both saffron-tinted rice dishes of the Atlantic world, paella vs jollof
- **reason subject:** `None`
- **direction vs reason:** indeterminate
- **factual status:** **unsourced**
- **note:** no relation-level source exists - dish_relations has no source column and there are 0 relation-level citations
- **dish sources:** {'jollof-rice': 1, 'paella-valenciana': 1} · **strength:** [3] · **created:** ['2026-06-25']

### `family` — khao-soi ↔ pho-vietnamese

- **rows:** 2 · **relation_type of each row:** ['family'] · **type-consistent:** True
- **stored from-row:** `khao-soi -> pho-vietnamese`
- **stored reverse-row:** `pho-vietnamese -> khao-soi`
- **reason:** Both Southeast/East Asian noodle soups in the broth-and-protein family
- **reason subject:** `None`
- **direction vs reason:** indeterminate
- **factual status:** **unsourced**
- **note:** no relation-level source exists - dish_relations has no source column and there are 0 relation-level citations
- **dish sources:** {'khao-soi': 1, 'pho-vietnamese': 1} · **strength:** [5] · **created:** ['2026-06-25']

### `family` — khao-soi ↔ ramen-japanese

- **rows:** 2 · **relation_type of each row:** ['family'] · **type-consistent:** True
- **stored from-row:** `khao-soi -> ramen-japanese`
- **stored reverse-row:** `ramen-japanese -> khao-soi`
- **reason:** Both noodle soups with a clear broth and protein topping
- **reason subject:** `None`
- **direction vs reason:** indeterminate
- **factual status:** **unsourced**
- **note:** no relation-level source exists - dish_relations has no source column and there are 0 relation-level citations
- **dish sources:** {'khao-soi': 1, 'ramen-japanese': 1} · **strength:** [3] · **created:** ['2026-06-25']

### `family` — khao-soi ↔ tom-yum

- **rows:** 2 · **relation_type of each row:** ['family'] · **type-consistent:** True
- **stored from-row:** `khao-soi -> tom-yum`
- **stored reverse-row:** `tom-yum -> khao-soi`
- **reason:** Both Thai soups with a lemongrass-galangal base, khao-soi adds coconut
- **reason subject:** `None`
- **direction vs reason:** indeterminate
- **factual status:** **unsourced**
- **note:** no relation-level source exists - dish_relations has no source column and there are 0 relation-level citations
- **dish sources:** {'khao-soi': 1, 'tom-yum': 1} · **strength:** [4] · **created:** ['2026-06-25']

### `family` — kofta ↔ sate-lilit

- **rows:** 2 · **relation_type of each row:** ['family'] · **type-consistent:** True
- **stored from-row:** `kofta -> sate-lilit`
- **stored reverse-row:** `sate-lilit -> kofta`
- **reason:** Both minced-meat preparations formed around a skewer or spit
- **reason subject:** `None`
- **direction vs reason:** indeterminate
- **factual status:** **unsourced**
- **note:** no relation-level source exists - dish_relations has no source column and there are 0 relation-level citations
- **dish sources:** {'kofta': 1, 'sate-lilit': 1} · **strength:** [4] · **created:** ['2026-07-25']

### `family` — laksa ↔ tom-yum

- **rows:** 2 · **relation_type of each row:** ['family'] · **type-consistent:** True
- **stored from-row:** `laksa -> tom-yum`
- **stored reverse-row:** `tom-yum -> laksa`
- **reason:** Both tom-yum-derived broths, Thai vs Peranakan
- **reason subject:** `None`
- **direction vs reason:** indeterminate
- **factual status:** **unsourced**
- **note:** no relation-level source exists - dish_relations has no source column and there are 0 relation-level citations
- **dish sources:** {'laksa': 1, 'tom-yum': 1} · **strength:** [4] · **created:** ['2026-06-25']

### `family` — mansaf ↔ shawarma

- **rows:** 2 · **relation_type of each row:** ['family'] · **type-consistent:** True
- **stored from-row:** `mansaf -> shawarma`
- **stored reverse-row:** `shawarma -> mansaf`
- **reason:** Both cornerstone dishes of Levantine street and ceremony
- **reason subject:** `None`
- **direction vs reason:** indeterminate
- **factual status:** **unsourced**
- **note:** no relation-level source exists - dish_relations has no source column and there are 0 relation-level citations
- **dish sources:** {'mansaf': 1, 'shawarma': 1} · **strength:** [3] · **created:** ['2026-06-25']

### `family` — menemen ↔ shakshuka

- **rows:** 2 · **relation_type of each row:** ['family'] · **type-consistent:** True
- **stored from-row:** `menemen -> shakshuka`
- **stored reverse-row:** `shakshuka -> menemen`
- **reason:** Both egg-in-tomato-pepper dishes of the Eastern Mediterranean
- **reason subject:** `None`
- **direction vs reason:** indeterminate
- **factual status:** **unsourced**
- **note:** no relation-level source exists - dish_relations has no source column and there are 0 relation-level citations
- **dish sources:** {'menemen': 1, 'shakshuka': 1} · **strength:** [5] · **created:** ['2026-07-25']

### `family` — momo ↔ pierogi

- **rows:** 2 · **relation_type of each row:** ['family'] · **type-consistent:** True
- **stored from-row:** `momo -> pierogi`
- **stored reverse-row:** `pierogi -> momo`
- **reason:** Both half-moon dumplings, related through Central Asian trade routes
- **reason subject:** `None`
- **direction vs reason:** indeterminate
- **factual status:** **unsourced**
- **note:** no relation-level source exists - dish_relations has no source column and there are 0 relation-level citations
- **dish sources:** {'momo': 1, 'pierogi': 1} · **strength:** [4] · **created:** ['2026-06-25']

### `family` — momo ↔ samosa

- **rows:** 2 · **relation_type of each row:** ['family'] · **type-consistent:** True
- **stored from-row:** `momo -> samosa`
- **stored reverse-row:** `samosa -> momo`
- **reason:** Both hand-held filled dough pockets of the South Asian / Himalayan rim
- **reason subject:** `None`
- **direction vs reason:** indeterminate
- **factual status:** **unsourced**
- **note:** no relation-level source exists - dish_relations has no source column and there are 0 relation-level citations
- **dish sources:** {'momo': 1, 'samosa': 1} · **strength:** [4] · **created:** ['2026-07-25']

### `family` — nasi-campur-bali ↔ nasi-goreng

- **rows:** 2 · **relation_type of each row:** ['family'] · **type-consistent:** True
- **stored from-row:** `nasi-campur-bali -> nasi-goreng`
- **stored reverse-row:** `nasi-goreng -> nasi-campur-bali`
- **reason:** Both Indonesian rice plates, nasi goreng is a single-dish version
- **reason subject:** `None`
- **direction vs reason:** indeterminate
- **factual status:** **unsourced**
- **note:** no relation-level source exists - dish_relations has no source column and there are 0 relation-level citations
- **dish sources:** {'nasi-campur-bali': 1, 'nasi-goreng': 1} · **strength:** [5] · **created:** ['2026-06-25']

### `family` — nasi-campur-bali ↔ rendang

- **rows:** 2 · **relation_type of each row:** ['family'] · **type-consistent:** True
- **stored from-row:** `nasi-campur-bali -> rendang`
- **stored reverse-row:** `rendang -> nasi-campur-bali`
- **reason:** Rendang is one of the classic components of nasi campur
- **reason subject:** `None`
- **direction vs reason:** indeterminate
- **factual status:** **unsourced**
- **note:** no relation-level source exists - dish_relations has no source column and there are 0 relation-level citations
- **dish sources:** {'nasi-campur-bali': 1, 'rendang': 1} · **strength:** [5] · **created:** ['2026-06-25']

### `family` — pad-thai ↔ tom-yum

- **rows:** 2 · **relation_type of each row:** ['family'] · **type-consistent:** True
- **stored from-row:** `pad-thai -> tom-yum`
- **stored reverse-row:** `tom-yum -> pad-thai`
- **reason:** Both quintessential Thai dishes built on rempah
- **reason subject:** `None`
- **direction vs reason:** indeterminate
- **factual status:** **unsourced**
- **note:** no relation-level source exists - dish_relations has no source column and there are 0 relation-level citations
- **dish sources:** {'pad-thai': 1, 'tom-yum': 1} · **strength:** [5] · **created:** ['2026-06-25']

### `family` — pierogi ↔ tamales

- **rows:** 2 · **relation_type of each row:** ['family'] · **type-consistent:** True
- **stored from-row:** `pierogi -> tamales`
- **stored reverse-row:** `tamales -> pierogi`
- **reason:** Both steamed/boiled dough parcels with a savory filling, trans-Atlantic cousins
- **reason subject:** `None`
- **direction vs reason:** indeterminate
- **factual status:** **unsourced**
- **note:** no relation-level source exists - dish_relations has no source column and there are 0 relation-level citations
- **dish sources:** {'pierogi': 1, 'tamales': 1} · **strength:** [3] · **created:** ['2026-06-25']

### `family` — ramen-japanese ↔ udon

- **rows:** 2 · **relation_type of each row:** ['family'] · **type-consistent:** True
- **stored from-row:** `ramen-japanese -> udon`
- **stored reverse-row:** `udon -> ramen-japanese`
- **reason:** Both Japanese wheat-noodle dishes, ramen thinner and richer
- **reason subject:** `None`
- **direction vs reason:** indeterminate
- **factual status:** **unsourced**
- **note:** no relation-level source exists - dish_relations has no source column and there are 0 relation-level citations
- **dish sources:** {'ramen-japanese': 1, 'udon': 1} · **strength:** [5] · **created:** ['2026-06-25']

### `family` — rawon ↔ rendang

- **rows:** 2 · **relation_type of each row:** ['family'] · **type-consistent:** True
- **stored from-row:** `rawon -> rendang`
- **stored reverse-row:** `rendang -> rawon`
- **reason:** Both Indonesian spice-paste dishes of the Javanese sphere
- **reason subject:** `None`
- **direction vs reason:** indeterminate
- **factual status:** **unsourced**
- **note:** no relation-level source exists - dish_relations has no source column and there are 0 relation-level citations
- **dish sources:** {'rawon': 1, 'rendang': 1} · **strength:** [4] · **created:** ['2026-06-25']

### `family` — rawon ↔ soto-ayam

- **rows:** 2 · **relation_type of each row:** ['family'] · **type-consistent:** True
- **stored from-row:** `rawon -> soto-ayam`
- **stored reverse-row:** `soto-ayam -> rawon`
- **reason:** Both Indonesian soups built on a turmeric-tinged spice paste
- **reason subject:** `None`
- **direction vs reason:** indeterminate
- **factual status:** **unsourced**
- **note:** no relation-level source exists - dish_relations has no source column and there are 0 relation-level citations
- **dish sources:** {'rawon': 1, 'soto-ayam': 1} · **strength:** [4] · **created:** ['2026-06-25']

### `family` — rendang ↔ sate-lilit

- **rows:** 2 · **relation_type of each row:** ['family'] · **type-consistent:** True
- **stored from-row:** `rendang -> sate-lilit`
- **stored reverse-row:** `sate-lilit -> rendang`
- **reason:** Both use a coconut-milk-spice paste marinade on meat
- **reason subject:** `None`
- **direction vs reason:** indeterminate
- **factual status:** **unsourced**
- **note:** no relation-level source exists - dish_relations has no source column and there are 0 relation-level citations
- **dish sources:** {'rendang': 1, 'sate-lilit': 1} · **strength:** [4] · **created:** ['2026-06-25']

### `family` — sate-lilit ↔ shawarma

- **rows:** 2 · **relation_type of each row:** ['family'] · **type-consistent:** True
- **stored from-row:** `sate-lilit -> shawarma`
- **stored reverse-row:** `shawarma -> sate-lilit`
- **reason:** Both skewered grilled meats of the spice-trade corridor
- **reason subject:** `None`
- **direction vs reason:** indeterminate
- **factual status:** **unsourced**
- **note:** no relation-level source exists - dish_relations has no source column and there are 0 relation-level citations
- **dish sources:** {'sate-lilit': 1, 'shawarma': 1} · **strength:** [4] · **created:** ['2026-06-25']

### `family` — soba ↔ udon

- **rows:** 2 · **relation_type of each row:** ['family'] · **type-consistent:** True
- **stored from-row:** `soba -> udon`
- **stored reverse-row:** `udon -> soba`
- **reason:** Both iconic Japanese noodle families, udon wheat vs soba buckwheat
- **reason subject:** `None`
- **direction vs reason:** indeterminate
- **factual status:** **unsourced**
- **note:** no relation-level source exists - dish_relations has no source column and there are 0 relation-level citations
- **dish sources:** {'soba': 1, 'udon': 1} · **strength:** [5] · **created:** ['2026-07-25']

### `regional-cousin` — babi-guling ↔ nasi-campur-bali

- **rows:** 2 · **relation_type of each row:** ['regional-cousin'] · **type-consistent:** True
- **stored from-row:** `babi-guling -> nasi-campur-bali`
- **stored reverse-row:** `nasi-campur-bali -> babi-guling`
- **reason:** Babi guling is often the centerpiece of nasi campur Bali
- **reason subject:** `None`
- **direction vs reason:** indeterminate
- **factual status:** **unsourced**
- **note:** no relation-level source exists - dish_relations has no source column and there are 0 relation-level citations
- **dish sources:** {'babi-guling': 1, 'nasi-campur-bali': 1} · **strength:** [5] · **created:** ['2026-06-25']

### `regional-cousin` — babi-guling ↔ sate-lilit

- **rows:** 2 · **relation_type of each row:** ['regional-cousin'] · **type-consistent:** True
- **stored from-row:** `babi-guling -> sate-lilit`
- **stored reverse-row:** `sate-lilit -> babi-guling`
- **reason:** Both iconic Balinese ceremonial preparations
- **reason subject:** `None`
- **direction vs reason:** indeterminate
- **factual status:** **unsourced**
- **note:** no relation-level source exists - dish_relations has no source column and there are 0 relation-level citations
- **dish sources:** {'babi-guling': 1, 'sate-lilit': 1} · **strength:** [5] · **created:** ['2026-06-25']

### `regional-cousin` — ceviche-peruvian ↔ tostones

- **rows:** 2 · **relation_type of each row:** ['regional-cousin'] · **type-consistent:** True
- **stored from-row:** `ceviche-peruvian -> tostones`
- **stored reverse-row:** `tostones -> ceviche-peruvian`
- **reason:** Both anchor dishes of the Caribbean rim and the northern coast of South America
- **reason subject:** `None`
- **direction vs reason:** indeterminate
- **factual status:** **unsourced**
- **note:** no relation-level source exists - dish_relations has no source column and there are 0 relation-level citations
- **dish sources:** {'ceviche-peruvian': 1, 'tostones': 1} · **strength:** [4] · **created:** ['2026-06-25']

### `regional-cousin` — chicken-tikka-masala ↔ vindaloo

- **rows:** 2 · **relation_type of each row:** ['regional-cousin'] · **type-consistent:** True
- **stored from-row:** `chicken-tikka-masala -> vindaloo`
- **stored reverse-row:** `vindaloo -> chicken-tikka-masala`
- **reason:** Both Indian restaurant-style curries, Goan vs Punjabi
- **reason subject:** `None`
- **direction vs reason:** indeterminate
- **factual status:** **unsourced**
- **note:** no relation-level source exists - dish_relations has no source column and there are 0 relation-level citations
- **dish sources:** {'chicken-tikka-masala': 1, 'vindaloo': 1} · **strength:** [4] · **created:** ['2026-06-25']

### `regional-cousin` — jiaozi ↔ pierogi

- **rows:** 2 · **relation_type of each row:** ['regional-cousin'] · **type-consistent:** True
- **stored from-row:** `jiaozi -> pierogi`
- **stored reverse-row:** `pierogi -> jiaozi`
- **reason:** Crescent-shaped filled dumplings of Eastern Europe and East Asia
- **reason subject:** `None`
- **direction vs reason:** indeterminate
- **factual status:** **unsourced**
- **note:** no relation-level source exists - dish_relations has no source column and there are 0 relation-level citations
- **dish sources:** {'jiaozi': 1, 'pierogi': 1} · **strength:** [4] · **created:** ['2026-06-25']

### `regional-cousin` — jollof-rice ↔ nasi-goreng

- **rows:** 2 · **relation_type of each row:** ['regional-cousin'] · **type-consistent:** True
- **stored from-row:** `jollof-rice -> nasi-goreng`
- **stored reverse-row:** `nasi-goreng -> jollof-rice`
- **reason:** Both fried/tomato rice dishes at the heart of national identity
- **reason subject:** `None`
- **direction vs reason:** indeterminate
- **factual status:** **unsourced**
- **note:** no relation-level source exists - dish_relations has no source column and there are 0 relation-level citations
- **dish sources:** {'jollof-rice': 1, 'nasi-goreng': 1} · **strength:** [4] · **created:** ['2026-06-25']

### `regional-cousin` — khao-soi ↔ laksa

- **rows:** 2 · **relation_type of each row:** ['regional-cousin'] · **type-consistent:** True
- **stored from-row:** `khao-soi -> laksa`
- **stored reverse-row:** `laksa -> khao-soi`
- **reason:** Both coconut-curry noodle soups of the greater Mekong region
- **reason subject:** `None`
- **direction vs reason:** indeterminate
- **factual status:** **unsourced**
- **note:** no relation-level source exists - dish_relations has no source column and there are 0 relation-level citations
- **dish sources:** {'khao-soi': 1, 'laksa': 1} · **strength:** [5] · **created:** ['2026-06-25']

### `regional-cousin` — kimchi-jjigae ↔ mapo-tofu

- **rows:** 2 · **relation_type of each row:** ['regional-cousin'] · **type-consistent:** True
- **stored from-row:** `kimchi-jjigae -> mapo-tofu`
- **stored reverse-row:** `mapo-tofu -> kimchi-jjigae`
- **reason:** Both spicy stews of the East Asian mainland and peninsula
- **reason subject:** `None`
- **direction vs reason:** indeterminate
- **factual status:** **unsourced**
- **note:** no relation-level source exists - dish_relations has no source column and there are 0 relation-level citations
- **dish sources:** {'kimchi-jjigae': 1, 'mapo-tofu': 1} · **strength:** [3] · **created:** ['2026-06-25']

### `regional-cousin` — laksa ↔ pho-vietnamese

- **rows:** 2 · **relation_type of each row:** ['regional-cousin'] · **type-consistent:** True
- **stored from-row:** `laksa -> pho-vietnamese`
- **stored reverse-row:** `pho-vietnamese -> laksa`
- **reason:** Both Southeast Asian noodle soups, laksa spiced with rempah
- **reason subject:** `None`
- **direction vs reason:** indeterminate
- **factual status:** **unsourced**
- **note:** no relation-level source exists - dish_relations has no source column and there are 0 relation-level citations
- **dish sources:** {'laksa': 1, 'pho-vietnamese': 1} · **strength:** [4] · **created:** ['2026-06-25']

### `regional-cousin` — moussaka-greek ↔ moussaka-levant

- **rows:** 2 · **relation_type of each row:** ['regional-cousin'] · **type-consistent:** True
- **stored from-row:** `moussaka-greek -> moussaka-levant`
- **stored reverse-row:** `moussaka-levant -> moussaka-greek`
- **reason:** Levantine moussaka uses tomato and chickpeas, the Greek version adds béchamel
- **reason subject:** `None`
- **direction vs reason:** indeterminate
- **factual status:** **unsourced**
- **note:** no relation-level source exists - dish_relations has no source column and there are 0 relation-level citations
- **dish sources:** {'moussaka-greek': 1, 'moussaka-levant': 1} · **strength:** [5] · **created:** ['2026-07-25']

### `regional-cousin` — moussaka-greek ↔ musakka-turkish

- **rows:** 2 · **relation_type of each row:** ['regional-cousin'] · **type-consistent:** True
- **stored from-row:** `moussaka-greek -> musakka-turkish`
- **stored reverse-row:** `musakka-turkish -> moussaka-greek`
- **reason:** Turkish musakka serves fried aubergine in a tomato-pepper meat sauce without béchamel; Greek moussaka is the layered casserole with béchamel
- **reason subject:** `None`
- **direction vs reason:** indeterminate
- **factual status:** **unsourced**
- **note:** no relation-level source exists - dish_relations has no source column and there are 0 relation-level citations
- **dish sources:** {'moussaka-greek': 1, 'musakka-turkish': 1} · **strength:** [5] · **created:** ['2026-07-25']

### `regional-cousin` — paella-valenciana ↔ risotto-alla-milanese

- **rows:** 2 · **relation_type of each row:** ['regional-cousin'] · **type-consistent:** True
- **stored from-row:** `paella-valenciana -> risotto-alla-milanese`
- **stored reverse-row:** `risotto-alla-milanese -> paella-valenciana`
- **reason:** Both short-grain rice dishes, Italian vs Iberian
- **reason subject:** `None`
- **direction vs reason:** indeterminate
- **factual status:** **unsourced**
- **note:** no relation-level source exists - dish_relations has no source column and there are 0 relation-level citations
- **dish sources:** {'paella-valenciana': 1, 'risotto-alla-milanese': 1} · **strength:** [4] · **created:** ['2026-06-25']

### `regional-cousin` — pho-vietnamese ↔ ramen-japanese

- **rows:** 2 · **relation_type of each row:** ['regional-cousin'] · **type-consistent:** True
- **stored from-row:** `pho-vietnamese -> ramen-japanese`
- **stored reverse-row:** `ramen-japanese -> pho-vietnamese`
- **reason:** Both Asian brothy noodle soups that crossed paths via Chinese diaspora
- **reason subject:** `None`
- **direction vs reason:** indeterminate
- **factual status:** **unsourced**
- **note:** no relation-level source exists - dish_relations has no source column and there are 0 relation-level citations
- **dish sources:** {'pho-vietnamese': 1, 'ramen-japanese': 1} · **strength:** [4] · **created:** ['2026-06-25']

### `regional-cousin` — pho-vietnamese ↔ soto-ayam

- **rows:** 2 · **relation_type of each row:** ['regional-cousin'] · **type-consistent:** True
- **stored from-row:** `pho-vietnamese -> soto-ayam`
- **stored reverse-row:** `soto-ayam -> pho-vietnamese`
- **reason:** Both clear-broth soups of the East and Southeast Asian seaboard
- **reason subject:** `None`
- **direction vs reason:** indeterminate
- **factual status:** **unsourced**
- **note:** no relation-level source exists - dish_relations has no source column and there are 0 relation-level citations
- **dish sources:** {'pho-vietnamese': 1, 'soto-ayam': 1} · **strength:** [4] · **created:** ['2026-06-25']

### `regional-cousin` — rawon ↔ soto-ayam

- **rows:** 2 · **relation_type of each row:** ['regional-cousin'] · **type-consistent:** True
- **stored from-row:** `rawon -> soto-ayam`
- **stored reverse-row:** `soto-ayam -> rawon`
- **reason:** Both Indonesian clear soups with a spice-paste base
- **reason subject:** `None`
- **direction vs reason:** indeterminate
- **factual status:** **unsourced**
- **note:** no relation-level source exists - dish_relations has no source column and there are 0 relation-level citations
- **dish sources:** {'rawon': 1, 'soto-ayam': 1} · **strength:** [5] · **created:** ['2026-06-25']

### `shared-ingredient` — borscht ↔ kimchi-jjigae

- **rows:** 2 · **relation_type of each row:** ['shared-ingredient'] · **type-consistent:** True
- **stored from-row:** `borscht -> kimchi-jjigae`
- **stored reverse-row:** `kimchi-jjigae -> borscht`
- **reason:** Both fermented-vegetable-led soups, beet vs napa cabbage
- **reason subject:** `None`
- **direction vs reason:** indeterminate
- **factual status:** **unsourced**
- **note:** no relation-level source exists - dish_relations has no source column and there are 0 relation-level citations
- **dish sources:** {'borscht': 1, 'kimchi-jjigae': 1} · **strength:** [3] · **created:** ['2026-06-25']

### `shared-ingredient` — rendang ↔ sambal

- **rows:** 2 · **relation_type of each row:** ['shared-ingredient'] · **type-consistent:** True
- **stored from-row:** `rendang -> sambal`
- **stored reverse-row:** `sambal -> rendang`
- **reason:** Both rely on a chili paste, rendang inside the dish, sambal as table condiment
- **reason subject:** `None`
- **direction vs reason:** indeterminate
- **factual status:** **unsourced**
- **note:** no relation-level source exists - dish_relations has no source column and there are 0 relation-level citations
- **dish sources:** {'rendang': 1, 'sambal': 1} · **strength:** [3] · **created:** ['2026-07-25']

### `shared-ingredient` — sambal ↔ soto-ayam

- **rows:** 2 · **relation_type of each row:** ['shared-ingredient'] · **type-consistent:** True
- **stored from-row:** `sambal -> soto-ayam`
- **stored reverse-row:** `soto-ayam -> sambal`
- **reason:** Soto is incomplete without a dollop of sambal on the side
- **reason subject:** `None`
- **direction vs reason:** indeterminate
- **factual status:** **unsourced**
- **note:** no relation-level source exists - dish_relations has no source column and there are 0 relation-level citations
- **dish sources:** {'sambal': 1, 'soto-ayam': 1} · **strength:** [4] · **created:** ['2026-07-25']

### `shared-method` — biryani-hyderabadi ↔ couscous

- **rows:** 2 · **relation_type of each row:** ['shared-method'] · **type-consistent:** True
- **stored from-row:** `biryani-hyderabadi -> couscous`
- **stored reverse-row:** `couscous -> biryani-hyderabadi`
- **reason:** Both steamed grain dishes layered with aromatic broth and meat
- **reason subject:** `None`
- **direction vs reason:** indeterminate
- **factual status:** **unsourced**
- **note:** no relation-level source exists - dish_relations has no source column and there are 0 relation-level citations
- **dish sources:** {'biryani-hyderabadi': 1, 'couscous': 1} · **strength:** [4] · **created:** ['2026-06-25']

### `shared-method` — boeuf-bourguignon ↔ tagine-moroccan

- **rows:** 2 · **relation_type of each row:** ['shared-method'] · **type-consistent:** True
- **stored from-row:** `boeuf-bourguignon -> tagine-moroccan`
- **stored reverse-row:** `tagine-moroccan -> boeuf-bourguignon`
- **reason:** Both long-braised stews in a covered vessel
- **reason subject:** `None`
- **direction vs reason:** indeterminate
- **factual status:** **unsourced**
- **note:** no relation-level source exists - dish_relations has no source column and there are 0 relation-level citations
- **dish sources:** {'boeuf-bourguignon': 1, 'tagine-moroccan': 1} · **strength:** [3] · **created:** ['2026-06-25']

### `shared-method` — ceviche-peruvian ↔ sushi

- **rows:** 2 · **relation_type of each row:** ['shared-method'] · **type-consistent:** True
- **stored from-row:** `ceviche-peruvian -> sushi`
- **stored reverse-row:** `sushi -> ceviche-peruvian`
- **reason:** Both rely on acid or salt to 'cook' raw fish
- **reason subject:** `None`
- **direction vs reason:** indeterminate
- **factual status:** **unsourced**
- **note:** no relation-level source exists - dish_relations has no source column and there are 0 relation-level citations
- **dish sources:** {'ceviche-peruvian': 1, 'sushi': 1} · **strength:** [4] · **created:** ['2026-06-25']

### `shared-method` — chicken-tikka-masala ↔ khao-soi

- **rows:** 2 · **relation_type of each row:** ['shared-method'] · **type-consistent:** True
- **stored from-row:** `chicken-tikka-masala -> khao-soi`
- **stored reverse-row:** `khao-soi -> chicken-tikka-masala`
- **reason:** Both slow-simmered in a coconut or cream spiced broth
- **reason subject:** `None`
- **direction vs reason:** indeterminate
- **factual status:** **unsourced**
- **note:** no relation-level source exists - dish_relations has no source column and there are 0 relation-level citations
- **dish sources:** {'chicken-tikka-masala': 1, 'khao-soi': 1} · **strength:** [3] · **created:** ['2026-06-25']

### `shared-method` — chicken-tikka-masala ↔ rendang

- **rows:** 2 · **relation_type of each row:** ['shared-method'] · **type-consistent:** True
- **stored from-row:** `chicken-tikka-masala -> rendang`
- **stored reverse-row:** `rendang -> chicken-tikka-masala`
- **reason:** Both slow-cooked in a spice paste until the sauce reduces
- **reason subject:** `None`
- **direction vs reason:** indeterminate
- **factual status:** **unsourced**
- **note:** no relation-level source exists - dish_relations has no source column and there are 0 relation-level citations
- **dish sources:** {'chicken-tikka-masala': 1, 'rendang': 1} · **strength:** [4] · **created:** ['2026-06-25']

### `shared-method` — gado-gado ↔ nasi-campur-bali

- **rows:** 2 · **relation_type of each row:** ['shared-method'] · **type-consistent:** True
- **stored from-row:** `gado-gado -> nasi-campur-bali`
- **stored reverse-row:** `nasi-campur-bali -> gado-gado`
- **reason:** Both built around a peanut sauce dressed at the table
- **reason subject:** `None`
- **direction vs reason:** indeterminate
- **factual status:** **unsourced**
- **note:** no relation-level source exists - dish_relations has no source column and there are 0 relation-level citations
- **dish sources:** {'gado-gado': 1, 'nasi-campur-bali': 1} · **strength:** [4] · **created:** ['2026-06-25']

### `shared-method` — japchae ↔ kimchi-jjigae

- **rows:** 2 · **relation_type of each row:** ['shared-method'] · **type-consistent:** True
- **stored from-row:** `japchae -> kimchi-jjigae`
- **stored reverse-row:** `kimchi-jjigae -> japchae`
- **reason:** Both built on sesame oil and soy sauce, central to Korean home cooking
- **reason subject:** `None`
- **direction vs reason:** indeterminate
- **factual status:** **unsourced**
- **note:** no relation-level source exists - dish_relations has no source column and there are 0 relation-level citations
- **dish sources:** {'japchae': 1, 'kimchi-jjigae': 1} · **strength:** [4] · **created:** ['2026-06-25']

### `shared-method` — jiaozi ↔ mapo-tofu

- **rows:** 2 · **relation_type of each row:** ['shared-method'] · **type-consistent:** True
- **stored from-row:** `jiaozi -> mapo-tofu`
- **stored reverse-row:** `mapo-tofu -> jiaozi`
- **reason:** Both Sichuan staples sharing doubanjiang and chili oil
- **reason subject:** `None`
- **direction vs reason:** indeterminate
- **factual status:** **unsourced**
- **note:** no relation-level source exists - dish_relations has no source column and there are 0 relation-level citations
- **dish sources:** {'jiaozi': 1, 'mapo-tofu': 1} · **strength:** [4] · **created:** ['2026-06-25']

### `shared-method` — jiaozi ↔ momo

- **rows:** 2 · **relation_type of each row:** ['shared-method'] · **type-consistent:** True
- **stored from-row:** `jiaozi -> momo`
- **stored reverse-row:** `momo -> jiaozi`
- **reason:** Both steamed in a bamboo or metal steamer
- **reason subject:** `None`
- **direction vs reason:** indeterminate
- **factual status:** **unsourced**
- **note:** no relation-level source exists - dish_relations has no source column and there are 0 relation-level citations
- **dish sources:** {'jiaozi': 1, 'momo': 1} · **strength:** [3] · **created:** ['2026-06-25']

### `shared-method` — jollof-rice ↔ risotto-alla-milanese

- **rows:** 2 · **relation_type of each row:** ['shared-method'] · **type-consistent:** True
- **stored from-row:** `jollof-rice -> risotto-alla-milanese`
- **stored reverse-row:** `risotto-alla-milanese -> jollof-rice`
- **reason:** Both rice dishes cooked slowly with constant stirring in seasoned broth
- **reason subject:** `None`
- **direction vs reason:** indeterminate
- **factual status:** **unsourced**
- **note:** no relation-level source exists - dish_relations has no source column and there are 0 relation-level citations
- **dish sources:** {'jollof-rice': 1, 'risotto-alla-milanese': 1} · **strength:** [3] · **created:** ['2026-06-25']

### `shared-method` — laksa ↔ tom-yum

- **rows:** 2 · **relation_type of each row:** ['shared-method'] · **type-consistent:** True
- **stored from-row:** `laksa -> tom-yum`
- **stored reverse-row:** `tom-yum -> laksa`
- **reason:** Both built on a pounded rempah (lemongrass-galangal-chili) base
- **reason subject:** `None`
- **direction vs reason:** indeterminate
- **factual status:** **unsourced**
- **note:** no relation-level source exists - dish_relations has no source column and there are 0 relation-level citations
- **dish sources:** {'laksa': 1, 'tom-yum': 1} · **strength:** [5] · **created:** ['2026-06-25']

### `shared-method` — mapo-tofu ↔ shakshuka

- **rows:** 2 · **relation_type of each row:** ['shared-method'] · **type-consistent:** True
- **stored from-row:** `mapo-tofu -> shakshuka`
- **stored reverse-row:** `shakshuka -> mapo-tofu`
- **reason:** Both tofu/egg dishes simmered in a chili-flecked tomato-pepper sauce
- **reason subject:** `None`
- **direction vs reason:** indeterminate
- **factual status:** **unsourced**
- **note:** no relation-level source exists - dish_relations has no source column and there are 0 relation-level citations
- **dish sources:** {'mapo-tofu': 1, 'shakshuka': 1} · **strength:** [3] · **created:** ['2026-06-25']

### `shared-method` — paella-valenciana ↔ risotto-alla-milanese

- **rows:** 2 · **relation_type of each row:** ['shared-method'] · **type-consistent:** True
- **stored from-row:** `paella-valenciana -> risotto-alla-milanese`
- **stored reverse-row:** `risotto-alla-milanese -> paella-valenciana`
- **reason:** Both rice dishes built around a sofrito / soffritto base
- **reason subject:** `None`
- **direction vs reason:** indeterminate
- **factual status:** **unsourced**
- **note:** no relation-level source exists - dish_relations has no source column and there are 0 relation-level citations
- **dish sources:** {'paella-valenciana': 1, 'risotto-alla-milanese': 1} · **strength:** [4] · **created:** ['2026-06-25']

### `shared-method` — shakshuka ↔ vindaloo

- **rows:** 2 · **relation_type of each row:** ['shared-method'] · **type-consistent:** True
- **stored from-row:** `shakshuka -> vindaloo`
- **stored reverse-row:** `vindaloo -> shakshuka`
- **reason:** Both tomato-and-vinegar stews with chili heat, Goan and Levantine cousins
- **reason subject:** `None`
- **direction vs reason:** indeterminate
- **factual status:** **unsourced**
- **note:** no relation-level source exists - dish_relations has no source column and there are 0 relation-level citations
- **dish sources:** {'shakshuka': 1, 'vindaloo': 1} · **strength:** [3] · **created:** ['2026-06-25']

### `similar-serving` — acaraje ↔ pempek

- **rows:** 2 · **relation_type of each row:** ['similar-serving'] · **type-consistent:** True
- **stored from-row:** `acaraje -> pempek`
- **stored reverse-row:** `pempek -> acaraje`
- **reason:** Both street foods with a fried-bean-or-fish base and a strong sauce
- **reason subject:** `None`
- **direction vs reason:** indeterminate
- **factual status:** **unsourced**
- **note:** no relation-level source exists - dish_relations has no source column and there are 0 relation-level citations
- **dish sources:** {'acaraje': 1, 'pempek': 1} · **strength:** [4] · **created:** ['2026-06-25']

### `similar-serving` — congee ↔ pho-vietnamese

- **rows:** 2 · **relation_type of each row:** ['similar-serving'] · **type-consistent:** True
- **stored from-row:** `congee -> pho-vietnamese`
- **stored reverse-row:** `pho-vietnamese -> congee`
- **reason:** Both comfort-food breakfast bowls of the East and SE Asian rim
- **reason subject:** `None`
- **direction vs reason:** indeterminate
- **factual status:** **unsourced**
- **note:** no relation-level source exists - dish_relations has no source column and there are 0 relation-level citations
- **dish sources:** {'congee': 1, 'pho-vietnamese': 1} · **strength:** [4] · **created:** ['2026-06-25']

### `similar-serving` — congee ↔ ramen-japanese

- **rows:** 2 · **relation_type of each row:** ['similar-serving'] · **type-consistent:** True
- **stored from-row:** `congee -> ramen-japanese`
- **stored reverse-row:** `ramen-japanese -> congee`
- **reason:** Both warm, slow-cooked grain or noodle bowls eaten any time of day
- **reason subject:** `None`
- **direction vs reason:** indeterminate
- **factual status:** **unsourced**
- **note:** no relation-level source exists - dish_relations has no source column and there are 0 relation-level citations
- **dish sources:** {'congee': 1, 'ramen-japanese': 1} · **strength:** [3] · **created:** ['2026-06-25']

### `similar-serving` — falafel ↔ pempek

- **rows:** 2 · **relation_type of each row:** ['similar-serving'] · **type-consistent:** True
- **stored from-row:** `falafel -> pempek`
- **stored reverse-row:** `pempek -> falafel`
- **reason:** Both deep-fried handheld snacks of Indonesia and the Levant
- **reason subject:** `None`
- **direction vs reason:** indeterminate
- **factual status:** **unsourced**
- **note:** no relation-level source exists - dish_relations has no source column and there are 0 relation-level citations
- **dish sources:** {'falafel': 1, 'pempek': 1} · **strength:** [3] · **created:** ['2026-06-25']

### `similar-serving` — gado-gado ↔ hummus

- **rows:** 2 · **relation_type of each row:** ['similar-serving'] · **type-consistent:** True
- **stored from-row:** `gado-gado -> hummus`
- **stored reverse-row:** `hummus -> gado-gado`
- **reason:** Both sit at the intersection of vegetables and a thick legume sauce
- **reason subject:** `None`
- **direction vs reason:** indeterminate
- **factual status:** **unsourced**
- **note:** no relation-level source exists - dish_relations has no source column and there are 0 relation-level citations
- **dish sources:** {'gado-gado': 1, 'hummus': 1} · **strength:** [3] · **created:** ['2026-06-25']

### `similar-serving` — japchae ↔ pho-vietnamese

- **rows:** 2 · **relation_type of each row:** ['similar-serving'] · **type-consistent:** True
- **stored from-row:** `japchae -> pho-vietnamese`
- **stored reverse-row:** `pho-vietnamese -> japchae`
- **reason:** Both noodle dishes served as part of a multi-component meal
- **reason subject:** `None`
- **direction vs reason:** indeterminate
- **factual status:** **unsourced**
- **note:** no relation-level source exists - dish_relations has no source column and there are 0 relation-level citations
- **dish sources:** {'japchae': 1, 'pho-vietnamese': 1} · **strength:** [3] · **created:** ['2026-06-25']

### `similar-serving` — tarte-tatin ↔ tiramisu

- **rows:** 2 · **relation_type of each row:** ['similar-serving'] · **type-consistent:** True
- **stored from-row:** `tarte-tatin -> tiramisu`
- **stored reverse-row:** `tiramisu -> tarte-tatin`
- **reason:** Both iconic European desserts, layered or caramelised
- **reason subject:** `None`
- **direction vs reason:** indeterminate
- **factual status:** **unsourced**
- **note:** no relation-level source exists - dish_relations has no source column and there are 0 relation-level citations
- **dish sources:** {'tarte-tatin': 1, 'tiramisu': 1} · **strength:** [3] · **created:** ['2026-06-25']
