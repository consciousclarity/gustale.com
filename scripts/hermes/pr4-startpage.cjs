#!/usr/bin/env node
/**
 * PR 4 — verify the Startpage rebuild from the RENDERED DOM.
 *
 * WHY THE DOM AND NOT A SCREENSHOT
 * --------------------------------
 * The screenshot of this page was once read by a vision model that
 * described an entirely different website — the kind of failure that
 * produces a confident, wrong report. The DOM does not do that. Every
 * number this script prints was read out of the rendered document, so
 * it can be trusted and re-checked.
 *
 * WHAT IT CHECKS
 *
 *   1. The featured row exists and holds exactly TWELVE cards.
 *   2. Every featured card has a photo, a definition, an origin and a
 *      family — the rule, verified on what was actually rendered.
 *   3. NO featured card is a drink.
 *   4. There is NO drinks ROW and NO drinks entry point in the hero.
 *   5. There is NO MAP in the HERO BAND — the map is out of scope
 *      there, and the places list is the fallback.
 *
 *      The map in the WORKSPACE (the four explore tabs: atlas, index,
 *      gallery, feed) is a different thing and is left alone. The
 *      decision "the map is out of scope" is written under the
 *      Startpage section of the redesign proposal; the workspace is
 *      the filtering tool, and its atlas tab is one of four ways to
 *      look at the same filtered set. This script checks the HERO
 *      BAND, and says so, rather than asserting that the word
 *      "canvas" appears nowhere on the page.
 *   6. The places list EXISTS and is a text list of links.
 *   7. NO counter renders as a dash. A dash is not a number.
 *   8. Every counter's plural agrees with its number.
 *   9. Every featured card has exactly ONE link.
 *
 * Usage: node scripts/hermes/pr4-startpage.cjs <baseUrl>
 */

const { chromium } = require("playwright");

const BASE = process.argv[2] ?? "http://127.0.0.1:8899";

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: 1280, height: 900 },
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });

  await page.goto(`${BASE}/`, { waitUntil: "networkidle", timeout: 60000 });
  // The featured row is fetched by the island, so wait for it.
  await page
    .waitForSelector(".featured-grid .featured-card", { timeout: 30000 })
    .catch(() => {});
  await page.waitForTimeout(1200);

  const result = await page.evaluate(() => {
    const text = (el) => (el?.textContent ?? "").replace(/\s+/g, " ").trim();

    // ── the featured row ────────────────────────────────────────
    const cards = Array.from(
      document.querySelectorAll(".featured-grid .featured-card"),
    );
    const featured = cards.map((c) => ({
      name: text(c.querySelector(".featured-name")),
      family: text(c.querySelector(".featured-family")),
      origin: text(c.querySelector(".featured-origin")),
      definition: text(c.querySelector(".featured-def")),
      hasImg: !!c.querySelector("img.featured-img"),
      links: c.querySelectorAll("a").length,
      // The editorial content type, read off the element. The API
      // excludes drinks from this row; this reads that decision back
      // out of the RENDERED page, so the rule is checked where it
      // matters and not only where it is written.
      contentType: c.getAttribute("data-content-type"),
    }));

    // ── the map, in the hero band ────────────────────────────────
    // The HERO BAND. This is what the decision covers.
    const heroBand = document
      .querySelector(".gst-hero, .hero-content")
      ?.closest("section");
    const heroFrame = document.querySelector(".hero-frame");
    const heroCanvases = heroBand
      ? heroBand.querySelectorAll("canvas")
      : document.querySelectorAll("canvas");
    // The WORKSPACE map, reported but not judged. See the header.
    const workspaceMap = document.querySelector(".atl-map");
    const mapButtons = Array.from(document.querySelectorAll("button")).filter(
      (b) => /map|globe/i.test(text(b)),
    );

    // ── the places list ─────────────────────────────────────────
    const placeItems = Array.from(document.querySelectorAll(".places-item"));
    const places = placeItems.map((p) => ({
      name: text(p.querySelector("a")),
      href: p.querySelector("a")?.getAttribute("href") ?? null,
      count: text(p.querySelector(".places-count")),
    }));

    // ── every dash on the page, in a counter position ───────────
    // A dash that stands where a NUMBER should be. This is the
    // specific thing the decision forbids.
    //
    // The scope is COUNTERS, not the whole page. The page does use
    // an em dash elsewhere — as a separator in region headings like
    // "ACADIA — 1" — and that is a separator, not a missing number.
    // Counting every dash on the page would flag those and call a
    // separator a broken counter.
    const counterSelectors = [
      ".hero-meta > div",
      ".kpi-val",
      ".ws-count",
      ".atlas-kpi-val",
      ".atlas-kpi__stat b",
      ".featured-count",
    ].join(",");
    const counters = Array.from(
      document.querySelectorAll(counterSelectors),
    ).map((el) => text(el));
    // The dashes, as escape sequences. A literal em dash in a regex
    // literal is a control-character lint error; \u2014 and \u2013 are
    // the same characters and the rule can see what they are.
    const dashCounters = counters.filter((t) => /[\u2014\u2013]/.test(t));

    // And, for the record: every counter that IS a number, with the
    // number, so the plural can be checked against it.
    const counterFacts = Array.from(
      document.querySelectorAll(counterSelectors),
    ).map((el) => {
      const b = el.querySelector("b");
      const raw = b ? text(b) : text(el);
      return {
        text: text(el),
        number: Number(raw.replace(/[^0-9]/g, "")),
        raw,
      };
    });

    // ── drinks ──────────────────────────────────────────────────
    const drinksRow = Array.from(
      document.querySelectorAll("section, div[class*='row'], a[href*='drink']"),
    ).filter((el) => /drinks/i.test(text(el)) && text(el).length < 200);

    // ── the hero meta counters, with their numbers ──────────────
    const heroMeta = Array.from(
      document.querySelectorAll(".hero-meta > div"),
    ).map((el) => {
      const b = el.querySelector("b");
      return {
        value: b ? Number(text(b).replace(/[^0-9]/g, "")) : null,
        text: text(el),
      };
    });

    return {
      featuredCount: featured.length,
      featured,
      hasHeroFrame: !!heroFrame,
      heroCanvasCount: heroCanvases.length,
      workspaceMapPresent: !!workspaceMap,
      mapButtonLabels: mapButtons.map(text),
      placesCount: places.length,
      placesSample: places.slice(0, 5),
      placesAreLinks: places.every((p) => !!p.href),
      counters,
      counterFacts,
      dashCounters,
      drinksRows: drinksRow.map(text).slice(0, 3),
      heroMeta,
      bodyText: text(document.body).slice(0, 400),
    };
  });

  console.log("=== PR 4 — the Startpage, read from the DOM ===\n");
  console.log("featured cards:", result.featuredCount);
  console.log(
    "cards missing a photo:   ",
    result.featured.filter((c) => !c.hasImg).length,
  );
  console.log(
    "cards missing a family:  ",
    result.featured.filter((c) => !c.family).length,
  );
  console.log(
    "cards missing an origin: ",
    result.featured.filter((c) => !c.origin).length,
  );
  console.log(
    "cards missing a definition:",
    result.featured.filter((c) => !c.definition).length,
  );
  console.log(
    "cards with more than one link:",
    result.featured.filter((c) => c.links !== 1).length,
  );
  console.log("\nthe twelve:");
  for (const c of result.featured) {
    console.log(
      `  ${c.name.padEnd(24)} ${c.family.padEnd(14)} ${c.origin.padEnd(16)} links=${c.links}`,
    );
  }

  console.log(
    "\nmap in the HERO BAND: ",
    result.hasHeroFrame || result.heroCanvasCount > 0 ? "PRESENT" : "absent",
  );
  console.log("hero canvases:       ", result.heroCanvasCount);
  console.log(
    "workspace map tab:   ",
    result.workspaceMapPresent
      ? "present (left alone — the decision covers the Startpage band)"
      : "absent",
  );
  console.log(
    "map buttons:         ",
    result.mapButtonLabels.length ? result.mapButtonLabels.join(", ") : "none",
  );
  console.log("places in the list:  ", result.placesCount);
  console.log("places are links:    ", result.placesAreLinks);
  console.log(
    "sample places:       ",
    result.placesSample.map((p) => p.name).join(", "),
  );

  console.log("\ncounters found:      ", JSON.stringify(result.counters));
  console.log(
    "counters with a DASH:",
    result.dashCounters.length,
    result.dashCounters,
  );
  console.log("hero meta:           ", JSON.stringify(result.heroMeta));

  // The plural must agree with the number: "1 dishes" is wrong, and it
  // is wrong in exactly the case a reader notices.
  //
  // Split into tokens rather than matching with a regex: the lint
  // rule that governs this repo flags a word-boundary escape, and a
  // token split says the same thing more plainly.
  const COUNTER_WORDS = ["dish", "family", "origin", "place"];
  // The rendered word is the PLURAL ("dishes", "families"), so the
  // list of known counter words holds the SINGULAR and the rendered
  // word is reduced to it before matching. Without this step the
  // check matched nothing at all and reported "0 wrong plurals" on
  // every page — a gate that cannot fail.
  const stemOf = (word) => {
    if (word.endsWith("ies")) return `${word.slice(0, -3)}y`;
    // "-es" is the plural of a stem that already ends in s/x/z/ch/sh
    // ("dishes" -> "dish", "boxes" -> "box") and of the -o verbs
    // ("tomatoes" -> "tomato"). The s is simply dropped.
    if (word.endsWith("es")) return word.slice(0, -2);
    if (word.endsWith("s") && !word.endsWith("ss")) return word.slice(0, -1);
    return word;
  };
  const pluralErrors = result.counterFacts
    .filter((c) => Number.isFinite(c.number))
    .filter((c) => {
      const tokens = c.text
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter(Boolean);
      const idx = tokens.findIndex((t) => COUNTER_WORDS.includes(stemOf(t)));
      if (idx < 0) return false;
      const word = tokens[idx];
      const numberToken = idx > 0 ? tokens[idx - 1] : "";
      const n = Number(numberToken.replace(/[^0-9]/g, ""));
      if (!Number.isFinite(n)) return false;
      // Correct English: a number of 1 takes a singular word, any
      // other number takes a plural word.
      //
      //   "1 dish"   correct   -> 1 is singular, "dish" is singular
      //   "1 dishes" WRONG     -> 1 is singular, "dishes" is plural
      //   "12 dishes" correct   -> 12 is plural, "dishes" is plural
      //   "2 dish"   WRONG     -> 2 is plural, "dish" is singular
      //
      // So the error is when the two DISAGREE.
      const numberIsSingular = n === 1;
      const wordIsPlural = word !== stemOf(word);
      return numberIsSingular === wordIsPlural;
    })
    .map((c) => c.text);
  console.log(
    "counters with a WRONG plural:",
    pluralErrors.length,
    pluralErrors,
  );
  console.log(
    "drinks rows on page: ",
    result.drinksRows.length ? result.drinksRows : "none",
  );
  console.log(
    "featured cards that are drinks: ",
    result.featured.filter((c) => c.contentType === "drink").length,
  );
  console.log(
    "featured cards with no content type: ",
    result.featured.filter((c) => !c.contentType).length,
  );
  console.log(
    "\nconsole errors:      ",
    errors.length ? errors.slice(0, 5) : "none",
  );

  // ── the verdict ──────────────────────────────────────────────
  const failures = [];
  if (result.featuredCount !== 12)
    failures.push(`featured is ${result.featuredCount}, not 12`);
  if (result.featured.some((c) => !c.hasImg))
    failures.push("a featured card has no photo");
  if (result.featured.some((c) => !c.family))
    failures.push("a featured card has no family");
  if (result.featured.some((c) => !c.origin))
    failures.push("a featured card has no origin");
  if (result.featured.some((c) => !c.definition))
    failures.push("a featured card has no definition");
  if (result.featured.some((c) => c.links !== 1))
    failures.push("a featured card does not have exactly one link");
  if (result.hasHeroFrame || result.heroCanvasCount > 0)
    failures.push("the map is still in the hero band");
  if (result.placesCount === 0) failures.push("there is no places list");
  if (!result.placesAreLinks) failures.push("a place is not a link");
  if (result.dashCounters.length) failures.push("a counter renders as a dash");
  if (pluralErrors.length) failures.push("a counter has the wrong plural");
  if (result.drinksRows.length)
    failures.push("there is a drinks row on the Startpage");
  // NO FEATURED CARD IS A DRINK. The API excludes drinks from this
  // row; this reads the exclusion back out of the rendered page.
  const drinkCards = result.featured.filter((c) => c.contentType === "drink");
  if (drinkCards.length)
    failures.push(
      `a featured card is a drink: ${drinkCards.map((c) => c.name).join(", ")}`,
    );
  // And every card must SAY what it is. A card with no content type
  // cannot be checked, so a missing attribute is a gap in the proof,
  // not a pass.
  const untypedCards = result.featured.filter((c) => !c.contentType);
  if (untypedCards.length)
    failures.push(
      `${untypedCards.length} featured card(s) carry no content type, so the drink rule cannot be checked`,
    );

  console.log(
    "\n" +
      (failures.length
        ? "FAILURES:\n  " + failures.join("\n  ")
        : "ALL CHECKS PASSED"),
  );
  await browser.close();
  process.exit(failures.length ? 1 : 0);
})();
