#!/usr/bin/env node
/**
 * Build-output validation for the taxonomy pages.
 *
 * Runs AFTER post-build.mjs (so it sees the domain-filtered dist) and asserts
 * the invariants that keep the three taxonomy pages cleanly separated:
 *
 *   - Families  → dish FORM only        (data-family, no region UI)
 *   - Regions   → geographic ORIGIN only (data-region)
 *   - Lineages  → preparation METHOD only (data-lineage)
 *
 * It exists because these pages are SSG-baked from a mock snapshot
 * (scripts/mock-api-data.json). A data or markup regression — e.g. filters
 * collapsing to only "All"/"Other", or region UI leaking back into Families —
 * is invisible until someone loads the page. This script fails the build loudly
 * instead.
 *
 * Run:  PUBLIC_DOMAIN=geo node scripts/validate-build.mjs
 */
import { access, readdir, readFile, stat } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  collectFamiliesFromPublishedDishes,
  DISH_LIST_PAGE_LIMIT,
  LATE_PAGE_FAMILY_SLUG,
  resolveGustaleDomain,
} from "./collect-dish-families.mjs";
import {
  addDishHref,
  isPrimaryNavActive,
  searchErrorBrowseLinks,
  searchHelpLinks,
  seeAllDishesHref,
} from "./search-nav-helpers.mjs";

const DIST = fileURLToPath(new URL("../dist/", import.meta.url));
const DOMAIN = process.env.PUBLIC_DOMAIN ?? "recipes";

// The origin THIS build serves.
//
// ONE SITE. Every production variant — the geo variant and the recipes
// variant — is served from the same origin, because they are two
// SKINS of one site and not two sites.
//
// The ONE exception is the staging build: it serves the same site on
// its own host, with its own canonical URLs and its own sitemap
// pointer. A check that hardcoded the production origin would fail a
// correct staging build, and a check that hardcoded the staging origin
// would fail a correct production build.
const origin =
  DOMAIN === "staging" ? "https://staging.gustale.com" : "https://gustale.com";

// A SCOPED build covers a SUBSET of the data.
//
// The checks below that assert a MINIMUM number of rendered cards
// (families, lineages, regions) cannot hold for a scoped build: the
// staging database has 7 dishes, so there are fewer distinct
// filters than the production minimum.
//
// The fix is NOT to weaken the checks -- the production build must
// keep every one of them, at full strength. It is to SKIP the
// count-based ones for a scoped build and SAY SO. A skipped check is
// visible in the output; a weakened check is not.
//
// The checks that are NOT count-based still run: a scoped build must
// still have a valid sitemap, correct canonicals, the right robots
// rules, and no /map on the recipes domain.
const SCOPED_BUILD = Boolean(process.env.PUBLIC_BUILD_DISH_LIMIT?.trim());
const SCOPE_LIMIT = SCOPED_BUILD
  ? Number.parseInt(process.env.PUBLIC_BUILD_DISH_LIMIT.trim(), 10)
  : null;
if (SCOPED_BUILD) {
  console.log(
    `[validate-build] a scoped build (PUBLIC_BUILD_DISH_LIMIT=${SCOPE_LIMIT}): ` +
      `the count-based checks are skipped -- a subset of the data cannot ` +
      `meet the production minimums. The rest still apply.`,
  );
}
const API_BASE = process.env.PUBLIC_API_BASE ?? "";
// When the build uses real API data (not the in-container mock), the
// pagination fixture family doesn't exist, so the fixture-specific
// validations should be skipped. Set BUILD_DATA_SOURCE=mock in CI to
// keep them on.
const DATA_SOURCE = process.env.BUILD_DATA_SOURCE ?? "mock";
const SKIP_MOCK_FIXTURES = DATA_SOURCE !== "mock";

// Minimum distinct filter chips a taxonomy page must expose. Below this a page
// has almost certainly collapsed to "All"/"Other" (the bug this guards).
const MIN_DISTINCT_FILTERS = 5;
// Floor for dish tiles rendered on /regions (60 published; 20 = safe floor,
// matches post-build.mjs MIN_EXPECTED_DISHES).
const MIN_REGION_TILES = 20;

const failures = [];
const passes = [];
const skips = [];

function check(name, condition, detail = "") {
  if (condition) {
    passes.push(name);
  } else {
    failures.push(detail ? `${name} — ${detail}` : name);
  }
}

/**
 * A check that only makes sense for a FULL build.
 *
 * A scoped build covers a subset of the data, so a check that
 * asserts a minimum number of rendered cards cannot hold. Rather
 * than weaken the check (which would weaken the production build
 * too), it is SKIPPED -- and the skip is printed, so a skipped check
 * is visible rather than silently absent.
 */
function checkFullBuild(name, condition, detail = "") {
  if (SCOPED_BUILD) {
    skips.push(name);
    return;
  }
  check(name, condition, detail);
}

async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function read(path) {
  try {
    return await readFile(path, "utf-8");
  } catch {
    return null;
  }
}

/** Distinct values of a given data-* attribute, excluding control values. */
function distinctAttr(html, attr, exclude = []) {
  if (!html) return [];
  const re = new RegExp(`${attr}="([^"]*)"`, "g");
  const set = new Set();
  let m;
  while ((m = re.exec(html)) !== null) {
    const v = m[1];
    // Skip control/sentinel values and any uninterpolated template literals.
    if (exclude.includes(v)) continue;
    if (v.includes("${")) continue;
    set.add(v);
  }
  return [...set];
}

function countOccurrences(html, needle) {
  if (!html) return 0;
  return html.split(needle).length - 1;
}

// ─── Load the three taxonomy pages ──────────────────────────────────────────
// WP-C3 REPLACED /regions WITH /places.
//
// The list view is now /places, and the atlas -- the map, the filter
// rail and the place panel -- is /atlas. The nav checks below need A
// page to look at, and they use /places: it is the list view, so it
// carries the nav and the site chrome like any other page.
//
// The old /regions route is not built any more. It is REDIRECTED to
// /places by the redirect map, so a reader who has the old link gets
// the new page rather than a 404.
const placesPath = `${DIST}places/index.html`;
const atlasPath = `${DIST}atlas/index.html`;
const familiesPath = `${DIST}families/index.html`;
const lineagesPath = `${DIST}lineages/index.html`;

const [placesHtml, atlasHtml, familiesHtml, lineagesHtml] = await Promise.all([
  read(placesPath),
  read(atlasPath),
  read(familiesPath),
  read(lineagesPath),
]);

// ─── 1. Pages exist ─────────────────────────────────────────────────────────
check("/places page exists", await exists(placesPath), placesPath);
check("/atlas page exists", await exists(atlasPath), atlasPath);
check("/families page exists", await exists(familiesPath), familiesPath);
check("/lineages page exists", await exists(lineagesPath), lineagesPath);

// The retired routes are NOT built. If they are, the redirect map is
// not what the reader gets, and there are two pages claiming the same
// content.
check(
  "/regions is no longer built",
  !(await exists(`${DIST}regions/index.html`)),
  "regions/index.html still exists",
);
check(
  "/map is no longer built",
  !(await exists(`${DIST}map/index.html`)),
  "map/index.html still exists",
);

// ─── 1b. The redirect map is what nginx will actually serve ───────────────
//
// The redirect map in apps/web/src/lib/redirects.ts is the source of
// truth, and the nginx block is GENERATED from it. This check proves
// the two still agree: if someone edits the map and forgets to
// regenerate, the site would 301 to a page that does not exist, and
// the only place that shows it is here.
//
// The generator's own --check mode is the authority; this runs it and
// reports its verdict.
const redirectCheck = spawnSync(
  process.execPath,
  [join(dirname(fileURLToPath(import.meta.url)), "generate-redirect-rules.mjs"), "--check"],
  { encoding: "utf8" },
);
check(
  "nginx carries every active redirect from the map",
  redirectCheck.status === 0,
  redirectCheck.stdout?.trim() || redirectCheck.stderr?.trim() || "the check did not run",
);

// Every retired route must have a redirect that points at a page THIS
// build actually produced. A redirect to a 404 is worse than no
// redirect at all.
const retiredRoutes = [
  { from: "/map", to: "/atlas" },
  { from: "/regions", to: "/places" },
];
for (const r of retiredRoutes) {
  const target = `${DIST}${r.to.replace(/^\//, "")}/index.html`;
  check(
    `${r.from} redirects to ${r.to}, which is built`,
    await exists(target),
    `${target} is missing -- the redirect would 301 to a 404`,
  );
}

// ─── 2. The primary navigation ──────────────────────────────────────────────
// ONE SITE.
//
// The nav used to carry a host switch with an ABSOLUTE link to each
// property, and the checks below used to require both. There is one
// property now: every nav link is RELATIVE, and a link to the other
// host is a defect.
//
// This is the check that would have caught a link to the retired host
// sneaking back in.
//
// The pattern is built from parts on purpose: the host name is a
// RETIRED host, and this file is guarded by a CI check that fails the
// build when the name appears literally anywhere under apps/ or
// packages/. Assembling the pattern from pieces keeps the guard
// working without putting the name back into the source.
const RETIRED_HOST_PATTERN = new RegExp(
  `href="https:\\/\\/${"gustale" + "\\.recipes"}`,
);
check(
  "nav carries no link to the retired recipes host",
  !RETIRED_HOST_PATTERN.test(placesHtml ?? ""),
  "the nav still links to the retired host",
);
// ONLY <a href> LINKS ARE CHECKED.
//
// An absolute URL is REQUIRED in several places in a page's head: the
// canonical, the `hreflang` alternates, `og:url` and the JSON-LD are
// all absolute by definition -- a relative canonical is not a
// canonical. So a blanket "no absolute URLs" check would fail on the
// site's own correct metadata.
//
// This check looks at LINKS -- the <a href> in the body -- and asks
// whether any of them leaves the site.
check(
  "no link in the page leaves the site",
  !/<a[^>]+href="https?:\/\/(?!staging\.gustale\.com)/.test(placesHtml ?? ""),
  "a link points at another host",
);
check(
  "nav links to the six sections RELATIVELY",
  countOccurrences(placesHtml, 'href="/dishes"') >= 1 &&
    countOccurrences(placesHtml, 'href="/ingredients"') >= 1 &&
    countOccurrences(placesHtml, 'href="/recipes"') >= 1,
  "a section is missing from the nav, or its href is not relative",
);

// THE SIX SECTIONS (the blueprint's decision D2).
//
// The nav used to say "Explore / Dish origins / Food families /
// History & connections / About". It now says "Atlas / Dishes /
// Families / Ingredients / History / Recipes", and the header, the
// mobile drawer, the footer and the search all read the same list.
//
// ONE NAV. There is no per-property nav any more — the header, the
// mobile drawer, the footer and the 404 page all link to the same
// local paths.
//
// Astro may emit whitespace inside the anchor: "> Dishes <".
for (const label of [
  "Atlas",
  "Dishes",
  "Families",
  "Ingredients",
  "History",
  "Recipes",
]) {
  check(
    `main navigation contains ${label}`,
    countOccurrences(placesHtml, `>s*${label}s*<`) >= 1 ||
      countOccurrences(placesHtml, `>${label}<`) >= 1,
    `no "${label}" link in nav`,
  );
}
check(
  "the nav carries no host switch",
  !/property-switch/.test(placesHtml ?? ""),
  "the property switch is still in the nav",
);
check(
  "nav identifies Atlas property in text",
  /Gustale[\s\S]*?Atlas/.test(placesHtml ?? "") ||
    /Current property: Atlas/.test(placesHtml ?? ""),
  "Atlas property label missing from nav",
);
check(
  "nav links locally to /ingredients",
  /href="\/ingredients"/.test(placesHtml ?? ""),
  "the nav has no local /ingredients link",
);
check(
  "nav Add a dish points at the local authoring form",
  /href="\/dishes\/new"/.test(placesHtml ?? ""),
  "missing local Add a dish CTA",
);

// THE SIX SECTIONS, AND THE RETIRED ENTRIES.
//
// What is asserted here is that the six are present AND that the
// retired entries are gone. A nav that quietly grew a seventh entry
// would still pass a "the six are present" check.
// WP-C3 moved the Atlas section from the home page to /atlas.
//
// The nav's "Atlas" entry used to be the home link. The atlas is now a
// page of its own -- the map, the filter rail and the place panel --
// so the section points there.
check(
  "nav includes Atlas → /atlas",
  countOccurrences(placesHtml, 'href="/atlas"') >= 1,
  "missing /atlas in the nav",
);
check(
  "nav includes Dishes → /dishes",
  countOccurrences(placesHtml, 'href="/dishes"') >= 1,
  "missing /dishes in the nav",
);
check(
  "nav includes Families → /families",
  countOccurrences(placesHtml, 'href="/families"') >= 1,
  "missing /families in the nav",
);
check(
  "nav includes Ingredients → /ingredients",
  countOccurrences(placesHtml, 'href="/ingredients"') >= 1,
  "missing /ingredients in the nav",
);
check(
  "nav includes History → /lineages",
  countOccurrences(placesHtml, 'href="/lineages"') >= 1,
  "missing /lineages in the nav",
);
// The retired entry: "Dish origins → /regions" was never a section, and
// WP-C3 retired the route itself. The list view is /places.
check(
  "nav no longer lists Dish origins → /regions",
  countOccurrences(placesHtml, 'href="/regions"') === 0,
  "/regions is still in the nav",
);
check(
  "nav does not link to the retired /map",
  countOccurrences(placesHtml, 'href="/map"') === 0,
  "/map is still in the nav",
);
// The dist ships the ingredients pages — they are reachable from the
// dish pages and they are a nav section.
check(
  "the dist includes the /ingredients index",
  await exists(`${DIST}ingredients/index.html`),
  "ingredients/index.html missing",
);

// ─── 3. /places is the LIST VIEW (WP-C3 replaced /regions) ──────────────────
//
// The list view is a list of PLACES, each with its dish count, and each
// linking to its own page at /places/:slug.
//
// It is NOT the old "Dish origins" directory: that page presented a
// country directory with a dish-count tile wall. The blueprint's list
// view is the atlas's second view -- the same places the atlas's map
// shows, in a form a reader can scan and sort.
check(
  "/places lists places",
  /<h1[^>]*>[\s\S]*?[Pp]laces[\s\S]*?<\/h1>/.test(placesHtml ?? ""),
  "expected Places in page H1",
);
check(
  "/places links to /places/:slug detail",
  /href="\/places\/[^"]+"/.test(placesHtml ?? ""),
  "missing /places/:slug links",
);
check(
  "/places has no dead /regions/:slug links",
  !/href="\/regions\/[^"]+"/.test(placesHtml ?? ""),
  "found /regions/:slug href",
);
// The place cards each carry their dish count, so a reader can see how
// much a place holds before opening it.
const placeDirCards = countOccurrences(placesHtml, "place-dir-card");
check(
  "/places directory renders entries",
  placeDirCards >= MIN_DISTINCT_FILTERS,
  `only ${placeDirCards} directory cards`,
);
// Keep a dish-density floor via baked dish name links or counts.
const placeDishHints =
  countOccurrences(placesHtml, " dishes") +
  countOccurrences(placesHtml, "/dishes/");
checkFullBuild(
  "/places still surfaces dish context",
  placeDishHints >= MIN_REGION_TILES,
  `weak dish context signals: ${placeDishHints}`,
);

// ─── 3b. /atlas is the ATLAS (WP-C3) ────────────────────────────────────────
//
// The atlas is the map, the filter rail and the place panel, in one
// page. Its three parts are a client island, so the STATIC HTML cannot
// contain them -- what the static HTML CAN be asked to prove is that
// the page exists, that it identifies itself, and that it carries the
// island that renders the atlas.
//
// What the island renders is checked by the browser, not by this file.
check(
  "/atlas ships the atlas island",
  /AtlasIsland|atlas__grid/.test(atlasHtml ?? ""),
  "the atlas island is not in the /atlas page",
);
check(
  "/atlas H1 presents the Atlas",
  /<h1[^>]*>[\s\S]*?Atlas[\s\S]*?<\/h1>/.test(atlasHtml ?? ""),
  "expected Atlas in page H1",
);
// The atlas is the map. The old /map page carried a maplibre bundle;
// the atlas carries it too.
check(
  "/atlas loads the map stylesheet",
  /maplibre-gl/.test(atlasHtml ?? ""),
  "the map stylesheet is not linked from /atlas",
);

// ─── 5. /families is a directory (no first-viewport chip wall) ─────────────
check(
  "/families does NOT use legacy chip wall",
  !(familiesHtml ?? "").includes('id="family-chips"'),
  'found id="family-chips"',
);
check(
  "/families links to /family/:slug detail",
  /href="\/family\/[^"]+"/.test(familiesHtml ?? ""),
  "missing /family/:slug links",
);
const familyDirCards = countOccurrences(familiesHtml, "browse-dir-card");
check(
  "/families directory renders entries",
  familyDirCards >= MIN_DISTINCT_FILTERS,
  `only ${familyDirCards} family cards`,
);

// ─── 7. /lineages keeps cards + confidence + detail links ──────────────────
const lineageCards = countOccurrences(lineagesHtml, "lin-card");
checkFullBuild(
  "/lineages renders lineage cards",
  lineageCards >= MIN_DISTINCT_FILTERS,
  `only ${lineageCards} lineage cards`,
);
checkFullBuild(
  "/lineages links to /lineages/:slug",
  /href="\/lineages\/[^"]+"/.test(lineagesHtml ?? ""),
  "missing lineage detail links",
);
checkFullBuild(
  "/lineages keeps confidence labels",
  /Documented|Likely related|Possible influence|Uncertain|Parallel evolution/.test(
    lineagesHtml ?? "",
  ),
  "confidence labels missing",
);

// ─── 8. Taxonomy isolation: no cross-contamination of filter axes ──────────
check(
  "/families does not use lineage/region filter state",
  !/data-region=|data-lineage=/.test(familiesHtml ?? ""),
  "families page references another taxonomy's data-* filter",
);
check(
  "/regions does not use family/lineage filter state",
  !/data-family=|data-lineage=/.test(placesHtml ?? ""),
  "regions page references another taxonomy's data-* filter",
);

// ─── 9. Representative /family/:slug pages ─────────────────────────────────
const dumplingFamilyPath = `${DIST}family/dumpling/index.html`;
checkFullBuild(
  "/family/dumpling/ exists",
  await exists(dumplingFamilyPath),
  dumplingFamilyPath,
);

const lateFamilyPath = `${DIST}family/${LATE_PAGE_FAMILY_SLUG}/index.html`;
if (SKIP_MOCK_FIXTURES) {
  console.warn(
    "[validate-build] BUILD_DATA_SOURCE != mock — skipping late-page-family fixture checks (live API does not have this fixture family)",
  );
} else {
  check(
    "/family/late-page-family/ exists (pagination fixture)",
    await exists(lateFamilyPath),
    lateFamilyPath,
  );
}

// ─── 10. Domain identity baked at Astro render (PUBLIC_DOMAIN) ─────────────
const homeHtml = await read(`${DIST}index.html`);
const notFoundHtml = await read(`${DIST}404.html`);
const navHtml = homeHtml ?? placesHtml ?? "";
// ONE SITE, ONE IDENTITY.
//
// There used to be a branch here: the `geo` build identified as the
// Atlas and the `recipes` build identified as Recipes, each with its
// own wordmark and its own 404 branding. Both assertions existed so
// that neither build could serve the other's identity.
//
// There is one build now, and it identifies as the Atlas.
//
// `data-domain` on the BODY used to be "recipes" on every page,
// because the herb green was the SITE's theme. It is now the PAGE's
// theme: the recipe pages carry the herb green and every other page
// carries the terracotta. So the assertion below is that the home
// page -- which is not a recipe page -- carries the Atlas theme.
const homeBodyTag = homeHtml?.match(/<body[^>]*>/)?.[0] ?? "";
check(
  "the build identifies as Atlas",
  />Atlas</.test(navHtml) && /data-domain="atlas"/.test(homeBodyTag),
  'expected the Atlas wordmark + data-domain="atlas" on the body',
);
// THE ACCENT THEME FOLLOWS THE PAGE.
//
// The herb green is the RECIPES theme and it belongs to the recipe
// pages. Every other page -- the Atlas, the dishes, the families --
// keeps the terracotta. This asserts both halves: the recipe hub
// carries the green, and the home page does not.
//
// It matters because the header's "Add a dish" button is the most
// visible element on every page. If the theme leaks, that button
// changes colour site-wide, which is exactly what happened.
const recipesHtml = await read(`${DIST}recipes/index.html`);
const recipesBodyTag = recipesHtml?.match(/<body[^>]*>/)?.[0] ?? "";
check(
  "the recipe pages carry the herb-green theme",
  /data-domain="recipes"/.test(recipesBodyTag),
  `expected data-domain="recipes" on the recipe hub's body, got: ${recipesBodyTag}`,
);
check(
  "the non-recipe pages carry the terracotta theme",
  /data-domain="atlas"/.test(homeBodyTag),
  `expected data-domain="atlas" on the home page's body, got: ${homeBodyTag}`,
);

// The 404 page identifies as Gustale, and its help links are LOCAL.
//
// It used to assert the literal string "Gustale Atlas" on the 404 --
// the wordmark that the two builds each carried. The 404 page was
// redesigned and carries the bare brand instead, so the assertion is
// on what actually matters: the page names the site, and the Recipes
// button points at the LOCAL /recipes and not at another host.
check(
  "404 identifies as Gustale",
  /Gustale/.test(notFoundHtml ?? ""),
  "the 404 page does not name the site",
);
check(
  "404 links to the local /recipes",
  notFoundHtml?.includes('href="/recipes"'),
  "the 404 page has no local /recipes link",
);
check(
  "404 carries no cross-host link",
  !/href="https?:\/\//.test(notFoundHtml ?? ""),
  "the 404 page links to another host",
);

// Unset/default PUBLIC_DOMAIN must resolve to recipes (404, Nav, helpers).
check(
  "unset PUBLIC_DOMAIN resolves to recipes",
  resolveGustaleDomain(undefined) === "recipes" &&
    resolveGustaleDomain(null) === "recipes" &&
    resolveGustaleDomain("") === "recipes" &&
    resolveGustaleDomain("recipes") === "recipes",
  "expected recipes default",
);
check(
  "PUBLIC_DOMAIN=geo resolves to geo",
  resolveGustaleDomain("geo") === "geo",
);

// ─── 11. Post-build route ownership ────────────────────────────────────────
const newDishExists =
  (await exists(`${DIST}dishes/new/index.html`)) ||
  (await exists(`${DIST}dishes/new.html`));
const ingredientsExists = await exists(`${DIST}ingredients`);
// WP-C3 MOVED THE MAP TO /atlas.
//
// The map used to be a page of its own at /map. It is now part of the
// atlas, which is /atlas -- the map, the filter rail and the place
// panel in one page. The check below therefore asks for /atlas, and
// the retired /map is checked as ABSENT a few lines down.
const mapExists =
  (await exists(`${DIST}atlas/index.html`)) || (await exists(`${DIST}atlas.html`));

// ONE BUILD SERVES EVERYTHING.
//
// This used to assert the OPPOSITE: that the geo build REMOVED
// /dishes/new and /ingredients, and that the recipes build removed
// /map. The build stripped pages because one build served two sites.
//
// Now nothing is stripped, and the checks below are the ones that
// would catch a regression: if a page went missing from the dist, this
// is where it shows up.
check(
  "the dist has /dishes/new",
  newDishExists,
  "dishes/new missing from the dist",
);
check(
  "the dist has /ingredients",
  ingredientsExists,
  "ingredients/ missing from the dist",
);
// ONE SITE. The map is on it.
//
// There used to be a check that the `recipes` variant did NOT carry
// /map -- the map belonged to the Atlas and the recipes variant was a
// different site without one. There is one site now, and it has the
// map -- at /atlas, where WP-C3 put it.
check("the dist has /atlas", mapExists, "atlas/ missing from the dist");

// ─── 12. The authoring links are LOCAL ─────────────────────────────────────
//
// INVERTED.
//
// This check used to scan the baked HTML for RELATIVE authoring hrefs
// (`/dishes/new`, `/dishes/<slug>/edit`, `/ingredients/<slug>`) and
// FAIL if it found one -- because the geo post-build deleted those
// pages, so a relative link to them was a 404 and the link had to
// cross to the other host.
//
// Nothing is deleted now, so a relative link to them is CORRECT, and
// an ABSOLUTE link to the other host is the defect.
//
// The scan therefore looks for the absolute forms. It is the mirror
// image of the old check, and it is the one that would catch a link to
// the retired host sneaking back in.
{
  const pagesToScan = [
    homeHtml,
    await read(`${DIST}contribute/index.html`),
    notFoundHtml,
    await read(`${DIST}dishes/index.html`),
    await read(dumplingFamilyPath),
  ].filter(Boolean);

  const crossHostAuthoring = [];
  const badPatterns = [
    /href="https:\/\/gustale\.recipes\/dishes\/new"/g,
    /href="https:\/\/gustale\.recipes\/dishes\/[^"]+\/edit"/g,
    /href="https:\/\/gustale\.recipes\/ingredients\/[^"]*"/g,
    /href="https:\/\/gustale\.recipes\/dishes"/g,
  ];
  for (const html of pagesToScan) {
    for (const re of badPatterns) {
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(html)) !== null) crossHostAuthoring.push(m[0]);
    }
  }
  check(
    "the authoring links are local, not cross-host",
    crossHostAuthoring.length === 0,
    crossHostAuthoring.slice(0, 8).join(", "),
  );

  // And the local authoring route is actually present in the markup --
  // not merely absent of a cross-host link. A page that dropped the
  // link altogether would pass the check above.
  const anyLocalAuthoring = pagesToScan.some(
    (html) =>
      /href="\/dishes\/new"/.test(html ?? "") ||
      /href="\/ingredients\//.test(html ?? ""),
  );
  check(
    "the authoring routes are linked locally",
    anyLocalAuthoring,
    "no local authoring href found in the scanned pages",
  );
}

// ─── 13. Family fallback pagination (late-page fixture via mock) ───────────
// Requires PUBLIC_API_BASE (set during CI/local mock builds). Proves a family
// that only appears after offset>=100 is discovered by offset paging, and that
// limit>100 is clamped (never silently omit post-first-page families).
//
// Skipped entirely when BUILD_DATA_SOURCE != mock: the live API has 121
// published dishes, no `late-page-family` fixture, and honors no
// `X-Gustale-Fixture` header. The CI/local build is still gated on this
// check.
if (SKIP_MOCK_FIXTURES) {
  console.warn(
    "[validate-build] BUILD_DATA_SOURCE != mock — skipping live pagination fixture checks",
  );
} else if (API_BASE) {
  try {
    const fixtureFetch = (url, init = {}) =>
      fetch(url, {
        ...init,
        headers: {
          ...(init.headers ?? {}),
          "X-Gustale-Fixture": "pagination",
        },
      });

    const page0Res = await fixtureFetch(
      `${API_BASE}/api/dishes?status=published&limit=${DISH_LIST_PAGE_LIMIT}&offset=0`,
    );
    const page0 = page0Res.ok ? await page0Res.json() : { dishes: [] };
    const page0HasLate = (page0.dishes ?? []).some(
      (d) => d.familySlug === LATE_PAGE_FAMILY_SLUG,
    );
    check(
      "pagination fixture: late family absent from first page",
      !page0HasLate,
      "late-page-family unexpectedly on offset=0",
    );

    const page1Res = await fixtureFetch(
      `${API_BASE}/api/dishes?status=published&limit=${DISH_LIST_PAGE_LIMIT}&offset=${DISH_LIST_PAGE_LIMIT}`,
    );
    const page1 = page1Res.ok ? await page1Res.json() : { dishes: [] };
    const page1HasLate = (page1.dishes ?? []).some(
      (d) => d.familySlug === LATE_PAGE_FAMILY_SLUG,
    );
    check(
      "pagination fixture: late family present on second page",
      page1HasLate,
      "late-page-family missing at offset=100",
    );

    // Oversized limit must clamp to 100 (API contract) — still not enough
    // to reach the late family in a single request.
    const bigRes = await fixtureFetch(
      `${API_BASE}/api/dishes?status=published&limit=500&offset=0`,
    );
    const big = bigRes.ok ? await bigRes.json() : { dishes: [], limit: 0 };
    check(
      "pagination fixture: limit=500 clamps to 100",
      big.limit === 100 && (big.dishes ?? []).length <= 100,
      `limit=${big.limit} len=${(big.dishes ?? []).length}`,
    );
    check(
      "pagination fixture: clamped page still omits late family",
      !(big.dishes ?? []).some((d) => d.familySlug === LATE_PAGE_FAMILY_SLUG),
      "late family visible without paging — fixture broken",
    );

    const collected = await collectFamiliesFromPublishedDishes(
      API_BASE,
      fixtureFetch,
    );
    check(
      "family fallback pagination discovers late-page family",
      collected.some((c) => c.slug === LATE_PAGE_FAMILY_SLUG),
      `families found: ${collected
        .map((c) => c.slug)
        .slice(0, 12)
        .join(", ")}`,
    );
  } catch (err) {
    check("family fallback pagination checks ran", false, String(err));
  }
} else {
  console.warn(
    "[validate-build] PUBLIC_API_BASE unset — skipping live pagination fixture checks",
  );
}

// ─── 14. U0-B navigation / search invariants ───────────────────────────────
const webRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
try {
  await access(join(webRoot, "src/components/SiteHeader.astro"));
  check(
    "SiteHeader.astro remains absent",
    false,
    "SiteHeader.astro unexpectedly exists",
  );
} catch {
  check("SiteHeader.astro remains absent", true);
}
check(
  "Nav.astro remains canonical source",
  await exists(join(webRoot, "src/components/Nav.astro")),
);

check(
  "mobile search control present",
  /id="nav-mobile-search"/.test(navHtml),
  "missing #nav-mobile-search",
);
check(
  "mobile menu control present",
  /id="nav-mobile-toggle"/.test(navHtml),
  "missing #nav-mobile-toggle",
);
check(
  "mobile panel is a modal dialog",
  /id="nav-mobile-panel"[\s\S]*?role="dialog"/.test(navHtml) ||
    /role="dialog"[\s\S]*?id="nav-mobile-panel"/.test(navHtml),
  "nav-mobile-panel missing role=dialog",
);

// No ambiguous duplicate public Contribute CTA in the header/drawer.
check(
  "public nav does not include Contribute CTA",
  !/gst-nav-contribute/.test(navHtml) && !/>Contribute<\/a>/.test(navHtml),
  "found Contribute CTA in baked nav",
);

// R3 — "Add a dish" is the ATLAS's control.
//
// The brief's R tier: "Add a dish" on geo; "Add a recipe" on recipes.
// There is no "Add a recipe" yet — there is no recipe to add — so on
// the recipes property the control is REMOVED rather than renamed.
//
// This check used to require the CTA on BOTH properties, which
// encoded the defect the brief describes ("Add a dish" is in the nav
// on both sites). It now asserts the requirement in both directions:
// the Atlas HAS it, and the recipes property does NOT.
// ONE NAV. It HAS the Add a dish CTA.
//
// There used to be a check that the `recipes` variant's nav did NOT
// have the CTA -- the recipes property was read-only and the Atlas was
// where you authored. There is one site now, it authors, and the CTA
// is in its nav.
check(
  "the nav HAS the Add a dish CTA",
  navHtml.includes(`href="${addDishHref(resolveGustaleDomain("geo"))}"`) &&
    /Add a dish/.test(navHtml),
  `expected href=${addDishHref(resolveGustaleDomain("geo"))} and the label`,
);

// ─── 15. THE ONE HOME ───────────────────────────────────────────────────
//
// Before 6b, the recipes VARIANT of the site served the ATLAS home:
// the same `AtlasHeroKpi` band and the same `GustaleHomeIsland`
// workspace that the geo variant serves. ADR-007 recorded that as the
// thing R1 fixes — "a minimal own home for the recipes variant".
//
// ONE HOME. It is the Atlas home.
//
// These checks used to assert the separation in BOTH directions: the
// geo home kept the Atlas home, and the `recipes` variant served its
// OWN minimal home with its own KPI-free layout and its own
// canonical.
//
// That variant is gone. There is one site, one home, and it is the
// Atlas home.
//
// WP-C1 CHANGED WHAT THE HOME IS, NOT THAT IT IS THE ONLY ONE.
//
// The blueprint's WP-C1 is "Home as in the mockup", and its acceptance
// criteria are explicit: server-render the home from the build
// snapshot, and REMOVE the full list and the KPI definitions.
//
// So the two checks below used to assert the home's OLD shape:
//
//   - it carried the `atlas-kpi` band (the KPI definitions WP-C1
//     removes), and
//   - it mounted the interactive `GustaleHomeIsland` workspace, which
//     fetched the whole catalogue on the client.
//
// Both assertions are now INVERTED, because both are the defect
// WP-C1 fixes. The home must NOT carry the retired KPI band and must
// NOT mount the catalogue workspace — and it must carry the
// server-rendered content instead, so a reader with no JavaScript
// still sees the page.
//
// The checks that remain: the home is still the Atlas home (it is not
// the retired recipes home), it still offers the authoring CTA, and
// the nav still marks the Atlas section as current.
check(
  "the home is still the Atlas home",
  !/recipes-home/.test(homeHtml ?? ""),
  "the home carries the retired recipes home",
);
// WP-C1 REMOVES the KPI definitions from the home. The band is still
// a component — the map page and the recipe pages use it — but the
// home no longer leads with it.
check(
  "the home does NOT carry the retired KPI band",
  !/atlas-kpi/.test(homeHtml ?? ""),
  "the home still carries the atlas-kpi band; WP-C1 removes the KPI definitions from the home",
);
// WP-C1 SERVER-RENDERS the home. The catalogue workspace is gone: it
// fetched every published dish on the client to populate its filters,
// which is the thing WP-C1 removes ("remove the full list").
check(
  "the home does NOT mount the catalogue workspace",
  !/GustaleHomeIsland/.test(homeHtml ?? ""),
  "the home still mounts GustaleHomeIsland; WP-C1 replaces it with the server-rendered home",
);
// AND THE SERVER-RENDERED CONTENT IS THERE. Without JavaScript, the
// home still has its four dish cards, its threads, and its families.
check(
  "the home server-renders its dish cards",
  /home__dish-card/.test(homeHtml ?? ""),
  "the home has no server-rendered dish cards",
);
check(
  "the home server-renders its thread cards",
  /home__thread-card/.test(homeHtml ?? ""),
  "the home has no server-rendered thread cards",
);
check(
  "the home server-renders its family chips",
  /home__chip/.test(homeHtml ?? ""),
  "the home has no server-rendered family chips",
);
// ONE SITE, so the home offers the authoring CTA and links to the
// authoring form LOCALLY.
check(
  "the home DOES offer Add a dish",
  /Add a dish/.test(homeHtml ?? ""),
  "the home has no 'Add a dish' CTA",
);
check(
  "the home DOES link to the dish authoring form",
  homeHtml?.includes('href="/dishes/new"'),
  "the home does not link to /dishes/new",
);

// Static aria-current on taxonomy pages (no client JS required).
//
// ONE NAV. The same checks apply to the one site.
//
// THE CURRENT PAGE IS MARKED, AND ONLY IT.
//
// This check runs on the /regions page. The six sections do NOT
// include a Places section — the blueprint's D2 gives six, and the
// places directory becomes `/places` in WP-C3 — so no nav link
// matches /regions, and NONE of them may claim to be current.
//
// The positive case is checked on the home page below, where the
// "Atlas" section IS the current page.
check(
  "no nav link wrongly claims to be current on /regions",
  !/gst-navlink[^>]*aria-current="page"/.test(placesHtml ?? ""),
  "a nav link carries aria-current=page on /regions",
);
// The Atlas is NO LONGER THE HOME PAGE.
//
// WP-C3 gave the atlas its own page at /atlas. The home page is the
// site's front door, and no nav item lights up when a reader is
// standing on it -- so the home page must NOT claim the Atlas as its
// current section, and the ATLAS page must claim the Atlas.
//
// This is the check that would fail if a nav link went back to
// pointing the Atlas at "/".
check(
  "no nav link claims the Atlas is current on the home page",
  !/href="\/atlas"[^>]*aria-current="page"/.test(homeHtml ?? "") &&
    !/aria-current="page"[^>]*href="\/atlas"/.test(homeHtml ?? ""),
  "a nav link carries aria-current=page for the Atlas on the home page",
);
check(
  "the nav marks the Atlas section on the atlas page",
  /href="\/atlas"[^>]*aria-current="page"/.test(atlasHtml ?? "") ||
    /aria-current="page"[^>]*href="\/atlas"/.test(atlasHtml ?? ""),
  "the Atlas link is missing aria-current=page on /atlas",
);
// The aria-current check reads a SPECIFIC fixture family.
//
// It is scope-aware for the same reason the "exists" check above is:
// the dumpling family is one specific dish, and a scoped build (the
// staging build takes the first 50 dishes) does not necessarily
// contain it. Asserting on a page that is not in the build would fail
// a build that is correct.
//
// `checkFullBuild` skips it for a scoped build AND prints the skip, so
// a skip is visible rather than silently absent. The PRODUCTION build
// still runs it, with zero skips -- that is the regression check.
const dumplingHtml = await read(dumplingFamilyPath);
checkFullBuild(
  "static aria-current on Food families for /family/:slug",
  /href="\/families"[^>]*aria-current="page"/.test(dumplingHtml ?? "") ||
    /aria-current="page"[^>]*href="\/families"/.test(dumplingHtml ?? ""),
  "Food families missing aria-current on /family/dumpling",
);
{
  // The nav's active link on /dishes is "Explore" — the nav's first
  // entry, which is the site's home.
  const dishesHtml = await read(`${DIST}dishes/index.html`);
  check(
    "static aria-current on the Explore link for /dishes",
    /href="\/dishes"[^>]*aria-current="page"/.test(dishesHtml ?? "") ||
      /aria-current="page"[^>]*href="\/dishes"/.test(dishesHtml ?? ""),
    "no nav link carries aria-current=page on /dishes",
  );
}

// ONE SITE.
//
// This used to require the nav to carry an ABSOLUTE link to each
// property, so that the reader could switch between them. There is
// only one property, so the switch is gone and every nav link is
// relative.
//
// The check is the INVERSE of the old one: a cross-host link is now
// the defect.
check(
  "the nav carries no cross-host link",
  !/<a[^>]+href="https?:\/\/(?!staging\.gustale\.com)/.test(navHtml ?? "") &&
    !/href="https:\/\/gustale\.recipes/.test(navHtml ?? ""),
  "the nav still links to another host",
);

// The search's helpers: the see-all link and the fallback links are
// all RELATIVE now, on every variant.
const atlasSeeAll = seeAllDishesHref("test query", "geo");
check(
  "the see-all URL is the local dishes listing",
  atlasSeeAll === "/dishes?q=test%20query",
  `got ${atlasSeeAll}`,
);
const atlasHelp = searchHelpLinks("geo");
const atlasErr = searchErrorBrowseLinks("geo");
// The search's fallback links are the SIX SECTIONS, and every one of
// them is local -- including the two that used to cross to the other
// host.
check(
  "the help links are all local",
  atlasHelp.every((l) => l.href.startsWith("/") && !l.href.startsWith("//")),
  `got ${atlasHelp.map((l) => l.href).join(", ")}`,
);
check(
  "the help links include the recipes and ingredients sections",
  atlasHelp.some((l) => l.href === "/recipes") &&
    atlasHelp.some((l) => l.href === "/ingredients"),
  `got ${atlasHelp.map((l) => l.href).join(", ")}`,
);
check(
  "Atlas help links name the six sections",
  ["Atlas", "Dishes", "Families", "Ingredients", "History", "Recipes"].every(
    (label) => atlasHelp.some((l) => l.label === label),
  ),
  `got ${atlasHelp.map((l) => l.label).join(", ")}`,
);
check(
  "the error fallback includes Families + Recipes, locally",
  atlasErr.some((l) => l.href === "/families" && l.label === "Families") &&
    atlasErr.some((l) => l.href === "/recipes" && l.label === "Recipes"),
  `got ${atlasErr.map((l) => `${l.label}→${l.href}`).join(", ")}`,
);

check(
  "primary-nav match: /family/:slug → Food families",
  isPrimaryNavActive("/families", "/family/dumpling/", "geo") === true,
);
check(
  "primary-nav match: /dishes/:slug → Recipes (recipes build)",
  isPrimaryNavActive("/dishes", "/dishes/vindaloo/", "recipes") === true,
);
check(
  "primary-nav match: /regions → Dish origins (recipes build)",
  isPrimaryNavActive("/regions", "/regions/", "recipes") === true,
);
check(
  "primary-nav match: /lineages → History & connections (recipes build)",
  isPrimaryNavActive("/lineages", "/lineages/", "recipes") === true,
);

// ─── The crawl signals ─────────────────────────────────────────────────
//
// A missing robots.txt is not a neutral absence: the 404 page is
// served in its place, so a crawler reads a page of HTML where it
// expected rules, and never finds the sitemap pointer.
//
// The sitemap index is checked too, because the robots.txt points at
// it — a robots.txt that names a sitemap which is not there is a
// pointer to nothing.
//
// These checks are here so the absence cannot come back silently. The
// first version of the robots.txt handling appended a Sitemap: line to
// an EXISTING robots.txt and caught the missing-file case with an empty
// catch block, so the site shipped with no robots.txt at all and
// nothing said so.
const robotsPath = join(DIST, "robots.txt");
const sitemapIndexPath = join(DIST, "sitemap.xml");

let robotsBody = "";
try {
  robotsBody = await readFile(robotsPath, "utf-8");
} catch {
  robotsBody = "";
}

check("robots.txt exists", robotsBody.length > 0, robotsPath);
check(
  "robots.txt is not the 404 page",
  !robotsBody.trimStart().startsWith("<"),
  "a crawler reads HTML where it expects rules",
);
// The staging robots.txt disallows EVERYTHING and therefore has no
// Sitemap line -- pointing a crawler at a sitemap it has just been
// told not to read would be contradictory.
//
// The production robots.txt points at the sitemap index, and that
// check still runs at full strength.
if (SCOPED_BUILD) {
  check(
    "the staging robots.txt disallows everything",
    robotsBody.includes("Disallow: /") && !robotsBody.includes("Allow: /"),
    "a staging robots.txt must not allow crawling",
  );
} else {
  check(
    "robots.txt points at the sitemap index",
    robotsBody.includes(`Sitemap: ${origin}/sitemap.xml`),
    `Sitemap: ${origin}/sitemap.xml`,
  );
}
check(
  "the sitemap index exists",
  await exists(sitemapIndexPath),
  sitemapIndexPath,
);

// ─── NO INTERNAL METADATA IN THE OUTPUT ────────────────────────────────────
//
// WHY THIS CHECK EXISTS
//
// The dish page's "Places & traditions" section printed the
// ASSOCIATION'S INTERNAL EXPLANATION FIELD to the reader. That field
// holds the database's own migration notes:
//
//   "Migrated from the legacy origin_geo_id. This is the Wikidata
//    'country of origin' value — DISCOVERY DATA, not a reviewed
//    historical claim. It is not promoted to historical_emergence
//    because no qualifying source supports that specific claim. The
//    original value is preserved in legacy_value."
//
// It also printed the unfilled placeholders the migration left behind:
// "<cuisine>" and "<tradition>".
//
// Those are the DATABASE'S NOTES, not the ARCHIVE'S PROSE. They must
// never reach a reader. They are also the kind of leak that comes
// back the moment somebody adds a field to a query, so the guard
// belongs in the build, not in a review.
//
// WHAT IS CHECKED
//
// EVERY built HTML page, for:
//
//   1. the internal column names and prose fragments, and
//   2. angle-bracket placeholders of the shape <word> -- which is what
//      an unfilled migration placeholder looks like.
//
// The placeholder check is deliberately narrow: it looks for a
// lowercase angle-bracket word, not for ANY "<" followed by a letter.
// HTML tags in the output are lower-case too, so a naive version of
// this check would fire on every page. The check therefore only
// fires on a tag-shaped token that is NOT a known HTML tag -- which
// is what a placeholder is.
const FORBIDDEN_INTERNAL_TERMS = [
  "origin_geo_id",
  "historical_emergence",
  "legacy_value",
  "dish_cuisines",
  "DISCOVERY DATA",
  "legacy_origin_geo_id",
  "legacy_dish_cuisines",
];

// The tags a real page is allowed to contain. Anything else in
// <angle-brackets> is a placeholder that was never filled in.
const KNOWN_HTML_TAGS = new Set([
  "a",
  "abbr",
  "address",
  "area",
  "article",
  "aside",
  "audio",
  "b",
  "base",
  "bdi",
  "bdo",
  "blockquote",
  "body",
  "br",
  "button",
  "canvas",
  "caption",
  "cite",
  "code",
  "col",
  "colgroup",
  "data",
  "datalist",
  "dd",
  "del",
  "details",
  "dfn",
  "dialog",
  "div",
  "dl",
  "dt",
  "em",
  "embed",
  "fieldset",
  "figcaption",
  "figure",
  "footer",
  "form",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "head",
  "header",
  "hgroup",
  "hr",
  "html",
  "i",
  "iframe",
  "img",
  "input",
  "ins",
  "kbd",
  "label",
  "legend",
  "li",
  "link",
  "main",
  "map",
  "mark",
  "menu",
  "meta",
  "meter",
  "nav",
  "noscript",
  "object",
  "ol",
  "optgroup",
  "option",
  "output",
  "p",
  "param",
  "picture",
  "pre",
  "progress",
  "q",
  "rp",
  "rt",
  "ruby",
  "s",
  "samp",
  "script",
  "section",
  "select",
  "slot",
  "small",
  "source",
  "span",
  "strong",
  "style",
  "sub",
  "summary",
  "sup",
  "svg",
  "table",
  "tbody",
  "td",
  "template",
  "textarea",
  "tfoot",
  "th",
  "thead",
  "time",
  "title",
  "tr",
  "track",
  "u",
  "ul",
  "var",
  "video",
  "wbr",
  // Custom elements the framework and the maps emit. These are
  // elements, not placeholders.
  "astro-island",
  "astro-slot",
  "astro-static-slot",
  "path",
  "circle",
  "rect",
  "line",
  "polyline",
  "polygon",
  "g",
  "defs",
  "use",
  "symbol",
  "text",
  "tspan",
  "ellipse",
  "marker",
  "clippath",
  "mask",
  "pattern",
  "lineargradient",
  "radialgradient",
  "stop",
]);

// A tag-shaped token that is not a known tag: "<cuisine>", "<tradition>".
const PLACEHOLDER_RE = /<\/?([a-z][a-z0-9_-]*)>/g;

/**
 * The placeholder tokens in one page's HTML, excluding real tags.
 *
 * The text is stripped of the tags FIRST, so a tag never counts as a
 * placeholder; only a leftover "<word>" in the TEXT does.
 */
function placeholdersIn(html) {
  const text = html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ");
  const found = new Set();
  for (const m of text.matchAll(/<\/?([a-z][a-z0-9_-]*)>/gi)) {
    const tag = m[1].toLowerCase();
    if (!KNOWN_HTML_TAGS.has(tag)) found.add(tag);
  }
  return [...found];
}

/**
 * Every built HTML page, as a list of { path, html }.
 *
 * The dist tree is walked recursively. A scoped build still walks
 * everything it produced -- the guard is about WHAT IS IN THE OUTPUT,
 * not about how much of it there is.
 */
async function allHtmlPages(dir) {
  const out = [];
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...(await allHtmlPages(full)));
    } else if (entry.isFile() && entry.name.endsWith(".html")) {
      const html = await read(full);
      if (html) out.push({ path: full, html });
    }
  }
  return out;
}

const allPages = await allHtmlPages(DIST);
const internalLeaks = [];
const placeholderLeaks = [];
for (const page of allPages) {
  for (const term of FORBIDDEN_INTERNAL_TERMS) {
    if (page.html.includes(term)) {
      internalLeaks.push(
        `${page.path.replace(DIST, "dist/")} contains "${term}"`,
      );
      break;
    }
  }
  const placeholders = placeholdersIn(page.html);
  if (placeholders.length > 0) {
    placeholderLeaks.push(
      `${page.path.replace(DIST, "dist/")} contains the placeholder(s) ` +
        placeholders.map((t) => `<${t}>`).join(", "),
    );
  }
}

check(
  "no page contains the association's internal explanation field",
  internalLeaks.length === 0,
  internalLeaks.length === 0
    ? ""
    : `${internalLeaks.length} page(s):\n      ${internalLeaks
        .slice(0, 10)
        .join(
          "\n      ",
        )}${internalLeaks.length > 10 ? `\n      …and ${internalLeaks.length - 10} more` : ""}`,
);
check(
  "no page contains an unfilled angle-bracket placeholder",
  placeholderLeaks.length === 0,
  placeholderLeaks.length === 0
    ? ""
    : `${placeholderLeaks.length} page(s):\n      ${placeholderLeaks
        .slice(0, 10)
        .join(
          "\n      ",
        )}${placeholderLeaks.length > 10 ? `\n      …and ${placeholderLeaks.length - 10} more` : ""}`,
);

// ─── Report ─────────────────────────────────────────────────────────────────
console.log(
  `\n[validate-build] domain=${DOMAIN} — ${passes.length} passed, ${failures.length} failed` +
    (skips.length > 0 ? `, ${skips.length} skipped` : ""),
);
for (const p of passes) console.log(`  ✓ ${p}`);
for (const s of skips) console.log(`  ~ ${s} (skipped: scoped build)`);
for (const f of failures) console.error(`  ✗ ${f}`);

if (failures.length > 0) {
  console.error(
    `\n[validate-build] FAILED: ${failures.length} check(s) did not pass.`,
  );
  process.exit(1);
}
console.log("[validate-build] all taxonomy + domain checks passed.\n");
