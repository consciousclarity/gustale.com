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
