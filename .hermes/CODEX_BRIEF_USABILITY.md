# Codex brief — gustale.com usability-first overhaul

> **Audience:** Codex (or any coding agent) working on this repo.  
> **Owner ask (2026-07-23):** Make **gustale.com** a huge usability upgrade.  
> **Hard split:** recipes live on **gustale.recipes** — do not turn `.com` into a recipe site.

---

## Domain contract (do not violate)

| Domain | Job | Primary surfaces |
|--------|-----|------------------|
| **https://gustale.com** | **Atlas / geo / discovery** — how food moved, where it belongs, what form it takes | `/`, `/map`, `/families`, `/regions`, `/lineages`, dish **browse/read**, search, stories (atlas) |
| **https://gustale.recipes** | **Encyclopedia + cook / contribute** | `/dishes/new`, `/dishes/:slug/edit`, `/ingredients`, admin, fuller method/recipe UX |

Build filter: `apps/web/scripts/post-build.mjs` (`PUBLIC_DOMAIN=geo` vs `recipes`).

- On **geo (`.com`)**: keep map + atlas; drop create/edit/ingredient authoring routes.
- On **recipes**: keep cook/contribute; map is not the hero.

**Bridge, don’t duplicate:** every atlas dish page should have a clear CTA → matching surface on `gustale.recipes` (“Cook / edit on Recipes →”). Never rebuild meal planners, calorie tools, or recipe grids as the `.com` homepage.

---

## North star for this update

**Usability first** on `gustale.com` means a visitor can, in under 30 seconds:

1. Understand what Gustale is (atlas of how food moved — not a recipe blog).
2. Find a dish / place / lineage without fighting filters.
3. See real media and real counts (never empty zeros / “Loading…” forever).
4. Follow a journey (origin → movement) without opening five pages.
5. Jump to cook/contribute on `.recipes` when they want that job.

Brand feel: media-first editorial atlas (breathing room, full-bleed imagery).  
**Not:** SaaS landing, shadcn marketing blocks, Aceternity glow, World-on-a-Plate recipe homepage.

Design system already exists: terracotta + Instrument Serif + Work Sans in `apps/web/src/styles/global.css`. Extend it; don’t replace it.

---

## Read these first (in order)

1. `.hermes/SHARED_STATE.md` — live incidents, what’s deployed  
2. `.hermes/COMPETITIVE_ROADMAP.md` — Waves A–E (source of truth for backlog)  
3. `.hermes/TASKS.md` — wave checklists  
4. `CLAUDE.md` — repo conventions  
5. `apps/web/scripts/post-build.mjs` — domain filter  

Sync shared state:

```bash
git fetch origin private/state
git checkout origin/private/state -- .hermes/
```

After non-trivial work, update `.hermes/` on branch `private/state` and push.

---

## P0 blocker before UX polish matters

As of 2026-07-23, **prod API data routes return 500** while `/health` is 200.

**Corrected root cause (Hermes):** Phase 7 password rotation updated `/home/deploy/gustale.com/.env` but **not** `/root/.env`. CI deploy starts the API with `--env-file /root/.env`, so the container still has the old password.

**Fix (Hermes / VPS only — Codex in cloud may lack SSH):**

1. Align `/root/.env` `DATABASE_URL` with `/home/deploy/gustale.com/.env`
2. `docker restart gustale-api` (or recreate so env is re-read)
3. Smoke: `/api/dishes?limit=5`, `/api/dishes/map?limit=5`, `/api/auth/get-session`, `/api/search?q=pizza`

Do **not** “fix” this by rewriting CI `DATABASE_URL` literals used only for ephemeral CI Postgres.

If API is still 500 when you start: prefer **SSG-safe UX** (baked counts, never-empty heroes) and note the blocker; don’t pretend client fetches work.

---

## What “huge usability update” means on `.com` (priority order)

### Wave U0 — Trust / first paint (must ship)

| ID | Work | Why |
|----|------|-----|
| U0-1 | Homepage never shows `0 dishes/families/origins` in view-source | Credibility; Wave A P0-1 (PR #31 may already be on main — verify live) |
| U0-2 | Dish covers never infinite-load; typographic fallback if no photo | PR #29 shipped; fix Greptile P1: don’t duplicate gallery image when hero falls back to first media |
| U0-3 | Global search works and is the primary find path | PR #32 `/api/search` — verify live after API fix; wire header UX if incomplete |
| U0-4 | Broken family detail routes (`/family/:slug` 404) | Index links must land on real pages |
| U0-5 | Clear domain switcher copy: Atlas (`.com`) vs Recipes (`.recipes`) | Users shouldn’t land on the wrong job |

### Wave U1 — Find & browse (core usability)

| ID | Work | Why |
|----|------|-----|
| U1-1 | Homepage: one job — brand + one line + one CTA + dominant map/media; filters not in hero | Current home feels like a dashboard |
| U1-2 | `/dishes`, `/families`, `/regions`, `/lineages` — larger media, fewer chips above the fold, sticky simple search | Browse fatigue |
| U1-3 | Empty / error / offline API states that stay usable on SSG pages | API outages shouldn’t look like an empty product |
| U1-4 | Mobile nav + search: one thumb-friendly find path | Mobile is first for food discovery |

### Wave U2 — Understand movement (differentiator)

| ID | Work | Why |
|----|------|-----|
| U2-1 | Dish **Journey** UI (timeline + map path) for 10–15 flagships | Explore-style “surprise origins,” but cited |
| U2-2 | Surface confidence (`documented` / `likely` / `possible`) on home + dish | Scholarly edge vs blogs |
| U2-3 | Region pages as short guides (not only filters) for top 12 | World-on-a-Plate country depth, atlas tone |
| U2-4 | Thin `/stories` layer linking into dishes/lineages/regions | Discovery without becoming a blog farm |

### Wave U3 — Bridge to recipes (do not absorb recipes)

| ID | Work | Why |
|----|------|-----|
| U3-1 | Every dish on `.com`: “Cook / contribute on gustale.recipes →” | Split is a feature |
| U3-2 | Prep section: never blank void — method summary **or** explicit contribute CTA | Usability without owning recipes |
| U3-3 | Do **not** build meal planner / calorie / wine boards on `.com` | That’s `.recipes` / out of scope |

### Explicit non-goals for this Codex pass

- Turning `.com` into a recipe site or cloning World on a Plate
- Aceternity / Magic UI marketing kits on atlas pages
- shadcn blocks on public atlas (OK later for `/dashboard` / moderation only)
- Claiming Khoury’s 68.7% statistic without recomputed cited data
- Scope-creeping ingredient crop science (Wave C) before U0–U2 usability lands
- Pushing directly to `main` without PR; skipping `astro check` / typecheck

---

## Open Greptile debt from PR #29 (fix while touching dish UI)

1. **P1** — `DishCoverHero` fallback to first gallery item duplicates that image in `DishGallery` → exclude selected `mediaId` from gallery **or** only use `role === 'cover'`.  
   https://github.com/consciousclarity/gustale.com/pull/29#discussion_r3633065541  
2. **P2** — duplicate `.rec-meta` rule in `@media (max-width: 680px)` in `global.css`.  
   https://github.com/consciousclarity/gustale.com/pull/29#discussion_r3633065752  

---

## Engineering constraints

- Stack: Astro 6 + React islands + Tailwind 4 + custom CSS tokens; Fastify API; Drizzle/Postgres.
- Commits: `feat:` / `fix:` / `chore:` / `refactor:` / `docs:`.
- Branch: `cursor/<descriptive>-****` or Codex’s usual prefix; PR against `main`.
- Before commit: `pnpm` typecheck / `astro check` on touched packages; keep `tsc` clean for new code.
- Mock API: `apps/web/scripts/mock-api-data.json` shape **must** stay `{ generatedFrom, list, map, details }` — never a raw list dump.
- Taxonomies: **never confuse** `/families` (dish-type) vs `/lineages` (method **or** entity lineages — read SHARED_STATE “Two-Taxonomy Confusion”).

---

## Suggested Codex execution plan

1. Pull `main` + `.hermes/` from `private/state`. Confirm API smoke; if 500, note blocker and still ship SSG UX.
2. Fix Greptile P1/P2 from PR #29 on a small PR.
3. Audit live `.com` IA (home → search → dish → lineage → recipes CTA); write a short “usability gaps” list in the PR body.
4. Ship **U0** completely (trust).
5. Ship **U1** homepage + browse simplification (biggest perceived jump).
6. Then **U2** Journey on flagships + confidence.
7. **U3** Recipes bridge CTAs everywhere.
8. Update `.hermes/TASKS.md` + `SHARED_STATE.md` on `private/state`.

---

## Pasteable prompt for Codex

```text
Work on the gustale.com monorepo (consciousclarity/gustale.com).

Mission: huge USABILITY-FIRST upgrade of https://gustale.com (geo/atlas domain).
https://gustale.recipes is where recipes, dish create/edit, ingredients authoring, and cook UX live — do NOT turn .com into a recipe site. Bridge with clear CTAs to .recipes instead.

Read first:
- .hermes/SHARED_STATE.md (pull from origin/private/state)
- .hermes/COMPETITIVE_ROADMAP.md
- .hermes/CODEX_BRIEF_USABILITY.md (this brief)
- apps/web/scripts/post-build.mjs (domain split)

P0: Prod API may still 500 until /root/.env DATABASE_URL is aligned (Hermes/VPS). Prefer SSG-safe UX; don’t assume client API works until smoked.

Prioritize:
1) Fix Greptile PR #29 P1 cover/gallery duplicate + P2 duplicate CSS
2) U0 trust: never-zero homepage, covers, search, broken /family/:slug, domain switcher clarity
3) U1 browse usability: simplify homepage + list pages, mobile find path, good empty/error states
4) U2 dish Journey UI + confidence for flagships
5) U3 Atlas→Recipes CTAs; never-blank prep (CTA to contribute on .recipes)

Stay on Gustale design tokens (media-first, airy). No Aceternity/shadcn marketing blocks on public atlas.
Open PRs against main; update .hermes on private/state when done.
```

---

## Success criteria (usability)

- New visitor on `.com` never sees `0 dishes` in HTML source.
- Search finds dish / region / lineage in one control.
- Dish page: finished hero always; journey readable for flagships; one obvious path to `.recipes`.
- Browse pages feel like a gallery atlas, not an admin filter panel.
- `.com` and `.recipes` jobs are obvious within one glance at the header.
