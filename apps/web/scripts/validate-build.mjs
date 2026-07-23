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
import { readFile, stat } from 'node:fs/promises';

const DIST = new URL('../dist/', import.meta.url).pathname;
const DOMAIN = process.env.PUBLIC_DOMAIN ?? 'recipes';

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

// ─── 2. Nav (desktop + mobile) contains "Regions" ──────────────────────────
// The nav renders in every page. Desktop link + mobile drawer link = ≥2
// occurrences of the label, and the href must be present.
const navLabelCount = countOccurrences(regionsHtml, '>Regions<');
check('main navigation contains "Regions"', countOccurrences(regionsHtml, 'href="/regions"') >= 1,
  'no href="/regions" in nav');
check('mobile navigation includes "Regions"', navLabelCount >= 2,
  `expected ≥2 "Regions" nav labels (desktop+mobile), found ${navLabelCount}`);

// ─── 3. /regions has real region filters (not collapsed) ───────────────────
const regionFilters = distinctAttr(regionsHtml, 'data-region', ['all']);
check('/regions contains real region filters',
  regionFilters.length >= MIN_DISTINCT_FILTERS,
  `only ${regionFilters.length} distinct region(s): ${regionFilters.slice(0, 8).join(', ')}`);
check('/regions filters are not collapsed to only "All"/"Other"',
  regionFilters.length > 1 && !(regionFilters.length === 1 && regionFilters[0] === 'Other'),
  `regions: ${regionFilters.join(', ') || '(none)'}`);

// ─── 4. Dishes display on /regions ──────────────────────────────────────────
const regionTiles = countOccurrences(regionsHtml, 'class="fam-tile"');
check('dishes display on /regions',
  regionTiles >= MIN_REGION_TILES,
  `only ${regionTiles} dish tiles (expected ≥${MIN_REGION_TILES})`);

// ─── 5. /families has NO region UI anymore ─────────────────────────────────
const familiesHasRegionChips = (familiesHtml ?? '').includes('id="region-chips"');
const familiesHasRegionAttr  = /data-region=/.test(familiesHtml ?? '');
check('/families does NOT contain region filters',
  !familiesHasRegionChips && !familiesHasRegionAttr,
  familiesHasRegionChips ? 'found id="region-chips"' : 'found data-region attribute');

// ─── 6. /families still has real family filters ────────────────────────────
const familyFilters = distinctAttr(familiesHtml, 'data-family', ['all']);
check('family filters still work on /families',
  familyFilters.length >= MIN_DISTINCT_FILTERS,
  `only ${familyFilters.length} distinct famil(ies): ${familyFilters.slice(0, 8).join(', ')}`);

// ─── 7. /lineages still has real lineage filters ───────────────────────────
const lineageFilters = distinctAttr(lineagesHtml, 'data-lineage', ['all', 'other']);
check('lineage filters still work on /lineages',
  lineageFilters.length >= MIN_DISTINCT_FILTERS,
  `only ${lineageFilters.length} distinct lineage(s): ${lineageFilters.slice(0, 8).join(', ')}`);

// ─── 8. Taxonomy isolation: no cross-contamination of filter axes ──────────
check('/families does not use lineage/region filter state',
  !/data-region=|data-lineage=/.test(familiesHtml ?? ''),
  'families page references another taxonomy\'s data-* filter');
check('/regions does not use family/lineage filter state',
  !/data-family=|data-lineage=/.test(regionsHtml ?? ''),
  'regions page references another taxonomy\'s data-* filter');

// ─── 9. Representative /family/:slug pages (SSG from mock /api/categories) ──
const dumplingFamilyPath = `${DIST}family/dumpling/index.html`;
check('/family/dumpling/ exists', await exists(dumplingFamilyPath), dumplingFamilyPath);

// ─── 10. Domain identity baked at Astro render (PUBLIC_DOMAIN) ─────────────
const homeHtml = await read(`${DIST}index.html`);
const navHtml = homeHtml ?? regionsHtml ?? '';
if (DOMAIN === 'geo') {
  check('Atlas build identifies as Atlas',
    />Atlas</.test(navHtml) && /data-domain="geo"/.test(navHtml),
    'expected Atlas wordmark + data-domain="geo"');
  check('Atlas build does not claim Recipes as active brand',
    !/<span class="sub">Recipes<\/span>/.test(navHtml),
    'found Recipes sub-brand on geo build');
} else {
  check('Recipes build identifies as Recipes',
    />Recipes</.test(navHtml) && /data-domain="recipes"/.test(navHtml),
    'expected Recipes wordmark + data-domain="recipes"');
  check('Recipes build does not claim Atlas as active brand',
    !/<span class="sub">Atlas<\/span>/.test(navHtml),
    'found Atlas sub-brand on recipes build');
}

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
    await read(`${DIST}404.html`),
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

// ─── Report ─────────────────────────────────────────────────────────────────
console.log(`\n[validate-build] domain=${DOMAIN} — ${passes.length} passed, ${failures.length} failed`);
for (const p of passes) console.log(`  ✓ ${p}`);
for (const f of failures) console.error(`  ✗ ${f}`);

if (failures.length > 0) {
  console.error(`\n[validate-build] FAILED: ${failures.length} check(s) did not pass.`);
  process.exit(1);
}
console.log('[validate-build] all taxonomy + domain checks passed.\n');
