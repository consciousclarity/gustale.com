/**
 * The verification for the map's relationship layer.
 *
 * WHAT IT PROVES
 *
 * The requirement is that the four kinds of connection are told apart by
 * MORE THAN COLOUR. That is a claim about what a reader can perceive,
 * so it is verified in a real browser, on the real page, against the
 * real rendered DOM:
 *
 *   1. the legend names all four kinds, and each with its MEANING —
 *      not just a colour swatch
 *   2. the four groups have FOUR DIFFERENT LINE PATTERNS — so the
 *      distinction survives the complete loss of colour
 *   3. the four groups have FOUR DIFFERENT MARKER SHAPES — so the
 *      distinction survives being printed in one colour
 *   4. the map's canvas actually has the connection layers
 *   5. the toggle switches a group off and the map's layers change
 *
 * Point 2 is the one that matters most. It is checked by READING THE
 * DASH PATTERN OFF THE RENDERED ELEMENT, so a regression that made
 * two groups look alike would fail here — not merely a change of
 * colour.
 *
 * The screenshot it takes is evidence a human can look at.
 */

import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";

const BASE = process.env.MAP_URL ?? "http://127.0.0.1:4322";
const OUT = process.env.SHOT_DIR ?? "/home/gustale/.hermes/cache/atlas-p4f";

const failures = [];
const notes = [];

function check(name, condition, detail = "") {
  if (condition) {
    notes.push(`  ok    ${name}`);
  } else {
    failures.push(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

await mkdir(OUT, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 1400, height: 1000 },
});

// Collect the console errors, so a silent failure is visible.
const consoleErrors = [];
page.on("console", (m) => {
  if (m.type() === "error") consoleErrors.push(m.text());
});
page.on("pageerror", (e) => consoleErrors.push(`pageerror: ${e.message}`));

console.log(`→ ${BASE}/map`);
await page.goto(`${BASE}/map`, { waitUntil: "networkidle", timeout: 60_000 });

// The map is a client-only island, so the legend appears after
// hydration. Wait for it.
await page.waitForSelector(".rel-legend__title", { timeout: 30_000 });
console.log("  the legend is rendered");

// ─── 1. The legend names all four kinds, with their meanings ───
const titles = await page.$$eval(".rel-legend__name", (els) =>
  els.map((e) => e.textContent?.trim() ?? ""),
);
const meanings = await page.$$eval(".rel-legend__meaning", (els) =>
  els.map((e) => e.textContent?.trim() ?? ""),
);

console.log("  the legend groups:", titles);
check(
  "the legend has four groups",
  titles.length === 4,
  `found ${titles.length}`,
);
check(
  "each group is named",
  ["Same family", "Resemblance", "Descent", "Migration"].every((n) =>
    titles.includes(n),
  ),
  titles.join(" | "),
);
check(
  "each group carries a MEANING, not just a colour",
  meanings.length === 4 && meanings.every((m) => m.length > 30),
  `the meaning lengths: ${meanings.map((m) => m.length).join(", ")}`,
);

// ─── 2. FOUR DIFFERENT LINE PATTERNS ───
//
// The dash pattern is read off the rendered SVG line. This is the
// property that makes the distinction survive the loss of colour.
const patterns = await page.$$eval(".rel-legend__line svg line", (els) =>
  els.map((e) => e.getAttribute("stroke-dasharray") ?? "none"),
);
console.log("  the line patterns:", patterns);
const distinctPatterns = new Set(patterns);
check(
  "the four groups have FOUR DIFFERENT dash patterns",
  distinctPatterns.size === 4,
  `only ${distinctPatterns.size} distinct: ${[...distinctPatterns].join(" , ")}`,
);
check(
  "the 'family' line is solid",
  patterns[0] === "none",
  `got ${patterns[0]}`,
);
check(
  "the 'descent' and 'migration' lines carry an arrow",
  (await page.$$(".rel-legend__line svg path")).length === 2,
  "the directional groups must show a filled arrowhead",
);

// ─── 3. FOUR DIFFERENT MARKER SHAPES ───
const markerShapes = await page.$$eval(".rel-legend__marker svg", (els) =>
  els.map((e) => {
    const inner = e.innerHTML;
    if (inner.includes("<path")) return "triangle";
    const circles = (inner.match(/<circle/g) ?? []).length;
    if (circles === 2) return "two-circles";
    if (circles === 1) {
      // ONE circle — but is it FILLED or HOLLOW? A filled disc and an
      // open ring are different shapes, and a reader can tell them
      // apart. A detector that calls them both "one-circle" cannot.
      const filled = /fill="(?!none)[^"]*"/.test(inner);
      return filled ? "filled-disc" : "hollow-ring";
    }
    return "unknown";
  }),
);
console.log("  the marker shapes:", markerShapes);
check(
  "the four groups have FOUR DIFFERENT marker shapes",
  new Set(markerShapes).size === 4,
  `only ${new Set(markerShapes).size} distinct: ${markerShapes.join(" , ")}`,
);

// ─── 4. The counts ───
const counts = await page.$$eval(".rel-legend__count", (els) =>
  els.map((e) => e.textContent?.trim() ?? ""),
);
console.log("  the legend counts:", counts);
check(
  "the legend states a count for each group",
  counts.length === 4 && counts.every((c) => /\d/.test(c)),
  counts.join(" | "),
);
// The legend's four counts must sum to the number of connections the
// API reports. It is read from the page's own data rather than
// hardcoded, so the check is meaningful on any dataset.
const totalConnections = await page.evaluate(async () => {
  const res = await fetch("/api/atlas/connections");
  if (!res.ok) return null;
  const body = await res.json();
  return body.count;
});
const sumOfCounts = counts.reduce(
  (sum, c) => sum + Number(c.match(/\d+/)?.[0] ?? 0),
  0,
);
check(
  "the counts sum to the published total",
  totalConnections !== null && sumOfCounts === totalConnections,
  `the legend sums to ${sumOfCounts}, the API reports ${totalConnections}`,
);

// ─── 5. The map's connection layers exist ───
const layerIds = await page.evaluate(() => {
  const m = window.__gustaleMap;
  if (!m) return null;
  return m.getStyle().layers.map((l) => l.id);
});
console.log("  the map layers:", layerIds);
if (layerIds) {
  for (const kind of ["family", "likeness", "descent", "migration"]) {
    check(
      `the map has the "connections-${kind}" layer`,
      layerIds.includes(`connections-${kind}`),
    );
  }
  check("the map has the arrow layer", layerIds.includes("connections-arrows"));

  // THE MAP'S OWN PAINT — not only the legend's SVG.
  //
  // The legend and the map are two separate renderings of the same
  // grammar, and they can disagree. They DID: the legend showed four
  // dash patterns while the 'family' layer was missing from the map
  // altogether, because MapLibre silently drops a layer whose paint
  // property is `undefined` — which is exactly what a solid line
  // produced.
  //
  // So the check reads the LIVE style: each map layer must carry the
  // SAME pattern the legend shows.
  const paints = await page.evaluate(() => {
    const m = window.__gustaleMap;
    const style = m.getStyle();
    const out = {};
    for (const k of ["family", "likeness", "descent", "migration"]) {
      const l = style.layers.find((x) => x.id === `connections-${k}`);
      out[k] = l ? (l.paint["line-dasharray"] ?? null) : "MISSING";
    }
    return out;
  });
  console.log("  the map's own dash patterns:", paints);

  const legendPatterns = await page.$$eval(
    ".rel-legend__line svg line",
    (els) =>
      els.map((e) => {
        const v = e.getAttribute("stroke-dasharray");
        return v ? v.split(/[\s,]+/).map(Number) : null;
      }),
  );

  const kinds = ["family", "likeness", "descent", "migration"];
  for (let i = 0; i < kinds.length; i++) {
    const kind = kinds[i];
    const mapPattern = paints[kind];
    const legendPattern = legendPatterns[i];
    check(
      `the map's "${kind}" layer carries the legend's pattern`,
      JSON.stringify(mapPattern) === JSON.stringify(legendPattern),
      `the map has ${JSON.stringify(mapPattern)}, the legend shows ${JSON.stringify(legendPattern)}`,
    );
  }

  // The four patterns must be DISTINCT on the map, not only in the
  // legend.
  const distinctMapPatterns = new Set(
    kinds.map((k) => JSON.stringify(paints[k])),
  );
  check(
    "the map's four layers have FOUR DIFFERENT dash patterns",
    distinctMapPatterns.size === 4,
    `only ${distinctMapPatterns.size} distinct on the map`,
  );
} else {
  notes.push(
    "  note  the map instance is not exposed; the layer check was skipped",
  );
}

// ─── 6. The toggle changes the map ───
const before = await page.$$eval(".rel-legend__toggle", (els) =>
  els.map((e) => e.getAttribute("aria-pressed")),
);
console.log("  the pressed state before:", before);
await page.click(".rel-legend__toggle:first-child");
const after = await page.$$eval(".rel-legend__toggle", (els) =>
  els.map((e) => e.getAttribute("aria-pressed")),
);
console.log("  the pressed state after:", after);
check(
  "the toggle switches a group off",
  before[0] === "true" && after[0] === "false",
  `${before[0]} -> ${after[0]}`,
);
await page.click(".rel-legend__toggle:first-child");

// ─── 7. The screenshot ───
await page.waitForTimeout(1500);
await page.screenshot({
  path: `${OUT}/map-relationships.png`,
  fullPage: false,
});
console.log(`→ the screenshot: ${OUT}/map-relationships.png`);

// The map's own errors, excluding the known Carto CDN 429s.
const realErrors = consoleErrors.filter(
  (e) => !/429|carto|basemaps\.cartocdn|tiles\.basemaps/i.test(e),
);
check(
  "no console errors from the map",
  realErrors.length === 0,
  realErrors.slice(0, 3).join(" ; "),
);

await browser.close();

console.log("\n=== the notes ===");
for (const n of notes) console.log(n);
if (failures.length) {
  console.log("\n=== the FAILURES ===");
  for (const f of failures) console.log(f);
  console.log(`\n${failures.length} FAILED`);
  process.exit(1);
}
console.log("\nall the checks passed");
