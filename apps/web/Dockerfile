# Gustale Web — multi-stage Dockerfile
#
# Builds one of two domain variants:
#   - PUBLIC_DOMAIN=recipes → encyclopedia site (gustale.recipes)
#   - PUBLIC_DOMAIN=geo     → geo/map site (gustale.com)
#
# Both use the same Astro codebase; the difference is the post-build
# filter (apps/web/scripts/post-build.mjs) that drops domain-specific
# pages from the dist/ tree. See the script for the page mapping.
#
# Stage 1: builder
#   Builds the Astro front-end with PUBLIC_DOMAIN set so the post-build
#   filter knows which pages to drop. PUBLIC_API_BASE is set at build
#   time so the SSR fetch resolves to the production API endpoint.
#
# Stage 2: runtime
#   nginx:alpine serving the static `dist/` directory on port 4001.
#   Two separate images are produced from this same Dockerfile, one
#   per PUBLIC_DOMAIN, and deployed to two containers behind Caddy:
#     - gustale-web-recipes  → gustale.recipes
#     - gustale-web-geo      → gustale.com
#
# ---------- Cache structure ----------
# Same pattern as apps/api/Dockerfile: copy pnpm-lock.yaml + the four
# workspace package.json files first, install (cacheable layer whose
# key is just those 7 files), then COPY . . for the build. Combined
# with `cache-from: type=gha` in ci.yml, source-only PRs reuse the
# install layer and skip ~60-90s of `pnpm install` work.
FROM node:22-slim AS builder

WORKDIR /app

# Install pnpm globally (matches the monorepo's packageManager field)
RUN npm install -g pnpm@11

# Set CI=true so pnpm doesn't try to purge node_modules interactively
ENV CI=true

# Cache-friendly install boundary: only files that affect the dep tree.
# See apps/api/Dockerfile for the full rationale.
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/db/package.json     ./packages/db/
COPY packages/ui/package.json     ./packages/ui/
COPY apps/api/package.json        ./apps/api/
COPY apps/web/package.json        ./apps/web/

RUN pnpm install --frozen-lockfile

# Build only the web app. The filter ensures we don't waste time
# rebuilding @gustale/db / @gustale/api for a web-only change.
# PUBLIC_DOMAIN picks which page subset to keep (recipes|geo).
ARG PUBLIC_DOMAIN=recipes
ARG PUBLIC_API_BASE=https://api.gustale.recipes
# CACHEBUST is set by CI to the per-commit SHA so the build RUN below
# is never reused from a stale GHA layer cache (the previous symptom was
# "[mock-api] 0 dishes loaded" + a 30-page dist, repeated across PRs that
# had no source changes to the relevant files). Pass via
# `--build-arg CACHEBUST=${{ github.sha }}` in ci.yml.
ARG CACHEBUST=local
ENV PUBLIC_DOMAIN=${PUBLIC_DOMAIN}
ENV PUBLIC_API_BASE=${PUBLIC_API_BASE}

# Now copy the rest of the source. This layer's cache key is the full
# monorepo tree, so it (and everything below) invalidates on every commit.
COPY . .

# Stamp the CACHEBUST value into a file the final RUN step will read.
# This forces buildx to consider the final mock-api+astro layer invalid
# on every commit (since CI passes CACHEBUST=${{ github.sha }}), even
# when the source files referenced by COPY . . are byte-identical to a
# previous (potentially failed) run. Without this stamp, the GHA cache
# can return a "successful" layer from a prior PR whose mock-api
# happened to load 0 dishes — leaving us with a 30-page dist and a
# post-build refusal on every cache hit.
RUN echo "CACHEBUST=${CACHEBUST}" > /tmp/.gustale-cachebust

# Clean the web app's previous build + Astro cache before building.
# This guards against stale `.astro/` cache producing a partial dist
# (we saw a CI run ship only 1 dish due to this). The post-build
# script also has a floor check, but a clean rebuild is cheaper than
# failing and re-running the whole pipeline.
RUN rm -rf /app/apps/web/dist /app/apps/web/.astro

# NOTE: The API health check (wait-for-api.mjs) runs inside this RUN
# against a local mock API on port 8742. We start the mock in the
# background, wait for it to become reachable, run the Astro build,
# and always clean up the mock process — even if the build fails.
# See apps/web/scripts/mock-api.mjs for the mock implementation.
#
# Why: GHA runner IPs are blocked by the VPS firewall, so the runner
# cannot reach the production API at api.gustale.recipes. The mock
# serves the same data shapes from the inlined 31-dish seed, making
# CI fully self-contained. No upstream API = no CI dependency.
#
# The PUBLIC_API_BASE=http://127.0.0.1:8742 prefix overrides the ENV
# for the build command only; the ARG and ENV defaults remain
# unchanged, so the production runtime image has no trace of the
# mock URL.

# Use the right build script per domain.
#   recipes → build:recipes  (drops /map)
#   geo     → build:geo      (drops /ingredients, edit/new; keeps /dishes list)
# `cat /tmp/.gustale-cachebust` makes this layer's cache key depend on
# the CACHEBUST ARG, so CI never reuses a stale "0 dishes" layer from
# a previous (failed) run with identical source files. See CACHEBUST
# ARG above for the full rationale.
RUN cat /tmp/.gustale-cachebust >/dev/null && \
    node apps/web/scripts/mock-api.mjs --port 8742 & \
    MOCK_PID=$!; \
    trap 'kill $MOCK_PID 2>/dev/null || true; wait $MOCK_PID 2>/dev/null || true' EXIT; \
    node apps/web/scripts/wait-for-api.mjs http://127.0.0.1:8742; \
    if [ "$PUBLIC_DOMAIN" = "geo" ]; then \
      PUBLIC_API_BASE=http://127.0.0.1:8742 pnpm --filter @gustale/web run build:geo; \
    else \
      PUBLIC_API_BASE=http://127.0.0.1:8742 pnpm --filter @gustale/web run build:recipes; \
    fi

# ---------- Stage 2: runtime ----------
FROM nginx:1.27-alpine

# Drop the default nginx config; ship our own that:
#   - listens on 4001 (matches the Caddy upstream; non-privileged port)
#   - serves /_astro/* with a 1-year cache (hashed filenames = content-addressed)
#   - serves everything else with no-cache (HTML, CSS, JS, etc.)
#   - falls back to /index.html for unknown routes (Astro static routing)
#   - gzip on text-ish content
# The COPY path is relative to the build context root (the monorepo root).
RUN rm -f /etc/nginx/conf.d/default.conf
COPY apps/web/nginx.conf /etc/nginx/conf.d/gustale-web.conf

# Astro's build output. We COPY as root (the default for COPY) and keep
# the container running as root. The official nginx:alpine image also
# runs as root; switching to `USER nginx` here breaks because nginx
# cannot bind a non-privileged port without CAP_NET_BIND_SERVICE, and
# cannot reload config from /etc/nginx (which would need to be chowned).
# For a single-process container behind Caddy, root-in-container is the
# pragmatic choice. The host-level security boundary is Caddy + the VPS
# firewall, not the in-container uid.
COPY --from=builder /app/apps/web/dist/ /usr/share/nginx/html/

EXPOSE 4001

# Healthcheck: nginx serves a 200 on / for the index page
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget -q -O- http://127.0.0.1:4001/ >/dev/null 2>&1 || exit 1

CMD ["nginx", "-g", "daemon off;"]
