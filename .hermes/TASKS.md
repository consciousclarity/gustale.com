# Gustale — Work Queue

> **Task queue shared across AI agents.** Each task has an owner (which
> AI or human is working on it) and a status. Pick up the next "todo" task
> when idle. Move to "in_progress" when you start, "done" when merged.
> Add new tasks below the "Backlog" header.

## In progress

(none)

## Done (recent — last 10)

- 2026-06-17: Auth UI (login/register/account/AuthMenu) — Hermes
- 2026-06-17: Auth plugin body-parsing bugfix — Hermes
- 2026-06-17: 31-dish encyclopedia seed (Wikipedia-sourced) — Hermes
- 2026-06-17: 2D world map (`/map`) — Hermes
- 2026-06-17: Full-stack deploy (nginx-served static web, Fastify API) — Hermes
- 2026-06-17: Cross-subdomain cookie wiring (CORS, trustedOrigins) — Hermes
- 2026-06-17: CI/CD pipeline (5-job GitHub Actions, VPS auto-deploy) — Hermes
- 2026-06-17: Domain + DNS + hPanel firewall config — user + Hermes
- 2026-06-17: VPS provisioning (Docker, Postgres, MinIO, Caddy) — user + Hermes

## Backlog

### P0 — Dish detail page
**Owner:** unassigned · **Estimate:** ~half-day
Add `apps/web/src/pages/dishes/[slug].astro` that renders the full dish
data from `/api/dishes/:slug`. Include: title, description, hero image
(placeholder for now), ingredient list with quantities, step-by-step
preparation, sources/citations as a sidebar, related dishes by cuisine.
SEO: full `<head>` metadata (OG tags, JSON-LD Recipe schema, canonical
URL, structured data for the breadcrumb). This page is the SEO workhorse —
if you build only one thing next, build this.

### P1 — Write API for dishes
**Owner:** unassigned · **Estimate:** 1 day
Add `POST /api/dishes`, `PATCH /api/dishes/:slug`, both auth-gated.
Use Zod for input validation (already a project dep). Enforce role checks:
any authenticated user can create drafts; only moderators+ can publish.
Audit trail: every write creates an `edit_history` row with the diff.

### P1 — Edit wizard UI
**Owner:** unassigned · **Estimate:** 1-2 days
Multi-step form at `/dishes/new` and `/dishes/:slug/edit`. Steps:
basics → origin (lat/lng picker) → categories (multi-select) →
ingredients (search + add) → preparations (method + steps + duration) →
review → submit. Drafts auto-save. Should reuse `packages/db/src/seed-data.ts`
shape so seeded dishes look the same as user-created ones.

### P2 — Re-enable email verification
**Owner:** unassigned · **Estimate:** 30 min
Sign up at resend.com (free tier: 3k emails/month), set `RESEND_API_KEY`
in `/root/.env`, flip `requireEmailVerification: true` and
`sendOnSignUp: true` in `apps/api/src/auth.ts`. Done.

### P3 — Edit history UI
**Owner:** unassigned · **Estimate:** half-day
Show `edit_history` rows at the bottom of the dish detail page. Each row
shows: editor name, timestamp, action, diff (collapsible JSON). Moderators+
see a "Revert" button.

### P3 — Rate limiting on dish mutations
**Owner:** unassigned · **Estimate:** 30 min
Once write API exists, add per-user rate limiting (e.g. 10 edits/hour)
to prevent abuse. Use `better-auth`'s rate limit infra.

## Backlog (longer-term)

- **i18n** — frontend and content. README has this as Phase 7g.
- **Search** — Postgres full-text search across dish names + descriptions.
- **API for third parties** — public read API with rate limits + API keys.
- **Mobile-first redesign** — current layout is desktop-first; map needs mobile UX.
- **DMCA process** — required for opening up open editing publicly. Document in `docs/dmca.md`.
- **Moderator UI** — review queue at `/moderation` for pending edits.