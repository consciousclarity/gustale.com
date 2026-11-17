#!/usr/bin/env node
/**
 * scripts/test-atlas-kpi-definitions-layout.mjs
 *
 * The homepage's KPI band states what each number MEANS, in a
 * definition list under the numbers. The "Published place associations"
 * row's definition was squeezed into a narrow ribbon while its
 * siblings got full sentences.
 *
 * THE DEFECT
 * ----------
 * Each definition-list cell was a flex ROW: the <dt> (the label) on the
 * left, the <dd> (the prose) on the right. The <dt> had
 * `white-space: nowrap`, so a long label claimed its full width and
 * took it out of the prose.
 *
 * Measured on the live site, at a 269px column:
 *
 *     dishes                        <dt> 44px   <dd> 218px
 *     Published place associations <dt> 205px  <dd>  69px   <- and
 *                                                       overflowed the
 *                                                       column by 13px
 *     food families                 <dt> 95px   <dd> 166px
 *     connections                   <dt> 80px   <dd> 181px
 *
 * At 390px the same row got 130px where its siblings got 240-291px,
 * so its prose wrapped after one or two words.
 *
 * THE FIX
 * -------
 * The label and the prose STACK. The label is a name and the prose is
 * a sentence; they are different kinds of thing, and only a short
 * name fits beside a sentence.
 *
 * WHAT THIS TEST PROVES
 * ----------------------
 *   1. At 1440px, every definition gets AT LEAST as much width as the
 *      narrowest one did -- that is, no row is squeezed below the
 *      floor the old layout gave the worst row.
 *   2. At 390px, the same.
 *   3. No definition OVERFLOWS its cell (the old one did, by 13px).
 *   4. No definition is narrower than the narrowest sibling by more
 *      than a small tolerance -- the defect WAS a row being narrower
 *      than its siblings.
 *   5. The label does not force its cell wider than the grid's column
 *      (the nowrap is gone, so a long label wraps instead).
 *   6. The layout is the same on both widths -- the fix is not a
 *      desktop-only band-aid.
 *
 * It renders the BUILT site (apps/web/dist) at both widths and
 * measures the real geometry. It is not a source-grep test: a grep
 * cannot tell whether a label is 205px or 44px.
 */
import { chromium } from "playwright";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "..");
const DIST = process.env.KPI_DIST ?? join(REPO, "apps", "web", "dist");

// The width the OLD layout gave the worst row. A fix that leaves any
// row below this has not fixed anything.
const OLD_FLOOR = { 1440: 69, 390: 130 };

// How much narrower than its siblings a row may be. The old defect
// was 69px against a 166px sibling -- a factor of 2.4.
const RATIO_TOLERANCE = 0.8;

let pass = 0;
let fail = 0;

function ok(label) {
  console.log(`  ok    ${label}`);
  pass++;
}

function bad(label, detail) {
  console.log(`  FAIL  ${label}${detail ? `: ${detail}` : ""}`);
  fail++;
}

function section(title) {
  console.log(`\n── ${title} ──`);
}

/**
 * Measure the definition list at a viewport width.
 */
async function measure(page, width) {
  await page.setViewportSize({ width, height: 900 });
  await page.goto(`file://${join(DIST, "index.html")}`, {
    waitUntil: "domcontentloaded",
  });

  return page.evaluate(() => {
    const dl = document.querySelector(".atlas-kpi__definitions");
    if (!dl) return null;

    const cells = [...dl.children].map((cell) => {
      const dt = cell.querySelector("dt");
      const dd = cell.querySelector("dd");
      if (!dt || !dd) return null;
      const cellRect = cell.getBoundingClientRect();
      const ddRect = dd.getBoundingClientRect();
      return {
        label: dt.textContent.trim(),
        cellWidth: Math.round(cellRect.width),
        dtWidth: Math.round(dt.getBoundingClientRect().width),
        ddWidth: Math.round(ddRect.width),
        // How far the prose reaches past the right edge of its cell.
        overflow: Math.round(ddRect.right - cellRect.right),
        // The prose's own content width -- the width it would need to
        // read as one line.
        ddScrollWidth: dd.scrollWidth,
        // The number of lines the prose actually takes.
        lineCount: Math.round(
          dd.getBoundingClientRect().height /
            parseFloat(getComputedStyle(dd).lineHeight || "18"),
        ),
      };
    });

    return {
      cells: cells.filter(Boolean),
      columns: getComputedStyle(dl).gridTemplateColumns,
      direction: getComputedStyle(dl.firstElementChild).flexDirection,
    };
  });
}

async function main() {
  if (!existsSync(join(DIST, "index.html"))) {
    console.error(`No build at ${DIST}. Build it first:`);
    console.error(
      "  PUBLIC_DOMAIN=geo PUBLIC_API_BASE=http://127.0.0.1:8742 \\",
    );
    console.error("    pnpm --filter @gustale/web run build:geo");
    process.exit(2);
  }

  const browser = await chromium.launch();
  const page = await browser.newPage();

  for (const width of [1440, 390]) {
    section(`at ${width}px`);

    const m = await measure(page, width);
    if (!m) {
      bad("the definition list is on the page");
      continue;
    }

    if (m.cells.length < 4) {
      bad("the definition list has all four rows", `found ${m.cells.length}`);
    } else {
      ok(`the definition list has all four rows (${m.cells.length})`);
    }

    // 1. no definition is narrower than the old floor.
    for (const cell of m.cells) {
      if (cell.ddWidth >= OLD_FLOOR[width]) {
        ok(
          `"${cell.label}"'s definition is ${cell.ddWidth}px (>= the old floor of ${OLD_FLOOR[width]}px)`,
        );
      } else {
        bad(
          `"${cell.label}"'s definition is ${cell.ddWidth}px -- below the old floor of ${OLD_FLOOR[width]}px`,
        );
      }
    }

    // 2. no definition overflows its cell.
    for (const cell of m.cells) {
      if (cell.overflow <= 0) {
        ok(`"${cell.label}"'s definition does not overflow its cell`);
      } else {
        bad(
          `"${cell.label}"'s definition overflows its cell by ${cell.overflow}px`,
        );
      }
    }

    // 3. no row is dramatically narrower than its siblings.
    const widths = m.cells.map((c) => c.ddWidth);
    const narrowest = Math.min(...widths);
    const widest = Math.max(...widths);
    for (const cell of m.cells) {
      // The ratio is against the MEDIAN, so one very wide row does not
      // mask one very narrow row.
      const sorted = [...widths].sort((a, b) => a - b);
      const median = sorted[Math.floor(sorted.length / 2)];
      const ratio = cell.ddWidth / median;
      if (ratio >= RATIO_TOLERANCE) {
        ok(
          `"${cell.label}"'s definition is ${cell.ddWidth}px (${ratio.toFixed(2)}x the median)`,
        );
      } else {
        bad(
          `"${cell.label}"'s definition is ${cell.ddWidth}px -- ${ratio.toFixed(2)}x the median, narrower than ${RATIO_TOLERANCE}x`,
        );
      }
    }
    console.log(
      `        (definitions run from ${narrowest}px to ${widest}px; the median is the reference)`,
    );

    // 4. the label does not force its cell wider than the column.
    const columnWidth = parseFloat(m.columns.split(" ")[0]) || 0;
    if (columnWidth > 0) {
      for (const cell of m.cells) {
        if (cell.dtWidth <= cell.cellWidth + 1) {
          ok(
            `"${cell.label}"'s label (${cell.dtWidth}px) fits its ${cell.cellWidth}px cell`,
          );
        } else {
          bad(
            `"${cell.label}"'s label is ${cell.dtWidth}px -- wider than its ${cell.cellWidth}px cell`,
          );
        }
      }
    }

    // 5. the label and the prose STACK, rather than sitting side by
    //    side (which is what squeezed the prose).
    if (m.direction === "column") {
      ok("the label and the prose stack (flex-direction: column)");
    } else {
      bad(
        "the label and the prose do not stack",
        `flex-direction: ${m.direction}`,
      );
    }
  }

  await browser.close();

  console.log();
  if (fail === 0) {
    console.log(`ALL ${pass} checks passed`);
    process.exit(0);
  }
  console.log(`${pass} passed, ${fail} FAILED`);
  process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(2);
});
