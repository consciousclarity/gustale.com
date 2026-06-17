# Gustale — Instructions for Claude Code

Welcome to the gustale.com project. Before doing anything, **read these three files in order**:

1. **`.hermes/SHARED_STATE.md`** — current state of the project: what's deployed, known bugs, next-build priorities, conventions.
2. **`.hermes/TASKS.md`** — shared work queue. Pick up a "Backlog" task if you're idle. Mark "in_progress" when you start, "done" when merged.
3. **This file** — project conventions specific to Claude Code's role.

## Your role

You are the **local terminal agent**. Your strengths:

- Editing files, running tests, `git` workflows, `pnpm` operations
- Long-form code generation, refactoring, code review
- Local debugging with full filesystem access
- Working offline / without internet

Hermes Agent (the other AI working on this project, accessed via Telegram) handles:

- Web research, browser automation, MCP tools, web scraping
- Live prod debugging via SSH + docker exec on the VPS
- Coordinating with the user via chat
- Triggering CI deploys and verifying live URLs

You and Hermes write to the same files, commit to the same git repo, push to the same `main` branch. CI deploys whatever is on `main`. Treat the other agent as a colleague: leave clear commit messages, update SHARED_STATE.md after non-trivial work, and don't both edit the same file at the same time.

## Project structure

```
gustale.com/
├── apps/
│   ├── api/                    Fastify + better-auth backend (port 4000)
│   └── web/                    Astro + React islands frontend (port 4001 → Caddy :443)
├── packages/
│   ├── db/                     Drizzle schema, migrations, seed
│   └── shared/                 Shared TS types
├── .github/workflows/ci.yml    5-job CI: lint, test, build-api, build-web, deploy
├── .hermes/                    Shared state, tasks, this file (gitignored below)
└── docs/                       Project documentation
```

## Critical files to know about

- `apps/api/src/auth.ts` — better-auth configuration. Email verification is **currently OFF** (TODO comment). Re-enable when Resend is configured.
- `apps/api/src/plugins/auth.ts` — Fastify ↔ better-auth adapter. The body-parsing fix is documented in the comment.
- `apps/api/src/routes/dishes.ts` — dish read endpoints (list, by-slug, map). Write endpoints NOT yet built.
- `packages/db/src/seed.ts` + `packages/db/src/seed-data.ts` — 31 dishes pre-seeded. Adding new dishes = append to `seed-data.ts`, run `pnpm --filter @gustale/db run seed` (idempotent).
- `apps/web/src/components/DishExplorer.tsx` — the dish list React island.
- `apps/web/src/components/WorldMap.tsx` — the map React island.
- `apps/web/src/components/AuthMenu.tsx` — header auth state. Reads session cookie via better-auth client after hydration.

## Conventions

- **Commits:** `feat:`, `fix:`, `chore:`, `refactor:`, `docs:` prefixes.
- **PRs against `main`:** CI auto-deploys on merge to main. Don't push directly to main unless you want to skip review.
- **TS:** strict mode. `tsc --noEmit` clean before committing.
- **Astro islands:** every interactive component is a separate `.tsx` file under `components/`, mounted with `client:load` in `.astro` pages.
- **Schema:** any new column = update `packages/db/src/schema/index.ts` AND `db/schema.sql` (the schema lives in two places — keep them in sync).
- **Seeds:** `seed-data.ts` is the source of truth for content; `seed.ts` is the runner.

## Environment

- Node 22, pnpm 9 (via corepack)
- Postgres 16 + PostGIS 3.4 (in shared-postgres container)
- No real `.env` — env comes from CI secrets for tests, from `/root/.env` on VPS for prod
- MinIO for media (not yet actively used in seed data)

## Live URLs (for smoke-testing after deploy)

- `https://gustale.com/` — landing
- `https://gustale.com/dishes` — list
- `https://gustale.com/map` — map
- `https://api.gustale.com/health` — API health
- `https://api.gustale.com/api/dishes/map?limit=10` — raw map data (JSON)

## Common workflows

### Adding a new dish (when write API exists)
1. `POST /api/dishes` with the dish payload
2. Server validates with Zod, inserts, returns the new dish with its id
3. Client redirects to `/dishes/<slug>`

### Adding a new dish (today, before write API exists)
1. Append to `packages/db/src/seed-data.ts`
2. `pnpm install && pnpm --filter @gustale/db run seed`
3. Push to main → CI deploys API → push empty commit → web rebuilds with new data

### Debugging prod
```bash
ssh root@62.72.7.218 'docker logs --tail=200 gustale-api | tail -50'
```
(SSH key: `~/.ssh/gustale-cd/id_ed25519`)

## When in doubt

1. Read SHARED_STATE.md
2. Read TASKS.md
3. Then read code
4. Then act

If you make a non-trivial change, append a one-liner to TASKS.md "Done" section + update SHARED_STATE.md "Live features" if applicable.