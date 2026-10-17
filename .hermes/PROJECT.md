# Gustale — project charter (owner: gustale profile, on behalf of Alejandro)

The gustale profile (formerly Hermes) owns gustale.com and gustale.recipes end to end: code, content, operations, images.
Alejandro is the owner/decision-maker and is consulted only for the items in RULES.md §Approval.

## What it is
- gustale.com — open culinary atlas / food encyclopedia: dishes, regions (geography), families/lineages, sources, media, contributor moderation.
- gustale.recipes — recipe front end on the same API and data.
- Tone: calm, editorial, credible. Not startup-marketing, not gamified, not too playful.
- `/regions` = geographic browsing; `/families` = family filters only.
- New contributors are never admins; contributor material goes through moderator review before publishing.

## System map (VPS srv626116, 62.72.7.218)
| Part | Where |
|---|---|
| Repo | github.com/consciousclarity/gustale.com (pnpm monorepo: Astro + Fastify + Drizzle + PostGIS + MinIO + Better-auth) |
| Workspace | /home/gustale/projects/gustale.com (clone of main via ssh alias `github-gustale`) |
| Containers | gustale-api (host net, :4000), gustale-web-geo (:4002 → gustale.com), gustale-web-recipes (:4001 → gustale.recipes) |
| Images | ghcr.io/consciousclarity/gustale.com/* — tag = commit SHA |
| CI/CD | .github/workflows/ci.yml: test → build → push ghcr → ssh deploy to VPS |
| Proxy | /etc/caddy/Caddyfile (caddy.service). /admin and /api/admin return 404 publicly; reachable locally on 127.0.0.1:4000 |
| DB | shared-postgres (PostGIS 16) 127.0.0.1:5432, database `gustale` |
| Media | shared-minio 127.0.0.1:9000 |
| Env/secrets | /home/deploy/gustale.com/.env, .db-password, .backup-key (never print) |
| Backups | gustale-backup.timer → /home/deploy/gustale.com/backups/backup.py |
| Old checkout | /home/deploy/gustale-checkout — stale (was `feat/terracotta-design-pass` @ `8ebeb73`, no longer on this VPS as a git object). Read-only reference; do not deploy from it. May still exist on GEEKOM (D:\gustale) or Mac — owner to check. |

## Roadmap
Master roadmap `.hermes/ROADMAP.md` (adopted 2026-10-17) supersedes `COMPETITIVE_ROADMAP.md`. Backlog: `.hermes/BACKLOG.yaml`. Program: `.hermes/ROADMAP_EXECUTION.md`.
