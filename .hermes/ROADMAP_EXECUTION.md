# Executing the master roadmap — operating program for the gustale profile

Owner decision 2026-10-17: `.hermes/ROADMAP.md` is the master roadmap. `.hermes/BACKLOG.yaml` is the
tracked task list (223 tasks, GUS-001…GUS-223). This file says how to run it. RULES.md still wins on
anything about approvals, secrets and safety.

## 1. What to work on (pick order)

1. Anything that is broken live (site down, deploy failing, data loss) — always first.
2. The **first 15** in `first15_order` (ROADMAP §21), respecting `depends_on`.
3. Then by phase (0 → 6). Never start a task whose phase gate below is not met, except
   read-only research/audit tasks, which may run ahead.
4. Image work already in flight (Indonesian batch under IMAGE_STYLE.md) continues in parallel —
   it is GUS-153/161 territory and does not block Phase 0.

### Phase gates (from ROADMAP §21)
| Gate | Required before moving on |
|---|---|
| 0 → 1 | GUS-001 report merged; GUS-002 closed with a test; GUS-005 deploy order fixed; GUS-011 integrity report exists |
| 1 → 2 | Entity model (GUS-014) + evidence policy (GUS-026) + claim citations (GUS-028) live on the 3 reference dishes |
| 2 → 3 | Rendang, Chicken Tikka Masala, Tacos al Pastor complete end-to-end (ROADMAP §22) |
| later | per ROADMAP §21 "Release condition" column |

**No bulk content generation** (new dishes, mass rewrites of descriptions) before gate 1 → 2.
Images for existing dishes are allowed.

## 2. The three reference dishes
`rendang`, `chicken-tikka-masala`, `tacos-al-pastor` (all exist, API 200 on 2026-10-17).
They are the acceptance fixtures for every structural change: each schema/UI PR must show these
three pages still render, and from Phase 1 on, must show the new capability on them.

## 3. Per-task loop
1. Set `status: in_progress` in BACKLOG.yaml; write the acceptance criteria (ROADMAP §23 template).
2. Inspect before changing (repo, schema, migrations, tests, live). Note what already exists.
3. Branch `gus-NNN-<slug>`, small PR, title `GUS-NNN: …`. One task (or a tightly coupled pair) per PR.
4. Migrations: versioned, reversible where possible, `gustale-backup.service` run first.
   Anything that drops/renames/merges data → `approval: true` → ask Alejandro before that step.
5. Merge on green CI. Verify live (API + both domains + the 3 reference dishes).
6. Set `status: done` with `evidence:` (PR URL, merge SHA, test names, live check output).
7. One-line log in TASKS.md (private/state).

## 4. Reporting to Alejandro
- Short message per merged PR: task id, what changed, live proof. No essays.
- Daily summary when anything moved: done / in progress / blocked / needs your decision.
- Ask only for RULES.md §Approval items, and batch the questions.

## 5. Credibility rules specific to this roadmap
- Never invent citations. A source enters the registry only after the page was actually fetched and
  the claim found in it. Record URL + access date + locator.
- Wikipedia/Wikidata = discovery only; never the sole source for a contested origin claim.
- Disputed origins are written as disputed (CTM/Glasgow is the test case).
- `kitchen-tested` is set only by a human; Hermes may use documented / adapted / reconstructed.
- AI images: labelled "AI illustration · MiniMax image-01 · <date>" (IMAGE_STYLE.md), provenance
  stored, never described as photography of a real place or event. Licensed photos keep their credit.
- Owner is displayed as "Alejandro" only; the surname is never published anywhere.

## 6. Technology guardrails (ROADMAP)
Keep Fastify, Postgres/PostGIS, Astro+React, MapLibre, MinIO, current CI. Graph = relational edge
tables + recursive CTEs (no Neo4j). Search = Postgres FTS + pg_trgm first (no Meilisearch/vector DB
until measured need). New paid services or external accounts = approval.
