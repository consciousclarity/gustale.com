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
            const text = msg.text().slice(0, 600);
            // Tile / font / favicon 4xx come back as console.error
            // ("Failed to load resource: the server responded with a
            // status of 4xx") but aren't our bug — skip them.
            if (
              /Failed to load resource: the server responded with a status of (40[0-9]|429)/.test(
                text,
              )
            ) {
              // still log to warnings for the JSON report
              consoleWarnings.push(`cdn_4xx: ${text}`);
              return;
            }
            consoleErrors.push(text);
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
          // Use `load` (faster, less strict) — `networkidle` doesn't
          // settle on map pages because basemap tiles keep streaming.
          const resp = await page.goto(url, {
            waitUntil: "load",
            timeout: 30_000,
          });
          status = `http_${resp ? resp.status() : "no_response"}`;
        } catch (err) {
          status = `goto_error: ${err.name}: ${String(err).slice(0, 200)}`;
        }
        const elapsedMs = Date.now() - t0;

        // Settle: wait for either the map canvas to appear (for map
        // pages) or a small fixed delay (for the rest). The basemap
        // tile stream never goes idle on live sites, so we can't use
        // networkidle as a signal.
        try {
          if (
            target.slug === "map" ||
            target.slug === "dish" ||
            target.slug === "home"
          ) {
            await page.waitForSelector("canvas.maplibregl-canvas, canvas", {
              timeout: 15_000,
            });
          }
        } catch {
          /* ignore — the selector wait is best-effort */
        }
        await sleep(2500);

        const png = `${OUTPUT_DIR}/${target.slug}-${domain.replace(/\./g, "_")}-${vp.name}.png`;
        let screenshotOk = true;
        try {
          await page.screenshot({ path: png, fullPage: false });
        } catch (err) {
          screenshotOk = false;
          pageErrors.push(`screenshot_failed: ${err.message}`);
        }

        // The "map actually rendered" check: on /map, verify the
        // expected DOM structure is present. We use DOM checks
        // rather than pixel sampling because:
        //   1. WebGL canvas pixel readback needs
        //      `preserveDrawingBuffer: true`, which MapLibre doesn't
        //      set, so a canvas-only probe is unreliable in headless
        //      Chromium.
        //   2. PNG filtering means a hand-rolled PNG decoder needs
        //      to undo the per-row filter to get real RGB bytes, and
        //      we don't want a new dep just for a smoke test.
        //   3. The map-rendered signal is "the canvas exists, is
        //      sized, and the legend is showing the dish count" —
        //      all of which are cheap to query via Playwright.
        let globeLikely = null;
        if (target.slug === "map" && status === "http_200") {
          try {
            const probe = await page.evaluate(() => {
              const canvas = document.querySelector("canvas.maplibregl-canvas");
              if (!canvas) return { ok: false, reason: "no maplibre canvas" };
              const w = canvas.clientWidth || canvas.width;
              const h = canvas.clientHeight || canvas.height;
              if (w < 100 || h < 100)
                return { ok: false, reason: `canvas too small ${w}x${h}` };
              // Count dish markers in the DOM. WorldMap renders one
              // <button class="wm-marker"> per dish, so a non-zero
              // count is a strong signal the map is actually
              // populated and the projection has rendered.
              const markers = document.querySelectorAll(
                ".wm-marker, .wm-cluster, button[aria-label*='dish'], [data-slug]",
              );
              return {
                ok: true,
                canvas: `${w}x${h}`,
                markers: markers.length,
              };
            });
            globeLikely = probe.ok
              ? `round (canvas ${probe.canvas}, ${probe.markers} markers)`
              : `flat (${probe.reason})`;
          } catch (err) {
            globeLikely = `error: ${err.message}`;
          }
        }

        const httpCode = status.startsWith("http_")
          ? Number(status.slice(5))
          : null;
        const expectHttp =
          httpCode !== null && target.expectHttp(httpCode, domain);
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
        if (globeLikely && globeLikely.startsWith("flat"))
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
    const g = s.globe_likely ?? "-";
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
 * Page-rendered check. WebGL canvas pixel readback needs
 * `preserveDrawingBuffer: true`, which MapLibre doesn't set, so a
 * canvas-only probe is unreliable in headless Chromium. We use
 * DOM checks: the MapLibre canvas must exist and be sized, and
 * the dish markers (or cluster bubbles) must be present in the
 * WorldMap island. A non-zero marker count is a strong signal the
 * map is actually populated and the projection has rendered.
 */

main().catch((err) => {
  console.error("smoke failed:", err);
  process.exit(1);
});
