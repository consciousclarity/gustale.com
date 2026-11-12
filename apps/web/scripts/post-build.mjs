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
 *     (we currently have 60 seeded dishes). 20 is a conservative floor
 *     that catches catastrophic partial builds (we saw 1 dish survive
 *     a flaky run) without false-positives on future schema changes.
 *   - Empty parent directories left behind after pruning are also
 *     removed, so requests to e.g. /dishes/new/ on the geo domain get
 *     a clean 404 from nginx rather than a 403 from autoindex.
 */
import {
  readdir,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const DIST = fileURLToPath(new URL("../dist/", import.meta.url));
// The repo root, so the sitemap generator can be run from the build.
const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
const DOMAIN = process.env.PUBLIC_DOMAIN ?? "recipes";

// Floor: we have 31 seeded dishes. Anything <20 is almost certainly
// a partial build (stale cache, flaky incremental, etc.). Bump this
// if seed-data.ts grows.
const MIN_EXPECTED_DISHES = 20;

// A SCOPED build has its own floor.
//
// The floor of 20 exists to catch a PARTIAL build: a build that
// produced only a few dish pages because it was interrupted, or
// because the API only answered once, must never be pruned and
// shipped. That is a real and valuable guard.
//
// But a SCOPED build -- the staging environment -- is partial ON
// PURPOSE. It covers PUBLIC_BUILD_DISH_LIMIT dishes, and if that
// limit is below the floor, the floor would refuse a perfectly good
// build.
//
// So when a scope is set, the floor becomes the scope's own limit
// (minus a small tolerance for the non-dish directories that live
// under dist/dishes/ alongside the dishes). Without this, the
// staging build fails at the post-build step with a message about a
// "partial or stale build" when nothing is wrong.
//
// The production build is unaffected: no scope, so the floor stays 20.
const SCOPED_DISH_LIMIT = (() => {
  const raw = process.env.PUBLIC_BUILD_DISH_LIMIT;
  if (!raw || !raw.trim()) return null;
  const n = Number.parseInt(raw.trim(), 10);
  return Number.isFinite(n) && n > 0 ? n : null;
})();

// The floor for a scoped build.
//
// It CANNOT be the limit. The limit is a CEILING on what the build
// covers -- the staging database holds 7 dishes while the limit is
// 50 -- so a floor derived from the limit refuses a perfectly good
// build.
//
// The floor must be a FLOOR: the smallest number of dish directories
// that still means "the build worked". The guard's real job is
// catching an INTERRUPTED build -- one that produced a handful of
// pages out of thousands.
//
// So for a scoped build the floor is derived from what the build was
// SUPPOSED to produce: the smaller of the scope limit and the number
// of published dishes the API reports. The second one is what makes
// it correct -- the staging database has 7 dishes, so the build can
// produce 7 pages and it did, and a floor of 48 called that a
// partial build.
//
// The API count is read from PUBLIC_API_BASE, which the build already
// used. When there is no reachable API -- a mock build, or a build
// with no API configured -- the limit is used and the floor is a
// quarter of it, which is still a floor rather than a ceiling.
//
// The production floor is unchanged: without a scope, it is 20.
/**
 * How many published dishes the API reports.
 *
 * This is what a build can legitimately produce: it fetches exactly
 * the published dishes. The staging database holds 7, so a staging
 * build produces 7 dish pages, and a floor derived from the SCOPE
 * LIMIT (50) would call that a partial build.
 *
 * Returns null when there is no reachable API -- a mock build, or a
 * build with no API configured. The caller then falls back to a
 * fraction of the limit.
 */
async function apiDishCount() {
  const apiBase = process.env.PUBLIC_API_BASE;
  if (!apiBase || !apiBase.startsWith("http")) return null;
  try {
    const res = await fetch(`${apiBase}/api/dishes?limit=1`, {
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return null;
    const json = await res.json();
    const total = Number(json?.total);
    return Number.isFinite(total) && total > 0 ? total : null;
  } catch {
    return null;
  }
}

const SCOPED_FLOOR =
  SCOPED_DISH_LIMIT !== null
    ? Math.max(1, Math.floor(SCOPED_DISH_LIMIT / 4))
    : MIN_EXPECTED_DISHES;

// `astro build`, only moussaka-greek ships in the dist. Setting
// ALLOW_PARTIAL=1 lets you run the post-build anyway for manual
// experimentation. CI MUST NOT set this.
const ALLOW_PARTIAL = process.env.ALLOW_PARTIAL === "1";

// Routes that exist on ONE domain only. Each is a path relative to /.
const GEO_ONLY = ["map/"];
const RECIPES_ONLY = []; // All shared pages are now on both domains

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
  while (current && current !== stop && current !== "/" && current !== ".") {
    if (!(await exists(current))) {
      current = join(current, "..");
      continue;
    }
    const entries = await readdir(current);
    if (entries.length > 0) break;
    await rm(current, { recursive: true, force: true });
    current = join(current, "..");
  }
}

// ─── Completeness check ────────────────────────────────────────────────────
// Refuse to prune anything if the dist looks partial. We compare the
// count of <slug> directories under dist/dishes/ against the floor.
// If the build is partial, the floor catches it BEFORE we delete the
// few surviving pages and end up with a near-empty dist.
const dishDirs = await listDirs(join(DIST, "dishes"));

// The effective floor.
//
// For a scoped build it is the smaller of the scope limit and what
// the API reports -- because the build fetches exactly the published
// dishes, so THAT is the most the dist can legitimately contain. A
// staging build of 7 dishes against a limit of 50 is working
// correctly, not partially.
//
// Without a scope the floor is the production floor of 20, unchanged.
let effectiveFloor = MIN_EXPECTED_DISHES;
if (SCOPED_DISH_LIMIT !== null) {
  const apiTotal = await apiDishCount();
  if (apiTotal !== null) {
    // The tolerance: dist/dishes/ also holds the filter-kind parents
    // (category/, region/, technique/) and the reserved route
    // directories, which are not dishes.
    effectiveFloor = Math.max(1, Math.min(SCOPED_DISH_LIMIT, apiTotal));
    console.log(
      `[post-build] a scoped build: the API reports ${apiTotal} published dishes, ` +
        `the scope limit is ${SCOPED_DISH_LIMIT}, so the completeness floor is ${effectiveFloor}`,
    );
  } else {
    effectiveFloor = SCOPED_FLOOR;
    console.log(
      `[post-build] a scoped build (PUBLIC_BUILD_DISH_LIMIT=${SCOPED_DISH_LIMIT}): ` +
        `no API count available, so the completeness floor is ${effectiveFloor}`,
    );
  }
}

if (dishDirs.length < effectiveFloor) {
  if (ALLOW_PARTIAL) {
    console.warn(
      `[post-build] WARNING: dist/dishes/ has only ${dishDirs.length} ` +
        `directories (expected ≥${effectiveFloor}). ALLOW_PARTIAL=1 ` +
        `is set, so proceeding with pruning anyway. Do not deploy this dist.`,
    );
  } else {
    console.error(
      `[post-build] REFUSING to prune — dist/dishes/ has ${dishDirs.length} ` +
        `directories (expected ≥${effectiveFloor}). This looks like a ` +
        `partial or stale build. Re-run a clean astro build (e.g. ` +
        `"rm -rf dist .astro && astro build") before post-processing, ` +
        `or set ALLOW_PARTIAL=1 if you really mean to ship a partial dist.`,
    );
    process.exit(1);
  }
} else {
  console.log(
    `[post-build] dist looks complete: ${dishDirs.length} dishes found. ` +
      `Proceeding with ${DOMAIN} domain filter.`,
  );
}

// ─── Per-domain pruning ────────────────────────────────────────────────────
let removed = 0;

// Always-on: drop pages only relevant to the OTHER domain.
// Which paths to drop.
//
// The geo domain keeps /map and drops the recipes-only routes; the
// recipes domain does the opposite.
//
// The STAGING domain is the recipes site -- it is the same code, on
// another host -- so it drops the GEO_ONLY paths exactly as the
// recipes domain does. Without this, a staging build kept /map and
// the validate-build check ("recipes removes /map") failed on a
// build that was actually correct.
const isGeoLike = DOMAIN === "geo";
const drop = isGeoLike ? RECIPES_ONLY : GEO_ONLY;
for (const target of drop) {
  const full = join(DIST, target);
  if (await rmIfExists(full)) {
    console.log(`[post-build] removed ${target} (not in ${DOMAIN} domain)`);
    removed++;
  }
}

// Domain-specific: walk the dishes tree to keep <slug>/index.html
// (single dish view, on both domains) but drop <slug>/edit/ and new/.
if (DOMAIN === "geo") {
  // Drop /dishes/<slug>/edit/ for every slug + /dishes/new/ entirely.
  for (const slug of dishDirs) {
    const editDir = join(DIST, "dishes", slug, "edit");
    if (await rmIfExists(editDir)) {
      console.log(`[post-build] removed dishes/${slug}/edit/`);
      removed++;
      await pruneEmptyParents(join(DIST, "dishes", slug), join(DIST, "dishes"));
    }
  }
  const newDir = join(DIST, "dishes", "new");
  if (await rmIfExists(newDir)) {
    console.log(`[post-build] removed dishes/new/`);
    removed++;
  }

  // Drop /ingredients/<slug>/ entirely (geo domain has no ingredient pages).
  const ingDir = join(DIST, "ingredients");
  if (await rmIfExists(ingDir)) {
    console.log("[post-build] removed ingredients/");
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
    const slugDir = join(DIST, "dishes", slug);
    const indexFile = join(slugDir, "index.html");
    if (await exists(indexFile)) {
      // Read content, delete the directory, write the flat file.
      const content = await readFile(indexFile);
      // Move to a temp path outside `dishes/` first, then delete the
      // directory, then move the temp file in.
      const tempPath = join(DIST, `.dishes-${slug}.html.tmp`);
      await writeFile(tempPath, content);
      await rm(slugDir, { recursive: true, force: true });
      const flatPath = join(DIST, "dishes", `${slug}.html`);
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
    console.log(
      `[post-build] flattened ${flattened} dish pages to flat /dishes/<slug>.html`,
    );
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

// ─── ADR-003: the per-locale sitemaps ─────────────────────────────────
//
// The ADR: "Sitemap — Per-locale sitemap, referenced from sitemap.xml
// by index."
//
// The sitemaps are generated from the BUILD OUTPUT rather than from
// the database, so they list exactly the pages that exist. A sitemap
// with a 404 in it is worse than no sitemap.
//
// The generator is a Python script at the repo root; it is run from
// here so it runs for every domain variant.
// A MISSING SITEMAP MUST FAIL THE BUILD.
//
// This used to be a catch-and-log. That was a false green: the build
// exited 0, CI went green, the image was built and pushed to ghcr, the
// containers were swapped -- and the site was left with NO sitemap at
// all. The only trace was a line in the build log that nobody reads.
//
// The reasoning behind the old behaviour ("the site still works without
// it") is wrong in the one way that matters: a site with no sitemap
// works, and then silently stops being indexed. Nothing alerts. The
// degradation is invisible until the traffic is gone.
//
// So: the sitemap generation is now a HARD FAILURE. If the generator
// cannot produce the sitemaps, the build does not produce an image.
//
// There is one escape hatch, and it is deliberately hard to hit by
// accident: ALLOW_NO_SITEMAP=1. It exists for the case where someone
// is building the site locally and genuinely does not want to run the
// generator. It prints a loud warning, it is NOT set in CI, and the
// deploy's own sitemap check would catch a missing sitemap anyway.
console.log("[post-build] generating the per-locale sitemaps");
{
  const { execFileSync } = await import("node:child_process");
  try {
    execFileSync(
      "node",
      ["scripts/generate_sitemaps.mjs", "--dist", DIST, "--domain", DOMAIN],
      { cwd: repoRoot, stdio: "inherit" },
    );
  } catch (err) {
    const allowNoSitemap = process.env.ALLOW_NO_SITEMAP === "1";
    if (allowNoSitemap) {
      console.error(
        "[post-build] WARNING: sitemap generation FAILED, but " +
          "ALLOW_NO_SITEMAP=1 is set. The build will ship WITHOUT a " +
          "sitemap. Do not deploy this image.",
        err.message,
      );
    } else {
      console.error(
        "[post-build] sitemap generation FAILED — refusing to build an " +
          "image with no sitemap. Set ALLOW_NO_SITEMAP=1 only for local " +
          "experiments; CI must never set it.",
        err.message,
      );
      process.exit(1);
    }
  }
}

console.log(`[post-build] domain=${DOMAIN}, removed ${removed} paths`);
