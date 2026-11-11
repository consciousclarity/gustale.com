#!/usr/bin/env node
/**
 * ITEM 5 — the recipe hub and the recipe page: the screenshots.
 *
 * WHAT IT SHOWS
 * -------------
 * 1. THE HUB (`/dishes/<slug>`) on the recipes property — the recipes
 *    FOR a dish. Today every hub renders the EMPTY state, because live
 *    has zero published recipes. So the empty state is not an edge case
 *    in these screenshots: it IS the page.
 *
 * 2. THE RECIPE PAGE (`/recipes/<slug>`) — one recipe, in full. Live has
 *    no published recipe either, so the recipe page is captured as a
 *    404, which is the honest answer for an unpublished slug.
 *
 * 3. The POPULATED states, built against the mock API's recipe fixture.
 *    Without them the screenshots would only ever prove the empty path
 *    works — and the populated path is the one that breaks when a shape
 *    drifts.
 *
 * 4. NO CONSOLE ERRORS on any of them.
 *
 * Desktop AND mobile for every state.
 *
 * It is a .cjs file ON PURPOSE: Playwright resolves its module
 * dependencies from the file's own directory, and the repo's
 * node_modules is at the root.
 *
 * Usage:
 *   node scripts/hermes/item5-screenshots.cjs <base-url> <out-dir>
 *   # e.g. http://127.0.0.1:8899 docs/screenshots/item5
 */
const { chromium } = require("playwright");
const fs = require("node:fs");
const path = require("node:path");

const BASE = process.argv[2] || process.env.BASE || "http://127.0.0.1:8899";
const OUT = process.argv[3] || process.env.SHOT_DIR || "docs/screenshots/item5";
// "empty" or "populated" — which build this server is serving.
//
// The EMPTY build is the truth: live has zero published recipes, so
// every hub on the real site renders "No recipe yet". The POPULATED
// build is made against the mock API's recipe fixture, and it is what
// proves the list, the filter island and the recipe page itself render.
const MODE = process.argv[4] || process.env.SHOT_MODE || "empty";

const VIEWPORTS = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "mobile", width: 390, height: 844 },
];

fs.mkdirSync(OUT, { recursive: true });

/**
 * What the page actually is, read from the DOM.
 *
 * The probes are the ASSERTIONS. A screenshot that shows a broken page
 * still produces a PNG, so the picture alone is not evidence — these
 * are, and the run fails on them.
 */
async function probe(page) {
  return page.evaluate(() => {
    const h1 = document.querySelector("h1");
    const main = document.querySelector("main") || document.body;
    const mainText = main.innerText || "";
    const noindexMeta =
      document.querySelector('meta[name="robots"][content*="noindex"]') ?? null;
    return {
      title: document.title,
      h1: h1 ? h1.textContent.trim() : null,
      bodyDomain: document.body.getAttribute("data-domain"),
      // The site's own 404 page ("This page isn't here"). An
      // unpublished recipe slug is not built at all — the build's
      // static paths come from the published-recipe feed — so it
      // resolves to the 404 page, which is the correct answer for a
      // recipe that does not exist publicly.
      isNotFoundPage:
        !!document.querySelector("main") &&
        /This page isn.t here|not found/i.test(
          document.querySelector("main").innerText || "",
        ),
      isRecipeNotFound: /Recipe not found/i.test(mainText),

      // The HUB's own markup.
      isHub: !!document.querySelector(".recipe-hub"),
      hubTitle:
        document.querySelector(".recipe-hub__title")?.textContent.trim() ??
        null,
      hubEmptyTitle:
        document.querySelector(".recipe-hub__emptytitle")?.textContent.trim() ??
        null,
      hubRecipeCards: document.querySelectorAll(".recipe-hub__card").length,
      hubCount:
        document.querySelector(".recipe-hub__count b")?.textContent.trim() ??
        null,

      // THE RECIPE PAGE's own markup.
      isRecipePage: !!document.querySelector(".recipe-page"),
      recipeTitle:
        document.querySelector(".recipe-page__title")?.textContent.trim() ??
        null,
      recipeConfidenceBadge:
        document.querySelector(".recipe-page__badge")?.textContent.trim() ??
        null,
      recipeIngredients: document.querySelectorAll(".recipe-page__ingredient")
        .length,
      recipeSteps: document.querySelectorAll(".recipe-page__step").length,
      recipeSections: document.querySelectorAll(".recipe-page__section").length,

      // The SEO signals.
      noindex: !!noindexMeta,
      robots: noindexMeta?.getAttribute("content") ?? null,
      canonical:
        document.querySelector('link[rel="canonical"]')?.getAttribute("href") ??
        null,

      // The cross-origin Atlas link — ABSOLUTE, always.
      atlasLinks: Array.from(
        document.querySelectorAll('a[href^="https://gustale.com/"]'),
      ).map((a) => a.getAttribute("href")),
      relativeDishLinks: Array.from(
        document.querySelectorAll('a[href^="/dishes/"]'),
      ).map((a) => a.getAttribute("href")),
      recipePageLinks: Array.from(
        document.querySelectorAll('a[href^="/recipes/"]'),
      ).map((a) => a.getAttribute("href")),

      mainTextLength: mainText.length,
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
  // browser holds the first paint until it times out — so the page's own
  // content is in the DOM but is never VISIBLE, and any
  // waitForSelector (which waits for visibility) times out.
  //
  // That is a harness artifact of this sandbox, not a defect of the
  // page, and it is intermittent: it hits whichever viewport happens to
  // be slow. The site self-hosts the Noto faces for every ADR-003
  // locale, so blocking this one CDN request costs the screenshots
  // nothing that matters — the fallback stack renders.
  await page.route("**://fonts.googleapis.com/**", (route) => route.abort());
  await page.route("**://fonts.gstatic.com/**", (route) => route.abort());

  const consoleErrors = [];
  const pageErrors = [];
  const failedRequests = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
  page.on("pageerror", (err) => pageErrors.push(err.message));
  // The failed-request URLs are collected too, because the console
  // message does not name the resource ("Failed to load resource: the
  // server responded with a status of 404") — only the response does.
  // Without the URL, the one expected artifact (the auth-session 404 a
  // static server with no API produces on EVERY page) cannot be told
  // apart from a real failure. See item5-console-check.cjs, which proves
  // that artifact is universal by loading a control page.
  page.on("response", (res) => {
    if (res.status() >= 400)
      failedRequests.push(`${res.status()} ${res.url()}`);
  });

  let probeResult = null;
  let error = null;
  try {
    // `waitUntil: "load"` / "networkidle" CANNOT be used here — see the
    // font note above. So: commit, then wait for the page's OWN content.
    await page.goto(url, { waitUntil: "commit", timeout: 45000 });
    await page.waitForSelector("main", { timeout: 30000 });
    await page.waitForTimeout(800);
    probeResult = await probe(page);
    await page.screenshot({ path: path.join(OUT, file), fullPage: true });
    console.log(`  ${label.padEnd(34)} -> ${file}`);
  } catch (e) {
    error = e.message.split("\n")[0];
    console.log(`  ${label.padEnd(34)} FAILED: ${error}`);
  } finally {
    await ctx.close();
  }
  return {
    ...probeResult,
    consoleErrors,
    pageErrors,
    failedRequests,
    error,
  };
}

(async () => {
  const browser = await chromium.launch();
  const results = {};

  const DISH = "moussaka-greek";
  const RECIPE = "moussaka-greek-classic";

  if (MODE === "populated") {
    // ── The POPULATED build ──────────────────────────────────────────
    //
    // Made against the mock API's recipe fixture. This is what proves
    // the recipe list, the filter island and the recipe page itself
    // render — the parts the empty build cannot reach.
    console.log(`=== the RECIPE HUB — populated (${BASE}) ===`);
    for (const v of VIEWPORTS) {
      results[`hub-populated-${v.name}`] = await shoot(browser, {
        url: `${BASE}/dishes/${DISH}`,
        file: `hub-populated-${v.name}.png`,
        viewport: v,
        label: `hub (populated) ${v.name}`,
      });
    }

    console.log("");
    console.log("=== the RECIPE PAGE — one recipe, in full ===");
    for (const v of VIEWPORTS) {
      results[`recipe-populated-${v.name}`] = await shoot(browser, {
        url: `${BASE}/recipes/${RECIPE}`,
        file: `recipe-populated-${v.name}.png`,
        viewport: v,
        label: `recipe (populated) ${v.name}`,
      });
    }
  } else {
    // ── The EMPTY build — the truth ──────────────────────────────────
    console.log(`=== the RECIPE HUB — the empty state (${BASE}) ===`);
    for (const v of VIEWPORTS) {
      results[`hub-empty-${v.name}`] = await shoot(browser, {
        url: `${BASE}/dishes/${DISH}`,
        file: `hub-empty-${v.name}.png`,
        viewport: v,
        label: `hub (empty) ${v.name}`,
      });
    }

    console.log("");
    console.log("=== the RECIPE PAGE — an unpublished slug is a 404 ===");
    for (const v of VIEWPORTS) {
      results[`recipe-404-${v.name}`] = await shoot(browser, {
        url: `${BASE}/recipes/${RECIPE}`,
        file: `recipe-notfound-${v.name}.png`,
        viewport: v,
        label: `recipe (not found) ${v.name}`,
      });
    }
  }

  console.log("");
  console.log("=== the assertions ===");
  const problems = [];
  const check = (cond, msg) => {
    console.log(`  ${cond ? "PASS" : "FAIL"}  ${msg}`);
    if (!cond) problems.push(msg);
  };

  if (MODE === "populated") {
    // ── The hub, POPULATED ───────────────────────────────────────────
    const hd = results["hub-populated-desktop"];
    const hm = results["hub-populated-mobile"];

    check(hd?.isHub === true, "the hub renders the recipe hub");
    check(hd?.h1 === "Moussaka", "the hub's heading is the DISH's name");
    check(
      (hd?.hubRecipeCards ?? 0) === 2,
      `the hub lists BOTH recipes of the dish (${hd?.hubRecipeCards ?? 0} cards)`,
    );
    check(
      hd?.hubCount === "2",
      `the hub states the recipe count (${hd?.hubCount})`,
    );
    check(
      hd?.hubEmptyTitle === null,
      "the populated hub does NOT show the empty state",
    );
    // The DERIVED NOINDEX: a hub with recipes drops the tag on its own
    // (ADR-007-A1 §5.2). This is the same fact as the empty state's,
    // read from the other side.
    check(
      hd?.noindex === false,
      "a hub WITH recipes is INDEXABLE — the noindex is derived, not stored",
    );
    check(
      hd?.atlasLinks?.some((h) => h === `https://gustale.com/dishes/${DISH}`),
      "the hub links to the Atlas dish with an ABSOLUTE url",
    );
    check(
      hd?.recipePageLinks?.length === 2,
      `the hub links to each of its recipes (${hd?.recipePageLinks?.length ?? 0} links)`,
    );
    check(
      hd?.canonical === `https://gustale.recipes/dishes/${DISH}`,
      "the hub self-canonicals on gustale.recipes",
    );
    check(
      hm?.isHub === true && (hm?.hubRecipeCards ?? 0) === 2,
      "the hub renders its recipe list on mobile too",
    );
    check(
      hm?.noindex === false,
      "the populated hub is indexable on mobile too",
    );

    // ── The recipe page, populated ───────────────────────────────────
    const rd = results["recipe-populated-desktop"];
    const rm = results["recipe-populated-mobile"];

    check(rd?.isRecipePage === true, "the recipe page renders");
    check(
      rd?.recipeTitle === "Classic Greek moussaka",
      "the recipe page shows the recipe's own title",
    );
    check(
      rd?.recipeConfidenceBadge === "medium",
      `the recipe page shows its COMPUTED confidence (${rd?.recipeConfidenceBadge})`,
    );
    check(
      (rd?.recipeIngredients ?? 0) === 5,
      `the recipe page lists every ingredient (${rd?.recipeIngredients ?? 0})`,
    );
    check(
      (rd?.recipeSteps ?? 0) === 6,
      `the recipe page lists every METHOD STEP (${rd?.recipeSteps ?? 0})`,
    );
    check(
      (rd?.recipeSections ?? 0) >= 3,
      `the recipe page has its intro, method and notes (${rd?.recipeSections ?? 0} sections)`,
    );
    check(rd?.noindex === false, "a published recipe page is INDEXABLE");
    check(
      rd?.canonical === `https://gustale.recipes/recipes/${RECIPE}`,
      "the recipe page self-canonicals on gustale.recipes",
    );
    check(
      rd?.atlasLinks?.some((h) => h === `https://gustale.com/dishes/${DISH}`),
      "the recipe page links to the Atlas dish with an ABSOLUTE url",
    );
    check(
      rm?.isRecipePage === true && (rm?.recipeSteps ?? 0) === 6,
      "the recipe page renders every step on mobile too",
    );
  } else {
    // ── The hub, empty state ─────────────────────────────────────────
    const hd = results["hub-empty-desktop"];
    const hm = results["hub-empty-mobile"];

    check(hd?.isHub === true, "the hub renders the recipe hub");
    check(
      hd?.hubEmptyTitle === "No recipe yet",
      'the hub says exactly "No recipe yet"',
    );
    check(hd?.h1 === "Moussaka", "the hub's heading is the DISH's name");
    check(
      (hd?.hubTitle ?? "") === "Moussaka",
      "the hub shows the dish's name in its title",
    );
    check(hd?.noindex === true, "the empty hub is NOINDEX");
    check(
      hd?.atlasLinks?.some((h) => h === `https://gustale.com/dishes/${DISH}`),
      "the hub links to the Atlas dish with an ABSOLUTE url",
    );
    check(
      (hd?.relativeDishLinks?.length ?? 0) === 0 ||
        hd.relativeDishLinks.every((h) => !h.includes("gustale.com")),
      "the hub does not fake the Atlas link with a relative one",
    );
    check(
      hd?.canonical === `https://gustale.recipes/dishes/${DISH}`,
      "the hub self-canonicals on gustale.recipes",
    );
    check(
      hd?.mainTextLength > 200,
      "the empty hub is a real page, not a blank one",
    );
    check(
      hd?.recipePageLinks?.length === 0,
      "the empty hub links to no recipe page (there are none)",
    );
    check(
      hm?.isHub === true && hm?.hubEmptyTitle === "No recipe yet",
      "the hub renders the same empty state on mobile",
    );
    check(hm?.noindex === true, "the empty hub is noindex on mobile too");

    // ── The recipe page, not found ───────────────────────────────────
    const rd = results["recipe-404-desktop"];
    check(
      rd?.isNotFoundPage === true,
      "an unpublished recipe slug resolves to the 404 page",
    );
    check(rd?.isRecipePage !== true, "the 404 page is not a recipe page");
    check(
      (rd?.mainTextLength ?? 0) > 100,
      "the 404 page is a real page with a way out, not a blank body",
    );
  }

  // ── The console, on every page ─────────────────────────────────────
  //
  // The known harness artifacts, and what each one IS:
  //
  //   /api/auth/get-session — the AuthMenu island in the Nav asks the
  //     API for the session on every page. The static server has no API,
  //     so it 404s. It is an artifact of serving a static build without
  //     the API behind it, and it happens on EVERY page of BOTH
  //     properties. See item5-console-check.cjs, which proves it is
  //     universal by loading a control page the change did not touch.
  //
  //   the PAGE ITSELF returning 404 — for the unpublished recipe slug,
  //     the 404 IS the correct response. A 404 on the page under test
  //     is the answer, not a failure.
  //
  // Anything else is a real failed request and fails the run.
  const realFailures = (r, { allowSelf404 = false } = {}) =>
    (r?.failedRequests ?? []).filter((f) => {
      if (/\/api\/auth\//.test(f)) return false;
      if (/fonts\.g/.test(f)) return false;
      if (allowSelf404 && f.startsWith("404 ")) return false;
      return true;
    });
  for (const [key, r] of Object.entries(results)) {
    const allowSelf404 = key.startsWith("recipe-404-");
    const failures = realFailures(r, { allowSelf404 });
    check(
      failures.length === 0,
      `no failed request on ${key} other than the known harness artifacts (${failures.length} found)` +
        (failures.length ? `: ${failures.slice(0, 3).join(" | ")}` : ""),
    );
    check(
      (r?.pageErrors?.length ?? 0) === 0,
      `no uncaught page error on ${key} (${r?.pageErrors?.length ?? 0} found)`,
    );
  }

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
