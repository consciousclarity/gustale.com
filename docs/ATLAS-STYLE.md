# Atlas style — "The Working Record", Atlas edition

**For:** gustale.com — dishes, families, lineages and connections · **Owner:** Alejandro ·
**Written:** 2026-11-20 (Claude), checked against `main` @ `cd46976` · **Ships with:** the Hermes skill
`gustale-atlas-writer` (`atlas-record.schema.json`, `check_atlas.py`, `new-atlas-card.sh`, three examples) ·
**Related:** RECIPE_STYLE_V2.md (shared voice), ADR-002 (claims), ADR-004 (atlas), WP-C2 (dish page),
`apps/web/src/lib/evidenceLabel.ts`, SOURCE-TIER-LIST.md, FAMILY-TAXONOMY-REVIEW.md

The Atlas already has its structure. This document doesn't change any of it:
- the dish page order (WP-C2)
- the four public evidence labels (`evidenceLabel.ts`)
- the claims model (statements, citations, sentence anchoring)
- the approved family classification (migration 0051)
- the direction convention for relations (migration 0036).

It says **how to write what fills them**, so every dish, family and lineage page reads as one archive, and so an
agent can write them consistently, from sources, without padding.

---

## The Atlas voice

**Shared with recipes.** Plain, exact, calm and observant. No host, no "I" or "we", no story, and no imitation of any
other site. The originality rules apply unchanged: facts come from sources, every sentence is Gustale's own,
no run of 8 or more words is shared with a source, and 6 or more is flagged. The banned words apply too.

**Different from recipes:**
- **English first.** English is the Atlas pivot. Translations run through the existing sentence pipeline
  (`description_sentence_translations`, with stale tracking), not through the writer.
- **Third person throughout.** Present tense for how a dish is made and eaten now; past tense for what a record
  shows.
- **Dates are exactly as precise as the source:** "1910s–1920s", "c. 1810", "late 19th century". Never sharpen a
  date.
- **No ownership and no exoticising.** Never use: exotic, ethnic, iconic, beloved, quintessential, world-famous,
  most famous, since time immemorial, for centuries, for millennia, age-old, legend has it, it is said. Use these
  only with attribution to a cited source: traditional, authentic, original, homemade, national dish, the oldest,
  ancient.

## Wording follows the evidence

This is the Atlas's signature rule. The sentence carries the same strength as the label the reader will see next
to it.

| Label (`evidenceLabel.ts`) | What is true | How the sentence is written |
|---|---|---|
| **Documented** | At least one primary or scholarly source (S1 or S2) states it, and the excerpt is checked | A plain statement, dated as the source dates it: "Tselementes' manuals give a moussaka finished with béchamel." |
| **Likely** | Reputable secondary sources agree, and none contradicts them | Attributed agreement: "is usually credited to", "sources agree that" |
| **Disputed** | Credible sources conflict | Each account, with its source, and no winner: "Some sources link…; others treat… as separate developments." |
| **Unverified** | No qualifying source yet | **Not written as prose.** It stays a gap; the facts row shows "No evidence". |

- **Origin words** (originated, invented, birthplace, first made, created by) appear only in a sentence anchored to
  an `originated_in`, `originated_at` or `created_by` statement. Otherwise write "is associated with".
- **A place association is never a birthplace claim.** It says what the source establishes about the dish and the
  place.
- **S6 (reference, Wikipedia) is for discovery only.** It never makes anything Documented or Likely.

---

## 1. Dish

The page order is WP-C2's. What the writer supplies for each section:

| Section | What the writer supplies | Budget | Stored in |
|---|---|---|---|
| **Overview: intro** | What the dish is (its form and main components), where it is associated, and what it is like when it is right or how it is served. Open with the thing itself, not "X is a…". | 2–3 sentences, 35–70 words | `description_sentences` (field `short`), one row per sentence, plus `sentence_claims` |
| **Overview: facts table** | **Associated with** (place associations), **Family** (one primary `dish_families` slug), **Served as** (the live **course** facet), **Technique** (`preparation_methods`), **Also called** (`dish_names`). Only existing vocabulary values. | data | the dimension tables |
| **Overview: cover** | Reuse the current cover if it shows this dish as eaten. Otherwise write a brief (§5). | 1 | `media` |
| **About this dish** *(optional)* | How it is put together in outline (no recipe), when and by whom it is eaten, and how the name is used across places. | 2–3 paragraphs, 80–250 words | `description_sentences` (field `long`) |
| **Where it belongs** | One entry per association: the relationship type (existing values), the place or community, and what the source establishes. | explanation ≤ 25 words | `dish_place_associations` |
| **History** | Chapters (see below), and movements only where a record supports a transmission | per chapter, below | `dish_journey_beats`, `dish_journey_movements` |
| **Connections** | Three columns: Resembles, Influenced by, Same family. Rules in §4. | reason ≤ 20 words | `dish_relations` |
| **Variants** | `regional_variant_of` relations and identity kind (shared dish, regional variant, historically related), each naming what differs | explanation ≤ 20 words | `dish_relations`, `dish_identities` |
| **Sources** | Nothing to write. The list comes from the citations. | – | `sources`, `claim_citations`, `citations` |

**Anchoring.** Every dish sentence needs either a statement (`claims`) or a source (`source_ids`).
- A sentence that says where, when or by whom (origin, naming, creator, dates) must be anchored to a statement.
- The predicates that say *where, when, by whom or after what* — `originated_in`, `originated_at`, `created_by` and
  `named_after` — need a statement. The seven dimension predicates (`is_a`, `belongs_to_cuisine`,
  `served_as_course`, `cooked_by`, `contains_ingredient`, `part_of_tradition`, `eaten_in_context`) name a
  controlled vocabulary and are carried by the facts table, not by a sentence claim. Other sentences cite their
  sources directly.
- The writer never creates a predicate. It proposes one in `agent.proposed_vocabulary`.

**The facts table never pads.** An empty row shows "No evidence" (WP-C2). That is an honest state, so don't fill a
row just to avoid it.

**History chapters**, one row each:

| Field | Rule |
|---|---|
| Title | ≤ 8 words, names what the record shows ("A French crust in a Greek manual") |
| Date label and precision | Exactly as the source supports: exact, circa, range, century, decade, BCE/CE, unknown |
| Place and role | Attestation, preparation context, adaptation, reception, circulation or regional identity. **Never a birthplace.** |
| Label | ≤ 45 words: what the record shows |
| Scope note | ≤ 30 words: what the record does **not** establish, and whether it was read directly or only reported |
| Evidence kind | Primary record, scholarly interpretation, reported account, reference work, archival record or comparison |
| Confidence | documented (needs S1 or S2), likely, possible, parallel |
| Source and locator | Required. The locator is the page, recipe number or section. |

**Movements** exist only when a record supports a transmission. Never infer one from chapter order, map proximity,
a shared name, a shared ingredient or a lineage link (the rule in the `dish_journey_movements` comment).

## 2. Family

A family is a **classification**: by form, course, cuisine or content type, as approved in migration 0051. It is
**not ancestry**, which is why the page marks "Same family" as "Classification only". History belongs in a lineage.

| Field | Rule | Budget |
|---|---|---|
| Description | 1. The **membership test**: what a dish must have to belong. 2. The range the family covers. 3. Optionally, the **boundary**: the nearest family and what separates them. Present tense. No origin, history or ancestry words. | 1–3 sentences, 25–60 words |
| Representative dishes | The members that show the range best | 3–8 slugs |
| Name, class, parent | **Not changed by the writer.** These are approved editorial decisions; propose changes in the report. | – |
| Cover | Reuse a representative dish's cover. Never generate one. | – |

Stored in `dish_families.description`, with citations pointing at the family.

## 3. Lineage

A lineage is the story of how a dish **idea** travels: chains, clusters, cousins and fusions (the `lineages` table
comment). Its confidence is a deliberate uncertainty knob; the page must never claim more than it holds.

| Field | Rule | Budget |
|---|---|---|
| Name | Names the idea, not a nation ("Filled dough parcels") | ≤ 5 words |
| Short description | The idea that travels, in one sentence | ≤ 30 words |
| Concept summary | The shared idea, and what varies | 30–70 words |
| Origin summary | What is known about where and when the idea is first recorded. "Not established" is a valid answer. | ≤ 70 words |
| Long description | How the idea moved, paragraph by paragraph, each sentence sourced. No single-origin story unless it is documented. | 120–300 words, 2–4 paragraphs |
| Uncertainty note | **Required unless the confidence is documented:** what is not known or is disputed | ≤ 50 words |
| Cultural practice note | Optional: who makes it and when, from sources | ≤ 50 words |
| Structured lists | Origin and related regions, historical forces, techniques, base ingredients, course groups, related families, representative dishes. Only vocabulary values. | – |
| Cover | A representative dish's cover, plus the map from `route_hints`. Never generated. | – |

**Members** (`dish_lineages`), one row per dish:
- **Role.** Transmission roles (ancestor, descendant, adaptation, fusion, diaspora adaptation, trade-route spread,
  colonial spread, regional variant) need a source. Resemblance roles (cousin, technique relative, ingredient
  relative, parallel evolution) carry no history wording. Possible influence and uncertain never carry documented or
  likely confidence.
- **Explanation:** ≤ 30 words, naming what is shared and what changed. List the changed elements too.
- **Sort order:** 10 for the anchor, 5–7 for strong members, 1–3 for tentative ones.

## 4. Connections

The complete vocabulary is in `references/vocabulary-snapshot.md` §2 — **17 live slugs**. The
table below groups them by the column they render in.

| Column on the dish page | Type | Direction | Source needed | How the reason is written (≤ 20 words) |
|---|---|---|---|---|
| **Resembles** | `similar_form`, `similar_technique`, `often_compared_with`, `shared-ingredient`, `shared_ingredient`, `similar-serving`, `similar_serving`, `shared-method`, `regional-cousin` | none | recommended | Names the visible shared feature and the main difference. **No history words** (descended, derived, influenced, spread, introduced, came from). |
| **Same family** | `family` | none | – | Classification only. Never ancestry wording. |
| **Influenced by** | `ancestor`, `developed_from`, `adapted_from`, `influenced_by` | known: **source = predecessor, target = derived** | **yes** | Names the documented link. Write the true direction once; never write the inverse (`descendant`). |
| **Variants** | `regional_variant_of` | known, acyclic | **yes** | What differs, naming the changed element |
| own treatment | `diaspora` | known | **yes** | The dish travelling from a place with its people, not "influenced by" |
| depends | `connection_proposed` | `direction_known` true or false | **yes** | When the direction is unknown: symmetric wording, no "from", "into" or "led to". **No arrow anywhere.** |

**The vocabulary spells itself two ways.** `similar-serving` and `shared-ingredient` use a
hyphen; `similar_form`, `similar_technique` and `shared_ingredient` use an underscore. The
live data uses **both**, and the site renders both — normalising them would silently drop
those edges from the legend and the map. **Write the spelling the live row uses.**

**Strength (1–5):**

| Strength | Meaning |
|---|---|
| 5 | documented and defining |
| 4 | documented, or a very close form |
| 3 | a clear shared feature |
| 2 | partial |
| 1 | tentative |

## 5. Images

- **Dish:** one cover. Reuse the existing cover when it shows the dish as eaten. Otherwise write a brief in Gustale's
  documentary field-photography style: the dish where and how it is eaten, nothing it doesn't contain, no text.
- **Family and lineage:** reuse a representative dish's cover, plus the map for a lineage. **Never generate** one.
- **Never generate anything that looks like a historical record:** no period photograph, engraving, manuscript,
  sepia print or artefact. On an archive page it would read as evidence.
- Alt text is at most 125 characters and says what the image shows.

---

## 6. The record and the pipeline

- **One JSON record per entity** (`kind`: dish, family or lineage), valid against `atlas-record.schema.json` and
  passing `check_atlas.py` (with `--sources-dir`).
- **Kanban board `gustale-atlas`.** Three cards per entity: research → write → verify.
  `new-atlas-card.sh <kind> <slug>` creates them.
- **Existing content is never overwritten blindly.**
  - Research reads the live record first.
  - Write produces a complete proposed record.
  - Verify compares it with live and applies only the changes, through the existing write paths, which keep edit
    history.
  - Nothing is deleted. A published sentence is replaced only through the path that keeps its history.
  - A claim that would be removed or contradicted goes to review, never silently.
- **Statement status** changes only through `statement_set_status()`; the database refuses anything else.
- **Gate:**
  - **HIGH:** every statement and every unanchored sentence has S1–S5 support, there are at least 2 independent
    S1–S5 sources, and the checker reports PASS. The record goes through the existing publish gates.
  - **MEDIUM:** review by Alejandro.
  - **LOW:** blocked.
  - The first records of each kind stop at review regardless (A5).
- **After publishing**, the English sentences go to the existing translation pipeline. The dish's own language
  comes first.

## 7. The writer prompt

> **You write Atlas pages for Gustale (gustale.com), a public archive of world dishes: dishes, families, lineages
> and their connections, in Gustale's own house style, "The Working Record".**
>
> The Atlas records what is known about a dish: what it is, where it belongs, what the records show, how it
> connects to other dishes, and what is contested or unknown. Readers are curious food explorers and people
> researching food history. The voice belongs to Gustale and to no one else: plain, exact, calm and observant,
> third person, with no host, no story and no imitation of any other site.
>
> **You receive** a source sheet containing:
> - the live record for this entity, if there is one
> - the sources with their tiers (S1–S6)
> - the facts each source gives, with locators
> - the existing vocabularies (families, techniques, courses, contexts, relationship types, predicates)
> - a `sources/` folder with each source's own text, for the originality check.
>
> **You return** one JSON object valid against `atlas-record.schema.json` (`atlas-1.0`), in English, and nothing
> else. The examples show the shape; don't reuse their sentences.
>
> **Hard rules**
> 1. **Invent nothing.** Every fact comes from the source sheet and carries its sources. Where nothing qualifying
>    exists, leave the field empty and name the gap in `agent.gaps`; the page will say "No evidence".
> 2. **Wording follows the evidence.**
>    - Documented (S1/S2, excerpt checked): a plain, dated statement.
>    - Likely: attributed agreement.
>    - Disputed: every account, with its source, and no winner.
>    - Unverified: not written as prose.
>    - Origin words only with an anchored `originated_in`, `originated_at` or `created_by` statement; otherwise
>      "is associated with". A place association is never a birthplace.
> 3. **Original wording.** Never share a run of 8 or more words with a source (numbers and units don't count). Don't
>    follow a source's sentence shapes. Use no other site's labels or devices.
> 4. **Vocabulary is fixed.** Use only existing families, techniques, courses, contexts, relationship types, predicates and
>    enum values. Never rename or reclassify a family. Propose anything new in `agent.proposed_vocabulary`.
> 5. **A family is a classification, not ancestry.** History belongs in lineages and in the History section.
> 6. **Connections carry their own truth.**
>    - Resemblance types state a visible shared feature, with no history.
>    - Directional types need a source and the true direction (source = predecessor, target = derived). Never
>      write the inverse.
>    - `connection_proposed` with an unknown direction uses symmetric wording.
> 7. **No extras.** No superlatives, ownership, exoticising or folklore framing, no recipe steps, no nutrition.
>
> **Per kind**
> - **Dish:**
>   - `intro`: 2–3 sentences, 35–70 words, opening with the thing itself.
>   - `about` (optional): 80–250 words.
>   - `facts`: existing values only.
>   - `places`: explanation ≤ 25 words.
>   - `history.chapters`: title ≤ 8 words, label ≤ 45, scope note ≤ 30, source and locator required, dates exactly
>     as precise as the source.
>   - `history.movements`: only with a record of transmission.
>   - `connections` and `variants`: reason or explanation ≤ 20 words.
>   - Every sentence has `claims` or `source_ids`.
> - **Family:**
>   - `description`: 1–3 sentences, 25–60 words. The membership test, the range, and optionally the boundary
>     with the nearest family.
>   - `representative_dishes`: 3–8.
>   - Name, class and parent stay unchanged.
> - **Lineage:**
>   - `short_description`: one sentence, ≤ 30 words.
>   - `concept_summary`: 30–70 words.
>   - `origin_summary`: ≤ 70 words; "not established" is a valid answer.
>   - `long_description`: 120–300 words in 2–4 paragraphs.
>   - `uncertainty_note`: required unless the confidence is documented.
>   - `members`: role, explanation ≤ 30 words, changed elements, confidence, sort order.
> - **Images:**
>   - Dishes reuse their cover or brief one in documentary field-photography style.
>   - Families and lineages reuse a representative dish's cover.
>   - Never generate anything that looks like a historical record.
>
> **Confidence.** Propose `agent.confidence`; the verifier makes the final call.
> - HIGH only if every statement and every unanchored sentence has S1–S5 support, there are at least 2 independent
>   S1–S5 sources, and the checker passes.
> - MEDIUM if the entity is clear but some support is missing.
> - LOW if the core is unsourced or disputed beyond what the page can show.
>
> **Before you return,** run `python3 check_atlas.py <file> --sources-dir sources/` and fix every ERROR. Then read
> the intro once as a reader who has never heard of the dish: they should know what it is, where it belongs and
> what it looks like.

## 8. Examples (structure and voice only)

The examples' sources are **placeholders** and their facts are not verified. They show the shape and the voice;
don't import them. The full records are in `examples/`, and all three pass `check_atlas.py`.

**Dish (moussaka-greek), intro:**
> Layers of fried aubergine and minced lamb or beef cooked with tomato, sealed under a thick béchamel and baked
> until the top is browned and set. The béchamel-topped form is associated with Greece; the same name covers quite
> different dishes in the Balkans, Turkey and the Levant. It is cut into thick slices and served warm, once it has
> rested enough to hold its layers.

**History chapter:** *A French crust in a Greek manual · 1910s–1920s · Athens, attestation · Likely.*
Tselementes' cookery manuals give a moussaka finished with béchamel, the form now associated with Greece.
*Scope: reported in secondary sources; the manuals were not inspected directly, so the first edition with béchamel
is not fixed.*

**Connections, Resembles:**
- Musakka (Turkey): shares the name and the aubergine-and-minced-meat base, without the béchamel layer.
- Levantine moussaka: shares the name and the aubergine, but is meatless, made with chickpeas and served cold.

**Family (dumpling):**
> Small portions of dough, either wrapped around a filling or shaped on their own, cooked by boiling, steaming,
> frying or baking. Membership turns on each piece being individual and small; large filled pies and loaves
> belong to the pie and bread families.

**Lineage (filled-dough), origin summary and two members:**
> Where the idea starts is not established. Some sources link several forms to the movements of Turkic and Mongol
> peoples across Central Asia, while others treat the parcels of China, Anatolia and Eastern Europe as separate
> developments.

| Dish | Role | Explanation | Confidence |
|---|---|---|---|
| Momo | cousin | The same parcel, pleated at the top, with Himalayan fillings and a chilli relish on the side. | likely |
| Pelmeni | possible influence | Small boiled parcels with a thin dough; a link to the eastern forms is proposed but not documented. | possible |

## 9. Decisions (defaults in force until Alejandro changes them)

- **A1 English first** for the Atlas (the pivot), with the dish's own language first in translation. Recipes stay
  written in the dish's own language first, as decided for recipes.
- **A2 Predicates.** Only the four on `main`. Other sentences cite sources directly; new predicates are proposed,
  never created.
- **A3 Images.** Families and lineages never get generated images.
- **A4 Budgets** as in §1–§4.
- **A5 First records stop at review.** The first five records of each kind stop at review even when they are HIGH,
  until the write path is confirmed.
