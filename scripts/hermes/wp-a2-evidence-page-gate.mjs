/**
 * WP-A2 — the axe check for the new pages and the new badge.
 *
 * The repository's own axe gate (`scripts/hermes/axe-accessibility-gate.mjs`)
 * has a fixed list of PATHS that does not include `/about/evidence`.
 * This runs the same rules against the pages WP-A2 added, so the new
 * page is covered by the same gate as the rest of the site.
 *
 * Usage:
 *   node scripts/hermes/wp-a2-evidence-page-gate.mjs \
 *     [--base http://127.0.0.1:4321]
 */

import { createRequire } from "node:module";
import { chromium } from "playwright";

const require = createRequire(import.meta.url);
const args = process.argv.slice(2);
const base = (
  args.includes("--base")
    ? args[args.indexOf("--base") + 1]
    : "http://127.0.0.1:4321"
).replace(/\/$/, "");

const axeSource = await require.resolve("axe-core/axe.min.js");

const PATHS = [
  "/about/evidence",
  "/dishes/chicken-tikka-masala",
  "/dishes/moussaka-greek",
  "/lineages",
];

const VIEWPORTS = [
  { name: "desktop", width: 1440, height: 1000 },
  { name: "mobile", width: 390, height: 844 },
];

const browser = await chromium.launch({ args: ["--no-sandbox"] });
let violations = 0;

for (const vp of VIEWPORTS) {
  const ctx = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    deviceScaleFactor: 1,
  });
  const page = await ctx.newPage();

  for (const path of PATHS) {
    const url = `${base}${path}`;
    const response = await page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: 45000,
    });
    if (!response || response.status() >= 400) {
      console.log(
        `  FAIL ${vp.name.padEnd(7)} ${path} — HTTP ${response?.status()}`,
      );
      violations += 1;
      continue;
    }
    await page.waitForTimeout(2000);
    await page.addScriptTag({
      content: await import("node:fs/promises").then((fs) =>
        fs.readFile(axeSource, "utf8"),
      ),
    });

    const result = await page.evaluate(async () => {
      // @ts-expect-error -- axe is injected above.
      const r = await window.axe.run(document, {
        runOnly: {
          type: "tag",
          values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"],
        },
      });
      return {
        violations: r.violations.map((v) => ({
          id: v.id,
          impact: v.impact,
          nodes: v.nodes.length,
          target: v.nodes[0]?.target?.[0] ?? "?",
        })),
        passes: r.passes.length,
      };
    });

    if (result.violations.length === 0) {
      console.log(
        `  ok   ${vp.name.padEnd(7)} ${path} (${result.passes} rules passed)`,
      );
    } else {
      console.log(`  FAIL ${vp.name.padEnd(7)} ${path}`);
      for (const v of result.violations) {
        console.log(
          `         ${v.id} [${v.impact}] x${v.nodes} at ${v.target}`,
        );
      }
      violations += result.violations.length;
    }
  }
  await ctx.close();
}

await browser.close();
console.log(
  violations === 0
    ? "\nWP-A2 axe gate: PASSED — 0 violations."
    : `\nWP-A2 axe gate: FAILED — ${violations} violation group(s).`,
);
process.exit(violations === 0 ? 0 : 1);
