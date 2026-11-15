# WP-00 · Baseline and setup

**Owner:** Hermes (gustale profile). **Mode:** read-only, except adding files under `docs/` and `reports/` on a branch.

## Goal
Confirm where everything really runs, put the smoke test into the repo, and record today's baseline, so every later package has a fixed starting point.

## Steps
1. **Locate the system.** Report with evidence (command and output):
   - Repo path and host. Memory says `/home/alex/workspace/gustale.com`; confirm which machine.
   - Git remote, default branch, existing worktrees (`git worktree list`). List them; do not touch them.
   - Stack: Astro version, API framework, database (engine and where it runs), media store.
   - Build and deploy path: what builds the site (CI, VPS or local), how it gets to production, how to roll back.
   - Whether production pages are static (SSG), server-rendered (SSR) or mixed. Name the Astro adapter and `output` setting.
   - Whether the build reads live API data or mock data. Search for mock or fixture data used by `/regions`, `/families`, `/lineages`.
   - Staging environment: does one exist? Its URL?
2. **Install the smoke test.** Copy `scripts/gustale-smoke.mjs` to `<repo>/scripts/smoke/`. Install Playwright on the Hermes host if absent (`npm i -D playwright && npx playwright install chromium`).
3. **Record the baseline.** `node scripts/smoke/gustale-smoke.mjs --json reports/smoke-baseline.json`. Compare with `scripts/baseline-2026-11-11.json`; report any differences.
4. **Set up tracking.** One Kanban card per WP from `ROADMAP.md`, with dependencies. Add a "Gustale improvement" section to `STATUS.md` that links to this pack.
5. **Commit** on branch `wp/00-baseline`: the pack, the smoke script and the baseline report. Ask Alex before merging.

## Report
- The answers to step 1, each with its evidence
- Smoke summary (expected: about 25 FAIL)
- Anything in the pack that contradicts what you found, e.g. "API filtering already exists for X"
- Proposed analytics setup for decision D4 (tool, host, effort). Do not install it.

## Done when
Alex has the report and replies "WP-00 approved".
