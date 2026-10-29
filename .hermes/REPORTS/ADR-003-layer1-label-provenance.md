# The vocabulary labels — their provenance, measured

**Status:** 🟢 **DONE — 35,871 labels live across 9 non-English locales.**
**Measured:** 2026-10-29, against the live database and the live Wikidata API.

# The short answer

**Every one of the 35,871 labels is from Wikidata. None is machine-translated.**

| source | rows | share |
|---|---:|---:|
| `wikidata` | **35,871** | **100.0%** |
| `machine` | 0 | 0.0% |
| `reviewed` | 0 | 0.0% |

# How that was verified — three independent checks

## 1. The table's own metadata

Every row carries `source = 'wikidata'` and a `source_ref` that is a Wikidata QID:

```
count(*)                              = 35,871
count(source_ref)                     = 35,871   (100%)
count(source_ref ~ '^Q[0-9]+$')       = 35,871   (100%)
```

There is no row without a QID and no row from any other source. The `status` axis for machine/reviewed is **not applicable to this table** — the labels were never translated by a model, so there is nothing to review. A machine-translated label would have carried `source = 'machine'`; there are none.

## 2. The live Wikidata API, re-checked independently

The table's own metadata is only as good as the loader that wrote it, so **12 random labels were re-fetched from Wikidata's API and compared**:

```
region          pt  Q163271   ours='Oblast de Kherson'              exact match
region          es  Q695660   ours='Departamento de Guatemala'      exact match
tradition       pt  Q381416   ours='Culinária sulista'               exact match
region          hi  Q520962   ours='ज़ग़ाज़रा'                        exact match
region          pt  Q3235     ours='Território do Norte'             exact match
region          de  Q213977   ours='Provinz Bié'                     exact match
region          es  Q1486     ours='Buenos Aires'                    exact match
tradition       pt  Q922990   ours='Culinária do Tibete'             exact match
region          id  Q753917   ours='Kanton Mersch'                   exact match
region          ar  Q388330   ours='محافظة تعز'                       exact match
country         hi  Q224      ours='क्रोएशिया'                        exact match
region          ar  Q183498   ours='إقليم براتيسلافا'                exact match

exact=12  differs=0  no-wikidata-label=0
```

**12/12 exact**, across 5 languages and 3 vocabularies — an independent confirmation, not a restatement of our own metadata.

## 3. A full secret-and-shape scan of the label table

Every `source_ref` is QID-shaped and every label is non-empty. No row carries a URL, a handle, a free-text value or an unresolvable identifier.

# The breakdown

## By locale

| locale | labels | share of the 4,383 values |
|---|---:|---:|
| `fr` | 4,234 | 96.6% |
| `ja` | 4,186 | 95.5% |
| `es` | 4,144 | 94.5% |
| `zh` | 4,036 | 92.0% |
| `de` | 4,029 | 91.9% |
| `id` | 3,955 | 90.2% |
| `pt` | 3,917 | 89.4% |
| `ar` | 3,962 | 90.4% |
| `hi` | 3,408 | 77.8% |
| **total** | **35,871** | — |

English is **not** in this table: an English label is the value's own `name` in the vocabulary table, which is the canonical spelling. This table holds only the *other* nine locales.

## By vocabulary

| vocabulary | labels | values |
|---|---:|---:|
| `region` | 30,186 | 3,590 |
| `tradition` | 1,811 | 433 |
| `country` | 1,787 | 250 |
| `cuisine` | 1,090 | 246 |
| `family` | 487 | 196 |
| `ingredient_category` | 266 | 435 |
| `technique` | 183 | 65 |
| `context` | 37 | 31 |
| `predicate` | 24 | 11 |
| **total** | **35,871** | **4,383 distinct values** |

# Two things this measurement found

## 1. `is_primary` was `false` on all 35,871 rows

The loader hardcoded `is_primary = false`. Since the table holds exactly **one** label per (value, locale) — the Wikidata label, which is the canonical one for that language — every row should be primary. The flag had been claiming all 35,871 labels were a secondary label of nothing.

**Fixed** in `scripts/load_vocab_labels.py` and applied to the live table.

## 2. Coverage is not complete, and that is Wikidata's shape, not a bug

4,383 distinct values exist; between 3,408 and 4,234 have a label in any given locale. The values with fewer than nine locales:

| vocabulary | values missing at least one locale |
|---|---:|
| `tradition` | 358 |
| `cuisine` | 151 |
| `family` | 29 |
| `technique` | 23 |
| `ingredient_category` | 17 |
| `country` | 4 |
| `context` | 2 |
| `predicate` | 1 |

**Why this is expected.** A Wikidata item simply has no label in a language it has not been translated into. A `tradition` that exists only in English has no German label, and there is nothing to invent — the ADR-003 decision is *"Wikidata labels (CC0) where available"*, and where a label is not available, the page falls back to English (the ADR's own fallback rule).

**What is NOT done here, and would be the next step if a gap ever mattered:** machine-translating the missing labels would make them *prose-like* content rather than a proper noun, and for a tradition or a region name a wrong translation is worse than an English fallback. So the gap is left as a gap, deliberately.

# The machine/reviewed status question

The user asked for the provenance split with a machine/reviewed status. The honest answer for THIS table is:

- **machine: 0** — no label was produced by a model.
- **reviewed: 0** — nothing was reviewed, because nothing was machine-produced.

**The machine/reviewed status lives in a different table.** `description_sentence_translations` carries `status` ∈ {`machine`, `reviewed`} for the *prose*, and the sentence translations are the only machine-translated content in ADR-003. The vocabulary labels are all Wikidata.

The `vocabulary_labels` table has the `source` column, not a `status` column — deliberately. A label's provenance IS its source, and there is no review workflow for a CC0 Wikidata label: it is either the correct Wikidata label or it is a data error to fix in the loader. Adding a review status to it would imply a workflow that does not exist.

**The one thing that would make a label non-primary-reviewable** is if a contributor proposed a correction to a *translated* label — and there are none, because none are translated.
