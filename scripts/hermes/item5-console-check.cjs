#!/usr/bin/env node
/**
 * The CONSOLE CHECK for item 5, with a CONTROL page.
 *
 * WHAT THIS PROVES
 * ----------------
 * That the recipe hub and the recipe page load with no console error,
 * no uncaught page error, and no failed request beyond the ones the
 * HARNESS itself causes.
 *
 * WHY THERE IS A CONTROL PAGE
 * ---------------------------
 * The static server that serves the built dist has no /api/* routes.
 * The AuthMenu island in the Nav asks the API for the session on EVERY
 * page of BOTH properties, so it 404s on every page.
 *
 * That 404 is an artifact of the harness, not a defect of the recipe
 * pages — but a check that cannot tell the artifact from a real
 * failure is not a check. So this script:
 *
 *   1. records the URL of every failed request (the console message
 *      alone does not name it — that is why the first version of the
 *      6b check could not tell the artifact from a real failure);
 *   2. asserts the recipe pages have no failed request beyond the
 *      known artifacts;
 *   3. PROVES the artifact is universal by loading a page this change
 *      did not touch (/about) and showing the same 404 there.
 *
 * A 404 on a page the change did not touch IS the control.
 *
 * AND IT PROVES THE CHECK CAN FAIL
 * ---------------------------------
 * A check that cannot fail is not a check. So the LAST step loads a
 * page that is KNOWN to be broken — the mock API's own error page is
 * not in the dist, so instead this asserts the mechanism works by
 * pointing the same collector at a URL that does not exist and
 * confirming the collector DOES report a failure for it. If the
 * collector ever stopped reporting failures, this step fails.
 *
 * Usage:
 *   node scripts/hermes/item5-console-check.cjs <base-url>
 */
const { chromium } = require("playwright");

const BASE = process.argv[2] || process.env.BASE || "http://127.0.0.1:8899";
// "empty" or "populated" — which build the server under test is serving.
//
// It changes ONE thing: on the EMPTY build there is no published
// recipe, so /recipes/<slug> is a 404 — and that 404 is the CORRECT
// answer, not a failure. The check states that expectation explicitly
// instead of guessing it, so a page that was expected to be a 404 and
// served a 200 (or the reverse) is caught.
const MODE = process.argv[3] || process.env.CHECK_MODE || "empty";

/**
 * The harness artifacts: failures the STATIC SERVER causes, on every
 * page of both properties.
 *
 *   /api/auth/get-session — the AuthMenu island asks the API for the
 *     session on every page, and the static server has no API.
 *
 *   fonts.gstatic / fonts.googleapis — the stylesheet is a
 *     render-blocking @import of a CDN, and this sandbox cannot reach
 *     it, so the request is aborted deliberately (see below).
 */
function isHarnessArtifact(url) {
  return (
    /\/api\/auth\//.test(url) || /fonts\.g/.test(url) || /favicon/.test(url)
  );
}

async function collect(url, { viewport } = {}) {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: viewport ?? { width: 1280, height: 800 },
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
  // The HTTP status of the page itself. 404 is a legitimate answer for
  // a page that does not exist publicly, so the check has to be able to
  // see it.
  let status = 0;
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
    const response = await page.goto(url, {
      waitUntil: "commit",
      timeout: 45000,
    });
    status = response ? response.status() : 0;
    await page.waitForSelector("main", { timeout: 30000 });
    await page.waitForTimeout(1500);
  } catch (err) {
    // A navigation that never completes IS a failure, and the reason
    // has to be visible — a silent catch would turn a broken page into
    // a green run.
    errors.push(`navigation failed: ${err.message.split("\n")[0]}`);
  } finally {
    await ctx.close();
    await browser.close();
  }
  return { errors, pageErrors, failed, status };
}

(async () => {
  const problems = [];
  const check = (cond, msg) => {
    console.log(`  ${cond ? "PASS" : "FAIL"}  ${msg}`);
    if (!cond) problems.push(msg);
  };

  const PAGES = [
    { path: "/dishes/moussaka-greek", label: "the recipe hub" },
    {
      path: "/recipes/moussaka-greek-classic",
      label: "the recipe page",
      // On the EMPTY build there is no published recipe, so the recipe
      // page is a 404 — and that is the correct answer.
      expect404: MODE === "empty",
    },
  ];

  for (const p of PAGES) {
    console.log(`=== ${p.label} (${BASE}${p.path}) ===`);
    const r = await collect(`${BASE}${p.path}`);
    console.log(`  failed requests: ${r.failed.length}`);
    for (const f of r.failed) console.log(`     - ${f}`);
    const real = r.failed.filter((f) => !isHarnessArtifact(f));
    // THE PAGE'S OWN 404 IS THE ANSWER, NOT A FAILURE — but only for a
    // page that is EXPECTED to be a 404.
    //
    // On the EMPTY build there is no published recipe, so
    // /recipes/<slug> is a 404 and that 404 is the correct behaviour.
    // A check that flagged it would be flagging the page for answering
    // correctly.
    //
    // The expectation is declared per page, and it is asserted that the
    // page answered the way it was supposed to — so a page that was
    // EXPECTED to be a 404 but served a 200 (or the reverse) is caught.
    const expected404 = p.expect404 === true;
    const selfFailures = real.filter(
      (f) => !(expected404 && f.startsWith("404 ")),
    );
    check(
      selfFailures.length === 0,
      `${p.label} has no failed request beyond the harness artifacts (${selfFailures.length} found)` +
        (selfFailures.length
          ? `: ${selfFailures.slice(0, 3).join(" | ")}`
          : ""),
    );
    // AND the page answered the way it was supposed to.
    //
    // Without this, `expect404: true` would silently accept a page that
    // served a 200 — and the check would be hiding the very thing it
    // exists to catch. So the STATUS is asserted, not just the absence
    // of a failure.
    const selfStatus = r.status;
    if (expected404) {
      check(
        selfStatus === 404,
        `${p.label} answers 404 — an unpublished recipe is not a page (got ${selfStatus})`,
      );
    } else {
      check(
        selfStatus === 200,
        `${p.label} answers 200 — a published recipe is a page (got ${selfStatus})`,
      );
    }
    check(
      r.pageErrors.length === 0,
      `${p.label} has no uncaught page error (${r.pageErrors.length} found)`,
    );
    check(
      r.errors.length <= r.failed.length + 1,
      `every console error on ${p.label} is a failed request, not a script error (${r.errors.length} console / ${r.failed.length} requests)` +
        " — the +1 is the aborted Google Fonts request, which has no response to count",
    );
    console.log("");
  }

  console.log("=== the control: /about, which this change did not touch ===");
  const about = await collect(`${BASE}/about`);
  console.log(`  failed requests: ${about.failed.length}`);
  for (const f of about.failed) console.log(`     - ${f}`);
  const aboutAuth = about.failed.filter((f) => isHarnessArtifact(f));
  check(
    aboutAuth.length > 0,
    "the CONTROL page has the same harness artifact — so it is the harness, not the recipe pages",
  );
  console.log("");

  console.log("=== the check can FAIL: a URL that does not exist ===");
  // If this ever stops reporting a failure, the whole check has gone
  // blind — so it is asserted, not assumed.
  const missing = await collect(`${BASE}/this-page-does-not-exist-item5`);
  const missingReal = missing.failed.filter((f) => !isHarnessArtifact(f));
  check(
    missingReal.length > 0,
    "the collector DOES report a failure for a broken URL — so a clean run means a clean page",
  );
  console.log("");

  if (problems.length) {
    console.log(`  ${problems.length} PROBLEM(S)`);
    process.exit(1);
  }
  console.log("  ALL PASS");
  process.exit(0);
})();
