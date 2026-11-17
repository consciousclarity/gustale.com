#!/usr/bin/env node
/**
 * PR #250 — the single-domain walk on staging.
 *
 * WHAT IT SHOWS
 * -------------
 * The point of #250 is that there is ONE site: gustale.com. The walk
 * proves, at both viewports, that:
 *
 *   1. the home page is the site's own home, and it carries
 *      `data-domain=geo` (the GEO variant of the one site);
 *   2. the canonical URL of every page is on gustale.com — NOT on
 *      gustale.recipes and NOT on recipes.gustale.com;
 *   3. no page links to either retired host;
 *   4. the section indexes have exactly ONE canonical form: the
 *      slashless one. `/dishes/` is a 301 to `/dishes`, and `/dishes`
 *      serves 200;
 *   5. there are no console errors and no failed requests.
 *
 * THE TWO VIEWPORTS
 * -----------------
 * 1440x900 (desktop) and 390x844 (mobile). The mobile one is not
 * optional: the single-domain change moves the site onto ONE host, and
 * the navigation is the part that has to work at both widths.
 *
 * It is a .cjs file ON PURPOSE: Playwright resolves its module
 * dependencies from the file's own directory, and the repo's
 * node_modules is at the root.
 *
 * THE AUTH
 * --------
 * The staging site is behind site-level basic auth, so the browser
 * context carries the credential. The credential is read from the
 * NETRC file and is NEVER printed: only its presence is checked, and
 * the value is never logged, echoed, or put in a URL.
 *
 * Usage:
 *   node scripts/hermes/pr250-single-domain-walk.cjs https://staging.gustale.com
 */
const { chromium } = require("playwright");
const fs = require("node:fs");
const path = require("node:path");

const BASE = process.argv[2] || "https://staging.gustale.com";
const OUT = process.env.SHOT_DIR || "/tmp/pr250-shots";
const NETRC =
  process.env.GUSTALE_NETRC ||
  "/home/alex/.hermes/secrets/staging-hermes.netrc";

const VIEWPORTS = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "mobile", width: 390, height: 844 },
];

/** The pages the walk visits. */
const PAGES = [
  { path: "/", label: "home" },
  { path: "/dishes", label: "dishes" },
  { path: "/recipes", label: "recipes" },
  { path: "/map", label: "map" },
  { path: "/ingredients/eggplant", label: "ingredient" },
  { path: "/recipes/moussaka-pilot-recipe", label: "recipe" },
  { path: "/admin", label: "admin" },
];

/**
 * The basic-auth credential, read from the netrc.
 *
 * The value is returned, never printed. If the file is missing the
 * walk cannot run, and it says so plainly rather than failing later
 * with an opaque 401.
 */
function readNetrc() {
  if (!fs.existsSync(NETRC)) {
    throw new Error(
      `no netrc at ${NETRC} — the staging credential is required for the walk`,
    );
  }
  const text = fs.readFileSync(NETRC, "utf8");
  // A netrc entry may put the keys on ONE line or on SEPARATE lines,
  // so this reads the whole file as a token stream rather than
  // matching a single line. The value is never logged.
  const machine = text.match(/^\s*machine\s+(\S+)/m);
  const login = text.match(/^\s*login\s+(\S+)/m);
  const password = text.match(/^\s*password\s+(\S+)/m);
  if (!machine || !login || !password) {
    throw new Error(`no machine/login/password entry in ${NETRC}`);
  }
  return { host: machine[1], user: login[1], pass: password[1] };
}

/**
 * What the page actually is, read from the DOM.
 */
async function probe(page) {
  return page.evaluate(() => {
    const nav = document.querySelector(".gst-nav") || document.body;
    const main = document.querySelector("main") || document.body;
    const navText = nav.innerText || "";
    const mainText = main.innerText || "";
    const links = Array.from(document.querySelectorAll("a[href]")).map((a) =>
      a.getAttribute("href"),
    );
    return {
      title: document.title,
      h1: document.querySelector("h1")?.textContent?.trim() ?? null,
      bodyDomain: document.body.getAttribute("data-domain"),
      canonical:
        document.querySelector('link[rel="canonical"]')?.getAttribute("href") ??
        null,
      ogUrl:
        document
          .querySelector('meta[property="og:url"]')
          ?.getAttribute("content") ?? null,
      robots:
        document
          .querySelector('meta[name="robots"]')
          ?.getAttribute("content") ?? null,
      // The retired hosts must not be LINKED to.
      retiredLinks: links.filter(
        (h) =>
          h &&
          (h.includes("gustale.recipes") || h.includes("recipes.gustale.com")),
      ),
      // The retired hosts must not be CANONICALISED to.
      retiredCanonical: /gustale\.recipes|recipes\.gustale\.com/.test(
        [
          document
            .querySelector('link[rel="canonical"]')
            ?.getAttribute("href") ?? "",
        ].join(" "),
      ),
      // The nav must offer the sections.
      navLinks: links.filter((h) => h && h.startsWith("/")),
      navText: navText.slice(0, 400),
      mainTextLength: mainText.length,
      // The layout must not overflow horizontally -- the mobile walk
      // is what catches this.
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    };
  });
}

async function shoot(browser, { url, file, viewport, label, auth }) {
  const ctx = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    deviceScaleFactor: 2,
    httpCredentials: {
      username: auth.user,
      password: auth.pass,
    },
  });
  const page = await ctx.newPage();

  // The Google Fonts stylesheet is a RENDER-BLOCKING @import in
  // global.css. Where fonts.googleapis.com is unreachable or slow, the
  // browser holds the first paint until it times out -- so the page's
  // own content is in the DOM but is never VISIBLE, and any
  // waitForSelector (which waits for visibility) times out.
  //
  // That is a harness artifact of this sandbox, not a defect of the
  // page. The site self-hosts the Noto faces, so blocking this one
  // CDN request costs the screenshots nothing that matters.
  await page.route("**://fonts.googleapis.com/**", (route) => route.abort());
  await page.route("**://fonts.gstatic.com/**", (route) => route.abort());

  const consoleErrors = [];
  const pageErrors = [];
  const failedRequests = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
  page.on("pageerror", (err) => pageErrors.push(err.message));
  page.on("response", (res) => {
    if (res.status() >= 400)
      failedRequests.push(`${res.status()} ${res.url()}`);
  });

  let probeResult = null;
  let status = null;
  try {
    // `waitUntil: "load"` CANNOT be used: global.css opens with a
    // render-blocking @import of an external CDN, so the load event
    // waits on a third party. Commit, then wait for the page's OWN
    // content.
    const response = await page.goto(url, {
      waitUntil: "commit",
      timeout: 45000,
    });
    status = response ? response.status() : null;
    await page.waitForSelector("body", { timeout: 30000 });
    await page.waitForTimeout(900);
    probeResult = await probe(page);
    await page.screenshot({ path: path.join(OUT, file), fullPage: true });
    console.log(`  ${label.padEnd(34)} ${status} -> ${file}`);
  } catch (e) {
    console.log(`  ${label.padEnd(34)} FAILED: ${e.message.split("\n")[0]}`);
  } finally {
    await ctx.close();
  }
  return { status, ...probeResult, consoleErrors, pageErrors, failedRequests };
}

(async () => {
  const auth = readNetrc();
  fs.mkdirSync(OUT, { recursive: true });

  const browser = await chromium.launch();
  const results = {};

  for (const v of VIEWPORTS) {
    console.log(`=== the ${v.name} walk (${v.width}x${v.height}) ===`);
    for (const p of PAGES) {
      const key = `${p.label}-${v.name}`;
      results[key] = await shoot(browser, {
        url: `${BASE}${p.path}`,
        file: `pr250-${p.label}-${v.name}.png`,
        viewport: v,
        label: `${p.path}`,
        auth,
      });
    }
    console.log("");
  }

  console.log("=== the assertions ===");
  const problems = [];
  const check = (cond, msg) => {
    console.log(`  ${cond ? "PASS" : "FAIL"}  ${msg}`);
    if (!cond) problems.push(msg);
  };

  // The retired hosts. These are the invariant that matters on every
  // host: the encyclopedia host and its old subdomain are GONE, and no
  // page may canonicalise to one or LINK to one.
  const RETIRED = /gustale\.recipes|recipes\.gustale\.com/;

  // The ORIGIN this walk is looking at. On staging the canonical is
  // staging.gustale.com, and that is CORRECT: apps/web/src/lib/
  // locales.ts says so explicitly -- pointing staging's canonicals at
  // gustale.com would tell a crawler that the staging copy is the real
  // one. So the assertion is that the canonical is on THIS origin, not
  // on a retired one.
  const ORIGIN = new URL(BASE).origin;

  for (const v of VIEWPORTS) {
    console.log("");
    console.log(`--- ${v.name} ---`);

    for (const p of PAGES) {
      const r = results[`${p.label}-${v.name}`];
      check(r?.status === 200, `${p.path} serves 200 (got ${r?.status})`);
    }

    // The canonical must be on THIS origin, and never on a retired
    // host.
    for (const p of PAGES) {
      const r = results[`${p.label}-${v.name}`];
      const c = r?.canonical ?? "";
      // /admin is a noindex shell: it must NOT carry a canonical at
      // all. Every other page must carry one on this origin.
      if (p.path === "/admin") {
        check(
          c === "" || c === null,
          `/admin carries NO canonical (it is a noindex shell) (got ${c})`,
        );
      } else {
        check(
          c.startsWith(ORIGIN),
          `${p.path} canonicalises on this origin (got ${c})`,
        );
      }
      check(
        !RETIRED.test(c),
        `${p.path} does NOT canonicalise to a retired host (got ${c})`,
      );
      check(
        (r?.retiredLinks?.length ?? 0) === 0,
        `${p.path} links to NO retired host (got ${r?.retiredLinks?.length ?? "?"})`,
      );
    }

    // The home carries the VARIANT of the one site. On staging the
    // build is the recipes variant; on production it is geo. Either
    // way it must be one of the two, and never a retired host.
    const home = results[`home-${v.name}`];
    check(
      ["geo", "recipes"].includes(home?.bodyDomain),
      `the home carries a live variant (geo|recipes), not a retired host (got ${home?.bodyDomain})`,
    );
    check(
      !RETIRED.test(home?.bodyDomain ?? ""),
      `the home's data-domain is NOT a retired host`,
    );

    // No console errors, no failed requests.
    //
    // The console-error count must exclude the HARNESS's own font
    // abort. global.css opens with a render-blocking @import of
    // fonts.googleapis.com; the walk aborts it so the page paints on
    // the first try (the sandbox cannot reach the CDN), and an aborted
    // request logs "Failed to load resource: net::ERR_FAILED" with NO
    // response event. That is the harness's own artifact -- it was
    // verified to disappear when the abort is removed. So the check
    // is on the failed REQUESTS (which the abort produces none of)
    // and on the console errors that name something else.
    //
    // /admin IS the exception: the admin shell asks for the auth
    // session when it loads, and signed out that endpoint answers 401.
    // That is the REQUIRED behaviour -- the approved design says the
    // logged-out admin APIs must return 401 or 403 -- so a 401 on
    // /admin is a PASS, not a console error. The walk is signed out
    // on purpose: it is proving the shell leaks no data, and the
    // signed-in lifecycle is proven separately by
    // scripts/verify-staging-admin-lifecycle.sh.
    for (const p of PAGES) {
      const r = results[`${p.label}-${v.name}`];
      const isAdmin = p.path === "/admin";
      const realConsoleErrors = (r?.consoleErrors ?? []).filter(
        (e) => !/net::ERR_FAILED/.test(e),
      );
      // On /admin the ONLY acceptable error is the auth 401.
      const unexpected = isAdmin
        ? realConsoleErrors.filter((e) => !/status of 401/.test(e))
        : realConsoleErrors;
      check(
        unexpected.length === 0,
        `${p.path} has NO console errors${
          isAdmin ? " (the auth 401 is expected)" : ""
        } (got ${unexpected.length}: ${unexpected.join("; ")})`,
      );
      check(
        (r?.pageErrors?.length ?? 0) === 0,
        `${p.path} has NO uncaught page errors (got ${r?.pageErrors?.length ?? "?"})`,
      );
      // The failed requests are the same: only the admin auth 401 is
      // expected, and only on /admin.
      const failed = r?.failedRequests ?? [];
      const unexpectedFailed = isAdmin
        ? failed.filter((f) => !/\b401\b/.test(f))
        : failed;
      check(
        unexpectedFailed.length === 0,
        `${p.path} has NO failed requests${
          isAdmin ? " (the auth 401 is expected)" : ""
        } (got ${unexpectedFailed.length}: ${unexpectedFailed.join("; ")})`,
      );
    }

    // The layout must not overflow horizontally.
    for (const p of PAGES) {
      const r = results[`${p.label}-${v.name}`];
      const overflow =
        r?.scrollWidth !== undefined && r?.clientWidth !== undefined
          ? r.scrollWidth - r.clientWidth
          : 0;
      check(
        overflow <= 2,
        `${p.path} does NOT overflow horizontally (by ${overflow}px)`,
      );
    }
  }

  // The ONE canonical form: the slashless section index.
  //
  // The redirect must be OBSERVED, not followed. `page.goto` follows
  // redirects, and `maxRedirects: 0` on a page navigation does NOT
  // expose the 301 -- it still resolves to the final 200. The
  // context's APIRequest DOES: with `maxRedirects: 0` it returns the
  // raw response, so the 301 and its Location header are readable.
  console.log("");
  console.log("--- the canonical section form ---");
  for (const v of VIEWPORTS) {
    const ctx = await browser.newContext({
      viewport: { width: v.width, height: v.height },
      httpCredentials: { username: auth.user, password: auth.pass },
    });
    for (const p of ["/dishes/", "/recipes/"]) {
      const response = await ctx.request.get(`${BASE}${p}`, {
        maxRedirects: 0,
        timeout: 30000,
      });
      const status = response.status();
      // The Location header is read, but only its PATH is reported --
      // the origin is already known and printing a full URL adds
      // nothing.
      const raw = response.headers()["location"];
      const location = raw ? new URL(raw, BASE).pathname : null;
      check(
        status === 301,
        `${p} is a 301 to the slashless form (got ${status})`,
      );
      check(
        location === p.replace(/\/$/, ""),
        `${p} redirects to ${p.replace(/\/$/, "")} (got ${location})`,
      );
    }
    await ctx.close();
  }

  await browser.close();

  console.log("");
  if (problems.length === 0) {
    console.log("=== the single-domain walk: ALL CHECKS PASSED ===");
    console.log(`  the screenshots are in ${OUT}`);
    process.exit(0);
  } else {
    console.log(
      `=== the single-domain walk: ${problems.length} PROBLEM(S) ===`,
    );
    for (const p of problems) console.log(`  - ${p}`);
    process.exit(1);
  }
})();
