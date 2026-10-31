#!/usr/bin/env node
/**
 * Baseline screenshots for the atlas restructure.
 *
 * Uses the repo's own Playwright (chromium is installed under
 * ~/.cache/ms-playwright/) because the agent's browser cannot reach a local
 * dev server — the firewall opens only 4001/4002. For the LIVE public sites
 * the agent's browser works too, but Playwright is used here for both, so
 * the desktop AND mobile shots come from one tool and one code path.
 *
 * Usage:
 *   node scripts/baseline-screenshots.mjs <out-dir> [base-url]
 */

import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";

const OUT = process.argv[2] ?? "/tmp/atlas-baseline";
const BASE = (process.argv[3] ?? "https://gustale.com").replace(/\/$/, "");

const PAGES = [
  { slug: "home", path: "/", wait: 3500 },
  { slug: "dishes-list", path: "/dishes", wait: 2500 },
  { slug: "dish-falafel", path: "/dishes/falafel", wait: 2500 },
  { slug: "regions", path: "/regions", wait: 2500 },
  { slug: "families", path: "/families", wait: 2500 },
  { slug: "lineages", path: "/lineages", wait: 2500 },
  { slug: "map", path: "/map", wait: 4000 },
  { slug: "about", path: "/about", wait: 2000 },
  { slug: "contribute", path: "/contribute", wait: 2000 },
];

const VIEWPORTS = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "mobile", width: 390, height: 844 },
];

await mkdir(OUT, { recursive: true });

const browser = await chromium.launch();
const results = [];

for (const vp of VIEWPORTS) {
  const ctx = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    deviceScaleFactor: 1,
  });
  const page = await ctx.newPage();

  for (const p of PAGES) {
    const url = `${BASE}${p.path}`;
    const file = `${OUT}/${p.slug}-${vp.name}.png`;
    try {
      const res = await page.goto(url, {
        waitUntil: "domcontentloaded",
        timeout: 45000,
      });
      await page.waitForTimeout(p.wait);
      await page.screenshot({ path: file, fullPage: false });
      const title = await page.title();
      results.push({
        slug: p.slug,
        viewport: vp.name,
        url,
        status: res?.status() ?? 0,
        title,
        file,
      });
      console.log(
        `OK   ${vp.name.padEnd(7)} ${String(res?.status()).padEnd(4)} ${p.path}  "${title}"`,
      );
    } catch (err) {
      results.push({
        slug: p.slug,
        viewport: vp.name,
        url,
        status: 0,
        error: err.message,
        file: null,
      });
      console.log(
        `FAIL ${vp.name.padEnd(7)} ---   ${p.path}  ${err.message.split("\n")[0]}`,
      );
    }
  }
  await ctx.close();
}

await browser.close();
console.log(`\nscreenshots -> ${OUT}`);
