# ADR-002: Directus as the authoring layer for dish content

**Status:** Proposed
**Date:** 2026-07-25
**Deciders:** Alex (product owner), Claude (orchestrator), Cursor (implementer), Hermes (ops)
**Extends:** [ADR-001](./ADR-001-dish-persistence.md) — settles *how* the database becomes canonical
**Affects roadmap:** supersedes P2-4 (moderation queue UI), reduces P2-5 (image upload)

---

## Context

ADR-001 established that Postgres should become source of truth. It did not
answer the operational question: **with what do we actually edit the data?**

### The shape of the problem

Gustale's content is not a list of dishes. It is a 27-table relational graph:

```
dishes ──┬── dish_ingredients ──── ingredients ──── ingredient_variants
         ├── dish_preparations ─── preparation_methods
         ├── dish_categories ───── categories        (families, cuisines)
         ├── dish_lineages ─────── lineages
         ├── dish_relations ────── dishes            (self-referential, typed roles)
         ├── dish_journey_beats ── sources           (per-beat citation + confidence)
         ├── dish_variants
         ├── dish_translations
         ├── media_attachments ─── media             (MinIO-backed)
         └── geo_entities                            (PostGIS geometry)
```

Editing this through `seed-data.ts` means hand-maintaining foreign keys as
string slugs and trusting the seeder to resolve them. **It already fails
silently:** 12 `DISH_RELATIONS` entries reference slugs absent from `DISHES` and
are dropped without error, and 13 `DISH_LINEAGES` keys are orphaned.

At the stated target of unbounded growth, hand-editing a 180 KB TypeScript file
is not a workflow.

### What already exists and is unused

- `apps/api/src/routes/dishes-write.ts` — full CRUD plus variants, registered
- `apps/web/src/pages/dishes/new.astro` and `dishes/[slug]/edit.astro`
- `edit_history` table recording every create and update
- `POST /api/dishes/:slug/publish`, role-gated
- MinIO buckets `gustale-public` and `gustale-media`, largely idle

The write path was built and then bypassed, because `seed-data.ts` remained the
thing that survived into a build.

### Requirements

From ADR-001 plus decisions taken 2026-07-25:

1. Public contributors eventually; review required for outside submissions only
2. No ceiling on dish count
3. **Editing must be usable at thousands of dishes** — this ADR's driver
4. **Public contributors get a separate, curated flow**, not the admin tool

---

## Decision

**Run [Directus](https://directus.com/) as a container against the existing
Postgres database, as the internal authoring and moderation surface for Alex and
the agents. Keep a separate, deliberately narrow public contribution form backed
by the existing write API.**

Two surfaces for two audiences. `seed-data.ts` is demoted to a bootstrap fixture.

### Target architecture

```
   INTERNAL                                      PUBLIC
   ┌──────────────────┐                   ┌────────────────────┐
   │ Directus :8055   │                   │ /dishes/new        │
   │ Alex + agents    │                   │ curated, branded   │
   │ full graph edit  │                   │ narrow field set   │
   │ moderation queue │                   └─────────┬──────────┘
   └────────┬─────────┘                             │ POST /api/dishes
            │ direct SQL                            │ status: draft
            ▼                                       ▼
      ┌─────────────────────────────────────────────────────┐
      │   Postgres 16 + PostGIS   ← SOURCE OF TRUTH          │
      └──────────────────────┬──────────────────────────────┘
                             │ export-build-snapshot.mjs (ADR-001 Phase 1)
                             ▼
                    MinIO  gustale-public
                             │  CI downloads artefact
                             ▼
                   Astro SSG → nginx → gustale.com / .recipes
```

---

## Options Considered

### Option A — Directus over the existing schema

| Dimension | Assessment |
|---|---|
| Complexity | Medium |
| Cost | Low — one container, free tier applies |
| Time to usable | Days |
| Domain fit | Good, not perfect |

Directus introspects an existing SQL schema: tables become collections, columns
become fields. **No migration, no schema rewrite.**

Mapping onto what Gustale already has:

| Gustale asset | Directus capability |
|---|---|
| PostGIS `geometry` columns | native map field with point editor |
| MinIO S3-compatible buckets | file storage adapter |
| `edit_history` | built-in revisions + activity log |
| Moderation requirement (P2-4) | RBAC + draft/publish workflow |
| M2M joins throughout | relational pickers instead of slug strings |
| `sources` / `citations` | related-item selection with search |

**Pros**
- Weeks-to-days instead of months; the 27-table graph becomes editable at once
- Foreign keys become dropdowns — the silent-orphan class of bug disappears structurally
- **Replaces roadmap P2-4 entirely** and most of P2-5 on the admin side
- Generated REST/GraphQL APIs are a bonus, not the point
- Frees engineering time for the actual differentiators (confidence surfacing, ingredients, connections index)

**Cons**
- Another container on the VPS to run, back up and upgrade
- Writes go straight to Postgres, **bypassing the Zod validation in `dishes-write.ts`** — invariants must move into the database
- Adds ~15 `directus_*` tables to the database
- Second auth system alongside `better-auth`
- Generic UI will fit journey beats and confidence grading imperfectly
- Licence is source-available, not OSI-open (see below)

**Licence position.** As of v12 (May 2026), Directus uses the Monospace
Sustainable Core License: free to self-host for organisations under $5M revenue
and 50 employees, with each version converting to GPLv3 four years after
release. Gustale qualifies. **It does not affect the licensing of Gustale's own
data or API** — the open read API in roadmap P3-2 is unaffected. Should Gustale
ever exceed the threshold, the four-year GPLv3 conversion caps the lock-in risk.

### Option B — Build a custom admin UI

Extend `dishes-write.ts` and the edit wizard to cover all entities.

| Dimension | Assessment |
|---|---|
| Complexity | High |
| Cost | Months of engineering |
| Time to usable | Months |
| Domain fit | Perfect |

**Pros**
- Purpose-built UX for the things that matter: confidence grading, journey beat
  sequencing, lineage relationships, citation attachment
- One auth system, one deployment, no third-party licence
- Nothing bypasses application-layer validation

**Cons**
- 27 tables of CRUD is a genuine multi-month build
- Competes directly with the work that differentiates Gustale — and the
  competitive research found Gustale already behind on `/ingredients`,
  `/techniques` and `/stories`
- Admin UI is undifferentiated work; nobody visits Gustale for its admin panel

### Option C — Directus now, custom later

Adopt Directus immediately, replace with purpose-built screens where the generic
UI hurts.

**Pros:** unblocks now, keeps the door open
**Cons:** two systems during overlap; the migration realistically never
completes, so this is Option A with extra intent

---

## Trade-off Analysis

**The decisive factor is opportunity cost, not capability.** Option B produces a
better admin panel. It also consumes the quarter in which Gustale should be
closing the gaps the competitive research identified — `/ingredients` is dead
links, `food_geography` has been deployed and empty for a month, and the
confidence promise that is Gustale's clearest differentiator is unadvertised on
the homepage. Spending that time on CRUD screens optimises the wrong thing.

**The strongest argument against Directus is the validation bypass**, and it
should not be waved away. `dishes-write.ts` enforces invariants in Zod;
Directus writes straight to Postgres and will not run any of it. The mitigation
is not "be careful" — it is to **move invariants into the database as
constraints, triggers and enums**, where every writer is subject to them.

That is a genuine improvement regardless of this decision. The validator planned
in ADR-001 Phase 0 catches orphans at seed time; database constraints catch them
at write time from any source. Directus forces the correct design.

**Two auth systems is acceptable here** specifically because the audiences are
disjoint and one of them has roughly three accounts. This would be a bad trade
at organisational scale; at Gustale's scale it is a non-issue, and SSO can come
later if it ever matters.

**On domain fit.** Directus will render `confidence` as a plain text dropdown
and `dish_journey_beats.sequence` as an integer field. That is worse than a
purpose-built beat editor. It is also *dramatically* better than editing a
5,000-line TypeScript file, which is the actual alternative today.

---

## Consequences

### Easier
- Adding a dish with ingredients, lineage, family, journey beats, sources and media becomes one session in one UI
- Relationship errors become structurally impossible — you pick from a list, not type a slug
- Moderation (P2-4) arrives free rather than as a half-day build
- Media management on the admin side arrives free (most of P2-5)
- Bulk edits, filtering and search across the whole corpus
- Agents can be given scoped Directus accounts with audit trails

### Harder
- Database backups become genuinely load-bearing — this is now the only copy
- Two auth systems, two upgrade paths
- Validation must live in the database, requiring a constraints pass
- Directus schema changes and Drizzle migrations must not fight; **Drizzle stays authoritative for schema**, Directus is read-and-write on data only
- Rolling back bad content is a database operation, not `git revert`

### To revisit
- If Directus's fit on journey beats or lineage confidence proves painful, build
  those two screens custom and keep Directus for everything else
- If Gustale approaches the $5M / 50-employee threshold, re-evaluate against the
  GPLv3 conversion timeline
- Whether `directus_*` tables should live in a dedicated Postgres schema

---

## Action Items

### Phase 0 — prerequisites (unchanged from ADR-001, do first)
1. [ ] Split `seed-data.ts` into per-entity modules — **Cursor**, in flight
2. [ ] Seed-time validator with loud failures — **Cursor**, in flight
3. [ ] Establish automated Postgres backup with a *tested restore* — **Hermes**.
       **This gates everything below.** Do not make the DB canonical without it.

### Phase 1 — spike (Cursor, ~1 day, before committing)
4. [ ] Stand up Directus locally against a copy of the real schema
5. [ ] Answer, concretely:
       - Do PostGIS `geometry` columns render as an editable map field?
       - Do the `*_translations` tables work with Directus i18n, or need config?
       - Can `directus_*` tables be confined to a separate schema?
       - Does the self-referential `dish_relations` M2M edit sensibly?
       - How does `dish_journey_beats` ordering behave?
6. [ ] Report findings before any VPS work. **If the spike fails on PostGIS or
       self-referential relations, this ADR is wrong and we reconsider Option B.**

### Phase 2 — invariants into the database (Cursor, ~2 days)
7. [ ] Migration adding CHECK constraints and FKs currently enforced only in app code:
       `confidence` ∈ (documented, likely, possible, parallel);
       `status` ∈ (draft, published, …); lat/lng bounds; NOT NULL on citation path
8. [ ] Convert the ADR-001 validator's rules into constraints wherever expressible
9. [ ] Verify `dishes-write.ts` still passes its tests against the tightened schema

### Phase 3 — deploy Directus (Hermes, ~1 day)
10. [ ] Directus container on the VPS, behind Caddy, admin-only, not publicly indexed
11. [ ] Point file storage at the existing `gustale-media` MinIO bucket
12. [ ] Create roles: `owner` (Alex, full), `agent` (Cursor/Hermes, no delete),
        `moderator` (publish rights on drafts)
13. [ ] Confirm backups cover the `directus_*` tables too

### Phase 4 — cut over (Cursor + Hermes, ~3 days)
14. [ ] Ship the snapshot export to MinIO — ADR-001 Phase 1, now the only DB→build path
15. [ ] CI downloads the artefact; delete `mock-api-data.json` from the repo
16. [ ] Reduce `seed-data.ts` to a ~20-dish bootstrap fixture
17. [ ] Rewrite the authoring section of `CLAUDE.md` — the "append to seed-data.ts"
        instructions become wrong the moment this lands
18. [ ] Keep `/dishes/new` as the public draft-submission form; drafts surface in
        Directus for moderation

---

## Notes

- **Drizzle remains authoritative for schema.** Directus can alter schema and
  must not be allowed to; restrict the Directus database role to DML on content
  tables, DDL only on `directus_*`.
- The snapshot export becomes load-bearing rather than an optimisation — it is
  the sole path from database to deployed site.
- This does not resolve the migration-application gap that caused today's
  `/journey` 500s in production. CI still does not run migrations. Separate issue,
  still open, and it will bite again.
- Related roadmap items: P2-4 (superseded), P2-5 (reduced), P3-2 (snapshot is a
  head start), P1-2 (ingredients become editable, unblocking content work).

---

# Amendment 1 — composite primary keys block eleven tables

**Date:** 2026-07-25
**Author:** Claude (orchestrator)
**Trigger:** [ADR-002 spike findings](./ADR-002-spike-findings.md), Q3, plus
follow-up schema audit
**Status of the decision:** unchanged — Directus is still the right call. The
*prerequisite work* changes.

The body above is left intact as the pre-spike decision record. This section
corrects it.

## What the body got wrong

The body claims Directus "introspects an existing SQL schema… **No migration, no
schema rewrite.**" That is true of Directus in general and **false for Gustale's
schema specifically.**

Directus requires a single-column primary key to expose a table as a collection.
Tables with composite primary keys are warned about and silently ignored. Eleven
of Gustale's tables have composite PKs with no surrogate `id`:

| Table | Consequence if unfixed |
|---|---|
| `dish_categories` | **cannot assign a dish to a family or cuisine** |
| `dish_lineages` | **cannot attach a dish to a lineage** |
| `dish_tags` | cannot tag dishes |
| `dish_translations` | cannot author local dish names |
| `category_translations` | — |
| `ingredient_translations` | — |
| `preparation_method_translations` | — |
| `food_region_sources` | **cannot cite a geographic claim** |
| `dish_region_sources` | **cannot cite a dish's region claim** |
| `dish_location_sources` | **cannot cite a dish's coordinates** |
| `watch_list` | user-facing feature, not authoring |

`dish_categories` and `dish_lineages` carry two of the three taxonomies the atlas
is built on. The three `*_sources` junctions are how geographic claims acquire
citations — the mechanism behind the confidence differentiator identified in the
competitive research.

## Why the spike did not catch this

Q1 tested PostGIS on `dishes.origin_location`; Q2 tested the self-referential M2M
on `dish_relations`. Both of those tables carry a surrogate `id` and therefore
work. `dish_ingredients` and `dish_preparations` also carry surrogate ids and
also work.

**The schema is split roughly in half, and the spike questions sampled only the
half that works.** That is a flaw in how the spike was scoped — my error, not
Cursor's, which flagged the wider pattern unprompted on reporting back.

## Corrected prerequisite

Add a surrogate primary key to each of the eleven tables:

```sql
ALTER TABLE <t> ADD COLUMN id uuid NOT NULL DEFAULT uuid_generate_v4();
ALTER TABLE <t> DROP CONSTRAINT <t>_pkey;
ALTER TABLE <t> ADD PRIMARY KEY (id);
ALTER TABLE <t> ADD CONSTRAINT <t>_natural_key UNIQUE (<original composite cols>);
```

Semantics are preserved: the composite key survives as a UNIQUE constraint, so
existing queries, upserts and `onConflict` clauses continue to work. Drizzle
schema must be updated to match, since Drizzle remains authoritative for schema.

**This is cheapest now.** Several of these tables are empty or small today; the
cost of a surrogate-key migration rises with row count and with inbound foreign
keys.

## Revised impact on the decision

| | Body claims | Actual |
|---|---|---|
| Schema change required | none | migration across 11 tables |
| Time to usable | days | days **plus** the migration |
| Risk | container + validation bypass | + a PK migration on live data |

The decision itself does not change. Option B (custom admin) still costs months;
this migration costs days. But ADR-002 can no longer be characterised as
zero-schema-change, and that characterisation should not be relied on in
planning.

## Amended action items

Insert before Phase 3 (deploy Directus):

- [ ] **Phase 2b — surrogate primary keys.** Migration adding `id` to all eleven
      tables, demoting composite keys to UNIQUE. Report row counts per table
      before migrating. Verify the seeder's `onConflict` clauses still resolve
      against the UNIQUE constraints. Re-run the Directus spike afterwards and
      confirm all eleven appear as collections.

Phase 3 is blocked on this. Deploying Directus before it would produce an admin
tool that cannot edit families, lineages, or citations — which is worse than no
admin tool, because it looks like it works.

---

# Amendment 2 — `dish_ingredients` has no primary key

**Date:** 2026-07-25
**Author:** Claude (orchestrator)
**Trigger:** Cursor's Phase 2b report — *"Still ignored: dish_ingredients (no PK
at all — outside Amendment 1)"*

## The finding

Amendment 1 identified eleven tables with **composite** primary keys.
`dish_ingredients` is a twelfth problem of a different kind: it has **no primary
key whatsoever** — neither surrogate nor composite.

Amendment 1's audit missed it because the check tested for composite-PK-without-
surrogate. A table with no PK at all satisfies neither branch and fell through.
Same class of scoping error as the original spike. Cursor caught it unprompted,
again.

## Why it matters more than the other eleven

**As a Directus problem:** `dish_ingredients` is the dish ↔ ingredient junction.
Roadmap P1-2 (ingredient origins) is one of three differentiators identified in
the competitive research, and `/ingredients/<slug>` links are currently dead
because the data does not exist. If the admin tool cannot edit this junction,
the tool cannot be used to fix the gap it was partly adopted to address.

**As a schema defect, independent of Directus:**

- Duplicate `(dish_id, ingredient_id)` rows are insertable with nothing to stop them
- No way to address a single row for UPDATE or DELETE — every mutation is a
  predicate over non-unique columns
- Logical replication and CDC tooling require a replica identity, which a
  PK-less table lacks

This would be worth fixing even if Directus were never adopted.

## Cost

**Zero rows today** — the ingredients corpus is empty (`INGREDIENTS` is absent
from seed data entirely). Adding the key now is free. It stops being free the
moment P1-2 seeds it, which is imminent.

## Fix

Separate migration, `0011_dish_ingredients_pk.sql`, not folded into `0010` —
`0010`'s SHA-256 has already been published to Hermes for the production apply
sequence and must not change.

```sql
ALTER TABLE dish_ingredients
  ADD COLUMN id uuid NOT NULL DEFAULT uuid_generate_v4();
ALTER TABLE dish_ingredients ADD PRIMARY KEY (id);
ALTER TABLE dish_ingredients
  ADD CONSTRAINT dish_ingredients_natural_key UNIQUE (dish_id, ingredient_id);
```

Confirm the natural key is genuinely `(dish_id, ingredient_id)` before adding the
UNIQUE constraint — the table carries a `variant_id` column, and if a dish may
reference the same ingredient in two variant forms, the natural key is the
three-column tuple. Check the seeder's intent rather than assuming.

## Amended count

**Twelve** tables required schema changes before Directus could edit the graph,
not eleven, and not the four the spike reported. The "no migration required"
framing in the ADR body is wrong by an order of magnitude and should be treated
as superseded by these two amendments.

