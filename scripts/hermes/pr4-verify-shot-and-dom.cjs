#!/usr/bin/env node
/**
 * PR 4 — the screenshot and the DOM facts from the SAME page load.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * The vision model was asked to describe the after-screenshot and
 * reported a map, four featured cards, counters reading 120/48/12, and
 * a counter with an em dash in it. The DOM proof said twelve cards,
 * no map, counters 1,474/123/178, and no dash. One of them is
 * describing something that is not on the page.
 *
 * A screenshot of a page whose facts are in dispute is worth nothing
 * on its own. So this script takes the picture and reads the facts out
 * of the SAME live document, in the same millisecond, and prints them
 * side by side. Whatever the picture shows, the DOM numbers are the
 * ones that were actually rendered -- and they can be re-checked.
 *
 * It is a .cjs file ON PURPOSE: Playwright resolves its module
 * dependencies from the file's own directory.
 */
const { chromium } = require("playwright");
const path = require("path");
const fs = require("fs");

const BASE = process.argv[2] ?? "http://127.0.0.1:8898";
const OUT = process.argv[3] ?? "/tmp/pr4-shots";

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: 1280, height: 1000 },
    deviceScaleFactor: 1,
  });

  await page.goto(BASE + "/", { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForSelector(".featured-grid .featured-card", {
    timeout: 30000,
  });
  await page.waitForTimeout(2500);

  // The facts, read out of the live document.
  const facts = await page.evaluate(() => {
    const t = (el) => (el?.textContent ?? "").replace(/\s+/g, " ").trim();
    const cards = Array.from(
      document.querySelectorAll(".featured-grid .featured-card"),
    );
    return {
      title: document.title,
      featuredCards: cards.length,
      cardNames: cards.map((c) => t(c.querySelector(".featured-name"))),
      heroMeta: Array.from(document.querySelectorAll(".hero-meta > div")).map(
        (el) => t(el),
      ),
      heroMetaValues: Array.from(document.querySelectorAll(".hero-meta b")).map(
        (el) => t(el),
      ),
      heroFramePresent: !!document.querySelector(".hero-frame"),
      canvasCount: document.querySelectorAll("canvas").length,
      mapLikeClasses: Array.from(
        document.querySelectorAll("[class*='map'],[class*='atlas']"),
      )
        .map((el) => el.className)
        .filter((c) => typeof c === "string")
        .slice(0, 6),
      placesItems: document.querySelectorAll(".places-item").length,
      placesSample: Array.from(document.querySelectorAll(".places-item"))
        .slice(0, 5)
        .map((el) => t(el)),
      emDashesInBody: (document.body.innerText.match(/—/g) || []).length,
      emDashLines: document.body.innerText
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => l.includes("—"))
        .slice(0, 8),
      drinksText: /drink/i.test(document.body.innerText),
    };
  });

  const shot = path.join(OUT, "after-home-verified.png");
  await page.screenshot({ path: shot, fullPage: false });

  console.log("=== the same page load, read two ways ===\n");
  console.log("title:", facts.title);
  console.log("featured cards:", facts.featuredCards);
  console.log("  ", facts.cardNames.join(" | "));
  console.log("hero counters:", JSON.stringify(facts.heroMeta));
  console.log("counter values:", JSON.stringify(facts.heroMetaValues));
  console.log(".hero-frame present:", facts.heroFramePresent);
  console.log("<canvas> elements on the page:", facts.canvasCount);
  console.log("map/atlas-ish classes:", JSON.stringify(facts.mapLikeClasses));
  console.log("places items:", facts.placesItems, facts.placesSample);
  console.log("em dashes in the body text:", facts.emDashesInBody);
  console.log("  lines containing a dash:", JSON.stringify(facts.emDashLines));
  console.log("the word 'drink' appears:", facts.drinksText);
  console.log("\nscreenshot:", shot);

  await browser.close();
})();
