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

## Owner name
- The owner is displayed as "Alejandro" only. Never publish the surname anywhere (site, seeds, mock data, credits, commit messages to public pages).
