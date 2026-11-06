# ADR-007: The recipe schema

**Status:** **ACCEPTED** — approved by Alejandro on 2026-11-06
("I approve the 5 approvals"). This ADR is now binding: R4+ work
proceeds against the schema it specifies.
**Date:** 2026-11-05 (proposed) / 2026-11-06 (accepted)
**Deciders:** Alejandro (product owner), Hermes (author)
**Related:** ADR-001 (dish persistence and publishing), ADR-002 (claims
model), ADR-004 (atlas amendments), ADR-005 (live approval gate),
ADR-006 (publish credential session binding)

> **What the acceptance authorises, precisely.**
> It authorises the SCHEMA — the six decisions below are now settled
> and R4+ may be designed and built against them. It does **not**
> authorise a migration to production: the schema still has to be
> written as a migration, and applying that migration is a separate
> operation that needs its own approval, as every migration here does.
> The current recipe scope is still **R1–R3**, which needs no schema
> at all.

---

## Context

### What exists today

There is **no recipes table**. The live database's 87 tables contain no
recipe entity — the closest things are `ingredients` (the pantry) and
`dish_preparations` (how a dish is made).

What *gustale.recipes* serves today is the same dish corpus, re-framed:

| Route | What it shows |
|---|---|
| `/` | the recipes island |
| `/dishes` | the dish list (shared with the Atlas) |
| `/dishes/<slug>` | the dish detail, with the cooking-oriented island |
| `/ingredients` | the ingredient encyclopedia |
| `/ingredients/<slug>` | one ingredient |

And `gustale.com` (the Atlas) has the same routes, minus the
recipes-specific ones.

So the two properties currently show **one body of content** under two
presentations. The Atlas is the geographic/map encyclopedia; Recipes is
supposed to be the *cooking* encyclopedia. They are not different
datasets yet — only different frames.

### Why this has to be decided before R4

R1–R3 are, in order:

- **R1** — a minimal own home for the recipes property.
- **R2** — 301 the duplicated routes and serve a **separate sitemap**.
- **R3** — remove "Add a dish" from the recipes pages; do not add
  "Add a recipe" until a schema exists.

R3 is the point of no return. "Add a dish" on a recipes page is
*misleading* — a dish is a catalogue entry, not a recipe. But "Add a
recipe" is only honest if there is something called a recipe. Right
now there is not.

So the schema question is: **what is a recipe, in relation to a dish?**

Three plausible answers, and they lead to very different schemas.

### The constraints that shape the answer

1. **A dish can have several recipes.** Moussaka has a classic Greek
   version and a Cypriot one; biryani has many regional forms. The
   Atlas already models this: `dish_variants` exists, and the dish page
   shows "Regional variants".
2. **A recipe is a preparation, not an identity.** The dish is
   "moussaka"; the recipe is "one way of making it". This matters for
   provenance: the dish has an origin and a history; the recipe has
   quantities, times, and a method.
3. **The editorial model already has the right shape.** The database
   has a *statements* model (ADR-002) with sources, verification
   status, and a review queue. `dish_preparations` already stores
   `steps`, `duration_minutes`, `difficulty` against a
   `preparation_methods` row.
4. **Translation already exists and is table-scoped.** `ingredients`
   has `ingredient_translations`; `preparation_methods` has
   `preparation_method_translations`. A recipe table needs the same
   treatment, or the recipes property will be English-only.

---

## The decision

### Decision 1 — A recipe is a first-class entity, and a dish has many

A recipe is **not** a column on `dishes`, and it is **not** the same
thing as `dish_preparations`.

```
dishes 1───* recipes *───1 dishes
              │
              ├── recipe_ingredients *───1 ingredients
              ├── recipe_steps        (ordered)
              └── recipe_translations
```

Rationale: `dish_preparations` answers "how is this dish prepared?"
and is bound to a *method* (`preparation_methods`) — a taxonomy entry
like "braising". A recipe answers "how do I make this, tonight?" and
carries quantities, times, yields, and a source. They are different
questions and the schema must not collapse them.

### Decision 2 — The recipe inherits the dish's identity and provenance; it does not duplicate it

A recipe row stores **no** origin, no canonical name, no family, no
cover image. Those belong to the dish. A recipe references its dish
and adds only what is specific to the way of making it.

This is what keeps "regional variants" honest: the Atlas's
`dish_variants` says *this dish has a Cypriot form*; a recipe says
*here is the Cypriot form, with quantities and a source*.

### Decision 3 — A recipe is a *draft-first* entity with its own publish gate

A recipe is not publishable on its own. It is publishable when:

1. its dish is published, **and**
2. every ingredient it names resolves to a published ingredient, **and**
3. it has at least one source, and every claim it makes is either
   sourced or explicitly marked as the contributor's own, **and**
4. it has passed the review queue.

The reason for (3) and (4) is the same reason the dish has them
(ADR-002, ADR-005): **a recipe is a set of claims about how to do
something**, and an unsourced recipe is worse than no recipe, because
it looks authoritative. The Atlas's "unevidenced" badge exists for
exactly this reason.

### Decision 4 — Recipe text is stored as sentences, not as a blob

The description pipeline already works this way (ADR-002's
`description_sentences` + `sentence_claims` + `statements`): a long
text is split into sentences, each sentence carries a claim, each
claim carries its own source and verification state.

A recipe's steps and its notes are **exactly** this shape. So the
recipe's prose is stored as sentences with claims, and the recipe's
structured parts (quantity, unit, duration) are stored as columns.

The existing model, as it actually is in the live database:

```
description_sentences   id, dish_id, field, locale, position, text,
                        source_sentence_id, anchor_status
                        (anchor_status: full | partial | none)
sentence_claims         sentence_id, statement_id, is_primary
statements              subject_type, subject_id, predicate_id,
                        value_type/value_ref/value_literal,
                        qualifiers, claim_class, status,
                        evidence_status, dispute_state, ...
                        (claim_class: documented | scholarly_interpretation |
                         oral_tradition | disputed | hypothesis | unsupported)
```

Note `statements.subject_type` / `subject_id` — a statement is
**subject-typed**, which is exactly what makes it reusable: the
existing 1,354 statements all have a dish as their subject. A recipe
can be a subject too, with the same tables and the same verification
machinery.

So the recipe's sentences reuse `sentence_claims` and `statements`
wholesale. What is new is a **recipe-scoped sentence table**, because
`description_sentences.dish_id` is `NOT NULL` and hard-bound to a
dish. The recipe's sentences need their own table with the same
shape, pointing at the same `sentence_claims`/`statements` pair.

This is the decision with the largest consequence, and it is the one
most worth arguing about, because it makes a recipe expensive to
author. That cost is the point: the recipes property's credibility
rests on a recipe being *followable*, and a blob of text with no
sources is how recipe sites become noise.

### Decision 5 — Quantities are text + unit, not numeric columns

`dish_ingredients` already stores `quantity text` and `unit text`.
A recipe's ingredient line uses the same shape, for the same reason:
"2½", "a handful", "to taste", "1 (400g) tin" are all real
quantities, and a numeric column would force the author to throw away
meaning to fit the schema.

### Decision 6 — A recipe has a `content_type`, and it is editorial

The `content_type` decision (from the Startpage programme) applies
here: it is an **explicit editorial field** with no sync trigger. A
recipe's `content_type` is one of `recipe`, `variation`, `technique`,
`base`, `template`.

---

## The schema (accepted)

```sql
-- The recipe itself.
CREATE TABLE recipes (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dish_id             uuid NOT NULL REFERENCES dishes(id) ON DELETE CASCADE,
  slug                text NOT NULL UNIQUE,
  title               text NOT NULL,
  content_type        text NOT NULL DEFAULT 'recipe'
                        CHECK (content_type IN ('recipe','variation','technique','base','template')),
  -- yields and time
  servings            integer,
  prep_minutes        integer,
  cook_minutes        integer,
  difficulty          integer,
  -- provenance
  status              text NOT NULL DEFAULT 'draft'
                        CHECK (status IN ('draft','published','archived')),
  review_state        text NOT NULL DEFAULT 'unreviewed'
                        CHECK (review_state IN ('unreviewed','in_review','approved','rejected')),
  created_by          text,
  last_edited_by      text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),

  -- A recipe always belongs to a dish, and a dish's recipe set is
  -- ordered (the primary one first).
  is_primary          boolean NOT NULL DEFAULT false
);

-- One row per ingredient line, with its amount.
CREATE TABLE recipe_ingredients (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_id       uuid NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  ingredient_id   uuid NOT NULL REFERENCES ingredients(id),
  quantity        text,
  unit            text,
  is_optional     boolean NOT NULL DEFAULT false,
  preparation_note text,
  position        integer NOT NULL
);

-- The recipe's own sentences, each one a claim (mirrors
-- description_sentences, but scoped to a recipe: description_sentences
-- .dish_id is NOT NULL and hard-bound to a dish).
CREATE TABLE recipe_sentences (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_id    uuid NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  field        text NOT NULL DEFAULT 'step'
                CHECK (field IN ('step','note','intro')),
  locale       text NOT NULL DEFAULT 'en',
  position     integer NOT NULL,
  text         text NOT NULL,
  source_sentence_id uuid,
  anchor_status text NOT NULL DEFAULT 'none'
                CHECK (anchor_status IN ('full','partial','none')),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

-- The link from a recipe sentence to the statement that backs it.
-- Mirrors sentence_claims, but recipe-scoped: sentence_claims.sentence_id
-- is FK-bound to description_sentences(id) and cannot carry a recipe
-- sentence.
CREATE TABLE recipe_claims (
  recipe_sentence_id uuid NOT NULL REFERENCES recipe_sentences(id) ON DELETE CASCADE,
  statement_id       uuid NOT NULL REFERENCES statements(id) ON DELETE CASCADE,
  is_primary         boolean NOT NULL DEFAULT true,
  created_at         timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (recipe_sentence_id, statement_id)
);

-- Translations, scoped to the recipe (mirrors ingredients).
CREATE TABLE recipe_translations (
  recipe_id    uuid NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  locale       text NOT NULL,
  title        text NOT NULL,
  description  text,
  PRIMARY KEY (recipe_id, locale)
);
```

`recipe_sentences` needs its own claim-link table, because the
existing `sentence_claims.sentence_id` carries a **foreign key to
`description_sentences(id)`** (`sentence_claims_sentence_id_fkey`, ON
DELETE CASCADE). A recipe sentence is not a description sentence, so it
cannot be linked through that table as it stands.

Two ways out:

| Option | What changes | Cost |
|---|---|---|
| **A. New `recipe_claims`** | A second link table with the same shape, pointing at `recipe_sentences` and `statements` | A second table, but `statements` — where the provenance actually lives — is **shared**, so a statement can carry both a dish subject and a recipe subject without duplication |
| **B. Widen `sentence_claims`** | Drop the FK, make `sentence_id` polymorphic | Touches the existing 1,354-statement pipeline's integrity guarantees for **both** properties, to serve one |

**Option A is the recommendation.** The `statements` table is
already subject-typed (`subject_type` / `subject_id`), and
`subject_type` is currently CHECK-constrained to `dish | place` — so
supporting a recipe subject requires widening that CHECK to include
`recipe`. That is a small, additive change to an existing table, and
it is the same mechanism the place associations use.

Widening `sentence_claims` (Option B) would be a change to the
integrity of the whole claim pipeline to avoid adding one table. That
is the wrong trade for a table that is used by exactly one new
feature.

### The publish gate, in one place

```sql
CREATE OR REPLACE VIEW recipe_publishable AS
SELECT r.id
  FROM recipes r
  JOIN dishes d ON d.id = r.dish_id
 WHERE r.status = 'published'
   AND d.status = 'published'
   AND r.review_state = 'approved'
   AND EXISTS (SELECT 1 FROM recipe_ingredients ri
                JOIN ingredients i ON i.id = ri.ingredient_id
               WHERE ri.recipe_id = r.id AND i.status = 'published')
   AND EXISTS (SELECT 1 FROM recipe_sentences rs WHERE rs.recipe_id = r.id)
   AND NOT EXISTS (
         SELECT 1
           FROM recipe_sentences rs
           LEFT JOIN recipe_claims rc ON rc.recipe_sentence_id = rs.id
           LEFT JOIN statements st    ON st.id = rc.statement_id
          WHERE rs.recipe_id = r.id
            AND (st.id IS NULL
                 OR st.status NOT IN ('verified','published')));
```

The last clause is the important one: **a recipe sentence with no
verified statement cannot be published.** A recipe whose every
sentence is verified is publishable.

This keys on `statements.status IN ('verified','published')`, which is
exactly the test the dish detail route already uses to derive the
"unevidenced" badge (`apps/api/src/routes/dishes.ts:878`). Using the
same predicate means a recipe and a dish cannot disagree about what
"evidenced" means.

Note that `statements.evidence_status` is a **separate, finer-grained
axis** with values `unevidenced | research_pending | provisional |
evidenced`. The publish gate deliberately keys on `status`, not on
`evidence_status`, because that is what the existing dish path does.

### What this deliberately does NOT have

- **No `recipe_variants` table.** Variants are recipes whose
  `content_type = 'variation'`, attached to the same dish. The Atlas's
  `dish_variants` and the recipes property's variations are different
  questions: one is "this dish has regional forms", the other is "here
  is how to make the Cypriot one".
- **No recipe-level media.** A recipe shows the dish's cover, or a
  recipe-specific photo attached through the existing
  `media_attachments` mechanism with a new `target_type`.
- **No per-recipe ingredients table.** Ingredients are shared and
  already have their own translations, variants and provenance.
- **No numeric quantity columns.** See Decision 5.

---

## Consequences

### Good

- **"Add a recipe" becomes honest.** It creates a row that carries
  quantities, time and steps, and that can be sourced.
- **The Atlas and Recipes stop sharing one dataset.** The Atlas keeps
  dishes, families, lineages and geography; Recipes gains a table the
  Atlas does not use. That is the point of the split.
- **Provenance is uniform.** A recipe uses the same
  statements/claims/sources machinery as a dish description, so the
  review queue, the "unevidenced" badge and the live approval gate all
  apply unchanged.
- **Translation is table-scoped**, as the other content tables are.

### Bad, and honestly so

- **Authoring a recipe is expensive.** Every sentence needs a claim
  and a source. That is a deliberate cost, but it means the recipes
  property will look empty for a long time. The recipes property must
  therefore ship with **a curated set of complete recipes**, not with
  an empty form — an empty form with a big "Add a recipe" button is
  worse than no button.
- **This is a substantial schema.** It is five tables (`recipes`,
  `recipe_ingredients`, `recipe_sentences`, `recipe_claims`,
  `recipe_translations`), a view, and a migration chain entry. It is
  R5+ work, not something to slip in alongside a UI change.
- **`statements.subject_type` must be widened** from
  `dish | place` to include `recipe`. That is a CHECK constraint on
  an existing table with 1,354 rows — additive and safe, but it is a
  change to a shared table and it must land before any recipe
  statement can exist.
- **The `status`/`review_state` pair overlaps.** A recipe can be
  `status='published'` and `review_state='rejected'` — the publish
  view refuses it, but the pair is easy to misread. An alternative is
  a single `state` enum; the split is kept because the dish tables
  already use this shape and consistency beats elegance.

### Neutral

- The migration must be added to the CI migration chain
  (`scripts/ci-migration-chain.sh`), which fails when the two
  migration lists differ. That gate exists precisely for this.

---

## What this ADR does NOT decide

- **The API shape.** `GET /api/recipes`, `POST /api/recipes`, and the
  pagination contract (`total`/`hasMore`, as PR 3 introduces for
  dishes) are a separate decision, though the list endpoint should
  match the dishes one.
- **Whether a recipe may exist for a dish with no published dish
  entry.** The publish view says no. A separate "draft recipe
  attached to a draft dish" workflow is possible and is not decided
  here.
- **The authoring UI.** R3 removes "Add a dish" from recipes. "Add a
  recipe" appears only after this ADR is approved *and* the schema
  exists.
- **The `content_type` taxonomy for recipes.** The five values above
  are a starting set; they should be reviewed against real recipes.

---

## The recommendation

**Approved by Alejandro on 2026-11-06** — all six decisions, as
recommended:

| # | decision | status |
|---|---|---|
| 1 | A recipe is a first-class entity, and a dish has many | **accepted** |
| 2 | The recipe inherits the dish's identity and provenance | **accepted** |
| 3 | Draft-first, with its own publish gate | **accepted** |
| 4 | Text is stored as sentences | **accepted** |
| 5 | Quantities are text plus unit | **accepted** |
| 6 | Editorial `content_type` is `recipe` / `variation` / `technique`, with **no** sync trigger | **accepted** |

**Next, and separately:** implement the schema as a migration, wire the
publish gate, and ship "Add a recipe" alongside a curated set of
complete recipes. That migration still needs its own approval before
it is applied.

R1–R3 do not wait for this — they are about the recipes property's
*shell* (its home, its URLs, its honesty about what it offers), and
they are exactly right to go first. R3's job is to make sure the
property stops promising something it cannot deliver until the schema
exists.
