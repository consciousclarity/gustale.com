#!/usr/bin/env node
// Gustale smoke test — checks the live site against the audit findings (2026-11-11).
// Read-only: only GET requests, no sign-in, no writes.
//
// Usage:
//   node gustale-smoke.mjs                      # all checks
//   node gustale-smoke.mjs --wp WP-01           # only checks for one work package
//   node gustale-smoke.mjs --base https://staging.gustale.com
//   node gustale-smoke.mjs --no-browser         # HTTP checks only
//   node gustale-smoke.mjs --json out.json      # also write results as JSON
//
// Browser checks need Playwright:  npm i playwright && npx playwright install chromium
// Exit code: 0 = no FAIL, 1 = at least one FAIL, 2 = the script itself broke.

const args = process.argv.slice(2);
const arg = (n, d) => {
  const i = args.indexOf(n);
  return i >= 0 ? args[i + 1] : d;
};
const BASE = arg("--base", "https://gustale.com").replace(/\/$/, "");
const ONLY_WP = arg("--wp", null);
const JSON_OUT = arg("--json", null);
const NO_BROWSER = args.includes("--no-browser");

const results = [];
const record = (wp, id, status, detail, metric) =>
  results.push({ wp, id, status, detail, metric });
const want = (wp) => !ONLY_WP || ONLY_WP === wp;

async function get(path, opts = {}) {
  // Resolve like a browser on the home page: "/x" → site root, "x" → relative to "/".
  const url = new URL(path, `${BASE}/`).href;
  for (let attempt = 1; ; attempt++) {
    try {
      return await fetch(url, {
        redirect: "follow",
        headers: { "user-agent": "gustale-smoke/1.0" },
        ...opts,
      });
    } catch (e) {
      if (attempt >= 3)
        throw new Error(
          `Network error on ${url}: ${e.cause?.code || e.message}`,
        );
      await new Promise((r) => setTimeout(r, 1000 * attempt));
    }
  }
}
const text = async (p) => (await get(p)).text();
const json = async (p) => (await get(p)).json();
const stripTags = (h) =>
  h
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ");
const dishSlugsIn = (html) =>
  [
    ...new Set(
      [
        ...html.matchAll(
          /href="(?:https:\/\/[^"/]+)?(?:\/[a-z]{2})?\/dishes\/([a-z0-9-]+)\/?"/g,
        ),
      ].map((m) => m[1]),
    ),
  ].filter((s) => s !== "new");

/**
 * Scroll the whole page so that `client:visible` islands hydrate.
 *
 * WHY: Astro's `client:visible` directive only mounts an island when it
 * scrolls into view. The dish page's <AtlasPlaces> island uses it, so a
 * headless check that never scrolls sees the server-rendered fallback
 * ("Loading the associations for Rendang…") forever and reports a
 * stuck loader that does not exist for a real reader.
 *
 * Measured 2026-11-11: before the scroll the loader is present and NO
 * request is made to /api/dishes/<slug>/atlas; after the scroll the
 * island hydrates, the API is called, and the section resolves.
 */
async function hydrateVisibleIslands(page) {
  await page.evaluate(async () => {
    const step = Math.round(window.innerHeight * 0.8);
    const end = Math.max(
      document.body.scrollHeight,
      document.documentElement.scrollHeight,
    );
    for (let y = 0; y < end; y += step) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 250));
    }
    window.scrollTo(0, 0);
    await new Promise((r) => setTimeout(r, 250));
  });
}

/**
 * Wait until the page has stopped changing, instead of waiting a fixed
 * number of milliseconds.
 *
 * WHY: the islands on these pages render a transient empty state while
 * they fetch, then replace it with real content. A fixed sleep samples
 * whichever state it happens to land in, so the same run can report a
 * FAIL and a PASS for the same site on different runs. Waiting for the
 * DOM to stop mutating makes the check measure the SITE, not the
 * timing.
 *
 * `selector`: optional. When given, the wait ends when that element
 * exists AND the DOM has been stable for `stableMs`.
 *
 * `readySelector`: optional. When given, the wait does NOT end until
 * this element exists. This is the signal that matters for the places
 * check: `section.places` exists immediately, but it holds the EMPTY
 * state until `/api/dishes/map` lands and the island fills it in.
 * Waiting for `.places-list` waits for the CONTENT, not the container.
 */
async function settle(
  page,
  selector = null,
  { stableMs = 1200, timeoutMs = 45000, readySelector = null } = {},
) {
  const deadline = Date.now() + timeoutMs;
  let lastHtml = null;
  let stableSince = Date.now();
  while (Date.now() < deadline) {
    const html = await page.content();
    const hasSelector = !selector || (await page.$(selector)) !== null;
    const hasReady = !readySelector || (await page.$(readySelector)) !== null;
    if (hasSelector && hasReady && html === lastHtml) {
      if (Date.now() - stableSince >= stableMs) return true;
    } else {
      stableSince = Date.now();
    }
    lastHtml = html;
    await page.waitForTimeout(400);
  }
  return false;
}

async function allDishes(extra = "") {
  const out = [];
  for (let o = 0; o < 10000; o += 100) {
    const j = await json(
      `/api/dishes?limit=100&offset=${o}&status=published${extra}`,
    );
    out.push(...j.dishes);
    if (!j.hasMore || j.dishes.length === 0) break;
  }
  return out;
}

async function run() {
  const dishes = await allDishes();
  const total = dishes.length;
  const origins = new Set(dishes.map((d) => d.originName).filter(Boolean));
  const familiesInUse = new Set(
    dishes.map((d) => d.familySlug).filter(Boolean),
  );

  // ---------- WP-01: browsing works ----------
  if (want("WP-01")) {
    // Filter links must return a filtered list in the server HTML (works without JavaScript).
    const indoSet = new Set(
      (await allDishes("&region=Indonesia")).map((d) => d.slug),
    );
    const rendang = await text("/dishes/rendang");
    const regionHref = (rendang.match(
      /href="([^"]*(?:region=Indonesia|\/indonesia)[^"]*)"/i,
    ) || [])[1];
    if (!regionHref) {
      record(
        "WP-01",
        "region-link-present",
        "FAIL",
        'No "Same region: Indonesia" link found on /dishes/rendang',
      );
    } else {
      const href = regionHref.replace(/&amp;/g, "&");
      const listed = dishSlugsIn(await text(href)).filter(
        (s) => s !== "rendang",
      );
      const hits = listed.filter((s) => indoSet.has(s)).length;
      const share = listed.length ? hits / listed.length : 0;
      record(
        "WP-01",
        "region-filter-works",
        share >= 0.95 && listed.length >= 10 ? "PASS" : "FAIL",
        `${href} lists ${listed.length} dishes, ${hits} Indonesian (${Math.round(share * 100)}%). Expected ≥95% and ≥10 shown.`,
        { share },
      );
    }
    // Same for a category and technique link from a dish page.
    for (const [label, re] of [
      ["category", /href="([^"]*category=stew[^"]*)"/],
      ["technique", /href="([^"]*technique=[^"]*)"/],
    ]) {
      const m = rendang.match(re);
      if (!m) {
        record(
          "WP-01",
          `${label}-link-present`,
          "WARN",
          `No ${label} link on /dishes/rendang (may have moved to path routes)`,
        );
        continue;
      }
      const h = await text(m[1].replace(/&amp;/g, "&"));
      const first = dishSlugsIn(h).slice(0, 3);
      const globalTop = dishes
        .slice()
        .sort((a, b) => b.viewCount - a.viewCount)
        .slice(0, 3)
        .map((d) => d.slug);
      const unfiltered =
        first.length && first.every((s, i) => s === globalTop[i]);
      record(
        "WP-01",
        `${label}-filter-works`,
        unfiltered ? "FAIL" : "PASS",
        unfiltered
          ? `${m[1]} shows the same first dishes as the unfiltered list (${first.join(", ")})`
          : `${m[1]} differs from the unfiltered list`,
      );
    }
    // Dish list heading must not say "Recipes".
    const list = await text("/dishes");
    const h1 = (list.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i) || [])[1];
    const h1t = h1 ? stripTags(h1).trim() : "";
    record(
      "WP-01",
      "dish-list-heading",
      /recipes/i.test(h1t) ? "FAIL" : "PASS",
      `/dishes H1 = "${h1t}"`,
    );
    // Featured covers referenced by the API must exist.
    const feat = await json("/api/dishes/featured?limit=12");
    const missing = [];
    for (const d of feat.dishes) {
      const u = d.cover?.variantsUrls?.["800"] || d.cover?.publicUrl;
      if (!u) {
        missing.push(`${d.slug}(no cover)`);
        continue;
      }
      const r = await get(u, { method: "HEAD" });
      if (r.status !== 200)
        missing.push(
          `${d.slug}:${r.status} (${new URL(u, `${BASE}/`).pathname})`,
        );
    }
    record(
      "WP-01",
      "featured-cover-files",
      missing.length ? "FAIL" : "PASS",
      missing.length
        ? `Missing: ${missing.join(", ")}`
        : `All ${feat.dishes.length} featured cover files return 200`,
    );
  }

  // ---------- WP-02: indexes match the catalogue ----------
  if (want("WP-02")) {
    const places = stripTags(await text("/regions"));
    const m = places.match(/(\d[\d,]*)\s+countr/i);
    const shown = m ? Number(m[1].replace(/,/g, "")) : null;
    record(
      "WP-02",
      "places-country-count",
      shown === origins.size ? "PASS" : "FAIL",
      `Places page says ${shown ?? "?"} countries; API has ${origins.size} distinct origins`,
      { shown, api: origins.size },
    );
    const indoLine = places.match(/Indonesia\s+(\d+)\s+dish/i);
    const indoApi = dishes.filter((d) => d.originName === "Indonesia").length;
    record(
      "WP-02",
      "places-indonesia-count",
      indoLine && Number(indoLine[1]) === indoApi ? "PASS" : "FAIL",
      `Places shows Indonesia ${indoLine ? indoLine[1] : "?"}; API ${indoApi}`,
    );
    const counts = (await json("/api/atlas/counts")).counts;
    const famCards =
      (await text("/families")).match(/href="[^"]*\/family\/[a-z0-9-]+\/?"/g) ||
      [];
    const famShown = new Set(
      famCards.map((s) => s.match(/family\/([a-z0-9-]+)/)[1]),
    ).size;
    const ok = counts.families === famShown && famShown === familiesInUse.size;
    record(
      "WP-02",
      "family-counts-agree",
      ok ? "PASS" : "FAIL",
      `Home stat ${counts.families} · families page ${famShown} · families in use by dishes ${familiesInUse.size}`,
      { stat: counts.families, page: famShown, inUse: familiesInUse.size },
    );
    record(
      "WP-02",
      "places-stat",
      counts.places > 0 ? "PASS" : "FAIL",
      `atlas/counts places = ${counts.places} (origins in data: ${origins.size})`,
    );
    const sm = await text("/sitemap-en.xml");
    const smDishes = (sm.match(/<loc>[^<]*\/dishes\/[^<]+<\/loc>/g) || [])
      .length;
    record(
      "WP-02",
      "sitemap-dish-count",
      Math.abs(smDishes - total) <= 1 ? "PASS" : "FAIL",
      `sitemap-en dish URLs ${smDishes}; API ${total}`,
    );
    const lin = (await json("/api/lineages")).lineages;
    const smLin = (sm.match(/<loc>[^<]*\/lineages\/[^<]+<\/loc>/g) || [])
      .length;
    record(
      "WP-02",
      "sitemap-lineage-count",
      smLin === lin.length ? "PASS" : "FAIL",
      `sitemap-en lineage URLs ${smLin}; API ${lin.length}`,
    );
  }

  // ---------- WP-03: hide what isn't real ----------
  if (want("WP-03")) {
    const pages = ["/dishes/rendang", "/dishes/feijoada", "/dishes/hummus"];
    for (const p of pages) {
      const t = stripTags(await text(p));
      const probs = [];
      if (/No detailed steps recorded yet/i.test(t))
        probs.push("empty Preparation");
      if (/\bContributors\s*0\b/i.test(t)) probs.push('"Contributors 0"');
      if (/\bVariants\s*0\b/i.test(t)) probs.push('"Variants 0"');
      if (/[\d,]+\s+views/i.test(t))
        probs.push("view count shown (pending Alex decision)");
      record(
        "WP-03",
        `stubs-hidden ${p}`,
        probs.length ? "FAIL" : "PASS",
        probs.length ? probs.join("; ") : "No empty stubs",
      );
    }
    const home = await text("/");
    record(
      "WP-03",
      "no-dead-add-dish-link",
      /gustale\.recipes\/dishes\/new/.test(home) ? "FAIL" : "PASS",
      "Home links to gustale.recipes/dishes/new while recipe submission is unavailable",
    );
    const es = stripTags(await text("/es/dishes/feijoada"));
    const english = [
      "Preparation",
      "Sources",
      "You may also explore",
      "Sign in",
    ].filter((w) => es.includes(w));
    record(
      "WP-03",
      "no-half-translations",
      english.length ? "FAIL" : "PASS",
      english.length
        ? `/es page still has English UI: ${english.join(", ")} (hide or finish the language)`
        : "Spanish page fully translated or hidden",
    );
  }

  // ---------- WP-04: corrections + search ----------
  if (want("WP-04")) {
    const t = await text("/dishes/shark-chutney");
    record(
      "WP-04",
      "correction-link",
      /suggest a (source|correction)|report an error|suggest an edit/i.test(
        stripTags(t),
      )
        ? "PASS"
        : "FAIL",
      'Unevidenced dish page needs a "Suggest a source or correction" link',
    );
    const s = await json("/api/search?q=nasi%20gorang");
    const top = s.groups.find((g) => g.type === "dish")?.results?.[0]?.slug;
    record(
      "WP-04",
      "search-typo-regression",
      top === "nasi-goreng" ? "PASS" : "FAIL",
      `"nasi gorang" → ${top}`,
    );
  }

  // ---------- WP-06 / WP-10: data quality metrics ----------
  if (want("WP-06")) {
    const fam = dishes.filter((d) => d.familySlug).length,
      meth = dishes.filter((d) => d.methodSlug).length;
    const pct = (n) => Math.round((n / total) * 1000) / 10;
    record(
      "WP-06",
      "taxonomy-coverage",
      pct(fam) >= 95 && pct(meth) >= 95 ? "PASS" : "FAIL",
      `family ${pct(fam)}% · method ${pct(meth)}% of ${total} dishes (target ≥95%)`,
      { family: pct(fam), method: pct(meth) },
    );
  }
  if (want("WP-10")) {
    const names = {};
    dishes.forEach((d) => {
      const k = d.canonicalName.trim().toLowerCase();
      if (!names[k]) names[k] = [];
      names[k].push(d.slug);
    });
    const dups = Object.entries(names).filter(([, v]) => v.length > 1);
    record(
      "WP-10",
      "duplicate-names",
      dups.length ? "FAIL" : "PASS",
      dups.length
        ? `${dups.length} duplicated names: ${dups
            .slice(0, 10)
            .map(([k, v]) => `${k} (${v.join(", ")})`)
            .join("; ")}`
        : "No duplicates",
    );
    const vc = dishes.map((d) => d.viewCount);
    const min = Math.min(...vc);
    record(
      "WP-10",
      "view-counts-plausible",
      min > 1000 ? "FAIL" : "PASS",
      `Lowest view count across all ${total} dishes is ${min} — looks seeded`,
    );
    const noCover = dishes.filter((d) => !d.cover).length;
    record(
      "WP-10",
      "covers",
      noCover ? "WARN" : "PASS",
      `${noCover} dishes without a cover image`,
    );
  }

  // ---------- WP-09: lineages ----------
  if (want("WP-09")) {
    const lin = stripTags(await text("/lineages"));
    record(
      "WP-09",
      "lineage-plural",
      /\b1 dishes\b/.test(lin) ? "FAIL" : "PASS",
      '"1 dishes" pluralisation',
    );
    record(
      "WP-09",
      "lineage-empty",
      /\b0 dishes\b/.test(lin) ? "FAIL" : "PASS",
      "Lineages with 0 dishes are listed",
    );
    // Member dishes must link to a specific lineage page (nav link to /lineages does not count).
    const lg = [];
    for (const slug of ["gyoza", "jiaozi", "ramen-japanese"]) {
      const h = await text(`/dishes/${slug}`);
      if (!/href="[^"]*\/lineages\/[a-z0-9-]+\/?"/.test(h)) lg.push(slug);
    }
    record(
      "WP-09",
      "dish-links-lineage",
      lg.length ? "FAIL" : "PASS",
      lg.length
        ? `No link to a specific lineage on: ${lg.join(", ")}`
        : "Member dishes link to their lineage",
    );
    record(
      "WP-09",
      "confidence-defined",
      (await get("/about/confidence")).status === 200 ||
        /Documented\s*[:—-]/.test(stripTags(await text("/about")))
        ? "PASS"
        : "FAIL",
      "A page defining Documented / Likely related / Possible influence",
    );
  }

  // ---------- Browser checks (JavaScript-rendered problems) ----------
  if (!NO_BROWSER && (want("WP-01") || want("WP-05"))) {
    let pw;
    try {
      pw = await import("playwright");
    } catch {
      record("WP-01", "browser-checks", "SKIP", "Playwright not installed");
    }
    if (pw) {
      const browser = await pw.chromium.launch();
      const page = await browser.newPage();
      const bad = [];
      page.on("response", (r) => {
        if (
          r.status() >= 400 &&
          r.url().startsWith(BASE) &&
          !r.url().includes("/api/auth")
        )
          bad.push(`${r.status()} ${r.url().replace(BASE, "")}`);
      });
      if (want("WP-01")) {
        await page.goto(`${BASE}/`, {
          waitUntil: "domcontentloaded",
          timeout: 60000,
        });
        // Wait for the home island to SETTLE, not for a fixed number of
        // milliseconds.
        //
        // Why: the home page's Places section renders an empty state
        // ("No dish in the catalogue has a location yet.") while the
        // island is still fetching, and then replaces it with the real
        // place list. A fixed `waitForTimeout(3000)` samples that
        // transient and reports a FAIL that is not true of the site.
        // Measured 2026-11-11: the empty state is present at 1-3s and
        // gone by 6s, when the section holds 36 place links.
        //
        // `networkidle` is not usable here either — the MapLibre map
        // keeps connections open, so it never settles and the check
        // times out.
        await settle(page, "section.places", { readySelector: ".places-list" });
        const broken = await page.$$eval("img", (imgs) =>
          imgs
            .filter((i) => i.complete && i.naturalWidth === 0)
            .map((i) => i.getAttribute("src")),
        );
        record(
          "WP-01",
          "home-images-render",
          broken.length ? "FAIL" : "PASS",
          broken.length
            ? `${broken.length} broken: ${broken.slice(0, 5).join(", ")}`
            : "All images render",
        );
        record(
          "WP-01",
          "home-http-errors",
          bad.length ? "FAIL" : "PASS",
          bad.length ? bad.slice(0, 8).join(" · ") : "No 4xx/5xx from the site",
        );
        const t = await page.innerText("main");
        record(
          "WP-01",
          "home-places-section",
          /No dish in the catalogue has a location yet/.test(t)
            ? "FAIL"
            : "PASS",
          "Places section on home",
        );
        for (const p of ["/dishes/rendang", "/family/dumpling/"]) {
          await page.goto(BASE + p, {
            waitUntil: "domcontentloaded",
            timeout: 60000,
          });
          // Scroll first: `client:visible` islands (AtlasPlaces) only
          // mount when they enter the viewport. Without this, the check
          // sees the server-rendered loading fallback and reports a
          // stuck loader that a real reader never sees.
          await hydrateVisibleIslands(page);
          await settle(page);
          const body = await page.innerText("body");
          const stuck =
            body.match(/Loading the (associations|taxonomy)[^\n]*/g) || [];
          record(
            "WP-01",
            `no-stuck-loaders ${p}`,
            stuck.length ? "FAIL" : "PASS",
            stuck.length ? stuck.join(" | ") : "All sections resolved",
          );
        }
        // Mobile: does the first screen show any information below the hero?
        const m = await browser.newPage({
          viewport: { width: 375, height: 812 },
          isMobile: true,
        });
        await m.goto(`${BASE}/dishes/rendang`, {
          waitUntil: "domcontentloaded",
          timeout: 60000,
        });
        await settle(m);
        const descTop = await m.evaluate(() => {
          const el = [...document.querySelectorAll("main p")].find((p) =>
            /West Sumatran/.test(p.innerText),
          );
          return el ? el.getBoundingClientRect().top : null;
        });
        record(
          "WP-05",
          "mobile-description-above-fold",
          descTop !== null && descTop < 812 ? "PASS" : "FAIL",
          `Rendang description starts at ${descTop === null ? "?" : Math.round(descTop)}px on a 812px phone screen`,
        );
        await m.close();
      }
      await browser.close();
    }
  }
}

const icon = { PASS: "✅", FAIL: "❌", WARN: "⚠️ ", SKIP: "⏭️ " };
try {
  await run();
} catch (e) {
  console.error("Smoke test crashed:", e.stack || e);
  process.exit(2);
}
const sum = results.reduce((a, r) => {
  a[r.status] = (a[r.status] || 0) + 1;
  return a;
}, {});
console.log(
  `Gustale smoke test · ${BASE} · ${new Date().toISOString()}${ONLY_WP ? ` · ${ONLY_WP}` : ""}\n`,
);
for (const r of results)
  console.log(
    `${icon[r.status]} ${r.wp.padEnd(6)} ${r.id.padEnd(38)} ${r.detail}`,
  );
console.log(
  `\n${Object.entries(sum)
    .map(([k, v]) => `${k} ${v}`)
    .join(" · ")}`,
);
if (JSON_OUT) {
  const fs = await import("node:fs");
  fs.writeFileSync(
    JSON_OUT,
    JSON.stringify(
      {
        base: BASE,
        at: new Date().toISOString(),
        only: ONLY_WP,
        summary: sum,
        results,
      },
      null,
      2,
    ),
  );
}
process.exit(sum.FAIL ? 1 : 0);
