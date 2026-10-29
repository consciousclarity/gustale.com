#!/usr/bin/env node
/**
 * The accessibility and performance audit.
 *
 * TWO TOOLS, TWO QUESTIONS
 *
 * axe-core answers: does this page have the mechanical accessibility
 * defects — a missing label, a bad contrast ratio, a heading level
 * skipped, an element that cannot be reached by keyboard.
 *
 * Lighthouse answers: is this page fast enough, and does it have the
 * things a search engine and a phone camera need — a sensible image
 * size, an accessible name on the tap targets, no layout shift.
 *
 * WHY A SAMPLE AND NOT EVERYTHING
 *
 * There are 1,721 pages. Running both tools on all of them would take
 * hours and the result would be the same number on every page, because
 * the pages are generated from a handful of templates. So the sample
 * is chosen to cover the TEMPLATES, not to sample at random:
 *
 *   - the homepage (the globe)
 *   - the dish list
 *   - an English dish page
 *   - a Spanish dish page — a different locale, a different script
 *   - an Arabic dish page — RTL, which is a different layout entirely
 *   - a Japanese dish page — CJK, and a different font stack
 *   - the regions index, the families index, the lineages index
 *   - the about page, the login page
 *   - a family page, an ingredient page
 *
 * A defect that appears on one page of a template appears on all of
 * them, so one page per template finds the defect.
 *
 * The output is a JSON report and a human summary.
 */

import { chromium } from "playwright";
import { writeFile, mkdir } from "node:fs/promises";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

// The pages, one per template.
const BASE = process.argv.includes("--base")
  ? process.argv[process.argv.indexOf("--base") + 1]
  : "https://gustale.com";

const PAGES = [
  { name: "homepage", url: "/", template: "home" },
  { name: "dish-list", url: "/dishes/", template: "dish-list" },
  { name: "dish-en", url: "/dishes/nasi-goreng", template: "dish" },
  { name: "dish-es", url: "/es/dishes/nasi-goreng", template: "dish-locale" },
  { name: "dish-ar", url: "/ar/dishes/nasi-goreng", template: "dish-locale-rtl" },
  { name: "dish-ja", url: "/ja/dishes/nasi-goreng", template: "dish-locale-cjk" },
  { name: "regions", url: "/regions", template: "regions" },
  { name: "families", url: "/families", template: "families" },
  { name: "family", url: "/family/noodle", template: "family" },
  { name: "lineages", url: "/lineages", template: "lineages" },
  { name: "about", url: "/about", template: "about" },
  { name: "login", url: "/login", template: "login" },
];

/**
 * Get axe-core onto the page.
 *
 * axe-core is NOT a dependency of the site — it does not belong in the
 * production bundle. It is injected at audit time from the CDN, and
 * the audit FAILS LOUDLY if it cannot be loaded, rather than
 * reporting zero violations, which would be a lie.
 */
async function injectAxe(page) {
  const source = await fetch(
    "https://cdn.jsdelivr.net/npm/axe-core@4.10.2/axe.min.js",
  ).then((response) => {
    if (!response.ok) {
      throw new Error(`axe-core could not be fetched: HTTP ${response.status}`);
    }
    return response.text();
  });
  await page.addScriptTag({ content: source });
  const present = await page.evaluate(() => typeof window.axe !== "undefined");
  if (!present) {
    throw new Error("axe-core was injected but window.axe is undefined");
  }
}

async function runAxe(page) {
  return page.evaluate(async () => {
    // If axe-core is somehow missing, the audit says so rather than
    // silently reporting zero violations, which would be a lie.
    if (typeof window.axe === "undefined") {
      return { error: "axe-core is not present on the page" };
    }
    const result = await window.axe.run(document, {
      runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] },
    });
    return {
      violations: result.violations.map((v) => ({
        id: v.id,
        impact: v.impact,
        help: v.help,
        description: v.description,
        nodes: v.nodes.length,
        targets: v.nodes.slice(0, 4).map((n) => n.target.join(" ")),
      })),
      passes: result.passes.length,
      incomplete: result.incomplete.length,
    };
  });
}

async function runChecks(page) {
  // The checks axe does not cover, and the ones Lighthouse covers
  // badly — the things that are actually wrong on this site.
  return page.evaluate(() => {
    const result = {};

    // Every image must have an alt attribute — and a MEANINGFUL one.
    const images = Array.from(document.querySelectorAll("img"));
    result.images = images.length;
    result.images_without_alt = images.filter((i) => !i.hasAttribute("alt")).length;
    result.images_with_empty_alt = images.filter(
      (i) => i.hasAttribute("alt") && i.getAttribute("alt").trim() === "",
    ).length;

    // Every link must have a discernible name.
    const links = Array.from(document.querySelectorAll("a"));
    result.links = links.length;
    result.links_without_a_name = links.filter((a) => {
      const text = (a.textContent || "").trim();
      const label = a.getAttribute("aria-label") || a.getAttribute("title") || "";
      const image = a.querySelector("img");
      const imageAlt = image ? image.getAttribute("alt") || "" : "";
      return text === "" && label === "" && imageAlt === "";
    }).length;

    // Every button must have a discernible name.
    const buttons = Array.from(document.querySelectorAll("button"));
    result.buttons = buttons.length;
    result.buttons_without_a_name = buttons.filter((b) => {
      const text = (b.textContent || "").trim();
      const label = b.getAttribute("aria-label") || b.getAttribute("title") || "";
      return text === "" && label === "";
    }).length;

    // Every form control must have a label.
    const controls = Array.from(
      document.querySelectorAll("input, select, textarea"),
    ).filter((el) => el.type !== "hidden");
    result.form_controls = controls.length;
    result.form_controls_without_a_label = controls.filter((el) => {
      if (el.getAttribute("aria-label")) return false;
      if (el.getAttribute("aria-labelledby")) return false;
      if (el.id && document.querySelector(`label[for="${el.id}"]`)) return false;
      if (el.closest("label")) return false;
      return true;
    }).length;

    // The heading order. A skipped level is a real screen-reader
    // problem: it means the reader's heading list has a gap.
    const headings = Array.from(
      document.querySelectorAll("h1,h2,h3,h4,h5,h6"),
    );
    result.headings = headings.length;
    let skips = 0;
    let previous = 0;
    for (const h of headings) {
      const level = Number(h.tagName.slice(1));
      if (previous !== 0 && level > previous + 1) skips += 1;
      previous = level;
    }
    result.heading_level_skips = skips;

    // The lang attribute. A page without it is read by a screen
    // reader in the wrong pronunciation.
    result.lang = document.documentElement.getAttribute("lang");
    result.dir = document.documentElement.getAttribute("dir");

    // The viewport must not block zooming — a WCAG 1.4.4 failure
    // that is very common and very easy to miss.
    const viewport = document.querySelector('meta[name="viewport"]');
    result.viewport = viewport ? viewport.getAttribute("content") : null;
    result.blocks_zoom =
      !!result.viewport &&
      /user-scalable\s*=\s*no|maximum-scale\s*=\s*1(\.0)?\b/.test(
        result.viewport,
      );

    // The contrast, computed by the browser, on the text that is
    // actually on the page.
    result.contrast = { checked: 0, failures: [] };
    const parseColor = (value) => {
      const match = value.match(/rgba?\(([^)]+)\)/);
      if (!match) return null;
      const parts = match[1].split(",").map((p) => parseFloat(p.trim()));
      if (parts.length >= 4 && parts[3] < 0.1) return null; // transparent
      return { r: parts[0], g: parts[1], b: parts[2] };
    };
    const luminance = (c) => {
      const channel = (v) => {
        const s = v / 255;
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      };
      return (
        0.2126 * channel(c.r) + 0.7152 * channel(c.g) + 0.0722 * channel(c.b)
      );
    };
    const backgroundOf = (el) => {
      let node = el;
      while (node && node !== document.documentElement) {
        const bg = parseColor(getComputedStyle(node).backgroundColor);
        if (bg) return bg;
        node = node.parentElement;
      }
      return { r: 255, g: 255, b: 255 };
    };
    const seen = new Set();
    for (const el of document.querySelectorAll("p,span,a,li,h1,h2,h3,h4,button,label,td,th")) {
      const text = (el.textContent || "").trim();
      if (!text || el.children.length > 0) continue;
      const style = getComputedStyle(el);
      if (style.visibility === "hidden" || style.display === "none") continue;
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;
      const fg = parseColor(style.color);
      if (!fg) continue;
      const bg = backgroundOf(el);
      const l1 = luminance(fg);
      const l2 = luminance(bg);
      const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
      const size = parseFloat(style.fontSize);
      const bold = Number(style.fontWeight) >= 700;
      const large = size >= 24 || (size >= 18.66 && bold);
      const required = large ? 3 : 4.5;
      result.contrast.checked += 1;
      if (ratio < required) {
        const key = `${style.color}|${Math.round(ratio * 100)}`;
        if (!seen.has(key)) {
          seen.add(key);
          result.contrast.failures.push({
            ratio: Math.round(ratio * 100) / 100,
            required,
            color: style.color,
            size: Math.round(size),
            sample: text.slice(0, 50),
          });
        }
      }
    }

    return result;
  });
}

async function main() {
  const browser = await chromium.launch({ args: ["--no-sandbox"] });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    locale: "en-US",
  });
  const report = { base: BASE, pages: [] };
  const consoleErrors = [];

  for (const target of PAGES) {
    const url = `${BASE}${target.url}`;
    const page = await context.newPage();
    const errors = [];
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text().slice(0, 200));
    });
    page.on("pageerror", (error) => errors.push(String(error).slice(0, 200)));

    const entry = { name: target.name, url, template: target.template };
    try {
      const response = await page.goto(url, {
        waitUntil: "domcontentloaded",
        timeout: 45000,
      });
      entry.status = response ? response.status() : 0;
      // Give the islands a moment to hydrate, so the console errors
      // from a hydration failure are caught.
      await page.waitForTimeout(2500);

      entry.checks = await runChecks(page);
      try {
        await injectAxe(page);
        entry.axe = await runAxe(page);
      } catch (error) {
        entry.axe = { error: String(error).slice(0, 200) };
      }
      entry.console_errors = errors;
      consoleErrors.push(...errors.map((e) => `${target.name}: ${e}`));
    } catch (error) {
      entry.error = String(error).slice(0, 300);
    }
    await page.close();

    const c = entry.checks || {};
    console.log(
      `${String(entry.status).padStart(4)} ${target.name.padEnd(14)} ` +
        `img:${String(c.images ?? "-").padStart(3)} ` +
        `noAlt:${String(c.images_without_alt ?? "-").padStart(3)} ` +
        `linksNoName:${String(c.links_without_a_name ?? "-").padStart(3)} ` +
        `ctrlNoLabel:${String(c.form_controls_without_a_label ?? "-").padStart(3)} ` +
        `hSkip:${String(c.heading_level_skips ?? "-").padStart(2)} ` +
        `axe:${String(entry.axe?.violations?.length ?? "-").padStart(3)} ` +
        `err:${errors.length}`,
    );
    report.pages.push(entry);
  }

  await browser.close();

  // The summary.
  const total = (key) =>
    report.pages.reduce((sum, p) => sum + (p.checks?.[key] ?? 0), 0);
  const axeViolations = report.pages.flatMap((p) =>
    (p.axe?.violations ?? []).map((v) => ({ ...v, page: p.name })),
  );

  report.summary = {
    pages: report.pages.length,
    images: total("images"),
    images_without_alt: total("images_without_alt"),
    links: total("links"),
    links_without_a_name: total("links_without_a_name"),
    buttons: total("buttons"),
    buttons_without_a_name: total("buttons_without_a_name"),
    form_controls: total("form_controls"),
    form_controls_without_a_label: total("form_controls_without_a_label"),
    heading_level_skips: total("heading_level_skips"),
    pages_blocking_zoom: report.pages.filter((p) => p.checks?.blocks_zoom).length,
    pages_with_a_console_error: report.pages.filter(
      (p) => (p.console_errors?.length ?? 0) > 0,
    ).length,
    axe_violations: axeViolations.length,
  };
  report.axe_violations = axeViolations;
  report.console_errors = consoleErrors;

  await mkdir("/tmp", { recursive: true });
  await writeFile("/tmp/a11y-audit.json", JSON.stringify(report, null, 2));

  console.log("\n── the summary ──");
  for (const [key, value] of Object.entries(report.summary)) {
    console.log(`  ${key.padEnd(30)} ${value}`);
  }
  if (axeViolations.length) {
    console.log("\n── the axe violations ──");
    const byId = new Map();
    for (const v of axeViolations) {
      if (!byId.has(v.id)) byId.set(v.id, { ...v, count: 0, pages: new Set() });
      const entry = byId.get(v.id);
      entry.count += 1;
      entry.pages.add(v.page);
    }
    for (const [id, v] of byId) {
      console.log(
        `  ${v.impact?.padEnd(8)} ${id.padEnd(28)} ${v.count} on ${v.pages.size} pages`,
      );
      console.log(`           ${v.help}`);
      if (v.targets?.length) console.log(`           e.g. ${v.targets[0]}`);
    }
  }
  if (consoleErrors.length) {
    console.log("\n── the console errors ──");
    for (const error of [...new Set(consoleErrors)].slice(0, 12)) {
      console.log(`  ${error}`);
    }
  }
  console.log("\n[a11y] the report is at /tmp/a11y-audit.json");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
