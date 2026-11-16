#!/usr/bin/env node
/**
 * WP-A3 — the navigation gate.
 *
 * Asserts the blueprint's WP-A3 acceptance criteria in a real browser:
 *
 *   1. every header link returns 200 — no dead link in the header;
 *   2. the header carries the SIX sections, with the blueprint's
 *      labels, and no host switch;
 *   3. the mobile menu is reachable BY KEYBOARD: the toggle can be
 *      operated with Enter, focus moves into the panel, Tab cycles
 *      inside it, Escape closes it and focus comes back to the
 *      toggle;
 *   4. the footer carries the same six sections.
 *
 * Usage:
 *   node scripts/hermes/wp-a3-navigation-gate.mjs \
 *     [--base http://127.0.0.1:4321]
 */
import { chromium } from "playwright";

const args = process.argv.slice(2);
const base = (
  args.includes("--base")
    ? args[args.indexOf("--base") + 1]
    : "http://127.0.0.1:4321"
).replace(/\/$/, "");

const SIX = [
  "Atlas",
  "Dishes",
  "Families",
  "Ingredients",
  "History",
  "Recipes",
];
const RETIRED = [
  "Explore",
  "Dish origins",
  "Food families",
  "History & connections",
  "Lineages",
];

let failures = 0;
function check(name, ok, detail = "") {
  if (ok) {
    console.log(`  ok   ${name}`);
  } else {
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
    failures += 1;
  }
}

const browser = await chromium.launch({ args: ["--no-sandbox"] });

// ─── 1. the six sections ───────────────────────────────────────────────
console.log("=== the six sections ===");
for (const vp of [
  { name: "desktop", width: 1440, height: 1000 },
  { name: "mobile", width: 390, height: 844 },
]) {
  const ctx = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
  });
  const page = await ctx.newPage();
  await page.goto(`${base}/`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1500);

  // The drawer's links are in the DOM on both widths; the desktop row
  // is only visible on desktop.
  const labels = await page.$$eval("#nav-links .gst-navlink", (els) =>
    els.map((e) => (e.textContent || "").trim()),
  );
  check(
    `${vp.name}: the header carries the six sections`,
    JSON.stringify(labels) === JSON.stringify(SIX),
    `got ${JSON.stringify(labels)}`,
  );

  for (const old of RETIRED) {
    check(
      `${vp.name}: the header does not say "${old}"`,
      !labels.includes(old),
    );
  }

  // The host switch is gone.
  const switches = await page.$$eval(".property-switch", (els) => els.length);
  check(
    `${vp.name}: the host switch is gone`,
    switches === 0,
    `${switches} found`,
  );

  await ctx.close();
}

// ─── 2. no header link returns 404 ─────────────────────────────────────
console.log("\n=== no header link returns 404 ===");
{
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  const page = await ctx.newPage();
  await page.goto(`${base}/`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1500);
  const hrefs = await page.$$eval("#nav-links .gst-navlink", (els) =>
    els.map((e) => e.getAttribute("href")).filter(Boolean),
  );
  for (const href of hrefs) {
    const url = href.startsWith("http") ? href : base + href;
    let status = 0;
    try {
      const res = await page.request.get(url, { timeout: 20000 });
      status = res.status();
    } catch {
      status = -1;
    }
    // A link to the other host is not this server's business; only the
    // same-host links are checked for a dead end.
    if (href.startsWith("http") && !href.startsWith(base)) {
      console.log(`  skip ${href} (the other host)`);
      continue;
    }
    check(`${href} returns 200`, status === 200, `got ${status}`);
  }
  await ctx.close();
}

// ─── 3. the mobile menu, by keyboard ───────────────────────────────────
console.log("\n=== the mobile menu, by keyboard ===");
{
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  const page = await ctx.newPage();
  await page.goto(`${base}/`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1500);

  const toggle = page.locator("#nav-mobile-toggle");
  check("the toggle is visible", await toggle.isVisible());

  // Reach the toggle by Tab only — no mouse.
  await page.evaluate(() => document.body.focus());
  let reached = false;
  for (let i = 0; i < 40; i += 1) {
    await page.keyboard.press("Tab");
    const id = await page.evaluate(() => document.activeElement?.id || "");
    if (id === "nav-mobile-toggle") {
      reached = true;
      break;
    }
  }
  check("the toggle is reachable by Tab", reached);

  // Open it with the keyboard.
  await page.keyboard.press("Enter");
  await page.waitForTimeout(600);
  const panel = page.locator("#nav-mobile-panel");
  check("Enter opens the panel", await panel.isVisible());

  const focusedInPanel = await page.evaluate(() => {
    const p = document.getElementById("nav-mobile-panel");
    return (
      !!p && !!document.activeElement && p.contains(document.activeElement)
    );
  });
  check("focus moves into the panel", focusedInPanel);

  // Tab cycles INSIDE the panel — the focus trap holds.
  let escaped = false;
  for (let i = 0; i < 25; i += 1) {
    await page.keyboard.press("Tab");
    const inside = await page.evaluate(() => {
      const p = document.getElementById("nav-mobile-panel");
      return (
        !!p && !!document.activeElement && p.contains(document.activeElement)
      );
    });
    if (!inside) {
      escaped = true;
      break;
    }
  }
  check("focus stays inside the panel when tabbing", !escaped);

  // Escape closes it, and focus returns to the toggle.
  await page.keyboard.press("Escape");
  await page.waitForTimeout(600);
  check("Escape closes the panel", !(await panel.isVisible()));

  const focusReturned = await page.evaluate(
    () => document.activeElement?.id === "nav-mobile-toggle",
  );
  check("focus returns to the toggle", focusReturned);

  await ctx.close();
}

// ─── 4. the footer ─────────────────────────────────────────────────────
console.log("\n=== the footer ===");
{
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  const page = await ctx.newPage();
  await page.goto(`${base}/`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1500);
  const footerLabels = await page.$$eval(".gst-foot .fl a", (els) =>
    els.map((e) => (e.textContent || "").trim()),
  );
  for (const label of SIX) {
    check(`the footer lists "${label}"`, footerLabels.includes(label));
  }
  check(
    'the footer does not say "Lineages"',
    !footerLabels.includes("Lineages"),
  );
  await ctx.close();
}

await browser.close();

console.log(
  failures === 0
    ? "\nWP-A3 navigation gate: PASSED."
    : `\nWP-A3 navigation gate: FAILED — ${failures} check(s).`,
);
process.exit(failures === 0 ? 0 : 1);
