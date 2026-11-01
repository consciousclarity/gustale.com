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

  // 2. Paginated list (cap=100) until a short/empty page.
  const list = [];
  const pageSize = 100;
  for (let offset = 0; ; offset += pageSize) {
    const page = await getJson(
      `/api/dishes?status=published&limit=${pageSize}&offset=${offset}`,
    );
    const items = page.dishes || [];
    list.push(...items);
    console.log(
      `+ list offset=${offset}: ${items.length} (running ${list.length})`,
    );
    if (items.length < pageSize) break;
  }
  // THE LIST AND THE MAP ARE DIFFERENT SETS, and that is not drift.
  //
  // `/api/dishes/map` returns only the dishes that HAVE A GEOMETRY —
  // it filters on `origin_location IS NOT NULL` — because a dot on a
  // map needs a coordinate. On the live catalogue that is 121 of the
  // 1,474 published dishes; the other 1,353 have no geometry and are
  // not on the map.
  //
  // The LIST is every published dish. So the DETAIL capture must walk
  // the LIST's slugs, not the map's.
  //
  // The first version of this script walked the map's slugs, which
  // meant the mock file carried 121 details against 1,474 list
  // entries — 1,353 dishes with no detail, so the SSG build served
  // them as empty pages. The mock was stale in a way that looked like
  // a successful capture.
  const listSlugs = list.map((d) => d.slug);
  if (listSlugs.length !== allSlugs.length) {
    process.stderr.write(
      `! list=${listSlugs.length} vs map=${allSlugs.length} — the map holds only the dishes WITH geometry, which is expected\n`,
    );
  }

  // 3. Per-slug detail capture — over the LIST, so every published
  // dish gets a detail.
  const details = {};
  let i = 0;
  for (const slug of listSlugs) {
    i += 1;
    try {
      details[slug] = await getJson(`/api/dishes/${encodeURIComponent(slug)}`);
    } catch (err) {
      process.stderr.write(`! detail ${slug}: ${err.message}\n`);
      // continue
    }
    if (i % 100 === 0) console.log(`  details ${i}/${listSlugs.length}`);
    if (i < listSlugs.length) await sleep(POLL_MS);
  }

  // 3b. The ATLAS data — the three concepts, per dish.
  //
  // The atlas route is /api/dishes/:slug/atlas, a DIFFERENT path from
  // the dish detail, so the capture above does not fetch it.
  //
  // Without this the mock carries no atlas data at all, and a P4 build
  // against it would silently bake dishes with no associations and no
  // claims — the same class of bug as the 1,353 empty pages, one phase
  // later.
  //
  // The atlas route is OPTIONAL: an API that predates it returns 404,
  // and then there is simply nothing to capture. The capture says so
  // rather than pretending.
  const atlas = {};
  let atlasCount = 0;
  let atlasMissing = 0;
  for (const slug of listSlugs) {
    try {
      const body = await getJson(
        `/api/dishes/${encodeURIComponent(slug)}/atlas`,
      );
      atlas[slug] = body;
      atlasCount += 1;
    } catch (err) {
      // 404 means the API does not have the route yet. That is not a
      // failure — it is a fact about the API, and it is recorded.
      atlasMissing += 1;
      if (atlasMissing === 1) {
        process.stderr.write(
          `! the atlas route is not available (${err.message}) — the mock will carry no atlas data\n`,
        );
      }
    }
    if (atlasCount % 100 === 0)
      console.log(`  atlas ${atlasCount}/${listSlugs.length}`);
    if (atlasCount < listSlugs.length) await sleep(POLL_MS);
  }
  console.log(`+ atlas: ${atlasCount} of ${listSlugs.length} dishes`);

  // 3c. The DEFINED COUNTS — the site-wide numbers, each with its
  // definition. One endpoint, and the homepage's statistics come from
  // it (ADR-004 F7).
  let counts = null;
  try {
    counts = await getJson("/api/atlas/counts");
    console.log(`+ counts: ${JSON.stringify(counts.counts)}`);
  } catch (err) {
    process.stderr.write(
      `! the counts endpoint is not available (${err.message})\n`,
    );
  }
  console.log(
    `+ details: ${Object.keys(details).length} (expected ${listSlugs.length})`,
  );

  // THE ASSERTION. The details must cover EVERY published dish, not
  // just the ones with geometry.
  //
  // The first version of this script compared the details against the
  // MAP's count (121), so a capture that fetched 121 details for 1,474
  // published dishes PASSED. The mock then served 1,353 dishes with no
  // detail, and the SSG build baked them as empty pages.
  //
  // A stale mock that looks like a successful capture is worse than no
  // mock, so this is asserted, not just logged.
  if (Object.keys(details).length !== listSlugs.length) {
    throw new Error(
      `the capture is incomplete: ${Object.keys(details).length} details for ${listSlugs.length} published dishes. ` +
        `Every published dish needs a detail — the SSG build bakes a page per dish.`,
    );
  }

  // 4. Compose mock-api-data.json
  const mockData = {
    generatedFrom: `${API_BASE} (live, ${listSlugs.length} published dishes, ${mapResp.dishes.length} of them with geometry, captured ${new Date().toISOString()})`,
    list,
    map: mapResp.dishes,
    details,
    atlas,
    counts,
  };
  writeFileSync(MOCK_DATA_PATH, `${JSON.stringify(mockData, null, 2)}\n`);
  console.log(
    `+ wrote ${MOCK_DATA_PATH} (${list.length} list, ${mockData.map.length} map, ${Object.keys(details).length} details, ${Object.keys(atlas).length} atlas)`,
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
  writeFileSync(
    MOCK_LINEAGES_PATH,
    `${JSON.stringify(mockLineages, null, 2)}\n`,
  );
  console.log(
    `+ wrote ${MOCK_LINEAGES_PATH} (${lineageSlugs.length} lineages, ${Object.keys(lineageDetails).length} details)`,
  );

  console.log(`\nelapsed=${((Date.now() - t0) / 1000).toFixed(1)}s`);
}

main().catch((err) => {
  console.error(err.stack || err.message);
  process.exit(1);
});
