# Association review — the migration proposal, and the 50-association pilot

**Status:** **Option C APPROVED** by Alejandro on 2026-11-06 ("I
approve the 5 approvals") and implemented as
`db/migrations/0050_association_review_ledger.sql`. The migration is
committed and tested but **NOT applied to production** — that is a
separate operation needing its own approval, as every migration here
does.

**Measured against the live database**, 2026-11-05 (the proposal) and
2026-11-06 (the implementation).

---

## A CORRECTION THE IMPLEMENTATION FOUND

The proposal and the pilot doc both described the 1,235
`entity_kind = 'community'` rows as **dangling** — "the dangling half",
"the entity_id is dangling". That was wrong, and the implementation is
where it was found.

`entity_id` is **polymorphic**, and both branches resolve:

```sql
entity_kind = 'place'     -> geo_entities.id     -- a PLACE
entity_kind = 'community' -> dish_traditions.id  -- a CULTURE
```

Measured on live, 2026-11-06:

| entity_kind | relationship_type | rows | resolve? |
|---|---|---|---|
| `place` | `legacy_unreviewed` | 1,478 | all of them |
| `community` | `established_tradition` | 1,235 | all of them |
| | **total** | **2,713** | **zero dangle** |

A `community` row pointing at a `dish_traditions` row is a **correct**
row. It asserts "this dish belongs to the Indonesian culinary
tradition" — a claim about a culture, not about a country. The API
already models this: `atlas.ts` exposes `entityKind` and says, in a
comment, *"a community is a people or a practice, NOT a place, and the
client must not render it as one."*

The first draft of the migration acted on the wrong reading and
re-pointed those rows at the country implied by the dish's cuisine
tag. **Testing against the live shape is what caught it** — on the CI
seed database (13 rows, none dangling) the migration passed; on live's
2,713 rows it failed its own assertion. Had it not been caught:

- 1,235 accurate "established tradition" claims would have become
  1,235 weaker "legacy unreviewed" origin claims, silently, with no
  reviewer and no source;
- the place/culture distinction the model depends on would have been
  destroyed.

**So the migration re-points nothing.** The `entity_repointed` action
stays in the ledger's enum — the operation is legitimate when a
reviewer decides it, with a source behind it — but this migration
does not perform it. What it does instead is add the trigger that
catches a genuinely dangling row from now on.

The pilot's confidence labels changed with the correction: the rows are
**all MEDIUM**, not 25 MEDIUM + 25 LOW, because every association
resolves. What separates the two halves of the pilot is the *kind of
claim*, not resolvability.

---

## The finding that shapes the whole proposal

The brief said "there is no review column, so propose how to record
review (column or ledger table) as a migration for my approval."

**The review column already exists.** `dish_place_associations` has
had `review_state` since the table was created, and it is CHECK-
constrained to exactly the four values a review needs:

```sql
dpa_review_state_check  CHECK (review_state IN
  ('unreviewed','in_review','accepted','rejected'))
```

It also already has `evidence_status`
(`unevidenced | research_pending | provisional | evidenced`),
`publication_state` (`draft | published | withdrawn`),
`dispute_state`, `research_outcome`, `provenance`, `qualifiers`,
`explanation`, and `legacy_value`.

So the choice is **not** "column or ledger table". The question is
narrower and more interesting:

> **The columns are there and the state machine is there, but nothing
> can move a row through it, because there is no way to attach a
> SOURCE to an association, and no ledger to record who reviewed what
> and when.**

That is the real gap. Here is the evidence.

### Every association is unevidenced, unreviewed, and unpublished

| publication_state | review_state | evidence_status | count |
|---|---|---|---|
| `draft` | `unreviewed` | `unevidenced` | **2,713** |

All 2,713. There is not one row in any other state. The review
machinery has never been used.

### No association can be sourced

The tables that would link an association to a source are all
**empty**:

| table | rows | what it would do |
|---|---|---|
| `dish_region_sources` | **0** | link a dish to a region, with a source |
| `dish_location_sources` | **0** | link a dish to a location, with a source |
| `food_region_sources` | **0** | link a food region to a source |
| `source_candidates` | **0** | discovered-but-unclassified sources |

The only source link in the database is `citations`, with **121**
rows, all `target_type='dish'` — and **zero** of them point at an
association.

So there is no path, today, from an association to a source. The
`evidence_status` column cannot become anything but `unevidenced`,
because nothing can raise it.

### And 1,235 of the 2,713 point at nothing at all

| entity_kind | total | resolves to a `geo_entities` row | **dangling** |
|---|---|---|---|
| `place` | 1,478 | 1,478 | 0 |
| `community` | 1,235 | **0** | **1,235** |

**Every `community` association is dangling.** Its `entity_id`
resolves to no row in `geo_entities`, no row in `food_regions`, and no
row in `categories`. It is a uuid that points at nothing.

The reason nothing caught it:

```sql
-- dish_place_associations has exactly ONE foreign key:
dish_place_associations_dish_id_fkey  FOREIGN KEY (dish_id) REFERENCES dishes(id)
```

`entity_id` has **no foreign key**. The column is polymorphic by
design (`entity_kind` is `place | community`), so a plain FK was not
possible — but that means a dangling id is silently accepted, and
1,235 of them are in the table now.

Their readable value survives only in `legacy_value` (`'indonesian'`,
`'italian'`, `'greek'`, …) and in `qualifiers->>'legacyCuisine'`.
The pilot below shows what that looks like.

---

## The proposal

### Option A — a review ledger table (recommended)

A new table `association_review_log` records **who reviewed what, when,
and with what result**. The `review_state` column on
`dish_place_associations` stays the *current* state; the ledger is the
*history*.

```sql
CREATE TABLE association_review_log (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  association_id      uuid NOT NULL
                        REFERENCES dish_place_associations(id) ON DELETE CASCADE,
  -- what the reviewer did
  action              text NOT NULL
                        CHECK (action IN
                          ('submitted','review_started','accepted','rejected',
                           'returned_for_research','source_added',
                           'entity_repointed','note_added')),
  -- the reviewer's verdict
  review_state_before text,
  review_state_after  text
                        CHECK (review_state_after IN
                          ('unreviewed','in_review','accepted','rejected')),
  -- the evidence the verdict rests on
  source_id           uuid REFERENCES sources(id),
  locator             text,          -- the passage / page / quote
  confidence          integer CHECK (confidence BETWEEN 1 AND 5),
  confidence_label    text CHECK (confidence_label IN
                        ('high','medium','low')),
  -- the reviewer's reasoning
  note                text,
  reviewer            text NOT NULL,
  created_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX association_review_log_assoc_idx
  ON association_review_log (association_id, created_at DESC);
```

**Why a ledger and not a column.** Three reasons, and the second is
the decisive one:

1. **A column records only the latest state.** The moment a row is
   returned for research and re-reviewed, the record of why it was
   rejected the first time is gone. For a table whose whole purpose is
   to say *how confidently do we know this dish belongs to this place*,
   the history of that judgement is the content.

2. **A single `review_state` cannot hold a partial review.** The pilot
   shows the realistic case: an association whose entity is dangling
   but whose value is recoverable. Its state is genuinely "I know the
   value, I do not yet know the entity, I have not sourced it" — which
   is not one of the four states. The ledger holds
   `action='entity_repointed'` and `action='source_added'` as
   *separate entries* without needing a fifth state.

3. **The repo already has this precedent.** `edit_history` is exactly
   this shape — `target_type`, `target_id`, `action`, `diff` (jsonb),
   `comment`, `created_at`, `user_id`. The ledger is the same pattern
   applied to a table that needs it.

**The cost.** One more table, and every write to an association's
review state has to write a log row too. That is the point of it, but
it is a real constraint on the review tooling.

### Option B — columns only

Add `confidence`, `confidence_label`, `reviewed_by`, `reviewed_at`,
and `source_id` directly to `dish_place_associations`.

**Cheaper, and it records the verdict but not the reasoning.** For a
table of 2,713 rows all in one state, this is arguably sufficient —
and it has a real advantage: the review is a **single row update**,
with no second write to keep in step.

But it has a hard limit: **one source per association.** The pilot's
sources are multi-row in principle (a dish's origin often rests on
two independent sources), and a single `source_id` cannot express
that. It also cannot record a rejection reason that a later reviewer
needs to see.

**If the review is one reviewer, one verdict, one source, and no
history — take Option B.** It is simpler and it is enough for a
one-pass pilot.

### Option C — a ledger table AND a source link table

Option A plus a proper association↔source link table:

```sql
CREATE TABLE association_sources (
  association_id uuid NOT NULL
    REFERENCES dish_place_associations(id) ON DELETE CASCADE,
  source_id      uuid NOT NULL REFERENCES sources(id),
  locator        text,
  is_primary     boolean NOT NULL DEFAULT false,
  created_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (association_id, source_id, locator)
);
```

**Recommended if the pilot is going to scale.** The pilot's verdict
depends on *how many* sources support an association, so the count
has to be queryable. With one `source_id` on the association row, "is
this corroborated?" is not answerable without a join.

### What all three options need, regardless

**The dangling `entity_id` must be fixed.** 1,235 rows point at
nothing. Either:

- **Re-point them** at real entities — `legacy_value` holds the
  cuisine name, so `indonesian` → the `geo_entities` row for
  Indonesia. This is a data migration that joins on the legacy
  value. It is *mechanical*, and it is verifiable: after it,
  `entity_id` resolves for 100% of rows.
- **Or delete them.** The information they carry is a duplicate of
  `dish_cuisines`, which is where they came from.

Re-pointing is better: the row also carries `relationship_type`
(`established_tradition`), which is a stronger claim than a cuisine
tag, and the 1,235 rows cover 1,235 dish↔cuisine pairs that are
otherwise only in the legacy table.

**And `entity_id` needs a guard.** A polymorphic column cannot have
a plain FK, but it can have a **trigger** that rejects an
`entity_id` that resolves to no row:

```sql
CREATE OR REPLACE FUNCTION check_association_entity() RETURNS trigger AS $$
BEGIN
  IF NEW.entity_kind = 'place' AND NOT EXISTS
       (SELECT 1 FROM geo_entities WHERE id = NEW.entity_id) THEN
    RAISE EXCEPTION 'association entity_id % does not resolve to a geo_entity',
      NEW.entity_id;
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
```

This is the check that would have caught all 1,235.

### What this proposal does NOT do

- It does not publish anything. `publication_state` stays `draft`
  until the review is done and the publication decision is made
  separately.
- It does not change `published_associations_for_dish()`, which is
  what gates the dish page's associations block. That function is
  correct as it stands: it returns only `publication_state='published'`
  rows for published dishes, so it currently returns **nothing**, which
  is why the dish page has no associations to show.
- It does not touch `sources`, `citations`, or the statements model.

---

## The 50-association pilot

**Sampled 25 of each `entity_kind`,** so the pilot shows both the
resolving `place` rows and the dangling `community` rows. (A sample
that took the first 50 of the whole table would have contained only
`community` rows and would have hidden the dangling half entirely — an
early version of this probe did exactly that and was corrected.)

**The confidence rule is mechanical**, so the labels are auditable:

| label | condition |
|---|---|
| **HIGH** | the entity resolves to a real `geo_entities` row, **and** ≥1 source row supports the dish/place pair, **and** the `relationship_type` is substantive (not `legacy_unreviewed`) |
| **MEDIUM** | the entity resolves, but no source row supports the pair |
| **LOW** | the `entity_id` is dangling |

**Proposed `review_state`** follows from the confidence:

- HIGH → `accepted`
- MEDIUM → `in_review`
- LOW → `in_review` when the value is recoverable (it is, in
  `legacy_value` / `qualifiers->>'legacyCuisine'`), `rejected` when
  nothing survives.

### The result

| confidence | count |
|---|---|
| HIGH | **0** |
| MEDIUM | **25** |
| LOW | **25** |

| proposed review_state | count |
|---|---|
| `in_review` | **50** |
| `accepted` | 0 |
| `rejected` | 0 |

**No association reaches HIGH, and not one has a source.** Every
`place` association is `legacy_unreviewed` with `provenance =
legacy_origin_geo_id` — a migration from the dish's origin country,
which is *discovery data*, not a reviewed historical claim. The
`explanation` column says so in as many words:

> "Migrated from the legacy `origin_geo_id`. This is the Wikidata
> 'country of origin' value — **DISCOVERY DATA, not a reviewed
> historical claim.** It is not promoted to `historical_emergence`
> because no qualifying source supports that specific claim."

That note is doing a lot of honest work already. It means the
migration was careful, and it means **the review's real job is to
promote `legacy_unreviewed` into a substantive relationship type with
a source behind it** — which is exactly the work Option A's ledger is
designed to record.

### The 50, in full

Each row: the dish, the entity, the relationship type, the provenance,
the evidence state, the sources, the confidence, and the proposed
state.

#### Rows 1–25 — `place` (the entity resolves)

| # | Dish | Place | Relationship | Provenance | Sources | Confidence | Proposed |
|---|---|---|---|---|---|---|---|
| 1 | Moussaka | Greece (GR, Q41) | `legacy_unreviewed` | `legacy_origin_geo_id` | 0 | MEDIUM | `in_review` |
| 2 | Taco al pastor | Mexico (MX) | `legacy_unreviewed` | `legacy_origin_geo_id` | 0 | MEDIUM | `in_review` |
| 3 | Arook | Iraq (IQ, Q796) | `legacy_unreviewed` | `legacy_origin_geo_id` | 0 | MEDIUM | `in_review` |
| 4 | seven-layer salad | United States (US, Q30) | `legacy_unreviewed` | `legacy_origin_geo_id` | 0 | MEDIUM | `in_review` |
| 5 | krówki | Poland (PL, Q36) | `legacy_unreviewed` | `legacy_origin_geo_id` | 0 | MEDIUM | `in_review` |
| … | … | … | … | … | … | … | … |

All 25 are the same shape: a real `geo_entities` row (every one with
a Wikidata QID and an ISO code), `legacy_unreviewed`, from the dish's
origin country, **zero** sources.

#### Rows 26–50 — `community` (the entity is dangling)

| # | Dish | Legacy value | Relationship | Sources | Confidence | Proposed |
|---|---|---|---|---|---|---|
| 26 | Moussaka | `greek` | `established_tradition` | 0 | LOW | `in_review` |
| 27 | Taco al pastor | `mexican` | `established_tradition` | 0 | LOW | `in_review` |
| 28 | Arook | `iraqi` | `established_tradition` | 0 | LOW | `in_review` |
| 29 | krówki | `polish` | `established_tradition` | 0 | LOW | `in_review` |
| … | … | … | … | … | … | … |

All 25 have an `entity_id` that resolves to nothing, and a
`legacy_value` that is recoverable.

**The full 50-row list**, with every field and the reasoning for each
verdict, is in **`docs/ASSOCIATION-PILOT-50.md`**.

---

## What I need from Alejandro

1. **Option A, B, or C?** The recommendation is **C** (ledger +
   source link table), because the pilot's confidence rule depends on
   *how many* sources back an association, and Option B cannot express
   that. If the review is a single reviewer, one source, and no
   history, **B** is the honest minimum.
2. **The dangling 1,235 — re-point or delete?** The recommendation is
   **re-point** on `legacy_value` → `geo_entities`, because the rows
   carry a stronger claim (`established_tradition`) than the cuisine
   tag they came from.
3. **Confidence scale** — 1–5 integer, or the three labels
   (`high`/`medium`/`low`) used in the pilot? The proposal carries both.
4. **Should the migration add the `entity_id` guard trigger?** It is
   the check that would have caught all 1,235, and it costs nothing.

On approval, the migration goes into `db/migrations/` with an entry in
the CI migration chain, and the review tooling is built against it.
Until then, nothing is published and the dish page's associations
block stays a server-rendered empty state.
