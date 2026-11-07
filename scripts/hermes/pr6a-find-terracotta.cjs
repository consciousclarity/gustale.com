#!/usr/bin/env node
/**
 * Which elements are STILL terracotta in the recipes build?
 *
 * The pixel count says some accent-coloured pixels remain. Find out
 * which elements they belong to.
 */
const { chromium } = require("playwright");

const TARGETS = [
  ["terracotta", "rgb(176, 78, 41)"],
  ["terracotta-dark", "rgb(147, 57, 30)"],
  ["herb green", "rgb(50, 122, 47)"],
];

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
  });
  await page.goto("http://127.0.0.1:8904/", { waitUntil: "networkidle" });
  await page.waitForTimeout(800);

  const hits = await page.evaluate((targets) => {
    const out = [];
    for (const el of document.querySelectorAll("*")) {
      const cs = getComputedStyle(el);
      for (const prop of [
        "color",
        "backgroundColor",
        "borderTopColor",
        "borderBottomColor",
        "fill",
        "stroke",
      ]) {
        const v = cs[prop];
        if (!v) continue;
        for (const [name, rgb] of targets) {
          if (v === rgb) {
            out.push({
              name,
              prop,
              tag: el.tagName.toLowerCase(),
              cls: (el.className || "").toString().slice(0, 60),
              text: (el.textContent || "").trim().slice(0, 40),
            });
          }
        }
      }
    }
    return out;
  }, TARGETS);

  // Group.
  const groups = new Map();
  for (const h of hits) {
    const key = `${h.name} ${h.prop} ${h.tag}.${h.cls}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(h.text);
  }

  console.log("  the accent-coloured elements in the RECIPES build:");
  for (const [k, texts] of groups) {
    console.log(`    ${k}`);
    if (texts.length)
      console.log(
        `        text: ${[...new Set(texts)].slice(0, 5).join(" | ")}`,
      );
  }

  // The SVG logo: is it an <img> (a file) or inline?
  const svgs = await page.evaluate(() => {
    const out = [];
    for (const s of document.querySelectorAll("svg, img")) {
      const cs = getComputedStyle(s);
      if (cs.fill !== "rgb(0, 0, 0)" && cs.fill !== "none") {
        out.push({
          tag: s.tagName,
          cls: (s.className.baseVal ?? s.className ?? "")
            .toString()
            .slice(0, 40),
          fill: cs.fill,
          src: s.getAttribute("src") || "(inline)",
        });
      }
    }
    return out;
  });
  console.log("");
  console.log("  svg/img with a fill:");
  for (const s of svgs.slice(0, 12))
    console.log(`    ${s.tag}.${s.cls} fill=${s.fill} src=${s.src}`);

  await browser.close();
})();
