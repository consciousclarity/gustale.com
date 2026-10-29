# ADR-002 — The claims model

**Status:** 🟢 **Q1 to Q13 ALL DECIDED. Nothing implemented yet — no schema change.** Q12 and Q13 decided by hermes on 2026-10-29 (Q12 by delegation from Alejandro via RULES.md §2; Q13 the same). The next step is the **pilot**: the schema, then the 3 pilot dishes (`rendang`, `chicken-tikka-masala`, `tacos-al-pastor`) per the GUS-014 pass/fail spec.
**Date:** 2026-10-26 · **Task:** GUS-027 (source registry) + GUS-028 (claim-level citations)
**Related:** ADR-001 (canonical entity model), GUS-026 (editorial evidence policy — *draft, still awaiting Alejandro's decisions*)

---

## Why this ADR exists

ADR-001 established the canonical entity model and made `claims` the **evidence atom**. It did not decide the claim schema.

Three things are now blocked on it, and none can be filled from evidence until it exists:

| blocked | why |
|---|---|
| `dish_tradition` — 0 of 118 set | `dish_tags` is empty (0 rows). There is no tradition signal anywhere in the catalog. A tradition is a cultural claim; it needs a claim. |
| `ingredient_category` — 0 of 118 set | `dish_ingredients` has 4 rows catalog-wide. Ingredient claims need evidence. |
| `dish_context` — 10 of 118 set | The old categories table has no context dimension. "Where is this eaten" is a claim about practice. |
| relation sourcing — 0 relation-level citations | `dish_relations` has no source column. Every relation claim is unverified **by construction**. |

And 9 technique values are currently tagged `provenance='description-derived', status='provisional'` — inferences from prose, not facts, awaiting a claim.

**ADR-002 decides the claim model. The pilot runs on the 3 reference dishes afterwards.**

---

## What already exists (the starting point)

ADR-002 does not start from nothing. The catalog already has:

```sql
sources (
  id uuid pk, source_type text, title text, authors text[], year int,
  publisher text, isbn text, doi text, url text, archive_name text,
  archive_catalog_id text, citation_text text, language text,
  reliability text, created_at timestamptz, created_by text
)

citations (
  id uuid pk, source_id uuid -> sources,
  target_type text, target_id uuid, claim_text text,
  location text, added_by text, added_at timestamptz
)
```

**Current live state:**

| | |
|---|---|
| `sources` rows | 142 |
| `source_type` | `web` — **142 of 142** |
| `reliability` | `secondary` — **142 of 142** |
| `language` | `en` — **142 of 142** |
| `citations` rows | 121, **all** `target_type='dish'` |
| `citations.claim_text` | 121 **distinct** strings — one prose sentence per dish, not per fact |
| `citations.location` | 121 of 121 populated (e.g. "Lead paragraph") |
| sources per dish | exactly **1** — the catalog is 100% Wikipedia-only (GUS-011) |

**What `claim_text` is today:** a whole-description sentence, e.g. for Moussaka:

> *"Moussaka is a dish popular in Greece, the Balkans, and the Levant."*

That single string asserts **three** separable facts (it is a dish; it is popular in Greece; it is popular in the Balkans and the Levant). Under ADR-001 D6, those are three claims, and only one source supports all three — so the present model cannot count coverage or corroboration at all. That is the gap ADR-002 closes.

**GUS-026 (draft) has already decided**, and ADR-002 must implement rather than re-litigate:

- **Source classes S1–S7** — S1 primary historical · S2 scholarly · S3 institutional · S4 practitioner · S5 specialist · S6 reference (Wikipedia) · S7 unverified. S6 is *"discovery and terminology only"*; S7 is *"nothing"*.
- **Claim classes** — `documented` · `scholarly_interpretation` · `oral_tradition` · `disputed` · `hypothesis` · `unsupported`.
- **The Wikipedia rule** — a `documented`/`disputed` claim with an origin predicate (`originated_in` / `originated_at` / `created_by` / `named_after`) must have ≥1 S1/S2/S3/S5 source. S6 may accompany but not stand alone.
- **Independence** — *"If this source were deleted, would the other still say the same thing?"* Sources sharing an upstream reference count as **one**.
- **Verification states** — `draft` → `research_pending` → `under_review` → `verified` → `published`, with `disputed` and `needs_revision` branches.

---

## The questions

Each question states a decision, my **recommendation**, the reason, and an **alternative**. Questions are numbered and the list is frozen once Q1 is answered — as with ADR-001.

---

### ✅ Q1 — DECIDED (Alejandro, 2026-10-26): the Wikidata-model statement

**A claim is a *statement*: `(subject, predicate, value)` + qualifiers + references — the Wikidata model.**

```
statement = (subject, predicate, value)
             + qualifiers (place, period, variant, occasion)
             + references (the evidence links)
```

**The decision, as amended:**

| part | rule |
|---|---|
| **shape** | `(subject, predicate, value)` + qualifiers + references — the **Wikidata model** |
| **qualifiers** | `place`, `period`, `variant`, `occasion` — the scoping dimensions that make one statement true in a specific context |
| **references** | the evidence links hang off the statement, not on a separate text blob |
| **predicates** | a **controlled vocabulary**, taken **verbatim**; **new predicates only by explicit decision** |
| **values** | **typed**: either an **entity reference** (dish / vocabulary value / place) or a **typed literal**. **Free text only as a marked exception** |
| **evidence passage + locator** | live on the **evidence link**, not on the claim. *(The exact shape of that link is a later question.)* |

**What this settles.** The claim is the atom; the text is not the atom. Every metric ADR-001 promised becomes computable because each statement has one addressable proposition, and the qualifiers are what let one proposition be true in one context and false in another — the Glasgow case being the canonical example (*"originated in Glasgow"* scoped by `period`, competing with *"originated in the subcontinent"* scoped by the same `period`).

**The consequence I want recorded explicitly:** because predicates are controlled and values are typed, **most statements cannot be free prose.** A statement is `subject + predicate + typed value`, and it is either well-formed for that predicate or it is rejected. That is the point: it is what stops a claim row quietly becoming prose again, which is the failure mode of `citations.claim_text`.

**Free text as a marked exception.** Where a value genuinely cannot be typed — a sensory or descriptive detail that has no entity and no literal type — it is allowed, but **marked as an exception**, so a query can distinguish "this statement's value is typed" from "this statement's value is free text and therefore not machine-comparable". An unmarked free-text value is a validation error.

**Verbatim predicates.** The predicate vocabulary is not paraphrased or reworded at the call site. If a claim needs a predicate that does not exist, that is a **decision** (the vocabulary grows deliberately), not a data-entry convenience.

---

### Q1 (original) — What is the claim's identity: one subject–predicate–value row, or free prose?

**The decision:** what a `claims` row *is*.

**Recommendation: one subject–predicate–value row per assertable fact.** A claim is `(subject, predicate, object)` — one fact that one source can settle on its own. The human-readable wording is **not stored on the claim**; it is generated from the predicate and the objects, or lives in a separate `text` field that is explicitly *derived*, not authoritative.

**Reason:** it is the only shape in which coverage and corroboration are computable.

- *Coverage* = fully-evidenced sentences / factual sentences (ADR-001 D4/D6b). To compute "is this sentence fully evidenced", you must know which claims a sentence asserts. That mapping only exists if a claim is one fact.
- *Corroboration* = claims with ≥2 independent sources. "Quantity is not independence" (GUS-026 §5) means independence is a property of the **evidence chain for a claim** — so there must be a claim to hang the chain on. If a claim were a paragraph, five sentences would corroborate each other trivially.
- *Disputes* need opposing sides attached to **one** proposition. The Glasgow case is one proposition ("originated in Glasgow" vs "originated in the subcontinent") with two evidence chains. A prose claim cannot hold both without contradiction.

**Alternative: a free-text claim with structured fields bolted on** — e.g. `(subject, predicate, text)` where the text is the sentence and the predicate is a label. This is closer to today's `citations.claim_text`, so it migrates easily, and the wording can be editorially shaped rather than generated.

**The cost, stated plainly:** coverage becomes *approximate*, because you must guess which facts a free-text sentence asserts. That is exactly the failure ADR-001 D6 was written to avoid, and it is why ADR-001 D6b says a sentence counts as evidenced only if **all** its facts are anchored — a rule that requires the facts to be addressable.

**My recommendation stands: one subject–predicate–value row per assertable fact.** The generated wording is a real cost, but it is the price of computable coverage. If the alternative is chosen, the coverage metric has to be explicitly labelled approximate, and I would rather it be exact.

---

### ✅ Q2 — DECIDED (Alejandro, 2026-10-26): readings are display-only, template-defaulted, and version-bound

**A statement stores NO authoritative text.** What a reader sees is a **reading**, and readings exist only for claim display.

```
statement_readings (
  statement_id uuid -> statements,
  locale text,
  kind         enum('template','editorial') NOT NULL,
  text         text,
  -- the statement version this reading was written against
  statement_version int,
  statement_hash   text,
  status       enum('confirmed','stale','draft') NOT NULL DEFAULT 'draft',
  ...
)
```

**The decision, as amended:**

| # | rule |
|---|---|
| **1** | **Default reading = a deterministic template per predicate per locale.** Fallback when no template exists: **`subject · predicate · value`** |
| **2** | **Editorial readings store the statement version/hash.** On statement change → the reading becomes **`stale`**, is **hidden**, and the **template reading is shown** until the editorial reading is re-confirmed |
| **3** | **Reading kinds = `template` \| `editorial` only.** A **bot-drafted reading stays `draft`** — **not displayed** until a human confirms it |
| **4** | **Scope: readings are for claim display only** (evidence panel / editor). **Never a substitute for the D4 authored description** |

**What rule 1 buys.** A template is a *function*, so it cannot drift from the statement — there is nothing stored to drift. The fallback (`subject · predicate · value`) guarantees a reading exists for **every** statement and **every** locale, even where no template has been written. So "the reader always sees something" is a property of the model, not a workflow that can be forgotten.

**What rule 2 buys.** A statement's value or qualifiers can change while an editorial reading still shows the old wording. Storing the version/hash on the reading makes staleness **detectable** rather than invisible; the rule is then *"a stale reading is hidden and the template is shown"* — never *"a stale reading is shown next to the new statement"*. The editorial reading comes back only when a human **re-confirms** it against the new version.

**What rule 3 buys.** An agent may *draft* a reading, but it may not publish one — this is the same boundary as GUS-026 §10 (an agent may not move a claim to `published`). The `draft` kind-state is where bot output waits. **There is no `bot` reading kind**: an agent-drafted reading is an `editorial` reading in `draft` state, so there is exactly one way for a human-authored reading to exist and one way for it to be live.

**What rule 4 buys.** The D4 authored description is a *separate artifact* with its own anchors and its own coverage metric. Readings are a rendering convenience **inside the claim display**. If readings were allowed to substitute for descriptions, the authored prose would be replaced by generated text, and D4's whole premise — that the description is authored and the claims are the evidence — would invert. **A fact that exists only in a reading does not exist in the model.**

**One sub-question decided by following Q1 (not asked):** the `statement_version`/`statement_hash` pair is belt-and-braces — the version for cheap comparison, the hash for the case where two edits produce the same version number across a restore.

---

### Q2 (original) — Does a statement carry readable text, or is the text generated from its parts?

**Decision:** whether a statement has a `text` column, and if so, whether that text is authoritative.

**This question changed shape when Q1 was decided.** A claim is now a structured statement — `(subject, predicate, value)` + qualifiers + references — so "does the claim store prose?" is no longer a free choice: the claim *is* the structure. The live question is narrower:

> **When the editor or the API needs to show a human-readable sentence for a statement, where does that sentence come from?**

**Recommendation: the statement does NOT store authoritative text. A human-readable rendering is a separate, optional, and explicitly non-authoritative annotation.**

```
statements (
  id, subject_type, subject_id, predicate_id, value_type, value_ref,
  ... qualifiers ...
  -- NO authoritative text column
)

statement_readings (        -- optional, editorial, non-authoritative
  statement_id, text, locale, kind  -- kind: 'plain' | 'editorial'
)
```

**Reason:**

1. **One source of truth.** Q1 made the structure the claim. Adding an authoritative `text` column reintroduces exactly the drift Q1 removed: the structure says one thing, the text another, and the coverage metric — which counts *anchored facts*, not sentences — would quietly measure the wrong thing. ADR-001 D6b's rule ("a sentence counts as evidenced only if **all** its facts are anchored") is only meaningful if the facts are the thing being counted.
2. **But readers and the API need prose.** "Rendang — originated in West Sumatra, Indonesia" is what a reader sees. Generating it from a predicate→template registry works for the common shapes, but not for every claim, and not in every language.
3. **A non-authoritative reading solves both.** The structure is always the truth. A reading is a convenience, and when it drifts from the structure, **nothing breaks** — because nothing measures the reading. Validation can even *warn* when a reading no longer matches its statement.

**The alternative, and it is a serious one: the statement carries an authoritative `text` column**, and the structure is treated as a machine index *of* the text rather than as the claim. This is what today's `citations.claim_text` effectively does, and it is why the current model cannot compute coverage.

**Its cost, stated plainly:** the editor writes the sentence, and the structured fields are derived from it — so the structured fields become an approximation, the coverage metric becomes approximate, and "is this sentence fully evidenced?" requires guessing which facts the sentence asserts. That is the failure ADR-001 D6 exists to prevent.

**A third option worth naming: no text at all.** The UI renders from the structure only, through a predicate→template function. One source of truth, guaranteed, and no drift is possible because there is nothing to drift.

**Its cost:** the API and every consumer become coupled to the template set, a non-English rendering needs a full template set per locale, and a statement whose natural phrasing does not fit a template is awkward to express.

**What I recommend:** the non-authoritative `statement_readings` table — the structure is the claim, the reading is a convenience, and neither can corrupt the other.

**One sub-question I will decide by following Q1 rather than asking:** whether a reading may be **hand-edited**. It may — that is what `kind: 'editorial'` is for — but it may never be the basis of a metric, and it may never be the sole carrier of a fact. If a fact only exists in a reading, it does not exist in the model.

---

### ✅ Q3 — DECIDED (Alejandro, 2026-10-26): subjects are `dish` and `place` for the pilot; places get a hierarchy first

**The subject of a statement is an ENTITY — never a vocabulary value.** For the pilot the subject set is **restricted to `dish` and `place`**, because those are the two the catalog can reference richly today. Real `technique` / `tradition` **entity** tables are **separate work**, to be done alongside the recipe and tradition subtrees — not inside ADR-002.

**Why (iii) and not (i):** a statement whose subject is a vocabulary value cannot carry per-entity claims. A claim about *this* technique's history is not the same claim as one about the word "braising". Pointing `subject_type='technique'` at `dish_techniques` would conflate the two, and would make the entity tables a later refactor rather than a later addition.

#### Amendment 1 — places need a hierarchy, seeded with the pilot places only

**A place must have a hierarchy before the pilot:** **country > region > city**, via `parent_id`.

**The good news, measured live:** `geo_entities` **already has `parent_id`** — the column exists and is simply unused. All 36 current rows are `entity_type='country'` with no parent. So this is not a schema change; it is **using a column that is already there**, plus seeding the levels.

**The `entity_type` vocabulary therefore becomes:** `country` · `region` · `city` (today it holds only `country`).

**Seed only the pilot places** — nothing wider. **Corrected 2026-10-26 after source review of each place's own article:**

| level | place | parent | note |
|---|---|---|---|
| country | `Indonesia` *(exists)* | — | |
| country | `United Kingdom` *(exists)* | — | |
| country | `India` *(exists)* | — | |
| country | `Mexico` *(exists)* | — | |
| region | `West Sumatra` | Indonesia | rendang's origin region |
| region | `Scotland` | United Kingdom | Glasgow's region |
| region | **`Punjab`** | **NULL** | **a historical region spanning India AND Pakistan** — `parent_id` is NULL because it belongs to neither country; the two-country membership is a `place_spans` relation (GUS-237) |
| city | `Glasgow` | Scotland | the CTM origin claim |
| city | **`Delhi`** | **India** | **directly under India — the NCT, not Punjab** |
| city | `Mexico City` | Mexico | |
| city | **`Puebla`** | **`Puebla` (state)** | **city → state → Mexico** |

**`Delhi` sits directly under India, not under Punjab.** Its own article describes it as a *"Megacity and union territory"* — the **National Capital Territory of Delhi** — with `Region: North India` and `Country: India`. It is not administratively part of Punjab (Punjab is a separate state to its north-west), and the earlier plan in this ADR had it wrong. The `region` for Delhi is **North India**, which is not seeded — the hierarchy allows a city to sit directly under a country.

**`Punjab` is a historical REGION, not the Indian state** — and it is the right choice for the CTM claim. Wikipedia's `Punjab` article is explicitly *"about the geographical region"*, with `Countries: Pakistan, India` and a population of ~190M across both (115M Pakistan, 75M India); the modern Indian state and the Pakistani province are **separate articles** (`Punjab, India` and `Punjab, Pakistan`).

**So: one `Punjab` row, `entity_type = 'region'`, and `parent_id = NULL`.**

**`parent_id` is NULL, not `India`.** Punjab is not "in India" in the geographic sense that `parent_id` expresses — it spans India *and* Pakistan, so hanging it under India asserts a containment that is false for the Pakistani half. A place row has **one** `parent_id`, so a two-country region cannot be represented by parenting it to either.

**The trans-national membership is therefore a separate n:m relation, backlogged as GUS-237 (`place_spans`):**

```
place_spans (
  place_id   uuid -> geo_entities,
  country_id uuid -> geo_entities,
  note       text
)
-- Punjab -> India, 'the Indian portion of the historical Punjab region'
-- Punjab -> Pakistan, 'the Pakistani portion of the historical Punjab region'
```

**And the history, corrected (an earlier draft of this ADR got it wrong):**

**All this decision needs is one distinction:**

> **A historical region is not a modern state.**

That is why `Punjab` is seeded as a `region` with `parent_id = NULL` rather than as the Indian state. **The partition and reorganisation history is deliberately not recorded here.** An earlier draft of this ADR carried a chronology of it; that chronology was wrong, and it is not needed to make the modelling decision. The region's history belongs in the encyclopedia article for Punjab itself, sourced and written like any other content — not in a schema ADR, where it would be unsourced prose.

**Why the region, for the CTM claim:** the dispute is about *where a culinary tradition originated*, and the Punjab region is the cultural-historical unit. A modern state boundary is a partition of that region, and the CTM origin claim is about the tradition, not the administration.

**`Puebla` is a CITY, and its state is a separate place.** Wikipedia has distinct articles for `Puebla` (the state — *"the Free and Sovereign State of Puebla"*, capital and largest city Puebla de Zaragoza) and `Puebla (city)`. Since the tacos-al-pastor claim is about the dish's place of origin and the dish is documented to the city, the hierarchy is **Puebla (city) → Puebla (state) → Mexico**, and both Puebla rows are seeded.

**`Minangkabau` is a TRADITION value, not a place.** It is already in `dish_traditions` (36 rows) and is where `rendang`'s tradition belongs. It must **not** be seeded into `geo_entities` — a tradition is a cultural identity, not a location, and ADR-001 D3j's scope rules keep them apart.

#### Amendment 2 — dimension and relation rows carry a `statement_id`; the row is an index, the statement is the evidence

**Every dimension assignment row and every relation row gains a nullable `statement_id`** pointing at the statement that supports it.

```
ALTER TABLE dish_dish_families      ADD COLUMN statement_id uuid REFERENCES statements(id);
ALTER TABLE dish_dish_cuisines      ADD COLUMN statement_id uuid REFERENCES statements(id);
... every dish_dish_* join, and dish_relations ...
```

**The principle: the row is the INDEX, the statement is the EVIDENCE.**

A dimension row answers *"what is this dish's family?"* — it is a lookup row, and it must stay fast and denormalised. The statement answers *"why do we believe that, and on whose authority?"* — it carries the predicate, the qualifiers, the sources, the class and the status.

**Why the FK is on the dimension row rather than the other way round:** 91 dishes have a family assignment and no statement; the statement is the thing that is *added later*, as evidence accumulates. A statement can support many dimension rows (one claim can be the evidence for a family, a course and a context simultaneously), so the FK belongs on the row.

**A consistency check flags rows whose statement is missing, retracted, or contradicting:**

| condition | flagged as |
|---|---|
| `statement_id` points at a row that no longer exists | **missing** |
| the statement's status is `needs_revision` / `disputed` | **retracted** |
| the statement's `claim_class` is `disputed` or `unsupported` | **contradicting** |
| `statement_id IS NULL` | **unevidenced** — *not* an error; it is the honest state of the 91 rows that have a value but no evidence yet |

**This is what makes the coverage number meaningful.** A dimension value with no statement is a value someone typed. A dimension value with a statement pointing at a `documented` claim backed by an S1–S5 source is a fact. The two are currently indistinguishable — and the whole point of ADR-002 is to distinguish them.

#### Amendment 3 — `geo_entities.wikidata_id` population is separate work

The column exists and **0 of 36 rows populate it**. Populating it is a **backlog item**, not part of the pilot — and the pilot's place rows will carry a null `wikidata_id` until then.

**No placeholder region is invented anywhere.** Mexico has no region row (Mexico City and Puebla hang directly off the country, and Puebla has its own state); Delhi has no region row (it hangs off India directly). Punjab has a region row but **no parent**, because it spans two countries.

**And `parent_id = NULL` is a normal, meaningful state** — it says *"this place is not contained in a single parent"*, which is true of a transnational region. It is not a missing value, and validation must not read it as one.

---

### Q3 (original) — What is the subject of a statement, and how is it typed?

**Decision:** how a statement points at the thing it is about.

**This is the first question that decides the shape of the foreign keys**, so it is worth grounding in what the catalog already has.

**What exists to point at (measured live, 2026-10-26):**

| table | rows | notes |
|---|---|---|
| `dishes` | 122 (121 published) | — |
| `geo_entities` | **36** | all `entity_type='country'`; **`wikidata_id` is present as a column but 0 rows populate it** |
| `food_regions` | **0** | the region table is empty |
| `dish_families` | 25 | |
| `dish_cuisines` | 21 | |
| `dish_courses` | 8 | |
| `dish_techniques` | 25 | |
| `dish_traditions` | 36 | |
| `dish_contexts` | 5 | |
| `ingredient_categories` | 53 | |
| `ingredients` | — | the dish↔ingredient link (`dish_ingredients`) has only **4 rows** |

**And what does *not* exist yet:** there is no `technique` entity table distinct from the `dish_techniques` **vocabulary**, no `tradition` entity table distinct from `dish_traditions`, and no place table beyond `geo_entities` (countries only). `dish_ingredients` is nearly empty, so ingredients barely exist as addressable things yet.

**That last point matters for the decision.** The dimension tables (`dish_techniques`, `dish_traditions`, `dish_contexts`) are **vocabularies** — controlled value lists. The *entities* those values refer to (a technique as a thing in the world, a tradition as a cultural practice, a place) are a different kind of thing, and mostly do not exist yet.

**Recommendation: a typed subject reference with a closed subject-type set, where each subject type names the table it points into — and the subject-type set is decided by what the model can actually reference today, not by what might be needed later.**

```
statement_subjects (
  subject_type enum('dish','ingredient','place','region',
                    'technique','tradition','cuisine','family','relation') NOT NULL,
  subject_id   uuid NOT NULL
)
```

with a per-type foreign key, validated by trigger. The alternative is a single nullable FK per type on the statement row, which is faster to query and makes "a statement has exactly one subject" a schema fact.

**Reason for a closed set with real FKs, not a string:** a claim about the Glasgow origin is about a **dish**; a claim about "coconut milk is used in…" is about an **ingredient**; a claim about "coriander is native to…" is about a **place**. If the subject were a string, the statement could not be joined to anything, and coverage-by-dish — the metric ADR-001 promised — could not be computed. It would be the same failure as `citations.claim_text`, one level up.

**The tension I want surfaced, because it is the real design question here:**

The dimension tables are **vocabularies**, and so are the *qualifier* values (place, period, variant, occasion). A statement's subject and its qualifiers therefore draw on **different kinds** of table: the subject is an **entity** (a specific dish, a specific place), while a qualifier's `place` is a **reference to a place entity** and its `occasion` is a **vocabulary value** (`dish_contexts`). If `place` appears in two places in the model with two different types, the schema gets confusing fast.

**So the question splits in two, and this question is about the first half:**

**(a) the subject** — always an **entity**: a dish, an ingredient, a specific place. Never a vocabulary value.
**(b) the qualifiers** — a mix: `place` is an **entity** reference (a place), `variant` may be an **entity** (a specific dish variant) or a vocabulary value, `occasion` is a **vocabulary** value, `period` is a **typed literal** (a date range).

**My recommendation for (a):** the subject is an entity, typed by a closed `subject_type` set, with real FKs. **The subject set starts with what the catalog can actually reference** — `dish` and `place` are the two that exist richly today; `ingredient` exists as a table with almost no links; `technique`, `tradition`, `cuisine`, `family`, `region` would point at the **vocabulary tables** until real entity tables exist.

**The cost of that last point, stated plainly:** pointing `subject_type='technique'` at `dish_techniques` makes the subject a *vocabulary value*, which contradicts (a). The honest options are (i) accept the conflation now and split later, (ii) create real entity tables for technique and tradition now, which is a much larger piece of work than ADR-002 needs to be, or (iii) restrict the subject set to `dish` and `place` for the pilot and widen it when the entity tables exist.

**I recommend (iii) for the pilot**, and (ii) as a separate piece of work when the recipe and tradition subtrees are built — because a statement whose subject is a vocabulary value cannot carry per-entity claims (a claim about *this* technique's history, not about the word "braising").

---

### Q3 (original) — What is the subject of a claim, and how is it typed?

**Decision:** how a claim points at the thing it is about.

**Recommendation: a polymorphic subject with a typed reference, not a free-text subject.**

```
subject_type enum('dish','recipe','ingredient','place','tradition','technique',
                   'cuisine','family','relation','source')
subject_id   uuid
```

with a foreign key per type, or a `subject_ref` that carries the type + id and is validated by trigger.

**Reason:** a claim about the Glasgow origin is about a **dish**; a claim about "Baskin-Robbins was founded in 1945" is about a **place** or an **organisation**; a claim about "coriander is used in…" is about an **ingredient**. If the subject were a string, the claim could not be joined to anything and the coverage computation would have to match on text — the same problem the old `citations.claim_text` has.

**Alternative: restrict claims to dishes only** for now (`subject_type` fixed to `dish`), and add other subject types when a recipe or ingredient claim is actually needed. Simpler, but the migration then cannot express a claim about a technique or a place, which are precisely the claims that a scholarly source is most likely to support.

**Note:** ADR-001 §2.4 already sketches this — `subject_type enum('dish','recipe','ingredient','place','tradition')` — with `object_type enum('place','technique','ingredient','dish','time_interval')`. **This question decides whether that sketch is the answer**, so I have not assumed it.

---

### ✅ Q4 — DECIDED (Alejandro, 2026-10-26): exactly one predicate per dimension

**The predicate vocabulary is a TABLE, and there is exactly ONE predicate per dimension.** That is the organizing principle: a dimension has one predicate, and every statement about that dimension uses it.

```
predicates (
  id            uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  slug          text NOT NULL UNIQUE,
  name          text NOT NULL,
  value_kind    enum('entity','vocabulary','literal') NOT NULL,
  value_type    text,          -- for entity/vocabulary: which table
  description   text,
  created_at    timestamptz NOT NULL DEFAULT now()
)
```

**The seven predicates — one per dimension:**

| dimension | predicate | value_kind | value_type |
|---|---|---|---|
| `dish_family` | **`is_a`** | vocabulary | `dish_families` |
| `dish_cuisine` | **`belongs_to_cuisine`** | vocabulary | `dish_cuisines` |
| `dish_course` | **`served_as_course`** | vocabulary | `dish_courses` |
| `dish_technique` | **`cooked_by`** | vocabulary | `dish_techniques` |
| `ingredient_category` | **`contains_ingredient`** | vocabulary | `ingredient_categories` *(pilot)* |
| `dish_tradition` | **`part_of_tradition`** | vocabulary | `dish_traditions` |
| `dish_context` | **`eaten_in_context`** | vocabulary | `dish_contexts` |

**`is_a` no longer covers cuisine** — `belongs_to_cuisine` does that, on its own. **And the course and tradition predicates, which the earlier draft was missing, are now present:** `served_as_course` and `part_of_tradition`. That is the point of the "one predicate per dimension" rule: the vocabulary is *derived from the seven dimensions*, not assembled opportunistically. Any dimension without a predicate is a gap in the vocabulary, and visible as one.

#### Amendment 1 — `contains_ingredient` points at the vocabulary for the pilot

For the pilot, `contains_ingredient`'s value is a **vocabulary reference to `ingredient_categories`** — the controlled list, not a specific ingredient entity. After **GUS-233** (real entity tables), the same predicate points at an `ingredients` entity.

**Reason this is the right order:** the catalog's `dish_ingredients` table has **4 rows catalog-wide**. Ingredient *entities* barely exist, so pointing a statement at one would be pointing at almost nothing. The vocabulary (`ingredient_categories`, 53 rows) is real and populated, so the pilot can make evidenced ingredient claims immediately, and the entity link becomes a *widen the target* change rather than a rewrite.

#### Amendment 2 — `created_by` takes a typed literal `person_name` (a marked exception); a person entity is backlogged

`created_by`'s value is a **typed literal** of kind `person_name` — a **marked exception** under Q1's free-text rule, because a name is not an entity the catalog has.

A **person entity table is backlogged** (GUS-236). When it exists, `created_by` becomes an entity reference like every other predicate, and the literal form becomes the fallback for unattributable creators.

#### Amendment 3 — the literal types are pinned

| predicate | literal type | meaning |
|---|---|---|
| `originated_at` | **date / period** | a point in time, or a span |
| `has_duration` | **duration** | a length of time |

Both are typed, not free text. A duration is an interval, not a number with a unit in a string — so the literal type carries the unit.

#### Flags — `is_a` statements are SUPPORTED, not REQUIRED

**`is_a` statements are supported but not required.** A statement's support comes from its citations, not from the predicate's presence: an `is_a` statement with a good S1–S5 source is published; a dimension row with `statement_id IS NULL` is simply **unevidenced** (the Q3 consistency check), and that is the honest state of a taxonomic assignment nobody has sourced.

**Why this is the rule, and not the opposite:** `is_a` is a *taxonomic* predicate, true by definition of the taxonomy — it asserts the dish sits in that family, and it needs a source only in so far as the source places the dish there. Making it mandatory would mean every one of the 91 dishes with a family but no statement fails a check, and the model would report a wall of errors that says nothing true. Making it optional but *supported* means: **if you have a source that places the dish in the family, record the statement; if you do not, the dimension row stands unevidenced and the coverage number is honest about it.**

#### Amendment 4 — a fifth qualifier type: `role`

`Medium` is a **role**, not a kind of thing. Q1's qualifiers were `place`, `period`, `variant`, `occasion`; a fifth is added:

> **`role`** — the role a value plays in the statement.

So rendang's medium is recorded as:

> **`contains_ingredient(rendang, coconut)` with `role = medium`**

**The value is `coconut`, not `coconut-milk`** — `coconut-milk` is **not in the controlled vocabulary** (`ingredient_categories` has `coconut`, not `coconut-milk`), and inventing a value would be a vocabulary extension. After **GUS-233** creates the real ingredient entities, the value becomes the `coconut-milk` **entity**, and the `role = medium` qualifier is unchanged.

That is the whole point of `role` being a qualifier rather than a predicate: a new *role* is **data**, so the "one predicate per dimension" rule holds. Q4's earlier draft had left this open; it is now closed.

**The qualifier set is therefore five types:**

| qualifier | kind | example |
|---|---|---|
| `place` | entity ref | the region a statement is scoped to |
| `period` | typed literal (date/period) | when the statement held |
| `variant` | entity ref or vocabulary value | which variant of the dish |
| `occasion` | vocabulary value | when/where it is eaten |
| **`role`** | vocabulary value | the role a value plays (`medium`, `protein`, `base`, `accompaniment`) |

---

### Q4 (original) — DRAFTED (superseded by the decision above)

**Decision:** whether `predicate` is a controlled vocabulary, and what it contains.

**Q1 already decided the shape:** predicates come from a controlled vocabulary, taken **verbatim**, and a new predicate is added **only by explicit decision**. This question decides *the vocabulary itself* — which predicates exist, and what shape the vocabulary table has.

**What the pilot's claims actually need.** The GUS-026 §8.2 priority order and ADR-001 D6's worked example give the ground truth for the 3 reference dishes:

| dish | the claims it needs | the predicate each requires |
|---|---|---|
| `rendang` | origin (West Sumatra) · family (curry) · protein (beef) · technique (braising) · medium (coconut milk) · duration (hours) | `originated_in` · `is_a` · `contains_ingredient` · `cooked_by` · `has_duration` · `cooked_for` |
| `chicken-tikka-masala` | origin — **competing** Glasgow vs the subcontinent · protein (chicken) · technique (grilling + simmering) · course (restaurant) | `originated_in` ×2 competing · `contains_ingredient` · `cooked_by` ×2 · `served_as` |
| `tacos-al-pastor` | origin (Mexico/Puebla) · family (taco) · technique (spit-roasting) · context (street food) · derived-from (shawarma) | `originated_in` · `is_a` · `cooked_by` · `served_as` · `derived_from` |

**That is 9 distinct predicates for 3 dishes** — a telling number. It is also close to what GUS-026 §3.1's origin-predicate rule already names: `originated_in` / `originated_at` / `created_by` / `named_after`.

**Recommendation: a `predicates` vocabulary table, seeded with the pilot's needs plus the 3 origin-predicate variants GUS-026 already assumes, and nothing else.**

```
predicates (
  id            uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  slug          text NOT NULL UNIQUE,     -- 'originated_in', 'contains_ingredient'
  name          text NOT NULL,
  -- the value shape this predicate accepts
  value_kind    enum('entity','vocabulary','literal','time') NOT NULL,
  value_type    text,                     -- for entity values: which entity type
  description   text,
  created_at    timestamptz NOT NULL DEFAULT now()
)
```

**Reason a table rather than an enum.** The predicate's **shape** is metadata the schema must enforce: `originated_in` must take a **place**; `is_a` must take a **vocabulary value** (a family, a cuisine); `contains_ingredient` must take an **ingredient**; `cooked_by` must take a **technique**; `has_duration` must take a **duration literal**. If the predicate table carries `value_kind` and `value_type`, validation enforces those rules **from data** rather than from code that special-cases each predicate.

**Reason the vocabulary starts small.** A predicate no statement uses is dead weight — and every unused predicate is a place a future author will reach for *instead of* an existing one, widening the vocabulary without a decision. Growing it **by explicit decision** (per Q1) is the discipline; seeding only what the pilot needs makes the discipline enforceable rather than aspirational.

**The seed list, and why each is there:**

| predicate | value_kind | value_type | needed by |
|---|---|---|---|
| `originated_in` | entity | `place` | rendang, CTM (×2 competing), tacos |
| `originated_at` | literal | `time` | GUS-026's origin-predicate set |
| `created_by` | entity | `dish` | GUS-026's origin-predicate set |
| `named_after` | entity | `place` | GUS-026's origin-predicate set |
| `is_a` | vocabulary | `family` or `cuisine` | rendang (curry), tacos (taco) |
| `contains_ingredient` | entity | `ingredient` | rendang (beef), CTM (chicken) |
| `cooked_by` | vocabulary | `technique` | rendang, CTM (×2), tacos |
| `served_as` | vocabulary | `dish_context` | CTM, tacos |
| `has_duration` | literal | `time` | rendang (hours) |

**The alternatives, and I think they are weaker:**

**Alternative A — a free-text `predicate` column.** Easiest to write statements in, and a scholar's exact phrasing survives. But coverage-by-predicate and the GUS-026 origin-predicate rule both need a closed set to be checkable — with free text, *"originated in"* vs *"originates from"* vs *"was created in"* would be **three predicates**, and the Wikipedia rule would silently never fire.

**Alternative B — a closed SQL enum on the statement table.** Cheaper than a table, and the database enforces membership. But the per-predicate **value shape** cannot be expressed, so the `originated_in`-must-take-a-place rule has to live in application code — and code is where it drifts. The table form puts the rule in the data, where a review can see it.

**What I will decide rather than ask:** the 4 origin predicates from GUS-026 (`originated_in`, `originated_at`, `created_by`, `named_after`) are seeded **even though the pilot only uses one**, because GUS-026's Wikipedia rule *names* them and a rule that references a non-existent predicate is unenforceable. The other five (`is_a`, `contains_ingredient`, `cooked_by`, `served_as`, `has_duration`) are the pilot's actual needs.

**One naming note I want to flag rather than bury:** `is_a` is a *taxonomic* predicate; the others are *factual*. That distinction is real — `is_a` is true by definition of the taxonomy, whereas `contains_ingredient` is a claim about the world that needs evidence. **Should `is_a` require a statement at all?** My recommendation is **yes**, because "rendang is a curry" is still a claim (about the taxonomy being right), and a statement with a `scholarly_interpretation` class can say so explicitly. But it is a defensible exception, and I will raise it if the pilot shows the taxonomic statements adding no value.

**One gap this table exposes:** the pilot needs a predicate for *coconut milk* — the D6 worked example calls it the "medium". Is that `contains_ingredient` (coconut milk is an ingredient) or a separate `has_medium` predicate? I recommend **`contains_ingredient`** — "medium" is a role an ingredient plays, not a distinct kind of thing, and a separate predicate would let a dish have both a medium and no ingredients without contradiction. If Alejandro wants the role recorded explicitly, that is a **qualifier** on `contains_ingredient`, not a new predicate.

---

### Q4 (original) — What are the predicate vocabulary, and is it closed?

**Decision:** whether `predicate` is a controlled vocabulary or free text.

**Recommendation: a controlled vocabulary table**, with the object type constrained per predicate. Seeded with at minimum: `originated_in`, `originated_at`, `created_by`, `named_after`, `contains_ingredient`, `cooked_by`, `served_as`, `part_of`, `related_to`, `has_variant`, `made_from`.

**Reason:** a closed predicate set is what makes claims *comparable*. "How many dishes are documented as originating in a disputed place" is a query only if the predicate is uniform. It also lets validation enforce shape — `originated_in` must take a place object, `cooked_by` must take a technique — which is what stops a claim row quietly becoming prose again.

**Alternative: free-text predicates with a suggested list.** Easier to add claims in, and allows a scholar's exact phrasing. But coverage-by-predicate and the GUS-026 "origin predicate" rule both need a closed set to be checkable; a free-text predicate makes the Wikipedia rule unenforceable.

---

### ✅ Q5 — DECIDED (Alejandro, 2026-10-26): Option A, and the single-valued rule is generalised

**Option A: one statement per `(subject, predicate, value)` pair.** A dish with three techniques has three `cooked_by` statements, each with its own evidence chain.

**Reason:** under Option B (one statement per subject+predicate carrying several values), a source that documents only *two* of the three techniques either overstates its support for the whole proposition, or supports a part the schema cannot express. Under Option A it supports **exactly the one technique it mentions**, and the others have their own statements — possibly unsupported, possibly absent. The coverage and corroboration numbers then mean what they claim to mean.

This also matches Q1's granularity (one assertable fact per statement) and Q3's principle — *"the row is the index, the statement is the evidence"* — because under Option A the index is **exact**: a dimension row exists per evidenced value, and a typed-but-unsourced assignment is `statement_id IS NULL`.

**Cost, stated plainly:** more statements. Rendang alone has **6** — origin, family, protein, technique, medium, duration — exactly as ADR-001 D6's worked example has it.

#### The single-valued rule, generalised — and a correction

**An earlier draft of this note justified Option A with the wrong example.** It claimed `chole-bhature` was *"a stew that is also a curry"*. That is **not** what the broader-family review found: `chole-bhature` was **`curry` vs `bread`** — two *competing* readings of one dimension, not two simultaneous memberships. The stew-vs-curry case was `goulash-hungarian` / `kimchi-jjigae` (`Stew` + `Soup`).

**And the proposed remedy was wrong too:** `dish_relations` is **dish ↔ dish**, so it **cannot carry family membership** at all. A relation between two dishes says "these dishes are related"; it cannot say "this dish is also a member of that family".

**The general rule, as decided:**

> **For a SINGLE-VALUED dimension, multiple COMPETING statements are allowed. Exactly ONE is ACCEPTED. The dimension row points to the accepted statement. The others remain visible as `disputed` / `alternative`.**

This is **the D1 cuisine rule generalised** — ADR-001 D1 already established that `chicken-tikka-masala`'s cuisine is **left unset** because the Glasgow origin is contested: the dish is assigned no cuisine, and the dispute lives in competing claims. The same mechanism now applies to every single-valued dimension:

| | |
|---|---|
| competing statements | allowed, and expected |
| the accepted one | exactly one; the dimension row's `statement_id` points at it |
| the others | remain visible, carrying `claim_class = disputed` or `alternative` |
| the dimension row | holds the accepted value, and **may be unset** if none is accepted |
| the consistency check | **flags a row whose `statement_id` is not the accepted statement** — and a row pointing at a non-accepted statement is a defect, not a choice |

**Why this is right for the model:** a single-valued dimension is a *product* decision — the catalog can only show one cuisine, one family. It was never a claim that only one claim exists. The old model could not express that distinction (one `citations.claim_text` per dish), so a contested family was silently resolved by whoever typed it last. Under this rule the **dispute is recorded and visible**, while the **displayed value is still single** — which is what a reference work needs: it can say *"most sources place this in X; Y holds for Z"*.

**It also fixes the `is_a` case properly.** A dish that is plausibly in two families gets **two `is_a` statements**; one is accepted and the dimension row points at it; the other is visible as an alternative. Neither is lost, and the dimension stays single-valued.

---

### Q5 (original) — What are the object types, and can one statement have several objects?

**Decision:** the shape of the object side of a statement.

**Q1 already settled the object side's *typing*: a value is either an **entity reference** or a **typed literal**, with free text only as a marked exception.** And Q4 has now settled the *vocabulary* of predicates. What remains is the **shape** of the value storage, and it turns out to be a narrower question than it first appears.

**Here is what Q4's decision already implies**, which narrows this question a great deal:

| predicate | value kind | what the value points at |
|---|---|---|
| `is_a` | vocabulary | `dish_families` |
| `belongs_to_cuisine` | vocabulary | `dish_cuisines` |
| `served_as_course` | vocabulary | `dish_courses` |
| `cooked_by` | vocabulary | `dish_techniques` |
| `contains_ingredient` | vocabulary (pilot) | `ingredient_categories` |
| `part_of_tradition` | vocabulary | `dish_traditions` |
| `eaten_in_context` | vocabulary | `dish_contexts` |
| `originated_in` | entity | a `geo_entities` place |
| `originated_at` | literal | date / period |
| `created_by` | literal | `person_name` (marked exception) |
| `has_duration` | literal | duration |

**Six of the seven dimension predicates take a VOCABULARY value, and every dimension is multi-valued except the three single-valued ones** (ADR-001 D7b: `dish_family`, `dish_cuisine`, `dish_course`).

**That produces the real question, and it is not "several objects per statement" — it is:**

> **How does a multi-valued dimension relate to the statements that evidence it?**

**Option A — one statement per (subject, predicate, value) pair.** A dish with three techniques has three `cooked_by` statements, each with its own evidence chain. The dimension row is then *derived* from the statements rather than being a separate thing.

**Option B — one statement per (subject, predicate), with several values.** A dish with three techniques has **one** `cooked_by` statement carrying three values, and one evidence chain covering all three.

**These are not equivalent, and the difference is whether partial evidence is visible.**

**My recommendation: Option A — one statement per (subject, predicate, value).**

**Reason, and it is the same reason as Q1's claim granularity:** under Option B, a source that documents only *two* of the three techniques either supports the whole statement (which overstates the evidence) or supports a part of it (which the schema cannot express). Under Option A, that source supports exactly the one technique it mentions, and the other two techniques have their own statements — possibly unsupported, possibly none. The coverage and corroboration numbers then mean what they claim to mean.

**The cost, stated plainly:** Option A produces more statements (rendang alone would have 6 — origin, family, protein, technique, medium, duration — exactly as ADR-001 D6's worked example has it), and a statement's *reading* is a single proposition, so `cooked_by(rendang, braising)` reads "Rendang is cooked by braising" — which is correct and grammatical.

**The dimension rows then become an index of the statements** — which is precisely the model Q3's amendment 2 already established: *"the row is the index, the statement is the evidence."* Under Option A the index is exact: `dish_dish_techniques` holds one row per evidenced technique, and a technique with no statement is simply absent (or present with `statement_id IS NULL` for a typed-but-unsourced assignment).

**One thing Option A forces into the open, and I will decide rather than ask:** `is_a` is single-valued but the *vocabulary* is not — so a statement `is_a(dish, curry)` names one family, and the dimension row can hold exactly one. But a dish can plausibly be in two families (a stew that is also a curry — `chole-bhature` was exactly this case in the broader-family review). Under Option A, that is **two `is_a` statements**, and the dimension row can only carry one.

**My recommendation: `dish_family` stays single-valued** (ADR-001 D7b), and a second family is expressed as a **second `is_a` statement** plus a `dish_relations` row, not as a second dimension value. The taxonomy's single-valuedness is a product decision that this ADR implements rather than reopens — but the *statement* can record the second membership, so the evidence is not lost even though the dimension cannot express it.

**A third option, which I think is weaker:** keep a single `is_a` statement with multiple values for the multi-valued dimensions and a separate predicate for the single-valued ones. That reintroduces the Q1 problem — a proposition about a set, whose evidence is hard to attribute.

---

### Q5 (original) — What are the object types, and can one claim have several objects?

**Decision:** the shape of the object side.

**Recommendation:** `object_type` is a closed set (as ADR-001 §2.4 sketches: `place`, `technique`, `ingredient`, `dish`, `time_interval`, `cuisine`, `family`, `value`), and a claim may have **several objects** — implemented as one row per (claim, object) pair, or a `claim_objects` child table.

**Reason:** *"A West Sumatran dry curry of beef slow-cooked for hours in coconut milk"* asserts several facts, but so does *"rendang contains coconut milk and beef"* — and ADR-001 D6's worked example splits that into 6 claims (origin, family, protein, technique, medium, duration). So one claim = one object would be cleanest… but some claims genuinely take a list: *"contains ingredients X and Y"* is one assertion about a set.

**The two options are genuinely close.** The deciding question is whether "contains X and Y" should be one claim with two objects, or two claims. **My recommendation: one claim, several objects** — because the evidence supports the *set* as one assertion; splitting it would let one source appear to corroborate a subset of the assertion.

**Alternative: one claim per (subject, predicate, object)**, with no multi-object claims. Simplest possible schema, and every claim is a single fact. The cost: "contains beef and coconut milk" becomes two claims that could be independently evidenced, which overstates the evidence — a source that lists beef but not coconut milk would appear to support half the proposition.

---

### Q6 — What is the source model, and does `sources` need to change?

**Decision:** whether the existing `sources` table is reused, extended, or replaced — and whether GUS-026's S1–S7 classification lives in the database or in prose.

**What exists (measured live, 2026-10-26):**

```sql
sources (
  id uuid pk, source_type text NOT NULL, title text NOT NULL, authors text[],
  year int, publisher text, isbn text, doi text, url text, archive_name text,
  archive_catalog_id text, citation_text text, language text NOT NULL,
  reliability text, created_at timestamptz, created_by text
)
```

| | live |
|---|---|
| rows | **142** |
| `source_type` | **`web` — 142 of 142** |
| `reliability` | **`secondary` — 142 of 142** |
| `language` | **`en` — 142 of 142** |
| distinct `url` | 121 (142 rows, so ~21 are duplicates of a URL under a different title) |
| `doi` / `isbn` / `archive_name` | **0 / 0 / 0** — every academic-looking column is empty |
| `citations` rows | 121, **all** `target_type='dish'` |
| `citations.claim_text` | **120 of 121 are byte-identical to `dishes.short_description`** |
| `citations.location` | only `"Lead paragraph"` and `"History section"` |

**Two facts from that table decide most of this question.**

**First: `reliability = 'secondary'` for all 142 rows is not a classification, it is a constant.** Every source in the catalog is marked equally reliable — which means the column currently carries no information. GUS-026's S1–S7 is a *refinement* of what `reliability` was trying to be, not a replacement for it. **The 142 rows are real and the columns are mostly right.**

**Second: 120 of 121 `claim_text` values are byte-identical to `dishes.short_description`.** That is the whole problem in one number — the "claim" *is* the prose. A source that supports the dish's opening sentence is recorded as supporting the entire description. **This is why coverage cannot be computed today**, and it is what ADR-001 D6 was written to fix.

**Recommendation: extend `sources` in place — do not replace it — and add `source_class` as a controlled vocabulary.**

```
source_classes (
  id          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  slug        text NOT NULL UNIQUE,     -- 'S1' .. 'S7'
  name        text NOT NULL,
  -- what this class is good enough to support, from GUS-026 section 3
  sufficient_for text,
  created_at  timestamptz NOT NULL DEFAULT now()
)

ALTER TABLE sources
  ADD COLUMN source_class_id uuid REFERENCES source_classes(id);
```

**Why `source_classes` is a table and not an enum:** GUS-026 §3's table gives each class a *meaning* — "good enough to support: any claim, including contested origin" for S1–S3, "discovery and terminology only" for S6, "nothing" for S7. That metadata belongs with the class, and a table lets it be edited without a schema migration.

**Why `reliability` is not simply renamed to `source_class`:** the two answer different questions. `source_class` is **what kind of source this is** (a peer-reviewed article, a Wikipedia article, a blog post); `reliability` is **how much this particular source can be trusted**. A single source can be both. The pilot's migration sets `source_class` from the existing rows — all 142 are `web` and all are encyclopedia articles, so they are **S6** (reference: discovery and terminology only), except that the 21 with the same URL under different titles are likely the *same* source duplicated.

#### Amendment 1 — classify by URL domain, individually

**Classification is by the source's actual URL domain, and each domain is classified on its own merits — never a blanket rule.**

Measured live 2026-10-26: **all 142 sources are `en.wikipedia.org`.** There are **no other domains at all** — no other site, no other wiki, no journal, no archive. So the domain rule resolves to:

| domain | rows | class | why |
|---|---|---|---|
| `*.wikipedia.org` | **142** (all of them) | **S6** | reference: discovery and terminology only — GUS-026 §3 |

**And there is nothing to classify individually beyond that**, because every other domain has zero rows. That is worth stating plainly rather than dressing up: **the catalog has no source diversity to classify.** The rule is recorded so that the *first* non-Wikipedia source is classified individually rather than swept into a blanket assumption, and so that a future `*.wikipedia.org` is treated the same as today's.

**The one caveat the domain rule cannot catch:** `*.wikipedia.org` covers the whole Wikimedia family, so a *Wikimedia Commons* file URL or a *Wikidata* item URL would also match the domain but is **not** a Wikipedia article. Those must be classified by **path**, not domain — `/wiki/<article>` is S6; a `/wiki/File:…` or a `wikidata.org/wiki/Q…` URL is a different thing and needs its own class. No such rows exist today.

#### Amendment 2 — dedupe before the pilot

**21 of the 142 source rows are redundant.** Measured live: **121 distinct URLs across 142 rows**, and after normalisation there are **12 URLs carrying more than one row** — 21 redundant rows in total.

| normalised URL | rows | citations on the group | orphaned rows |
|---|---|---|---|
| `en.wikipedia.org/wiki/bánh_mì` | 3 | 1 | 2 |
| `en.wikipedia.org/wiki/ceviche` | 3 | 1 | 2 |
| `en.wikipedia.org/wiki/chicken_tikka_masala` | 3 | 1 | 2 |
| `en.wikipedia.org/wiki/falafel` | 2 | 1 | 1 |
| `en.wikipedia.org/wiki/hamburger` | 3 | 1 | 2 |
| `en.wikipedia.org/wiki/jollof_rice` | 3 | 1 | 2 |
| `en.wikipedia.org/wiki/moussaka` | 3 | **3** | 0 |
| `en.wikipedia.org/wiki/pho` | 2 | **0** | 2 |
| `en.wikipedia.org/wiki/pizza_margherita` | 3 | 1 | 2 |
| `en.wikipedia.org/wiki/poutine` | 2 | 1 | 1 |
| `en.wikipedia.org/wiki/sushi` | 3 | 1 | 2 |
| `en.wikipedia.org/wiki/vindaloo` | 3 | 1 | 2 |

**Referenced vs orphaned — the answer Alejandro asked for:**

- **21 orphaned source rows** carry **zero** citations. **20 of them** are in a duplicate group; **1** (`Tajine`, `https://en.wikipedia.org/wiki/Tajine`) has a unique URL and is orphaned on its own.
- **Only 1 group has more than one *cited* row**: `Moussaka`, where all three rows are cited — `Moussaka` (id `00000000…`), `Levantine Moussaka` (id `5efafd8e…`) and `Musakka` (id `6b806037…`), one citation each. **These are three different dishes sharing one Wikipedia article**, so the three source rows are not duplicates of each other in meaning — but they *are* the same URL, and the same URL cannot be three sources.
- **`pho` is the interesting case**: two rows, **neither cited** — a group with **zero** citations, so it is entirely redundant.
- The `Tajine` row is orphaned with a unique URL — that one is a **source that exists but was never used**, which is a different defect from duplication.

**So the deduplication is 21 redundant rows, of which 20 are safe to merge (orphaned duplicates) and 1 (`Tajine`) is an unused unique source that should be kept but flagged, not merged.**

**The deduplication procedure, before the pilot:**

1. **Normalise the URL** — lowercase host, strip `m.` / `en.m.` prefixes, decode percent-encoding, collapse duplicate slashes, strip a trailing slash, drop the fragment, and normalise the `/wiki/<Title>` path case. Store the normalised form in a new **`sources.normalised_url`** column.
2. **Build an id map** — for each normalised URL, choose a **surviving row** (the cited one, or the oldest) and map every other row's id to it.
3. **Re-point the references** — every `citations.source_id` pointing at a merged row is updated to the surviving id.
4. **Archive the merged rows** — moved to a `sources_merged` (or archived) table with the surviving id recorded, so the merge is reversible and auditable. **Not hard-deleted.**
5. **Add a unique constraint on `sources.normalised_url`** — so the catalog cannot accumulate the same article under several names again.

**Why this must happen BEFORE the pilot, and not during it:** the pilot's whole point is to produce a **corroboration** number. With 21 duplicate rows, a claim cited by two rows pointing at the same Wikipedia article would count as **two sources** — and GUS-026 §5 is explicit that *"quantity is not independence"*. **A duplicate URL is the same source twice.** Deduplicating first is what makes the number mean anything.

**This is a destructive-ish change and therefore needs approval** (RULES.md §Approval: *"bulk-delete/overwrite data"*). Step 4 archives rather than deletes, which keeps it out of that category — but it is still a bulk data change and is queued for Alejandro's go, not done here.

**The `Tajine` row is a separate finding worth recording:** a source that was registered and never cited. Under the new model, a source with no citations is not a source *of anything* — it is a lead, not evidence. GUS-027's registry should distinguish **registered sources** from **cited sources**, so that an unused lead is visible as such rather than looking like evidence with zero support.

**What I will decide rather than ask:**

- **`source_type` stays.** It records *what the thing is* (`web`, `book`, `journal_article`, `archive`, `manuscript`); `source_class` records *how good it is*. Keeping both means `source_class` can be corrected without rewriting 142 rows' `source_type`, and a future S1 source can be typed without touching its class.
- **`reliability` is deprecated, not deleted.** It is `NULL`-able already and carries no information today; deleting it is a destructive change to a live table and RULES.md requires approval for that. It can be dropped later under an approved migration.
- **The `sources` ↔ `statements` link is not this question.** Q7 decides the claim↔source link shape (the `claim_citations` table with `stance`); Q6 only decides the source's own attributes.

**A finding that raises the priority of GUS-026:** `distinct url = 121` against `142 rows` means **~21 rows are duplicate sources** — the same URL stored under a different title. `sources` has **no unique constraint on `url`**, so nothing prevents that. The source registry (GUS-027) should add one; otherwise the catalog will keep accumulating the same Wikipedia article under several names, and every evidence count will over-count.

**The alternative, and why I do not recommend it:** a new `source_registry` table alongside `sources`, with `sources` kept as the legacy dish-level bibliography. Two source tables means two answers to "what sources does this dish have", and the migration between them is exactly the kind of dual-truth the ADR is trying to remove.

---

### Q6 (original) — What is the source model, and does `sources` need to change?

**Decision:** whether the existing `sources` table is reused, extended, or replaced.

**Recommendation: extend `sources` in place** — add `source_class` (S1–S7, replacing the current single-valued `reliability` which is `secondary` for all 142 rows), and keep `reliability` for a later decision. Do **not** create a new sources table; the 142 rows are real and the columns are mostly right.

**Reason:** the catalog has 142 sources, all `web`/`secondary`/`en`. GUS-026's S1–S7 classification is a **refinement** of what `reliability` was trying to be, not a replacement. Migrating in place preserves every existing citation.

**Alternative: a new `source_classes` lookup table plus a `sources.source_class_id`** — more relational, and the class can carry its own metadata (what S1–S7 are "good enough for", per GUS-026 §3's table). More machinery, but it keeps the policy in the database rather than in prose.

**What I recommend for the vocabulary, per GUS-026:** `S1` primary historical · `S2` scholarly · `S3` institutional · `S4` practitioner · `S5` specialist · `S6` reference · `S7` unverified. **Wikipedia is S6.**

---

### ✅ Q7 — DECIDED (Alejandro, 2026-10-27): the evidence link carries the passage, the anchor, and the stance

**The evidence link is one row per (statement, source, revision, locator).** It carries the verbatim excerpt, the retrieval anchor, and a stance that separates support from refutation from context.

```
claim_citations (
  id            uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  statement_id  uuid NOT NULL REFERENCES statements(id),
  source_id     uuid NOT NULL REFERENCES sources(id),
  stance        enum('supports','refutes','context') NOT NULL,
  -- WHERE in the source the passage sits
  locator       text,        -- 'section 3', 'para 2', 'p. 42', 'Lead paragraph'
  -- the EXACT text that supports the statement, quoted verbatim
  excerpt       text,
  -- the retrieval anchor: which VERSION of the document was read
  revision_id   text,        -- Wikipedia revid (e.g. '1381860136'); null for non-versioned sources
  -- WHEN the passage was read (the single timestamp)
  retrieved_at  timestamptz NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  -- multiple passages from one source on one revision are distinct rows;
  -- the same passage re-read on a different revision is a NEW row (history kept)
  UNIQUE NULLS NOT DISTINCT (statement_id, source_id, revision_id, locator)
)
```

#### Amendment 1 — the uniqueness key is (statement, source, revision, locator)

**`UNIQUE NULLS NOT DISTINCT (statement_id, source_id, revision_id, locator)`.**

The draft's `UNIQUE (statement_id, source_id, stance)` is replaced. The old key says a statement can cite a given source exactly once — which forbids **two passages from the same article** (a common and legitimate case: one paragraph for the origin, another for the technique), and forbids **the same passage being re-read on a later revision** (which is how drift is detected).

The new key says: a *passage at a locator, read at a revision*, is one thing. Multiple passages per source are allowed. A re-read on a new revision is a **new row**, and the old row is kept — so the history of what the article said, and when it was read, survives.

**Why `revision_id` is in the key even though it is nullable.** For a non-versioned source (a printed book, a PDF), `revision_id` is NULL. In Postgres, NULL never equals NULL in a unique index, so multiple NULL-revision rows for the same (statement, source, locator) would **all** be permitted — the key would silently not apply to exactly the case it needs to.

**The fix is `UNIQUE NULLS NOT DISTINCT`,** which treats NULL values as equal for uniqueness purposes. It is available from Postgres 15, and this project runs **Postgres 16** (verified live: `shared-postgres` is `postgis/postgis:16-3.4`, reporting `server_version` **16.4**; the devcontainer uses the same `16-3.4` image). So no expression index or `COALESCE` wrapper is needed — the constraint is written directly on the columns.

**Verified on the live server before recording it** (a temporary table with this exact constraint, exercising all three cases):

| case | rows | expected | result |
|---|---|---|---|
| same (statement, source, **NULL** revision, locator) | duplicate | **rejected** | ✅ rejected with `unique_violation` |
| same (statement, source, locator), **different revision** | 100 → 200 | **accepted** | ✅ accepted — history kept |
| same (statement, source, revision), **different locator** | `para 2` → `para 5` | **accepted** | ✅ accepted — two passages from one article |

The first row is the case a plain `UNIQUE` would have got wrong: under a plain unique index the two NULL-revision rows would both have been accepted, and a non-versioned source could accumulate unlimited duplicates for the same locator.

**The chosen form is `UNIQUE NULLS NOT DISTINCT (statement_id, source_id, revision_id, locator)`**, so a non-versioned source is keyed by (statement, source, NULL, locator) and cannot accumulate duplicate rows for the same locator. The `stance` column is **not** in the key: the same passage read on the same revision is one row, and it holds one stance. A source that both supports and refutes a statement uses two different locators (or two different revisions), which is exactly the situation where two rows are correct.

**The history rule, stated plainly:** the old `citations` table is not dropped, but the new table does not overwrite history either. When an article is re-read and its text has changed, the **new row is added** and the **old row is retained** — with its own `revision_id` and its own `retrieved_at`. A reader asking "what did the article say when we cited it?" gets the old row; a reader asking "is this still supported?" gets the new one.

#### Amendment 2 — one timestamp: `retrieved_at timestamptz`

**`accessed_at` is dropped.** The draft carried both `retrieved_at date` and `accessed_at timestamptz`, which is two columns for one event, with two types (`date` vs `timestamptz`) and two names for the same meaning.

**One column: `retrieved_at timestamptz NOT NULL`.** It answers *"when was this passage read from this revision"* — which is the only temporal fact the model needs. `accessed_at` was never a separate event; it was the same read, recorded twice with different granularity.

**Why `timestamptz` and not `date`.** The draft's `retrieved_at date` would record 2026-10-27 and lose the time of day. A revision read at 09:14 and a re-read at 16:40 on the same day would be indistinguishable — and "was this re-read after the article changed?" is exactly the question the revision id alone cannot answer. `timestamptz` also resolves the timezone question once, at the column, instead of per-writer.

**`retrieved_at` is NOT NULL** because an evidence link without a retrieval time is an unread citation — the defect the whole table exists to fix. For a migrated legacy row this is the reason the migration must *re-read* rather than copy (Amendment 5).

#### Amendment 3 — `stance = 'context'` counts as neither support nor refutation

**`stance='context'` is a third thing, and it counts for nothing.** It is excluded from coverage and from corroboration.

This is recorded as a rule, not left to each consumer's judgement, because the opposite — letting a context passage inflate a corroboration count — is the exact failure GUS-026 §5 warns about (*"quantity is not independence"*). A passage that merely mentions the topic in passing is not a second source agreeing with the first.

**What `context` is FOR.** It records that the source was read, that it discusses the subject, and that it did **not** settle the proposition. That is genuinely useful information: it is why the proposition is `research_pending` rather than `unsupported`, and it is the honest record of a lead that did not pan out.

**The two consequences, stated explicitly:**

| metric | `supports` | `refutes` | `context` |
|---|---|---|---|
| **coverage** (is this fact evidenced?) | counts | does not count | **does not count** |
| **corroboration** (do ≥2 independent sources agree?) | counts | — | **does not count** |

**A `context`-only statement is `unsupported`, not `disputed`.** `disputed` means sources *conflict* — that requires at least one `refutes`. A statement with only `context` links has no position taken by anyone, so it is unevidenced. (The distinction matters: `disputed` triggers the competing-statements machinery from Q5; `unsupported` does not.)

**A `refutes` link does not make a statement evidenced.** Refutation is not support. A statement whose only links are `refutes` is `unsupported` — and in the CTM case it is the *other* statement in the competing pair that holds the support.

**This is a decision that changes a number, so it is recorded in the ADR rather than left to the metric code:** the corroboration rule is *count ≥2 independent `supports` links on one statement*.

#### Amendment 4 — the excerpt is minimal, quoted verbatim, attribution-bearing, and validated

**The excerpt is the minimal passage that carries the fact — 1–2 sentences — and it is quoted verbatim.** Not a paragraph, not a summary, not a paraphrase.

**The excerpt must be a substring of the stated revision's text.** This is enforceable: for a Wikipedia source with `revision_id = R`, the text of revision `R` is fetchable (`https://en.wikipedia.org/w/index.php?oldid=R&action=raw`), so the check is a substring test against that exact text. The excerpt is validated at write time.

**Why this is a rule and not a convention.** An excerpt that is a paraphrase is a second, unauditable claim about the source — it is the `citations.claim_text` failure one level down. An excerpt that is not a substring of the stated revision is either mis-transcribed or comes from a different revision than the one recorded, and both make the citation a lie. The substring rule makes the excerpt *checkable*, which is the entire point of the column.

**Why minimal (1–2 sentences).** A longer quote makes the excerpt unusable in the evidence panel — it does not show the reader what supports the fact. Minimality is what keeps the excerpt doing the job of *showing the support*, and it is what makes the excerpt vs. locator split meaningful: the locator says *where*, the excerpt says *what*.

**Public display requires attribution.** Where an excerpt is displayed publicly, the source and the license must be shown with it. All current sources are Wikipedia (CC BY-SA 4.0), so the attribution requirement is: **Wikipedia excerpt, with attribution, under CC BY-SA.** The attribution and license live on the `sources` row (`reliability` is being deprecated under Q6, but `source_type`/license metadata stays).

**A note on what this does NOT do:** a CC BY-SA excerpt displayed on the site is a share-alike obligation on that excerpt, not on the whole work. This ADR records the attribution requirement and defers the license-text and attribution-block implementation detail to the API/UI task (GUS-028) — but it records the requirement now, because it changes what the excerpt column is *for*.

#### Amendment 5 — the migration is overridden: 3 pilot dishes only, the other 118 stay archived

**The draft's recommendation to migrate all 121 citations with excerpts fetched is overridden. The migration covers only the 3 pilot dishes.**

| | |
|---|---|
| **Migrate now** | the 3 pilot dishes only — `rendang`, `chicken-tikka-masala`, `tacos-al-pastor` |
| **Migrated as** | `stance = 'supports'` — with `excerpt` fetched from the source's current text, `revision_id` recorded, `retrieved_at` = the read time |
| **Verification state** | **`unverified` until reviewed** — the agent cannot publish (GUS-026 §10) |
| **The other 118** | stay in the **archived `citations` table** until their statements exist |
| **Forbidden** | **no statements are created in order to receive them** |

**The last line is the point.** The temptation with 118 orphaned citations is to create 118 statements so the citations have somewhere to live. That is forbidden, and it is forbidden because it does the exact thing this ADR exists to prevent: it manufactures claims to fit the evidence rather than deriving claims from the evidence. A statement created for a citation is a statement whose granularity was decided by whatever prose happened to be in `citations.claim_text` — which is the old model, restated. **Statements are derived from the research; the citations attach to statements that exist.**

**The migration is a RE-READING, recorded as such.** The pilot citations' excerpts are fetched from the source's current text at the cited locator, and the `revision_id` of the revision actually read is recorded. This is honest about what it is — the passage as it stands on a specific, recorded revision — rather than pretending it was captured at the original citation time.

**The migrated rows are `unverified` until reviewed.** GUS-026 §10 is explicit that an agent may not move a claim to `verified` and may not publish. The pilot's migration is performed by an agent, so the result is `unverified`: the rows exist, the excerpts are real and checkable, but **no pilot statement is published by this ADR**. A human reviews the 3 pilot dishes and moves them. This is the same boundary Q2 already established for readings (a bot-drafted reading stays `draft`).

**The other 118 remain in `citations`, untouched and unarchived-by-migration.** The `citations` table stays as a live table holding 118 rows that the new model does not yet cover. That is the honest state: the catalog's evidence for those dishes is a lead, not a checkable citation, until someone does the work.

**One consequence worth stating:** the pilot's corroboration number will be computed over 3 dishes with agent-performed re-readings, while 118 dishes have no statement at all. **Any coverage percentage computed across the whole catalog in this state is meaningless** — it is 3/N of a curated pilot against an empty remainder. The pilot's numbers are a **validation of the model**, not a measurement of the catalog, and must be labelled as such wherever they are reported.

---

### Q7 (original) — What does an evidence link carry?

**Decision:** the shape of the claim↔source link, and what it must record for a citation to be checkable.

**Q1 has already settled the division of labour:** *the exact source passage and locator live on the **evidence link**, not on the claim.* This question decides that link's shape.

**What the current `citations` table does** (measured live): `id`, `source_id`, `target_type`, `target_id`, `claim_text`, `location`, `added_by`, `added_at`. It has **121 rows, all `target_type='dish'`**, and the `location` values are only `"Lead paragraph"` and `"History section"`.

**Recommendation: a `claim_citations` table — one row per (statement, source) pair — carrying `stance`, the locator, the exact passage, AND the retrieval anchor.**

```
claim_citations (
  id            uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  statement_id  uuid NOT NULL REFERENCES statements(id),
  source_id     uuid NOT NULL REFERENCES sources(id),
  stance        enum('supports','refutes','context') NOT NULL,
  -- WHERE in the source the passage sits
  locator       text,        -- 'section 3', 'para 2', 'p. 42', 'Lead paragraph'
  -- the EXACT text that supports the statement, quoted verbatim
  excerpt       text,
  -- the retrieval anchor
  revision_id   text,        -- Wikipedia revid (e.g. '1381860136'); null for non-versioned sources
  retrieved_at  date,        -- when the passage was read
  accessed_at   timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (statement_id, source_id, stance)
)
```

**Why `stance` is not optional.** It is what makes a **dispute** representable. The Glasgow case is one proposition — *"chicken tikka masala originated in Glasgow"* — with one supporting chain and one refuting chain. Without `stance`, both would be indistinguishable "citations", and the model could not say *this source disagrees with that one*. ADR-001 §2.4 already sketches `supports enum('supports','refutes','context')`.

**Why the passage AND the locator AND the revision id are all needed.** Each covers a different failure:

| | without it |
|---|---|
| **`excerpt`** (the verbatim passage) | a citation says *"supported"* but nobody can see what the source actually said. The reader cannot check the claim, and a future editor cannot detect that the source has been edited under it. |
| **`locator`** (where in the source) | the passage is quoted but not located, so it cannot be re-found and re-checked. A whole-article quote is not evidence. |
| **`revision_id`** | the source is mutable. A Wikipedia article cited on 26 October is a *different document* from the one cited in March. Without the revision id, the citation silently drifts to whatever the article says today — the link still resolves, the claim it was supposed to support may no longer appear in it. |

**The revision id is available and cheap.** The MediaWiki API returns it directly — verified live: for `Rendang`, `revid=1381860136`, `timestamp=2026-10-25T07:01:26Z` — and `https://en.wikipedia.org/w/index.php?oldid=<revid>` is a **permanent permalink** to that exact revision.

**So the evidence link must carry the Wikipedia revision id, or a retrieval date for sources that are not versioned.** For a non-versioned source (a printed book, a PDF), `revision_id` is null and `retrieved_at` is the anchor instead — the source is fixed, so the retrieval date records *when it was read*, which is the only temporal fact available.

**Both together, because they answer different questions:**

| | answers |
|---|---|
| `revision_id` | **which version of the document** the passage was read from |
| `retrieved_at` | **when** the passage was read |

For a Wikipedia article, `revision_id` is the stronger anchor and `retrieved_at` still matters — the revision might have been read on a later date than it was created. For a fixed source, only `retrieved_at` is available.

**What the existing 121 citations become.** They have a `location` ("Lead paragraph" / "History section") but **no excerpt, no revision id, and no retrieval date** — and their `claim_text` is the whole `short_description` (120 of 121), which is the thing being fixed.

**My recommendation: they are migrated as `stance='supports'` rows with the locator preserved and `excerpt` / `revision_id` / `retrieved_at` NULL, marked as `migrated_legacy`.** They are then **enriched** as each reference dish is re-researched (GUS-028's work). A citation without an excerpt is not fully checkable, but it is a real pointer to a real source at a real location, and discarding it would lose the only evidence the catalog has.

**The alternative, and it is stronger in one respect:** migrate them as `stance='supports'` **with the excerpt populated from the source's current text at the cited locator** — which can be fetched mechanically, because the locator is a section name. That produces checkable citations immediately, at the cost of the excerpt being the text *today* rather than the text *at the time of the original citation* — which is a real difference, and is exactly what the missing revision id was hiding.

**My recommendation: migrate with the excerpt fetched, AND record the revision id of the revision that was read.** That makes the migrated citation honest about what it is — the passage as it stands on a specific, recorded revision — rather than pretending it was captured in March. It is a **re-reading**, recorded as such, not a reconstruction of a reading that never happened.

**One thing I will decide rather than ask:** the old `citations` table is **not** dropped in this migration. It is emptied by re-pointing its rows and then **archived** — because `citations.target_type/target_id` is a **dish-level** link that the new model does not replace, and three dishes' articles point at it. Dropping a live table with 121 rows needs approval under RULES.md, and there is no reason to do it before the new path is proven.

---

### Q7 (original) — How is a claim linked to a source, and what does a citation row carry?

**Decision:** the shape of the claim↔source link.

**Recommendation: a `claim_citations` table, one row per (claim, source) pair, carrying `supports | refutes | context` and the locator.**

```
claim_citations (
  claim_id uuid -> claims,
  source_id uuid -> sources,
  stance enum('supports','refutes','context'),
  locator text,        -- 'p. 42', 'section 3', 'para 1', 'Lead paragraph'
  excerpt text,        -- the quoted passage
  accessed_at date
)
```

**Reason:** `stance` is what makes a dispute representable. The Glasgow case needs one claim, one supporting chain and one refuting chain — with `stance='supports'` on one side and `stance='refutes'` on the other. ADR-001 §2.4 already sketches `supports enum('supports','refutes','context')`.

**The `locator` is what makes a claim checkable.** Today's `citations.location` is `"Lead paragraph"` — a section, not a location. For an origin claim you need *which* paragraph, and ideally a quote. A claim whose source says "some say X" at "para 3" is auditable; one whose source says "X" at "Lead paragraph" is not.

**Alternative: keep the existing `citations` table and add `claim_id` to it** (ADR-001 §2.2 says exactly this: `citations` extended). Fewer tables; but `citations` today also carries `claim_text` and `target_type/target_id`, and keeping those means keeping the old prose model alive alongside the new one — which is how a system ends up with two truths.

---

### ✅ Q8 — DECIDED (Alejandro, 2026-10-27): independence is STORED, tri-state, and counted on class sufficiency

**Independence is a recorded editorial judgement, not a computed heuristic.** It is stored at two levels, it is tri-state, and it only counts when a source's class is sufficient for the claim.

```
-- Postgres has no inline enum on a column, so each enum needs a NAMED type.
CREATE TYPE independence_relation AS ENUM ('independent','derived','unassessed');
CREATE TYPE derivation_relation   AS ENUM ('mirror','translation','edition','reprint','other');

-- LEVEL 1: whole-source derivation (mirrors, translations, editions)
source_derivations (
  id                   uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  source_id            uuid NOT NULL REFERENCES sources(id),
  derives_from_source_id uuid NOT NULL REFERENCES sources(id),
  -- the kind of derivation
  relation_type        derivation_relation NOT NULL,
  note                 text,
  created_at           timestamptz NOT NULL DEFAULT now(),
  UNIQUE NULLS NOT DISTINCT (source_id, derives_from_source_id, relation_type)
)

-- LEVEL 2: per-citation, claim-specific independence judgement
citation_independence (
  id                   uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  statement_id         uuid NOT NULL REFERENCES statements(id),
  source_id            uuid NOT NULL REFERENCES sources(id),
  compared_source_id   uuid NOT NULL REFERENCES sources(id),
  -- the recorded judgement about THIS PAIR, for THIS claim
  relation             independence_relation NOT NULL,
  note                 text,
  assessed_by          text,
  assessed_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE NULLS NOT DISTINCT (statement_id, source_id, compared_source_id)
)
```

**Verified on the live server before recording it** (Postgres 16.4, a temporary table carrying the level-2 constraint and the named enum type):

| case | expected | result |
|---|---|---|
| same pair assessed twice with different verdicts | **rejected** | ✅ rejected with `unique_violation` — one judgement per (statement, source, compared_source) |
| same pair, **different statement**, different verdict | **accepted** | ✅ accepted — level 2 is per claim |
| `unassessed` storable as an explicit state | **accepted** | ✅ accepted — it is a real state, not NULL and not a default |
| counting only `relation='independent'` | **1** | ✅ tally `independent=1 derived=1 unassessed=1` — `derived` and `unassessed` excluded |

#### Amendment 1 — corroboration counts only class-sufficient `supports` links; S6 never counts

**A corroborating source must be a class that is sufficient for the claim, and S6 never is.** The corroboration rule is therefore:

> **Corroborated = ≥2 `supports` links on the statement, from sources whose `source_class` is sufficient for that claim's predicate and claim_class, counted pairwise as independent under Amendment 2.**

This is the conjunction of two rules already in GUS-026, made into one check:

| rule | source |
|---|---|
| **Class sufficiency** — S6 is *"discovery and terminology only"*; S7 is *"nothing"* | GUS-026 §3 |
| **The Wikipedia rule** — a `documented`/`disputed` origin claim needs ≥1 S1/S2/S3/S5 source; S6 may accompany but not stand alone | GUS-026 §3.1 |
| **Quantity is not independence** — *"five websites repeating the same unsourced assertion is one assertion"* | GUS-026 §5 |

**The pilot's corroboration is therefore 0, by policy.** All 142 catalog sources are `en.wikipedia.org` → **S6** → they are sufficient for nothing and count toward nothing. This is not a gap to be closed by recording Wikipedia derivations; it is the policy working. **No Wikipedia derivation work is needed**, and none is queued.

**This makes the pilot's number truthful rather than flattering.** The alternative — counting Wikipedia articles as corroboration for one another — would have produced a non-zero number that meant *"Wikipedia's article agrees with itself"*, which is the exact thing GUS-026 §5 forbids.

**One consequence that has to be stated plainly:** with S6 counting for nothing, **the pilot cannot demonstrate a corroborated claim at all using catalog sources.** Corroboration can only be demonstrated with sources that do not exist yet — which is exactly why Amendment 4 requires the pilot to acquire real non-Wikipedia sources rather than measure the number.

#### Amendment 2 — independence is tri-state, and there is NO default

```
relation enum('independent','derived','unassessed')
```

**Three states, and only one of them counts:**

| relation | counts toward corroboration? | meaning |
|---|---|---|
| `independent` | **YES** | explicitly assessed: neither source derives from the other |
| `derived` | **NO** | explicitly assessed: one derives from the other for this claim |
| `unassessed` | **NO** | not yet judged — **not a synonym for independent** |

**The draft's default is rejected: "no derivation recorded = independent" is not permitted.** The draft proposed *"a source with no derivation is independent of every other source"* — that default is what made the draft's own conclusion inevitable (corroboration 0 across a catalog with no derivations, but 1 for any two Wikipedia pages that happened not to link each other). It also encodes an **absence of evidence as evidence of absence**, which is the same error the rest of this ADR exists to remove.

**Why the tri-state matters more than it looks.** The distinction between `unassessed` and `independent` is the difference between *"we checked and they are independent"* and *"we never checked"*. Collapsing them into a boolean would let an unexamined pair accumulate corroboration credit simply by being present. **A pair that has not been assessed contributes zero.** So an incomplete assessment produces an *understated* number, never an inflated one — which is the safe direction to err in.

**The practical consequence for the pilot:** the corroboration number is not "how many sources agree" but "how many pairs have been **explicitly judged** independent, among sources whose class suffices." Both conditions must hold.

#### Amendment 3 — two levels: source-level derivation and per-citation judgement

**Level 1 — `source_derivations`: whole-source derivation.** Two *sources* are the same document: a translation of another, a reprint of an edition, a mirror. This is a property of the sources themselves and holds for every claim both cite.

**Level 2 — `citation_independence`: per-citation, claim-specific judgement.** Two sources can be entirely distinct documents and still not be independent *for one particular claim* — a book may quote a specific passage from a newspaper for a specific fact while being an otherwise independent source for everything else. That judgement is per (statement, source pair), because it is per claim.

**Why both levels and not just one:**

| | level 1 (`source_derivations`) | level 2 (`citation_independence`) |
|---|---|---|
| scope | the source as a document | the claim |
| example | an English translation of a Dutch original | a book quoting a newspaper for one fact |
| holds for | every claim both sources cite | that one statement only |
| determined by | document identity | editorial judgement |
| effect | the pair never counts | the pair does not count for that statement |

**Level 1 is a hard block, and it is checked first.** If two sources are in a `source_derivations` chain, they are the same source and the pair is `derived` for every claim — no per-citation judgement can override that, because a translation of a source cannot independently corroborate it. The `citation_independence` row for such a pair would be `derived`, recorded once and applied everywhere.

**Level 2 is where the real editorial work lives**, and it is where the tri-state lives too. Level 1 alone would answer *"are these the same document?"*; level 2 answers *"are these independent **for this fact**?"* — which is GUS-026 §5's actual test.

#### Amendment 4 — the pilot must exercise the path, including a derived-pair negative case

**The pilot must not merely measure the number — it must demonstrate that the mechanism works, in both directions.**

**The positive case, in the pilot's 3 dishes:**

> **One rendang statement (the origin claim) carries 2 real, non-Wikipedia sources.** Both are fetched and recorded with excerpts and revision anchors (Q7), both are classified **S1–S5** (so they are class-sufficient, per Amendment 1), and the pair is **explicitly assessed `independent`** (per Amendment 2).

**The negative case:**

> **A `derived` pair is constructed and verified to NOT corroborate.** If the two rendang sources turn out to share an upstream reference, the pair is assessed `derived` and the statement does not corroborate. The derived-pair case is built **in the test database, not live** — it is a fixture that proves the `derived` path returns 0 corroboration credit.

**Why the negative case must be built, not just specified.** A check that has only ever seen `independent` has not been shown to *reject* anything. The `derived` path is the one that has to be right — it is the path that stops a claim being published on the strength of one source twice. Building it in the test DB means the live pilot's 3 dishes carry only real, assessed judgements.

**And the pilot's own number is 0 until the non-Wikipedia sources exist.** Amendment 1 says S6 counts for nothing; so the pilot's Wikipedia-sourced statements corroborate at **0**, correctly. The pilot's *corroboration* number becomes non-zero only once Amendment 4's non-Wikipedia sources are in place and assessed independent.

#### What is decided here and what is not

**Decided:** independence is stored (not computed); tri-state with no default; two levels (source-level derivation + per-citation judgement); corroboration requires class-sufficient `supports` links **and** explicitly-assessed independent pairs; the pilot exercises a positive independent case and a negative derived case, the negative one in the test DB.

**Workload policy — flagged here, CLOSED by Alejandro, 2026-10-27.** The open question was whether `citation_independence` rows are written for **every** pair of sources on a statement, or only for pairs that a reviewer is asked to adjudicate. The first is exhaustive and expensive; the second is a workflow choice. **The answer: rows are written ONLY for class-sufficient `supports` pairs on the same statement.** The table is **not** populated exhaustively for every source pair; it is populated only where the pair is worth adjudicating — i.e. where both sources are class-sufficient `supports` for the same statement, and independence therefore affects a corroboration count.

**No row means `unassessed`, and an unassessed pair contributes zero.** A pair that is not worth adjudicating simply has no row, which *is* the `unassessed` state. **Absence of a row is not evidence of independence** — the same rule as Amendment 2, applied at the storage layer rather than the enum.

**Why this is the right scope.** It makes the workload proportional to what the metric actually consumes: every row in the table is a row that could change a corroboration count. Rows for pairs that could never corroborate anything are work with no reader.

**Also flagged:** `source_derivations.relation_type` includes `mirror`, `translation`, `edition`, `reprint` — the document-identity relations. `other` is present so an unusual case is recordable rather than forced into a wrong bucket, and `note` carries the explanation.

---

### Q8 (original) — What does "independent" mean operationally, and is it stored or computed?

**Decision:** how source independence is determined.

**Recommendation: store an explicit `derives_from` relationship between sources** — `source_derivations (source_id, derives_from_source_id, note)` — and compute independence by traversing it. A source with no derivation is independent of every other source.

**Reason:** GUS-026 §5 gives the test — *"If this source were deleted, would the other still say the same thing?"* — but that is a **human editorial judgement**. Storing the judgement makes it reviewable and auditable; recomputing it from the text would make it unreproducible.

**The hard part, stated plainly:** this requires a human to record derivations, and there are currently **142 sources, all Wikipedia pages**. Wikipedia pages do cite each other, and many of the catalog's "sources" are one article's restatement of another's. Until those derivations are recorded, **corroboration for the whole catalog is 0** — which is the truthful number and exactly what GUS-011 implies.

**Alternative: independence is computed at query time** by comparing citations, URLs and publication lineage automatically. No manual curation, but the result is only as good as the heuristic, and it cannot know that two encyclopedias copied the same unsourced wiki page.

---

### ✅ Q9 — DECIDED (Alejandro, 2026-10-27): a structured sentence table, a boundary-tested splitter, and a managed-write gate

**The anchor is a structured sentence table.** Not inline markers — because they would leak into the public column and break translations, and offsets break on edit.

```
description_sentences (
  id             uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  dish_id        uuid NOT NULL REFERENCES dishes(id) ON DELETE CASCADE,
  -- which column this sentence came from
  field          enum('short','long') NOT NULL,
  locale         text NOT NULL,
  -- ordinal position within (dish, field, locale)
  position        int NOT NULL,
  text            text NOT NULL,
  -- how completely this sentence's facts are anchored
  anchor_status   enum('full','partial','none') NOT NULL DEFAULT 'none',
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE NULLS NOT DISTINCT (dish_id, field, locale, position)
)

sentence_claims (
  sentence_id   uuid NOT NULL REFERENCES description_sentences(id) ON DELETE CASCADE,
  statement_id  uuid NOT NULL REFERENCES statements(id),
  -- the VALIDITY of this anchor (Q9 flag 1)
  status        enum('ok','missing','retracted','unpublished','contradicting')
                NOT NULL DEFAULT 'ok',
  note          text,
  PRIMARY KEY (sentence_id, statement_id)
)
```

**The rules:**

| # | rule |
|---|---|
| 1 | `short_description` is rendered from the sentences; the concatenation must equal the live column **exactly** |
| 2 | a sentence text edit sets its anchors to `needs_review` — Q2's stale mechanism |
| 3 | anchors are recorded on the **canonical** text only (the `dishes` columns) |
| 4 | the splitter is **a rule plus a fixture set**, with **one implementation** used for both population and the check |
| 5 | a `sentence_managed` flag plus a **trigger** rejects direct `short_description` writes for flagged dishes |

#### Amendment 1 — the concat check is the gate; a boundary fixture set proves the boundaries

**The round-trip proves nothing about boundaries.** A zero-width split rejoins exactly *by construction* — it never removes a character, so it reconstructs the input whether the boundaries are right or wrong. It is a **table↔column consistency gate**, not a boundary test, and the ADR now says so.

**So the check has two parts, and they are different instruments:**

| instrument | what it proves | what it cannot prove |
|---|---|---|
| **concat check** | the sentence table and the live column agree, byte-for-byte | that the sentences are the right *sentences* |
| **boundary fixture set** | the splitter puts boundaries in the right places | nothing about table/column agreement |

**The fixture set** covers the five cases the live catalog happens not to contain today:

| case | example | why |
|---|---|---|
| **quotes** | `"Babi" means pig and "panggang" means grilled` | a terminator inside a quoted span must not end a sentence |
| **decimals** | `Simmered for 1.5 hours at 90 C` | `.` between digits is not a sentence boundary |
| **abbreviations** | `St. Louis`, `Inc.`, `Ltd.`, `Dr.`, `Mr.`, `vs.`, `etc.` | a terminator after an abbreviation is not a boundary |
| **initials** | `J. R. R. Tolkien`, `A. USDA grade` | a single capital + `.` is not a boundary |
| **ellipses** | `The dish is... contested.` | `...` is not a terminator |

Each fixture is a `(input, expected_splits)` pair. **The same splitter implementation serves both the population run and the check** — one implementation, so the check cannot pass against a different splitter than the one that wrote the rows.

**And the fixtures do not replace human review of the pilot sentences.** The fixture set proves the rule is implemented correctly on the cases it names; it cannot prove the rule is *right*. The pilot's 3 dishes are therefore **read by a human** and their boundaries confirmed — the fixtures narrow the review to a known set of risks, they do not replace it.

**The rule, stated as a rule rather than a regex.** A sentence ends at a terminator (`.` `!` `?`) that is (a) not inside a quoted span, (b) not between digits, (c) not part of an abbreviation or initial, and (d) not part of an ellipsis; and that is followed by whitespace.

**The live catalog has none of these cases today** — measured: 0 decimals, 0 initials (`A.`), 0 abbreviations (`Inc`/`Ltd`/`St`/`Dr`/`Mr`/`vs`/`etc`) in either description column. **That is a property of today's data, not a guarantee**, which is exactly why the rule carries an escape hatch and the fixtures exist.

#### Amendment 2 — the validity axis (Alejandro's amendment) and canonical-by-definition (Alejandro's amendment)

**These two were Alejandro's amendments, not findings from my draft — the draft listed five.** The draft's count was five, and the two items below were added by Alejandro's review. The ADR records them here with their origin stated, so the history is not misread.

**Amendment 2a — the validity axis has its own enum, on the anchor.**

`sentence_claims.status` carries the *validity* of each anchor, kept separate from `anchor_status`'s *coverage*:

```
enum('ok','missing','retracted','unpublished','contradicting')
```

| value | meaning |
|---|---|
| `ok` | the statement exists, is published, and is not contradicted |
| `missing` | the statement no longer exists |
| `retracted` | the statement's status is `needs_revision` or `disputed` |
| `unpublished` | the statement is not `published` — **the agent boundary (GUS-026 §10) in anchor form** |
| `contradicting` | the statement's `claim_class` is `disputed` or `unsupported` |

**A sentence's `anchor_status` is `full` only if every one of its anchors is `ok`.** A sentence can be `full` in coverage and still fail D4's check — which is exactly why the two axes are separate. The vocabulary is Q3's, reused.

**Amendment 2b — the `dishes` columns are canonical by definition; `dish_translations` is non-canonical.**

There is **no locale column to add**, and none is needed:

- **The canonical text IS `dishes.short_description` / `dishes.long_description`.** `description_sentences.locale` is populated with the catalog's canonical locale value (currently `en`), and `dish_translations` is by definition **non-canonical** — it holds renderings, not assertions.
- **So `dish_translations` is not a source of sentences.** Its 121 `en` rows are byte-identical duplicates of `short_description` (measured: 121/121 identical, 0 nulls, 0 differences). Anchoring against them would anchor every fact twice and double-count coverage.
- **The 121 duplicate `en` translation rows are backlogged for archiving.** They are not translations; they are copies. Archiving them is separate work, recorded as a backlog item rather than done under this ADR.

This retires the GUS-226 dependency for Q9: **GUS-226's scope decision is no longer blocking**, because the canonical source of sentences is settled by definition.

#### Amendment 3 — the draft's five findings, as accepted

The draft listed **five** findings. All five are accepted as stated:

- **Draft finding 1 (the validity axis) → Amendment 2a.** One sentence → many statements, and one statement → many sentences (the same fact may be asserted in both `short` and `long`). Confirmed by measurement: **rendang's single sentence asserts 7+ facts** (origin, family, protein, technique, medium, aromatics, duration), so D6's "6 claims for rendang" is an undercount. **Raised as GUS-225.**
- **Draft finding 2 (canonical locale) → resolved by Amendment 2b** — canonical by definition, no locale column needed.
- **Draft finding 3 (the `test-dish-7c` fixture) → GUS-231.** The fixture is already `dishes.status='archived'`, and the `dishes.status` CHECK constraint restricts the value to `draft`/`published`/`archived`. **The `sentence_managed` flag and any population run are gated on `status='published'`**, which excludes the fixture by construction — no special-case list needed. GUS-231's standing check ("no non-published dish can enter a metric population") covers the same ground.
- **Draft finding 4 (the splitter escape hatch) → accepted**, and is now Amendment 1's rule plus fixtures.
- **Draft finding 5 (the many-to-many anchor relation) → GUS-225**, as above.

#### Amendment 3a — `sentence_managed` changes are logged; unsetting the flag is gated

**Two amendments to Amendment 5, both from Alejandro's review.**

**(a) Every `sentence_managed` change is logged in `edit_history`.** The flag is a **write-path control**, not a cosmetic attribute — it decides whether a column may be written directly. A change to it must be auditable, and `edit_history` is already the project's provenance signal (`target_type='dish'`, `target_id`, `action`, `diff` jsonb, `comment`). The GUS-014 pilot migration shows the established pattern — one `edit_history` row per changed dish, `action='update'`, with a `diff` describing the operation and a `comment` naming it.

The trigger writes the row itself, in the same transaction as the flag change, so the log cannot be skipped by a caller that forgets to log.

**(b) Unsetting the flag must re-sync the sentence table, or the change is rejected.** **This is the bypass the amendment closes.** If `sentence_managed` can be set to `false` without anything reconciling the sentences, then the trigger is disabled *and* the table and the column can be out of sync — the flag becomes an escape hatch rather than a guarantee. Two acceptable behaviours, and **one of them must hold**:

- **re-sync on unset** — unsetting the flag re-renders `short_description` from `description_sentences` (or re-populates the sentences from the column), so the two are consistent at the moment the flag is dropped; or
- **reject the unset** — the flag may only be cleared once the sentence table and the column are already consistent, and the trigger **verifies** that consistency and raises if it does not hold.

**The second is the stronger choice** and is what the ADR records, because the first can silently overwrite an edited column with a stale reconstruction — losing prose. **Verify-then-clear** preserves both properties: the flag cannot be used to smuggle in a desynced state, and it cannot destroy content.

**So the trigger has two duties on the flag transition**, not one:

| transition | duty |
|---|---|
| `false → true` | log to `edit_history`; the dish's sentences must exist and be consistent, or the change is rejected |
| `true → false` | log to `edit_history`; the sentence table and the column must be consistent, or the change is rejected |

**Consistency means the concat check passes** — the reconstructed string equals the live column. So the trigger calls the same check the migration and the verifier use. **One definition of consistency, used by all three.**

#### Amendment 3b — the API change lands BEFORE the trigger

**The `dishes-write.ts` change is deployed before the trigger is applied.** This is an ordering constraint, and it is not optional.

If the trigger is applied first, every `PATCH /api/dishes/:slug` that sets `shortDescription` on a flagged dish **fails** — the route still writes the column directly, so the trigger rejects it and the API returns an error for a request that used to succeed. That is a user-visible regression on the pilot dishes, caused entirely by ordering.

**So the sequence is:**

1. **Ship the API change** — the PATCH path writes through the sentence table for flagged dishes (and keeps the direct write for unflagged ones).
2. **Then apply the migration** — the `sentence_managed` column, the trigger, and the `edit_history` logging.

**Both steps are in the same PR or in two ordered PRs — but the trigger's migration must not be merged before the API change is live.** The migration is a schema change to a live table and needs approval under RULES.md; the API change is code and does not. **The code lands first, and that is also the cheaper order**, because a code change that breaks nothing can be reverted without a migration.

**One consequence worth stating:** after the trigger is live, a `PATCH` that sets `shortDescription` on a flagged dish returns an error rather than silently desyncing. That is the intended behaviour — a loud failure instead of a quiet one — and it should be covered by an API test.

#### Amendment 4 — population scope: the 3 pilot dishes only; `long` is moot

**`description_sentences` is populated for the 3 pilot dishes only** — `rendang`, `chicken-tikka-masala`, `tacos-al-pastor` — following Q7's migration precedent.

**`long` is moot for the pilot, because it is empty.** Measured: all 3 pilot dishes have `long_description` **NULL/empty** (`long_len = 0` for each). So the pilot populates `field='short'` only, and the `long` path is untested by the pilot.

**That is recorded rather than hidden, because it is a real gap in the pilot's coverage of the model.** The `long` path — 166 sentences across 22 published dishes, 1–12 per dish — will be exercised when the content workstream populates `long_description`. **The splitter rule and the fixtures must cover it before then**, and the `field` enum must not be narrowed to `'short'` on the strength of a pilot that could not test it.

#### Amendment 5 — `sentence_managed` flag and the trigger that rejects direct writes

**A `sentence_managed` flag on the dish marks "this dish's description is managed by the sentence table."** When it is set, **a direct write to `short_description` is rejected by a trigger.**

```
ALTER TABLE dishes ADD COLUMN sentence_managed boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION guard_managed_description() RETURNS trigger AS $$
BEGIN
  IF NEW.sentence_managed
     AND NEW.short_description IS DISTINCT FROM OLD.short_description THEN
    RAISE EXCEPTION
      'dish % has sentence_managed=true: short_description is owned by description_sentences; edit the sentences instead',
      NEW.slug
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

CREATE TRIGGER trg_guard_managed_description
  BEFORE UPDATE ON dishes
  FOR EACH ROW EXECUTE FUNCTION guard_managed_description();
```

**Why this is necessary, stated plainly.** The concat check (§ rule 1) is only a *detection* mechanism — it can tell you the table and the column have diverged, but it cannot stop the divergence. **A `PATCH` to `/api/dishes/:slug` that sets `shortDescription` would silently desync the two**, and the desync would not surface until the next check. The trigger makes the managed column **unwritable except through the sentence table**, so the check becomes a backstop rather than the primary defence.

**This is the same trigger-based enforcement pattern the project already uses** — `db/migrations/gus-224-relations-option-b.sql` uses `CREATE OR REPLACE FUNCTION ... RETURNS trigger` plus `CREATE TRIGGER` for relation-direction and relation-type enforcement. The pattern is established, not new.

**Two consequences that must be decided together, not separately:**

1. **The API's PATCH path must write through the sentence table for flagged dishes**, or it will start erroring. The PATCH route (`apps/api/src/routes/dishes-write.ts`) sets `shortDescription` directly today. So for a `sentence_managed` dish, the write must be expressed as *sentence edits*, and the trigger becomes the enforcement point for the route's contract rather than an obstacle.
2. **The flag is what makes the trigger narrow.** Without it, the trigger would reject every description write in the catalog — including the 118 dishes whose descriptions are not sentence-managed and are edited as free text today. **Only the 3 pilot dishes get `sentence_managed = true` initially.**

**The flag is not a lock on the whole row.** `long_description`, `canonical_name`, and every other column remain freely writable; the trigger guards `short_description` only, and only where the flag is set.

#### One decision made rather than asked

**`position` is dense and 1-based per `(dish, field, locale)`.** Gaps would make "the first sentence" ambiguous and would let a sentence be inserted without renumbering. And **the check reconstructs the string and compares it to the live column** — reconstructing and comparing is what makes it a gate; a spot-check is not.

---

### Q9 (original) — How does a claim link to the sentence that states it (the anchor)?

**Decision:** the mechanism by which a description sentence is tied to its claims.

**Recommendation: an explicit `dish_claims` join plus an anchor marker in the description text**, where the marker is a claim id (or a claim *group* id).

```
dish_claims (dish_id uuid, claim_id uuid, ...)
```

and in the description, a stable anchor per sentence, e.g. `[c:7f3a…]` or a structured sentence table with the claims array on the sentence.

**Reason:** ADR-001 D4 already decided that each factual sentence carries claim-ID anchors and that validation **fails** when a sentence is anchored to a missing, retracted or unpublished claim. This question decides *how* the anchor is expressed — which determines whether the validation is enforceable.

**The alternative, and it is a real one: a structured description** — the description stored as sentences in rows, each row carrying its claims array. The anchor problem disappears (there is no free text to mark up), and coverage becomes a plain join.

**The cost:** descriptions stop being a single text blob. Every renderer, every API response and every existing consumer changes, and hand-editing prose means editing rows.

---

### ✅ Q10 — DECIDED (Alejandro, 2026-10-27): statements are independent entities with no owner column

**A statement is an independent entity. It has no owner, no `dish_id`, and no owner FK.** The subject reference is the only link from a statement to the world.

```
statements (
  id           uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  -- the SUBJECT of the statement (an entity reference, per Q3)
  subject_type enum('dish','place') NOT NULL,     -- pilot scope
  subject_id   uuid NOT NULL,
  predicate_id uuid NOT NULL REFERENCES predicates(id),
  -- the VALUE
  value_type   text NOT NULL,        -- 'entity' | 'vocabulary' | 'literal'
  value_ref    uuid,                 -- entity / vocabulary reference
  value_literal text,                -- typed literal (with its literal type)
  -- qualifiers, per Q1/Q4
  qualifiers   jsonb NOT NULL DEFAULT '{}',
  -- class + status, per GUS-026
  claim_class  enum('documented','scholarly_interpretation','oral_tradition',
                    'disputed','hypothesis','unsupported') NOT NULL,
  status       enum('draft','research_pending','under_review','verified',
                    'published','disputed','needs_revision') NOT NULL DEFAULT 'draft',
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  -- ONE FACT IS ONE STATEMENT
  UNIQUE (subject_type, subject_id, predicate_id, value_type, value_ref, value_literal, qualifier_hash)
)
```

#### Amendment 1 — no owner column; "a dish's statements" is a query on the subject

**There is no `owner_id`, no `dish_id`, and no owning-dish FK on `statements`.** The subject FK is the only link.

**"This dish's statements" is a query:**

```sql
SELECT * FROM statements
WHERE subject_type = 'dish' AND subject_id = $1;
```

**Why there is no owner column.** The whole reason to share a statement is that the *same fact* can be asserted by several dishes. "Rendang uses coconut milk" and "nasi lemak uses coconut milk" are **one fact about one ingredient** — and if each dish owned a statement, they would be two statements with two evidence chains, so corroboration across the catalog would be invisible and the research effort would be duplicated per dish. An owner column would make that duplication the schema's default rather than an accident.

**The cost, stated plainly.** A statement's subject is a *single* entity, so a statement cannot natively be "about two dishes". When a fact genuinely spans dishes — "both of these are traditionally cooked with coconut milk" — that is **two statements** (one per subject) sharing evidence, or a statement about the *ingredient* if one exists. **The model expresses shared facts by sharing the subject, not by widening the subject.**

**How a dish's statements are reached, and how they are NOT.** The subject gives the *direct* statements: the facts asserted **about that dish**. But a dish's description also asserts facts about **other** entities — a `tacos-al-pastor` sentence may assert something about **Puebla**, and that statement's subject is `place`, not `dish`. So:

- **"Statements about this dish"** = `WHERE subject_type='dish' AND subject_id = <dish>` — the direct, owned-by-subject set.
- **"Statements this dish's text asserts"** = join through `description_sentences` → `sentence_claims` — a *different* set, which includes statements about other subjects.

**These two sets are not the same, and conflating them is the failure this amendment prevents.** See Amendment 2.

#### Amendment 2 — a sentence may anchor a statement about a different subject; dish coverage is over its own sentences

**A sentence is a place where a fact is asserted; the sentence's dish and the statement's subject are independent.**

`tacos-al-pastor`'s sentence *"Mexican tacos of marinated pork cooked on a vertical spit…"* may anchor a statement whose subject is **`place` → Puebla** (the origin) as well as statements whose subject is **`dish` → tacos-al-pastor** (the technique). **That is correct and required**, because the sentence is where the claim is made, and the claim is about whatever the claim is about.

**So: a dish's coverage is computed over its own sentences, regardless of what subject the anchored statements have.**

```
coverage(dish) = anchored sentences of this dish / total sentences of this dish
```

**Not** "statements whose subject is this dish" — that would measure the wrong thing. A dish's description is a piece of prose, and the question D4b asks is *"is every fact asserted in this prose anchored?"* — which is a question about **the prose**, not about the subject distribution of what it asserts.

**Why this matters concretely.** The tacos-al-pastor pilot would otherwise score **0% coverage** under the subject-restricted reading: its sentences assert facts about Puebla, about the dish, and about shawarma — very few statements have the tacos as their subject. Under the correct reading, coverage asks *"is each sentence anchored to a statement that supports it?"*, which is what a reader wants to know and what D4b means.

**The corollary, and it is the important one: a statement's evidence is shared, but a statement's *anchor* is per-sentence.** The same statement about "coconut milk" can be anchored in rendang's sentence and in nasi lemak's sentence, with one evidence chain (Q8's corroboration) and two anchors (Q9). **Evidence is per-statement; anchoring is per-sentence.** Conflating those would either duplicate evidence chains or lose anchors.

#### Amendment 3 — dedupe: the same fact is the same statement

**One fact is one statement.** Two rows asserting the same fact would split the evidence chain, and a claim corroborated by two sources would look like two uncorroborated claims.

**The unique key is `(subject, predicate, value, canonical qualifier hash)`.**

| part | why it is in the key |
|---|---|
| `subject_type`, `subject_id` | the fact is about something |
| `predicate_id` | the fact is a relation |
| `value_type`, `value_ref`, `value_literal` | the fact has a value |
| **`qualifier_hash`** | the fact is scoped — same relation, same value, different scope = different fact |

**The qualifier hash is the interesting part.** Q1 gave statements qualifiers (`place`, `period`, `variant`, `occasion`, `role`), and two statements that differ in any qualifier assert **different facts** — the Glasgow case is exactly this: *"CTM originated in Glasgow" scoped by one `period`* and *"CTM originated in the subcontinent" scoped by the same `period`* are competing statements about one proposition but **not the same statement**.

So the qualifiers are part of the identity. **They are stored in one `jsonb` column and hashed for the unique key.**

**Why a hash and not the jsonb itself.** A `jsonb` column can be indexed directly in Postgres — `UNIQUE (…, qualifiers)` works, because jsonb has a well-defined equality. **But jsonb equality is key-order-independent and whitespace-insensitive, which is what makes it usable here — a qualifier set written in a different order is the same qualifier set.** The hash is the *implementation* choice that keeps the key a fixed-width scalar, so the index is compact and the comparison is a single integer rather than a jsonb comparison on every insert.

**The hash must be CANONICAL.** It is not a hash of arbitrary JSON bytes — it is a hash of the **normalised** qualifier set: keys sorted, values in their canonical form, absent qualifiers omitted rather than stored as null. Two writers producing the same qualifier set in different orders must produce the same hash, or the dedupe silently fails and the evidence splits — which is the exact failure this key exists to prevent.

**And the hash is a key, not a storage format.** The qualifiers themselves stay in the `jsonb` column, readable and queryable; the hash column exists only to make the uniqueness check cheap and stable. **A hash collision would merge two different facts**, so the hash must be wide enough that collision is not a practical concern (a truncated hash is not acceptable here).

**What this means in practice:** inserting the same fact twice is **not an error the caller has to handle** — it is a constraint violation that says *"this fact already exists; attach your evidence to the existing statement."* That is the intended workflow: **find-or-create the statement, then add the citation to it.**

#### Amendment 4 — no cascade deletes; retraction is a status change

**No cascade delete from `description_sentences` or `dishes` reaches a statement, and no statement is ever hard-deleted.**

**Retraction is a status change.** GUS-026 §6's states include `needs_revision` and `disputed` — and the status vocabulary exists precisely so that a retracted statement is **marked, not removed**. Q3's consistency check already reads this: a dimension row whose statement is `needs_revision`/`disputed` is flagged **retracted**.

**Why this matters for the evidence model.** A statement carries its evidence chain (Q7's `claim_citations`, with excerpts, revision ids and retrieval timestamps). **If a statement were deleted, its evidence would be deleted with it** — and that evidence is the most expensive thing in the catalog to produce. **Deletion would make the research unrepeatable.** A retracted statement keeps its evidence, keeps its anchors, and keeps its place in the history — so a reader can see what was once claimed, on whose authority, and why it was withdrawn.

**What "no cascade deletes" means concretely:**

- `description_sentences` → `sentence_claims` **cascades** (an anchor to a deleted sentence is meaningless — this is the one cascade, and it is a *link* deletion, not an *evidence* deletion).
- `statements` → `claim_citations` **does not cascade**. A statement is retracted, not deleted.
- `dishes` → `description_sentences` **does not cascade**. A dish that is deleted or archived leaves its sentences; and the sentences are what the statements are anchored to.
- `statements` → **nothing cascades out of it.**

**One thing that does cascade, and it is not a deletion of content:** `sentence_claims.status` is updated to `missing` when the statement is deleted, per Amendment 2b's vocabulary. So a dangling anchor is *marked*, not silently left.

**And the dish itself.** `dishes.status='archived'` is the existing mechanism (GUS-231), not a delete. The catalog archives; it does not delete.

#### The consistency check, now that ownership is settled

**A dimension row's `statement_id` must reference a statement whose subject is that dish.**

```sql
-- every dimension row's statement must be about THAT dish
SELECT dr.*, s.subject_id
FROM dish_dish_families dr
JOIN statements s ON s.id = dr.statement_id
WHERE s.subject_type <> 'dish' OR s.subject_id <> dr.dish_id;
```

**Why this check exists, and what it catches.** Q3 gave every dimension row a nullable `statement_id` pointing at the statement that supports it — *"the row is the index, the statement is the evidence."* With ownership settled (no owner column, subject is the only link), **the subject and the row's dish must agree**, or the index points at the wrong evidence.

**It catches three real defects:**

| defect | what it looks like |
|---|---|
| **wrong-subject anchor** | a family row for `rendang` pointing at a statement about `West Sumatra` — the index says "rendang is a curry" and the statement says something else |
| **cross-dish mis-assignment** | a cuisine row for dish A pointing at a statement about dish B |
| **the Puebla case, correctly** | a `tacos-al-pastor` **sentence** anchoring a statement about **Puebla** is **CORRECT** and must NOT be flagged — because the check applies to **dimension rows**, not to sentences |

**That last row is the whole point.** The sentence↔statement relation is deliberately allowed to cross subjects (Amendment 2). The dimension-row↔statement relation is **not** — a dimension row asserts something *about that dish*, so its statement must be about that dish.

**A dimension row with `statement_id IS NULL` is NOT a violation.** It is the **unevidenced** state (Q3): a value someone typed, with no evidence yet. **91 dishes have a family assignment and no statement** — that is the honest state of the catalog, not an error, and the check must not report it as one.

#### The catalog's breadth — measured, because the pilot is 3 dishes out of 121

**The pilot is 3 of 121 published dishes. The other 118 are not a homogeneous remainder — they are a catalog spanning 36 countries.** Measured read-only on 2026-10-27:

| | measured |
|---|---|
| published dishes | **121** (+1 archived fixture) |
| **distinct origin countries** | **36** |
| dishes with a citation | **121 of 121** (every published dish) |
| distinct sources cited | 121 |
| `food_regions` rows | **0** — the region table is empty |
| `dish_locations` rows | **0** |
| `geo_entities` | 36, **all `entity_type='country'`**, 0 with a parent, 0 with `wikidata_id` |

**Distribution by origin country:**

| country | dishes | | country | dishes |
|---|---|---|---|---|
| Indonesia | 16 | | Mexico | 4 |
| India | 11 | | Israel | 3 |
| Japan | 10 | | Thailand | 3 |
| China | 9 | | South Korea | 3 |
| Lebanon | 8 | | Spain, Brazil, Singapore, Ethiopia, Colombia, France, Vietnam | 2 each |
| Turkey | 7 | | Puerto Rico, Ukraine, Morocco, Nigeria, US, Portugal, Canada, Austria, Nepal, Poland, Jordan, **UK**, Hungary, Tunisia, Greece | 1 each |
| Philippines, Italy | 5 each | | | |
| Argentina, Peru | 4 each | | | |

**Dimension coverage across all 121 published dishes:**

| dimension | dishes covered |
|---|---|
| technique | 117 |
| cuisine | 102 |
| family | 92 |
| `long_description` | 21 |
| context | 13 |
| ingredient category | **3** |
| tradition | **1** |

**Two things this makes visible that the pilot framing hid.**

**First, the three pilot dishes are not a neutral sample — they are outliers in three specific ways.** Measured for the pilot dishes:

| dish | origin | techniques | cuisines | families | origin date |
|---|---|---|---|---|---|
| `rendang` | Indonesia | 1 | 1 | 1 | — |
| `tacos-al-pastor` | Mexico | 1 | 1 | 1 | — |
| `chicken-tikka-masala` | United Kingdom | 2 | **0** | 1 | 1960–1970 |

- **Two of the three carry no `origin_date`** — and only **8 of 121** catalog-wide have one. So the pilot exercises the `originated_at` predicate **twice out of 121 dishes**.
- **`chicken-tikka-masala` has zero cuisine rows** — it is the Glasgow-dispute dish, deliberately left unset (ADR-001 D1). That is a *deliberate* pilot choice and it is exactly the case where the single-valued/competing-statement machinery is needed, so it is the right choice — but it means the pilot's cuisine coverage is 1 of 2 pilot dishes, not 2 of 2.
- **The pilot's three countries (Indonesia, Mexico, UK) are 3 of the 36.** Indonesia is the single largest cluster at 16 dishes; the pilot touches 1 of those 16.

**Second, the geographic model is far thinner than the catalog.** The pilot's place plan (Q3) seeds `Indonesia`, `Mexico`, `United Kingdom`, `India`, `West Sumatra`, `Scotland`, `Punjab`, `Glasgow`, `Delhi`, `Mexico City`, `Puebla` — **11 places**. But the catalog's 121 dishes are attributed to **36 countries**, and `geo_entities` holds **36 country rows and nothing else**: no regions, no cities, no hierarchy.

**So `originated_in` — the predicate the Wikipedia rule (GUS-026 §3.1) is written about, and the one that needs a non-S6 source — has a country-level target for all 121 dishes but a place hierarchy for only the 3 pilot dishes' countries.** Every non-pilot dish's origin statement would have to point at a bare country row.

**Why this is recorded here rather than in Q11's answer.** Q11 is the migration question, and the migration's *scope* depends on this. It is a measurement, not a decision — and it is the kind of thing that is easy to lose when three decisions in a row have said "the 3 pilot dishes."

**What it does NOT change.** Q7, Q8 and Q9's population scope all say the **3 pilot dishes**, and that is not in question: the pilot validates the *model*, and 3 dishes with a real dispute, a real origin date and a real cross-subject anchor (Puebla) is the right test set. **What it changes is what Q11 must decide:** whether the other 118 ever get statements, and if so, at what place granularity — because a country-only `originated_in` is a much weaker claim than a city-level one, and the pilot's place hierarchy was built for exactly that reason.

**One data-shape note, recorded because it would bite the implementation:** `dishes.origin_location` is a **`geometry` column holding WKB hex**, not a text place name — and 121 of 121 have it populated, while only 8 have an `origin_date`. So "the dish's location" in the data today is a **point**, and "the dish's place" in the model is a **referenced entity**. Any migration that derives a place from `origin_location` is deriving it from a point, which is a *geocode*, not a citation — and the place entity must come from the source, not the geometry.

#### The taxonomy's capacity limit — measured, because the catalog is about to grow

**Adding dishes from unfamiliar locations is a requirement on the VOCABULARIES, not only on the data.** Measured read-only on 2026-10-27, against the 7 dimension vocabularies:

| vocabulary | size |
|---|---|
| families | 25 |
| cuisines | **21** |
| courses | **8** |
| techniques | 25 |
| traditions | 36 |
| contexts | 5 |
| ingredient categories | 53 |

**The binding constraint is the cuisine vocabulary: 21 values for 36 origin countries.** And the consequence is already visible in the live catalog — **19 published dishes have no `dish_cuisines` row**, across **18 countries with zero dishes carrying a cuisine**. **Of those 19, eighteen are gaps and one is a deliberate unset** (`chicken-tikka-masala`, the Glasgow dispute — ADR-001 D1), so the gap count is **18**:

| | dishes with no cuisine |
|---|---|
| Brazil | `acaraje`, `feijoada` |
| India | `vindaloo` |
| Thailand | `khao-soi` |
| Austria | `wiener-schnitzel` |
| Canada | `poutine` |
| Greece | `moussaka-greek` |
| Hungary | `goulash-hungarian` |
| Jordan | `mansaf` |
| Morocco | `tagine-moroccan` |
| Nepal | `momo` |
| Nigeria | `jollof-rice` |
| Poland | `pierogi` |
| Portugal | `bacalhau-a-bras` |
| Puerto Rico | `tostones` |
| Tunisia | `couscous` |
| Ukraine | `borscht` |
| United States | `hamburger-american` |
| **United Kingdom** | **`chicken-tikka-masala`** — **UNSET BY DECISION, not a gap** |

**So: 18 gaps and 1 deliberate unset.** `chicken-tikka-masala` is counted in the 19 by a *row-absence* query, but it is not a gap — it is the catalog's clearest example of an unset dimension being the correct editorial state, and under the national-cuisine convention below it is **also** the dish whose cuisine would be `disputed` between British and Indian.

**And three of the seven dimensions are single-valued by schema constraint** — verified from `pg_constraint`:

| dimension | constraint | single- or multi-valued |
|---|---|---|
| `dish_dish_courses` | `UNIQUE (dish_id)` | **single** |
| `dish_dish_cuisines` | `UNIQUE (dish_id)` | **single** |
| `dish_dish_families` | `UNIQUE (dish_id)` | **single** |
| `dish_dish_contexts` | `UNIQUE (dish_id, value_id)` | multi |
| `dish_dish_techniques` | `UNIQUE (dish_id, value_id)` | multi |
| `dish_dish_traditions` | `UNIQUE (dish_id, value_id)` | multi |
| `dish_dish_ingredient_categories` | `UNIQUE (dish_id, value_id)` | multi |

**This is why "every dish must have a category that fits well" is a hard requirement and not a nice-to-have.** A single-valued dimension **cannot** hold a dish that belongs to two families — and ADR-002 Q5 already found that case in the catalog (`chole-bhature` was `curry` vs `bread`, `goulash-hungarian`/`kimchi-jjigae` were `stew` + `soup`). The schema's answer is Q5's generalised rule: competing statements, one accepted, the dimension row points at the accepted one. **So a dish that genuinely straddles two categories is representable — but the *dimension row* still shows one value, and the other lives in a competing statement.** That is a deliberate design, and it means the "fits well" requirement is satisfied by the *evidence*, not by a second value in the row.

#### The taxonomy extension decisions — 2026-10-27

**Decided by Alejandro, against the 50-dish candidate shortlist.** These are *vocabulary extensions*, each admitted because the shortlist produced enough members to satisfy the ≥2 rule.

**Three new `dish_family` values admitted:**

| new family | members | why they are one family |
|---|---|---|
| **`stiff-porridge`** | `fufu`, `ugali`, `tô`, `dhindo`, `ambuyat` | a stiff, sliceable or cake-like starch — poured, pounded or steamed to a firm texture and eaten with a soup or sauce |
| **`porridge`** | `ogi`, `canjica`, + `bubur-ayam` | a soft, pourable grain porridge |
| **`stuffed-vegetable`** | `levengi`, `rocoto relleno`, + `dolma` | a vegetable or leaf stuffed with a filling |

**`stiff-porridge` vs `porridge` is a texture distinction, and that is what makes them two families rather than one.** A stiff porridge holds a shape and is eaten in pieces with a stew; a soft porridge is spooned. The distinction is the same kind of decision ADR-001 D3i made for `stew` vs `soup` (precedence, recorded provisionally) — and it means both values need their precedence rule stated, or the two will collide.

**Three new `dish_technique` values admitted:**

| new technique | members |
|---|---|
| **`pit-roasting`** | `umu`, `pachamanca`, `curanto` — dishes whose *method is the vessel* |
| **`fermenting`** | `injera`, `lahpet`, `ogi`, `skyr`, `mishti doi`, `kiviak`, `hákarl` |
| **`curing`** | `kilishi`, `chicharrón`, `chhurpi`, `kiviak`, `hákarl`, `svíð` |

**`pit-roasting` is the technique the "vessel is the dish" cases need.** `umu` (Samoa/Pacific) is the earth oven itself, `pachamanca` (Peru) is an earth-oven pit, `curanto` (Chile) is a stone-heated pit. **All three are the same technique, and none of them is `Roasting`** — an oven or a grill is a different thing from a pit filled with hot stones. `Roasting` and `Spit-roasting` already exist and neither covers them.

**Three `ingredient_category` values — and a finding.** `offal`, `leafy-greens` and `seafood` **already exist** in the live vocabulary (`ingredient_categories` has 53 rows including all three, plus `Fish` and `Shellfish`). **So this is a USE decision, not a creation** — the values were there and unused; the decision is to actually apply them. That is worth recording plainly, because the audit's framing ("admit ingredient values") implied three new rows that were not needed.

**`seafood` as a parent requires a hierarchy change.** Measured: `Seafood`, `Fish` and `Shellfish` are all **roots** (`parent_id IS NULL`), and the only existing parent/child pairs are `Coconut`→`Produce`, `Beef`/`Pork`→`Red meat`, `Chicken`→`White meat`. To make `seafood` a parent leaving `shrimp`, `octopus`, `fish`:

```
UPDATE ingredient_categories SET parent_id = <Seafood> WHERE name = 'Fish';
UPDATE ingredient_categories SET parent_id = <Seafood> WHERE name = 'Shellfish';
INSERT INTO ingredient_categories (slug, name, parent_id) VALUES ('shrimp', 'Shrimp', <Seafood>);
INSERT INTO ingredient_categories (slug, name, parent_id) VALUES ('octopus', 'Octopus', <Seafood>);
```

**`Shrimp` and `Octopus` do not exist today** — verified against the live 53-row vocabulary. And note that `ingredient_categories.parent_id` already exists, so **this is using a column that is already there**, exactly as Q3 did with `geo_entities.parent_id`.

**Four rejected families — and where their dishes go instead.** The rejections are recorded with their re-routing, because *why* a family was refused is the part that stops the same proposal returning:

| rejected family | why refused | where the dishes go |
|---|---|---|
| **leaf-stew** | the leaf is an *ingredient*, not the dish's form | family **`stew`** + ingredient **`leafy-greens`**: `romazava`, `matapa`, `muamba` |
| **offal** | the animal part is an *ingredient*; the form is already covered | `khash`, `paya` → **`soup`**; `nihari`, `tripas à moda do Porto` → **`stew`**; `anticucho` → **`kebab`** — all + ingredient **`offal`** |
| **seafood** | same reason as offal | `bobó de camarão`, `polvo à lagareiro` → **`stew`** + ingredient **`seafood`** |
| **raw/preserved** | it is a *technique*, not a form | the `fermenting` / `curing` techniques carry it: `kitfo`, `kokoda`, `hákarl`, `svíð`, `chhurpi` |

**Two dishes still need a separate call, as flagged:** `svíð` (cured lamb) and `chhurpi` (dried yak cheese) have an ingredient and a technique but **no family yet** — because a cured or dried food is a *state*, not a *form*, and there is no family for that. **They are not in the first 50 until that call is made.**

**Three removals from the shortlist, for stated reasons:**

| dish | reason |
|---|---|
| `pulaka` | **a crop (taro), not a dish** — dropped unless a specific dish is named |
| `murtabak` / `mutabbaq` | **the diaspora case** — `martabak` is currently ONE row in the catalogue and the split into `martabak-manis`/`martabak-telur` is **GUS-230's** to make. Seeding a third spelling here would duplicate an existing decision. **Off the list.** |
| drinks (`chicha de jora`) | **a drink, not eaten as food** — out of scope unless eaten as food, so moved to reserve |

**The ten non-English-article dishes go to RESERVE FOR TRANCHE 1** — not dropped. They need a non-English Wikipedia title with the citation language recorded, and the tranche-1 batch is where that source-hunting happens anyway.

**And the course vocabulary does not break.** A dish that is eaten at breakfast *and* bought as street food is **`course` + `context`** — ADR-001 D2 made `dish_context` a separate, multi-valued dimension for exactly this. A dish whose course depends on the meal is recorded as its **primary role** (ADR-001 D3f). **So the course vocabulary absorbs unfamiliar dishes unchanged.** This corrects an earlier worry in this ADR that the 8 course values "break first" — they do not.

**And a dish name never becomes a family unless the family has ≥2 member dishes.** If only one dish in the catalog would carry a family value, that value is not a family — it is a description. This is the rule that stops `moussaka-greek` from becoming the family "Moussaka", and it is what makes the family vocabulary safe to extend: a new family value is only admitted once a second dish genuinely belongs to it. **Every one of the three families admitted above has ≥3 members, so all three clear the rule comfortably.**

#### The `unset_reason` mechanism — a separate table, not a column

**An unset dimension is a recorded decision, not a gap** (D3e), and for that to be falsifiable the reason needs somewhere to live. **The mechanism is a separate table**, not a nullable column on the seven join tables:

```
dish_dimension_unset (
  id            uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  dish_id       uuid NOT NULL REFERENCES dishes(id) ON DELETE CASCADE,
  -- which dimension is unset
  dimension     enum('family','cuisine','course','technique',
                     'ingredient_category','tradition','context') NOT NULL,
  -- why it is unset
  reason        enum('disputed','no_evidence','not_applicable') NOT NULL,
  note          text,
  -- the statement that will eventually evidence it (NULL until researched)
  statement_id  uuid REFERENCES statements(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE NULLS NOT DISTINCT (dish_id, dimension)
)
```

**Why a separate table rather than a column on each join table.** A column would have to be added to **seven** tables, and would have to be nullable and reason-typed in each — seven copies of the same vocabulary, seven places for the "value and unset never coexist" rule to live, and seven places for a CHECK constraint to be forgotten. One table means **one** enum, **one** uniqueness constraint, and **one** trigger.

**The trigger: a value and an unset never coexist.** The rule is about a *(dish, dimension)* pair having exactly one of two states, and the two states live in different tables — so the trigger has to fire on **both**:

| table | trigger | rejects |
|---|---|---|
| `dish_dish_*` (all 7) | `AFTER INSERT OR UPDATE` | inserting a value for a (dish, dimension) that has an `unset` row |
| `dish_dimension_unset` | `AFTER INSERT OR UPDATE` | inserting an unset for a (dish, dimension) that has a value row |

**Both directions are needed**, because a one-sided trigger would leave a hole: the value could be inserted first and the unset second, and the unset would land. **A pair with both is unreachable, not merely discouraged.**

**The GUS-231 check becomes exactly expressible:** *every published dish × 7 dimensions has exactly one of {a value row, an unset row}.* That is a single query over two tables with a `FULL OUTER JOIN`, and it fails loudly on a dimension with **neither** — which is the actual defect.

**One property of this design worth stating:** the `statement_id` column on `dish_dimension_unset` is **nullable and NULL until researched** — so an unset dimension can carry the statement that will eventually resolve it, and the model's own Q10 rule (statements are independent entities, the subject is the only link) is respected: **the unset row points at a statement about that dish**, and the consistency check applies as it does to a value row.

#### The cuisine convention — NATIONAL, with regional traditions in `dish_tradition`

**`dish_cuisine` is national. Regional and transnational traditions belong in `dish_tradition`, not in `dish_cuisine`.**

| kind of tradition | where it goes | example |
|---|---|---|
| national cuisine | `dish_cuisine` | `Indonesian`, `Mexican`, `Italian` |
| regional / sub-national tradition | **`dish_tradition`** | `Minangkabau` (rendang), `Levantine`, `Maghrebi`, `Central European` |
| transnational dish | **`dish_cuisine` unset (`disputed`) + `dish_tradition`** | a dish claimed by two nations |

**This is exactly the shape the catalog already uses for rendang: `cuisine = indonesian` + `tradition = minangkabau`.** The convention generalises an existing, working pattern rather than inventing one — and it means the pilot's place plan (Q3) is unaffected, because `Minangkabau` was already correctly a **tradition value, not a place**.

**Why this is the right split.** A cuisine answers *"which national food culture is this dish part of?"* — a single answer, and the catalog's `dish_cuisines` is single-valued (`UNIQUE (dish_id)`). A tradition answers *"which regional, ethnic or religious community's version is this?"* — and that is inherently multi-answerable (`rendang` is Minangkabau *and* Sundanese *and* Indonesian-national *and* Eid-associated; `dish_traditions` is already multi-valued with 36 values including exactly these). **The two dimensions have different cardinalities, and the schema already encodes that.** Putting `Levantine` in `dish_cuisines` would force it to be single-valued when it is not.

**The consequences, stated:**

- **New national cuisine values are added individually, by decision.** Not a blanket rule per country — Q6's rule applies: each value classified on its own merits. `Puerto Rico` gets **its own value** (it is a nation in its own culinary frame, and collapsing it into "American" would erase a distinct food culture — which is also why `United States` cannot simply absorb it).
- **A transnational dish gets `dish_cuisine` unset with reason `disputed`, plus a `dish_tradition`.** That is the `chicken-tikka-masala` case exactly: cuisine unset (disputed), tradition `Glasgow Muslim` + `British National` — both of which **already exist** in `dish_traditions`.
- **This closes the ADR-001 §4 follow-up** on national-vs-regional cuisines, which was recorded there as an open follow-up with four questions and a note that "the pilot uses the flat vocabulary, Minangkabau specificity is carried by origin(place) and claims, NOT by inventing a cuisine row." **The flat vocabulary was the pilot's expedient; this decision replaces it with a rule.**

#### The 15 cuisine lines, with the approved changes

**One batch, 15 individual lines — each checked against the national rule.** Four lines changed:

| line | as decided | the change |
|---|---|---|
| **Jordanian** | `mansaf` = **jordanian + levantine** | the shared Levantine heritage rides in `dish_tradition`, where `Levantine` **already exists** |
| **Moroccan** | `tagine` = **moroccan + maghrebi** | same shape; `Maghrebi` **already exists** |
| **Tunisian** | **NOT CREATED** | `couscous` moved to unset(disputed), so Tunisian would have **0 members** — and a value with no members is not a value |
| **Nepalese** | `momo` = **unset(disputed) + tibetan** | the **value** `Nepalese` is not created; `momo`'s cuisine is contested |
| **Puerto Rican** | `tostones` = **unset(disputed) + caribbean** | the **value** `Puerto Rican` is not created; `tostones`'s cuisine is contested |
| **Ukrainian** | `borscht` = **ukrainian**, *provisional pending a non-Wikipedia source* | the value is created; the dish's assignment is marked provisional |
| **American** | national value, **approved** | the earlier "needs a second look" flag is closed — it is a national value |

**The four disputed cells, each with its evidence** (verified against the sources, not assumed):

| dish | dimension | reason | evidence |
|---|---|---|---|
| `chicken-tikka-masala` | cuisine | `disputed` | Glasgow (British) vs the subcontinent (Indian) — ADR-001 D1 |
| `couscous` | cuisine | `disputed` | **UNESCO joint inscription, 2020: Algeria, Mauritania, Morocco AND Tunisia** — *"a staple food throughout the Maghrebi cuisines of Algeria, Tunisia, Mauritania, Morocco, and Libya"*, and *"In December 2020, Algeria, Mauritania, Morocco, and Tunisia obtained official recognition…"* — **the CTM case exactly** |
| `momo` | cuisine | `disputed` | *"a type of steamed, filled dumpling in **Nepalese and Tibetan** cuisine"* — two cuisines, one dish |
| `tostones` | cuisine | `disputed` | *"commonly found in **Latin American cuisine and Caribbean cuisine**"* — Puerto Rico vs the wider Caribbean |

**Two new `dish_tradition` values are needed** — `Levantine` and `Maghrebi` already exist, but **`Tibetan` and `Caribbean` do not**. Both are required by the approved lines (`momo` → Tibetan, `tostones` → Caribbean).

**The seafood hierarchy, exactly as specified:**

```
Seafood                      (exists, root — becomes the parent)
├── Fish                     (exists — re-parented)
├── Octopus                  (NEW — a mollusc, so directly under Seafood)
└── Shellfish                (exists — re-parented)
    └── Shrimp               (NEW — a crustacean, so under Shellfish)
```

**And it does NOT require a new dimension, a new predicate, or a schema change to the taxonomy.** The values go in the existing `dish_cuisines` table; the traditions already exist. **This is a vocabulary extension, not a model change** — which is why it can be done now, before the claims model lands.

#### What is settled by this decision, and what it defers

**Settled:** statements are independent entities with **no owner column**; the subject FK is the only link; a sentence may anchor a statement about **any** subject; dish coverage is computed over **its own sentences**; one fact is one statement, keyed by `(subject, predicate, value, canonical qualifier hash)`; **no cascade deletes** out of statements — retraction is a status change; and a dimension row's statement must have that dish as its subject.

**Deferred, and named rather than glossed:**

| # | deferred | why |
|---|---|---|
| 1 | the exact canonicalisation of the qualifier set (key order, absent-vs-null, value normalisation) | a data-format decision, but one where a wrong choice **silently breaks dedupe** — so it belongs with the first implementation, reviewed against real qualifier sets, not decided in the abstract |
| 2 | whether the qualifier hash column is stored or computed | a generated column keeps it impossible to desync from the qualifiers; that is the safer choice and is flagged for the implementation |
| 3 | whether `subject_type='place'` statements can be dimension-row targets | Amendment 2 says sentences may anchor them; dimension rows may not — that is settled. Whether a *place* dimension row ever points at a place statement is a Q11+ question |

---

### Q10 (original) — Does a claim belong to a dish, to a description, or to both?

**Decision:** where a claim's ownership lives.

**Recommendation: claims are **independent entities**, owned by a subject, and *linked* to dishes through `dish_claims`.** A claim about "coconut milk" as an ingredient is not owned by any one dish; several dishes can reference it.

**Reason:** sharing. If every dish's claim were owned by that dish, then "rendang uses coconut milk" and "nasi lemak uses coconut milk" would be two separate claims with two separate evidence chains — so corroboration across the catalog would be invisible, and the evidence effort would be duplicated per dish.

**Alternative: claims are owned by the dish** (ADR-001 §2.2 sketches `dish_claims` as a join, which is compatible with either reading). Simpler; each dish's claims are self-contained. The cost is duplicated evidence and no cross-dish corroboration.

---

### ✅ Q11 — DECIDED (Alejandro, 2026-10-27): the 118 get no statements until research supplies a source

**Option (iii): neither (i) nor (ii).** The 118 published dishes outside the pilot get **no statements** until research supplies a real source for the facts being asserted. Their dimension rows stay `statement_id IS NULL` — **the `unevidenced` state (Q3)**, which is honest and not an error.

**No country-level statements are derived from `origin_location` or from existing dimension rows.** A geocode is not a citation.

**Places are seeded on demand, per researched dish** — not speculatively for all 36 countries.

#### The decision, and why (iii) is the only one of the three that is honest

The two rejected options were:

| option | what it does | why it fails |
|---|---|---|
| **(i) mechanically derive 118 country-level statements** | turn each dish's `origin_geo_id` into an `originated_in` statement | **it manufactures claims from a geocode.** `dishes.origin_location` is a `geometry` column holding WKB hex; the country came from a *map*, not from a *source*. A statement whose evidence is "we looked up the coordinates" is a statement with no evidence — and it would be **indistinguishable in the database from a researched one**, because the schema cannot tell them apart. |
| **(ii) research all 118 properly now** | do the full job | it needs a place hierarchy for 36 countries and a real non-Wikipedia source per dish — and it would land **before** the model that records any of it exists. The research would have nowhere to go. |

**(iii) is the only option that keeps the evidence model meaningful.** Under (i), the catalog would show 118 "evidenced" claims whose provenance is a lat/long pair — and because `claim_citations` (Q7) is where the truth about a citation lives, those statements would have **no citations at all**, which in the model is precisely `unsupported`. **Option (i) would create 118 rows that the model itself classifies as unevidenced, while looking evidenced in the dimension tables.** That is the "two truths" failure ADR-002 exists to remove, arrived at through the back door.

**And it makes the metric honest rather than flattering.** With (iii), the catalog's coverage is **0% outside the 3 pilot dishes** — a true number. With (i), it would be a large number resting on nothing.

#### The migration shape

| | the 3 pilot dishes | the other 118 |
|---|---|---|
| statements | created, from research | **none** |
| `claim_citations` | Q7's rules — `supports`, excerpt fetched, `revision_id` recorded | none |
| dimension rows | `statement_id` set to the supporting statement | **`statement_id IS NULL` = `unevidenced`** |
| `description_sentences` | populated, `field='short'` | not populated (Q9's scope) |
| verification state | `unverified` until reviewed (GUS-026 §10) | n/a |
| `citations` (old table) | re-pointed | **stay archived** (Q7) |

**The `statement_id IS NULL` state is the whole mechanism.** Q3 already defined it: *"a dimension row with `statement_id IS NULL` is unevidenced — not an error; it is the honest state of the 91 rows that have a value but no evidence yet."* Those 91 rows exist today. **Under (iii) the number grows to every dimension row of the 118 — and the meaning does not change: a value someone typed, awaiting evidence.** The coverage metric then reports the truth: those facts are asserted but not yet evidenced.

**One consequence to state plainly: the catalog's headline coverage number goes to zero.** Today the catalog's dimension rows carry no `statement_id` at all, so coverage is *undefined* (Q7's note: "any catalog-wide coverage percentage in this state is meaningful only over the 3 pilot dishes"). Under (iii) it becomes **defined and near-zero** — which is a better state, because a defined 0% can be read as "not yet researched" rather than "not measured". **The 118 do not get worse; they get correctly labelled.**

#### The rules that make (iii) safe

**1. No statement is created without a source.** The trigger for creating a statement is *research*, not *a dimension row that needs one*. Concretely: a statement exists when a person or an agent has **fetched a source that says the thing**, recorded the excerpt, the revision id and the retrieval timestamp (Q7), and classified the source's class (Q6).

**2. No derivation from `origin_location`.** The geometry is a point derived from a geocode. It may be used to *suggest* a place to research; it may never be the *evidence* for one. **The place entity comes from the source's text.**

**3. No derivation from an existing dimension row.** A row saying `dish_family = curry` is a value someone typed (or a value a migration copied). Turning it into a statement would launder a **typed value into an evidenced claim** — the exact failure Q3 named when it made the row the *index* and the statement the *evidence*. The row is not evidence of itself.

**4. Places are seeded on demand, per researched dish.** Not a speculative hierarchy for 36 countries. The pilot seeded 11 places because the pilot's 3 dishes needed them; the next dish's research seeds the place *it* needs, with its own source. **This is what stops the model from acquiring a 36-country place hierarchy of unverifiable rows** — which is exactly the `food_regions` = 0 / `geo_entities` = 36-countries-only state the catalog is in, and which the geography audit showed to be *thin* rather than wrong.

**5. The `citations` table keeps the 118 archived.** Q7 decided the old table is archived rather than dropped, because `citations.target_type/target_id` is a dish-level link the new model does not replace. Under (iii) the 118's archived rows are the **record that research is outstanding** — and when one of those dishes is researched, its old citation is either re-read (Q7's re-reading, with a fresh revision id) or superseded. **The archive is a work queue, not a graveyard.**

#### What "research supplies a source" means operationally

**The bar is Q6's class sufficiency plus GUS-026 §3.1's Wikipedia rule, and it is per-claim, not per-dish:**

- A **non-origin** claim (a technique, an ingredient, a course) can be evidenced by a class-sufficient source — S1–S5, and S6 may accompany but not stand alone.
- An **origin** claim (`originated_in` / `originated_at` / `created_by` / `named_after`) with `claim_class` `documented` or `disputed` needs **≥1 S1, S2, S3 or S5 source**. Wikipedia may accompany it; it may not be the only one.
- A transnational dish's origin is `disputed` — so it needs sources **for each competing position**, not one source that mentions the dispute.

**So the research bar for a dish is not "find a Wikipedia article" — it already has one.** Every one of the 121 dishes has exactly one Wikipedia citation (GUS-011). **The bar is finding the second, non-Wikipedia source that the policy requires** — which is exactly the work Q8's Amendment 4 specifies for the pilot's rendang origin claim: *2 real non-Wikipedia sources, S1–S5, explicitly assessed independent.*

**And a dish that cannot be researched to that bar stays unevidenced.** That is the honest end state, and it is permanent for some dishes — no rule says every dish must eventually be corroborated, and GUS-026 §6's `unsupported` class exists precisely so that a dish can be in the catalog with an honest, unevidenced dimension.

#### The order of work, as sequenced

1. **(a) Fix the cuisine gaps now — dimensions only.** 15 new national cuisine values + 2 assignments (per the convention above), and the `unset_reason` mechanism so "explicit unset with a reason" is recorded rather than implied. **No statements, no citations, no claims** — this is dimension data only, and it does not wait for the claims model.
2. **(b) Finish ADR-002 and run the pilot** — the 3 pilot dishes end to end, producing the model's validation numbers.
3. **(c) The 50 new dishes are seeded directly into the claims model, never the old one.** Each new dish arrives with its place, its description, its dimensions **and its source**, in one operation — not created in the legacy shape and back-filled later. **And each new dish needs ≥1 non-Wikipedia source for its origin claim** — which is a stronger bar than the catalog's existing dishes meet, and deliberately so: the new content should not repeat the defect the old content has.

**Why (c) is seeded into the claims model and not the old one.** Because the old model *cannot* express the new content honestly: `citations.claim_text` is a whole description (120 of 121), so a new dish seeded the old way would arrive with the same over-broad proposition the ADR exists to dissolve. **The 50 dishes are the first content that starts life in the new model.** That also means they set the precedent for how the 118 will eventually be researched — and Q11's (iii) says the 118 wait for research, not for a back-fill.

#### What is settled by this decision, and what it defers

**Settled:** the 118 get no statements until research supplies a source; their dimension rows stay `statement_id IS NULL` = `unevidenced`; **no country-level statements are derived from `origin_location` or from existing dimension rows**; places are seeded on demand per researched dish; the `citations` archive is the record of outstanding research; the work order is (a) cuisine gaps → (b) ADR-002 + pilot → (c) the 50 new dishes seeded into the claims model with ≥1 non-Wikipedia source each.

**Deferred, and named rather than glossed:**

| # | deferred | why |
|---|---|---|
| 1 | the **order of the 118** when research does start | it should follow the same bar (per-claim class sufficiency), but which dish gets researched first is a work-planning decision, not a model one |
| 2 | whether a dish that cannot be researched to the bar is **hidden** from public views or shown with an honest "unevidenced" badge | GUS-026 §6's `unsupported` class implies the latter is available, and Q13 has now decided the **read** boundary is open — a degraded or unsupported claim is visible with its state, never hidden. The remaining choice is whether an **unresearched** dish (no statement at all) shows a badge or nothing; deferred with Q13's coverage-badge item, on the same reasoning: a badge reading 0% across 118 dishes is noise until the number is meaningful |
| 3 | the exact **`unset_reason` mechanism** (column on the join tables vs. a separate table) | a schema choice with a real constraint — the reason must be queryable per (dish, dimension) and must not be able to conflict with an assigned value |
| 4 | whether `dish_tradition`'s multi-value is enough for the **transnational** case, or whether a transnational dish needs *competing* traditions with an accepted one (Q5's generalised rule) | Q5's rule is written for single-valued dimensions; `dish_tradition` is multi-valued, so the rules differ |

---

### Q11 (original) — What happens to the existing 121 dish-level citations?

**Decision:** the migration path for the current data.

**Recommendation: migrate them as claims, one per source, at the granularity the source actually supports** — and where the existing prose asserts several facts, either split it into several claims or record it as one claim with several objects (Q5). Then **anchor** each claim to the sentence of the dish description it came from, so today's coverage does not silently drop to zero.

**Reason:** the 121 `claim_text` strings are real sentences from real sources, with real locations ("Lead paragraph"). Throwing them away would discard the only evidence the catalog has. But **they are currently one sentence asserting several facts** — so a straight copy would produce claims that cannot be independently verified, which is the problem ADR-002 exists to solve.

**Alternative: migrate them verbatim as single claims** (one claim = the whole sentence), and only split them as each dish is re-researched. Fastest, and the coverage metric starts at 0% rather than a false 100%; but every migrated claim is an over-broad proposition, and the split work is deferred rather than avoided.

**What I recommend, concretely:** migrate them as **one claim per source with the original sentence as `text` and the atomic facts as `dish_claims` children where they are separable** — so the historical record is preserved verbatim *and* the atomic facts are addressable.

---

### ✅ Q12 — DECIDED (hermes, 2026-10-29): GUS-026 §6's seven states, with explicit gates and a hard agent boundary

**Decision:** adopt GUS-026 §6's states **exactly** — `draft` → `research_pending` → `under_review` → `verified` → `published`, with `disputed` and `needs_revision` branches. GUS-026 is already a written policy; ADR-002 implements it rather than proposing a parallel lifecycle. The states map cleanly onto the API: a reader sees `published`, an editor sees `under_review`.

#### The gates

| transition | gate (what must be true) |
|---|---|
| `draft` → `research_pending` | the statement exists with a subject, a predicate and a typed value; the claim's `claim_class` is set. **No evidence required yet** — the state means "we have decided this is worth researching" |
| `research_pending` → `under_review` | at least one `claim_citations` row exists, fetched, with `revision_id` or `retrieved_at` recorded, and its `excerpt` **validated as a substring of the stated revision's text** (Q7's rule) |
| `under_review` → `verified` | the claim's `claim_class` meets **that class's minimum evidence bar** (GUS-026 §4) AND the citations meet the **independence rule** (GUS-026 §5) AND the `stance='supports'` links are from **class-sufficient** sources for the class |
| `verified` → `published` | the statement's `description_sentences` anchors are all `ok` (Q9's `sentence_claims.status`), and the statement is attached to the dish's dimension rows where it is the dimension's evidence |
| any → `disputed` | the sources **conflict**: ≥2 **independent** S1–S3 sources representing **opposing positions**, each with `stance` `supports` and `refutes` recorded |
| `published` → `needs_revision` | the evidence has degraded: a source has gone dead, been retracted, or a re-read contradicts the excerpt. **The state is the anti-rot mechanism** — a published claim whose source disappears must be visible as degraded, not silently retained |
| `needs_revision` → `published` | the evidence has been re-established and re-verified. **Re-publishing is a human action**, exactly as first publication is |

**Publication is a GATE, not a status.** A claim is publishable only when its `claim_class` meets that class's bar **and** its citations meet the independence rule. The `published` state records that the gate was passed; it does not itself confer the property.

#### The agent boundary (GUS-026 §10), made mechanical

| | an agent may | an agent may NOT |
|---|---|---|
| `draft` → `research_pending` | ✅ | — |
| `research_pending` → `under_review` | ✅ — it may fetch, record URL + access date + locator, and propose the class | — |
| `under_review` → `verified` | ❌ | **verification state changes are human-only** |
| `verified` → `published` | ❌ | **an agent may not publish** |
| any → `disputed` | ✅ — it may classify a claim as `disputed` when the sources conflict | — |
| any → `needs_revision` | ✅ — it may flag a claim that fails the policy's bar | — |
| `needs_revision` → `published` | ❌ | re-publication is human-only |
| any | ✅ it may cite a source **it has fetched**, and may record the URL + access date + locator | ❌ it may **not** cite a source it has not fetched, ❌ may not infer a date, person or place that no source states, ❌ may not set `kitchen-tested`, ❌ may not publish an `unsupported` or `hypothesis` claim, ❌ may not present an S6 source as the evidence for an R2 origin claim |

**The rule that makes the boundary mechanical rather than advisory:** the `verified` and `published` transitions are **not writable by the agent's own credentials**. Concretely, `claim_citations`/statement status writes are separated from the agent's write path — the agent can create a citation and propose a statement, but the transition to `verified` requires the **reviewer's** write path, and `published` requires the **publisher's**. **decided-by: hermes** — a boundary enforced only by a written rule is a boundary that gets crossed under pressure; a boundary enforced by *which credential can write the row* is not. The implementation vehicle (a distinct role, a DB-level guard, or a moderator-only route) is an implementation detail, but the **separation must be real**.

#### Two things this decision settles that were open

- **A `documented` claim may rest on a single source**; a `disputed` claim requires ≥2 **independent** S1–S3 sources on opposing sides. The pilot's own corroboration is therefore **0 by policy** — all 142 catalog sources are `en.wikipedia.org` → S6 (Q6) — and **no Wikipedia derivation work is needed** (Q8).
- **The seven states are the only states.** `unverified` is **not** a state; Q7's migration wording ("verification state `unverified` until reviewed") means **`research_pending`**. A claim with no evidence is `research_pending`; a claim whose class is `unsupported` is `unsupported` — which is a **`claim_class`**, not a verification state. Keeping those two axes separate is what stops "no evidence" from reading as "not yet checked".

---

### ✅ Q13 — DECIDED (hermes, 2026-10-29): no read-path change in the pilot; claims on a new endpoint

**Decision:** the pilot changes **no existing read path**. The 3 pilot dishes (`rendang`, `chicken-tikka-masala`, `tacos-al-pastor`) get claims, anchors and provenance; the existing `GET /api/dishes/:slug` payload is **byte-identical** to what it is today. Claims are exposed through a **new** endpoint, `GET /api/dishes/:slug/claims`, so the pilot can be verified without touching what readers see.

**Reason:** ADR-002 changes the *meaning* of the data, not its presentation. The pilot's job is to prove the model; proving it does not require every consumer to move at once. The existing payload is already a stable public contract with its own consumers (`apps/web`, `apps/recipes`), and coupling it to a model that has not been through a pilot would make the pilot's own failures the production site's failures.

#### The new endpoint's shape

```
GET /api/dishes/:slug/claims
```

It returns the **statements anchored in that dish's sentences**, with their evidence and their verification state:

```jsonc
{
  "dish": "rendang",
  "coverage": {
    "anchoredSentences": 3,
    "totalSentences": 3,
    "percent": 100
  },
  "statements": [
    {
      "id": "…",
      "subject": { "type": "dish", "id": "…", "label": "Rendang" },
      "predicate": { "id": "…", "slug": "originated_in", "label": "originated in" },
      "value": { "type": "place", "id": "…", "label": "Minangkabau" },
      "qualifiers": { "period": { "start": null, "end": null } },
      "claimClass": "documented",
      "verificationState": "published",
      "readings": [
        { "locale": "en", "kind": "template", "text": "Rendang is a Minangkabau dish." }
      ],
      "citations": [
        {
          "source": { "id": "…", "url": "…", "title": "…", "sourceClass": "S2" },
          "stance": "supports",
          "locator": "§Origins",
          "excerpt": "…",
          "revisionId": "123456",
          "retrievedAt": "2026-10-29T…Z",
          "independence": "independent"
        }
      ],
      "anchors": [
        { "sentenceId": "…", "position": 0, "status": "ok" }
      ]
    }
  ]
}
```

**Coverage is computed over the dish's own sentences** (Q10): `coverage(dish) = anchored sentences / total sentences`. It is **not** "statements whose subject is this dish" — that would score `tacos-al-pastor` 0% while the question D4b asks is *"is every fact asserted in this prose anchored?"*, a question about the prose. A sentence may anchor a statement about a **different subject** (the Puebla case), and the coverage figure must still count it.

#### Why the endpoint is separate, concretely

- **The payload changes shape.** The existing `GET /api/dishes/:slug` returns `sources: dishCitations` — a flat list of the old citations. The claims endpoint returns **statements with their evidence, state and anchors**. Putting that inline would mean changing the shape of an existing field, not just adding one, and every consumer of `sources` would need to move.
- **The two answer different questions.** The existing payload answers *"what does this dish say and what was cited when it was written?"*. The claims endpoint answers *"what does this dish assert, what is the evidence for each assertion, and how much of the prose is anchored?"* — the second is an **editor's** and a **researcher's** question, and it is answerable only for the pilot dishes.
- **It is the pilot's oracle.** Q7 and Q9 both need a way to check the model without an editor UI. A read-only endpoint that returns the statements, their evidence and the coverage figure *is* that oracle, and it doubles as the thing a moderator would use.

#### The consequences, stated plainly

| | |
|---|---|
| **`GET /api/dishes/:slug`** | **unchanged.** No new field, no changed field, no changed shape. |
| **`GET /api/dishes/:slug/claims`** | new, read-only, public. For the 3 pilot dishes it returns statements; for the other 118 it returns an **empty statement list with `coverage` 0%** — which is the honest answer (Q11's "defined and near-zero", not "not measured"). |
| **`GET /api/dishes`** (list) | unchanged. The list payload is not extended with claims. |
| **Performance** | The claims endpoint does **not** join the claims model into the dish payload, so **the existing read path's query plan is unchanged**. The claims endpoint itself is a separate, heavier query — but it is only reached by a reader who asks for evidence, and only the 3 pilot dishes have any. |
| **Write paths** | unchanged by this decision. Q9's own decision already sequences the API change (write through the sentence table) **before** the trigger, and that is unaffected here. |

**decided-by: hermes** — the endpoint is **public and read-only**, not editor-only. Reason: a reference work's whole value is that its evidence is inspectable by the reader, and an evidence model that only its authors can see is not a reference work. The **write** boundary is strict (Q12: only a reviewer may move a claim to `verified`, only a publisher may publish) — but the **read** boundary is open. A claim whose state is `draft`, `research_pending` or `under_review` is **not** returned by the public endpoint; `verified`, `published`, `disputed` and `needs_revision` are, each with its state visible, because a reader who can see a claim should be able to see that it is disputed or degraded.

#### What is deferred

- Whether the 118 non-pilot dishes eventually get a `coverage` figure that is not 0% (that is the research backlog, Q11).
- Whether `GET /api/dishes/:slug` should eventually embed a **coverage badge** (a single number) even though it embeds no claims. **decided-by: hermes** — deferred until the number is meaningful, because a badge reading 0% on 118 dishes is noise, not information, and it would draw attention to a number that says "not yet researched" rather than anything about the food.
- The exact `needs_revision` display: whether a degraded claim shows a notice on the dish page, in the claims endpoint only, or both.

---

## Q&A format

Same as ADR-001: I propose, you answer **ok** to accept or override. **Q1 is answered** (see above); the list is frozen from here.

**Q12 and Q13 are decided** (hermes, 2026-10-29) — see the Q12 and Q13 sections above. The list is now closed: Q1 to Q13 all have answers. The next step is the **pilot**.


---

## Open items that are NOT questions

These are decisions I will make by following the existing policy, and flag rather than ask:

- **`source_class` values** — S1–S7 exactly as GUS-026 §3 defines them.
- **`claim_class` values** — the six from GUS-026 §4.
- **Verification states** — GUS-026 §6's seven.
- **The Wikipedia rule** — GUS-026 §3.1, as a validation check on `documented`/`disputed` origin claims.
- **Seed data for the 3 reference dishes** — the claims those dishes already have, per GUS-026 §8.2's priority order.

## Traceability

| ADR-002 section | depends on |
|---|---|
| Q1 claim identity | ADR-001 D6 (one assertable fact) — **DECIDED**: the Wikidata-model statement (S-P-V + qualifiers + references), controlled predicates, typed values, free text only as a marked exception |
| Q2 readings | ADR-001 D6b (coverage counts sentences) — **DECIDED**: no authoritative text on the statement; template default per predicate per locale with a `subject · predicate · value` fallback; editorial readings carry the statement version/hash and go `stale` + hidden on change; kinds `template`/`editorial` only; bot drafts stay `draft` and undisplayed; readings are display-only and never a substitute for the D4 authored description |
| Q3 subject | ADR-001 §2.1 entity graph — **DECIDED**: the subject is an ENTITY, never a vocabulary value; for the pilot the subject set is **dish + place** only, and real technique/tradition entity tables are separate work. Places get a **country > region > city** hierarchy via the existing `geo_entities.parent_id` (already present, unused), seeded with **only the pilot places**; `Minangkabau` is a **tradition** value, not a place. Dimension and relation rows gain a **nullable `statement_id`**: the row is the index, the statement is the evidence, with a consistency check flagging rows whose statement is missing / retracted / contradicting. `geo_entities.wikidata_id` population is backlogged |
| Q4 predicate | ADR-001 §2.4 sketch |
| Q5 objects | ADR-001 D6 worked example (6 claims for rendang) |
| Q6 sources | GUS-026 §3 source classes — **DECIDED**: extend `sources` IN PLACE with a `source_classes` lookup table (S1-S7, each carrying what it is good enough to support). **Classification is by URL domain, each domain individually — never a blanket rule.** Measured: ALL 142 rows are `en.wikipedia.org` → all **S6**; there is no other domain to classify, so the catalog has no source diversity at all. Caveat recorded: `*.wikipedia.org` must be split by PATH, since a `/wiki/File:...` or a `wikidata.org/wiki/Q...` URL is not a Wikipedia article. **Dedupe BEFORE the pilot** (GUS-238): 21 redundant rows across 12 normalised URLs; 21 rows carry zero citations, 20 in duplicate groups and 1 unique-URL orphan (Tajine - a different defect, an unused source); only 1 group has more than one cited row (Moussaka, 3 dishes sharing one article); 'pho' has 2 rows, neither cited. Normalise URL, id map, re-point citations, ARCHIVE merged rows, unique constraint on normalised_url. `source_type` stays; `reliability` deprecated not deleted |
| Q7 claim↔source | ADR-001 §2.4 `citations` sketch; GUS-026 §4 disputes — **DECIDED** (Alejandro, 2026-10-27): a `claim_citations` table, one row per **(statement, source, revision, locator)** — `UNIQUE NULLS NOT DISTINCT` (Postgres 16, verified live: NULL-revision duplicates rejected, re-reads and multiple passages accepted). Carries `stance` (supports/refutes/context), `locator`, `excerpt`, `revision_id` (Wikipedia revid) and **one** timestamp `retrieved_at timestamptz` (`accessed_at` dropped). **`stance='context'` counts as NEITHER support nor refutation** — excluded from coverage AND from corroboration; a context-only statement is `unsupported`, not `disputed`; a `refutes` link does not make a statement evidenced. **Excerpt = the minimal passage carrying the fact (1–2 sentences), quoted verbatim, and VALIDATED as a substring of the stated revision's text**; public display requires attribution (Wikipedia CC BY-SA). **Migration OVERRIDDEN: only the 3 pilot dishes migrate**, as `stance='supports'` with excerpts fetched + `revision_id` recorded (a re-reading, recorded as such), **verification state `unverified` until reviewed** (GUS-026 §10 — the agent cannot publish); **the other 118 stay in the archived `citations` table until their statements exist, and NO statements are created to receive them** |
| Q8 independence | GUS-026 §5 — **DECIDED** (Alejandro, 2026-10-27): independence is **STORED**, not computed, at **two levels** — `source_derivations` (whole-source derivation: mirrors, translations, editions, reprints) and `citation_independence` (per-citation, claim-specific judgement). **Tri-state: `independent` / `derived` / `unassessed`, with NO DEFAULT** — "no derivation recorded = independent" is rejected, so an unassessed pair contributes zero and an incomplete assessment understates rather than inflates. **Corroboration counts only `supports` links from class-sufficient sources, and S6 NEVER COUNTS** — so the pilot's corroboration is **0 by policy** (all 142 catalog sources are en.wikipedia.org → S6), and **no Wikipedia derivation work is needed**. Level 1 is a hard block checked first. **The pilot must exercise the path**: one rendang origin statement with 2 real non-Wikipedia sources (S1–S5, explicitly assessed `independent`), plus a **derived-pair negative case built in the TEST DB, not live**. **Workload policy CLOSED (Alejandro, 2026-10-27): `citation_independence` rows are written ONLY for class-sufficient `supports` pairs on the same statement; no row = `unassessed`, which contributes zero** — the table is not populated exhaustively, and absence of a row is not evidence of independence |
| Q9 anchors | ADR-001 D4 (sentence anchors) — **DECIDED** (Alejandro, 2026-10-27): a **structured sentence table**, not inline markers (markers would leak into the public column and break translations; offsets break on edit). `description_sentences` (dish_id, field `short`/`long`, locale, position, text, `anchor_status` full/partial/none) + `sentence_claims` (sentence_id → statement_id, **status** ok/missing/retracted/unpublished/contradicting). `short_description` rendered from the sentences with an **exact** concatenation check; a sentence edit marks its anchors `needs_review` (Q2's stale mechanism); anchors on the **canonical** text only. **(1) THE CONCAT CHECK IS A GATE, NOT A BOUNDARY TEST** — a zero-width split rejoins exactly *by construction*, so it proves table↔column agreement and nothing about boundaries. Boundaries are proven by a **FIXTURE SET** (quotes, decimals, abbreviations, initials, ellipses) with expected splits, plus **human review of the pilot sentences**; **one splitter implementation** serves both population and check. The rule: a terminator that is not in a quoted span, not between digits, not part of an abbreviation/initial, not part of an ellipsis, and is followed by whitespace. **(2) VALIDITY IS ITS OWN AXIS** on `sentence_claims.status` (ok/missing/retracted/unpublished/contradicting), separate from `anchor_status`'s coverage — a sentence is `full` only if every anchor is `ok`; `unpublished` is the agent boundary (GUS-026 §10) in anchor form. **(3) CANONICAL BY DEFINITION** — the `dishes` columns ARE the canonical text; no locale column is needed; `dish_translations` is non-canonical and its 121 `en` rows are byte-identical duplicates of `short_description`, so translations are NOT a source of sentences (else every fact is anchored twice) — **archiving the 121 duplicates is backlogged**; this retires GUS-226 as a blocker for Q9. **(4) FIXTURE EXCLUDED BY GUS-231** — `dishes.status` CHECK restricts to draft/published/archived and the fixture is `archived`, so gating population on `status='published'` excludes it by construction. **(5) MANY-TO-MANY** confirmed — rendang's single sentence asserts **7+ facts**, confirming **GUS-225's undercount**. **(6) POPULATION = 3 PILOT DISHES ONLY**; `long` is **moot** (measured: all 3 pilot `long_description` are empty) and that gap is recorded — the `long` path (166 sentences, 1–12 per dish) is untested by the pilot, so the `field` enum must not be narrowed to `'short'`. **(7) `sentence_managed` FLAG + TRIGGER** — `ALTER TABLE dishes ADD COLUMN sentence_managed boolean NOT NULL DEFAULT false`, with a `BEFORE UPDATE` trigger rejecting a changed `short_description` when the flag is set; same pattern the project already uses in `db/migrations/gus-224-relations-option-b.sql`. **Why:** the concat check only *detects* divergence; a direct `PATCH` to `/api/dishes/:slug` (which sets `shortDescription` in `apps/api/src/routes/dishes-write.ts`) would silently desync. **Consequences:** the PATCH path must write through the sentence table for flagged dishes, and the flag keeps the trigger narrow (only the 3 pilot dishes are flagged; the other 118 keep free-text edits; `long_description` and all other columns stay writable). **(3a) FLAG CHANGES ARE LOGGED AND UNSETTING IS GATED** — every `sentence_managed` change is logged in `edit_history` (`target_type='dish'`, `action='update'`, `diff` jsonb, `comment` — the GUS-014 pilot's established pattern), written by the trigger in the same transaction so it cannot be skipped. **Unsetting the flag must re-sync or be REJECTED**, because otherwise the flag is a bypass: it would disable the trigger *and* leave the table and column desynced. **The stronger choice is recorded — VERIFY-THEN-CLEAR** (re-sync on unset can silently overwrite an edited column with a stale reconstruction and lose prose; verify-then-clear preserves both properties). So the trigger has two duties: `false→true` logs and requires the sentences to exist and be consistent; `true→false` logs and requires consistency, else it raises. **Consistency = the concat check passes** — one definition, used by the trigger, the migration and the verifier. **(3b) THE API CHANGE LANDS BEFORE THE TRIGGER** — if the trigger is applied first, every `PATCH /api/dishes/:slug` setting `shortDescription` on a flagged dish **fails** (the route still writes the column directly), a user-visible regression caused purely by ordering. Sequence: (1) ship the API change; (2) then the migration (which needs approval under RULES.md). The code lands first because it is the cheaper order to revert. After the trigger is live, such a PATCH returns an error instead of silently desyncing — intended, and covered by an API test |
| Q10 ownership | ADR-001 §2.2 (`dish_claims`) — **DECIDED** (Alejandro, 2026-10-27): statements are **INDEPENDENT ENTITIES with NO owner column** — no `owner_id`, no `dish_id`, no owner FK; the **subject FK is the only link**. "A dish's statements" = `WHERE subject_type='dish' AND subject_id = $1`. **Why:** an owner column makes evidence duplication the schema's default — "rendang uses coconut milk" and "nasi lemak uses coconut milk" are ONE fact about one ingredient, and per-dish ownership would hide cross-dish corroboration and duplicate the research. **Cost stated:** a statement's subject is a single entity, so a genuinely multi-dish fact is two statements sharing evidence (the model shares by sharing the subject, not by widening it). **(2) A SENTENCE MAY ANCHOR A STATEMENT ABOUT A DIFFERENT SUBJECT** — a `tacos-al-pastor` sentence may anchor a statement about **Puebla** (`subject_type='place'`); that is correct, because the sentence is where the claim is made and the claim is about what it is about. **DISH COVERAGE IS COMPUTED OVER ITS OWN SENTENCES, regardless of statement subject** — `coverage(dish) = anchored sentences / total sentences`. Not "statements whose subject is this dish": that would score tacos-al-pastor **0%** while D4b actually asks *"is every fact asserted in this prose anchored?"* — a question about the prose, not the subject distribution. **Corollary: evidence is per-statement, anchoring is per-sentence** — one statement can be anchored in two dishes' sentences with one evidence chain and two anchors. **(3) DEDUPE: ONE FACT IS ONE STATEMENT**, unique on `(subject_type, subject_id, predicate_id, value_type, value_ref, value_literal, qualifier_hash)` — otherwise a claim corroborated by two sources looks like two uncorroborated claims and the evidence splits. The **canonical qualifier hash** is in the key because scope is part of the fact's identity (Glasgow vs the subcontinent are competing statements, not one). Measured on live Postgres: jsonb equality is **key-order-independent and whitespace-insensitive but absent ≠ null** — so absent qualifiers must be **omitted, not stored as null**, or the hash diverges and dedupe silently fails. The qualifiers stay readable in `jsonb`; the hash is a key, not a storage format, and must be wide enough that a collision is not practical. Workflow: **find-or-create the statement, then attach the citation** — a duplicate insert is the constraint saying the fact exists. **(4) NO CASCADE DELETES** out of statements and **retraction is a status change** (`needs_revision`/`disputed`) — deleting a statement would delete its evidence chain, which is the most expensive thing in the catalog to produce and would make the research unrepeatable. Concretely: `description_sentences` → `sentence_claims` cascades (a link deletion, not an evidence deletion); `statements` → `claim_citations` does NOT cascade; `dishes` → `description_sentences` does NOT cascade; a dangling anchor is **marked** `missing`, not silently left. `dishes.status='archived'` is the existing non-delete mechanism (GUS-231). **THE CONSISTENCY CHECK: a dimension row's `statement_id` must reference a statement whose subject is that dish** — catches wrong-subject anchors and cross-dish mis-assignment. Crucially the **Puebla case is correctly NOT flagged**: the sentence↔statement relation is deliberately allowed to cross subjects, but the dimension-row↔statement relation is not, because a dimension row asserts something *about that dish*. A dimension row with `statement_id IS NULL` is **NOT a violation** — it is the honest **unevidenced** state (91 dishes have a family and no statement). Deferred: the exact qualifier canonicalisation (a wrong choice silently breaks dedupe — belongs with the first implementation), whether the hash is stored or generated (generated is safer — it cannot desync), and whether place statements can ever be dimension-row targets |
| Q11 migration | GUS-011 (121 Wikipedia-only) — **DECIDED** (Alejandro, 2026-10-27): **OPTION (iii) — neither (i) nor (ii).** The **118 published dishes outside the pilot get NO statements until research supplies a real source**; their dimension rows stay **`statement_id IS NULL` = `unevidenced`** (Q3's honest state). **NO COUNTRY-LEVEL STATEMENTS ARE DERIVED FROM `origin_location` OR FROM EXISTING DIMENSION ROWS — a geocode is not a citation.** **PLACES ARE SEEDED ON DEMAND, PER RESEARCHED DISH**, not speculatively for all 36 countries. Why (i) fails: it manufactures claims from a geocode — `origin_location` is a `geometry` column holding WKB hex, the country came from a *map* not a *source*, and the resulting rows would be **indistinguishable in the database from researched ones** while having **no `claim_citations` at all** — which in the model is precisely `unsupported`. That is the "two truths" failure ADR-002 exists to remove, arrived at through the back door. Why (ii) fails: it needs a place hierarchy for 36 countries plus a non-Wikipedia source per dish, and would land **before** the model that records any of it exists. The 118's archived `citations` rows remain **the record that research is outstanding** — the archive is a work queue, not a graveyard. CONSEQUENCE STATED PLAINLY: the catalog's headline coverage becomes **defined and near-zero** (today it is undefined) — a defined 0% reads as "not yet researched" rather than "not measured"; the 118 do not get worse, they get correctly labelled. THE RESEARCH BAR IS PER-CLAIM, NOT PER-DISH: a non-origin claim needs a class-sufficient source (S1–S5; S6 may accompany but not stand alone); an **origin** claim with `claim_class` `documented`/`disputed` needs **≥1 S1/S2/S3/S5 source** (GUS-026 §3.1) and a transnational dish's origin needs sources **for each competing position**; a dish that cannot be researched to that bar stays unevidenced **permanently** — GUS-026 §6's `unsupported` class exists for exactly that. ORDER OF WORK: **(a)** fix the cuisine gaps now — dimensions only, no statements/citations/claims, so it does not wait for the claims model; **(b)** finish ADR-002 and run the pilot; **(c)** the 50 new dishes are **seeded directly into the claims model, never the old one** — each arriving with place, description, dimensions AND source in one operation, each needing **≥1 non-Wikipedia source for its origin claim** (a stronger bar than the existing 121 meet, deliberately). Why (c) is not seeded the old way: the old model cannot express the content honestly (`citations.claim_text` is a whole description, 120 of 121), so a new dish seeded the old way arrives with the over-broad proposition the ADR exists to dissolve — **the 50 dishes are the first content that starts life in the new model**. Deferred: the order of the 118; whether an unresearchable dish is hidden or badged (a Q13 display question); the exact `unset_reason` mechanism (a schema choice — the reason must be queryable per (dish, dimension) and unable to conflict with an assigned value); and whether `dish_tradition`'s multi-value suffices for the transnational case (Q5's generalised rule is written for single-valued dimensions) |
| Q12 lifecycle | GUS-026 §6, §10 — **DECIDED (hermes, 2026-10-29)**: GUS-026 §6's seven states **exactly** (`draft` → `research_pending` → `under_review` → `verified` → `published`, with `disputed` and `needs_revision` branches). **Publication is a GATE, not a status** — a claim is publishable only when its `claim_class` meets that class's minimum evidence bar AND its citations meet the independence rule. **The gates are explicit:** `draft`→`research_pending` needs a subject, predicate, typed value and a set class, no evidence; `research_pending`→`under_review` needs ≥1 fetched citation with a **validated** excerpt (substring of the stated revision) and `revision_id`/`retrieved_at`; `under_review`→`verified` needs the class's evidence bar AND the independence rule AND class-sufficient `supports` links; `verified`→`published` needs every anchor `ok` and the statement attached to its dimension rows; any→`disputed` needs ≥2 **independent** S1–S3 sources on **opposing** positions; `published`→`needs_revision` is the anti-rot trigger (dead link, retraction, contradicting re-read) and re-publishing is human-only. **The agent boundary is MECHANICAL, not advisory:** an agent may propose, fetch, cite what it fetched, classify `disputed`, and flag `needs_revision`; it may NOT move a claim to `verified` or `published`, may not set `kitchen-tested`, may not cite a source it has not fetched, may not publish an `unsupported`/`hypothesis` claim, may not offer an S6 source as the evidence for an R2 origin claim, and may not infer a date, person or place no source states. **decided-by: hermes** — the `verified` and `published` transitions must be unwritable by the agent's own credentials: a boundary enforced only by a written rule is a boundary that gets crossed under pressure, and a boundary enforced by *which credential can write the row* is not. The implementation vehicle is an implementation detail; the separation must be REAL. Also settles: a `documented` claim may rest on a single source; `disputed` needs ≥2 independent S1–S3 sources on opposing sides; the pilot's corroboration is therefore **0 by policy** (all 142 catalog sources are S6) and no Wikipedia derivation work is needed; `unverified` is **not** a state (Q7's "unverified" means `research_pending`); verification state and `claim_class` are **separate axes**, so "no evidence" never reads as "not yet checked" |
| Q13 API | ADR-001 §4 (sequencing) — **DECIDED (hermes, 2026-10-29)**: **no read-path change in the pilot.** `GET /api/dishes/:slug` stays **byte-identical** — no new field, no changed field, no changed shape; the dish list endpoint is unchanged; the existing read path's query plan is unchanged because the claims model is not joined into it. Claims are exposed on a **new, public, read-only** `GET /api/dishes/:slug/claims`, returning the statements anchored in that dish's sentences with their evidence, `claim_class`, verification state, readings and anchors, plus a `coverage` figure. For the 118 non-pilot dishes it returns an **empty statement list with coverage 0%** — the honest answer per Q11 ("defined and near-zero", not "not measured"). **Why separate:** the existing payload's `sources` field is the old flat citation list and answers *"what was cited when this was written?"*; the claims endpoint answers *"what does this dish assert, what is the evidence for each assertion, and how much of the prose is anchored?"* — an editor's and researcher's question. Putting it inline would change the shape of an existing field and force every consumer of `sources` to move, coupling the public API to a model that has not been through a pilot. **Why public and read-only, not editor-only:** a reference work's value is that its evidence is inspectable by the reader; an evidence model only its authors can see is not a reference work. The **write** boundary stays strict (Q12), the **read** boundary is open — `draft`/`research_pending`/`under_review` are not returned, `verified`/`published`/`disputed`/`needs_revision` are, each with its state visible, because a reader who can see a claim should see that it is disputed or degraded. **The endpoint IS the pilot's oracle** — Q7 and Q9 both need a way to check the model without an editor UI. Deferred: whether the dish payload should eventually embed a single coverage **badge** (decided: deferred until the number is meaningful — a badge reading 0% on 118 dishes is noise); the exact `needs_revision` display treatment |
