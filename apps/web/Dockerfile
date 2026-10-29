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
ENV PUBLIC_DOMAIN=${PUBLIC_DOMAIN}
ENV PUBLIC_API_BASE=${PUBLIC_API_BASE}

# BUILD_DATA_SOURCE controls where the build gets its data.
#   mock  (default) — start an in-container mock on :8742 from the
#                     committed seed. Used by GHA, which cannot reach
#                     the VPS due to firewall rules.
#   live           — fetch from a real API at PUBLIC_API_BASE. Used
#                     when building on the VPS itself (where the API
#                     is reachable on 127.0.0.1:4000). Skips the mock
#                     and the wait-for-mock step, so the build is
#                     faster and the static pages reflect the live
#                     data (newly-published dishes, updated
#                     longDescriptions, etc.) instead of the snapshot
#                     in mock-api-data.json.
ARG BUILD_DATA_SOURCE=mock
ENV BUILD_DATA_SOURCE=${BUILD_DATA_SOURCE}

# Optional CARTO basemap key. CARTO's *vector* basemap styles still load
# without a key, so this defaults to empty and the maps work keyless.
# If CARTO extends the key requirement to vector styles (they have said
# they may), setting this build arg is all that is needed — the key is
# attached to every basemaps.cartocdn.com request at runtime by
# apps/web/src/lib/basemap.ts.
#
# This is a public, browser-side token by design (like a Mapbox public
# token) — it is not a server secret, and the value never reaches the
# API container.
ARG PUBLIC_CARTO_API_KEY=
ENV PUBLIC_CARTO_API_KEY=${PUBLIC_CARTO_API_KEY}

# Now copy the rest of the source. This layer's cache key is the full
# monorepo tree, so it (and everything below) invalidates on every commit.
COPY . .

# Clean the web app's previous build + Astro cache before building.
# This guards against stale `.astro/` cache producing a partial dist
# (we saw a CI run ship only 1 dish due to this). The post-build
# script also has a floor check, but a clean rebuild is cheaper than
# failing and re-running the whole pipeline.
RUN rm -rf /app/apps/web/dist /app/apps/web/.astro

# ADR-003 — fetch the self-hosted Noto faces.
#
# The @font-face rules are committed (apps/web/src/styles/noto.css) but
# the woff2 files are not: the CJK faces alone are tens of megabytes,
# and committing them to a public repository would be indefensible.
#
# The Google Fonts CSS API serves each family already split into
# unicode-range subsets, so this is the "subset per locale" the ADR
# asks for — a Latin page never pulls the CJK files.
#
# The fetch is cached in the layer: it only runs again when the script
# changes.
RUN python3 scripts/fetch_noto_fonts.py

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

# Build step. Branches on BUILD_DATA_SOURCE:
#   mock → start an in-container mock on :8742, wait for it, build
#   live → trust PUBLIC_API_BASE (the caller chose it; must be reachable
#          on the build host), wait for its /health, build
# In both cases the same pnpm build:recipes / build:geo script runs.
RUN if [ "$BUILD_DATA_SOURCE" = "live" ]; then \
      node apps/web/scripts/wait-for-api.mjs "$PUBLIC_API_BASE" && \
      if [ "$PUBLIC_DOMAIN" = "geo" ]; then \
        pnpm --filter @gustale/web run build:geo; \
      else \
        pnpm --filter @gustale/web run build:recipes; \
      fi; \
    else \
      node apps/web/scripts/mock-api.mjs --port 8742 & \
      MOCK_PID=$!; \
      trap 'kill $MOCK_PID 2>/dev/null || true; wait $MOCK_PID 2>/dev/null || true' EXIT; \
      node apps/web/scripts/wait-for-api.mjs http://127.0.0.1:8742; \
      if [ "$PUBLIC_DOMAIN" = "geo" ]; then \
        PUBLIC_API_BASE=http://127.0.0.1:8742 pnpm --filter @gustale/web run build:geo; \
      else \
        PUBLIC_API_BASE=http://127.0.0.1:8742 pnpm --filter @gustale/web run build:recipes; \
      fi; \
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
