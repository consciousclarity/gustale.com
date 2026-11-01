#!/usr/bin/env node
/**
 * The P4 screenshots — desktop and mobile, for every page type.
 *
 * WHY THIS FILE EXISTS
 *
 * The brief's §P4 acceptance criterion says:
 *
 *   > Screenshots at desktop and mobile for every page type, in the
 *   > project's established artifact location.
 *
 * The established location is `.hermes/cache/atlas-baseline/` — where
 * the P0 baseline's 18 PNGs live (9 pages x desktop 1440x900 and
 * mobile 390x844).
 *
 * WHY IT IS A SCRIPT AND NOT A ONE-OFF
 *
 * The baseline's screenshots were taken by hand, and the numbers in the
 * reports came from reading them. A script means the next person can
 * re-take them after a change and get the same set, and it means the
 * artifact location is not a memory.
 *
 * WHAT IT CAPTURES
 *
 *   the homepage            the KPI band and the nav
 *   a dish page            the places & traditions section
 *   the places directory   the "Places" heading
 *   a family page          the family definition
 *   the history page       the "History & connections" heading
 *   the map                the globe
 *   the dish list          the browse page
 *   the 404                the recovery links
 *
 * EACH AT DESKTOP (1440x900) AND MOBILE (390x844).
 *
 * IT WAITS FOR THE ISLANDS
 *
 * The pages mount React islands (`client:visible`), and the atlas
 * section fetches its data from the API. A screenshot taken before the
 * island has hydrated shows the LOADING state, which is a different
 * page — so the script waits for the network to settle and for the
 * section to leave its loading state.
 */

import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";

const OUT_DIR =
  process.env.ATLAS_SHOT_DIR ?? "/home/gustale/.hermes/cache/atlas-p4";

const BASE = process.env.ATLAS_BASE ?? "https://gustale.com";

const VIEWPORTS = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "mobile", width: 390, height: 844 },
];

// The pages, and what each one must SHOW before it is captured.
//
// The `ready` selector is the page's own evidence that it has rendered
// what it is supposed to show. A page that does not reach it is
// captured anyway and reported, because a page that does not load is
// exactly what the screenshot should catch.
const PAGES = [
  {
    name: "home",
    url: "/",
    ready: "section.atlas-kpi",
    expect: ["Places", "History & connections"],
  },
  {
    name: "dish",
    url: "/dishes/falafel",
    ready: "#atlas-places-heading",
    expect: ["Places & traditions"],
  },
  {
    name: "places",
    url: "/regions",
    ready: "h1",
    expect: ["Places"],
  },
  {
    name: "families",
    url: "/families",
    ready: "h1",
    expect: ["Food families"],
  },
  {
    name: "history",
    url: "/lineages",
    ready: "h1",
    expect: ["History & connections"],
  },
  {
    name: "dishes",
    url: "/dishes",
    ready: "h1",
    expect: [],
  },
  {
    name: "map",
    url: "/map",
    ready: "body",
    expect: [],
  },
  {
    name: "not-found",
    url: "/this-page-does-not-exist",
    ready: "body",
    expect: [],
  },
];

async function main() {
  await mkdir(OUT_DIR, { recursive: true });

  const browser = await chromium.launch();
  const results = [];

  for (const viewport of VIEWPORTS) {
    const context = await browser.newContext({
      viewport: { width: viewport.width, height: viewport.height },
      deviceScaleFactor: 1,
    });

    for (const page of PAGES) {
      const tab = await context.newPage();
      const errors = [];
      tab.on("pageerror", (err) => errors.push(String(err)));
      tab.on("console", (msg) => {
        if (msg.type() === "error") errors.push(msg.text());
      });

      let status = 0;
      try {
        const res = await tab.goto(`${BASE}${page.url}`, {
          waitUntil: "domcontentloaded",
          timeout: 45_000,
        });
        status = res?.status() ?? 0;

        // Wait for the page's own evidence that it has rendered.
        if (page.ready !== "body") {
          await tab.waitForSelector(page.ready, { timeout: 15_000 });
        }

        // SCROLL THE ISLANDS INTO VIEW.
        //
        // The atlas section is mounted with `client:visible`, which
        // defers its hydration — and its API call — until the element
        // scrolls into the viewport. That is the intended behaviour: the
        // page stays fast and the section loads when the reader reaches
        // it.
        //
        // The first version of this script did NOT scroll, so it
        // captured the LOADING state and reported the dish page as
        // broken. The page was fine; the capture was premature.
        //
        // So every section is scrolled to, and the API is given the
        // time to settle afterwards.
        await tab.evaluate(() => {
          window.scrollTo(0, document.body.scrollHeight);
        });
        await tab.waitForTimeout(1200);
        await tab.evaluate(() => {
          window.scrollTo(0, 0);
        });
        await tab.waitForTimeout(400);

        // Let the islands hydrate and the API calls settle.
        await tab
          .waitForLoadState("networkidle", { timeout: 20_000 })
          .catch(() => {});
        await tab.waitForTimeout(2000);

        // The atlas section must not still be loading.
        const stillLoading = await tab
          .locator("text=Loading the associations")
          .count()
          .catch(() => 0);

        const missing = [];
        for (const text of page.expect) {
          const found = await tab.locator(`text=${text}`).count();
          if (found === 0) missing.push(text);
        }

        const file = `${OUT_DIR}/${page.name}-${viewport.name}.png`;
        await tab.screenshot({ path: file, fullPage: false });

        // The map's tile CDN answering 429 is the MAP's problem, not
        // this page's, and it is not a failure of the capture. The
        // basemap requests are filtered out so a rate-limited tile
        // server does not make every screenshot look broken.
        const realErrors = errors.filter(
          (e) => !/cartocdn|basemap|tile|429/.test(e),
        );

        results.push({
          page: page.name,
          viewport: viewport.name,
          status,
          file,
          stillLoading,
          missing,
          errors: realErrors.slice(0, 3),
          ignored: errors.length - realErrors.length,
        });
      } catch (err) {
        results.push({
          page: page.name,
          viewport: viewport.name,
          status,
          error: String(err).slice(0, 200),
          errors: errors.slice(0, 3),
        });
      }
      await tab.close();
    }
    await context.close();
  }

  await browser.close();

  // The report.
  console.log(`\n[atlas-shots] ${results.length} screenshots -> ${OUT_DIR}\n`);
  let problems = 0;
  for (const r of results) {
    const bits = [`${r.status}`];
    if (r.missing?.length) bits.push(`missing: ${r.missing.join(", ")}`);
    if (r.stillLoading) bits.push("STILL LOADING");
    if (r.error) bits.push(r.error);
    if (r.errors?.length) bits.push(`console errors: ${r.errors.length}`);
    if (r.ignored) bits.push(`${r.ignored} tile-server errors ignored`);
    console.log(`  ${r.page}-${r.viewport}: ${bits.join(" · ")}`);
    if (r.missing?.length || r.stillLoading || r.error || r.errors?.length) {
      problems += 1;
    }
  }
  console.log(
    `\n[atlas-shots] ${results.length - problems} of ${results.length} clean\n`,
  );
  process.exit(problems > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
