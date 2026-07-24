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
import { access, readFile, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  LATE_PAGE_FAMILY_SLUG,
  DISH_LIST_PAGE_LIMIT,
  collectFamiliesFromPublishedDishes,
  resolveGustaleDomain,
} from './collect-dish-families.mjs';
import {
  addDishHref,
  isPrimaryNavActive,
  searchErrorBrowseLinks,
  searchHelpLinks,
  seeAllDishesHref,
} from './search-nav-helpers.mjs';

const DIST = new URL('../dist/', import.meta.url).pathname;
const DOMAIN = process.env.PUBLIC_DOMAIN ?? 'recipes';
const API_BASE = process.env.PUBLIC_API_BASE ?? '';

// Minimum distinct filter chips a taxonomy page must expose. Below this a page
// has almost certainly collapsed to "All"/"Other" (the bug this guards).
const MIN_DISTINCT_FILTERS = 5;
// Floor for dish tiles rendered on /regions (60 published; 20 = safe floor,
// matches post-build.mjs MIN_EXPECTED_DISHES).
const MIN_REGION_TILES = 20;

const failures = [];
const passes = [];

function check(name, condition, detail = '') {
  if (condition) {
    passes.push(name);
  } else {
    failures.push(detail ? `${name} — ${detail}` : name);
  }
}

async function exists(path) {
  try { await stat(path); return true; } catch { return false; }
}

async function read(path) {
  try { return await readFile(path, 'utf-8'); } catch { return null; }
}

/** Distinct values of a given data-* attribute, excluding control values. */
function distinctAttr(html, attr, exclude = []) {
  if (!html) return [];
  const re = new RegExp(`${attr}="([^"]*)"`, 'g');
  const set = new Set();
  let m;
  while ((m = re.exec(html)) !== null) {
    const v = m[1];
    // Skip control/sentinel values and any uninterpolated template literals.
    if (exclude.includes(v)) continue;
    if (v.includes('${')) continue;
    set.add(v);
  }
  return [...set];
}

function countOccurrences(html, needle) {
  if (!html) return 0;
  return html.split(needle).length - 1;
}

// ─── Load the three taxonomy pages ──────────────────────────────────────────
const regionsPath  = `${DIST}regions/index.html`;
const familiesPath = `${DIST}families/index.html`;
const lineagesPath = `${DIST}lineages/index.html`;

const [regionsHtml, familiesHtml, lineagesHtml] = await Promise.all([
  read(regionsPath), read(familiesPath), read(lineagesPath),
]);

// ─── 1. Pages exist ─────────────────────────────────────────────────────────
check('/regions page exists', await exists(regionsPath), regionsPath);
check('/families page exists', await exists(familiesPath), familiesPath);
check('/lineages page exists', await exists(lineagesPath), lineagesPath);

// ─── 2. Domain-aware primary navigation ────────────────────────────────────
// Domain switcher must use absolute property URLs on both desktop and mobile.
check('nav links to absolute Atlas origin',
  countOccurrences(regionsHtml, 'href="https://gustale.com/"') >= 1,
  'missing https://gustale.com/ switcher link');
check('nav links to absolute Recipes origin',
  countOccurrences(regionsHtml, 'href="https://gustale.recipes/"') >= 1,
  'missing https://gustale.recipes/ switcher link');

if (DOMAIN === 'geo') {
  // Atlas nav uses "Countries" (href=/regions), not "Regions".
  // Astro may emit whitespace inside the anchor: "> Countries <".
  const countriesLabelCount = countOccurrences(regionsHtml, 'Countries');
  check('main navigation contains Countries → /regions',
    countOccurrences(regionsHtml, 'href="/regions"') >= 1,
    'no href="/regions" in nav');
  check('mobile navigation includes Countries',
    /nav-mobile-link[\s\S]{0,120}Countries/.test(regionsHtml ?? '')
      && countriesLabelCount >= 1,
    `expected Countries in mobile nav, found ${countriesLabelCount} total`);
  check('nav identifies Atlas property in text',
    /Gustale[\s\S]*?Atlas/.test(regionsHtml ?? '') || /Current property: Atlas/.test(regionsHtml ?? ''),
    'Atlas property label missing from nav');
  check('geo nav does not link locally to /ingredients',
    !/href="\/ingredients"/.test(regionsHtml ?? ''),
    'geo nav has local /ingredients link');
  check('geo nav Add a dish points at Recipes host',
    /href="https:\/\/gustale\.recipes\/dishes\/new"/.test(regionsHtml ?? ''),
    'missing absolute Add a dish CTA');
} else {
  check('nav identifies Recipes property in text',
    /Gustale[\s\S]*?Recipes/.test(regionsHtml ?? '') || /Current property: Recipes/.test(regionsHtml ?? ''),
    'Recipes property label missing from nav');
  check('recipes nav includes Ingredients',
    countOccurrences(regionsHtml, 'href="/ingredients"') >= 1,
    'missing /ingredients in recipes nav');
  check('recipes dist includes /ingredients index',
    await exists(`${DIST}ingredients/index.html`),
    'ingredients/index.html missing');
  check('recipes nav includes Recipes → /dishes',
    countOccurrences(regionsHtml, 'href="/dishes"') >= 1,
    'missing /dishes in recipes nav');
}

// ─── 3. /regions presented as Countries (U0-C directory, not chip wall) ───
check('/regions H1 presents Countries',
  /<h1[^>]*>[\s\S]*?Countries[\s\S]*?<\/h1>/.test(regionsHtml ?? ''),
  'expected Countries in page H1');
check('/regions has no dead /regions/:slug links',
  !/href="\/regions\/[^"]+"/.test(regionsHtml ?? ''),
  'found /regions/:slug href');
const countryDirCards = countOccurrences(regionsHtml, 'browse-dir-card');
check('/regions country directory renders entries',
  countryDirCards >= MIN_DISTINCT_FILTERS,
  `only ${countryDirCards} directory cards`);
// Keep a dish-density floor via baked dish name links or counts.
const regionDishHints =
  countOccurrences(regionsHtml, ' dishes') + countOccurrences(regionsHtml, '/dishes/');
check('/regions still surfaces dish context',
  regionDishHints >= MIN_REGION_TILES,
  `weak dish context signals: ${regionDishHints}`);

// ─── 5. /families is a directory (no first-viewport chip wall) ─────────────
check('/families does NOT use legacy chip wall',
  !(familiesHtml ?? '').includes('id="family-chips"'),
  'found id="family-chips"');
check('/families links to /family/:slug detail',
  /href="\/family\/[^"]+"/.test(familiesHtml ?? ''),
  'missing /family/:slug links');
const familyDirCards = countOccurrences(familiesHtml, 'browse-dir-card');
check('/families directory renders entries',
  familyDirCards >= MIN_DISTINCT_FILTERS,
  `only ${familyDirCards} family cards`);

// ─── 7. /lineages keeps cards + confidence + detail links ──────────────────
const lineageCards = countOccurrences(lineagesHtml, 'lin-card');
check('/lineages renders lineage cards',
  lineageCards >= MIN_DISTINCT_FILTERS,
  `only ${lineageCards} lineage cards`);
check('/lineages links to /lineages/:slug',
  /href="\/lineages\/[^"]+"/.test(lineagesHtml ?? ''),
  'missing lineage detail links');
check('/lineages keeps confidence labels',
  /Documented|Likely related|Possible influence|Uncertain|Parallel evolution/.test(lineagesHtml ?? ''),
  'confidence labels missing');

// ─── 8. Taxonomy isolation: no cross-contamination of filter axes ──────────
check('/families does not use lineage/region filter state',
  !/data-region=|data-lineage=/.test(familiesHtml ?? ''),
  'families page references another taxonomy\'s data-* filter');
check('/regions does not use family/lineage filter state',
  !/data-family=|data-lineage=/.test(regionsHtml ?? ''),
  'regions page references another taxonomy\'s data-* filter');

// ─── 9. Representative /family/:slug pages ─────────────────────────────────
const dumplingFamilyPath = `${DIST}family/dumpling/index.html`;
check('/family/dumpling/ exists', await exists(dumplingFamilyPath), dumplingFamilyPath);

const lateFamilyPath = `${DIST}family/${LATE_PAGE_FAMILY_SLUG}/index.html`;
check('/family/late-page-family/ exists (pagination fixture)',
  await exists(lateFamilyPath), lateFamilyPath);

// ─── 10. Domain identity baked at Astro render (PUBLIC_DOMAIN) ─────────────
const homeHtml = await read(`${DIST}index.html`);
const notFoundHtml = await read(`${DIST}404.html`);
const navHtml = homeHtml ?? regionsHtml ?? '';
if (DOMAIN === 'geo') {
  check('Atlas build identifies as Atlas',
    />Atlas</.test(navHtml) && /data-domain="geo"/.test(navHtml),
    'expected Atlas wordmark + data-domain="geo"');
  check('Atlas build does not claim Recipes as active brand',
    !/<span class="sub">Recipes<\/span>/.test(navHtml),
    'found Recipes sub-brand on geo build');
  check('404 identifies as Atlas',
    /Gustale Atlas/.test(notFoundHtml ?? ''),
    'expected "Gustale Atlas" on geo 404');
} else {
  check('Recipes build identifies as Recipes',
    />Recipes</.test(navHtml) && /data-domain="recipes"/.test(navHtml),
    'expected Recipes wordmark + data-domain="recipes"');
  check('Recipes build does not claim Atlas as active brand',
    !/<span class="sub">Atlas<\/span>/.test(navHtml),
    'found Atlas sub-brand on recipes build');
  check('404 identifies as Recipes',
    /Gustale Recipes/.test(notFoundHtml ?? ''),
    'expected "Gustale Recipes" on recipes 404');
}

// Unset/default PUBLIC_DOMAIN must resolve to recipes (404, Nav, helpers).
check('unset PUBLIC_DOMAIN resolves to recipes',
  resolveGustaleDomain(undefined) === 'recipes'
    && resolveGustaleDomain(null) === 'recipes'
    && resolveGustaleDomain('') === 'recipes'
    && resolveGustaleDomain('recipes') === 'recipes',
  'expected recipes default');
check('PUBLIC_DOMAIN=geo resolves to geo',
  resolveGustaleDomain('geo') === 'geo');

// ─── 11. Post-build route ownership ────────────────────────────────────────
const newDishExists = await exists(`${DIST}dishes/new/index.html`)
  || await exists(`${DIST}dishes/new.html`);
const ingredientsExists = await exists(`${DIST}ingredients`);
const mapExists = await exists(`${DIST}map/index.html`) || await exists(`${DIST}map.html`);

if (DOMAIN === 'geo') {
  check('geo removes /dishes/new', !newDishExists, 'dishes/new still present');
  check('geo removes /ingredients', !ingredientsExists, 'ingredients/ still present');
  check('geo keeps /map', mapExists, 'map/ missing from geo dist');
} else {
  check('recipes retains /dishes/new', newDishExists, 'dishes/new missing');
  check('recipes retains /ingredients', ingredientsExists, 'ingredients/ missing');
  check('recipes removes /map', !mapExists, 'map/ still present on recipes');
}

// ─── 12. Atlas must not point authoring CTAs at removed local routes ───────
// Scan baked HTML for relative authoring hrefs that geo post-build deletes.
if (DOMAIN === 'geo') {
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
  check('Atlas CTAs do not use removed local authoring routes',
    badLocalAuthoring.length === 0,
    badLocalAuthoring.slice(0, 8).join(', '));
}

// ─── 13. Family fallback pagination (late-page fixture via mock) ───────────
// Requires PUBLIC_API_BASE (set during CI/local mock builds). Proves a family
// that only appears after offset>=100 is discovered by offset paging, and that
// limit>100 is clamped (never silently omit post-first-page families).
if (API_BASE) {
  try {
    const fixtureFetch = (url, init = {}) =>
      fetch(url, {
        ...init,
        headers: {
          ...(init.headers ?? {}),
          'X-Gustale-Fixture': 'pagination',
        },
      });

    const page0Res = await fixtureFetch(
      `${API_BASE}/api/dishes?status=published&limit=${DISH_LIST_PAGE_LIMIT}&offset=0`,
    );
    const page0 = page0Res.ok ? await page0Res.json() : { dishes: [] };
    const page0HasLate = (page0.dishes ?? []).some(
      (d) => d.familySlug === LATE_PAGE_FAMILY_SLUG,
    );
    check('pagination fixture: late family absent from first page',
      !page0HasLate,
      'late-page-family unexpectedly on offset=0');

    const page1Res = await fixtureFetch(
      `${API_BASE}/api/dishes?status=published&limit=${DISH_LIST_PAGE_LIMIT}&offset=${DISH_LIST_PAGE_LIMIT}`,
    );
    const page1 = page1Res.ok ? await page1Res.json() : { dishes: [] };
    const page1HasLate = (page1.dishes ?? []).some(
      (d) => d.familySlug === LATE_PAGE_FAMILY_SLUG,
    );
    check('pagination fixture: late family present on second page',
      page1HasLate,
      'late-page-family missing at offset=100');

    // Oversized limit must clamp to 100 (API contract) — still not enough
    // to reach the late family in a single request.
    const bigRes = await fixtureFetch(
      `${API_BASE}/api/dishes?status=published&limit=500&offset=0`,
    );
    const big = bigRes.ok ? await bigRes.json() : { dishes: [], limit: 0 };
    check('pagination fixture: limit=500 clamps to 100',
      big.limit === 100 && (big.dishes ?? []).length <= 100,
      `limit=${big.limit} len=${(big.dishes ?? []).length}`);
    check('pagination fixture: clamped page still omits late family',
      !(big.dishes ?? []).some((d) => d.familySlug === LATE_PAGE_FAMILY_SLUG),
      'late family visible without paging — fixture broken');

    const collected = await collectFamiliesFromPublishedDishes(API_BASE, fixtureFetch);
    check('family fallback pagination discovers late-page family',
      collected.some((c) => c.slug === LATE_PAGE_FAMILY_SLUG),
      `families found: ${collected.map((c) => c.slug).slice(0, 12).join(', ')}`);
  } catch (err) {
    check('family fallback pagination checks ran', false, String(err));
  }
} else {
  console.warn('[validate-build] PUBLIC_API_BASE unset — skipping live pagination fixture checks');
}

// ─── 14. U0-B navigation / search invariants ───────────────────────────────
const webRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
try {
  await access(join(webRoot, 'src/components/SiteHeader.astro'));
  check('SiteHeader.astro remains absent', false, 'SiteHeader.astro unexpectedly exists');
} catch {
  check('SiteHeader.astro remains absent', true);
}
check('Nav.astro remains canonical source',
  await exists(join(webRoot, 'src/components/Nav.astro')));

check('mobile search control present',
  /id="nav-mobile-search"/.test(navHtml),
  'missing #nav-mobile-search');
check('mobile menu control present',
  /id="nav-mobile-toggle"/.test(navHtml),
  'missing #nav-mobile-toggle');
check('mobile panel is a modal dialog',
  /id="nav-mobile-panel"[\s\S]*?role="dialog"/.test(navHtml)
    || /role="dialog"[\s\S]*?id="nav-mobile-panel"/.test(navHtml),
  'nav-mobile-panel missing role=dialog');

// No ambiguous duplicate public Contribute CTA in the header/drawer.
check('public nav does not include Contribute CTA',
  !/gst-nav-contribute/.test(navHtml)
    && !/>Contribute<\/a>/.test(navHtml),
  'found Contribute CTA in baked nav');

check('Add a dish CTA matches domain helper',
  navHtml.includes(`href="${addDishHref(resolveGustaleDomain(DOMAIN))}"`),
  `expected href=${addDishHref(resolveGustaleDomain(DOMAIN))}`);

// Static aria-current on taxonomy pages (no client JS required).
if (DOMAIN === 'geo') {
  check('static aria-current on Countries for /regions',
    /href="\/regions"[^>]*aria-current="page"/.test(regionsHtml ?? '')
      || /aria-current="page"[^>]*href="\/regions"/.test(regionsHtml ?? ''),
    'Countries link missing aria-current=page on /regions');
  const dumplingHtml = await read(dumplingFamilyPath);
  check('static aria-current on Food families for /family/:slug',
    /href="\/families"[^>]*aria-current="page"/.test(dumplingHtml ?? '')
      || /aria-current="page"[^>]*href="\/families"/.test(dumplingHtml ?? ''),
    'Food families missing aria-current on /family/dumpling');
} else {
  const dishesHtml = await read(`${DIST}dishes/index.html`);
  check('static aria-current on Recipes for /dishes',
    /href="\/dishes"[^>]*aria-current="page"/.test(dishesHtml ?? '')
      || /aria-current="page"[^>]*href="\/dishes"/.test(dishesHtml ?? ''),
    'Recipes link missing aria-current=page on /dishes');
}

check('both absolute property-switch destinations present',
  countOccurrences(navHtml, 'href="https://gustale.com/"') >= 1
    && countOccurrences(navHtml, 'href="https://gustale.recipes/"') >= 1);

// Helper parity: Atlas see-all + fallbacks never emit local /dishes or /ingredients.
const atlasSeeAll = seeAllDishesHref('test query', 'geo');
check('Atlas see-all URL is absolute Recipes dishes',
  atlasSeeAll === 'https://gustale.recipes/dishes?q=test%20query');
const atlasHelp = searchHelpLinks('geo');
const atlasErr = searchErrorBrowseLinks('geo');
check('Atlas help links omit local recipes-only paths',
  atlasHelp.every((l) => l.href !== '/dishes' && !l.href.startsWith('/ingredients')));
check('Atlas error fallback includes Food families + Browse recipes',
  atlasErr.some((l) => l.href === '/families')
    && atlasErr.some((l) => l.href === 'https://gustale.recipes/dishes'));

check('primary-nav match: /family/:slug → Food families',
  isPrimaryNavActive('/families', '/family/dumpling/', 'geo') === true);
check('primary-nav match: /dishes/:slug → Recipes (recipes build)',
  isPrimaryNavActive('/dishes', '/dishes/vindaloo/', 'recipes') === true);

// ─── Report ─────────────────────────────────────────────────────────────────
console.log(`\n[validate-build] domain=${DOMAIN} — ${passes.length} passed, ${failures.length} failed`);
for (const p of passes) console.log(`  ✓ ${p}`);
for (const f of failures) console.error(`  ✗ ${f}`);

if (failures.length > 0) {
  console.error(`\n[validate-build] FAILED: ${failures.length} check(s) did not pass.`);
  process.exit(1);
}
console.log('[validate-build] all taxonomy + domain checks passed.\n');
