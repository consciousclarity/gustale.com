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
import { access, readFile, stat } from "node:fs/promises";
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
// It has to be domain-aware: a staging build's canonical URLs and its
// sitemap pointer are staging.gustale.com. A check that hardcoded
// gustale.recipes would fail a correct staging build.
const origin =
  DOMAIN === "geo"
    ? "https://gustale.com"
    : DOMAIN === "staging"
      ? "https://staging.gustale.com"
      : "https://gustale.recipes";

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
const regionsPath = `${DIST}regions/index.html`;
const familiesPath = `${DIST}families/index.html`;
const lineagesPath = `${DIST}lineages/index.html`;

const [regionsHtml, familiesHtml, lineagesHtml] = await Promise.all([
  read(regionsPath),
  read(familiesPath),
  read(lineagesPath),
]);

// ─── 1. Pages exist ─────────────────────────────────────────────────────────
check("/regions page exists", await exists(regionsPath), regionsPath);
check("/families page exists", await exists(familiesPath), familiesPath);
check("/lineages page exists", await exists(lineagesPath), lineagesPath);

// ─── 2. Domain-aware primary navigation ────────────────────────────────────
// Domain switcher must use absolute property URLs on both desktop and mobile.
check(
  "nav links to absolute Atlas origin",
  countOccurrences(regionsHtml, 'href="https://gustale.com/"') >= 1,
  "missing https://gustale.com/ switcher link",
);
check(
  "nav links to absolute Recipes origin",
  countOccurrences(regionsHtml, 'href="https://gustale.recipes/"') >= 1,
  "missing https://gustale.recipes/ switcher link",
);

if (DOMAIN === "geo") {
  // The Atlas nav uses "Dish origins" (href=/regions), not "Regions" and not
  // the old "Countries" — the directory holds places, and 42 of the
  // entities it lists are regions and cultural areas rather than
  // countries (ADR-004 F8).
  //
  // Astro may emit whitespace inside the anchor: "> Dish origins <".
  const placesLabelCount = countOccurrences(regionsHtml, "Dish origins");
  check(
    "main navigation contains Dish origins → /regions",
    countOccurrences(regionsHtml, 'href="/regions"') >= 1,
    'no href="/regions" in nav',
  );
  check(
    "mobile navigation includes Dish origins",
    /nav-mobile-link[\s\S]{0,120}Dish origins/.test(regionsHtml ?? "") &&
      placesLabelCount >= 1,
    `expected Dish origins in mobile nav, found ${placesLabelCount} total`,
  );
  check(
    "nav identifies Atlas property in text",
    /Gustale[\s\S]*?Atlas/.test(regionsHtml ?? "") ||
      /Current property: Atlas/.test(regionsHtml ?? ""),
    "Atlas property label missing from nav",
  );
  check(
    "geo nav does not link locally to /ingredients",
    !/href="\/ingredients"/.test(regionsHtml ?? ""),
    "geo nav has local /ingredients link",
  );
  check(
    "geo nav Add a dish points at Recipes host",
    /href="https:\/\/gustale\.recipes\/dishes\/new"/.test(regionsHtml ?? ""),
    "missing absolute Add a dish CTA",
  );
} else {
  check(
    "nav identifies Recipes property in text",
    /Gustale[\s\S]*?Recipes/.test(regionsHtml ?? "") ||
      /Current property: Recipes/.test(regionsHtml ?? ""),
    "Recipes property label missing from nav",
  );
  // The recipes dist still ships the ingredients pages — they are
  // reachable from the dish pages — even though the NAV no longer
  // lists them (P4 made the navigation the same on both domains).
  check(
    "recipes dist includes /ingredients index",
    await exists(`${DIST}ingredients/index.html`),
    "ingredients/index.html missing",
  );
  // The navigation is now the SAME on both domains (P4), so the
  // recipes nav carries the five shared entries and NOT the old
  // domain-specific ones. That is the change being asserted.
  check(
    "recipes nav includes Dish origins → /regions",
    countOccurrences(regionsHtml, 'href="/regions"') >= 1,
    "missing /regions in recipes nav",
  );
  check(
    "recipes nav includes History & connections → /lineages",
    countOccurrences(regionsHtml, 'href="/lineages"') >= 1,
    "missing /lineages in recipes nav",
  );
  check(
    "recipes nav no longer lists Ingredients",
    countOccurrences(regionsHtml, 'href="/ingredients"') === 0,
    "/ingredients is still in the recipes nav",
  );
}

// ─── 3. /regions presented as Dish origins (U0-C directory, not chip wall) ───
check(
  "/regions H1 presents Dish origins",
  /<h1[^>]*>[\s\S]*?Dish origins[\s\S]*?<\/h1>/.test(regionsHtml ?? ""),
  "expected Dish origins in page H1",
);
check(
  "/regions has no dead /regions/:slug links",
  !/href="\/regions\/[^"]+"/.test(regionsHtml ?? ""),
  "found /regions/:slug href",
);
const countryDirCards = countOccurrences(regionsHtml, "browse-dir-card");
check(
  "/regions country directory renders entries",
  countryDirCards >= MIN_DISTINCT_FILTERS,
  `only ${countryDirCards} directory cards`,
);
// Keep a dish-density floor via baked dish name links or counts.
const regionDishHints =
  countOccurrences(regionsHtml, " dishes") +
  countOccurrences(regionsHtml, "/dishes/");
checkFullBuild(
  "/regions still surfaces dish context",
  regionDishHints >= MIN_REGION_TILES,
  `weak dish context signals: ${regionDishHints}`,
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
  !/data-family=|data-lineage=/.test(regionsHtml ?? ""),
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
const navHtml = homeHtml ?? regionsHtml ?? "";
if (DOMAIN === "geo") {
  check(
    "Atlas build identifies as Atlas",
    />Atlas</.test(navHtml) && /data-domain="geo"/.test(navHtml),
    'expected Atlas wordmark + data-domain="geo"',
  );
  check(
    "Atlas build does not claim Recipes as active brand",
    !/<span class="sub">Recipes<\/span>/.test(navHtml),
    "found Recipes sub-brand on geo build",
  );
  check(
    "404 identifies as Atlas",
    /Gustale Atlas/.test(notFoundHtml ?? ""),
    'expected "Gustale Atlas" on geo 404',
  );
} else {
  check(
    "Recipes build identifies as Recipes",
    />Recipes</.test(navHtml) && /data-domain="recipes"/.test(navHtml),
    'expected Recipes wordmark + data-domain="recipes"',
  );
  check(
    "Recipes build does not claim Atlas as active brand",
    !/<span class="sub">Atlas<\/span>/.test(navHtml),
    "found Atlas sub-brand on recipes build",
  );
  check(
    "404 identifies as Recipes",
    /Gustale Recipes/.test(notFoundHtml ?? ""),
    'expected "Gustale Recipes" on recipes 404',
  );
}

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
const mapExists =
  (await exists(`${DIST}map/index.html`)) || (await exists(`${DIST}map.html`));

if (DOMAIN === "geo") {
  check("geo removes /dishes/new", !newDishExists, "dishes/new still present");
  check(
    "geo removes /ingredients",
    !ingredientsExists,
    "ingredients/ still present",
  );
  check("geo keeps /map", mapExists, "map/ missing from geo dist");
} else {
  check("recipes retains /dishes/new", newDishExists, "dishes/new missing");
  check(
    "recipes retains /ingredients",
    ingredientsExists,
    "ingredients/ missing",
  );
  check("recipes removes /map", !mapExists, "map/ still present on recipes");
}

// ─── 12. Atlas must not point authoring CTAs at removed local routes ───────
// Scan baked HTML for relative authoring hrefs that geo post-build deletes.
if (DOMAIN === "geo") {
  const pagesToScan = [
    homeHtml,
    await read(`${DIST}contribute/index.html`),
    notFoundHtml,
    await read(`${DIST}dishes/index.html`),
    await read(dumplingFamilyPath),
  ].filter(Boolean);

  const badLocalAuthoring = [];
  const badPatterns = [
    /href="\/dishes\/new"/g,
    /href="\/dishes\/[^"]+\/edit"/g,
    /href="\/ingredients\/[^"]*"/g,
  ];
  for (const html of pagesToScan) {
    for (const re of badPatterns) {
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(html)) !== null) badLocalAuthoring.push(m[0]);
    }
  }
  check(
    "Atlas CTAs do not use removed local authoring routes",
    badLocalAuthoring.length === 0,
    badLocalAuthoring.slice(0, 8).join(", "),
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
if (DOMAIN === "geo") {
  check(
    "the Atlas nav HAS the Add a dish CTA",
    navHtml.includes(`href="${addDishHref(resolveGustaleDomain("geo"))}"`) &&
      /Add a dish/.test(navHtml),
    `expected href=${addDishHref(resolveGustaleDomain("geo"))} and the label`,
  );
} else {
  check(
    "the recipes nav does NOT have an Add a dish CTA",
    !/Add a dish/.test(navHtml),
    "found an 'Add a dish' CTA in the recipes nav",
  );
  check(
    "the recipes nav does NOT link to the dish authoring form",
    !navHtml.includes('href="/dishes/new"'),
    "found a link to /dishes/new in the recipes nav",
  );
}

// ─── 15. PR 6b — the recipes property's OWN home (R1) ─────────────────────
//
// Before 6b, `gustale.recipes/` served the ATLAS home: the same
// `AtlasHeroKpi` band and the same `GustaleHomeIsland` workspace that
// `gustale.com/` serves. ADR-007 recorded that as the thing R1 fixes —
// "a minimal own home for the recipes property".
//
// These checks assert the separation in BOTH directions, the same way
// the R3 check above does: the Atlas home keeps the Atlas home, and the
// recipes property does NOT serve it.
if (DOMAIN === "geo") {
  check(
    "the Atlas home is still the Atlas home",
    /atlas-kpi/.test(homeHtml ?? "") && !/recipes-home/.test(homeHtml ?? ""),
    "the geo home is missing the Atlas KPI band, or carries the recipes home",
  );
  check(
    "the Atlas home still mounts the interactive workspace",
    /GustaleHomeIsland/.test(homeHtml ?? ""),
    "the geo home no longer mounts the home island",
  );
} else {
  check(
    "the recipes home is its OWN page, not the Atlas home",
    /recipes-home/.test(homeHtml ?? "") &&
      !/atlas-kpi/.test(homeHtml ?? "") &&
      !/GustaleHomeIsland/.test(homeHtml ?? ""),
    "the recipes home is serving the Atlas home (atlas-kpi / home island)",
  );
  check(
    "the recipes home names the recipes property",
    /Gustale Recipes/.test(homeHtml ?? ""),
    'expected "Gustale Recipes" on the recipes home',
  );
  check(
    "the recipes home self-canonicals on its own origin",
    (homeHtml ?? "").includes(`<link rel="canonical" href="${origin}/"`),
    `the recipes home canonical is not its own URL on ${origin}`,
  );
  // R3, again, on the recipes HOME (not just the nav): the recipes
  // property must not offer the Atlas's "Add a dish", and must not
  // link to the dish authoring form.
  check(
    "the recipes home does NOT offer Add a dish",
    !/Add a dish/.test(homeHtml ?? ""),
    "found an 'Add a dish' CTA on the recipes home",
  );
  check(
    "the recipes home does NOT link to the dish authoring form",
    !homeHtml?.includes('href="/dishes/new"'),
    "found a link to /dishes/new on the recipes home",
  );
  // The recipes home must point at the ATLAS for the history — and it
  // must do so with an ABSOLUTE url, because the two properties are
  // different origins and a relative /dishes would land on the
  // recipes listing instead.
  check(
    "the recipes home links to the Atlas for the dish history",
    (homeHtml ?? "").includes('href="https://gustale.com/dishes"'),
    "no absolute gustale.com/dishes link on the recipes home",
  );
  // And it must NOT claim the Atlas's catalogue counts as its own.
  // A count that belongs to the other property is not this page's to
  // display.
  check(
    "the recipes home does not claim the Atlas's catalogue counts",
    !/atlas-kpi__stats/.test(homeHtml ?? ""),
    "the recipes home renders the Atlas KPI counts",
  );
}

// Static aria-current on taxonomy pages (no client JS required).
if (DOMAIN === "geo") {
  check(
    "static aria-current on Dish origins for /regions",
    /href="\/regions"[^>]*aria-current="page"/.test(regionsHtml ?? "") ||
      /aria-current="page"[^>]*href="\/regions"/.test(regionsHtml ?? ""),
    "Dish origins link missing aria-current=page on /regions",
  );
  const dumplingHtml = await read(dumplingFamilyPath);
  check(
    "static aria-current on Food families for /family/:slug",
    /href="\/families"[^>]*aria-current="page"/.test(dumplingHtml ?? "") ||
      /aria-current="page"[^>]*href="\/families"/.test(dumplingHtml ?? ""),
    "Food families missing aria-current on /family/dumpling",
  );
} else {
  // The recipes domain's nav is now the SAME as the geo one (P4), so
  // the active link on /dishes is "Explore" — the nav's first entry,
  // which is the site's home. The recipes LISTING is reachable from
  // there, but the nav item that matches /dishes is the home link.
  //
  // The check is that SOME nav link carries aria-current="page", and
  // that it is the one whose href matches the current path.
  const dishesHtml = await read(`${DIST}dishes/index.html`);
  check(
    "static aria-current on the Explore link for /dishes (recipes build)",
    /href="\/dishes"[^>]*aria-current="page"/.test(dishesHtml ?? "") ||
      /aria-current="page"[^>]*href="\/dishes"/.test(dishesHtml ?? ""),
    "no nav link carries aria-current=page on /dishes",
  );
}

check(
  "both absolute property-switch destinations present",
  countOccurrences(navHtml, 'href="https://gustale.com/"') >= 1 &&
    countOccurrences(navHtml, 'href="https://gustale.recipes/"') >= 1,
);

// Helper parity: Atlas see-all + fallbacks never emit local /dishes or /ingredients.
const atlasSeeAll = seeAllDishesHref("test query", "geo");
check(
  "Atlas see-all URL is absolute Recipes dishes",
  atlasSeeAll === "https://gustale.recipes/dishes?q=test%20query",
);
const atlasHelp = searchHelpLinks("geo");
const atlasErr = searchErrorBrowseLinks("geo");
check(
  "Atlas help links omit local recipes-only paths",
  atlasHelp.every(
    (l) => l.href !== "/dishes" && !l.href.startsWith("/ingredients"),
  ),
);
check(
  "Atlas error fallback includes Food families + Browse recipes",
  atlasErr.some((l) => l.href === "/families") &&
    atlasErr.some((l) => l.href === "https://gustale.recipes/dishes"),
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
