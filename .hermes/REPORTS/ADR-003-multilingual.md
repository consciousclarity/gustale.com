# ADR-003 — Multilingual

**Status:** 🟢 **DECIDED (Alejandro, 2026-10-29).** Three layers.
**Layers 1 and 2 are DONE** — applied live and deployed 2026-10-29.

- **Layer 1 — vocabulary labels:** 35,871 labels across 9 vocabularies
  and 9 locales. See
  `.hermes/REPORTS/ADR-003-layer1-vocabulary-labels.md`.
- **Layer 2 — `dish_names`:** 1,373 names across 121 dishes and 37
  languages. See `.hermes/REPORTS/ADR-003-layer2-dish-names.md`.

**Layer 3a (routing and the locale UI) is DONE** — deployed live
2026-10-29. 1,089 locale pages (121 dishes × 9 locales), reciprocal
hreflang on every page, 10 per-locale sitemaps plus an index, the
browser-language suggestion (never forced), the English-fallback
notice, RTL, and 747 self-hosted Noto faces. See
`.hermes/REPORTS/ADR-003-layer3a-routing-ui.md`.

**Layer 3b (the prose) is DONE.** The English descriptions are stored
as **313 sentences** (ADR-002 Q9's structured sentence table), each is
translated individually, and the translation **references** its English
source — so it inherits the source's claim anchors instead of copying
them. The **source hash** is of the English *sentence*, so editing one
sentence invalidates exactly that translation and leaves the other 312
alone. `stale` is an **overlay flag**, not a status: a stale reviewed
translation is still reviewed. Contributor corrections go through the
moderation path, and an accepted correction becomes the reviewed text.
The API serves the prose with the **"machine-translated"** badge. See
`.hermes/REPORTS/ADR-003-layer3b-prose.md`.

The nine locales are being translated. The translations are
machine-produced, so they carry `status = 'machine'` and the badge;
a human correction promotes them to `reviewed`.

The review and moderation SURFACE — the admin view where a moderator
sees the machine translations, accepts or rejects a correction, and
the stale queue — is the last piece, and is not yet built.

**Scope:** gustale.com and gustale.recipes. Same API, same data.

---

## 1. The decision

Multilingual support is **three layers**, built in this order:

| # | Layer | What it covers | Why it is a separate layer |
|---|---|---|---|
| **1** | **Vocabulary labels** | Every controlled-vocabulary label — families, cuisines, techniques, ingredients, traditions, contexts, predicates, places — translated once per locale | Makes **every dish page multilingual in structure** without touching dish content. The vocabulary is the shared spine; if it is monolingual, a translated dish page still shows English dimension names. |
| **2** | **`dish_names`** | A new table: `(dish, language, script, name, kind, is_primary)` | A dish can have several names in one language (endonym, exonym, romanization) and one canonical name per language. The existing `dishes.name` cannot express that. |
| **3** | **Prose** | Description sentences, per sentence | English is canonical; evidence anchors stay on the English sentence. Translations inherit the source sentence's anchors. |

**Order of work:** labels → names → routing/UI → sentence translation → review.

## 2. Layer 1 — vocabulary labels

Translate every vocabulary label **once per locale**, not per use.

- **Source:** Wikidata labels (CC0) where available; otherwise the project's own English label.
- Wikidata is CC0, so labels including native labels are free to use. Wikipedia prose is CC BY-SA and is **not** used as a label source.
- Every vocabulary table gets a sibling `*_translations` table of the same shape the project already uses for `categories`, `ingredients` and `preparation_methods`:

  ```
  <table>_translations(id, <value>_id, language, name, created_at)
  ```

- One row per (value, locale). The English row is the project's existing label, so **English is never duplicated** — it stays in the base table and the translations table holds only non-English locales.

### Locales

**Core set:** `en`, `es`, `de`, `fr`, `pt`, `id`, `zh`, `ja`, `ar`, `hi`

**Plus** each dish's own language, where it differs from the core set (e.g. a dish with a Greek name adds `el`).

The core set is a floor, not a ceiling: the per-dish language rule can add locales the core set omits.

## 3. Layer 2 — `dish_names`

New table:

```
dish_names(
  id,
  dish_id       REFERENCES dishes(id),
  language,
  script,                       -- e.g. 'Latn', 'Cyrl', 'Arab', 'Hans', 'Hant', 'Jpan'
  name,
  kind,                         -- 'endonym' | 'exonym' | 'romanization'
  is_primary,                   -- the canonical name for that (dish, language)
  created_at
)
```

- **Seeded from Wikidata** (CC0): P1705 (native label), P1448 (official name), P2561 (romanization), plus the English article title.
- `is_primary` picks one name per (dish, language) — the endonym when it exists, else the exonym.
- `script` is stored explicitly because it drives **font selection** and **Romanization detection**, and because a dish may be spelled in several scripts across languages.

## 4. Layer 3 — prose (description sentences)

### English is canonical

- The English description is the **canonical** text.
- **Evidence anchors stay on the English sentence.** A claim's excerpt, anchor and stance belong to the English sentence they were extracted from — they are not re-extracted per translation.

### Per-sentence translation

- The description is stored as **sentences**, and each sentence is translated individually.
- Translations **inherit the source sentence's claim anchors**: the translated sentence references the same `statement_id` / claim as its English source. The anchor text stays English (it is a verbatim excerpt of the source); the surrounding sentence is translated.

### Staleness

- Store a **source hash** per translated sentence.
- When the English source sentence changes, its hash changes, and the translation is marked **stale**.
- A stale translation is **auto-retranslated on change** (queued, not blocking).

### Status machine and review

- Each translated sentence carries a status: `draft` → `machine` → `reviewed`, with `stale` as an overlay flag.
- Translated sentences are badged **"machine-translated"** in the UI unless they are `reviewed`.
- **Contributor corrections** go through the existing moderation path — a contributor proposes a correction, a moderator accepts it, and the correction becomes the `reviewed` text.

## 5. Routing, URLs and locale handling

| Concern | Decision |
|---|---|
| **URL shape** | `/{locale}/dishes/{slug}` |
| **Slugs** | **Stable** — the slug does not change with locale. `/{locale}/dishes/masala-dosa` for every locale. Transliteration is a display concern, never a URL concern. |
| **hreflang** | Emitted for every locale × dish, plus `x-default` pointing at the English URL. Reciprocal (`es` → `en` and `en` → `es`) on every page. |
| **Sitemap** | **Per-locale** sitemap, referenced from `sitemap.xml` by index. |
| **Browser language** | **Suggest, not force.** A locale chooser or a banner offers the detected locale; the page renders in English unless the user chooses. No automatic redirect that hides content. |
| **English fallback** | If a page or sentence has no translation, fall back to **English and say so** — an explicit notice, not a silent swap. |
| **RTL** | `ar` (and any future RTL locale) renders RTL: `dir="rtl"`, logical CSS properties, mirrored layout. |
| **Fonts** | **Noto** — Noto Sans / Noto Serif for Latin, plus the Noto family for CJK (`Noto Sans SC/JP`), Arabic (`Noto Naskh Arabic`) and Devanagari (`Noto Sans Devanagari`). Self-hosted, subset per locale. |

### `dish_translations` reuse vs. a new table — **decision**

**Decision: add `description_sentence_translations`; do NOT reuse `dish_translations` for prose.**

Reasoning:

- `dish_translations` is **dish-level** `(dish_id, language, name, description)` with **121 rows, one language** (English). It cannot express per-sentence granularity, per-sentence source hashes, per-sentence status, or a claim anchor per sentence. Retrofitting it would mean adding columns that are meaningless for the English rows it currently holds.
- The ADR-002 claims model puts evidence at the **sentence** level. A translation must inherit **its source sentence's** anchors, so translation granularity has to match evidence granularity.
- `dish_translations` keeps its job: the dish-level name and description **overview**. Its `name` column is superseded for display purposes by `dish_names` (layer 2), which can hold several names per language.

So:

| Table | Layer | Grain | Status |
|---|---|---|---|
| `dish_translations` | existing | dish × language (name, description) | **kept**, used for the description overview; `name` deprecated in favour of `dish_names` |
| `vocabulary_labels` | 1 | vocabulary × value × language | **new — DONE** (35,871 rows, live) |
| `dish_names` | 2 | dish × language × name-kind | **new — DONE** (1,373 rows, live) |
| `description_sentence_translations` | 3 | source sentence × language | **new** |

**Open dependency (recorded, not blocking):** the instruction says *"Reuse `dish_translations` (after GUS-239 archive)"*. **GUS-239 does not exist** in `.hermes/BACKLOG.yaml` or anywhere in `.hermes/` — there is no archive step to wait for, and `dish_translations` currently holds the live English descriptions for all 121 dishes. The decision above is therefore made on the schema's merits rather than on a GUS-239 dependency. If a GUS-239 archive task is later created and does archive `dish_translations`, this decision stands: the prose layer needs its own sentence-level table either way.

## 6. Why this order

1. **Labels first** — the vocabulary is the shared spine. Until "technique" reads "technique" in every locale, a translated dish page is still half-English, and no amount of sentence translation fixes that.
2. **Names second** — a dish's own name is more visible than its dimensions, and `dish_names` is what lets `/es/dishes/masala-dosa` show "Masala dosa" rather than a transliteration artefact.
3. **Routing/UI third** — `/{locale}/…` routing, hreflang, per-locale sitemaps and the RTL/font work need layers 1 and 2 in place to have anything to route to.
4. **Sentence translation fourth** — the most expensive layer, and the one that needs the status machine and review flow around it.
5. **Review last** — the moderation surface only becomes useful once there is machine-translated content to correct.

## 7. Decisions recorded

- **decided-by: hermes (2026-10-29) — layer 1 uses ONE
  `vocabulary_labels` table, not eleven sibling `*_translations`
  tables.** The query is identical for every vocabulary, so one shape
  means one query in the API, the web layer and the SEO code; the four
  sibling tables the project already has are all empty, so this is the
  forward shape rather than a fifth copy of an unused one; and
  "translate once per locale" becomes one pass over one table. The
  four existing tables are left in place — removing published schema
  needs the user's approval.
- **decided-by: hermes (2026-10-29) — the `wikidata_id` columns are
  NOT unique.** The vocabularies contain near-synonym pairs that
  Wikidata models as one item (biscuit/cookie, dessert/pudding,
  grilling/roasting, broth/stock, and eight pairs among the
  traditions). Each is a distinct value in the project's vocabulary and
  each needs its own label row. This is also how `dish_traditions.source`
  already worked.
- **decided-by: hermes (2026-10-29) — a vocabulary value with no
  confident Wikidata match gets NO label and no QID.** An absent label
  is honest; a wrong one is not, and a wrong QID would put a wrong
  label in every locale at once. Those values keep their English label
  and fall back, which is the ADR's own fallback behaviour.
- **decided-by: hermes (2026-10-29) — `dish_names.script` is
  nullable.** The ADR lists it as a plain column. A name whose script
  is genuinely unknown should say so rather than guess. Every name we
  have does carry one, but the column must not force a lie.
- **decided-by: hermes (2026-10-29) — `dish_names.kind` is a CHECK
  constraint**, not a free text column, so a bad kind cannot be
  written.
- **decided-by: hermes (2026-10-29) — the API accepts any valid
  BCP-47 locale, not only the core ten.** The ADR says the core set
  is "a floor, not a ceiling", and the dish names prove it: a dish
  has a name in Tagalog, Vietnamese, Korean, Greek, Thai and more.
  The core list is what the site guarantees labels for; anything else
  falls back per-value, and the API reports the locale it served so
  the client can show the notice.


- **decided-by: hermes** — the three-layer split, the locale core set, and the order of work. All from the instruction.
- **decided-by: hermes** — `description_sentence_translations` over reusing `dish_translations`, for the schema reasons in §5.
- **decided-by: hermes** — "suggest, not force" the browser locale, and make the English fallback **explicit** rather than silent. Reason: a reference work must never silently show content in a language the reader did not ask for, and a silent fallback is indistinguishable from a missing translation.
- **decided-by: hermes** — store `script` explicitly on `dish_names`. Reason: it drives font selection and romanization detection, and the project already needs the Noto families per script (§5).

## 8. Not yet decided

- Which translation engine is used for machine translation, and who pays for it (**money** — needs Alejandro).
- The review queue's moderation surface: reuse the existing contributor moderation, or a dedicated one.
- Whether the `dish_cuisine_translations` table (already referenced in the GUS-242 plan) is the same shape as the new vocabulary translation tables, or whether it is replaced by them.
