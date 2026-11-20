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
 * the production API at api.gustale.com. Instead, the Dockerfile starts
 * THIS server on a local port and points PUBLIC_API_BASE at it, making CI
 * fully self-contained.
 *
 * Source of truth
 * ---------------
 * The data in `mock-api-data.json` is captured verbatim from the live API
 * (https://api.gustale.com — all 60 published dishes) so the baked HTML
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

// THE DATA FILE.
//
// By default the mock serves `mock-api-data.json` -- the committed CI
// capture. But it can also serve a LIVE SNAPSHOT: a file fetched from
// the running API just before the build.
//
// WHY THIS EXISTS
// ---------------
// The production build used to run with `BUILD_DATA_SOURCE=live`, which
// pointed the Astro build straight at the live API. The build then
// fetched every page's data one request at a time -- 16,764 x
// GET /api/dishes/<slug> plus 16,757 x .../journey, at a sustained ~48
// requests/second for 13+ minutes -- while the Astro build sat at
// 25-32% CPU on 4 vCPUs. It was I/O-bound, not CPU-bound.
//
// CI does the SAME work in 2m43s because it uses THIS mock: the same
// endpoints, served from a file. So the build does not need the network
// at all -- it needs the DATA in the shape this file already has.
//
// `fetch-live-snapshot.mjs` fetches the live data once (a few dozen
// requests, bounded concurrency, cached between runs) and writes it in
// this exact shape. Then the build runs this mock against it: the same
// code path as CI, with live data.
//
// The snapshot path is given by SNAPSHOT_FILE, or --snapshot. When it is
// absent the committed CI capture is used, exactly as before.
const SNAPSHOT_PATH = process.env.SNAPSHOT_FILE || null;
const DATA_PATH = SNAPSHOT_PATH ?? join(__dirname, "mock-api-data.json");
if (!existsSync(DATA_PATH)) {
  console.error(`mock-api: the data file does not exist: ${DATA_PATH}`);
  process.exit(1);
}
const DATA = JSON.parse(readFileSync(DATA_PATH, "utf-8"));
if (SNAPSHOT_PATH) {
  console.log(`mock-api: serving the LIVE SNAPSHOT ${DATA_PATH}`);
} else {
  console.log(`mock-api: serving the committed capture ${DATA_PATH}`);
}

// Lineages live in a separate JSON file (generated from packages/db seed-data.ts
// at seed time). Optional so older builds without lineages still work.
//
// A LIVE SNAPSHOT carries its own lineages, in `DATA.lineages`. When the
// snapshot is present it is used, so the build renders the lineages the
// live API actually has rather than the committed CI capture's -- which
// is the whole point of fetching a snapshot instead of using the
// committed file.
const LINEAGES_DATA_PATH = SNAPSHOT_PATH
  ? null
  : join(__dirname, "mock-api-lineages.json");
const HAS_LINEAGES = LINEAGES_DATA_PATH
  ? existsSync(LINEAGES_DATA_PATH)
  : Boolean(DATA.lineages?.list?.lineages);
const LINEAGES_DATA = LINEAGES_DATA_PATH
  ? JSON.parse(readFileSync(LINEAGES_DATA_PATH, "utf-8"))
  : (DATA.lineages ?? { list: null, details: {} });

const LIST = DATA.list ?? [];

// PR 4 — the EDITORIAL CONTENT TYPE, for the mock.
//
// The fixture is a capture from 2026-11-02, before `content_type`
// existed as a column, so the dishes in it carry no content type.
// The eight VERIFIED DRINKS are named here explicitly, so the mock
// can honour the same rule the API does: the Startpage features no
// drinks.
//
// This is a MOCK. It does not decide what is a drink -- the API does,
// from the `content_type` column that migration 0049 adds. The list
// here is the same eight the verification produced, kept in one
// place so the mock and the API cannot quietly disagree.
const MOCK_DRINKS = new Set([
  "lassi",
  "buttermilk-koldskal",
  "ayran",
  "kefir",
  "kombucha",
  "malt",
  "sherbet",
  "sorbet",
]);

/** The editorial content type for a fixture dish. */
function mockContentType(d) {
  return MOCK_DRINKS.has(d.slug) ? "drink" : "dish";
}

// The MAP data — the plotted dishes.
//
// TWO SHAPES, ONE SOURCE
// The committed CI capture stores `map` as a flat ARRAY of dishes. The
// LIVE SNAPSHOT stores it as the API's own envelope: `{ dishes, count }`.
// The mock serves the live shape at the route, so the array must be
// unwrapped here — otherwise `MAP` is an object, the route returns
// `{ dishes: { dishes: [...] } }`, and every consumer that does
// `for (const d of response.dishes)` throws "object is not iterable".
//
// The snapshot's shape is the API's shape, so the API's shape wins; the
// committed capture's flat array is the legacy shape and is normalised
// into it.
const MAP_RAW = DATA.map ?? [];
const MAP = Array.isArray(MAP_RAW) ? MAP_RAW : (MAP_RAW.dishes ?? []);
const DETAILS = DATA.details ?? {};
// The ATLAS data — the three concepts per dish (ADR-004), captured
// alongside the dish details. The atlas route is a DIFFERENT path from
// the dish detail, so it needs its own capture and its own store.
const ATLAS = DATA.atlas ?? {};
// The DEFINED COUNTS — the site-wide numbers, each with its definition.
//
// THE COUNTS ARE DERIVED, NOT COPIED.
//
// The capture used to carry a hand-maintained `counts` block. It went
// stale the moment the capture was refreshed: the capture's own data
// said 180 places and 108 communities, while the copied block still
// said 0 and 0.
//
// WHY A STALE ZERO IS WORSE THAN A STALE NUMBER. A stale non-zero
// prints a wrong figure. A stale ZERO does not print at all —
// `AtlasHeroKpi.astro` renders a metric only when its value is
// non-zero, so a zero SILENTLY DROPS the metric instead of showing a
// wrong one. The failure is invisible.
//
// WHAT IT COST, HONESTLY. As shipped, the two live consumers of these
// counts read only `dishes` and `families`, which were never stale, so
// no page shipped a wrong number and no metric was actually dropped:
// `AtlasHeroKpi.astro` is not mounted anywhere, and the homepage reads
// `counts.dishes` and `counts.families` only. The defect was a trap,
// not a visible outage — the moment anyone mounts the KPI band or adds
// a place/community figure, the zeroes would have silently swallowed
// two real numbers (180 and 108) that the catalogue has.
//
// A copied number can disagree with the data it describes. A derived
// number cannot. So the counts below are computed from the capture
// with the SAME semantics the live route uses
// (`apps/api/src/routes/atlas-counts.ts`):
//
//   * places      = count(DISTINCT entity_id) where kind = 'place'
//   * communities = count(DISTINCT entity_id) where kind = 'community'
//   * connections = the distinct UNDIRECTED pairs, normalised the way
//                   the route normalises them (LEAST/GREATEST), so a
//                   symmetric pair counts once, not twice.
//
// ENTITY IDENTITY, NOT NAMES. The live route counts `entity_id`. Two
// distinct entities may share a NAME — the catalogue has two "China"
// and two "Luxembourg" — so counting names would report 178 places
// where the live API reports 180.
//
// The captured `counts` block is kept as a FALLBACK for the metrics
// the capture cannot reproduce (the dimension-table counts: families,
// techniques, courses, contexts, and the published claims). It is
// never allowed to OVERRIDE a derived number.
//
// THE ASSIGNMENT IS BELOW, AFTER `CONNECTIONS`. The derivation reads
// `CONNECTIONS`, and a `const` cannot be read before its declaration
// is evaluated — calling `deriveCounts()` here would throw
// "Cannot access 'CONNECTIONS' before initialization".

// The PLACES — the places with published associations. The place page's
// static paths come from this list, so without it the build produces no
// /place/* pages at all.
const PLACES = DATA.places ?? null;

// The map's connections. Without them the mock's map would draw no
// edges at all, and the SSG build would bake an empty map.
const CONNECTIONS = DATA.connections ?? null;

// THE DERIVED COUNTS.
//
// The live route (`apps/api/src/routes/atlas-counts.ts`) computes every
// count with SQL over the PUBLISHED dishes and the same predicates the
// atlas route serves with. The mock cannot run SQL, but the capture
// already holds the result of those predicates: the `atlas` block is
// the per-dish VISIBLE associations, and the `connections` block is
// the active relation pairs.
//
// So the mock reproduces the route's semantics over that capture:
//
//   places      = DISTINCT entity_id where entity_kind = 'place'
//   communities = DISTINCT entity_id where entity_kind = 'community'
//   connections = DISTINCT UNDIRECTED pairs
//
// THE CONNECTIONS NORMALISATION. The live route counts a pair once,
// normalising with LEAST/GREATEST, because a symmetric relation stored
// in both directions is ONE connection, not two. The capture's
// `connections` block carries a `byRelationship` histogram but the
// pairs themselves are what matter, so the pairs are normalised here
// the same way.
//
// THE DISH COUNT. The route counts published dishes. The capture's
// `list` holds the published dishes, so the count is its length —
// but only if the list is the whole catalogue, which `mapMeta` records.
function deriveCounts() {
  const captured = DATA.counts ?? null;
  if (!captured) return null;

  const counts = { ...(captured.counts ?? {}) };
  const definitions = captured.definitions ?? {};

  // The distinct entities, by identity rather than by name.
  const placeIds = new Set();
  const communityIds = new Set();
  for (const entry of Object.values(ATLAS)) {
    for (const assoc of entry?.placesAndTraditions ?? []) {
      const id = assoc?.entityId;
      if (!id) continue;
      if (assoc?.entityKind === "place") placeIds.add(id);
      else if (assoc?.entityKind === "community") communityIds.add(id);
    }
  }

  // A derived number always wins over a copied one: the copied one is
  // the thing that went stale.
  if (placeIds.size > 0) counts.places = placeIds.size;
  if (communityIds.size > 0) counts.communities = communityIds.size;

  // The dish count, when the capture says how many there are.
  const published = DATA.mapMeta?.totalPublished;
  if (typeof published === "number" && published > 0) counts.dishes = published;

  // The distinct undirected pairs.
  //
  // THE ENDPOINT KEY. The capture identifies an endpoint by its dish
  // SLUG (`from.slug` / `to.slug`), not by a uuid — the capture is
  // built for the web, which addresses dishes by slug. The `id` is
  // tried first so a capture that does carry uuids still works.
  //
  // THE RELATIONSHIP IS PART OF THE KEY. The live route groups by
  // `(a, b, relation_type)`, so two relations between the same two
  // dishes are TWO connections. The capture agrees: 82 connections
  // over 78 distinct dish pairs, because four pairs are connected
  // twice under different relationship types.
  const pairs = new Set();
  const connList = Array.isArray(CONNECTIONS)
    ? CONNECTIONS
    : (CONNECTIONS?.connections ?? []);
  for (const conn of connList) {
    const from = conn?.from?.id ?? conn?.from?.slug ?? conn?.fromDishId;
    const to = conn?.to?.id ?? conn?.to?.slug ?? conn?.toDishId;
    const type =
      conn?.relationship ?? conn?.relationType ?? conn?.relation_type;
    if (!from || !to) continue;
    const [a, b] = String(from) < String(to) ? [from, to] : [to, from];
    pairs.add(`${a}|${b}|${type ?? ""}`);
  }
  if (pairs.size > 0) counts.connections = pairs.size;

  return { counts, definitions };
}

// The derived counts, assigned HERE — after `CONNECTIONS` is initialised.
// See the note above the declaration.
const COUNTS = deriveCounts();

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

// The relationship labels, the same wording as the API's. The mock and
// the API must not drift, or the mock shows different group headings
// than the live site does.
const RELATIONSHIP_LABELS = {
  historical_emergence: "Historical emergence",
  established_tradition: "Established tradition",
  regional_adaptation: "Regional adaptation",
  later_introduction: "Later introduction",
  earliest_documentation: "Earliest documentation",
  legacy_unreviewed: "Unreviewed legacy association",
};
const DISH_LIST_PAGE_LIMIT = 100;

function withPaginationFixture(baseList) {
  if (!Array.isArray(baseList) || baseList.length === 0) return baseList ?? [];
  const list = baseList.slice();
  const template = baseList[0];

  // THE LATE FAMILY GOES ON THE SECOND PAGE, WHEREVER THE LIST ENDS.
  //
  // The first version of this appended the fixture at the END of the
  // list, and padded the list to 100 first so the fixture landed at
  // offset 100 — the start of page two.
  //
  // That worked when the mock held 121 dishes. It does NOT work now
  // that the mock holds every published dish (1,474): the fixture
  // lands at offset 1,474, which is on page fifteen, and the check
  // that reads page two never sees it. The web build failed with
  //
  //     pagination fixture: late family present on second page
  //     — late-page-family missing at offset=100
  //
  // So the fixture is now INSERTED AT THE PAGE BOUNDARY, whatever the
  // list's length: at the first offset that is a multiple of the page
  // limit and is not zero. For a 1,474-dish list that is offset 100.
  //
  // The pad entries exist only so a SHORT list still fills a page; a
  // long list needs none.
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

  // The insertion index is DISH_LIST_PAGE_LIMIT — 100 — which is the
  // first entry of the SECOND page. The check reads offset=100, so the
  // fixture must be in offsets 100..199, and offset 100 is the only
  // place that is true for every list length.
  list.splice(DISH_LIST_PAGE_LIMIT, 0, {
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

  // GET /api/taxonomy/family/:slug — a family's taxonomy.
  //
  // Mirrors apps/api/src/routes/taxonomy-family.ts. The mock resolves the
  // slug against the family dimension only (the capture's `familySlug`),
  // so the dimension is always "family"; the other four dimensions are
  // not carried in the capture.
  //
  // The response shape MUST match the real API exactly, because the
  // home page reads `family.name` and `counts.dishes` from it.
  const taxonomyFamilyMatch = url.pathname.match(
    /^\/api\/taxonomy\/family\/([^/]+)$/,
  );
  if (taxonomyFamilyMatch && req.method === "GET") {
    const slug = decodeURIComponent(taxonomyFamilyMatch[1]);
    const category = CATEGORIES.find((c) => c.slug === slug);
    if (!category) {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({ error: "not_found", message: "Family not found" }),
      );
      return;
    }
    const dishes = LIST.filter((d) => d.familySlug === slug)
      .map((d) => ({
        slug: d.slug,
        canonicalName: d.canonicalName,
        shortDescription: d.shortDescription ?? null,
      }))
      .sort((a, b) => a.canonicalName.localeCompare(b.canonicalName))
      .slice(0, 200);
    res.setHeader("Content-Type", "application/json");
    res.end(
      JSON.stringify({
        family: {
          slug: category.slug,
          name: category.name,
          dimension: "family",
          dimensionLabel: "Food family",
          dimensionExplanation:
            "A food family classifies dishes by form, course, content type, or cuisine within the family hierarchy.",
          definition: category.description ?? null,
        },
        inclusion: {
          criteria: null,
          hasCriteria: false,
        },
        notAncestry:
          "Classification is not ancestry. Two dishes in the same group were not necessarily invented from one another, and sharing a group says nothing about where either came from.",
        counts: { dishes: dishes.length },
        dishes,
      }),
    );
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
    // THE DISHES THAT USE IT.
    //
    // The real API returns the dishes an ingredient appears in, as
    // { dishSlug, dishName, isOptional, position }. The home page reads
    // `dishName`, so the mock must return the same shape — otherwise the
    // ingredient card builds in CI with no names in it, and the build
    // cannot catch a broken shape.
    const dishes = [];
    for (const dish of LIST) {
      const list = DETAILS[dish.slug]?.ingredients ?? [];
      const position = list.findIndex((i) => i?.slug === ing.slug);
      if (position < 0) continue;
      dishes.push({
        dishSlug: dish.slug,
        dishName: dish.canonicalName,
        isOptional: list[position]?.isOptional ?? false,
        position,
      });
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
        dishes,
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
    // The total that MATCHES the filters, and whether more rows exist
    // past this page -- the same two fields the real API returns, so
    // the front-end's count logic is exercised by the fixture too.
    const total = dishes.length;
    const hasMore = offset + page.length < total;
    // PR 3 — the editorial content type travels with every dish.
    res.end(
      JSON.stringify({
        dishes: page.map((d) => ({ ...d, contentType: mockContentType(d) })),
        limit,
        offset,
        total,
        hasMore,
      }),
    );
    return;
  }

  // GET /api/dishes/featured — the Startpage's twelve, chosen by a RULE.
  //
  // The rule, applied here the same way the API applies it: a dish
  // is featured when it has a photo, a definition, an origin and a
  // family. Drinks are excluded. The mock enforces the rule so the
  // local build cannot drift from the server's behaviour.
  if (url.pathname === "/api/dishes/featured" && req.method === "GET") {
    res.setHeader("Content-Type", "application/json");
    const rawLimit = parseInt(url.searchParams.get("limit") ?? "12", 10);
    const limit = Number.isFinite(rawLimit)
      ? Math.min(24, Math.max(1, rawLimit))
      : 12;
    const featured = LIST.filter(
      (d) =>
        // PHOTO
        d.cover &&
        d.cover.publicUrl &&
        // DEFINITION
        d.shortDescription &&
        d.shortDescription.trim().length > 0 &&
        // ORIGIN
        d.originName &&
        // FAMILY
        d.familySlug &&
        d.familyName &&
        // NOT A DRINK
        mockContentType(d) !== "drink",
    )
      .slice()
      .sort((a, b) => (b.viewCount ?? 0) - (a.viewCount ?? 0))
      .slice(0, limit)
      .map((d) => ({
        ...d,
        id: d.id ?? d.slug,
        canonicalName: d.canonicalName ?? d.name,
        contentType: mockContentType(d),
        originName: d.originName ?? d.country ?? null,
        familySlug: d.familySlug ?? null,
        familyName: d.familyName ?? null,
      }));
    res.end(JSON.stringify({ dishes: featured, count: featured.length }));
    return;
  }

  // GET /api/dishes/map — map data
  //
  // The atlas's response carries more than the list: the counts the
  // heading needs ("121 of 1,474 dishes have map coordinates so far")
  // and the facet vocabulary the filter rail's dropdowns are built
  // from. The mock carries the same shape, so a build against the
  // mock exercises the same code path as a build against the real API.
  if (url.pathname === "/api/dishes/map" && req.method === "GET") {
    const meta = DATA.mapMeta ?? {};
    res.setHeader("Content-Type", "application/json");
    res.end(
      JSON.stringify({
        dishes: MAP,
        count: MAP.length,
        totalPublished: meta.totalPublished ?? MAP.length,
        places: meta.places ?? new Set(MAP.map((m) => m.region?.name)).size,
        facets: meta.facets ?? { family: [], technique: [], course: [] },
      }),
    );
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
  // GET /api/dishes/:slug/atlas — the THREE CONCEPTS, separately.
  //
  // The dish route below matches /api/dishes/<slug> exactly, so this
  // path is not shadowed by it — but it is registered first so the
  // intent is unambiguous.
  const atlasMatch = url.pathname.match(/^\/api\/dishes\/([^/]+)\/atlas$/);
  if (atlasMatch) {
    const slug = decodeURIComponent(atlasMatch[1]);
    const body = ATLAS[slug];
    if (!body) {
      res.statusCode = 404;
      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify({
          error: "Not found",
          message: `No atlas data for "${slug}"`,
        }),
      );
      return;
    }
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify(body));
    return;
  }

  // GET /api/dishes/:slug/relations — the relations of one dish, grouped
  // by relation type.
  //
  // The dish page's Connections block reads this. It is registered
  // before the dish route below, because that route matches
  // /api/dishes/<slug> EXACTLY and would otherwise shadow it.
  //
  // The mock derives the relations from the ATLAS fixture, which is
  // where the connection records live. A dish with no connections gets
  // an empty grouping — which is what the API says for such a dish,
  // and NOT an error: "no relations" is a fact, not a failure.
  const relationsMatch = url.pathname.match(
    /^\/api\/dishes\/([^/]+)\/relations$/,
  );
  if (relationsMatch) {
    const slug = decodeURIComponent(relationsMatch[1]);
    const atlas = ATLAS[slug];
    const relationsByType = {};

    // The captured fixture lists each connection TWICE — once per
    // direction of the pair — so the same relation id appears twice for
    // the same other-dish. The API returns each relation once. Dedupe
    // by the relation id, so the mock matches the API's shape; without
    // this the Connections block would show "Levantine Moussaka" twice
    // under Resembles.
    const seenRelationIds = new Set();

    for (const conn of atlas?.historyAndConnections?.connections ?? []) {
      const type = conn.relationship;
      if (!type) continue;
      const relationId = conn.id ?? "";
      if (relationId && seenRelationIds.has(relationId)) continue;
      if (relationId) seenRelationIds.add(relationId);
      const list = relationsByType[type] ?? [];
      list.push({
        slug: conn.other?.slug ?? "",
        name: conn.other?.name ?? "",
        shortDescription: null,
        cuisineSlug: null,
        cuisineName: null,
        countryName: null,
        isoCode: null,
        relationId,
        relationType: type,
        reason: conn.reason ?? null,
        strength: 1,
      });
      relationsByType[type] = list;
    }

    res.setHeader("Content-Type", "application/json");
    res.end(
      JSON.stringify({
        sourceSlug: slug,
        totalRelations: Object.values(relationsByType).reduce(
          (n, list) => n + list.length,
          0,
        ),
        relationsByType,
      }),
    );
    return;
  }

  // GET /api/atlas/connections — the edges between dishes, with both
  // endpoints' coordinates. The map draws these, so a mock without
  // them would bake a map with no connections at all.
  if (url.pathname === "/api/atlas/connections") {
    if (!CONNECTIONS) {
      res.statusCode = 404;
      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify({
          error: "Not found",
          message: "No connections in the mock data",
        }),
      );
      return;
    }
    const byRelationship = {};
    for (const c of CONNECTIONS.connections ?? []) {
      byRelationship[c.relationship] =
        (byRelationship[c.relationship] ?? 0) + 1;
    }
    res.setHeader("Content-Type", "application/json");
    res.end(
      JSON.stringify({
        connections: CONNECTIONS.connections ?? [],
        count: (CONNECTIONS.connections ?? []).length,
        byRelationship,
      }),
    );
    return;
  }

  // GET /api/atlas/counts — the DEFINED counts, each with its
  // definition. The homepage's statistics come from here (ADR-004 F7),
  // so a mock without it would bake the old undefined numbers.
  if (url.pathname === "/api/atlas/counts") {
    if (!COUNTS) {
      res.statusCode = 404;
      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify({
          error: "Not found",
          message: "No counts in the mock data",
        }),
      );
      return;
    }
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify(COUNTS));
    return;
  }

  // GET /api/places — the places with published associations.
  if (url.pathname === "/api/places" && req.method === "GET") {
    if (!PLACES) {
      res.statusCode = 404;
      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify({
          error: "Not found",
          message: "No places in the mock data",
        }),
      );
      return;
    }
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify(PLACES));
    return;
  }

  // GET /api/places/:slug — one place and its dishes, grouped by
  // relationship type.
  const placeMatch = url.pathname.match(/^\/api\/places\/([^/]+)$/);
  if (placeMatch) {
    const slug = decodeURIComponent(placeMatch[1]);
    const place = (PLACES?.places ?? []).find(
      (p) =>
        p.slug === slug ||
        (p.isoCode ?? "").toLowerCase() === slug.toLowerCase(),
    );
    if (!place) {
      res.statusCode = 404;
      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify({
          error: "Not found",
          message: `No place "${slug}"`,
        }),
      );
      return;
    }

    // The dishes come from the captured atlas data, so the page shows
    // what the API showed when it was captured.
    const groups = [];
    for (const dish of LIST) {
      const atlas = ATLAS[dish.slug];
      if (!atlas) continue;
      const hit = (atlas.placesAndTraditions ?? []).find(
        (a) => a.entityKind === "place" && a.name === place.name,
      );
      if (!hit) continue;
      const group = groups.find((g) => g.relationship === hit.relationship);
      const entry = {
        slug: dish.slug,
        canonicalName: dish.canonicalName,
        shortDescription: dish.shortDescription ?? null,
        viewCount: 0,
        evidence: hit.evidence,
        explanation: hit.explanation ?? null,
      };
      if (group) {
        group.dishes.push(entry);
      } else {
        groups.push({
          relationship: hit.relationship,
          label: RELATIONSHIP_LABELS[hit.relationship] ?? hit.relationship,
          dishes: [entry],
        });
      }
    }

    const slugs = new Set(groups.flatMap((g) => g.dishes.map((d) => d.slug)));
    res.setHeader("Content-Type", "application/json");
    res.end(
      JSON.stringify({
        place: {
          slug: place.slug,
          name: place.name,
          localName: place.localName ?? null,
          isoCode: place.isoCode ?? null,
          entityType: place.entityType,
          subdivisionType: null,
          lat: null,
          lng: null,
        },
        groups,
        counts: { dishes: slugs.size, groups: groups.length },
      }),
    );
    return;
  }

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
    const typeFilter = url.searchParams.get("type"); // optional: dish|family|lineage|ingredient|place
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
      // The dish search reads the name, the description, the PLACE and
      // the FAMILY — the same fields the real API reads. The mock has
      // no pg_trgm, so it uses a substring match, but the SHAPE of the
      // response must match: every hit says which field matched.
      const hits = LIST.filter((d) => d.status === "published")
        .map((d) => {
          const nameScore = matchScore(d.canonicalName, q);
          const descScore = matchScore(d.shortDescription, q) * 0.6;
          const placeScore = matchScore(d.originName, q) * 0.9;
          const familyScore = matchScore(d.familyName, q) * 0.8;
          const score = Math.max(nameScore, descScore, placeScore, familyScore);
          let matchedOn;
          if (
            nameScore >= descScore &&
            nameScore >= placeScore &&
            nameScore >= familyScore
          ) {
            matchedOn = "name";
          } else if (placeScore >= familyScore && placeScore >= descScore) {
            matchedOn = "place";
          } else if (familyScore >= descScore) {
            matchedOn = "family";
          } else {
            matchedOn = "description";
          }
          return {
            slug: d.slug,
            name: d.canonicalName,
            shortDescription: d.shortDescription ?? null,
            href: `/dishes/${d.slug}`,
            score,
            matchedOn,
          };
        })
        .filter((h) => h.score > 0)
        .sort((a, b) => b.score - a.score);
      groups.push({
        type: "dish",
        total: hits.length,
        results: hits.slice(0, limit),
      });
    }
    if (!typeFilter || typeFilter === "family") {
      // The families that have a dish behind them — the same test the
      // real API applies.
      const families = new Map();
      for (const d of LIST) {
        if (d.status !== "published") continue;
        if (d.familySlug && d.familyName) {
          families.set(d.familySlug, d.familyName);
        }
      }
      const hits = [...families.entries()]
        .map(([slug, name]) => ({
          slug,
          name,
          shortDescription: null,
          href: `/family/${slug}`,
          score: matchScore(name, q),
          matchedOn: "name",
        }))
        .filter((h) => h.score > 0)
        .sort((a, b) => b.score - a.score);
      groups.push({
        type: "family",
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
    if (!typeFilter || typeFilter === "place") {
      // The places that have a published dish behind them. The mock's
      // dishes carry their origin in `originName`; the real API reads
      // `dish_place_associations`, which is empty on live today — so
      // this group is empty on live and populated in the mock.
      const places = new Map();
      for (const d of LIST) {
        if (d.status === "published" && d.originName) {
          places.set(d.originName, d.originName);
        }
      }
      const hits = [...places.values()]
        .map((name) => ({
          slug: name
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-+|-+$/g, ""),
          name,
          shortDescription: null,
          href: `/place/${name
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-+|-+$/g, "")}`,
          score: matchScore(name, q),
          matchedOn: "place",
        }))
        .filter((h) => h.score > 0)
        .sort((a, b) => b.score - a.score);
      groups.push({
        type: "place",
        total: hits.length,
        results: hits.slice(0, limit),
      });
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
