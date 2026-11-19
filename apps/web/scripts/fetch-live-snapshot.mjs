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
 * THIS SCRIPT IS THE BRIDGE. It fetches the live data once before the
 * build and writes it in the shape the mock already reads. The
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
 *   GET /api/dishes/<slug>/atlas          every dish's associations
 *
 * The per-dish fetches are the only remaining fan-out. They run with a
 * bounded concurrency so they finish in seconds instead of minutes, and
 * detail and journey responses are cached against the dish's `updatedAt`.
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
//
// ...OR WHEN THE API'S RESPONSE SHAPE MOVED. See §4.
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
//
// THE SHAPE OF THE API'S RESPONSE.
//
// The cache decides whether a dish needs re-fetching by comparing the
// dish's `updatedAt` against the stamp it cached with. That is enough
// for a change to the DISH. It is not enough for a change to the API's
// RESPONSE SHAPE: a new field can appear on every dish without a single
// dish's `updatedAt` moving.
//
// So the shape is part of the stamp. It is computed from ONE dish -- the
// response has the same shape for every dish -- and it is the list of
// keys the API returns, at every level of the payload.
//
// The shape is computed from a PROBE fetch, before the pool, so that
// every dish in this run is compared against the same shape. A probe
// that fails must not silently mean "no shape" (which would make every
// cache entry miss every time): it falls back to the shape recorded in
// the cache, and if there is none, the whole run re-fetches.
//
// WHY THIS MATTERS, CONCRETELY
// -----------------------------
// On 2026-11-19 the API gained `ingredients[].category` -- the field the
// dish page needs to fill its "Prepared components" list. The build
// directory on the VPS is PERSISTENT and the snapshot cache is
// gitignored, so `git checkout --force` never cleared it, and the
// cache's stamp (the dish's `updatedAt`, 2026-10-26) never moved.
// Result: every dish was served from the cache, with `category: null`,
// and the live moussaka page printed no prepared components at all --
// while the API, queried directly, returned the category correctly.
//
// One full re-fetch when the API's shape changes is the right cost.
// The alternative is a page that silently loses a field.
//
// The probe fetches ONE dish -- the FIRST target -- and that same
// response is reused for the dish's own entry below, so the probe
// costs nothing extra on a run that fetches everything.
let probeDetail = null;
async function computeShape() {
  if (!targets.length) return null;
  const probeSlug = targets[0];
  try {
    probeDetail = await get(`/api/dishes/${encodeURIComponent(probeSlug)}`);
    return shapeOf(probeDetail);
  } catch (err) {
    log(`  WARN the shape probe for "${probeSlug}" failed: ${err.message}`);
    return cache.shape ?? null;
  }
}

/**
 * The shape of an API response: the set of keys at every level.
 *
 * Arrays are described by their ELEMENT's shape, not by their length --
 * a dish with 23 ingredients and a dish with 4 have the same shape, and
 * the count must not invalidate the cache. A key that is present but
 * null is still part of the shape: the field exists in the API, and
 * that is what the build cares about.
 */
function shapeOf(value, depth = 0) {
  if (value === null || typeof value !== "object") {
    return typeof value;
  }
  if (Array.isArray(value)) {
    // The union of the element shapes, so a field that appears on SOME
    // ingredients (and is null on others) is still part of the shape.
    const parts = value.map((v) => shapeOf(v, depth + 1));
    return `array<${[...new Set(parts)].sort().join("|")}>`;
  }
  const keys = Object.keys(value).sort();
  if (depth > 6) return `{${keys.join(",")}}`;
  const inner = keys
    .map((k) => `${k}:${shapeOf(value[k], depth + 1)}`)
    .join(",");
  return `{${inner}}`;
}

log(
  `fetching ${targets.length} dish details + journeys (concurrency ${CONCURRENCY})`,
);
const details = {};

const shape = await computeShape();
log(`  shape: ${shape ? shape.length : 0} chars`);

// The cache carries the shape it was written with, so the NEXT run can
// tell whether the API's response has changed shape since.
const nextCache = { dishes: {}, shape };

await pool(targets, CONCURRENCY, async (slug) => {
  const cached = cache.dishes[slug];
  // The list row carries the dish's updatedAt. If it is unchanged, the
  // cached detail is still correct.
  //
  // AND THE SHAPE MUST MATCH. A dish's `updatedAt` says nothing about
  // the API's RESPONSE SHAPE. When the API starts sending a field the
  // cache has never seen -- `ingredients[].category`, for instance --
  // every dish's `updatedAt` is unchanged, so the cache would serve
  // every stale detail and the new field would never appear in the
  // built pages.
  //
  // That is not hypothetical: on 2026-11-19 the API gained
  // `ingredients[].category` (the "Prepared components" list needs it),
  // and the build served a snapshot in which all 23 ingredients of a
  // moussaka had `category: null`, so the page printed no prepared
  // components at all. The cache is keyed on the dish's `updatedAt`
  // (2026-10-26, never touched again) and it lives in a PERSISTENT
  // build directory, so the stale entry survived every rebuild.
  //
  // The shape is taken from ONE dish's detail -- the response is the
  // same shape for every dish -- and it is part of the cache's stamp.
  // When the API's shape changes, the stamp changes, and every dish is
  // re-fetched. That is the correct cost: one full fetch when the API
  // changes shape, and no fetch at all when it does not.
  const row = list.find((d) => d.slug === slug);
  const stamp = row?.updatedAt ?? null;
  // The shape of the API's response as it is NOW (computed by the probe
  // above), against the shape the cached detail was stored with. They
  // must be the same, or the cached detail is missing a field the API
  // now sends.
  const cachedShape = cached?.shape ?? null;

  if (
    cached &&
    stamp &&
    cached.stamp === stamp &&
    cached.detail &&
    shape &&
    cachedShape === shape
  ) {
    details[slug] = cached.detail;
    nextCache.dishes[slug] = cached;
    return;
  }

  // The probe above already fetched the FIRST target's detail. Reuse it
  // rather than asking for it again -- the probe is not free, and a
  // second request for the same dish would be waste.
  const detail =
    probeDetail && slug === targets[0]
      ? probeDetail
      : await get(`/api/dishes/${encodeURIComponent(slug)}`);
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
  nextCache.dishes[slug] = { stamp, shape, detail: merged };
});

log(`  ${Object.keys(details).length} details`);

// ── 5. the per-dish atlas ─────────────────────────────────────────────────
// Association reviews can change independently of the dish's updatedAt.
// Capture them afresh so the static pages reflect the latest evidence labels.
log(`fetching ${targets.length} dish atlases (concurrency ${CONCURRENCY})`);
const atlasRows = await pool(targets, CONCURRENCY, async (slug) => {
  try {
    return await get(`/api/dishes/${encodeURIComponent(slug)}/atlas`);
  } catch {
    return null;
  }
});
const atlas = Object.fromEntries(
  targets.map((slug, i) => [slug, atlasRows[i]]).filter(([, row]) => row),
);
log(`  ${Object.keys(atlas).length} atlases captured out of ${targets.length}`);

// ── 6. write it in the mock's shape ────────────────────────────────────────
const snapshot = {
  generatedFrom: `${API} (live snapshot, ${list.length} published dishes, captured ${new Date().toISOString()})`,
  list,
  map: blobs.map ?? { dishes: [], count: 0 },
  details,
  atlas,
  counts: blobs.counts ?? {},
  places: blobs.places ?? { places: [], count: 0 },
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
