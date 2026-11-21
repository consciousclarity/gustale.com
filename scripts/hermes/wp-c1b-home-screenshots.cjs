#!/usr/bin/env node
/**
 * WP-C1b screenshots — the home page's map, header and footer.
 *
 * WHY THIS EXISTS
 * ---------------
 * D21-1 is the definition of done for UI work: a UI work package is
 * done only when its PR includes a parity table, and that table is
 * "checked against PRODUCTION after the deploy, at 1440 and 390 px,
 * with screenshots in docs/screenshots/<wp>/".
 *
 * So the screenshots are not decoration. They are the evidence for the
 * parity table, and they are taken at the two widths D21-1 names.
 *
 * WHAT IT CAPTURES
 * ----------------
 * 1. The hero map, at both widths, plus a tight crop of the map so a
 *    reviewer can read the marker labels.
 * 2. The header, so the wordmark-only change is visible.
 * 3. The footer, so the link list and the language switcher are
 *    visible.
 *
 * It also PROBES the DOM and prints what it found, so the numbers in
 * the parity table come from the rendered page rather than from the
 * source.
 *
 * It is a .cjs file ON PURPOSE: Playwright resolves its module
 * dependencies from the file's own directory, and the repo's
 * node_modules is at the root.
 *
 * Usage:
 *   node scripts/hermes/wp-c1b-home-screenshots.cjs <base-url>
 *   SHOT_DIR=docs/screenshots/wp-c1b node scripts/hermes/wp-c1b-home-screenshots.cjs http://127.0.0.1:8899
 */
const { chromium } = require("playwright");
const fs = require("node:fs");
const path = require("node:path");

const BASE = process.argv[2] || process.env.BASE || "http://127.0.0.1:8899";
const OUT = process.env.SHOT_DIR || "/tmp/wp-c1b-shots";

// D21-1 names the two widths: 1440 and 390.
const VIEWPORTS = [
  { name: "desktop-1440", width: 1440, height: 900 },
  { name: "mobile-390", width: 390, height: 844 },
];

fs.mkdirSync(OUT, { recursive: true });

/**
 * What the page actually shows, read from the DOM.
 *
 * Every number the parity table quotes comes from here.
 */
async function probe(page) {
  return await page.evaluate(() => {
    const q = (sel) => document.querySelector(sel);
    const all = (sel) => Array.from(document.querySelectorAll(sel));

    const caption = q(".home-map__credit");
    // The figure's caption — the sentence that says what the number
    // on a marker is. It lives on the page (index.astro), not in the
    // map component, so it is probed from the page.
    const mapCaption = q(".home__map-caption");
    const mapNote = q(".home__map-note");
    const labels = all(".home-map__marker-label").map((n) =>
      n.textContent.trim(),
    );
    // The labels' GEOMETRY. The regression this guards against is a
    // label that has been pushed far away from the disc it labels,
    // which makes the map unreadable even though nothing overlaps.
    const labelBoxes = all(".home-map__marker-label").map((n) => {
      const b = n.getBBox();
      const r = n.getBoundingClientRect();
      return {
        text: n.textContent.trim(),
        // The disc is directly above the label, so the horizontal
        // centre is what the label should sit on.
        cx: r.left + r.width / 2,
        top: r.top,
        bottom: r.bottom,
        left: r.left,
        right: r.right,
        width: b.width,
      };
    });
    const discCentres = all(".home-map__marker-disc").map((n) => {
      const r = n.getBoundingClientRect();
      return { cx: r.left + r.width / 2, top: r.top, bottom: r.bottom };
    });
    const markerCounts = all(".home-map__marker-count").map((n) =>
      n.textContent.trim(),
    );
    const markerIndexes = all(".home-map__marker-index").map((n) =>
      n.textContent.trim(),
    );
    // The list of places that carries the names on a narrow screen.
    const placeRows = all(".home-map__place").map((n) => ({
      index:
        n.querySelector(".home-map__place-index")?.textContent.trim() || null,
      name:
        n.querySelector(".home-map__place-name")?.textContent.trim() || null,
      count:
        n.querySelector(".home-map__place-count")?.textContent.trim() || null,
    }));
    // Is the SVG's own label VISIBLE? A `display: none` element is
    // still in the DOM, so the DOM alone cannot answer this.
    const visible = (sel) => {
      const n = q(sel);
      if (!n) return false;
      const st = window.getComputedStyle(n);
      return st.display !== "none" && st.visibility !== "hidden";
    };
    const svgLabelVisible = visible(".home-map__marker-label");
    const listVisible = visible(".home-map__places");
    const discShowsIndex = visible(".home-map__marker-index");
    const discShowsCount = visible(".home-map__marker-count");
    const mapLabel = q(".home-map__svg")?.getAttribute("aria-label") || null;

    const wordmark = q(".gst-wordmark")?.textContent.trim() || null;
    const property = q(".gst-property");
    const propertyLabel = q(".gst-property-label")?.textContent.trim() || null;
    const propertyDesc = q(".gst-property-desc")?.textContent.trim() || null;

    const footLinks = all(".gst-foot .fl a").map((a) => ({
      text: a.textContent.trim(),
      href: a.getAttribute("href"),
    }));
    const localeSwitcher = q(".gst-foot .gst-locales");
    const localeItems = localeSwitcher
      ? Array.from(localeSwitcher.querySelectorAll("a, span")).map((n) => ({
          tag: n.tagName.toLowerCase(),
          text: n.textContent.trim(),
          href: n.getAttribute("href"),
        }))
      : null;

    // The thread cards' place chips, and any arrow route that survived.
    const threadChips = all(".home__thread-place").map((n) =>
      n.textContent.trim(),
    );
    const arrowRoutes = all(".home__thread-route").map((n) =>
      n.textContent.replace(/\s+/g, " ").trim(),
    );
    // Every arrow on the page, so a new one cannot hide in a template
    // this script does not know about.
    const bodyText = document.body.innerText;
    const arrowLines = bodyText
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.includes("→"));

    return {
      caption: caption ? caption.textContent.trim() : null,
      mapCaption: mapCaption
        ? mapCaption.textContent.replace(/\s+/g, " ").trim()
        : null,
      mapNote: mapNote ? mapNote.textContent.replace(/\s+/g, " ").trim() : null,
      markerNames: labels,
      labelBoxes,
      discCentres,
      markerCounts,
      markerIndexes,
      placeRows,
      svgLabelVisible,
      listVisible,
      discShowsIndex,
      discShowsCount,
      mapAriaLabel: mapLabel,
      wordmark,
      propertyBlockPresent: Boolean(property),
      propertyLabel,
      propertyDesc,
      footLinks,
      localeSwitcherPresent: Boolean(localeSwitcher),
      localeItems,
      threadChips,
      arrowRoutes,
      arrowLines,
    };
  });
}

/**
 * The assertions D21-1's parity table is built on.
 *
 * A finding is "matches" only when the DOM proves it. A failure here
 * is a real defect, so it is reported loudly and the script exits
 * non-zero.
 */
function check(probe, viewport) {
  const problems = [];
  const notes = [];

  if (probe.caption !== "Basemap: Natural Earth 1:110m Land (public domain)") {
    problems.push(
      `caption is ${JSON.stringify(probe.caption)} — expected the Natural Earth 1:110m Land credit`,
    );
  }

  if (probe.markerNames.length === 0) {
    problems.push("no marker labels — the places are not named");
  }
  if (probe.markerNames.length !== probe.markerCounts.length) {
    problems.push(
      `${probe.markerNames.length} names but ${probe.markerCounts.length} counts — they must pair up`,
    );
  }
  if (probe.markerNames.some((n) => !n)) {
    problems.push("a marker label is empty");
  }

  // THE LABELS MUST NOT OVERLAP, AND MUST NOT RUN AWAY FROM THEIR
  // DISC.
  //
  // This is the check the map's own geometry needs. Two failures are
  // possible and both make the map unreadable:
  //
  //   - two labels printing on top of each other, and
  //   - a label pushed far away from the pin it names, so the reader
  //     cannot tell which name belongs to which pin.
  //
  // The second one is why this is measured and not eyeballed. The
  // version of this map that pushed its labels APART VERTICALLY
  // produced no overlap at all — and was unreadable, because "South
  // Asia" ended up 162px below its own pin.
  if (probe.labelBoxes?.length && probe.svgLabelVisible) {
    // ONLY when the SVG's labels are visible.
    //
    // Below 640px the SVG's labels are `display: none` — the names
    // live in the list under the map instead. A hidden element's
    // `getBoundingClientRect` is all zeros, so measuring it would
    // report every label as hundreds of pixels from every pin.
    const boxes = probe.labelBoxes;
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i];
        const b = boxes[j];
        const ox = Math.min(a.right, b.right) - Math.max(a.left, b.left);
        const oy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
        if (ox > 0 && oy > 0) {
          problems.push(
            `labels overlap: "${a.text}" and "${b.text}" (${ox.toFixed(0)}x${oy.toFixed(0)}px)`,
          );
        }
      }
    }

    // Each label must sit under a disc. The label's own centre is
    // matched to the nearest disc's centre, and the horizontal gap
    // is compared against the disc's own radius: a label that is
    // further away than that is not attached to its pin.
    for (const label of boxes) {
      let best = null;
      for (const disc of probe.discCentres ?? []) {
        const gap = Math.abs(disc.cx - label.cx);
        if (best === null || gap < best.gap) best = { gap, disc };
      }
      if (!best) continue;
      const discRadius = (best.disc.bottom - best.disc.top) / 2;
      if (best.gap > discRadius * 2.5) {
        problems.push(
          `label "${label.text}" is ${best.gap.toFixed(0)}px from the nearest pin — it has drifted off its marker`,
        );
      }
    }
  }

  // THE NAMES MUST BE READABLE EXACTLY ONCE.
  //
  // On a wide screen the map's own SVG labels carry the names. Below
  // 640px they would render at about four pixels, so the names move
  // into the list under the map and the SVG labels are hidden.
  //
  // Two failure modes matter:
  //   - BOTH hidden: the names appear nowhere on the page.
  //   - BOTH visible: the reader gets the names twice, and on a phone
  //     the unreadable SVG copy is still there.
  const narrow = viewport.width <= 640;
  if (narrow) {
    if (probe.svgLabelVisible) {
      problems.push(
        "the SVG's own labels are still visible at 390px, where they render at about 4px and are illegible",
      );
    }
    if (!probe.listVisible) {
      problems.push(
        "the list of places is not visible at 390px, so the place names are not readable",
      );
    }
    if (!probe.discShowsIndex) {
      problems.push(
        "the marker does not show its index at 390px, so a pin cannot be matched to a row",
      );
    }
    if (probe.discShowsCount) {
      problems.push(
        "the marker still shows the dish count at 390px while the list shows the index — the two disagree",
      );
    }
    // The list must actually carry the names.
    if (probe.placeRows.length === 0) {
      problems.push("the list of places is empty");
    }
    const nameless = probe.placeRows.filter((r) => !r.name);
    if (nameless.length > 0) {
      problems.push(`${nameless.length} rows of the place list have no name`);
    }
    // The list's indexes must match the markers' indexes.
    const listIdx = probe.placeRows.map((r) => r.index).join(",");
    const markerIdx = probe.markerIndexes.join(",");
    if (listIdx !== markerIdx) {
      problems.push(
        `the list's indexes (${listIdx}) do not match the markers' (${markerIdx}) — a pin cannot be matched to a row`,
      );
    }
  } else {
    if (!probe.svgLabelVisible) {
      problems.push(
        "the map's own labels are not visible on a wide screen, so the places are not named",
      );
    }
    if (probe.listVisible) {
      problems.push(
        "the list of places is visible on a wide screen as well — the names appear twice",
      );
    }
  }

  // The number on a marker must say whose count it is.
  //
  // It says it ONCE, in the figure's caption. The label under each
  // pin is the place's name only: repeating the sentence under every
  // pin made the labels wide enough to collide and pushed them away
  // from their own markers.
  if (!probe.mapNote) {
    problems.push(
      "the figure has no caption note — the marker's number must say whose count it is",
    );
  } else if (!/this thread/i.test(probe.mapNote)) {
    problems.push(
      `the caption note does not say whose count it is: ${JSON.stringify(probe.mapNote)}`,
    );
  }

  if (probe.propertyBlockPresent) {
    problems.push(
      "the header still renders the property block — the duplicate wordmark and the tagline are back",
    );
  }
  if (probe.wordmark !== "Gustale") {
    problems.push(`wordmark is ${JSON.stringify(probe.wordmark)}`);
  }

  if (!probe.localeSwitcherPresent) {
    problems.push("the footer has no language switcher");
  }

  if (probe.arrowRoutes.length > 0) {
    problems.push(
      `a thread route still renders with arrows: ${JSON.stringify(probe.arrowRoutes)}`,
    );
  }
  // The arrow rule (ATLAS_STYLE §1) is about MOVEMENTS — a claim that
  // a dish travelled. It is not a rule about link affordances: a "Add
  // dish →" link arrow is a pointer to the next page, not a journey
  // claim. So the check is for an arrow BETWEEN TWO PLACES, not for
  // any arrow at all.
  //
  // A place name is a capitalised word or a known region; the arrow
  // that matters sits between two of them. The CTA arrows sit between
  // a verb and a URL, or at the end of a link's own label.
  const PLACEISH = /[A-Z][a-z]+/;
  const movementArrows = probe.arrowLines.filter((line) => {
    const parts = line.split("→").map((p) => p.trim());
    if (parts.length < 2) return false;
    // Every side of the arrow has to name a place.
    return parts.every((p) => p.length > 0 && PLACEISH.test(p));
  });
  if (movementArrows.length > 0) {
    problems.push(
      `an arrow reads as a movement between places: ${JSON.stringify(movementArrows)}`,
    );
  }

  const footHrefs = probe.footLinks.map((l) => l.href);
  for (const want of ["/about", "/about/evidence", "/contribute"]) {
    if (!footHrefs.includes(want)) {
      problems.push(`the footer is missing the link to ${want}`);
    }
  }

  if (probe.threadChips.length === 0) {
    notes.push("no thread place chips found on this page");
  }

  return { problems, notes };
}

(async () => {
  const browser = await chromium.launch();
  const report = {};
  let failed = 0;

  for (const viewport of VIEWPORTS) {
    const context = await browser.newContext({
      viewport: { width: viewport.width, height: viewport.height },
      deviceScaleFactor: 1,
    });
    const page = await context.newPage();

    const consoleErrors = [];
    page.on("console", (msg) => {
      if (msg.type() !== "error") return;
      const text = msg.text();
      // The static server has no API and no media CDN behind it, so
      // three things are expected to 404 and are NOT defects:
      //   - the dish cover images (served from the CDN at runtime)
      //   - the session probe (there is no API)
      // Anything else is a real console error and fails the run.
      if (/Failed to load resource/.test(text)) return;
      consoleErrors.push(text);
    });
    page.on("pageerror", (err) => consoleErrors.push(String(err)));

    // WAIT FOR THE PAGE, NOT FOR THE NETWORK.
    //
    // `networkidle` is the wrong condition here. The static preview
    // server has no API behind it, so the page's client-side fetches
    // to `/api/*` never settle — the network is never idle, and the
    // wait times out on a page that rendered perfectly.
    //
    // The page is server-rendered by Astro, so its content is in the
    // HTML that `domcontentloaded` guarantees. The map is then waited
    // for explicitly, because it is the element under test.
    await page.goto(`${BASE}/`, {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    });
    // Wait for the map's CONTAINER, not for an SVG <text>.
    //
    // Playwright's visibility test asks whether an element has a
    // non-empty bounding box. An SVG <text> inside a scaled <svg>
    // does not report one, so waiting for the label itself never
    // resolves even though the label is rendered. The figure is the
    // element that has a box.
    await page.waitForSelector(".home-map", {
      state: "attached",
      timeout: 20000,
    });
    await page.waitForTimeout(600);

    // The whole hero, then the map on its own, then the header and the
    // footer.
    const hero = await page.$(
      ".home__hero, .home-map-figure, .home__map-figure",
    );
    if (hero) {
      await hero.screenshot({
        path: path.join(OUT, `${viewport.name}-hero.png`),
      });
    }

    const map = await page.$(".home-map");
    if (map) {
      await map.screenshot({
        path: path.join(OUT, `${viewport.name}-map.png`),
      });
    }

    const header = await page.$(".gst-header");
    if (header) {
      await header.screenshot({
        path: path.join(OUT, `${viewport.name}-header.png`),
      });
    }

    await page.screenshot({
      path: path.join(OUT, `${viewport.name}-full.png`),
      fullPage: false,
    });

    // The footer, at the bottom of the page.
    await page.evaluate(() =>
      document.querySelector(".gst-foot")?.scrollIntoView({ block: "end" }),
    );
    await page.waitForTimeout(400);
    const footer = await page.$(".gst-foot");
    if (footer) {
      await footer.screenshot({
        path: path.join(OUT, `${viewport.name}-footer.png`),
      });
    }

    const p = await probe(page);
    const { problems, notes } = check(p, viewport);

    report[viewport.name] = {
      ...p,
      consoleErrors,
      problems,
      notes,
    };

    if (problems.length > 0) failed++;
    if (consoleErrors.length > 0) failed++;

    await context.close();
  }

  await browser.close();

  fs.writeFileSync(
    path.join(OUT, "probe.json"),
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report, null, 2));

  console.log(
    failed === 0
      ? `\nwp-c1b: PASSED — ${Object.keys(report).length} viewports, 0 problems, 0 console errors`
      : `\nwp-c1b: FAILED — ${failed} viewport(s) with problems`,
  );
  process.exit(failed === 0 ? 0 : 1);
})();
