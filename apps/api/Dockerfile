# Gustale API — multi-stage Dockerfile

# ---------- Stage 1: builder ----------
# This stage installs all dependencies, builds the monorepo packages,
# and prunes devDependencies to create a clean production node_modules.
FROM node:22-slim AS builder

WORKDIR /app

# Install pnpm globally
RUN npm install -g pnpm

# Copy dependency manifests
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

# Install ALL dependencies (including dev) needed for building/testing
RUN pnpm install --frozen-lockfile

# Copy the full monorepo source code
COPY . .

# Build the necessary packages
RUN pnpm --filter @gustale/db run build
RUN pnpm --filter @gustale/api run build

# Prune devDependencies for a smaller production node_modules
RUN pnpm prune --prod


# ---------- Stage 2: runtime ----------
# This stage creates the final, slim production image.
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

# Recreate the symlink for the workspace package, now pointing to the copied dist
# This must be done after the main COPY operations.
# We create a new directory and then copy the contents to avoid permission issues.
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

CMD ["node", "apps/api/dist/server.js"]

