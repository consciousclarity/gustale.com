# Gustale API — multi-stage Dockerfile
# Stage 1: build (on Geekom), Stage 2: slim runtime
#
# Build context = the full monorepo so we can copy:
#   - apps/api/dist           (compiled JS)
#   - apps/api/package.json
#   - packages/db/dist        (compiled JS — schema)
#   - packages/db/package.json
#   - node_modules            (already-built, from pnpm install)
#
# We do NOT install/build inside the image — Geekom is the build host.

# ---------- Stage 1: build ----------
FROM node:24.15-slim AS build
WORKDIR /app

# Copy the build artifacts produced by `pnpm --filter @gustale/api run build`
# The caller is expected to mount or COPY the prebuilt `apps/api/dist/`
# and `packages/db/dist/` (and node_modules) into the build context.
COPY apps/api/dist       ./apps/api/dist
COPY apps/api/package.json ./apps/api/package.json
COPY packages/db/dist    ./packages/db/dist
COPY packages/db/package.json ./packages/db/package.json
COPY node_modules        ./node_modules
COPY apps/api/node_modules ./apps/api/node_modules
COPY packages/db/node_modules ./packages/db/node_modules

# Sanity check: the entrypoint file must exist
RUN test -f /app/apps/api/dist/apps/api/src/server.js \
 || (echo "MISSING server.js — build artifact not mounted correctly" && exit 1)

# @gustale/db is a workspace package; pnpm creates a symlink in
# apps/api/node_modules/@gustale/db pointing at packages/db/. The symlink
# doesn't survive the COPY, so we materialise it as a real directory
# containing the built dist + the package.json with proper exports.
# (Runs as root before we switch to USER node.)
RUN rm -rf /app/apps/api/node_modules/@gustale/db \
 && mkdir -p /app/apps/api/node_modules/@gustale/db \
 && cp -r /app/packages/db/dist/. /app/apps/api/node_modules/@gustale/db/ \
 && cp /app/packages/db/package.json /app/apps/api/node_modules/@gustale/db/package.json \
 && echo "@gustale/db installed into apps/api/node_modules"

# ---------- Stage 2: runtime ----------
FROM node:24.15-slim
WORKDIR /app

# Copy only what we need to run
COPY --from=build /app/apps/api/dist       ./apps/api/dist
COPY --from=build /app/apps/api/package.json ./apps/api/package.json
COPY --from=build /app/packages/db/dist    ./packages/db/dist
COPY --from=build /app/packages/db/package.json ./packages/db/package.json
COPY --from=build /app/node_modules        ./node_modules
COPY --from=build /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=build /app/packages/db/node_modules ./packages/db/node_modules

# Run as non-root
USER node

ENV NODE_ENV=production \
    HOST=127.0.0.1 \
    PORT=4000 \
    LOG_LEVEL=info

# Healthcheck pings /health (no DB call, always available)
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:4000/health', r => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

CMD ["node", "apps/api/dist/apps/api/src/server.js"]
