# ADR-002 — The claims model

**Status:** 🟡 **DRAFT — question 1 of N open. Nothing implemented. No schema change.**
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

### Q1 — What is the claim's identity: one subject–predicate–value row, or free prose?

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

### Q2 — Does the claim store its own text, or is the text generated?

**Decision:** whether `claims` carries a `text` column.

**Recommendation: yes, carry `text`, but make it explicitly **derived and regenerable**, not the source of truth.** The structured fields `(subject, predicate, object)` decide the claim; `text` is the readable rendering, regenerated whenever the structured fields change, and any hand-edit to `text` is rejected by validation.

**Reason:** the live API and the web UI need a sentence to render, and regenerating it on every read is wasteful and makes editorial wording impossible. But if `text` can drift from the structured fields, the two disagree and the coverage metric lies — a claim that says one thing while the sentence says another.

**Alternative: no `text` column; the rendering is generated at query time** from predicate + object templates. One source of truth, guaranteed. But it requires a predicate→template registry, which becomes a maintenance surface, and it cannot express a claim whose natural wording does not fit the template (e.g. *"its method derives from X, adapted in Y"*).

---

### Q3 — What is the subject of a claim, and how is it typed?

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

### Q4 — What is the predicate vocabulary, and is it closed?

**Decision:** whether `predicate` is a controlled vocabulary or free text.

**Recommendation: a controlled vocabulary table**, with the object type constrained per predicate. Seeded with at minimum: `originated_in`, `originated_at`, `created_by`, `named_after`, `contains_ingredient`, `cooked_by`, `served_as`, `part_of`, `related_to`, `has_variant`, `made_from`.

**Reason:** a closed predicate set is what makes claims *comparable*. "How many dishes are documented as originating in a disputed place" is a query only if the predicate is uniform. It also lets validation enforce shape — `originated_in` must take a place object, `cooked_by` must take a technique — which is what stops a claim row quietly becoming prose again.

**Alternative: free-text predicates with a suggested list.** Easier to add claims in, and allows a scholar's exact phrasing. But coverage-by-predicate and the GUS-026 "origin predicate" rule both need a closed set to be checkable; a free-text predicate makes the Wikipedia rule unenforceable.

---

### Q5 — What are the object types, and can one claim have several objects?

**Decision:** the shape of the object side.

**Recommendation:** `object_type` is a closed set (as ADR-001 §2.4 sketches: `place`, `technique`, `ingredient`, `dish`, `time_interval`, `cuisine`, `family`, `value`), and a claim may have **several objects** — implemented as one row per (claim, object) pair, or a `claim_objects` child table.

**Reason:** *"A West Sumatran dry curry of beef slow-cooked for hours in coconut milk"* asserts several facts, but so does *"rendang contains coconut milk and beef"* — and ADR-001 D6's worked example splits that into 6 claims (origin, family, protein, technique, medium, duration). So one claim = one object would be cleanest… but some claims genuinely take a list: *"contains ingredients X and Y"* is one assertion about a set.

**The two options are genuinely close.** The deciding question is whether "contains X and Y" should be one claim with two objects, or two claims. **My recommendation: one claim, several objects** — because the evidence supports the *set* as one assertion; splitting it would let one source appear to corroborate a subset of the assertion.

**Alternative: one claim per (subject, predicate, object)**, with no multi-object claims. Simplest possible schema, and every claim is a single fact. The cost: "contains beef and coconut milk" becomes two claims that could be independently evidenced, which overstates the evidence — a source that lists beef but not coconut milk would appear to support half the proposition.

---

### Q6 — What is the source model, and does `sources` need to change?

**Decision:** whether the existing `sources` table is reused, extended, or replaced.

**Recommendation: extend `sources` in place** — add `source_class` (S1–S7, replacing the current single-valued `reliability` which is `secondary` for all 142 rows), and keep `reliability` for a later decision. Do **not** create a new sources table; the 142 rows are real and the columns are mostly right.

**Reason:** the catalog has 142 sources, all `web`/`secondary`/`en`. GUS-026's S1–S7 classification is a **refinement** of what `reliability` was trying to be, not a replacement. Migrating in place preserves every existing citation.

**Alternative: a new `source_classes` lookup table plus a `sources.source_class_id`** — more relational, and the class can carry its own metadata (what S1–S7 are "good enough for", per GUS-026 §3's table). More machinery, but it keeps the policy in the database rather than in prose.

**What I recommend for the vocabulary, per GUS-026:** `S1` primary historical · `S2` scholarly · `S3` institutional · `S4` practitioner · `S5` specialist · `S6` reference · `S7` unverified. **Wikipedia is S6.**

---

### Q7 — How is a claim linked to a source, and what does a citation row carry?

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

### Q8 — What does "independent" mean operationally, and is it stored or computed?

**Decision:** how source independence is determined.

**Recommendation: store an explicit `derives_from` relationship between sources** — `source_derivations (source_id, derives_from_source_id, note)` — and compute independence by traversing it. A source with no derivation is independent of every other source.

**Reason:** GUS-026 §5 gives the test — *"If this source were deleted, would the other still say the same thing?"* — but that is a **human editorial judgement**. Storing the judgement makes it reviewable and auditable; recomputing it from the text would make it unreproducible.

**The hard part, stated plainly:** this requires a human to record derivations, and there are currently **142 sources, all Wikipedia pages**. Wikipedia pages do cite each other, and many of the catalog's "sources" are one article's restatement of another's. Until those derivations are recorded, **corroboration for the whole catalog is 0** — which is the truthful number and exactly what GUS-011 implies.

**Alternative: independence is computed at query time** by comparing citations, URLs and publication lineage automatically. No manual curation, but the result is only as good as the heuristic, and it cannot know that two encyclopedias copied the same unsourced wiki page.

---

### Q9 — How does a claim link to the sentence that states it (the anchor)?

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

### Q10 — Does a claim belong to a dish, to a description, or to both?

**Decision:** where a claim's ownership lives.

**Recommendation: claims are **independent entities**, owned by a subject, and *linked* to dishes through `dish_claims`.** A claim about "coconut milk" as an ingredient is not owned by any one dish; several dishes can reference it.

**Reason:** sharing. If every dish's claim were owned by that dish, then "rendang uses coconut milk" and "nasi lemak uses coconut milk" would be two separate claims with two separate evidence chains — so corroboration across the catalog would be invisible, and the evidence effort would be duplicated per dish.

**Alternative: claims are owned by the dish** (ADR-001 §2.2 sketches `dish_claims` as a join, which is compatible with either reading). Simpler; each dish's claims are self-contained. The cost is duplicated evidence and no cross-dish corroboration.

---

### Q11 — What happens to the existing 121 dish-level citations?

**Decision:** the migration path for the current data.

**Recommendation: migrate them as claims, one per source, at the granularity the source actually supports** — and where the existing prose asserts several facts, either split it into several claims or record it as one claim with several objects (Q5). Then **anchor** each claim to the sentence of the dish description it came from, so today's coverage does not silently drop to zero.

**Reason:** the 121 `claim_text` strings are real sentences from real sources, with real locations ("Lead paragraph"). Throwing them away would discard the only evidence the catalog has. But **they are currently one sentence asserting several facts** — so a straight copy would produce claims that cannot be independently verified, which is the problem ADR-002 exists to solve.

**Alternative: migrate them verbatim as single claims** (one claim = the whole sentence), and only split them as each dish is re-researched. Fastest, and the coverage metric starts at 0% rather than a false 100%; but every migrated claim is an over-broad proposition, and the split work is deferred rather than avoided.

**What I recommend, concretely:** migrate them as **one claim per source with the original sentence as `text` and the atomic facts as `dish_claims` children where they are separable** — so the historical record is preserved verbatim *and* the atomic facts are addressable.

---

### Q12 — What is the claim's verification lifecycle, and who moves it?

**Decision:** the state machine and its gates.

**Recommendation: adopt GUS-026 §6's states exactly** — `draft` → `research_pending` → `under_review` → `verified` → `published`, with `disputed` and `needs_revision` branches — and make **publication a gate, not a status**: a claim is publishable only when its `claim_class` meets that class's minimum evidence bar **and** its citations meet the independence rule.

**Reason:** GUS-026 has already been written as a policy; ADR-002 should implement it rather than propose a parallel lifecycle. The states map cleanly onto the API (a reader sees `published`; an editor sees `under_review`).

**The open sub-question: who moves a claim between states?** A `published` claim is a published claim, so the transition to `published` should be a **human action**, not an agent action (GUS-026 §10 restricts what an agent may do). An agent may move a claim to `research_pending` or `under_review`, and may flag `needs_revision`; it may not publish.

---

### Q13 — What are the performance and API consequences?

**Decision:** whether ADR-002 changes any read path.

**Recommendation: **no read-path change in the pilot.** The 3 reference dishes get claims, anchors and provenance; the existing `/api/dishes/:slug` payload is unchanged. Claims are exposed through a **new** endpoint (`/api/dishes/:slug/claims`) so the pilot can be verified without touching what readers see.

**Reason:** ADR-002 changes the meaning of the data, not its presentation. The pilot's job is to prove the model; proving it does not require every consumer to move at once.

**Alternative: expose claims inline in the dish payload from the start.** Fewer round trips; but it couples the public API to a model that has not been through a pilot yet.

---

## Q&A format

Same as ADR-001: I propose, you answer **ok** to accept or override. The question list is **frozen once Q1 is answered**.

**Q1 is the one to answer first** — claim identity determines the schema, and Q2–Q13 are mostly consequences of it.

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
| Q1 claim identity | ADR-001 D6 (one assertable fact) |
| Q2 text | ADR-001 D6b (coverage counts sentences) |
| Q3 subject | ADR-001 §2.1 entity graph |
| Q4 predicate | ADR-001 §2.4 sketch |
| Q5 objects | ADR-001 D6 worked example (6 claims for rendang) |
| Q6 sources | GUS-026 §3 source classes |
| Q7 claim↔source | ADR-001 §2.4 `citations` sketch; GUS-026 §4 disputes |
| Q8 independence | GUS-026 §5 |
| Q9 anchors | ADR-001 D4 (sentence anchors) |
| Q10 ownership | ADR-001 §2.2 (`dish_claims`) |
| Q11 migration | GUS-011 (121 Wikipedia-only) |
| Q12 lifecycle | GUS-026 §6, §10 |
| Q13 API | ADR-001 §4 (sequencing) |
