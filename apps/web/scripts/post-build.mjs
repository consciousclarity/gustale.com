#!/usr/bin/env node
/**
 * Post-build filter for Astro static output.
 *
 * The Astro build emits every page in src/pages/. We have two domains
 * that share most pages but differ on a few:
 *
 *   - gustale.recipes (encyclopedia): keeps /dishes, /ingredients,
 *     /dishes/new, /dishes/<slug>/edit. Drops /map.
 *   - gustale.com (geo/map): keeps /map. Drops /dishes list, /ingredients,
 *     /dishes/new, /dishes/<slug>/edit.
 *
 * Pages kept on BOTH domains:
 *   - /, /about, /login, /register, /account
 *   - /dishes/<slug> (single dish view)
 *   - /404
 *
 * PUBLIC_DOMAIN env var picks which subset to keep. Defaults to
 * "recipes" (the encyclopedia domain) when unset, since that's the
 * more conservative choice.
 *
 * Run after `astro build`:
 *   PUBLIC_DOMAIN=recipes node scripts/post-build.mjs
 *   PUBLIC_DOMAIN=geo     node scripts/post-build.mjs
 */
import { readdir, rm, stat } from 'node:fs/promises';
import { join, relative } from 'node:path';

const DIST = new URL('../dist/', import.meta.url).pathname;
const DOMAIN = process.env.PUBLIC_DOMAIN ?? 'recipes';

// Routes that exist on ONE domain only. Each is a path relative to /.
const GEO_ONLY = ['map/'];
const RECIPES_ONLY = [
  'dishes/index.html',  // /dishes/ list
  'ingredients/',        // /ingredients/<slug>/ per slug
];

async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function rmIfExists(path) {
  if (await exists(path)) {
    await rm(path, { recursive: true, force: true });
    return true;
  }
  return false;
}

async function walk(dir, visitor) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = join(dir, e.name);
    if (e.isDirectory()) {
      await walk(full, visitor);
    } else {
      await visitor(full);
    }
  }
}

const drop = DOMAIN === 'recipes' ? GEO_ONLY : RECIPES_ONLY;

let removed = 0;
for (const target of drop) {
  const full = join(DIST, target);
  if (await rmIfExists(full)) {
    console.log(`[post-build] removed ${target} (not in ${DOMAIN} domain)`);
    removed++;
  }
}

// Also scrub any per-slug directories for ingredients on geo domain
if (DOMAIN === 'geo') {
  // /ingredients/<slug>/index.html — each slug has its own dir
  const ingDir = join(DIST, 'ingredients');
  if (await exists(ingDir)) {
    await rm(ingDir, { recursive: true, force: true });
    console.log(`[post-build] removed ingredients/ (not in geo domain)`);
    removed++;
  }

  // /dishes/new/ and /dishes/<slug>/edit/
  const dishesDir = join(DIST, 'dishes');
  if (await exists(dishesDir)) {
    await walk(dishesDir, async (full) => {
      const rel = relative(dishesDir, full);
      // Keep index.html (the list) and <slug>/index.html (single dish).
      // Drop <slug>/edit/ and new/.
      if (rel.endsWith('/edit/index.html') || rel === 'new/index.html') {
        await rm(full, { force: true });
        const dir = full.replace(/\/index\.html$/, '');
        if (await exists(dir)) {
          // remove the directory only if it's empty after the file removal
          const remaining = await readdir(dir);
          if (remaining.length === 0) await rm(dir, { recursive: true, force: true });
        }
        console.log(`[post-build] removed dishes/${rel}`);
        removed++;
      }
    });
    // After removing edit/new, the dishes index.html is the list — drop it too.
    const dishesIndex = join(dishesDir, 'index.html');
    if (await rmIfExists(dishesIndex)) {
      console.log('[post-build] removed dishes/index.html (list page not in geo domain)');
      removed++;
    }
  }
}

console.log(`[post-build] domain=${DOMAIN}, removed ${removed} paths`);