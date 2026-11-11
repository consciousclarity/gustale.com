# Gustale improvement pack — start here

Prepared 2026-11-11 from the gustale.com audit. For the Hermes **gustale** profile, Claude Code (`claude` CLI) and Codex (`codex` CLI).

## The recommendation

1. **Hermes orchestrates, it doesn't code.** The gustale profile, on MiniMax M3, owns the queue, dispatching, smoke tests, Telegram reports and `STATUS.md` / `HANDOFF.md`. It also does the bulk work MiniMax is cheap at: classification proposals, first drafts and images.
2. **Codex owns the API and data side; Claude Code owns the frontend and reviews.** Every change is written by one and reviewed by the other. Neither merges or deploys.
3. **You approve four things:** merges to main, deploys, database writes, and the product decisions listed in `ROADMAP.md`. Nothing else should need you.
4. **The smoke test is the definition of done.** `scripts/gustale-smoke.mjs` runs read-only against the live site. Today's baseline is 25 FAIL, 6 PASS, 1 WARN (`scripts/baseline-2026-11-11.json`). A work package is done when its checks turn green on production, not when an agent says so.
5. **Start with WP-00 → WP-01 → WP-02.** These fix what's broken today in about a week. Content work (WP-08) starts only after the taxonomy (WP-05/06) is decided, or the content gets written twice.

## What's in the pack

| File | Purpose |
|---|---|
| `OPERATING-MODEL.md` | Roles, routing, branch and review flow, approval gates, Telegram report format |
| `ROADMAP.md` | Work packages in order, owner, dependencies, your decisions, smoke checks per package |
| `TELEGRAM-KICKOFF.md` | The messages to send Hermes, in order |
| `tasks/WP-00 … WP-10` | One self-contained brief per work package, to hand to the assigned agent |
| `scripts/gustale-smoke.mjs` | Live acceptance test (Node 18+; Playwright optional for browser checks) |
| `scripts/baseline-2026-11-11.json` | Today's results, for comparison |

## How to load it

1. Copy the folder into the Gustale project, e.g. `<repo>/docs/improvement-pack/`. WP-00 has Hermes verify the real repo path first; memory says `/home/alex/workspace/gustale.com`, but which host that is must be confirmed.
2. Send the first message in `TELEGRAM-KICKOFF.md`.
3. Answer Hermes's WP-00 report. Approve WP-01 when it asks.

## Two root causes found while building the pack

- **Home images (12 of 12 broken):** `/api/dishes/featured` returns cover paths as `dishes/<slug>/cover-800w.webp`, with no `/media/` prefix and no leading slash. `/api/dishes` returns `/media/dishes/...`. The browser resolves the relative path to `/dishes/...`, which 404s. This is a one-line API fix (WP-01).
- **Places and Families out of date (36 vs 178 countries, 22 vs "123" families):** most likely the same problem recorded earlier for Gustale, where CI could not reach the live API through the VPS firewall and built from mock data. WP-02 verifies this before changing anything.
