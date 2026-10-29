# ADR-003 layer 1 — vocabulary labels: implementation design

**Status:** 🔵 In progress. **Decision date:** 2026-10-29.
**Rule:** `decided-by: hermes` for the schema choice below, which the ADR
left open ("Every vocabulary table gets a sibling `*_translations`
table").

# What layer 1 has to cover

The ADR's scope: *"Every controlled-vocabulary label — families,
cuisines, techniques, ingredients, traditions, contexts, predicates,
places — translated once per locale."*

The live counts, after 1e and 1f:

| vocabulary | table | rows |
|---|---|---|
| families | `dish_families` | 196 |
| techniques | `dish_techniques` | 65 |
| traditions | `dish_traditions` | 433 |
| cuisines | `dish_cuisines` | 246 |
| contexts | `dish_contexts` | 31 |
| ingredient categories | `ingredient_categories` | 435 |
| places | `geo_entities` | 3,849 |
| predicates | `relation_types` | 7 |
| ingredients | `ingredients` | 5 |
| categories | `categories` | 152 |
| preparation methods | `preparation_methods` | 18 |
| | **total** | **~5,437** |

At ten locales that is ~54,000 label rows — so the *shape* of the
table matters far more than the row count.

# The decision: one unified table, not sibling tables

The ADR proposed a sibling `*_translations` table per vocabulary, and
the project already has four of them (`category_translations`,
`dish_cuisine_translations`, `ingredient_translations`,
`preparation_method_translations`). Following that pattern would mean
**eleven more tables** for the vocabularies that lack them.

**decided-by: hermes — one `vocabulary_labels` table, not eleven
sibling tables.**

Reasoning:

1. **The query is the same for every vocabulary.** The site needs "give
   me the label for this vocabulary value in this locale". With sibling
   tables that is eleven different queries and eleven different
   joins — in the API, in the web layer, and in the sitemap/SEO code.
   With one table it is one query against one shape.

2. **The existing sibling tables are empty.** All four have **0 rows** —
   they are schema without data. The project's multilingual layer was
   scaffolded and never populated. Building eleven more of the same
   shape would be reproducing a shape that has not once been used.

3. **It is the only shape that supports "translate once per locale"
   across vocabularies.** A label table keyed by (vocabulary, value_id)
   means the translation job is one pass over one table: fetch the
   value's Wikidata QID, fetch the label in each locale, write one
   row. With sibling tables that is eleven separate jobs with eleven
   separate code paths.

4. **Vocabulary values do not all share a key type.** `geo_entities`
   and `relation_types` have no `id`-style foreign-key relationship to
   a shared parent, and `geo_entities` is the largest vocabulary by
   far. A single table with a `(vocabulary, value_key)` pair handles
   all of them uniformly.

The cost of this choice is that the existing four sibling tables stay
where they are. They are not migrated or deleted in layer 1: they are
empty, they may have API code that references them, and removing
published schema needs the user's approval. The new table is the
forward path.

# The table

```sql
CREATE TABLE vocabulary_labels (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vocabulary   text NOT NULL,      -- 'family' | 'technique' | ...
  value_id     uuid NOT NULL,      -- the row's id in its own table
  language     text NOT NULL,      -- BCP-47 ('es', 'zh-Hans', 'pt-BR')
  name         text NOT NULL,
  is_primary   boolean NOT NULL DEFAULT false,
  source       text,               -- 'wikidata' | 'project' | 'machine'
  source_ref   text,               -- the Wikidata QID
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (vocabulary, value_id, language)
);
```

Plus a lookup index on `(vocabulary, language)` and on `value_id`.

**Why `language` and not `locale`.** The ADR says "locale", but the
project's existing four translation tables all use `language`, and
`dish_translations.language` holds plain BCP-47-ish codes (`en`, `es`).
Matching the established column name and shape means the API and the
web layer can use one query shape for all of it. Locale-specific
variants are expressed as `es-MX`, `zh-Hans`, which is valid BCP-47
and sorts correctly.

**Why `is_primary`.** A value can have more than one label in a
language: the endonym (`Gado gado` in `id`) and a romanization
(`Gado-gado` in `id-Latn`). `is_primary` marks the one to show. It is
also what makes the "one canonical name per locale" rule from layer 2
consistent with layer 1.

**Why `source` and `source_ref`.** ADR-003 requires that provenance be
knowable — a label from Wikidata (CC0) is free to use; a machine
translation is not the same thing and must be marked as such. `source_ref`
holds the Wikidata QID so a label can be re-checked or re-fetched.

# The label sources, in order of preference

1. **Wikidata** (CC0) — `wbgetentities` with `props=labels`, using the
   value's QID. Where the vocabulary row already carries a Wikidata QID
   (`geo_entities.wikidata_id`, `dish_cuisines.wikidata_id`,
   `dish_families.foodon_id` → not a Wikidata QID), that is the source.
2. **The project's own English label** — for the base row's locale.
3. **A curated locale mapping** — for values with no Wikidata QID
   (the FoodOn-derived ingredient categories, for instance).

The base tables keep their English `name`. **English is not duplicated**
into `vocabulary_labels` — the ADR is explicit that English stays in the
base table. `vocabulary_labels` holds only non-English locales.

# Which locales

The core set: `en`, `es`, `de`, `fr`, `pt`, `id`, `zh`, `ja`, `ar`, `hi`.
`en` is the base table, so `vocabulary_labels` covers the other nine.

Plus each dish's own language, where it differs. That is derived from
`dishes` and grows the locale set as the catalog does.

# What layer 1 does NOT do

- It does not touch dish prose — that is layer 3.
- It does not add `dish_names` — that is layer 2.
- It does not change any URL or add routing — that is layer 3's UI
  step.
- It does not remove the four existing empty sibling tables.

# The order of work

1. The table + the migration (with the CI guard and the count
   assertions the other GUS-242 migrations use).
2. Fetch the Wikidata QIDs for the vocabulary values that have them.
3. Fetch the labels for the nine non-English locales.
4. Curate the values with no QID.
5. Wire the API to read the labels.
6. Wire the web layer to render them.

Steps 2 and 3 are the long pole: ~5,437 values × 9 locales. Wikidata's
`wbgetentities` allows 50 entities per call and returns all locales in
one response, so that is ~109 calls for every locale at once — which is
well within the API's normal use.
