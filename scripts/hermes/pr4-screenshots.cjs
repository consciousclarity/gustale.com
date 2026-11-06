#!/usr/bin/env node
/**
 * Before/after screenshots for PR 4 — the Startpage rebuild.
 *
 * WHAT IT SHOWS
 * -------------
 * PR 4 changes the Startpage in four visible ways:
 *
 *   1. the MAP is gone from the hero
 *   2. the FEATURED ROW of twelve dishes is new
 *   3. the PLACES text list replaces the map's information
 *   4. the counters are truthful ("123 families", not "22 families")
 *
 * So the script captures the homepage in the BEFORE state (the
 * production site) and the AFTER state (a local build served with the
 * mock API).
 *
 * NO VISION MODEL
 * ---------------
 * The screenshots are for a human to look at. The NUMBERS in this PR
 * come from the DOM, read by scripts/hermes/pr4-startpage.cjs —
 * not from a model looking at a picture. A vision model once
 * described a completely different website on this page.
 *
 * It is a .cjs file ON PURPOSE: Playwright resolves its module
 * dependencies from the file's own directory, and the repo's
 * node_modules is at the root.
 */
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const OUT = process.env.SHOT_DIR || "/tmp/pr4-shots";
const AFTER_BASE = process.env.AFTER_BASE || "http://127.0.0.1:8898";
const BEFORE_BASE = process.env.BEFORE_BASE || "https://gustale.com";

async function shoot(browser, base, tag) {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 1000 },
    deviceScaleFactor: 1,
  });
  const results = [];
  for (const [name, urlPath, waitFor] of [
    ["home", "/", "main"],
    ["home-full", "/", ".featured-grid, .feed, .hero-frame, main"],
  ]) {
    const page = await context.newPage();
    try {
      await page.goto(base + urlPath, {
        waitUntil: "networkidle",
        timeout: 45000,
      });
      await page.waitForSelector(waitFor, { timeout: 15000 }).catch(() => {});
      // The featured row is fetched by the island; give it a moment.
      await page.waitForTimeout(2500);
      const file = path.join(OUT, `${tag}-${name}.png`);
      await page.screenshot({ path: file, fullPage: false });
      results.push(file);
      console.log(`  ${tag}/${name} -> ${file}`);
    } catch (e) {
      console.log(`  ${tag}/${name} FAILED: ${e.message}`);
    }
    await page.close();
  }
  await context.close();
  return results;
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();

  console.log("BEFORE (production):");
  await shoot(browser, BEFORE_BASE, "before");
  console.log("AFTER (this branch):");
  await shoot(browser, AFTER_BASE, "after");

  await browser.close();
  console.log(`\nshots in ${OUT}`);
})();
