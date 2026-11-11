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

const MAP = DATA.map ?? [];
const DETAILS = DATA.details ?? {};

// The RECIPE FIXTURE — item 5.
//
// The recipes live in their own file so the mock can serve them WITHOUT
// changing the dish capture: mock-api-data.json is a verbatim capture of
// the live API's dish endpoints, and the recipe endpoints did not exist
// when it was taken.
//
// The fixture is EMPTY by default — the mock returns an empty recipe
// list unless the request asks for the fixture explicitly — because live
// has zero published recipes. See the recipe routes for the switch.
const RECIPES_PATH = join(__dirname, "mock-api-recipes.json");
const RECIPES = (() => {
  try {
    if (!existsSync(RECIPES_PATH)) return [];
    const parsed = JSON.parse(readFileSync(RECIPES_PATH, "utf-8"));
    return Array.isArray(parsed.recipes) ? parsed.recipes : [];
  } catch {
    return [];
  }
})();

/**
 * The LIST shape of a recipe — the API's `shapeRecipe()` output.
 *
 * The detail response adds `sentences` and `ingredients`; the list
 * response does not carry them. Stripping them here is what makes the
 * mock's list and detail responses match the real API's, so the
 * front-end cannot be fooled into reading a field the list never has.
 *
 * THE CONFIDENCE IS THE LIST'S LEVEL, NOT THE OBJECT
 * -------------------------------------------------
 * The real API's `shapeRecipe()` reads `p.confidence` — the LEVEL
 * COLUMN of the `recipe_published` view — so a list row's confidence is
 * the string "high" / "medium" / "low" (or null).
 *
 * The DETAIL response carries the whole confidence OBJECT, with its
 * conditions, its counts and its override.
 *
 * The first version of this helper passed the fixture's confidence
 * object through to BOTH. The populated build then failed with
 * "Objects are not valid as a React child" — the hub's card renders
 * `{r.confidence}` as text, and it was handed an object. So the two
 * shapes are now kept apart here, exactly as the API keeps them apart.
 */
function stripRecipeDetail(recipe) {
  return {
    id: recipe.id,
    slug: recipe.slug,
    title: recipe.title,
    dish: recipe.dish,
    contentType: recipe.contentType,
    servings: recipe.servings ?? null,
    prepMinutes: recipe.prepMinutes ?? null,
    cookMinutes: recipe.cookMinutes ?? null,
    // The LEVEL, not the object. `null` means "not computed" — NOT "low".
    confidence: recipe.confidenceLevel ?? null,
    publishedAt: recipe.publishedAt ?? null,
  };
}

// The ATLAS data — the three concepts per dish (ADR-004), captured
// alongside the dish details. The atlas route is a DIFFERENT path from
// the dish detail, so it needs its own capture and its own store.
const ATLAS = DATA.atlas ?? {};
// The DEFINED COUNTS — the site-wide numbers, each with its definition.
const COUNTS = DATA.counts ?? null;
// The PLACES — the places with published associations. The place page's
// static paths come from this list, so without it the build produces no
// /place/* pages at all.
const PLACES = DATA.places ?? null;

// The map's connections. Without them the mock's map would draw no
// edges at all, and the SSG build would bake an empty map.
const CONNECTIONS = DATA.connections ?? null;

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
// `--with-recipes` serves the RECIPE FIXTURE to every request.
//
// WHY IT EXISTS
// --------------
// The recipe fixture is normally opt-in per request, through the
// `X-Gustale-Fixture: recipes` header — which is what the CI build and
// the live API's shape checks use.
//
// But the Astro BUILD cannot send a custom header on its own `fetch`
// calls, so a build could never produce the POPULATED pages. Without
// this flag the recipe pages can only ever be built empty, and the
// populated path — the recipe list, the filter island, the recipe page
// with its ingredients and its confidence — would never be built or
// screenshotted at all.
//
// So this flag makes the mock serve the fixture unconditionally, for a
// build that WANTS the populated pages. It is opt-in and explicit: the
// default mock still serves the empty shape, which is what live
// returns.
let WITH_RECIPES = false;
for (let i = 2; i < process.argv.length; i++) {
  if (process.argv[i] === "--port" && i + 1 < process.argv.length) {
    PORT = parseInt(process.argv[i + 1], 10);
  } else if (process.argv[i].startsWith("--port=")) {
    PORT = parseInt(process.argv[i].split("=")[1], 10);
  } else if (process.argv[i] === "--with-recipes") {
    WITH_RECIPES = true;
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

  // ─── Recipes (GET /api/recipes, /api/recipes/:slug, /api/dishes/:slug/recipes) ──
  //
  // Mirrors apps/api/src/routes/recipes.ts (item 4). The shapes are the
  // API's `shapeRecipe()` output and its detail response, field for field.
  //
  // THE EMPTY STATE IS THE DEFAULT
  // -------------------------------
  // Live has ZERO published recipes — the `recipe_published` view has no
  // rows — so the real API returns an empty list for every recipe query.
  // The mock returns the SAME empty shape by default, so a plain build
  // reproduces live exactly: every hub renders "No recipe yet".
  //
  // THE POPULATED FIXTURE IS OPT-IN
  // ------------------------------
  // The `X-Gustale-Fixture: recipes` header turns on the fixture rows in
  // mock-api-recipes.json. The header is used the same way the
  // pagination fixture is used: a build that wants the populated path
  // asks for it explicitly, and a build that does not gets the truth.
  //
  // This matters because a mock that ALWAYS served recipes would be a
  // lie about the site's current state, and a mock that NEVER served
  // them could never prove the populated path renders.
  {
    const useRecipeFixture =
      WITH_RECIPES ||
      (req.headers["x-gustale-fixture"] ?? "").includes("recipes");
    const allRecipes = useRecipeFixture ? RECIPES : [];

    // GET /api/recipes/settings — the kill switch, read-only.
    if (url.pathname === "/api/recipes/settings" && req.method === "GET") {
      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify({
          autoPublish: {
            mode: "disabled",
            enabled: false,
            dailyCap: 20,
          },
        }),
      );
      return;
    }

    // GET /api/recipes — the FEED.
    if (url.pathname === "/api/recipes" && req.method === "GET") {
      res.setHeader("Content-Type", "application/json");
      const dishFilter = (url.searchParams.get("dish") ?? "").trim();
      const confidenceFilter = (
        url.searchParams.get("confidence") ?? ""
      ).trim();
      const contentTypeFilter = (
        url.searchParams.get("content_type") ?? ""
      ).trim();
      let recipes = allRecipes;
      if (dishFilter) {
        recipes = recipes.filter((r) => r.dish.slug === dishFilter);
      }
      if (confidenceFilter) {
        recipes = recipes.filter((r) => r.confidence === confidenceFilter);
      }
      if (contentTypeFilter) {
        recipes = recipes.filter((r) => r.contentType === contentTypeFilter);
      }
      const rawLimit = parseInt(url.searchParams.get("limit") ?? "24", 10);
      const limit = Number.isFinite(rawLimit)
        ? Math.min(100, Math.max(1, rawLimit))
        : 24;
      const rawOffset = parseInt(url.searchParams.get("offset") ?? "0", 10);
      const offset = Number.isFinite(rawOffset)
        ? Math.max(0, Math.min(10000, rawOffset))
        : 0;
      const page = recipes.slice(offset, offset + limit);
      const total = recipes.length;
      res.end(
        JSON.stringify({
          recipes: page.map((r) => stripRecipeDetail(r)),
          limit,
          offset,
          total,
          hasMore: offset + page.length < total,
        }),
      );
      return;
    }

    // GET /api/dishes/:slug/recipes — the HUB.
    const hubMatch = url.pathname.match(/^\/api\/dishes\/([^/]+)\/recipes$/);
    if (hubMatch && req.method === "GET") {
      const dishSlug = hubMatch[1];
      // The dish must be PUBLISHED — a hub for a dish that is not on the
      // site is not a page on the site. Same rule as the real API.
      const dish = LIST.find((d) => d.slug === dishSlug);
      if (!dish) {
        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            error: "Not found",
            message: `No published dish with slug "${dishSlug}"`,
          }),
        );
        return;
      }
      const contentTypeFilter = (
        url.searchParams.get("content_type") ?? ""
      ).trim();
      let recipes = allRecipes.filter((r) => r.dish.slug === dishSlug);
      if (contentTypeFilter) {
        recipes = recipes.filter((r) => r.contentType === contentTypeFilter);
      }
      const rawLimit = parseInt(url.searchParams.get("limit") ?? "24", 10);
      const limit = Number.isFinite(rawLimit)
        ? Math.min(100, Math.max(1, rawLimit))
        : 24;
      const rawOffset = parseInt(url.searchParams.get("offset") ?? "0", 10);
      const offset = Number.isFinite(rawOffset)
        ? Math.max(0, Math.min(10000, rawOffset))
        : 0;
      const page = recipes.slice(offset, offset + limit);
      const total = recipes.length;
      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify({
          dish: {
            slug: dish.slug,
            name: dish.canonicalName,
            shortDescription: dish.shortDescription ?? null,
          },
          recipes: page.map((r) => stripRecipeDetail(r)),
          limit,
          offset,
          total,
          hasMore: offset + page.length < total,
          // Derived from the TOTAL, exactly as the real API does.
          empty: total === 0,
        }),
      );
      return;
    }

    // GET /api/recipes/:slug — ONE recipe.
    const recipeMatch = url.pathname.match(/^\/api\/recipes\/([^/]+)$/);
    if (recipeMatch && req.method === "GET") {
      const recipe = allRecipes.find((r) => r.slug === recipeMatch[1]);
      if (!recipe) {
        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            error: "Not found",
            message: `No published recipe with slug "${recipeMatch[1]}"`,
          }),
        );
        return;
      }
      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify({
          recipe: {
            ...stripRecipeDetail(recipe),
            sentences: recipe.sentences ?? [],
            ingredients: recipe.ingredients ?? [],
          },
          // `null` when it has never been computed — NOT "low".
          confidence: recipe.confidence ?? null,
        }),
      );
      return;
    }
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
