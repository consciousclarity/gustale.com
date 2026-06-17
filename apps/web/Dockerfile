# Gustale Web — multi-stage Dockerfile
#
# Stage 1: builder
#   Builds the Astro front-end (apps/web) in the monorepo context.
#   PUBLIC_API_BASE is set at build time so the SSR fetch resolves to the
#   production API endpoint. If the API is unreachable during build, the
#   page still renders (serverError is set in the page frontmatter);
#   the React island retries against the live API after hydration.
#
# Stage 2: runtime
#   nginx:alpine serving the static `dist/` directory on port 4001.
#   Long-cache for hashed assets (`/_astro/*`), short-cache for HTML,
#   SPA-style fallback so the /dishes/... route resolves to /dishes/index.html.
FROM node:22-slim AS builder

WORKDIR /app

# Install pnpm globally (matches the monorepo's packageManager field)
RUN npm install -g pnpm

# Copy the full monorepo so workspace symlinks resolve
COPY . .

# Install all deps (incl. devDeps for the Astro build)
RUN pnpm install --frozen-lockfile

# Build only the web app. The filter ensures we don't waste time
# rebuilding @gustale/db / @gustale/api for a web-only change.
ARG PUBLIC_API_BASE=https://api.gustale.com
ENV PUBLIC_API_BASE=${PUBLIC_API_BASE}
RUN pnpm --filter apps-web run build

# ---------- Stage 2: runtime ----------
FROM nginx:1.27-alpine

# Drop the default nginx config; ship our own that:
#   - listens on 4001 (matches the Caddy upstream; non-privileged port)
#   - serves /_astro/* with a 1-year cache (hashed filenames = content-addressed)
#   - serves everything else with no-cache (HTML, JSON, etc.)
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
