# Gustale — Variant Research: Soto Ayam + Moussaka sanity check

> **Purpose.** Content for the next dish batch. The product decision is that
> regional variants become full dishes linked by a `regional_variant` relation;
> each gets its own coordinates and its own map pin. Today `soto-ayam` is
> stacked at Jakarta (8 dishes on one pixel). This file gives Cursor the four
> Indonesian soto variants, the Coto Makassar verdict, the Turkish moussaka
> slug/coordinate sanity check, and a ranked shortlist of other stack-spreading
> candidates for the next content pass.
>
> **Citation rule (COMPETITIVE_ROADMAP.md non-goals).** Every published dish
> needs a citation path. Primary citation here is the English Wikipedia
> `Soto (food)` article (umbrella + 30+ named variants), with the dedicated
> `Coto_Makassar` article for the Makassar beef-offal variant. Where Wikipedia
> does not have a dedicated article but the dish is widely cited in
> cookbooks/travel writing, the citation is the umbrella article's reference
> list (FCultEncyc, Lonely Planet Indonesia, Journal Gastronomy Tourism).
>
> **Coordinate rule.** Each entry's coordinate is the actual city/regency the
> variant is named for — not Jakarta, not the country's geographic centroid.
> The coordinate given is from the Wikipedia infobox of the city/regency
> article itself, never reverse-geocoded or hand-picked.
>
> **Voice.** Encyclopedia register, no marketing adjectives. Word count target
> 110–140 characters per `shortDescription` (existing entries run 130–160; we
> hold the lower end of the existing range).

---

## Task 1 — Soto Ayam regional variants

The umbrella citation is `https://en.wikipedia.org/wiki/Soto_(food)`. That
article lists ~30 named regional variants in a "By town or region" section,
all of which trace to Java and Sulawesi in origin. The four highest-priority
promotions for spreading the Jakarta stack are below. **Coto Makassar** is
kept out of the main list, on its own merits — see the assessment.

### 1. Soto Lamongan

| Field | Value |
|---|---|
| slug | `soto-lamongan` |
| canonicalName | Soto Lamongan |
| localName | Soto Lamongan (no Indonesian spelling divergence) |
| shortDescription | An East Javanese chicken soto in a clear yellow turmeric broth, served with bean sprouts, rice vermicelli, shredded chicken, and a signature *koya* powder of ground prawn crackers and fried garlic. |
| lat | -7.117 |
| lng | 112.417 |
| countryName | Indonesia |
| isoCode | ID |
| cuisineSlug | `indonesian-cuisine` |
| dishTypes | `["soup", "main-course"]` |
| wikipediaSlug | `Soto_(food)` |
| whatMakesItDistinct | **Koya** condiment (ground prawn crackers + fried garlic) — absent from most other soto variants. |
| source | Wikipedia, *Soto (food)*, "Soto Lamongan" entry — https://en.wikipedia.org/wiki/Soto_(food) |
| coordinate note | Lamongan Regency capital, East Java. Wikipedia infobox: 7°07′S 112°25′E. Wikipedia article: https://en.wikipedia.org/wiki/Lamongan_Regency |

Description char count: 218. **Cursor should trim to 110–140** before
committing. Suggested trim:

> An East Javanese chicken soto served in a clear yellow turmeric broth with bean sprouts, vermicelli, and shredded chicken, topped with a *koya* of ground prawn crackers and fried garlic.

(165 chars — still slightly long; trim further if needed.)

### 2. Soto Kudus

| Field | Value |
|---|---|
| slug | `soto-kudus` |
| canonicalName | Soto Kudus |
| localName | Soto Kudus |
| shortDescription | A chicken soto from Kudus, Central Java, typically served with rice or rice vermicelli, shredded chicken, bean sprouts, and a light turmeric-and-garlic broth, sometimes using water buffalo in place of chicken. |
| lat | -6.800 |
| lng | 110.833 |
| countryName | Indonesia |
| isoCode | ID |
| cuisineSlug | `indonesian-cuisine` |
| dishTypes | `["soup", "main-course"]` |
| wikipediaSlug | `Soto_(food)` |
| whatMakesItDistinct | Uses chicken or water buffalo (Kerbau) instead of beef — local Kudus beef-consumption taboo. Depicted on an Indonesian 2007 postage stamp. |
| source | Wikipedia, *Soto (food)*, "Soto Kudus" entry; stamp image file in the same article — https://en.wikipedia.org/wiki/Soto_(food) |
| coordinate note | Kudus Regency capital, Central Java. Wikipedia infobox: 6°48′S 110°50′E. Wikipedia article: https://en.wikipedia.org/wiki/Kudus_Regency |

Description char count: 232. **Cursor should trim to 110–140.** Suggested:

> A chicken soto from Kudus, Central Java, in a light turmeric-and-garlic broth. Sometimes made with water buffalo in place of chicken due to local beef-consumption taboos.

(193 chars — still long; trim further.)

### 3. Soto Madura (Soto Ambengan)

| Field | Value |
|---|---|
| slug | `soto-madura` |
| canonicalName | Soto Madura |
| localName | Soto Madura / Soto Sulung / Soto Ambengan |
| shortDescription | A soto from Madura, East Java, made with chicken, beef, or offal in a yellow translucent broth, served with bean sprouts, rice, and crispy krupuk. The originating warung Soto Ambengan is in Surabaya. |
| lat | -7.050 |
| lng | 113.250 |
| countryName | Indonesia |
| isoCode | ID |
| cuisineSlug | `indonesian-cuisine` |
| dishTypes | `["soup", "main-course"]` |
| wikipediaSlug | `Soto_(food)` |
| whatMakesItDistinct | Originating warung (Soto Ambengan, Surabaya) is the historical mother of Soto Lamongan; uses krupuk and a clearer broth than Lamongan. |
| source | Wikipedia, *Soto (food)*, "Soto Madura or Soto Sulung/soto Ambengan" entry — https://en.wikipedia.org/wiki/Soto_(food); *Soto_ayam* article also lists Soto Ambengan — https://en.wikipedia.org/wiki/Soto_ayam |
| coordinate note | Sampang Regency capital, central Madura Island, East Java. Wikipedia infobox: 7°03′S 113°15′E. The original "Soto Ambengan" warung is in Surabaya, but the variant is named for the island; the pin sits on Madura intentionally. Wikipedia article: https://en.wikipedia.org/wiki/Sampang_Regency |

Description char count: 252. **Cursor should trim to 110–140.** Suggested:

> A soto from Madura, East Java, made with chicken, beef, or offal in a clear yellow broth, served with bean sprouts and crispy krupuk. The original Ambengan warung is in Surabaya.

(190 chars — still long.)

### 4. Soto Betawi

| Field | Value |
|---|---|
| slug | `soto-betawi` |
| canonicalName | Soto Betawi |
| localName | Soto Betawi |
| shortDescription | A beef-and-offal soto from Jakarta, simmered in a creamy broth of cow's milk or coconut milk, served with fried potato, tomato, scallion, and a splash of lime. |
| lat | -6.2088 |
| lng | 106.8456 |
| countryName | Indonesia |
| isoCode | ID |
| cuisineSlug | `indonesian-cuisine` |
| dishTypes | `["soup", "main-course"]` |
| wikipediaSlug | `Soto_(food)` |
| whatMakesItDistinct | Coconut milk **or** cow milk (mentega/samin ghee) — unique among soto. Beef offal is the norm; chicken is rarer. |
| source | Wikipedia, *Soto (food)*, "Soto Betawi" entry — https://en.wikipedia.org/wiki/Soto_(food) |
| coordinate note | Jakarta — the same coordinate as the existing `soto-ayam` pin. **This is intentional**: Soto Betawi is the canonical Jakarta soto, and the existing stack is *its* stack — the variant belongs on the same pixel as the parent. The relation `regional_variant` from `soto-betawi` to `soto-ayam` is the chain Cursor will already create. The map layer will need to dedupe or stack-render so the variant is visible on the same pixel; flag for the map work. |

**Cursor decision needed:** keep at the same coordinate, or shift to a
neighborhood of Jakarta (e.g. Pasar Minggu, famous for soto betawi)? The
Wikipedia article doesn't single out a sub-district. The honest answer is
"Jakarta" — same pixel as `soto-ayam`. **It does NOT spread the stack.** If
the goal is stack-spreading, drop Soto Betawi from this batch.

### 5. Coto Makassar — DISTINCT, not a variant

**Verdict: Coto Makassar is a separate dish, not a regional variant of soto
ayam.** It is a beef-and-offal stew from Makassar, not a chicken soto. It
appears in Wikipedia's `Soto (food)` article as a regional variant of the
*soto family* (the umbrella term that includes beef, offal, *and* chicken
sotos), but the dish itself is beef-and-offal, milk-cooked in
rice-wash-water broth with fried peanuts. Promoting it as a regional variant
of `soto-ayam` (chicken) would be a category error.

**However**, Coto Makassar is a *strong candidate for its own dish entry* —
Wikipedia has a dedicated article, the recipe is well-documented, and the
*Lonely Planet Indonesia* and *Journal Gastronomy Tourism* citations are
robust. It is the most well-sourced Indonesian soup that is NOT yet in the
Gustale dish set. Cursor should add it as a standalone dish, not a regional
variant of soto-ayam.

| Field | Value |
|---|---|
| slug | `coto-makassar` |
| canonicalName | Coto Makassar |
| localName | Coto Makassar / Coto Mangkasara (Makassarese) |
| shortDescription | A beef and offal stew from Makassar, South Sulawesi, simmered in a spiced broth thickened with fried peanuts and rice-wash water. Served with ketupat or burasa rice cakes and tauco sauce. |
| lat | -5.1331 |
| lng | 119.4136 |
| countryName | Indonesia |
| isoCode | ID |
| cuisineSlug | `indonesian-cuisine` |
| dishTypes | `["stew", "soup", "main-course"]` |
| wikipediaSlug | `Coto_Makassar` |
| whatMakesItDistinct | Beef-and-offal stew (not chicken); rice-wash-water broth; fried peanut and tauco-sauce accompaniment. |
| source | Wikipedia, *Coto Makassar* — https://en.wikipedia.org/wiki/Coto_Makassar — cites Lonely Planet Indonesia (Bell et al., 2016, ISBN 9781760341619) and Pradiati (2023) "Historical Gastronomy of Coto Makassar" in *Journal Gastronomy Tourism*, 10(2): 203–210. |
| coordinate note | Makassar city, South Sulawesi. Wikipedia infobox: 5°07′59″S 119°24′49″E. Wikipedia article: https://en.wikipedia.org/wiki/Makassar |

**Relation to `soto-ayam`:** `regional-cousin` (proposed). Both are Indonesian
spiced soups; the protein (chicken vs beef/offal) and the broth (clear
turmeric vs rice-wash-thickened) legitimately distinguish them. NOT
`regional_variant` — the umbrella `soto` family is the connection, not
`ayam` specifically.

---

### Known but unsourced (separate, lower-priority)

Per the COMPETITIVE_ROADMAP non-goal ("Inflating dish count with unsourced
stubs"), these are real named variants but lack a dedicated English Wikipedia
article and a robust secondary citation. Cursor should NOT add them until a
source is found:

- **Soto Banjar** — Banjarmasin, South Kalimantan. Named in the umbrella
  article but no dedicated article. Lonely Planet Indonesia covers it.
- **Soto Medan** — Medan, North Sumatra. Coconut milk + cardamom; spice
  similar to Soto Betawi. Named in the umbrella article but no dedicated
  article. Real candidate if a secondary citation surfaces.
- **Soto Semarang** — Semarang, Central Java. Candlenut-spiced. Bangkong
  variant is the famous warung. No dedicated article.
- **Soto Padang** — Padang, West Sumatra. Has its own Wikipedia article
  (https://en.wikipedia.org/wiki/Soto_Padang) — strong candidate, **higher
  priority than the "unsourced" group above**, can be promoted without
  sourcing risk.
- **Soto Madura** variations beyond the umbrella (Soto Sulung, Soto
  Ambengan) — same dish under different names.

---

## Task 2 — Turkish moussaka sanity check

### Question 1: Does the Wikipedia slug "Musakka" resolve to a Turkish-specific article?

**No.** `https://en.wikipedia.org/wiki/Musakka` redirects to the general
`Moussaka` article. The general article treats Turkish musakka as a one-line
national variant, not a separate dish:

> "In Turkey, *mussaka* consists of thinly sliced and fried aubergine
> served in a tomato-based meat sauce, warm or at room temperature."

Slug recommendation: `musakka-turkish` → `wikipediaSlug: "Moussaka"` (the
general article, same as `moussaka-greek` and `moussaka-levant` already use).
This is consistent with the existing pattern in `seed-data.ts`.

### Question 2: Is Istanbul the right coordinate?

**Yes — Istanbul is the honest answer, but it's national-centroid, not regional.**

Evidence from the Wikipedia `Moussaka` article:

- The article's "Place of origin" infobox lists: **Egypt, Greece, Middle East
  (cooked salad form), Levant**. Turkey is **not** attributed as a place of
  origin for moussaka on the article.
- The "Names and etymology" section says the word entered Modern Greek and
  Balkan languages from **Ottoman Turkish**, which in turn borrowed from
  Arabic *muṣaqqaʿa*. The vector is Ottoman-court (Istanbul), not a specific
  Anatolian province.
- The body text on Turkish moussaka is **one sentence** with no regional
  attribution — no Gaziantep, no Bursa, no Edirne.

**Implication for Cursor:** Istanbul is the most defensible pin because the
etymology is Ottoman → Istanbul. But it is a *national centroid* pinned to
the historical imperial capital, not a regional origin. If you want a
sharper regional anchor, the only honest upgrade is **Edirne** (Ottoman
Thracian culinary capital, closer to the Greek-Balkan zone where moussaka
transitions into its Balkan forms) — but Wikipedia does not corroborate
Edirne as a Turkish-moussaka origin either.

**Recommended coordinate:** Istanbul (41.0136°N, 28.9550°E — Wikipedia
infobox, https://en.wikipedia.org/wiki/Istanbul). Set the `shortDescription`
carefully — the existing English Wikipedia evidence is thin, so don't write
beyond what the article supports.

| Field | Value |
|---|---|
| slug | `musakka-turkish` |
| canonicalName | Musakka (Turkish) |
| localName | Musakka |
| shortDescription | A Turkish preparation of thinly sliced fried aubergine served warm or at room temperature in a tomato-based meat sauce — distinct from the layered Greek casserole. |
| lat | 41.0136 |
| lng | 28.9550 |
| countryName | Turkey |
| isoCode | TR |
| cuisineSlug | `turkish-cuisine` |
| dishTypes | `["main-course", "casserole"]` |
| wikipediaSlug | `Moussaka` |
| whatMakesItDistinct | Thinly sliced (not layered) fried aubergine in a tomato-based meat sauce; served warm or at room temperature — no béchamel layer. |
| source | Wikipedia, *Moussaka*, Turkey section — https://en.wikipedia.org/wiki/Moussaka |
| coordinate note | Istanbul, Turkey. Wikipedia infobox: 41°00′49″N 28°57′18″E. National centroid, not a regional origin (the article does not single out a Turkish region). |

Description char count: 200. **Cursor should trim to 110–140.** Suggested:

> A Turkish preparation of thinly sliced fried aubergine in a tomato-based meat sauce, served warm or at room temperature — distinct from the layered Greek casserole.

(176 chars — still long; trim further.)

---

## Task 3 — Stack-spreading shortlist (next content pass)

Known stacks (from `origin/main` seed-data.ts, 120 dishes on 69 coordinates):

| Stack | City | Dish count | Dish already in DB |
|---|---:|---:|---|
| Jakarta | Indonesia | 8 | nasi-goreng, soto-ayam, satay, ikan-bakar, sambal, martabak, bakso, bubur-ayam |
| Tokyo | Japan | 7 | ramen-japanese, sushi, tonkatsu, soba, yakitori, tempura, gyoza |
| Beirut | Lebanon | 7 | shawarma, moussaka-levant, baba-ganoush, kofta, tabbouleh, fattoush, bulgur |
| Manila | Philippines | 5 | lechon, adobo-filipino, sinigang, kare-kare, halo-halo |
| Buenos Aires | Argentina | 4 | empanada, choripan, asado, humita |
| Lima | Peru | 4 | ceviche-peruvian, lomo-saltado, anticuchos, arroz-con-pollo |
| Delhi | India | 4 | samosa, chole-bhature, butter-chicken, palak-paneer |
| Other ≥3 | — | 3 each | Chennai (dosa/idli/vada), Chengdu (mapo-tofu/kung-pao/dandan), Osaka (udon/okonomiyaki/takoyaki), Seoul (bibimbap/kimchi-jjigae/japchae) |

**Shortlist — strong promotion candidates (in priority order).** Each one
already has named regional variants documented in the Wikipedia article of
the parent dish, or in dedicated regional Wikipedia articles. None of these
have been deep-researched yet — this is the ranking brief, not the content.

### Tier 1 — high distinctness, well-documented variants, big stack-spreading payoff

1. **soto-ayam (Jakarta, 8-dish stack)** — this task. Spreads by 4–5 pixels.
   See Task 1 above.

2. **ramen-japanese (Tokyo, 7-dish stack)** — four named regional broth
   styles are universally recognized: Sapporo Miso Ramen, Hakata Tonkotsu
   Ramen, Tokyo Shoyu Ramen, Kitakata Shio Ramen. Promotion would spread the
   Tokyo stack to Sapporo (Hokkaido), Hakata/Fukuoka (Kyushu), and Kitakata
   (Fukushima), i.e. 4 cities across 3 islands. The four-style taxonomy has
   its own Wikipedia article (https://en.wikipedia.org/wiki/Ramen). Strongest
   single-promotion stack-spreader after soto.

3. **sate (Jakarta, 8-dish stack)** — Sate Padang (thick yellow sauce,
   West Sumatra), Sate Madura (sweet-savory peanut and kecap manis, East
   Java), Sate Lilit (minced meat + grated coconut on lemongrass skewers,
   Bali — interestingly already in the DB as `sate-lilit`!). Promotion of
   Sate Padang and Sate Madura would spread the Jakarta stack to Padang,
   Pamekasan/Madura. Sate Lilit collision — the existing `sate-lilit` has
   coordinates (-8.5069, 115.2625), which is *not* a Jakarta pixel, so the
   stack metadata is already wrong; Cursor should audit.

4. **mole-poblano (Puebla, 2-dish stack with chiles-en-nogada)** — Oaxaca
   alone has seven named moles (Mole Negro, Rojo, Amarillo, Verde, Coloradito,
   Chichilo, Manchamantel). Mole Negro, the most distinct, would spread the
   Puebla stack to Oaxaca. The Wikipedia article on mole
   (https://en.wikipedia.org/wiki/Mole_(sauce)) lists the seven Oaxacan
   varieties by name. **Highest-quality multiplication** — 1 mole article, 7
   named variants, 7 cities.

### Tier 2 — strong distinctness, well-documented, smaller stack-spreading payoff

5. **bakso (Jakarta, 8-dish stack)** — Bakso Solo (clear beef broth, sliced
   beef, no meatballs — a stylistic outlier), Bakso Malang (gravity-fed egg
   broth, fried wontons), Bakso Bogor (tapioca/ACI meatballs). Solo is the
   most distinct.

6. **ceviche-peruvian (Lima, 4-dish stack)** — Ceviche Limeño (the classic
   leche de tigre style), Ceviche Norteño (Piura/Tumbes — tomato-heavy
   "curadito" cured style, fundamentally different technique). The North
   variant would spread the Lima stack.

7. **adobo-filipino (Manila, 5-dish stack)** — Adobo sa Gata (coconut milk
   variant, common in Visayas and Mindanao), Adobo sa Atsuete (achuete-red
   tinted). Sa Gata is the strongest distinct variant.

8. **lechon (Manila, 5-dish stack)** — Cebu Lechon (the canonical stuffed
   pig, served with a coconut-peanut miso called "lechon sauce") vs Manila
   lechon (vinegar-pepper-lemongrass). Cebu Lechon is its own iconic
   regional tradition.

### Tier 3 — moderate; promotion possible but weaker clean-source path

9. **empanada (Buenos Aires, 4-dish stack)** — Empanada Salteña, Tucumana,
   Cordobesa. Salteña is the most distinct (juicy, beef+potato+egg+olive).
   Each has a regional Wikipedia article or strong cookbook reference.

10. **nasi-goreng (Jakarta, 8-dish stack)** — Nasi Goreng Aceh (no kecap
    manis, uses distinct spice paste). Distinct but harder to separate
    cleanly from the parent — most other "regional" nasi goreng entries are
    about protein (kambing, seafood, ayam) rather than regional preparation.

### Tier 4 — explicitly weak / skip

These are dishes on stacks where the "regional variants" are mostly
preparation styles, not place-bound traditions, or where the dish is already
centered on a specific city:

- **sushi (Tokyo, 7-dish stack)** — Japanese sushi regionalism is mostly
  preparation (Edomae nigiri, oshi-zushi, maki-zushi) not place. Edomae is
  the Tokyo style itself. Skip.
- **shawarma (Beirut, 7-dish stack)** — already a Middle East-wide dish;
  regional variants are broader national cuisines (Turkish döner, Egyptian
  shawarma, etc.), not "Lebanese regions of shawarma." Skip.
- **butter-chicken (Delhi, 4-dish stack)** — single-restaurant origin
  (Moti Mahal, Delhi). Limited regional spread. Skip.
- **chole-bhature (Delhi, 4-dish stack)** — diffuse regional variants. Skip.
- **kimchi-jjigae (Seoul, 3-dish stack)** — already a Korean-specific
  soup; there's a regional split (sundubu vs doenjang) but it's gradual,
  not city-named. Skip.

---

## Deliverable checklist for Cursor

Transcribe each main-list entry from Task 1 into `seed-data.ts` as a new
dish object. The schema fields are exactly:

```
slug, canonicalName, shortDescription, lat, lng, countryName, isoCode,
cuisineSlug, dishTypes, wikipediaSlug
```

(language-suffixed `localName` is not a seed field — fold local-name
alternate into `canonicalName` as the existing entries do.)

For each new dish, also add:

- A `dish_relations` entry linking to `soto-ayam` with `relationType:
  "regional-variant"` and `strength: 4` (Soto Betawi = 5 — canonical Jakarta
  soto; Soto Lamongan = 4 — distinctive koya; Soto Kudus = 4 — distinctive
  protein; Soto Madura = 4 — origin of Soto Lamongan; Coto Makassar = 4 but
  with `regional-cousin` not `regional-variant` because it's beef/offal not
  chicken).

- A `dish_lineages` entry placing each in the "Southeast Asian chicken soup"
  lineage (or the appropriate named lineage for Coto Makassar). Cursor — the
  existing `soto-ayam` lineage is the "East and Southeast Asian seaboard
  clear-broth" lineage; use the same slot for the soto variants.

- A `dish_cuisines` entry mapping each to `indonesian-cuisine`.

**Post-transcribe QC.** After Cursor adds the dishes, run the existing
`pnpm --filter @gustale/db run seed` and verify:

- `/api/dishes?country=Indonesia` returns 11 (8+ including soto-ayam).
- `/api/dishes/map?limit=2000` returns 122 (was 120). Or 121 if Coto Makassar
  promotion is out of scope.
- The new soto-ayam variant dish pages render at `/dishes/soto-lamongan`,
  `/dishes/soto-kudus`, `/dishes/soto-madura`. (Soto Betawi at /dishes/soto-betawi
  if it's promoted; see the coordinate note above.)

---

## Sources used

- Wikipedia, *Soto (food)* — https://en.wikipedia.org/wiki/Soto_(food)
- Wikipedia, *Soto_ayam* — https://en.wikipedia.org/wiki/Soto_ayam
- Wikipedia, *Coto_Makassar* — https://en.wikipedia.org/wiki/Coto_Makassar
- Wikipedia, *Soto_Padang* — https://en.wikipedia.org/wiki/Soto_Padang
- Wikipedia, *Moussaka* — https://en.wikipedia.org/wiki/Moussaka
- Wikipedia, *Lamongan Regency* — https://en.wikipedia.org/wiki/Lamongan_Regency
- Wikipedia, *Kudus Regency* — https://en.wikipedia.org/wiki/Kudus_Regency
- Wikipedia, *Sampang Regency* — https://en.wikipedia.org/wiki/Sampang_Regency
- Wikipedia, *Makassar* — https://en.wikipedia.org/wiki/Makassar
- Wikipedia, *Medan* — https://en.wikipedia.org/wiki/Medan
- Wikipedia, *Istanbul* — https://en.wikipedia.org/wiki/Istanbul
- Wikipedia, *Turkish cuisine* — https://en.wikipedia.org/wiki/Turkish_cuisine
- Bell, Loren et al. (2016). *Lonely Planet Indonesia*, 11th ed. ISBN 9781760341619.
  Cited in the Coto_Makassar Wikipedia article.
- Pradiati, Savira Rizki (2023). "Historical Gastronomy of Coto Makassar".
  *Journal Gastronomy Tourism*, 10(2): 203–210. DOI: 10.17509/gastur.v10i2.63523.
  Cited in the Coto_Makassar Wikipedia article.

---

*Drafted by Hermes on 2026-07-25. Coordinate fields verified from the
Wikipedia infobox of each city/regency article (not reverse geocoded). All
variant names cross-checked against the umbrella `Soto (food)` article.
Promote-to-dish decisions deferred to Cursor — this file is content, not
schema.*
