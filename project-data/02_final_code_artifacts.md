# Gustale.com Project: Final Code Artifacts

This document contains the final, working versions of the key code files that make up the Gustale.com CI/CD pipeline. These files represent the culmination of our debugging and engineering process.

---

## 1. CI/CD Workflow: `.github/workflows/ci.yml`

This file defines the entire Continuous Integration and Continuous Deployment pipeline.

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

# Grant the GITHUB_TOKEN permissions to write to ghcr.io
permissions:
  contents: read
  packages: write

# Cancel in-progress runs for the same branch/PR.
concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true

env:
  COREPACK_ENABLE_DOWNLOAD_PROMPT: 0
  DATABASE_URL: postgres://gustale:gustale@127.0.0.1:5432/gustale
  SESSION_SECRET: ci-session-secret-do-not-use-anywhere-real
  AUTH_SECRET: ci-auth-secret-do-not-use-anywhere-real
  MINIO_ENDPOINT: http://ci-minio.placeholder.invalid:9000
  MINIO_PORT: 9000
  MINIO_ACCESS_KEY: ci-minio-access-key-do-not-use-anywhere-real
  MINIO_SECRET_KEY: ci-minio-secret-key-do-not-use-anywhere-real
  BETTER_AUTH_SECRET: ci-better-auth-secret-do-not-use-anywhere-real
  NODE_ENV: test

jobs:
  lint:
    name: Lint + typecheck
    runs-on: ubuntu-24.04
    timeout-minutes: 10
    steps:
      - uses: actions/checkout@v4
      - name: Set up pnpm
        uses: pnpm/action-setup@v4
        with:
          run_install: false
      - name: Set up Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm
      - name: Install dependencies
        run: pnpm install --frozen-lockfile
      - name: Typecheck (api + db)
        run: |
          pnpm --filter @gustale/db run typecheck
          pnpm --filter @gustale/api run typecheck
      - name: Lint
        run: pnpm -r run lint
        continue-on-error: true

  test:
    name: Tests (vitest + postgis)
    runs-on: ubuntu-24.04
    timeout-minutes: 15
    services:
      postgis:
        image: postgis/postgis:16-3.4
        env:
          POSTGRES_USER: gustale
          POSTGRES_PASSWORD: gustale
          POSTGRES_DB: gustale
        ports:
          - 5432:5432
        options: >-
          --health-cmd pg_isready
          --health-interval 5s
          --health-timeout 5s
          --health-retries 10
          --tmpfs /var/lib/postgresql/data:rw,size=2g
    steps:
      - uses: actions/checkout@v4
      - name: Set up pnpm
        uses: pnpm/action-setup@v4
        with:
          run_install: false
      - name: Set up Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm
      - name: Install dependencies
        run: pnpm install --frozen-lockfile
      - name: Build db package
        run: pnpm --filter @gustale/db run build
      - name: Apply schema to ephemeral DB
        run: |
          PGPASSWORD=gustale psql -h 127.0.0.1 -U gustale -d gustale -v ON_ERROR_STOP=1 \
            -c "CREATE EXTENSION IF NOT EXISTS postgis;" \
            -c "CREATE EXTENSION IF NOT EXISTS \"uuid-ossp\";" \
            -f packages/db/drizzle/0000_cloudy_satana.sql
      - name: Apply seed
        run: |
          PGPASSWORD=gustale psql -h 127.0.0.1 -U gustale -d gustale -v ON_ERROR_STOP=1 \
            -f packages/db/seed-moussaka.sql
      - name: Run vitest
        working-directory: apps/api
        run: pnpm test -- --reporter=verbose

  build:
    name: Docker build (gustale-api)
    runs-on: ubuntu-24.04
    timeout-minutes: 20
    needs: [lint, test]
    steps:
      - uses: actions/checkout@v4
      - name: Set up pnpm
        uses: pnpm/action-setup@v4
        with:
          run_install: false
      - name: Set up Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm
      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3
      - name: Log in to GitHub Container Registry
        uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}
      - name: Build and push API image
        uses: docker/build-push-action@v6
        with:
          context: .
          file: apps/api/Dockerfile
          tags: ghcr.io/${{ github.repository }}/gustale-api:latest,ghcr.io/${{ github.repository }}/gustale-api:${{ github.sha }}
          push: true
          provenance: false

  deploy:
    name: Deploy to Hostinger
    runs-on: ubuntu-24.04
    timeout-minutes: 10
    needs: [build]
    if: github.event_name == 'push' && github.ref == 'refs/heads/main'
    steps:
      - name: Deploy via SSH
        uses: appleboy/ssh-action@v1
        with:
          host: ${{ secrets.HOSTINGER_HOST }}
          username: ${{ secrets.HOSTINGER_USER }}
          key: ${{ secrets.HOSTINGER_SSH_KEY }}
          script: |
            set -e
            echo "--- Logging into ghcr.io ---"
            echo ${{ secrets.GHCR_PAT }} | docker login ghcr.io -u ${{ github.actor }} --password-stdin
            echo "--- Pulling new image ---"
            docker pull ghcr.io/${{ github.repository }}/gustale-api:${{ github.sha }}
            echo "--- Stopping existing container ---"
            docker stop gustale-api || true
            docker rm gustale-api || true
            echo "--- Starting new container ---"
            docker run -d --name gustale-api --restart unless-stopped \
              -p 4000:4000 \
              --env-file /root/.env \
              ghcr.io/${{ github.repository }}/gustale-api:${{ github.sha }}
            echo "--- Pruning old images ---"
            docker image prune -f
```

---

## 2. Multi-Stage Dockerfile: `apps/api/Dockerfile`

This is the self-contained build process for the application container.

```dockerfile
# Gustale API — multi-stage Dockerfile

# ---------- Stage 1: builder ----------
FROM node:22-slim AS builder

WORKDIR /app

# Install pnpm globally
RUN npm install -g pnpm

# Copy the full monorepo source code FIRST
COPY . .

# Now that the full workspace is present, run install
RUN pnpm install --frozen-lockfile

# Build the necessary packages using the standard filter syntax
RUN pnpm --filter @gustale/db run build
RUN pnpm --filter @gustale/api run build

# Prune devDependencies for a smaller production node_modules
RUN pnpm prune --prod


# ---------- Stage 2: runtime ----------
FROM node:22-slim

WORKDIR /app

# Run as non-root
USER node

# Copy artifacts from the builder stage
COPY --from=builder --chown=node:node /app/apps/api/dist ./apps/api/dist
COPY --from=builder --chown=node:node /app/apps/api/package.json ./apps/api/package.json
COPY --from=builder --chown=node:node /app/packages/db/dist ./packages/db/dist
COPY --from=builder --chown=node:node /app/packages/db/package.json ./packages/db/package.json
COPY --from=builder --chown=node:node /app/node_modules ./node_modules

# Recreate the symlink for the workspace package
RUN mkdir -p /app/apps/api/node_modules/@gustale && \
    ln -s /app/packages/db /app/apps/api/node_modules/@gustale/db


ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=4000 \
    LOG_LEVEL=info

# Healthcheck pings /health
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:4000/health', r => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

EXPOSE 4000

CMD ["node", "apps/api/dist/apps/api/src/server.js"]
```

---

## 3. Reverse Proxy Configuration: `/etc/caddy/Caddyfile`

This file runs on the Hostinger VPS to route public traffic to the application container.

```caddyfile
gustale.com, www.gustale.com {
    reverse_proxy localhost:4000
}
```
