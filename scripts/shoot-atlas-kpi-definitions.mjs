/**
 * scripts/shoot-atlas-kpi-definitions.mjs
 *
 * Screenshots the homepage's KPI definition band at desktop and mobile
 * widths, so the fix can be LOOKED at rather than argued about.
 *
 * Writes PNGs into the given directory.
 */
import { chromium } from "playwright";
import { existsSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "..");
const DIST = process.env.KPI_DIST ?? join(REPO, "apps", "web", "dist");
const OUT = process.argv[2] ?? join(REPO, "docs", "atlas-kpi-shots");

if (!existsSync(join(DIST, "index.html"))) {
  console.error(`No build at ${DIST}`);
  process.exit(2);
}
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();

for (const [label, width] of [
  ["desktop-1440", 1440],
  ["mobile-390", 390],
]) {
  const page = await browser.newPage({
    viewport: { width, height: 900 },
    deviceScaleFactor: 2,
  });
  await page.goto(`file://${join(DIST, "index.html")}`, {
    waitUntil: "domcontentloaded",
  });

  const band = page.locator(".atlas-kpi");
  await band.scrollIntoViewIfNeeded();
  await band.screenshot({ path: join(OUT, `atlas-kpi-${label}.png`) });
  console.log(`  wrote atlas-kpi-${label}.png  (${width}px)`);

  await page.close();
}

await browser.close();
console.log(`\nscreenshots in ${OUT}`);
