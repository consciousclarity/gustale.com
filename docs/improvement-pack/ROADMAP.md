# Roadmap

Effort is agent-assisted calendar time including review and your approvals, assuming one package in flight per agent. Smoke IDs refer to `scripts/gustale-smoke.mjs`.

## Phase 1 — Stop the leaks (weeks 1–2)

| WP | Title | Writes / reviews | Depends | Effort | Done when (smoke) |
|---|---|---|---|---|---|
| 00 | Baseline and setup | Hermes | — | 0.5 day | Repo, hosts and deploy path confirmed; smoke test in repo; baseline committed |
| 01 | Browsing works | Codex (API) + Claude Code (UI), cross-review | 00 | 2–3 days | All `WP-01` checks PASS |
| 02 | Indexes from live data, with a count gate | Codex / Claude Code | 00 | 2–3 days | All `WP-02` checks PASS |
| 03 | Hide what isn't real | Claude Code / Codex | 01, **D1–D3** | 1 day | All `WP-03` checks PASS |
| 04 | Corrections link and search in the hero | Claude Code + Codex / cross | 01 | 1–2 days | All `WP-04` checks PASS; a test suggestion reaches the moderation queue |
| — | Analytics | Hermes proposes, Alex approves | 00, **D4** | 0.5 day | Events visible for page views, search, filter clicks |

## Phase 2 — Make the core valuable (weeks 3–8)

| WP | Title | Writes / reviews | Depends | Effort | Done when |
|---|---|---|---|---|---|
| 05 | Taxonomy and dish page v2 design | Claude Code / Codex | 02, **D5** | 2–3 days | Alex approves facet lists and page wireframe |
| 06 | Classify all 1,474 dishes | MiniMax proposes; Codex pipeline; Claude Code samples | 05 | 4–6 days | `WP-06 taxonomy-coverage` PASS (≥95%); sample error rate under 10% |
| 07 | Dish page v2 template | Claude Code / Codex | 05 | 4–5 days | `WP-05 mobile-description-above-fold` PASS; template live on 10 pilot dishes |
| 08 | 100 Indonesian dishes to v2 standard | MiniMax drafts; Claude Code fact-checks; Alex spot-checks | 06, 07, **D6** | 3–4 weeks, in batches of 10 | 100 dishes with 2+ verified sources, one not Wikipedia |
| 09 | Lineages: fix, link from dishes, define confidence | Claude Code + Codex | 06 | 3–4 days | All `WP-09` checks PASS |
| 10 | Data hygiene | Codex / Claude Code; Alex approves each merge | 02 | 2–4 days | All `WP-10` checks PASS (WARN on covers acceptable) |

## Phase 3 — Reasons to return (after week 8, no briefs yet)

- **WP-11** Country pages for the top 10 origins (needs 06, 08)
- **WP-12** Lineage journeys as a map or timeline (needs 09)
- **WP-13** Saved list in the browser; monthly "one journey" email once 6+ journeys exist
- **WP-14** Reopen contributions, translations one language at a time, recipe links once gustale.recipes has recipes

Write briefs for these after Phase 2 analytics are in, so they're aimed at what visitors actually use.

## Your decisions (Hermes asks when the dependent WP starts)

| ID | Question | My recommendation |
|---|---|---|
| D1 | View counts: every dish shows 1,812–2,900 views. Are they real? | If seeded, reset to real counts and hide counts below 50, or hide them entirely |
| D2 | Languages: the Spanish page is only partly translated | Hide language switcher and banner until a language is complete |
| D3 | "Add a dish" and Recipes links point to an empty site | Replace with "Suggest a source or correction"; restore when recipes exist |
| D4 | Analytics tool | Self-hosted Umami on the VPS: no cookies, no cloud traces |
| D5 | Facets (WP-05 proposes lists) | Approve form, course, method, main ingredient, origin; drop "X cuisine" as a family |
| D6 | Content licence and Wikipedia-derived text | State a licence on About; attribute Wikipedia-derived "About this dish" text per CC BY-SA, or rewrite it |
