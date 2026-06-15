# Gustale — Open-source geo-located encyclopedia of dishes and ingredients

**License:** AGPL-3.0 (code) + CC-BY-SA-4.0 (content)

## Stack

- **Backend**: Node 20+ / Fastify / TypeScript (strict)
- **Database**: PostgreSQL 16 + PostGIS 3.4
- **Object storage**: MinIO (S3-compatible)
- **Frontend**: Astro + React islands (planned)
- **Auth**: Better-auth (magic link + email+password + passkeys + Google OAuth)
- **Reverse proxy**: Caddy with auto-HTTPS via Let's Encrypt

## Project structure

```
gustale.com/
├── apps/
│   ├── api/              Fastify backend
│   └── web/              Astro frontend (planned)
├── packages/
│   ├── db/               Drizzle schema + migrations (@gustale/db)
│   └── shared/           Shared types (@gustale/shared)
├── db/                   SQL migration files
├── infra/                Docker compose, Caddyfile, deploy scripts
└── docs/                 Project documentation
```

## Local development (Geekom)

```bash
# Install dependencies
pnpm install

# Set up environment
cp apps/api/.env.example apps/api/.env
# Edit with your local DATABASE_URL, MINIO creds, etc.

# Run database migrations (against your local or remote Postgres)
pnpm db:migrate

# Start the API in watch mode
pnpm --filter @gustale/api dev
```

## Deployment

The app is deployed to the Hostinger VPS at `/home/deploy/gustale.com/`.
See `infra/` for Docker compose files and deploy scripts.

## Build order (Phase 7)

- [x] **7a** Backend skeleton
- [ ] **7b** Auth (Better-auth: email+password, magic link, passkeys, Google OAuth)
- [ ] **7c** Dish CRUD (read endpoints live, write needs auth)
- [ ] **7d** Image upload to MinIO
- [ ] **7e** Frontend skeleton (Astro)
- [ ] **7f** Globe.gl integration
- [ ] **7g** i18n
- [ ] **7h** SEO, sitemaps, robots.txt

See `PROJECT_DECISIONS.md` for the full stack rationale.

## Contributing

This is a personal project currently. The first contribution from a second human is still pending.
