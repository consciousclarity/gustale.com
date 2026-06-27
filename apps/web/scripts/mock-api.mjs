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
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_PATH = join(__dirname, 'mock-api-data.json');
const DATA = JSON.parse(
  readFileSync(DATA_PATH, 'utf-8'),
);
// DEBUG: dump the path, byte size, and top-level shape so CI failures
// like "[mock-api] 0 dishes loaded" are diagnosable from the build log.
// Remove once the CI cache-staleness root cause is fixed.
console.log(`[mock-api] DEBUG: __dirname=${__dirname}`);
console.log(`[mock-api] DEBUG: DATA_PATH=${DATA_PATH}`);
console.log(`[mock-api] DEBUG: DATA_PATH exists=${existsSync(DATA_PATH)}`);
try {
  const raw = readFileSync(DATA_PATH, 'utf-8');
  console.log(`[mock-api] DEBUG: raw byte length=${raw.length}`);
  console.log(`[mock-api] DEBUG: raw first 120 chars=${raw.slice(0, 120).replace(/\n/g, '\\n')}`);
  console.log(`[mock-api] DEBUG: raw last 60 chars=${raw.slice(-60).replace(/\n/g, '\\n')}`);
  const parsed = JSON.parse(raw);
  console.log(`[mock-api] DEBUG: parsed top-level keys=${Object.keys(parsed).join(',')}`);
  console.log(`[mock-api] DEBUG: parsed.list.length=${parsed.list?.length ?? 'undefined'}`);
  console.log(`[mock-api] DEBUG: parsed.list[0]?.slug=${parsed.list?.[0]?.slug ?? 'undefined'}`);
} catch (e) {
  console.log(`[mock-api] DEBUG: re-read failed: ${e.message}`);
}

// Lineages live in a separate JSON file (generated from packages/db seed-data.ts
// at seed time). Optional so older builds without lineages still work.
const LINEAGES_DATA_PATH = join(__dirname, 'mock-api-lineages.json');
const HAS_LINEAGES = existsSync(LINEAGES_DATA_PATH);
const LINEAGES_DATA = HAS_LINEAGES
  ? JSON.parse(readFileSync(LINEAGES_DATA_PATH, 'utf-8'))
  : { list: null, details: {} };

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

  // ─── Lineages (GET /api/lineages, /api/lineages/:slug) ──────────────
  // Mirrors apps/api/src/routes/lineages.ts. Filter logic is duplicated here
  // because the mock server is intentionally standalone (no DB).
  if (url.pathname === '/api/lineages' && req.method === 'GET') {
    if (!HAS_LINEAGES || !LINEAGES_DATA.list) {
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({
        lineages: [], totalLineages: 0, totalDishes: 0, totalRelations: 0,
        uncertainOrParallelCount: 0, regions: [], techniques: [],
        historicalForces: [], confidenceLevels: [],
      }));
      return;
    }
    // Apply the same filters as the real API: search, origin, technique,
    // historicalForce, confidence.
    const search = (url.searchParams.get('search') ?? '').toLowerCase().trim();
    const origin = (url.searchParams.get('origin') ?? '').toLowerCase().trim();
    const technique = (url.searchParams.get('technique') ?? '').toLowerCase().trim();
    const historicalForce = (url.searchParams.get('historicalForce') ?? '').toLowerCase().trim();
    const confidence = (url.searchParams.get('confidence') ?? '').trim();

    let lineages = LINEAGES_DATA.list.lineages.slice();
    if (search) {
      lineages = lineages.filter((l) => {
        const hay = `${l.name} ${l.shortDescription} ${l.conceptSummary ?? ''} ${(l.techniques ?? []).join(' ')} ${(l.originRegions ?? []).join(' ')} ${(l.relatedRegions ?? []).join(' ')}`.toLowerCase();
        return hay.includes(search);
      });
    }
    if (origin) {
      lineages = lineages.filter((l) => {
        const regs = [...(l.originRegions ?? []), ...(l.relatedRegions ?? [])].map((x) => x.toLowerCase());
        return regs.some((r) => r.includes(origin));
      });
    }
    if (technique) {
      lineages = lineages.filter((l) =>
        (l.techniques ?? []).some((t) => t.toLowerCase().includes(technique)),
      );
    }
    if (historicalForce) {
      lineages = lineages.filter((l) =>
        (l.historicalForces ?? []).some((f) => f.toLowerCase() === historicalForce),
      );
    }
    if (confidence) {
      lineages = lineages.filter((l) => l.confidenceLevel === confidence);
    }

    // Recompute aggregates over the filtered set so the UI stays honest.
    const filteredIds = new Set(lineages.map((l) => l.id));
    const allEdges = Object.entries(LINEAGES_DATA.details)
      .filter(([slug]) => filteredIds.has(slug))
      .flatMap(([, d]) => d.groupedDishes.flatMap((g) => g.dishes));
    const distinctDishes = new Set(allEdges.map((d) => d.id));
    const uncertainCount = allEdges.filter((d) =>
      ['uncertain', 'parallel_evolution', 'possible'].includes(d.confidenceLevel),
    ).length;

    const regions = new Set();
    const techniques = new Set();
    const forces = new Set();
    lineages.forEach((l) => {
      (l.originRegions ?? []).forEach((x) => regions.add(x));
      (l.relatedRegions ?? []).forEach((x) => regions.add(x));
      (l.techniques ?? []).forEach((x) => techniques.add(x));
      (l.historicalForces ?? []).forEach((x) => forces.add(x));
    });

    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({
      lineages,
      totalLineages: lineages.length,
      totalDishes: distinctDishes.size,
      totalRelations: allEdges.length,
      uncertainOrParallelCount: uncertainCount,
      regions: [...regions].sort(),
      techniques: [...techniques].sort(),
      historicalForces: [...forces].sort(),
      confidenceLevels: [...new Set(lineages.map((l) => l.confidenceLevel))].sort(),
    }));
    return;
  }

  // GET /api/lineages/:slug
  const lineageMatch = url.pathname.match(/^\/api\/lineages\/([^/]+)$/);
  if (lineageMatch && req.method === 'GET') {
    if (!HAS_LINEAGES) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'lineages not available in mock' }));
      return;
    }
    const detail = LINEAGES_DATA.details[lineageMatch[1]];
    if (detail) {
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(detail));
      return;
    }
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'lineage not found', slug: lineageMatch[1] }));
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
