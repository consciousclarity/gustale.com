# Gustale — Open-source geo-located encyclopedia of dishes

**License:** AGPL-3.0 (code) + CC-BY-SA-4.0 (content)

## Quick start (VS Code)

1. Open this repo in VS Code
2. Install the **"Dev Containers"** extension (Microsoft)
3. `Cmd+Shift+P` → **"Dev Containers: Reopen in Container"**
4. Wait ~2 min for setup to finish
5. Two terminals:
   ```
   pnpm --filter @gustale/api dev   # http://localhost:4000
   pnpm --filter @gustale/web dev   # http://localhost:4321
   ```

See [`docs/DEV_SETUP.md`](docs/DEV_SETUP.md) for full documentation including manual setup without VS Code.

## Stack

| Layer | Technology |
|---|---|
| Frontend | Astro + React islands |
| Backend | Fastify + TypeScript (strict) |
| Database | PostgreSQL 16 + PostGIS 3.4 |
| Auth | Better-auth (magic link, email+password, passkeys, Google OAuth) |
| Storage | MinIO (S3-compatible) |
| Reverse proxy | Caddy (auto-HTTPS) |

## Project structure

```
gustale.com/
├── apps/
│   ├── api/           Fastify backend
│   └── web/           Astro frontend
├── packages/
│   ├── db/            Drizzle schema + migrations
│   └── ui/            Shared UI components
├── .devcontainer/     Dev container (Postgres + MinIO)
│   ├── devcontainer.json
│   ├── docker-compose.yml
│   └── setup.sh
└── docs/
    └── DEV_SETUP.md   Full setup guide
```

## Scripts

```bash
pnpm install               # Install all dependencies
pnpm --filter @gustale/api dev   # Start API (port 4000)
pnpm --filter @gustale/web dev   # Start web (port 4321)
pnpm --filter @gustale/api test  # Run API tests
pnpm build                 # Build both apps for production
```

## Deployment

The app runs on the Hostinger VPS at `62.72.7.218`. CI/CD is handled by GitHub Actions — a successful merge to `main` triggers a build and deploy.

See [`docs/DEV_SETUP.md`](docs/DEV_SETUP.md) for the full development guide.
