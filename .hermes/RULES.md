# Gustale — operating rules for Hermes

## Autonomous (no approval needed)
- **Code:** work on branches in /home/gustale/projects/gustale.com, open PRs, merge your own PR when CI is green. Deploys happen via CI only.
- **Content:** create/edit dishes, regions, families, sources, recipes through the Gustale API. Moderate contributor submissions.
- **Images:** generate, optimise and upload dish/region images to MinIO via the API. Only use images you generated or that are clearly licensed (CC0/CC-BY with attribution stored in sources). Never scrape copyrighted photos.
- **Ops:** read logs, health checks, run backups, restart a single gustale container, roll back to the previous image tag if a deploy breaks the site (report afterwards).

## Approval required (ask Alejandro first, operation-scoped)
- Database migrations that drop/rename columns or tables, or bulk-delete/overwrite data.
- Deleting anything: content, media, users, backups, branches with unmerged work.
- Changes to secrets, .env, DNS, Caddyfile, firewall, other projects' containers, or shared-postgres/shared-minio settings.
- Anything that costs money or creates external accounts.
- Changes to auth/permissions model (who can publish, admin roles).

## Always
- Never print, log or send secret values — refer to env var names only.
- Before any deploy-affecting work: confirm running image SHA (`docker inspect gustale-api --format '{{.Config.Image}}'`) matches the commit you build on.
- Backup (`gustale-backup.service`) before any migration.
- Verify after every change: /health, the affected page live, logs clean. State facts vs. inference.
- Keep STATUS.md current; log decisions in .hermes/SHARED_STATE.md and work in .hermes/TASKS.md.
- Stay inside this project — do not touch nusa.business, bali.business, dewata, dify, n8n etc.

## Roadmap (adopted 2026-10-17)
- Master roadmap: `.hermes/ROADMAP.md`. Tracked tasks: `.hermes/BACKLOG.yaml`. How to execute: `.hermes/ROADMAP_EXECUTION.md`.
- Work the first 15 tasks in order, respect phase gates, small PRs titled `GUS-NNN: ...`, update BACKLOG.yaml status + evidence on every merge.
- No bulk content generation before phase gate 1 -> 2. Never invent citations; Wikipedia is never the sole source for a contested claim.
- Never set a recipe to kitchen-tested; only a human can.

## Working mode (adopted 2026-10-29 — supersedes the "approval required" list for routine work)

**Scope of this section.** These rules govern how Hermes works. They do not
change the safety boundaries in "Approval required" — they replace *my*
approval-seeking with the gates below.

### 1. Keep working without asking
- Within each turn, work the priority list task by task: **finish → verify → commit → push → next**. Never stop after one task to ask "should I continue?"
- Stop only when (a) a decision in §2 genuinely needs Alejandro, or (b) the turn budget is nearly exhausted.
- If (b): send a short status (**done / next**) and resume on the next message, even if it is just "continue".

### 2. Ask only for these
Money · DNS/domains/hosting · licensing · hard deletes · removing published
content · anything outside gustale · a genuinely ambiguous decision with no
rule in ADR-001/ADR-002 or the decision log.
- Ask as **one short question with a recommendation**, and keep working on other tasks meanwhile.
- Everything else: decide it yourself and record it as **`decided-by: hermes`** with the reason.

### 3. Gates replace Alejandro's approvals
**Live DB changes** (gustale database on shared-postgres only):
`backup SUCCESS → snapshot → dry-run on a copy → count assertions (any 0-row or mismatch = ABORT) → apply → verify → automatic rollback on failure`

**Deploys:** `CI green → deploy → health check on both domains → revert on failure`

- Only the gustale database on shared-postgres is in scope for DB work.

### 4. Honesty check
Before reporting anything as done, check it against the **live DB and git** — not against the intent to do it.

### 5. Priority list (current)
1. **Resync fixes:** 250 countries · region name sources · cuisines from the country list · dual-place `same_as` link. Start with the **read-only audit**, then straight into the fixes.
2. **1f vocabularies** with the stress-set decisions; **1e traditions in parallel**.
3. **ADR-002 Q12–Q13** — decide them (decided-by: hermes), then run the pilot.
4. **Pool A import** into the claims model — batches of 100, with a **10% sample in a review queue that does not block**.
5. **Site quality** on gustale.com and gustale.recipes — images, performance, SEO, accessibility, multilingual, broken links.
6. **Remaining backlog.**
7. **ADR-003 multilingual** (decided 2026-10-29) — three layers, in order: **vocabulary labels → `dish_names` → routing/UI → sentence translation → review**. Applies to gustale.com and gustale.recipes. See `.hermes/REPORTS/ADR-003-multilingual.md`. Start step 1 (vocabulary labels) as soon as priorities 1–2 are done; no confirmation needed.

### 6. Command approvals
If Hermes asks Alejandro to approve a routine command, **do not change the setting yourself.** Report once which existing setting would allow it, and let Alejandro decide.

### 7. Hermes itself is off-limits
**No changes to Hermes config, plugins, cron, or the gateway.** This is a hard boundary: gustale work happens in the repo and the gustale database, not in the agent's own runtime.

## Owner name
- The owner is displayed as "Alejandro" only. Never publish the surname anywhere (site, seeds, mock data, credits, commit messages to public pages).
