# ADR-004 — The shared culinary atlas: amendments to ADR-001/002/003

**Status:** 🟡 PROPOSED — schema work begins in P1; this ADR is the authority for it.
**Rule:** `decided-by: hermes` for every schema choice recorded here, with the
reason. Anything that needs Alejandro's authority is listed in §12 and is NOT
assumed.
**Extends:** `docs/ADR-001-dish-persistence.md`,
`docs/ADR-002-directus-admin.md`, `docs/ADR-002-spike-findings.md`, and
ADR-003's three layer reports.
**Brief:** `docs/briefs/atlas-restructure.md` (D1–D8).
**Baseline:** `docs/briefs/atlas-baseline.md`.

---

## 0. What this ADR is for

ADR-001 decided how a dish is persisted. ADR-002 decided the claims model.
ADR-003 decided the multilingual layers. The atlas brief asks for a **fourth
layer**: a model in which *places & traditions*, *food families* and *history &
connections* stay three separate things, everywhere — in storage, in the API,
in the editor, in search, on the maps, and in what the public is shown.

This ADR records **what changes** as a result. It does **not** restate what
already works, and it does **not** remove any legacy field (removal is a
separate, later project — the brief's §2).

### The rule that decides every ambiguous case

> **Association is not ownership. Shared heritage is not shared invention.
> Similarity is not descent. Earliest documentation is not birthplace.
> Modern borders do not define historical culinary geography.
> Uncertainty is data.**

When two readings are defensible, the one that claims **less** wins. When a
claim cannot be supported, the record stays `unevidenced` and the interface
says so. A confident-sounding wrong statement is worse than an honest gap.

---

## 1. The baseline this ADR starts from

The live schema is **further along** than the brief assumes, and the brief's
proposed field names do not all exist. The measurements are in
`docs/briefs/atlas-baseline.md`; the ones that matter here:

| | |
|---|---:|
| published dishes | 1,474 |
| `statements` | 1,354 (all `research_pending`, **0 published**) |
| `claim_citations` | 1,354 (all `excerpt_validated = true`) |
| `dish_relations` | 96 |
| `dish_dish_cuisines` | 1,471 |
| `dish_dish_traditions` | **10** |
| `food_regions` / `dish_regions` / `dish_locations` | **0 / 0 / 0** |
| `geo_entities` | 3,892 (302 typed `country`, 3,590 typed `region`) |

**The single most important fact:** the public API does not read the claims
model. 1,354 sourced statements exist and none of them reaches a visitor.
Until D8 lands, adding statements changes nothing a visitor can see.

---

## 2. D1 — Cuisine and tradition become associations

### D1.1 What changes

`cuisine` and `tradition` are ADR-001 dimensions that describe **where and
with whom**, not food classification. They become **typed associations** on
the dish, each one carrying a relationship type, an explanation, citations,
qualifiers, provenance and a review state.

The existing `dish_dish_cuisines` and `dish_dish_traditions` join tables are
**kept** (legacy fields are not removed) but are **no longer the source of
truth** for "where is this dish from". The new association rows are.

### D1.2 The relationship types

Exactly the brief's six, and no others:

| type | meaning |
|---|---|
| `historical_emergence` | where the dish is understood to have emerged |
| `established_tradition` | a culinary tradition the dish is established within |
| `regional_adaptation` | a local adaptation of the dish |
| `later_introduction` | where the dish arrived later, by spread or migration |
| `earliest_documentation` | where the earliest surviving record is |
| `legacy_unreviewed` | **migration only** — a legacy value not yet reviewed |

`legacy_unreviewed` exists so that a backfill never has to guess. It is
never created by the editor.

### D1.3 The `food_regions` / `dish_regions` problem — **a decision**

`food_regions` and `dish_regions` already exist with the **wrong** enum:

```
dish_regions.relationship_type CHECK IN
  ('origin','core_region','variation_region','popularity_region',
   'diaspora_region','disputed_origin','ingredient_origin','historical_spread')
```

The brief's six are a **different** set. Two options:

- **(a)** Widen the existing CHECK to include the new values. One table, two
  vocabularies, a `legacy_unreviewed` value to carry the old ones.
- **(b)** Add a new table with the brief's semantics and leave the old one
  alone.

**Decision: (b) — a new table `dish_place_associations`.**

Reasons, in order:

1. **`food_regions` has never been populated** — 0 rows. There is no data to
   preserve and no reader to break. It is an empty scaffold, not a live
   structure. Reusing an empty table with the wrong CHECK constraint would
   mean shipping a schema whose constraint does not match its name.
2. **The entity model differs.** `food_regions` is a self-referencing tree
   (`parent_region_id`) with a `type` enum (`culinary`, `cultural`,
   `geographic`, `historical`, `diaspora`, `trade_route`, `ingredient_zone`)
   and a mandatory `geojson_path`. The brief needs to point at *modern
   places* (`geo_entities` — 3,892 rows, already populated), *historical
   regions* and *communities/traditions* — which are three different kinds
   of thing, and `geo_entities` already models the first two. Forcing
   communities into `food_regions` would need a `geojson_path` for something
   that has no geometry.
3. **The legacy CHECK is a published meaning.** `dish_regions` was never
   public (0 rows, no reader), but the constraint text is a statement about
   what those values mean. A new table lets both vocabularies coexist
   without one silently meaning the other.

**The entity reference is polymorphic**, so one table can point at a modern
place, a historical region, or a community:

```
dish_place_associations
  id                uuid
  dish_id           uuid  → dishes(id)
  relationship_type text  (the six above)
  entity_kind       text  ('place' | 'community')
  entity_id         uuid  → geo_entities(id)  or  dish_traditions(id)
  explanation       text
  qualifiers        jsonb
  provenance        text
  evidence_status   text  (the six values in §4)
  review_state      text
  publication_state text
  created_at / updated_at
```

A `CHECK` enforces the valid combinations, and a trigger enforces that
`entity_kind='community'` cannot point at a `geo_entities` row and vice
versa. The brief's §5 D3 "define valid entity combinations and enforce them
server-side" is satisfied here.

### D1.4 Communities and traditions are separate

A **community** (a people: Ainu, Sami, Arab, Levantine) is not a **tradition**
(a culinary practice: Maghrebi, Levantine, Peranakan). `dish_traditions` has
380 distinct values and 433 rows today, and `vocabulary_labels` translates
380 of them — so traditions are real, well-populated vocabulary. Communities
are not in the vocabulary at all.

**Decision:** communities are **entities**, stored in `geo_entities` with
`entity_type='community'`, and the association points at them. Traditions
stay in `dish_traditions` and are reached through
`established_tradition` associations to a community, or through the existing
`part_of_tradition` predicate.

**A community is a group of people, not a place.** It gets no geometry and
no ISO code. The place it lives in is a separate, optional association —
never implied.

### D1.5 Mapping legacy memberships

| legacy | → | rule |
|---|---|---|
| `dish_dish_cuisines` | `established_tradition` | where the cuisine has a matching tradition row; otherwise `legacy_unreviewed` |
| `dish_dish_traditions` | `established_tradition` | direct, preserving provenance and publication state |
| `dishes.origin_geo_id` | `historical_emergence` | **only** where a qualifying source already supports that specific historical claim |
| `dishes.origin_geo_id` (no such source) | `legacy_unreviewed`, evidence `unevidenced` | the Wikidata-discovered value stays **S6 discovery data** — it is recorded as the *original value* and its provenance, not as a finding |

The brief's §11 defaults are adopted verbatim:

- Wikidata-discovered "country of origin" (Pool A) stays S6 discovery data
  unless independently supported.
- Legacy origin → `legacy_unreviewed`, evidence `unevidenced`, original value
  and provenance preserved.
- Public wording: **"Associated with …"**.
- Upgrade only when a qualifying source already supports that specific
  historical claim.

**The 1,475 `dishes.origin_geo_id` values will therefore NOT become
`historical_emergence` claims.** They become `legacy_unreviewed`
associations. That is the honest reading of the brief, and it is the change
that makes the falafel page truthful: "Associated with Israel (unreviewed)"
rather than "Origin Israel".

### D1.6 Published URLs

`/regions` stays and is relabelled **"Places"** in the UI while keeping its
path (the brief allows "keep `/regions` (labelled 'Places')"). The old
`/lineages/*` URLs become `/connections/*` with a **301**. Astro's static
output needs a `redirects` map in `astro.config.mjs`; there is currently no
redirect machinery at all (baseline §2), so this is new work.

---

## 3. D2 — The remaining classification dimensions

### D3.1 (sic — D2) The five dimensions

| dimension | covers | table |
|---|---|---|
| `family` | form | `dish_families` + `dish_dish_families` |
| `technique` | preparation | `dish_techniques` + `dish_dish_techniques` |
| `course` | culinary role | `dish_courses` + `dish_dish_courses` |
| `ingredient_category` | principal ingredient | `ingredient_categories` + `dish_dish_ingredient_categories` |
| `context` | where appropriate | `dish_contexts` + `dish_dish_contexts` |

All five exist and are populated. **No new dimension is added.** The brief's
§5 D2 says "Don't add dimensions to mirror this brief's wording" — and the
stress set's `composed of` and `legal status` demands (§11 below) are
**not** adopted here, for reasons given in §9.

### D2.2 Parent links

`dish_families.parent_id` already exists, self-referencing. **Decision:**
keep it, and add a **cycle-prevention trigger** — a recursive check on
insert/update that rejects a parent chain that would close a loop. The
constraint is server-side, per the brief's §5 D3.

### D2.3 The legacy `categories` table

`categories` (152 rows, `kind` ∈ `dish-type` | `family` | `cuisine` |
`course-group`) and `dish_categories` (339 rows) are the **legacy**
classification path. The homepage's "22 families" counts `kind='dish-type'`
slugs — which is why the number is wrong.

**Decision:** the new dimension tables become the source of truth for
classification. `categories` keeps its rows and its readers until the
removal project. The homepage switches to the dimension tables and its
counts are **defined explicitly** (see §8).

---

## 4. D4 — Evidence, disagreement and publication are separate

This is the ADR's most consequential decision, because the brief's field
names do not exist in the live schema.

### D4.1 What exists today

| column | table | values | what it really means |
|---|---|---|---|
| `status` | `statements` | `draft`, `research_pending`, `under_review`, `verified`, `published`, `disputed`, `needs_revision` | **publication/moderation** state, enforced by `statement_set_status()` |
| `claim_class` | `statements` | `documented`, `scholarly_interpretation`, `oral_tradition`, `disputed`, `hypothesis`, `unsupported` | **epistemic kind** of the claim |
| `independence` | `statements` | `single`, `corroborated`, `dependent`, or NULL | ADR-002 Q8; NULL = "not assessed", which is *not* "single" |

There is **no** column that means "how well is this evidenced" in the sense
the brief's four values describe. `verification_state` is publication state.

### D4.2 The decision — three separate fields, not one

**Decision: add three columns to `statements`, and add one to the new
association table. Do not overload `status` and do not touch `claim_class`'s
meanings.**

```sql
ALTER TABLE statements
  ADD COLUMN evidence_status text NOT NULL DEFAULT 'unevidenced',
  ADD COLUMN dispute_state    text,
  ADD COLUMN research_outcome text;

-- and, on dish_place_associations:
--   evidence_status text NOT NULL DEFAULT 'unevidenced'
```

| field | values | meaning |
|---|---|---|
| `evidence_status` | `unevidenced` | not yet researched |
| | `research_pending` | queued |
| | `provisional` | proposed |
| | `evidenced` | qualifying non-Wikipedia sources attached |
| `dispute_state` | `null` | no competing account is recorded |
| | `disputed` | competing sourced accounts exist |
| | `unresolved` | researched, answer genuinely unknown |
| `research_outcome` | `null` | no research recorded |
| | `completed` | research done, answer found |
| | `inconclusive` | researched, answer genuinely unknown |

**Why not one overloaded field:** the brief is explicit — "Prefer separate
dispute and research-outcome fields over overloading the evidence status."
Three columns make the three axes queryable, make the public badge logic
trivially correct, and make a later migration of one axis independent of the
others.

**Why `claim_class` is not reused:** its values already carry meaning
(`documented` = a source states it; `hypothesis` = a proposal; `unsupported`
= nothing backs it). Overwriting those would destroy ADR-002's semantics.
`claim_class` and `evidence_status` are **independent axes**: a claim can be
`claim_class='documented'` and `evidence_status='evidenced'`, or
`claim_class='documented'` with `evidence_status='unevidenced'` (the source
was found but is not qualifying), or `claim_class='hypothesis'` with
`evidence_status='provisional'`.

**`evidenced` is a project state, not proof.** It means qualifying
non-Wikipedia sources are attached. It does not mean uncontested — that is
`dispute_state`.

### D4.3 The `disputed` collision

`verification_state` already has a `disputed` value, and `claim_class` already
has one. The new `dispute_state` is a **third**, separate concept.

**Decision:** the new field is named `dispute_state` (not `status`, not
`disputed`) precisely so that it cannot be confused with the other two. The
migration does **not** change `verification_state` or `claim_class`. When
the `dispute_state` is set, the public presentation shows it as a **badge**,
never as a replacement of the publication state.

### D4.4 Publication stays distinct

`status` (publication/moderation) is untouched. The existing mechanical gate
stays untouched:

- `statement_set_status()` refuses a `verified` transition by `hermes-agent`.
- `statements_status_gate_trg` refuses a direct `UPDATE` of `status`.

**No competing account is marked canonical.** A multi-place dish is **not**
automatically disputed — it is only `disputed` when there are **two or more
competing sourced accounts** for the same claim.

### D4.5 The badge vocabulary, in plain language

| badge | plain text on the page |
|---|---|
| `evidence_status='evidenced'` | "Sourced" — with the sources linked |
| `evidence_status='research_pending'` | "Research in progress" |
| `evidence_status='provisional'` | "Proposed — not yet checked" |
| `evidence_status='unevidenced'` | "Not yet researched" |
| `dispute_state='disputed'` | "Accounts differ" — and **both** are shown |
| `dispute_state='unresolved'` | "Unresolved — the sources do not settle it" |
| `claim_class='oral_tradition'` | "From oral tradition" |
| `claim_class='hypothesis'` | "Hypothesis" |

No numerical confidence scores. **None.** The brief forbids them and the
existing `confidence` integer columns (`food_regions.confidence`,
`dish_regions.confidence`, `dish_locations.confidence`) are **not** carried
into the new association table. `dish_relations.strength` (an integer 1–5)
stays on the legacy table and is not exposed publicly.

---

## 5. D5 — Typed dish connections

### D5.1 The predicates

The brief's eight, mapped onto the existing `relation_types` table:

**Historical (directional):**

| brief predicate | existing `relation_types` row | action |
|---|---|---|
| `developed_from` | — | **new row** |
| `adapted_from` | — | **new row** |
| `influenced_by` | — | **new row** |
| `regional_variant_of` | — | **new row** |
| `connection_proposed` | — | **new row**, with `direction_known` |

**Resemblance (symmetric):**

| brief predicate | existing `relation_types` row | action |
|---|---|---|
| `similar_form` | `regional-cousin` | **rename**, keep the row |
| `similar_technique` | `shared-method` | **rename**, keep the row |
| `often_compared_with` | — | **new row** |

The existing rows `ancestor`, `diaspora` and `family` are **kept** and
remain readable; they are not in the brief's list and they carry real
editorial meaning. `ancestor` in particular already documents its direction
("DIRECTIONAL: from_dish_id is the documented ancestor of to_dish_id").

### D5.2 The direction convention — stated once, used everywhere

> **source = predecessor / influence / broader dish.
> target = derived / influenced / variant dish.
> An `adapted_from` edge means "target was adapted from source".**

This is the brief's convention and it is kept exactly. It is documented in
four places, because it is the kind of convention that drifts:

1. the column comments in `packages/db/src/schema/index.ts`,
2. the API response documentation (`apps/api/src/routes/dishes.ts`),
3. the editor's helper text,
4. the **tests** — which assert the rendered public sentence, not just the
   stored edge.

The public sentence for `adapted_from` is therefore
**"… was adapted from …"**, with the *target* first. A test asserts that
the sentence and the stored edge agree, so an inversion fails the build.

### D5.3 `connection_proposed` and unknown direction

`connection_proposed` carries a `direction_known boolean NOT NULL DEFAULT false`.
**When `direction_known` is false, no arrow is rendered anywhere** — not in
the dish page, not in the graph, not in the API's `direction` field. The
public sentence is unordered: "… and … are connected in an undocumented
direction."

### D5.4 The constraints

| rule | enforcement |
|---|---|
| no self-links | existing `dish_relations_no_self_check`; carried to the new table |
| no duplicate under the statement identity | unique on normalized `(from, to, relation_type)` |
| no reversed duplicates for symmetric pairs | a **normalized-endpoints** unique index: `LEAST(from,to), GREATEST(from,to)` for symmetric types only, so a reversed pair cannot be inserted |
| no cycles in `regional_variant_of` | a recursive trigger, like the `dish_families.parent_id` cycle check |
| no self-links and no cycles across **all** historical predicates | the trigger covers the set |

**The symmetric normalization is the key detail.** For a symmetric predicate,
the pair is stored once with `LEAST`/`GREATEST` endpoints, and the **pair
identity** is the unordered set. A unique index over
`(least(from,to), greatest(from,to), relation_type)` therefore rejects both
`(A,B)` and `(B,A)` — which is what "store each pair once with normalized
endpoints" requires. For a directional predicate the index is over the
ordered pair, so `(A,B)` and `(B,A)` are two different claims and both are
legitimate.

### D5.5 The influence network is not a tree

**No uniqueness constraint may discard legitimate parallel claims or
citations.** The unique indexes are on the **edge identity** only — never on
`(from, to)` alone. Two different predicates between the same pair are two
edges. Two `influenced_by` edges from the same source to the same target with
different citations are **one edge with two citations**, which lives in
`claim_citations`, not in a second edge.

### D5.6 Where the connection data lives

`dish_relations` has 96 rows and is read by `GET /api/dishes/:slug/relations`.
It stays. **Decision:** the new typed predicates go into the **same table**,
because:

- the table already has `relation_type_id` (FK to `relation_types`),
  `is_symmetric`, `status`, and a `check_relation_direction()` trigger;
- the brief says the influence network is not a tree, which argues for one
  edge table with typed predicates rather than several;
- a second table would mean two readers for the same question.

The brief's `regional_variant_of` cycle rule is added on top.

---

## 6. D6 — Dates qualify specific claims

### D6.1 The four dates, kept distinct

| date | meaning |
|---|---|
| surviving-record date | the date of the earliest surviving record |
| proposed emergence period | a period, not a point |
| introduction date | when the dish arrived somewhere else |
| adaptation date | when a local adaptation was made |

### D6.2 The decision — a date table, not four columns

**Decision: add `claim_dates`**, one row per dated claim, rather than adding
columns to `statements` or `dishes`.

```sql
CREATE TABLE claim_dates (
  id             uuid primary key default uuid_generate_v4(),
  statement_id   uuid REFERENCES statements(id) ON DELETE CASCADE,
  dish_id        uuid REFERENCES dishes(id) ON DELETE CASCADE,
  date_kind      text NOT NULL,   -- 'surviving_record' | 'proposed_emergence'
                               -- | 'introduction' | 'adaptation'
  -- the machine-readable value
  year_start     integer,         -- inclusive
  year_end       integer,         -- inclusive; NULL = open-ended
  precision      text,            -- 'exact' | 'approximate' | 'bounded' | 'open'
  -- the human-readable expression
  date_text      text NOT NULL,    -- 'before the thirteenth century'
  place_id       uuid REFERENCES geo_entities(id),  -- optional qualifier
  created_at     timestamptz NOT NULL DEFAULT now()
);
```

**Why a table and not columns:**

- **"before the thirteenth century" has no year.** It is an *open* interval
  with no start. `year_start INTEGER` can hold NULL, but the brief requires
  **a machine-readable value plus a human-readable expression** — and the
  human expression is not derivable from the machine value. ("c. 1800",
  "before 1200", "1800–1850" and "the 19th century" are four different
  shapes.) One `date_text` column on `statements` would only ever hold one
  date per claim, and a claim can have several.
- **Interval ordering must be validated.** `year_start <= year_end` is a
  `CHECK`; "open-ended" is `year_end IS NULL`; "approximate" is
  `precision='approximate'`. All three are checkable in one table.
- **A date qualifies a specific claim**, not a dish. The brief's D6 opens
  "Dates qualify specific claims". A date attached to the dish row would be
  attached to the wrong thing.

### D6.3 The legacy integer years

`dishes.origin_date_earliest` / `origin_date_latest` (8 dishes have them) are
**kept** and **not** silently promoted. A backfill may copy them into
`claim_dates` with `precision='approximate'`, `date_kind='proposed_emergence'`,
and `date_text` built from the same two integers — but only where a
`statement` already exists to qualify, and the legacy columns stay as they
are.

**The rule the brief states, made mechanical:** a human-readable expression
is **never** parsed into an invented year. If `date_text` says "before the
thirteenth century", `year_start` stays NULL. If it says "c. 1800",
`year_start = 1800` and `precision = 'approximate'`.

---

## 7. D7 — Stable dish identity

### D7.1 The four kinds

| kind | meaning |
|---|---|
| shared dish | one preparation, one row, many places |
| regional variant | a named local form of a shared dish |
| historically related dish | related by documented history, not identity |
| alias / translation / transliteration | a different name for the same thing |

### D7.2 The decision — `dish_identities` and `dish_name_relations`

**Two additions, both small:**

```sql
-- how two dish rows relate
CREATE TABLE dish_identities (
  id          uuid primary key default uuid_generate_v4(),
  from_dish_id uuid REFERENCES dishes(id) ON DELETE CASCADE,
  to_dish_id   uuid REFERENCES dishes(id) ON DELETE CASCADE,
  identity_kind text NOT NULL,  -- 'shared_dish' | 'regional_variant'
                              -- | 'historically_related'
  explanation  text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (from_dish_id, to_dish_id, identity_kind)
);

-- how two names relate (alias / translation / transliteration)
CREATE TABLE dish_name_relations (
  id           uuid primary key default uuid_generate_v4(),
  from_dish_id uuid REFERENCES dishes(id) ON DELETE CASCADE,
  to_dish_id   uuid REFERENCES dishes(id) ON DELETE CASCADE,
  relation_kind text NOT NULL, -- 'alias' | 'translation' | 'transliteration'
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (from_dish_id, to_dish_id, relation_kind)
);
```

**Decision rationale:**

- **`dish_names` already exists** (2,849 names, 37 languages, `script`,
  `endonym`/`exonym`) and already distinguishes a translation from a
  transliteration. It is **not** modified. What it lacks is the link
  *between two dish rows* when the same name denotes two dishes — which is
  the `biscuit` case in the stress set (the US soft biscuit and the British
  hard biscuit are two dishes).
- **`dish_variants` already exists** (1 row) with `parent_dish_id` and a
  `region_geo_id`. It expresses "this row is a variant of that row". The
  new `dish_identities` table expresses the **broader** relationship
  (shared preparation, historically related) with an explanation, and the
  variant case is a `regional_variant` row in it. `dish_variants` is kept.

### D7.3 The rules

- **Never merge by name.** Two dishes with the same name are two rows until
  an editor resolves them.
- **Never split by national association.** A dish associated with five
  places is one dish with five associations, not five dishes.
- **Identifiers are preserved until editorial review resolves identity.** The
  `dishes.id` and `dishes.slug` are stable; a resolution records a
  `dish_identities` row rather than deleting a dish.

---

## 8. D8 — Published statements define public behaviour

### D8.1 The rule

> **Public APIs, search, rendering, counts and caches consistently respect
> statement publication state. One disputed claim does not suppress unrelated
> published claims. No draft or private editorial data leaks through search,
> metadata, graph endpoints, counts or cached responses.**

### D8.2 The decision — one predicate, used everywhere

**Decision: a single SQL function is the only thing that decides what the
public may see.**

```sql
CREATE FUNCTION public.published_claims_for_dish(p_dish_id uuid)
RETURNS SETOF statements ...
-- WHERE status = 'published' AND subject_type='dish' AND subject_id = p_dish_id
```

Every public read path — the API, the search index, the counts, the map
payload, the graph endpoint, the sitemap, the SSG build — goes through this
function or through an equivalent predicate written from the same
definition. It is **one definition**, so a claim cannot be public on one
surface and draft on another.

The test for this is the **contract test**: the API's dish response, the
search result and the count must agree on exactly which claims are visible.

### D8.3 One disputed claim does not suppress anything

The filter is **per statement**, never per dish. A dish with one published
claim and one disputed claim shows the published one normally and the
disputed one with its badge. A dish whose *only* claim is a draft shows no
claim section — and the page says so, rather than showing an empty section.

### D8.4 Caches

The SSG build and the API's response cache key on the **publication state**,
so a publish invalidates. The count endpoints are computed from the same
predicate.

### D8.5 The legacy path stays public until it is not

**This is the part that makes D8 hard, and it must be stated plainly:**

Today the public API reads `dishes.origin_geo_id`, `dish_dish_*` and legacy
`dish_categories`. It does **not** read `statements` at all. So D8 has two
halves:

1. **Publish the claims.** The 1,354 statements are `research_pending`. They
   become `published` only through `statement_set_status()`, and **only a
   Reviewer can do that** — `hermes-agent` is mechanically refused
   (`statement_set_status()` refuses a `verified` transition by
   `hermes-agent`).
2. **Make the public read the claims**, and keep the legacy path for
   anything not yet expressed as a claim.

**Decision:** during the transition, the public dish page shows **both** —
the published claims (new, typed, sourced) and the legacy fields (old) —
with the legacy ones labelled as legacy where they carry a meaning the
claims do not yet cover. When the claims cover a field, the claim wins.
The legacy field is removed from the public response only when **every**
dish's value for it has an equivalent published claim.

### D8.6 The counting rule

The brief's homepage requirement: "unique dishes are counted independently of
associations."

**Decision:** every count in the public interface is a count over
**distinct dishes**, computed with `COUNT(DISTINCT dish_id)`. The homepage's
four numbers become:

| shown | definition | source |
|---|---|---|
| **dishes** | distinct published dishes | `COUNT(DISTINCT d.id)` |
| **places** | distinct places with ≥1 published association | `COUNT(DISTINCT entity_id)` |
| **food families** | distinct families in use | `COUNT(DISTINCT value_id)` from `dish_dish_families` |
| **connections** | distinct typed connections between published dishes | `COUNT(DISTINCT (from,to))` |

**"origins" is retired** — it was a count of `origin_geo.name` over
published dishes, which is neither a place count nor a tradition count, and
42 of its 178 values are not countries (baseline §5a). It is replaced by
**"places"**, counted from the association table.

**"lineages" is retired** — it counted distinct `methodSlug` (a technique)
while `GET /api/lineages` returns 14. It is replaced by **"connections"**,
counted from the typed connections.

**"families" is corrected** — it counted distinct `kind='dish-type'` slugs
(22) instead of the families actually in use (124 distinct
`dish_families`). It is counted from `dish_dish_families`.

---

## 9. What this ADR does NOT adopt, and why

The brief's §5 D2 says "Don't add dimensions to mirror this brief's wording."
Three demands from the stress set are therefore **recorded and declined**,
with the reason, rather than quietly ignored:

| demand | source | decision |
|---|---|---|
| a `composed of` dimension (a dish is a set of dishes) | stress set: thali, rijsttafel, banchan, nasi campur, potjiekos | **declined for now.** A meal-of-dishes is a *meal*, not a dish. The existing `family` + `context` + `part_of_tradition` cover the acceptance cases; the ones that do not fit are better represented as a tradition or a statement qualifier than as a new dimension. Recorded as a possible later project. |
| a `legal status` dimension (per jurisdiction) | stress set: casu martzu, balut, surströmming, sannakji | **declined.** Legal status is a fact about a jurisdiction, not about a dish, and it changes without the dish changing. It belongs in a statement with a `period` qualifier and a place qualifier. |
| an `Entomophagy` / `Insect food` family | stress set: escamoles | **declined as a vocabulary change in this project.** A single dish does not justify a family value; the family vocabulary is the wrong place for a taxonomic fact. The dish's family can be `appetizer` until an editor decides otherwise. |

**Nothing here forecloses those decisions.** They are recorded so a future
editor sees the reasoning rather than re-deriving it.

---

## 10. The public wording rules

| instead of | the site says |
|---|---|
| "Origin: Israel" | "Associated with Israel" |
| "Country of origin" | "Place" / "Places" |
| "Lineages" | "History & connections" |
| "Countries" (nav and page title) | "Places" |
| "born in", "came from" | "associated with", "documented in" |
| a flag alone | the place name, with the flag as decoration only |
| a confidence percentage | the evidence badge in plain words |

**The banner rule:** "Associated with" for every association that is not a
specific historical emergence claim. A dish with several places shows all of
them; none is presented as *the* origin.

---

## 11. The migration order

Additive, in this order, each step reversible and independently verifiable:

| # | step | reversible |
|---|---|---|
| 1 | `statement` evidence/dispute/research columns (D4) | yes — `DROP COLUMN` |
| 2 | `claim_dates` (D6) | yes — `DROP TABLE` |
| 3 | `dish_place_associations` + entity-kind trigger (D1/D3) | yes — `DROP TABLE` |
| 4 | `relation_types` additions and renames (D5) | yes — the renames are reversible; the new rows are `INSERT` |
| 5 | `dish_relations` normalized-pair index + cycle trigger (D5) | yes — `DROP INDEX` / `DROP TRIGGER` |
| 6 | `dish_identities` + `dish_name_relations` (D7) | yes — `DROP TABLE` |
| 7 | the backfill (P2) | yes — the tables are truncated and re-run; the backfill is idempotent |
| 8 | the API reads the new tables (P3) | yes — a feature flag / a versioned response |
| 9 | the UI (P4) | yes |

**Every step is additive.** No legacy column is dropped, renamed or retyped in
this project. The brief's §2 says removal is a separate, later project, and
this ADR honours that.

---

## 12. What needs Alejandro's authority

Nothing in P1–P3 is blocked on this list. These are the points where the
brief's own escalation conditions (§16) apply:

| # | item | why it needs him |
|---|---|---|
| 1 | **Publishing the 1,354 statements** | `statement_set_status()` refuses a `verified` transition by `hermes-agent` — the Reviewer is a human. 1,354 statements cannot be published by the agent. |
| 2 | **The `categories.kind` live-schema change** | PR #135 asked for it as "option A"; the migration is idempotent and was approved. Any *further* live schema change that is not purely additive needs a fresh look. |
| 3 | **The `apps/api/.env` `gustale_dev` → real database fix** | the file is gitignored and local-only; changing it is safe, but it changes what the developer's local tests run against. |

Items 1 and 2 are already known and tracked. Item 3 is a local configuration
repair within existing authorization.

### The chain that has to be built before anything is visible

The `verified` gate requires a `claim_class='documented'` statement to carry
a `supports` citation whose `source_class` is in `('S1','S2','S3','S4','S5')`.
The live database has **1,486 sources, every one of them `S6`** — all
Wikipedia. **Zero** qualifying citations exist.

So the chain is:

```
non-Wikipedia source (S1–S5)
  → claim_citations row with stance='supports'
    → statement can reach 'verified'   (gate: the source class)
      → statement can reach 'published' (gate: a human credential)
        → claim is visible in the public API  (D8)
```

**Step 1 is missing for every statement. Step 3 requires Alejandro.**

This is the brief's §12 requirement — "A non-Wikipedia source is necessary but
not sufficient: check that it actually supports the specific claim" — and it
is the single biggest constraint on the project's shape. The engineering
work (P1–P7) can proceed in full: the schema, the API, the UI, the search,
the maps and the moderation flow all get built and verified. What cannot
happen without the research and the human publish step is **1,474 dishes
showing sourced, typed, multi-place associations**.

**The model is therefore demonstrated with isolated fixtures** (the brief's
§12 wording), and the live catalogue keeps its honest `unevidenced` /
`legacy_unreviewed` presentation until the research catches up. Adding
unsupported history to make the interface look complete is exactly what the
brief forbids, and this ADR does not do it.

---

## 13. Verification

Every claim this ADR makes about the existing schema is checked against the
live database, not against this document. The evidence is in
`docs/briefs/atlas-baseline.md`.

The things this ADR **predicts** — that the API will return the right thing
once the claims are published, that the counts will be defined, that the
symmetric-pair constraint rejects a reversed duplicate — are the P1–P3
acceptance criteria, and each one has a test that must fail before the code
that satisfies it is written.

---

## 14. Amendment 1 — the P0–P2 review findings

**Added:** 2026-10-31, after the review of the P0–P2 report.
**decided-by:** hermes.
**Amends:** §4 (D4, publication), §11 (the migration order), §12.

This amendment records five findings from the review and the decisions
taken in response. It is written before any live write, and each change
is additive and idempotent.

### 14.1 The constraint tests must never run against production

**The finding.** The live gate ran `scripts/test_atlas_schema.sql`
against the **live** database. That is how six real associations were
deleted on 2026-10-31: the test's cleanup deleted by DISH, and on live
the fixtures *are* three reference dishes carrying the backfill's
associations.

The gate was corrected to run the tests on a disposable copy. But the
correction lived in a **comment**, and a comment is not a control.

**The decision.** The refusal is now mechanical, in two places:

1. `scripts/test_atlas_schema.sql` declares
   `GUSTALE_PROTECTED_DATABASES: gustale, gustale_prod, gustale_production`
   and **refuses to run** against any of them. The check is the
   database's own name, read from inside the database, so it cannot be
   fooled by a connection string.
2. `scripts/apply-migration-live.sh` reads that list from the test file
   and aborts if its copy's name is in it — so the two cannot drift.

**The live database is verified by READING it.** The counts, the new
objects, and the diff against the snapshot. Never by writing test rows
into it.

### 14.2 The publish credential — a positive, default-deny check

**The finding.** `statement_set_status()` refused the `verified` and
`published` transitions for an actor whose name matched `%agent%` or
`%hermes%`. That is a **negative** check, and a negative check on a name
denies only the names you thought of. `ci-bot`, `nightly` and `kafka`
would all have passed — and a published claim is **visible to the
public**.

**The decision.** The rule is now positive and the default is deny.

A new table `publish_credential` holds the allow-list. A row means: this
**account** holds a human-editor credential.

| `credential_role` | may verify | may publish |
|---|:---:|:---:|
| `editor` | ✅ | — |
| `publisher` | ✅ | ✅ |

There is deliberately **no automated role**. An automated process cannot
be a human editor, and a credential that could be issued to one would be
the same hole with an extra step.

The table starts **EMPTY**, so both transitions are refused for everyone
until a credential is issued deliberately. Opening the gate is an act,
not an omission.

The check runs **before** the evidence gates, not after. An actor
without a credential has no business learning whether an evidence gate is
met, and a refusal that names the *content* rather than the
*credential* reads as an editorial decision rather than an authorisation
failure. The constraint test asserts the refusal message names the
credential, which is what keeps the ordering honest.

### 14.3 The journey places that produced no association are QUEUED

**The finding.** The P2 backfill reads three legacy fields:
`dishes.origin_geo_id`, `dish_dish_cuisines` and `dish_dish_traditions`.
It does **not** read `dish_journey_beats`.

So a place named only in a dish's **journey** produced no association —
and was silently dropped. On live that is **30 of 35 journey beats,
across all 12 dishes that have journey beats**. Every one of the twelve
is affected.

`falafel` is the clearest case. Its journey says the origin is contested
between **Egypt** and the **Levant**; its legacy origin field says
**Israel**. After the backfill it has two associations, both
Israel-linked, and its own journey text — the thing the page shows the
reader above the Origin panel — names three places that produced
nothing.

**The decision.** The journey place is **queued for a reviewer**. Not
assigned, not guessed, not dropped.

A journey beat like `Egypt / Levant` is a **contested** claim with two
places in it, and choosing one would be inventing a claim the brief
forbids. `Levantine cities` is a region with no `geo_entities` row.
`Global` is not a place at all. A reviewer decides, per item.

The new queue category is `journey_place_without_association`. Migration
0039 creates **no association** and decides nothing.

### 14.4 The CI database must hold the acceptance fixtures

**The finding.** The CI database was built from a three-dish seed, so the
backfill produced five associations and `ATLAS_BACKFILL_OK=1` proved
only that migration 0037 **executes**. The tell was in the CI log:
`statements: 0 total` — there was no catalog to backfill. A backfill
that produced **zero** associations would have passed the same gate.

The aggregate assertion could not catch it, and could not in principle:
0037's expected counts are computed from the same legacy tables the
migration reads, so both sides move together.

**The decision.** Two things:

1. A new seed, `packages/db/seed-atlas-references.sql`, seeds the four
   reference dishes — `rendang`, `chicken-tikka-masala`,
   `tacos-al-pastor`, `falafel` — with the exact legacy shape they have
   on live. `chicken-tikka-masala` deliberately carries **no** cuisine
   and **no** tradition, which is what proves the backfill does not
   invent one.
2. A new assertion file, `scripts/test_atlas_backfill.sql`, asserts the
   **exact association rows** — the relationship type, the entity kind,
   the entity and the provenance — not a count. It also carries the
   count-snapshot guard, with **non-zero baselines**: a zero baseline
   would let a backfill that produced nothing pass, which is the failure
   this file exists to catch.

The seed runs **after** the GUS-242 data migrations, because
`dish_dish_cuisines.provenance` is added by `gus-242-schema-prep.sql`.
Seeded before it, the seed fails and — being one transaction — silently
discards the dishes it had already inserted. The per-dish assertions
caught exactly that on the first run.

### 14.5 The migration-order and count facts

These are recorded because they were ambiguous in the report, and an
ambiguous number in a migration chain is a defect waiting to happen.

| # | the question | the answer |
|---|---|---|
| 1 | **1,476 or 1,474 dishes?** | **Both are right, and they count different things.** 1,476 is every row in `dishes`; 1,474 is the rows with `status='published'`. The difference is **one draft** (`yukkuri-shite-itte-ne`, deliberately held) and **one archived**. Neither number is wrong; they answer different questions. Every count in this project must name which one it means. |
| 2 | **Is there a migration numbering gap?** | **In `db/migrations`, no** — 0015…0039 is continuous. The gaps are in the **drizzle** chain: `packages/db/drizzle/` holds **two files numbered 0005** (`0005_food_geography_phase_2a` and `0005_user_role_index`), and `0003`, `0005_food_geography_phase_2a`, `0007`, `0012`, `0013`, `0014` and `0015` are **absent from the drizzle journal** — it records only 10 of the 17 files. The two chains also **share the number 0015** (`db/migrations/0015_gus242_resync.sql` and `packages/db/drizzle/0015_pool_a_batch.sql`). The journal is already known to be drifted, which is why the CI applies the committed files rather than the journal. |
| 3 | **34 tests or 38?** | **34 was the count at commit `dd855ec`; 38 was the count at `7afabb9`.** The four are the guard tests added by `7afabb9` — the count-snapshot cases that assert the test left the associations, the relations, the identities and the dates exactly as it found them. Both numbers were correct for their own commit. The suite is now **47**, with the nine D9 publish-credential cases added. |
| 4 | **"36 migrations" vs "files run to 0037"** | **No gap — the validator counts `db/migrations/*.sql` only.** The "36" was 25 numbered + 11 named (`gus-014-*`, `gus-224-*`, `gus-227-*`, `gus-241-*`, `gus-242-*`). It does not count the 17 drizzle files, which are a **separate chain**. The number moved to **38** when 0038 and 0039 were added. |

**The rule this establishes:** a count in a report must say *what it
counts*. "1,476 dishes", "38 migrations" and "47 constraint tests" are
only meaningful next to the thing they count.

