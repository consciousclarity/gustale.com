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
 * Endpoints served (mirroring apps/api routes used at SSG time):
 *   GET /health
 *   GET /api/dishes              → { dishes, limit, offset } (supports ?category=)
 *   GET /api/dishes/map          → { dishes, count }
 *   GET /api/dishes/:slug        → full dish detail
 *   GET /api/categories          → { categories } (derived from list familySlug)
 *   GET /api/lineages …          → optional lineages blob
 *
 * Usage:
 *   node scripts/mock-api.mjs [--port 8742]
 */

import { existsSync, readFileSync } from "node:fs";
import http from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath, URL } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA = JSON.parse(
  readFileSync(join(__dirname, "mock-api-data.json"), "utf-8"),
);

// Lineages live in a separate JSON file (generated from packages/db seed-data.ts
// at seed time). Optional so older builds without lineages still work.
const LINEAGES_DATA_PATH = join(__dirname, "mock-api-lineages.json");
const HAS_LINEAGES = existsSync(LINEAGES_DATA_PATH);
const LINEAGES_DATA = HAS_LINEAGES
  ? JSON.parse(readFileSync(LINEAGES_DATA_PATH, "utf-8"))
  : { list: null, details: {} };

const LIST = DATA.list ?? [];
const MAP = DATA.map ?? [];
const DETAILS = DATA.details ?? {};

// Ingredient encyclopedia stubs derived from dish detail payloads so
// /ingredients and /ingredients/:slug SSG work offline in CI.
const INGREDIENTS = (() => {
  const bySlug = new Map();
  for (const detail of Object.values(DETAILS)) {
    const list = detail?.ingredients ?? [];
    for (const ing of list) {
      if (!ing?.slug) continue;
      const prev = bySlug.get(ing.slug);
      bySlug.set(ing.slug, {
        slug: ing.slug,
        canonicalName: ing.name ?? ing.canonicalName ?? ing.slug,
        category: ing.category ?? null,
        dishCount: (prev?.dishCount ?? 0) + 1,
      });
    }
  }
  if (bySlug.size === 0) {
    bySlug.set("eggplant", {
      slug: "eggplant",
      canonicalName: "Eggplant",
      category: "vegetable",
      dishCount: 1,
    });
  }
  return [...bySlug.values()].sort((a, b) =>
    a.canonicalName.localeCompare(b.canonicalName),
  );
})();

// Pagination fixture list: production GET /api/dishes caps limit at 100 and
// uses offset. This padded list is served only when the request asks for it
// (`X-Gustale-Fixture: pagination`) so normal SSG / homepage catalogs stay
// on the real captured snapshot. A unique familySlug appears only after the
// first page — used by validate-build to prove family fallback pagination.
export const LATE_PAGE_FAMILY_SLUG = "late-page-family";
const DISH_LIST_PAGE_LIMIT = 100;

function withPaginationFixture(baseList) {
  if (!Array.isArray(baseList) || baseList.length === 0) return baseList ?? [];
  const list = baseList.slice();
  const template = baseList[0];
  let i = 0;
  while (list.length < DISH_LIST_PAGE_LIMIT) {
    i += 1;
    list.push({
      ...template,
      id: `mock-pad-${i}`,
      slug: `__pad-${i}`,
      canonicalName: `Pagination pad ${i}`,
      familySlug: template.familySlug,
      familyName: template.familyName,
    });
  }
  list.push({
    ...template,
    id: "mock-late-page-family",
    slug: "__late-page-family-dish",
    canonicalName: "Late Page Family Fixture",
    familySlug: LATE_PAGE_FAMILY_SLUG,
    familyName: "Late Page Family",
  });
  return list;
}

const LIST_PAGINATION_FIXTURE = withPaginationFixture(LIST);

// Categories for /family/[slug] getStaticPaths — derived from published list
// familySlug/familyName, plus the late-page fixture family so the page is
// generated via the preferred /api/categories path.
const CATEGORIES = (() => {
  const bySlug = new Map();
  for (const d of LIST) {
    if (!d.familySlug || bySlug.has(d.familySlug)) continue;
    bySlug.set(d.familySlug, {
      id: `mock-cat-${d.familySlug}`,
      name: d.familyName ?? d.familySlug,
      slug: d.familySlug,
      parentId: null,
      icon: null,
      description: null,
    });
  }
  if (!bySlug.has(LATE_PAGE_FAMILY_SLUG)) {
    bySlug.set(LATE_PAGE_FAMILY_SLUG, {
      id: `mock-cat-${LATE_PAGE_FAMILY_SLUG}`,
      name: "Late Page Family",
      slug: LATE_PAGE_FAMILY_SLUG,
      parentId: null,
      icon: null,
      description:
        "CI fixture: family discoverable only after the first dishes page.",
    });
  }
  return [...bySlug.values()].sort((a, b) => a.name.localeCompare(b.name));
})();

let PORT = 8742;
for (let i = 2; i < process.argv.length; i++) {
  if (process.argv[i] === "--port" && i + 1 < process.argv.length) {
    PORT = parseInt(process.argv[i + 1], 10);
  } else if (process.argv[i].startsWith("--port=")) {
    PORT = parseInt(process.argv[i].split("=")[1], 10);
  }
}
if (Number.isNaN(PORT) || PORT < 1 || PORT > 65535) PORT = 8742;
const HOST = "0.0.0.0";

// ─── HTTP Server ───────────────────────────────────────────────────────────

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${HOST}:${PORT}`);

  // CORS headers (not strictly needed for Astro SSG, but harmless).
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  // GET /health
  if (url.pathname === "/health") {
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ status: "ok" }));
    return;
  }

  // GET /api/categories — flat category list (used by /family/[slug] SSG)
  if (url.pathname === "/api/categories" && req.method === "GET") {
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ categories: CATEGORIES }));
    return;
  }

  // GET /api/ingredients — flat list (powers /ingredients index)
  if (url.pathname === "/api/ingredients" && req.method === "GET") {
    res.setHeader("Content-Type", "application/json");
    const rawLimit = parseInt(url.searchParams.get("limit") ?? "50", 10);
    const limit = Number.isFinite(rawLimit)
      ? Math.min(200, Math.max(1, rawLimit))
      : 50;
    const rawOffset = parseInt(url.searchParams.get("offset") ?? "0", 10);
    const offset = Number.isFinite(rawOffset) ? Math.max(0, rawOffset) : 0;
    const page = INGREDIENTS.slice(offset, offset + limit);
    res.end(JSON.stringify({ ingredients: page }));
    return;
  }

  // GET /api/ingredients/:slug — detail stub for SSG
  const ingMatch = url.pathname.match(/^\/api\/ingredients\/([^/]+)$/);
  if (ingMatch && req.method === "GET") {
    const ing = INGREDIENTS.find((i) => i.slug === ingMatch[1]);
    if (!ing) {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          error: "Not found",
          message: `No ingredient "${ingMatch[1]}"`,
        }),
      );
      return;
    }
    res.setHeader("Content-Type", "application/json");
    res.end(
      JSON.stringify({
        ingredient: {
          slug: ing.slug,
          canonicalName: ing.canonicalName,
          scientificName: null,
          category: ing.category,
          shortDescription: null,
          longDescription: null,
        },
        dishes: [],
      }),
    );
    return;
  }

  // GET /api/dishes — list published dishes (optional ?category= / ?family= / ?q=)
  // Pagination mirrors apps/api listQuerySchema: limit max 100, offset >= 0.
  if (url.pathname === "/api/dishes" && req.method === "GET") {
    res.setHeader("Content-Type", "application/json");
    const category = (url.searchParams.get("category") ?? "").trim();
    const family = (url.searchParams.get("family") ?? "").trim();
    const q = (url.searchParams.get("q") ?? "").toLowerCase().trim();
    const country = (url.searchParams.get("country") ?? "")
      .toLowerCase()
      .trim();
    const filterSlug = category || family;
    const useFixture =
      (req.headers["x-gustale-fixture"] ?? "") === "pagination";
    let dishes = useFixture ? LIST_PAGINATION_FIXTURE : LIST;
    if (filterSlug) {
      dishes = dishes.filter((d) => d.familySlug === filterSlug);
    }
    if (q) {
      dishes = dishes.filter((d) => {
        const hay = [
          d.canonicalName,
          d.shortDescription,
          d.slug,
          d.originName,
          d.familyName,
          d.familySlug,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return hay.includes(q);
      });
    }
    if (country) {
      dishes = dishes.filter(
        (d) => (d.originName ?? "").toLowerCase() === country,
      );
    }
    // Match production zod: limit 1..100 (default 20), offset >= 0.
    const rawLimit = parseInt(url.searchParams.get("limit") ?? "20", 10);
    const limit = Number.isFinite(rawLimit)
      ? Math.min(100, Math.max(1, rawLimit))
      : 20;
    const rawOffset = parseInt(url.searchParams.get("offset") ?? "0", 10);
    const offset = Number.isFinite(rawOffset)
      ? Math.max(0, Math.min(10000, rawOffset))
      : 0;
    const page = dishes.slice(offset, offset + limit);
    res.end(JSON.stringify({ dishes: page, limit, offset }));
    return;
  }

  // GET /api/dishes/map — map data
  if (url.pathname === "/api/dishes/map" && req.method === "GET") {
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ dishes: MAP, count: MAP.length }));
    return;
  }

  // GET /api/dishes/:slug/journey — P1-1 journey beats (empty array if none)
  const journeyMatch = url.pathname.match(/^\/api\/dishes\/([^/]+)\/journey$/);
  if (journeyMatch && req.method === "GET") {
    const slug = decodeURIComponent(journeyMatch[1]);
    const detail = DETAILS[slug];
    if (!detail) {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          error: "Not found",
          message: `No dish with slug "${slug}"`,
        }),
      );
      return;
    }
    const journey = detail.journey ?? {
      slug,
      beats: [],
      lineages: [],
    };
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify(journey));
    return;
  }

  // GET /api/dishes/:slug — dish detail
  const slugMatch = url.pathname.match(/^\/api\/dishes\/([^/]+)$/);
  if (slugMatch && req.method === "GET") {
    const detail = DETAILS[slugMatch[1]];
    if (detail) {
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify(detail));
      return;
    }
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        error: "Not found",
        message: `No dish with slug "${slugMatch[1]}"`,
      }),
    );
    return;
  }

  // ─── Lineages (GET /api/lineages, /api/lineages/:slug) ──────────────
  // Mirrors apps/api/src/routes/lineages.ts. Filter logic is duplicated here
  // because the mock server is intentionally standalone (no DB).
  if (url.pathname === "/api/lineages" && req.method === "GET") {
    if (!HAS_LINEAGES || !LINEAGES_DATA.list) {
      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify({
          lineages: [],
          totalLineages: 0,
          totalDishes: 0,
          totalRelations: 0,
          uncertainOrParallelCount: 0,
          regions: [],
          techniques: [],
          historicalForces: [],
          confidenceLevels: [],
        }),
      );
      return;
    }
    // Apply the same filters as the real API: search, origin, technique,
    // historicalForce, confidence.
    const search = (url.searchParams.get("search") ?? "").toLowerCase().trim();
    const origin = (url.searchParams.get("origin") ?? "").toLowerCase().trim();
    const technique = (url.searchParams.get("technique") ?? "")
      .toLowerCase()
      .trim();
    const historicalForce = (url.searchParams.get("historicalForce") ?? "")
      .toLowerCase()
      .trim();
    const confidence = (url.searchParams.get("confidence") ?? "").trim();

    let lineages = LINEAGES_DATA.list.lineages.slice();
    if (search) {
      lineages = lineages.filter((l) => {
        const hay =
          `${l.name} ${l.shortDescription} ${l.conceptSummary ?? ""} ${(l.techniques ?? []).join(" ")} ${(l.originRegions ?? []).join(" ")} ${(l.relatedRegions ?? []).join(" ")}`.toLowerCase();
        return hay.includes(search);
      });
    }
    if (origin) {
      lineages = lineages.filter((l) => {
        const regs = [
          ...(l.originRegions ?? []),
          ...(l.relatedRegions ?? []),
        ].map((x) => x.toLowerCase());
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
        (l.historicalForces ?? []).some(
          (f) => f.toLowerCase() === historicalForce,
        ),
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
      ["uncertain", "parallel_evolution", "possible"].includes(
        d.confidenceLevel,
      ),
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

    res.setHeader("Content-Type", "application/json");
    res.end(
      JSON.stringify({
        lineages,
        totalLineages: lineages.length,
        totalDishes: distinctDishes.size,
        totalRelations: allEdges.length,
        uncertainOrParallelCount: uncertainCount,
        regions: [...regions].sort(),
        techniques: [...techniques].sort(),
        historicalForces: [...forces].sort(),
        confidenceLevels: [
          ...new Set(lineages.map((l) => l.confidenceLevel)),
        ].sort(),
      }),
    );
    return;
  }

  // GET /api/lineages/:slug
  const lineageMatch = url.pathname.match(/^\/api\/lineages\/([^/]+)$/);
  if (lineageMatch && req.method === "GET") {
    if (!HAS_LINEAGES) {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "lineages not available in mock" }));
      return;
    }
    const detail = LINEAGES_DATA.details[lineageMatch[1]];
    if (detail) {
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify(detail));
      return;
    }
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({ error: "lineage not found", slug: lineageMatch[1] }),
    );
    return;
  }

  // GET /api/search?q=&type=&limit=  (P0-3)
  // Substring-only mock — no pg_trgm in JS. The CI build doesn't actually
  // call this endpoint at SSG time (search is a client-only live API call),
  // but it exists so dev builds and any future prod-like tests don't break.
  // Returns the canonical response shape the React island expects:
  //   { query, took_ms, groups: [{ type, total, results: [...] }] }
  // Empty groups are skipped; type param narrows to one group if given.
  if (url.pathname === "/api/search" && req.method === "GET") {
    const q = (url.searchParams.get("q") ?? "").trim().toLowerCase();
    const limit = Math.max(
      1,
      Math.min(20, parseInt(url.searchParams.get("limit") ?? "5", 10) || 5),
    );
    const typeFilter = url.searchParams.get("type"); // optional: dish|region|lineage|ingredient
    const start = Date.now();
    const matchScore = (haystack, needle) => {
      if (!needle) return 0;
      const h = (haystack ?? "").toLowerCase();
      if (h.startsWith(needle)) return 1.0;
      const idx = h.indexOf(needle);
      if (idx >= 0) return 0.5 - idx * 0.01; // earlier matches rank higher
      return 0;
    };
    const groups = [];

    if (!typeFilter || typeFilter === "dish") {
      const hits = LIST.filter((d) => d.status === "published")
        .map((d) => ({
          slug: d.slug,
          name: d.canonicalName,
          shortDescription: d.shortDescription ?? null,
          href: `/dishes/${d.slug}`,
          score: Math.max(
            matchScore(d.canonicalName, q),
            matchScore(d.shortDescription, q),
          ),
        }))
        .filter((h) => h.score > 0)
        .sort((a, b) => b.score - a.score);
      groups.push({
        type: "dish",
        total: hits.length,
        results: hits.slice(0, limit),
      });
    }
    if (!typeFilter || typeFilter === "lineage") {
      const list = HAS_LINEAGES ? (LINEAGES_DATA.list?.lineages ?? []) : [];
      const hits = list
        .filter((l) => (l.status ?? "published") === "published")
        .map((l) => ({
          slug: l.slug,
          name: l.name,
          shortDescription: l.shortDescription ?? null,
          href: `/lineages/${l.slug}`,
          score: Math.max(
            matchScore(l.name, q),
            matchScore(l.shortDescription, q),
          ),
        }))
        .filter((h) => h.score > 0)
        .sort((a, b) => b.score - a.score);
      groups.push({
        type: "lineage",
        total: hits.length,
        results: hits.slice(0, limit),
      });
    }
    if (!typeFilter || typeFilter === "ingredient") {
      const hits = INGREDIENTS.map((ing) => ({
        slug: ing.slug,
        name: ing.canonicalName,
        shortDescription: ing.category,
        href: `/ingredients/${ing.slug}`,
        score: matchScore(ing.canonicalName, q),
      }))
        .filter((h) => h.score > 0)
        .sort((a, b) => b.score - a.score);
      groups.push({
        type: "ingredient",
        total: hits.length,
        results: hits.slice(0, limit),
      });
    }
    if (!typeFilter || typeFilter === "region") {
      // food_regions not in mock; same treatment as ingredients.
      groups.push({ type: "region", total: 0, results: [] });
    }

    res.setHeader("Content-Type", "application/json");
    res.setHeader("Cache-Control", "public, max-age=60");
    res.end(
      JSON.stringify({
        query: q,
        took_ms: Date.now() - start,
        groups,
      }),
    );
    return;
  }

  // Fallback 404
  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(
    JSON.stringify({
      error: "Not found",
      message: `Unknown route: ${url.pathname}`,
    }),
  );
});

server.listen(PORT, HOST, () => {
  console.log(`[mock-api] listening on http://${HOST}:${PORT}`);
  console.log(
    `[mock-api] ${LIST.length} dishes, ${CATEGORIES.length} categories loaded (${DATA.generatedFrom ?? "mock-api-data.json"})`,
  );
});
