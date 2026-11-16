#!/usr/bin/env node

/**
 * Fetch a LIVE data snapshot for the web build, in the exact shape
 * `mock-api-data.json` already has.
 *
 * WHY THIS EXISTS
 * ---------------
 * The production web build used to run with `BUILD_DATA_SOURCE=live`,
 * which points the Astro build straight at the live API. The build then
 * fetched EVERY page's data one request at a time:
 *
 *   - 16,764 x GET /api/dishes/<slug>
 *   - 16,757 x GET /api/dishes/<slug>/journey
 *
 * at a sustained ~48 requests/second, for 13+ minutes. The API itself is
 * fast (p50 12.3 ms, p95 39 ms), but the build pays that round-trip
 * ~32,000 times and the Astro build sits at 25-32% CPU on 4 vCPUs --
 * it is I/O-bound, not CPU-bound.
 *
 * The CI build does the SAME work in 2m43s, because it uses the mock:
 * the same endpoints, served from an inlined JSON file. So the data is
 * already available in a form that needs no network at all.
 *
 * THIS SCRIPT IS THE BRIDGE. It fetches the live data ONCE, in a few
 * dozen requests, and writes it in the shape the mock already reads. The
 * build then runs the mock against that snapshot: same code path as CI,
 * live data, and the API-call phase drops from ~11 minutes to <1 second.
 *
 * WHAT IT FETCHES
 * ---------------
 *   GET /api/dishes?limit=N&offset=...   the full list (paginated)
 *   GET /api/dishes/map?limit=...        the map points
 *   GET /api/dishes/featured              the startpage's twelve
 *   GET /api/categories                   the category tree
 *   GET /api/lineages                     the lineages blob
 *   GET /api/places                       the places blob
 *   GET /api/atlas/counts                 the counts
 *   GET /api/atlas/connections            the connections
 *   GET /api/ingredients                  the ingredients
 *   GET /api/dishes/<slug>                every dish detail
 *   GET /api/dishes/<slug>/journey        every dish's journey
 *
 * The per-dish fetches are the only remaining fan-out. They run with a
 * bounded concurrency so they finish in seconds instead of minutes, and
 * they are CACHED: a dish whose `updatedAt` has not changed is not
 * re-fetched.
 *
 * USAGE
 * -----
 *   node scripts/fetch-live-snapshot.mjs \
 *       --api http://127.0.0.1:4000 \
 *       --out scripts/live-snapshot.json \
 *       [--concurrency 32] [--cache .live-snapshot-cache.json]
 *
 * The output is written in the mock's own shape, so the mock can serve
 * it with no changes at all.
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── args ────────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
function arg(name, fallback) {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
}

const API = arg(
  "api",
  process.env.PUBLIC_API_BASE || "http://127.0.0.1:4000",
).replace(/\/$/, "");
const OUT = arg("out", join(__dirname, "live-snapshot.json"));
const CONCURRENCY = Number(arg("concurrency", "32"));
const CACHE = arg("cache", join(__dirname, ".live-snapshot-cache.json"));
const LIMIT = Number(arg("limit", "100"));
const DISH_LIMIT = Number(arg("dishes", "0")); // 0 = every published dish

const t0 = Date.now();
const log = (m) =>
  console.log(`[snapshot ${((Date.now() - t0) / 1000).toFixed(1)}s] ${m}`);

// ── fetch ───────────────────────────────────────────────────────────────────
async function get(path, tries = 3) {
  let lastErr;
  for (let attempt = 1; attempt <= tries; attempt++) {
    try {
      const res = await fetch(`${API}${path}`, {
        headers: { accept: "application/json" },
        signal: AbortSignal.timeout(30_000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${path}`);
      return await res.json();
    } catch (err) {
      lastErr = err;
      if (attempt < tries)
        await new Promise((r) => setTimeout(r, attempt * 500));
    }
  }
  throw lastErr;
}

// ── the cache: a dish is re-fetched only when its updatedAt moved ──────────
let cache = { dishes: {} };
if (existsSync(CACHE)) {
  try {
    cache = JSON.parse(readFileSync(CACHE, "utf-8"));
    cache.dishes ??= {};
  } catch {
    cache = { dishes: {} };
  }
}

// ── a bounded-concurrency pool ─────────────────────────────────────────────
async function pool(items, limit, worker) {
  const results = new Array(items.length);
  let next = 0;
  let done = 0;
  const runners = Array.from(
    { length: Math.min(limit, items.length) },
    async () => {
      for (;;) {
        const i = next++;
        if (i >= items.length) return;
        results[i] = await worker(items[i], i);
        done++;
        if (done % 250 === 0 || done === items.length) {
          log(`  ${done}/${items.length}`);
        }
      }
    },
  );
  await Promise.all(runners);
  return results;
}

// ── 1. the list, paginated ──────────────────────────────────────────────────
log(`fetching the dish list from ${API}`);
const list = [];
for (let offset = 0; ; offset += LIMIT) {
  const page = await get(`/api/dishes?limit=${LIMIT}&offset=${offset}`);
  const rows = page?.dishes ?? [];
  list.push(...rows);
  if (rows.length < LIMIT) break;
}
log(`  ${list.length} dishes`);

const slugs = list.map((d) => d.slug).filter(Boolean);
const targets = DISH_LIMIT > 0 ? slugs.slice(0, DISH_LIMIT) : slugs;

// ── 2. the other top-level blobs ───────────────────────────────────────────
log("fetching the top-level blobs");
const blobs = {};
await Promise.all(
  ["categories", "lineages", "places", "ingredients"].map(async (name) => {
    try {
      blobs[name] = await get(`/api/${name}`);
    } catch (err) {
      log(`  WARN /api/${name}: ${err.message} -- keeping the previous value`);
    }
  }),
);
for (const [name, path] of [
  ["map", "/api/dishes/map?limit=200"],
  ["featured", "/api/dishes/featured"],
  ["counts", "/api/atlas/counts"],
  ["connections", "/api/atlas/connections"],
]) {
  try {
    blobs[name] = await get(path);
  } catch (err) {
    log(`  WARN ${path}: ${err.message}`);
  }
}

// ── 3. the lineages, in the MOCK's shape ───────────────────────────────────
//
// The live API returns the lineages CONTENT at /api/lineages:
//   { lineages: [...], totalLineages, regions, techniques, ... }
// The mock stores it as { list: <that object>, details: { <slug>: <detail> } }
// and serves /api/lineages from `.list` and /api/lineages/:slug from
// `.details`. So the snapshot has to be wrapped, not copied.
if (blobs.lineages) {
  const lineages = blobs.lineages.lineages ?? [];
  log(`fetching ${lineages.length} lineage details`);
  const lineageDetails = await pool(lineages, CONCURRENCY, async (l) => {
    const slug = l.slug ?? l.methodSlug ?? l.id;
    if (!slug) return null;
    try {
      return {
        slug,
        detail: await get(`/api/lineages/${encodeURIComponent(slug)}`),
      };
    } catch {
      return null;
    }
  });
  blobs.lineages = {
    list: blobs.lineages,
    details: Object.fromEntries(
      lineageDetails.filter(Boolean).map((x) => [x.slug, x.detail]),
    ),
  };
}

// ── 4. the per-dish details and journeys, with a cache ─────────────────────
log(
  `fetching ${targets.length} dish details + journeys (concurrency ${CONCURRENCY})`,
);
const details = {};
const nextCache = { dishes: {} };

await pool(targets, CONCURRENCY, async (slug) => {
  const cached = cache.dishes[slug];
  // The list row carries the dish's updatedAt. If it is unchanged, the
  // cached detail is still correct.
  const row = list.find((d) => d.slug === slug);
  const stamp = row?.updatedAt ?? null;

  if (cached && stamp && cached.stamp === stamp && cached.detail) {
    details[slug] = cached.detail;
    nextCache.dishes[slug] = cached;
    return;
  }

  const detail = await get(`/api/dishes/${encodeURIComponent(slug)}`);
  let journey = null;
  try {
    journey = await get(`/api/dishes/${encodeURIComponent(slug)}/journey`);
  } catch {
    journey = null;
  }
  // The mock reads the journey from `detail.journey`; the live API serves
  // it at its own URL. Store it where the mock expects it.
  const merged = journey ? { ...detail, journey } : detail;
  details[slug] = merged;
  nextCache.dishes[slug] = { stamp, detail: merged };
});

log(`  ${Object.keys(details).length} details`);

// ── 4. write it in the mock's shape ────────────────────────────────────────
const snapshot = {
  generatedFrom: `${API} (live snapshot, ${list.length} published dishes, captured ${new Date().toISOString()})`,
  list,
  map: blobs.map ?? { dishes: [], count: 0 },
  details,
  atlas: blobs.counts ?? {},
  counts: blobs.counts ?? {},
  places: blobs.places ?? { list: null, details: {} },
  connections: blobs.connections ?? { list: null, details: {} },
  categories: blobs.categories ?? { categories: [] },
  lineages: blobs.lineages ?? { list: null, details: {} },
  ingredients: blobs.ingredients ?? { ingredients: [] },
  featured: blobs.featured ?? { dishes: [] },
};

writeFileSync(OUT, JSON.stringify(snapshot));
writeFileSync(CACHE, JSON.stringify(nextCache));

const bytes = JSON.stringify(snapshot).length;
log(`wrote ${OUT} (${(bytes / 1024 / 1024).toFixed(1)} MB)`);
log(`wrote ${CACHE} (${Object.keys(nextCache.dishes).length} cached dishes)`);
log("done");
