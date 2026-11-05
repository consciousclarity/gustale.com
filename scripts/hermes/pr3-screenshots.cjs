#!/usr/bin/env node
/**
 * Before/after screenshots for PR 3.
 *
 * WHAT IT SHOWS
 * -------------
 * PR 3 changes three things a reader can SEE:
 *
 *   1. the count next to a result list  (was "24+", now the real
 *      number of matching records)
 *   2. the family filter               (was broken -- every value
 *      returned an empty list; now it filters)
 *   3. content_type                    (new field, on every dish)
 *
 * So the script captures the pages that show those, in both the
 * BEFORE state (the production site) and the AFTER state (a local
 * build served with the mock API).
 *
 * It is a .cjs file ON PURPOSE: Playwright resolves its module
 * dependencies from the file's own directory, and the repo's
 * node_modules is at the root.
 */
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const OUT = process.env.SHOT_DIR || "/tmp/pr3-shots";
const AFTER_BASE = process.env.AFTER_BASE || "http://127.0.0.1:8899";
const BEFORE_BASE = process.env.BEFORE_BASE || "https://gustale.com";

const PAGES = [
  { slug: "dishes-index", path: "/dishes/", wait: ".dish-card, .atl-item, main" },
  { slug: "families", path: "/families/", wait: "main" },
  { slug: "home", path: "/", wait: "main" },
];

async function shoot(browser, base, tag, pages) {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 1000 },
    deviceScaleFactor: 1,
  });
  const results = [];
  for (const p of pages) {
    const page = await context.newPage();
    const url = base + p.path;
    try {
      const resp = await page.goto(url, {
        waitUntil: "networkidle",
        timeout: 45000,
      });
      await page
        .waitForSelector(p.wait, { timeout: 15000 })
        .catch(() => {});
      await page.waitForTimeout(1200);

      const file = path.join(OUT, `${tag}-${p.slug}.png`);
      await page.screenshot({ path: file, fullPage: false });

      // The numbers the PR is about, read from the RENDERED page.
      const facts = await page.evaluate(() => {
        const text = document.body.innerText;
        const counts = [];
        // Any "N dishes", "N results", "N families" style phrase.
        const re = /\b\d[\d,]*\s+(?:dishes?|results?|famil(?:y|ies)|places?|connections?)\b/gi;
        let m;
        while ((m = re.exec(text)) !== null && counts.length < 12) {
          counts.push(m[0].trim());
        }
        // The dash-as-a-counter defect: a lone em dash in a stat slot.
        const dashes = (text.match(/—\s*(?:places|dishes|families|connections)/gi) || []).length;
        return {
          counts: [...new Set(counts)],
          dashCounters: dashes,
          title: document.title,
        };
      });

      results.push({ page: p.slug, url, status: resp?.status(), file, ...facts });
      console.log(
        `  ${tag}/${p.slug}: HTTP ${resp?.status()}  ` +
          `counts=${JSON.stringify(facts.counts)}  dashes=${facts.dashCounters}`,
      );
    } catch (e) {
      console.log(`  ${tag}/${p.slug}: FAILED — ${e.message.split("\n")[0]}`);
      results.push({ page: p.slug, url, error: e.message.split("\n")[0] });
    }
    await page.close();
  }
  await context.close();
  return results;
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const out = { out: OUT, before: [], after: [] };

  console.log("BEFORE (production):");
  out.before = await shoot(browser, BEFORE_BASE, "before", PAGES);

  console.log("\nAFTER (the PR 3 build):");
  out.after = await shoot(browser, AFTER_BASE, "after", PAGES);

  await browser.close();
  fs.writeFileSync(path.join(OUT, "facts.json"), JSON.stringify(out, null, 2));
  console.log(`\nscreenshots in ${OUT}`);
})();
