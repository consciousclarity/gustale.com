#!/usr/bin/env node
/**
 * A rendered check of the dish page's in-page section nav.
 *
 * WHY THIS EXISTS
 * ---------------
 * The axe gate proves the nav's links are big enough to hit
 * (WCAG 2.2 SC 2.5.8). It does NOT prove the nav is VISIBLE and
 * usable: a link can pass target-size and still be invisible
 * (a colour that matches its background), overlapped by another
 * element, or pushed off-screen at one width.
 *
 * WP-C2 introduced the nav's first ever stylesheet, so the thing
 * that must be checked is that the stylesheet produced a nav a
 * reader can actually use. This script renders the BUILT site at
 * 1440 and 390, and asserts for every nav link:
 *
 *   - it is visible (non-zero box, not `visibility: hidden`)
 *   - its hit box is at least 24x24 CSS px
 *   - its centre point is the topmost element at that point
 *     (so nothing covers it)
 *   - the text is not the same colour as the background behind it
 *     (so it is not invisible)
 *
 * It writes a screenshot per viewport and prints a PASS/FAIL table.
 * Exit 0 = clean, 1 = a check failed.
 *
 * Usage:
 *   node scripts/hermes/dish-nav-render-check.mjs
 *   BASE_URL=https://gustale.com node scripts/hermes/dish-nav-render-check.mjs
 *   OUTPUT_DIR=/tmp/navcheck node scripts/hermes/dish-nav-render-check.mjs
 */
import { createServer } from "node:http";
import { existsSync } from "node:fs";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const REPO = resolve(HERE, "..", "..");
const DIST = join(REPO, "apps", "web", "dist");
const OUTPUT_DIR = process.env.OUTPUT_DIR ?? "/tmp/dish-nav-render-check";
const BASE_URL = process.env.BASE_URL ?? null;

const VIEWPORTS = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "mobile", width: 390, height: 844 },
];

const PATH = "/dishes/empanada";
const MIN_TARGET = 24;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml",
  ".ico": "image/x-icon",
};

function serve(dir) {
  return new Promise((resolveServer) => {
    const server = createServer(async (req, res) => {
      try {
        const url = new URL(req.url, "http://localhost");
        let p = decodeURIComponent(url.pathname);
        let file = join(dir, p);
        if (!existsSync(file) || (await stat(file)).isDirectory()) {
          file = join(file, "index.html");
        }
        const body = await readFile(file);
        res.writeHead(200, {
          "content-type": MIME[extname(file)] ?? "application/octet-stream",
        });
        res.end(body);
      } catch {
        res.writeHead(404);
        res.end("not found");
      }
    });
    server.listen(0, "127.0.0.1", () => {
      resolveServer({ server, port: server.address().port });
    });
  });
}

/** Parse a CSS colour string into r,g,b. Handles rgb()/rgba()/#hex. */
function parseColor(value) {
  if (!value) return null;
  const v = value.trim();
  let m = v.match(/^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/i);
  if (m) return [+m[1], +m[2], +m[3]];
  m = v.match(/^#([0-9a-f]{6})$/i);
  if (m) {
    const n = parseInt(m[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  m = v.match(/^#([0-9a-f]{3})$/i);
  if (m) {
    return [
      parseInt(m[1][0] + m[1][0], 16),
      parseInt(m[1][1] + m[1][1], 16),
      parseInt(m[1][2] + m[1][2], 16),
    ];
  }
  return null;
}

/** Relative luminance, per WCAG 2.x. */
function luminance([r, g, b]) {
  const f = (c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

function contrast(a, b) {
  const l1 = luminance(a);
  const l2 = luminance(b);
  const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}

async function main() {
  await mkdir(OUTPUT_DIR, { recursive: true });

  let base = BASE_URL;
  let server = null;
  if (!base) {
    if (!existsSync(join(DIST, "dishes", "empanada", "index.html"))) {
      console.error(
        "dish-nav-render-check: the built site is missing " +
          "apps/web/dist/dishes/empanada/index.html. Build the geo site first.",
      );
      process.exit(2);
    }
    const s = await serve(DIST);
    server = s.server;
    base = `http://127.0.0.1:${s.port}`;
  }

  const browser = await chromium.launch();
  const failures = [];
  const lines = [];

  try {
    for (const vp of VIEWPORTS) {
      const ctx = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
        deviceScaleFactor: 1,
      });
      const page = await ctx.newPage();
      await page.goto(`${base}${PATH}`, { waitUntil: "networkidle" });

      const links = await page.$$eval("a.dsn__link", (nodes) =>
        nodes.map((el) => {
          const r = el.getBoundingClientRect();
          const cs = getComputedStyle(el);
          return {
            label: (el.textContent ?? "").trim(),
            href: el.getAttribute("href"),
            x: r.x,
            y: r.y,
            w: r.width,
            h: r.height,
            color: cs.color,
            visibility: cs.visibility,
            display: cs.display,
            opacity: cs.opacity,
          };
        }),
      );

      if (links.length === 0) {
        failures.push(`${vp.name}: no a.dsn__link elements found on ${PATH}`);
        lines.push(`  ${vp.name}: NO NAV LINKS FOUND`);
      }

      for (const l of links) {
        const problems = [];

        if (l.w < 1 || l.h < 1) {
          problems.push(`zero-size box (${l.w}x${l.h})`);
        }
        if (l.visibility === "hidden" || l.display === "none") {
          problems.push(`not rendered (visibility=${l.visibility} display=${l.display})`);
        }
        if (Number(l.opacity) === 0) {
          problems.push("opacity 0");
        }
        if (l.w < MIN_TARGET || l.h < MIN_TARGET) {
          problems.push(
            `hit box ${l.w.toFixed(1)}x${l.h.toFixed(1)} below ${MIN_TARGET}x${MIN_TARGET}`,
          );
        }
        // Off-screen horizontally at this viewport.
        if (l.x + l.w < 0 || l.x > vp.width) {
          problems.push(`off-screen horizontally (x=${l.x.toFixed(1)})`);
        }

        // Is the link's own centre the topmost element there?
        const topmost = await page.evaluate(
          ({ sel, index }) => {
            const el = document.querySelectorAll(sel)[index];
            if (!el) return null;
            const r = el.getBoundingClientRect();
            const cx = r.x + r.width / 2;
            const cy = r.y + r.height / 2;
            const stack = document.elementsFromPoint(cx, cy);
            if (!stack.length) return null;
            const hit = stack[0];
            return {
              covered: hit !== el && !el.contains(hit) && !hit.contains(el),
              coveredBy: hit === el ? null : `${hit.tagName}.${hit.className}`,
            };
          },
          { sel: "a.dsn__link", index: links.indexOf(l) },
        );
        if (topmost?.covered) {
          problems.push(`covered by ${topmost.coveredBy}`);
        }

        // Is the text readable against what is behind it?
        const bg = await page.evaluate(
          ({ sel, index }) => {
            const el = document.querySelectorAll(sel)[index];
            if (!el) return null;
            let node = el;
            while (node && node !== document.documentElement) {
              const c = getComputedStyle(node).backgroundColor;
              if (c && !/rgba?\(\s*0\s*,\s*0\s*,\s*0\s*,\s*0\s*\)/.test(c) && c !== "transparent") {
                return c;
              }
              node = node.parentElement;
            }
            return "rgb(255, 255, 255)";
          },
          { sel: "a.dsn__link", index: links.indexOf(l) },
        );
        const fg = parseColor(l.color);
        const bgc = parseColor(bg);
        if (fg && bgc) {
          const ratio = contrast(fg, bgc);
          if (ratio < 4.5) {
            problems.push(
              `text contrast ${ratio.toFixed(2)}:1 against ${bg} (needs 4.5:1)`,
            );
          }
        }

        const mark = problems.length === 0 ? "ok  " : "FAIL";
        lines.push(
          `  [${mark}] ${vp.name.padEnd(7)} ${String(l.label).padEnd(12)} ` +
            `${l.w.toFixed(0)}x${l.h.toFixed(0)}  ${l.color} on ${bg}` +
            (problems.length ? `  -- ${problems.join("; ")}` : ""),
        );
        if (problems.length) {
          failures.push(`${vp.name} / ${l.label}: ${problems.join("; ")}`);
        }
      }

      // A screenshot for the human eye. The nav sits below the fold on
      // a dish page (under the cover hero), so the shot scrolls it
      // into view — a screenshot of only the top of the page would
      // show no nav at all and prove nothing.
      const shot = join(OUTPUT_DIR, `dish-nav-${vp.name}.png`);
      const nav = await page.$("a.dsn__link");
      if (nav) {
        await nav.scrollIntoViewIfNeeded();
        await page.waitForTimeout(300);
      }
      await page.screenshot({ path: shot, fullPage: false });
      await ctx.close();
    }
  } finally {
    await browser.close();
    if (server) server.close();
  }

  const report = {
    path: PATH,
    viewports: VIEWPORTS,
    failures,
    passed: failures.length === 0,
  };
  await writeFile(join(OUTPUT_DIR, "report.json"), JSON.stringify(report, null, 2));

  console.log(`dish-nav-render-check: ${base}${PATH}`);
  console.log(lines.join("\n"));
  console.log();
  if (failures.length === 0) {
    console.log(
      `dish-nav-render-check: PASSED -- every nav link is visible, ` +
        `>=${MIN_TARGET}x${MIN_TARGET}, unobstructed and readable at ` +
        `${VIEWPORTS.map((v) => v.width).join(" and ")}.`,
    );
    console.log(`  screenshots: ${OUTPUT_DIR}`);
    process.exit(0);
  }
  console.log(`dish-nav-render-check: FAILED -- ${failures.length} problem(s):`);
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}

main().catch((e) => {
  console.error("dish-nav-render-check:", e);
  process.exit(2);
});
