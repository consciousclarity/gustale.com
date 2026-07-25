# ADR-001: Sustainable dish persistence and publishing

**Status:** Proposed
**Date:** 2026-07-25
**Deciders:** Alex (product owner), Claude (orchestrator), Cursor (implementer), Hermes (ops)
**Supersedes:** the informal "append to `seed-data.ts`, re-seed, regenerate mock" workflow documented in `CLAUDE.md`

---

## Context

### How dishes are saved today

```
packages/db/src/seed-data.ts          source of truth (content, hand-edited)
    │  pnpm --filter @gustale/db run seed
    ▼
packages/db/src/seed.ts               idempotent runner (16 onConflict clauses)
    ▼
Postgres (prod 62.72.7.218)
    │  scripts/refresh-ss-mock.mjs
    ▼
apps/web/scripts/mock-api-data.json   committed snapshot, { generatedFrom, list, map, details }
    │  CI Docker build serves it on :8742 via mock-api.mjs
    ▼
Astro SSG → static dist → nginx
```

A **second, parallel path exists and is unused**: `apps/api/src/routes/dishes-write.ts`
is registered in `server.ts` and ships `POST /api/dishes`, `PATCH /api/dishes/:slug`,
`POST /api/dishes/:slug/publish`, `DELETE /api/dishes/:slug`, plus variant CRUD.
The web UI exists too (`dishes/new.astro`, `dishes/[slug]/edit.astro`). Nothing
written through it reaches `seed-data.ts`, so it never survives into a build.

### Measured state

| Artefact | Size at 121 dishes | Projected at 500 | At 1,300 |
|---|---|---|---|
| `seed-data.ts` | 5,075 lines / 180 KB | ~750 KB | ~2 MB |
| `mock-api-data.json` | 590 KB | ~2.4 MB | ~6 MB |
| Web build jobs | 15–20 min timeout | full rebuild per change | full rebuild per change |

`seed-data.ts` holds eight exported constants (`DISHES`, `CUISINE_CATEGORIES`,
`DISH_TYPE_CATEGORIES`, `DISH_RELATIONS`, `LINEAGE_METHODS`, `DISH_LINEAGES`,
`LINEAGES`, `JOURNEY_BEATS`) in a single file edited concurrently by two agents
and one human.

### The constraint that shaped the current design

GitHub Actions runner IPs are blocked by the VPS firewall, so **CI cannot reach
`api.gustale.recipes` at build time**. `mock-api.mjs` + a committed JSON snapshot
exist solely to work around this. Every downstream awkwardness follows from it.

### Requirements that invalidate the current design

Confirmed 2026-07-25:

1. **Public contributors eventually.** Strangers will submit dishes.
2. **Review required for outside contributions only.** Owner and agents publish directly.
3. **No ceiling on dish count.** Open-ended growth.

Requirement 1 alone is fatal to the current model: *a member of the public
cannot contribute to a TypeScript constant.* Requirement 3 is fatal to full-SSG
rebuild-on-every-change. Requirement 2 is already supported by the existing
role-gated publish endpoint and `edit_history` table.

---

## Decision

**Promote Postgres to source of truth for dish content. Demote `seed-data.ts`
to a bootstrap fixture. Replace the committed mock JSON with a build-data
snapshot published to MinIO. Move dish detail pages from pure SSG to hybrid
rendering.**

Phased, because the jump is large and each phase is independently valuable.

---

## Options Considered

### Option A — Git-canonical, split into per-dish files

Keep git as truth; break `seed-data.ts` into `content/dishes/<slug>.yaml` (or
`.ts`), seed by reading the directory.

| Dimension | Assessment |
|---|---|
| Complexity | Low |
| Cost | Very low |
| Scalability | Poor beyond ~500 |
| Team familiarity | High — no new concepts |

**Pros**
- Kills merge conflicts between agents immediately
- Diffs become reviewable again; one dish = one file
- Content stays in PR review, which enforces the citation rule structurally
- No infrastructure change at all

**Cons**
- **Does not support public contribution.** A stranger cannot open a PR against a private repo, and requiring a GitHub account is a hard filter on contributors
- Still triggers a full SSG rebuild per dish
- Still requires manual mock regeneration
- Postpones the real decision by roughly one year

### Option B — DB-canonical, snapshot artefact for builds

Postgres becomes truth. Contributions arrive via the existing write API +
moderation queue. A build-data snapshot is exported to MinIO and downloaded by
CI, replacing the committed JSON.

| Dimension | Assessment |
|---|---|
| Complexity | Medium |
| Cost | Low — MinIO already runs, buckets exist |
| Scalability | Good to several thousand |
| Team familiarity | Medium — new export/publish step |

**Pros**
- Public contribution becomes possible; `seed-data.ts` stops being a bottleneck
- **Solves the CI firewall problem properly** — CI pulls a static artefact from
  object storage rather than reaching the API. No firewall change, no IP
  allowlist to maintain
- Removes 590 KB (and growing) of churning JSON from git history
- `seed-data.ts` shrinks to a small bootstrap fixture for fresh environments and CI tests
- Snapshot doubles as the disaster-recovery export and the seed of the public
  data dump in roadmap P3-2

**Cons**
- Content review moves from PR diffs to a moderation UI that **does not exist yet**
  (roadmap P2-4, currently `todo`, unassigned)
- Losing the DB now means losing content; backup discipline becomes load-bearing
- Still a full rebuild per publish, so "approve a dish → see it live" is minutes not seconds

### Option C — DB-canonical + hybrid rendering

Option B, plus dish detail and list pages move from build-time static to
server-rendered with cache, keeping only marketing and index pages static.

| Dimension | Assessment |
|---|---|
| Complexity | High |
| Cost | Medium — SSR containers per domain, cache tuning |
| Scalability | Unbounded |
| Team familiarity | Low — new runtime model |

**Pros**
- Publishing is effectively instant; no deploy in the content loop
- Build time stops scaling with dish count
- The only option that genuinely satisfies "no ceiling"

**Cons**
- Two Astro builds (`build:geo`, `build:recipes`) currently produce static dists served by nginx; this changes the deployment topology
- Every page view now depends on API and DB availability — today a DB outage leaves static pages serving fine
- Cache invalidation becomes a real problem to own
- Largest blast radius; hardest to reverse

---

## Trade-off Analysis

**A is genuinely tempting and genuinely wrong here.** It is cheap, fixes the
pain being felt *today* (merge conflicts, unreviewable diffs), and requires no
new infrastructure. If the answer to "who authors dishes" had been "agents via
PR only", A would be the correct decision and this ADR would be one page long.
It fails on exactly one requirement — public contribution — and that requirement
is not negotiable per the roadmap's own contribution loop (P2-4, P2-5).

**C is where this ends up and should not be built first.** The moderation queue,
image upload, and export pipeline all have to exist before public contribution
is real, and none of them require SSR. Jumping to C now means changing the
deployment topology before there is any content pressure justifying it, while
the actual blockers (no moderation UI, no export) remain.

**B is the load-bearing step.** It unblocks contribution, kills the worst
artefact (committed 590 KB JSON), and solves the firewall constraint that has
distorted the architecture since June — without touching how pages are served.
C then becomes a rendering change in isolation, made when build times actually
hurt, rather than a simultaneous rewrite of persistence *and* rendering.

**On losing PR review of content.** This is the real cost of B and should not be
glossed. Today, every dish passes through a diff a human reads, which is why the
"no unsourced stubs" rule has held. Moving to a moderation UI replaces a
mechanism that works with one that does not exist yet. Mitigation: B is not
considered done until the moderation queue ships, and direct publish stays
restricted to owner and agent accounts until then.

---

## Consequences

### Easier
- Adding a dish stops requiring a PR, a CI run, and a deploy
- `seed-data.ts` becomes a ~200-line fixture instead of a 5,000-line contested file
- Two agents can add content concurrently without conflicts
- CI stops depending on a hand-regenerated snapshot that has been pushed in the wrong shape three times historically (see `SHARED_STATE.md`, "mock-api-data.json SHAPE HAZARD")
- The export artefact is most of roadmap P3-2 (public data dump) for free

### Harder
- Database backups become load-bearing rather than a nice-to-have
- Content quality now depends on a moderation UI rather than on PR review
- Two write paths coexist during migration; divergence is the main migration risk
- Rollback of a bad content change means a DB operation, not a `git revert`

### To revisit
- When build time exceeds roughly 15 minutes or dish count passes ~800, execute Option C
- Whether `seed-data.ts` should be deleted entirely once the fixture is stable
- Whether the snapshot should be public from day one (roadmap P3-2) or internal first

---

## Action Items

### Phase 0 — stop the bleeding (Cursor, ~1 day, do now)
1. [ ] Split `seed-data.ts` into per-entity modules (`dishes.ts`, `relations.ts`, `lineages.ts`, `journeys.ts`) re-exported from an index. Pure refactor, no behaviour change. Buys reviewability immediately and is not wasted work under any option.
2. [ ] Add a seed-time validator: every dish must have a `wikipediaSlug` or a `sources` entry; fail the seed otherwise. Encodes the citation rule in code rather than in review discipline.

### Phase 1 — snapshot artefact (Cursor + Hermes, ~3 days)
3. [ ] Write `scripts/export-build-snapshot.mjs` — reads prod DB, emits the `{ generatedFrom, list, map, details }` shape, uploads to the existing `gustale-public` MinIO bucket with a content hash in the key
4. [ ] CI `build-web` downloads the snapshot instead of reading the committed JSON; `mock-api.mjs` serves the downloaded file. **Keeps the firewall workaround, removes the git churn**
5. [ ] Remove `apps/web/scripts/mock-api-data.json` from the repo; keep a minimal fixture for tests
6. [ ] Hermes: verify the snapshot round-trips and that a build from artefact produces byte-identical output to a build from the committed JSON

### Phase 2 — DB becomes canonical (Cursor, ~1 week)
7. [ ] Ship the moderation queue (roadmap P2-4) — **hard prerequisite, not optional**
8. [ ] Ship image upload UI (roadmap P2-5) so contributed dishes can carry media
9. [ ] Reduce `seed-data.ts` to a bootstrap fixture (~20 dishes) for fresh envs and CI tests
10. [ ] Document the new authoring flow in `CLAUDE.md`, replacing the current "append to seed-data.ts" instructions
11. [ ] Establish DB backup cadence and a tested restore procedure — Hermes owns this and it gates Phase 2 sign-off

### Phase 3 — hybrid rendering (deferred)
12. [ ] Trigger: build time > 15 min or dish count > 800
13. [ ] Move `/dishes/[slug]` and list pages to SSR with cache; keep index and marketing static

---

## Notes

- The write API and edit wizard already exist and are unused. Phase 2 is mostly
  *connecting* what is built, not building new surface.
- `edit_history` already records every create and update, giving the moderation
  queue its timeline for free.
- MinIO (`gustale-public`, `gustale-media`) is provisioned and largely idle. The
  snapshot artefact needs no new infrastructure.
- Existing related backlog items: P2-4 moderation queue, P2-5 image upload,
  P3-2 public read API, P2-3 seed enrichment.
