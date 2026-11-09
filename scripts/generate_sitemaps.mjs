#!/usr/bin/env node
/**
 * Generate the per-locale sitemaps and the sitemap index.
 *
 * ADR-003: "**Sitemap** — **Per-locale** sitemap, referenced from
 * `sitemap.xml` by index."
 *
 * The output is:
 *
 *     sitemap.xml          the index, listing one sitemap per locale
 *     sitemap-en.xml       the English URLs
 *     sitemap-es.xml       the Spanish URLs
 *     ...
 *
 * The URLs are read from the built dist/ directory, so the sitemap lists
 * exactly the pages that exist — no 404s in a sitemap, which is the
 * whole point of generating it from the build output rather than from
 * the database.
 *
 * Each locale's sitemap lists that locale's pages, and every dish entry
 * carries the `xhtml:link` alternates for the other locales, so a
 * search engine that reads them learns the whole locale set from one
 * entry.
 *
 * WHY NODE AND NOT PYTHON: this runs inside the web Docker image
 * (`node:22-slim`), which has no Python. The Python version failed the
 * build with ENOENT.
 *
 * Output: <dist>/sitemap.xml
 *         <dist>/sitemap-<locale>.xml
 */

import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";

// The locales that get a sitemap. English is the base, at the root.
const LOCALES = ["en", "es", "de", "fr", "pt", "id", "zh", "ja", "ar", "hi"];

// The pages that are not dish pages, per locale. The homepage and the
// dish list are in every locale.
const SHARED_PAGES = ["", "dishes/"];

function siteOrigin(domain) {
  return domain === "geo" ? "https://gustale.com" : "https://gustale.recipes";
}

function localePrefix(locale) {
  // English is at the root; the others are prefixed.
  return locale === "en" ? "" : `/${locale}`;
}

/** The XML-escaped form of a URL for a <loc> element. */
function esc(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** Does this path exist? */
async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * Is this built page marked `noindex`?
 *
 * WHY THIS EXISTS
 * ---------------
 * ADR-007-A1 §5.4: "The recipes sitemap lists indexable hubs and
 * published recipes only — never a zero-recipe hub, never an untranslated
 * stub, never a draft."
 *
 * The HUB's indexability is DERIVED from its published recipe count
 * (§5.2): a hub with zero published recipes is `noindex`, and it becomes
 * indexable automatically at ≥1. That is not a stored flag — it is
 * computed by the page and written into its own meta tag, so it cannot
 * drift from the count.
 *
 * So the meta tag IS the truth, and the sitemap reads it. A sitemap
 * that listed the 1,474 zero-recipe hubs would be handing a crawler
 * 1,474 URLs that every one of them tells the crawler to ignore — the
 * exact "a sitemap with a 404 in it" failure this generator exists to
 * prevent, in the form of "a sitemap with a noindex in it".
 *
 * WHY IT READS THE HTML
 * ---------------------
 * Same reason as the dish-link test: the sitemap is generated from the
 * BUILD OUTPUT, so it lists exactly the pages that exist. And the
 * noindex decision was already made by the page itself, from the same
 * recipe count the API reports — so reading it here means there is ONE
 * source of truth and no second implementation of the rule.
 *
 * The geo build is NOT affected: an Atlas dish page is indexable, and
 * this check only fires where the page carries the tag.
 */
async function pageIsNoindex(htmlPath) {
  let html;
  try {
    html = await readFile(htmlPath, "utf-8");
  } catch {
    // A page that cannot be read is treated as noindex — it is not
    // listed rather than listed wrongly.
    return true;
  }
  return /<meta\s+name="robots"\s+content="[^"]*noindex/i.test(html);
}

/**
 * The dish slugs that exist in the build.
 *
 * The geo build flattens dist/dishes/<slug>/index.html to
 * dist/dishes/<slug>.html; the recipes build keeps the nested form.
 * Both are handled here.
 */
async function collectDishSlugs(dist, { skipNoindex = false } = {}) {
  const slugs = new Set();
  const dishes = join(dist, "dishes");
  let entries;
  try {
    entries = await readdir(dishes, { withFileTypes: true });
  } catch {
    return [];
  }
  // "dishes/new" is the ROUTE for the "add a dish" form, not a dish.
  // It is a real page in the build output, so a naive directory scan
  // counted it — and the sitemap then listed a form URL as if it were
  // a dish page. These are the reserved routes under /dishes/.
  const RESERVED = new Set(["new", "edit", "create", "search"]);
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (RESERVED.has(entry.name)) continue;
      if (skipNoindex) {
        const htmlPath = join(dishes, entry.name, "index.html");
        if (await pageIsNoindex(htmlPath)) continue;
      }
      slugs.add(entry.name);
    } else if (entry.name.endsWith(".html") && entry.name !== "index.html") {
      // Node's Dirent has no `.stem` — that is Python's pathlib API.
      // Strip the extension by hand.
      const slug = entry.name.slice(0, -".html".length);
      if (RESERVED.has(slug)) continue;
      if (skipNoindex) {
        const htmlPath = join(dishes, entry.name);
        if (await pageIsNoindex(htmlPath)) continue;
      }
      slugs.add(slug);
    }
  }
  return [...slugs].sort();
}

/**
 * The published RECIPE pages that exist in the build.
 *
 * A recipe page is `gustale.recipes/recipes/<slug>` — the recipes
 * property's own content (ADR-007-A1 §5.1). Only the recipes build
 * produces them: the geo build's `getStaticPaths` returns nothing for
 * that route, and `post-build.mjs` strips the tree as a second line of
 * defence (§5.5).
 *
 * A recipe that is not published is a 404 — the API reads the
 * `recipe_published` view, and the build's static paths come from the
 * same feed. So the pages that exist in the dist ARE the published
 * recipes; there is no draft to exclude.
 *
 * The noindex check applies for the same reason as the hubs': a page
 * that tells a crawler to ignore it must not be in the sitemap.
 */
async function collectRecipeSlugs(dist) {
  const dir = join(dist, "recipes");
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const slugs = [];
  for (const entry of entries) {
    if (entry.isDirectory()) {
      const htmlPath = join(dir, entry.name, "index.html");
      if (!(await exists(htmlPath))) continue;
      if (await pageIsNoindex(htmlPath)) continue;
      slugs.push(entry.name);
    } else if (entry.name.endsWith(".html") && entry.name !== "index.html") {
      const htmlPath = join(dir, entry.name);
      if (await pageIsNoindex(htmlPath)) continue;
      slugs.push(entry.name.slice(0, -".html".length));
    }
  }
  return slugs.sort();
}

/**
 * Does this built page link to at least one dish?
 *
 * THE TEST IS "LINKS TO A DISH", not "mentions the word dish".
 *
 * A family page with no dishes behind it still renders — it carries the
 * explanation of what the family is and the invitation to map more
 * dishes. It mentions dishes in prose. What it does NOT do is link to
 * one, because there is none to link to.
 *
 * So the test counts the anchors whose href points at a real dish page.
 * A page with zero such anchors has nothing behind it, and:
 *
 *   - it is NOT listed in the sitemap;
 *   - it is marked noindex, so it is not indexed either.
 *
 * The two decisions come from ONE test, so the sitemap and the robots
 * meta can never disagree about which pages have content.
 *
 * WHY IT READS THE HTML AND NOT THE DATABASE: the sitemap is generated
 * from the build output so that it lists exactly the pages that exist.
 * A page that failed to build is not in the dist, and therefore not in
 * the sitemap — no 404 in a sitemap. Reading the same HTML the crawler
 * will read keeps that guarantee for the content test as well.
 */
async function pageLinksToDish(htmlPath) {
  let html;
  try {
    html = await readFile(htmlPath, "utf-8");
  } catch {
    return false;
  }
  // The anchors are what matter. A dish link is href="/dishes/<slug>".
  // The hreflang alternates also contain "/dishes/", but they point at
  // the SAME dish in another locale, so they are excluded by requiring
  // the anchor to start the attribute.
  //
  // "/dishes/new" IS NOT A DISH. It is the link to the "add a dish"
  // form, and EVERY family page carries it — the invitation to map
  // more dishes to the family. Counting it made all 152 families look
  // content-bearing, so the sitemap listed all of them and the 109
  // empty ones were indexed anyway. That is exactly the defect the
  // data-derived sitemap was written to close, so the form link is
  // excluded explicitly.
  const dishAnchors = html.match(/<a\s[^>]*href="\/dishes\/[^"]+"/g);
  if (!Array.isArray(dishAnchors)) return false;
  return dishAnchors.some(
    (anchor) => !/href="\/dishes\/(new|edit|create|search)"/.test(anchor),
  );
}

/**
 * The family and lineage slugs that have content behind them.
 *
 * A "content-bearing" page is one that links to at least one dish.
 * The rest are omitted from the sitemap and marked noindex.
 *
 * The page's HTML is found the same way the dish slugs are: the geo
 * build keeps the nested dist/<section>/<slug>/index.html form, and the
 * recipes build flattens to dist/<section>/<slug>.html.
 */
async function collectContentBearingSlugs(dist, section) {
  const dir = join(dist, section);
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return { withDishes: [], withoutDishes: [] };
  }

  const withDishes = [];
  const withoutDishes = [];
  for (const entry of entries) {
    // The section's own index page (dist/<section>/index.html) is not a
    // slug. It is a directory in the geo build and a file in the
    // recipes build, and neither is a page that belongs in the
    // sitemap under a slug.
    if (entry.isDirectory() && entry.name === "index.html") continue;
    if (!entry.isDirectory() && entry.name === "index.html") continue;
    if (!entry.isDirectory() && !entry.name.endsWith(".html")) continue;

    const slug = entry.isDirectory()
      ? entry.name
      : entry.name.slice(0, -".html".length);
    const htmlPath = entry.isDirectory()
      ? join(dir, entry.name, "index.html")
      : join(dir, entry.name);

    const hasDishes = await pageLinksToDish(htmlPath);
    if (hasDishes) withDishes.push(slug);
    else withoutDishes.push(slug);
  }
  return {
    withDishes: withDishes.sort(),
    withoutDishes: withoutDishes.sort(),
  };
}

async function main() {
  const args = process.argv.slice(2);
  const getArg = (name, fallback) => {
    const i = args.indexOf(`--${name}`);
    return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
  };

  const dist = getArg("dist", "apps/web/dist");
  const domain = getArg("domain", "recipes");
  const requested = getArg("locales", LOCALES.join(","))
    .split(",")
    .map((l) => l.trim())
    .filter(Boolean);

  const origin = siteOrigin(domain);
  // The RECIPES domain skips the noindex pages; the geo domain does not.
  //
  // On gustale.recipes, /dishes/<slug> is the recipe HUB, and a hub with
  // zero published recipes is noindex (ADR-007-A1 §5.2). Listing it in
  // the sitemap would contradict its own meta tag — so it is skipped.
  //
  // On gustale.com, /dishes/<slug> is the ATLAS dish, which is indexable.
  // The check is on the meta tag, not the domain, so an Atlas dish that
  // ever becomes noindex is dropped from the sitemap too — the sitemap
  // and the robots meta can never disagree.
  const slugs = await collectDishSlugs(dist, { skipNoindex: true });
  // The published recipe pages. Only the recipes build has them; on the
  // geo build the route produces nothing and post-build strips the tree.
  const recipeSlugs = await collectRecipeSlugs(dist);

  // The families and the lineages, split by whether they have a dish
  // behind them.
  //
  // THE SITEMAP IS GENERATED FROM THE DATA, so a page enters it as soon
  // as it has a dish mapped to it — there is no list of slugs to keep
  // in step with the database. The next build after a dish is mapped
  // picks it up.
  const families = await collectContentBearingSlugs(dist, "family");
  const lineages = await collectContentBearingSlugs(dist, "lineages");

  // The locale pages are only built for the geo domain for now, and
  // the sitemap must not list URLs that 404.
  const locales = domain === "geo" ? requested : ["en"];

  console.log(`[sitemap] domain=${domain} origin=${origin}`);
  console.log(
    `[sitemap] ${slugs.length} indexable hubs/dishes, ` +
      `${recipeSlugs.length} published recipes, ${locales.join(", ")}`,
  );
  console.log(
    `[sitemap] families: ${families.withDishes.length} with dishes, ` +
      `${families.withoutDishes.length} without (omitted)`,
  );
  console.log(
    `[sitemap] lineages: ${lineages.withDishes.length} with dishes, ` +
      `${lineages.withoutDishes.length} without (omitted)`,
  );

  for (const locale of locales) {
    const prefix = localePrefix(locale);
    const urls = [];

    // The shared pages.
    for (const page of SHARED_PAGES) {
      const path = page ? `${prefix}/${page}` : `${prefix}/`;
      urls.push(`  <url>\n    <loc>${esc(origin + path)}</loc>\n  </url>`);
    }

    // The dishes. Every entry carries the alternates, so one entry
    // tells a search engine the whole locale set.
    for (const slug of slugs) {
      const links = [];
      for (const l of locales) {
        links.push(
          `    <xhtml:link rel="alternate" hreflang="${l}" href="${esc(
            `${origin}${localePrefix(l)}/dishes/${slug}`,
          )}" />`,
        );
      }
      links.push(
        `    <xhtml:link rel="alternate" hreflang="x-default" href="${esc(
          `${origin}/dishes/${slug}`,
        )}" />`,
      );
      urls.push(
        `  <url>\n    <loc>${esc(
          `${origin}${prefix}/dishes/${slug}`,
        )}</loc>\n${links.join("\n")}\n  </url>`,
      );
    }

    // The published RECIPE pages.
    //
    // ADR-007-A1 §5.4: the recipes sitemap lists "indexable hubs and
    // published recipes only". A recipe page that exists in the dist is
    // a published recipe (the build's static paths come from the
    // `recipe_published` feed), and `collectRecipeSlugs` has already
    // dropped any that carry a noindex.
    //
    // They carry NO hreflang alternates: the recipe content has no
    // locale yet, so there is nothing to alternate to. §5.4 says the two
    // properties do not declare each other as alternates, and a recipe
    // that points at an Atlas dish page as its "translation" would be
    // claiming two different pages are translations of one another.
    for (const slug of recipeSlugs) {
      urls.push(
        `  <url>\n    <loc>${esc(`${origin}/recipes/${slug}`)}</loc>\n  </url>`,
      );
    }

    // The families and the lineages that have a dish behind them.
    //
    // These carry the alternates too, so a search engine that reads one
    // of them learns the whole locale set.
    //
    // The families and the lineages are NOT locale-scoped in the build
    // yet — only the English pages are built for them — so they are
    // listed under the English prefix only. Listing a locale URL that
    // was never built would put a 404 in a sitemap, which is the one
    // thing this generator exists to prevent.
    for (const [section, group] of [
      ["family", families],
      ["lineages", lineages],
    ]) {
      for (const slug of group.withDishes) {
        const links = [];
        for (const l of locales) {
          links.push(
            `    <xhtml:link rel="alternate" hreflang="${l}" href="${esc(
              `${origin}${localePrefix(l)}/${section}/${slug}`,
            )}" />`,
          );
        }
        links.push(
          `    <xhtml:link rel="alternate" hreflang="x-default" href="${esc(
            `${origin}/${section}/${slug}`,
          )}" />`,
        );
        urls.push(
          `  <url>\n    <loc>${esc(
            `${origin}/${section}/${slug}`,
          )}</loc>\n${links.join("\n")}\n  </url>`,
        );
      }
    }

    const xml =
      '<?xml version="1.0" encoding="UTF-8"?>\n' +
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" ' +
      'xmlns:xhtml="http://www.w3.org/1999/xhtml">\n' +
      `${urls.join("\n")}\n</urlset>\n`;
    await writeFile(join(dist, `sitemap-${locale}.xml`), xml, "utf-8");
    console.log(`[sitemap] wrote sitemap-${locale}.xml (${urls.length} urls)`);
  }

  // The index.
  const index = locales
    .map(
      (l) =>
        `  <sitemap>\n    <loc>${esc(
          `${origin}/sitemap-${l}.xml`,
        )}</loc>\n    <lastmod>2026-10-29</lastmod>\n  </sitemap>`,
    )
    .join("\n");
  const indexXml =
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    `${index}\n</sitemapindex>\n`;
  await writeFile(join(dist, "sitemap.xml"), indexXml, "utf-8");
  console.log(`[sitemap] wrote sitemap.xml (${locales.length} sitemaps)`);

  // The robots.txt points at the index, so a crawler finds the locale
  // sitemaps without guessing.
  //
  // It is WRITTEN here, not merely amended. The previous version only
  // appended a Sitemap: line to an existing robots.txt, and caught the
  // "no such file" case with an empty catch block — so when there was
  // no robots.txt, nothing happened and the site shipped WITHOUT one.
  // A missing robots.txt on a public site is not a neutral absence:
  // the 404 page was served in its place, so a crawler read a page of
  // HTML where it expected rules, and never found the sitemap pointer.
  //
  // It is written here rather than in apps/web/public/ because there is
  // ONE web app and TWO builds (geo and recipes), and the two
  // properties have different authoring surfaces to disallow.
  const robotsPath = join(dist, "robots.txt");
  const disallowed =
    domain === "geo"
      ? ["/admin", "/login", "/api/"]
      : [
          "/dishes/new",
          "/dishes/*/edit",
          "/admin",
          "/login",
          "/api/",
          "/ingredients",
        ];

  const robots = [
    `# Gustale — ${domain === "geo" ? "Atlas (gustale.com)" : "Recipes (gustale.recipes)"}`,
    "#",
    "# The archive is public and meant to be read and indexed. The",
    "# authoring surfaces are not: they are behind an account, and a",
    "# crawler that submits them wastes the site's crawl budget on",
    "# forms that always answer the same way.",
    "",
    "User-agent: *",
    "Allow: /",
    ...disallowed.map((path) => `Disallow: ${path}`),
    "",
    "# Sitemap: the index, which points at one sitemap per locale.",
    `Sitemap: ${origin}/sitemap.xml`,
    "",
  ].join("\n");

  await writeFile(robotsPath, robots, "utf-8");
  console.log(
    `[sitemap] wrote robots.txt (${disallowed.length} disallowed paths)`,
  );
}

main().catch((err) => {
  console.error("[sitemap] FAILED:", err);
  process.exit(1);
});
