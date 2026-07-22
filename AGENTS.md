# AGENTS.md

## Cursor Cloud specific instructions

Gustale is a pnpm workspace monorepo. The two runnable services are `@gustale/api`
(Fastify, port `4000`) and `@gustale/web` (Astro dev, port `4321`), backed by
Postgres 16 + PostGIS and MinIO running in Docker. Standard commands live in
`docs/DEV_SETUP.md`, the root `package.json` scripts, and the `Makefile`; the
notes below only cover non-obvious caveats discovered when running this in the
cloud VM.

### Starting the services (order matters)

1. Docker has no systemd here — the daemon must be started manually (e.g.
   `sudo dockerd &`) before any `docker compose` command.
2. Start backing services: `docker compose -f .devcontainer/docker-compose.yml up -d`
   (Postgres on `5432`, MinIO on `9000`/`9001`).
3. **Build `@gustale/db` before running the API or tests:**
   `pnpm --filter @gustale/db run build`. The package's `exports` point at
   `dist/`, and nothing rebuilds it automatically on install, so a fresh
   checkout fails with `Failed to resolve entry for package "@gustale/db"` until
   `dist/` exists. The update script already runs this build; re-run it manually
   if you `git clean` or change `packages/db/src`.
4. API: `pnpm --filter @gustale/api dev` · Web: `pnpm --filter @gustale/web dev`.

### Environment file gotcha

`apps/api/.env.example` is **missing `BETTER_AUTH_SECRET`**, which `apps/api/src/env.ts`
requires (min 32 chars) — the API calls `process.exit(1)` on boot without it.
When creating `apps/api/.env`, add both a real `SESSION_SECRET` and
`BETTER_AUTH_SECRET` (e.g. `openssl rand -hex 32`).

### Database migrate/seed

`packages/db/src/migrate.ts` and `seed.ts` read `DATABASE_URL` from
`process.env` directly (no dotenv). `pnpm db:migrate` / `pnpm db:seed` therefore
fail with "DATABASE_URL is not set" unless it is exported in the shell, e.g.
`DATABASE_URL=postgresql://gustale:gustale_dev@127.0.0.1:5432/gustale pnpm db:migrate`.

### Running tests (match CI)

`apps/api` vitest expects the CI fixture, not the full dev seed. CI (`.github/workflows/ci.yml`)
applies migrations `0000`–`0003` plus `packages/db/seed-moussaka.sql` to a
dedicated database, then runs vitest. Running against a DB loaded with the full
`pnpm db:seed` makes one test fail (`dishes-slug` expects `moussaka` preparation
order `simmer` first). Use a separate test DB seeded with `seed-moussaka.sql` and
point `DATABASE_URL` at it (the vitest setup loads `apps/api/.env`, but dotenv
does not override an already-exported `DATABASE_URL`). With that fixture the
suite is green (46 pass / 3 skip).

### Known pre-existing bugs (not environment issues)

- **`GET /api/dishes` (list) returns HTTP 500 locally.** The query in
  `apps/api/src/routes/dishes.ts` filters `categories.kind` (e.g. `kind = 'dish-type'`),
  but no committed migration creates a `kind` column on `categories` — production
  was patched by hand and the migration was never committed (see the `/api/dishes`
  500 note in `.hermes/TASKS.md`). Consequences in a fresh dev DB: the homepage and
  `/dishes` list show a "gustale-api could not be reached" warning, and dish-detail
  `getStaticPaths` falls back to only `moussaka-greek` (so other `/dishes/<slug>`
  pages 404 in dev). The `map` and `dishes/:slug` endpoints are unaffected. This is
  a code/schema-drift bug, not a setup problem — do not "fix" it as part of env work.

### Frontend dev caveats

- The web dev server does **not** proxy `/api/*` to `:4000` (the comment in
  `apps/web/src/lib/api.ts` about an `astro.config.mjs` proxy is stale). Pages get
  their first paint from server-side fetches (SSR reads `PUBLIC_API_BASE` or
  defaults to `http://localhost:4000`), so initial content renders, but purely
  client-side fetches (live search, pagination) hit `:4321` and 404 in dev.
- The interactive globe on `/map` loads MapLibre GL from a CDN at runtime. Cloud
  egress blocks that CDN, so the globe stays on "Loading globe…" even though the
  60 dish coordinates are embedded server-side in the page.
- Web dev runs on port **4321** (per `docs/DEV_SETUP.md`). The `4001` mentioned in
  `CLAUDE.md` is the production container port, not the dev port.
