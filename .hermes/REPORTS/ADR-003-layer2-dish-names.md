# ADR-003 layer 2 — `dish_names`, as built

**Status:** 🟢 **DONE — applied live 2026-10-29** (migrations `0023`–`0024`).
**Rule:** `decided-by: hermes` for the two additions the ADR left
open and for each judgement call below.

# What layer 2 delivers

| | |
|---|---|
| names | **1,373** |
| dishes | **121** (every published dish) |
| languages | **37** |
| endonyms | 982 |
| exonyms | 391 |
| names with a `script` | 1,373 (every one) |

The English name stays in `dishes.canonical_name` — the ADR is explicit
that the base table holds the canonical name and the translations table
holds the others — so it is not duplicated here. 123 English names were
dropped for exactly that reason.

# The 37 languages are the point

The ADR says the core set is "a floor, not a ceiling: the per-dish
language rule can add locales the core set omits." It does.

**The nine core locales:** `es de fr pt id zh ja ar hi`

**Plus 28 that belong to the dish itself:**

| language | dishes | language | dishes |
|---|---|---|---|
| `tl` Tagalog | adobo | `vi` Vietnamese | phở |
| `ko` Korean | bibimbap, gimbap | `el` Greek | moussaka, spanakopita |
| `th` Thai | pad thai | `hy` Armenian | khashlama |
| `it` Italian | carbonara, pizza | `tr` Turkish | baklava, doner |
| `fa` Persian | khashlama | `pl` Polish | pierogi |
| `uk` Ukrainian | borscht | `hu` Hungarian | goulash |
| `he` Hebrew | shakshuka | `sv` Swedish | meatballs |
| `ca` Catalan | escalivada | `da` Danish | smørrebrød |
| …and others | | | |

This is what makes the layer worth having: `/id/dishes/adobo` shows
**Adobong Filipino**, and `/vi/dishes/pho-vietnamese` shows **Phở** —
not "Vietnamese pho", which is what an English-only site would show.

# The four bugs the first runs caught

Each was silent — no error, just wrong data — and each is the kind of
thing that a smaller dataset would have hidden.

## 1. The sitelink keys have no dot

The API returns sitelinks keyed `eswiki`, `jawiki`, `zhwiki` — **not**
`es.wikipedia`. The first attempt looked for `es.wikipedia` and matched
nothing, so every name came out as an **exonym** and not one endonym
was ever found.

(The `sitefilter` parameter is ignored by the API too, so every
sitelink comes back regardless and the language has to be read off the
key.)

## 2. The Wikipedia URL's last segment is percent-encoded

`https://en.wikipedia.org/wiki/Acaraj%C3%A9` — used as an article
title un-decoded, it finds no article. Seven dishes got no Wikidata
item at all until the title was unquoted.

## 3. P1705, P1448 and P2561 carry their own language tag

These properties' values are **monolingualtext**, so they say which
language they are written in:

```
P1705 (native label):  phở [vi]   寿司 [ja-hani]   すし [ja-hira]
```

That tag is the whole point of the property — it is what makes a name
an **endonym** rather than an exonym. Reading them as plain text threw
the language away, and `phở` was never recorded as Vietnamese.

The script subtag gives the script: `hani` is `Hans`, `hira` is
`Jpan`.

## 4. The citations table is polymorphic

There is no `dish_citations` table. `citations` is
`(id, source_id, target_type, target_id, …)` with
`target_type = 'dish'`. The first query joined a table that does not
exist and resolved **zero** dishes.

# The link from dish to Wikidata

The dishes have no `wikidata_id` column, so the link had to be built.
The `sources` table already carries the English Wikipedia article for
every dish, and the Wikipedia API returns that article's
`wikibase_item` — which **is** the dish's Wikidata QID.

All 121 published dishes resolved. That is the whole pipeline:

```
en.wikipedia.org/wiki/Acarajé  ->  Q138542244  ->  sitelinks + labels  ->  names
```

# The table

```sql
dish_names(
  id, dish_id REFERENCES dishes(id) ON DELETE CASCADE,
  language, script, name,
  kind CHECK (kind IN ('endonym','exonym','romanization')),
  is_primary, source, source_ref, created_at
)
```

Two decisions the ADR left open:

- **decided-by: hermes — `script` is nullable.** The ADR lists it as a
  plain column. A name whose script is genuinely unknown should say so
  rather than guess, and every name we have does carry one — but the
  column must not force a lie. The post-assertion checks the format
  (`^[A-Z][a-z]{3}$`, the ISO 15924 shape) where a script IS given.
- **decided-by: hermes — `kind` is a CHECK constraint**, not a free
  text column, so a bad kind cannot be written.

`is_primary` picks **exactly one** name per (dish, language): the
endonym when the dish has one there, else the exonym, else the
romanization. The post-assertion enforces it.

# The read path

The live API serves them:

```
GET /api/dishes/pho-vietnamese?language=vi
```

- `dish.name` — the primary name for the requested locale
- `dish.names` — every name, with its kind, script and primary flag
- `dish.availableNameLanguages` — the languages the dish has a name in,
  for the language switcher

# The gate it went through

| step | result |
|---|---|
| backup | `gustale_pre_0024_20261029T081229Z.dump` — 2.2MB, verified: 65 `TABLE DATA` entries |
| dry-run on an exact copy | ✅ 1,373 names; the second apply skipped cleanly |
| live apply | ✅ |
| live verify | ✅ 1,373 names · 121 dishes · 37 languages |
| one primary per (dish, language) | ✅ 0 violations |
| post-assertions | ✅ |
| CI chain test | ✅ `FULL_CI_CHAIN_OK=1`, 65 tables |

# What is NOT in layer 2

- **The romanization kind is defined but unused.** P2561 is rare on
  dish items — none of the 121 carries one — so there are 0
  romanization rows. The column, the kind and the CHECK constraint are
  all in place for when they arrive.
- **The routing and UI** are layer 3: `/{locale}/dishes/{slug}`,
  hreflang, the per-locale sitemaps, the browser-language suggestion,
  the RTL handling and the Noto fonts.
- **The prose** is layer 3 as well: sentence-level description
  translation, with the evidence anchors inherited from the English
  source sentence, the source hash, the stale flag and the review
  workflow.

The API is ready for all of it: it already accepts `?language=`,
resolves it to a supported locale, reports the locale it served
alongside the one requested (so the client can show the English
fallback notice), and returns the vocabulary labels and the dish names
in that locale.
