# GUS-026 — Editorial evidence policy (DRAFT for Alejandro's review)

**Status:** 🟡 **DRAFT — for Alejandro's review. Not implemented, not enforced, no data changed.**
**Date:** 2026-10-25 · **Task:** GUS-026 (EPIC 03 — Build the evidence and authenticity verification system) · **Depends on:** GUS-014 (ADR-001, `claims` table), GUS-027 (source registry), GUS-028 (claim-level citations)

---

## 1. Why this policy exists, in one number

**121 of 121 published dishes (100%) cite Wikipedia and nothing else.**

Every dish in the live catalog has exactly one source: an English Wikipedia article, with the dish's whole description pasted into the citation's `claimText`. Not one dish has a second source. Not one has a scholarly, institutional, or practitioner source. The ROADMAP's own rule — *"Wikipedia must never be the sole basis for a contested historical origin claim"* — is therefore **already violated across the entire catalog**, including for the dishes where the origin is exactly what is contested.

This is not a content bug to be fixed dish by dish. It is the absence of a policy that says *when a claim may be published at all, and on what evidence*. A policy that only describes the ideal and does not state the enforcement point is what produced this state.

## 2. Scope

This policy governs **what may be published on Gustale, and on what evidence**. It applies to:

- every factual claim about a dish, recipe, ingredient, place, technique, tradition, or historical event;
- every description, long description, and journey beat;
- every origin, date, person, quantity, technique, and cultural-practice statement.

It does **not** govern: photographic credits, AI-illustration labelling, site copy, or navigation text. Those have their own rules (IMAGE_STYLE.md).

## 3. Source classes

Adapted from ROADMAP §5, with the operational addition of what each class is **good enough for**.

| Class | Examples | Good enough to support |
|---|---|---|
| **S1 — Primary historical** | Original manuscripts, early cookbooks, historical archives | Any claim, including contested origin |
| **S2 — Scholarly** | Peer-reviewed culinary history, food anthropology | Any claim, including contested origin |
| **S3 — Institutional** | University / museum / library publications, government heritage archives | Any claim; strong for place and technique |
| **S4 — Practitioner** | Community practitioners, oral histories, regional cooks | Living cultural practice; **weak for historical origin** (memory is not a record) |
| **S5 — Specialist** | Specialist culinary historians, reputable regional cookbooks | Most claims; corroborate origin with S1–S3 |
| **S6 — Reference** | Wikipedia, Wikidata, general culinary publications | **Discovery and terminology only.** Never the sole basis for a contested origin claim. |
| **S7 — Unverified** | Blogs, AI-generated articles, unattributed aggregators | **Nothing.** Leads for research only. Never publishable. |

### 3.1 The Wikipedia rule, stated precisely

The ROADMAP says Wikipedia "must never be the sole basis for a contested historical origin claim." This policy tightens that to something checkable:

> A claim whose **claim_class** is `documented` or `disputed`, and whose predicate is `originated_in` / `originated_at` / `created_by` / `named_after`, **must** have at least one S1, S2, S3 or S5 source. An S6 source may accompany it, but may not be the only one.

Rationale: an origin claim is the claim most likely to be wrong *and* the claim most likely to be copied. Wikipedia's own origin articles are frequently uncited or circularly sourced for contested origins — Chicken Tikka Masala's article is a textbook example. Requiring a non-S6 source for origin claims is the minimum that makes the policy meaningful.

## 4. Claim classes

Every claim carries exactly one class. The class determines what evidence it needs and whether it may be published.

| Class | Meaning | Minimum evidence | May be published? |
|---|---|---|---|
| `documented` | Attested in a source | 1 × S1–S5 | ✅ yes |
| `scholarly_interpretation` | A scholar's reading of evidence | 1 × S1–S3 | ✅ yes, labelled as interpretation |
| `oral_tradition` | Living cultural practice, as practitioners tell it | 1 × S4 | ✅ yes, labelled as tradition |
| `disputed` | Credible sources disagree | 2 × S1–S3 **on opposing sides** | ✅ yes, labelled as disputed, both sides shown |
| `hypothesis` | A reasoned conjecture, not attested | 1 × S2/S5 + explicit hedge | ⚠️ only in a research note |
| `unsupported` | Asserted, no evidence found | none | ❌ **no** |

**Uncertainty is not optional metadata.** A `documented` claim that the available sources do not actually settle must be classed `disputed` or `hypothesis`, not `documented` with a soft wording.

## 5. Corroboration and independence (GUS-029, GUS-030)

**Quantity is not independence.** Five websites repeating the same unsourced assertion is one assertion, not five. Independence is judged by the *evidence chain*, not the number of URLs.

Two sources are **independent** when they do not derive from one another — i.e. neither cites, quotes, nor reproduces the other. Sources that share an upstream reference count as **one**.

The editorial test, to be applied by a human:

> "If this source were deleted, would the other still say the same thing?"

If no, they are one source, not two.

**Practical rule:** a claim with a `documented` class may rest on a single source. A claim with a `disputed` class requires at least two **independent** S1–S3 sources representing the competing positions. A `documented` origin claim with an S6-only basis must be downgraded to `hypothesis` or `unsupported`.

## 6. Verification states (GUS-032)

A claim moves through:

```
draft → research_pending → under_review → verified → published
                                      ↘        ↘
                                    disputed  needs_revision
```

| State | Meaning | Visible to readers? |
|---|---|---|
| `draft` | Being written | No |
| `research_pending` | Awaiting evidence | No |
| `under_review` | With a moderator | No |
| `verified` | Evidence meets this policy's bar | Yes, with sources |
| `disputed` | Sources conflict | Yes, **with both sides** |
| `published` | Live and verified | Yes |
| `needs_revision` | Published, but evidence has since degraded (dead link, retraction) | Yes, with a notice |

`needs_revision` is the state that prevents rot: a published claim whose source disappears must be visible as degraded, not silently retained.

## 7. Rules that apply to the live catalog today

Stated as testable rules, so the eventual implementation has something to enforce.

| # | Rule | Applies to |
|---|---|---|
| R1 | No description sentence may be published without at least one claim row carrying a source. | all dishes |
| R2 | An origin claim requires ≥1 non-S6 source (S1–S3, S5). | all origin claims |
| R3 | A disputed claim requires ≥2 independent sources on opposing sides. | disputes |
| R4 | A description may not mix classes without labelling them — e.g. a `documented` origin inside a sentence whose other assertions are `hypothesis`. | all descriptions |
| R5 | Wikipedia may be cited, but never as the sole source for R2/R3 claims. | all claims |
| R6 | Every source records: type, authors, title, publisher, year, URL **or** identifier (ISBN/DOI/ISBN), language, and access date. | all sources |
| R7 | A source that has been fetched is recorded with a locator (page, section, paragraph) and, where licensing allows, an excerpt. | all citations |
| R8 | A claim's verification date is recorded, and claims go stale after a defined interval (proposed: 24 months) → `needs_revision`. | all claims |
| R9 | `kitchen-tested` is set only by a human, never by an agent, never by inference. | recipe fields |
| R10 | An AI-generated image is labelled as an illustration and is **never** cited as evidence for a culinary claim. | media |
| R11 | A deleted or retracted source triggers re-review of every claim that depends on it. | sources |

## 8. How this policy interacts with the current state

The live catalog violates R1 and R5 for **121/121 dishes**. That is the honest reading: today, every dish's single claim is a whole-dish Wikipedia description.

### 8.1 What "121 Wikipedia-only" actually means for migration

Not "121 dishes need research." Each dish currently has **one citation whose `claim_text` is the dish's short description**. When `claims` are introduced (ADR-001 §2.4), each of those becomes:

- one claim row per *assertable fact* inside that description — which for a typical Wikipedia short description is 2–5 facts (what it is, what it is made of, how it is cooked, where it is from, sometimes when);
- the single Wikipedia citation becomes the citation for the `documented`-class facts **and is insufficient for the origin fact** under R2.

So the migration yields roughly **300–500 claim rows** from 121 citations, of which roughly **121 are origin claims** that immediately fail R2 and must be either (a) researched, (b) downgraded to `hypothesis`/`unsupported`, or (c) reclassified where the origin is not actually contested.

### 8.2 Priority order for the three reference dishes

| Dish | Claims to write | The hard one |
|---|---|---|
| `rendang` | origin (West Sumatra / Minangkabau), technique (slow-cooked in coconut milk), ingredients, name etymology | The **Minangkabau–Padang vs. other West Sumatran** variation needs variant rows (ADR-001) + S2/S3 sources |
| `chicken-tikka-masala` | the Glasgow dispute, technique, ingredient set | **The dispute itself** — needs two independent S1–S3 sources on opposing sides, or `disputed` |
| `tacos-al-pastor` | origin (Mexico), technique (vertical spit, from *shawarma*), the Lebanese→Mexican transmission | The transmission claim needs S1–S3; `dish_relations` has zero rows today |

## 9. Editorial workflow

1. **Claim extraction.** Break a draft description into assertable facts. Each becomes a claim row with a predicate and an object.
2. **Classification.** Assign a `claim_class`. Disagreement is a signal, not a failure — class it `disputed`.
3. **Evidence gathering.** Find sources per class. Wikipedia is a *starting point*: follow its references to the underlying source, and cite that.
4. **Independence check.** Apply the §5 test to every candidate pair.
5. **Verification.** A human moderator checks the evidence against the class bar and sets the verification state.
6. **Publication.** A dish publishes only if every claim in its public description is at `verified` or `disputed` (with both sides shown). Claims still in `research_pending` are simply not in the public description yet.
7. **Revalidation.** On a schedule (GUS-036) and on source death (R11), re-check; degrade to `needs_revision` if it fails.

## 10. What an agent (Hermes) may and may not do

Explicit, because RULES.md already forbids the worst of it and this policy should make the boundary mechanical.

**May:**
- discover candidate sources, fetch them, and record URL + access date + locator;
- propose a claim, a class, and the evidence that supports it;
- classify a claim as `disputed` when sources conflict;
- flag claims that fail the policy's bar.

**May not:**
- cite a source it has not fetched;
- publish a claim at `verified` — verification state changes are human-only;
- set `kitchen-tested`;
- publish an `unsupported` or `hypothesis` claim in a public description;
- present an S6 source as the evidence for an R2 origin claim;
- infer a date, a person, or a place that no source states.

## 11. Open questions for Alejandro

1. **Staleness interval** — 24 months proposed (R8). Shorter for `disputed` claims, which should be re-checked when new scholarship appears rather than on a clock?
2. **Does an S4 (practitioner/oral) source ever support an origin claim?** The policy says no (memory is not a record). But for a dish that genuinely originates in a living community, practitioner testimony may be the *best* available evidence. Options: (a) never, (b) allowed only when combined with one S2/S3 source, (c) allowed with an explicit "attested by practitioners, no documentary record" label.
3. **Granularity** — one claim per sentence, or per assertable fact? ADR-001 §5.6 raises this; it determines how much work "how much of this dish is evidenced?" costs.
4. **Does the short description need to become claim-backed, or only the long description?** R1 as written applies to both. The 121 live dishes all have a short description and 0 have a long one — enforcing R1 on short descriptions means every dish's homepage card is unverifiable until researched.
5. **Minimum bar for `published`** — every claim verified, or a percentage? The strict version (all claims) means most dishes cannot publish during the transition.
6. **Does `disputed` need to be prominent?** A disputed origin shown only in a collapsed "sources" panel is still a published claim, just quieter.

## 12. Traceability

| ROADMAP / task | Covered by |
|---|---|
| ROADMAP §5 source hierarchy | §3 |
| GUS-026 reliable sources, evidence types, verification, uncertainty | §3, §4, §6, §7 |
| GUS-027 structured source registry | §7 R6 (fields the registry must record) |
| GUS-028 claim-level citations | §7 R1, R7 + ADR-001 §2.4 |
| GUS-029 independent corroboration | §5 |
| GUS-030 source quality vs quantity | §3 classes + §5 |
| GUS-031 claim classifications | §4 |
| GUS-032 verification states | §6 |
| GUS-033 claim-level review history | §6 states + R8 |
| GUS-035 corrections & disputes | §4 `disputed` + §6 `needs_revision` |
| GUS-036 periodic revalidation | §7 R8, R11 |
| GUS-037 research-assistance pipeline | §10 (agent boundaries) |
| ROADMAP §5 "Glasgow test case" | §8.2, ADR-001 §3.2 |
| RULES.md "never invent citations / Wikipedia never sole source for contested claim" | §3.1, §10 |
| RULES.md "kitchen-tested only by a human" | §7 R9, §10 |
