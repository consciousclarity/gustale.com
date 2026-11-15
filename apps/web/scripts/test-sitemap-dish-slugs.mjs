#!/usr/bin/env node
/**
 * The sitemap's dish-slug collection must not mistake a FILTER-KIND
 * PARENT directory for a dish.
 *
 * THE BUG
 * -------
 * `collectDishSlugs()` in scripts/generate_sitemaps.mjs scans
 * `dist/dishes/` and treats every subdirectory as a dish slug. WP-01b
 * added the static filtered pages at `/dishes/<kind>/<slug>/`, so the
 * build output now contains:
 *
 *     dist/dishes/category/indonesian-cuisine/index.html
 *     dist/dishes/region/indonesia/index.html
 *     dist/dishes/technique/curry/index.html
 *
 * The three PARENT directories were counted as dish slugs, and the
 * sitemap listed three URLs that 404:
 *
 *     /dishes/category   /dishes/region   /dishes/technique
 *
 * A sitemap with a 404 in it is worse than no sitemap -- that is the
 * ADR-003 rule the generator itself exists to enforce.
 *
 * THE FIX
 * -------
 * The parents are detected STRUCTURALLY, not by name: a dish directory
 * contains its own `index.html`, while a filter-kind parent contains
 * only subdirectories. A name list would go stale the next time a
 * filter kind is added; a structural rule cannot.
 *
 * WHAT THIS TEST PROVES
 * ---------------------
 *   1. The filter-kind parents are EXCLUDED from the dish slugs.
 *   2. The real dish directories are KEPT.
 *   3. A dish whose slug happens to be "region" would still be kept
 *      (the rule is structural, not a name blacklist) -- so a future
 *      dish literally named "region" is not silently dropped.
 *   4. The reserved routes ("new", "edit", ...) are still excluded.
 *   5. The GEO build's flattened form (dish.html files, no
 *      directories) still works.
 */
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const HERE = new URL(".", import.meta.url).pathname;
// .../apps/web/scripts/ -> the repo root is three levels up.
const REPO = join(HERE, "..", "..", "..");

let passed = 0;
let failed = 0;

function check(name, condition, detail = "") {
  if (condition) {
    passed++;
    console.log(`  PASS  ${name}`);
  } else {
    failed++;
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

/** Build a fake dist/ and return the collected dish slugs. */
async function collectSlugs(build) {
  const dist = await mkdtemp(join(tmpdir(), "sitemap-slugs-"));
  try {
    await build(dist);
    // Import the generator's helper by running the generator against the
    // fake dist and reading back the dish count it reports.
    const { execFile } = await import("node:child_process");
    const { promisify } = await import("node:util");
    const run = promisify(execFile);
    const { stdout } = await run("node", [
      join(REPO, "scripts", "generate_sitemaps.mjs"),
      "--dist",
      dist,
      "--domain",
      "recipes",
      "--locales",
      "en",
    ]);
    const m = stdout.match(/\[sitemap\] (\d+) dishes/);
    return { count: m ? Number(m[1]) : null, stdout };
  } finally {
    await rm(dist, { recursive: true, force: true });
  }
}

/** A dish page: a directory containing index.html. */
async function dish(dist, slug) {
  const dir = join(dist, "dishes", slug);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "index.html"), "<html></html>");
}

/** A filter-kind parent: a directory containing only subdirectories. */
async function filterParent(dist, kind, slugs) {
  const dir = join(dist, "dishes", kind);
  await mkdir(dir, { recursive: true });
  for (const s of slugs) {
    const sub = join(dir, s);
    await mkdir(sub, { recursive: true });
    await writeFile(join(sub, "index.html"), "<html></html>");
  }
}

console.log("=== the sitemap's dish-slug collection ===\n");

// ── 1. The filter-kind parents are excluded ─────────────────────────
{
  const { count } = await collectSlugs(async (dist) => {
    await dish(dist, "bakso");
    await dish(dist, "rendang");
    await filterParent(dist, "category", ["indonesian-cuisine"]);
    await filterParent(dist, "region", ["indonesia"]);
    await filterParent(dist, "technique", ["curry"]);
  });
  check(
    "the three filter-kind parents are NOT counted as dishes",
    count === 2,
    `expected 2 dishes, the generator reported ${count}`,
  );
}

// ── 2. A dish literally named "region" is still kept ───────────────
// The rule is structural, so a dish whose slug collides with a filter
// kind name is not silently dropped. This is what a name blacklist
// would get wrong.
{
  const { count } = await collectSlugs(async (dist) => {
    await dish(dist, "region"); // a real dish whose slug is "region"
    await dish(dist, "bakso");
  });
  check(
    'a dish whose slug is "region" is still counted (the rule is structural)',
    count === 2,
    `expected 2 dishes, the generator reported ${count}`,
  );
}

// ── 3. The reserved routes are still excluded ───────────────────────
{
  const { count } = await collectSlugs(async (dist) => {
    await dish(dist, "bakso");
    await dish(dist, "new");
    await dish(dist, "edit");
  });
  check(
    'the reserved routes ("new", "edit") are still excluded',
    count === 1,
    `expected 1 dish, the generator reported ${count}`,
  );
}

// ── 4. The geo build's flattened form still works ───────────────────
// The geo build has dist/dishes/<slug>.html, not directories.
{
  const { count } = await collectSlugs(async (dist) => {
    await mkdir(join(dist, "dishes"), { recursive: true });
    for (const s of ["bakso", "rendang", "nasi-goreng"]) {
      await writeFile(join(dist, "dishes", `${s}.html`), "<html></html>");
    }
  });
  check(
    "the geo build's flattened <slug>.html form still works",
    count === 3,
    `expected 3 dishes, the generator reported ${count}`,
  );
}

// ── 5. A filter parent that ALSO has an index.html is a dish ───────
// If a filter-kind parent ever grows its own index.html it becomes a
// real page, and the structural rule must treat it as one.
{
  const { count } = await collectSlugs(async (dist) => {
    await dish(dist, "bakso");
    await filterParent(dist, "region", ["indonesia"]);
    await writeFile(
      join(dist, "dishes", "region", "index.html"),
      "<html></html>",
    );
  });
  check(
    "a filter parent with its own index.html is counted as a page",
    count === 2,
    `expected 2 dishes, the generator reported ${count}`,
  );
}

console.log(`\n=== ${passed} passed, ${failed} failed ===`);
process.exit(failed === 0 ? 0 : 1);
