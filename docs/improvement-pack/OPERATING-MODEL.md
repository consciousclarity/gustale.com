# Operating model

## Roles

| Actor | Runs on | Owns | Never does |
|---|---|---|---|
| **Hermes · gustale profile** (MiniMax M3) | Hermes host | Queue and Kanban, dispatching, smoke runs, Telegram reports, `STATUS.md` / `HANDOFF.md`, bulk proposals (classification, first drafts, image generation via MiniMax image-01) | Edit application code; merge; deploy; write to the production database |
| **Codex** (`codex` CLI) | Repo worktree | API routes, database queries, data scripts and migrations (as files, not applied), build and data pipeline, tests | Frontend styling; apply migrations; deploy |
| **Claude Code** (`claude` CLI) | Repo worktree | Astro pages and components, UX copy, accessibility and mobile, page templates; **reviews every Codex change**; fact-checks content against fetched sources | Apply migrations; deploy |
| **Alex** | Telegram | Approves merges, deploys, DB writes, product decisions | — |

**Review rule:** the agent that wrote a change never reviews it. Codex output is reviewed by Claude Code; Claude Code output is reviewed by Codex. Hermes forwards the review verdict, not its own opinion.

**Fallback rule:** for code, fall back only between Codex and Claude Code, and say so in the report ("WP-01b: Codex unavailable, written by Claude Code, reviewed by Codex"). Do not fall back to MiniMax or Gemini for repository edits. For content and classification, MiniMax is the primary model.

**Provenance rule:** a report may say "Codex did X" or "Claude Code did X" only with evidence: the command run, the exit code, and the commit hash.

## Flow for every work package

1. **Discovery (read-only).** The assigned agent answers the brief's discovery questions with file paths and line numbers. Hermes posts the summary. No edits yet.
2. **Plan.** The agent proposes the exact files to change. If the plan touches anything in "Needs Alex" below, Hermes asks first.
3. **Build in a new worktree.** `<repo>/.worktrees/wp-XX-<slug>` on branch `wp/XX-<slug>`. Never reuse, reset, stash or delete an existing worktree.
4. **Local checks.** Build, unit tests, and the smoke test against a local or staging URL (`--base`).
5. **Cross-review.** The other agent reviews the diff against the brief's "Done when". Findings are fixed in the same branch.
6. **Ask Alex.** Hermes posts the merge request (format below) and waits for an explicit, operation-scoped yes ("merge WP-01", "deploy WP-01"). "Always" or session-wide approvals do not count.
7. **After deploy.** Hermes runs `node scripts/gustale-smoke.mjs --wp WP-XX --json reports/smoke-<date>-WP-XX.json` against production. It updates `STATUS.md` only if the package's checks are green.
8. **Rollback.** Every deploy message names the rollback (previous commit or tag). If a production smoke check regresses, Hermes reports it and proposes the rollback; it does not roll back on its own.

## Needs Alex (always ask first)

- Merge to main, deploy, or restart a service
- Any write to the production database, including bulk imports, merges or deletes of dishes
- Changes to the server, firewall, CI secrets or DNS
- Product decisions listed in `ROADMAP.md` (D1–D6)
- Publishing new content (dishes, lineages, pages) and any public-facing text about policy or licence
- Anything touching another project (Marena, bali.business and others) or another Hermes profile

## Guardrails

- Secrets: environment-variable names only in briefs, logs and reports; never values.
- On the site, the owner's name appears as "Alejandro" only.
- No invented sources. A citation goes into content only if an agent fetched the URL in this run and the page supports the claim. Unverifiable claims stay unpublished or marked "unevidenced".
- AI images stay labelled "AI-generated", in the documentary field-photography style already chosen.
- Fail closed: if a check is ambiguous, report it as not done.

## Telegram report format

```
WP-01 · Browsing fixes · ready for merge
Done: featured cover paths fixed (API), region filter server-side, H1 "Dishes", loaders resolve
Evidence: commit a1b2c3d · build ok · smoke (staging) WP-01 5/5 PASS
Review: Claude Code reviewed Codex diff — 1 finding fixed (missing encodeURIComponent)
Risk: low · Rollback: redeploy tag pre-wp-01
Needs you: reply "merge WP-01" then "deploy WP-01"
```

Blocked reports: what is blocked, why, what was verified, and the smallest action needed from Alex.
