#!/usr/bin/env node
/**
 * A close-up of the header, so the accent colour is unmistakable.
 */
const { chromium } = require("playwright");
const path = require("node:path");

const OUT = process.env.SHOT_DIR || "/tmp/pr6a-shots";

(async () => {
  const browser = await chromium.launch();
  for (const [label, url] of [
    ["after-recipes-header", "http://127.0.0.1:8901/"],
    ["after-geo-header", "http://127.0.0.1:8902/"],
    ["before-recipes-header", "https://gustale.recipes/"],
    ["before-geo-header", "https://gustale.com/"],
  ]) {
    const ctx = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 2,
    });
    const page = await ctx.newPage();
    try {
      await page.goto(url, { waitUntil: "networkidle", timeout: 45000 });
      await page.waitForTimeout(1000);
      // The header + the first band below it.
      await page.screenshot({
        path: path.join(OUT, `${label}.png`),
        clip: { x: 0, y: 0, width: 1440, height: 420 },
      });
      const accent = await page.evaluate(() =>
        getComputedStyle(document.body).getPropertyValue("--accent").trim(),
      );
      console.log(`  ${label.padEnd(24)} --accent=${accent}`);
    } catch (e) {
      console.log(`  ${label.padEnd(24)} FAILED: ${e.message.split("\n")[0]}`);
    }
    await ctx.close();
  }
  await browser.close();
})();
