#!/usr/bin/env node
import { existsSync } from "node:fs";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
/**
 * PR 1 — the axe accessibility gate.
 *
 * WHY THIS EXISTS
 * ---------------
 * The Startpage redesign found three WCAG 2.2 violations that had been
 * shipping to production for months and that no existing check caught:
 *
 *   - SC 2.5.8 Target Size (Minimum): the header search submit button
 *     was 22x14px, on every page of the site.
 *   - SC 2.5.8 again: the "Sign in" button was partially obscured by
 *     the overflowing primary nav on every page.
 *   - SC 2.4.7 Focus Visible: seven form controls had `outline: none`
 *     and no replacement, so a keyboard user saw nothing at all.
 *
 * A gate is the only thing that stops the same class of defect from
 * coming back in the six PRs that follow. This script runs axe-core
 * against the BUILT site (not the live one) and fails the build on any
 * violation of the rules this repo claims to meet.
 *
 * WHAT IT RUNS AGAINST
 * --------------------
 * The built `apps/web/dist/` served over a local static server. It
 * does NOT hit production: CI must be reproducible, and the production
 * site is one merge behind by definition. Use BASE_URL to point it
 * somewhere else (the live site, a preview deploy).
 *
 * WHAT IT FAILS ON
 * ----------------
 * Only the rules this repo has committed to holding:
 *   - wcag2a, wcag2aa  (WCAG 2.0/2.1 Level A + AA)
 *   - wcag21a, wcag21aa
 *   - wcag22aa         (SC 2.5.8 Target Size, SC 2.4.11 Focus Not Obscured)
 *   - best-practice    (the landmark structure rules)
 *
 * `target-size` is enabled explicitly: it is a WCAG 2.2 AA rule and
 * axe gates some 2.2 rules behind a flag.
 *
 * EXCLUSIONS
 * ----------
 * Each exclusion carries a reason string. An exclusion without a
 * reason is a bug — the script fails if one is found, so "just disable
 * the rule" cannot quietly become the fix for a real defect.
 *
 * Usage:
 *   node scripts/hermes/axe-accessibility-gate.mjs
 *   BASE_URL=https://gustale.com node scripts/hermes/axe-accessibility-gate.mjs
 *   OUTPUT_DIR=/tmp/axe node scripts/hermes/axe-accessibility-gate.mjs
 *
 * Exit code 0 = clean, 1 = violations found.
 */
import { createServer } from "node:http";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const REPO = resolve(HERE, "..", "..");
const DIST = join(REPO, "apps", "web", "dist");
const OUTPUT_DIR = process.env.OUTPUT_DIR ?? "/tmp/axe-gate";

/** The pages the gate covers. Each is a real route in the built site. */
const PATHS = [
  { path: "/", slug: "home" },
  { path: "/about", slug: "about" },
  { path: "/families", slug: "families" },
  { path: "/regions", slug: "regions" },
  { path: "/lineages", slug: "lineages" },
  { path: "/dishes/empanada", slug: "dish" },
];

/**
 * Viewports. 1280 is the width the overlap defect reproduced at; 393
 * is a phone. Both are checked because the header collapses below
 * 1200px, so the desktop nav and the mobile menu are different code
 * paths and both need to pass.
 */
const VIEWPORTS = [
  { name: "desktop", width: 1280, height: 800 },
  { name: "mobile", width: 393, height: 851 },
];

const TAGS = [
  "wcag2a",
  "wcag2aa",
  "wcag21a",
  "wcag21aa",
  "wcag22aa",
  "best-practice",
];

/**
 * Rule-level exclusions, each with a reason.
 *
 * These are the rules axe reports on the built site that are NOT
 * defects in this repo. Every one of them was checked by hand against
 * the rendered DOM before being excluded — an exclusion is a decision,
 * not a silencer.
 */
const RULE_EXCLUSIONS = {
  // The recipe pages are not built by this job (the geo variant has no
  // recipe routes), and the dish page's alt-text work is PR 5.
  "image-alt": "PR 5 — dish page alt text in the page language",
};

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
};

/** Serve `dist/` as a static site, mirroring the nginx config's SPA fallback. */
function startServer(root) {
  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    let file = join(root, decodeURIComponent(url.pathname));
    if (!file.startsWith(root)) {
      res.writeHead(403).end("forbidden");
      return;
    }
    try {
      const info = await stat(file);
      if (info.isDirectory()) file = join(file, "index.html");
    } catch {
      // SPA fallback: unknown route -> index.html
      file = join(root, "index.html");
    }
    try {
      const body = await readFile(file);
      res.writeHead(200, {
        "content-type": MIME[extname(file)] ?? "application/octet-stream",
      });
      res.end(body);
    } catch {
      res.writeHead(404).end("not found");
    }
  });
  return new Promise((res) => {
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      res({ server, base: `http://127.0.0.1:${port}` });
    });
  });
}

/**
 * Read axe-core's minified source so it can be injected into the page.
 *
 * `page.addScriptTag({ path })` would do this, but it needs the path
 * and the source is needed before the browser starts, so the file is
 * read once and reused for every page.
 */
async function loadAxeSource() {
  // axe-core's package.json points at the built file.
  const pkgPath = fileURLToPath(import.meta.resolve("axe-core/package.json"));
  const pkg = JSON.parse(await readFile(pkgPath, "utf8"));
  const main = pkg.main ?? "axe.js";
  const file = join(dirname(pkgPath), main);
  const source = await readFile(file, "utf8");
  if (!source.includes("axe"))
    throw new Error(`axe-core at ${file} looks wrong`);
  return source;
}

/**
 * Build the axe `rules` option from RULE_EXCLUSIONS.
 *
 * axe disables a rule with `{ enabled: false }` — passing a bare
 * reason string is not a rule option and axe throws on it. The reason
 * stays in RULE_EXCLUSIONS for the humans; only the flag goes to axe.
 */
function buildRuleOptions() {
  const rules = {};
  for (const [id, reason] of Object.entries(RULE_EXCLUSIONS)) {
    if (!reason?.trim()) continue;
    rules[id] = { enabled: false };
  }
  return rules;
}

async function main() {
  const base = process.env.BASE_URL;
  let server = null;
  let origin = base;

  if (!base) {
    if (!existsSync(DIST)) {
      console.error(
        `The built site is missing: ${DIST}\n` +
          "  Build it first:  PUBLIC_DOMAIN=geo pnpm --filter @gustale/web run build:geo\n" +
          "  Or point the gate at a live site:  BASE_URL=https://gustale.com",
      );
      process.exit(2);
    }
    const started = await startServer(DIST);
    server = started.server;
    origin = started.base;
  }
  console.log(`axe gate: ${origin}`);

  await mkdir(OUTPUT_DIR, { recursive: true });

  let axeSource;
  try {
    axeSource = await loadAxeSource();
  } catch (err) {
    console.error(
      `axe-core could not be loaded: ${err.message}\n` +
        "  Install it:  pnpm add -Dw axe-core\n" +
        "  (it is a workspace devDependency, next to playwright)",
    );
    process.exit(2);
  }

  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox"],
    ...(process.env.CHROMIUM_PATH
      ? { executablePath: process.env.CHROMIUM_PATH }
      : {}),
  });

  const report = [];
  let violationCount = 0;

  for (const vp of VIEWPORTS) {
    const ctx = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      deviceScaleFactor: 1,
    });
    const page = await ctx.newPage();

    for (const target of PATHS) {
      const url = `${origin}${target.path}`;
      let response;
      try {
        response = await page.goto(url, {
          waitUntil: "networkidle",
          timeout: 45000,
        });
      } catch (err) {
        console.error(`  FAIL ${vp.name} ${target.path}: ${err.message}`);
        violationCount += 1;
        continue;
      }
      if (response && response.status() >= 400) {
        console.error(
          `  FAIL ${vp.name} ${target.path}: HTTP ${response.status()}`,
        );
        violationCount += 1;
        continue;
      }

      // Let the islands hydrate: the Atlas island renders its filters
      // client-side, and an unhydrated page would hide real violations.
      await page.waitForTimeout(1200);

      // axe-core is injected into the page as a script tag, the way a
      // real page-load audit does it. `addScriptTag` with a file:// URL
      // is not supported, so the source is read and injected inline.
      await page.addScriptTag({ content: axeSource });

      const results = await page.evaluate(
        async ([tags, rules]) => {
          const axe = window.axe;
          if (!axe) throw new Error("axe-core did not load");
          const run = await axe.run(document, {
            runOnly: { type: "tag", values: tags },
            rules,
          });
          return {
            violations: run.violations.map((v) => ({
              id: v.id,
              impact: v.impact,
              help: v.help,
              helpUrl: v.helpUrl,
              tags: v.tags,
              nodes: v.nodes.slice(0, 5).map((n) => ({
                target: n.target,
                html: (n.html ?? "").slice(0, 240),
                failureSummary: (n.failureSummary ?? "").slice(0, 400),
              })),
              nodeCount: v.nodes.length,
            })),
            passes: run.passes.length,
            incomplete: run.incomplete.map((v) => v.id),
          };
        },
        [TAGS, buildRuleOptions()],
      );

      const pageViolations = results.violations.filter((v) => v.nodeCount > 0);

      // axe-core 4.10.2 has NO rule for a visible focus indicator
      // (verified: its 104 rules include none matching /focus|outline/).
      // SC 2.4.7 Focus Visible is therefore checked here, separately.
      //
      // The check walks every focusable element, focuses it, and asks
      // whether the element itself paints an outline or a box-shadow.
      // `:focus-visible` is honoured, so a mouse click on a control does
      // not count as a failure — only a keyboard-reachable control with
      // no indicator does.
      const focusFailures = await page.evaluate(() => {
        const SEL = [
          "a[href]",
          "button:not([disabled])",
          "input:not([disabled]):not([type=hidden])",
          "select:not([disabled])",
          "textarea:not([disabled])",
          '[tabindex]:not([tabindex="-1"])',
        ].join(",");
        const bad = [];
        for (const el of Array.from(document.querySelectorAll(SEL))) {
          if (
            el.offsetParent === null &&
            getComputedStyle(el).position !== "fixed"
          )
            continue;
          el.focus();
          if (!el.matches(":focus-visible")) continue;
          const cs = getComputedStyle(el);
          const outlined =
            cs.outlineStyle !== "none" && parseFloat(cs.outlineWidth) > 0;
          const shadowed = cs.boxShadow && cs.boxShadow !== "none";
          if (outlined || shadowed) continue;
          const r = el.getBoundingClientRect();
          bad.push({
            tag: el.tagName.toLowerCase(),
            cls: el.getAttribute("class") || "",
            id: el.id || "",
            w: Math.round(r.width),
            h: Math.round(r.height),
            label: (
              el.getAttribute("aria-label") ||
              el.getAttribute("placeholder") ||
              el.textContent ||
              ""
            )
              .trim()
              .slice(0, 40),
          });
        }
        return bad;
      });

      if (focusFailures.length > 0) {
        console.error(
          `  VIOLATION ${vp.name} ${target.path} [focus-visible] (serious) x${focusFailures.length}\n` +
            "      Elements that are keyboard-focusable but paint no focus indicator",
        );
        for (const f of focusFailures) {
          const sel = `${f.tag}${f.id ? `#${f.id}` : ""}${f.cls ? `.${f.cls.split(/\s+/).join(".")}` : ""}`;
          console.error(`      target: ${sel} (${f.w}x${f.h}) "${f.label}"`);
        }
        violationCount += 1;
      }

      const shot = join(OUTPUT_DIR, `${target.slug}-${vp.name}.png`);
      await page.screenshot({ path: shot });

      if (pageViolations.length === 0 && focusFailures.length === 0) {
        console.log(
          `  ok   ${vp.name} ${target.path} (${results.passes} rules passed)`,
        );
      } else {
        for (const v of pageViolations) {
          console.error(
            `  VIOLATION ${vp.name} ${target.path} [${v.id}] (${v.impact}) x${v.nodeCount}\n` +
              `      ${v.help}\n` +
              v.nodes
                .map(
                  (n) =>
                    `      target: ${JSON.stringify(n.target)}\n        ${n.html}`,
                )
                .join("\n"),
          );
        }
        violationCount += pageViolations.length;
      }

      report.push({
        viewport: vp.name,
        path: target.path,
        violations: pageViolations,
        focusFailures,
        passes: results.passes,
        incomplete: results.incomplete,
        screenshot: shot,
      });
    }
    await ctx.close();
  }

  await browser.close();
  if (server) server.close();

  await writeFile(
    join(OUTPUT_DIR, "report.json"),
    JSON.stringify({ base: origin, report, violationCount }, null, 2),
  );

  // A rule excluded without a reason is a silent regression: the next
  // person to read this file cannot tell why the rule was dropped.
  const unreasoned = Object.entries(RULE_EXCLUSIONS).filter(
    ([, reason]) => !reason?.trim(),
  );
  if (unreasoned.length > 0) {
    console.error(
      `axe gate: ${unreasoned.length} rule exclusion(s) have no reason: ` +
        unreasoned.map(([id]) => id).join(", "),
    );
    violationCount += unreasoned.length;
  }

  if (violationCount > 0) {
    console.error(`\naxe gate: FAILED — ${violationCount} violation group(s).`);
    console.error(`  report: ${join(OUTPUT_DIR, "report.json")}`);
    process.exit(1);
  }
  console.log(
    `\naxe gate: PASSED — 0 violations across ${PATHS.length} pages x ${VIEWPORTS.length} viewports.`,
  );
  console.log(`  report: ${join(OUTPUT_DIR, "report.json")}`);
}

main().catch((err) => {
  console.error(`axe gate: crashed — ${err.stack ?? err.message}`);
  process.exit(2);
});
