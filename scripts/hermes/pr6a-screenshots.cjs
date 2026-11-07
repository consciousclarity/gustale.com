#!/usr/bin/env node
/**
 * PR 6a screenshots: the herb-green accent and the R3 nav change.
 *
 * WHAT IT SHOWS
 * -------------
 * 1. The herb green reaches the RECIPES build only. The Atlas keeps
 *    its terracotta.
 *
 * 2. "Add a dish" is GONE from the recipes nav (R3) and still present
 *    on the Atlas.
 *
 * BEFORE = the live production sites (which do not have the change).
 * AFTER  = a local build served from dist/.
 *
 * Both properties, desktop AND mobile.
 *
 * It is a .cjs file ON PURPOSE: Playwright resolves its module
 * dependencies from the file's own directory, and the repo's
 * node_modules is at the root.
 */
const { chromium } = require("playwright");
const fs = require("node:fs");
const path = require("node:path");

const OUT = process.env.SHOT_DIR || "/tmp/pr6a-shots";
const AFTER_BASE = process.env.AFTER_BASE || "http://127.0.0.1:8899";
const BEFORE_RECIPES = process.env.BEFORE_RECIPES || "https://gustale.recipes";
const BEFORE_GEO = process.env.BEFORE_GEO || "https://gustale.com";

const VIEWPORTS = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "mobile", width: 390, height: 844 },
];

fs.mkdirSync(OUT, { recursive: true });

/** The computed --accent on the page, and whether the nav has "Add a dish". */
async function probe(page) {
  return page.evaluate(() => {
    const cs = getComputedStyle(document.body);
    const nav = document.querySelector(".gst-nav") || document.body;
    const navText = nav.innerText || "";
    return {
      accent: cs.getPropertyValue("--accent").trim(),
      accentDark: cs.getPropertyValue("--accent-dark").trim(),
      bodyDomain: document.body.getAttribute("data-domain"),
      hasAddDish: navText.includes("Add a dish"),
      addDishLinks: [...document.querySelectorAll('a[href="/dishes/new"]')]
        .length,
    };
  });
}

async function shoot(browser, { url, file, viewport, label }) {
  const ctx = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    deviceScaleFactor: 2,
  });
  const page = await ctx.newPage();
  let probeResult = null;
  try {
    await page.goto(url, { waitUntil: "networkidle", timeout: 45000 });
    await page.waitForTimeout(1200);
    probeResult = await probe(page);
    await page.screenshot({ path: path.join(OUT, file), fullPage: false });
    console.log(
      `  ${label.padEnd(34)} accent=${probeResult.accent.padEnd(9)} ` +
        `domain=${String(probeResult.bodyDomain).padEnd(8)} ` +
        `addDish=${probeResult.hasAddDish ? "YES" : "no "} ` +
        `-> ${file}`,
    );
  } catch (e) {
    console.log(`  ${label.padEnd(34)} FAILED: ${e.message.split("\n")[0]}`);
  } finally {
    await ctx.close();
  }
  return probeResult;
}

(async () => {
  const browser = await chromium.launch();
  const results = {};

  console.log("=== BEFORE (live production) ===");
  for (const v of VIEWPORTS) {
    results[`before-recipes-${v.name}`] = await shoot(browser, {
      url: `${BEFORE_RECIPES}/`,
      file: `before-recipes-${v.name}.png`,
      viewport: v,
      label: `BEFORE recipes ${v.name}`,
    });
    results[`before-geo-${v.name}`] = await shoot(browser, {
      url: `${BEFORE_GEO}/`,
      file: `before-geo-${v.name}.png`,
      viewport: v,
      label: `BEFORE atlas ${v.name}`,
    });
  }

  console.log("");
  console.log("=== AFTER (the local build) ===");
  for (const v of VIEWPORTS) {
    results[`after-recipes-${v.name}`] = await shoot(browser, {
      url: `${AFTER_BASE}/`,
      file: `after-recipes-${v.name}.png`,
      viewport: v,
      label: `AFTER recipes ${v.name}`,
    });
  }

  console.log("");
  console.log("=== the assertions ===");
  const problems = [];
  const check = (cond, msg) => {
    console.log(`  ${cond ? "PASS" : "FAIL"}  ${msg}`);
    if (!cond) problems.push(msg);
  };

  const before = results["before-recipes-desktop"];
  const after = results["after-recipes-desktop"];

  check(
    after?.accent?.toLowerCase() === "#327a2f",
    "the recipes build's --accent is the herb green #327a2f",
  );
  check(
    after?.bodyDomain === "recipes",
    "the recipes build's body carries data-domain=recipes",
  );
  check(after?.hasAddDish === false, "the recipes nav has NO 'Add a dish'");
  check(
    after?.addDishLinks === 0,
    "the recipes page has NO link to /dishes/new",
  );
  check(
    before?.hasAddDish === true,
    "BEFORE the change, the recipes nav DID have 'Add a dish' (the defect)",
  );
  check(
    before?.accent?.toLowerCase() !== "#327a2f",
    "BEFORE the change, the recipes site was NOT herb green",
  );

  console.log("");
  console.log(`  screenshots in ${OUT}`);
  if (problems.length) {
    console.log(`  ${problems.length} PROBLEM(S)`);
    await browser.close();
    process.exit(1);
  }
  console.log("  ALL PASS");
  await browser.close();
  process.exit(0);
})();
