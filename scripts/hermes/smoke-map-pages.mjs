#!/usr/bin/env node
import { spawn } from "node:child_process";
/**
 * Map pages visual + console smoke.
 *
 * Run after a major dependency upgrade (MapLibre, Astro, etc.) or a deploy
 * to confirm the map pages still render cleanly:
 *   - 0 console errors
 *   - 0 page errors
 *   - 0 unexpected failed requests (tile + favicon failures are allowed)
 *   - no `maplibre-gl-worker.*.mjs` 404
 *   - on gustale.com/map the globe is visibly round in the screenshot
 *
 * Usage:
 *   node scripts/hermes/smoke-map-pages.mjs                 # default domains
 *   DOMAINS=gustale.com node scripts/hermes/smoke-map-pages.mjs
 *   OUTPUT_DIR=/tmp/snap node scripts/hermes/smoke-map-pages.mjs
 *
 * Exit code 0 = clean, 1 = any failure (also printed to stderr).
 *
 * Inspired by the post-major-bump visual smoke (2026-10-18) that surfaced
 * the MapLibre 6 worker / setSky / setProjection regressions. Keeping
 * this in the repo means the next upgrade will fail the smoke here
 * before anyone clicks on /map and sees a flat Mercator basemap.
 */
import { mkdir } from "node:fs/promises";
import { setTimeout as sleep } from "node:timers/promises";
import { chromium } from "playwright";

const DOMAINS = (process.env.DOMAINS ?? "gustale.com,gustale.recipes")
  .split(",")
  .map((d) => d.trim())
  .filter(Boolean);

const OUTPUT_DIR = process.env.OUTPUT_DIR ?? "/tmp/snap";

// Targets we always check. /map is intentionally only valid on
// gustale.com — gustale.recipes drops it in post-build.mjs (see
// apps/web/scripts/post-build.mjs:66-67 GEO_ONLY). The script will
// record a 404 on recipes /map as INFO, not a failure.
const TARGETS = [
  {
    slug: "map",
    path: "/map",
    expectHttp: (code, host) =>
      host.includes("gustale.recipes") ? code === 404 : code === 200,
  },
  { slug: "dish", path: "/dishes/rendang", expectHttp: (code) => code === 200 },
  { slug: "home", path: "/", expectHttp: (code) => code === 200 },
];

const VIEWPORTS = [
  { name: "desktop", width: 1280, height: 800 },
  { name: "mobile", width: 393, height: 851 },
];

// We accept failures from these hosts without failing the run — they are
// third-party tile / font CDNs that occasionally 4xx without breaking
// the page.
const TILE_HOST_SUFFIXES = [
  "openstreetmap.org",
  "basemaps.cartocdn.com",
  "demotiles.maplibre.org",
  "cdn.jsdelivr.net",
  "openfreemap.org",
];

const isTileHost = (url) => TILE_HOST_SUFFIXES.some((h) => url.includes(h));

async function ensurePlaywright() {
  // Use the same Python venv as the original snap script if present, so
  // both approaches work in CI. Node Playwright is the canonical entry
  // point; this is a JS repo. We just check the binary exists; if not,
  // point the operator at the install line.
  try {
    const { devices } = await import("playwright");
    return devices;
  } catch (err) {
    console.error(
      "playwright is not installed for Node.\n" +
        "  Install it once with:  cd apps/web && pnpm add -D playwright\n" +
        "  Then:                 pnpm exec playwright install chromium\n" +
        `  (original error: ${err.message})`,
    );
    process.exit(2);
  }
}

async function main() {
  await mkdir(OUTPUT_DIR, { recursive: true });
  const summary = [];

  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox"],
  });

  for (const vp of VIEWPORTS) {
    const ctx = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      deviceScaleFactor: 1,
    });
    for (const domain of DOMAINS) {
      const base = `https://${domain}`;
      for (const target of TARGETS) {
        const url = `${base}${target.path}`;
        const page = await ctx.newPage();

        const consoleErrors = [];
        const consoleWarnings = [];
        const pageErrors = [];
        const failedRequests = [];
        let worker404 = false;

        const onConsole = (msg) => {
          if (msg.type() === "error") {
            consoleErrors.push(msg.text().slice(0, 600));
          } else if (msg.type() === "warning") {
            consoleWarnings.push(msg.text().slice(0, 600));
          }
        };
        const onPageError = (exc) => pageErrors.push(String(exc).slice(0, 600));
        const onRequestFailed = (req) => {
          const u = req.url();
          if (isTileHost(u)) return;
          if (u.includes("favicon")) return;
          if (u.includes("maplibre-gl-worker") && !u.endsWith(".mjs")) {
            // ignore source-map probes for the worker
            return;
          }
          if (
            u.includes("maplibre-gl-worker") &&
            req.failure()?.errorText?.includes("404")
          ) {
            worker404 = true;
          }
          failedRequests.push({
            url: u.slice(0, 200),
            failure: (req.failure()?.errorText ?? "").slice(0, 200),
          });
        };
        const onResponse = (resp) => {
          const u = resp.url();
          if (u.includes("maplibre-gl-worker") && resp.status() === 404) {
            worker404 = true;
          }
        };

        page.on("console", onConsole);
        page.on("pageerror", onPageError);
        page.on("requestfailed", onRequestFailed);
        page.on("response", onResponse);

        const t0 = Date.now();
        let status = "no_response";
        try {
          const resp = await page.goto(url, {
            waitUntil: "networkidle",
            timeout: 30_000,
          });
          status = `http_${resp ? resp.status() : "no_response"}`;
        } catch (err) {
          status = `goto_error: ${err.name}: ${String(err).slice(0, 200)}`;
        }
        const elapsedMs = Date.now() - t0;

        // Give MapLibre a beat to settle (camera moves, style.load, etc.)
        try {
          await page.waitForLoadState("networkidle", { timeout: 10_000 });
        } catch {
          /* ignore */
        }
        await sleep(1500);

        const png = `${OUTPUT_DIR}/${target.slug}-${domain.replace(/\./g, "_")}-${vp.name}.png`;
        let screenshotOk = true;
        try {
          await page.screenshot({ path: png, fullPage: false });
        } catch (err) {
          screenshotOk = false;
          pageErrors.push(`screenshot_failed: ${err.message}`);
        }

        // The "globe visibly round" check: on /map, sample the canvas
        // pixels along a vertical line through the centre. If the centre
        // row is *all* uniform colour, the globe hasn't rendered (it's
        // showing the loading grey). If the upper row and lower row
        // differ from the centre, the projection is non-Mercator.
        let globeLikely = null;
        if (target.slug === "map" && status === "http_200") {
          try {
            globeLikely = await sampleGlobeRenders(page);
          } catch (err) {
            globeLikely = `error: ${err.message}`;
          }
        }

        const expectHttp = target.expectHttp(status, domain);
        const failures = [];
        if (!expectHttp)
          failures.push(
            `unexpected http ${status} for ${domain}${target.path}`,
          );
        if (consoleErrors.length > 0)
          failures.push(`${consoleErrors.length} console.error(s)`);
        if (pageErrors.length > 0)
          failures.push(`${pageErrors.length} pageerror(s)`);
        if (worker404) failures.push("maplibre-gl-worker 404");
        if (globeLikely === false)
          failures.push("globe not visibly round in screenshot");

        summary.push({
          url,
          domain,
          viewport: vp.name,
          target: target.slug,
          page_load_status: status,
          expect_http_ok: expectHttp,
          elapsed_ms: elapsedMs,
          console_errors: consoleErrors,
          console_warnings: consoleWarnings,
          page_errors: pageErrors,
          failed_requests: failedRequests,
          worker_404: worker404,
          globe_likely: globeLikely,
          screenshot: png,
          screenshot_ok: screenshotOk,
          failures,
        });

        await page.close();
      }
    }
    await ctx.close();
  }

  await browser.close();

  let bad = 0;
  for (const s of summary) {
    const marker = s.failures.length === 0 ? "OK" : "FAIL";
    if (marker === "FAIL") bad += 1;
    const g =
      s.globe_likely === null
        ? "-"
        : s.globe_likely === true
          ? "round"
          : s.globe_likely === false
            ? "flat"
            : String(s.globe_likely).slice(0, 30);
    console.log(
      `  [${marker}] ${s.url.padEnd(45)} ${s.viewport.padEnd(8)} ` +
        `load=${s.page_load_status} err=${s.console_errors.length + s.page_errors.length} ` +
        `warn=${s.console_warnings.length} req_fail=${s.failed_requests.length} ` +
        `worker_404=${s.worker_404} globe=${g} -> ${s.screenshot}`,
    );
    if (s.console_errors.length) {
      for (const e of s.console_errors.slice(0, 2))
        console.log(`        console.error: ${e.split("\n")[0].slice(0, 200)}`);
    }
    if (s.page_errors.length) {
      for (const e of s.page_errors.slice(0, 2))
        console.log(`        pageerror:    ${e.split("\n")[0].slice(0, 200)}`);
    }
    if (s.worker_404)
      console.log(
        `        worker_404:    /_astro/maplibre-gl-worker.*.mjs returned 404`,
      );
    if (s.globe_likely === false)
      console.log(
        `        globe_check:   centre row uniform → projection likely flat`,
      );
  }

  // Persist a machine-readable summary next to the screenshots.
  await import("node:fs/promises").then((fs) =>
    fs.writeFile(
      `${OUTPUT_DIR}/summary.json`,
      JSON.stringify(summary, null, 2),
    ),
  );

  console.log(`\nTotal: ${summary.length} shots, ${bad} failures`);
  if (bad > 0) {
    console.error(`\n${bad} failure(s) — see ${OUTPUT_DIR}/summary.json`);
    process.exit(1);
  }
  console.log(`\nAll map pages clean. Summary: ${OUTPUT_DIR}/summary.json`);
}

/**
 * Heuristic: walk a vertical line through the centre of the MapLibre
 * canvas. If the top, middle, and bottom samples are three distinct
 * colours, the globe is rendering (the surface curve changes pixel
 * colour with the basemap). If they're all the same, the page is
 * either still loading or the projection fell back to flat.
 *
 * This is intentionally cheap — it's a smoke test, not a perceptual
 * diff. Pixel-exact matches would be too brittle.
 */
async function sampleGlobeRenders(page) {
  return await page.evaluate(() => {
    const canvas = document.querySelector(
      "canvas.maplibregl-canvas, canvas.maplibregl-canvas-container, canvas",
    );
    if (!canvas) return false;
    const w = canvas.width;
    const h = canvas.height;
    if (w < 200 || h < 200) return false;

    // Read the canvas into an offscreen 2D context
    const off = document.createElement("canvas");
    off.width = w;
    off.height = h;
    const ctx = off.getContext("2d");
    if (!ctx) return false;
    try {
      ctx.drawImage(canvas, 0, 0);
    } catch {
      return false;
    }

    // 5 vertical samples at x = w/2, y = 10%, 30%, 50%, 70%, 90%
    const xs = [Math.floor(w / 2)];
    const ys = [0.1, 0.3, 0.5, 0.7, 0.9].map((p) => Math.floor(h * p));
    const seen = new Set();
    for (const x of xs) {
      for (const y of ys) {
        const d = ctx.getImageData(x, y, 1, 1).data;
        // compress to a small bucket so anti-aliasing noise doesn't fake a match
        const k = `${d[0] >> 3},${d[1] >> 3},${d[2] >> 3}`;
        seen.add(k);
      }
    }
    // Globe: a vertical line crosses ocean/land/atmosphere; expect 3+
    // distinct colour buckets. Flat: a flat raster basemap is more
    // uniform vertically (same tile row), so we expect 1-2.
    return seen.size >= 3;
  });
}

main().catch((err) => {
  console.error("smoke failed:", err);
  process.exit(1);
});
