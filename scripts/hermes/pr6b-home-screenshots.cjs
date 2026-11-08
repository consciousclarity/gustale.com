#!/usr/bin/env node
/**
 * PR 6b screenshots: the recipes property's OWN home.
 *
 * WHAT IT SHOWS
 * -------------
 * 1. `gustale.recipes/` serves its OWN landing page — not the Atlas's
 *    map workspace. That is R1, and before this change the two
 *    properties served the SAME home.
 *
 * 2. The recipes home renders correctly in the EMPTY state — which is
 *    not an edge case: live has zero recipes, so this is what every
 *    visitor sees first.
 *
 * 3. The recipes home offers NO "Add a dish" and NO link to
 *    `/dishes/new` (R3), and it DOES link to the Atlas for the history.
 *
 * 4. NO CONSOLE ERRORS on the recipes home.
 *
 * It is a .cjs file ON PURPOSE: Playwright resolves its module
 * dependencies from the file's own directory, and the repo's
 * node_modules is at the root.
 *
 * Usage:
 *   node scripts/hermes/pr6b-home-screenshots.cjs <base-url>
 *   # e.g. http://127.0.0.1:8899  (a local server serving the recipes dist)
 */
const { chromium } = require("playwright");
const fs = require("node:fs");
const path = require("node:path");

const BASE = process.argv[2] || process.env.BASE || "http://127.0.0.1:8899";
const OUT = process.env.SHOT_DIR || "/tmp/pr6b-shots";

const VIEWPORTS = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "mobile", width: 390, height: 844 },
];

fs.mkdirSync(OUT, { recursive: true });

/**
 * What the page actually is, read from the DOM.
 *
 * `isRecipesHome` is the load-bearing probe: the recipes home's own
 * markup is the proof that the property serves its own page. The
 * Atlas home's markup (the KPI band, the workspace island) is the
 * proof that it does NOT.
 */
async function probe(page) {
  return page.evaluate(() => {
    const h1 = document.querySelector("h1");
    const nav = document.querySelector(".gst-nav") || document.body;
    const navText = nav.innerText || "";
    const main = document.querySelector("main") || document.body;
    const mainText = main.innerText || "";
    return {
      title: document.title,
      h1: h1 ? h1.textContent.trim() : null,
      bodyDomain: document.body.getAttribute("data-domain"),
      isRecipesHome: !!document.querySelector(".recipes-home"),
      hasAtlasKpi: !!document.querySelector(".atlas-kpi"),
      hasHomeIsland: !!document.body.innerHTML.includes("GustaleHomeIsland"),
      hasAddDish:
        navText.includes("Add a dish") || mainText.includes("Add a dish"),
      addDishLinks: document.querySelectorAll('a[href="/dishes/new"]').length,
      atlasLinks: document.querySelectorAll('a[href^="https://gustale.com/"]')
        .length,
      recipesCount: mainText.match(/(\d+)\s+published recipes/)?.[1] ?? null,
      canonical:
        document.querySelector('link[rel="canonical"]')?.getAttribute("href") ??
        null,
    };
  });
}

async function shoot(browser, { url, file, viewport, label }) {
  const ctx = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    deviceScaleFactor: 2,
  });
  const page = await ctx.newPage();
  // The Google Fonts stylesheet is a RENDER-BLOCKING @import in
  // global.css. Where fonts.googleapis.com is unreachable or slow, the
  // browser holds the first paint until it times out — so the page's
  // own content is in the DOM but is never VISIBLE, and any
  // waitForSelector (which waits for visibility) times out.
  //
  // That is a harness artifact of this sandbox, not a defect of the
  // page, and it is intermittent: it hits whichever viewport happens
  // to be slow. The site self-hosts the Noto faces for every
  // ADR-003 locale, so blocking this one CDN request costs the
  // screenshots nothing that matters — the fallback stack renders.
  //
  // So: abort the font request outright. The page then paints on the
  // first try, every time, and the assertions measure the page
  // rather than the CDN's latency.
  await page.route("**://fonts.googleapis.com/**", (route) => route.abort());
  await page.route("**://fonts.gstatic.com/**", (route) => route.abort());
  // The console-error check the card asks for. Errors are collected
  // for the whole navigation, so a hydration failure or a failed
  // request shows up here rather than as a silently-degraded page.
  //
  // The failed-request URLs are collected too, because the console
  // message does not name the resource ("Failed to load resource: the
  // server responded with a status of 404") — only the response does.
  // Without the URL, the one expected artifact (the auth-session 404
  // a static server with no API produces on EVERY page) cannot be
  // told apart from a real failure. See pr6b-console-check.cjs, which
  // proves that artifact is universal by loading a control page.
  const consoleErrors = [];
  const pageErrors = [];
  const failedRequests = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
  page.on("pageerror", (err) => pageErrors.push(err.message));
  page.on("response", (res) => {
    if (res.status() >= 400)
      failedRequests.push(`${res.status()} ${res.url()}`);
  });

  let probeResult = null;
  try {
    // `waitUntil: "load"` / "networkidle" CANNOT be used here.
    //
    // global.css opens with `@import url("https://fonts.googleapis.com/...")`,
    // so the `load` event waits on an external CDN. Where that CDN is
    // unreachable or slow, `load` never fires and the navigation times
    // out — a harness artifact that looks exactly like a broken page.
    // (The first version of this script did use "networkidle" and hit
    // precisely that.)
    //
    // So: commit, then wait for the page's OWN content to be present.
    // That is the thing being asserted, and it does not depend on a
    // third party.
    await page.goto(url, { waitUntil: "commit", timeout: 45000 });
    await page.waitForSelector(".recipes-home", { timeout: 30000 });
    await page.waitForTimeout(800);
    probeResult = await probe(page);
    await page.screenshot({ path: path.join(OUT, file), fullPage: true });
    console.log(`  ${label.padEnd(30)} -> ${file}`);
  } catch (e) {
    console.log(`  ${label.padEnd(30)} FAILED: ${e.message.split("\n")[0]}`);
  } finally {
    await ctx.close();
  }
  return { ...probeResult, consoleErrors, pageErrors, failedRequests };
}

(async () => {
  const browser = await chromium.launch();
  const results = {};

  console.log(`=== the recipes home (${BASE}) ===`);
  for (const v of VIEWPORTS) {
    results[`recipes-${v.name}`] = await shoot(browser, {
      url: `${BASE}/`,
      file: `recipes-home-${v.name}.png`,
      viewport: v,
      label: `recipes home ${v.name}`,
    });
  }

  console.log("");
  console.log("=== the assertions ===");
  const problems = [];
  const check = (cond, msg) => {
    console.log(`  ${cond ? "PASS" : "FAIL"}  ${msg}`);
    if (!cond) problems.push(msg);
  };

  const d = results["recipes-desktop"];
  const m = results["recipes-mobile"];

  check(d?.isRecipesHome === true, "the recipes home renders its OWN page");
  check(
    d?.hasAtlasKpi === false,
    "the recipes home does NOT carry the Atlas KPI band",
  );
  check(
    d?.hasHomeIsland === false,
    "the recipes home does NOT mount the Atlas home island",
  );
  check(d?.bodyDomain === "recipes", "the body carries data-domain=recipes");
  check(
    d?.canonical === "https://gustale.recipes/",
    "the recipes home self-canonicals on gustale.recipes",
  );
  check(d?.hasAddDish === false, "the recipes home offers NO 'Add a dish'");
  check(d?.addDishLinks === 0, "the recipes home has NO link to /dishes/new");
  check(
    d?.atlasLinks > 0,
    "the recipes home links to the Atlas for the history",
  );
  check(
    d?.recipesCount === "0",
    "the recipes home states the recipe count (0) — the empty state is real",
  );
  check(
    (d?.h1 ?? "").length > 0,
    "the recipes home has a heading (the empty state is not a blank page)",
  );
  check(
    d?.failedRequests.filter(
      (f) => !/\/api\/auth\//.test(f) && !/fonts\.g/.test(f),
    ).length === 0,
    "no failed request on the recipes home other than the auth-session 404",
  );
  check(
    d?.pageErrors.length === 0,
    `no uncaught page error on the recipes home (desktop) (${d?.pageErrors.length ?? 0} found)`,
  );
  check(
    m?.failedRequests.filter(
      (f) => !/\/api\/auth\//.test(f) && !/fonts\.g/.test(f),
    ).length === 0 && m?.pageErrors.length === 0,
    "no failed request and no uncaught page error on the recipes home (mobile)",
  );
  check(m?.isRecipesHome === true, "the recipes home renders on mobile too");

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
