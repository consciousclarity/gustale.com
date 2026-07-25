#!/usr/bin/env node
/**
 * Refresh apps/web/scripts/mock-api-data.json + mock-api-lineages.json
 * from the live prod API at api.gustale.recipes (https-only, read-only).
 *
 * Run from the worktree root:
 *   node scripts/refresh-ss-mock.mjs [--api-base https://api.gustale.recipes]
 *
 * Idempotent. Writes only the two files. Validates the produced counts
 * against the live `/api/dishes/map?limit=2000` count field before exit.
 *
 * Captures:
 *   list     — paginated GET /api/dishes?status=published (full 120, 100+20)
 *   map      — GET /api/dishes/map?limit=2000 (all 120)
 *   details  — GET /api/dishes/:slug for each of the 120 slugs
 *
 *   list.lineages / details[slug] — GET /api/lineages and per-lineage
 *   GET /api/lineages/:slug.
 *
 * Output files preserve the existing top-level shape
 *   { generatedFrom, list[], map[], details: {slug: {...}} }
 *   { list: {lineages[], totalLineages, ...}, details: {slug: {...}} }
 * so the existing mock-api.mjs loader (which only reads `list`, `map`,
 * `details` from the dish file and `list`, `details` from the lineage
 * file) keeps working without changes.
 */

import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const WEB_SCRIPTS = join(__dirname, "..", "apps", "web", "scripts");
const MOCK_DATA_PATH = join(WEB_SCRIPTS, "mock-api-data.json");
const MOCK_LINEAGES_PATH = join(WEB_SCRIPTS, "mock-api-lineages.json");

let API_BASE = "https://api.gustale.recipes";
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i];
  if (a === "--api-base" && i + 1 < process.argv.length) {
    API_BASE = process.argv[++i];
  } else if (a.startsWith("--api-base=")) {
    API_BASE = a.slice("--api-base=".length);
  }
}
API_BASE = API_BASE.replace(/\/+$/, "");

const POLL_MS = 80;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getJson(path) {
  const url = `${API_BASE}${path}`;
  for (let attempt = 1; attempt <= 4; attempt++) {
    const res = await fetch(url, {
      headers: { "User-Agent": "gustale-mock-refresh/1.0" },
    });
    if (res.status === 429 || res.status >= 500) {
      const backoff = POLL_MS * 2 ** attempt;
      process.stderr.write(
        `! ${res.status} ${url} (retry ${attempt}/4 in ${backoff}ms)\n`,
      );
      await sleep(backoff);
      continue;
    }
    if (!res.ok) {
      throw new Error(`GET ${url} failed: ${res.status} ${res.statusText}`);
    }
    return await res.json();
  }
  throw new Error(`GET ${url} gave up after 4 retries`);
}

async function main() {
  const t0 = Date.now();

  // 1. Discover the full slug set + count from the map endpoint (no cap).
  const mapResp = await getJson("/api/dishes/map?limit=2000");
  const allSlugs = (mapResp.dishes || []).map((d) => d.slug);
  const declaredCount = mapResp.count;
  if (!Array.isArray(allSlugs) || allSlugs.length === 0) {
    throw new Error("map endpoint returned no dishes; abort");
  }
  if (declaredCount !== undefined && declaredCount !== allSlugs.length) {
    process.stderr.write(
      `! count_field=${declaredCount} != len(dishes)=${allSlugs.length}; using list length\n`,
    );
  }
  console.log(`+ map: ${allSlugs.length} unique slugs`);

  // 2. Paginated list (cap=100). 2 calls.
  const list = [];
  for (const offset of [0, 100]) {
    const page = await getJson(
      `/api/dishes?status=published&limit=100&offset=${offset}`,
    );
    const items = page.dishes || [];
    list.push(...items);
    console.log(
      `+ list offset=${offset}: ${items.length} (running ${list.length})`,
    );
    if (items.length === 0) break;
  }
  if (list.length !== allSlugs.length) {
    process.stderr.write(
      `! list=${list.length} != map=${allSlugs.length} — continuing but expect drift\n`,
    );
  }

  // 3. Per-slug detail capture.
  const details = {};
  let i = 0;
  for (const slug of allSlugs) {
    i += 1;
    try {
      details[slug] = await getJson(`/api/dishes/${encodeURIComponent(slug)}`);
    } catch (err) {
      process.stderr.write(`! detail ${slug}: ${err.message}\n`);
      // continue
    }
    if (i % 20 === 0) console.log(`  details ${i}/${allSlugs.length}`);
    if (i < allSlugs.length) await sleep(POLL_MS);
  }
  console.log(
    `+ details: ${Object.keys(details).length} (expected ${allSlugs.length})`,
  );

  // 4. Compose mock-api-data.json
  const mockData = {
    generatedFrom: `${API_BASE} (live, ${allSlugs.length} published dishes, captured ${new Date().toISOString()})`,
    list,
    map: mapResp.dishes,
    details,
  };
  writeFileSync(MOCK_DATA_PATH, `${JSON.stringify(mockData)}\n`);
  console.log(
    `+ wrote ${MOCK_DATA_PATH} (${list.length} list, ${mockData.map.length} map, ${Object.keys(details).length} details)`,
  );

  // 5. Lineages.
  const lineagesList = await getJson("/api/lineages");
  const lineageSlugs = (lineagesList.lineages || []).map((l) => l.slug);
  console.log(`+ lineages list: ${lineageSlugs.length}`);
  const lineageDetails = {};
  let j = 0;
  for (const slug of lineageSlugs) {
    j += 1;
    try {
      lineageDetails[slug] = await getJson(
        `/api/lineages/${encodeURIComponent(slug)}`,
      );
    } catch (err) {
      process.stderr.write(`! lineage ${slug}: ${err.message}\n`);
    }
    if (j < lineageSlugs.length) await sleep(POLL_MS);
  }
  const mockLineages = {
    list: lineagesList,
    details: lineageDetails,
  };
  writeFileSync(MOCK_LINEAGES_PATH, `${JSON.stringify(mockLineages)}\n`);
  console.log(
    `+ wrote ${MOCK_LINEAGES_PATH} (${lineageSlugs.length} lineages, ${Object.keys(lineageDetails).length} details)`,
  );

  console.log(`\nelapsed=${((Date.now() - t0) / 1000).toFixed(1)}s`);
}

main().catch((err) => {
  console.error(err.stack || err.message);
  process.exit(1);
});
