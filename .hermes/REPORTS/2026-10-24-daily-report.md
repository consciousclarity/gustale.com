# Gustale — 2026-10-24 daily report

**Verified at 2026-10-24T15:26:15Z.**

## Shipped

| PR | What | Merge SHA |
|---|---|---|
| #94 | dependabot dev-direct group (5 updates) | `4157579` |
| #96 | dependabot prod-direct group (17 updates), rebased + lockfile regenerated | `2a402c6` |
| #98 | dependabot prod-direct group (2 more updates) | `1116131` |
| #99 | GUS-008 deploy verification report | `5e67767` |
| #100 | style the DishGallery lightbox credit + license | `5044617` |

### GUS-006 — branch consolidation (P0, was `in_progress`)

**27 remote branches → 4.** Deleted 23:

- 13 with merged PRs: #50, #63, #64, #65, #67, #70, #72, #73, #74, #76, #78, #79, #91
- 6 closed-no-merge that already carried a verified-matching archive tag:
  `cursor/gallery-and-nav-editorial-6cb3`, `feat/lineages-data-fix`,
  `feat/site-sophistication-pass`, `feat/taxonomy-foundation`,
  `feat/homepage-globe-v1`, `fix/dishes-search-pagination`
- `head` — tip `625b21f` (astro bump) already in main via #60; archive tag pushed first
- `fix/gallery-lightbox-credit` — superseded by #100
- my own temp branches, each archive-tagged first

**22 archive tags on origin.** Recovery proven by fetching two archived tips back
(`feat/homepage-globe-v1` → `04ac0c26`, `fix/dishes-search-pagination` → `f7d2ed03`).

**Remaining 4 branches:** `main`, `private/state` (shared agent state — KEEP),
`claude/api-auth-divergence-resolved` (no PR — needs an owner decision),
`feat/content-copy-2026-07-24` (PR #57 open).

### GUS-008 — deploy verification (P0)

All five required capabilities verified live; report at
`.hermes/REPORTS/2026-10-24-GUS-008-deploy-verification.md`.

- dedicated build checkout `/home/deploy/gustale-build`
- `gustale-rebuild-web.timer` active, 30 min, `flock` inside the script
- content-change detection: two consecutive runs (12:53:25Z, 13:23:26Z) correctly
  exited with "No content change detected"
- CI `Real verify` step: per-run deploy log + `docker inspect` on all 3 containers
  + live-page phrase
- live-page check: bakso phrase present on both domains

### GUS-007 — GHCR token (P0) — resolved as a non-blocker

CI pushes succeed because the workflow grants `packages: write` on its own
`GITHUB_TOKEN`. The VPS rebuild path runs with `GUSTALE_NO_PUSH=1` and never
pushes, so the repo-scoped token's missing `write:packages` scope blocks
nothing today. No token rotation needed unless VPS-side pushes are wanted.

### Dependency advisory delta (`pnpm audit --prod`)

| Tree | critical | high | moderate | low |
|---|---|---|---|---|
| main before | 0 | 28 | 20 | 6 |
| after #96 | 0 | 23 | 17 | 6 |

0 critical throughout. The remaining 23 HIGH prod advisories are the
GUS-006.b clusters (fastify first) — still open.

### PR #77 → #100 (the lightbox credit)

#77's JSX had already been merged by #78; only its CSS was missing, so the
credit and license rendered unstyled. Rebased onto main, conflict resolved as
main's JSX + #77's CSS. Net diff: 23 lines of CSS. Biome format applied
(the long `linear-gradient` line is a CI-gate **error**, not a warning).
Local lint 0 errors / 488 warnings / 36 infos — identical to main.

## Live

```
gustale-api:         ghcr.io/.../gustale-api:5044617eb53da926d5a7f4ed8975ceb470964862
gustale-web-recipes: ghcr.io/.../gustale-web-recipes:live-data-5044617
gustale-web-geo:     ghcr.io/.../gustale-web-geo:live-data-5044617
GET /health -> {"status":"ok","timestamp":"2026-10-24T15:26:16.133Z"}
```

Long descriptions rendering on **both** domains: bakso ✅ pempek ✅
nasi-goreng ✅ biryani-hyderabadi ✅

Note the tag shapes differ: the API image uses the full 40-hex SHA, the web
images use `live-data-<7-char>`. Any verify step must compare like-for-like.

## Blocked / needs a decision

1. **Who drives Gustale work.** The `gustale` profile (own bot `8600970094`,
   own workspace `/home/gustale/projects/gustale.com`, own credentials) owns
   the roadmap and did PRs #75–#93. Three gateways listen on this same chat.
   I asked; the question timed out. I proceeded with work the standing rules
   mark autonomous, and worked in the `gustale` workspace since that is the
   project's own workspace per `RULES.md`.
2. **`.hermes/BACKLOG.yaml` is a protected agent-instruction file.** My write
   to it was gated behind an approval prompt that timed out, so the GUS-006 /
   GUS-007 / GUS-008 status + evidence updates are **not** in the backlog yet.
   The evidence is in the #99 report instead. Needs either an approved write
   or the owning profile to apply it.
3. **PR #57** — 60 AI-generated dish images, open since 2026-07-25. Needs a
   merge/close decision and its own scope check against `IMAGE_STYLE.md`.
4. **`claude/api-auth-divergence-resolved`** — no PR, kept per the archive rule.
   Needs an owner decision.
5. **GUS-006.b** — 23 HIGH prod advisories remain, in 10 clusters, fastify first.
6. **Content coverage (read-only measurement, 121 published dishes):**
   - 21/121 have long descriptions — 11 India batch (with inline
     `[Source: Wikipedia — …]`), 10 Indonesia batch-1 (no inline citation)
   - 100/121 have none
   - ingredients: **0** on every dish checked; media/covers: **0**
   - `sources`/`citations` tables already exist with full fields, but there is
     **no API route** for either, and no `claims` table — so GUS-027/GUS-028 are
     structurally further along than the backlog suggests, but not usable yet
7. **Roadmap gate 0 → 1 is met** (GUS-001, 002, 005, 011 all done). Next
   unblocked work is Phase 1: GUS-026 evidence policy → GUS-027 source
   registry → GUS-028 claim-level citations, demonstrated on the three
   reference dishes (rendang, chicken-tikka-masala, tacos-al-pastor).
   `ROADMAP_EXECUTION.md` forbids bulk content generation before gate 1 → 2,
   so "Japan descriptions next" is off the table until those land.
