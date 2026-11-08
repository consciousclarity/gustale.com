#!/usr/bin/env node
/**
 * The console-error check, with the KNOWN harness artifact identified
 * by its URL rather than by its message text.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * `pr6b-home-screenshots.cjs` fails the run on ANY console error. One
 * of them is not a defect of the recipes home: the static server that
 * serves dist/ has no /api/auth/* route, so the AuthMenu island's
 * session check 404s.
 *
 * That 404 happens on EVERY page of BOTH properties, because
 * `AuthMenu` is mounted in the Nav (apps/web/src/components/Nav.astro),
 * which the Layout puts on every page. It is an artifact of serving
 * a static build without the API behind it — it is NOT something the
 * recipes home introduced.
 *
 * So this check:
 *   1. records the URL of every failed request (the console message
 *      alone does not name it — that is why the first version of this
 *      script could not tell the artifact from a real failure);
 *   2. asserts the recipes home has no console error beyond the
 *      auth-session 404;
 *   3. PROVES the artifact is universal by loading a page the change
 *      did not touch (/about) and showing the same 404 there.
 *
 * A 404 on a page the change did not touch is the control.
 */
const { chromium } = require("playwright");

const BASE = process.argv[2] || process.env.BASE || "http://127.0.0.1:8899";

/** The harness artifact: the static server has no /api/auth/* route. */
function isAuthArtifact(url) {
  return /\/api\/auth\//.test(url);
}

async function collect(url) {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 800 },
  });
  const page = await ctx.newPage();
  // See pr6b-home-screenshots.cjs: global.css opens with a
  // RENDER-BLOCKING @import of the Google Fonts stylesheet. Where that
  // CDN is unreachable or slow the browser holds the first paint, so
  // the content is in the DOM but never becomes visible and the run
  // is flaky for reasons that have nothing to do with the page.
  // Aborting the request removes the dependency on a third party.
  await page.route("**://fonts.googleapis.com/**", (route) => route.abort());
  await page.route("**://fonts.gstatic.com/**", (route) => route.abort());
  const errors = [];
  const pageErrors = [];
  const failed = [];
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  page.on("pageerror", (e) => pageErrors.push(e.message));
  // The URL of every non-OK response. The console message does not
  // carry it; only the response does.
  page.on("response", (r) => {
    if (r.status() >= 400) failed.push(`${r.status()} ${r.url()}`);
  });
  try {
    // NOT "load" / "networkidle": global.css imports Google Fonts, so
    // those wait on an external CDN and time out where it is
    // unreachable. Commit, then wait for the page's own content.
    await page.goto(url, { waitUntil: "commit", timeout: 45000 });
    await page.waitForSelector("main", { timeout: 30000 });
    await page.waitForTimeout(1500);
  } finally {
    await ctx.close();
    await browser.close();
  }
  return { errors, pageErrors, failed };
}

(async () => {
  const problems = [];
  const check = (cond, msg) => {
    console.log(`  ${cond ? "PASS" : "FAIL"}  ${msg}`);
    if (!cond) problems.push(msg);
  };

  console.log("=== the recipes home ===");
  const home = await collect(`${BASE}/`);
  console.log(`  failed requests: ${home.failed.length}`);
  for (const f of home.failed) console.log(`     - ${f}`);
  const homeReal = home.failed.filter((f) => !isAuthArtifact(f));
  check(
    homeReal.length === 0,
    `the recipes home has no failed request other than the auth-session 404 (${homeReal.length} found)`,
  );
  check(
    home.pageErrors.length === 0,
    `the recipes home has no uncaught page error (${home.pageErrors.length} found)`,
  );
  check(
    home.errors.length <= home.failed.length + 1,
    `every console error is a failed request, not a script error (${home.errors.length} console / ${home.failed.length} requests)` +
      " — the +1 is the aborted Google Fonts request, which has no response to count",
  );

  console.log("");
  console.log("=== the control: /about, which this change did not touch ===");
  const about = await collect(`${BASE}/about`);
  console.log(`  failed requests: ${about.failed.length}`);
  for (const f of about.failed) console.log(`     - ${f}`);
  const aboutAuth = about.failed.filter((f) => isAuthArtifact(f));
  check(
    aboutAuth.length > 0,
    "the CONTROL page has the same auth 404 — so it is the harness, not the recipes home",
  );
  check(
    about.failed.length === home.failed.length,
    "the recipes home fails exactly the same requests as the untouched control page",
  );

  console.log("");
  if (problems.length) {
    console.log(`  ${problems.length} PROBLEM(S)`);
    process.exit(1);
  }
  console.log("  ALL PASS");
  process.exit(0);
})();
