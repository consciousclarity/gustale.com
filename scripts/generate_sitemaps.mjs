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

import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
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

/**
 * The dish slugs that exist in the build.
 *
 * The geo build flattens dist/dishes/<slug>/index.html to
 * dist/dishes/<slug>.html; the recipes build keeps the nested form.
 * Both are handled here.
 */
async function collectDishSlugs(dist) {
  const slugs = new Set();
  const dishes = join(dist, "dishes");
  let entries;
  try {
    entries = await readdir(dishes, { withFileTypes: true });
  } catch {
    return [];
  }
  for (const entry of entries) {
    if (entry.isDirectory()) {
      slugs.add(entry.name);
    } else if (entry.name.endsWith(".html") && entry.name !== "index.html") {
      // Node's Dirent has no `.stem` — that is Python's pathlib API.
      // Strip the extension by hand.
      slugs.add(entry.name.slice(0, -".html".length));
    }
  }
  return [...slugs].sort();
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
  const slugs = await collectDishSlugs(dist);

  // The locale pages are only built for the geo domain for now, and
  // the sitemap must not list URLs that 404.
  const locales = domain === "geo" ? requested : ["en"];

  console.log(`[sitemap] domain=${domain} origin=${origin}`);
  console.log(
    `[sitemap] ${slugs.length} dishes, locales: ${locales.join(", ")}`,
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
  const robotsPath = join(dist, "robots.txt");
  try {
    const existing = await readFile(robotsPath, "utf-8");
    if (!existing.includes("Sitemap:")) {
      await writeFile(
        robotsPath,
        `${existing.trimEnd()}\n\nSitemap: ${origin}/sitemap.xml\n`,
        "utf-8",
      );
      console.log("[sitemap] added the Sitemap line to robots.txt");
    }
  } catch {
    // No robots.txt — nothing to update.
  }
}

main().catch((err) => {
  console.error("[sitemap] FAILED:", err);
  process.exit(1);
});
