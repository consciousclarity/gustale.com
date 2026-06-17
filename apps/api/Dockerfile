# Gustale API — multi-stage Dockerfile
#
# ---------- Stage 1: builder ----------
# Builds the monorepo packages (api + db) and produces a clean
# production node_modules. We use `pnpm deploy` rather than `pnpm prune`
# because pnpm's workspace symlinks are scattered across apps/api/node_modules
# and node_modules/.pnpm/; a wholesale copy of /app/node_modules is missing
# the per-package symlink layer, so the api can't resolve `fastify` etc.
#
# `pnpm deploy` extracts a self-contained, prod-only copy of the api package
# and its workspace dependencies into a clean directory.
FROM node:22-slim AS builder

WORKDIR /app

# Install pnpm globally
RUN npm install -g pnpm

# Copy the full monorepo source code FIRST
COPY . .

# Install all deps (incl. devDeps for tsc)
RUN pnpm install --frozen-lockfile

# Build packages in dependency order
RUN pnpm --filter @gustale/db run build
RUN pnpm --filter @gustale/api run build

# ---------- Stage 2: prod-extract ----------
# Use `pnpm deploy` to materialize a self-contained production layout
# for the api package. It resolves all workspace + transitive deps and
# produces a directory that can be COPY'd into the runtime stage.
FROM node:22-slim AS prod-extract

WORKDIR /app

RUN npm install -g pnpm

# We need the full source so pnpm deploy can resolve the workspace.
# This stage shares the build outputs of the previous one via COPY.
COPY --from=builder /app /app

WORKDIR /app/apps/api

# `pnpm deploy` flattens a package + its prod-only deps into ./deploy/.
# `--prod` skips devDependencies. The deploy target is given as a
# positional path; the filter selects which workspace package to deploy.
RUN pnpm deploy --prod --filter @gustale/api ./deploy

# ---------- Stage 3: runtime ----------
FROM node:22-slim

WORKDIR /app

# Run as non-root
USER node

# Copy the self-contained deploy bundle
COPY --from=prod-extract --chown=node:node /app/apps/api/deploy .

# Healthcheck pings /health
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:4000/health', r => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=4000 \
    LOG_LEVEL=info

EXPOSE 4000

# The deploy bundle mirrors the package layout: dist/ at the top.
CMD ["node", "dist/server.js"]
