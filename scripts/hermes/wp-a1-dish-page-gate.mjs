/**
 * WP-A1 — the dish page gate.
 *
 * Asserts the four acceptance criteria from the 2026-11-15 blueprint's
 * WP-A1, on two dishes, at 1440px and 390px:
 *
 *   1. the cover photograph is visible (computed opacity 1, and the
 *      image has decoded);
 *   2. the "Places & traditions" section is never stuck on
 *      "Loading the associations";
 *   3. no meta cell shows a zero;
 *   4. scrollWidth equals clientWidth — the page does not scroll
 *      sideways.
 *
 * It is the check that PROVES the fixes, and it is the check that
 * fails if a future change breaks them again.
 *
 * Usage:
 *   node scripts/hermes/wp-a1-dish-page-gate.mjs \
 *     [--base https://gustale.com] [--out DIR] [--shots]
 *
 * It writes a JSON report to DIR/report.json and, with --shots, a PNG
 * per page. Exit code 0 = every check passed; 1 = at least one failed.
 *
 * NOTE ON `--base`: point it at a LOCAL BUILD to check the fix, and at
 * PRODUCTION to check the deployment. The cover image lives on the
 * media host, so the page under test must be able to reach it.
 */

import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "playwright";

const args = process.argv.slice(2);
function arg(name, fallback) {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
}
const has = (name) => args.includes(name);

const BASE = arg("--base", "https://gustale.com").replace(/\/$/, "");
const OUT = resolve(arg("--out", "docs/screenshots/wp-a1"));
const SHOTS = has("--shots");

const VIEWPORTS = [
  { name: "desktop", width: 1440, height: 1000 },
  { name: "mobile", width: 390, height: 844 },
];

const DISHES = ["chicken-tikka-masala", "moussaka-greek"];

const results = [];
let failed = 0;

const browser = await chromium.launch();

for (const vp of VIEWPORTS) {
  for (const slug of DISHES) {
    const context = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      deviceScaleFactor: 1,
    });
    const page = await context.newPage();
    const url = `${BASE}/dishes/${slug}`;

    const record = {
      viewport: vp.name,
      width: vp.width,
      dish: slug,
      url,
      checks: {},
    };

    try {
      const response = await page.goto(url, {
        waitUntil: "domcontentloaded",
        timeout: 45000,
      });
      record.httpStatus = response?.status() ?? null;

      // Give the image a chance to load, then measure.
      await page.waitForTimeout(2500).catch(() => {});

      // --- the cover image ---
      const cover = await page.evaluate(() => {
        const img = document.querySelector("img.dish-cover-hero__img");
        if (!img) {
          return { present: false };
        }
        const cs = window.getComputedStyle(img);
        const rect = img.getBoundingClientRect();
        return {
          present: true,
          opacity: Number(cs.opacity),
          classes: img.className,
          complete: img.complete,
          naturalWidth: img.naturalWidth,
          naturalHeight: img.naturalHeight,
          currentSrc: img.currentSrc || img.src,
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        };
      });
      record.checks.cover = cover;

      // --- the "Loading the associations" text ---
      const loadingText = await page.evaluate(() => {
        const text = document.body.innerText || "";
        return {
          stillLoading: /Loading the associations/i.test(text),
        };
      });
      record.checks.loadingAssociations = loadingText;

      // --- zero counters: elements whose whole text is "0" ---
      const zeroCounters = await page.evaluate(() => {
        const hits = [];
        const walk = document.createTreeWalker(
          document.body,
          NodeFilter.SHOW_TEXT,
        );
        let node = walk.nextNode();
        while (node) {
          const t = (node.textContent || "").trim();
          if (t === "0") {
            const el = node.parentElement;
            if (el) {
              hits.push({
                tag: el.tagName,
                cls: el.className,
                label: (el.textContent || "").trim().slice(0, 80),
              });
            }
          }
          node = walk.nextNode();
        }
        return hits;
      });
      record.checks.zeroCounters = zeroCounters;

      // --- horizontal overflow ---
      const overflow = await page.evaluate(() => {
        const de = document.documentElement;
        const offenders = [];
        const vw = de.clientWidth;
        for (const el of Array.from(document.querySelectorAll("body *"))) {
          const r = el.getBoundingClientRect();
          if (r.width > 0 && r.right > vw + 1) {
            offenders.push({
              tag: el.tagName,
              cls:
                typeof el.className === "string"
                  ? el.className.slice(0, 80)
                  : "",
              right: Math.round(r.right),
              width: Math.round(r.width),
            });
          }
        }
        return {
          scrollWidth: de.scrollWidth,
          clientWidth: de.clientWidth,
          hasOverflow: de.scrollWidth > de.clientWidth + 1,
          offenders: offenders.slice(0, 8),
        };
      });
      record.checks.overflow = overflow;

      // --- the verdict for this page ---
      const problems = [];
      if (!cover.present) {
        problems.push("no cover image element");
      } else {
        if (cover.opacity < 0.99) {
          problems.push(`cover opacity is ${cover.opacity} (expected 1)`);
        }
        if (!cover.complete) problems.push("cover image never completed");
        if (cover.naturalWidth === 0)
          problems.push("cover image has no intrinsic width");
      }
      if (loadingText.stillLoading) {
        problems.push("'Loading the associations' still on the page");
      }
      if (zeroCounters.length > 0) {
        problems.push(`${zeroCounters.length} zero-valued counter(s)`);
      }
      if (overflow.hasOverflow) {
        problems.push(
          `horizontal overflow: scrollWidth ${overflow.scrollWidth} > clientWidth ${overflow.clientWidth}`,
        );
      }
      record.problems = problems;
      if (problems.length > 0) failed += 1;

      if (SHOTS) {
        await mkdir(OUT, { recursive: true });
        await page.screenshot({
          path: resolve(OUT, `${vp.name}-${slug}.png`),
          fullPage: false,
        });
      }
    } catch (err) {
      record.error = String(err);
      record.problems = [`threw: ${String(err)}`];
      failed += 1;
    }

    results.push(record);
    await context.close();
  }
}

await browser.close();

const report = { base: BASE, at: new Date().toISOString(), results };
await mkdir(OUT, { recursive: true });
await writeFile(
  resolve(OUT, "report.json"),
  `${JSON.stringify(report, null, 2)}\n`,
);

for (const r of results) {
  const status = r.problems.length === 0 ? "PASS" : "FAIL";
  console.log(
    `${status}  ${r.viewport.padEnd(7)} ${r.dish.padEnd(22)} ${r.problems.join("; ") || "ok"}`,
  );
}

console.log(
  `\n${failed === 0 ? "ALL CHECKS PASSED" : `${failed} PAGE(S) WITH PROBLEMS`}`,
);
process.exit(failed === 0 ? 0 : 1);
