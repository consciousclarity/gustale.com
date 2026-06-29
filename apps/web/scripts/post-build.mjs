#!/usr/bin/env node
/**
 * Post-build filter for Astro static output.
 *
 * The Astro build emits every page in src/pages/. We have two domains
 * that share most pages but differ on a few:
 *
 *   - gustale.recipes (encyclopedia): keeps /dishes, /ingredients,
 *     /dishes/new, /dishes/<slug>/edit. Drops /map.
 *   - gustale.com (geo/map): keeps /map, /dishes list. Drops /ingredients,
 *     /dishes/new, /dishes/<slug>/edit.
 *
 * Pages kept on BOTH domains:
 *   - /, /about, /login, /register, /account
 *   - /dashboard          (contributor dashboard — contributor auth is
 *                         domain-agnostic: same roles exist on recipes
 *                         and geo, so the shell ships on both)
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
 *
 * Defensive behaviour:
 *   - If the dist looks incomplete (e.g. astro build was incremental and
 *     produced only a subset of pages), the script REFUSES to delete
 *     anything and exits non-zero, so the CI fails loudly instead of
 *     shipping a partial dist that breaks the live site.
 *   - The "completeness" check is: dist/dishes/ must contain ≥20 entries
 *     (we currently have 31 seeded dishes). 20 is a conservative floor
 *     that catches catastrophic partial builds (we saw 1 dish survive
 *     a flaky run) without false-positives on future schema changes.
 *   - Empty parent directories left behind after pruning are also
 *     removed, so requests to e.g. /dishes/new/ on the geo domain get
 *     a clean 404 from nginx rather than a 403 from autoindex.
 */
import { readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const DIST = new URL('../dist/', import.meta.url).pathname;
const DOMAIN = process.env.PUBLIC_DOMAIN ?? 'recipes';

// Floor: we have 31 seeded dishes. Anything <20 is almost certainly
// a partial build (stale cache, flaky incremental, etc.). Bump this
// if seed-data.ts grows.
const MIN_EXPECTED_DISHES = 20;

// Escape hatch for local dev: if the API isn't reachable during
// `astro build`, only moussaka-greek ships in the dist. Setting
// ALLOW_PARTIAL=1 lets you run the post-build anyway for manual
// experimentation. CI MUST NOT set this.
const ALLOW_PARTIAL = process.env.ALLOW_PARTIAL === '1';

// Routes that exist on ONE domain only. Each is a path relative to /.
const GEO_ONLY = ['map/'];
const RECIPES_ONLY = [];  // All shared pages are now on both domains

async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function listDirs(parent) {
  if (!(await exists(parent))) return [];
  const entries = await readdir(parent, { withFileTypes: true });
  return entries.filter((e) => e.isDirectory()).map((e) => e.name);
}

async function rmIfExists(path) {
  if (await exists(path)) {
    await rm(path, { recursive: true, force: true });
    return true;
  }
  return false;
}

/**
 * Remove an empty directory tree. Walks upward from `dir`, removing
 * any directory that has no entries left after `dir` itself is gone.
 * Stops at `stop` (exclusive).
 */
async function pruneEmptyParents(dir, stop) {
  let current = dir;
  while (current && current !== stop && current !== '/' && current !== '.') {
    if (!(await exists(current))) {
      current = join(current, '..');
      continue;
    }
    const entries = await readdir(current);
    if (entries.length > 0) break;
    await rm(current, { recursive: true, force: true });
    current = join(current, '..');
  }
}

// ─── Completeness check ────────────────────────────────────────────────────
// Refuse to prune anything if the dist looks partial. We compare the
// count of <slug> directories under dist/dishes/ against the floor.
// If the build is partial, the floor catches it BEFORE we delete the
// few surviving pages and end up with a near-empty dist.
const dishDirs = await listDirs(join(DIST, 'dishes'));
if (dishDirs.length < MIN_EXPECTED_DISHES) {
  if (ALLOW_PARTIAL) {
    console.warn(
      `[post-build] WARNING: dist/dishes/ has only ${dishDirs.length} ` +
      `directories (expected ≥${MIN_EXPECTED_DISHES}). ALLOW_PARTIAL=1 ` +
      `is set, so proceeding with pruning anyway. Do not deploy this dist.`
    );
  } else {
    console.error(
      `[post-build] REFUSING to prune — dist/dishes/ has ${dishDirs.length} ` +
      `directories (expected ≥${MIN_EXPECTED_DISHES}). This looks like a ` +
      `partial or stale build. Re-run a clean astro build (e.g. ` +
      `"rm -rf dist .astro && astro build") before post-processing, ` +
      `or set ALLOW_PARTIAL=1 if you really mean to ship a partial dist.`
    );
    process.exit(1);
  }
} else {
  console.log(
    `[post-build] dist looks complete: ${dishDirs.length} dishes found. ` +
    `Proceeding with ${DOMAIN} domain filter.`
  );
}

// ─── Per-domain pruning ────────────────────────────────────────────────────
let removed = 0;

// Always-on: drop pages only relevant to the OTHER domain.
const drop = DOMAIN === 'recipes' ? GEO_ONLY : RECIPES_ONLY;
for (const target of drop) {
  const full = join(DIST, target);
  if (await rmIfExists(full)) {
    console.log(`[post-build] removed ${target} (not in ${DOMAIN} domain)`);
    removed++;
  }
}

// Domain-specific: walk the dishes tree to keep <slug>/index.html
// (single dish view, on both domains) but drop <slug>/edit/ and new/.
if (DOMAIN === 'geo') {
  // Drop /dishes/<slug>/edit/ for every slug + /dishes/new/ entirely.
  for (const slug of dishDirs) {
    const editDir = join(DIST, 'dishes', slug, 'edit');
    if (await rmIfExists(editDir)) {
      console.log(`[post-build] removed dishes/${slug}/edit/`);
      removed++;
      await pruneEmptyParents(
        join(DIST, 'dishes', slug),
        join(DIST, 'dishes'),
      );
    }
  }
  const newDir = join(DIST, 'dishes', 'new');
  if (await rmIfExists(newDir)) {
    console.log(`[post-build] removed dishes/new/`);
    removed++;
  }

  // Drop /ingredients/<slug>/ entirely (geo domain has no ingredient pages).
  const ingDir = join(DIST, 'ingredients');
  if (await rmIfExists(ingDir)) {
    console.log('[post-build] removed ingredients/');
    removed++;
  }

  // Flatten /dishes/<slug>/index.html → /dishes/<slug>.html on the geo
  // domain. The dist/dishes/ directory now contains both the list page
  // (index.html) and flat <slug>.html files for each dish. This hybrid
  // layout lets the geo domain serve both the /dishes/ list page and
  // individual dish detail pages at /dishes/<slug>.
  //
  // nginx.conf has rewrite rules for `^/dishes/([^/]+)/?$` that map
  // `/dishes/<slug>` to the flat `.html` file while /dishes/ (with
  // trailing slash) resolves to index.html via the standard try_files.
  // On gustale.recipes this transformation does NOT run, so the nested
  // `dist/dishes/<slug>/index.html` structure is preserved and `/dishes/`
  // continues to serve the list page from the directory index.
  let flattened = 0;
  for (const slug of dishDirs) {
    const slugDir = join(DIST, 'dishes', slug);
    const indexFile = join(slugDir, 'index.html');
    if (await exists(indexFile)) {
      // Read content, delete the directory, write the flat file.
      const content = await readFile(indexFile);
      // Move to a temp path outside `dishes/` first, then delete the
      // directory, then move the temp file in.
      const tempPath = join(DIST, `.dishes-${slug}.html.tmp`);
      await writeFile(tempPath, content);
      await rm(slugDir, { recursive: true, force: true });
      const flatPath = join(DIST, 'dishes', `${slug}.html`);
      await rename(tempPath, flatPath);
      flattened++;
    } else {
      // No index.html in this slug dir (shouldn't happen for valid slugs
      // but be defensive). Just remove the empty dir.
      await rm(slugDir, { recursive: true, force: true });
    }
  }

  // Now dist/dishes/ is either empty (if all slugs had their own dir and
  // we removed them) or contains only flat <slug>.html files. Either way
  // we can remove the parent and recreate it fresh, OR just leave it.
  // If we leave it, /dishes/ will still 404 because there's no index.html
  // and nginx's `index` directive can't find one. If we remove it entirely,
  // /dishes/ will 404 via the standard try_files chain (the dir doesn't
  // exist as a file or dir).
  //
  // We prefer to leave the directory (with just flat files inside) so that
  // nginx's rewrite rules still have a consistent `dist/dishes/` prefix to
  // work with. The /dishes/ 404 happens via nginx's missing index.html →
  // 404.html fallback.

  if (flattened > 0) {
    console.log(`[post-build] flattened ${flattened} dish pages to flat /dishes/<slug>.html`);
    removed += flattened;
  }
}

// Recipes domain keeps dishes + ingredients, just drops /map.
// (Already handled above via RECIPES_ONLY.)

// ─── Final cleanup: prune empty parent dirs at dist root ──────────────────
// Catches anything left over (e.g. dist/dishes/ if every slug had its
// edit/ removed and the list page was also dropped — though we always
// keep the list on recipes, this is just defensive).
const rootEntries = await readdir(DIST, { withFileTypes: true });
for (const e of rootEntries) {
  if (!e.isDirectory()) continue;
  const sub = join(DIST, e.name);
  const remaining = await readdir(sub);
  if (remaining.length === 0) {
    await rm(sub, { recursive: true, force: true });
    console.log(`[post-build] pruned empty dir ${e.name}/`);
    removed++;
  }
}

console.log(`[post-build] domain=${DOMAIN}, removed ${removed} paths`);