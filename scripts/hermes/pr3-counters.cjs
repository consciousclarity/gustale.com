#!/usr/bin/env node
/**
 * Read the COUNTERS off the rendered pages, precisely.
 *
 * WHY THIS EXISTS RATHER THAN A SCREENSHOT
 * ----------------------------------------
 * A vision model reading gustale.com's rendered pages confabulates --
 * it has described a different website entirely. The DOM does not.
 *
 * So the counters are read from the DOM: every element whose text is
 * a count phrase, and every element that renders a dash where a
 * number should be.
 */
const { chromium } = require("playwright");

const AFTER_BASE = process.env.AFTER_BASE || "http://127.0.0.1:8899";
const BEFORE_BASE = process.env.BEFORE_BASE || "https://gustale.com";

const PAGES = ["/dishes/", "/families/", "/"];

async function read(browser, base, tag) {
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 1000 },
  });
  console.log(`\n=== ${tag} (${base}) ===`);
  for (const p of PAGES) {
    const page = await ctx.newPage();
    try {
      await page.goto(base + p, { waitUntil: "networkidle", timeout: 45000 });
      await page.waitForTimeout(1000);

      const found = await page.evaluate(() => {
        // ── 1. every element whose OWN text is a count phrase ──────
        const counts = [];
        for (const el of document.querySelectorAll("body *")) {
          // Leaf-ish elements only, so a parent's aggregate text is
          // not counted alongside its children's.
          if (el.children.length > 0) continue;
          const t = (el.textContent || "").trim();
          if (!t || t.length > 40) continue;
          if (/\b\d[\d,]*\s+\S+/.test(t) || /^\d[\d,]*$/.test(t)) {
            counts.push({
              text: t.replace(/\s+/g, " "),
              tag: el.tagName.toLowerCase(),
              cls: (el.className || "").toString().slice(0, 60),
            });
          }
        }

        // ── 2. every DASH used where a number should be ───────────
        const dashes = [];
        for (const el of document.querySelectorAll("body *")) {
          if (el.children.length > 0) continue;
          const t = (el.textContent || "").trim();
          if (!t) continue;
          // A lone dash, or a dash standing in for a number.
          if (/^[—–-]{1,2}$/.test(t) || /\d\s*[—–]\s/.test(t)) {
            dashes.push({
              text: t.replace(/\s+/g, " "),
              tag: el.tagName.toLowerCase(),
              cls: (el.className || "").toString().slice(0, 60),
              parent: (el.parentElement?.className || "")
                .toString()
                .slice(0, 60),
            });
          }
        }

        // ── 3. the phrases that name a count, with their numbers ──
        const phrases = [];
        const re =
          /(\d[\d,]*)\s+(dishes?|results?|famil(?:y|ies)|places?|connections?|recipes?|items?|entries?)\b/gi;
        const body = document.body.innerText;
        // The assignment is NOT in the condition: `while ((m = re.exec(b)) !== null)`
        // reads as an expression, and biome's noAssignInExpressions is right to
        // flag it. The loop is the same either way.
        let m = re.exec(body);
        while (m !== null) {
          phrases.push(m[0].replace(/\s+/g, " "));
          m = re.exec(body);
        }

        return { counts, dashes, phrases: [...new Set(phrases)] };
      });

      console.log(`\n  ${p}`);
      console.log(`    phrases: ${JSON.stringify(found.phrases)}`);
      console.log(`    dash-as-counter elements: ${found.dashes.length}`);
      for (const d of found.dashes.slice(0, 6)) {
        console.log(
          `      <${d.tag} class="${d.cls}"> "${d.text}"  (in .${d.parent})`,
        );
      }
    } catch (e) {
      console.log(`  ${p}: FAILED — ${e.message.split("\n")[0]}`);
    }
    await page.close();
  }
  await ctx.close();
}

(async () => {
  const browser = await chromium.launch();
  await read(browser, BEFORE_BASE, "BEFORE (production)");
  await read(browser, AFTER_BASE, "AFTER (PR 3 build)");
  await browser.close();
})();
