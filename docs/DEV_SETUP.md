# Gustale — Local Development Setup

## TL;DR (VS Code Dev Container — recommended)

**The fastest path if you use VS Code:**

1. Open this repo in VS Code
2. Install the **"Dev Containers"** extension (Microsoft)
3. Click **"Reopen in Container"** when prompted (or `Cmd+Shift+P` → "Dev Containers: Reopen in Container")
4. Wait ~2 min for the setup script to finish
5. Run in two terminals:
   ```
   pnpm --filter @gustale/api dev   # API at http://localhost:4000
   pnpm --filter @gustale/web dev    # Web at http://localhost:4321
   ```

Done — Postgres + MinIO start automatically in the background.

---

## What you get

| Service | Host port | Purpose |
|---|---|---|
| PostgreSQL 16 + PostGIS 3.4 | `localhost:5432` | Primary database |
| MinIO (S3) | `localhost:9000` (API), `localhost:9001` (Console) | Media storage |
| Astro dev server | `localhost:4321` | Frontend |
| Fastify API | `localhost:4000` | Backend |

---

## Manual setup (without dev container)

### Prerequisites

- **Node.js 22+** — [nvm](https://github.com/nvm/nvm) recommended
- **pnpm 10+** — `npm install -g pnpm`
- **Docker** — for Postgres + MinIO services
- **Postgres client** (`psql`) — for running migrations

### 1. Start backing services

```bash
# In the project root:
docker compose -f .devcontainer/docker-compose.yml up -d

# Verify:
docker compose -f .devcontainer/docker-compose.yml ps
```

### 2. Install dependencies

```bash
pnpm install
```

### 3. Configure environment

```bash
cp apps/api/.env.example apps/api/.env
# Edit apps/api/.env with your settings (defaults work for local Docker setup)
```

The defaults in `.env.example` are pre-configured to connect to the Docker services above:
- `DATABASE_URL=postgresql://gustale:gustale_dev@127.0.0.1:5432/gustale`
- `MINIO_ENDPOINT=http://127.0.0.1:9000`
- MinIO credentials: `gustale_dev` / `gustale_dev_password`

### 4. Set up the database

```bash
# Run migrations
pnpm --filter @gustale/api run db:migrate

# Or open a psql shell:
docker exec -it gustale-postgres-dev psql -U gustale -d gustale
```

### 5. Create MinIO buckets

```bash
# Install mc (MinIO client):
brew install minio/stable/mc   # macOS
# or: curl https://dl.min.io/client/mc/release/linux-amd64/mc -o /usr/local/bin/mc && chmod +x /usr/local/bin/mc

# Configure alias:
mc alias set local http://localhost:9000 gustale_dev gustale_dev_password

# Create buckets:
mc mb local/gustale-public --ignore-existing
mc mb local/gustale-media --ignore-existing

# Allow public download from public bucket:
mc anonymous set download local/gustale-public
```

### 6. Start development servers

```bash
# Terminal 1 — API (Fastify, port 4000)
pnpm --filter @gustale/api dev

# Terminal 2 — Web (Astro, port 4321)
pnpm --filter @gustale/web dev
```

Open http://localhost:4321 to see the site.

---

## Project structure

```
gustale.com/
├── apps/
│   ├── api/              Fastify backend (dev: pnpm --filter @gustale/api dev)
│   │   └── src/routes/   API route handlers
│   └── web/              Astro frontend  (dev: pnpm --filter @gustale/web dev)
│       └── src/
│           ├── components/  React islands + Astro components
│           ├── layouts/      Page chrome (nav, footer)
│           ├── pages/        File-based routing
│           ├── styles/       global.css (terracotta design system)
│           └── lib/           API client, auth helpers
├── packages/
│   ├── db/               Drizzle schema + migrations (@gustale/db)
│   └── ui/               Shared UI components (@gustale/ui)
├── .devcontainer/         Dev container config (VS Code Dev Containers)
│   ├── devcontainer.json  VS Code config
│   ├── docker-compose.yml Dev services (Postgres + MinIO)
│   └── setup.sh           Post-create automation
└── docs/
    └── DEV_SETUP.md       This file
```

---

## Common tasks

### Run typecheck

```bash
pnpm exec tsc --noEmit                          # all packages
pnpm --filter @gustale/web exec tsc --noEmit    # web only
pnpm --filter @gustale/api exec tsc --noEmit    # api only
```

### Run tests

```bash
pnpm test               # all packages
pnpm --filter @gustale/api test   # api only
```

### Add a new migration

```bash
pnpm --filter @gustale/db migrate:generate -- ./db/migrations/
# Then edit the generated file and commit
pnpm --filter @gustale/api run db:migrate
```

### Build for production (from monorepo root)

```bash
# Builds both apps, outputs to apps/*/dist/
pnpm build
```

### View database in GUI

Use **TablePlus**, **DBeaver**, or **VS Code SQLTools**:
```
PostgreSQL — localhost:5432 — gustale/gustale_dev — database: gustale
```

### Access MinIO console

```
http://localhost:9001
User:     gustale_dev
Password: gustale_dev_password
```

---

## Troubleshooting

### `ECONNREFUSED` on localhost:5432

Postgres isn't running yet:

```bash
docker compose -f .devcontainer/docker-compose.yml ps
# If not running:
docker compose -f .devcontainer/docker-compose.yml up -d postgres
```

### `Migration failed` / relation does not exist

The database schema is empty. Run migrations:

```bash
pnpm --filter @gustale/api run db:migrate
```

### `pnpm install` fails with EACCES

Node modules were installed as root (likely because you previously ran Docker as root). Fix:

```bash
sudo chown -R $(id -u):$(id -g) .
pnpm install
```

### Astro `Cannot find module 'astro/...'`

The workspace dependencies may not have been linked. Run:

```bash
pnpm install
```

### VS Code Dev Container: "Docker socket permission denied"

```bash
sudo usermod -aG docker $USER
# Then log out and back in
```

---

## Design system

The frontend uses a **CSS custom properties** design system (no Tailwind utility classes in component HTML):

| Token | Value | Usage |
|---|---|---|
| `--bg` | `#F6F1E7` | Page background (warm cream) |
| `--card` | `#FBF8F1` | Card surfaces |
| `--text` | `#211C16` | Primary text |
| `--sub` | `#6B6052` | Secondary/subdued text |
| `--accent` | `#B8552F` | Terracotta accent |
| `--accent-text` | `#FBEFE6` | Text on top of accent |
| `--accent-soft` | `rgba(184,85,47,0.10)` | Subtle accent tint |
| `--border` | `rgba(33,28,22,0.14)` | Borders and dividers |

Fonts: **Instrument Serif** (display/headlines), **Work Sans** (body), **IBM Plex Mono** (code/labels).

See `apps/web/src/styles/global.css` for the full token system and shared component classes (`.btn`, `.btn-primary`, `.btn-outline`, `.card`, `.tag`, `.filter-chip`, etc.).

---

## Architecture notes

- **Astro SSG** — pages are static at build time; React islands hydrate client-side
- **`client:only="react"`** — islands skip SSR (CSS must be imported globally, not in the TSX)
- **Fastify API** — same-origin proxied through Caddy in production; dev server bypasses proxy
- **Drizzle ORM** — schema in `packages/db/src/schema/`; migrations in `db/migrations/`
- **MapLibre GL JS** — loaded from CDN at runtime (not bundled) for smaller dist size
- **`PUBLIC_DOMAIN`** — set at build time to `geo` or `recipes`; determines which pages are included in the Astro dist
