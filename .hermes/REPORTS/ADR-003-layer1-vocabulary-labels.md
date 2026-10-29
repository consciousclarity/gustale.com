# ADR-003 layer 1 — the vocabulary labels, as built

**Status:** 🟢 **DONE — applied live and deployed 2026-10-29.**
**Rule:** `decided-by: hermes` for the schema choice (see the design
note) and for each judgement call below.

# What layer 1 delivers

Every controlled-vocabulary label — families, cuisines, techniques,
ingredients, traditions, contexts, predicates, places — is now
translated **once per locale**.

| | |
|---|---|
| labels written | **35,871** |
| vocabularies | 9 |
| non-English locales | **9** — `es de fr pt id zh ja ar hi` |
| distinct values with a translation | 4,383 |
| English rows in `vocabulary_labels` | **0** — English stays in each base table |

| vocabulary | labels | values |
|---|---|---|
| region (places) | 30,186 | 3,500 |
| tradition | 1,811 | 380 |
| country (places) | 1,787 | 200 |
| cuisine | 1,090 | 170 |
| family | 487 | 62 |
| ingredient_category | 266 | 36 |
| technique | 183 | 27 |
| context | 37 | 5 |
| predicate | 24 | 3 |

The labels are real Wikidata labels (CC0), not machine translations:

```
zh: 日本料理    ja: 墨西哥料理    ar: مطبخ ياباني
hi: जापानी व्यंजन   de: japanische Küche   fr: cuisine japonaise
id: Masakan Jepang    pt: Culinária do Japão   es: gastronomía de Japón
```

# The read path

The live API serves them today:

```
GET /api/dishes/bakso?language=id
```

```
locale served: id | requested: id
dimensions:
   cuisine      indonesian    masqueran Indonesia
   family       soup          kuah
   technique    boiling       direbus hingga mendidih
   technique    simmering     dipanaskan dalam air
unsetDimensions:
   context / no_evidence
   ingredient_category / no_evidence
   tradition / no_evidence
```

Three behaviours, all as the ADR specifies:

- **English** — the base table's own label. `vocabulary_labels` holds
  only the other nine locales, and migration 0021's post-assertion
  enforces that no English row is ever written.
- **English fallback with notice** — an unsupported language serves
  English *and* reports both `locale` (served) and `requestedLocale`
  (asked for). The client shows the notice because they differ; English
  is never silently served under a Japanese URL.
- **The unset dimensions come back too**, so the UI can say "no
  evidence" rather than showing nothing.

# The schema decision

**One `vocabulary_labels` table, not eleven sibling `*_translations`
tables.** The ADR proposed siblings; the design note
(`.hermes/REPORTS/ADR-003-layer1-vocabulary-labels.md`) records why:

- the query is identical for every vocabulary, so one shape means one
  query in the API, the web layer and the SEO code;
- the four sibling tables the project already has are all **empty** —
  schema without data — so this is the forward shape rather than a
  fifth copy of an unused one;
- "translate once per locale" becomes one pass over one table.

The four existing tables stay where they are: empty, possibly
referenced by API code, and removing published schema needs the user's
approval.

# Three problems the dry-runs caught

Each of these would have shipped broken.

## 1. The unique index on `wikidata_id` refused correct data

The first dry-run died on `duplicate key value violates unique constraint
"dish_families_wikidata_id_key"`. The vocabulary contains near-synonym
pairs that Wikidata models as **one** item:

| project values | Wikidata item |
|---|---|
| biscuit / cookie | Q13266 |
| dessert / pudding | Q182940 |
| grilling / roasting | Q264619 |
| chilling / freezing | Q95598885 |
| broth / stock | Q275068 |
| aceh / acehnese cuisine | Q12480249 |
| bali / balinese | Q15617493 |

and eight more pairs among the traditions. These are *distinct values
in the project's vocabulary* — a dish can be a "biscuit" and not a
"cookie" — and each needs its own label row.

The index is now **non-unique**, which is also how `dish_traditions.source`
already worked (it holds shared QIDs for eight such pairs).

## 2. The server died on the first load

The first attempt inserted all 35,871 rows in **one** statement, with a
subquery per row to resolve the value's id. The connection was killed
mid-statement:

```
psql:<stdin>:36548: server closed the connection unexpectedly
```

36,000 subqueries in a single `INSERT` is more than Postgres will plan.
The load now **stages** the rows in a temp table and resolves them **per
vocabulary** — faster, and checkable: a staged row whose key does not
resolve is dropped rather than left dangling.

## 3. The idempotency guard was written backwards

It was true when the labels were *already* there, so the migration
skipped on a fresh database and printed "already applied" on the very
first apply. The dry-run showed it immediately. The guard is now true
when the migration still **needs** to run.

# The QID resolution

5,218 vocabulary values across the nine vocabularies. **4,223 already
had a Wikidata QID** — every place (`geo_entities.wikidata_id`), and
418 of the 433 traditions (`dish_traditions.source`). The rest were
resolved, reaching **5,532**.

The matching is conservative on purpose: a wrong QID means a wrong
label in *every* locale at once. Three things make it safe:

1. **The search is scoped by suffix.** A search for "Thai" returns the
   country, the language and the script — never the cuisine. A search
   for "Thai cuisine" returns exactly one right answer. So each
   vocabulary appends a suffix before searching.

2. **The candidate's class is confirmed**, accepting `P31` *or* `P279`.
   "Thai cuisine" is not `P31 cuisine` — it is `P31 national cuisine`
   (Q1968435) and `P279 Southeast Asian cuisine`. Matching on `P31`
   alone would reject every cuisine.

3. **A candidate that fails the check is rejected** and the value is
   left with no QID. An absent QID is honest; a wrong one is not.

The class QIDs were **looked up, not guessed**. The first attempt
guessed them and got back *Zygmunt Vogel* for "cooking method" and
*Sudanian Grass Rat* for "food material" — and then rejected 53 of the
65 cooking techniques, because "boiling" (Q20074315) and "baking"
(Q720398) are `P31 food preparation technique` (Q1039303) and
`process`, not "cooking technique".

The resolver is also **resumable**: it keeps the QIDs a previous run
resolved and retries only the misses, which made the class correction
cost 11 new resolutions instead of another full pass over the API.

# The remaining gaps are real

- **80 cuisines** have no Wikidata item at all — "Algerian cuisine"
  returns an empty search. There is no label to translate, so those keep
  their English label and fall back. That is the ADR's fallback
  behaviour, not a gap in the fetch.
- **399 ingredient categories** and **26 contexts** likewise. The
  FoodOn-derived ingredient categories mostly have no Wikidata
  counterpart — FoodOn and Wikidata are different ontologies.

A follow-up could resolve these through **Wikidata label aliases** and
**cross-language sitelinks** (a category named "root vegetable" has
labels on the Wikipedia articles for each language). That is the
natural next step for widening coverage, and it is where the "machine"
source in `vocabulary_labels.source` would earn its place.

# The gate it went through

| step | result |
|---|---|
| backup | `gustale_pre_0022_20261029T074345Z.dump` — 874KB, verified: 65 `TABLE DATA` entries |
| dry-run on an exact copy | ✅ 35,871 rows; the second apply skipped cleanly |
| live apply | ✅ |
| live verify | ✅ 35,871 labels, 9 locales, 0 English rows, 9 vocabularies |
| CI chain test | ✅ `FULL_CI_CHAIN_OK=1` |
| CI deploy | ✅ green, including the deploy and the "Real verify" check |
| live API check | ✅ the translations above, served by `api.gustale.com` |

# What is NOT in layer 1

Layer 1 is the **vocabulary** layer. The following are the other layers
and are not done:

- **Layer 2** — the `dish_names` table (endonym / exonym /
  romanization, one canonical name per locale).
- **Layer 3** — the prose: sentence-level description translation, with
  the evidence anchors inherited from the English source sentence, the
  source hash, the stale flag and the review workflow.
- **The routing and UI** — `/{locale}/dishes/{slug}`, hreflang, the
  per-locale sitemaps, the browser-language suggestion, the RTL
  handling and the Noto fonts. The API is ready for it: it already
  accepts `?language=` and reports the locale it served.
