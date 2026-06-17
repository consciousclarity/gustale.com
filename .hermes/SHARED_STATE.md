# Gustale — Shared State

> **Read this first.** This file is the source of truth for project state,
> decisions, and blockers across all AI assistants working on this repo.
> Both Hermes Agent (Telegram) and Claude Code (terminal) write to it.

## Last updated

2026-06-17 17:42 WITA by Hermes Agent (commit `ab63d61`).

## Current status

✅ **Phase 7b (Auth UI) shipped live.** Sign-up, sign-in, account pages all
working end-to-end on https://gustale.com. Verified in browser with a real
test account (smoke-test@gustale.com).

## What's deployed on main

| Component | Status | Image SHA |
|---|---|---|
| `apps/api` (Fastify + better-auth) | Live, healthy | `ab63d61` |
| `apps/web` (Astro + React islands) | Live, healthy | `ab63d61` |
| gustale-api container | Running on VPS :4000 | `ab63d61a9953…` |
| gustale-web container | Running on VPS :4001 | `ab63d61a9953…` |
| shared-postgres container | Running | n/a |
| minio container | Running | n/a |

## Live features (verified)

- `/` — landing page
- `/dishes` — list of 31 dishes
- `/dishes/<slug>` — fallback to home (no detail page yet)
- `/map` — 31 dots across 22 countries, Equal Earth projection, hover tooltip, click-through
- `/login` — email + password, friendly errors
- `/register` — display name + email + password
- `/account` — session panel
- AuthMenu in header — "Sign in" ↔ user name + "Sign out"
- `https://api.gustale.com/api/dishes/map` — flat lat/lng endpoint
- `https://api.gustale.com/api/dishes/:slug` — full dish detail
- `https://api.gustale.com/api/auth/{sign-in,sign-up,sign-out,get-session}` — better-auth

## Open bugs / known issues

- **Resend not configured** → `requireEmailVerification: false` for v1 (TODO comment in `apps/api/src/auth.ts`). Re-enable when email provider is wired.
- **No dish detail page** → `/dishes/<slug>` falls back to home via SPA fallback. SEO surface is missing.
- **No write API** → authenticated users can't yet create/edit dishes. The "Edit" affordance doesn't exist.
- **SSR cookie reading doesn't work cross-subdomain** → `lib/session.ts: getSessionFromCookies()` returns null because the session cookie lives on `api.gustale.com`. Browser handles this fine via XHR; only an issue for future SSR personalization.

## Next build (priority order)

1. **Dish detail page** (`apps/web/src/pages/dishes/[slug].astro`) — SEO surface, full content with citations, sources list, ingredient/preparation sections. ~half-day. **Highest leverage right now.**
2. **Write API** (`POST /api/dishes`, `PATCH /api/dishes/:slug`, auth-gated) — needed before #3.
3. **Edit wizard** (`/dishes/new`, `/dishes/:slug/edit`) — multi-step form, draft → review → publish. Needs #2.
4. **Re-enable Resend** for email verification (small task, just config + flip flag).
5. **Edit history UI** — render `edit_history` rows on the dish detail page (the data is already there).

## Conventions (for both agents to follow)

- **Branch:** `main` is the deploy branch. Feature branches get pushed as PRs.
- **Commits:** conventional commits (`feat:`, `fix:`, `chore:`, `refactor:`).
- **Seeds:** `packages/db/src/seed-data.ts` is the typed dataset; `seed.ts` is the runner. Both idempotent.
- **Env on VPS:** `/root/.env` is the source of truth. Don't edit container env directly — it gets clobbered on next deploy.
- **After API or seed changes:** push an empty commit to trigger web rebuild for SSR freshness.

## Recent decisions log

- 2026-06-17: Wikipedia-model for v1 (read-everyone, write-credentialed). See memory file for full reasoning.
- 2026-06-17: Hybrid seed (curated + citations), not live Wikidata fetch.
- 2026-06-17: Equal Earth projection for map (not Mercator, not 3D globe yet).
- 2026-06-17: better-auth cookies are `__Secure-gustale.session_token` (browser sends automatically). Lib cookie-parser looks for `gustale.session_token` (un-prefixed) — works in dev only.
- 2026-06-17: Fastify JSON parser bug fixed — must use `request.body` not raw stream for JSON requests.

## Active blockers (none right now)

(none)