# Gustale — Work Queue

> **Task queue shared across AI agents.** Each task has an owner (which
> AI or human is working on it) and a status. Pick up the next "todo" task
> when idle. Move to "in_progress" when you start, "done" when merged.
> Add new tasks below the "Backlog" header.

## In progress

(none)

## Done (recent — last 10)

- 2026-06-17: Dish detail page (SSG, 31 pages, real 404 for unknown slugs) — Hermes
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

### P2 — Image upload + gallery rendering
**Owner:** unassigned · **Estimate:** 1 day
Wire MinIO signed URLs from the API; render `<img>` tags in the dish
detail gallery section. Currently the gallery block is a placeholder
saying "1 attachment on record (images served from MinIO once CDN is
wired)". Image upload UI on the edit wizard (drag-drop, alt text,
license field).

### P3 — Edit history UI
**Owner:** unassigned · **Estimate:** half-day
Show `edit_history` rows at the bottom of the dish detail page. Each row
shows: editor name, timestamp, action, diff (collapsible JSON). Moderators+
see a "Revert" button.

### P3 — Rate limiting on dish mutations
**Owner:** unassigned · **Estimate:** 30 min
Once write API exists, add per-user rate limiting (e.g. 10 edits/hour)
to prevent abuse. Use `better-auth`'s rate limit infra.

### P3 — JSON-LD Recipe schema in dish detail
**Owner:** unassigned · **Estimate:** 1 hour
Add Recipe schema.org structured data to the dish detail page (title,
description, ingredients, prep time, cook time, recipe yield, author).
Google Recipes rich results depend on this.

### P3 — OG / Twitter card meta tags
**Owner:** unassigned · **Estimate:** 1 hour
Add OpenGraph + Twitter card meta tags to all pages (especially dish
detail, with dish image as `og:image`). Currently only a plain
`<meta name="description">` exists.

### P3 — Internal link audit: ingredient pages
**Owner:** unassigned · **Estimate:** decision
Dish detail pages link to `/ingredients/<slug>` (e.g. /ingredients/eggplant)
but those pages don't exist. Either stub 404s or build ingredient pages.
Build first or stub first — call it.

## Backlog (longer-term)

- **i18n** — frontend and content. README has this as Phase 7g.
- **Search** — Postgres full-text search across dish names + descriptions.
- **API for third parties** — public read API with rate limits + API keys.
- **Mobile-first redesign** — current layout is desktop-first; map needs mobile UX.
- **DMCA process** — required for opening up open editing publicly. Document in `docs/dmca.md`.
- **Moderator UI** — review queue at `/moderation` for pending edits.