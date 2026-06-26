#!/usr/bin/env node
/**
 * Mock API server for CI builds.
 *
 * Why this exists
 * ---------------
 * The Astro site is built as static HTML (SSG). At build time the pages in
 * `src/pages/` fetch from PUBLIC_API_BASE — including /lineages (groups dishes
 * by methodSlug), /families (groups by familySlug + originName), the /dishes
 * list, and every /dishes/:slug detail page via getStaticPaths.
 *
 * GHA runner IPs are blocked by the VPS firewall, so the build cannot reach
 * the production API at api.gustale.recipes. Instead, the Dockerfile starts
 * THIS server on a local port and points PUBLIC_API_BASE at it, making CI
 * fully self-contained.
 *
 * Source of truth
 * ---------------
 * The data in `mock-api-data.json` is captured verbatim from the live API
 * (https://api.gustale.recipes — all 60 published dishes) so the baked HTML
 * matches production exactly: real methodSlug/familySlug/originName, so
 * /lineages and /families render real lineages/families instead of "Other".
 *
 * To refresh after seed/data changes, re-capture the three endpoints from the
 * live API (list ?status=published&limit=100, /map?limit=200, and each
 * /dishes/:slug) and regenerate mock-api-data.json. See SHARED_STATE.md.
 *
 * Endpoints served (mirroring apps/api/src/routes/dishes.ts):
 *   GET /health
 *   GET /api/dishes              → { dishes, limit, offset }
 *   GET /api/dishes/map          → { dishes, count }
 *   GET /api/dishes/:slug        → full dish detail
 *
 * Usage:
 *   node scripts/mock-api.mjs [--port 8742]
 */

import http from 'node:http';
import { readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA = JSON.parse(
  readFileSync(join(__dirname, 'mock-api-data.json'), 'utf-8'),
);

const LIST = DATA.list ?? [];
const MAP = DATA.map ?? [];
const DETAILS = DATA.details ?? {};

let PORT = 8742;
for (let i = 2; i < process.argv.length; i++) {
  if (process.argv[i] === '--port' && i + 1 < process.argv.length) {
    PORT = parseInt(process.argv[i + 1], 10);
  } else if (process.argv[i].startsWith('--port=')) {
    PORT = parseInt(process.argv[i].split('=')[1], 10);
  }
}
if (Number.isNaN(PORT) || PORT < 1 || PORT > 65535) PORT = 8742;
const HOST = '0.0.0.0';

// ─── HTTP Server ───────────────────────────────────────────────────────────

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${HOST}:${PORT}`);

  // CORS headers (not strictly needed for Astro SSG, but harmless).
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // GET /health
  if (url.pathname === '/health') {
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ status: 'ok' }));
    return;
  }

  // GET /api/dishes — list all published dishes
  if (url.pathname === '/api/dishes' && req.method === 'GET') {
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ dishes: LIST, limit: 100, offset: 0 }));
    return;
  }

  // GET /api/dishes/map — map data
  if (url.pathname === '/api/dishes/map' && req.method === 'GET') {
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ dishes: MAP, count: MAP.length }));
    return;
  }

  // GET /api/dishes/:slug — dish detail
  const slugMatch = url.pathname.match(/^\/api\/dishes\/([^/]+)$/);
  if (slugMatch && req.method === 'GET') {
    const detail = DETAILS[slugMatch[1]];
    if (detail) {
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(detail));
      return;
    }
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found', message: `No dish with slug "${slugMatch[1]}"` }));
    return;
  }

  // Fallback 404
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found', message: `Unknown route: ${url.pathname}` }));
});

server.listen(PORT, HOST, () => {
  console.log(`[mock-api] listening on http://${HOST}:${PORT}`);
  console.log(`[mock-api] ${LIST.length} dishes loaded (${DATA.generatedFrom ?? 'mock-api-data.json'})`);
});
